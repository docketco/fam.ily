# Doll Companion API

FastAPI service behind the fam.ily app.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Which LLM/TTS providers are active (`fallback`/`none` = demo mode) |
| `POST /api/doll/react` | multipart: `persona_config` (JSON string), `mode` (`chat`, `call` or `camera`), `user_speech_text` and/or `user_audio` (m4a), optional `history` (JSON list of recent `{role, text}` turns) and `snapshot` (JPEG, camera mode). Returns `spoken_text`, `emotion` (`HAPPY`, `LOVING`, `TEASING`, `SURPRISED`, `SLEEPY`, `SAD` or `POUTY`), `heard_text` and `audio_base64` (MP3). An empty turn makes the doll greet you. |
| `POST /api/doll/cutout` | multipart `photo` → transparent PNG of the plushie (plain-background fallback for phones that can't do it on-device) |
| `POST /api/persona/draft` | `{idea, doll_name?, inspiration?}` → AI-drafted relationship, personality, backstory, voice description |
| `POST /api/voices/design` | `{description}` → ElevenLabs Voice Design takes (`generated_voice_id` + audio) |
| `POST /api/voices/save` | `{generated_voice_id, name, description}` → permanent `voice_id` |
| `POST /api/voices/preview` | `{voice_id, text?}` → short TTS clip |
| `GET /api/voices` | Legacy list of ElevenLabs premade voices (the app no longer uses it) |

How the pieces fit:

- **LLM**: Gemini (`GEMINI_MODEL`, default `gemini-2.5-flash`) gets the image *and* the recorded
  audio directly, with structured JSON output. With OpenAI it transcribes the audio first,
  then calls `OPENAI_MODEL` (default `gpt-4o-mini`) with the image.
  `LLM_PROVIDER=auto|gemini|openai|fallback`.
- **TTS**: ElevenLabs `ELEVENLABS_MODEL_ID` (default `eleven_flash_v2_5` for low latency).
  If TTS fails, the text reply is still returned and the app speaks it on the device.
- **Voice design**: each saved voice uses a slot in your ElevenLabs account.
- **Memory**: the app sends the last 16 turns of the conversation with each message, so the
  doll remembers what was said in chat, calls and camera calls alike.

Setup, tests and deployment are covered in the root README.
