import React, { useState, useEffect, useMemo } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ArrowLeft, RefreshCw, Search, Wallet, Plus, Minus, TrendingUp, Activity, Power, Check, Users, Trash2, History, Trophy, Clock, ArrowUpDown, X, Download, Calendar, DollarSign, Settings, FileText, ArrowUpRight, ArrowDownLeft, ShoppingCart } from 'lucide-react';
import { socket, socketEvents } from './socket';
import { generateBoard } from '../logic';

interface Props {
  onBack: () => void;
}

type AdminView = 'wallets' | 'rounds' | 'transactions';

export default function AdminDashboard({ onBack }: Props) {
  const [secret, setSecret] = useState('');
  const [wallets, setWallets] = useState<Record<string, { balance: number; username?: string }>>({});
  const [rounds, setRounds] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [roundSearch, setRoundSearch] = useState('');
  const [roundSort, setRoundSort] = useState<{ key: 'date' | 'players' | 'pool'; order: 'asc' | 'desc' }>({ key: 'date', order: 'desc' });
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedBoard, setSelectedBoard] = useState<{ id: number; balls: number[] } | null>(null);
  const [activeTab, setActiveTab] = useState<AdminView>('wallets');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState({ totalVolume: 0, totalProfit: 0, activeBets: 0, totalUsers: 0, isMaintenanceMode: false, isGameRunning: false, stopRequested: false, isEngineActive: false, stakes24h: 0, payouts24h: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [adjustmentValues, setAdjustmentValues] = useState<Record<string, string>>({});
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [selectedUserActivity, setSelectedUserActivity] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [modalData, setModalData] = useState<{ userId: string; amount: number; type: 'add' | 'subtract' | 'set' } | null>(null);
  // Backend URL from environment variables, with a fallback for local development
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const healthUrl = `${backendUrl}/health`;
      // First: prove backend is reachable from the browser
      const healthResp = await fetch(healthUrl, { method: 'GET' });
      if (!healthResp.ok) { // Check if the health check response is not OK
        throw new Error(`Health check failed: ${healthResp.status} ${healthResp.statusText}`);
      }

      const walletsUrl = `${backendUrl}/admin/wallets`;
      const response = await fetch(walletsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      });

      if (response.ok) {
        const data = await response.json();
        setWallets(data.wallets);
        setRecentActivity(data.recentActivity || []);
        if (data.rounds) setRounds(data.rounds);
        setStats(data.stats);
        setIsAuthenticated(true);
      } else { // Handle unauthorized or server errors
        toast.error(`Unauthorized or server error (${response.status})`);
        if (response.status === 403) setIsAuthenticated(false);
      }
    } catch (err) {
      console.error('Admin login fetch error:', err);
      toast.error('Connection to admin services failed.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh wallets and stats every 30 seconds if authenticated
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (isAuthenticated) {
      intervalId = setInterval(() => {
        fetchWallets(); // Periodically refresh wallet data
      }, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAuthenticated, secret, backendUrl]); // Re-run effect if isAuthenticated or secret changes

  const triggerUpdateBalance = (userId: string, amount: number, type: 'add' | 'subtract' | 'set') => {
    if (isNaN(amount) || (type !== 'set' && amount <= 0) || (type === 'set' && amount < 0)) return; 
    setModalData({ userId, amount, type });
    setShowConfirmModal(true);
  };

  const fetchUserActivity = async (userId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/admin/user-activity?userId=${userId}&secret=${secret}`);
      if (response.ok) {
        const data = await response.json();
        setActivityLogs(data);
        setSelectedUserActivity(userId);
      } else {
        toast.error('Failed to fetch activity logs');
      }
    } catch (err) {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const confirmUpdateBalance = async () => {
    if (!modalData) return;
    const { userId, amount, type } = modalData;
    const mode = type === 'set' ? 'set' : 'adjust';
    setIsUpdating(userId);
    setShowConfirmModal(false); // Close modal immediately
    try {
      const finalAmount = type === 'add' ? amount : (type === 'subtract' ? -amount : amount);
      const response = await fetch(`${backendUrl}/admin/update-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: finalAmount, secret, mode })
      });

      if (response.ok) {
        // Clear the input for this user
        setAdjustmentValues(prev => ({ ...prev, [userId]: '' }));
        // Refresh the list to show new balance
        await fetchWallets();
        const actionText = type === 'set' ? `Set balance to ${amount}` : (type === 'add' ? `Added ${amount}` : `Subtracted ${amount}`);
        toast.success(`${actionText} ETB for ${userId}`);
      } else { // Handle errors from the server
        const errorData = await response.json();
        toast.error(`Failed: ${errorData.error || 'Server error'}`);
      }
    } catch (err) {
      toast.error('Connection error');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/admin/delete-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userToDelete, secret })
      });

      if (response.ok) {
        toast.success(`User ${userToDelete} deleted`);
        setShowDeleteConfirm(false);
        setUserToDelete(null);
        await fetchWallets();
      } else {
        toast.error('Failed to delete user');
      }
    } catch (err) {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMaintenance = async () => {
    const nextState = !stats.isMaintenanceMode;
    if (!window.confirm(`Are you sure you want to ${nextState ? 'ENABLE' : 'DISABLE'} maintenance mode?`)) return;

    try {
      const response = await fetch(`${backendUrl}/admin/toggle-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, enabled: nextState })
      });

      if (response.ok) {
        const data = await response.json();
        setStats(prev => ({ ...prev, isMaintenanceMode: data.isMaintenanceMode }));
        toast.success(`Maintenance mode ${data.isMaintenanceMode ? 'enabled' : 'disabled'}`);
      } else {
        toast.error('Failed to update system status');
      }
    } catch (err) {
      toast.error('Connection error');
    }
  };

  const handleStartEngine = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/admin/start-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || 'Game engine started!');
        await fetchWallets(); // Refresh stats to reflect state change
      } else {
        toast.error(data.error || 'Failed to start engine');
      }
    } catch (err) {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleStopEngine = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/admin/stop-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || 'Stop request sent');
        await fetchWallets(); // Refresh stats to reflect state change
      } else {
        toast.error(data.error || 'Failed to stop engine');
      }
    } catch (err) {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const filteredWallets = Object.entries(wallets).filter(([id, data]) => 
    id.toLowerCase().includes(search.toLowerCase()) ||
    (data.username && data.username.toLowerCase().includes(search.toLowerCase()))
  );

  const processedRounds = useMemo(() => {
    let result = [...rounds];
    
    if (roundSearch) {
      result = result.filter(r => r.gameId?.toLowerCase().includes(roundSearch.toLowerCase()));
    }

    if (dateRange.start) {
      // Parse YYYY-MM-DD to local midnight
      const [y, m, d] = dateRange.start.split('-').map(Number);
      const startTime = new Date(y, m - 1, d).getTime();
      result = result.filter(r => new Date(r.date || r.timestamp || 0).getTime() >= startTime);
    }

    if (dateRange.end) {
      // Parse YYYY-MM-DD to local end-of-day
      const [y, m, d] = dateRange.end.split('-').map(Number);
      const endDate = new Date(y, m - 1, d);
      endDate.setHours(23, 59, 59, 999);
      const endTime = endDate.getTime();
      result = result.filter(r => new Date(r.date || r.timestamp || 0).getTime() <= endTime);
    }

    result.sort((a, b) => {
      let vA, vB;
      if (roundSort.key === 'date') {
        vA = new Date(a.date || a.timestamp || 0).getTime();
        vB = new Date(b.date || b.timestamp || 0).getTime();
      } else {
        vA = a[roundSort.key] || 0;
        vB = b[roundSort.key] || 0;
      }

      if (vA < vB) return roundSort.order === 'asc' ? -1 : 1;
      if (vA > vB) return roundSort.order === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [rounds, roundSearch, roundSort, dateRange]);

  const clearAllRoundFilters = () => {
    setRoundSearch('');
    setDateRange({ start: '', end: '' });
  };
  const roundsSummary = useMemo(() => {
    let totalVolume = 0;
    let totalProfit = 0;

    processedRounds.forEach(round => {
      const roundTotalStaked = round.pool / 0.6; // If pool is 60% of total staked
      const roundHouseRake = roundTotalStaked * 0.4; // 40% house rake

      totalVolume += roundTotalStaked;
      totalProfit += roundHouseRake;
    });
    return { totalVolume, totalProfit };
  }, [processedRounds]);

  const exportRoundsToCSV = () => {
    if (processedRounds.length === 0) {
      toast.error('No rounds to export');
      return;
    }

    const headers = ['Round ID', 'Date', 'Status', 'Players', 'Total Staked (ETB)', 'Prize Pool (ETB)', 'Balls Drawn', 'Winners'];
    const rows = processedRounds.map(round => {
      const winnersStr = round.winners?.map((w: any) => `#${w.boardId}(${w.payout.toFixed(0)})`).join('; ') || '';
      const ballsStr = (round.ballsDrawn || []).join(' ');
      const staked = round.totalStaked || (round.players ? round.players * 10 : 0);
      
      return [
        round.gameId,
        round.date || (round.timestamp ? new Date(round.timestamp).toLocaleString() : 'N/A'),
        round.status || 'Finished',
        round.players || 0,
        staked,
        round.pool || 0,
        `"${ballsStr}"`,
        `"${winnersStr}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rounds_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Rounds history exported!');
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-primary"> {/* Login screen for admin access */}
        <Shield size={64} className="text-indigo-400 mb-6 drop-shadow-lg" />
        <h2 className="text-3xl font-black text-white uppercase italic mb-8 text-center tracking-tight">Admin Access</h2>
        <input 
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Enter Admin Secret..."
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
    <>
    <div className="flex-1 flex flex-col bg-primary overflow-hidden h-full">
      <div className="p-4 bg-black/20 border-b border-white/5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors" 
            aria-label="Go back" 
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="font-black text-white uppercase italic text-lg tracking-tight flex items-center gap-2">
            <Shield size={18} className="text-indigo-400" />
            Admin Console
          </h2>
        </div>
        <button onClick={fetchWallets} className={`${loading ? 'animate-spin' : ''}`} aria-label="Refresh wallet list" title="Refresh">
          <RefreshCw size={18} className="text-indigo-400" />
        </button>
      </div>

      {/* System Quick Controls */}
      <div className="px-4 pt-4">
        <div className="bg-black/20 rounded-[32px] p-2 border border-white/5 shadow-inner">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Maintenance Toggle */}
            <div className={`p-4 rounded-[24px] border flex items-center justify-between transition-all ${
              stats.isMaintenanceMode ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${stats.isMaintenanceMode ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                  <Power size={20} />
                </div>
                <div>
                  <h3 className="text-white font-black uppercase text-xs tracking-widest leading-none mb-1">Maintenance</h3>
                  <p className="text-[9px] text-gray-400 uppercase font-bold">{stats.isMaintenanceMode ? 'Paused' : 'Active'}</p>
                </div>
              </div>
              <button
                onClick={handleToggleMaintenance}
                className={`px-4 py-2 rounded-xl font-black uppercase text-[9px] tracking-tighter transition-all ${
                  stats.isMaintenanceMode ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                }`}
              >
                {stats.isMaintenanceMode ? 'Go Live' : 'Shut Down'}
              </button>
            </div>

            {/* Engine Controls */}
            <div className="p-4 rounded-[24px] border border-white/5 bg-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${stats.isEngineActive ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  <Activity size={20} />
                </div>
                <div>
                  <h3 className="text-white font-black uppercase text-xs tracking-widest leading-none mb-1">Game Engine</h3>
                  <p className="text-[9px] text-gray-400 uppercase font-bold">{stats.isEngineActive ? 'Running' : 'Stopped'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {!stats.isGameRunning ? (
                  <button 
                    onClick={handleStartEngine}
                    className="px-4 py-2 rounded-xl font-black uppercase text-[9px] bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                  >
                    Start
                  </button>
                ) : (
                  <button 
                    onClick={handleStopEngine}
                    disabled={stats.stopRequested}
                    className={`px-4 py-2 rounded-xl font-black uppercase text-[9px] ${stats.stopRequested ? 'bg-orange-600 text-white' : 'bg-red-600 text-white shadow-lg shadow-red-900/20'}`}
                  >
                    {stats.stopRequested ? 'Stopping...' : 'Stop'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            if (!socket.connected) socket.connect();
            socket.emit(socketEvents.FORCE_START);
            toast.success('Force start signal sent');
          }}
          className="w-full mt-2 py-3 rounded-2xl bg-yellow-500 text-indigo-950 font-black uppercase text-[10px] tracking-widest hover:bg-yellow-400 shadow-lg transition-all"
        >
          Force New Round Start
        </button>
      </div>

      {/* Global Summary Cards */}
      <div className="px-4 pt-4 grid grid-cols-2 lg:grid-cols-4 gap-3"> {/* Summary statistics cards */}
        <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl p-4 shadow-md">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} className="text-indigo-400" aria-hidden="true" />
            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Total Volume</span>
          </div>
          <div className="text-xl font-black text-white italic">{stats.totalVolume.toFixed(0)} <span className="text-xs not-italic text-indigo-400 ml-1">ETB</span></div>
        </div>
        <div className="bg-green-600/20 border border-green-500/30 rounded-2xl p-4 shadow-md">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-green-400" aria-hidden="true" />
            <span className="text-[10px] font-black text-green-300 uppercase tracking-widest">Total Profit</span>
          </div>
          <div className="text-xl font-black text-white italic">{stats.totalProfit.toFixed(0)} <span className="text-xs not-italic text-green-400 ml-1">ETB</span></div>
        </div>
        <div className="bg-orange-600/20 border border-orange-500/30 rounded-2xl p-4 shadow-md">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={16} className="text-orange-400" aria-hidden="true" />
            <span className="text-[10px] font-black text-orange-300 uppercase tracking-widest">Current Pool</span>
          </div>
          <div className="text-xl font-black text-white italic">{stats.activeBets.toFixed(0)} <span className="text-xs not-italic text-orange-400 ml-1">ETB</span></div>
        </div>
        <div className="bg-purple-600/20 border border-purple-500/30 rounded-2xl p-4 shadow-md">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-purple-400" aria-hidden="true" />
            <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest">Registered Users</span>
          </div>
          <div className="text-xl font-black text-white italic">{stats.totalUsers}</div>
        </div>
      </div>

      {/* 24h Performance Summary */}
      <div className="px-4 pt-3 grid grid-cols-2 gap-3">
        <div className="bg-indigo-500/5 border border-white/5 rounded-2xl p-3 shadow-sm">
          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-1">24h Total Stakes</span>
          <div className="text-lg font-black text-white italic">{stats.stakes24h.toFixed(0)} <span className="text-[10px] not-italic text-gray-500">ETB</span></div>
        </div>
        <div className="bg-green-500/5 border border-white/5 rounded-2xl p-3 shadow-sm">
          <span className="text-[9px] font-black text-green-400 uppercase tracking-widest block mb-1">24h Total Payouts</span>
          <div className="text-lg font-black text-white italic">{stats.payouts24h.toFixed(0)} <span className="text-[10px] not-italic text-gray-500">ETB</span></div>
        </div>
      </div>

      <div className="px-4 mt-6">
        <div className="flex gap-2 p-1 bg-black/20 rounded-2xl border border-white/5">
          <button
            onClick={() => setActiveTab('wallets')}
            className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${
              activeTab === 'wallets' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                : 'text-gray-500 hover:text-white'
            }`}
          >
            <Wallet size={14} aria-hidden="true" />
            Wallets
          </button>
          <button
            onClick={() => setActiveTab('rounds')}
            className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${
              activeTab === 'rounds' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                : 'text-gray-500 hover:text-white'
            }`}
          >
            <History size={14} aria-hidden="true" />
            Rounds
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${
              activeTab === 'transactions' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                : 'text-gray-500 hover:text-white'
            }`}
          >
            <FileText size={14} aria-hidden="true" />
            Transactions
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'wallets' ? (
          <motion.div 
            key="wallets"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="p-4">
              <div className="relative"> {/* Search input for user IDs */}
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} aria-hidden="true" />
                <input 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search User ID or Username..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredWallets.map(([id, data]) => ( // Map through filtered wallets to display each user's data
                <div key={id} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-indigo-300 uppercase leading-none mb-1">User</span>
                      <span className="text-xs font-bold text-white font-mono leading-none">{data.username || 'Anonymous'}</span>
                      <span className="text-[10px] text-gray-500 italic mt-1 font-medium italic underline">ID: {id}</span>
                    </div>
                    <div className="flex items-start gap-4">
                        <button 
                          onClick={() => fetchUserActivity(id)}
                          className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-colors"
                          aria-label="View Activity"
                          title="View Activity"
                        >
                          <History size={16} aria-hidden="true" />
                        </button>
                      <div className="text-right">
                        <span className="text-[10px] font-black text-gray-500 uppercase leading-none block mb-1">Balance</span>
                        <span className="text-lg font-black text-green-400 italic">{data.balance.toFixed(0)} ETB</span>
                      </div>
                      <button 
                        onClick={() => { setUserToDelete(id); setShowDeleteConfirm(true); }}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                        aria-label="Delete User"
                        title="Delete User"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Adjustment Controls */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5"> {/* Balance adjustment controls */}
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        placeholder="Adjustment amount..."
                        value={adjustmentValues[id] || ''}
                        onChange={(e) => setAdjustmentValues(prev => ({ ...prev, [id]: e.target.value }))}
                        className="w-full bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500" // Input for adjustment amount
                      />
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => triggerUpdateBalance(id, Math.abs(Number(adjustmentValues[id])), 'subtract')}
                        disabled={isUpdating === id || !adjustmentValues[id]}
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-30"
                        aria-label="Decrease Balance" // Button to decrease balance
                        title="Decrease Balance"
                      ><Minus size={14} aria-hidden="true" /></button>
                      <button 
                        onClick={() => triggerUpdateBalance(id, Math.abs(Number(adjustmentValues[id])), 'add')}
                        disabled={isUpdating === id || !adjustmentValues[id]}
                        className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 disabled:opacity-30"
                        aria-label="Increase Balance" // Button to increase balance
                        title="Increase Balance"
                      ><Plus size={14} aria-hidden="true" /></button>
                      <button 
                        onClick={() => triggerUpdateBalance(id, Math.abs(Number(adjustmentValues[id])), 'set')}
                        disabled={isUpdating === id || !adjustmentValues[id]}
                        className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 disabled:opacity-30"
                        title="Set Balance Exactly"
                        aria-label="Set Exact Balance"
                      ><Check size={14} aria-hidden="true" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : activeTab === 'rounds' ? (
          <motion.div 
            key="rounds"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {/* Summary Row for Filtered Rounds */}
            {processedRounds.length > 0 && roundsSummary.totalVolume > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl p-4 shadow-md">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign size={16} className="text-indigo-400" aria-hidden="true" />
                    <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Filtered Volume</span>
                  </div>
                  <div className="text-xl font-black text-white italic">{roundsSummary.totalVolume.toFixed(0)} <span className="text-xs not-italic text-indigo-400 ml-1">ETB</span></div>
                </div>
                <div className="bg-green-600/20 border border-green-500/30 rounded-2xl p-4 shadow-md">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp size={16} className="text-green-400" aria-hidden="true" />
                    <span className="text-[10px] font-black text-green-300 uppercase tracking-widest">Filtered Profit</span>
                  </div>
                  <div className="text-xl font-black text-white italic">{roundsSummary.totalProfit.toFixed(0)} <span className="text-xs not-italic text-green-400 ml-1">ETB</span></div>
                </div>
              </div>
            )}

            {/* Search and Filter Controls */}
            <div className="space-y-3 mb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} aria-hidden="true" />
                <input 
                  value={roundSearch}
                  onChange={(e) => setRoundSearch(e.target.value)}
                  placeholder="Search Round ID..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} aria-hidden="true" />
                  <input 
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    aria-label="Filter from date"
                    title="Start Date"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-2 text-[10px] font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                  />
                  {!dateRange.start && <span className="absolute left-9 top-1/2 -translate-y-1/2 text-gray-500 text-[9px] font-black uppercase tracking-widest pointer-events-none">From</span>}
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} aria-hidden="true" />
                  <input 
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    aria-label="Filter to date"
                    title="End Date"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-2 text-[10px] font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                  />
                  {!dateRange.end && <span className="absolute left-9 top-1/2 -translate-y-1/2 text-gray-500 text-[9px] font-black uppercase tracking-widest pointer-events-none">To</span>}
                </div>
              </div>
              
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                 <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap mr-1">Sort:</span>
                 <RoundSortBtn label="Date" activeKey="date" currentSort={roundSort} onSort={setRoundSort} />
                 <RoundSortBtn label="Players" activeKey="players" currentSort={roundSort} onSort={setRoundSort} />
                 <RoundSortBtn label="Pool" activeKey="pool" currentSort={roundSort} onSort={setRoundSort} />
                 {(roundSearch || dateRange.start || dateRange.end) && (
                   <button 
                     onClick={clearAllRoundFilters}
                     className="px-2 py-1 text-[8px] font-black text-red-400 uppercase tracking-widest hover:text-red-300 transition-colors shrink-0"
                   >
                     Clear Filters
                   </button>
                 )}
                 <div className="flex-1" />
                 <button
                   onClick={exportRoundsToCSV}
                   className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors whitespace-nowrap border bg-green-600 text-white border-green-500 shadow-lg shadow-green-900/20 hover:bg-green-500"
                   aria-label="Export Rounds to CSV"
                   title="Export CSV"
                 >
                   <Download size={10} aria-hidden="true" />
                   Export CSV
                 </button>
              </div>
            </div>

            {processedRounds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20 border-2 border-dashed border-white/10 rounded-[32px]" aria-hidden="true">
                <History size={48} className="text-white mb-4" />
                <p className="font-black text-white uppercase text-xs tracking-widest">No round history found</p>
              </div>
            ) : (
              processedRounds.map((round, idx) => (
                <div key={round.gameId || idx} className="bg-white/5 p-5 rounded-[32px] border border-white/5 shadow-2xl relative overflow-hidden">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-yellow-300 tracking-widest uppercase">Round ID</span>
                      <span className="text-xl font-black text-white tracking-tight italic">{round.gameId}</span>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500 justify-end mb-1">
                        <Clock size={12} aria-hidden="true" />
                        {round.date || new Date().toLocaleDateString()}
                      </div>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${round.status === 'active' ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                        {round.status || 'Finished'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <RoundStat label="Players" value={round.players} icon={<Users size={12} aria-hidden="true" />} />
                    <RoundStat label="Staked" value={`${round.totalStaked || (round.players * 10)} ETB`} icon={<TrendingUp size={12} aria-hidden="true" />} />
                    <RoundStat label="Pool" value={`${round.pool} ETB`} icon={<Wallet size={12} aria-hidden="true" />} />
                  </div>

                  {round.winners && round.winners.length > 0 && (
                    <div className="pt-3 border-t border-white/5">
                      <span className="text-[8px] font-black text-indigo-300 uppercase tracking-widest block mb-2">Winners ({round.winners.length})</span>
                      <div className="flex flex-wrap gap-2">
                        {round.winners.map((w: any, wIdx: number) => (
                          <button 
                            key={wIdx} 
                            onClick={() => setSelectedBoard({ id: w.boardId, balls: round.ballsDrawn || [] })}
                            className="bg-green-500/10 border border-green-500/20 rounded-lg px-2 py-1 flex items-center gap-2 hover:bg-green-500/20 transition-colors"
                          >
                            <Trophy size={10} className="text-yellow-400" aria-hidden="true" />
                            <span className="text-[10px] font-bold text-white">#{w.boardId}</span>
                            <span className="text-[10px] font-black text-green-400">{w.payout.toFixed(0)} ETB</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="transactions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">Global Transaction Log</h3>
              <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full italic">Approved & Requested</span>
            </div>

            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20 border-2 border-dashed border-white/10 rounded-[32px]">
                <FileText size={48} className="text-white mb-4" />
                <p className="font-black text-white uppercase text-xs tracking-widest">No recent transactions</p>
              </div>
            ) : (
              recentActivity.map((log, i) => {
                const user = wallets[log.userId];
                return (
                  <div key={i} className="bg-white/5 rounded-2xl p-4 border border-white/5 flex items-center justify-between gap-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-2xl ${
                        log.type === 'deposit' ? 'bg-green-500/20 text-green-400' : 
                        log.type === 'withdrawal' ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'
                      }`}>
                        {log.type === 'deposit' ? <ArrowUpRight size={18} /> : 
                         log.type === 'withdrawal' ? <ArrowDownLeft size={18} /> : <Settings size={18} />}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-black text-white uppercase tracking-wider">
                            {log.type === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL'}
                          </span>
                          <span className="text-[10px] font-bold text-indigo-300 truncate max-w-[100px]">
                            {user?.username || 'Anonymous'}
                          </span>
                        </div>
                        <span className="text-[9px] text-gray-500 font-bold mt-0.5">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        <span className="text-[8px] text-gray-600 font-mono">ID: {log.userId}</span>
                      </div>
                    </div>
                    <div className={`text-base font-black italic whitespace-nowrap ${
                      log.type === 'deposit' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {log.type === 'deposit' ? '+' : '-'}{log.amount.toFixed(0)} <span className="text-[10px] not-italic opacity-60 ml-0.5">ETB</span>
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    <Toaster position="bottom-center" />

    {/* Confirmation Modal */}
    <AnimatePresence> {/* Animate presence for the confirmation modal */}
      {showConfirmModal && modalData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-[#2d2e4d] rounded-2xl p-6 shadow-2xl border border-white/10 w-full max-w-sm text-center"
          >
            <h3 className="text-xl font-black text-white uppercase italic mb-4">Confirm Balance Adjustment</h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to {modalData?.type === 'set' ? 'SET' : (modalData?.type === 'add' ? 'add' : 'subtract')} 
              <span className="font-bold text-yellow-400 mx-1">{modalData?.amount} ETB</span> 
              {modalData?.type === 'set' ? 'as the TOTAL balance for' : (modalData?.type === 'add' ? ' to' : ' from')} user 
              <span className="font-bold text-indigo-300 mx-1">{modalData?.userId}</span>'s wallet?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold uppercase text-sm hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpdateBalance}
                className={`flex-1 py-3 rounded-xl font-black uppercase text-sm transition-colors ${
                  modalData?.type === 'add'
                    ? 'bg-green-600 text-white hover:bg-green-500'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
                disabled={isUpdating !== null}
              >
                {isUpdating ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Delete Confirmation Modal */}
    <AnimatePresence>
      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-[#2d2e4d] rounded-2xl p-6 shadow-2xl border border-white/10 w-full max-w-sm text-center"
          >
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-500" size={32} aria-hidden="true" />
            </div>
            <h3 className="text-xl font-black text-white uppercase italic mb-2">Delete User?</h3>
            <p className="text-gray-300 mb-6 text-sm">
              This will permanently remove user <span className="font-bold text-red-400">{userToDelete}</span>. 
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold uppercase text-xs">Cancel</button>
              <button onClick={handleDeleteUser} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black uppercase text-xs">Delete User</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* User Activity Log Modal */}
    <AnimatePresence>
      {selectedUserActivity && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-[#2d2e4d] rounded-[32px] p-6 shadow-2xl border border-white/10 w-full max-w-md flex flex-col max-h-[80vh]"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest leading-none mb-1">User Activity</span>
                <h3 className="text-xl font-black text-white italic truncate">ID: {selectedUserActivity}</h3>
              </div>
              <button 
                onClick={() => setSelectedUserActivity(null)}
                className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                title="Close"
              >
                <X size={20} className="text-gray-400" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {activityLogs.length === 0 ? (
                <div className="text-center py-10 text-gray-500 font-bold uppercase text-xs">No activity recorded</div>
              ) : (
                activityLogs.map((log, i) => (
                  <div key={i} className="bg-black/20 rounded-2xl p-3 border border-white/5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${
                        log.type === 'deposit' || log.type === 'win' ? 'bg-green-500/20 text-green-400' : 
                        log.type === 'stake' || log.type === 'withdrawal' ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'
                      }`}>
                        {log.type === 'win' ? <Trophy size={14} /> : 
                         log.type === 'stake' ? <ShoppingCart size={14} /> : 
                         log.type === 'deposit' ? <Plus size={14} /> : 
                         log.type === 'withdrawal' ? <Minus size={14} /> : <Settings size={14} />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white uppercase tracking-wider">
                          {log.type.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] text-gray-500 font-bold">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        {log.gameId && (
                          <span className="text-[8px] text-indigo-300 font-mono mt-0.5">GAME: {log.gameId.slice(0,12)}</span>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm font-black italic ${
                      log.type === 'deposit' || log.type === 'win' ? 'text-green-400' : 
                      log.type === 'stake' || log.type === 'withdrawal' ? 'text-red-400' : 'text-indigo-400'
                    }`}>
                      {log.type === 'deposit' || log.type === 'win' ? '+' : '-'}{log.amount} <span className="text-[9px] not-italic opacity-60">ETB</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setSelectedUserActivity(null)}
              className="mt-6 w-full py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest hover:bg-indigo-500 transition-colors"
            >
              Close Log
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Board Detail Modal */}
    <AnimatePresence>
      {selectedBoard && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-[#2d2e4d] rounded-[32px] p-6 shadow-2xl border border-white/10 w-full max-w-sm flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest leading-none mb-1">Board Details</span>
                <h3 className="text-xl font-black text-white italic">Board #{selectedBoard.id}</h3>
              </div>
              <button 
                onClick={() => setSelectedBoard(null)}
                className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Close board preview"
                title="Close"
              >
                <X size={20} className="text-gray-400" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1.5 p-1 bg-black/20 rounded-2xl border border-white/5">
              {generateBoard(selectedBoard.id).map((row, rIdx) => 
                row.map((cell: any, cIdx) => {
                  const isMarked = cell.value === 'FREE' || selectedBoard.balls.includes(cell.value);
                  return (
                    <div 
                      key={`${rIdx}-${cIdx}`}
                      className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-black border transition-colors ${
                        isMarked 
                          ? 'bg-green-600 border-green-400 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]' 
                          : 'bg-white/5 border-white/5 text-gray-500'
                      }`}
                    >
                      {cell.value === 'FREE' ? 'F' : cell.value}
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setSelectedBoard(null)}
              className="mt-6 w-full py-4 rounded-2xl bg-white text-[#2d2e4d] font-black uppercase text-xs tracking-widest hover:bg-yellow-400 transition-colors"
            >
              Close Preview
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    </>
  );
}

function RoundSortBtn({ label, activeKey, currentSort, onSort }: { 
  label: string, 
  activeKey: 'date' | 'players' | 'pool', 
  currentSort: { key: string, order: 'asc' | 'desc' }, 
  onSort: (s: any) => void 
}) {
  const isActive = currentSort.key === activeKey;
  return (
    <button
      onClick={() => onSort({ key: activeKey, order: isActive && currentSort.order === 'desc' ? 'asc' : 'desc' })}
      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors whitespace-nowrap border ${
        isActive 
          ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/20' 
          : 'bg-white/5 text-gray-400 border-white/5 hover:text-white hover:bg-white/10'
      }`}
      aria-label={`Sort by ${label} ${isActive ? (currentSort.order === 'desc' ? 'descending' : 'ascending') : ''}`}
      title={`Sort by ${label}`}
    >
      {label}
      {isActive ? (currentSort.order === 'desc' ? '↓' : '↑') : <ArrowUpDown size={10} aria-hidden="true" />}
    </button>
  );
}

function RoundStat({ label, value, icon }: { label: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-black/20 p-2 rounded-xl border border-white/5">
      <div className="flex items-center gap-1.5 text-[8px] font-black text-gray-500 uppercase tracking-[0.1em] mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-xs font-black text-white italic">{value}</div>
    </div>
  );
}