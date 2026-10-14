import { File, Paths } from 'expo-file-system';

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
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // best effort cleanup
  }
}
