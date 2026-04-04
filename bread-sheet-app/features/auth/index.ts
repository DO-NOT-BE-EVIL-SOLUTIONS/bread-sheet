import { supabase } from '@/lib/supabase';

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
  return supabase.auth.signUp({ email, password });
}

export async function upgradeAccount(email: string, password: string) {
  return supabase.auth.updateUser({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}
