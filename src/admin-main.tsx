import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import AdminDashboard from './components/AdminDashboard';
import './index.css';

const ADMIN_ID = import.meta.env.VITE_ADMIN_CHAT_ID;

const AdminRoot = () => {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    const userId = tg?.initDataUnsafe?.user?.id?.toString();
    
    // Check authorization. In development mode (npm run dev), we allow access for testing.
    if (userId) {
      setAuthorized(userId === ADMIN_ID);
    } else {
      setAuthorized(import.meta.env.DEV); 
    }
  }, []);

  if (authorized === null) return null; // Wait for TG init

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0f170a] text-white p-6 text-center">
        <h1 className="text-2xl font-black mb-2 text-red-500 uppercase italic">Access Denied</h1>
        <p className="text-gray-400 text-sm mb-6">This area is restricted to authorized administrators only.</p>
        <button onClick={() => window.location.href = '/'} className="bg-white text-black px-8 py-3 rounded-xl font-bold uppercase text-xs">
          Return to App
        </button>
      </div>
    );
  }

  return <AdminDashboard onBack={() => { window.location.href = '/'; }} />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(<AdminRoot />);