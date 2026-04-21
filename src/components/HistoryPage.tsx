import { motion } from 'framer-motion';
import { History, ArrowLeft, Trophy, Users, Wallet, Calendar } from 'lucide-react';
import { ReactNode } from 'react';
import { HistoryEntry } from '../types';

interface Props {
  history: HistoryEntry[];
  onBack: () => void;
}

export default function HistoryPage({ history, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
      <div className="p-4 bg-white/5 border-b border-white/5 flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-400" />
        </button>
        <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Game History</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-10 opacity-30">
            <History size={48} className="text-gray-300 mb-4" />
            <p className="font-bold text-gray-400 uppercase tracking-widest text-xs">No games recorded yet</p>
          </div>
        ) : (
          history.slice().reverse().map((entry, idx) => (
            <motion.div
              key={idx}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
              className={`
                bg-white/5 p-6 rounded-[32px] border border-white/5 shadow-2xl relative overflow-hidden
                ${entry.isMyWin ? 'ring-2 ring-yellow-400 border-transparent shadow-[0_0_20px_rgba(250,204,21,0.2)]' : ''}
              `}
            >
              {entry.isMyWin && (
                <div className="absolute top-0 right-0 bg-yellow-400 text-indigo-950 px-4 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest">
                  MY WIN
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-indigo-300 tracking-widest uppercase">Game ID</span>
                  <span className="text-xl font-black text-white tracking-tight italic select-all block">{entry.gameId}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                  <Calendar size={12} />
                  {entry.date}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatItem 
                  icon={<Users size={12} />} 
                  label="Winners" 
                  value={`${entry.totalWinners}`} 
                />
                <StatItem 
                  icon={<Wallet size={12} />} 
                  label="Total Pool" 
                  value={`${entry.totalStaked} ETB`} 
                />
                <StatItem 
                  icon={<Trophy size={12} />} 
                  label="Payout" 
                  value={`${entry.payoutPerWinner.toFixed(0)} ETB`} 
                  highlight={entry.isMyWin}
                />
              </div>

              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest leading-none">
                  My Boards: <span className="text-white">{entry.myBoardsCount}</span>
                </span>
                <span className={`text-[9px] font-black uppercase italic ${entry.isMyWin ? 'text-yellow-400' : 'text-white/20'}`}>
                  {entry.isMyWin ? 'Big Congratulations' : 'Better luck next time'}
                </span>
              </div>
            </motion.div>
          ))
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
