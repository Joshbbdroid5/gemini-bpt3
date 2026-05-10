import { motion } from 'framer-motion';
import { Trophy, Wallet, UserRound, Stars } from 'lucide-react';
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
    profileWalletBalance: 'Wallet Balance',
    gamesWon: 'Games Won',
    totalEarnings: 'Total Earnings',
    myBalance: 'My Balance',
  };


  return (
    <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
      <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
            <UserRound size={20} className="text-yellow-300" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Telegram
            </span>
            <span className="text-lg font-black text-white italic">
              {telegramName || '—'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
          <Wallet size={16} className="text-yellow-300" />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              {t.profileWalletBalance}
            </span>
            <span className="text-sm font-black text-white">{walletBalance} ETB</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <div className="grid grid-cols-3 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 border border-white/5 rounded-[32px] p-6 shadow-2xl flex flex-col items-start gap-2"
          >
            <Trophy className="text-yellow-300" size={18} />
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{t.gamesWon}</span>
            <span className="text-3xl font-black text-white italic">{gamesWon}</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white/5 border border-white/5 rounded-[32px] p-6 shadow-2xl flex flex-col items-start gap-2"
          >
            <Stars className="text-yellow-300" size={18} />
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{t.totalEarnings}</span>
            <span className="text-3xl font-black text-white italic">{totalEarnings.toFixed(0)} ETB</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/5 border border-white/5 rounded-[32px] p-6 shadow-2xl flex flex-col items-start gap-2"
          >
            <div className="w-8 h-8 rounded-2xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
              <Wallet size={16} className="text-yellow-300" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{t.myBalance}</span>
            <span className="text-xl font-black text-white italic">{walletBalance} ETB</span>
          </motion.div>
        </div>

        <div className="mt-4 bg-white/5 border border-white/5 rounded-[32px] p-6">
          <p className="text-gray-300 text-xs font-black uppercase tracking-widest">
            Profile Summary
          </p>
          <p className="text-gray-400 text-sm mt-3">
            Use the bottom tabs to view game history and wallet transactions.
          </p>
        </div>
      </div>
    </div>
  );
}

