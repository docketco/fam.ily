from __future__ import annotations

import json
import logging
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import ValidationError

from . import llm, tts, wallpaper
from .config import Settings, get_settings
from .schemas import PersonaConfig, ReactResponse, Voice, VoicePreviewRequest, VoicePreviewResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("dollapp")

app = FastAPI(title="Doll Companion API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SettingsDep = Annotated[Settings, Depends(get_settings)]
IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}


def require_app_key(settings: SettingsDep, x_app_key: Annotated[str | None, Header()] = None) -> None:
    if settings.app_api_key and not secrets.compare_digest(x_app_key or "", settings.app_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing X-App-Key")


@app.get("/health")
def health(settings: SettingsDep) -> dict:
    return {
        "status": "ok",
        "llm_provider": settings.resolved_llm_provider(),
        "tts_provider": "elevenlabs" if settings.elevenlabs_api_key else "none",
        "auth_required": bool(settings.app_api_key),
    }


async def _read_limited(upload: UploadFile, limit: int, label: str) -> bytes:
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"{label} is larger than {limit // (1024 * 1024)} MB")
    if not data:
        raise HTTPException(status_code=422, detail=f"{label} is empty")
    return data


def _parse_persona(raw: str) -> PersonaConfig:
    try:
        return PersonaConfig.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid persona_config: {exc}") from exc


@app.post("/api/doll/react", response_model=ReactResponse, dependencies=[Depends(require_app_key)])
async def doll_react(
    settings: SettingsDep,
    snapshot: Annotated[UploadFile, File(description="Current camera frame (JPEG)")],
    persona_config: Annotated[str, Form(description="PersonaConfig as a JSON string")],
    user_speech_text: Annotated[str, Form()] = "",
    user_audio: Annotated[UploadFile | None, File(description="Optional recorded question (m4a/wav)")] = None,
) -> ReactResponse:
    persona = _parse_persona(persona_config)

    image_mime = (snapshot.content_type or "image/jpeg").lower()
    if image_mime not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported snapshot type {image_mime}")
    image_bytes = await _read_limited(snapshot, settings.max_image_bytes, "snapshot")

    audio_bytes = audio_mime = None
    if user_audio is not None and user_audio.filename:
        audio_bytes = await _read_limited(user_audio, settings.max_audio_bytes, "user_audio")
        audio_mime = user_audio.content_type

    try:
        reply, provider = await llm.generate_reply(
            settings, persona, image_bytes, image_mime, user_speech_text, audio_bytes, audio_mime
        )
    except llm.LLMError as exc:
        log.error("LLM failure: %s", exc)
        raise HTTPException(status_code=502, detail="The doll's brain is unavailable, try again.") from exc

    try:
        audio_b64, mime, tts_provider = await tts.synthesize(settings, reply.spoken_response, persona.elevenlabs_voice_id)
    except tts.TTSError as exc:
        # The text reply is still useful: the app falls back to on-device speech.
        log.error("TTS failure: %s", exc)
        audio_b64, mime, tts_provider = "", "", "none"

    return ReactResponse(
        spoken_text=reply.spoken_response,
        emotion=reply.emotion,
        heard_text=reply.heard_text,
        audio_base64=audio_b64,
        audio_mime_type=mime,
        provider=provider,
        tts_provider=tts_provider,
    )


@app.get("/api/voices", response_model=list[Voice], dependencies=[Depends(require_app_key)])
def list_voices() -> list[Voice]:
    return tts.PRESET_VOICES


@app.post("/api/voices/preview", response_model=VoicePreviewResponse, dependencies=[Depends(require_app_key)])
async def preview_voice(settings: SettingsDep, body: VoicePreviewRequest) -> VoicePreviewResponse:
    try:
        audio_b64, mime, provider = await tts.synthesize(settings, body.text, body.voice_id)
    except tts.TTSError as exc:
        log.error("TTS preview failure: %s", exc)
        raise HTTPException(status_code=502, detail="Voice preview unavailable") from exc
    return VoicePreviewResponse(audio_base64=audio_b64, audio_mime_type=mime, tts_provider=provider)


@app.post("/api/wallpaper/render", dependencies=[Depends(require_app_key)])
async def render_wallpaper(
    settings: SettingsDep,
    frames: Annotated[list[UploadFile], File(description="Ordered frames of one loop (JPEG/PNG)")],
    fps: Annotated[int, Form(ge=1, le=60)] = 15,
    repeat: Annotated[int, Form(ge=1, le=6)] = 1,
) -> Response:
    if len(frames) > settings.max_wallpaper_frames:
        raise HTTPException(status_code=413, detail=f"At most {settings.max_wallpaper_frames} frames")
    data = [await _read_limited(f, settings.max_wallpaper_frame_bytes, "frame") for f in frames]
    try:
        mp4 = await run_in_threadpool(wallpaper.encode_mp4, data, fps, repeat)
    except wallpaper.EncodeError as exc:
        log.error("Encode failure: %s", exc)
        raise HTTPException(status_code=422, detail="Could not encode video from frames") from exc
    return Response(content=mp4, media_type="video/mp4", headers={"Content-Disposition": 'attachment; filename="wallpaper.mp4"'})
