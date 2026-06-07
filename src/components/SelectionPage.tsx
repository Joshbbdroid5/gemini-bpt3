import { useState, useEffect } from 'react';
import { Wallet, Timer, ShoppingCart, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { TOTAL_BOARDS, PickBoardResult } from '../types';
import { socket, socketEvents } from './socket';

interface Props {
  wallet: number;
  selectedBoardIds: number[];
  onSelectionChange: (selectedIds: number[]) => void;
  onBack: () => void;
  serverTimeLeft?: number;
}

export default function SelectionPage({
  wallet,
  selectedBoardIds,
  onSelectionChange,
  onBack,
  serverTimeLeft,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(selectedBoardIds));
  const [takenBoards, setTakenBoards] = useState<Set<number>>(new Set());
  const [pendingBoardId, setPendingBoardId] = useState<number | null>(null);

  const timeLeft = serverTimeLeft ?? 0;

  const t = {
    back: 'Back',
    wallet: 'Wallet',
  };

  useEffect(() => {
    setSelectedIds(new Set(selectedBoardIds));
  }, [selectedBoardIds]);

  useEffect(() => {
    const handleBoardSync = (data: { takenBoards?: number[] }) => {
      setTakenBoards(new Set(data?.takenBoards ?? []));
    };

    const handlePickResult = (result: PickBoardResult) => {
      setPendingBoardId(null);
      setSelectedIds(new Set(result.selectedBoardIds));
      onSelectionChange(result.selectedBoardIds);
      if (result.takenBoards) {
        setTakenBoards(new Set(result.takenBoards));
      }
      if (!result.success && result.message) {
        toast.error(result.message);
      }
    };

    const handleGameInit = (data: { takenBoards?: number[]; myBoardIds?: number[] }) => {
      if (data.takenBoards) {
        setTakenBoards(new Set(data.takenBoards));
      }
      if (data.myBoardIds) {
        setSelectedIds(new Set(data.myBoardIds));
        onSelectionChange(data.myBoardIds);
      }
    };

    socket.on(socketEvents.BOARD_SYNC, handleBoardSync);
    socket.on(socketEvents.PICK_BOARD_RESULT, handlePickResult);
    socket.on(socketEvents.GAME_INIT, handleGameInit);

    return () => {
      socket.off(socketEvents.BOARD_SYNC, handleBoardSync);
      socket.off(socketEvents.PICK_BOARD_RESULT, handlePickResult);
      socket.off(socketEvents.GAME_INIT, handleGameInit);
    };
  }, [onSelectionChange]);

  const handleSelect = (id: number) => {
    if (pendingBoardId !== null) return;

    const isCurrentlySelected = selectedIds.has(id);
    const hasAnySelected = selectedIds.size > 0;

    if (!isCurrentlySelected && !hasAnySelected && wallet < 10) {
      toast.error('Insufficient balance!');
      return;
    }

    setPendingBoardId(id);
    socket.emit(socketEvents.PICK_BOARD, { boardId: id });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-gradient-to-br from-yellow-600 via-yellow-700 to-lime-900">
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
            <span className="text-[10px] font-black text-white uppercase italic">10</span>
          </div>

          <div className="flex flex-col items-center justify-center bg-black/20 p-2 rounded-xl border border-white/5">
            <Timer size={14} className="text-yellow-400 mb-1" />
            <span className={`text-[12px] font-mono font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {timeLeft}s
            </span>
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto min-h-0 pt-2 px-2 pb-0 custom-scrollbar scroll-smooth"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="grid grid-cols-10 gap-1.5 pb-32">
          {Array.from({ length: TOTAL_BOARDS }, (_, i) => i + 1).map((id) => {
            const isSelected = selectedIds.has(id);
            const isTaken = takenBoards.has(id) && !isSelected;
            const isPending = pendingBoardId === id;

            return (
              <button
                id={`board-${id}`}
                key={id}
                onClick={() => handleSelect(id)}
                className={`
                  aspect-[2/3] flex items-center justify-center text-[11px] font-black rounded-xl border-2 transition-transform active:scale-95 relative overflow-hidden
                  ${isPending ? 'opacity-60 animate-pulse' : ''}
                  ${isSelected
                    ? 'bg-green-500 text-white border-green-300 shadow-[0_0_20px_rgba(34,197,94,0.8)] z-10'
                    : isTaken
                      ? 'bg-red-900/20 text-white/10 border-red-500/40 border-dashed cursor-not-allowed'
                      : 'bg-yellow-500 text-white border-yellow-300 hover:bg-yellow-400 hover:border-white shadow-lg shadow-black/20'
                  }
                `}
                disabled={(!isSelected && isTaken) || (pendingBoardId !== null && pendingBoardId !== id)}
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
