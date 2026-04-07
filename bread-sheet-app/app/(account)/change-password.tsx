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

export default function ChangePasswordScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const bg = Colors[colorScheme].background;
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function changePassword() {
    if (password !== confirm) {
      Alert.alert('Passwords do not match');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      Alert.alert('Failed to update password', error.message);
    } else {
      Alert.alert('Password updated', 'Your password has been changed.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
    setLoading(false);
  }

  const canSubmit = password.length >= 6 && password === confirm;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.container}>
        <ThemedText style={styles.description}>
          Choose a new password. It must be at least 6 characters.
        </ThemedText>

        <TextInput
          style={[styles.input, { borderColor: Colors[colorScheme].icon, color: Colors[colorScheme].text }]}
          placeholder="New password"
          placeholderTextColor={Colors[colorScheme].icon}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          autoFocus
        />
        <TextInput
          style={[styles.input, { borderColor: Colors[colorScheme].icon, color: Colors[colorScheme].text }]}
          placeholder="Confirm new password"
          placeholderTextColor={Colors[colorScheme].icon}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
        />

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: tint }, (!canSubmit || loading) && styles.disabled]}
          onPress={changePassword}
          disabled={!canSubmit || loading}
        >
          <ThemedText style={[styles.primaryButtonText, { color: bg }]}>
            {loading ? 'Updating…' : 'Update Password'}
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
