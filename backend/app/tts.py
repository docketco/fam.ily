"""ElevenLabs text-to-speech, with a silent fallback when no key is configured."""

from __future__ import annotations

import base64
import inspect
import logging

from .config import Settings
from .schemas import DesignedVoice, Voice

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


# ---- AI voice design: describe a voice in words, get previews, keep the one you like ---------

MIN_DESCRIPTION = 20  # ElevenLabs requires 20-1000 characters


class VoiceDesignUnavailable(RuntimeError):
    pass


async def design_voice(settings: Settings, description: str, sample_text: str | None) -> list[DesignedVoice]:
    if not settings.elevenlabs_api_key:
        raise VoiceDesignUnavailable("Voice design needs an ElevenLabs key on the server.")
    from elevenlabs.client import AsyncElevenLabs

    desc = description.strip()
    if len(desc) < MIN_DESCRIPTION:
        desc = f"{desc}. Natural, clear and expressive speaking voice."
    sample = (sample_text or "").strip()
    kwargs = {"text": sample} if len(sample) >= 100 else {"auto_generate_text": True}

    client = AsyncElevenLabs(api_key=settings.elevenlabs_api_key)
    try:
        resp = await client.text_to_voice.design(voice_description=desc[:1000], **kwargs)
    except Exception as exc:
        raise TTSError(f"ElevenLabs voice design failed: {exc}") from exc
    return [
        DesignedVoice(
            generated_voice_id=p.generated_voice_id,
            audio_base64=p.audio_base_64,
            audio_mime_type=p.media_type or "audio/mpeg",
        )
        for p in resp.previews
    ]


async def save_designed_voice(settings: Settings, generated_voice_id: str, name: str, description: str) -> str:
    if not settings.elevenlabs_api_key:
        raise VoiceDesignUnavailable("Voice design needs an ElevenLabs key on the server.")
    from elevenlabs.client import AsyncElevenLabs

    desc = description.strip()
    if len(desc) < MIN_DESCRIPTION:
        desc = f"{desc}. Natural, clear and expressive speaking voice."
    client = AsyncElevenLabs(api_key=settings.elevenlabs_api_key)
    try:
        voice = await client.text_to_voice.create(
            voice_name=name.strip()[:60], voice_description=desc[:1000], generated_voice_id=generated_voice_id
        )
    except Exception as exc:
        raise TTSError(f"ElevenLabs could not save the voice: {exc}") from exc
    return voice.voice_id
