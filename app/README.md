# fam.ily app (Expo SDK 57)

```bash
npm install
npx expo start        # open in a development build
npm test              # pose math, profile storage, API client
npm run typecheck && npm run lint
```

- `src/app/`: routes (`index` home, `setup`, `chat`, `call`, `camera`). The app sends you to setup until a doll exists.
- `src/features/doll/`: `PlushieAvatar` and the pure, unit-tested animation math in `pose.ts`:
  each emotion has its own body language, and talking layers a bounce on top.
- `src/features/talk/`: chat and voice call screens, the doll's voice (`useDollVoice`) and
  hold-to-talk recording (`usePushToTalk`).
- `src/features/call/`: the camera "show & ask" call.
- `src/features/setup/`: free-text persona form with "Write the rest with AI", AI voice design,
  the plushie cutout, and the original-character confirmation.
- `src/lib/conversation.tsx`: the one conversation shared by chat and calls, kept on the phone.
- `src/lib/cutout.ts`: cutout on the device first (`modules/subject-cutout`: Apple Vision on
  iOS 17+, Google ML Kit on Android), then the backend fallback. `cutout.web.ts` is the browser version.

Browser demo: `npm run build:demo` builds a web version (`EXPO_PUBLIC_DEMO=1`, see
`src/lib/demo-api.ts`) for publishing as a claude.ai artifact. There, AI requests go to Claude
through the artifact runtime instead of the backend, and the voice call takes typed messages
instead of the microphone.

Environment: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_KEY` (see `.env.example`, `eas.json`).
Cloud builds: see the root README.
