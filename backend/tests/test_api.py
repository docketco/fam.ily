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
    "personality": "Teasing but secretly soft",
    "personality_tags": ["teasing", "clingy", "teasing"],
    "relationship_type": "my chaotic little hype-man",
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
    assert body == {
        "status": "ok",
        "llm_provider": "fallback",
        "tts_provider": "none",
        "image_provider": "fallback",
        "auth_required": False,
    }


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
    assert "Teasing but secretly soft" in prompt and "chaotic little hype-man" in prompt
    assert "original character" in prompt
    assert "Never mention cameras" in prompt
    assert "HAPPY|SURPRISED|TEASING|SLEEPY" in prompt


def test_legacy_personality_tags_still_work():
    legacy = {k: v for k, v in PERSONA.items() if k != "personality"}
    assert "teasing, clingy" in build_system_prompt(PersonaConfig(**legacy))


def png_bytes(color=(255, 255, 255), size=(80, 80), dot=(255, 0, 0)) -> bytes:
    img = Image.new("RGB", size, color)
    for x in range(30, 50):
        for y in range(30, 50):
            img.putpixel((x, y), dot)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def test_scene_fallback_returns_9x16_jpeg_and_keyword_effect(client):
    c, _ = client
    r = c.post("/api/scene/generate", json={"prompt": "rainy tokyo alley at night"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "fallback" and body["effect"] == "rain"
    img = Image.open(io.BytesIO(base64.b64decode(body["image_base64"])))
    assert img.format == "JPEG" and img.size == (1080, 1920)


def test_scene_uses_image_model_and_llm_effect(client, monkeypatch):
    c, settings = client
    settings.gemini_api_key = "g"
    seen = {}

    async def fake_generate(s, p, kind):
        seen["prompt"], seen["kind"] = p, kind
        return jpeg(size=(800, 1000)), "gemini"

    async def fake_structured(s, system, user, schema):
        return schema(effect="petals"), "gemini"

    monkeypatch.setattr("app.imagegen.generate", fake_generate)
    monkeypatch.setattr(llm, "structured_text", fake_structured)
    body = c.post("/api/scene/generate", json={"prompt": "my grandma's garden"}).json()
    assert body["effect"] == "petals" and body["provider"] == "gemini"
    assert "my grandma's garden" in seen["prompt"] and "No people" in seen["prompt"] and seen["kind"] == "scene"
    assert Image.open(io.BytesIO(base64.b64decode(body["image_base64"]))).size == (1080, 1920)


def test_scene_generation_failure_is_502(client, monkeypatch):
    c, _ = client
    from app import imagegen

    async def boom(*a, **k):
        raise imagegen.ImageGenError("declined")

    monkeypatch.setattr(imagegen, "generate", boom)
    assert c.post("/api/scene/generate", json={"prompt": "anything"}).status_code == 502


def test_sticker_knocks_out_white_background(client, monkeypatch):
    c, _ = client

    async def fake_generate(s, p, kind):
        return png_bytes(), "gemini"

    monkeypatch.setattr("app.imagegen.generate", fake_generate)
    body = c.post("/api/sticker/generate", json={"prompt": "strawberry milk"}).json()
    img = Image.open(io.BytesIO(base64.b64decode(body["image_base64"])))
    assert img.mode == "RGBA"
    assert img.size == (20, 20)  # trimmed to the red square
    assert img.getpixel((10, 10))[3] == 255


def test_sticker_fallback_is_transparent_png(client):
    c, _ = client
    body = c.post("/api/sticker/generate", json={"prompt": "cat ears"}).json()
    img = Image.open(io.BytesIO(base64.b64decode(body["image_base64"])))
    assert img.format == "PNG" and img.getpixel((0, 0))[3] == 0


def test_persona_draft(client, monkeypatch):
    c, settings = client
    r = c.post("/api/persona/draft", json={"idea": "a sleepy bunny who roasts me"})
    assert r.json()["personality"] == "a sleepy bunny who roasts me"  # offline: idea handed back

    settings.openai_api_key = "o"

    async def fake_structured(s, system, user, schema):
        assert "sleepy bunny" in user and "Doll name: Mochi" in user
        return schema(relationship="r", personality="p", backstory="b", voice_description="v"), "openai"

    monkeypatch.setattr(llm, "structured_text", fake_structured)
    r = c.post("/api/persona/draft", json={"idea": "a sleepy bunny who roasts me", "doll_name": "Mochi"})
    assert r.json() == {"relationship": "r", "personality": "p", "backstory": "b", "voice_description": "v"}


def test_quote(client):
    c, _ = client
    assert c.post("/api/doll/quote", json=PERSONA).json() == {"quote": "Jinnie missed you!"}


def test_voice_design_requires_key_then_works(client, monkeypatch):
    c, settings = client
    assert c.post("/api/voices/design", json={"description": "soft sleepy voice"}).status_code == 503
    settings.elevenlabs_api_key = "e"
    from app.schemas import DesignedVoice

    async def fake_design(s, desc, sample):
        return [DesignedVoice(generated_voice_id="g1", audio_base64="AA==", audio_mime_type="audio/mpeg")]

    async def fake_save(s, gid, name, desc):
        assert gid == "g1" and name == "Mochi"
        return "voice-xyz"

    monkeypatch.setattr(tts, "design_voice", fake_design)
    monkeypatch.setattr(tts, "save_designed_voice", fake_save)
    assert c.post("/api/voices/design", json={"description": "soft sleepy voice"}).json()["previews"][0]["generated_voice_id"] == "g1"
    r = c.post("/api/voices/save", json={"generated_voice_id": "g1", "name": "Mochi", "description": "soft sleepy voice"})
    assert r.json() == {"voice_id": "voice-xyz"}


def test_wallpaper_output_fps_duplicates_frames(client):
    c, _ = client
    frames = [("frames", (f"{i}.jpg", jpeg((i * 20, 80, 160), (90, 160)), "image/jpeg")) for i in range(6)]
    r = c.post("/api/wallpaper/render", data={"fps": "6", "output_fps": "30"}, files=frames)
    assert r.status_code == 200 and r.content[4:8] == b"ftyp"
