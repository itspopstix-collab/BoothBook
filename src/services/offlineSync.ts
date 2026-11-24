import { AppDatabaseState, CloudStorageBackend, PosConnectionSettings, PosSaleRow } from '../types';
import {
  pullStateFromSupabase,
  pushStateToSupabase,
  recordPosSaleToSupabase,
} from './supabase';

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
  try {
    localStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(list));
  } catch {
    // ignore storage quota errors
  }
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

/* ---------- Google Sheets Cloud Backend (Apps Script Web App) ---------- */

async function pushSaleToGoogleSheets(
  sale: PosSaleRow,
  settings: PosConnectionSettings
): Promise<boolean> {
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

export async function pushStateToGoogleSheetsBackend(state: AppDatabaseState): Promise<boolean> {
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
  settings: PosConnectionSettings
): Promise<AppDatabaseState | null> {
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
