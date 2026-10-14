# fam.ily app (Expo SDK 57)

```bash
npm install
npx expo start        # open in a development build
npm test              # pose math, profile storage, API client
npm run typecheck && npm run lint
```

- `src/app/`: routes (`index` home, `setup`, `call`, `studio`). The app sends you to setup until a doll exists.
- `src/features/doll/`: `PlushieAvatar` and the pure, unit-tested animation math in `pose.ts`.
  The same worklet functions run on the UI thread (live) and in JS (frame export).
- `src/features/call/`: camera + push-to-talk (expo-camera, expo-audio). A snapshot and the voice
  clip go to the backend, then the reply plays back while the doll bounces.
- `src/features/setup/`: free-text persona form with "Write the rest with AI", AI voice design,
  and the original-character confirmation. The profile is stored in AsyncStorage (older profiles
  are migrated), and the photo is copied into the app's document directory.
- `src/features/studio/`: 9:16 canvas with AI-painted scenes, AI stickers, AI-picked ambient
  motion, and a draggable/pinchable doll. Export steps a shared clock through a seamless 5 s loop,
  snapshots each frame (react-native-view-shot), and has the backend encode an MP4. On iOS,
  `modules/live-photo` turns that MP4 into a Live Photo.
- `modules/live-photo/`: local Expo module in Swift. It writes a key photo and a paired .mov that
  share a content identifier (plus the still-image-time marker), then saves both as one Live
  Photo with PhotoKit. It builds only in EAS/dev builds, not in Expo Go.

Browser demo: `npm run build:demo` builds a web version (`EXPO_PUBLIC_DEMO=1`, see
`src/lib/demo-api.ts`) for publishing as a claude.ai artifact. There, AI requests go to Claude
through the artifact runtime instead of the backend, the call screen uses a picked photo and
typed messages instead of the camera and microphone, and exports are turned off.

Environment: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_KEY` (see `.env.example`, `eas.json`).
Cloud builds: see the root README.
