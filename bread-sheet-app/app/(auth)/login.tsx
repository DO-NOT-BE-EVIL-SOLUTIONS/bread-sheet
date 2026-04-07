import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isValidEmail, signIn, signInAsGuest } from '@/features/auth';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const bg = Colors[colorScheme].background;
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingGuest, setLoadingGuest] = useState(false);

  async function signInWithEmail() {
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) Alert.alert('Login failed', error.message);
    setLoading(false);
  }

  async function handleGuestSignIn() {
    setLoadingGuest(true);
    const { error } = await signInAsGuest();
    if (error) {
      Alert.alert('Guest sign-in failed', error.message);
    } else {
      router.replace('/(tabs)');
    }
    setLoadingGuest(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Welcome back</ThemedText>
        <ThemedText style={styles.subtitle}>Sign in to your account</ThemedText>

        <TextInput
          style={[styles.input, { borderColor: Colors[colorScheme].icon, color: Colors[colorScheme].text }]}
          placeholder="Email"
          placeholderTextColor={Colors[colorScheme].icon}
          value={email}
          onChangeText={(v) => { setEmail(v); setEmailError(''); }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        {emailError ? <ThemedText style={styles.fieldError}>{emailError}</ThemedText> : null}
        <TextInput
          style={[styles.input, { borderColor: Colors[colorScheme].icon, color: Colors[colorScheme].text }]}
          placeholder="Password"
          placeholderTextColor={Colors[colorScheme].icon}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: tint }, loading && styles.disabled]}
          onPress={signInWithEmail}
          disabled={loading}
        >
          <ThemedText style={[styles.primaryButtonText, { color: bg }]}>
            {loading ? 'Signing in…' : 'Sign In'}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: tint }, loadingGuest && styles.disabled]}
          onPress={handleGuestSignIn}
          disabled={loadingGuest}
        >
          <ThemedText style={[styles.secondaryButtonText, { color: tint }]}>
            {loadingGuest ? 'Loading…' : 'Continue as Guest'}
          </ThemedText>
        </TouchableOpacity>

        <Link href="/(auth)/signup" style={[styles.link, { color: tint }]}>
          Don&lsquo;t have an account? Sign up
        </Link>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    opacity: 0.6,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  link: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
  },
  fieldError: {
    color: '#e53e3e',
    fontSize: 13,
    marginTop: -4,
  },
});
