import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppDatabaseState } from '../types';

const CFG_KEY = 'boothbook_supabase_cfg';

export type SupabaseCfg = { url: string; anonKey: string };

export function getSupabaseCfg(): SupabaseCfg | null {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SupabaseCfg;
    return c.url && c.anonKey ? c : null;
  } catch {
    return null;
  }
}

export function saveSupabaseCfg(cfg: SupabaseCfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url: cfg.url.trim(), anonKey: cfg.anonKey.trim() }));
  client = null;
}

let client: SupabaseClient | null = null;
export function getClient(): SupabaseClient | null {
  if (client) return client;
  const cfg = getSupabaseCfg();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

const toEmail = (usernameOrEmail: string) => {
  const trimmed = usernameOrEmail.trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  return `${trimmed.replace(/[^a-z0-9._-]/g, '')}@boothbook.app`;
};

export async function signUp(username: string, password: string) {
  const c = getClient();
  if (!c) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  const { data, error } = await c.auth.signUp({ email: toEmail(username), password });
  if (error) throw error;
  if (!data.session) {
    throw new Error('สมัครแล้ว แต่ต้องปิด "Confirm email" ใน Supabase (Authentication > Providers > Email) ก่อนจึงเข้าสู่ระบบได้');
  }
}

export async function signIn(username: string, password: string) {
  const c = getClient();
  if (!c) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  const { error } = await c.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) throw error;
}

export async function signOut() {
  await getClient()?.auth.signOut();
}

export async function getSessionUser() {
  const c = getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user ?? null;
}

export async function pullStateFromSupabase(): Promise<AppDatabaseState | null> {
  const c = getClient();
  const user = await getSessionUser();
  if (!c || !user) return null;
  const { data, error } = await c
    .from('app_state')
    .select('state')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.state as AppDatabaseState) ?? null;
}

export async function pushStateToSupabase(state: AppDatabaseState): Promise<boolean> {
  const c = getClient();
  const user = await getSessionUser();
  if (!c || !user) return false;
  const { error } = await c
    .from('app_state')
    .upsert({ user_id: user.id, state, updated_at: new Date().toISOString() });
  return !error;
}
