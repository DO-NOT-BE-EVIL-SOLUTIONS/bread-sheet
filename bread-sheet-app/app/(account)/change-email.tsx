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

export default function ChangeEmailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const bg = Colors[colorScheme].background;
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function changeEmail() {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      Alert.alert('Failed to update email', error.message);
    } else {
      Alert.alert(
        'Verify your new email',
        'We sent a confirmation link to ' + email + '. Click it to complete the change.',
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
        <ThemedText style={styles.description}>
          Enter your new email address. You&lsquo;ll need to verify it before the change takes effect.
        </ThemedText>

        <TextInput
          style={[styles.input, { borderColor: Colors[colorScheme].icon, color: Colors[colorScheme].text }]}
          placeholder="New email address"
          placeholderTextColor={Colors[colorScheme].icon}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          autoFocus
        />

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: tint }, loading && styles.disabled]}
          onPress={changeEmail}
          disabled={loading || !email}
        >
          <ThemedText style={[styles.primaryButtonText, { color: bg }]}>
            {loading ? 'Sending…' : 'Send Verification'}
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 14,
  },
  description: {
    opacity: 0.6,
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
    fontWeight: '600',
    fontSize: 16,
  },
  disabled: { opacity: 0.5 },
});
