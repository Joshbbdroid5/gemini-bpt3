import {
  useState,
  useEffect,
  useRef,
  memo,
  useCallback,
  useMemo,
} from 'react';

import {
  Wallet,
  Timer,
  ShoppingCart,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Grid, useGridRef, type GridProps } from 'react-window';
import {
  TOTAL_BOARDS,
  SINGLE_STAKE,
  PickBoardResult,
  GameInitData,
} from '../types';
import { socket, socketEvents } from './socket';

interface BoardCellData {
  selectedIds: Set<number>;
  takenBoards: Set<number>;
  pendingBoardId: number | null;
  handleSelect: (id: number) => void;
  columnCount: number;
  totalBoards: number;
}

type BoardCellComponentProps = Parameters<
  GridProps<BoardCellData>['cellComponent']
>[0];

// Memoized BoardCell component to prevent unnecessary re-renders of individual cells
const BoardCellImpl = memo((props: BoardCellComponentProps) => {
  const {
    columnIndex,
    rowIndex,
    style,
    selectedIds,
    takenBoards,
    pendingBoardId,
    handleSelect,
    columnCount,
    totalBoards,
  } = props;
  const id = rowIndex * columnCount + columnIndex + 1;

  // Ensure we don't render beyond TOTAL_BOARDS
  if (id > totalBoards) {
    return null;
  }

  const isSelected = selectedIds.has(id);
  const isTaken = takenBoards.has(id) && !isSelected;
  const isPending = pendingBoardId === id;

  return (
    <div className="board-cell" style={style}>
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
                : 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500 hover:border-blue-300 shadow-lg'
          }
        `}
        disabled={(!isSelected && isTaken) || pendingBoardId !== null}
      >
        <span className="relative z-10">{id}</span>
      </button>
    </div>
  );
});
BoardCellImpl.displayName = 'BoardCell';
const BoardCell = BoardCellImpl as GridProps<BoardCellData>['cellComponent'];

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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(selectedBoardIds)
  );
  const [takenBoards, setTakenBoards] = useState<Set<number>>(new Set());
  const [pendingBoardId, setPendingBoardId] = useState<number | null>(null);

  // Centralized total boards count with fallback
  const totalBoardsCount = useMemo(() => TOTAL_BOARDS ?? 600, []);

  // Sync prop changes to state during render (avoids cascading effect renders)
  const [prevSelectedBoardIds, setPrevSelectedBoardIds] =
    useState(selectedBoardIds);
  if (selectedBoardIds !== prevSelectedBoardIds) {
    setSelectedIds(new Set(selectedBoardIds));
    setPrevSelectedBoardIds(selectedBoardIds);
  }

  // Sync state tracking
  const [isSyncing, setIsSyncing] = useState(true);
  const [syncError, setSyncError] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for grid container and react-window instance
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridRef = useGridRef(null);

  // State for dynamic grid dimensions
  const [gridWidth, setGridWidth] = useState(window.innerWidth - 32); // Better initial guess
  const [gridHeight, setGridHeight] = useState(window.innerHeight - 250); // Improved initial fallback

  // Responsive column count: ensures touch targets don't get too small on narrow screens
  const columnCount = useMemo(() => {
    if (gridWidth === 0) return 10;
    return Math.max(5, Math.floor(gridWidth / 38)) ?? 10;
  }, [gridWidth]);

  const gap = 6; // Tailwind's gap-1.5 is 0.375rem, assuming 1rem = 16px, so 6px

  // Move handleSelect declaration above itemData to fix "used before its declaration" error
  const handleSelect = useCallback(
    (id: number) => {
      if (pendingBoardId !== null) return;

      const isCurrentlySelected = selectedIds.has(id);
      const hasAnySelected = selectedIds.size > 0;

      if (!isCurrentlySelected && !hasAnySelected && wallet < SINGLE_STAKE) {
        toast.error('Insufficient balance!');
        return;
      }

      setPendingBoardId(id);
      socket.emit(socketEvents.PICK_BOARD, { boardId: id });
    },
    [pendingBoardId, selectedIds, wallet]
  );

  // Calculate item dimensions based on container width and aspect ratio
  const itemWidth = useMemo(() => {
    if (gridWidth === 0) return 0;
    // Calculate width so that (columnCount * itemWidth) + (columnCount * gap) = gridWidth
    return Math.max(1, gridWidth / columnCount - gap);
  }, [gridWidth, columnCount, gap]);

  const itemHeight = useMemo(() => {
    return Math.max(1, itemWidth * 1.5); // aspect-[2/3] means height is 1.5 times width
  }, [itemWidth]);

  // Ensure we have reasonable minimums for virtualization to prevent "pixel-sized" cell rendering
  // which can cause performance hangs or memory crashes.
  const columnWidth = useMemo(
    () => Math.max(38, itemWidth + gap),
    [itemWidth, gap]
  );
  const rowHeight = useMemo(
    () => Math.max(57, itemHeight + gap),
    [itemHeight, gap]
  );

  // Memoize cellProps to prevent unnecessary re-renders of all cells
  const cellProps = useMemo(
    () => ({
      selectedIds,
      takenBoards,
      pendingBoardId,
      handleSelect,
      columnCount,
      totalBoards: totalBoardsCount,
    }),
    [
      selectedIds,
      takenBoards,
      pendingBoardId,
      handleSelect,
      columnCount,
      totalBoardsCount,
    ]
  );

  const rowCount = useMemo(() => {
    return Math.ceil(totalBoardsCount / columnCount);
  }, [columnCount, totalBoardsCount]);

  const startSyncTimer = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
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

  // Observe container size for dynamic grid dimensions
  useEffect(() => {
    // Guard for environments where ResizeObserver is missing (can crash mount)
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    // Perform an initial measurement immediately on mount
    if (gridContainerRef.current) {
      setGridWidth(
        gridContainerRef.current.offsetWidth ?? window.innerWidth - 32
      );
      setGridHeight(
        gridContainerRef.current.offsetHeight ?? window.innerHeight - 250
      );
    }

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        window.requestAnimationFrame(() => {
          setGridWidth(entries[0].contentRect.width ?? window.innerWidth - 32);
          setGridHeight(
            entries[0].contentRect.height ?? window.innerHeight - 250
          );
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
    // Using a microtask to avoid synchronous setState during mount
    // and satisfy the react-hooks/set-state-in-effect rule.
    void Promise.resolve().then(() => startSyncTimer());
  }, [startSyncTimer]);

  useEffect(() => {
    const handleBoardSync = (data: { takenBoards?: number[] }) => {
      setIsSyncing(false);
      setSyncError(false);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
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

    const handleGameInit = (data: GameInitData) => {
      setIsSyncing(false);
      setSyncError(false);

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      const taken = Array.isArray(data?.takenBoards)
        ? data.takenBoards
        : undefined;
      const myIds = Array.isArray(data?.myBoardIds)
        ? data.myBoardIds
        : undefined;

      if (taken) setTakenBoards(new Set(taken));
      if (myIds) {
        setSelectedIds(new Set(myIds));
        onSelectionChange(myIds);
      }
    };

    const handleGameReset = () => {
      // Clear previous round's selections immediately when the server enters a new selection phase.
      setSelectedIds(new Set());
      setTakenBoards(new Set());
      setPendingBoardId(null);
      onSelectionChange([]);
      // Re-sync to get fresh board state and timer from server
      startSyncTimer();
    };

    socket.on(socketEvents.BOARD_SYNC, handleBoardSync);
    socket.on(socketEvents.PICK_BOARD_RESULT, handlePickResult);
    socket.on(socketEvents.GAME_INIT, handleGameInit);
    socket.on(socketEvents.GAME_RESET, handleGameReset);

    return () => {
      socket.off(socketEvents.BOARD_SYNC, handleBoardSync);
      socket.off(socketEvents.PICK_BOARD_RESULT, handlePickResult);
      socket.off(socketEvents.GAME_INIT, handleGameInit);
      socket.off(socketEvents.GAME_RESET, handleGameReset);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [onSelectionChange, startSyncTimer]);

  const selectedBoard: number | null =
    selectedIds.size > 0 ? Array.from(selectedIds)[0] : null;

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden relative bg-[#1a1b2e]">
      <div className="relative p-4 bg-[#2d2e4d] border-b border-white/10 flex items-center gap-4 shrink-0">
        <button
          onClick={onBack}
          className="p-2.5 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-colors shadow-lg shrink-0"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex-1 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center justify-center bg-[#23243d] p-2 rounded-xl border border-white/10">
            <Wallet size={14} className="text-lime-400 mb-1" />
            <span className="text-[10px] font-black text-white">{wallet}</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-[#23243d] p-2 rounded-xl border border-white/10">
            <ShoppingCart size={14} className="text-orange-400 mb-1" />
            <span className="text-[10px] font-black text-white uppercase italic">
              {SINGLE_STAKE}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center bg-[#23243d] p-2 rounded-xl border border-white/10">
            <Timer size={14} className="text-yellow-400 mb-1" />
            <span
              className={`text-[11px] font-mono font-black ${
                timeLeft > 0 && timeLeft <= 5
                  ? 'text-red-400 animate-pulse'
                  : 'text-white'
              }`}
            >
              {timerDisplay}
            </span>
          </div>
        </div>
      </div>

      {selectedBoard && (
        <div className="mx-2 mb-1 px-3 py-2 bg-green-500/15 border border-green-400/30 rounded-xl flex items-center justify-between shrink-0">
          <span className="text-[11px] font-black text-green-300 uppercase">
            Your board: #{selectedBoard}
          </span>
          <span className="text-[9px] font-bold text-green-400/70">
            Tap again to deselect
          </span>
        </div>
      )}

      {pendingBoardId !== null && (
        <div className="mx-2 mb-1 px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl text-center shrink-0">
          <span className="text-[10px] font-black text-yellow-300 uppercase animate-pulse">
            Confirming board #{pendingBoardId}…
          </span>
        </div>
      )}

      <div
        ref={gridContainerRef}
        className="flex-1 min-h-0 pt-1 px-2 pb-0 relative"
      >
        {syncError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#1a1b2e]/90 backdrop-blur-sm p-6 text-center">
            <div className="bg-[#23243d] border border-white/10 p-6 rounded-4xl shadow-2xl max-w-65">
              <RefreshCw
                size={32}
                className="text-yellow-400 mb-4 mx-auto opacity-50"
              />
              <h3 className="text-white text-sm font-black uppercase italic tracking-tight mb-2">
                Sync Timeout
              </h3>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wide mb-6 leading-relaxed">
                We are having trouble syncing the board states from the server.
              </p>
              <button
                onClick={startSyncTimer}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg"
              >
                <RefreshCw
                  size={14}
                  className={isSyncing ? 'animate-spin' : ''}
                />
                {isSyncing ? 'Syncing...' : 'Retry Sync'}
              </button>
            </div>
          </div>
        )}

        {isSyncing && !syncError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-[#23243d]/80 backdrop-blur-sm rounded-full p-3 border border-white/10">
              <RefreshCw size={24} className="text-lime-400 animate-spin" />
            </div>
          </div>
        )}

        {gridWidth > 0 && gridHeight > 0 && (
          <Grid
            gridRef={gridRef}
            columnCount={columnCount}
            columnWidth={columnWidth}
            rowCount={rowCount}
            rowHeight={rowHeight}
            cellComponent={BoardCell}
            cellProps={cellProps}
            className="custom-scrollbar"
            overscanCount={2}
            style={{ height: gridHeight, width: gridWidth }}
          />
        )}

        {!syncError && (gridWidth <= 0 || gridHeight <= 0) && (
          <div className="flex items-center justify-center h-full w-full text-white/60 text-[10px] font-black uppercase">
            Loading boards…
          </div>
        )}
      </div>
    </div>
  );
}
