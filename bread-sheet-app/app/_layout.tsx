import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect } from 'react';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const AUTHENTICATED_GROUPS = ['(tabs)', '(account)', '(app)'];

function RootLayoutNav() {
  const { session, isLoading, isAnonymous } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthenticatedGroup = AUTHENTICATED_GROUPS.includes(segments[0] as string);
    const inAuthGroup = segments[0] === '(auth)';
    if (session && !isAnonymous && !inAuthenticatedGroup) {
      router.replace('/(tabs)');
    } else if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    }
  }, [session, isAnonymous, isLoading, segments, router]);

  if (isLoading) return null;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(account)" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
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
