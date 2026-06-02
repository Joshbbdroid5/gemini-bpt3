import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Volume2, VolumeX, RefreshCw, LogOut } from 'lucide-react';
import { generateBoard, WinningPattern } from '../logic';
import { BingoBoardData, HistoryEntry } from '../types';
import { socket, socketEvents } from './socket';

interface Props {
  selectedBoardIds: number[];
  onRestart: () => void;
  onLeaveToHome: () => void;
  onGameEnd: (entry: HistoryEntry) => void;
}

interface GameStats {
  gameId: string;
  players: number;
  staked: number;
  derash: number;
}

const t = {
  gameId: 'Game ID',
  players: 'Players',
  bet: 'Bet',
  derash: 'Derash',
  called: 'Called',
  watchingOnly: 'Watching Only',
  watchingText: 'The game has started. Please wait for the next round.',
  leave: 'Leave',
  refresh: 'Refresh',
  winners: 'Winners',
  playAgain: 'Play Again',
  nextGameIn: 'Next game in',
  boardNum: 'Board #',
};

const getLetter = (n: number) => {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
};

const REGISTER_GRID_INDICES = Array.from({ length: 15 }).map((_, rowIndex) =>
  [0, 1, 2, 3, 4].map(colIndex => (colIndex * 15) + rowIndex + 1)
);

const WinnerCard = memo(({ winner, winnersCount, totalPrize, calledNumbers, t }: { 
  winner: any, 
  winnersCount: number, 
  totalPrize: number, 
  calledNumbers: Set<number>,
  t: any
}) => {
  const winningIndices = useMemo(() => new Set(
    winner.patterns.flatMap((p: WinningPattern) => p.indices.map(i => `${i.r}-${i.c}`))
  ), [winner.patterns]);

  return (
    <div key={winner.id} className="bg-white/5 p-3 rounded-2xl border border-white/5">
      <div className="flex justify-between items-center mb-2">
        <div className="flex flex-col">
          <span className="font-black text-indigo-400 text-xs uppercase tracking-tight leading-none">
            {t.boardNum}{winner.id}
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {winner.patterns.map((p: WinningPattern, pIdx: number) => (
              <span key={pIdx} className="text-[7px] font-black bg-yellow-400/20 text-yellow-400 px-1 py-0.5 rounded uppercase">
                {p.name}
              </span>
            ))}
          </div>
        </div>
        <span className="text-green-400 font-black italic">
          {(totalPrize / winnersCount).toFixed(0)} ETB
        </span>
      </div>
      <div className="grid grid-cols-5 gap-0.5">
        {winner.grid.map((row: any, rIdx: number) =>
          row.map((cell: any, cIdx: number) => {
            const isMarkedWinner = typeof cell.value === 'number'
              ? calledNumbers.has(cell.value)
              : cell.value === 'FREE';
            const isWinningCell = winningIndices.has(`${rIdx}-${cIdx}`);

            return (
              <div
                key={`${rIdx}-${cIdx}`}
                className={`
                  aspect-square flex items-center justify-center text-[8px] font-bold rounded-sm border
                  ${isWinningCell
                    ? 'bg-yellow-400 text-indigo-950 border-yellow-200 shadow-[0_0_8px_rgba(250,204,21,0.4)]'
                    : isMarkedWinner
                      ? 'bg-green-600 border-transparent text-white'
                      : 'bg-white/10 text-gray-600 border-transparent'}
                `}
              >
                {cell.value === 'FREE' ? 'F' : cell.value}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

const BoardCell = memo(({ value, isMarked, isCurrentBall, isPendingMark, onToggle }: {
  value: number | 'FREE',
  isMarked: boolean,
  isCurrentBall: boolean,
  isPendingMark: boolean,
  onToggle: (num: number) => void
}) => {
  return (
    <button 
      onClick={() => typeof value === 'number' && onToggle(value)}
      className={`
        aspect-square flex items-center justify-center text-[12px] font-black rounded-md transition-all
        ${isCurrentBall ? 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.6)] z-10 scale-110' : isMarked ? 'bg-green-600 text-white shadow-[0_0_10px_rgba(22,163,74,0.4)]' : 'bg-white/5 text-gray-500 hover:bg-white/10'}
        ${isPendingMark ? 'ring-1 ring-yellow-400 animate-pulse' : ''}
      `}
    >
      {value === 'FREE' ? 'F' : value}
    </button>
  );
});

export default function GamePage({ selectedBoardIds, onRestart, onLeaveToHome, onGameEnd }: Props) {
  const [calledNumbers, setCalledNumbers] = useState<Set<number>>(new Set());
  const [currentBall, setCurrentBall] = useState<number | null>(null);
  const [winners, setWinners] = useState<{ id: number; grid: BingoBoardData; patterns: WinningPattern[]; payout: number }[]>([]);
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);
  const [popupTimeLeft, setPopupTimeLeft] = useState(3);
  const [isMuted, setIsMuted] = useState(false);
  const [autoMarkMode, setAutoMarkMode] = useState(true);
  const [manualMarks, setManualMarks] = useState<Set<number>>(new Set());
  const bingoAudioRef = useRef<HTMLAudioElement | null>(null);

  const [gameMetadata, setGameMetadata] = useState({
    pool: 0,
    players: 0,
    gameId: '---'
  });

  // Refs to prevent stale closures in socket handlers and prevent effect churn
  const showWinnerPopupRef = useRef(showWinnerPopup);
  const onRestartRef = useRef(onRestart);
  const onGameEndRef = useRef(onGameEnd);
  const selectedBoardIdsRef = useRef(selectedBoardIds);
  const gameMetadataRef = useRef(gameMetadata);
  const autoMarkModeRef = useRef(autoMarkMode);
  const winnersRef = useRef(winners);

  const calledNumbersRef = useRef(calledNumbers);
  useEffect(() => {
    calledNumbersRef.current = calledNumbers;
  }, [calledNumbers]);

  // Keep refs synchronized with state and props
  useEffect(() => {
    showWinnerPopupRef.current = showWinnerPopup;
    onRestartRef.current = onRestart;
    onGameEndRef.current = onGameEnd;
    selectedBoardIdsRef.current = selectedBoardIds;
    gameMetadataRef.current = gameMetadata;
    autoMarkModeRef.current = autoMarkMode;
    winnersRef.current = winners;
  }, [showWinnerPopup, onRestart, onGameEnd, selectedBoardIds, gameMetadata, autoMarkMode, winners]);

  // Pre-warm assets: Initialize and load audio on mount
  useEffect(() => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
    audio.load();
    bingoAudioRef.current = audio;
  }, []);

  // Performance optimization: Sync manualMarks only when mode is toggled
  useEffect(() => {
    if (autoMarkMode) {
      setManualMarks(new Set(calledNumbers));
    }
  }, [autoMarkMode]);

  // Handle incoming balls from server
  useEffect(() => {
    const handleNewBall = (num: number) => {
      if (showWinnerPopupRef.current) return; // Do not update if winner popup is active
      setCurrentBall(num);
      setCalledNumbers((prev: Set<number>) => new Set(prev).add(num));
      if (autoMarkModeRef.current) {
        setManualMarks((prev: Set<number>) => new Set(prev).add(num));
      }
    };

    const handleInit = (data: { balls: number[]; gameId: string; pool?: number; players?: number }) => {
      // Sort the incoming balls to ensure chronological order, especially for setCurrentBall
      // and for consistent state if the server sends them unsorted.
      const initialBalls = new Set(data.balls); // Preserve chronological order from server
      setCalledNumbers(initialBalls);
      if (autoMarkModeRef.current) {
        setManualMarks(new Set(initialBalls)); // Auto-mark all initial balls
      }
      setGameMetadata((prev) => ({ 
        ...prev, 
        gameId: data.gameId,
        pool: data.pool ?? prev.pool,
        players: data.players ?? prev.players
      }));
      if (data.balls.length > 0) setCurrentBall(data.balls[data.balls.length - 1]); // Set current ball to the last chronologically drawn
    };

    const handlePoolUpdate = (data: any) => { // PoolUpdateData now contains single room
      if (data.room) { 
        setGameMetadata({ pool: data.room.pool, players: data.room.players, gameId: data.room.gameId });
      }
    };

    const handleReset = () => {
      setCalledNumbers(new Set());
      setCurrentBall(null);
      setShowWinnerPopup(false);
      setWinners([]);
      setPopupTimeLeft(3);
      setManualMarks(new Set());
    };

    const handleServerWinner = (winnerData: any) => {
      // Server emits one event per winning board; we accumulate all winners for the round.
      setWinners((prev) => {
        const boardId = winnerData.boardId as number;
        if (prev.some((w) => w.id === boardId)) return prev; // de-dupe by boardId

        return [
          ...prev,
          {
            id: boardId,
            grid: generateBoard(boardId),
            patterns: winnerData.patterns,
            payout: winnerData.payout,
          },
        ];
      });
      setShowWinnerPopup(true);
    };

    socket.on(socketEvents.BALL_DRAWN, handleNewBall);
    socket.on(socketEvents.GAME_INIT, handleInit);
    socket.on(socketEvents.POOL_UPDATE, handlePoolUpdate); // Use simplified handlePoolUpdate
    socket.on(socketEvents.GAME_RESET, handleReset);
    socket.on(socketEvents.NEW_WINNER, handleServerWinner);

    // Pre-warm Data: Request latest game state immediately upon mounting
    // This ensures we have the correct ball history and game metadata
    // if the game was already in progress or if we joined late.
    socket.emit(socketEvents.JOIN_ROOM); // No stake argument needed

    return () => {
      socket.off(socketEvents.BALL_DRAWN, handleNewBall);
      socket.off(socketEvents.GAME_INIT, handleInit);
      socket.off(socketEvents.POOL_UPDATE, handlePoolUpdate);
      socket.off(socketEvents.GAME_RESET, handleReset);
      socket.off(socketEvents.NEW_WINNER, handleServerWinner);
    };
  }, []); // Bound once on mount, cleaned up once on unmount
  
  // Game Stats (fixed stake)
  const stats: GameStats = useMemo(() => ({
    gameId: gameMetadata.gameId,
    players: gameMetadata.players,
    staked: 10,
    derash: gameMetadata.pool
  }), [gameMetadata]);

  // Boards data (fixed stake)
  const boardsData = useMemo(() => {
    return selectedBoardIds.map((id: number) => ({
      id,
      grid: generateBoard(id)
    }));
  }, [selectedBoardIds]);

  // Play BINGO shout sound effect when winner popup appears
  useEffect(() => {
    if (showWinnerPopup && !isMuted && bingoAudioRef.current) {
      bingoAudioRef.current.currentTime = 0;
      bingoAudioRef.current.play().catch((e: any) => console.log('Audio playback prevented by browser:', e));
    }
  }, [showWinnerPopup, isMuted]);

  // Winner Popup Timer Logic
  useEffect(() => {
    if (!showWinnerPopup) return;

    const timer = window.setInterval(() => {
      setPopupTimeLeft((prev: number) => {
        if (prev <= 1) {
          clearInterval(timer);
          
          // Centralized recording logic
          const currentWinners = winnersRef.current;
          const isMyWin = currentWinners.some((w: any) => selectedBoardIdsRef.current.includes(w.id));
          
          onGameEndRef.current({
            gameId: gameMetadataRef.current.gameId,
            date: new Date().toLocaleDateString(),
            myBoardsCount: selectedBoardIdsRef.current.length,
            totalWinners: currentWinners.length,
            totalStaked: Math.round(gameMetadataRef.current.pool / 0.6),
            payoutPerWinner: currentWinners.length > 0 ? gameMetadataRef.current.pool / currentWinners.length : 0,
            isMyWin
          });

          onRestartRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000) as unknown as number;

    return () => clearInterval(timer);
  }, [showWinnerPopup]); 

  const toggleMark = useCallback((num: number) => {
    if (autoMarkModeRef.current || !calledNumbersRef.current.has(num)) return;
    setManualMarks((prev: Set<number>) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }, []);

  const registerHeader = useMemo(() => (
    <div className="grid grid-cols-5 gap-1 mb-1">
      {['B', 'I', 'N', 'G', 'O'].map((l, i) => (
        <div key={l} className={`text-center text-[12px] font-black py-1.5 rounded-sm ${
          i === 0 ? 'bg-blue-500' : i === 1 ? 'bg-indigo-600' : i === 2 ? 'bg-purple-600' : i === 3 ? 'bg-green-600' : 'bg-orange-600'
        }`}>{l}</div>
      ))}
    </div>
  ), []);

  const historyBalls = useMemo(() => {
    const allCalled = Array.from(calledNumbers);
    return allCalled.filter(n => n !== currentBall).slice(-5).reverse(); // Last 5 called balls, excluding the current one, in reverse chronological order
  }, [calledNumbers, currentBall]);

  return (
    <div className="flex-1 flex flex-col bg-primary text-white overflow-hidden select-none">
      {/* Top Stats - 5 Columns */}
      <div className="grid grid-cols-5 gap-1.5 p-3 bg-black/40 border-b border-white/5">
        <CompactStat label={t.gameId} value={stats.gameId.slice(0, 8)} />
        <CompactStat label={t.players} value={stats.players} />
        <CompactStat label={t.bet} value={stats.staked} />
        <CompactStat label={t.derash} value={stats.derash.toFixed(0)} />
        <CompactStat label={t.called} value={calledNumbers.size} />
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex overflow-hidden p-2 gap-2">
        {/* Left: 75-number Register */}
        <div className="w-[45%] h-full bg-[#2d2e4d] rounded-xl border border-white/10 p-1 flex flex-col">
          {registerHeader}
          <div className="flex-1 grid grid-cols-5 gap-1 overflow-hidden">
            {REGISTER_GRID_INDICES.map((row, rowIndex) => (
              row.map((num, colIndex) => (
                <RegisterCell 
                  key={num} 
                  num={num}
                  colIndex={colIndex}
                  isCalled={calledNumbers.has(num)}
                />
              ))
            ))}
          </div>
        </div>

        {/* Right Area */}
        <div className="flex-1 h-full flex flex-col gap-2 overflow-hidden">
          {/* Recent Balls History + Mute */}
          <div className="flex items-center justify-between p-1">
            <div className="flex gap-1">
              {historyBalls.map((n) => (
                <div key={n} className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black border-2 opacity-60 ${getBallColor(n)}`}>
                  {getLetter(n)}-{n}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMuted(!isMuted)} 
                className="text-gray-400"
                aria-label={isMuted ? "Unmute" : "Mute"}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
          </div>

          {/* Current Ball Card */}
          <div className="flex flex-col gap-2">
            <div className="h-24 bg-[#23243d] rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden">
              {/* Telegram WebView can glitch with blur/animated/transformed layers.
                  Remove the blurred glow layer for Telegram only. */}
              {(!(window.Telegram?.WebApp)) ? (
                <div className="absolute inset-0 bg-indigo-500/10 blur-2xl radial-gradient" />
              ) : null}
              <div className="w-16 h-16 rounded-full bg-white border-4 border-lime-400 flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.5)] z-10">
                <span className="text-xl font-black text-indigo-950">
                  {currentBall ? `${getLetter(currentBall)}-${currentBall}` : '--'}
                </span>
              </div>
            </div>
            <div className="px-1">
              <button 
                onClick={() => setAutoMarkMode(!autoMarkMode)}
                className={`w-full py-2 rounded-xl text-[10px] font-black transition-all border ${
                  autoMarkMode 
                    ? 'bg-green-500/20 border-green-500/50 text-green-400' 
                    : 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                }`}
              >
                {autoMarkMode ? 'AUTO ON' : 'MANUAL'}
              </button>
            </div>
          </div>


          {/* Board or Watching Only */}
          <div className="flex-1 bg-[#23243d] rounded-xl border border-white/10 overflow-hidden flex flex-col">
          {selectedBoardIds.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-4">
                  <h3 className="text-xl font-black tracking-tight text-white">{t.watchingOnly}</h3>
                  <div className="text-[10px] font-bold text-indigo-300 leading-relaxed uppercase">
                    {t.watchingText}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-hidden p-1 flex flex-col justify-center">
                {/* Only one board allowed per user as requested */}
                {boardsData.slice(0, 1).map(({ id, grid }: { id: number, grid: BingoBoardData }) => (
                  <div key={id} className="p-3 bg-indigo-900/60 rounded-2xl border border-white/10 shadow-2xl mx-1">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[11px] font-black text-indigo-300 uppercase tracking-tighter">{t.boardNum}{id}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                       {grid.map((row, rIdx: number) => row.map((cell: any, cIdx: number) => {
                         const isMarkedLocal = typeof cell.value === 'number' ? manualMarks.has(cell.value) : cell.value === 'FREE';
                         const isCurrentBall = typeof cell.value === 'number' && cell.value === currentBall;
                         const isPendingMark = !autoMarkMode && typeof cell.value === 'number' && calledNumbers.has(cell.value) && !isMarkedLocal;

                         return (
                           <BoardCell 
                             key={`${rIdx}-${cIdx}`}
                             value={cell.value}
                             isMarked={isMarkedLocal}
                             isCurrentBall={isCurrentBall}
                             isPendingMark={isPendingMark}
                             onToggle={toggleMark}
                           />
                         );
                       }))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Area */}
      <div className="p-2 grid grid-cols-4 gap-2 bg-[#2d2e4d] border-t border-white/10">
        <button 
          onClick={onLeaveToHome} 
          className="col-span-1 h-14 rounded-xl bg-linear-to-br from-orange-500 to-red-600 flex flex-col items-center justify-center"
          aria-label={t.leave}
          title={t.leave}
        >
          <LogOut size={16} />
          <span className="text-[8px] font-black uppercase">{t.leave}</span>
        </button>
        <button 
          onClick={() => window.location.reload()} 
          className="col-span-1 h-14 rounded-xl bg-[#4a4b6e] flex flex-col items-center justify-center"
          aria-label={t.refresh}
          title={t.refresh}
        >
          <RefreshCw size={16} className="text-lime-400" />
          <span className="text-[8px] font-black text-white uppercase">{t.refresh}</span>
        </button>
        <button 
          disabled
          className="col-span-2 h-14 rounded-xl bg-[#b19539] opacity-70 text-indigo-950 font-black text-base italic uppercase tracking-tighter shadow-inner px-4 overflow-hidden text-center flex items-center justify-center"
        >
          Live Game
        </button>
      </div>

      {/* Winner Popup */}
      <AnimatePresence>
        {showWinnerPopup && (
          <div className="fixed inset-0 z-200 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="winner-popup-title">
            <AnimatePresence>
              <motion.div
                initial={window.Telegram?.WebApp ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md"
              />
              <motion.div
                initial={window.Telegram?.WebApp ? false : { scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-[#23243d] w-full max-w-sm rounded-4xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" role="document"
              >
                <div className="bg-indigo-600 p-4 text-center">
                  <Trophy className="text-yellow-400 w-8 h-8 mx-auto mb-1" aria-hidden="true" />
                  <h2 className="text-xl font-black italic uppercase">{t.winners}!</h2>
                </div>
                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                  <div>
                    {winners.map((winner: any, idx: number) => (
                      <WinnerCard 
                        key={winner.id}
                        winner={winner} 
                        winnersCount={winners.length} 
                        totalPrize={stats.derash} 
                        calledNumbers={calledNumbers}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
                <div className="p-4 flex flex-col items-center gap-2">
                  <span className="text-[10px] font-black text-gray-400">
                    {t.nextGameIn} {popupTimeLeft}s
                  </span>
                  <button onClick={onRestart} className="w-full bg-white text-black py-3 rounded-xl font-black uppercase text-xs">
                    {t.playAgain}
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      <div className="text-center py-1 text-[8px] font-bold text-gray-500 uppercase tracking-widest bg-gray-950/20">
         @lomibingo_bot
      </div>
    </div>
  );
}

const CompactStat = memo(({ label, value }: { label: string, value: string | number }) => {
  return (
    <div className="flex flex-col items-center justify-center bg-white/5 rounded-xl py-2 border border-white/5">
       <span className="text-[9px] text-gray-400 font-black uppercase tracking-tight leading-none mb-0.5">{label}</span>
       <span className="text-[11px] font-black italic leading-none text-lime-400">{value}</span>
    </div>
  );
});

const RegisterCell = memo(({ num, isCalled, colIndex }: { num: number, isCalled: boolean, colIndex: number }) => {
  return (
    <div 
      className={`
        flex items-center justify-center text-[11px] font-bold rounded-sm border border-white/5
        ${isCalled ? (colIndex === 4 ? 'bg-orange-600 border-orange-400' : colIndex === 3 ? 'bg-green-600 border-green-400' : 'bg-indigo-600 border-indigo-400') : 'bg-white/5 text-gray-400'}
      `}
    >
      {num}
    </div>
  );
});

function getBallColor(n: number) {
  if (n <= 15) return 'border-blue-500 text-blue-400';
  if (n <= 30) return 'border-indigo-500 text-indigo-400';
  if (n <= 45) return 'border-purple-500 text-purple-400';
  if (n <= 60) return 'border-green-500 text-green-400';
  return 'border-orange-500 text-orange-400';
}
