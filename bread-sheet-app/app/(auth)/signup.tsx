import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Button, TextInput } from 'react-native';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signUpWithEmail() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.is_anonymous) {
      const { error } = await supabase.auth.updateUser({
        email,
        password,
      });
      if (error) Alert.alert(error.message);
    } else {
      const {
        data: { session },
        error,
      } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) Alert.alert(error.message);
      if (!session)
        Alert.alert('Please check your inbox for email verification!');
    }
    setLoading(false);
  }

  return (
    <ThemedView
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <ThemedText type="title">Sign Up</ThemedText>
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
        title={loading ? 'Loading...' : 'Sign Up'}
        onPress={signUpWithEmail}
        disabled={loading}
      />
      <Link href="/(auth)/login" style={{ textAlign: 'center', marginTop: 16 }}>
        Already have an account? Login
      </Link>
    </ThemedView>
  );
}
