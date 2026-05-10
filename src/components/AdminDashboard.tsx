import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft, RefreshCw, Search, Wallet, Plus, Minus, Send, TrendingUp, Activity, Power, Play, Square, StopCircle } from 'lucide-react';

interface Props {
  onBack: () => void;
}

export default function AdminDashboard({ onBack }: Props) {
  const [secret, setSecret] = useState('');
  const [wallets, setWallets] = useState<Record<string, number>>({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState({ totalVolume: 0, totalProfit: 0, activeBets: 0, isMaintenanceMode: false });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [adjustmentValues, setAdjustmentValues] = useState<Record<string, string>>({});
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/admin/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      });
      if (response.ok) {
        const data = await response.json();
        setWallets(data.wallets);
        setStats(data.stats);
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

  const handleUpdateBalance = async (userId: string, amount: number) => {
    if (isNaN(amount) || amount === 0) return;
    
    setIsUpdating(userId);
    
    try {
      const response = await fetch(`${backendUrl}/admin/update-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount, secret })
      });

      if (response.ok) {
        // Clear the input for this user
        setAdjustmentValues(prev => ({ ...prev, [userId]: '' }));
        // Refresh the list to show new balance
        await fetchWallets();
      } else {
        alert('Failed to update balance');
      }
    } catch (err) {
      alert('Connection error');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleToggleMaintenance = async () => {
    const nextState = !stats.isMaintenanceMode;
    if (!confirm(`Are you sure you want to ${nextState ? 'ENABLE' : 'DISABLE'} maintenance mode?`)) return;

    try {
      const response = await fetch(`${backendUrl}/admin/toggle-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, enabled: nextState })
      });

      if (response.ok) {
        const data = await response.json();
        setStats(prev => ({ ...prev, isMaintenanceMode: data.isMaintenanceMode }));
      } else {
        alert('Failed to update system status');
      }
    } catch (err) {
      alert('Connection error');
    }
  };

  const filteredWallets = Object.entries(wallets).filter(([id]) => 
    id.toLowerCase().includes(search.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-primary">
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
    <div className="flex-1 flex flex-col bg-primary overflow-hidden">
      <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-white/5 rounded-full" aria-label="Go back"><ArrowLeft size={18} /></button>
          <h2 className="font-black text-white uppercase italic">Wallet Manager</h2>
        </div>
        <button onClick={fetchWallets} className={`${loading ? 'animate-spin' : ''}`} aria-label="Refresh wallet list">
          <RefreshCw size={18} className="text-indigo-400" />
        </button>
      </div>

      {/* System Controls */}
      <div className="px-4 pt-4">
        <div className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
          stats.isMaintenanceMode 
            ? 'bg-red-500/10 border-red-500/30' 
            : 'bg-green-500/10 border-green-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${stats.isMaintenanceMode ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
              <Power size={20} />
            </div>
            <div>
              <h3 className="text-white font-black uppercase text-xs tracking-wider">Maintenance Mode</h3>
              <p className="text-[10px] text-gray-400 uppercase font-bold">{stats.isMaintenanceMode ? 'System Paused - Bets Blocked' : 'System Live - Accepting Bets'}</p>
            </div>
          </div>
          <button 
            onClick={handleToggleMaintenance}
            className={`px-6 py-2 rounded-xl font-black uppercase text-[10px] transition-all ${
              stats.isMaintenanceMode 
                ? 'bg-green-600 text-white hover:bg-green-500 shadow-lg shadow-green-900/20' 
                : 'bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-900/20'
            }`}
          >
            {stats.isMaintenanceMode ? 'Go Live' : 'Shut Down'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-2">
        <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={14} className="text-indigo-400" />
            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Game Volume</span>
          </div>
          <div className="text-xl font-black text-white italic">{stats.totalVolume.toFixed(0)} <span className="text-xs not-italic text-indigo-400 ml-1">ETB</span></div>
        </div>
        <div className="bg-green-600/20 border border-green-500/30 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-green-400" />
            <span className="text-[10px] font-black text-green-300 uppercase tracking-widest">Net Profit</span>
          </div>
          <div className="text-xl font-black text-white italic">{stats.totalProfit.toFixed(0)} <span className="text-xs not-italic text-green-400 ml-1">ETB</span></div>
        </div>
        <div className="bg-orange-600/20 border border-orange-500/30 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={14} className="text-orange-400" />
            <span className="text-[10px] font-black text-orange-300 uppercase tracking-widest">Active Bets</span>
          </div>
          <div className="text-xl font-black text-white italic">{stats.activeBets.toFixed(0)} <span className="text-xs not-italic text-orange-400 ml-1">ETB</span></div>
        </div>
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
          <div key={id} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-indigo-300 uppercase leading-none mb-1">User ID</span>
                <span className="text-xs font-bold text-white font-mono">{id}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-gray-500 uppercase leading-none block mb-1">Balance</span>
                <span className="text-lg font-black text-green-400 italic">{balance.toFixed(0)} ETB</span>
              </div>
            </div>

            {/* Quick Adjustment Controls */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <div className="relative flex-1">
                <input 
                  type="number"
                  placeholder="Adjustment amount..."
                  value={adjustmentValues[id] || ''}
                  onChange={(e) => setAdjustmentValues(prev => ({ ...prev, [id]: e.target.value }))}
                  className="w-full bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={() => handleUpdateBalance(id, -Math.abs(Number(adjustmentValues[id])))}
                  disabled={isUpdating === id || !adjustmentValues[id]}
                  className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-30"
                  aria-label="Decrease Balance"
                ><Minus size={14} /></button>
                <button 
                  onClick={() => handleUpdateBalance(id, Math.abs(Number(adjustmentValues[id])))}
                  disabled={isUpdating === id || !adjustmentValues[id]}
                  className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 disabled:opacity-30"
                  aria-label="Increase Balance"
                ><Plus size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}