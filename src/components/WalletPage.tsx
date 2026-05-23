import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // Importing motion and AnimatePresence for animations
import { Wallet, ArrowLeft, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface Props {
  walletBalance: number;
  phoneNumber?: string;
  isVerified: boolean;
  onRefresh?: () => void;
  onBack?: () => void;
}

export default function WalletPage({ 
  walletBalance, 
  phoneNumber, 
  isVerified, 
  onRefresh, 
  onBack 
}: Props) {
  const [activeTab, setActiveTab] = useState<'balance' | 'history'>('balance');
 // Translation object for various UI texts
  const t = {
    back: 'Back',
    wallet: 'Wallet',
    verified: 'Verified Account',
    unverified: 'Unverified Account',
    balanceTab: 'Balance',
    historyTab: 'History',
    mainWallet: 'Main Wallet Balance',
    transactions: 'Transaction History',
    noHistory: 'No transactions yet',
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
      {/* Header Section */}
      <div className="p-6 bg-black/20 border-b border-white/10"> {/* Header section for Wallet Page */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {onBack && (
              <button 
                onClick={onBack} 
                className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                aria-label={t.back}
              > {/* Back button */}
                <ArrowLeft size={20} className="text-gray-400" />
              </button>
            )}
            <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">{t.wallet}</h2>
          </div>
          <button 
            onClick={onRefresh}
            className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 active:scale-90 transition-all"
            aria-label="Refresh"
          > {/* Refresh button */}
            <RefreshCw size={20} className="text-lime-400" />
          </button>
        </div>

        {/* User Profile Info */}
        <div className="ml-12 flex flex-col gap-1">
          <div className="text-lg font-black text-white italic tracking-tight">
            {phoneNumber || 'No phone number linked'}
          </div>
          <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${isVerified ? 'text-lime-400' : 'text-orange-400'}`}>
            {isVerified ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {isVerified ? t.verified : t.unverified}
          </div>
        </div>
      </div>

      {/* Sub-menu Tabs */}
      <div className="px-4 mt-6">
        <div className="flex gap-2 p-1 bg-black/20 rounded-2xl border border-white/5">
          <button
            onClick={() => setActiveTab('balance')}
            className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${
              activeTab === 'balance' 
                ? 'bg-lime-400 text-black shadow-[0_0_20px_rgba(163,230,53,0.3)]' 
                : 'text-gray-500 hover:text-white'
            }`}
          > {/* Balance tab button */}
            {t.balanceTab}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${
              activeTab === 'history' 
                ? 'bg-lime-400 text-black shadow-[0_0_20px_rgba(163,230,53,0.3)]' 
                : 'text-gray-500 hover:text-white'
            }`}
          > {/* History tab button */}
            {t.historyTab}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'balance' ? (
            <motion.div
              key="balance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }} // Animation for balance tab content
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-white/5 border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                <div className="relative z-10 flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-400/60 mb-2">
                    {t.mainWallet}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-white italic tracking-tighter">
                      {walletBalance.toLocaleString()}
                    </span>
                    <span className="text-xl font-black text-lime-400 italic">ETB</span> {/* Currency unit */}
                  </div>
                </div>
                <Wallet 
                  size={120} 
                  className="absolute -right-8 -bottom-8 text-white/5 -rotate-12 group-hover:scale-110 transition-transform duration-700" 
                />
              </div>

              <div className="p-6 bg-white/5 border border-white/5 rounded-[32px]">
                <p className="text-gray-300 text-xs font-black uppercase tracking-widest mb-3">Wallet Notes</p> {/* Section for wallet notes */}
                <p className="text-gray-400 text-sm leading-relaxed">
                  Secure transactions via Telebirr. Verified users enjoy instant withdrawals and higher limits.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }} // Animation for history tab content
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-3"
            >
              <h3 className="px-2 text-[11px] font-black text-gray-500 uppercase tracking-[0.3em] mb-2">
                {t.transactions}
              </h3>
              <div className="flex flex-col items-center justify-center py-20 opacity-20 border-2 border-dashed border-white/10 rounded-[32px]">
                <Clock size={48} className="text-white mb-4" />
                <p className="font-black text-white uppercase text-xs tracking-widest">{t.noHistory}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
