# fam.ily: idol doll companion

A native iOS + Android app (React Native / Expo SDK 57) that brings a plushie to life. You chat
with it or call it, and it answers in character with its own voice while it acts out how it
feels. A small FastAPI backend handles the AI parts: the LLM and ElevenLabs voices.

```
app/       Expo app (TypeScript, expo-router). Built in the cloud with EAS Build.
backend/   FastAPI service: the doll's replies, voices, plushie cutout fallback.
```

| Part | Where |
| --- | --- |
| AI brain, persona and voices (backend) | `backend/app/` (`main.py`, `llm.py`, `prompt.py`, `tts.py`) |
| Animated 2.5D doll | `app/src/features/doll/` (`PlushieAvatar.tsx`, `pose.ts`) |
| Chat and voice call | `app/src/features/talk/` |
| Camera "show & ask" call | `app/src/features/call/DollCallScreen.tsx` |
| Doll setup and storage | `app/src/features/setup/`, `app/src/lib/profile*.ts*` |
| Plushie cutout (on-device) | `app/modules/subject-cutout/` (Swift + Kotlin), fallback `backend/app/cutout.py` |

Everything the user writes about their doll is free text, and all of it becomes the AI's
character instructions. There are no preset relationships or personalities.

- **Your doll**: pick a photo and the plushie is cut out of its background automatically: on
  iPhone with Apple's built-in subject lifting (iOS 17+), on Android with Google ML Kit, with a
  plain-background fallback on the server.
- **Doll setup**: describe your doll in your own words. "Write the rest with AI" drafts the
  relationship, personality, backstory and voice description, and every field stays editable.
- **Voice**: describe how it sounds. ElevenLabs Voice Design generates takes, and you keep the one you like.
- **Chat**: text with your doll while it reacts on screen (happy, loving, teasing, surprised,
  sleepy, sad, pouty). Replies can be read aloud.
- **Voice call**: hold to talk; the doll answers out loud and acts it out. From a call you can
  switch on the camera to show it something.
- **One memory**: chat, calls and camera share one conversation, kept on the phone, and the
  doll remembers what you talked about.

## Run it locally

**Backend** (Python 3.11+):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # add GEMINI_API_KEY or OPENAI_API_KEY, and ELEVENLABS_API_KEY
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pytest
```

Every key is optional, so you can develop offline. Without an LLM key the doll gives "demo"
replies. Without an ElevenLabs key there's no voice design, and the app speaks with the
phone's built-in voice.

Try it with a real photo:

```bash
curl -F mode=camera -F snapshot=@toy.jpg -F 'user_speech_text=What do you think of my desk?' \
  -F 'persona_config={"doll_name":"Mochi","idol_identity":"pastel streetwear, sleepy eyes","personality":"deadpan but secretly soft","relationship_type":"the friend who roasts me","elevenlabs_voice_id":"EXAVITQu4vr4xnSDxMaL"}' \
  http://localhost:8000/api/doll/react
```

**App** (Node 20+):

```bash
cd app
npm install
npm test && npm run typecheck && npm run lint
npx expo start                  # then open it in a development build (see below)
```

In development the app calls `http://<the computer running expo start>:8000` automatically,
so keep the phone on the same Wi-Fi. You can override the server URL in
*Edit doll → Advanced settings*.

## Build iOS and Android in the cloud (EAS Build)

No Xcode or Android Studio needed.

```bash
cd app
npm install -g eas-cli
eas login
eas init                                           # links the project, writes the projectId
eas build --profile development --platform all     # dev client to use with `npx expo start`
```

For installable test builds and store builds:

1. Deploy the backend somewhere with **HTTPS** (`backend/Dockerfile` runs on Render, Fly.io,
   Railway, Cloud Run…). Release builds block plain `http://` on both platforms.
2. Put that URL in `app/eas.json` (`EXPO_PUBLIC_API_URL` under `preview` and `production`).
3. `eas build --profile preview --platform all` gives you an Android APK and an
   internal-distribution iOS build (register test iPhones with `eas device:create`).
4. `eas build --profile production --platform all`, then `eas submit` to the App Store and Google Play.

iOS builds need an Apple Developer account. EAS asks for it and manages certificates for you.

The plushie cutout is native code (`app/modules/subject-cutout`). It's compiled into EAS and
development builds automatically. In Expo Go, or on iPhones before iOS 17, the app uses the
server fallback instead.

## Content and responsibility

- No preset relationships, idols or characters ship with the app. Everything comes from the
  user's own input.
- Before saving, the user confirms that their doll is an original character, not affiliated
  with or endorsed by any real person, group or company, and that they're responsible for
  what they enter and generate.
- Prompts tell the models to stay non-sexual and safe and never to speak as a real person. The
  AI providers' own content policies apply on top of that.
- This is a product safeguard, not legal advice. Have a lawyer review your Terms of Service,
  privacy policy (chats, camera, microphone and voice data go to Google/OpenAI/ElevenLabs) and
  app store age rating before launch.

## Security notes

- API keys live only on the backend. The app never sees them.
- Set `APP_API_KEY` on the server and `EXPO_PUBLIC_APP_KEY` in the app to block casual abuse.
  Anything shipped inside an app can be extracted, so add real user auth and rate limiting
  before a public launch.
