import Constants from 'expo-constants';

/**
 * Backend URL resolution order:
 * 1. A URL saved in the doll setup screen (handled by the profile store).
 * 2. EXPO_PUBLIC_API_URL baked in at build time (set it in eas.json for cloud builds).
 * 3. In development, the machine running `expo start` on port 8000.
 */
export function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return stripSlash(fromEnv);
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:8000` : 'http://localhost:8000';
}

export const appKey: string | undefined = process.env.EXPO_PUBLIC_APP_KEY || undefined;

export function stripSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
