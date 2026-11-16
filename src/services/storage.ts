import { AppDatabaseState, IngredientLot, PackagingLot, PosConnectionSettings } from '../types';
import { fetchSheetGvizRows } from './posSync';
import { createInitialSeedState } from './seedData';
import { pullStateFromSupabase, pushStateToSupabase } from './supabase';

const STORAGE_KEY = 'boothbook_db_v1';
try {
  localStorage.removeItem('refv_cost_pnl_db_v1');
} catch {
  // ignore
}

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
    if (!parsed || !Array.isArray(parsed.packagingItems) || !Array.isArray(parsed.recipes)) {
      const seed = ensureEventSnapshots(createInitialSeedState());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return ensureEventSnapshots(parsed);
  } catch {
    return ensureEventSnapshots(createInitialSeedState());
  }
}

function mergeById<T extends { id: string }>(diskList: T[] = [], localList: T[] = []): T[] {
  const map = new Map<string, T>();
  for (const item of diskList) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of localList) {
    if (item && item.id) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function mergeLocalAndDiskState(
  local: AppDatabaseState,
  disk: AppDatabaseState
): AppDatabaseState {
  const mergedRecipes = mergeById(disk.recipes, local.recipes).map((r) => {
    const diskR = (disk.recipes || []).find((x) => x.id === r.id);
    const localR = (local.recipes || []).find((x) => x.id === r.id);
    if (localR && diskR) {
      return (localR.ingredients?.length || 0) >= (diskR.ingredients?.length || 0) ? localR : diskR;
    }
    return localR || diskR || r;
  });

  const mergedEvents = (disk.events || []).map((diskEv) => {
    const localEv = (local.events || []).find((x) => x.id === diskEv.id);
    if (!localEv) return diskEv;
    const diskBatches = diskEv.boothBatches?.length || 0;
    const localBatches = localEv.boothBatches?.length || 0;
    if (diskBatches > localBatches) {
      return {
        ...localEv,
        boothBatches: diskEv.boothBatches,
        flavorProductionUsages: diskEv.flavorProductionUsages || localEv.flavorProductionUsages,
      };
    }
    return localEv;
  });
  for (const localEv of local.events || []) {
    if (!mergedEvents.some((x) => x.id === localEv.id)) {
      mergedEvents.push(localEv);
    }
  }

  return {
    settings: local.settings || disk.settings,
    packagingItems: mergeById(disk.packagingItems, local.packagingItems),
    packagingLots: mergeById(disk.packagingLots, local.packagingLots),
    ingredients: mergeById(disk.ingredients, local.ingredients),
    ingredientLots: mergeById(disk.ingredientLots, local.ingredientLots),
    recipes: mergedRecipes,
    events: mergedEvents,
  };
}

/**
 * โหลดข้อมูลจากไฟล์จริงในเครื่อง (/Users/itspopstix/REFV Tax/data/database.json)
 * และผสานกับข้อมูลล่าสุดบนหน้าเว็บเพื่อไม่ให้ข้อมูลที่กรอกค้างไว้สูญหาย
 */
export async function loadStateFromDiskOrCloud(
  currentState: AppDatabaseState
): Promise<{ state: AppDatabaseState; source: 'disk' | 'cloud' | 'seed' }> {
  try {
    const res = await fetch('/api/db', { cache: 'no-store' });
    if (res.ok) {
      const diskData = (await res.json()) as AppDatabaseState;
      if (diskData && Array.isArray(diskData.recipes) && Array.isArray(diskData.packagingItems)) {
        const merged = mergeLocalAndDiskState(currentState, diskData);
        const normalized = ensureEventSnapshots(merged);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        await saveToDiskFile(normalized);
        return { state: normalized, source: 'disk' };
      }
    } else if (res.status === 404) {
      const cloudData = await pullDatabaseFromGoogleSheets(currentState.settings);
      if (cloudData) {
        const normalized = ensureEventSnapshots(cloudData);
        await saveToDiskFile(normalized);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return { state: normalized, source: 'cloud' };
      }
      await saveToDiskFile(currentState);
    }
  } catch {
    const cloudData = await pullDatabaseFromGoogleSheets(currentState.settings);
    if (cloudData) {
      const normalized = ensureEventSnapshots(cloudData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return { state: normalized, source: 'cloud' };
    }
  }

  return { state: currentState, source: 'seed' };
}

export async function saveToDiskFile(state: AppDatabaseState): Promise<boolean> {
  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** ส่งข้อมูลขึ้น Supabase (ตารางของผู้ใช้ที่ล็อกอินอยู่) */
export async function pushDatabaseToGoogleSheets(state: AppDatabaseState): Promise<boolean> {
  try {
    return await pushStateToSupabase(state);
  } catch {
    return false;
  }
}

/** ดึงข้อมูลจาก Supabase ของผู้ใช้ที่ล็อกอินอยู่ (ชื่อฟังก์ชันคงเดิมเพื่อไม่ให้แก้หลายจุด) */
export async function pullDatabaseFromGoogleSheets(
  _settings: PosConnectionSettings
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

  saveToDiskFile(state).then((diskOk) => {
    if (onStatusChange) {
      onStatusChange({
        diskSaved: diskOk,
        cloudSynced: false,
        lastSavedAt: timeStr,
        message: diskOk
          ? `บันทึกลงไฟล์ data/database.json แล้ว (${timeStr})`
          : `บันทึกในเครื่องแล้ว (${timeStr})`,
      });
    }
  });

  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    const cloudOk = await pushDatabaseToGoogleSheets(state);
    if (onStatusChange) {
      onStatusChange({
        diskSaved: true,
        cloudSynced: cloudOk,
        lastSavedAt: new Date().toLocaleTimeString('th-TH'),
        message: cloudOk
          ? `บันทึกครบทั้งไฟล์ในเครื่อง + Supabase (${new Date().toLocaleTimeString('th-TH')})`
          : `บันทึกลงไฟล์ data/database.json ในเครื่องแล้ว (${timeStr})`,
      });
    }
  }, 1200);
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
