import { motion } from 'framer-motion';
import { StakeButton } from './StakeButton';

interface Props {
  onPlay: (stake: number) => void;
  allStats: Record<number, { players: number; isLive: boolean }>;
}

export default function Dashboard({ onPlay, allStats }: Props) {
  const stakeAmount = 10;
  const stats = allStats[stakeAmount] || { players: 0, isLive: false };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      {/* Welcome */}
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

      {/* Entry Fee Buttons */}
      <div className="flex flex-col gap-6 w-full max-w-xs">
        <StakeButton
          amount={stakeAmount}
          players={stats.players}
          isLive={stats.isLive}
          onPlay={onPlay}
        />
      </div>

      <div className="mt-8 text-[8px] font-bold text-gray-500 uppercase tracking-[0.2em] opacity-50">
        Secure & Verified Gaming
      </div>
    </div>
  );
}