import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Timer, ShoppingCart, ArrowLeft, Users, Trophy } from 'lucide-react';
import { TOTAL_BOARDS } from '../types';
import { socket, socketEvents } from './socket';

interface Props {
  staked: number;
  wallet: number;
  onComplete: (selectedIds: number[]) => void;
  onBack: () => void;
}

export default function SelectionPage({ staked, wallet, onComplete, onBack }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(40);

  const [takenBoards, setTakenBoards] = useState<Set<number>>(new Set());
  const [players, setPlayers] = useState(0);
  const [prizePool60, setPrizePool60] = useState(0);
  const [gameId, setGameId] = useState('---');

  const t = {
    back: 'Back',
    wallet: 'Wallet',
    staked: 'Staked',
    timeRemaining: 'Time Remaining',
    boardsAvailable: 'Boards Available',
    selectBoardInfo: 'Select 1 Board to play.',
    selectionStatus: 'Selection Status',
    boardsRegistered: 'Boards Registered',
    selecting: 'Selecting Board...',
    gameStarting: 'Game Starting Soon',
  };

  useEffect(() => {
    const handlePoolUpdate = (data: any) => {
      // server sends: { rooms, totalActive }
      // we only use current stake=10 in this app; pool is already 60%
      const roomStats = data?.rooms?.[staked];
      if (!roomStats) return;
      setPlayers(roomStats.players ?? 0);
      setPrizePool60(roomStats.pool ?? 0);
      setGameId(roomStats.gameId ?? '---');
    };

    const handleBoardSync = (data: any) => {
      const taken = new Set<number>(data?.takenBoards ?? []);
      setTakenBoards(taken);
    };

    socket.on(socketEvents.POOL_UPDATE, handlePoolUpdate);
    socket.on('game:board_sync', handleBoardSync);

    return () => {
      socket.off(socketEvents.POOL_UPDATE, handlePoolUpdate);
      socket.off('game:board_sync', handleBoardSync);
    };
  }, [staked]);

  // Local countdown (server finalizes at 40s). We keep UI responsive.
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (timeLeft === 0) {
      onComplete(Array.from(selectedIds));
    }
  }, [timeLeft, onComplete, selectedIds]);

  const handleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id); // Limit to 10 boards
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-gradient-to-br from-yellow-600 via-yellow-700 to-lime-900">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-2 p-4 bg-black/20 border-b border-white/10">
        {/* Back Button */}
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={onBack}
            className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
            aria-label={t.back}
          >
            <ArrowLeft size={20} />
          </button>
        </div>
        <div className="flex items-center gap-3 p-3 pl-12 bg-white/10 rounded-2xl border border-white/10">
          <div className="p-2 bg-lime-600 rounded-lg text-white">
            <Wallet size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-yellow-100 opacity-50">{t.wallet}</span>
            <span className="text-sm font-bold text-white">{wallet} ETB</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 p-3 bg-white/10 rounded-2xl border border-white/10">
          <div className="p-2 bg-orange-600 rounded-lg text-white">
            <ShoppingCart size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-300 opacity-50">{t.staked}</span>
            <span className="text-sm font-bold text-white italic">{staked * selectedIds.size} ETB</span>
          </div>
        </div>
      </div>

      {/* Timer Bar */}
      <div className="px-4 py-2 bg-black/40 backdrop-blur-md flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2 text-white">
          <Timer size={14} className="text-yellow-400" />
          <span className="text-[10px] font-black uppercase tracking-widest">{t.timeRemaining}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xl font-mono font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* Info / Dynamic Header */}
      <div className="px-4 py-2 bg-indigo-950/30 flex flex-col gap-2 border-b border-white/5">
        <div className="flex justify-between items-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-yellow-100">
            {t.selectBoardInfo}
          </p>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              <Users size={14} className="text-white/80" />
              <span className="text-[9px] font-black text-white uppercase tracking-tighter">
                {players} Players
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-yellow-400/15 px-2 py-0.5 rounded-full border border-yellow-400/25">
              <Trophy size={14} className="text-yellow-300" />
              <span className="text-[9px] font-black text-yellow-200 uppercase tracking-tighter">
                Total Prize (60%)
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-[8px] font-black text-green-400 uppercase tracking-tighter">
              {TOTAL_BOARDS} {t.boardsAvailable}
            </span>
          </div>

          <div className="px-3 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/20 rounded-2xl">
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-yellow-200/80">Current Prize Pool</div>
            <div className="text-lg font-black italic text-yellow-100">{prizePool60.toFixed(0)} ETB</div>
          </div>

          <div className="text-[9px] font-black uppercase tracking-tighter text-white/60">
            Game & Board ID
            <span className="text-white/90 ml-2">{gameId}</span>
          </div>
        </div>
      </div>

      {/* Grid of 600 Boards */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 custom-scrollbar scroll-smooth">
        <div className="grid grid-cols-10 gap-2 pb-24">
          {Array.from({ length: TOTAL_BOARDS }, (_, i) => i + 1).map((id) => {
            const isSelected = selectedIds.has(id);
            
            return (
              <motion.button
                id={`board-${id}`}
                key={id}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleSelect(id)}
                className={`
                  aspect-square flex items-center justify-center text-[10px] font-black rounded-full border-2 transition-all duration-200 relative overflow-hidden
                  ${isSelected
                    ? 'bg-green-500 text-white border-green-300 shadow-[0_0_20px_rgba(34,197,94,0.8)] z-10'
                    : takenBoards.has(id)
                      ? 'bg-white/5 text-gray-500 border-white/5 cursor-not-allowed opacity-60'
                      : 'bg-yellow-500 text-white border-yellow-300 hover:bg-yellow-400 hover:border-white shadow-lg shadow-black/20'
                  }
                `}
                disabled={!isSelected && takenBoards.has(id)}
              >
                {!isSelected && (
                  <div className="absolute top-0 right-0 w-3 h-3 bg-white/5 blur-sm rounded-full -translate-x-1 translate-y-1"></div>
                )}
                <span className="relative z-10">{id}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
      
      {/* Selection Summary Overlay */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-[#1a2e05]/95 backdrop-blur-xl border-t border-white/20 shadow-2xl z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-yellow-200/50">{t.selectionStatus}</span>
              <span className={`text-lg font-black italic ${selectedIds.size > 0 ? 'text-green-400' : 'text-white'}`}>
                {selectedIds.size > 0 
                  ? `${selectedIds.size} ${t.boardsRegistered}` 
                  : t.selecting
                }
              </span>
            </div>
          </div>
          <div className="px-8 py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
             <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping"></div>
             <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{t.gameStarting}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
