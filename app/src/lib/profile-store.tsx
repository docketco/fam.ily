import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { defaultApiUrl, stripSlash } from './config';
import { DollApi } from './api';
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
 */
export function persistPhoto(sourceUri: string): string {
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
  const api = useMemo(() => new DollApi(apiUrl), [apiUrl]);

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
