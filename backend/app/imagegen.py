"""AI image generation for wallpaper scenes and stickers, with a local placeholder fallback."""

from __future__ import annotations

import base64
import hashlib
import io
import logging
from typing import Literal

from PIL import Image, ImageChops, ImageDraw, ImageFont

from .config import Settings

log = logging.getLogger(__name__)

Kind = Literal["scene", "sticker"]
SCENE_SIZE = (1080, 1920)
STICKER_MAX = 512


class ImageGenError(RuntimeError):
    pass


async def generate(settings: Settings, prompt: str, kind: Kind) -> tuple[bytes, str]:
    """Returns (raw image bytes from the provider, provider name)."""
    provider = settings.resolved_image_provider()
    try:
        if provider == "gemini":
            return await _gemini(settings, prompt, kind), provider
        if provider == "openai":
            return await _openai(settings, prompt, kind), provider
    except ImageGenError:
        raise
    except Exception as exc:
        raise ImageGenError(f"{provider} image request failed: {exc}") from exc
    return b"", "fallback"


async def _gemini(settings: Settings, prompt: str, kind: Kind) -> bytes:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    resp = await client.aio.models.generate_content(
        model=settings.gemini_image_model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio="9:16" if kind == "scene" else "1:1"),
        ),
    )
    for cand in resp.candidates or []:
        for part in (cand.content.parts if cand.content else None) or []:
            data = getattr(getattr(part, "inline_data", None), "data", None)
            if data:
                return data if isinstance(data, bytes) else base64.b64decode(data)
    raise ImageGenError("The image model returned no image (it may have declined the prompt).")


async def _openai(settings: Settings, prompt: str, kind: Kind) -> bytes:
    import openai

    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.images.generate(
        model=settings.openai_image_model,
        prompt=prompt,
        size="1024x1536" if kind == "scene" else "1024x1024",
        background="transparent" if kind == "sticker" else "opaque",
        output_format="png",
        quality="medium",
        n=1,
    )
    b64 = resp.data[0].b64_json if resp.data else None
    if not b64:
        raise ImageGenError("The image model returned no image.")
    return base64.b64decode(b64)


# ---- post-processing ------------------------------------------------------------------------


def finish_scene(raw: bytes) -> bytes:
    """Center-crops to 9:16, resizes to 1080x1920 and encodes as JPEG."""
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    target_ratio = SCENE_SIZE[0] / SCENE_SIZE[1]
    w, h = img.size
    if w / h > target_ratio:
        new_w = int(h * target_ratio)
        img = img.crop(((w - new_w) // 2, 0, (w - new_w) // 2 + new_w, h))
    else:
        new_h = int(w / target_ratio)
        img = img.crop((0, (h - new_h) // 2, w, (h - new_h) // 2 + new_h))
    img = img.resize(SCENE_SIZE, Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


def finish_sticker(raw: bytes) -> bytes:
    """Makes the background transparent (if the model didn't), trims and shrinks the sticker."""
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    if img.getextrema()[3][0] == 255:  # fully opaque: knock out the plain background
        img = knock_out_background(img)
    bbox = img.getchannel("A").getbbox()
    if bbox:
        img = img.crop(bbox)
    img.thumbnail((STICKER_MAX, STICKER_MAX), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def knock_out_background(img: Image.Image, thresh: int = 40) -> Image.Image:
    """Flood-fills from each corner across near-uniform pixels and makes them transparent."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    sentinel = (1, 254, 3)
    for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if rgb.getpixel(xy) != sentinel:
            ImageDraw.floodfill(rgb, xy, sentinel, thresh=thresh)
    diff = ImageChops.difference(rgb, Image.new("RGB", (w, h), sentinel))
    r, g, b = diff.split()
    # 0 where the pixel is exactly the sentinel (background), 255 elsewhere.
    alpha = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v else 0)
    out = img.copy()
    out.putalpha(alpha)
    return out


# ---- offline placeholders -------------------------------------------------------------------


def _palette(prompt: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    digest = hashlib.sha256(prompt.encode()).digest()
    top = tuple(150 + b % 100 for b in digest[:3])
    bottom = tuple(110 + b % 120 for b in digest[3:6])
    return top, bottom  # type: ignore[return-value]


def placeholder_scene(prompt: str) -> bytes:
    """A soft gradient tinted by the prompt, so the studio works without an image API key."""
    top, bottom = _palette(prompt)
    w, h = SCENE_SIZE
    img = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        img.putpixel((0, y), tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    img = img.resize((w, h))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


def placeholder_sticker(prompt: str) -> bytes:
    """A rounded label with the prompt text."""
    text = prompt.strip()[:24]
    font = ImageFont.load_default(size=44)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    left, top, right, bottom = probe.textbbox((0, 0), text, font=font)
    pad = 28
    w, h = right - left + pad * 2, bottom - top + pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    fill, _ = _palette(prompt)
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=(*fill, 255), outline=(255, 255, 255, 255), width=8)
    draw.text((pad - left, pad - top), text, font=font, fill=(59, 42, 53, 255))
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()
