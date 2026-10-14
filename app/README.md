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
- `src/features/setup/`: persona form and voice picker. The profile is stored in AsyncStorage,
  and the photo is copied into the app's document directory.
- `src/features/studio/`: 9:16 canvas, SVG scenes, draggable/pinchable doll and stickers.
  Export steps a shared clock through a seamless 5 s loop, snapshots each frame
  (react-native-view-shot), has the backend encode the MP4, and saves it with expo-media-library.

Environment: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_KEY` (see `.env.example`, `eas.json`).
Cloud builds: see the root README.
