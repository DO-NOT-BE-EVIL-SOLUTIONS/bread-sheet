import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Button, TextInput } from 'react-native';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [loadingGuest, setLoadingGuest] = useState(false);

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) Alert.alert(error.message);
    setLoading(false);
  }

  async function signInAnonymously() {
    setLoadingGuest(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) Alert.alert(error.message);
    setLoadingGuest(false);
  }

  return (
    <ThemedView
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <ThemedText type="title">Login</ThemedText>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 8,
          borderRadius: 4,
          marginVertical: 8,
        }}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 8,
          borderRadius: 4,
          marginVertical: 8,
        }}
      />
      <Button
        title={loading ? 'Loading...' : 'Login'}
        onPress={signInWithEmail}
        disabled={loading}
      />
      <Button
        title={loadingGuest ? 'Loading...' : 'Continue as Guest'}
        onPress={signInAnonymously}
        disabled={loadingGuest}
      />
      <Link href="/(auth)/signup" style={{ textAlign: 'center', marginTop: 16 }}>
        Don't have an account? Sign up
      </Link>
    </ThemedView>
  );
}
