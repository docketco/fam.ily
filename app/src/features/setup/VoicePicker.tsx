import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DollApi } from '@/lib/api';
import { deleteQuietly, writeAudioToCache } from '@/lib/audio';
import { colors, radius, space } from '@/lib/theme';
import { FALLBACK_VOICES, type Voice } from '@/lib/voices';

const PREVIEW_LINE = 'Hi! I missed you.';

export function VoicePicker({
  api,
  value,
  onChange,
}: {
  api: DollApi;
  value: string;
  onChange: (voiceId: string) => void;
}) {
  const [voices, setVoices] = useState<Voice[]>(FALLBACK_VOICES);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const fileUri = useRef<string | null>(null);

  useEffect(() => {
    api.voices().then(setVoices).catch(() => setVoices(FALLBACK_VOICES));
  }, [api]);

  useEffect(() => {
    if (!value && voices[0]) onChange(voices[0].voice_id);
  }, [value, voices, onChange]);

  useEffect(
    () => () => {
      player.current?.remove();
      deleteQuietly(fileUri.current);
      Speech.stop();
    },
    [],
  );

  const selected = voices.find((v) => v.voice_id === value);

  async function testVoice() {
    if (!value || playing) return;
    setPlaying(true);
    setNote(null);
    try {
      const res = await api.previewVoice(value, PREVIEW_LINE);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!res.audio_base64) {
        setNote('No ElevenLabs key on the server: playing the phone voice instead.');
        Speech.speak(PREVIEW_LINE, { onDone: () => setPlaying(false), onError: () => setPlaying(false) });
        return;
      }
      player.current?.remove();
      deleteQuietly(fileUri.current);
      fileUri.current = writeAudioToCache(res.audio_base64, res.audio_mime_type, 'preview');
      const p = createAudioPlayer({ uri: fileUri.current });
      player.current = p;
      const sub = p.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) {
          sub.remove();
          setPlaying(false);
        }
      });
      p.play();
    } catch (err) {
      setNote((err as Error).message);
      setPlaying(false);
    }
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose voice"
        onPress={() => setOpen((o) => !o)}
        style={styles.dropdown}>
        <View style={{ flex: 1 }}>
          <Text style={styles.voiceName}>{selected?.name ?? 'Custom voice'}</Text>
          <Text style={styles.voiceDesc}>{selected?.description ?? value}</Text>
        </View>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open && (
        <View style={styles.list}>
          {voices.map((v) => (
            <Pressable
              key={v.voice_id}
              accessibilityRole="button"
              accessibilityState={{ selected: v.voice_id === value }}
              onPress={() => {
                onChange(v.voice_id);
                setOpen(false);
              }}
              style={[styles.row, v.voice_id === value && styles.rowOn]}>
              <Text style={styles.voiceName}>{v.name}</Text>
              <Text style={styles.voiceDesc}>{v.description}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Test voice"
        onPress={testVoice}
        disabled={playing}
        style={({ pressed }) => [styles.testBtn, pressed && { opacity: 0.8 }]}>
        {playing ? <ActivityIndicator color={colors.pinkDeep} /> : <Text style={styles.testText}>▶  Test voice</Text>}
      </Pressable>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  chevron: { color: colors.inkSoft, marginLeft: space.sm },
  list: { marginTop: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowOn: { backgroundColor: colors.pinkSoft },
  voiceName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  voiceDesc: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  testBtn: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.pinkSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    minWidth: 130,
    alignItems: 'center',
  },
  testText: { color: colors.pinkDeep, fontWeight: '700' },
  note: { color: colors.inkSoft, fontSize: 12, marginTop: space.xs },
});
