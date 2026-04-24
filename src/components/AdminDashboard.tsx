import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft, RefreshCw, Search, Wallet } from 'lucide-react';

interface Props {
  onBack: () => void;
}

export default function AdminDashboard({ onBack }: Props) {
  const [secret, setSecret] = useState('');
  const [wallets, setWallets] = useState<Record<string, number>>({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchWallets = async () => {
    setLoading(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');
    try {
      const response = await fetch(`${backendUrl}/admin/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      });
      if (response.ok) {
        const data = await response.json();
        setWallets(data);
        setIsAuthenticated(true);
      } else {
        alert('Unauthorized or server error');
      }
    } catch (err) {
      alert('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredWallets = Object.entries(wallets).filter(([id]) => 
    id.toLowerCase().includes(search.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#1a1b2e]">
        <Shield size={48} className="text-indigo-500 mb-4" />
        <h2 className="text-xl font-black text-white uppercase italic mb-6 text-center">Admin Access</h2>
        <input 
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Enter Admin Secret"
          className="w-full max-w-xs bg-white/5 border border-white/10 rounded-xl p-4 text-white text-center mb-4"
        />
        <button 
          onClick={fetchWallets}
          className="w-full max-w-xs bg-indigo-600 text-white py-4 rounded-xl font-black uppercase"
        >
          Login
        </button>
        <button onClick={onBack} className="mt-4 text-gray-500 font-bold uppercase text-[10px]">Go Back</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1a1b2e] overflow-hidden">
      <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-white/5 rounded-full" aria-label="Go back"><ArrowLeft size={18} /></button>
          <h2 className="font-black text-white uppercase italic">Wallet Manager</h2>
        </div>
        <button onClick={fetchWallets} className={`${loading ? 'animate-spin' : ''}`} aria-label="Refresh wallet list">
          <RefreshCw size={18} className="text-indigo-400" />
        </button>
      </div>

      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search User ID..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredWallets.map(([id, balance]) => (
          <div key={id} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-indigo-300 uppercase leading-none mb-1">User ID</span>
              <span className="text-xs font-bold text-white font-mono">{id}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black text-gray-500 uppercase leading-none block mb-1">Balance</span>
              <span className="text-lg font-black text-green-400 italic">{balance.toFixed(0)} ETB</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}