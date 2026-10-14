from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator


class Emotion(str, Enum):
    HAPPY = "HAPPY"
    SURPRISED = "SURPRISED"
    TEASING = "TEASING"
    SLEEPY = "SLEEPY"


class PersonaConfig(BaseModel):
    doll_name: str = Field(min_length=1, max_length=60)
    idol_identity: str = Field(default="", max_length=120)
    personality_tags: list[str] = Field(default_factory=list, max_length=12)
    relationship_type: str = Field(default="bestie", max_length=60)
    custom_lore: str | None = Field(default=None, max_length=2000)
    elevenlabs_voice_id: str = Field(default="", max_length=64)

    @field_validator("personality_tags")
    @classmethod
    def _clean_tags(cls, tags: list[str]) -> list[str]:
        cleaned = [t.strip()[:40] for t in tags if t and t.strip()]
        return list(dict.fromkeys(cleaned))


class DollReply(BaseModel):
    """What the LLM must produce (structured output)."""

    spoken_response: str = Field(description="What the doll says out loud, max 2-3 short sentences.")
    emotion: Emotion
    heard_text: str = Field(
        default="",
        description="Transcript of what the user said, if they sent audio; otherwise echo their text.",
    )


class ReactResponse(BaseModel):
    spoken_text: str
    emotion: Emotion
    heard_text: str
    audio_base64: str
    audio_mime_type: str
    provider: str
    tts_provider: str


class Voice(BaseModel):
    voice_id: str
    name: str
    description: str


class VoicePreviewRequest(BaseModel):
    voice_id: str = Field(min_length=1, max_length=64)
    text: str = Field(default="Hi! I missed you so much today.", max_length=200)


class VoicePreviewResponse(BaseModel):
    audio_base64: str
    audio_mime_type: str
    tts_provider: str
