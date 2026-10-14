# fam.ily: idol doll companion

A native iOS + Android app (React Native / Expo SDK 57) that brings a plushie to life. You show it
the world through your camera, hold to talk, and it answers in character with its own voice.
A small FastAPI backend handles the AI parts: vision LLM and ElevenLabs TTS.

```
app/       Expo app (TypeScript, expo-router). Built in the cloud with EAS Build.
backend/   FastAPI service: /api/doll/react, voices, wallpaper video encoding.
```

| Module | Where |
| --- | --- |
| 1. Brain & persona backend | `backend/app/` (`main.py`, `llm.py`, `tts.py`, `prompt.py`) |
| 2. Animated 2.5D doll | `app/src/features/doll/PlushieAvatar.tsx`, `pose.ts` |
| 3. Push-to-talk video call | `app/src/features/call/DollCallScreen.tsx` |
| 4. Persona onboarding & storage | `app/src/features/setup/`, `app/src/lib/profile*.ts*` |
| 5. Lock screen wallpaper studio | `app/src/features/studio/`, `backend/app/wallpaper.py`, `backend/app/imagegen.py` |
| Live Photo export (iOS) | `app/modules/live-photo/` (local Expo native module, Swift) |

Everything the user creates is free text and AI-powered: there are no preset relationships,
personalities, voices, scenes or stickers.

- **Doll**: describe it in your own words. "Write the rest with AI" drafts the relationship,
  personality, backstory and voice description, and every field stays editable.
- **Voice**: describe how it sounds. ElevenLabs Voice Design generates takes, and you keep the one you like.
- **Scenes**: describe any place or mood. An image model paints a 9:16 background, and the AI picks
  an ambient motion (rain, snow, sparkle, petals, mist) that you can change.
- **Stickers**: describe anything. AI makes a die-cut sticker with a transparent background.
- **Speech bubble**: type a line, or let the doll write one in character.
- **Exports**: a Live Photo on iOS (for a moving Lock Screen), a looping MP4 (Android video
  wallpapers), or a still image.

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

Every key is optional, so you can develop offline. Without an LLM/image key the doll gives
"demo" replies and the studio uses placeholder scenes and stickers. Without an ElevenLabs key
there's no voice design, and the app speaks with the phone's built-in voice.

Try it with a real photo:

```bash
curl -F snapshot=@toy.jpg -F 'user_speech_text=What do you think of my desk?' \
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

The Live Photo exporter is native Swift code (`app/modules/live-photo`). It's compiled into
EAS and development builds automatically, but it isn't available in Expo Go or on Android.

## Content and responsibility

- No preset relationships, idols or characters ship with the app. Everything comes from the
  user's own input.
- Before saving, the user confirms that their doll is an original character, not affiliated
  with or endorsed by any real person, group or company, and that they're responsible for
  what they enter and generate.
- Prompts tell the models to stay non-sexual and safe, never to speak as a real person, and
  not to draw people in scenes. The AI providers' own content policies apply on top of that.
- This is a product safeguard, not legal advice. Have a lawyer review your Terms of Service,
  privacy policy (camera, microphone and voice data go to Google/OpenAI/ElevenLabs) and
  app store age rating before launch.

## Security notes

- API keys live only on the backend. The app never sees them.
- Set `APP_API_KEY` on the server and `EXPO_PUBLIC_APP_KEY` in the app to block casual abuse.
  Anything shipped inside an app can be extracted, so add real user auth and rate limiting
  before a public launch.
