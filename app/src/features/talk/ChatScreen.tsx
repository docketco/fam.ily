import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toDollEmotion } from '@/features/call/emotion';
import type { DollEmotion } from '@/features/doll/pose';
import { type Message, useConversation } from '@/lib/conversation';
import { toPersonaConfig } from '@/lib/profile';
import { useProfile } from '@/lib/profile-store';
import { colors, radius, space, type } from '@/lib/theme';

import { DollStage } from './DollStage';
import { useDollVoice } from './useDollVoice';

/** Text chat with the doll. It reacts on its stage above the conversation as it answers. */
export function ChatScreen() {
  const { profile, api } = useProfile();
  const { messages, add, recentHistory } = useConversation();
  const insets = useSafeAreaInsets();
  const voice = useDollVoice();

  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [emotion, setEmotion] = useState<DollEmotion>('idle');
  const [voiceOn, setVoiceOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);
  const greeted = useRef(false);

  async function ask(text: string) {
    if (!profile) return;
    setWaiting(true);
    setEmotion('thinking');
    setError(null);
    const history = recentHistory();
    if (text) add({ role: 'user', text, via: 'chat' });
    try {
      const res = await api.react({ persona: toPersonaConfig(profile), mode: 'chat', userSpeechText: text, history });
      const feeling = toDollEmotion(res.emotion);
      add({ role: 'doll', text: res.spoken_text, via: 'chat', emotion: feeling });
      setEmotion(feeling);
      if (voiceOn) voice.speak(res.spoken_text, res.audio_base64, res.audio_mime_type);
    } catch (err) {
      setError((err as Error).message || 'Something went wrong');
      setEmotion('idle');
    } finally {
      setWaiting(false);
    }
  }

  // The doll says hi the first time you open an empty chat.
  useEffect(() => {
    if (profile && !greeted.current && messages.length === 0) {
      greeted.current = true;
      ask('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (messages.length) requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  }, [messages.length, waiting]);

  if (!profile) return null;

  function send() {
    const text = draft.trim();
    if (!text || waiting) return;
    setDraft('');
    voice.stop();
    ask(text);
  }

  const status = waiting ? 'typing…' : voice.speaking ? 'talking…' : 'here for you';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>‹</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.dollName}
          </Text>
          <Text style={styles.status}>{status}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Read replies aloud"
          accessibilityState={{ checked: voiceOn }}
          onPress={() => {
            if (voiceOn) voice.stop();
            setVoiceOn((v) => !v);
          }}
          style={[styles.headerBtn, voiceOn && styles.headerBtnOn]}>
          <Text style={styles.headerSmall}>{voiceOn ? '🔊' : '🔈'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Start a voice call" onPress={() => router.replace('/call')} style={styles.headerBtn}>
          <Text style={styles.headerSmall}>📞</Text>
        </Pressable>
      </View>

      <DollStage
        photoUri={profile.photoUri}
        cutout={profile.photoIsCutout}
        emotion={waiting ? 'thinking' : emotion}
        speaking={voice.speaking}
        size={150}
        style={styles.stage}
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={list}
          style={styles.flex}
          contentContainerStyle={styles.list}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <Bubble message={item} />}
          ListFooterComponent={
            <>
              {waiting && (
                <View style={[styles.bubble, styles.dollBubble, styles.typing]}>
                  <ActivityIndicator size="small" color={colors.pinkDeep} />
                </View>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          }
        />
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${profile.dollName}`}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
            multiline
            maxLength={800}
            onSubmitEditing={send}
            blurOnSubmit
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={send}
            disabled={!draft.trim() || waiting}
            style={[styles.send, (!draft.trim() || waiting) && styles.sendOff]}>
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ message }: { message: Message }) {
  const mine = message.role === 'user';
  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      <View style={[styles.bubble, mine ? styles.userBubble : styles.dollBubble]}>
        <Text style={[styles.bubbleText, mine && styles.userText]}>{message.text}</Text>
      </View>
      {message.via !== 'chat' && <Text style={[styles.via, mine && styles.viaMine]}>{message.via === 'camera' ? 'on video' : 'on a call'}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.xs, gap: space.xs },
  headerBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerBtnOn: { backgroundColor: colors.pinkSoft },
  headerIcon: { fontSize: 32, color: colors.ink, marginTop: -4 },
  headerSmall: { fontSize: 19 },
  headerTitle: { flex: 1, alignItems: 'center' },
  name: { ...type.title, color: colors.ink },
  status: { ...type.caption, color: colors.inkSoft },
  stage: { alignSelf: 'center', marginTop: -space.sm },
  list: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  row: { alignItems: 'flex-start' },
  rowMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingHorizontal: 15, paddingVertical: 10 },
  dollBubble: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  userBubble: { backgroundColor: colors.pinkDeep, borderBottomRightRadius: 6 },
  bubbleText: { ...type.body, color: colors.ink },
  userText: { color: '#fff' },
  typing: { alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 18 },
  via: { ...type.caption, color: colors.inkSoft, marginTop: 2, marginLeft: 6 },
  viaMine: { marginRight: 6 },
  error: { color: colors.danger, textAlign: 'center', marginTop: space.sm },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minWidth: 0,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
    color: colors.ink,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: -2 },
});
