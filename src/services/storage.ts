import { AppDatabaseState, IngredientLot, PackagingLot, PosConnectionSettings } from '../types';
import { createInitialSeedState } from './seedData';
import { pullStateFromSupabase, pushStateToSupabase } from './supabase';

const STORAGE_KEY = 'boothbook_db_v1';

export type SyncStatusInfo = {
  diskSaved: boolean;
  cloudSynced: boolean;
  lastSavedAt: string;
  message: string;
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
    if (!parsed || !Array.isArray(parsed.recipes) || parsed.recipes.length === 0) {
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
 * ดึงข้อมูลล่าสุดจาก Supabase (ถ้ามี) หรือใช้ข้อมูลในเครื่อง
 */
export async function loadStateFromDiskOrCloud(
  currentState: AppDatabaseState
): Promise<{ state: AppDatabaseState; source: 'disk' | 'cloud' | 'seed' }> {
  // 1. ลองดึงจาก Supabase ก่อนเป็นอันดับแรกเสมอ
  try {
    const cloudData = await pullStateFromSupabase();
    if (cloudData && Array.isArray(cloudData.recipes) && cloudData.recipes.length > 0) {
      const normalized = ensureEventSnapshots(cloudData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return { state: normalized, source: 'cloud' };
    }
  } catch (err) {
    console.warn('Could not pull from Supabase:', err);
  }

  // 2. ถ้าในเครื่องมีข้อมูลและมีสูตรอยู่แล้ว ให้ใช้ต่อ
  if (currentState && Array.isArray(currentState.recipes) && currentState.recipes.length > 0) {
    return { state: currentState, source: 'disk' };
  }

  // 3. Fallback เป็น initial seed (ซึ่งมีสูตร 9 รสชาติและยอดขาย Slow Combo ครบแล้ว)
  const seed = ensureEventSnapshots(createInitialSeedState());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return { state: seed, source: 'seed' };
}

export async function saveToDiskFile(state: AppDatabaseState): Promise<boolean> {
  return true;
}

/** ส่งข้อมูลขึ้น Supabase */
export async function pushDatabaseToGoogleSheets(state: AppDatabaseState): Promise<boolean> {
  try {
    return await pushStateToSupabase(state);
  } catch {
    return false;
  }
}

/** ดึงข้อมูลจาก Supabase */
export async function pullDatabaseFromGoogleSheets(
  _settings?: PosConnectionSettings
): Promise<AppDatabaseState | null> {
  try {
    const st = await pullStateFromSupabase();
    return st && Array.isArray(st.recipes) ? ensureEventSnapshots(st) : null;
  } catch {
    return null;
  }
}

export function saveAppState(
  state: AppDatabaseState,
  onStatusChange?: (status: SyncStatusInfo) => void
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }

  const timeStr = new Date().toLocaleTimeString('th-TH');

  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    const cloudOk = await pushDatabaseToGoogleSheets(state);
    if (onStatusChange) {
      onStatusChange({
        diskSaved: true,
        cloudSynced: cloudOk,
        lastSavedAt: new Date().toLocaleTimeString('th-TH'),
        message: cloudOk
          ? `บันทึกข้อมูลและซิงค์กับ Supabase สำเร็จ (${new Date().toLocaleTimeString('th-TH')})`
          : `บันทึกข้อมูลในเครื่องแล้ว (${timeStr})`,
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
