import { BoothEvent } from '../types';

export const DAY_QUOTA_STORAGE_KEY = 'boothbook_preview_package_v1';

export interface DayPassPack {
  id: string;
  label: string;
  daysLabel: string;
  price: number;
  avgPerDay: string;
  discount: string | null;
  badge: string;
  highlightBadge: boolean;
  quota: number;
}

export const DAY_PASS_PACKS: DayPassPack[] = [
  {
    id: 'day-1',
    label: '1 วัน',
    daysLabel: '1 วันขายจริง',
    price: 39,
    avgPerDay: '฿39.00',
    discount: null,
    badge: 'เหมาะกับลองใช้ / งานวันเดียว',
    highlightBadge: false,
    quota: 1,
  },
  {
    id: 'day-7',
    label: '1 สัปดาห์',
    daysLabel: '7 วันขายจริง',
    price: 149,
    avgPerDay: '฿21.29',
    discount: 'ลด 45.4%',
    badge: 'ออกบูธในห้าง 1 รอบ',
    highlightBadge: false,
    quota: 7,
  },
  {
    id: 'day-15',
    label: 'คุ้มค่า',
    daysLabel: '15 วันขายจริง',
    price: 249,
    avgPerDay: '฿16.60',
    discount: 'ลด 57.4%',
    badge: 'ออกบูธต่อเนื่องหลายงาน',
    highlightBadge: false,
    quota: 15,
  },
  {
    id: 'day-30',
    label: 'เหมาสุดคุ้ม',
    daysLabel: '30 วันขายจริง',
    price: 349,
    avgPerDay: '฿11.63',
    discount: 'ลด 70.2%',
    badge: 'ยอดนิยม',
    highlightBadge: true,
    quota: 30,
  },
];

export interface PurchasedPackageState {
  boothId: string;
  boothLabel: string;
  boothQuota: number; // จำนวนวันขายจริงสะสมทั้งหมดที่ซื้อไว้
  storageId: string;
  storageProvider: string;
  storageLabel: string;
  billQuota: number | 'unlimited';
  totalPaid: number;
  activatedAt: string;
}

export function loadPurchasedPackage(): PurchasedPackageState | null {
  try {
    const raw = localStorage.getItem(DAY_QUOTA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...parsed,
      boothQuota: typeof parsed.boothQuota === 'number' ? parsed.boothQuota : 0,
    };
  } catch {
    return null;
  }
}

export function addPurchasedDayPack(
  pack: DayPassPack,
  storage: { id: string; provider: string; label: string; quota: number | 'unlimited'; price: number }
): PurchasedPackageState {
  const prev = loadPurchasedPackage();
  const prevDays = prev && typeof prev.boothQuota === 'number' ? prev.boothQuota : 0;
  const nextTotalDays = prevDays + pack.quota;

  const nextPkg: PurchasedPackageState = {
    boothId: pack.id,
    boothLabel: pack.label,
    boothQuota: nextTotalDays,
    storageId: storage.id,
    storageProvider: storage.provider,
    storageLabel: storage.label,
    billQuota: storage.quota,
    totalPaid: pack.price + storage.price,
    activatedAt: new Date().toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  };

  try {
    localStorage.setItem(DAY_QUOTA_STORAGE_KEY, JSON.stringify(nextPkg));
  } catch {
    // ignore storage errors
  }
  return nextPkg;
}

/** คำนวณจำนวนวันขายจริงของช่วงวันที่ (นับรวมวันเริ่มและวันสิ้นสุด ขั้นต่ำ 1 วัน) */
export function calcEventDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 1;
  const end = endDate && endDate >= startDate ? endDate : startDate;
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 1;
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
}

export function calcTotalUsedEventDays(events: BoothEvent[]): number {
  return (events || []).reduce((sum, ev) => sum + calcEventDays(ev.startDate, ev.endDate), 0);
}
