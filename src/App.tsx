import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, X, Trophy } from 'lucide-react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import SelectionPage from './components/SelectionPage';
import GamePage from './components/GamePage';
import HistoryPage from './components/HistoryPage';
import LobbyPage from './components/LobbyPage';
import { AppPhase, HistoryEntry } from './types';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('lobby');
  const [stake, setStake] = useState(10);
  const [wallet, setWallet] = useState(1000);
  const [selectedBoardIds, setSelectedBoardIds] = useState<number[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showGoodLuck, setShowGoodLuck] = useState(false);

  const startSelection = (choice: number) => {
    setStake(choice);
    setPhase('selection');
  };

  const completeSelection = (ids: number[]) => {
    setSelectedBoardIds(ids);
    const totalCost = ids.length * stake;
    setWallet(prev => prev - totalCost);
    
    setShowGoodLuck(true);
    setTimeout(() => {
      setShowGoodLuck(false);
      setPhase('game');
    }, 3000);
  };

  const startWatching = () => {
    setSelectedBoardIds([]);
    setPhase('game');
  };

  const addHistoryEntry = (entry: HistoryEntry) => {
    setHistory(prev => [...prev, entry]);
  };

  return (
    <div className="flex flex-col h-screen max-h-screen font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
      <Header 
        onShowRules={() => setShowRules(true)} 
        onShowHistory={() => setPhase('history')}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <AnimatePresence mode="wait">
          {phase === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col"
            >
              <LobbyPage 
                onPlay={() => setPhase('home')} 
                onWatch={startWatching} 
              />
            </motion.div>
          )}

          {phase === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col"
            >
              <Dashboard onPlay={startSelection} />
            </motion.div>
          )}

          {phase === 'selection' && (
            <motion.div
              key="selection"
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="flex-1 flex flex-col"
            >
              <SelectionPage staked={stake} wallet={wallet} onComplete={completeSelection} />
            </motion.div>
          )}

          {phase === 'game' && (
            <motion.div
              key="game"
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex-1 flex flex-col"
            >
              <GamePage 
                selectedBoardIds={selectedBoardIds} 
                stakedPerBoard={stake} 
                onRestart={() => setPhase('selection')}
                onGameEnd={addHistoryEntry}
              />
            </motion.div>
          )}

          {phase === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col"
            >
              <HistoryPage history={history} onBack={() => setPhase('home')} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Loading / Good Luck Overlay */}
        <AnimatePresence>
          {showGoodLuck && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-indigo-900/90 backdrop-blur-xl text-center"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="flex flex-col items-center"
              >
                <div className="w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center mb-6 shadow-2xl">
                   <Trophy size={40} className="text-white" />
                </div>
                <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">Good Luck!</h2>
                <p className="text-indigo-200 font-bold uppercase tracking-widest text-xs">
                  {selectedBoardIds.length} Boards Registered <br />
                  Redirecting to Game
                </p>
                
                <div className="mt-8 flex gap-2">
                   {[1, 2, 3].map(i => (
                     <motion.div
                       key={i}
                       animate={{ 
                         scale: [1, 1.5, 1],
                         opacity: [0.5, 1, 0.5]
                       }}
                       transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                       className="w-2 h-2 rounded-full bg-white"
                     />
                   ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rules Modal */}
        <AnimatePresence>
          {showRules && (
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl flex flex-col"
                >
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black text-indigo-950 uppercase italic tracking-tighter flex items-center gap-2">
                      <Info className="text-indigo-600" />
                      Game Rules
                    </h3>
                    <button onClick={() => setShowRules(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <RuleItem number="1" text="Select your entry fee (10 ETB or 20 ETB) to start." />
                    <RuleItem number="2" text="Pick your board from the 600 available options within 60 seconds." />
                    <RuleItem number="3" text="Wait for the system to call a ball every 5 seconds." />
                    <RuleItem number="4" text="Numbers are marked automatically. Complete a row, column, diagonal, or four corners to win." />
                  </div>

                  <button 
                    onClick={() => setShowRules(false)}
                    className="mt-10 px-6 py-4 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-600 transition-colors"
                  >
                    Got it
                  </button>
                </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function RuleItem({ number, text }: { number: string, text: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center text-[10px] font-black text-indigo-600 border border-indigo-100">
        {number}
      </div>
      <p className="text-gray-600 text-sm font-medium leading-normal">{text}</p>
    </div>
  );
}
