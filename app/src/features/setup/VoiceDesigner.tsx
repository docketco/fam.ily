import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, type DesignedVoice, type DollApi } from '@/lib/api';
import { deleteQuietly, writeAudioToCache } from '@/lib/audio';
import { LIMITS } from '@/lib/profile';
import { colors, radius, space } from '@/lib/theme';

const TEST_LINE = 'Hi! I missed you. What are we doing today?';

/** Describe a voice in your own words; ElevenLabs designs it, you pick the take you like. */
export function VoiceDesigner({
  api,
  dollName,
  description,
  onDescriptionChange,
  voiceId,
  onVoiceIdChange,
}: {
  api: DollApi;
  dollName: string;
  description: string;
  onDescriptionChange: (text: string) => void;
  voiceId: string;
  onVoiceIdChange: (id: string) => void;
}) {
  const [previews, setPreviews] = useState<DesignedVoice[]>([]);
  const [busy, setBusy] = useState<'design' | 'save' | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const fileUri = useRef<string | null>(null);

  useEffect(
    () => () => {
      player.current?.remove();
      deleteQuietly(fileUri.current);
      Speech.stop();
    },
    [],
  );

  async function play(key: string, base64: string, mime: string) {
    player.current?.remove();
    deleteQuietly(fileUri.current);
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    fileUri.current = writeAudioToCache(base64, mime, 'voice');
    const p = createAudioPlayer({ uri: fileUri.current });
    player.current = p;
    setPlaying(key);
    const sub = p.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) {
        sub.remove();
        setPlaying(null);
      }
    });
    p.play();
  }

  async function design() {
    if (description.trim().length < 3 || busy) return;
    setBusy('design');
    setNote(null);
    setPreviews([]);
    try {
      const result = await api.designVoice(description.trim());
      setPreviews(result);
      if (result[0]) await play(result[0].generated_voice_id, result[0].audio_base64, result[0].audio_mime_type);
    } catch (err) {
      setNote(
        err instanceof ApiError && err.status === 503
          ? "AI voices need an ElevenLabs key on the server. Until then your doll uses the phone's voice."
          : (err as Error).message,
      );
    } finally {
      setBusy(null);
    }
  }

  async function choose(preview: DesignedVoice) {
    setBusy('save');
    setNote(null);
    try {
      const id = await api.saveVoice(preview.generated_voice_id, dollName.trim() || 'My doll', description.trim());
      onVoiceIdChange(id);
      setPreviews([]);
      setNote('Voice saved ✨');
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function testCurrent() {
    if (!voiceId || playing) return;
    setPlaying('current');
    try {
      const res = await api.previewVoice(voiceId, TEST_LINE);
      if (res.audio_base64) {
        await play('current', res.audio_base64, res.audio_mime_type);
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      Speech.speak(TEST_LINE, { onDone: () => setPlaying(null), onError: () => setPlaying(null) });
    } catch (err) {
      setNote((err as Error).message);
      setPlaying(null);
    }
  }

  return (
    <View>
      <TextInput
        value={description}
        onChangeText={onDescriptionChange}
        placeholder="Describe how they sound, in your own words…"
        placeholderTextColor={colors.inkSoft}
        style={[styles.input, styles.multiline]}
        multiline
        maxLength={LIMITS.voiceDescription}
        textAlignVertical="top"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create voice with AI"
        onPress={design}
        disabled={!!busy || description.trim().length < 3}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }, (busy || description.trim().length < 3) && { opacity: 0.5 }]}>
        {busy === 'design' ? <ActivityIndicator color={colors.pinkDeep} /> : <Text style={styles.pillText}>✨  Create voice with AI</Text>}
      </Pressable>

      {previews.map((p, i) => (
        <View key={p.generated_voice_id} style={styles.previewRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play take ${i + 1}`}
            onPress={() => play(p.generated_voice_id, p.audio_base64, p.audio_mime_type)}
            style={styles.play}>
            <Text style={styles.playText}>{playing === p.generated_voice_id ? '♪' : '▶'}</Text>
          </Pressable>
          <Text style={styles.take}>Take {i + 1}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Use take ${i + 1}`}
            onPress={() => choose(p)}
            disabled={!!busy}
            style={[styles.use, busy && { opacity: 0.5 }]}>
            {busy === 'save' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.useText}>Use this</Text>}
          </Pressable>
        </View>
      ))}

      {voiceId ? (
        <View style={styles.currentRow}>
          <Text style={styles.current}>✓ Voice ready</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Test voice" onPress={testCurrent} style={styles.testBtn}>
            {playing === 'current' ? <ActivityIndicator color={colors.pinkDeep} size="small" /> : <Text style={styles.pillText}>▶ Test</Text>}
          </Pressable>
        </View>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 80 },
  pill: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.pinkSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    minWidth: 190,
    alignItems: 'center',
  },
  pillText: { color: colors.pinkDeep, fontWeight: '700' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  playText: { color: colors.pinkDeep, fontSize: 16, fontWeight: '800' },
  take: { flex: 1, marginLeft: space.sm, color: colors.ink, fontWeight: '600' },
  use: { backgroundColor: colors.pinkDeep, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, minWidth: 84, alignItems: 'center' },
  useText: { color: '#fff', fontWeight: '700' },
  currentRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  current: { color: '#2F855A', fontWeight: '700', marginRight: space.sm },
  testBtn: { backgroundColor: colors.pinkSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minWidth: 70, alignItems: 'center' },
  note: { color: colors.inkSoft, fontSize: 12, marginTop: space.xs },
});
