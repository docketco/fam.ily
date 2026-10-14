import { requireOptionalNativeModule } from 'expo';

interface LivePhotoNativeModule {
  saveLivePhotoAsync(videoUri: string, keyPhotoSeconds: number): Promise<string>;
}

// Only built into iOS apps; null on Android, web and Expo Go.
const native = requireOptionalNativeModule<LivePhotoNativeModule>('LivePhoto');

export const isLivePhotoSupported = native != null;

/**
 * Turns a local video file (file://…) into a Live Photo and saves it to the photo library.
 * The key photo (the still shown when the motion isn't playing) is taken at `keyPhotoSeconds`.
 */
export async function saveLivePhotoAsync(videoUri: string, keyPhotoSeconds = 0): Promise<string> {
  if (!native) throw new Error('Live Photos are only available on iOS.');
  return native.saveLivePhotoAsync(videoUri, keyPhotoSeconds);
}
