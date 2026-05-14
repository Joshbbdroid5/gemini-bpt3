import { motion } from 'framer-motion';
import { Users, Trophy } from 'lucide-react';

interface StakeButtonProps {
  amount: number;
  players: number;
  isLive: boolean;
  onPlay: (amount: number) => void;
}

export function StakeButton({ amount, players, isLive, onPlay }: StakeButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onPlay(amount)}
      className="group relative overflow-hidden bg-white text-indigo-950 p-6 rounded-[32px] shadow-xl transition-all hover:bg-yellow-400 active:bg-yellow-500 flex flex-col items-start w-full"
    >
      <div className="flex justify-between items-center w-full mb-2">
        <span className="text-2xl font-black italic uppercase tracking-tighter">
          {amount} ETB
        </span>
        {isLive && (
          <span className="bg-red-500 text-white text-[8px] px-2 py-0.5 rounded-full animate-pulse font-black uppercase">
            LIVE
          </span>
        )}
      </div>

      <div className="flex gap-4">
        <div className="flex items-center gap-1.5">
          <Users size={14} className="text-indigo-900/40" />
          <span className="text-xs font-bold">{players}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Trophy size={14} className="text-yellow-600" />
          <span className="text-xs font-black italic">60% PRIZE</span>
        </div>
      </div>

      {/* Decorative background element */}
      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
        <div className="w-12 h-12 bg-black rounded-full -mr-6 -mt-6"></div>
      </div>
    </motion.button>
  );
}