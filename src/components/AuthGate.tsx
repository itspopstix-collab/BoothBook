import React, { useEffect, useState } from 'react';
import {
  clearSupabaseCfg,
  getClient,
  getSessionUser,
  getSupabaseCfg,
  getUserProfile,
  saveSupabaseCfg,
  signIn,
  signUp,
} from '../services/supabase';
import { UserProfile, UserRole } from '../types';

export const AuthGate: React.FC<{ children: (profile: UserProfile | null) => React.ReactNode }> = ({
  children,
}) => {
  const [ready, setReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [configured, setConfigured] = useState(!!getSupabaseCfg());
  const [url, setUrl] = useState('https://btnflwrebpnaafafisgc.supabase.co');
  const [key, setKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('owner');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = getClient();
        if (!c) {
          setConfigured(false);
          setReady(true);
          return;
        }
        const sessionUser = await getSessionUser();
        if (sessionUser) {
          setUserProfile(getUserProfile(sessionUser));
        } else {
          setUserProfile(null);
        }
        c.auth.onAuthStateChange((_e, s) => {
          if (s?.user) setUserProfile(getUserProfile(s.user));
          else setUserProfile(null);
        });
      } catch {
        clearSupabaseCfg();
        setConfigured(false);
      } finally {
        setReady(true);
      }
    })();
  }, [configured]);

  if (!ready) return null;
  if (userProfile) return <>{children(userProfile)}</>;

  const box = 'w-full border border-[#eae3cf] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#118cd1] text-[#0d3a57]';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      if (!configured) {
        saveSupabaseCfg({ url, anonKey: key });
        setConfigured(true);
        return;
      }
      if (mode === 'signup') {
        await signUp(username, password, role);
      } else {
        await signIn(username, password);
      }
      const u = await getSessionUser();
      if (u) setUserProfile(getUserProfile(u));
    } catch (err: any) {
      setMsg(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fef9ec] p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-3xl border border-[#eae3cf] shadow-xl p-8 w-full max-w-sm space-y-4"
      >
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-[#118cd1]/10 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-2">
            🍨
          </div>
          <h1 className="text-2xl font-black text-[#0d3a57]">BoothBook</h1>
          <p className="text-xs text-[#6b8799]">ระบบจัดการบูธ & แคชเชียร์หน้าร้าน REFV POS</p>
        </div>

        {!configured ? (
          <>
            <div className="p-3 bg-[#fef9ec] rounded-xl text-xs text-[#6b8799] space-y-1">
              <span className="font-bold text-[#0d3a57]">ตั้งค่า Supabase ครั้งแรก</span>
              <p>คัดลอก Project URL และ Publishable key จากหน้า Supabase Dashboard</p>
            </div>
            <input
              className={box}
              placeholder="Project URL (https://xxxx.supabase.co)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <input
              className={box}
              placeholder="Publishable key (sb_publishable_...)"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
          </>
        ) : (
          <>
            <div className="flex bg-[#fef9ec] p-1 rounded-xl text-xs font-bold text-[#6b8799]">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  mode === 'login' ? 'bg-[#118cd1] text-white shadow-sm' : ''
                }`}
              >
                เข้าสู่ระบบ
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  mode === 'signup' ? 'bg-[#118cd1] text-white shadow-sm' : ''
                }`}
              >
                สมัครใช้งาน
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-[#6b8799] mb-1">
                  Email หรือ Username
                </label>
                <input
                  className={box}
                  placeholder="เช่น itspopstix@gmail.com หรือ staff"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#6b8799] mb-1">
                  รหัสผ่าน (Password)
                </label>
                <input
                  className={box}
                  type="password"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-[11px] font-bold text-[#6b8799] mb-1">
                    บทบาทผู้ใช้งาน (Role)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('owner')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                        role === 'owner'
                          ? 'border-[#118cd1] bg-[#118cd1]/10 text-[#118cd1]'
                          : 'border-[#eae3cf] text-[#6b8799]'
                      }`}
                    >
                      👑 เจ้าของร้าน (Owner)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('staff')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                        role === 'staff'
                          ? 'border-[#118cd1] bg-[#118cd1]/10 text-[#118cd1]'
                          : 'border-[#eae3cf] text-[#6b8799]'
                      }`}
                    >
                      🧑‍💼 พนักงาน (Staff POS)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {msg && <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-100">{msg}</p>}

        <button
          disabled={busy}
          className="w-full bg-[#118cd1] hover:bg-[#0f7ebc] text-white font-black rounded-xl py-3 text-sm shadow-md transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
        >
          {busy
            ? 'กำลังดำเนินการ...'
            : !configured
            ? 'บันทึกการตั้งค่า'
            : mode === 'login'
            ? 'เข้าสู่ระบบ'
            : 'สร้างบัญชีผู้ใช้'}
        </button>

        {configured && (
          <div className="text-center pt-2 space-y-2">
            <div>
              <span className="text-xs text-[#6b8799]">
                {mode === 'login' ? 'เจ้าของร้านหรือพนักงานใหม่? ' : 'มีบัญชีอยู่แล้ว? '}
              </span>
              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-xs font-bold text-[#118cd1] hover:underline cursor-pointer"
              >
                {mode === 'login' ? 'สมัครบัญชีใหม่' : 'เข้าสู่ระบบ'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                clearSupabaseCfg();
                setConfigured(false);
                setMsg('');
              }}
              className="text-[11px] text-[#6b8799] hover:text-[#0d3a57] underline cursor-pointer"
            >
              เปลี่ยนการตั้งค่า Supabase (URL / Key)
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
