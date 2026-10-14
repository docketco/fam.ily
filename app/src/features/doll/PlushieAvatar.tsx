import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { colors } from '@/lib/theme';

import { computePose, type DollEmotion, emotionHops, motionModeFor, type MotionMode } from './pose';

export interface PlushieAvatarProps {
  /** Photo of the plushie: ideally its cutout (transparent PNG), otherwise any photo. */
  source: string | null;
  /** True when `source` is a cutout; the doll then stands on screen with no frame around it. */
  cutout?: boolean;
  emotion?: DollEmotion;
  isSpeaking?: boolean;
  size?: number;
  showShadow?: boolean;
  /** Small floating badge that names the feeling (heart, tear, huff…). */
  showBadge?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BADGES: Partial<Record<DollEmotion, string>> = {
  happy: '✨',
  loving: '💕',
  surprised: '❗',
  teasing: '😏',
  sleepy: '💤',
  sad: '💧',
  pouty: '💢',
  thinking: '💭',
};

/**
 * Animated 2.5D plushie. Every emotion has its own body language (sway, droop, huff, tilt),
 * talking layers a bounce on top, and happy/surprised/loving start with a double hop.
 * Transforms only, driven on the UI thread by one frame callback.
 */
export function PlushieAvatar({
  source,
  cutout = false,
  emotion = 'idle',
  isSpeaking = false,
  size = 140,
  showShadow = true,
  showBadge = false,
  style,
}: PlushieAvatarProps) {
  const clock = useSharedValue(0);
  const hopStart = useSharedValue(-10);
  const motion = useSharedValue<MotionMode>(motionModeFor(emotion));
  const speaking = useSharedValue(isSpeaking);

  useFrameCallback((info) => {
    clock.value += (info.timeSincePreviousFrame ?? 16) / 1000;
  });

  useEffect(() => {
    motion.set(motionModeFor(emotion));
    if (emotionHops(emotion)) hopStart.set(clock.get());
  }, [emotion, motion, hopStart, clock]);

  useEffect(() => {
    speaking.set(isSpeaking);
  }, [isSpeaking, speaking]);

  const bodyStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const p = computePose(motion.value, t, t - hopStart.value, speaking.value);
    return {
      transform: [
        { translateX: p.translateX },
        { translateY: p.translateY },
        { rotate: `${p.rotateDeg}deg` },
        { scaleX: p.scaleX },
        { scaleY: p.scaleY },
      ],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const p = computePose(motion.value, t, t - hopStart.value, speaking.value);
    return { opacity: p.shadowOpacity, transform: [{ scaleX: p.shadowScale }, { scaleY: p.shadowScale }] };
  });

  const badge = showBadge ? BADGES[emotion] : undefined;

  return (
    <View style={[{ width: size, height: size * 1.1 }, styles.root, style]} pointerEvents="box-none">
      {showShadow && (
        // A soft contact shadow: stacked ellipses (circles squashed flat) fading outward.
        <Animated.View style={[styles.shadowWrap, { width: size * 0.7, height: size * 0.12, bottom: 0 }, shadowStyle]}>
          {[1, 0.78, 0.56].map((k) => (
            <View
              key={k}
              style={[
                styles.shadow,
                { width: size * 0.7 * k, height: size * 0.7 * k, borderRadius: size, transform: [{ scaleY: 0.16 / k }] },
              ]}
            />
          ))}
        </Animated.View>
      )}
      <Animated.View style={[{ width: size, height: size }, styles.body, bodyStyle]}>
        {source ? (
          <Image
            source={{ uri: source }}
            contentFit={cutout ? 'contain' : 'cover'}
            style={[
              { width: size, height: size },
              !cutout && { borderRadius: size / 2, borderWidth: size * 0.035, borderColor: '#fff' },
            ]}
            transition={150}
          />
        ) : (
          <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={{ fontSize: size * 0.45 }}>🧸</Text>
          </View>
        )}
        {badge && (
          <View style={[styles.badge, { right: size * 0.02, top: size * 0.02 }]}>
            <Text style={{ fontSize: Math.max(14, size * 0.13) }}>{badge}</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'flex-start' },
  body: { alignItems: 'center', justifyContent: 'center' },
  shadowWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  shadow: { position: 'absolute', backgroundColor: 'rgba(42,26,36,0.13)' },
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
