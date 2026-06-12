import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { Wallet, Timer, ShoppingCart, ArrowLeft, Search, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { TOTAL_BOARDS, SINGLE_STAKE, PickBoardResult } from '../types';
import { socket, socketEvents } from './socket';
import * as ReactWindow from 'react-window';

// Use namespace import and cast to resolve "no exported member" TypeScript errors (2305)
const { FixedSizeGrid, areEqual } = ReactWindow as any;

interface Props {
  wallet: number;
  selectedBoardIds: number[];
  onSelectionChange: (selectedIds: number[]) => void;
  onBack: () => void;
  onDismissHint?: () => void;
  serverTimeLeft?: number;
  showNextRoundHint?: boolean;
}

// Memoized BoardCell component to prevent unnecessary re-renders of individual cells
const BoardCell = memo(({ columnIndex, rowIndex, style, data }: {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  data: {
    selectedIds: Set<number>;
    takenBoards: Set<number>;
    pendingBoardId: number | null;
    handleSelect: (id: number) => void;
  };
}) => {
  const { selectedIds, takenBoards, pendingBoardId, handleSelect, columnCount } = data;
  const id = rowIndex * columnCount + columnIndex + 1;

  // Ensure we don't render beyond TOTAL_BOARDS
  if (id > TOTAL_BOARDS) {
    return null;
  }

  const isSelected = selectedIds.has(id);
  const isTaken = takenBoards.has(id) && !isSelected;
  const isPending = pendingBoardId === id;

  return (
    <div style={style} className="p-[3px]">
      <button
        id={`board-${id}`}
        onClick={() => handleSelect(id)}
        className={`
          w-full h-full flex items-center justify-center text-[11px] font-black rounded-xl border-2 transition-all active:scale-95 relative overflow-hidden
          ${isPending ? 'opacity-60 animate-pulse' : ''}
          ${
            isSelected
              ? 'bg-green-500 text-white border-green-300 shadow-[0_0_20px_rgba(34,197,94,0.8)] z-10'
              : isTaken
                ? 'bg-black/20 text-white/20 border-white/5 border-dashed cursor-not-allowed'
                : 'bg-yellow-500 text-white border-yellow-300 hover:bg-yellow-400 hover:border-white shadow-lg'
          }
        `}
        disabled={(!isSelected && isTaken) || pendingBoardId !== null}
      >
        <span className="relative z-10">{id}</span>
      </button>
    </div>
  );
}, areEqual);

export default function SelectionPage({
  wallet,
  selectedBoardIds,
  onSelectionChange,
  onBack,
  onDismissHint,
  serverTimeLeft,
  showNextRoundHint,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(selectedBoardIds));
  const [takenBoards, setTakenBoards] = useState<Set<number>>(new Set());
  const [pendingBoardId, setPendingBoardId] = useState<number | null>(null); // Board currently being processed by server
  const [jumpInput, setJumpInput] = useState('');

  // Sync state tracking
  const [isSyncing, setIsSyncing] = useState(true);
  const [syncError, setSyncError] = useState(false);
  const syncTimeoutRef = useRef<any>(null);

  // Refs for grid container and react-window instance
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<any>(null);

  // State for dynamic grid dimensions
  const [gridWidth, setGridWidth] = useState(window.innerWidth - 32); // Better initial guess
  const [gridHeight, setGridHeight] = useState(500);

  // Responsive column count: ensures touch targets don't get too small on narrow screens
  const columnCount = useMemo(() => {
    if (gridWidth === 0) return 10;
    return Math.max(5, Math.floor(gridWidth / 38));
  }, [gridWidth]);

  const gap = 6; // Tailwind's gap-1.5 is 0.375rem, assuming 1rem = 16px, so 6px

  // Move handleSelect declaration above itemData to fix "used before its declaration" error
  const handleSelect = useCallback((id: number) => {
    if (pendingBoardId !== null) return;

    const isCurrentlySelected = selectedIds.has(id);
    const hasAnySelected = selectedIds.size > 0;

    if (!isCurrentlySelected && !hasAnySelected && wallet < SINGLE_STAKE) {
      toast.error('Insufficient balance!');
      return;
    }

    setPendingBoardId(id);
    socket.emit(socketEvents.PICK_BOARD, { boardId: id });
  }, [pendingBoardId, selectedIds, wallet]);

  // Calculate item dimensions based on container width and aspect ratio
  const itemWidth = useMemo(() => {
    if (gridWidth === 0) return 0;
    // Calculate width so that (columnCount * itemWidth) + (columnCount * gap) = gridWidth
    return Math.max(1, (gridWidth / columnCount) - gap);
  }, [gridWidth, columnCount, gap]);

  const itemHeight = useMemo(() => {
    return Math.max(1, itemWidth * 1.5); // aspect-[2/3] means height is 1.5 times width
  }, [itemWidth]);

  // Ensure we have reasonable minimums for virtualization to prevent "pixel-sized" cell rendering 
  // which can cause performance hangs or memory crashes.
  const columnWidth = useMemo(() => Math.max(38, itemWidth + gap), [itemWidth, gap]);
  const rowHeight = useMemo(() => Math.max(57, itemHeight + gap), [itemHeight, gap]);

  // Memoize itemData to prevent unnecessary re-renders of all cells
  const itemData = useMemo(() => (
    { selectedIds, takenBoards, pendingBoardId, handleSelect, columnCount }
  ), [selectedIds, takenBoards, pendingBoardId, handleSelect, columnCount]);

  // Stable key generator for virtualization performance
  const itemKey = useCallback(({ columnIndex, rowIndex, data }: any) => {
    return rowIndex * data.columnCount + columnIndex + 1;
  }, []);

  const rowCount = useMemo(() => {
    const total = TOTAL_BOARDS || 600;
    return Math.ceil(total / columnCount);
  }, [columnCount]);

  const startSyncTimer = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    setSyncError(false);
    setIsSyncing(true);
    
    // Explicitly request board state from server
    socket.emit(socketEvents.JOIN_ROOM);
    
    syncTimeoutRef.current = setTimeout(() => {
      setIsSyncing(false);
      setSyncError(true);
    }, 8000); // 8 seconds timeout for initial data fetch
  }, []);

  // Timer display logic
  const timeLeft = serverTimeLeft ?? 0;
  const timerDisplay = timeLeft > 0 ? `${timeLeft}s` : 'Starting soon…';

  useEffect(() => {
    setSelectedIds(new Set(selectedBoardIds));
  }, [selectedBoardIds]);

  // Observe container size for dynamic grid dimensions
  useEffect(() => {
    // Guard for environments where ResizeObserver is missing (can crash mount)
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        window.requestAnimationFrame(() => {
          setGridWidth(entries[0].contentRect.width);
          setGridHeight(entries[0].contentRect.height);
        });
      }
    });

    const el = gridContainerRef.current;
    if (el) observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Separate initial sync from listener management to prevent loops
  useEffect(() => {
    startSyncTimer();
  }, [startSyncTimer]);

  useEffect(() => {
    const handleBoardSync = (data: { takenBoards?: number[] }) => {
      setIsSyncing(false);
      setSyncError(false);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      setTakenBoards(new Set(data?.takenBoards ?? []));
    };

    const handlePickResult = (result: PickBoardResult) => {
      setPendingBoardId(null);
      const newIds = result.selectedBoardIds ?? [];
      setSelectedIds(new Set(newIds));
      onSelectionChange(newIds);
      if (result.takenBoards) {
        setTakenBoards(new Set(result.takenBoards));
      }
      if (result.success) {
        toast.success(`Board #${result.boardId} confirmed`);
      } else if (result.message) {
        toast.error(result.message);
      }
    };

    const handleGameInit = (data: { takenBoards?: number[]; myBoardIds?: number[] }) => {
      setIsSyncing(false);
      setSyncError(false);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      if (data.takenBoards) setTakenBoards(new Set(data.takenBoards));
      if (data.myBoardIds !== undefined) {
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
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [onSelectionChange]);

  const scrollToBoard = useCallback((id: number) => {
    if (id < 1 || id > TOTAL_BOARDS) {
      toast.error(`Enter a board number between 1 and ${TOTAL_BOARDS}`);
      return;
    }
    const targetRow = Math.floor((id - 1) / columnCount);
    const targetColumn = (id - 1) % columnCount;

    gridRef.current?.scrollToItem({ rowIndex: targetRow, columnIndex: targetColumn, align: 'center' });
  }, [columnCount]);

  const handleJump = () => {
    const id = parseInt(jumpInput, 10);
    if (Number.isNaN(id)) return;
    scrollToBoard(id);
    setJumpInput('');
  };

  const selectedBoard = selectedIds.size > 0 ? Array.from(selectedIds)[0] : null;

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden relative bg-gradient-to-br from-yellow-600 via-yellow-700 to-lime-900">
      {showNextRoundHint && (
        <div className="bg-lime-500/90 text-indigo-950 px-4 py-2 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-wide">
            New round — pick a board to play ({SINGLE_STAKE} ETB)
          </span>
          <button onClick={onDismissHint} className="text-[10px] font-black uppercase underline shrink-0">
            Got it
          </button>
        </div>
      )}

      <div className="relative p-4 bg-black/30 border-b border-white/10 backdrop-blur-md flex items-center gap-4 shrink-0">
        <button
          onClick={onBack}
          className="p-2.5 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-colors shadow-lg shrink-0"
          aria-label="Back"
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
            <span className="text-[10px] font-black text-white uppercase italic">{SINGLE_STAKE}</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-black/20 p-2 rounded-xl border border-white/5">
            <Timer size={14} className="text-yellow-400 mb-1" />
            <span
              className={`text-[11px] font-mono font-black ${
                timeLeft > 0 && timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'
              }`}
            >
              {timerDisplay}
            </span>
          </div>
        </div>
      </div>

      <div className="px-2 py-2 flex gap-2 items-center shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-black/30 rounded-xl px-3 py-2 border border-white/10">
          <Search size={14} className="text-white/50 shrink-0" />
          <input
            type="number"
            min={1}
            max={TOTAL_BOARDS}
            placeholder="Jump to board #"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            className="flex-1 bg-transparent text-white text-xs font-bold outline-none placeholder:text-white/30"
          />
          <button
            onClick={handleJump}
            className="text-[10px] font-black uppercase text-lime-400 px-2 py-1 rounded-lg bg-white/10"
          >
            Go
          </button>
        </div>
      </div>

      {selectedBoard && (
        <div className="mx-2 mb-1 px-3 py-2 bg-green-500/20 border border-green-400/40 rounded-xl flex items-center justify-between shrink-0">
          <span className="text-[11px] font-black text-green-200 uppercase">Your board: #{selectedBoard}</span>
          <span className="text-[9px] font-bold text-green-300/80">Tap again to deselect</span>
        </div>
      )}

      {pendingBoardId !== null && (
        <div className="mx-2 mb-1 px-3 py-1.5 bg-yellow-500/20 border border-yellow-400/30 rounded-xl text-center shrink-0">
          <span className="text-[10px] font-black text-yellow-200 uppercase animate-pulse">
            Confirming board #{pendingBoardId}…
          </span>
        </div>
      )}

      <div
        ref={gridContainerRef}
        className="flex-1 min-h-0 pt-1 px-2 pb-0 relative"
      >
        {syncError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-6 text-center">
            <div className="bg-indigo-950 border border-white/10 p-6 rounded-[32px] shadow-2xl max-w-[260px]">
              <RefreshCw size={32} className="text-yellow-500 mb-4 mx-auto opacity-50" />
              <h3 className="text-white text-sm font-black uppercase italic tracking-tight mb-2">Sync Timeout</h3>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wide mb-6 leading-relaxed">
                We are having trouble syncing the board states from the server.
              </p>
              <button 
                onClick={startSyncTimer}
                className="w-full py-3.5 bg-yellow-500 text-indigo-950 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-yellow-900/20"
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Syncing...' : 'Retry Sync'}
              </button>
            </div>
          </div>
        )}

        {isSyncing && !syncError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-black/20 backdrop-blur-sm rounded-full p-3 border border-white/5">
              <RefreshCw size={24} className="text-lime-400 animate-spin" />
            </div>
          </div>
        )}

        {FixedSizeGrid && (
          <FixedSizeGrid
            ref={gridRef}
            columnCount={columnCount}
            columnWidth={columnWidth}
            height={gridHeight || 500}
            rowCount={rowCount}
            rowHeight={rowHeight}
            width={gridWidth || (window.innerWidth - 32)}
            itemKey={itemKey}
            itemData={itemData}
            className="custom-scrollbar"
            overscanCount={5}
          >
            {BoardCell as any}
          </FixedSizeGrid>
        )}
      </div>
    </div>
  );
}
