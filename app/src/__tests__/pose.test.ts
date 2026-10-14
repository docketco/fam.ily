import { computePose, emotionHops, HOP_DURATION, hopOffset, LOOP_SECONDS, motionModeFor } from '@/features/doll/pose';
import { frameTimes } from '@/features/studio/frames';

const samples = (n: number, span: number) => Array.from({ length: n }, (_, i) => (i / n) * span);

describe('pose math', () => {
  it('idle bobs 4-6px and tilts within +/-2 degrees', () => {
    const poses = samples(400, 20).map((t) => computePose('idle', t));
    const maxY = Math.max(...poses.map((p) => Math.abs(p.translateY)));
    const maxRot = Math.max(...poses.map((p) => Math.abs(p.rotateDeg)));
    expect(maxY).toBeGreaterThanOrEqual(4);
    expect(maxY).toBeLessThanOrEqual(6);
    expect(maxRot).toBeLessThanOrEqual(2.0001);
  });

  it('speaking pulses scale between 1.00 and 1.04 and bounces upward only', () => {
    const poses = samples(400, 10).map((t) => computePose('speaking', t));
    const scales = poses.map((p) => p.scaleX);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.04 + 1e-9);
    expect(Math.max(...scales)).toBeGreaterThan(1.035);
    expect(Math.max(...poses.map((p) => p.translateY))).toBeLessThanOrEqual(1e-9);
  });

  it('thinking tilts the head to one side', () => {
    const rots = samples(100, 10).map((t) => computePose('thinking', t).rotateDeg);
    expect(Math.min(...rots)).toBeGreaterThan(5);
  });

  it('double hop goes up twice and lands back at rest', () => {
    expect(hopOffset(-0.1).y).toBe(0);
    expect(hopOffset(HOP_DURATION).y).toBe(0);
    expect(hopOffset(0.25).y).toBeCloseTo(-22);
    expect(hopOffset(0.5 + 0.2).y).toBeCloseTo(-13);
    expect(hopOffset(0.5).y).toBeCloseTo(0);
  });

  it('shadow shrinks and fades while the doll is airborne', () => {
    const ground = computePose('idle', 0, -1);
    const air = computePose('idle', 0, 0.25);
    expect(air.shadowScale).toBeLessThan(ground.shadowScale);
    expect(air.shadowOpacity).toBeLessThan(ground.shadowOpacity);
  });

  it('loop5 is exactly periodic so exported videos loop seamlessly', () => {
    for (const t of samples(50, LOOP_SECONDS)) {
      const a = computePose('loop5', t);
      const b = computePose('loop5', t + LOOP_SECONDS);
      expect(b.translateY).toBeCloseTo(a.translateY, 6);
      expect(b.rotateDeg).toBeCloseTo(a.rotateDeg, 6);
      expect(b.scaleY).toBeCloseTo(a.scaleY, 6);
    }
  });

  it('maps emotions to motion', () => {
    expect(motionModeFor('happy', true)).toBe('speaking');
    expect(motionModeFor('thinking', false)).toBe('thinking');
    expect(motionModeFor('sleepy', false)).toBe('sleepy');
    expect(motionModeFor('teasing', false)).toBe('idle');
    expect(emotionHops('surprised')).toBe(true);
    expect(emotionHops('teasing')).toBe(false);
  });

  it('export frame times cover one loop without duplicating the first frame', () => {
    const times = frameTimes(12, 5);
    expect(times).toHaveLength(60);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBeLessThan(5);
  });
});
