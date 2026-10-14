import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Title } from '@/components/ui';
import { PlushieAvatar } from '@/features/doll/PlushieAvatar';
import type { Health } from '@/lib/api';
import { IS_DEMO } from '@/lib/demo-api';
import { useProfile } from '@/lib/profile-store';
import { colors, radius, space } from '@/lib/theme';

export default function HomeScreen() {
  const { profile, api, apiUrl } = useProfile();
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

  const status = IS_DEMO
    ? health !== null && health !== 'offline' && health.llm_provider !== 'fallback'
      ? { text: 'Demo: replies and art come from Claude, voice from your device', color: '#2F855A' }
      : { text: 'Demo with sample replies', color: '#B7791F' }
    : health === null
      ? { text: 'Checking connection…', color: colors.inkSoft }
      : health === 'offline'
        ? { text: `Server unreachable at ${apiUrl}`, color: colors.danger }
        : health.llm_provider === 'fallback'
          ? { text: 'Connected (demo replies: no AI key on server)', color: '#B7791F' }
          : { text: 'Connected', color: '#2F855A' };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
      <Title>Hi, I&apos;m {profile.dollName}!</Title>
      {profile.relationship ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {profile.relationship}
        </Text>
      ) : null}
      {!profile.acceptedTermsAt && (
        <Text style={styles.notice} onPress={() => router.push('/setup')}>
          Please review and confirm your doll in setup before calling.
        </Text>
      )}

      <View style={styles.stage}>
        <PlushieAvatar source={profile.photoUri} size={200} emotion="idle" />
      </View>

      <View style={[styles.statusPill]}>
        <View style={[styles.dot, { backgroundColor: status.color }]} />
        <Text style={styles.statusText} numberOfLines={2}>
          {status.text}
        </Text>
      </View>

      <Button
        title="Video call"
        icon="📹"
        onPress={() => router.push(profile.acceptedTermsAt ? '/call' : '/setup')}
        style={styles.cta}
      />
      <Button
        title="Wallpaper studio"
        icon="🖼️"
        variant="secondary"
        onPress={() => router.push('/studio')}
        style={styles.cta}
      />
      <Button title="Edit doll" variant="ghost" onPress={() => router.push('/setup')} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, alignItems: 'stretch' },
  subtitle: { color: colors.inkSoft, fontSize: 16, marginTop: 4 },
  notice: { color: colors.pinkDeep, fontSize: 14, marginTop: space.sm, fontWeight: '600' },
  stage: {
    marginVertical: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pinkSoft,
    borderRadius: radius.lg,
    paddingVertical: space.xl,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: '100%',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { color: colors.ink, fontSize: 13, flexShrink: 1 },
  cta: { marginBottom: space.sm },
});
