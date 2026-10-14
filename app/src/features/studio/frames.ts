import { LOOP_SECONDS } from '@/features/doll/pose';

export const EXPORT_FPS = 12;
export const EXPORT_SIZE = { width: 720, height: 1280 } as const;

/** Timestamps (seconds) of every frame in one seamless loop: 0, 1/fps, ... up to (not including) the loop end. */
export function frameTimes(fps = EXPORT_FPS, seconds = LOOP_SECONDS): number[] {
  const count = Math.round(fps * seconds);
  return Array.from({ length: count }, (_, i) => i / fps);
}
