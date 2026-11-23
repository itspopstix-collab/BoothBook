import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { AppDatabaseState, PosSaleRow, UserProfile, UserRole } from '../types';

const CFG_KEY = 'boothbook_supabase_cfg';
const DEFAULT_SUPABASE_URL = 'https://btnflwrebpnaafafisgc.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_laeU9dkVK9tl6Jvt2SVmog_UUpeD1Rn';

export type SupabaseCfg = { url: string; anonKey: string };

export function normalizeSupabaseUrl(raw: string): string {
  let u = (raw || '').trim();
  if (!u) throw new Error('กรุณากรอก Project URL');
  if (u.includes('@')) {
    throw new Error('ช่องนี้ต้องใส่ Project URL (https://btnflwrebpnaafafisgc.supabase.co) ไม่ใช่อีเมลครับ');
  }
  if (/^(sb_|eyJ)/i.test(u)) {
    throw new Error('ช่องนี้ต้องใส่ Project URL (https://xxxx.supabase.co) ไม่ใช่ API Key ครับ');
  }
  // หากกรอกเฉพาะ Project ID เช่น btnflwrebpnaafafisgc
  if (/^[a-z0-9-]+$/i.test(u)) {
    u = `https://${u}.supabase.co`;
  } else if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`;
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('URL ต้องขึ้นต้นด้วย https://');
    }
    if (!parsed.hostname.includes('.')) {
      throw new Error('Hostname ไม่ถูกต้อง');
    }
    return parsed.origin;
  } catch {
    throw new Error('รูปแบบ Project URL ไม่ถูกต้อง (ตัวอย่าง: https://btnflwrebpnaafafisgc.supabase.co)');
  }
}

export function clearSupabaseCfg() {
  try {
    localStorage.removeItem(CFG_KEY);
  } catch {
    // ignore
  }
  client = null;
}

export function getSupabaseCfg(): SupabaseCfg | null {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) {
    try {
      return { url: normalizeSupabaseUrl(envUrl), anonKey: envKey.trim() };
    } catch {
      // fall through
    }
  }
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) {
      return { url: DEFAULT_SUPABASE_URL, anonKey: DEFAULT_SUPABASE_ANON_KEY };
    }
    const c = JSON.parse(raw) as SupabaseCfg;
    const anonKey = (c.anonKey || '').trim();
    if (!anonKey || !/^(sb_publishable_|eyJ)/i.test(anonKey)) {
      clearSupabaseCfg();
      return { url: DEFAULT_SUPABASE_URL, anonKey: DEFAULT_SUPABASE_ANON_KEY };
    }
    let validUrl: string;
    try {
      validUrl = normalizeSupabaseUrl(c.url || '');
      if (!validUrl.includes('supabase.co') && !validUrl.includes('localhost')) {
        validUrl = DEFAULT_SUPABASE_URL;
      }
    } catch {
      validUrl = DEFAULT_SUPABASE_URL;
    }
    if (validUrl !== c.url) {
      localStorage.setItem(CFG_KEY, JSON.stringify({ url: validUrl, anonKey }));
    }
    return { url: validUrl, anonKey };
  } catch {
    clearSupabaseCfg();
    return { url: DEFAULT_SUPABASE_URL, anonKey: DEFAULT_SUPABASE_ANON_KEY };
  }
}

export function saveSupabaseCfg(cfg: SupabaseCfg) {
  const validUrl = normalizeSupabaseUrl(cfg.url);
  const anonKey = (cfg.anonKey || '').trim();
  if (!anonKey) throw new Error('กรุณากรอก Publishable key');
  if (/^https?:\/\//i.test(anonKey)) {
    throw new Error('ช่องนี้ต้องใส่ Publishable key (sb_publishable_...) ไม่ใช่ URL ครับ');
  }
  if (/^sb_secret_/i.test(anonKey)) {
    throw new Error('ห้ามใช้ Secret key ในหน้าเว็บครับ กรุณาใช้ Publishable key (sb_publishable_...)');
  }
  localStorage.setItem(CFG_KEY, JSON.stringify({ url: validUrl, anonKey }));
  client = null;
}

let client: SupabaseClient | null = null;
export function getClient(): SupabaseClient | null {
  if (client) return client;
  const cfg = getSupabaseCfg();
  if (!cfg) return null;
  try {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  } catch {
    clearSupabaseCfg();
    return null;
  }
}

const toEmail = (usernameOrEmail: string) => {
  const trimmed = usernameOrEmail.trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  return `${trimmed.replace(/[^a-z0-9._-]/g, '')}@boothbook.app`;
};

export async function signUp(username: string, password: string, role: UserRole = 'owner') {
  const c = getClient();
  if (!c) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  const { data, error } = await c.auth.signUp({
    email: toEmail(username),
    password,
    options: {
      data: {
        username,
        role,
      },
    },
  });
  if (error) throw error;
  if (!data.session) {
    throw new Error('สมัครแล้ว แต่ต้องปิด "Confirm email" ใน Supabase ก่อนจึงเข้าสู่ระบบได้');
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

export async function getSessionUser(): Promise<User | null> {
  const c = getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user ?? null;
}

export function getUserProfile(user: User): UserProfile {
  const role = (user.user_metadata?.role as UserRole) || 'owner';
  const username = user.user_metadata?.username || user.email?.split('@')[0] || 'User';
  const ownerId = user.user_metadata?.owner_id || user.id;
  return {
    id: user.id,
    email: user.email || '',
    username,
    role,
    ownerId,
  };
}

export async function pullStateFromSupabase(): Promise<AppDatabaseState | null> {
  const c = getClient();
  const user = await getSessionUser();
  if (!c || !user) return null;

  const profile = getUserProfile(user);
  const targetUserId = profile.role === 'staff' ? (profile.ownerId || user.id) : user.id;

  const { data, error } = await c
    .from('app_state')
    .select('state')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (error) throw error;
  const state = (data?.state as AppDatabaseState) ?? null;
  if (!state) return null;

  // ผสานยอดขายล่าสุดจากตาราง pos_sales (เช่น รายการที่แคชเชียร์ Staff ขายเข้ามาใหม่)
  try {
    const { data: salesRows } = await c
      .from('pos_sales')
      .select('id, event_id, raw_payload')
      .eq('user_id', targetUserId);

    if (Array.isArray(salesRows) && salesRows.length > 0 && Array.isArray(state.events)) {
      const byEvent = new Map<string, PosSaleRow[]>();
      for (const row of salesRows) {
        const raw = row.raw_payload as PosSaleRow | null;
        if (!raw || !row.event_id) continue;
        const list = byEvent.get(row.event_id) || [];
        list.push({ ...raw, id: raw.id || row.id });
        byEvent.set(row.event_id, list);
      }

      state.events = state.events.map((ev) => {
        const incoming = byEvent.get(ev.id);
        if (!incoming || incoming.length === 0) return ev;
        const existing = ev.posSales || [];
        const seen = new Set(
          existing.map((s) => s.id || `${s.orderId}|${s.date}|${s.time}|${s.flavor1}|${s.amount}`)
        );
        const added: PosSaleRow[] = [];
        for (const s of incoming) {
          const key1 = s.id || '';
          const key2 = `${s.orderId}|${s.date}|${s.time}|${s.flavor1}|${s.amount}`;
          if ((key1 && seen.has(key1)) || seen.has(key2)) continue;
          seen.add(key2);
          if (key1) seen.add(key1);
          added.push(s);
        }
        return added.length > 0 ? { ...ev, posSales: [...existing, ...added] } : ev;
      });
    }
  } catch (err) {
    console.warn('Merge pos_sales error:', err);
  }

  return state;
}

export async function pushStateToSupabase(state: AppDatabaseState): Promise<boolean> {
  const c = getClient();
  const user = await getSessionUser();
  if (!c || !user) return false;

  const profile = getUserProfile(user);
  const targetUserId = profile.role === 'staff' ? (profile.ownerId || user.id) : user.id;

  // 1. บันทึกลง app_state (เฉพาะ Owner เพื่อไม่ให้ Staff แก้ไขข้อมูลหลังบ้าน)
  let error: any = null;
  if (profile.role !== 'staff') {
    const res = await c
      .from('app_state')
      .upsert({ user_id: targetUserId, state, updated_at: new Date().toISOString() });
    error = res.error;
  }

  // 2. ซิงค์ตารางย่อย pos_sales
  try {
    for (const ev of state.events || []) {
      for (let i = 0; i < (ev.posSales || []).length; i++) {
        const pos = ev.posSales[i];
        const posId = pos.id || `pos-${ev.id}-${pos.orderId || i}`;
        const lineItem = pos.flavor2
          ? `${pos.flavor1} + ${pos.flavor2}`
          : (pos.flavor1 || pos.type || 'Gelato');

        await c.from('pos_sales').upsert({
          id: posId,
          event_id: ev.id,
          user_id: targetUserId,
          receipt_no: pos.orderId || `R-${i + 1}`,
          timestamp: `${pos.date} ${pos.time}`,
          line_item_name: lineItem,
          cups: 1,
          total_price: pos.amount || 0,
          payment_method: pos.payment || 'QR',
          discount: pos.discountAmount || 0,
          flavor_splits: [
            ...(pos.flavor1 ? [{ flavor: pos.flavor1, category: pos.category1 }] : []),
            ...(pos.flavor2 ? [{ flavor: pos.flavor2, category: pos.category2 }] : []),
          ],
          raw_payload: pos,
        });
      }
    }
  } catch (err) {
    console.warn('Sync pos_sales error:', err);
  }

  return !error;
}

/** บันทึกบิลการขายใหม่จากหน้า POS เข้าสู่ Supabase โดยตรงทันที */
export async function recordPosSaleToSupabase(
  sale: PosSaleRow,
  activeEventId?: string
): Promise<boolean> {
  const c = getClient();
  const user = await getSessionUser();
  if (!c || !user) return false;

  const profile = getUserProfile(user);
  const targetUserId = profile.role === 'staff' ? (profile.ownerId || user.id) : user.id;

  const lineItem = sale.flavor2
    ? `${sale.flavor1} + ${sale.flavor2}`
    : (sale.flavor1 || sale.type || 'Gelato');

  const { error } = await c.from('pos_sales').upsert({
    id: sale.id || `pos-${Date.now()}-${sale.orderId || Math.random().toString(36).slice(2, 7)}`,
    event_id: activeEventId || 'ev-default',
    user_id: targetUserId,
    receipt_no: sale.orderId,
    timestamp: `${sale.date} ${sale.time}`,
    line_item_name: lineItem,
    cups: 1,
    total_price: sale.amount || 0,
    payment_method: sale.payment || 'QR',
    discount: sale.discountAmount || 0,
    flavor_splits: [
      ...(sale.flavor1 ? [{ flavor: sale.flavor1, category: sale.category1 }] : []),
      ...(sale.flavor2 ? [{ flavor: sale.flavor2, category: sale.category2 }] : []),
    ],
    raw_payload: sale,
  });

  return !error;
}
