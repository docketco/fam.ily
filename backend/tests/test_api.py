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

    async def fake_gemini(s, req):
        seen.update(persona=req.persona, mime=req.image_mime, audio=req.audio_bytes, audio_mime=req.audio_mime)
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
    assert "HAPPY|LOVING|TEASING|SURPRISED|SLEEPY|SAD|POUTY" in prompt


def test_legacy_personality_tags_still_work():
    legacy = {k: v for k, v in PERSONA.items() if k != "personality"}
    assert "teasing, clingy" in build_system_prompt(PersonaConfig(**legacy))



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



def test_chat_mode_needs_no_snapshot_and_remembers_history(client, monkeypatch):
    c, settings = client
    settings.gemini_api_key = "g"
    seen = {}

    async def fake_gemini(s, req):
        seen["system"], seen["user"], seen["mode"], seen["image"] = req.system(), req.user_turn(), req.mode, req.image_bytes
        return DollReply(spoken_response="Strawberry milk again? Of course.", emotion=Emotion.LOVING, heard_text="")

    monkeypatch.setattr(llm, "_gemini", fake_gemini)
    history = [{"role": "user", "text": "I had a rough day"}, {"role": "doll", "text": "Come here, tell me everything."}]
    r = c.post(
        "/api/doll/react",
        data={"persona_config": json.dumps(PERSONA), "user_speech_text": "I got strawberry milk", "mode": "chat", "history": json.dumps(history)},
    )
    assert r.status_code == 200, r.text
    assert r.json()["emotion"] == "LOVING"
    assert seen["mode"].value == "chat" and seen["image"] is None
    assert "texting you in a chat" in seen["system"]
    assert "Human: I had a rough day" in seen["user"] and "Jinnie: Come here" in seen["user"]
    assert seen["user"].endswith('Your human says: "I got strawberry milk".')


def test_camera_mode_without_a_picture_becomes_a_call(client, monkeypatch):
    c, settings = client
    settings.gemini_api_key = "g"
    seen = {}

    async def fake_gemini(s, req):
        seen["mode"], seen["system"] = req.mode, req.system()
        return DollReply(spoken_response="Hi!", emotion=Emotion.HAPPY)

    monkeypatch.setattr(llm, "_gemini", fake_gemini)
    r = c.post("/api/doll/react", data={"persona_config": json.dumps(PERSONA), "user_speech_text": "hey", "mode": "camera"})
    assert r.status_code == 200
    assert seen["mode"].value == "call" and "voice call" in seen["system"] and "can see" not in seen["system"]


def test_bad_history_is_rejected(client):
    c, _ = client
    base = {"persona_config": json.dumps(PERSONA), "mode": "chat"}
    assert c.post("/api/doll/react", data={**base, "history": "{oops"}).status_code == 422
    assert c.post("/api/doll/react", data={**base, "history": json.dumps([{"role": "boss", "text": "x"}])}).status_code == 422


def test_empty_turn_is_a_greeting():
    from app.prompt import build_user_turn
    from app.schemas import Turn

    assert "first time" in build_user_turn("", has_audio=False, has_image=False)
    back = build_user_turn("", has_audio=False, has_image=False, history=[Turn(role="user", text="bye")])
    assert "came back" in back and "Human: bye" in back


def test_history_is_capped_to_recent_turns(client, monkeypatch):
    c, settings = client
    settings.gemini_api_key = "g"
    seen = {}

    async def fake_gemini(s, req):
        seen["n"] = len(req.history)
        return DollReply(spoken_response="ok", emotion=Emotion.HAPPY)

    monkeypatch.setattr(llm, "_gemini", fake_gemini)
    history = [{"role": "user", "text": f"m{i}"} for i in range(40)]
    c.post("/api/doll/react", data={"persona_config": json.dumps(PERSONA), "user_speech_text": "x", "mode": "chat", "history": json.dumps(history)})
    assert seen["n"] == 16


def test_cutout_removes_plain_background(client):
    c, _ = client
    img = Image.new("RGB", (200, 200), (240, 240, 245))
    for x in range(60, 140):
        for y in range(50, 160):
            img.putpixel((x, y), (180, 120, 90))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=95)
    r = c.post("/api/doll/cutout", files={"photo": ("p.jpg", buf.getvalue(), "image/jpeg")})
    assert r.status_code == 200, r.text
    out = Image.open(io.BytesIO(base64.b64decode(r.json()["image_base64"])))
    assert out.mode == "RGBA" and out.getpixel((0, 0))[3] == 0
    assert out.getpixel((out.width // 2, out.height // 2))[3] == 255
    assert out.width < 120  # cropped to the plushie


def test_cutout_rejects_busy_or_empty_results(client):
    c, _ = client
    plain = io.BytesIO()
    Image.new("RGB", (100, 100), (250, 250, 250)).save(plain, "PNG")
    assert c.post("/api/doll/cutout", files={"photo": ("p.png", plain.getvalue(), "image/png")}).status_code == 422
    assert c.post("/api/doll/cutout", files={"photo": ("p.txt", b"hi", "text/plain")}).status_code == 415
