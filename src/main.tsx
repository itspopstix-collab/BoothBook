import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LocalAuthGate } from './components/LocalAuthGate';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocalAuthGate>
      {(profile, onLogout) => <App userProfile={profile} onLogout={onLogout} />}
    </LocalAuthGate>
  </React.StrictMode>
);

