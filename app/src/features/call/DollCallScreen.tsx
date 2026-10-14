import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { PlushieAvatar } from '@/features/doll/PlushieAvatar';
import type { DollEmotion } from '@/features/doll/pose';
import { ApiError, type LocalFile } from '@/lib/api';
import { deleteQuietly, writeAudioToCache } from '@/lib/audio';
import { useConversation } from '@/lib/conversation';
import { toPersonaConfig } from '@/lib/profile';
import { useProfile } from '@/lib/profile-store';
import { colors, radius, space } from '@/lib/theme';

import { toDollEmotion } from './emotion';
import { useCallTimer } from './useCallTimer';
import { VoiceWave } from './VoiceWave';

type Phase = 'idle' | 'recording' | 'thinking' | 'speaking';
type Connection = 'connecting' | 'online' | 'demo' | 'offline';

const MIN_RECORDING_SECONDS = 0.5;
const SNAPSHOT_WIDTH = 1024;

export function DollCallScreen() {
  const { profile, api } = useProfile();
  const { add, recentHistory } = useConversation();
  const insets = useSafeAreaInsets();
  const timer = useCallTimer();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [emotion, setEmotion] = useState<DollEmotion>('idle');
  const [connection, setConnection] = useState<Connection>('connecting');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  const pressing = useRef(false);
  const startPromise = useRef<Promise<boolean> | null>(null);
  const replyFile = useRef<string | null>(null);
  const mounted = useRef(true);

  // ---- connection status ------------------------------------------------------------------
  useEffect(() => {
    mounted.current = true;
    api
      .health()
      .then((h) => mounted.current && setConnection(h.llm_provider === 'fallback' ? 'demo' : 'online'))
      .catch(() => mounted.current && setConnection('offline'));
    return () => {
      mounted.current = false;
    };
  }, [api]);

  // ---- playback lifecycle -------------------------------------------------------------------
  const finishSpeaking = useCallback(() => {
    if (!mounted.current) return;
    setPhase((p) => (p === 'speaking' ? 'idle' : p));
    setEmotion('idle');
  }, []);

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finishSpeaking();
    });
    return () => sub.remove();
  }, [player, finishSpeaking]);

  useEffect(
    () => () => {
      Speech.stop();
      deleteQuietly(replyFile.current);
    },
    [],
  );

  const stopSpeaking = useCallback(() => {
    player.pause();
    Speech.stop();
  }, [player]);

  // ---- recording ----------------------------------------------------------------------------
  async function startRecording(): Promise<boolean> {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError('Microphone access is off. Enable it in Settings, or tap the keyboard to type.');
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }

  function onPressIn() {
    if (phase === 'thinking') return;
    if (phase === 'speaking') stopSpeaking();
    pressing.current = true;
    setError(null);
    setPhase('recording');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    startPromise.current = startRecording().catch((err) => {
      setError(`Could not start recording: ${(err as Error).message}`);
      return false;
    });
  }

  async function onPressOut() {
    if (!pressing.current) return;
    pressing.current = false;
    const started = await startPromise.current;
    startPromise.current = null;
    if (!started) {
      setPhase('idle');
      return;
    }
    const seconds = recorder.currentTime;
    await recorder.stop().catch(() => {});
    const uri = recorder.uri;
    if (!uri || seconds < MIN_RECORDING_SECONDS) {
      deleteQuietly(uri);
      setPhase('idle');
      setError('Hold the button while you talk 🎙️');
      return;
    }
    await submit({ audio: { uri, name: 'question.m4a', type: 'audio/mp4' } });
  }

  // ---- the "show & ask" round trip --------------------------------------------------------------
  async function captureSnapshot(): Promise<LocalFile> {
    if (!cameraRef.current || !cameraReady) throw new Error('Camera is not ready yet');
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, shutterSound: false });
    const rendered = await ImageManipulator.manipulate(photo.uri).resize({ width: SNAPSHOT_WIDTH }).renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    deleteQuietly(photo.uri);
    return { uri: saved.uri, name: 'snapshot.jpg', type: 'image/jpeg' };
  }

  async function submit({ audio, text }: { audio?: LocalFile; text?: string }) {
    if (!profile) return;
    setPhase('thinking');
    setEmotion('thinking');
    setHeard(text ?? '');
    setReply('');
    let snapshot: LocalFile | null = null;
    try {
      snapshot = await captureSnapshot();
      const res = await api.react({
        persona: toPersonaConfig(profile),
        mode: 'camera',
        snapshot,
        userSpeechText: text,
        userAudio: audio,
        history: recentHistory(),
      });
      if (!mounted.current) return;
      const said = (res.heard_text || text || '').trim();
      if (said) add({ role: 'user', text: said, via: 'camera' });
      add({ role: 'doll', text: res.spoken_text, via: 'camera', emotion: toDollEmotion(res.emotion) });
      setConnection(res.provider === 'fallback' ? 'demo' : 'online');
      setHeard(res.heard_text || text || '');
      setReply(res.spoken_text);
      setEmotion(toDollEmotion(res.emotion));
      setPhase('speaking');
      await speak(res.spoken_text, res.audio_base64, res.audio_mime_type);
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === null) setConnection('offline');
      setError((err as Error).message || 'Something went wrong');
      setPhase('idle');
      setEmotion('idle');
    } finally {
      deleteQuietly(snapshot?.uri);
      deleteQuietly(audio?.uri);
    }
  }

  async function speak(text: string, audioBase64: string, mime: string) {
    // Leave record mode, otherwise iOS routes playback to the quiet earpiece.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!audioBase64) {
      Speech.speak(text, { pitch: 1.25, rate: 1.0, onDone: finishSpeaking, onStopped: finishSpeaking, onError: finishSpeaking });
      return;
    }
    deleteQuietly(replyFile.current);
    replyFile.current = writeAudioToCache(audioBase64, mime);
    player.replace({ uri: replyFile.current });
    player.play();
  }

  function sendTyped() {
    const text = typed.trim();
    if (!text || phase === 'thinking') return;
    setTyping(false);
    setTyped('');
    if (phase === 'speaking') stopSpeaking();
    submit({ text });
  }

  // ---- permissions ------------------------------------------------------------------------------
  if (!profile) return null;

  if (!cameraPermission) {
    return (
      <View style={[styles.center, { backgroundColor: '#000' }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg, padding: space.lg }]}>
        <PlushieAvatar source={profile.photoUri} cutout={profile.photoIsCutout} size={160} emotion="thinking" />
        <Text style={styles.permTitle}>{profile.dollName} wants to see your world</Text>
        <Text style={styles.permBody}>Camera access lets your doll react to whatever you show it during a call.</Text>
        <Button
          title={cameraPermission.canAskAgain ? 'Allow camera' : 'Open Settings'}
          onPress={() => (cameraPermission.canAskAgain ? requestCameraPermission() : Linking.openSettings())}
          style={{ alignSelf: 'stretch', marginTop: space.lg }}
        />
        <Button title="Not now" variant="ghost" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  const connectionLabel: Record<Connection, { text: string; color: string }> = {
    connecting: { text: 'Connecting…', color: '#F6E05E' },
    online: { text: 'Live', color: '#68D391' },
    demo: { text: 'Demo mode', color: '#F6AD55' },
    offline: { text: 'Offline', color: '#FC8181' },
  };
  const conn = connectionLabel[connection];
  const busy = phase === 'thinking';

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        animateShutter={false}
        onCameraReady={() => setCameraReady(true)}
        onMountError={(e) => setError(`Camera error: ${e.message}`)}
      />

      {/* ---- top status bar ---- */}
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="End call" onPress={() => router.back()} style={styles.iconBtn}>
          <Text style={styles.iconText}>✕</Text>
        </Pressable>
        <View style={styles.statusPill}>
          <Text style={styles.statusName} numberOfLines={1}>
            {profile.dollName}
          </Text>
          <Text style={styles.statusTimer}>{timer}</Text>
          <View style={[styles.dot, { backgroundColor: conn.color }]} />
          <Text style={styles.statusConn}>{conn.text}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Flip camera"
          onPress={() => {
            setCameraReady(false);
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
          }}
          style={styles.iconBtn}>
          <Text style={styles.iconText}>⟲</Text>
        </Pressable>
      </View>

      {/* ---- captions ---- */}
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

      {/* ---- doll overlay (bottom-right) ---- */}
      <View style={[styles.doll, { bottom: insets.bottom + 150 }]} pointerEvents="none">
        <PlushieAvatar source={profile.photoUri} cutout={profile.photoIsCutout} size={140} emotion={emotion} isSpeaking={phase === 'speaking'} showBadge />
      </View>

      {/* ---- text input overlay (testing / quiet places) ---- */}
      {typing && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.typingWrap}>
          <View style={[styles.typingBar, { paddingBottom: insets.bottom + space.sm }]}>
            <TextInput
              autoFocus
              value={typed}
              onChangeText={setTyped}
              placeholder={`Ask ${profile.dollName} about what you're showing…`}
              placeholderTextColor="#999"
              style={styles.typingInput}
              returnKeyType="send"
              onSubmitEditing={sendTyped}
              maxLength={500}
            />
            <Button title="Send" onPress={sendTyped} disabled={!typed.trim() || busy} style={{ minHeight: 44 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close keyboard" onPress={() => setTyping(false)} style={{ padding: space.sm }}>
              <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ---- push-to-talk ---- */}
      {!typing && (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.hint}>
            {phase === 'recording'
              ? 'Listening… release to send'
              : busy
                ? `${profile.dollName} is looking…`
                : phase === 'speaking'
                  ? 'Hold to interrupt'
                  : 'Hold to show & ask'}
          </Text>
          <View style={styles.controls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Type a message" onPress={() => setTyping(true)} style={styles.sideBtn}>
              <Text style={styles.iconText}>⌨︎</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Push to talk"
              accessibilityHint="Hold while you speak, release to send what the camera sees"
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              disabled={busy}
              style={[styles.talkBtn, phase === 'recording' && styles.talkBtnActive, busy && { opacity: 0.6 }]}>
              {phase === 'recording' ? (
                <VoiceWave metering={recorderState.metering} />
              ) : busy ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <Text style={styles.micIcon}>🎙️</Text>
              )}
            </Pressable>
            <View style={styles.sideBtn} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: space.lg },
  permBody: { fontSize: 15, color: colors.inkSoft, textAlign: 'center', marginTop: space.sm },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 10, marginRight: 5 },
  statusConn: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  captions: { position: 'absolute', left: space.md, right: space.md, gap: space.sm },
  bubble: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '85%' },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  bubbleMeText: { color: '#fff', fontSize: 15 },
  bubbleDoll: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.92)' },
  bubbleDollText: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  bubbleError: { alignSelf: 'center', backgroundColor: 'rgba(229,72,77,0.85)' },
  doll: { position: 'absolute', right: space.md },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  hint: {
    color: '#fff',
    fontWeight: '700',
    marginBottom: space.md,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: space.xl },
  sideBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.pinkDeep,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  talkBtnActive: { transform: [{ scale: 1.12 }], backgroundColor: '#FF5C8A' },
  micIcon: { fontSize: 38 },
  typingWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  typingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  typingInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
});
