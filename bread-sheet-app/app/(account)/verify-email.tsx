import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity } from 'react-native';

export default function VerifyEmailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.icon}>📬</ThemedText>
      <ThemedText type="title" style={styles.title}>Check your inbox</ThemedText>
      <ThemedText style={styles.body}>
        We sent a verification link to{'\n'}
        <ThemedText style={styles.email}>{email}</ThemedText>
      </ThemedText>
      <ThemedText style={styles.hint}>
        Click the link to activate your account. Your guest data is safe.
      </ThemedText>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: tint }]}
        onPress={() => router.replace('/(tabs)')}
      >
        <ThemedText style={styles.buttonText}>Done</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  icon: {
    fontSize: 56,
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.8,
  },
  email: {
    fontWeight: '600',
    opacity: 1,
  },
  hint: {
    textAlign: 'center',
    opacity: 0.5,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
