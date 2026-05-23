import { motion } from 'framer-motion';
import { Users, Trophy } from 'lucide-react';

interface StakeButtonProps {
  amount: number;
  players: number;
  isLive: boolean;
  isEngineActive: boolean;
  onPlay: (amount: number) => void;
}

export function StakeButton({ amount, players, isLive, isEngineActive, onPlay }: StakeButtonProps) {
  const pulseVariants = {
    active: {
      scale: [1, 1.02, 1],
      boxShadow: [
        "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        "0 0 30px 10px rgba(99, 102, 241, 0.2)",
        "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
      ],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }
    },
    idle: { scale: 1 }
  };

  return (
    <motion.button
      variants={pulseVariants}
      animate={isEngineActive ? "active" : "idle"}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onPlay(amount)} // Trigger onPlay function with the stake amount
      className="group relative overflow-hidden bg-white text-indigo-950 p-6 rounded-[32px] shadow-xl transition-all hover:bg-yellow-400 active:bg-yellow-500 flex flex-col items-start w-full"
    >
      <div className="flex justify-between items-center w-full mb-2">
        <span className="text-2xl font-black italic uppercase tracking-tighter">
          {amount} ETB
        </span>
        {isEngineActive && !isLive && (
           <span className="flex h-2 w-2 relative">
             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
             <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
           </span>
        )}
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