import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { meteringToLevel } from './metering';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const FACTORS = [0.55, 0.85, 1, 0.8, 0.6, 0.9, 0.5];

function Bar({ level, factor, index }: { level: SharedValue<number>; factor: number; index: number }) {
  const style = useAnimatedStyle(() => {
    // A little per-bar wobble so silence still looks alive.
    const wobble = 0.12 * Math.abs(Math.sin(Date.now() / 140 + index));
    return { height: withTiming(6 + 38 * Math.min(1, level.value * factor + wobble), { duration: 90 }) };
  });
  return <Animated.View style={[styles.bar, style]} />;
}

export function VoiceWave({ metering }: { metering: number | undefined }) {
  const level = useSharedValue(0.15);
  useEffect(() => {
    level.set(meteringToLevel(metering));
  }, [metering, level]);
  return (
    <View style={styles.row} accessibilityLabel="Recording">
      {FACTORS.map((f, i) => (
        <Bar key={i} level={level} factor={f} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 48, gap: 5 },
  bar: { width: 6, borderRadius: 3, backgroundColor: '#fff' },
});
