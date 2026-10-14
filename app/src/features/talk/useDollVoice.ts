import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import { deleteQuietly, writeAudioToCache } from '@/lib/audio';

/**
 * Plays the doll's reply: the ElevenLabs audio when the server sent some, otherwise the
 * phone's own voice. `speaking` is true while it talks, so the doll can animate in sync.
 */
export function useDollVoice() {
  const player = useAudioPlayer(null);
  const [speaking, setSpeaking] = useState(false);
  const file = useRef<string | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const done = useCallback(() => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    setSpeaking(false);
  }, []);

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) done();
    });
    return () => sub.remove();
  }, [player, done]);

  useEffect(
    () => () => {
      Speech.stop();
      if (fallback.current) clearTimeout(fallback.current);
      deleteQuietly(file.current);
    },
    [],
  );

  const stop = useCallback(() => {
    player.pause();
    Speech.stop();
    done();
  }, [player, done]);

  const speak = useCallback(
    async (text: string, audioBase64?: string, mime?: string) => {
      stop();
      // Leave record mode, otherwise iOS routes playback to the quiet earpiece.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      setSpeaking(true);
      // If speech never reports back (muted device, no voices), the doll still settles.
      fallback.current = setTimeout(done, 2000 + text.split(/\s+/).length * 450);
      if (audioBase64) {
        deleteQuietly(file.current);
        file.current = writeAudioToCache(audioBase64, mime ?? 'audio/mpeg');
        player.replace({ uri: file.current });
        player.play();
        return;
      }
      Speech.speak(text, { pitch: 1.2, rate: 1.0, onDone: done, onStopped: done, onError: done });
    },
    [player, stop, done],
  );

  return { speak, stop, speaking };
}
