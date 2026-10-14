/**
 * Pure animation math for the 2.5D plushie. Every function is a worklet so the same code
 * runs on the UI thread (live animation) and in JS (deterministic frame export, unit tests).
 * Time `t` is in seconds.
 */

export type DollEmotion = 'idle' | 'speaking' | 'happy' | 'surprised' | 'thinking' | 'teasing' | 'sleepy';

/** The motion family actually played. Emotions map onto these. */
export type MotionMode = 'idle' | 'speaking' | 'thinking' | 'sleepy' | 'loop5';

export interface Pose {
  translateY: number; // px, negative = up
  rotateDeg: number;
  scaleX: number;
  scaleY: number;
  shadowScale: number;
  shadowOpacity: number;
}

export const HOP_DURATION = 0.9; // s, the double hop for happy/surprised
export const LOOP_SECONDS = 5; // wallpaper loop length

const TAU = Math.PI * 2;

export function motionModeFor(emotion: DollEmotion, isSpeaking: boolean): MotionMode {
  'worklet';
  if (isSpeaking || emotion === 'speaking') return 'speaking';
  if (emotion === 'thinking') return 'thinking';
  if (emotion === 'sleepy') return 'sleepy';
  return 'idle';
}

export function emotionHops(emotion: DollEmotion): boolean {
  'worklet';
  return emotion === 'happy' || emotion === 'surprised';
}

/** Two parabolic hops (22px then 13px) with squash on landing; 0 outside [0, HOP_DURATION]. */
export function hopOffset(elapsed: number): { y: number; squash: number } {
  'worklet';
  if (elapsed < 0 || elapsed >= HOP_DURATION) return { y: 0, squash: 0 };
  const first = 0.5;
  const local = elapsed < first ? elapsed / first : (elapsed - first) / (HOP_DURATION - first);
  const height = elapsed < first ? 22 : 13;
  const arc = 4 * local * (1 - local); // 0 -> 1 -> 0
  // Squash briefly near each landing (local close to 0 or 1).
  const edge = Math.min(local, 1 - local);
  const squash = edge < 0.12 ? (0.12 - edge) / 0.12 : 0;
  return { y: -height * arc, squash: squash * (elapsed < first ? 0.07 : 0.05) };
}

function base(mode: MotionMode, t: number): { y: number; rot: number; sx: number; sy: number } {
  'worklet';
  switch (mode) {
    case 'speaking': {
      // Bouncy bob (~2.2 bounces/s) with a 1.00-1.04 scale pulse in rhythm with speech.
      const bounce = Math.abs(Math.sin(TAU * 1.1 * t));
      const pulse = 1 + 0.04 * (0.5 + 0.5 * Math.sin(TAU * 2.2 * t));
      return { y: -7 * bounce, rot: 3 * Math.sin(TAU * 0.55 * t), sx: pulse, sy: pulse };
    }
    case 'thinking': {
      // Curious head tilt with a slow sway.
      return { y: -2 * Math.sin(TAU * 0.4 * t), rot: 8 + 2 * Math.sin(TAU * 0.5 * t), sx: 1, sy: 1 };
    }
    case 'sleepy': {
      const breath = Math.sin(TAU * 0.2 * t);
      return { y: -3 * breath, rot: -6 + 1.5 * breath, sx: 1 + 0.015 * breath, sy: 1 + 0.025 * breath };
    }
    case 'loop5': {
      // Exactly periodic over LOOP_SECONDS so exported videos loop seamlessly:
      // two breaths per loop plus a quick "wink" squash at 3.4-3.7 s.
      const phase = (((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS) / LOOP_SECONDS;
      const breath = Math.sin(TAU * 2 * phase);
      const wink = phase > 0.68 && phase < 0.74 ? Math.sin(Math.PI * ((phase - 0.68) / 0.06)) : 0;
      return {
        y: -5 * breath,
        rot: 2 * Math.sin(TAU * phase) + 4 * wink,
        sx: 1 + 0.012 * breath + 0.03 * wink,
        sy: 1 + 0.02 * breath - 0.06 * wink,
      };
    }
    case 'idle':
    default: {
      // Gentle breathing bob (5px) and a +/-2 degree tilt on a different period so it never looks robotic.
      const breath = Math.sin(TAU * t / 3);
      return { y: -5 * breath, rot: 2 * Math.sin(TAU * t / 4.6), sx: 1 + 0.008 * breath, sy: 1 + 0.015 * breath };
    }
  }
}

/**
 * @param hopElapsed seconds since the current hop started, or a negative number when not hopping.
 */
export function computePose(mode: MotionMode, t: number, hopElapsed = -1): Pose {
  'worklet';
  const b = base(mode, t);
  const hop = hopOffset(hopElapsed);
  const y = b.y + hop.y;
  const lift = Math.min(1, Math.max(0, -y / 30));
  return {
    translateY: y,
    rotateDeg: b.rot,
    scaleX: b.sx * (1 + hop.squash),
    scaleY: b.sy * (1 - hop.squash),
    shadowScale: 1 - 0.35 * lift,
    shadowOpacity: 0.18 * (1 - 0.6 * lift),
  };
}
