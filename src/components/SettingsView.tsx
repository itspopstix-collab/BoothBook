import React, { useMemo, useRef, useState } from 'react';
import { AppDatabaseState, CloudStorageBackend } from '../types';
import { fetchAllPosSalesFromCloud } from '../services/posSync';
import { clearDemoTransactionsOnly, resetToDemoState } from '../services/storage';
import { getStorageEngineLabel } from '../services/nativeStorage';
import { verifyAndSyncAllToCloud } from '../services/offlineSync';
import {
  Link2,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building2,
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
  Trash2,
  Calendar,
  Crown,
  X,
  Check,
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
  const [storageBackend, setStorageBackend] = useState<CloudStorageBackend>(
    state.settings.storageBackend || 'supabase'
  );
  const [sheetId, setSheetId] = useState(state.settings.sheetId);
  const [appsScriptUrl, setAppsScriptUrl] = useState(state.settings.appsScriptUrl);
  const [shopName, setShopName] = useState(state.settings.shopName);
  const [branchName, setBranchName] = useState(state.settings.branchName);
  const [promptPayNumber, setPromptPayNumber] = useState(state.settings.promptPayNumber || '');
  const [testStatus, setTestStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Modal เลือกแพ็กเกจ (UI Preview / Mockup)
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [selectedBoothPack, setSelectedBoothPack] = useState<string>('pack-7');
  const [selectedStoragePlan, setSelectedStoragePlan] = useState<string>('sb-unlimited');

  const BOOTH_PACKS = [
    { id: 'pack-1', label: '1 รอบออกบูธ', desc: 'เหมาะสำหรับทดลองออกบูธครั้งแรก', price: 69 },
    { id: 'pack-3', label: '3 รอบออกบูธ', desc: 'เฉลี่ยรอบละ 43฿', price: 129 },
    { id: 'pack-7', label: '7 รอบออกบูธ', desc: 'เฉลี่ยรอบละ 27฿', price: 189, badge: 'ยอดนิยม' },
    { id: 'pack-15', label: '15 รอบออกบูธ', desc: 'เฉลี่ยรอบละ 17฿', price: 259 },
    { id: 'pack-lifetime', label: 'POS ตลอดชีพ', desc: 'ออกบูธไม่จำกัดรอบ จ่ายครั้งเดียวจบ', price: 2999, badge: 'คุ้มที่สุด' },
  ];

  const STORAGE_PLANS = [
    { id: 'gs-free', provider: 'Google Sheets', label: 'ไม่จำกัดบิล', desc: 'เก็บลง Google Sheet ของร้านเอง', price: 0, badge: 'ฟรี' },
    { id: 'sb-500', provider: 'Supabase Cloud', label: '500 บิล', desc: 'ซิงค์ไว แยกสิทธิ์ Owner / Staff', price: 29 },
    { id: 'sb-1000', provider: 'Supabase Cloud', label: '1,000 บิล', desc: 'เหมาะกับงาน 3–7 บูธ', price: 49 },
    { id: 'sb-2000', provider: 'Supabase Cloud', label: '2,000 บิล', desc: 'ออกบูธต่อเนื่องหลายงาน', price: 89 },
    { id: 'sb-unlimited', provider: 'Supabase Cloud', label: 'Unlimited ตลอดชีพ', desc: 'ไม่จำกัดจำนวนบิล จ่ายครั้งเดียวใช้ได้ตลอดไป', price: 149, badge: 'แนะนำ' },
  ];

  const activeBoothObj = BOOTH_PACKS.find((p) => p.id === selectedBoothPack) || BOOTH_PACKS[0];
  const activeStorageObj = STORAGE_PLANS.find((p) => p.id === selectedStoragePlan) || STORAGE_PLANS[0];
  const totalPackagePrice = activeBoothObj.price + activeStorageObj.price;

  // State สำหรับฟีเจอร์ล้างข้อมูลเก่าในเครื่องแบบปลอดภัย (ต้องออนไลน์ + ตรวจซิงค์ Cloud ผ่านก่อน)
  const [verifyingCloud, setVerifyingCloud] = useState(false);
  const [cloudVerifiedInfo, setCloudVerifiedInfo] = useState<{
    verifiedAt: string;
    backendLabel: string;
    syncedOrders: number;
  } | null>(null);
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

  const handleVerifyCloudBeforeCleanup = async () => {
    if (!isOnline) {
      setCleanupNotice({
        type: 'err',
        msg: 'ต้องเชื่อมต่ออินเทอร์เน็ตก่อนเท่านั้น จึงจะตรวจสอบและล้างข้อมูลในเครื่องได้',
      });
      return;
    }
    setVerifyingCloud(true);
    setCleanupNotice(null);
    setCloudVerifiedInfo(null);
    try {
      const res = await verifyAndSyncAllToCloud(state);
      onPendingCountChange?.(res.remainingOrders);
      if (res.ok) {
        setCloudVerifiedInfo({
          verifiedAt: res.verifiedAt,
          backendLabel: res.backendLabel,
          syncedOrders: res.syncedOrders,
        });
        setCleanupNotice({
          type: 'ok',
          msg: `ตรวจสอบและซิงค์ข้อมูลทั้งหมดขึ้น ${res.backendLabel} ครบ 100% แล้ว (ซิงค์เพิ่ม ${res.syncedOrders} รายการ · เวลา ${res.verifiedAt}) — สามารถเลือกช่วงวันที่เพื่อล้างออกจากเครื่องได้แล้ว`,
        });
      } else {
        setCleanupNotice({
          type: 'err',
          msg: res.error || 'ตรวจสอบการซิงค์ไม่สำเร็จ',
        });
      }
    } finally {
      setVerifyingCloud(false);
    }
  };

  const handlePruneLocalOrders = () => {
    if (!isOnline || !cloudVerifiedInfo) return;
    if (matchingLocalOrdersCount === 0) {
      setCleanupNotice({ type: 'err', msg: 'ไม่พบรายการขายในช่วงวันที่ที่เลือก' });
      return;
    }
    const ok = window.confirm(
      `ยืนยันลบรายการขายจำนวน ${matchingLocalOrdersCount.toLocaleString()} รายการ (วันที่ ${pruneStartDate} ถึง ${pruneEndDate}) ออกจากหน่วยความจำเครื่องนี้?\n\n• ข้อมูลที่ซิงค์ขึ้น ${cloudVerifiedInfo.backendLabel} แล้วยังอยู่ครบ 100%\n• สูตรสินค้าและสต็อกในเครื่องจะไม่ถูกลบ`
    );
    if (!ok) return;

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
      msg: `ล้างรายการขายเก่าออกจากเครื่องนี้แล้ว ${matchingLocalOrdersCount.toLocaleString()} รายการ (ข้อมูลบน ${cloudVerifiedInfo.backendLabel} ยังคงอยู่ครบ 100%)`,
    });
    setCloudVerifiedInfo(null);
  };

  const importRef = useRef<HTMLInputElement | null>(null);

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

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `refv-cost-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppDatabaseState;
        if (parsed && Array.isArray(parsed.packagingItems) && Array.isArray(parsed.recipes)) {
          onUpdateState(() => parsed);
          setTestStatus({ type: 'ok', msg: 'นำเข้าข้อมูลสำรองสำเร็จแล้ว!' });
        } else {
          alert('รูปแบบไฟล์สำรองข้อมูลไม่ถูกต้อง');
        }
      } catch {
        alert('ไม่สามารถอ่านไฟล์ JSON ได้');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* แบนเนอร์แพ็กเกจปัจจุบัน & ปุ่มอัปเกรด */}
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
            เลือกแพ็กเกจจำนวนรอบออกบูธได้ตามต้องการ เริ่มต้นเพียง 69฿ · เก็บข้อมูลลง Google Sheets ฟรี หรือเลือก Supabase Cloud ตลอดชีพ
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

      {/* เลือกวิธีการเก็บข้อมูลบน Cloud + ระบบสำรองออฟไลน์ในเครื่อง */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#eae3cf] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-[#118cd1]" />
            <div>
              <h2 className="text-lg font-extrabold text-[#0d3a57]">
                ระบบจัดเก็บข้อมูล (Offline-First + เลือก Cloud ได้ 2 แบบ)
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

        {/* ตัวเลือก Cloud 2 แบบ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleSelectBackend('supabase')}
            className={`text-left p-4 rounded-2xl border-2 transition cursor-pointer space-y-1.5 ${
              storageBackend === 'supabase'
                ? 'border-[#118cd1] bg-[#118cd1]/5 shadow-xs'
                : 'border-[#eae3cf] bg-[#fef9ec]/40 hover:border-[#90d4ec]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm text-[#0d3a57] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#118cd1]" />
                1. Supabase Cloud
              </span>
              {storageBackend === 'supabase' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#118cd1] text-white">
                  กำลังใช้งาน
                </span>
              )}
            </div>
            <p className="text-xs text-[#6b8799]">
              ฐานข้อมูลจริง แยกสิทธิ์ Owner / Staff POS อัตโนมัติ ซิงค์หลายเครื่องได้พร้อมกันแบบ Real-time
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectBackend('google_sheets')}
            className={`text-left p-4 rounded-2xl border-2 transition cursor-pointer space-y-1.5 ${
              storageBackend === 'google_sheets'
                ? 'border-[#118cd1] bg-[#118cd1]/5 shadow-xs'
                : 'border-[#eae3cf] bg-[#fef9ec]/40 hover:border-[#90d4ec]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm text-[#0d3a57] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                2. Google Sheets
              </span>
              {storageBackend === 'google_sheets' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#118cd1] text-white">
                  กำลังใช้งาน
                </span>
              )}
            </div>
            <p className="text-xs text-[#6b8799]">
              ส่งออเดอร์และสำรองข้อมูลลง Google Sheet ของร้านผ่าน Apps Script Web App URL
            </p>
          </button>
        </div>

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
              ตั้งค่าชื่อร้าน เบอร์พร้อมเพย์สำหรับสแกน QR หน้า POS และลิงก์ Google Sheet (กรณีใช้โหมด Google Sheets)
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

      {/* ล้างรายการเก่าในเครื่องเพื่อคืนความจำ (ต้องออนไลน์ + ตรวจซิงค์ Cloud ครบก่อนเท่านั้น) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#eae3cf] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#118cd1]" />
            <div>
              <h2 className="text-lg font-extrabold text-[#0d3a57]">
                คืนความจำเครื่อง (ล้างรายการขายเก่าเฉพาะในเครื่องนี้)
              </h2>
              <p className="text-xs text-[#6b8799]">
                ระบบจะตรวจสอบและซิงค์รายการที่ค้างขึ้น <b>{activeBackendLabel}</b> ให้ครบ 100% ก่อน จึงจะเปิดให้เลือกช่วงวันที่ลบได้ (ข้อมูลบน Cloud ไม่ถูกลบ)
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
              ล็อกฟีเจอร์ชั่วคราว: ต้องเชื่อมต่ออินเทอร์เน็ตก่อนเท่านั้น จึงจะตรวจสอบการซิงค์และล้างข้อมูลในเครื่องได้ (ป้องกันข้อมูลที่ยังไม่ซิงค์สูญหาย)
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ขั้นที่ 1: ตรวจสอบและซิงค์รายการที่ค้างขึ้น Cloud */}
            <div className="p-4 rounded-2xl bg-[#fef9ec]/70 border border-[#eae3cf] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-[#0d3a57]">
                  ขั้นที่ 1: ตรวจสอบ & ซิงค์รายการที่ค้างขึ้น {activeBackendLabel} ให้ครบก่อน
                </div>
                {cloudVerifiedInfo && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ยืนยันซิงค์ครบแล้ว ({cloudVerifiedInfo.verifiedAt})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleVerifyCloudBeforeCleanup}
                disabled={verifyingCloud || !isOnline}
                className="inline-flex items-center gap-2 bg-[#118cd1] hover:bg-[#0e78b5] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${verifyingCloud ? 'animate-spin' : ''}`} />
                {verifyingCloud
                  ? `กำลังตรวจสอบและซิงค์ขึ้น ${activeBackendLabel}...`
                  : `ตรวจสอบ & ซิงค์รายการที่ค้างขึ้น ${activeBackendLabel} เดี๋ยวนี้`}
              </button>
            </div>

            {/* ขั้นที่ 2: เลือกช่วงวันที่ลบออกจากเครื่อง (ปลดล็อกเมื่อผ่านขั้นที่ 1 เท่านั้น) */}
            <div
              className={`p-4 rounded-2xl border space-y-3 transition ${
                cloudVerifiedInfo
                  ? 'bg-rose-50/40 border-rose-200'
                  : 'bg-gray-50 border-gray-200 opacity-60 pointer-events-none'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0d3a57]">
                <Calendar className="w-4 h-4 text-rose-500" />
                ขั้นที่ 2: เลือกช่วงระยะเวลาของรายการขายที่ต้องการลบออกจากเครื่องนี้
                {!cloudVerifiedInfo && (
                  <span className="text-[11px] font-bold text-[#6b8799]">(กรุณากดยืนยันขั้นที่ 1 ก่อน)</span>
                )}
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
                  <b className="text-rose-600">{matchingLocalOrdersCount.toLocaleString()} รายการ</b>
                </div>
                <button
                  type="button"
                  disabled={!cloudVerifiedInfo || !isOnline || matchingLocalOrdersCount === 0}
                  onClick={handlePruneLocalOrders}
                  className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                  ลบ {matchingLocalOrdersCount.toLocaleString()} รายการออกจากเครื่องนี้ (Cloud ยังอยู่ครบ)
                </button>
              </div>
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

      {/* จัดการฐานข้อมูล สำรองข้อมูล และรีเซ็ตข้อมูลตัวอย่าง */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#eae3cf] space-y-4">
        <div className="flex items-center gap-2.5">
          <Building2 className="w-5 h-5 text-[#118cd1]" />
          <div>
            <h2 className="text-lg font-extrabold text-[#0d3a57]">
              ส่งออกไฟล์สำรองข้อมูล & จัดการข้อมูลตั้งต้น
            </h2>
            <p className="text-xs text-[#6b8799]">
              ส่งออกไฟล์ .json หรือล้างรายการตัวอย่างเพื่อเริ่มจดงานจริง
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            onClick={handleExportJson}
            className="flex items-center justify-center gap-2 bg-[#fef9ec] hover:bg-[#90d4ec]/25 border border-[#eae3cf] text-[#0d3a57] font-bold py-3 px-4 rounded-xl text-sm transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#118cd1]" />
            ดาวน์โหลดไฟล์สำรองข้อมูล (.json)
          </button>

          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center justify-center gap-2 bg-[#fef9ec] hover:bg-[#90d4ec]/25 border border-[#eae3cf] text-[#0d3a57] font-bold py-3 px-4 rounded-xl text-sm transition cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#118cd1]" />
            นำเข้าไฟล์สำรองข้อมูล (.json)
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            onChange={handleImportJson}
            className="hidden"
          />
        </div>

        <div className="pt-4 border-t border-[#eae3cf] flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => {
              if (
                window.confirm(
                  'ต้องการล้างเฉพาะล็อตการซื้อแพ็กเกจจิ้งและงานออกบูธตัวอย่าง เพื่อเริ่มจดข้อมูลจริงใช่หรือไม่? (สูตรสินค้าและราคาวัตถุดิบตั้งต้นจะยังคงอยู่)'
                )
              ) {
                onUpdateState((prev) => clearDemoTransactionsOnly(prev));
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 px-3.5 py-2 rounded-xl border border-rose-200 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            ล้างรายการบูธตัวอย่างเพื่อเริ่มจดงานจริง (เก็บสูตรไว้)
          </button>

          <button
            onClick={() => {
              if (
                window.confirm(
                  'ต้องการโหลดข้อมูลตัวอย่าง Scenario (ซื้อแก้ว 100 ชิ้น ใช้ 80 ชิ้น ซื้อเจ้าใหม่ 100 ชิ้น ใช้ 60 ชิ้น) กลับมาใหม่หรือไม่?'
                )
              ) {
                onUpdateState(() => resetToDemoState());
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6b8799] hover:text-[#0d3a57] px-3 py-2 rounded-xl cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            รีเซ็ตกลับเป็นข้อมูลตัวอย่าง (Demo Scenario)
          </button>
        </div>
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
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* ส่วนที่ 1: จำนวนรอบออกบูธ */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-[#0d3a57]">
                    1. เลือกจำนวนรอบออกบูธ
                  </h4>
                  <span className="text-[11px] font-bold text-[#6b8799]">จ่ายครั้งเดียว ไม่มีรายเดือน</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {BOOTH_PACKS.map((pack) => {
                    const isSelected = selectedBoothPack === pack.id;
                    const isLifetime = pack.id === 'pack-lifetime';
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setSelectedBoothPack(pack.id)}
                        className={`relative text-left p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-center justify-between gap-2 ${
                          isLifetime ? 'sm:col-span-2' : ''
                        } ${
                          isSelected
                            ? 'border-[#118cd1] bg-[#118cd1]/5 shadow-xs'
                            : 'border-[#eae3cf] bg-[#fef9ec]/40 hover:border-[#90d4ec]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-[#0d3a57]">
                              {pack.label}
                            </span>
                            {pack.badge && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                {pack.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#6b8799] mt-0.5">{pack.desc}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-base font-black text-[#118cd1]">
                            ฿{pack.price.toLocaleString()}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                              isSelected
                                ? 'bg-[#118cd1] border-[#118cd1] text-white'
                                : 'border-[#cbd5e1] bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ส่วนที่ 2: จำนวนบิล & ระบบเก็บข้อมูล Cloud */}
              <div className="space-y-3 pt-4 border-t border-[#eae3cf]">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-[#0d3a57]">
                    2. เลือกโควตาบิลและระบบเก็บข้อมูล Cloud
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-700">
                    Google Sheets ฟรีตลอดชีพ!
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {STORAGE_PLANS.map((plan) => {
                    const isSelected = selectedStoragePlan === plan.id;
                    const isUnlimited = plan.id === 'sb-unlimited' || plan.id === 'gs-free';
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedStoragePlan(plan.id)}
                        className={`text-left p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-center justify-between gap-2 ${
                          isUnlimited ? 'sm:col-span-2' : ''
                        } ${
                          isSelected
                            ? 'border-[#118cd1] bg-[#118cd1]/5 shadow-xs'
                            : 'border-[#eae3cf] bg-[#fef9ec]/40 hover:border-[#90d4ec]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white border border-[#eae3cf] text-[#0d3a57]">
                              {plan.provider}
                            </span>
                            <span className="font-extrabold text-sm text-[#0d3a57]">
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
                          <p className="text-[11px] text-[#6b8799] mt-0.5">{plan.desc}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-base font-black ${
                              plan.price === 0 ? 'text-emerald-600' : 'text-[#118cd1]'
                            }`}
                          >
                            {plan.price === 0 ? 'ฟรี' : `+฿${plan.price.toLocaleString()}`}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                              isSelected
                                ? 'bg-[#118cd1] border-[#118cd1] text-white'
                                : 'border-[#cbd5e1] bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
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
                  onClick={() => {
                    alert(
                      `[ตัวอย่างหน้าจอเลือกแพ็กเกจ]\n• แพ็กเกจ: ${activeBoothObj.label} (฿${activeBoothObj.price.toLocaleString()})\n• Cloud & บิล: ${activeStorageObj.provider} - ${activeStorageObj.label} (${activeStorageObj.price === 0 ? 'ฟรี' : `฿${activeStorageObj.price}`})\n• ยอดรวม: ฿${totalPackagePrice.toLocaleString()}\n\n(ระบบชำระเงินผ่าน Apple In-App Purchase จะเชื่อมต่อในขั้นตอนถัดไป)`
                    );
                  }}
                  className="px-6 py-2.5 rounded-xl font-black text-sm bg-[#118cd1] hover:bg-[#0e78b5] text-white shadow-md transition active:scale-95 cursor-pointer"
                >
                  ดำเนินการชำระเงิน (฿{totalPackagePrice.toLocaleString()})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
