import { motion } from 'framer-motion';
import { Trophy, Wallet, UserRound, Stars, RefreshCw } from 'lucide-react';
interface Props {
  telegramName?: string;
  walletBalance: number;
  gamesWon: number;
  totalEarnings: number;
}

export default function ProfilePage({
  telegramName,
  walletBalance,
  gamesWon,
  totalEarnings,
}: Props) {
  const t = {
    profileWalletBalance: 'Main Wallet Balance',
    gamesWon: 'Games Won',
    totalEarnings: 'Total Earnings',
   };


  return (
    <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
      {/* Refresh Button (Top Right) */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => window.location.reload()}
          className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 active:scale-90 transition-all"
          aria-label="Refresh"
        >
          <RefreshCw size={20} className="text-lime-400" />
        </button>
      </div>
          {/* Top Middle Username */}
      <div className="flex flex-col items-center justify-center p-8 mt-4">
        <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-3 shadow-xl">
          <UserRound size={40} className="text-lime-400" />
          </div>
          <span className="text-2xl font-black text-white uppercase italic tracking-tight">
          {telegramName || 'Guest User'}
        </span>
      </div>
      
<div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Main Wallet Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group flex flex-col items-center text-center"
        >
          <div className="relative z-10">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-400/60 mb-2 block">
              {t.profileWalletBalance}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-white italic tracking-tighter">
                {walletBalance.toLocaleString()}
              </span>
              <span className="text-xl font-black text-lime-400 italic">ETB</span>
            </div>
          </div>
          <Wallet size={120} className="absolute -right-8 -bottom-8 text-white/5 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
        </motion.div>

        {/* Games Won Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/5 border border-white/5 rounded-[32px] p-6 shadow-2xl flex flex-col items-center gap-2 text-center"
        >
          <div className="w-10 h-10 rounded-2xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
            <Trophy className="text-yellow-400" size={20} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{t.gamesWon}</span>
          <span className="text-3xl font-black text-white italic">{gamesWon}</span>
        </motion.div>

        {/* Total Earnings Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/5 border border-white/5 rounded-[32px] p-6 shadow-2xl flex flex-col items-center gap-2 text-center"
        >
          <div className="w-10 h-10 rounded-2xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center">
            <Stars className="text-lime-400" size={20} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{t.totalEarnings}</span>
          <span className="text-2xl font-black text-white italic">
            {totalEarnings.toLocaleString()} <span className="text-xs not-italic font-bold text-lime-400">ETB</span>
          </span>
        </motion.div>

         
      </div>
    </div>
  );
}
