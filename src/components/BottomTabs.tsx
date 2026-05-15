import React from 'react';
import { motion } from 'framer-motion';
import { History, Trophy, UserRound, Wallet } from 'lucide-react';

export type BottomTabKey = 'game' | 'history' | 'wallet' | 'profile';

interface Props {
  active: BottomTabKey;
  onTabChange: (tab: BottomTabKey) => void;
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
        'flex-1 flex flex-col items-center justify-center gap-1 h-full py-2 transition-all relative ' +
        (active 
          ? 'text-yellow-300 scale-110'
          : 'text-gray-300 hover:text-white/90')
      }
      aria-label={label}
    >
      <div
        className={
          'w-8 h-8 rounded-xl flex items-center justify-center border transition-all ' +
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
      {active && (
        <motion.div
          layoutId="activeTab"
          className="absolute -bottom-0 w-8 h-0.5 bg-yellow-300 rounded-full shadow-[0_0_8px_rgba(253,224,71,0.6)]"
        />
      )}
    </button>
  );
};

export default function BottomTabs({ active, onTabChange }: Props) {
  const t = {
    tabGame: 'Game',
    tabHistory: 'History',
    tabWallet: 'Wallet',
    tabProfile: 'Profile',
  };

  return (
    <motion.nav
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-0 left-0 right-0 z-60 bg-[#2d2e4d] border-t border-white/10 backdrop-blur-md"
    >
      <div className="grid grid-cols-4 h-14">
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
    </motion.nav>
  );
}
