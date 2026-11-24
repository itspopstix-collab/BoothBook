import { AppDatabaseState, PosConnectionSettings } from '../types';
import { createInitialSeedState } from './seedData';
import {
  getActiveBackend,
  getPendingOrdersCount,
  isOnline,
  markStateDirty,
  pullStateFromActiveCloud,
  pushStateToActiveCloud,
} from './offlineSync';
import { persistJson, readPersistedJson } from './nativeStorage';

const STORAGE_KEY = 'boothbook_db_clean_v2';
try {
  localStorage.removeItem('boothbook_db_v1');
  localStorage.removeItem('refv_cost_pnl_db_v1');
} catch {
  // ignore
}

export type SyncStatusInfo = {
  diskSaved: boolean;
  cloudSynced: boolean;
  lastSavedAt: string;
  message: string;
  pendingCount?: number;
  offline?: boolean;
};

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function ensureEventSnapshots(state: AppDatabaseState): AppDatabaseState {
  let changed = false;
  const events = (state.events || []).map((ev) => {
    if (!ev.recipeSnapshots || ev.recipeSnapshots.length === 0) {
      changed = true;
      return {
        ...ev,
        recipeSnapshots: JSON.parse(JSON.stringify(state.recipes || [])),
      };
    }
    return ev;
  });
  return changed ? { ...state, events } : state;
}

export function loadAppState(): AppDatabaseState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = ensureEventSnapshots(createInitialSeedState());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as AppDatabaseState;
    if (!parsed || !Array.isArray(parsed.recipes) || !Array.isArray(parsed.events)) {
      const seed = ensureEventSnapshots(createInitialSeedState());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return ensureEventSnapshots(parsed);
  } catch {
    return ensureEventSnapshots(createInitialSeedState());
  }
}

/**
 * โหลดข้อมูลล่าสุดจาก Cloud ที่เลือก (Supabase หรือ Google Sheets)
 * หากออฟไลน์หรือยังไม่มีข้อมูลบน Cloud จะใช้ข้อมูลสำรองใน Local Storage ของเครื่องทันที
 */
export async function loadStateFromDiskOrCloud(
  currentState: AppDatabaseState
): Promise<{ state: AppDatabaseState; source: 'local' | 'cloud' | 'seed' }> {
  // 1. กู้คืนจากพื้นที่ถาวรของอุปกรณ์ก่อนเสมอ (iOS Native Directory.Data / IndexedDB)
  let bestLocalState = currentState;
  try {
    const persisted = await readPersistedJson<AppDatabaseState>(STORAGE_KEY);
    if (persisted && Array.isArray(persisted.recipes) && Array.isArray(persisted.events)) {
      bestLocalState = ensureEventSnapshots(persisted);
    }
  } catch {
    // ignore
  }

  // 2. ถ้าออนไลน์อยู่ ลองดึงข้อมูลล่าสุดจาก Cloud (Supabase หรือ Google Sheets)
  try {
    const cloudData = await pullStateFromActiveCloud(bestLocalState.settings);
    if (cloudData && Array.isArray(cloudData.recipes)) {
      const normalized = ensureEventSnapshots(cloudData);
      await persistJson(STORAGE_KEY, normalized);
      return { state: normalized, source: 'cloud' };
    }
  } catch (err) {
    console.warn('Could not pull from cloud, using native/local backup:', err);
  }

  return { state: bestLocalState, source: 'local' };
}

export async function pushDatabaseToGoogleSheets(state: AppDatabaseState): Promise<boolean> {
  try {
    return await pushStateToActiveCloud(state);
  } catch {
    return false;
  }
}

export async function pullDatabaseFromGoogleSheets(
  settings: PosConnectionSettings
): Promise<AppDatabaseState | null> {
  try {
    const st = await pullStateFromActiveCloud(settings);
    return st && Array.isArray(st.recipes) ? ensureEventSnapshots(st) : null;
  } catch {
    return null;
  }
}

export function saveAppState(
  state: AppDatabaseState,
  onStatusChange?: (status: SyncStatusInfo) => void
): void {
  // 1. สำรองข้อมูลลงพื้นที่ถาวรของเครื่องนี้ทันที (iOS Native Directory.Data / IndexedDB + localStorage)
  void persistJson(STORAGE_KEY, state);

  const timeStr = new Date().toLocaleTimeString('th-TH');
  const backendLabel =
    getActiveBackend(state.settings) === 'google_sheets' ? 'Google Sheets' : 'Supabase';

  if (!isOnline()) {
    markStateDirty(true);
    if (onStatusChange) {
      onStatusChange({
        diskSaved: true,
        cloudSynced: false,
        lastSavedAt: timeStr,
        offline: true,
        pendingCount: getPendingOrdersCount(),
        message: `โหมดออฟไลน์: สำรองข้อมูลในเครื่องแล้ว (รอซิงค์ขึ้น ${backendLabel} เมื่อต่อเน็ต)`,
      });
    }
    return;
  }

  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    const cloudOk = await pushDatabaseToGoogleSheets(state);
    if (onStatusChange) {
      onStatusChange({
        diskSaved: true,
        cloudSynced: cloudOk,
        lastSavedAt: new Date().toLocaleTimeString('th-TH'),
        offline: !isOnline(),
        pendingCount: getPendingOrdersCount(),
        message: cloudOk
          ? `สำรองในเครื่อง + ซิงค์ขึ้น ${backendLabel} สำเร็จ (${new Date().toLocaleTimeString('th-TH')})`
          : `สำรองในเครื่องแล้ว (รอซิงค์ขึ้น ${backendLabel} ภายหลัง)`,
      });
    }
  }, 1000);
}

export function resetToDemoState(): AppDatabaseState {
  const seed = ensureEventSnapshots(createInitialSeedState());
  saveAppState(seed);
  return seed;
}

export function clearDemoTransactionsOnly(current: AppDatabaseState): AppDatabaseState {
  const cleaned: AppDatabaseState = {
    ...current,
    packagingLots: [],
    ingredientLots: current.ingredientLots,
    events: [],
  };
  saveAppState(cleaned);
  return cleaned;
}

export function formatBaht(n: number, decimals = 2): string {
  const val = Number(n) || 0;
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  return (
    sign +
    '฿' +
    abs.toLocaleString('th-TH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function formatSignedBaht(n: number, decimals = 2): string {
  const val = Number(n) || 0;
  const sign = val > 0 ? '+' : val < 0 ? '-' : '';
  const abs = Math.abs(val);
  return (
    sign +
    '฿' +
    abs.toLocaleString('th-TH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}
