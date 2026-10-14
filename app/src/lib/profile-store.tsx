import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { defaultApiUrl, stripSlash } from './config';
import { DollApi } from './api';
import { DemoApi, IS_DEMO } from './demo-api';
import { type DollProfile, parseStoredProfile } from './profile';

const STORAGE_KEY = 'doll-profile.v1';

interface ProfileContextValue {
  profile: DollProfile | null;
  loaded: boolean;
  api: DollApi;
  apiUrl: string;
  saveProfile: (p: DollProfile) => Promise<DollProfile>;
  resetProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Copies a picked/taken photo into the app's document directory. Picker and camera results
 * live in caches the OS may purge, which would leave the saved profile without its doll.
 * On the web there is no file system, so the photo is shrunk and kept as a data URI.
 */
export async function persistPhoto(sourceUri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const rendered = await ImageManipulator.manipulate(sourceUri).resize({ width: 512 }).renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
    return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : saved.uri;
  }
  const dir = new Directory(Paths.document, 'doll');
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = sourceUri.split('?')[0].split('.').pop()?.toLowerCase();
  const target = new File(dir, `plushie-${Date.now()}.${ext && ext.length <= 4 ? ext : 'jpg'}`);
  new File(sourceUri).copySync(target);
  return target.uri;
}

function removeOldPhoto(oldUri: string | null | undefined, newUri: string | null | undefined) {
  if (!oldUri || oldUri === newUri || !oldUri.includes('/doll/')) return;
  try {
    const f = new File(oldUri);
    if (f.exists) f.delete();
  } catch {
    // best effort
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DollProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => setProfile(parseStoredProfile(raw)))
      .catch(() => setProfile(null))
      .finally(() => setLoaded(true));
  }, []);

  const saveProfile = useCallback(
    async (next: DollProfile) => {
      const clean: DollProfile = { ...next, apiUrl: next.apiUrl ? stripSlash(next.apiUrl) : '' };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      removeOldPhoto(profile?.photoUri, clean.photoUri);
      setProfile(clean);
      return clean;
    },
    [profile?.photoUri],
  );

  const resetProfile = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    removeOldPhoto(profile?.photoUri, null);
    setProfile(null);
  }, [profile?.photoUri]);

  const apiUrl = profile?.apiUrl || defaultApiUrl();
  const api = useMemo(() => (IS_DEMO ? new DemoApi() : new DollApi(apiUrl)), [apiUrl]);

  const value = useMemo(
    () => ({ profile, loaded, api, apiUrl, saveProfile, resetProfile }),
    [profile, loaded, api, apiUrl, saveProfile, resetProfile],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
