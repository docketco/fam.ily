import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { LOOP_SECONDS } from '@/features/doll/pose';
import type { SceneEffect } from '@/lib/api';

export const EFFECTS: { id: SceneEffect; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'rain', label: '🌧️ Rain' },
  { id: 'snow', label: '❄️ Snow' },
  { id: 'sparkle', label: '✨ Sparkle' },
  { id: 'petals', label: '🌸 Petals' },
  { id: 'steam', label: '♨️ Mist' },
];

const TAU = Math.PI * 2;

/** Fractional phase that repeats a whole number of times per loop, so exports loop seamlessly. */
function phase(t: number, cycles: number, offset: number) {
  'worklet';
  const p = (t / LOOP_SECONDS) * cycles + offset;
  return p - Math.floor(p);
}

type P = { clock: SharedValue<number>; x: number; offset: number; h: number };

function RainDrop({ clock, x, offset, h }: P) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: phase(clock.value, 4, offset) * (h + 40) - 30 }] }));
  return <Animated.View style={[styles.drop, { left: `${x}%` }, style]} />;
}

function SnowFlake({ clock, x, offset, h }: P) {
  const style = useAnimatedStyle(() => {
    const p = phase(clock.value, 1, offset);
    return { transform: [{ translateY: p * (h + 20) - 10 }, { translateX: 8 * Math.sin(TAU * (p * 2 + offset)) }] };
  });
  return <Animated.View style={[styles.flake, { left: `${x}%`, opacity: 0.6 + 0.4 * offset }, style]} />;
}

function Petal({ clock, x, offset, h }: P) {
  const style = useAnimatedStyle(() => {
    const p = phase(clock.value, 1, offset);
    return {
      transform: [
        { translateY: p * (h + 30) - 15 },
        { translateX: 14 * Math.sin(TAU * (p * 2 + offset)) },
        { rotate: `${360 * p * 2}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.petal, { left: `${x}%` }, style]} />;
}

function Sparkle({ clock, x, offset, y }: P & { y: number }) {
  const style = useAnimatedStyle(() => {
    const s = 0.5 + 0.5 * Math.sin(TAU * phase(clock.value, 2, offset));
    return { opacity: s, transform: [{ scale: 0.4 + 0.8 * s }, { rotate: '45deg' }] };
  });
  return <Animated.View style={[styles.sparkle, { left: `${x}%`, top: `${y}%` }, style]} />;
}

function Mist({ clock, x, offset, h }: P) {
  const style = useAnimatedStyle(() => {
    const p = phase(clock.value, 1, offset);
    return {
      opacity: Math.sin(Math.PI * p) * 0.45,
      transform: [{ translateY: -h * 0.35 * p }, { translateX: 10 * Math.sin(TAU * p) }, { scale: 0.6 + 1.2 * p }],
    };
  });
  return <Animated.View style={[styles.mist, { left: `${x}%` }, style]} />;
}

// Deterministic pseudo-random layout (same every render, so frames are reproducible).
const spread = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => ({ x: ((i * 37 + seed * 11) % 94) + 2, offset: ((i * 0.618 + seed * 0.1) % 1 + 1) % 1 }));
const RAIN = spread(26, 1);
const SNOW = spread(22, 2);
const PETALS = spread(12, 3);
const SPARKLES = spread(14, 4).map((s, i) => ({ ...s, y: ((i * 53) % 80) + 5 }));
const MIST = spread(7, 5);

export function SceneEffects({ effect, clock, height }: { effect: SceneEffect; clock: SharedValue<number>; height: number }) {
  if (effect === 'none') return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {effect === 'rain' && RAIN.map((d, i) => <RainDrop key={i} clock={clock} x={d.x} offset={d.offset} h={height} />)}
      {effect === 'snow' && SNOW.map((d, i) => <SnowFlake key={i} clock={clock} x={d.x} offset={d.offset} h={height} />)}
      {effect === 'petals' && PETALS.map((d, i) => <Petal key={i} clock={clock} x={d.x} offset={d.offset} h={height} />)}
      {effect === 'sparkle' && SPARKLES.map((d, i) => <Sparkle key={i} clock={clock} x={d.x} y={d.y} offset={d.offset} h={height} />)}
      {effect === 'steam' && MIST.map((d, i) => <Mist key={i} clock={clock} x={d.x} offset={d.offset} h={height} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { position: 'absolute', top: 0, width: 1.5, height: 16, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.65)' },
  flake: { position: 'absolute', top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  petal: { position: 'absolute', top: 0, width: 9, height: 6, borderRadius: 6, borderTopLeftRadius: 1, backgroundColor: '#FFC1D6' },
  sparkle: { position: 'absolute', width: 7, height: 7, borderRadius: 1.5, backgroundColor: '#FFF8D6' },
  mist: { position: 'absolute', bottom: '8%', width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.9)' },
});
