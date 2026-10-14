import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toDollEmotion } from '@/features/call/emotion';
import { useCallTimer } from '@/features/call/useCallTimer';
import { VoiceWave } from '@/features/call/VoiceWave';
import type { DollEmotion } from '@/features/doll/pose';
import type { LocalFile } from '@/lib/api';
import { deleteQuietly } from '@/lib/audio';
import { useConversation } from '@/lib/conversation';
import { toPersonaConfig } from '@/lib/profile';
import { useProfile } from '@/lib/profile-store';
import { colors, radius, space, type } from '@/lib/theme';

import { DollStage } from './DollStage';
import { useDollVoice } from './useDollVoice';
import { usePushToTalk } from './usePushToTalk';

// A web page can't use the microphone (the browser demo), so there you type instead.
const CAN_RECORD = Platform.OS !== 'web';

/** Voice call: no camera, just you and the doll talking. It answers out loud and acts it out. */
export function VoiceCallScreen() {
  const { profile, api } = useProfile();
  const { add, recentHistory } = useConversation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const timer = useCallTimer();
  const voice = useDollVoice();
  const ptt = usePushToTalk();

  const [thinking, setThinking] = useState(false);
  const [emotion, setEmotion] = useState<DollEmotion>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const greeted = useRef(false);

  async function turn(text: string, audio?: LocalFile) {
    if (!profile) return;
    setThinking(true);
    setEmotion('thinking');
    setNote(null);
    setHeard(text);
    const history = recentHistory();
    try {
      const res = await api.react({ persona: toPersonaConfig(profile), mode: 'call', userSpeechText: text, userAudio: audio, history });
      const said = (res.heard_text || text).trim();
      if (said) add({ role: 'user', text: said, via: 'call' });
      const feeling = toDollEmotion(res.emotion);
      add({ role: 'doll', text: res.spoken_text, via: 'call', emotion: feeling });
      setHeard(said);
      setReply(res.spoken_text);
      setEmotion(feeling);
      voice.speak(res.spoken_text, res.audio_base64, res.audio_mime_type);
    } catch (err) {
      setNote((err as Error).message || 'The line dropped. Try again.');
      setEmotion('idle');
    } finally {
      setThinking(false);
      deleteQuietly(audio?.uri);
    }
  }

  // Like picking up the phone: the doll says hello first.
  useEffect(() => {
    if (profile && !greeted.current) {
      greeted.current = true;
      turn('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (!profile) return null;

  function onPressIn() {
    if (thinking) return;
    voice.stop();
    setNote(null);
    ptt.start();
  }

  async function onPressOut() {
    if (!ptt.recording) return;
    const result = await ptt.finish();
    if (result.kind === 'audio') turn('', result.file);
    else if (result.kind === 'too-short') setNote('Hold the button while you talk');
    else setNote(result.message);
  }

  function sendTyped() {
    const text = typed.trim();
    if (!text || thinking) return;
    setTyped('');
    voice.stop();
    turn(text);
  }

  const status = thinking ? 'listening…' : voice.speaking ? 'talking' : ptt.recording ? 'you’re talking' : timer;
  const dollSize = Math.min(260, height * 0.3);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>
          {profile.dollName}
        </Text>
        <Text style={styles.status}>{status}</Text>
      </View>

      <View style={styles.center}>
        <DollStage
          photoUri={profile.photoUri}
          cutout={profile.photoIsCutout}
          emotion={thinking ? 'thinking' : emotion}
          speaking={voice.speaking}
          size={dollSize}
          tone="dark"
        />
        <View style={styles.captions}>
          {reply ? <Text style={styles.reply}>{reply}</Text> : null}
          {heard ? <Text style={styles.heard}>You: {heard}</Text> : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!CAN_RECORD && (
          <View style={styles.typeRow}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Type what you’d say out loud…"
              placeholderTextColor={colors.onPlumSoft}
              style={styles.typeInput}
              returnKeyType="send"
              onSubmitEditing={sendTyped}
              maxLength={500}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Say it" onPress={sendTyped} disabled={thinking} style={styles.typeSend}>
              {thinking ? <ActivityIndicator color="#fff" /> : <Text style={styles.typeSendText}>Say</Text>}
            </Pressable>
          </View>
        )}
        {CAN_RECORD && (
          <Pressable accessibilityRole="button" accessibilityLabel="Show something on camera" onPress={() => router.push('/camera')} style={styles.cameraLink}>
            <Text style={styles.cameraLinkText}>📷 Show {profile.dollName} something</Text>
          </Pressable>
        )}
        <View style={[styles.controls, { paddingBottom: insets.bottom + space.lg }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open chat" onPress={() => router.replace('/chat')} style={styles.side}>
            <Text style={styles.sideIcon}>💬</Text>
            <Text style={styles.sideLabel}>Chat</Text>
          </Pressable>

          {CAN_RECORD ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hold to talk"
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              disabled={thinking}
              style={[styles.talk, ptt.recording && styles.talkOn, thinking && styles.talkBusy]}>
              {ptt.recording ? (
                <VoiceWave metering={ptt.metering} />
              ) : thinking ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <Text style={styles.talkIcon}>🎙️</Text>
              )}
            </Pressable>
          ) : (
            <View style={styles.talkSpacer} />
          )}

          <Pressable accessibilityRole="button" accessibilityLabel="End call" onPress={() => router.back()} style={styles.side}>
            <View style={styles.end}>
              <Text style={styles.endIcon}>✕</Text>
            </View>
            <Text style={styles.sideLabel}>End</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.plum },
  top: { alignItems: 'center', gap: 2 },
  name: { ...type.title, color: colors.onPlum },
  status: { ...type.caption, color: colors.onPlumSoft, fontVariant: ['tabular-nums'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  captions: { minHeight: 96, marginTop: space.md, alignItems: 'center', gap: space.sm, maxWidth: 420 },
  reply: { color: colors.onPlum, fontSize: 19, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  heard: { color: colors.onPlumSoft, fontSize: 14, textAlign: 'center' },
  note: { color: colors.pink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  typeRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, marginBottom: space.md },
  typeInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.plumSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.plumLine,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.onPlum,
  },
  typeSend: { backgroundColor: colors.pinkDeep, borderRadius: radius.pill, paddingHorizontal: space.lg, justifyContent: 'center', minWidth: 70, alignItems: 'center' },
  typeSendText: { color: '#fff', fontWeight: '800' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: space.lg },
  side: { alignItems: 'center', gap: 6, width: 72 },
  sideIcon: { fontSize: 24, width: 56, height: 56, borderRadius: 28, textAlign: 'center', lineHeight: 56, backgroundColor: colors.plumSoft, overflow: 'hidden' },
  sideLabel: { ...type.caption, color: colors.onPlumSoft },
  end: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  endIcon: { color: '#fff', fontSize: 22, fontWeight: '800' },
  talk: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.pinkDeep,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  talkOn: { transform: [{ scale: 1.1 }], borderColor: 'rgba(255,255,255,0.6)' },
  talkBusy: { opacity: 0.6 },
  talkIcon: { fontSize: 34 },
  talkSpacer: { width: 92 },
  cameraLink: { alignSelf: 'center', marginBottom: space.md, padding: space.sm },
  cameraLinkText: { color: colors.onPlumSoft, fontWeight: '600' },
});
