import { File, Paths } from 'expo-file-system';

import { cutOutSubjectAsync, isSubjectCutoutAvailable } from '../../modules/subject-cutout';
import type { DollApi } from './api';

export interface CutoutResult {
  uri: string;
  method: 'device' | 'server';
}

/**
 * Cuts the plushie out of its photo so it can stand on screen without a background.
 * Tries the phone's own subject lifting first (iOS 17+ Vision, Android ML Kit), then the
 * backend's plain-background fallback. Rejects when neither works; keep the original photo then.
 */
export async function cutOutPlushie(uri: string, api: DollApi): Promise<CutoutResult> {
  if (isSubjectCutoutAvailable()) {
    try {
      return { uri: await cutOutSubjectAsync(uri), method: 'device' };
    } catch {
      // fall through to the server
    }
  }
  const res = await api.cutout({ uri, name: 'plushie.jpg', type: 'image/jpeg' });
  const file = new File(Paths.cache, `cutout-${Date.now()}.png`);
  file.write(res.image_base64, { encoding: 'base64' });
  return { uri: file.uri, method: 'server' };
}
