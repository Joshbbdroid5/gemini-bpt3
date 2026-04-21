import { motion } from 'framer-motion';
import { Users, Play, Eye, Timer, Trophy } from 'lucide-react';

interface Props {
  onPlay: () => void;
  onWatch: () => void;
}

export default function LobbyPage({ onPlay, onWatch }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-transparent text-white">
      {/* Branding / Game Name */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-12"
      >
        <h1 className="text-5xl font-black italic tracking-tighter uppercase text-white mb-2 drop-shadow-lg">
          Western <span className="text-yellow-400">Bingo</span>
        </h1>
        <p className="text-indigo-200 text-xs font-black uppercase tracking-[0.3em]">The Premium Live Experience</p>
      </motion.div>

      {/* Active Game Info Card */}
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="w-full max-w-sm bg-white/10 backdrop-blur-xl rounded-[40px] border border-white/20 p-8 shadow-2xl space-y-6 relative overflow-hidden"
      >
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
        
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-indigo-300 tracking-widest">Active Game</span>
            <span className="text-lg font-black italic tracking-tight">#LIVE-9928</span>
          </div>
          <div className="bg-red-500 px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 animate-pulse">
            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            Live Now
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-white/50 text-[10px] font-black uppercase">
              <Users size={12} />
              Players
            </div>
            <div className="text-xl font-black italic text-white">1,204</div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-white/50 text-[10px] font-black uppercase">
              <Trophy size={12} className="text-yellow-400" />
              Pool Size
            </div>
            <div className="text-xl font-black italic text-green-400">12,450 ETB</div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-white/10">
          <button 
            onClick={onPlay}
            className="w-full p-6 bg-yellow-400 hover:bg-yellow-300 active:scale-[0.98] transition-all rounded-3xl flex items-center justify-between group shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-950 rounded-xl text-yellow-400">
                <Play size={20} fill="currentColor" />
              </div>
              <div className="flex flex-col items-start translate-y-[-1px]">
                <span className="text-indigo-950 font-black text-lg leading-none italic uppercase -tracking-wider">Stake & Play</span>
                <span className="text-indigo-900/50 text-[9px] font-black uppercase tracking-widest">Win big prizes</span>
              </div>
            </div>
            <ArrowRightIcon className="text-indigo-950 group-hover:translate-x-1 transition-transform" />
          </button>

          <button 
            onClick={onWatch}
            className="w-full p-4 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all rounded-3xl border border-white/10 flex items-center justify-center gap-3 text-white font-black uppercase tracking-widest text-[10px]"
          >
            <Eye size={16} />
            Watch Without Staking
          </button>
        </div>
      </motion.div>

      {/* Stats Footnote */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-12 flex items-center gap-8 opacity-40 text-[10px] font-black uppercase tracking-tighter"
      >
        <div className="flex items-center gap-2">
          <Timer size={14} />
          Starts Every 10m
        </div>
        <div className="flex items-center gap-2">
          <Trophy size={14} />
          Certified Provable Fair
        </div>
      </motion.div>
    </div>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-6 h-6 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}
