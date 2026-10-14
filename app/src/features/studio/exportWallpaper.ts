import { File, Paths } from 'expo-file-system';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';

import type { DollApi, LocalFile } from '@/lib/api';
import { deleteQuietly } from '@/lib/audio';

import { EXPORT_FPS, EXPORT_SIZE, frameTimes } from './frames';


const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Loaded lazily so the studio canvas can render even where the native module is absent (web preview).
const mediaLibrary = () => import('expo-media-library');

export async function ensureSavePermission(): Promise<boolean> {
  const perm = await (await mediaLibrary()).requestPermissionsAsync(true, ['photo', 'video']);
  return perm.granted;
}

/**
 * Steps the shared animation clock frame by frame, snapshots the canvas each time, has the
 * server encode the frames into an H.264 MP4 and saves it to the photo library.
 */
export async function exportLoopVideo(opts: {
  canvasRef: RefObject<View | null>;
  clock: SharedValue<number>;
  api: DollApi;
  repeat?: number;
  onProgress?: (fraction: number, label: string) => void;
}): Promise<void> {
  const { canvasRef, clock, api, repeat = 2, onProgress } = opts;
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

    onProgress?.(0.75, 'Rendering video…');
    const mp4 = await api.renderWallpaper(frames, EXPORT_FPS, repeat);

    onProgress?.(0.95, 'Saving to Photos…');
    const file = new File(Paths.cache, `doll-wallpaper-${Date.now()}.mp4`);
    file.write(new Uint8Array(mp4));
    try {
      await (await mediaLibrary()).Asset.create(file.uri);
    } finally {
      deleteQuietly(file.uri);
    }
    onProgress?.(1, 'Saved!');
  } finally {
    frames.forEach((f) => deleteQuietly(f.uri));
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
