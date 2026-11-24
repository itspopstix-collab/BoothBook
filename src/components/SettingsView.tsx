import React, { useRef, useState } from 'react';
import { AppDatabaseState, CloudStorageBackend } from '../types';
import { fetchAllPosSalesFromCloud } from '../services/posSync';
import { clearDemoTransactionsOnly, resetToDemoState } from '../services/storage';
import { getStorageEngineLabel } from '../services/nativeStorage';
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
} from 'lucide-react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
  onPushCloud?: () => Promise<void>;
  onPullCloud?: () => Promise<void>;
  onFlushOfflineQueue?: () => Promise<void>;
  pendingSyncCount?: number;
  isOnline?: boolean;
  cloudBusy?: boolean;
}

export const SettingsView: React.FC<Props> = ({
  state,
  onUpdateState,
  onPushCloud,
  onPullCloud,
  onFlushOfflineQueue,
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
    </div>
  );
};
