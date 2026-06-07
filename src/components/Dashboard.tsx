import { motion, AnimatePresence } from 'framer-motion';
import { StakeButton } from './StakeButton';
import { Wrench, Hammer, Users, Trophy } from 'lucide-react';
import { GameState } from '../types';

interface Props {
  onPlay: () => void;
  roomStats: {
    players: number;
    pool: number;
    isLive: boolean;
    isEngineActive: boolean;
    state?: GameState;
    selectionTimeLeft?: number;
  };
  isMaintenanceMode?: boolean;
}

function getPlayLabel(stats: Props['roomStats'], isMaintenanceMode?: boolean): string {
  if (isMaintenanceMode) return 'Unavailable';
  if (!stats.isEngineActive) return 'Engine Starting Soon';
  if (stats.isLive) return 'Watch Live Game';
  return 'Join Selection';
}

export default function Dashboard({ onPlay, roomStats, isMaintenanceMode }: Props) {
  const stats = roomStats || { players: 0, pool: 0, isLive: false, isEngineActive: false };
  const playLabel = getPlayLabel(stats, isMaintenanceMode);
  const timerLabel =
    stats.isLive || stats.state === GameState.GAME
      ? 'Game in progress'
      : stats.selectionTimeLeft && stats.selectionTimeLeft > 0
        ? `${stats.selectionTimeLeft}s left to pick`
        : stats.isEngineActive
          ? 'Selection open'
          : 'Waiting for admin';

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8"
      >
        <span className="text-lg font-black uppercase tracking-[0.4em] text-lime-400/80 mb-2 block">
          Welcome to Lomi Bingo
        </span>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-none drop-shadow-2xl">
          Ready to Win?
        </h2>
      </motion.div>

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
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              >
                <Wrench size={48} className="text-yellow-400" aria-hidden="true" />
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

      {stats.isEngineActive && !isMaintenanceMode && (
        <div className="mb-6 grid grid-cols-3 gap-2 w-full max-w-xs">
          <div className="bg-black/30 rounded-2xl p-3 border border-white/10">
            <Users size={14} className="text-lime-400 mx-auto mb-1" />
            <span className="text-[9px] font-black text-gray-400 uppercase block">Players</span>
            <span className="text-lg font-black text-white">{stats.players}</span>
          </div>
          <div className="bg-black/30 rounded-2xl p-3 border border-white/10">
            <Trophy size={14} className="text-yellow-400 mx-auto mb-1" />
            <span className="text-[9px] font-black text-gray-400 uppercase block">Derash</span>
            <span className="text-lg font-black text-white">{Math.round(stats.pool)}</span>
          </div>
          <div className="bg-black/30 rounded-2xl p-3 border border-white/10">
            <span className="text-[9px] font-black text-gray-400 uppercase block mt-4">Status</span>
            <span className="text-[10px] font-black text-lime-400 leading-tight">{timerLabel}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 w-full max-w-xs">
        <StakeButton
          amount={10}
          players={stats.players}
          pool={stats.pool}
          isLive={stats.isLive}
          isEngineActive={stats.isEngineActive}
          isDisabled={isMaintenanceMode}
          playLabel={playLabel}
          onPlay={onPlay}
        />
      </div>

      <div className="mt-8 text-[8px] font-bold text-gray-500 uppercase tracking-[0.2em] opacity-50">
        Secure & Verified Gaming
      </div>
    </div>
  );
}
