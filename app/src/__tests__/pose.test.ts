import { computePose, emotionHops, HOP_DURATION, hopOffset, motionModeFor, type MotionMode } from '@/features/doll/pose';

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

  it('talking adds a bounce and a 1.00-1.04 scale pulse on top of any emotion', () => {
    const quiet = samples(400, 10).map((t) => computePose('idle', t, -1, false));
    const talking = samples(400, 10).map((t) => computePose('idle', t, -1, true));
    const pulse = talking.map((p, i) => p.scaleX / quiet[i].scaleX);
    expect(Math.min(...pulse)).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(Math.max(...pulse)).toBeLessThanOrEqual(1.04 + 1e-9);
    expect(Math.min(...talking.map((p) => p.translateY))).toBeLessThan(Math.min(...quiet.map((p) => p.translateY)));
  });

  it('gives each emotion its own body language', () => {
    const avg = (mode: MotionMode, key: 'translateY' | 'rotateDeg' | 'translateX') =>
      samples(200, 10).reduce((sum, t) => sum + computePose(mode, t)[key], 0) / 200;
    expect(avg('thinking', 'rotateDeg')).toBeGreaterThan(5); // head tilt
    expect(avg('sad', 'translateY')).toBeGreaterThan(3); // droops down
    expect(avg('pouty', 'rotateDeg')).toBeLessThan(-6); // turns away
    expect(avg('teasing', 'rotateDeg')).toBeLessThan(-4); // cocky tilt
    const loving = samples(200, 10).map((t) => computePose('loving', t).translateX);
    expect(Math.max(...loving) - Math.min(...loving)).toBeGreaterThan(8); // sways side to side
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

  it('maps emotions to motion and hops', () => {
    expect(motionModeFor('surprised')).toBe('happy');
    expect(motionModeFor('pouty')).toBe('pouty');
    expect(motionModeFor('speaking')).toBe('idle');
    expect(emotionHops('loving')).toBe(true);
    expect(emotionHops('sad')).toBe(false);
  });
});
