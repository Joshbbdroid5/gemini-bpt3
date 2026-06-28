import { motion } from 'framer-motion';
import { User, Award, DollarSign, Users, ArrowLeft } from 'lucide-react';

interface Props {
  telegramName: string;
  telegramUsername?: string;
  phoneNumber?: string;
  walletBalance: number;
  gamesWon: number;
  totalEarnings: number;
  telegramDisplayName: string;
  referredCount: number;
  botUsername?: string;
  onViewHistory: () => void;
  onBack?: () => void;
}

export default function ProfilePage({
  telegramName,
  telegramUsername,
  phoneNumber,
  walletBalance,
  gamesWon,
  totalEarnings,
  telegramDisplayName, 
  referredCount,
  botUsername,
  onViewHistory,
  onBack,
}: Props) {
  const t = {
    back: 'Back',
    myProfile: 'My Profile',
    yourStats: 'Your Stats',
    walletBalance: 'Wallet Balance',
    gamesWon: 'Games Won',
    totalEarnings: 'Total Earnings',
    totalReferred: 'Total Referred',
    viewHistory: 'View Full History',
    topUpWallet: 'Top Up Wallet',
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
      {/* Header Section */}
      <div className="p-6 bg-black/20 border-b border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                aria-label={t.back}
                title={t.back}
              >
                <ArrowLeft size={20} className="text-gray-400" />
              </button>
            )}
            <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">{t.myProfile}</h2>
          </div>
        </div>

        {/* User Profile Info */}
        <div className="ml-12 flex flex-col gap-1">
          <div className="text-lg font-black text-white italic tracking-tight">
            {telegramDisplayName || 'Anonymous User'}
          </div>
          {telegramUsername && (
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-300 leading-none">
              <User size={11} />
              @{telegramUsername}
            </div>
          )}
          {phoneNumber && (
            <div className="text-[10px] font-bold text-lime-400 leading-none">📱 {phoneNumber}</div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="p-6 bg-white/5 border border-white/5 rounded-[32px]">
            <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4">{t.yourStats}</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-white">
                <span className="flex items-center gap-2 text-gray-300"><DollarSign size={16} /> {t.walletBalance}:</span>
                <span className="font-black italic">{walletBalance.toLocaleString()} ETB</span>
              </div>
              <div className="flex items-center justify-between text-white">
                <span className="flex items-center gap-2 text-gray-300"><Award size={16} /> {t.gamesWon}:</span>
                <span className="font-black italic">{gamesWon}</span>
              </div>
              <div className="flex items-center justify-between text-white">
                <span className="flex items-center gap-2 text-gray-300"><DollarSign size={16} /> {t.totalEarnings}:</span>
                <span className="font-black italic">{totalEarnings.toLocaleString()} ETB</span>
              </div>
              <div className="flex items-center justify-between text-white">
                <span className="flex items-center gap-2 text-gray-300"><Users size={16} /> {t.totalReferred}:</span>
                <span className="font-black italic">{referredCount}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onViewHistory}
              className="w-full bg-lime-500 text-black py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-lime-600 transition-colors"
            >
              {t.viewHistory}
            </button>
            {/* Example: Top Up button, can be linked to wallet page or a specific action */}
            <button
              onClick={() => {
                if (botUsername) {
                  window.open(`https://t.me/${botUsername.replace('@', '')}`, '_blank');
                } else {
                  window.Telegram?.WebApp?.close?.();
                }
              }}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-colors"
            >
              {t.topUpWallet}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}