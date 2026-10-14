import base64
import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import llm, tts
from app.config import Settings, get_settings
from app.main import app
from app.prompt import build_system_prompt
from app.schemas import DollReply, Emotion, PersonaConfig

PERSONA = {
    "doll_name": "Jinnie",
    "idol_identity": "Inspired by Hyunjin",
    "personality_tags": ["teasing", "clingy", "teasing"],
    "relationship_type": "bestie",
    "custom_lore": "Loves strawberry milk.",
    "elevenlabs_voice_id": "voice123",
}


def jpeg(color=(200, 100, 50), size=(64, 48)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture
def client():
    settings = Settings(_env_file=None)
    app.dependency_overrides[get_settings] = lambda: settings
    yield TestClient(app), settings
    app.dependency_overrides.clear()


def react(c, **extra):
    data = {"persona_config": json.dumps(PERSONA), "user_speech_text": "Look at my cake!"}
    data.update(extra.pop("data", {}))
    files = {"snapshot": ("frame.jpg", jpeg(), "image/jpeg")}
    files.update(extra.pop("files", {}))
    return c.post("/api/doll/react", data=data, files=files, **extra)


def test_health_reports_fallbacks(client):
    c, _ = client
    body = c.get("/health").json()
    assert body == {"status": "ok", "llm_provider": "fallback", "tts_provider": "none", "auth_required": False}


def test_react_fallback_works_without_keys(client):
    c, _ = client
    r = react(c)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "fallback"
    assert "Jinnie" in body["spoken_text"]
    assert body["emotion"] in {e.value for e in Emotion}
    assert body["heard_text"] == "Look at my cake!"
    assert body["audio_base64"] == ""


def test_react_uses_llm_and_tts(client, monkeypatch):
    c, settings = client
    settings.gemini_api_key = "g"
    settings.elevenlabs_api_key = "e"
    seen = {}

    async def fake_gemini(s, persona, image_bytes, image_mime, text, audio_bytes, audio_mime):
        seen.update(persona=persona, mime=image_mime, audio=audio_bytes, audio_mime=audio_mime)
        return DollReply(spoken_response="  Is that   cake for me? ", emotion=Emotion.TEASING, heard_text="")

    async def fake_tts(s, text, voice_id):
        seen.update(tts_text=text, voice=voice_id)
        return base64.b64encode(b"mp3").decode(), "audio/mpeg", "elevenlabs"

    monkeypatch.setattr(llm, "_gemini", fake_gemini)
    monkeypatch.setattr(tts, "synthesize", fake_tts)
    r = react(c, files={"user_audio": ("q.m4a", b"audio-bytes", "audio/mp4")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["spoken_text"] == "Is that cake for me?"
    assert body["emotion"] == "TEASING"
    assert body["heard_text"] == "Look at my cake!"  # falls back to the typed text
    assert base64.b64decode(body["audio_base64"]) == b"mp3"
    assert seen["persona"].personality_tags == ["teasing", "clingy"]
    assert seen["audio"] == b"audio-bytes" and seen["audio_mime"] == "audio/mp4"
    assert seen["voice"] == "voice123" and seen["tts_text"] == "Is that cake for me?"


def test_tts_failure_still_returns_text(client, monkeypatch):
    c, settings = client
    settings.elevenlabs_api_key = "e"

    async def boom(*a, **k):
        raise tts.TTSError("down")

    monkeypatch.setattr(tts, "synthesize", boom)
    r = react(c)
    assert r.status_code == 200
    assert r.json()["audio_base64"] == "" and r.json()["tts_provider"] == "none"


def test_llm_failure_is_502(client, monkeypatch):
    c, settings = client
    settings.openai_api_key = "o"

    async def boom(*a, **k):
        raise llm.LLMError("down")

    monkeypatch.setattr(llm, "_openai", boom)
    assert react(c).status_code == 502


def test_rejects_bad_persona_and_types(client):
    c, _ = client
    assert react(c, data={"persona_config": "{not json"}).status_code == 422
    assert react(c, data={"persona_config": json.dumps({"doll_name": ""})}).status_code == 422
    assert react(c, files={"snapshot": ("x.txt", b"hi", "text/plain")}).status_code == 415


def test_snapshot_size_limit(client):
    c, settings = client
    settings.max_image_bytes = 100
    assert react(c).status_code == 413


def test_app_key_enforced(client):
    c, settings = client
    settings.app_api_key = "secret"
    assert react(c).status_code == 401
    assert react(c, headers={"X-App-Key": "secret"}).status_code == 200
    assert c.get("/api/voices").status_code == 401


def test_voices_and_preview(client):
    c, _ = client
    voices = c.get("/api/voices").json()
    assert len(voices) >= 3 and all(v["voice_id"] for v in voices)
    r = c.post("/api/voices/preview", json={"voice_id": voices[0]["voice_id"]})
    assert r.status_code == 200 and r.json()["tts_provider"] == "none"


def test_wallpaper_render_produces_mp4(client):
    c, _ = client
    frames = [("frames", (f"{i}.jpg", jpeg((i * 20, 80, 160), (91, 161)), "image/jpeg")) for i in range(10)]
    r = c.post("/api/wallpaper/render", data={"fps": "10", "repeat": "2"}, files=frames)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "video/mp4"
    assert r.content[4:8] == b"ftyp"


def test_parse_json_reply_handles_fences_and_bad_emotion():
    reply = llm._parse_json_reply('```json\n{"spoken_response": "hi", "emotion": "angry"}\n```')
    assert reply.spoken_response == "hi" and reply.emotion is Emotion.HAPPY
    with pytest.raises(llm.LLMError):
        llm._parse_json_reply("nope")


def test_system_prompt_contains_persona_and_rules():
    prompt = build_system_prompt(PersonaConfig(**PERSONA))
    assert "Jinnie" in prompt and "Hyunjin" in prompt and "strawberry milk" in prompt
    assert "Never mention cameras" in prompt
    assert "HAPPY|SURPRISED|TEASING|SLEEPY" in prompt
