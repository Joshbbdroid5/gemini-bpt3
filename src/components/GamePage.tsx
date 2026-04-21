import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Timer, ArrowRight, Wallet, Volume2, VolumeX, RotateCcw, LogOut } from 'lucide-react';
import { generateBoard, checkWin, WinningPattern } from '../logic';
import { BingoBoardData, GameStats, HistoryEntry } from '../types';

interface Props {
  selectedBoardIds: number[];
  stakedPerBoard: number;
  onRestart: () => void;
  onGameEnd: (entry: HistoryEntry) => void;
}

export default function GamePage({ selectedBoardIds, stakedPerBoard, onRestart, onGameEnd }: Props) {
  const [calledNumbers, setCalledNumbers] = useState<Set<number>>(new Set());
  const [currentBall, setCurrentBall] = useState<number | null>(null);
  const [winners, setWinners] = useState<{ id: number; grid: BingoBoardData; patterns: WinningPattern[] }[]>([]);
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);
  const [popupTimeLeft, setPopupTimeLeft] = useState(5);
  const [isMuted, setIsMuted] = useState(false);
  const [autoMarkMode, setAutoMarkMode] = useState(true);
  const [manualMarks, setManualMarks] = useState<Set<number>>(new Set());

  // Keep manual marks in sync with called numbers when auto mode is on
  useEffect(() => {
    if (autoMarkMode) {
      setManualMarks(new Set(calledNumbers));
    }
  }, [autoMarkMode, calledNumbers]);

  const callNextNumber = useCallback(() => {
    if (showWinnerPopup || calledNumbers.size >= 75) return;
    
    const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
    const available = allNumbers.filter(n => !calledNumbers.has(n));
    
    if (available.length === 0) return;
    
    const idx = Math.floor(Math.random() * available.length);
    const val = available[idx];
    
    setCurrentBall(val);
    setCalledNumbers(prev => new Set(prev).add(val));
    
    if (autoMarkMode) {
      setManualMarks(prev => new Set(prev).add(val));
    }
    
    return val;
  }, [showWinnerPopup, calledNumbers, autoMarkMode]);
  
  // Game Stats
  const stats: GameStats = useMemo(() => ({
    gameId: `WB-${Math.floor(100000 + Math.random() * 900000)}`,
    players: (selectedBoardIds.length || 0) + 529, // Default + user
    staked: stakedPerBoard || 10,
    derash: ((selectedBoardIds.length || 0) + 529) * (stakedPerBoard || 10) * 0.8 
  }), [selectedBoardIds, stakedPerBoard]);

  // Boards data
  const boardsData = useMemo(() => {
    return selectedBoardIds.map(id => ({
      id,
      grid: generateBoard(id)
    }));
  }, [selectedBoardIds]);

  // Win Detection
  useEffect(() => {
    if (showWinnerPopup || selectedBoardIds.length === 0) return;

    const currentWinners: typeof winners = [];
    boardsData.forEach(({ id, grid }) => {
      // Win is now checked against calledNumbers so the popup is automatic regardless of manual marks
      const win = checkWin(grid, calledNumbers as any);
      if (win.isWinner) {
        currentWinners.push({ id, grid, patterns: win.patterns });
      }
    });

    if (currentWinners.length > 0) {
      setWinners(currentWinners);
      setShowWinnerPopup(true);
      
      onGameEnd({
        gameId: stats.gameId,
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        totalStaked: stats.players * stats.staked,
        totalWinners: currentWinners.length,
        payoutPerWinner: stats.derash / currentWinners.length,
        myBoardsCount: selectedBoardIds.length,
        isMyWin: currentWinners.some(w => selectedBoardIds.includes(w.id))
      });
    }
  }, [calledNumbers, boardsData, showWinnerPopup, stats, selectedBoardIds, onGameEnd]);

  // Play BINGO shout sound effect when winner popup appears
  useEffect(() => {
    if (showWinnerPopup && !isMuted) {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
      audio.play().catch(e => console.log('Audio playback prevented by browser:', e));
    }
  }, [showWinnerPopup, isMuted]);

  // Winner Popup Timer Logic
  useEffect(() => {
    if (showWinnerPopup) {
      const timer = setInterval(() => {
        setPopupTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            onRestart();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showWinnerPopup, onRestart]);

  // Calling Logic
  useEffect(() => {
    if (showWinnerPopup) return;

    const interval = setInterval(() => {
      callNextNumber();
    }, 4000);

    return () => clearInterval(interval);
  }, [showWinnerPopup, callNextNumber]);

  const toggleMark = (num: number) => {
    if (autoMarkMode || !calledNumbers.has(num)) return;
    setManualMarks(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const getLetter = (n: number) => {
    if (n <= 15) return 'B';
    if (n <= 30) return 'I';
    if (n <= 45) return 'N';
    if (n <= 60) return 'G';
    return 'O';
  };

  const balls = Array.from(calledNumbers);
  const historyBalls = balls.slice(-5, -1).reverse();

  return (
    <div className="h-full flex flex-col bg-[#1a1b2e] text-white overflow-hidden select-none">
      {/* Top Stats - 5 Columns */}
      <div className="grid grid-cols-5 gap-1 p-2 bg-[#2d2e4d]">
        <CompactStat label="Game ID" value={stats.gameId.slice(0, 8)} />
        <CompactStat label="Players" value={stats.players} />
        <CompactStat label="Bet" value={stats.staked} />
        <CompactStat label="Derash" value={stats.derash.toFixed(0)} />
        <CompactStat label="Called" value={calledNumbers.size} />
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex overflow-hidden p-2 gap-2">
        {/* Left: 75-number Register */}
        <div className="w-[45%] h-full bg-[#2d2e4d] rounded-xl border border-white/10 p-1 flex flex-col">
          <div className="grid grid-cols-5 gap-1 mb-1">
            {['B', 'I', 'N', 'G', 'O'].map((l, i) => (
              <div 
                key={l} 
                className={`
                  text-center text-[10px] font-black py-1 rounded-sm
                  ${i === 0 ? 'bg-blue-500' : i === 1 ? 'bg-indigo-600' : i === 2 ? 'bg-purple-600' : i === 3 ? 'bg-green-600' : 'bg-orange-600'}
                `}
              >
                {l}
              </div>
            ))}
          </div>
          <div className="flex-1 grid grid-cols-5 gap-1 overflow-hidden">
            {Array.from({ length: 15 }).map((_, rowIndex) => (
              ['B', 'I', 'N', 'G', 'O'].map((l, colIndex) => {
                const num = (colIndex * 15) + rowIndex + 1;
                const isCalled = calledNumbers.has(num);
                return (
                  <div 
                    key={num} 
                    className={`
                      flex items-center justify-center text-[9px] font-bold rounded-sm border border-white/5
                      ${isCalled ? (colIndex === 4 ? 'bg-orange-600 border-orange-400' : colIndex === 3 ? 'bg-green-600 border-green-400' : 'bg-indigo-600 border-indigo-400') : 'bg-white/5 text-gray-400'}
                    `}
                  >
                    {num}
                  </div>
                );
              })
            ))}
          </div>
        </div>

        {/* Right Area */}
        <div className="flex-1 h-full flex flex-col gap-2 overflow-hidden">
          {/* Recent Balls History + Mute */}
          <div className="flex items-center justify-between p-1">
            <div className="flex gap-1">
               {historyBalls.map((n: number) => (
                 <div key={n} className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border-2 ${getBallColor(n)}`}>
                   {getLetter(n)}-{n}
                 </div>
               ))}
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setAutoMarkMode(!autoMarkMode)}
                className={`px-3 py-1 rounded-full text-[9px] font-black transition-all border ${
                  autoMarkMode 
                    ? 'bg-green-500/20 border-green-500/50 text-green-400' 
                    : 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                }`}
              >
                {autoMarkMode ? 'AUTO ON' : 'MANUAL'}
              </button>
              <button onClick={() => setIsMuted(!isMuted)} className="text-gray-400">
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
          </div>

          {/* Current Ball Card */}
          <div className="h-24 bg-[#23243d] rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-indigo-500/10 blur-2xl radial-gradient"></div>
            <div className="w-16 h-16 rounded-full bg-white border-4 border-yellow-400 flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.5)] z-10">
              <span className="text-xl font-black text-indigo-950">
                {currentBall ? `${getLetter(currentBall)}-${currentBall}` : '--'}
              </span>
            </div>
          </div>

          {/* Board or Watching Only */}
          <div className="flex-1 bg-[#23243d] rounded-xl border border-white/10 overflow-hidden flex flex-col">
            {selectedBoardIds.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-4">
                <h3 className="text-xl font-black tracking-tight text-white">Watching Only</h3>
                <div className="text-[10px] font-bold text-indigo-300 leading-relaxed uppercase">
                  የዚህ ዙር ጨዋታ ተጀምሯል፡፡ አዲስ ዙር እስኪጀምር እዚህ ይጠብቁ፡፡
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-4">
                {boardsData.map(({ id, grid }) => (
                  <div key={id} className="p-2 bg-indigo-900/50 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black text-indigo-300">BOARD #{id}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-0.5">
                       {grid.map((row, rIdx) => row.map((cell, cIdx) => {
                         const isMarkedLocal = typeof cell.value === 'number' ? manualMarks.has(cell.value) : cell.value === 'FREE';
                         return (
                           <button 
                             key={`${rIdx}-${cIdx}`}
                             onClick={() => typeof cell.value === 'number' && toggleMark(cell.value)}
                             className={`
                               aspect-square flex items-center justify-center text-[9px] font-bold rounded-sm transition-all
                               ${isMarkedLocal ? 'bg-green-600 text-white shadow-[0_0_10px_rgba(22,163,74,0.4)]' : 'bg-white/5 text-gray-500 hover:bg-white/10'}
                               ${!autoMarkMode && typeof cell.value === 'number' && calledNumbers.has(cell.value) && !isMarkedLocal ? 'ring-1 ring-yellow-400 animate-pulse' : ''}
                             `}
                           >
                             {cell.value === 'FREE' ? 'F' : cell.value}
                           </button>
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
      <div className="p-2 grid grid-cols-4 gap-2 bg-[#2d2e4d]">
        <button onClick={onRestart} className="col-span-1 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex flex-col items-center justify-center">
          <LogOut size={16} />
          <span className="text-[8px] font-black uppercase">Leave</span>
        </button>
        <button onClick={() => window.location.reload()} className="col-span-1 h-12 rounded-xl bg-[#4a4b6e] flex flex-col items-center justify-center">
          <RotateCcw size={16} />
          <span className="text-[8px] font-black uppercase">Refresh</span>
        </button>
        <button 
          disabled
          className="col-span-2 h-12 rounded-xl bg-[#b19539] opacity-70 text-indigo-950 font-black text-base italic uppercase tracking-tighter shadow-inner px-4 overflow-hidden text-center flex items-center justify-center"
        >
          Live Game
        </button>
      </div>

      {/* Winner Popup */}
      <AnimatePresence>
        {showWinnerPopup && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-[#23243d] w-full max-w-sm rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="bg-indigo-600 p-4 text-center">
                 <Trophy className="text-yellow-400 w-8 h-8 mx-auto mb-1" />
                 <h2 className="text-xl font-black italic uppercase">Winners!</h2>
              </div>
              <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {winners.map((winner, idx) => {
                  const winningIndices = new Set(winner.patterns.flatMap(p => p.indices.map(i => `${i.r}-${i.c}`)));
                  
                  return (
                    <div key={idx} className="bg-white/5 p-3 rounded-2xl border border-white/5">
                      <div className="flex justify-between items-center mb-2">
                         <div className="flex flex-col">
                           <span className="font-black text-indigo-400 text-xs uppercase tracking-tight leading-none">BOARD #{winner.id}</span>
                           <div className="flex flex-wrap gap-1 mt-1">
                              {winner.patterns.map((p, pIdx) => (
                                <span key={pIdx} className="text-[7px] font-black bg-yellow-400/20 text-yellow-400 px-1 py-0.5 rounded uppercase">{p.name}</span>
                              ))}
                           </div>
                         </div>
                         <span className="text-green-400 font-black italic">{(stats.derash / winners.length).toFixed(0)} ETB</span>
                      </div>
                      <div className="grid grid-cols-5 gap-0.5">
                         {winner.grid.map((row, rIdx) => row.map((cell, cIdx) => {
                           const isMarkedWinner = typeof cell.value === 'number' ? calledNumbers.has(cell.value) : cell.value === 'FREE';
                           const isWinningCell = winningIndices.has(`${rIdx}-${cIdx}`);
                           
                           return (
                             <div 
                               key={`${rIdx}-${cIdx}`} 
                               className={`
                                 aspect-square flex items-center justify-center text-[8px] font-bold rounded-sm border
                                 ${isWinningCell 
                                   ? 'bg-yellow-400 text-indigo-950 border-yellow-200 shadow-[0_0_8px_rgba(250,204,21,0.4)]' 
                                   : isMarkedWinner ? 'bg-green-600 border-transparent text-white' : 'bg-white/10 text-gray-600 border-transparent'}
                               `}
                             >
                               {cell.value === 'FREE' ? 'F' : cell.value}
                             </div>
                           );
                         }))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 flex flex-col items-center gap-2">
                 <span className="text-[10px] font-black text-gray-400">Next game in {popupTimeLeft}s</span>
                 <button onClick={onRestart} className="w-full bg-white text-black py-3 rounded-xl font-black uppercase text-xs">Play Again</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="text-center py-1 text-[8px] font-bold text-gray-500 uppercase tracking-widest bg-gray-950/20">
         @westernbingo_bot
      </div>
    </div>
  );
}

function CompactStat({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="flex flex-col items-center justify-center bg-white/5 rounded-md py-1 border border-white/5">
       <span className="text-[7px] text-gray-400 font-black uppercase tracking-tight leading-none mb-0.5">{label}</span>
       <span className="text-[10px] font-black italic leading-none">{value}</span>
    </div>
  );
}

function getBallColor(n: number) {
  if (n <= 15) return 'border-blue-500 text-blue-400';
  if (n <= 30) return 'border-indigo-500 text-indigo-400';
  if (n <= 45) return 'border-purple-500 text-purple-400';
  if (n <= 60) return 'border-green-500 text-green-400';
  return 'border-orange-500 text-orange-400';
}
