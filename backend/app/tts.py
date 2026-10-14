"""ElevenLabs text-to-speech, with a silent fallback when no key is configured."""

from __future__ import annotations

import base64
import inspect
import logging

from .config import Settings
from .schemas import Voice

log = logging.getLogger(__name__)

# Default ElevenLabs premade voices. Override or extend in the app; any voice ID works.
PRESET_VOICES: list[Voice] = [
    Voice(voice_id="EXAVITQu4vr4xnSDxMaL", name="Sarah", description="Soft, warm, reassuring"),
    Voice(voice_id="FGY2WhTYpPnrIDTdsKH5", name="Laura", description="Bright, quirky, upbeat"),
    Voice(voice_id="cgSgspJ2msm6clMCkdW9", name="Jessica", description="Playful, expressive"),
    Voice(voice_id="IKne3meq5aSn9XLyUdCD", name="Charlie", description="Casual, friendly, natural"),
    Voice(voice_id="TX3LPaxmHKxFdv7VOQHJ", name="Liam", description="Young, energetic"),
    Voice(voice_id="iP95p4xoKVk53GoZ742B", name="Chris", description="Easygoing, charming"),
]
DEFAULT_VOICE_ID = PRESET_VOICES[0].voice_id


class TTSError(RuntimeError):
    pass


def _mime_for(output_format: str) -> str:
    if output_format.startswith("mp3"):
        return "audio/mpeg"
    if output_format.startswith("wav"):
        return "audio/wav"
    if output_format.startswith("opus"):
        return "audio/ogg"
    return "application/octet-stream"


async def synthesize(settings: Settings, text: str, voice_id: str | None) -> tuple[str, str, str]:
    """Returns (audio_base64, mime_type, provider). Empty audio means: use on-device speech."""
    if not settings.elevenlabs_api_key or not text.strip():
        return "", "", "none"

    from elevenlabs.client import AsyncElevenLabs

    client = AsyncElevenLabs(api_key=settings.elevenlabs_api_key)
    try:
        stream = client.text_to_speech.convert(
            voice_id or DEFAULT_VOICE_ID,
            text=text,
            model_id=settings.elevenlabs_model_id,
            output_format=settings.elevenlabs_output_format,
        )
        if inspect.isawaitable(stream):
            stream = await stream
        chunks = bytearray()
        async for chunk in stream:
            chunks.extend(chunk)
    except Exception as exc:
        raise TTSError(f"ElevenLabs request failed: {exc}") from exc

    return base64.b64encode(bytes(chunks)).decode(), _mime_for(settings.elevenlabs_output_format), "elevenlabs"
