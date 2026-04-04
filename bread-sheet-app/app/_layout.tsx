import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SessionProvider, useSession } from '../hooks/use-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect } from 'react';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const AUTHENTICATED_GROUPS = ['(tabs)', '(account)'];

function RootLayoutNav() {
  const { session, isLoading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthenticatedGroup = AUTHENTICATED_GROUPS.includes(segments[0] as string);
    if (session && !inAuthenticatedGroup) {
      router.replace('/(tabs)');
    } else if (!session) {
      router.replace('/(auth)/login');
    }
  }, [session, isLoading, segments]);

  if (isLoading) return null;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(account)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <RootLayoutNav />
      </SessionProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
