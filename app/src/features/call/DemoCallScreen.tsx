import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlushieAvatar } from '@/features/doll/PlushieAvatar';
import type { DollEmotion } from '@/features/doll/pose';
import { toPersonaConfig } from '@/lib/profile';
import { useProfile } from '@/lib/profile-store';
import { colors, radius, space } from '@/lib/theme';

import { DemoApi } from '@/lib/demo-api';
import { toDollEmotion } from './emotion';
import { useCallTimer } from './useCallTimer';

type Phase = 'idle' | 'thinking' | 'speaking';

/**
 * Browser version of the video call for the web demo. A web page can't open the camera or
 * microphone, so the viewer shows the doll a photo and types instead of talking.
 */
export function DemoCallScreen() {
  const { profile, api } = useProfile();
  const insets = useSafeAreaInsets();
  const timer = useCallTimer();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [emotion, setEmotion] = useState<DollEmotion>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishSpeaking = useCallback(() => {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    setPhase((p) => (p === 'speaking' ? 'idle' : p));
    setEmotion('idle');
  }, []);

  useEffect(
    () => () => {
      Speech.stop();
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    },
    [],
  );

  if (!profile) return null;

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function send() {
    if (!profile || phase === 'thinking') return;
    const text = typed.trim();
    if (!text && !photoUri) {
      setError('Show a photo or type something first.');
      return;
    }
    Speech.stop();
    setTyped('');
    setError(null);
    setHeard(text);
    setReply('');
    setPhase('thinking');
    setEmotion('thinking');
    try {
      const res = await (api as DemoApi).react({
        snapshot: photoUri ? { uri: photoUri, name: 'photo.jpg', type: 'image/jpeg' } : null,
        persona: toPersonaConfig(profile),
        userSpeechText: text,
      });
      setReply(res.spoken_text);
      setEmotion(toDollEmotion(res.emotion));
      setPhase('speaking');
      // Device speech can be unavailable or silent; the doll still settles after a while.
      fallbackTimer.current = setTimeout(finishSpeaking, 1500 + res.spoken_text.split(/\s+/).length * 380);
      Speech.speak(res.spoken_text, { pitch: 1.25, rate: 1.0, onDone: finishSpeaking, onStopped: finishSpeaking, onError: finishSpeaking });
    } catch (err) {
      setError((err as Error).message || 'Something went wrong');
      setPhase('idle');
      setEmotion('idle');
    }
  }

  const busy = phase === 'thinking';

  return (
    <View style={styles.root}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={styles.emptyStage}>
          <Text style={styles.emptyTitle}>Show {profile.dollName} something</Text>
          <Text style={styles.emptyBody}>
            In the app, this is your live camera. In this demo, pick a photo and {profile.dollName} reacts to it.
          </Text>
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="End call" onPress={() => router.back()} style={styles.iconBtn}>
          <Text style={styles.iconText}>✕</Text>
        </Pressable>
        <View style={styles.statusPill}>
          <Text style={styles.statusName} numberOfLines={1}>
            {profile.dollName}
          </Text>
          <Text style={styles.statusTimer}>{timer}</Text>
          <View style={styles.dot} />
          <Text style={styles.statusConn}>Demo</Text>
        </View>
        <View style={styles.iconSpacer} />
      </View>

      <View style={[styles.captions, { top: insets.top + 64 }]} pointerEvents="none">
        {heard ? (
          <View style={[styles.bubble, styles.bubbleMe]}>
            <Text style={styles.bubbleMeText}>{heard}</Text>
          </View>
        ) : null}
        {reply ? (
          <View style={[styles.bubble, styles.bubbleDoll]}>
            <Text style={styles.bubbleDollText}>{reply}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.bubble, styles.bubbleError]}>
            <Text style={styles.bubbleMeText}>{error}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.doll, { bottom: insets.bottom + 120 }]} pointerEvents="none">
        <PlushieAvatar source={profile.photoUri} size={120} emotion={emotion} isSpeaking={phase === 'speaking'} showBadge />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Show a photo" onPress={pickPhoto} style={styles.photoBtn}>
          <Text style={styles.photoIcon}>📷</Text>
        </Pressable>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={`Say something to ${profile.dollName}…`}
          placeholderTextColor="#999"
          style={styles.input}
          returnKeyType="send"
          onSubmitEditing={send}
          maxLength={500}
          editable={!busy}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={send}
          disabled={busy}
          style={[styles.sendBtn, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2B2230' },
  emptyStage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    backgroundColor: '#3A2E40',
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: 'rgba(255,255,255,0.75)', fontSize: 15, textAlign: 'center', marginTop: space.sm, maxWidth: 320 },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
  },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 44 },
  iconText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '62%',
  },
  statusName: { color: '#fff', fontWeight: '800', fontSize: 15, flexShrink: 1 },
  statusTimer: { color: 'rgba(255,255,255,0.85)', marginLeft: 8, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 10, marginRight: 5, backgroundColor: '#F6AD55' },
  statusConn: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  captions: { position: 'absolute', left: space.md, right: space.md, gap: space.sm },
  bubble: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '85%' },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  bubbleMeText: { color: '#fff', fontSize: 15 },
  bubbleDoll: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.92)' },
  bubbleDollText: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  bubbleError: { alignSelf: 'center', backgroundColor: 'rgba(229,72,77,0.85)' },
  doll: { position: 'absolute', right: space.md },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  photoBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center' },
  photoIcon: { fontSize: 22 },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#fff',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  sendBtn: { backgroundColor: colors.pinkDeep, borderRadius: radius.pill, paddingHorizontal: space.md, height: 48, justifyContent: 'center', minWidth: 72, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '800' },
});
