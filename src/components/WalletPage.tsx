import { motion } from 'framer-motion';
import { Wallet, ArrowLeft } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../translations';

interface Props {
  language: Language;
  walletBalance: number;
  telegramName?: string;
  onBack?: () => void;
}

export default function WalletPage({ language, walletBalance, telegramName, onBack }: Props) {
  const t = translations[language];

  return (
    <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
      <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              aria-label={t.back}
            >
              <ArrowLeft size={20} className="text-gray-400" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
              <Wallet size={20} className="text-yellow-300" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t.wallet}</span>
              <span className="text-lg font-black text-white italic">{telegramName || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/5 rounded-[32px] p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                {t.myBalance}
              </span>
              <span className="text-3xl font-black text-white italic">{walletBalance} ETB</span>
            </div>
            <div className="w-12 h-12 rounded-3xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
              <Wallet size={22} className="text-yellow-300" />
            </div>
          </div>
        </motion.div>

        <div className="bg-white/5 border border-white/5 rounded-[32px] p-6">
          <p className="text-gray-300 text-xs font-black uppercase tracking-widest">Wallet Notes</p>
          <p className="text-gray-400 text-sm mt-3">
            Deposit and withdraw are available via Telegram bot.
          </p>
        </div>
      </div>
    </div>
  );
}

