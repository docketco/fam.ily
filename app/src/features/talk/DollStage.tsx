import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { PlushieAvatar } from '@/features/doll/PlushieAvatar';
import type { DollEmotion } from '@/features/doll/pose';

/**
 * The doll on its little stage: a soft glow behind it that breathes while it talks.
 * `tone` picks a glow that reads on light (chat) or dark (call) backgrounds.
 */
export function DollStage({
  photoUri,
  cutout,
  emotion,
  speaking,
  size,
  tone = 'light',
  style,
}: {
  photoUri: string | null;
  cutout: boolean;
  emotion: DollEmotion;
  speaking: boolean;
  size: number;
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.set(
      speaking
        ? withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.35, { duration: 420 })), -1, true)
        : withTiming(0, { duration: 500 }),
    );
  }, [speaking, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * pulse.value,
    transform: [{ scale: 1 + 0.08 * pulse.value }],
  }));

  const glow = tone === 'dark' ? ['rgba(240,140,168,0.10)', 'rgba(240,140,168,0.16)', 'rgba(240,140,168,0.24)'] : ['#FDF0F3', '#FBE6EC', '#F8D8E2'];
  const d = size * 1.25;

  return (
    <View style={[{ width: d, height: d * 1.02 }, styles.root, style]}>
      <Animated.View style={[styles.glowWrap, { width: d, height: d }, glowStyle]}>
        {glow.map((c, i) => {
          const s = d * (1 - i * 0.18);
          return <View key={c} style={[styles.ring, { width: s, height: s, borderRadius: s / 2, backgroundColor: c }]} />;
        })}
      </Animated.View>
      <PlushieAvatar source={photoUri} cutout={cutout} emotion={emotion} isSpeaking={speaking} size={size} showBadge />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  glowWrap: { position: 'absolute', top: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
});
