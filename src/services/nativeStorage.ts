import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

const IDB_NAME = 'BoothBookPersistentDB';
const IDB_STORE = 'kv';
const IDB_VERSION = 1;

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getStorageEngineLabel(): string {
  if (isNativeApp()) {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') return 'iOS Native Storage (ไม่หายแม้เครื่องเต็ม)';
    return 'Native Device Storage';
  }
  return 'IndexedDB + Local Storage';
}

/* ---------- IndexedDB helpers (Web / PWA) ---------- */

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // fallback handled by localStorage
  }
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openIdb();
    const res = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res;
  } catch {
    return null;
  }
}

async function idbRemove(key: string): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

/* ---------- Unified Zero-Data-Loss Persistence API ---------- */

const toFileName = (key: string) => `boothbook_${key.replace(/[^a-z0-9_-]/gi, '_')}.json`;

/**
 * บันทึก JSON ลงพื้นที่ถาวรของอุปกรณ์:
 * - บน iOS App Store (Capacitor): เขียนตรงลง Directory.Data (Library/Application Support) ซึ่ง iOS ห้ามลบเด็ดขาดตราบใดที่ไม่ลบแอป
 * - บน Web / PWA: เขียนคู่ทั้ง IndexedDB + localStorage
 */
export async function persistJson<T>(key: string, value: T): Promise<void> {
  const serialized = JSON.stringify(value);

  // Mirror ใน localStorage เสมอเพื่อการอ่านแบบ sync ทันที
  try {
    localStorage.setItem(key, serialized);
  } catch {
    // ignore quota errors
  }

  if (isNativeApp()) {
    try {
      await Filesystem.writeFile({
        path: toFileName(key),
        data: serialized,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      await Preferences.set({ key: `${key}_updated_at`, value: new Date().toISOString() });
      return;
    } catch (err) {
      console.error('Native Filesystem write failed, falling back to Preferences/IDB:', err);
    }
  }

  await idbSet(key, serialized);
}

/**
 * อ่าน JSON จากพื้นที่ถาวรของอุปกรณ์:
 * - บน iOS App Store: อ่านจาก Directory.Data ก่อนเสมอ (กู้คืนได้ 100% แม้ WKWebView localStorage ถูก iOS ล้าง)
 * - บน Web / PWA: อ่านจาก IndexedDB ก่อนแล้วค่อย fallback ไป localStorage
 */
export async function readPersistedJson<T>(key: string): Promise<T | null> {
  if (isNativeApp()) {
    try {
      const file = await Filesystem.readFile({
        path: toFileName(key),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      const text = typeof file.data === 'string' ? file.data : '';
      if (text) {
        try {
          localStorage.setItem(key, text);
        } catch {
          // ignore
        }
        return JSON.parse(text) as T;
      }
    } catch {
      // file not created yet — fall through
    }
  }

  const fromIdb = await idbGet(key);
  if (fromIdb) {
    try {
      localStorage.setItem(key, fromIdb);
    } catch {
      // ignore
    }
    try {
      return JSON.parse(fromIdb) as T;
    } catch {
      // ignore
    }
  }

  try {
    const fromLs = localStorage.getItem(key);
    if (fromLs) return JSON.parse(fromLs) as T;
  } catch {
    // ignore
  }

  return null;
}

export async function removePersistedKey(key: string): Promise<void> {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }

  if (isNativeApp()) {
    try {
      await Filesystem.deleteFile({
        path: toFileName(key),
        directory: Directory.Data,
      });
      await Preferences.remove({ key: `${key}_updated_at` });
    } catch {
      // ignore
    }
  }

  await idbRemove(key);
}
