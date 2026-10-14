from __future__ import annotations

import base64
import json
import logging
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from . import cutout, llm, prompt, tts
from .config import Settings, get_settings
from .schemas import (
    ChatMode,
    CutoutResponse,
    PersonaConfig,
    PersonaDraft,
    PersonaDraftRequest,
    ReactResponse,
    Turn,
    Voice,
    VoiceDesignRequest,
    VoiceDesignResponse,
    VoicePreviewRequest,
    VoicePreviewResponse,
    VoiceSaveRequest,
    VoiceSaveResponse,
)

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


MAX_HISTORY_TURNS = 16


def _parse_history(raw: str) -> list[Turn]:
    if not raw.strip():
        return []
    try:
        items = json.loads(raw)
        if not isinstance(items, list):
            raise ValueError("history must be a list")
        turns = [Turn.model_validate(t) for t in items]
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid history: {exc}") from exc
    return turns[-MAX_HISTORY_TURNS:]


def _parse_persona(raw: str) -> PersonaConfig:
    try:
        return PersonaConfig.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid persona_config: {exc}") from exc


@app.post("/api/doll/react", response_model=ReactResponse, dependencies=[Depends(require_app_key)])
async def doll_react(
    settings: SettingsDep,
    persona_config: Annotated[str, Form(description="PersonaConfig as a JSON string")],
    user_speech_text: Annotated[str, Form()] = "",
    mode: Annotated[ChatMode, Form(description="chat, call or camera")] = ChatMode.CAMERA,
    history: Annotated[str, Form(description='Recent turns as JSON: [{"role": "user"|"doll", "text": "..."}]')] = "",
    snapshot: Annotated[UploadFile | None, File(description="Camera frame (JPEG), camera mode only")] = None,
    user_audio: Annotated[UploadFile | None, File(description="Recorded speech (m4a/wav)")] = None,
) -> ReactResponse:
    persona = _parse_persona(persona_config)
    turns = _parse_history(history)

    image_bytes = image_mime = None
    if snapshot is not None and snapshot.filename:
        image_mime = (snapshot.content_type or "image/jpeg").lower()
        if image_mime not in IMAGE_TYPES:
            raise HTTPException(status_code=415, detail=f"Unsupported snapshot type {image_mime}")
        image_bytes = await _read_limited(snapshot, settings.max_image_bytes, "snapshot")

    audio_bytes = audio_mime = None
    if user_audio is not None and user_audio.filename:
        audio_bytes = await _read_limited(user_audio, settings.max_audio_bytes, "user_audio")
        audio_mime = user_audio.content_type

    req = llm.Request(persona, user_speech_text, image_bytes, image_mime, audio_bytes, audio_mime, mode, turns)
    try:
        reply, provider = await llm.generate_reply(settings, req)
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


# ---- AI voice design ------------------------------------------------------------------------


@app.post("/api/voices/design", response_model=VoiceDesignResponse, dependencies=[Depends(require_app_key)])
async def design_voice(settings: SettingsDep, body: VoiceDesignRequest) -> VoiceDesignResponse:
    try:
        previews = await tts.design_voice(settings, body.description, body.sample_text)
    except tts.VoiceDesignUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except tts.TTSError as exc:
        log.error("Voice design failure: %s", exc)
        raise HTTPException(status_code=502, detail="Voice design failed, try a different description.") from exc
    return VoiceDesignResponse(previews=previews)


@app.post("/api/voices/save", response_model=VoiceSaveResponse, dependencies=[Depends(require_app_key)])
async def save_voice(settings: SettingsDep, body: VoiceSaveRequest) -> VoiceSaveResponse:
    try:
        voice_id = await tts.save_designed_voice(settings, body.generated_voice_id, body.name, body.description)
    except tts.VoiceDesignUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except tts.TTSError as exc:
        log.error("Voice save failure: %s", exc)
        raise HTTPException(status_code=502, detail="Could not save that voice.") from exc
    return VoiceSaveResponse(voice_id=voice_id)


# ---- AI text helpers ------------------------------------------------------------------------


@app.post("/api/persona/draft", response_model=PersonaDraft, dependencies=[Depends(require_app_key)])
async def draft_persona(settings: SettingsDep, body: PersonaDraftRequest) -> PersonaDraft:
    user = f"Idea: {body.idea.strip()}"
    if body.doll_name.strip():
        user += f"\nDoll name: {body.doll_name.strip()}"
    if body.inspiration.strip():
        user += f"\nLook/vibe inspiration: {body.inspiration.strip()}"
    try:
        draft, _ = await llm.structured_text(settings, prompt.PERSONA_DRAFT_SYSTEM, user, PersonaDraft)
    except llm.LLMError as exc:
        log.error("Persona draft failure: %s", exc)
        raise HTTPException(status_code=502, detail="Couldn't write that right now, try again.") from exc
    if draft is None:  # no LLM configured: hand the idea back so nothing is lost
        return PersonaDraft(relationship="", personality=body.idea.strip(), backstory="", voice_description="")
    return draft


# ---- plushie cutout (fallback when the phone can't do it on-device) ----------------------------


@app.post("/api/doll/cutout", response_model=CutoutResponse, dependencies=[Depends(require_app_key)])
async def doll_cutout(
    settings: SettingsDep,
    photo: Annotated[UploadFile, File(description="Photo of the plushie (JPEG/PNG)")],
) -> CutoutResponse:
    mime = (photo.content_type or "image/jpeg").lower()
    if mime not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported photo type {mime}")
    data = await _read_limited(photo, settings.max_image_bytes, "photo")
    try:
        png = await run_in_threadpool(cutout.cut_out, data)
    except cutout.CutoutError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return CutoutResponse(image_base64=base64.b64encode(png).decode(), mime_type="image/png", method="edge-fill")
