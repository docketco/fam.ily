/**
 * Pure animation math for the 2.5D plushie. Every function is a worklet so the same code
 * runs on the UI thread (live animation) and in JS (unit tests). Time `t` is in seconds.
 *
 * Each emotion has its own body language; talking layers a bouncy bob and a scale pulse
 * on top of it, so the doll can be sleepy-and-talking or pouty-and-talking.
 */

export type DollEmotion =
  | 'idle'
  | 'speaking'
  | 'thinking'
  | 'happy'
  | 'loving'
  | 'teasing'
  | 'surprised'
  | 'sleepy'
  | 'sad'
  | 'pouty';

/** The body language played. Emotions map onto these. */
export type MotionMode = 'idle' | 'thinking' | 'happy' | 'loving' | 'teasing' | 'sleepy' | 'sad' | 'pouty';

export interface Pose {
  translateY: number; // px, negative = up
  translateX: number; // px
  rotateDeg: number;
  scaleX: number;
  scaleY: number;
  shadowScale: number;
  shadowOpacity: number;
}

export const HOP_DURATION = 0.9; // s, the double hop for happy/surprised/loving

const TAU = Math.PI * 2;

export function motionModeFor(emotion: DollEmotion): MotionMode {
  'worklet';
  switch (emotion) {
    case 'thinking':
    case 'happy':
    case 'loving':
    case 'teasing':
    case 'sleepy':
    case 'sad':
    case 'pouty':
      return emotion;
    case 'surprised':
      return 'happy';
    default:
      return 'idle';
  }
}

export function emotionHops(emotion: DollEmotion): boolean {
  'worklet';
  return emotion === 'happy' || emotion === 'surprised' || emotion === 'loving';
}

/** Two parabolic hops (22px then 13px) with squash on landing; 0 outside [0, HOP_DURATION]. */
export function hopOffset(elapsed: number): { y: number; squash: number } {
  'worklet';
  if (elapsed < 0 || elapsed >= HOP_DURATION) return { y: 0, squash: 0 };
  const first = 0.5;
  const local = elapsed < first ? elapsed / first : (elapsed - first) / (HOP_DURATION - first);
  const height = elapsed < first ? 22 : 13;
  const arc = 4 * local * (1 - local); // 0 -> 1 -> 0
  const edge = Math.min(local, 1 - local);
  const squash = edge < 0.12 ? (0.12 - edge) / 0.12 : 0;
  return { y: -height * arc, squash: squash * (elapsed < first ? 0.07 : 0.05) };
}

type Base = { y: number; x: number; rot: number; sx: number; sy: number };

function base(mode: MotionMode, t: number): Base {
  'worklet';
  switch (mode) {
    case 'thinking':
      // Curious head tilt with a slow sway.
      return { y: -2 * Math.sin(TAU * 0.4 * t), x: 0, rot: 8 + 2 * Math.sin(TAU * 0.5 * t), sx: 1, sy: 1 };
    case 'happy': {
      // Light springy bounce.
      const b = Math.abs(Math.sin(TAU * 0.9 * t));
      return { y: -6 * b, x: 0, rot: 3 * Math.sin(TAU * 0.45 * t), sx: 1 + 0.02 * b, sy: 1 - 0.01 * b };
    }
    case 'loving': {
      // Slow side-to-side sway, leaning in.
      const s = Math.sin(TAU * 0.35 * t);
      return { y: -3 * Math.abs(s), x: 5 * s, rot: 6 * s, sx: 1.02, sy: 1.02 };
    }
    case 'teasing': {
      // Cocky head tilt with a little shoulder wiggle.
      const w = Math.sin(TAU * 1.6 * t);
      return { y: -2 * Math.abs(w), x: 2 * w, rot: -7 + 2.5 * w, sx: 1, sy: 1 };
    }
    case 'sleepy': {
      const breath = Math.sin(TAU * 0.2 * t);
      return { y: -3 * breath + 3, x: 0, rot: -6 + 1.5 * breath, sx: 1 + 0.015 * breath, sy: 0.98 + 0.025 * breath };
    }
    case 'sad': {
      // Droops low and slumps, barely moving.
      const breath = Math.sin(TAU * 0.25 * t);
      return { y: 6 - 1.5 * breath, x: 0, rot: 4 + 1 * breath, sx: 1.02, sy: 0.95 };
    }
    case 'pouty': {
      // Turns away with quick little huffs.
      const huff = Math.max(0, Math.sin(TAU * 0.8 * t)) ** 6;
      return { y: -3 * huff, x: -3, rot: -9 + 2 * huff, sx: 1 + 0.03 * huff, sy: 1 - 0.02 * huff };
    }
    case 'idle':
    default: {
      // Gentle breathing bob (5px) and a +/-2 degree tilt on a different period so it never looks robotic.
      const breath = Math.sin((TAU * t) / 3);
      return { y: -5 * breath, x: 0, rot: 2 * Math.sin((TAU * t) / 4.6), sx: 1 + 0.008 * breath, sy: 1 + 0.015 * breath };
    }
  }
}

/** Talking: a bouncy bob (~2.2 bounces/s) and a 1.00-1.04 scale pulse in rhythm with speech. */
export function speakingLayer(t: number): { y: number; rot: number; pulse: number } {
  'worklet';
  const bounce = Math.abs(Math.sin(TAU * 1.1 * t));
  const pulse = 1 + 0.04 * (0.5 + 0.5 * Math.sin(TAU * 2.2 * t));
  return { y: -7 * bounce, rot: 2 * Math.sin(TAU * 0.55 * t), pulse };
}

/**
 * @param hopElapsed seconds since the current hop started, or a negative number when not hopping.
 */
export function computePose(mode: MotionMode, t: number, hopElapsed = -1, speaking = false): Pose {
  'worklet';
  const b = base(mode, t);
  const talk = speaking ? speakingLayer(t) : { y: 0, rot: 0, pulse: 1 };
  const hop = hopOffset(hopElapsed);
  const y = b.y + talk.y + hop.y;
  const lift = Math.min(1, Math.max(0, -y / 30));
  return {
    translateY: y,
    translateX: b.x,
    rotateDeg: b.rot + talk.rot,
    scaleX: b.sx * talk.pulse * (1 + hop.squash),
    scaleY: b.sy * talk.pulse * (1 - hop.squash),
    shadowScale: 1 - 0.35 * lift,
    shadowOpacity: 0.9 * (1 - 0.6 * lift),
  };
}
