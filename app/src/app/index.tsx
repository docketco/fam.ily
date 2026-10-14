import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DollStage } from '@/features/talk/DollStage';
import type { Health } from '@/lib/api';
import { useConversation } from '@/lib/conversation';
import { IS_DEMO } from '@/lib/demo-api';
import { useProfile } from '@/lib/profile-store';
import { colors, radius, space, type } from '@/lib/theme';

export default function HomeScreen() {
  const { profile, api, apiUrl } = useProfile();
  const { messages } = useConversation();
  const insets = useSafeAreaInsets();
  const [health, setHealth] = useState<Health | null | 'offline'>(null);

  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth('offline'));
    return () => {
      alive = false;
    };
  }, [api]);

  if (!profile) return null;

  const lastLine = [...messages].reverse().find((m) => m.role === 'doll');
  const ready = !!profile.acceptedTermsAt;
  const go = (path: '/chat' | '/call') => router.push(ready ? path : '/setup');

  const status =
    health === null
      ? null
      : health === 'offline'
        ? { text: `Can’t reach the server at ${apiUrl}`, color: colors.danger }
        : health.llm_provider === 'fallback'
          ? { text: IS_DEMO ? 'Demo with sample replies' : 'Demo replies (no AI key on the server yet)', color: '#B7791F' }
          : IS_DEMO
            ? { text: 'Demo · AI by Claude, voice by your device', color: colors.success }
            : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.topRow}>
        <Text style={styles.brand}>fam.ily</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit doll" onPress={() => router.push('/setup')} style={styles.edit}>
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      </View>

      <DollStage
        photoUri={profile.photoUri}
        cutout={profile.photoIsCutout}
        emotion={lastLine?.emotion ?? 'idle'}
        speaking={false}
        size={210}
        style={styles.stage}
      />

      <Text style={styles.name}>{profile.dollName}</Text>
      {profile.relationship ? (
        <Text style={styles.relationship} numberOfLines={2}>
          {profile.relationship}
        </Text>
      ) : null}

      {lastLine ? (
        <View style={styles.lastLine}>
          <Text style={styles.lastLineText} numberOfLines={3}>
            “{lastLine.text}”
          </Text>
        </View>
      ) : null}

      {!ready && (
        <Text style={styles.notice} onPress={() => router.push('/setup')}>
          Confirm your doll in setup to start talking.
        </Text>
      )}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => go('/chat')} style={({ pressed }) => [styles.action, styles.actionChat, pressed && styles.pressed]}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionTitle}>Chat</Text>
          <Text style={styles.actionSub}>Text each other</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => go('/call')} style={({ pressed }) => [styles.action, styles.actionCall, pressed && styles.pressed]}>
          <Text style={styles.actionIcon}>📞</Text>
          <Text style={[styles.actionTitle, styles.onDark]}>Call</Text>
          <Text style={[styles.actionSub, styles.onDarkSoft]}>Talk out loud</Text>
        </Pressable>
      </View>

      {status ? (
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: status.color }]} />
          <Text style={styles.statusText} numberOfLines={2}>
            {status.text}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, alignItems: 'stretch' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { ...type.caption, fontWeight: '800', letterSpacing: 1.2, color: colors.inkSoft, textTransform: 'uppercase' },
  edit: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  editText: { color: colors.ink, fontWeight: '700' },
  stage: { alignSelf: 'center', marginTop: space.md },
  name: { ...type.display, color: colors.ink, textAlign: 'center', marginTop: space.sm },
  relationship: { ...type.body, color: colors.inkSoft, textAlign: 'center', marginTop: space.xs },
  lastLine: { marginTop: space.lg, alignSelf: 'center', maxWidth: 420, paddingHorizontal: space.md },
  lastLineText: { ...type.body, color: colors.ink, fontStyle: 'italic', textAlign: 'center' },
  notice: { color: colors.pinkDeep, fontWeight: '700', textAlign: 'center', marginTop: space.md },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  action: { flex: 1, borderRadius: radius.xl, padding: space.lg, gap: 2 },
  actionChat: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  actionCall: { backgroundColor: colors.plum },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  actionIcon: { fontSize: 26, marginBottom: space.sm },
  actionTitle: { ...type.title, color: colors.ink },
  actionSub: { ...type.caption, color: colors.inkSoft },
  onDark: { color: colors.onPlum },
  onDarkSoft: { color: colors.onPlumSoft },
  status: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: space.lg, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { ...type.caption, color: colors.inkSoft, flexShrink: 1 },
});
