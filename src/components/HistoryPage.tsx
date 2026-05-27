import { motion } from 'framer-motion';
import { History, ArrowLeft, Trophy, Users, Wallet, Calendar, ShoppingCart, RotateCcw, RefreshCw } from 'lucide-react'; // Importing necessary icons from lucide-react
import { ReactNode } from 'react';
import { HistoryEntry } from '../types';

interface Props {
  history: HistoryEntry[];
  onBack: () => void;
}

export default function HistoryPage({ history, onBack }: Props) {
  const t = {
    back: 'Back',
    gameHistory: 'Game History',
    totalPlayed: 'Total Games Played',
    recentGames: 'Recent Games',
    noGames: 'No games recorded yet',
    myWin: 'MY WIN',
    myLoss: 'LOSS',
    gameId: 'Game ID',
    winners: 'Winners',
    totalPool: 'Total Pool',
    payout: 'Payout',
    staked: 'Staked',
    boardNum: 'Board Count',
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
      {/* Header Section */}
      <div className="p-6 bg-black/20 border-b border-white/10 flex flex-col gap-1 relative">
        <div className="flex items-center justify-between mb-2"> {/* Header with back and refresh buttons */}
          <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
          aria-label={t.back}
        >
          <ArrowLeft size={20} className="text-gray-400" /> {/* Back button icon */}
          </button>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">{t.gameHistory}</h2>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 active:scale-90 transition-all"
            aria-label="Refresh"
          > {/* Refresh button */}
            <RefreshCw size={20} className="text-lime-400" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-lime-400 ml-12">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{t.totalPlayed}:</span>
          <span className="text-lg font-black italic">{history.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {history.length === 0 ? ( // Conditional rendering for empty history
          <div className="flex flex-col items-center justify-center h-full text-center p-10 opacity-30">
            <History size={48} className="text-gray-300 mb-4" />
            <p className="font-bold text-gray-400 uppercase tracking-widest text-xs">{t.noGames}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="px-2">
              <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em]">
                {t.recentGames}
              </h3>
            </div>
            {history.slice().reverse().map((entry, idx) => ( // Map through history entries, reversed for most recent first
            <motion.div
              key={entry.gameId}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
              className={`
                bg-white/5 p-5 rounded-[32px] border border-white/5 shadow-2xl relative overflow-hidden
                ${entry.isMyWin ? 'ring-2 ring-yellow-400 border-transparent shadow-[0_0_20px_rgba(250,204,21,0.2)]' : ''}
              `}
            >
              <div className={`absolute top-0 right-0 px-4 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest ${
                entry.isMyWin ? 'bg-yellow-400 text-indigo-950' : 'bg-white/10 text-gray-400'
              }`}>
                {entry.isMyWin ? t.myWin : t.myLoss}
              </div>

              <div className="flex items-start justify-between mb-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-yellow-300 tracking-widest uppercase">{t.gameId}</span>
                  <span className="text-xl font-black text-white tracking-tight italic select-all block">{entry.gameId}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                  <Calendar size={12} />
                  {entry.date}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                <StatItem 
                  icon={<ShoppingCart size={12} />} 
                  label={t.staked} 
                  value={`${(entry.myBoardsCount * 10).toFixed(0)} ETB`} 
                />
                <StatItem 
                  icon={<RotateCcw size={12} />} 
                  label={t.boardNum} 
                  value={`#${entry.myBoardsCount}`} 
                />
                <StatItem 
                  icon={<Users size={12} />} 
                  label={t.winners} 
                  value={`${entry.totalWinners}`} 
                />
                <StatItem 
                  icon={<Wallet size={12} />} 
                  label={t.totalPool} 
                  value={`${entry.totalStaked} ETB`} 
                />
                <StatItem 
                  icon={<Trophy size={12} />} 
                  label={t.payout} 
                  value={`${entry.payoutPerWinner.toFixed(0)} ETB`} 
                  highlight={entry.isMyWin}
                />
              </div>
            </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatItem({ icon, label, value, highlight }: { icon: ReactNode, label: string, value: string, highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[8px] font-black text-gray-400 uppercase tracking-[0.1em]">
        {icon}
        {label}
      </div>
      <div className={`text-sm font-black italic tracking-tight ${highlight ? 'text-yellow-400' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}
