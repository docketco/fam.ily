import { File, Paths } from 'expo-file-system';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';

import type { DollApi, LocalFile } from '@/lib/api';
import { deleteQuietly } from '@/lib/audio';

import { saveLivePhotoAsync } from '../../../modules/live-photo';
import { EXPORT_FPS, EXPORT_SIZE, frameTimes } from './frames';

export type ExportKind = 'livePhoto' | 'video' | 'still';

// Loaded lazily so the studio canvas can render even where the native module is absent (web preview).
const mediaLibrary = () => import('expo-media-library');

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export async function ensureSavePermission(): Promise<boolean> {
  const perm = await (await mediaLibrary()).requestPermissionsAsync(true, ['photo', 'video']);
  return perm.granted;
}

type Progress = (fraction: number, label: string) => void;

/** Steps the shared animation clock through one loop and snapshots the canvas at each frame. */
async function captureFrames(canvasRef: RefObject<View | null>, clock: SharedValue<number>, onProgress?: Progress) {
  const times = frameTimes();
  const frames: LocalFile[] = [];
  try {
    for (let i = 0; i < times.length; i++) {
      clock.set(times[i]);
      // Two frames: one for the UI thread to apply the new clock, one to draw it.
      await nextFrame();
      await nextFrame();
      const uri = await captureRef(canvasRef, { format: 'jpg', quality: 0.9, result: 'tmpfile', ...EXPORT_SIZE });
      frames.push({ uri, name: `frame-${String(i).padStart(3, '0')}.jpg`, type: 'image/jpeg' });
      onProgress?.((0.7 * (i + 1)) / times.length, `Capturing frames ${i + 1}/${times.length}`);
    }
    return frames;
  } catch (err) {
    frames.forEach((f) => deleteQuietly(f.uri));
    throw err;
  }
}

/**
 * Exports the animated canvas. Video: a 10 s seamless loop for video wallpapers.
 * Live Photo (iOS): one 5 s loop at 30 fps, turned into a Live Photo on the device.
 */
export async function exportAnimated(opts: {
  kind: 'video' | 'livePhoto';
  canvasRef: RefObject<View | null>;
  clock: SharedValue<number>;
  api: DollApi;
  onProgress?: Progress;
}): Promise<void> {
  const { kind, canvasRef, clock, api, onProgress } = opts;
  const frames = await captureFrames(canvasRef, clock, onProgress);
  let mp4Uri: string | null = null;
  try {
    onProgress?.(0.75, 'Rendering video…');
    const mp4 =
      kind === 'livePhoto'
        ? await api.renderWallpaper(frames, EXPORT_FPS, 1, 30)
        : await api.renderWallpaper(frames, EXPORT_FPS, 2);
    const file = new File(Paths.cache, `doll-wallpaper-${Date.now()}.mp4`);
    file.write(new Uint8Array(mp4));
    mp4Uri = file.uri;

    onProgress?.(0.92, kind === 'livePhoto' ? 'Making your Live Photo…' : 'Saving to Photos…');
    if (kind === 'livePhoto') await saveLivePhotoAsync(mp4Uri, 0);
    else await (await mediaLibrary()).Asset.create(mp4Uri);
    onProgress?.(1, 'Saved!');
  } finally {
    frames.forEach((f) => deleteQuietly(f.uri));
    deleteQuietly(mp4Uri);
  }
}

export async function exportStill(canvasRef: RefObject<View | null>): Promise<void> {
  const uri = await captureRef(canvasRef, { format: 'png', result: 'tmpfile', width: 1080, height: 1920 });
  try {
    await (await mediaLibrary()).Asset.create(uri);
  } finally {
    deleteQuietly(uri);
  }
}
