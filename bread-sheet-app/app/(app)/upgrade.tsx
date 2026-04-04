import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';

export default function UpgradeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function upgrade() {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) {
      Alert.alert('Upgrade failed', error.message);
    } else {
      Alert.alert(
        'Check your email',
        'We sent a verification link to ' + email + '. Verify it to complete your account.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Save your account</ThemedText>
        <ThemedText style={styles.subtitle}>
          Add an email and password to keep your ratings and groups across devices.
          Your guest data won't be lost.
        </ThemedText>

        <TextInput
          style={[styles.input, { borderColor: Colors[colorScheme].icon, color: Colors[colorScheme].text }]}
          placeholder="Email"
          placeholderTextColor={Colors[colorScheme].icon}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
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
          onPress={upgrade}
          disabled={loading}
        >
          <ThemedText style={styles.primaryButtonText}>
            {loading ? 'Saving…' : 'Save Account'}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
          <ThemedText style={[styles.cancelText, { color: Colors[colorScheme].icon }]}>
            Maybe later
          </ThemedText>
        </TouchableOpacity>
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
    lineHeight: 22,
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
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
  },
});
