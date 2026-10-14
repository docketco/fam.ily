"""Multimodal "brain": turns (snapshot, speech, persona) into a structured DollReply."""

from __future__ import annotations

import json
import logging
import random
from typing import TypeVar

from pydantic import BaseModel

from .config import Settings
from .prompt import build_system_prompt, build_user_turn
from .schemas import ChatMode, DollReply, Emotion, PersonaConfig, Turn

log = logging.getLogger(__name__)


class LLMError(RuntimeError):
    pass


class Request:
    """Everything the doll gets for one reply."""

    def __init__(
        self,
        persona: PersonaConfig,
        user_text: str | None,
        image_bytes: bytes | None = None,
        image_mime: str | None = None,
        audio_bytes: bytes | None = None,
        audio_mime: str | None = None,
        mode: ChatMode = ChatMode.CAMERA,
        history: list[Turn] | None = None,
    ):
        self.persona = persona
        self.user_text = user_text
        self.image_bytes = image_bytes
        self.image_mime = image_mime or "image/jpeg"
        self.audio_bytes = audio_bytes
        self.audio_mime = audio_mime
        # Without a picture there is nothing to look at, whatever mode the app sent.
        self.mode = ChatMode.CALL if mode == ChatMode.CAMERA and not image_bytes else mode
        self.history = history or []

    def system(self) -> str:
        return build_system_prompt(self.persona, self.mode)

    def user_turn(self, transcript: str | None = None, audio_attached: bool | None = None) -> str:
        return build_user_turn(
            transcript if transcript is not None else self.user_text,
            has_audio=bool(self.audio_bytes) if audio_attached is None else audio_attached,
            has_image=bool(self.image_bytes),
            history=self.history,
            doll_name=self.persona.doll_name,
        )


async def generate_reply(settings: Settings, req: Request) -> tuple[DollReply, str]:
    """Returns (reply, provider_name). Falls back to a canned reply if no provider is configured."""
    provider = settings.resolved_llm_provider()
    if provider == "gemini":
        reply = await _gemini(settings, req)
    elif provider == "openai":
        reply = await _openai(settings, req)
    else:
        reply = fallback_reply(req.persona, req.user_text)
    return _sanitize(reply, req.user_text), provider


def _sanitize(reply: DollReply, user_speech_text: str | None) -> DollReply:
    text = " ".join(reply.spoken_response.split())[:600]
    heard = (reply.heard_text or user_speech_text or "").strip()[:600]
    return DollReply(spoken_response=text or "Hmm?", emotion=reply.emotion, heard_text=heard)


async def _gemini(settings: Settings, req: Request) -> DollReply:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    parts: list = []
    if req.image_bytes:
        parts.append(types.Part.from_bytes(data=req.image_bytes, mime_type=req.image_mime))
    if req.audio_bytes:
        parts.append(types.Part.from_bytes(data=req.audio_bytes, mime_type=_gemini_audio_mime(req.audio_mime)))
    parts.append(req.user_turn())

    try:
        resp = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=parts,
            config=types.GenerateContentConfig(
                system_instruction=req.system(),
                response_mime_type="application/json",
                response_schema=DollReply,
                temperature=0.9,
                max_output_tokens=1024,
                # Short in-character replies don't need reasoning; skipping it keeps latency low.
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
    except Exception as exc:  # network / quota / safety errors
        raise LLMError(f"Gemini request failed: {exc}") from exc

    if isinstance(getattr(resp, "parsed", None), DollReply):
        return resp.parsed
    return _parse_json_reply(resp.text or "")


def _gemini_audio_mime(mime: str | None) -> str:
    # Expo records AAC in an MP4 (.m4a) container; Gemini accepts it as audio/mp4 / audio/aac.
    if not mime or mime in ("application/octet-stream", "audio/x-m4a", "audio/m4a"):
        return "audio/mp4"
    return mime


async def _openai(settings: Settings, req: Request) -> DollReply:
    import base64

    import openai

    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    transcript = req.user_text or ""
    try:
        if req.audio_bytes:
            ext = "m4a" if (req.audio_mime or "").endswith(("mp4", "m4a", "aac")) else "wav"
            tr = await client.audio.transcriptions.create(
                model=settings.openai_transcribe_model,
                file=(f"speech.{ext}", req.audio_bytes, req.audio_mime or "audio/mp4"),
            )
            transcript = (getattr(tr, "text", "") or transcript).strip()

        content: list[dict] = [{"type": "text", "text": req.user_turn(transcript, audio_attached=False)}]
        if req.image_bytes:
            data_url = f"data:{req.image_mime};base64,{base64.b64encode(req.image_bytes).decode()}"
            content.append({"type": "image_url", "image_url": {"url": data_url, "detail": "low"}})
        completion = await client.chat.completions.parse(
            model=settings.openai_model,
            messages=[{"role": "system", "content": req.system()}, {"role": "user", "content": content}],
            response_format=DollReply,
            temperature=0.9,
            max_tokens=400,
        )
    except Exception as exc:
        raise LLMError(f"OpenAI request failed: {exc}") from exc

    msg = completion.choices[0].message
    reply = msg.parsed if isinstance(getattr(msg, "parsed", None), DollReply) else _parse_json_reply(msg.content or "")
    if not reply.heard_text:
        reply.heard_text = transcript
    return reply


def _parse_json_reply(raw: str) -> DollReply:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").removeprefix("json").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise LLMError(f"Model did not return JSON: {raw[:200]!r}") from exc
    emotion = str(data.get("emotion", "HAPPY")).upper()
    if emotion not in Emotion.__members__:
        emotion = "HAPPY"
    return DollReply(
        spoken_response=str(data.get("spoken_response", "")),
        emotion=Emotion(emotion),
        heard_text=str(data.get("heard_text", "")),
    )


_FALLBACK_LINES: list[tuple[str, Emotion]] = [
    ("Ooh, what is that? Bring it closer, I want to see every detail!", Emotion.SURPRISED),
    ("You always show me the coolest things. I'm so happy you called me!", Emotion.HAPPY),
    ("Hmm, are you trying to impress me? Because it's kind of working.", Emotion.TEASING),
    ("I was napping in your bag, but this is way better. Show me more!", Emotion.SLEEPY),
]


def fallback_reply(persona: PersonaConfig, user_speech_text: str | None) -> DollReply:
    """Offline reply used when no LLM key is configured, so the app loop still works."""
    line, emotion = random.choice(_FALLBACK_LINES)
    return DollReply(
        spoken_response=f"It's {persona.doll_name}! {line}",
        emotion=emotion,
        heard_text=(user_speech_text or "").strip(),
    )


# ---- text-only structured helpers (persona drafts, quotes, scene effects) ---------------------

T = TypeVar("T", bound=BaseModel)


async def structured_text(settings: Settings, system: str, user: str, schema: type[T]) -> tuple[T | None, str]:
    """Returns (parsed, provider). `parsed` is None when no LLM is configured (caller falls back)."""
    provider = settings.resolved_llm_provider()
    try:
        if provider == "gemini":
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=settings.gemini_api_key)
            resp = await client.aio.models.generate_content(
                model=settings.gemini_model,
                contents=user,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=1.0,
                    max_output_tokens=1024,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            if isinstance(getattr(resp, "parsed", None), schema):
                return resp.parsed, provider
            return schema.model_validate_json(_strip_fences(resp.text or "")), provider
        if provider == "openai":
            import openai

            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            completion = await client.chat.completions.parse(
                model=settings.openai_model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format=schema,
                temperature=1.0,
                max_tokens=600,
            )
            msg = completion.choices[0].message
            if isinstance(getattr(msg, "parsed", None), schema):
                return msg.parsed, provider
            return schema.model_validate_json(_strip_fences(msg.content or "")), provider
    except Exception as exc:
        raise LLMError(f"{provider} request failed: {exc}") from exc
    return None, "fallback"


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").removeprefix("json").strip()
    return raw

