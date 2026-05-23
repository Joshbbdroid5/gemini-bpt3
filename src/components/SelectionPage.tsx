import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Timer, ShoppingCart, ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
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

  const t = {
    back: 'Back', // Text for the back button
    wallet: 'Wallet', // Label for wallet balance
    refresh: 'Refresh', // Label for refresh button
  }; // Translation object for various UI texts

  useEffect(() => { // Effect hook for socket event listeners
    const handleBoardSync = (data: any) => {
      const taken = new Set<number>(data?.takenBoards ?? []);
      setTakenBoards(taken);
    };

    socket.on(socketEvents.BOARD_SYNC, handleBoardSync);
    return () => {
      socket.off(socketEvents.BOARD_SYNC, handleBoardSync);
    };
  }, []);
  
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
    const isCurrentlySelected = selectedIds.has(id);
    const hasAnySelected = selectedIds.size > 0;

    // Only block if this is the first board being selected and balance is too low
    if (!isCurrentlySelected && !hasAnySelected && wallet < staked) {
      toast.error("Insufficient balance!");
      return;
    }

    // Emit the update to the server immediately
    socket.emit(socketEvents.PICK_BOARD, { boardId: id, stake: staked });

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        next.delete(id);
      } else {
        next.clear(); // Enforce 1 board limit locally
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-gradient-to-br from-yellow-600 via-yellow-700 to-lime-900">
      {/* Stats Bar */}
      <div className="relative pt-2 pb-2 px-4 bg-black/20 border-b border-white/10">
        {/* Back Button (Top Left) */}
        <div className="absolute top-2 left-3 z-50">
          <button
            onClick={onBack}
            className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors shadow-lg"
            aria-label={t.back}
          >
            <ArrowLeft size={20} />
          </button>
        </div>

        {/* Refresh Button (Top Right) */}
        <div className="absolute top-2 right-3 z-50">
          <button
            onClick={() => window.location.reload()}
            className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors shadow-lg"
            aria-label={t.refresh}
          >
            <RefreshCw size={20} className="text-lime-400" />
          </button>
        </div>

        {/* Main Stats (Wallet, Stake, Timer) */}
        <div className="grid grid-cols-3 gap-2 px-10">
          <div className="flex flex-col items-center justify-center bg-white/5 p-1.5 rounded-xl border border-white/10">
            <Wallet size={14} className="text-lime-400 mb-1" />
            <span className="text-[10px] font-black text-white">{wallet} ETB</span>
          </div>
          
          <div className="flex flex-col items-center justify-center bg-white/5 p-1.5 rounded-xl border border-white/10">
            <ShoppingCart size={14} className="text-orange-400 mb-1" />
            <span className="text-[10px] font-black text-white uppercase italic">{staked} ETB</span> {/* Display actual staked amount */}
          </div>

          <div className="flex flex-col items-center justify-center bg-white/5 p-1.5 rounded-xl border border-white/10">
            <Timer size={14} className="text-yellow-400 mb-1" />
            <span className={`text-[12px] font-mono font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {timeLeft}s
            </span>
          </div>
        </div>
      </div>

      {/* Grid of 600 Boards */}
      <div
        className="flex-1 overflow-y-auto min-h-0 pt-2 px-2 pb-0 custom-scrollbar scroll-smooth"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="grid grid-cols-10 gap-1.5 pb-32">
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
                  aspect-[2/3] flex items-center justify-center text-[11px] font-black rounded-xl border-2 transition-all duration-200 relative overflow-hidden
                  ${isSelected
                    ? 'bg-green-500 text-white border-green-300 shadow-[0_0_20px_rgba(34,197,94,0.8)] z-10'
                    : takenBoards.has(id)
                      ? 'bg-red-900/20 text-white/10 border-red-500/40 border-dashed cursor-not-allowed'
                      : 'bg-yellow-500 text-white border-yellow-300 hover:bg-yellow-400 hover:border-white shadow-lg shadow-black/20'
                  }
                `}
                disabled={!isSelected && takenBoards.has(id)}
              >
                {!isSelected && !takenBoards.has(id) && (
                  <div className="absolute top-0 right-0 w-3 h-3 bg-white/5 blur-sm rounded-full -translate-x-1 translate-y-1"></div>
                )}
                <span className="relative z-10">{id}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
