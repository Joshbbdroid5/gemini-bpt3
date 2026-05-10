import { motion } from 'framer-motion';
import { Users, Trophy, MessageCircle } from 'lucide-react';

// isGameActive prop now reflects the current room's live status
interface Props {
  onPlay: (stake: number) => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  wallet: number; // Added wallet prop
  allStats: Record<number, any>;
}

export default function Dashboard({ onPlay, onDeposit, onWithdraw, wallet, allStats }: Props) {
  return (

    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">





      {/* Community Link */}
      <button 
        onClick={() => window.open('https://t.me/your_channel', '_blank')}
        className="mb-8 flex items-center gap-2 px-4 py-2 bg-indigo-600/20 text-indigo-300 rounded-full border border-indigo-500/30 text-[9px] font-black uppercase tracking-widest animate-bounce"
      >
        <MessageCircle size={14} />
        Join Official Channel
      </button>

      {/* Welcome */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-200 mb-2 block">
          Welcome to Lomi Bingo
        </span>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-tight whitespace-pre-line drop-shadow-lg">
          Stake 10 ETB & Play
        </h2>
      </motion.div>


      {/* Entry Fee Buttons */}
      <div className="flex flex-col gap-6 w-full max-w-xs">
        {[10].map((amount) => (
          <motion.button
            key={amount}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onPlay(amount)} 
            className="group relative overflow-hidden bg-white text-indigo-950 p-6 rounded-[32px] shadow-xl transition-all hover:bg-yellow-400 active:bg-yellow-500 flex flex-col items-start"
          >
            <div className="flex justify-between items-center w-full mb-2">
               <span className="text-2xl font-black italic uppercase tracking-tighter">{amount} ETB</span>
               {allStats[amount]?.isLive && (
                 <span className="bg-red-500 text-white text-[8px] px-2 py-0.5 rounded-full animate-pulse font-black uppercase">LIVE</span>
               )}
            </div>
            
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <Users size={14} className="text-indigo-900/40" />
                <span className="text-xs font-bold">{allStats[amount]?.players || 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Trophy size={14} className="text-yellow-600" />
                <span className="text-xs font-black italic">
                  {((allStats[amount]?.pool || 0) * 0.8).toFixed(0)} ETB
                </span>
              </div>
            </div>

            {/* Subtle decorative circle */}
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
               <div className="w-12 h-12 bg-black rounded-full -mr-6 -mt-6"></div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="mt-8 text-[8px] font-bold text-gray-500 uppercase tracking-[0.2em] opacity-50">
        Secure & Verified Gaming
      </div>
    </div>
  );
}