import React from 'react';
import { motion } from 'framer-motion';
import { History, Trophy, UserRound, Wallet } from 'lucide-react';

import { Language } from '../types';
import { translations } from '../translations';


export type BottomTabKey = 'game' | 'history' | 'wallet' | 'profile';

interface Props {
  active: BottomTabKey;
  onTabChange: (tab: BottomTabKey) => void;
  language: Language;
  walletBalance: number;
}

const TabButton = ({
  tab,
  icon,
  label,
  active,
  onClick,
}: {
  tab: BottomTabKey;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={
        'flex-1 flex flex-col items-center justify-center gap-1 h-full py-2 transition-all ' +
        (active
          ? 'text-yellow-300'
          : 'text-gray-300 hover:text-white/90')
      }
      aria-label={label}
    >
      <div
        className={
          'w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ' +
          (active
            ? 'bg-white/10 border-yellow-400/30 shadow-[0_0_22px_rgba(250,204,21,0.15)]'
            : 'bg-white/5 border-white/10')
        }
      >
        {icon}
      </div>
      <span className={'text-[9px] font-black uppercase tracking-widest leading-none ' + (active ? '' : 'opacity-70')}>
        {label}
      </span>
    </button>
  );
};

export default function BottomTabs({ active, onTabChange, language, walletBalance }: Props) {
  const t = translations[language];

  return (
    <motion.nav
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-0 left-0 right-0 z-60 bg-[#2d2e4d] border-t border-white/10 backdrop-blur-md"
    >
      <div className="grid grid-cols-4 h-16">
        <TabButton
          tab="game"
          icon={<Trophy size={18} className={active === 'game' ? 'text-yellow-300' : 'text-gray-300'} />}
          label={t.tabGame}
          active={active === 'game'}
          onClick={() => onTabChange('game')}
        />
        <TabButton
          tab="history"
          icon={<History size={18} className={active === 'history' ? 'text-yellow-300' : 'text-gray-300'} />}
          label={t.tabHistory}
          active={active === 'history'}
          onClick={() => onTabChange('history')}
        />
        <TabButton
          tab="wallet"
          icon={<Wallet size={18} className={active === 'wallet' ? 'text-yellow-300' : 'text-gray-300'} />}
          label={t.tabWallet}
          active={active === 'wallet'}
          onClick={() => onTabChange('wallet')}
        />
        <TabButton
          tab="profile"
          icon={<UserRound size={18} className={active === 'profile' ? 'text-yellow-300' : 'text-gray-300'} />}
          label={t.tabProfile}
          active={active === 'profile'}
          onClick={() => onTabChange('profile')}
        />
      </div>

      {/* small balance hint (keeps UI light) */}
      <div className="absolute -top-2 left-0 right-0 flex justify-center pointer-events-none">
        <div className="bg-black/30 text-[9px] font-black text-yellow-200 px-3 py-1 rounded-full border border-white/10">
          {t.myBalance}: {walletBalance} ETB
        </div>
      </div>
    </motion.nav>
  );
}

