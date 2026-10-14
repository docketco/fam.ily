import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';

import type { LocalFile } from '@/lib/api';
import { deleteQuietly } from '@/lib/audio';

const MIN_SECONDS = 0.5;

export type PushToTalkResult = { kind: 'audio'; file: LocalFile } | { kind: 'too-short' } | { kind: 'error'; message: string };

/** Hold-to-talk recording: call `start` on press-in and `finish` on press-out. */
export function usePushToTalk() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 100);
  const [recording, setRecording] = useState(false);
  const starting = useRef<Promise<string | null> | null>(null);

  async function begin(): Promise<string | null> {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return 'Microphone access is off. Turn it on in Settings to talk.';
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return null;
  }

  function start() {
    setRecording(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    starting.current = begin().catch((err) => `Couldn't start recording: ${(err as Error).message}`);
  }

  async function finish(): Promise<PushToTalkResult> {
    const problem = await starting.current;
    starting.current = null;
    setRecording(false);
    if (problem) return { kind: 'error', message: problem };
    const seconds = recorder.currentTime;
    await recorder.stop().catch(() => {});
    const uri = recorder.uri;
    if (!uri || seconds < MIN_SECONDS) {
      deleteQuietly(uri);
      return { kind: 'too-short' };
    }
    return { kind: 'audio', file: { uri, name: 'speech.m4a', type: 'audio/mp4' } };
  }

  return { start, finish, recording, metering: state.metering };
}
