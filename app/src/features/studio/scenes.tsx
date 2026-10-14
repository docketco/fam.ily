import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { LOOP_SECONDS } from '@/features/doll/pose';

export type SceneId = 'bedroom' | 'cafe' | 'rain' | 'sunset';

export const SCENES: { id: SceneId; label: string; emoji: string }[] = [
  { id: 'bedroom', label: 'Pastel Bedroom', emoji: '🛏️' },
  { id: 'cafe', label: 'Coffee Shop', emoji: '☕' },
  { id: 'rain', label: 'Rainy Window', emoji: '🌧️' },
  { id: 'sunset', label: 'Sunset', emoji: '🌅' },
];

const TAU = Math.PI * 2;

/** Static illustrated backdrop, drawn in a 90x160 (9:16) coordinate space. */
export function SceneBackground({ scene }: { scene: SceneId }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="bedroomWall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBD3E9" />
          <Stop offset="1" stopColor="#E8D5FF" />
        </LinearGradient>
        <LinearGradient id="night" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2B2D6E" />
          <Stop offset="1" stopColor="#6A5ACD" />
        </LinearGradient>
        <LinearGradient id="cafeWall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F3E1C7" />
          <Stop offset="1" stopColor="#D9B48F" />
        </LinearGradient>
        <LinearGradient id="rainSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5D6D7E" />
          <Stop offset="1" stopColor="#A9B8C9" />
        </LinearGradient>
        <LinearGradient id="sunsetSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6A4C93" />
          <Stop offset="0.45" stopColor="#F28482" />
          <Stop offset="0.7" stopColor="#F6BD60" />
          <Stop offset="1" stopColor="#F7D9A8" />
        </LinearGradient>
        <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E07A5F" />
          <Stop offset="1" stopColor="#3D405B" />
        </LinearGradient>
      </Defs>

      {scene === 'bedroom' && (
        <G>
          <Rect width="90" height="160" fill="url(#bedroomWall)" />
          <Rect x="22" y="22" width="46" height="40" rx="4" fill="url(#night)" stroke="#fff" strokeWidth="2.5" />
          <Path d="M45 22 V62 M22 42 H68" stroke="#fff" strokeWidth="1.5" />
          <Circle cx="58" cy="31" r="4" fill="#FFF3B0" />
          <Path d="M10 12 Q45 24 80 12" stroke="#fff" strokeWidth="0.6" fill="none" />
          <Rect y="118" width="90" height="42" fill="#F7C6D9" />
          <Rect x="6" y="104" width="78" height="22" rx="7" fill="#fff" />
          <Rect x="6" y="114" width="78" height="14" rx="4" fill="#FFB5CC" />
          <Ellipse cx="22" cy="106" rx="11" ry="5" fill="#FFE3EC" />
        </G>
      )}

      {scene === 'cafe' && (
        <G>
          <Rect width="90" height="160" fill="url(#cafeWall)" />
          <Path d="M45 0 V20" stroke="#5B3A29" strokeWidth="0.8" />
          <Path d="M36 28 Q45 14 54 28 Z" fill="#5B3A29" />
          <Ellipse cx="45" cy="29" rx="6" ry="2" fill="#FFE8A3" opacity="0.9" />
          <Rect x="8" y="48" width="74" height="3" rx="1" fill="#8B5E3C" />
          <Rect x="14" y="40" width="7" height="8" rx="1.5" fill="#fff" />
          <Rect x="26" y="38" width="9" height="10" rx="1.5" fill="#E9C46A" />
          <Rect x="56" y="39" width="8" height="9" rx="1.5" fill="#F4A261" />
          <Rect x="68" y="41" width="7" height="7" rx="1.5" fill="#fff" />
          <Rect y="120" width="90" height="40" fill="#8B5E3C" />
          <Rect y="116" width="90" height="6" fill="#A47148" />
          <Path d="M0 140 H90 M0 152 H90" stroke="#7A5134" strokeWidth="0.6" />
        </G>
      )}

      {scene === 'rain' && (
        <G>
          <Rect width="90" height="160" fill="url(#rainSky)" />
          <Path d="M0 110 V84 H10 V92 H18 V76 H28 V96 H36 V88 H46 V70 H56 V94 H64 V82 H74 V98 H82 V86 H90 V110 Z" fill="#46535F" opacity="0.7" />
          <Rect x="4" y="10" width="82" height="112" rx="3" fill="none" stroke="#F5EFE6" strokeWidth="4" />
          <Path d="M45 10 V122" stroke="#F5EFE6" strokeWidth="3" />
          <Rect y="122" width="90" height="38" fill="#F5EFE6" />
          <Rect y="122" width="90" height="5" fill="#E3DACB" />
        </G>
      )}

      {scene === 'sunset' && (
        <G>
          <Rect width="90" height="160" fill="url(#sunsetSky)" />
          <Circle cx="45" cy="96" r="18" fill="#FFE29A" opacity="0.95" />
          <Ellipse cx="22" cy="40" rx="14" ry="3.5" fill="#fff" opacity="0.35" />
          <Ellipse cx="66" cy="54" rx="12" ry="3" fill="#fff" opacity="0.3" />
          <Rect y="100" width="90" height="60" fill="url(#sea)" />
          <Path d="M30 108 H60 M34 114 H56 M38 120 H52" stroke="#FFE29A" strokeWidth="1" opacity="0.7" />
        </G>
      )}
    </Svg>
  );
}

// ---- animated effects (exactly periodic over LOOP_SECONDS so exports loop seamlessly) ----

function phase(t: number, cycles: number, offset: number) {
  'worklet';
  const p = (t / LOOP_SECONDS) * cycles + offset;
  return p - Math.floor(p);
}

function RainDrop({ clock, x, offset, h }: { clock: SharedValue<number>; x: number; offset: number; h: number }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: phase(clock.value, 3, offset) * h * 0.8 - 20 }],
  }));
  return <Animated.View style={[styles.drop, { left: `${x}%` }, style]} />;
}

function Twinkle({ clock, x, y, offset, color }: { clock: SharedValue<number>; x: number; y: number; offset: number; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(TAU * phase(clock.value, 2, offset))) }));
  return <Animated.View style={[styles.light, { left: `${x}%`, top: `${y}%`, backgroundColor: color }, style]} />;
}

function Steam({ clock, x, offset }: { clock: SharedValue<number>; x: number; offset: number }) {
  const style = useAnimatedStyle(() => {
    const p = phase(clock.value, 2, offset);
    return {
      opacity: Math.sin(Math.PI * p) * 0.6,
      transform: [{ translateY: -40 * p }, { translateX: 4 * Math.sin(TAU * p) }, { scale: 0.6 + 0.8 * p }],
    };
  });
  return <Animated.View style={[styles.steam, { left: `${x}%` }, style]} />;
}

const RAIN = Array.from({ length: 22 }, (_, i) => ({ x: (i * 37) % 92 + 3, offset: (i * 0.137) % 1 }));
const LIGHTS = [8, 20, 32, 44, 56, 68, 80].map((x, i) => ({ x, y: 8 + 4 * Math.sin(i * 0.9 + 0.4) + (i % 2 ? 2 : 0), offset: i / 7 }));
const SPARKLES = [30, 40, 50, 60, 36, 54].map((x, i) => ({ x, y: 66 + (i % 3) * 4, offset: i / 6 }));

export function SceneEffects({ scene, clock, height }: { scene: SceneId; clock: SharedValue<number>; height: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {scene === 'rain' && RAIN.map((d, i) => <RainDrop key={i} clock={clock} x={d.x} offset={d.offset} h={height} />)}
      {scene === 'bedroom' &&
        LIGHTS.map((l, i) => <Twinkle key={i} clock={clock} x={l.x} y={l.y} offset={l.offset} color={['#FFF3B0', '#FFB5CC', '#C9F2FF'][i % 3]} />)}
      {scene === 'cafe' && [0, 0.33, 0.66].map((o, i) => <Steam key={i} clock={clock} x={22 + i * 3} offset={o} />)}
      {scene === 'sunset' && SPARKLES.map((s, i) => <Twinkle key={i} clock={clock} x={s.x} y={s.y} offset={s.offset} color="#FFF6D5" />)}
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { position: 'absolute', top: '8%', width: 1.5, height: 14, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.7)' },
  light: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },
  steam: { position: 'absolute', top: '72%', width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.8)' },
});
