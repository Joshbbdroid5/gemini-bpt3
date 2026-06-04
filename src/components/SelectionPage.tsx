import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Timer, ShoppingCart, ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { TOTAL_BOARDS } from '../types';
import { socket, socketEvents } from './socket';

interface Props {
  wallet: number;
  onSelectionChange: (selectedIds: number[]) => void;
  onBack: () => void;
  serverTimeLeft?: number;
}

export default function SelectionPage({ wallet, onSelectionChange, onBack, serverTimeLeft }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(serverTimeLeft ?? 40); // Initial countdown for selection (fixed)

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

    // BOARD_SYNC provides { takenBoards }
    socket.on(socketEvents.BOARD_SYNC, handleBoardSync as any);
    return () => {
      socket.off(socketEvents.BOARD_SYNC, handleBoardSync);
    };
  }, []);
  
  // Sync timer with server updates to ensure game starts correctly for all players
  useEffect(() => {
    if (serverTimeLeft !== undefined) {
      setTimeLeft(serverTimeLeft);
    }
  }, [serverTimeLeft]);

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

  // Removed automatic onComplete on timeLeft === 0. 
  // Transition is now controlled by App.tsx observing server state.

  const handleSelect = (id: number) => {
    const isCurrentlySelected = selectedIds.has(id);
    const hasAnySelected = selectedIds.size > 0;

    // Only block if this is the first board being selected and balance is too low
    if (!isCurrentlySelected && !hasAnySelected && wallet < 10) { // Fixed stake
      toast.error("Insufficient balance!");
      return;
    }

    // Emit the update to the server immediately
    socket.emit(socketEvents.PICK_BOARD, { boardId: id }); // No stake needed for fixed stake

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        next.delete(id);
      } else {
        next.clear(); // Enforce 1 board limit
        next.add(id);
      }
      onSelectionChange(Array.from(next));
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-gradient-to-br from-yellow-600 via-yellow-700 to-lime-900">
      {/* Stats Bar */}
      <div className="relative p-4 bg-black/30 border-b border-white/10 backdrop-blur-md flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2.5 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-colors shadow-lg shrink-0"
          aria-label={t.back}
          title={t.back}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex-1 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center justify-center bg-black/20 p-2 rounded-xl border border-white/5">
            <Wallet size={14} className="text-lime-400 mb-1" />
            <span className="text-[10px] font-black text-white">{wallet}</span>
          </div>
          
          <div className="flex flex-col items-center justify-center bg-black/20 p-2 rounded-xl border border-white/5">
            <ShoppingCart size={14} className="text-orange-400 mb-1" />
            <span className="text-[10px] font-black text-white uppercase italic">10</span> {/* Fixed stake */}
          </div>

          <div className="flex flex-col items-center justify-center bg-black/20 p-2 rounded-xl border border-white/5">
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
            const isTaken = takenBoards.has(id);
            
            return (
              <button
                id={`board-${id}`}
                key={id}
                onClick={() => handleSelect(id)}
                className={`
                  aspect-[2/3] flex items-center justify-center text-[11px] font-black rounded-xl border-2 transition-transform active:scale-95 relative overflow-hidden
                  ${isSelected
                    ? 'bg-green-500 text-white border-green-300 shadow-[0_0_20px_rgba(34,197,94,0.8)] z-10'
                    : isTaken
                      ? 'bg-red-900/20 text-white/10 border-red-500/40 border-dashed cursor-not-allowed'
                      : 'bg-yellow-500 text-white border-yellow-300 hover:bg-yellow-400 hover:border-white shadow-lg shadow-black/20'
                  }
                `}
                disabled={!isSelected && isTaken}
              >
                <span className="relative z-10">{id}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
