"""Server-side background removal, used when the phone can't cut the plushie out itself.

Phones do this on-device (Apple Vision / Google ML Kit subject segmentation), which handles
any background. This fallback flood-fills the background in from the photo's edges, so it
works for plushies photographed against a fairly plain background.
"""

from __future__ import annotations

import io

from PIL import Image, ImageChops, ImageDraw, ImageFilter

MAX_SIDE = 1024
SENTINEL = (1, 254, 3)


class CutoutError(RuntimeError):
    pass


def cut_out(raw: bytes, thresh: int = 38) -> bytes:
    """Returns a PNG of the subject with a transparent, softly feathered background."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:
        raise CutoutError("Not an image") from exc
    img = img.convert("RGBA")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    rgb = img.convert("RGB")
    w, h = rgb.size
    # Seed the fill all around the border so a subject touching one edge doesn't block it.
    step = max(1, min(w, h) // 40)
    seeds = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)]
    seeds += [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    for xy in seeds:
        if rgb.getpixel(xy) != SENTINEL:
            ImageDraw.floodfill(rgb, xy, SENTINEL, thresh=thresh)

    diff = ImageChops.difference(rgb, Image.new("RGB", (w, h), SENTINEL))
    r, g, b = diff.split()
    mask = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v else 0)
    # Close pinholes, then feather the edge slightly so it doesn't look jagged.
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))

    covered = sum(mask.histogram()[128:]) / float(w * h)
    if covered < 0.03 or covered > 0.97:
        raise CutoutError("Couldn't find the plushie against this background")

    out = img.copy()
    out.putalpha(ImageChops.multiply(img.getchannel("A"), mask))
    bbox = out.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
    if bbox:
        pad = max(4, min(w, h) // 50)
        out = out.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad)))
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()
