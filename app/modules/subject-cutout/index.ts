import { requireOptionalNativeModule } from 'expo';

interface SubjectCutoutNativeModule {
  isAvailable(): boolean;
  cutOutAsync(uri: string): Promise<string>;
}

// Built into iOS (17+, Apple Vision) and Android (ML Kit) apps; null on web and in Expo Go.
const native = requireOptionalNativeModule<SubjectCutoutNativeModule>('SubjectCutout');

export function isSubjectCutoutAvailable(): boolean {
  try {
    return native?.isAvailable() ?? false;
  } catch {
    return false;
  }
}

/** Cuts the main subject out of a local photo; resolves with a transparent PNG file URI. */
export function cutOutSubjectAsync(uri: string): Promise<string> {
  if (!native) return Promise.reject(new Error('On-device cutout is not available here.'));
  return native.cutOutAsync(uri);
}
