import React, { memo } from 'react';
import { Clock, Users, TrendingUp, Wallet, Trophy } from 'lucide-react';

interface RoundCardProps {
  round: any;
  onSelectBoard: (board: { id: number; balls: number[] }) => void;
}

const RoundCard = memo(({ round, onSelectBoard }: RoundCardProps) => {
  return (
    <div className="bg-white/5 p-5 rounded-[32px] border border-white/5 shadow-2xl relative overflow-hidden">
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
                onClick={() => onSelectBoard({ id: w.boardId, balls: round.ballsDrawn || [] })}
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
  );
});

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

export default RoundCard;