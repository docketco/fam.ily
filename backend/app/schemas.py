from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Emotion(str, Enum):
    HAPPY = "HAPPY"
    SURPRISED = "SURPRISED"
    TEASING = "TEASING"
    SLEEPY = "SLEEPY"


SceneEffect = Literal["none", "rain", "snow", "sparkle", "steam", "petals"]


class PersonaConfig(BaseModel):
    """Everything here is the user's own free-text input."""

    doll_name: str = Field(min_length=1, max_length=60)
    # Free-text look/vibe inspiration, written by the user.
    idol_identity: str = Field(default="", max_length=160)
    personality: str = Field(default="", max_length=600)
    # Legacy: older app versions sent a list of tags instead of `personality`.
    personality_tags: list[str] = Field(default_factory=list, max_length=12)
    relationship_type: str = Field(default="", max_length=160)
    custom_lore: str | None = Field(default=None, max_length=2000)
    elevenlabs_voice_id: str = Field(default="", max_length=64)

    @field_validator("personality_tags")
    @classmethod
    def _clean_tags(cls, tags: list[str]) -> list[str]:
        cleaned = [t.strip()[:40] for t in tags if t and t.strip()]
        return list(dict.fromkeys(cleaned))

    def personality_text(self) -> str:
        return self.personality.strip() or ", ".join(self.personality_tags)


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


# ---- AI voice design (ElevenLabs) -------------------------------------------------------------


class VoiceDesignRequest(BaseModel):
    description: str = Field(min_length=3, max_length=1000)
    sample_text: str | None = Field(default=None, max_length=1000)


class DesignedVoice(BaseModel):
    generated_voice_id: str
    audio_base64: str
    audio_mime_type: str


class VoiceDesignResponse(BaseModel):
    previews: list[DesignedVoice]


class VoiceSaveRequest(BaseModel):
    generated_voice_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(min_length=3, max_length=1000)


class VoiceSaveResponse(BaseModel):
    voice_id: str


# ---- AI scenes, stickers, text helpers --------------------------------------------------------


class ImagePromptRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=400)


class SceneResponse(BaseModel):
    image_base64: str
    mime_type: str
    effect: SceneEffect
    provider: str


class StickerResponse(BaseModel):
    image_base64: str
    mime_type: str
    provider: str


class SceneEffectChoice(BaseModel):
    effect: SceneEffect = Field(description="The ambient animation that best fits the scene.")


class PersonaDraftRequest(BaseModel):
    idea: str = Field(min_length=2, max_length=600)
    doll_name: str = Field(default="", max_length=60)
    inspiration: str = Field(default="", max_length=160)


class PersonaDraft(BaseModel):
    relationship: str = Field(description="How the doll relates to its human, one short phrase.")
    personality: str = Field(description="Personality and speaking style, 1-3 sentences.")
    backstory: str = Field(description="A short invented backstory for the doll, 1-3 sentences.")
    voice_description: str = Field(description="A description of how the doll's voice sounds, one sentence.")


class QuoteResponse(BaseModel):
    quote: str
