import { AppDatabaseState, CloudStorageBackend, PosConnectionSettings, PosSaleRow } from '../types';
import {
  pullStateFromSupabase,
  pushStateToSupabase,
  recordPosSaleToSupabase,
} from './supabase';
import { persistJson, readPersistedJson } from './nativeStorage';
import {
  appendSaleRowToGoogleSheet,
  getCachedGoogleToken,
  getGoogleClientId,
  loadDbSnapshotFromGoogleSheet,
  requestGoogleAccessToken,
  saveDbSnapshotToGoogleSheet,
} from './googleSheetsAuth';

const PENDING_ORDERS_KEY = 'boothbook_pending_orders_v1';
const STATE_DIRTY_KEY = 'boothbook_state_dirty_v1';

export interface PendingPosOrder {
  id: string;
  eventId: string;
  sale: PosSaleRow;
  queuedAt: string;
}

export function getActiveBackend(settings?: PosConnectionSettings): CloudStorageBackend {
  return settings?.storageBackend === 'google_sheets' ? 'google_sheets' : 'supabase';
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function getPendingOrders(): PendingPosOrder[] {
  try {
    const raw = localStorage.getItem(PENDING_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getPendingOrdersCount(): number {
  return getPendingOrders().length;
}

function savePendingOrders(list: PendingPosOrder[]): void {
  void persistJson(PENDING_ORDERS_KEY, list);
}

/** กู้คืนคิวออเดอร์ออฟไลน์จาก iOS Native Storage / IndexedDB ตอนเปิดแอป */
export async function hydratePendingOrdersFromNative(): Promise<PendingPosOrder[]> {
  const persisted = await readPersistedJson<PendingPosOrder[]>(PENDING_ORDERS_KEY);
  if (Array.isArray(persisted)) {
    return persisted;
  }
  return getPendingOrders();
}

export function markStateDirty(dirty = true): void {
  try {
    if (dirty) localStorage.setItem(STATE_DIRTY_KEY, '1');
    else localStorage.removeItem(STATE_DIRTY_KEY);
  } catch {
    // ignore
  }
}

export function isStateDirty(): boolean {
  try {
    return localStorage.getItem(STATE_DIRTY_KEY) === '1';
  } catch {
    return false;
  }
}

/* ---------- Google Sheets Cloud Backend (Direct OAuth API v4 + Apps Script Fallback) ---------- */

async function pushSaleToGoogleSheets(
  sale: PosSaleRow,
  settings: PosConnectionSettings,
  googleTokenOverride?: string
): Promise<boolean> {
  // 1. ใช้ Google Sheets API v4 โดยตรง (กรณีเชื่อมต่อ Google Login แล้ว)
  const sheetId = (settings.sheetId || '').trim();
  const token = googleTokenOverride || getCachedGoogleToken()?.accessToken;
  if (sheetId && token) {
    const ok = await appendSaleRowToGoogleSheet(sheetId, sale, token);
    if (ok) return true;
  }

  // 2. Fallback: ใช้ Apps Script Web App URL (ถ้าผู้ใช้ตั้งค่าไว้)
  const url = (settings.appsScriptUrl || '').trim();
  if (!url || !url.includes('script.google.com')) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'appendSale',
        rows: [
          [
            sale.orderId,
            sale.date,
            sale.time,
            sale.type || 'item',
            sale.flavorsPerCup || 1,
            sale.flavor1 || '',
            sale.flavor2 || '',
            sale.category1 || '',
            sale.category2 || '',
            sale.payment || 'QR',
            sale.promotion || '',
            sale.discountAmount || 0,
            sale.amount || 0,
          ],
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pushStateToGoogleSheetsBackend(
  state: AppDatabaseState,
  googleTokenOverride?: string
): Promise<boolean> {
  const sheetId = (state.settings?.sheetId || '').trim();
  const token = googleTokenOverride || getCachedGoogleToken()?.accessToken;
  if (sheetId && token) {
    const ok = await saveDbSnapshotToGoogleSheet(sheetId, state, token);
    if (ok) return true;
  }

  const url = (state.settings?.appsScriptUrl || '').trim();
  if (!url || !url.includes('script.google.com')) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveTaxDbState',
        state,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pullStateFromGoogleSheetsBackend(
  settings: PosConnectionSettings,
  googleTokenOverride?: string
): Promise<AppDatabaseState | null> {
  const sheetId = (settings?.sheetId || '').trim();
  const token = googleTokenOverride || getCachedGoogleToken()?.accessToken;
  if (sheetId && token) {
    const state = await loadDbSnapshotFromGoogleSheet(sheetId, token);
    if (state) return state;
  }

  const url = (settings?.appsScriptUrl || '').trim();
  if (!url || !url.includes('script.google.com')) return null;
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}mode=loadTaxDbState&ts=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const state = (data?.state || data) as AppDatabaseState | null;
    return state && Array.isArray(state.recipes) ? state : null;
  } catch {
    return null;
  }
}

/* ---------- Unified Dual-Cloud Push / Pull ---------- */

export async function pushStateToActiveCloud(state: AppDatabaseState): Promise<boolean> {
  if (!isOnline()) {
    markStateDirty(true);
    return false;
  }
  const backend = getActiveBackend(state.settings);
  const ok =
    backend === 'google_sheets'
      ? await pushStateToGoogleSheetsBackend(state)
      : await pushStateToSupabase(state);
  if (ok) markStateDirty(false);
  else markStateDirty(true);
  return ok;
}

export async function pullStateFromActiveCloud(
  settings: PosConnectionSettings
): Promise<AppDatabaseState | null> {
  if (!isOnline()) return null;
  const backend = getActiveBackend(settings);
  if (backend === 'google_sheets') {
    return await pullStateFromGoogleSheetsBackend(settings);
  }
  return await pullStateFromSupabase();
}

/**
 * บันทึกออเดอร์ POS แบบ Offline-First:
 * 1. เก็บลงคิวในเครื่อง (localStorage) ก่อนเสมอเพื่อกันหายถ้าเน็ตหลุด
 * 2. ถ้าออนไลน์อยู่ พยายามส่งขึ้น Cloud ที่เลือก (Supabase หรือ Google Sheets) ทันที
 * 3. ถ้าส่งสำเร็จ จะลบออกจากคิวรอซิงค์; ถ้าเน็ตหลุด/ส่งไม่ผ่าน จะค้างในคิวไว้รอต่อเน็ตใหม่
 */
export async function queuePosSaleAndSync(
  sale: PosSaleRow,
  eventId: string,
  settings: PosConnectionSettings
): Promise<{ syncedNow: boolean; pendingCount: number }> {
  const item: PendingPosOrder = {
    id: sale.id || `pos-${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventId,
    sale,
    queuedAt: new Date().toISOString(),
  };

  const queue = [...getPendingOrders(), item];
  savePendingOrders(queue);

  if (!isOnline()) {
    return { syncedNow: false, pendingCount: queue.length };
  }

  const backend = getActiveBackend(settings);
  let ok = false;
  try {
    ok =
      backend === 'google_sheets'
        ? await pushSaleToGoogleSheets(sale, settings)
        : await recordPosSaleToSupabase(sale, eventId);
  } catch {
    ok = false;
  }

  if (ok) {
    const remaining = getPendingOrders().filter((q) => q.id !== item.id);
    savePendingOrders(remaining);
    return { syncedNow: true, pendingCount: remaining.length };
  }

  return { syncedNow: false, pendingCount: getPendingOrders().length };
}

/**
 * ส่งออเดอร์ที่ค้างในเครื่อง + สถานะฐานข้อมูลที่ค้างซิงค์ ขึ้น Cloud เมื่อกลับมาออนไลน์
 */
export async function flushOfflineSyncQueue(
  state: AppDatabaseState
): Promise<{ syncedOrders: number; remainingOrders: number; stateSynced: boolean }> {
  if (!isOnline()) {
    return {
      syncedOrders: 0,
      remainingOrders: getPendingOrdersCount(),
      stateSynced: false,
    };
  }

  const backend = getActiveBackend(state.settings);
  const queue = getPendingOrders();
  const stillPending: PendingPosOrder[] = [];
  let syncedOrders = 0;

  for (const item of queue) {
    let ok = false;
    try {
      ok =
        backend === 'google_sheets'
          ? await pushSaleToGoogleSheets(item.sale, state.settings)
          : await recordPosSaleToSupabase(item.sale, item.eventId);
    } catch {
      ok = false;
    }
    if (ok) syncedOrders++;
    else stillPending.push(item);
  }

  savePendingOrders(stillPending);

  let stateSynced = false;
  if (isStateDirty() || syncedOrders > 0) {
    stateSynced = await pushStateToActiveCloud(state);
  }

  return {
    syncedOrders,
    remainingOrders: stillPending.length,
    stateSynced,
  };
}

/**
 * ตรวจสอบและซิงค์รายการที่ค้างทั้งหมดขึ้น Cloud ก่อนอนุญาตให้ล้างข้อมูลในเครื่อง
 * (ทำได้เมื่อออนไลน์เท่านั้น)
 */
export async function verifyAndSyncAllToCloud(state: AppDatabaseState): Promise<{
  ok: boolean;
  syncedOrders: number;
  remainingOrders: number;
  backendLabel: string;
  verifiedAt: string;
  error?: string;
}> {
  const backend = getActiveBackend(state.settings);
  const backendLabel = backend === 'google_sheets' ? 'Google Sheets' : 'Supabase';

  if (!isOnline()) {
    return {
      ok: false,
      syncedOrders: 0,
      remainingOrders: getPendingOrdersCount(),
      backendLabel,
      verifiedAt: '',
      error: 'กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนดำเนินการ',
    };
  }

  // หากใช้โหมด Google Sheets แบบ OAuth ให้ขอ Token สดก่อนกวาดซิงค์ (ป้องกัน Token หมดอายุ)
  if (backend === 'google_sheets' && state.settings.sheetId && !state.settings.appsScriptUrl) {
    if (!getCachedGoogleToken()) {
      try {
        const clientId = getGoogleClientId(state.settings.googleClientId);
        await requestGoogleAccessToken(clientId, true);
      } catch (err: any) {
        return {
          ok: false,
          syncedOrders: 0,
          remainingOrders: getPendingOrdersCount(),
          backendLabel,
          verifiedAt: '',
          error: err?.message || 'กรุณาเชื่อมต่อบัญชี Google ก่อนตรวจสอบและล้างข้อมูล',
        };
      }
    }
  }

  const flushRes = await flushOfflineSyncQueue(state);
  if (flushRes.remainingOrders > 0) {
    return {
      ok: false,
      syncedOrders: flushRes.syncedOrders,
      remainingOrders: flushRes.remainingOrders,
      backendLabel,
      verifiedAt: '',
      error: `ยังมี ${flushRes.remainingOrders} ออเดอร์ที่ซิงค์ขึ้น ${backendLabel} ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่`,
    };
  }

  const stateOk = await pushStateToActiveCloud(state);
  if (!stateOk) {
    return {
      ok: false,
      syncedOrders: flushRes.syncedOrders,
      remainingOrders: 0,
      backendLabel,
      verifiedAt: '',
      error: `ไม่สามารถยืนยันการบันทึกข้อมูลขึ้น ${backendLabel} ได้ กรุณาตรวจสอบการตั้งค่า Cloud`,
    };
  }

  return {
    ok: true,
    syncedOrders: flushRes.syncedOrders,
    remainingOrders: 0,
    backendLabel,
    verifiedAt: new Date().toLocaleTimeString('th-TH'),
  };
}
