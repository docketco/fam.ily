import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ConversationProvider } from '@/lib/conversation';
import { ProfileProvider, useProfile } from '@/lib/profile-store';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { loaded, profile } = useProfile();

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.pinkDeep,
        headerTitleStyle: { color: colors.ink, fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Protected guard={!!profile}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="call" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Screen name="setup" options={{ title: profile ? 'Edit your doll' : 'Create your doll' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProfileProvider>
        <ConversationProvider>
          <StatusBar style="dark" />
          <RootStack />
        </ConversationProvider>
      </ProfileProvider>
    </GestureHandlerRootView>
  );
}
