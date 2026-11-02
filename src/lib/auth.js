import { supabase } from './supabase.js';
import { generateCode } from './data.js';

export const cleanEmail = (e) => String(e || '').trim().toLowerCase();
export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

// Turns Supabase errors into short keys the UI translates.
export function mapAuthError(error) {
  const msg = String(error?.message || error || '');
  if (/invalid login|invalid credentials/i.test(msg)) return 'err_login';
  if (/rate limit|too many/i.test(msg)) return 'err_rate';
  if (/already registered|already been registered|user_already_exists|already exists/i.test(msg)) return 'err_taken';
  if (/password/i.test(msg) && /(least|short|weak|characters)/i.test(msg)) return 'err_weak';
  if (/token|otp|expired|invalid/i.test(msg)) return 'err_code';
  if (/network|fetch|failed to/i.test(msg)) return 'err_network';
  if (/confirm/i.test(msg)) return 'err_confirm';
  return 'err_generic';
}

export async function findBossRow(uid) {
  let { data } = await supabase.from('users').select('*').eq('auth_id', uid).eq('role', 'boss').maybeSingle();
  if (data) return data;
  ({ data } = await supabase.from('users').select('*').eq('id', uid).eq('role', 'boss').maybeSingle());
  return data || null;
}

export async function createBossRow({ uid, email, name }) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: uid,
      auth_id: uid,
      email,
      name: (name || '').trim() || email.split('@')[0],
      role: 'boss',
      invite_code: generateCode(),
      invite_code_used: false,
      customer_code: generateCode(),
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { row: data };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail(email), password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail(email),
    password,
    options: { data: { name: (name || '').trim() } },
  });
  if (error) throw error;
  if (!data.session) {
    const e = new Error('confirm');
    throw e;
  }
  return data;
}

export async function sendResetCode(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail(email));
  if (error) throw error;
}

export async function resetWithCode(email, code, newPassword) {
  const { error } = await supabase.auth.verifyOtp({
    email: cleanEmail(email),
    token: String(code).trim(),
    type: 'recovery',
  });
  if (error) throw error;
  const up = await supabase.auth.updateUser({ password: newPassword });
  if (up.error) throw up.error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
