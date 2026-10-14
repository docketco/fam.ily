"""Runtime configuration, read from environment variables (or a local .env file).

Every external service is optional: when a key is missing the API keeps working
with dummy fallbacks so the mobile app can be developed end-to-end offline.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # "auto" picks Gemini if GEMINI_API_KEY is set, else OpenAI, else the offline fallback.
    llm_provider: Literal["auto", "gemini", "openai", "fallback"] = "auto"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_transcribe_model: str = "gpt-4o-mini-transcribe"

    elevenlabs_api_key: str | None = None
    elevenlabs_model_id: str = "eleven_flash_v2_5"
    elevenlabs_output_format: str = "mp3_44100_128"

    # Optional shared secret. When set, every /api request must send `X-App-Key`.
    app_api_key: str | None = None

    max_image_bytes: int = 8 * 1024 * 1024
    max_audio_bytes: int = 10 * 1024 * 1024
    max_wallpaper_frames: int = 150
    max_wallpaper_frame_bytes: int = 2 * 1024 * 1024

    def resolved_llm_provider(self) -> Literal["gemini", "openai", "fallback"]:
        if self.llm_provider == "gemini":
            return "gemini" if self.gemini_api_key else "fallback"
        if self.llm_provider == "openai":
            return "openai" if self.openai_api_key else "fallback"
        if self.llm_provider == "fallback":
            return "fallback"
        if self.gemini_api_key:
            return "gemini"
        if self.openai_api_key:
            return "openai"
        return "fallback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
