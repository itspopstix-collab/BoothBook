import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Release 1: ปิดหน้า Login Supabase (AuthGate) ชั่วคราว เพื่อให้เข้าใช้งานกับ Google Sheets ได้เลย
// import { AuthGate } from './components/AuthGate';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* <AuthGate>
      {(profile) => <App userProfile={profile} />}
    </AuthGate> */}
    <App userProfile={null} />
  </React.StrictMode>
);

