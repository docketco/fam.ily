# Doll Companion API

FastAPI service behind the fam.ily app.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Which LLM/TTS providers are active (`fallback`/`none` = demo mode) |
| `POST /api/doll/react` | multipart: `snapshot` (JPEG), `persona_config` (JSON string), `user_speech_text` and/or `user_audio` (m4a). Returns `spoken_text`, `emotion` (`HAPPY`, `SURPRISED`, `TEASING` or `SLEEPY`), `heard_text` and `audio_base64` (MP3) |
| `GET /api/voices` | Preset ElevenLabs voices |
| `POST /api/voices/preview` | `{voice_id, text?}` → short TTS clip |
| `POST /api/wallpaper/render` | multipart `frames[]` + `fps` + `repeat` → looping H.264 MP4 |

How the pieces fit:

- **LLM**: Gemini (`GEMINI_MODEL`, default `gemini-2.5-flash`) gets the image *and* the recorded
  audio directly, with structured JSON output. With OpenAI it transcribes the audio first,
  then calls `OPENAI_MODEL` (default `gpt-4o-mini`) with the image.
  `LLM_PROVIDER=auto|gemini|openai|fallback`.
- **TTS**: ElevenLabs `ELEVENLABS_MODEL_ID` (default `eleven_flash_v2_5` for low latency).
  If TTS fails, the text reply is still returned and the app speaks it on the device.
- **Video**: ffmpeg comes bundled through `imageio-ffmpeg`, so there is nothing to install on the host.

Setup, tests and deployment are covered in the root README.
