import React, { useState } from 'react';
import { UserProfile } from '../types';
import { loadAppState } from '../services/storage';
import { Lock, LogIn, ShieldCheck, User } from 'lucide-react';

const ACTIVE_USER_STORAGE_KEY = 'boothbook_active_user_v1';

const DEFAULT_OWNER_PROFILE: UserProfile = {
  id: 'owner-default',
  email: 'owner@boothbook.local',
  username: 'Owner',
  role: 'owner',
};

function readStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    if (parsed && parsed.id && parsed.username) return parsed;
  } catch {
    // ignore
  }
  return null;
}

export const LocalAuthGate: React.FC<{
  children: (profile: UserProfile, onLogout: () => void) => React.ReactNode;
}> = ({ children }) => {
  const [activeUser, setActiveUser] = useState<UserProfile | null>(() => readStoredUser());
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const appState = loadAppState();
  const managedUsers = appState.settings.users || [];
  const hasExplicitOwnerWithPassword = managedUsers.some(
    (u) => u.role.toLowerCase() === 'owner' && Boolean(u.password)
  );

  const persistLogin = (profile: UserProfile) => {
    try {
      localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore
    }
    setActiveUser(profile);
    setErrorMsg(null);
    setIdentifier('');
    setPassword('');
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    } catch {
      // ignore
    }
    setActiveUser(null);
    setErrorMsg(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = identifier.trim().toLowerCase();
    if (!input) {
      setErrorMsg('กรุณากรอกอีเมลหรือ Username');
      return;
    }

    const latestUsers = loadAppState().settings.users || [];
    const matched = latestUsers.find(
      (u) =>
        u.email.trim().toLowerCase() === input ||
        u.name.trim().toLowerCase() === input
    );

    if (!matched) {
      setErrorMsg('ไม่พบชื่อผู้ใช้งานนี้ในระบบ');
      return;
    }

    if ((matched.password || '') !== password) {
      setErrorMsg('รหัสผ่านไม่ถูกต้อง');
      return;
    }

    persistLogin({
      id: matched.id,
      email: matched.email,
      username: matched.name,
      role: matched.role.toLowerCase() === 'staff' ? 'staff' : 'owner',
    });
  };

  if (activeUser) {
    return <>{children(activeUser, handleLogout)}</>;
  }

  return (
    <div className="min-h-screen bg-[#fef9ec] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-lg border border-[#eae3cf] space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-[#118cd1] text-white font-black text-lg flex items-center justify-center mx-auto shadow-sm">
            BB
          </div>
          <h1 className="text-xl font-black text-[#0d3a57]">
            {appState.settings.shopName || 'BoothBook'}
          </h1>
          <p className="text-xs text-[#6b8799]">
            เข้าสู่ระบบเพื่อใช้งานตามสิทธิ์ผู้ใช้งานที่ตั้งค่าไว้
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#6b8799] mb-1">
              อีเมล หรือ ชื่อผู้ใช้งาน
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#6b8799] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="เช่น staff@shop.com หรือ น้องมายด์"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full border-2 border-[#eae3cf] rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-[#118cd1]"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#6b8799] mb-1">
              รหัสผ่าน (Password)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#6b8799] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                placeholder="กรอกรหัสผ่าน"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-2 border-[#eae3cf] rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-[#118cd1]"
                required
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 bg-[#118cd1] hover:bg-[#0e76b2] text-white font-black py-3 rounded-xl text-sm shadow-sm transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            เข้าสู่ระบบ
          </button>
        </form>

        {!hasExplicitOwnerWithPassword && (
          <div className="pt-4 border-t border-[#eae3cf] space-y-2">
            <button
              type="button"
              onClick={() => persistLogin(DEFAULT_OWNER_PROFILE)}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#fef9ec] hover:bg-[#e8f5fd] text-[#0d3a57] border border-[#eae3cf] font-extrabold py-2.5 rounded-xl text-xs transition cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#118cd1]" />
              เข้าใช้งานในฐานะ Owner (ค่าเริ่มต้น)
            </button>
            <p className="text-[11px] text-center text-[#6b8799]">
              หากต้องการปิดปุ่มนี้ ให้สร้าง User ที่เป็น Role Owner พร้อมรหัสผ่านในหน้า ตั้งค่า → User
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
