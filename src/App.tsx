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
  ShieldAlert,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

type ActiveTab = 'pos' | 'events' | 'inventory' | 'recipes' | 'settings';

const DB_REVISION_STAMP = 'boothbook-pos-unified-v1';

export const App: React.FC<{ userProfile: UserProfile | null }> = ({ userProfile }) => {
  const isStaff = userProfile?.role === 'staff';
  const isOwner = !isStaff; // default owner

  const [state, setState] = useState<AppDatabaseState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>(isStaff ? 'pos' : 'events');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; ownerOnly?: boolean }[] = [
    { id: 'pos', label: 'แคชเชียร์ POS', icon: <ShoppingBag className="w-5 h-5 shrink-0" /> },
    { id: 'events', label: 'ออกบูธ & P&L', icon: <BarChart3 className="w-5 h-5 shrink-0" />, ownerOnly: true },
    { id: 'inventory', label: 'สต็อก FIFO', icon: <Package className="w-5 h-5 shrink-0" />, ownerOnly: true },
    { id: 'recipes', label: 'สูตรไอติม', icon: <IceCream className="w-5 h-5 shrink-0" />, ownerOnly: true },
    { id: 'settings', label: 'ตั้งค่า', icon: <Settings className="w-5 h-5 shrink-0" />, ownerOnly: true },
  ];

  const visibleNavItems = navItems.filter((item) => !item.ownerOnly || isOwner);

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-[#fef9ec] text-[#0d3a57]">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0d3a57]/40 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen flex flex-col bg-white border-r border-[#eae3cf] shadow-sm transition-all duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${sidebarCollapsed ? 'lg:w-20 w-64' : 'w-64'}`}
      >
        {/* Brand & Collapse Toggle */}
        <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-[#eae3cf]">
          <div className={`flex items-center gap-2.5 min-w-0 ${sidebarCollapsed ? 'lg:justify-center lg:w-full' : ''}`}>
            <img
              src="./images/logo.png"
              alt="REFV Gelato"
              className="h-9 w-9 rounded-xl object-contain shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <h1 className="text-sm font-black tracking-tight text-[#0d3a57] truncate">
                  {state.settings.shopName || 'REFV Gelato'}
                </h1>
                <span
                  className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase ${
                    isOwner
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-blue-100 text-blue-900 border border-blue-300'
                  }`}
                >
                  {isOwner ? '👑 Owner' : '🧑‍💼 Staff POS'}
                </span>
              </div>
            )}
          </div>

          {/* Close on mobile */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-xl text-[#6b8799] hover:bg-[#fef9ec] cursor-pointer"
            title="ปิดเมนู"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Collapse/Expand on desktop */}
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="hidden lg:flex p-1.5 rounded-xl text-[#6b8799] hover:bg-[#fef9ec] hover:text-[#0d3a57] cursor-pointer shrink-0"
              title="ย่อแถบเมนู"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expand button when collapsed on desktop */}
        {sidebarCollapsed && (
          <div className="hidden lg:flex justify-center py-2 border-b border-[#eae3cf]/60">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="p-1.5 rounded-xl text-[#6b8799] hover:bg-[#fef9ec] hover:text-[#0d3a57] cursor-pointer"
              title="ขยายแถบเมนู"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Vertical Navigation Tabs */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {visibleNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-extrabold transition cursor-pointer ${
                  sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''
                } ${
                  isActive
                    ? 'bg-[#118cd1] text-white shadow-sm'
                    : 'text-[#6b8799] hover:bg-[#fef9ec] hover:text-[#0d3a57]'
                }`}
              >
                {item.icon}
                <span className={sidebarCollapsed ? 'lg:hidden' : ''}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info & Logout at Bottom */}
        <div className="p-3 border-t border-[#eae3cf] space-y-2">
          {!sidebarCollapsed && (
            <div className="px-3 py-2 rounded-xl bg-[#fef9ec] text-xs">
              <div className="text-[10px] font-bold text-[#6b8799]">ผู้ใช้งานปัจจุบัน</div>
              <div className="font-bold text-[#0d3a57] truncate">
                {userProfile?.username || userProfile?.email}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => signOut()}
            title="ออกจากระบบ"
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer ${
              sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className={sidebarCollapsed ? 'lg:hidden' : ''}>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* Right Content Wrapper */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile Top Bar */}
        <header className="lg:hidden sticky top-0 z-30 bg-[#fef9ec]/95 backdrop-blur-md border-b border-[#eae3cf] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl bg-white border border-[#eae3cf] text-[#0d3a57] shadow-xs cursor-pointer"
              title="เปิดเมนู"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-black text-[#0d3a57] truncate">
                {visibleNavItems.find((i) => i.id === activeTab)?.label || 'BoothBook'}
              </div>
              <div className="text-[11px] text-[#6b8799] truncate">
                {state.settings.shopName || 'REFV Gelato'}
              </div>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${
              isOwner
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-blue-100 text-blue-900 border border-blue-300'
            }`}
          >
            {isOwner ? '👑 Owner' : '🧑‍💼 Staff'}
          </span>
        </header>

        {/* แถบสรุปยอดสะสม (แสดงเฉพาะ Owner) */}
        {isOwner && (
          <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[#eae3cf] px-4 lg:px-6 py-2.5">
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
        <main className="flex-1 py-4 px-2 sm:px-4">
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
    </div>
  );
};

export default App;
