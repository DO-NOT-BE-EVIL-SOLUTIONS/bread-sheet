import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isValidEmail, signUp } from '@/features/auth';
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

export default function SignUpScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const bg = Colors[colorScheme].background;
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signUpWithEmail() {
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    const { data: { session }, error } = await signUp(email, password);
    if (error) Alert.alert('Sign up failed', error.message);
    else if (!session) router.replace({ pathname: '/(auth)/verify-email', params: { email } });
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Create account</ThemedText>
        <ThemedText style={styles.subtitle}>Start rating food with your friends</ThemedText>

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
          autoComplete="new-password"
        />

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: tint }, loading && styles.disabled]}
          onPress={signUpWithEmail}
          disabled={loading}
        >
          <ThemedText style={[styles.primaryButtonText, { color: bg }]}>
            {loading ? 'Creating account…' : 'Sign Up'}
          </ThemedText>
        </TouchableOpacity>

        <Link href="/(auth)/login" style={[styles.link, { color: tint }]}>
          Already have an account? Sign in
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
