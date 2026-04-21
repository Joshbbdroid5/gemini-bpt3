import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Timer, ShoppingCart } from 'lucide-react';
import { TOTAL_BOARDS } from '../types';

interface Props {
  staked: number;
  wallet: number;
  onComplete: (selectedIds: number[]) => void;
}

export default function SelectionPage({ staked, wallet, onComplete }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [takenBoards, setTakenBoards] = useState<Set<number>>(new Set());

  // Initialize with some boards already taken
  useEffect(() => {
    const initial = new Set<number>();
    const count = 120 + Math.floor(Math.random() * 40);
    for (let i = 0; i < count; i++) {
        initial.add(Math.floor(Math.random() * TOTAL_BOARDS) + 1);
    }
    setTakenBoards(initial);
  }, []);

  // Simulate other users taking boards in real-time
  useEffect(() => {
    if (timeLeft <= 0) return;
    
    const interval = setInterval(() => {
      setTakenBoards((prev) => {
        const next = new Set(prev);
        // Add 1-3 new taken boards every interval
        const newClaims = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < newClaims; i++) {
          let randomId;
          let attempts = 0;
          do {
            randomId = Math.floor(Math.random() * TOTAL_BOARDS) + 1;
            attempts++;
          } while ((next.has(randomId) || randomId === selectedId) && attempts < 10);
          
          if (!next.has(randomId) && randomId !== selectedId) {
            next.add(randomId);
          }
        }
        return next;
      });
    }, 2000); // Every 2 seconds

    return () => clearInterval(interval);
  }, [timeLeft, selectedId]);

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
      onComplete(selectedId ? [selectedId] : []);
    }
  }, [timeLeft]);

  const handleSelect = (id: number) => {
    if (takenBoards.has(id)) return;
    setSelectedId(prev => prev === id ? null : id);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-transparent">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-2 p-4 bg-transparent border-b border-white/5">
        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/10">
          <div className="p-2 bg-indigo-600 rounded-lg text-white">
            <Wallet size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300 opacity-50">Wallet</span>
            <span className="text-sm font-bold text-white">{wallet} ETB</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/10">
          <div className="p-2 bg-orange-600 rounded-lg text-white">
            <ShoppingCart size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-300 opacity-50">Staked</span>
            <span className="text-sm font-bold text-white italic">{staked} ETB</span>
          </div>
        </div>
      </div>

      {/* Timer Bar */}
      <div className="px-4 py-2 bg-black/50 backdrop-blur-md flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 text-white">
          <Timer size={14} className="text-yellow-400" />
          <span className="text-[10px] font-black uppercase tracking-widest">Time Remaining</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xl font-mono font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* Info Message */}
      <div className="px-4 py-2 bg-indigo-950/30 flex justify-between items-center border-b border-white/5">
        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">
           Select 1 Board to play.
        </p>
        <div className="flex items-center gap-1.5 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
           <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
           <span className="text-[8px] font-black text-green-400 uppercase tracking-tighter">
             {TOTAL_BOARDS - takenBoards.size} Boards Available
           </span>
        </div>
      </div>

      {/* Grid of 600 Boards */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-8 gap-2">
          {Array.from({ length: TOTAL_BOARDS }, (_, i) => i + 1).map((id) => {
            const isSelected = selectedId === id;
            const isTaken = takenBoards.has(id);
            
            return (
              <motion.button
                key={id}
                whileHover={!isTaken ? { scale: 1.15 } : {}}
                whileTap={!isTaken ? { scale: 0.9 } : {}}
                onClick={() => handleSelect(id)}
                disabled={isTaken}
                layout
                className={`
                  aspect-square flex items-center justify-center text-[10px] font-black rounded-full border transition-all duration-300 relative overflow-hidden
                  ${isSelected
                    ? 'bg-yellow-400 text-indigo-950 border-yellow-200 shadow-[0_0_15px_rgba(250,204,21,0.5)] z-10' 
                    : isTaken 
                      ? 'bg-white/5 text-white/10 border-transparent opacity-50 cursor-not-allowed line-through'
                      : 'bg-[#2d2e4d] text-white/40 border-white/5 hover:border-indigo-400/50 hover:text-white'
                  }
                `}
              >
                {/* Board Ball Highlight */}
                {!isTaken && !isSelected && (
                  <div className="absolute top-0 right-0 w-3 h-3 bg-white/5 blur-sm rounded-full -translate-x-1 translate-y-1"></div>
                )}
                <span className="relative z-10">{id}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
      
      {/* Selection Summary Overlay */}
      <div className="p-6 bg-[#1a1b2e] border-t border-white/10 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Selection Status</span>
            <span className="text-xl font-black text-yellow-400 italic">
              {selectedId ? `Ready with Board #${selectedId}` : 'Selecting Board...'}
            </span>
          </div>
          <div className="px-8 py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
             <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping"></div>
             <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Game Starting Soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}
