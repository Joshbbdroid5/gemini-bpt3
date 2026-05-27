import React, { useEffect, useState, StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import AdminDashboard from './components/AdminDashboard';
import './index.css';
import ErrorBoundary from './ErrorBoundary';

// Global declaration for Telegram WebApp
declare global {
  interface Window {
    Telegram?: any;
  }
}

const ADMIN_ID = import.meta.env.VITE_ADMIN_CHAT_ID;

const AdminRoot = () => {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const userId = tg?.initDataUnsafe?.user?.id?.toString();
    
    // Check authorization. 
    // If inside Telegram, the user ID must match the VITE_ADMIN_CHAT_ID.
    if (userId) {
      setAuthorized(userId === ADMIN_ID);
    } else {
      // Allow regular browser access to reach the login/secret key screen
      setAuthorized(true); 
    }
  }, []);

  if (authorized === null) return null; // Wait for TG init

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0f170a] text-white p-6 text-center">
        <h1 className="text-2xl font-black mb-2 text-red-500 uppercase italic">Access Denied</h1>
        <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto leading-relaxed">
          This area is restricted to authorized administrators only.
        </p>
        <button onClick={() => { window.location.href = '/'; }} className="bg-white text-black px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-transform">
          Return to App
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary fallback={<div className="fixed inset-0 z-150 bg-red-800 flex items-center justify-center text-white text-2xl font-black italic uppercase">Admin application crashed! Please refresh.</div>}>
      <AdminDashboard onBack={() => { window.location.href = '/'; }} />
    </ErrorBoundary>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminRoot />
  </StrictMode>
);