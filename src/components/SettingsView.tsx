import React, { useMemo, useRef, useState } from 'react';
import { AppDatabaseState, CloudStorageBackend } from '../types';
import { fetchAllPosSalesFromCloud } from '../services/posSync';
import { getStorageEngineLabel } from '../services/nativeStorage';
import { resyncRangeAndVerifyCloud } from '../services/offlineSync';
import {
  connectAndCreateGoogleSheet,
  getGoogleClientId,
  saveGoogleClientId,
} from '../services/googleSheetsAuth';
import {
  Link2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  CloudUpload,
  CloudDownload,
  HardDrive,
  Database,
  FileSpreadsheet,
  Wifi,
  WifiOff,
  RefreshCw,
  ShieldCheck,
  Calendar,
  Crown,
  X,
  Check,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
  onPruneLocalState?: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
  onPushCloud?: () => Promise<void>;
  onPullCloud?: () => Promise<void>;
  onFlushOfflineQueue?: () => Promise<void>;
  onPendingCountChange?: (count: number) => void;
  pendingSyncCount?: number;
  isOnline?: boolean;
  cloudBusy?: boolean;
}

export const SettingsView: React.FC<Props> = ({
  state,
  onUpdateState,
  onPruneLocalState,
  onPushCloud,
  onPullCloud,
  onFlushOfflineQueue,
  onPendingCountChange,
  pendingSyncCount = 0,
  isOnline = true,
  cloudBusy,
}) => {
  // Release 1: ใช้ Google Sheets เป็นหลักก่อน (comment Supabase ออกชั่วคราว)
  const [storageBackend, setStorageBackend] = useState<CloudStorageBackend>('google_sheets');
  const [sheetId, setSheetId] = useState(state.settings.sheetId);
  const [appsScriptUrl, setAppsScriptUrl] = useState(state.settings.appsScriptUrl);
  const [googleClientId, setGoogleClientId] = useState(() =>
    getGoogleClientId(state.settings.googleClientId)
  );
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleNotice, setGoogleNotice] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [shopName, setShopName] = useState(state.settings.shopName);
  const [branchName, setBranchName] = useState(state.settings.branchName);
  const [promptPayNumber, setPromptPayNumber] = useState(state.settings.promptPayNumber || '');
  const [testStatus, setTestStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Modal เลือกแพ็กเกจ (UI Preview / Mockup)
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [selectedBoothPack, setSelectedBoothPack] = useState<string>('pack-7');
  const [selectedStoragePlan, setSelectedStoragePlan] = useState<string>('gs-free');
  const boothCarouselRef = useRef<HTMLDivElement>(null);
  const storageCarouselRef = useRef<HTMLDivElement>(null);
  const slideCarousel = (ref: React.RefObject<HTMLDivElement | null>, dir: 'left' | 'right') => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' });
  };
  const [purchasedPackage, setPurchasedPackage] = useState<{
    boothId: string;
    boothLabel: string;
    boothQuota: number | 'unlimited';
    storageId: string;
    storageProvider: string;
    storageLabel: string;
    billQuota: number | 'unlimited';
    totalPaid: number;
    activatedAt: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem('boothbook_preview_package_v1');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const BOOTH_PACKS = [
    { id: 'pack-1', label: '1 รอบออกบูธ', desc: 'ทดลองออกบูธ · ไม่เกิน 15 วัน/งาน', price: 69, quota: 1 as number | 'unlimited' },
    { id: 'pack-3', label: '3 รอบออกบูธ', desc: 'เฉลี่ยรอบละ 63฿ · ไม่เกิน 15 วัน/งาน', price: 189, quota: 3 as number | 'unlimited' },
    { id: 'pack-7', label: '7 รอบออกบูธ', desc: 'เฉลี่ยรอบละ 57฿ · ไม่เกิน 15 วัน/งาน', price: 399, badge: 'ยอดนิยม', quota: 7 as number | 'unlimited' },
    { id: 'pack-15', label: '15 รอบออกบูธ', desc: 'เฉลี่ยรอบละ ~51฿ · ไม่เกิน 15 วัน/งาน', price: 769, quota: 15 as number | 'unlimited' },
    { id: 'pack-unlimited', label: 'ออกบูธไม่จำกัดรอบ (รายปี)', desc: 'ออกบูธไม่จำกัดจำนวนรอบ · ไม่เกิน 15 วัน/งาน', price: 1690, badge: 'คุ้มที่สุด', quota: 'unlimited' as number | 'unlimited' },
  ];

  const STORAGE_PLANS = [
    { id: 'gs-free', provider: 'Google Sheets', label: 'ไม่จำกัดบิล', desc: 'เก็บลง Google Sheet ของร้านเอง', price: 0, badge: 'ฟรี', quota: 'unlimited' as number | 'unlimited' },
    // Release 1: ซ่อนแพ็กเกจ Supabase Cloud ไว้ก่อน
    // { id: 'sb-500', provider: 'Supabase Cloud', label: '500 บิล', desc: 'ซิงค์ไว แยกสิทธิ์ Owner / Staff', price: 29, quota: 500 as number | 'unlimited' },
    // { id: 'sb-1000', provider: 'Supabase Cloud', label: '1,000 บิล', desc: 'เหมาะกับงาน 3–7 บูธ', price: 49, quota: 1000 as number | 'unlimited' },
    // { id: 'sb-2000', provider: 'Supabase Cloud', label: '2,000 บิล', desc: 'ออกบูธต่อเนื่องหลายงาน', price: 89, quota: 2000 as number | 'unlimited' },
    // { id: 'sb-unlimited', provider: 'Supabase Cloud', label: 'Unlimited ตลอดชีพ', desc: 'ไม่จำกัดจำนวนบิล ใช้งานได้ตลอดไป', price: 149, badge: 'แนะนำ', quota: 'unlimited' as number | 'unlimited' },
  ];

  const activeBoothObj = BOOTH_PACKS.find((p) => p.id === selectedBoothPack) || BOOTH_PACKS[0];
  const activeStorageObj = STORAGE_PLANS.find((p) => p.id === selectedStoragePlan) || STORAGE_PLANS[0];
  const totalPackagePrice = activeBoothObj.price + activeStorageObj.price;

  const handleConfirmMockPackage = () => {
    const nextPkg = {
      boothId: activeBoothObj.id,
      boothLabel: activeBoothObj.label,
      boothQuota: activeBoothObj.quota,
      storageId: activeStorageObj.id,
      storageProvider: activeStorageObj.provider,
      storageLabel: activeStorageObj.label,
      billQuota: activeStorageObj.quota,
      totalPaid: totalPackagePrice,
      activatedAt: new Date().toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    };
    setPurchasedPackage(nextPkg);
    try {
      localStorage.setItem('boothbook_preview_package_v1', JSON.stringify(nextPkg));
    } catch {
      // ignore
    }
    // สลับระบบเก็บข้อมูลให้ตรงกับแพ็กเกจที่เลือกอัตโนมัติ
    handleSelectBackend(activeStorageObj.id === 'gs-free' ? 'google_sheets' : 'supabase');
    setShowPackageModal(false);
  };

  // State สำหรับฟีเจอร์ Resync & ล้างข้อมูลเก่าในเครื่อง (รวมขั้นตอน Sync + ลบในปุ่มเดียว)
  const [syncingAndPruning, setSyncingAndPruning] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState<{ type: 'ok' | 'err'; msg: string } | null>(
    null
  );
  const [pruneStartDate, setPruneStartDate] = useState<string>('2020-01-01');
  const [pruneEndDate, setPruneEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });

  const matchingLocalOrdersCount = useMemo(() => {
    if (!pruneStartDate || !pruneEndDate) return 0;
    let count = 0;
    for (const ev of state.events || []) {
      for (const s of ev.posSales || []) {
        const dt = (s.date || '').slice(0, 10);
        if (dt && dt >= pruneStartDate && dt <= pruneEndDate) count++;
      }
    }
    return count;
  }, [state.events, pruneStartDate, pruneEndDate]);

  const totalLocalOrdersCount = useMemo(() => {
    return (state.events || []).reduce((sum, ev) => sum + (ev.posSales?.length || 0), 0);
  }, [state.events]);

  const setPresetOlderThanDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setPruneStartDate('2020-01-01');
    setPruneEndDate(d.toISOString().slice(0, 10));
  };

  const handleResyncAndPrune = async () => {
    if (!isOnline) {
      setCleanupNotice({
        type: 'err',
        msg: 'ต้องเชื่อมต่ออินเทอร์เน็ตก่อนเท่านั้น จึงจะ Sync และล้างข้อมูลในเครื่องได้',
      });
      return;
    }
    if (matchingLocalOrdersCount === 0) {
      setCleanupNotice({ type: 'err', msg: 'ไม่พบรายการขายในช่วงวันที่ที่เลือก' });
      return;
    }

    const ok = window.confirm(
      `ยืนยัน Sync และคืนความจำเครื่องสำหรับรายการวันที่ ${pruneStartDate} ถึง ${pruneEndDate} (${matchingLocalOrdersCount.toLocaleString()} รายการ)?\n\n• ระบบจะซิงค์ข้อมูลในช่วงเวลานี้ขึ้น ${activeBackendLabel} ให้ครบก่อน\n• จากนั้นจึงจะลบรายการที่ซิงค์แล้วออกจากหน่วยความจำเครื่องนี้ (ข้อมูลบน ${activeBackendLabel} ยังอยู่ครบ 100%)`
    );
    if (!ok) return;

    setSyncingAndPruning(true);
    setCleanupNotice(null);
    try {
      // 1. หลังบ้าน: Sync (Upsert ตาม Primary Key) รายการในช่วงเวลาที่เลือกขึ้น Cloud ก่อน
      const res = await resyncRangeAndVerifyCloud(state, pruneStartDate, pruneEndDate);
      onPendingCountChange?.(res.remainingOrders);
      if (!res.ok) {
        setCleanupNotice({
          type: 'err',
          msg: res.error || 'Sync ข้อมูลไม่สำเร็จ ระบบจึงยังไม่ลบรายการในเครื่อง',
        });
        return;
      }

      // 2. หลังบ้าน: เมื่อ Sync สำเร็จครบถ้วนแล้ว ค่อยลบรายการในช่วงนั้นออกจากเครื่อง
      const pruneFn = onPruneLocalState || onUpdateState;
      pruneFn((prev) => ({
        ...prev,
        events: (prev.events || []).map((ev) => ({
          ...ev,
          posSales: (ev.posSales || []).filter((s) => {
            const dt = (s.date || '').slice(0, 10);
            return !(dt && dt >= pruneStartDate && dt <= pruneEndDate);
          }),
        })),
      }));

      setCleanupNotice({
        type: 'ok',
        msg: `Sync ขึ้น ${res.backendLabel} และคืนความจำเครื่องเรียบร้อยแล้ว ${matchingLocalOrdersCount.toLocaleString()} รายการ (ข้อมูลบน ${res.backendLabel} อยู่ครบ 100%)`,
      });
    } finally {
      setSyncingAndPruning(false);
    }
  };

  const activeBackendLabel = storageBackend === 'google_sheets' ? 'Google Sheets' : 'Supabase';

  const handleSelectBackend = (backend: CloudStorageBackend) => {
    setStorageBackend(backend);
    onUpdateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        storageBackend: backend,
      },
    }));
  };

  const handleOneClickConnectGoogleSheet = async () => {
    if (!isOnline) {
      setGoogleNotice({ type: 'err', msg: 'กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนเชื่อมต่อ Google Sheet' });
      return;
    }
    setGoogleConnecting(true);
    setGoogleNotice(null);
    try {
      if (googleClientId.trim()) {
        saveGoogleClientId(googleClientId.trim());
      }
      const res = await connectAndCreateGoogleSheet(state, googleClientId.trim());
      setSheetId(res.spreadsheetId);
      onUpdateState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          storageBackend: 'google_sheets',
          sheetId: res.spreadsheetId,
          googleSheetUrl: res.spreadsheetUrl,
          googleAccountEmail: res.email,
          googleClientId: googleClientId.trim() || prev.settings.googleClientId,
        },
      }));
      setStorageBackend('google_sheets');
      setGoogleNotice({
        type: 'ok',
        msg: `สร้าง Google Sheet อัตโนมัติสำเร็จ! (${res.email || 'Google Account'}) พร้อมซิงค์ออเดอร์และสำรองข้อมูลแล้ว`,
      });
    } catch (err: any) {
      setGoogleNotice({
        type: 'err',
        msg: err?.message || 'เชื่อมต่อ Google Sheet ไม่สำเร็จ',
      });
    } finally {
      setGoogleConnecting(false);
    }
  };

  const resolvedGoogleSheetUrl =
    state.settings.googleSheetUrl ||
    (state.settings.sheetId
      ? `https://docs.google.com/spreadsheets/d/${state.settings.sheetId}/edit`
      : '');

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanedSheetId = sheetId.trim();
    const match = cleanedSheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      cleanedSheetId = match[1];
      setSheetId(cleanedSheetId);
    }

    onUpdateState((prev) => ({
      ...prev,
      settings: {
        storageBackend,
        sheetId: cleanedSheetId,
        appsScriptUrl: appsScriptUrl.trim(),
        shopName: shopName.trim() || 'BoothBook',
        branchName: branchName.trim() || 'Main',
        promptPayNumber: promptPayNumber.trim(),
      },
    }));

    setTestStatus({
      type: 'ok',
      msg: `บันทึกการตั้งค่าลงเครื่องและเตรียมซิงค์กับ ${activeBackendLabel} เรียบร้อยแล้ว`,
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await fetchAllPosSalesFromCloud({
        sheetId: sheetId.trim(),
        appsScriptUrl: appsScriptUrl.trim(),
        shopName,
        branchName,
      });
      setTestStatus({
        type: 'ok',
        msg: `เชื่อมต่อ POS สำเร็จ (${res.source}) — พบข้อมูลการขายทั้งหมด ${res.sales.length} ชิ้น`,
      });
    } catch (err) {
      setTestStatus({
        type: 'err',
        msg: `ไม่สามารถเชื่อมต่อได้: ${String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* แบนเนอร์แพ็กเกจปัจจุบัน (แสดงแยก 2 แบบ: ยังไม่ได้ซื้อ vs เลือกแพ็กเกจแล้ว) */}
      {!purchasedPackage ? (
        <div className="bg-gradient-to-r from-[#0d3a57] via-[#11649c] to-[#118cd1] rounded-2xl p-5 sm:p-6 shadow-md text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-black tracking-wide">
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              แพ็กเกจปัจจุบัน: ฟรี (Free Plan)
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight">
              อัปเกรด BoothBook เพื่อปลดล็อกรอบออกบูธและ Cloud
            </h2>
            <p className="text-xs text-white/85">
              เลือกแพ็กเกจจำนวนรอบออกบูธได้ตามต้องการ เริ่มต้นเพียง 69฿ · เก็บข้อมูลลง Google Sheets ของร้านฟรีตลอดชีพ
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPackageModal(true)}
            className="shrink-0 inline-flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-[#0d3a57] font-black px-5 py-3 rounded-xl text-sm shadow-lg transition active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            เลือกแพ็กเกจ / อัปเกรด
          </button>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-900 via-teal-800 to-[#0d3a57] rounded-2xl p-5 sm:p-6 shadow-md text-white space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/30 text-emerald-200 text-[11px] font-black">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                แพ็กเกจที่ใช้งานอยู่ · เปิดใช้งานเมื่อ {purchasedPackage.activatedAt}
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex flex-wrap items-center gap-2">
                <Crown className="w-5 h-5 text-amber-300 shrink-0" />
                <span>{purchasedPackage.boothLabel}</span>
                <span className="text-white/50">+</span>
                <span className="text-sky-200">
                  {purchasedPackage.storageProvider} ({purchasedPackage.storageLabel})
                </span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowPackageModal(true)}
                className="inline-flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-[#0d3a57] font-black px-4 py-2 rounded-xl text-xs shadow transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                เปลี่ยน / ซื้อเพิ่ม
              </button>
            </div>
          </div>

          {/* แถบแสดงสิทธิ์คงเหลือ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-white/15 text-xs">
            <div className="bg-white/10 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-white/70 font-semibold">โควตารอบออกบูธ</div>
              <div className="text-sm font-black mt-0.5">
                {purchasedPackage.boothQuota === 'unlimited'
                  ? 'ไม่จำกัดรอบ (ตลอดชีพ)'
                  : `ใช้ไป ${state.events.length} / ${purchasedPackage.boothQuota} รอบ`}
              </div>
            </div>
            <div className="bg-white/10 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-white/70 font-semibold">โควตาบิล Cloud</div>
              <div className="text-sm font-black mt-0.5">
                {purchasedPackage.billQuota === 'unlimited'
                  ? 'ไม่จำกัดบิล (ตลอดชีพ)'
                  : `ใช้ไป ${totalLocalOrdersCount.toLocaleString()} / ${purchasedPackage.billQuota.toLocaleString()} บิล`}
              </div>
            </div>
            <div className="bg-white/10 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-white/70 font-semibold">ระบบเก็บข้อมูลที่เลือก</div>
              <div className="text-sm font-black text-amber-300 mt-0.5">
                {purchasedPackage.storageProvider}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* เลือกวิธีการเก็บข้อมูลบน Cloud + ระบบสำรองออฟไลน์ในเครื่อง */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#eae3cf] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-[#118cd1]" />
            <div>
              <h2 className="text-lg font-extrabold text-[#0d3a57]">
                ระบบจัดเก็บข้อมูล ({activeBackendLabel} + Offline-First)
              </h2>
              <p className="text-xs text-[#6b8799]">
                รองรับการติดตั้งและใช้งานบนทุกอุปกรณ์ (มือถือ / แท็บเล็ต / คอม) โดยสำรองข้อมูลไว้ในเครื่องนี้เสมอ
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? 'ออนไลน์พร้อมซิงค์' : 'ออฟไลน์ (สำรองในเครื่อง)'}
          </span>
        </div>

        {/* Release 1: ใช้ Google Sheets เป็นระบบเก็บข้อมูลหลัก (comment Supabase ออกชั่วคราว) */}
        <div className="p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-[#0d3a57] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Google Sheets
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white">
              กำลังใช้งาน
            </span>
          </div>
          <p className="text-xs text-[#6b8799]">
            เก็บออเดอร์และสำรองข้อมูลลง Google Sheet ของร้านคุณโดยตรง เปิดดูและส่งต่อบัญชีได้ทันที
          </p>
        </div>

        {/* แผงเชื่อมต่อ Google Sheet แบบ 1 คลิก (แสดงเมื่อเลือกโหมด Google Sheets) */}
        {storageBackend === 'google_sheets' && (
          <div className="bg-[#fef9ec] rounded-2xl p-4 sm:p-5 border-2 border-emerald-200 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="text-sm font-black text-[#0d3a57]">
                    เชื่อมต่อ Google Sheet อัตโนมัติ (1 คลิก)
                  </div>
                  <p className="text-xs text-[#6b8799]">
                    กดปุ่มเพื่อล็อกอิน Google แล้วระบบจะสร้างไฟล์ชีท (Sales / Events_Summary / BoothBook_DB) ให้ทันที
                  </p>
                </div>
              </div>
              {state.settings.googleAccountEmail && (
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                  {state.settings.googleAccountEmail}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleOneClickConnectGoogleSheet}
                disabled={googleConnecting || !isOnline}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-xl text-xs shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${googleConnecting ? 'animate-spin' : ''}`} />
                {googleConnecting
                  ? 'กำลังล็อกอิน & สร้าง Google Sheet...'
                  : resolvedGoogleSheetUrl
                  ? 'สร้างชีทใหม่ / เปลี่ยนบัญชี Google'
                  : 'เชื่อมต่อ Google & สร้างชีทอัตโนมัติ'}
              </button>

              {resolvedGoogleSheetUrl && (
                <a
                  href={resolvedGoogleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-white hover:bg-emerald-50 text-emerald-800 border-2 border-emerald-300 font-black px-4 py-2.5 rounded-xl text-xs transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  เปิดดู Google Sheet (แท็บใหม่)
                </a>
              )}
            </div>

            {googleNotice && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  googleNotice.type === 'ok'
                    ? 'bg-emerald-100/70 text-emerald-900 border border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {googleNotice.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{googleNotice.msg}</span>
              </div>
            )}

            {/* ตั้งค่า Google OAuth Client ID (ซ่อนอัตโนมัติเมื่อฝัง Client ID ของระบบแล้ว) */}
            {!getGoogleClientId() && (
              <details className="text-xs text-[#6b8799] pt-1">
                <summary className="cursor-pointer font-bold hover:text-[#0d3a57]">
                  ตั้งค่า Google OAuth Client ID (สำหรับผู้พัฒนาตั้งค่าครั้งแรก)
                </summary>
                <div className="mt-2 space-y-1.5">
                  <input
                    type="text"
                    value={googleClientId}
                    onChange={(e) => {
                      setGoogleClientId(e.target.value);
                      saveGoogleClientId(e.target.value);
                    }}
                    placeholder="xxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com"
                    className="w-full bg-white border border-[#eae3cf] rounded-xl px-3 py-2 text-xs font-mono text-[#0d3a57]"
                  />
                  <p className="text-[11px] text-[#6b8799]">
                    * เมื่อใส่ค่านี้ลงใน <code>VITE_GOOGLE_CLIENT_ID</code> ตอน Build แอปจริง ลูกค้าปลายทางจะกดปุ่มด้านบนแล้วล็อกอินได้ทันทีโดยไม่เห็นช่องนี้
                  </p>
                </div>
              </details>
            )}
          </div>
        )}

        {/* กล่องสถานะ Offline Backup & Sync Queue */}
        <div className="bg-emerald-50/80 rounded-2xl p-4 border border-emerald-200 space-y-2.5">
          <div className="text-xs font-extrabold text-emerald-950">
            พื้นที่จัดเก็บในเครื่องปัจจุบัน: <span className="text-[#118cd1]">{getStorageEngineLabel()}</span>
          </div>
          <ul className="text-xs text-emerald-900 space-y-1 list-disc pl-5 font-medium">
            <li>
              <b>สำรองข้อมูลถาวรในเครื่องอัตโนมัติ:</b> บนแอป iOS ข้อมูลจะถูกเขียนลง <b>iOS Native Filesystem (Directory.Data)</b> ซึ่ง iOS ห้ามลบทิ้งตราบใดที่ไม่ลบแอป ส่วนบนเว็บจะเก็บคู่ใน <b>IndexedDB + Local Storage</b>
            </li>
            <li>
              <b>ซิงค์ขึ้น {activeBackendLabel} อัตโนมัติเมื่อต่อเน็ต:</b> หากเน็ตหลุด ออเดอร์จะถูกเก็บเข้าคิวรอซิงค์ไว้ และจะถูกส่งขึ้น <b>{activeBackendLabel}</b> อัตโนมัติทันทีที่กลับมาต่อ Wi-Fi/เน็ต
            </li>
          </ul>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {pendingSyncCount > 0 && onFlushOfflineQueue && (
              <button
                type="button"
                onClick={onFlushOfflineQueue}
                disabled={!isOnline || cloudBusy}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${cloudBusy ? 'animate-spin' : ''}`} />
                ซิงค์ออเดอร์ที่ค้างอยู่ ({pendingSyncCount} รายการ)
              </button>
            )}
            {onPushCloud && (
              <button
                type="button"
                onClick={onPushCloud}
                disabled={!isOnline || cloudBusy}
                className="inline-flex items-center gap-2 bg-[#118cd1] hover:bg-[#0e78b5] text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4" />
                ส่งข้อมูลทั้งหมดขึ้น {activeBackendLabel} เดี๋ยวนี้
              </button>
            )}
            {onPullCloud && (
              <button
                type="button"
                onClick={onPullCloud}
                disabled={!isOnline || cloudBusy}
                className="inline-flex items-center gap-2 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
              >
                <CloudDownload className="w-4 h-4 text-[#118cd1]" />
                ดึงข้อมูลล่าสุดจาก {activeBackendLabel} ลงเครื่องนี้
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ตั้งค่าร้านค้า & ช่องทางเชื่อมต่อ */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#eae3cf] space-y-4">
        <div className="flex items-center gap-2.5">
          <Link2 className="w-5 h-5 text-[#118cd1]" />
          <div>
            <h2 className="text-lg font-extrabold text-[#0d3a57]">
              ข้อมูลร้านค้า & การเชื่อมต่อ ({activeBackendLabel})
            </h2>
            <p className="text-xs text-[#6b8799]">
              {storageBackend === 'google_sheets'
                ? 'ตั้งค่าชื่อร้าน เบอร์พร้อมเพย์สำหรับสแกน QR หน้า POS และลิงก์ Google Sheet'
                : 'ตั้งค่าชื่อร้าน และเบอร์พร้อมเพย์สำหรับสแกน QR หน้า POS'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#6b8799] mb-1">
                ชื่อร้าน / แบรนด์
              </label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full border-2 border-[#eae3cf] rounded-xl px-3.5 py-2 text-sm font-bold text-[#0d3a57]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6b8799] mb-1">สาขา / ทีมงาน</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="w-full border-2 border-[#eae3cf] rounded-xl px-3.5 py-2 text-sm font-bold text-[#0d3a57]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6b8799] mb-1">
                เบอร์พร้อมเพย์ / เลข 13 หลัก (สำหรับ QR POS)
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="เช่น 0812345678"
                value={promptPayNumber}
                onChange={(e) => setPromptPayNumber(e.target.value)}
                className="w-full border-2 border-[#eae3cf] rounded-xl px-3.5 py-2 text-sm font-bold text-[#0d3a57]"
              />
            </div>
          </div>

          {storageBackend === 'google_sheets' && (
            <>
              <div>
                <label className="block text-xs font-bold text-[#6b8799] mb-1">
                  Google Sheet ID (หรือวางลิงก์ Google Sheet ของ POS ได้เลย)
                </label>
                <input
                  type="text"
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
                  placeholder="วาง Sheet ID ของคุณที่นี่"
                  className="w-full border-2 border-[#eae3cf] rounded-xl px-3.5 py-2 text-sm font-mono font-semibold text-[#0d3a57]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6b8799] mb-1">
                  Google Apps Script Web App URL (จาก POS config.json)
                </label>
                <input
                  type="url"
                  value={appsScriptUrl}
                  onChange={(e) => setAppsScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full border-2 border-[#eae3cf] rounded-xl px-3.5 py-2 text-sm font-mono font-semibold text-[#0d3a57]"
                />
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              className="bg-[#118cd1] hover:bg-[#0e78b5] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition cursor-pointer"
            >
              บันทึกการตั้งค่า
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="bg-[#90d4ec]/30 hover:bg-[#90d4ec]/50 text-[#0d3a57] font-bold px-4 py-2.5 rounded-xl text-sm transition cursor-pointer"
            >
              {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อกับ POS'}
            </button>
          </div>
        </form>

        {testStatus && (
          <div
            className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
              testStatus.type === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {testStatus.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{testStatus.msg}</span>
          </div>
        )}
      </div>

      {/* Resync & คืนความจำเครื่อง (รวม Sync + ลบในปุ่มเดียว) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#eae3cf] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#118cd1]" />
            <div>
              <h2 className="text-lg font-extrabold text-[#0d3a57]">
                Resync & คืนความจำเครื่อง
              </h2>
              <p className="text-xs text-[#6b8799]">
                เลือกช่วงเวลาแล้วกด Sync ระบบจะซิงค์ข้อมูลขึ้น <b>{activeBackendLabel}</b> ให้ครบก่อน แล้วล้างรายการที่ซิงค์แล้วออกจากเครื่องให้อัตโนมัติ
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#6b8799] bg-[#fef9ec] px-3 py-1 rounded-full border border-[#eae3cf]">
            ออเดอร์ในเครื่องทั้งหมด: <b className="text-[#0d3a57]">{totalLocalOrdersCount.toLocaleString()}</b> รายการ
          </span>
        </div>

        {!isOnline ? (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2.5">
            <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              ล็อกฟีเจอร์ชั่วคราว: ต้องเชื่อมต่ออินเทอร์เน็ตก่อนเท่านั้น จึงจะ Sync และคืนความจำเครื่องได้
            </span>
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-[#eae3cf] bg-[#fef9ec]/50 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold text-[#0d3a57]">
              <Calendar className="w-4 h-4 text-[#118cd1]" />
              <span>เลือกช่วงเวลาที่จะ Resync</span>
              <span className="relative inline-flex items-center group">
                <button
                  type="button"
                  aria-label="ข้อมูลเพิ่มเติมเกี่ยวกับช่วงเวลาที่จะ Resync"
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#118cd1]/15 text-[#118cd1] hover:bg-[#118cd1] hover:text-white transition cursor-help"
                >
                  <Info className="w-3 h-3" />
                </button>
                <span
                  role="tooltip"
                  className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 sm:w-72 p-2.5 rounded-xl bg-[#0d3a57] text-white text-[11px] font-medium leading-relaxed shadow-lg z-30 pointer-events-none"
                >
                  ระบบจะทำการกวาดข้อมูลที่ยังไม่ถูก Sync ภายในช่วงที่ระบุ เพื่อนำไปเก็บไว้ในฐานข้อมูลที่เลือกไว้
                </span>
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'เก่ากว่า 30 วัน', days: 30 },
                { label: 'เก่ากว่า 90 วัน', days: 90 },
                { label: 'เก่ากว่า 6 เดือน', days: 180 },
              ].map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => setPresetOlderThanDays(preset.days)}
                  className="px-3 py-1 rounded-lg text-[11px] font-bold bg-white border border-[#eae3cf] text-[#0d3a57] hover:bg-[#fef9ec] cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#6b8799] mb-1">ตั้งแต่วันที่</label>
                <input
                  type="date"
                  value={pruneStartDate}
                  onChange={(e) => setPruneStartDate(e.target.value)}
                  className="w-full bg-white border border-[#eae3cf] rounded-xl px-3 py-2 text-xs font-bold text-[#0d3a57]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#6b8799] mb-1">ถึงวันที่</label>
                <input
                  type="date"
                  value={pruneEndDate}
                  onChange={(e) => setPruneEndDate(e.target.value)}
                  className="w-full bg-white border border-[#eae3cf] rounded-xl px-3 py-2 text-xs font-bold text-[#0d3a57]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs text-[#0d3a57]">
                พบรายการขายในช่วงนี้:{' '}
                <b className="text-[#118cd1]">{matchingLocalOrdersCount.toLocaleString()} รายการ</b>
              </div>
              <button
                type="button"
                disabled={syncingAndPruning || !isOnline || matchingLocalOrdersCount === 0}
                onClick={handleResyncAndPrune}
                className="inline-flex items-center gap-2 bg-[#118cd1] hover:bg-[#0e78b5] text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-sm transition cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-4 h-4 ${syncingAndPruning ? 'animate-spin' : ''}`} />
                {syncingAndPruning
                  ? `กำลัง Sync ขึ้น ${activeBackendLabel} และคืนความจำ...`
                  : `Sync (${matchingLocalOrdersCount.toLocaleString()} รายการ)`}
              </button>
            </div>
          </div>
        )}

        {cleanupNotice && (
          <div
            className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
              cleanupNotice.type === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {cleanupNotice.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{cleanupNotice.msg}</span>
          </div>
        )}
      </div>
      {/* Modal เลือกแพ็กเกจ (UI Preview) */}
      {showPackageModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0d3a57]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowPackageModal(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-[#eae3cf] overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#0d3a57] to-[#118cd1] px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-lg font-black">เลือกแพ็กเกจ BoothBook</h3>
                  <p className="text-xs text-white/80">
                    ปรับเลือกจำนวนรอบออกบูธและโควตาบิล Cloud ได้ตามสไตล์ร้านคุณ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-6 max-h-[72vh] overflow-y-auto">
              {/* ส่วนที่ 1: จำนวนรอบออกบูธ (Carousel) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-[#0d3a57]">
                      1. เลือกจำนวนรอบออกบูธ (รายปี)
                    </h4>
                    <span className="text-[11px] font-bold text-[#6b8799]">
                      แต่ละ Event เลือกระยะเวลาได้ไม่เกิน 15 วัน · เลื่อนซ้าย-ขวาเพื่อเลือก
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => slideCarousel(boothCarouselRef, 'left')}
                      className="w-7 h-7 rounded-full border border-[#eae3cf] bg-white hover:bg-[#fef9ec] text-[#0d3a57] flex items-center justify-center shadow-2xs cursor-pointer"
                      aria-label="เลื่อนซ้าย"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => slideCarousel(boothCarouselRef, 'right')}
                      className="w-7 h-7 rounded-full border border-[#eae3cf] bg-white hover:bg-[#fef9ec] text-[#0d3a57] flex items-center justify-center shadow-2xs cursor-pointer"
                      aria-label="เลื่อนขวา"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={boothCarouselRef}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {BOOTH_PACKS.map((pack) => {
                    const isSelected = selectedBoothPack === pack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setSelectedBoothPack(pack.id)}
                        className={`min-w-[205px] sm:min-w-[220px] shrink-0 snap-start text-left p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'border-[#118cd1] bg-[#118cd1]/5 shadow-sm'
                            : 'border-[#eae3cf] bg-[#fef9ec]/40 hover:border-[#90d4ec]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            {pack.badge ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                {pack.badge}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-[#6b8799]">แพ็กเกจบูธ</span>
                            )}
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 ${
                                isSelected
                                  ? 'bg-[#118cd1] border-[#118cd1] text-white'
                                  : 'border-[#cbd5e1] bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </span>
                          </div>
                          <div className="font-extrabold text-base text-[#0d3a57]">
                            {pack.label}
                          </div>
                          <p className="text-[11px] text-[#6b8799] leading-snug">{pack.desc}</p>
                        </div>

                        <div className="pt-2 border-t border-[#eae3cf]/70 flex items-baseline justify-between">
                          <span className="text-[11px] font-bold text-[#6b8799]">ราคาต่อปี</span>
                          <span className="text-lg font-black text-[#118cd1]">
                            ฿{pack.price.toLocaleString()}
                            <span className="text-[11px] font-bold text-[#6b8799] ml-0.5">/ปี</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ส่วนที่ 2: จำนวนบิล & ระบบเก็บข้อมูล Cloud (Carousel + ข้อดี Database) */}
              <div className="space-y-3 pt-4 border-t border-[#eae3cf]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-[#0d3a57]">
                      2. เลือกโควตาบิลและระบบเก็บข้อมูล Cloud
                    </h4>
                    <span className="text-[11px] font-bold text-emerald-700">
                      Google Sheets ฟรีตลอดชีพ! · เลื่อนเลือกการ์ดด้านล่าง
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => slideCarousel(storageCarouselRef, 'left')}
                      className="w-7 h-7 rounded-full border border-[#eae3cf] bg-white hover:bg-[#fef9ec] text-[#0d3a57] flex items-center justify-center shadow-2xs cursor-pointer"
                      aria-label="เลื่อนซ้าย"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => slideCarousel(storageCarouselRef, 'right')}
                      className="w-7 h-7 rounded-full border border-[#eae3cf] bg-white hover:bg-[#fef9ec] text-[#0d3a57] flex items-center justify-center shadow-2xs cursor-pointer"
                      aria-label="เลื่อนขวา"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* กล่องบอกข้อดีของ Google Sheets (Release 1 — comment Supabase ออกชั่วคราว) */}
                <div className="grid grid-cols-1 gap-2.5 text-[11px]">
                  <div className="rounded-xl p-3 border bg-emerald-50/90 border-emerald-300">
                    <div className="flex items-center gap-1.5 font-black text-emerald-900 text-xs mb-1">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ข้อดีของ Google Sheets
                    </div>
                    <ul className="space-y-0.5 text-emerald-900/90 list-disc list-inside leading-relaxed">
                      <li>ฟรี! ใช้ Google Drive ของร้านเอง ไม่มีค่าบิลเพิ่ม</li>
                      <li>เปิดดูยอดขาย/แต่งตาราง/ส่งบัญชีในมือถือได้ทันที</li>
                      <li>เหมาะกับขาย 1–2 เครื่อง (ห้ามเผลอลบหัวตารางในชีท)</li>
                    </ul>
                  </div>

                  {/* Release 1: ซ่อนกล่อง Supabase Cloud ชั่วคราว
                  <div className="rounded-xl p-3 border bg-sky-50/40 border-sky-200/70">
                    <div className="flex items-center gap-1.5 font-black text-[#0d3a57] text-xs mb-1">
                      <Database className="w-3.5 h-3.5 text-[#118cd1] shrink-0" />
                      ข้อดีของ Supabase Cloud
                    </div>
                    <ul className="space-y-0.5 text-[#0d3a57]/90 list-disc list-inside leading-relaxed">
                      <li>เร็ว เสถียร ขายพร้อมกันหลายเครื่องช่วงคนแน่นไม่ชนกัน</li>
                      <li>รองรับบิลเยอะหลักหมื่น-แสนบิล กู้คืนข้ามเครื่องไว</li>
                      <li>ปลอดภัย โครงสร้างล็อกไว้ไม่พังเพราะมือลั่นแก้ไฟล์</li>
                    </ul>
                  </div>
                  */}
                </div>

                {/* การ์ดสไลด์เลือกแพ็กเกจ Cloud */}
                <div
                  ref={storageCarouselRef}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {STORAGE_PLANS.map((plan) => {
                    const isSelected = selectedStoragePlan === plan.id;
                    const isGS = plan.provider === 'Google Sheets';
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedStoragePlan(plan.id)}
                        className={`min-w-[215px] sm:min-w-[230px] shrink-0 snap-start text-left p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'border-[#118cd1] bg-[#118cd1]/5 shadow-sm'
                            : 'border-[#eae3cf] bg-[#fef9ec]/40 hover:border-[#90d4ec]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                                isGS
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-white border-[#eae3cf] text-[#0d3a57]'
                              }`}
                            >
                              {plan.provider}
                            </span>
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 ${
                                isSelected
                                  ? 'bg-[#118cd1] border-[#118cd1] text-white'
                                  : 'border-[#cbd5e1] bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-base text-[#0d3a57]">
                              {plan.label}
                            </span>
                            {plan.badge && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  plan.price === 0
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {plan.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#6b8799] leading-snug">{plan.desc}</p>
                        </div>

                        <div className="pt-2 border-t border-[#eae3cf]/70 flex items-baseline justify-between">
                          <span className="text-[11px] font-bold text-[#6b8799]">ค่าบริการ</span>
                          <span
                            className={`text-lg font-black ${
                              plan.price === 0 ? 'text-emerald-600' : 'text-[#118cd1]'
                            }`}
                          >
                            {plan.price === 0 ? 'ฟรี' : `+฿${plan.price.toLocaleString()}`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer: สรุปยอดรวม */}
            <div className="bg-[#fef9ec] border-t border-[#eae3cf] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold text-[#6b8799]">
                  {activeBoothObj.label} + {activeStorageObj.provider} ({activeStorageObj.label})
                </div>
                <div className="text-xl font-black text-[#0d3a57]">
                  ยอดรวมทั้งสิ้น: <span className="text-[#118cd1]">฿{totalPackagePrice.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPackageModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs text-[#6b8799] hover:bg-white cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMockPackage}
                  className="px-6 py-2.5 rounded-xl font-black text-sm bg-[#118cd1] hover:bg-[#0e78b5] text-white shadow-md transition active:scale-95 cursor-pointer"
                >
                  ยืนยันเลือกแพ็กเกจนี้ (฿{totalPackagePrice.toLocaleString()})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
