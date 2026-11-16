import React, { useEffect, useState } from 'react';
import {
  getClient,
  getSessionUser,
  getSupabaseCfg,
  saveSupabaseCfg,
  signIn,
  signUp,
} from '../services/supabase';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [configured, setConfigured] = useState(!!getSupabaseCfg());
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const c = getClient();
      if (!c) return setReady(true);
      setAuthed(!!(await getSessionUser()));
      c.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
      setReady(true);
    })();
  }, [configured]);

  if (!ready) return null;
  if (authed) return <>{children}</>;

  const box = 'w-full border border-[#eae3cf] rounded-lg px-3 py-2 text-sm bg-white';
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
      if (mode === 'signup') await signUp(username, password);
      else await signIn(username, password);
      setAuthed(true);
    } catch (err: any) {
      setMsg(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fef9ec] p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl border border-[#eae3cf] shadow-sm p-6 w-full max-w-sm space-y-3">
        <h1 className="text-xl font-extrabold text-[#0d3a57]">BoothBook</h1>
        {!configured ? (
          <>
            <p className="text-xs text-[#6b8799]">ตั้งค่า Supabase ครั้งแรก (Project Settings &gt; API)</p>
            <input className={box} placeholder="Project URL (https://xxxx.supabase.co)" value={url} onChange={(e) => setUrl(e.target.value)} required />
            <input className={box} placeholder="anon public key" value={key} onChange={(e) => setKey(e.target.value)} required />
          </>
        ) : (
          <>
            <p className="text-xs text-[#6b8799]">{mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครใช้งาน'}</p>
            <input className={box} placeholder="username (a-z, 0-9)" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <input className={box} type="password" placeholder="password (อย่างน้อย 6 ตัว)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </>
        )}
        {msg && <p className="text-xs text-rose-600">{msg}</p>}
        <button disabled={busy} className="w-full bg-[#118cd1] text-white font-bold rounded-lg py-2 text-sm cursor-pointer">
          {!configured ? 'บันทึกการตั้งค่า' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัคร'}
        </button>
        {configured && (
          <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="w-full text-xs text-[#118cd1] cursor-pointer">
            {mode === 'login' ? 'ยังไม่มีบัญชี? สมัครใหม่' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
          </button>
        )}
      </form>
    </div>
  );
};
