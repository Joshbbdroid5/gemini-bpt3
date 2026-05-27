import { motion, AnimatePresence } from 'framer-motion';
import { StakeButton } from './StakeButton';
import { Wrench, Hammer } from 'lucide-react';

interface Props {
  onPlay: (stake: number) => void;
  allStats: Record<number, { players: number; isLive: boolean; isEngineActive: boolean }>;
  isMaintenanceMode?: boolean;
}

export default function Dashboard({ onPlay, allStats, isMaintenanceMode }: Props) {
  const stakeAmount = 10;
  const stats = allStats[stakeAmount] || { players: 0, isLive: false, isEngineActive: false };
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      {/* Welcome message and game title */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8"
      >
        <span className="text-xl font-black uppercase tracking-[0.3em] text-lime-400 mb-2 block">
          Welcome to Lomi Bingo
        </span>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-tight whitespace-pre-line drop-shadow-lg">
          Stake 10 ETB & Play
        </h2>
      </motion.div>

      {/* Maintenance Animation */}
      <AnimatePresence>
        {isMaintenanceMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="mb-8 p-6 bg-yellow-400/10 border-2 border-dashed border-yellow-400/30 rounded-[40px] flex flex-col items-center gap-4 w-full max-w-xs"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: [0, 15, 0, -15, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              >
                <Wrench size={48} className="text-yellow-400" />
              </motion.div>
              <div className="absolute -top-2 -right-2 bg-[#0f170a] p-1 rounded-full">
                <Hammer size={20} className="text-lime-400" />
              </div>
            </div>
            <p className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.3em] animate-pulse">
              Under Maintenance
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entry Fee Buttons */}
      <div className="flex flex-col gap-6 w-full max-w-xs">
        <StakeButton
          amount={stakeAmount}
          players={stats.players}
          isLive={stats.isLive}
          isEngineActive={stats.isEngineActive}
          isDisabled={isMaintenanceMode}
          onPlay={onPlay}
        />
      </div>

      <div className="mt-8 text-[8px] font-bold text-gray-500 uppercase tracking-[0.2em] opacity-50">
        Secure & Verified Gaming
      </div>
    </div>
  );
}