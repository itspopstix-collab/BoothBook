import React, { useEffect, useMemo, useState } from 'react';
import { AppDatabaseState, PosSaleRow, UserProfile } from './types';
import {
  formatBaht,
  formatSignedBaht,
  loadAppState,
  loadStateFromDiskOrCloud,
  pullDatabaseFromGoogleSheets,
  pushDatabaseToGoogleSheets,
  saveAppState,
  SyncStatusInfo,
} from './services/storage';
import { runFifoSimulation } from './services/fifoEngine';
import { EventPnLView } from './components/EventPnLView';
import { FifoInventoryView } from './components/FifoInventoryView';
import { RecipeCostView } from './components/RecipeCostView';
import { SettingsView } from './components/SettingsView';
import { PosCashierView } from './components/PosCashierView';
import { signOut } from './services/supabase';
import {
  BarChart3,
  Package,
  IceCream,
  Settings,
  TrendingUp,
  CloudUpload,
  CloudDownload,
  ShoppingBag,
  LogOut,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';

type ActiveTab = 'pos' | 'events' | 'inventory' | 'recipes' | 'settings';

const DB_REVISION_STAMP = 'boothbook-pos-unified-v1';

export const App: React.FC<{ userProfile: UserProfile | null }> = ({ userProfile }) => {
  const isStaff = userProfile?.role === 'staff';
  const isOwner = !isStaff; // default owner

  const [state, setState] = useState<AppDatabaseState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>(isStaff ? 'pos' : 'events');
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>({
    diskSaved: true,
    cloudSynced: true,
    lastSavedAt: new Date().toLocaleTimeString('th-TH'),
    message: 'เชื่อมต่อฐานข้อมูล Supabase เรียบร้อย',
  });
  const [cloudBusy, setCloudBusy] = useState(false);

  // Auto-switch to pos tab if staff
  useEffect(() => {
    if (isStaff && activeTab !== 'pos') {
      setActiveTab('pos');
    }
  }, [isStaff]);

  // โหลดข้อมูลล่าสุดจาก Supabase ตอนเปิดแอป
  useEffect(() => {
    let mounted = true;
    loadStateFromDiskOrCloud(state).then(({ state: loadedState }) => {
      if (!mounted) return;
      setState(loadedState);
      const t = new Date().toLocaleTimeString('th-TH');
      setSyncStatus({
        diskSaved: true,
        cloudSynced: true,
        lastSavedAt: t,
        message: `เชื่อมต่อและดึงข้อมูล Supabase ล่าสุดสำเร็จ (${t})`,
      });
    });
    return () => {
      mounted = false;
    };
  }, [DB_REVISION_STAMP]);

  const handleUpdateState = (updater: (prev: AppDatabaseState) => AppDatabaseState) => {
    setState((prev) => {
      const next = updater(prev);
      saveAppState(next, (status) => setSyncStatus(status));
      return next;
    });
  };

  // รับบิลใหม่จากหน้า POS Cashier
  const handleRecordPosSale = (newSale: PosSaleRow) => {
    handleUpdateState((prev) => {
      const activeEventIdx = prev.events.findIndex((e) => e.status === 'active');
      const targetIdx = activeEventIdx >= 0 ? activeEventIdx : 0;

      const events = [...(prev.events || [])];
      if (events[targetIdx]) {
        events[targetIdx] = {
          ...events[targetIdx],
          posSales: [...(events[targetIdx].posSales || []), newSale],
        };
      }
      return { ...prev, events };
    });
  };

  const handleManualCloudPush = async () => {
    setCloudBusy(true);
    try {
      const ok = await pushDatabaseToGoogleSheets(state);
      const t = new Date().toLocaleTimeString('th-TH');
      setSyncStatus({
        diskSaved: true,
        cloudSynced: ok,
        lastSavedAt: t,
        message: ok
          ? `ส่งข้อมูลทั้งหมดขึ้น Supabase สำเร็จ (${t})`
          : `บันทึกข้อมูลในเครื่องแล้ว (${t})`,
      });
    } finally {
      setCloudBusy(false);
    }
  };

  const handleManualCloudPull = async () => {
    setCloudBusy(true);
    try {
      const cloudState = await pullDatabaseFromGoogleSheets(state.settings);
      const t = new Date().toLocaleTimeString('th-TH');
      if (cloudState) {
        setState(cloudState);
        setSyncStatus({
          diskSaved: true,
          cloudSynced: true,
          lastSavedAt: t,
          message: `ดึงข้อมูลล่าสุดจาก Supabase สำเร็จ (${t})`,
        });
      }
    } finally {
      setCloudBusy(false);
    }
  };

  // คำนวณจำลอง FIFO เฉพาะเจ้าของร้าน (Staff ไม่ต้องคำนวณ)
  const sim = useMemo(() => {
    if (isStaff) return { eventResults: {}, inventoryLedger: [] } as any;
    return runFifoSimulation(state);
  }, [state, isStaff]);

  const overallSummary = useMemo(() => {
    if (isStaff) return { totalRevenue: 0, totalCosts: 0, totalProfit: 0, totalCups: 0, eventCount: 0 };
    const results = Object.values(sim.eventResults) as any[];
    const totalRevenue = results.reduce((s, r) => s + (r.netRevenue || 0), 0);
    const totalCosts = results.reduce((s, r) => s + (r.totalAllCosts || 0), 0);
    const totalProfit = results.reduce((s, r) => s + (r.netProfit || 0), 0);
    const totalCups = results.reduce((s, r) => s + (r.totalCupsSold || 0), 0);
    return { totalRevenue, totalCosts, totalProfit, totalCups, eventCount: results.length };
  }, [sim, isStaff]);

  return (
    <div className="min-h-screen flex flex-col bg-[#fef9ec] text-[#0d3a57]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#fef9ec]/95 backdrop-blur-md border-b border-[#eae3cf] px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center justify-between md:justify-start gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/images/logo.png"
                alt="REFV Gelato"
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black tracking-tight text-[#0d3a57]">
                    {state.settings.shopName || 'REFV Gelato'}
                  </h1>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase ${
                      isOwner
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-blue-100 text-blue-900 border border-blue-300'
                    }`}
                  >
                    {isOwner ? '👑 Owner Admin' : '🧑‍💼 Staff POS'}
                  </span>
                </div>
                <p className="text-xs text-[#6b8799] font-medium truncate max-w-xs sm:max-w-md">
                  เข้าใช้โดย: <b>{userProfile?.username || userProfile?.email}</b>
                </p>
              </div>
            </div>

            {/* ปุ่ม Logout สำหรับมือถือ */}
            <button
              type="button"
              onClick={() => signOut()}
              title="ออกจากระบบ"
              className="md:hidden p-2 text-rose-600 hover:bg-rose-50 rounded-xl"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2">
            <nav className="flex flex-wrap gap-1 bg-white p-1 rounded-2xl shadow-xs border border-[#eae3cf]">
              {/* แท็บ POS หน้าร้าน (เข้าได้ทุกคน) */}
              <button
                type="button"
                onClick={() => setActiveTab('pos')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                  activeTab === 'pos'
                    ? 'bg-[#118cd1] text-white shadow-xs'
                    : 'text-[#6b8799] hover:text-[#0d3a57]'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                แคชเชียร์ POS
              </button>

              {/* แท็บเฉพาะ Owner */}
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab('events')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                      activeTab === 'events'
                        ? 'bg-[#118cd1] text-white shadow-xs'
                        : 'text-[#6b8799] hover:text-[#0d3a57]'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    ออกบูธ & P&L
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('inventory')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                      activeTab === 'inventory'
                        ? 'bg-[#118cd1] text-white shadow-xs'
                        : 'text-[#6b8799] hover:text-[#0d3a57]'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    สต็อก FIFO
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('recipes')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                      activeTab === 'recipes'
                        ? 'bg-[#118cd1] text-white shadow-xs'
                        : 'text-[#6b8799] hover:text-[#0d3a57]'
                    }`}
                  >
                    <IceCream className="w-4 h-4" />
                    สูตรไอติม
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                      activeTab === 'settings'
                        ? 'bg-[#118cd1] text-white shadow-xs'
                        : 'text-[#6b8799] hover:text-[#0d3a57]'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    ตั้งค่า
                  </button>
                </>
              )}
            </nav>

            <button
              type="button"
              onClick={() => signOut()}
              title="ออกจากระบบ"
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              ออก
            </button>
          </div>
        </div>
      </header>

      {/* แถบสรุปยอดสะสม (แสดงเฉพาะ Owner) */}
      {isOwner && (
        <div className="bg-white/80 border-b border-[#eae3cf] px-4 lg:px-8 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 font-bold text-[#0d3a57]">
                <TrendingUp className="w-4 h-4 text-[#118cd1]" />
                ภาพรวม {overallSummary.eventCount} บูธ ({overallSummary.totalCups.toLocaleString()} ถ้วย):
              </span>
              <span>
                ยอดขาย: <b className="text-[#0d3a57]">{formatBaht(overallSummary.totalRevenue)}</b>
              </span>
              <span>
                ต้นทุน: <b className="text-rose-700">{formatBaht(overallSummary.totalCosts)}</b>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-black">
                กำไร: {formatSignedBaht(overallSummary.totalProfit)}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleManualCloudPull}
                disabled={cloudBusy}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[#eae3cf] bg-white hover:bg-gray-50 flex items-center gap-1 cursor-pointer"
              >
                <CloudDownload className="w-3.5 h-3.5 text-[#118cd1]" /> ดึง Cloud
              </button>
              <button
                type="button"
                onClick={handleManualCloudPush}
                disabled={cloudBusy}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#118cd1] text-white hover:bg-[#0f7ebc] flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <CloudUpload className="w-3.5 h-3.5" /> เซฟ Cloud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 py-4">
        {activeTab === 'pos' && (
          <PosCashierView
            state={state}
            onRecordSale={handleRecordPosSale}
            promptPayNumber={state.settings.promptPayNumber || '0812345678'}
          />
        )}

        {isOwner && activeTab === 'events' && (
          <EventPnLView
            state={state}
            sim={sim}
            onUpdateState={handleUpdateState}
          />
        )}

        {isOwner && activeTab === 'inventory' && (
          <FifoInventoryView
            state={state}
            sim={sim}
            onUpdateState={handleUpdateState}
          />
        )}

        {isOwner && activeTab === 'recipes' && (
          <RecipeCostView
            state={state}
            sim={sim}
            onUpdateState={handleUpdateState}
          />
        )}

        {isOwner && activeTab === 'settings' && (
          <SettingsView
            state={state}
            onUpdateState={handleUpdateState}
            onPushCloud={handleManualCloudPush}
            onPullCloud={handleManualCloudPull}
            cloudBusy={cloudBusy}
          />
        )}

        {/* ถ้า Staff พยายามเข้าหน้าอื่น */}
        {!isOwner && activeTab !== 'pos' && (
          <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-3xl border border-rose-200 text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
            <h2 className="text-lg font-black text-[#0d3a57]">ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
            <p className="text-xs text-[#6b8799]">
              บัญชี Staff เข้าถึงได้เฉพาะหน้าแคชเชียร์ POS เท่านั้น เพื่อความปลอดภัยของข้อมูลต้นทุนและกำไร
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              className="bg-[#118cd1] text-white text-xs font-bold px-4 py-2 rounded-xl"
            >
              กลับหน้าแคชเชียร์ POS
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
