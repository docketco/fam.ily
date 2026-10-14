import { Image, type ImageSource } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

import { colors } from '@/lib/theme';

import { computePose, type DollEmotion, emotionHops, motionModeFor, type MotionMode } from './pose';

export interface PlushieAvatarProps {
  /** Background-removed PNG works best; any photo is shown inside a soft round frame. */
  source: ImageSource | string | number | null;
  emotion?: DollEmotion;
  isSpeaking?: boolean;
  size?: number;
  showShadow?: boolean;
  /** Set when the image already has a transparent background, to drop the round frame. */
  transparent?: boolean;
  /** Override the motion (the wallpaper studio uses 'loop5' for a seamless 5 s loop). */
  mode?: MotionMode;
  /** External clock in seconds. When given, the avatar does not run its own (used for frame export). */
  clock?: SharedValue<number>;
  /** Small emoji badge reacting to the emotion. */
  showBadge?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BADGES: Partial<Record<DollEmotion, string>> = {
  happy: '💗',
  surprised: '❗',
  teasing: '😏',
  sleepy: '💤',
  thinking: '💭',
};

/**
 * Animated 2.5D plushie. Idle: breathing bob + tilt. Speaking: bouncy bob with a scale pulse.
 * Happy/surprised: a quick double hop, then back to idle. Lightweight: one frame callback,
 * transforms only, everything runs on the UI thread.
 */
export function PlushieAvatar({
  source,
  emotion = 'idle',
  isSpeaking = false,
  size = 140,
  showShadow = true,
  transparent = false,
  mode,
  clock,
  showBadge = false,
  style,
}: PlushieAvatarProps) {
  const ownClock = useSharedValue(0);
  const hopStart = useSharedValue(-10);
  const motion = useSharedValue<MotionMode>(mode ?? motionModeFor(emotion, isSpeaking));
  const runOwnClock = !clock;

  const frame = useFrameCallback((info) => {
    ownClock.value += (info.timeSincePreviousFrame ?? 16) / 1000;
  }, runOwnClock);

  useEffect(() => {
    frame.setActive(runOwnClock);
  }, [frame, runOwnClock]);

  useEffect(() => {
    motion.set(mode ?? motionModeFor(emotion, isSpeaking));
  }, [mode, emotion, isSpeaking, motion]);

  useEffect(() => {
    if (emotionHops(emotion)) hopStart.set((clock ?? ownClock).get());
  }, [emotion, clock, ownClock, hopStart]);

  const bodyStyle = useAnimatedStyle(() => {
    const t = clock ? clock.value : ownClock.value;
    const p = computePose(motion.value, t, t - hopStart.value);
    return {
      transform: [
        { translateY: p.translateY },
        { rotate: `${p.rotateDeg}deg` },
        { scaleX: p.scaleX },
        { scaleY: p.scaleY },
      ],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const t = clock ? clock.value : ownClock.value;
    const p = computePose(motion.value, t, t - hopStart.value);
    return { opacity: p.shadowOpacity, transform: [{ scaleX: p.shadowScale }, { scaleY: p.shadowScale }] };
  });

  const imageSource = useMemo(() => (typeof source === 'string' ? { uri: source } : source), [source]);
  const badge = showBadge ? BADGES[emotion] : undefined;

  return (
    <View style={[{ width: size, height: size * 1.12 }, styles.root, style]} pointerEvents="box-none">
      {showShadow && (
        <Animated.View
          style={[
            styles.shadow,
            { width: size * 0.56, height: size * 0.08, borderRadius: size, bottom: size * 0.03 },
            shadowStyle,
          ]}
        />
      )}
      <Animated.View style={[{ width: size, height: size }, styles.body, bodyStyle]}>
        {imageSource ? (
          <Image
            source={imageSource}
            contentFit={transparent ? 'contain' : 'cover'}
            style={[
              { width: size, height: size },
              !transparent && { borderRadius: size / 2, borderWidth: size * 0.035, borderColor: '#fff' },
            ]}
            transition={150}
          />
        ) : (
          <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={{ fontSize: size * 0.45 }}>🧸</Text>
          </View>
        )}
        {badge && (
          <View style={[styles.badge, { right: -size * 0.04, top: -size * 0.04 }]}>
            <Text style={{ fontSize: Math.max(14, size * 0.16) }}>{badge}</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'flex-start' },
  body: { alignItems: 'center', justifyContent: 'center' },
  shadow: { position: 'absolute', backgroundColor: '#000' },
  placeholder: { backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
