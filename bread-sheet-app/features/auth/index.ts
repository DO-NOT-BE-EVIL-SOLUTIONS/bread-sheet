import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

const APP_REDIRECT = Linking.createURL('/');

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInAsGuest() {
  return supabase.auth.signInAnonymously();
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password, options: { emailRedirectTo: APP_REDIRECT } });
}

export async function upgradeAccount(email: string, password: string) {
  return supabase.auth.updateUser({ email, password }, { emailRedirectTo: APP_REDIRECT });
}

export async function signOut() {
  return supabase.auth.signOut();
}
