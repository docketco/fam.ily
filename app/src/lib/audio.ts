import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
};

/** Writes a base64 audio payload to a cache file and returns its URI for playback. */
export function writeAudioToCache(base64: string, mime: string, prefix = 'reply'): string {
  const file = new File(Paths.cache, `${prefix}-${Date.now()}.${EXT[mime] ?? 'mp3'}`);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

export function deleteQuietly(uri: string | null | undefined) {
  if (!uri || uri.startsWith('data:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // best effort cleanup
  }
}

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Writes a base64 image to the cache directory and returns its file URI. */
export function writeImageToCache(base64: string, mime: string, prefix: string): string {
  // The web preview has no file system; an inline data URI renders the same.
  if (Platform.OS === 'web') return `data:${mime};base64,${base64}`;
  const file = new File(Paths.cache, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${IMAGE_EXT[mime] ?? 'png'}`);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}
