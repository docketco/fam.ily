# Doll Companion API

FastAPI service behind the fam.ily app.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Which LLM/TTS providers are active (`fallback`/`none` = demo mode) |
| `POST /api/doll/react` | multipart: `snapshot` (JPEG), `persona_config` (JSON string), `user_speech_text` and/or `user_audio` (m4a). Returns `spoken_text`, `emotion` (`HAPPY`, `SURPRISED`, `TEASING` or `SLEEPY`), `heard_text` and `audio_base64` (MP3) |
| `POST /api/persona/draft` | `{idea, doll_name?, inspiration?}` → AI-drafted relationship, personality, backstory, voice description |
| `POST /api/voices/design` | `{description}` → ElevenLabs Voice Design takes (`generated_voice_id` + audio) |
| `POST /api/voices/save` | `{generated_voice_id, name, description}` → permanent `voice_id` |
| `POST /api/voices/preview` | `{voice_id, text?}` → short TTS clip |
| `POST /api/scene/generate` | `{prompt}` → 1080×1920 JPEG + AI-picked ambient `effect` |
| `POST /api/sticker/generate` | `{prompt}` → transparent PNG sticker |
| `POST /api/doll/quote` | persona → a short in-character lock screen line |
| `POST /api/wallpaper/render` | multipart `frames[]` + `fps` + `repeat` (+ `output_fps` for Live Photos) → looping H.264 MP4 |
| `GET /api/voices` | Legacy list of ElevenLabs premade voices (the app no longer uses it) |

How the pieces fit:

- **LLM**: Gemini (`GEMINI_MODEL`, default `gemini-2.5-flash`) gets the image *and* the recorded
  audio directly, with structured JSON output. With OpenAI it transcribes the audio first,
  then calls `OPENAI_MODEL` (default `gpt-4o-mini`) with the image.
  `LLM_PROVIDER=auto|gemini|openai|fallback`.
- **TTS**: ElevenLabs `ELEVENLABS_MODEL_ID` (default `eleven_flash_v2_5` for low latency).
  If TTS fails, the text reply is still returned and the app speaks it on the device.
- **Images**: Gemini `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`) or OpenAI
  `OPENAI_IMAGE_MODEL` (default `gpt-image-1`), chosen by `IMAGE_PROVIDER=auto|gemini|openai|fallback`.
  Sticker backgrounds are made transparent, either by the model (OpenAI) or by a corner flood-fill (Gemini).
- **Voice design**: each saved voice uses a slot in your ElevenLabs account.
- **Video**: ffmpeg comes bundled through `imageio-ffmpeg`, so there is nothing to install on the host.

Setup, tests and deployment are covered in the root README.
