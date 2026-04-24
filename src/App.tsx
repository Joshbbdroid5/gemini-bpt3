import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, X, Trophy, RefreshCcw } from 'lucide-react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import SelectionPage from './components/SelectionPage';
import GamePage from './components/GamePage';
import HistoryPage from './components/HistoryPage';
import LobbyPage from './components/LobbyPage'; // Ensure this import is correct
import AdminDashboard from './components/AdminDashboard';
import { AppPhase, HistoryEntry, Language } from './types';
import { connectToGame, disconnectFromGame, socket, socketEvents } from './components/socket';
import { translations } from './translations';

// Declare Telegram WebApp global
declare global {
  interface Window {
    Telegram?: any;
  }
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('lobby');
  const [stake, setStake] = useState(10);
  const [wallet, setWallet] = useState(1000);
  const [selectedBoardIds, setSelectedBoardIds] = useState<number[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showGoodLuck, setShowGoodLuck] = useState(false);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [myId, setMyId] = useState<string>('');
  
  const [winningHistory, setWinningHistory] = useState<any[]>([]);
  const [liveStats, setLiveStats] = useState({
    pool: 0,
    players: 0,
    gameId: '---'
  });

  // Initialize language from localStorage or default to 'en'
  const [language, setLanguage] = useState<Language>(() => {
    const savedLanguage = localStorage.getItem('bingoLanguage');
    return (savedLanguage as Language) || 'en';
  });

  // Save language to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('bingoLanguage', language);
  }, [language]);

  // Handle Socket Connection
  useEffect(() => {
    const handleStatus = (status: { isVerified: boolean }) => {
      setIsVerified(status.isVerified);
    };

    const handleWallet = (balance: number) => setWallet(balance);
    const handlePoolUpdate = (data: any) => setLiveStats(data);
    const handleWinHistory = (history: any[]) => setWinningHistory(history);
    const handleInit = (data: any) => setLiveStats(prev => ({ ...prev, gameId: data.gameId }));

    socket.on('user:status', handleStatus);
    socket.on(socketEvents.WALLET_UPDATE, handleWallet);
    socket.on(socketEvents.POOL_UPDATE, handlePoolUpdate);
    socket.on(socketEvents.WIN_HISTORY, handleWinHistory);
    socket.on('game:init', handleInit);

    // Set a timeout to catch connection failures
    const timeoutId = setTimeout(() => {
      setIsVerified(currentStatus => {
        if (currentStatus === null) setConnectionError(true);
        return currentStatus;
      });
    }, 10000); // 10 seconds timeout

    // Add cleanup to prevent memory leaks and duplicate listeners
    const cleanup = () => {
      socket.off('user:status', handleStatus);
      socket.off(socketEvents.WALLET_UPDATE, handleWallet);
      socket.off(socketEvents.POOL_UPDATE, handlePoolUpdate);
      socket.off(socketEvents.WIN_HISTORY, handleWinHistory);
      socket.off('game:init', handleInit);
      clearTimeout(timeoutId);
    };

    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand(); // Open full screen in Telegram
      connectToGame({
        initData: tg.initData,
        user: tg.initDataUnsafe?.user
      });
    } else {
      // Fallback for browser testing
      const guestId = `guest_${Math.floor(Math.random() * 1000)}`;
      connectToGame({ userId: guestId });
      setMyId(guestId); // Set myId for guest users
    }
    return () => {
      cleanup();
      disconnectFromGame();
    };
  }, []);

  const t = translations[language];

  const startSelection = (choice: number) => {
    setStake(choice);
    setPhase('selection');
  };

  const completeSelection = (ids: number[]) => {
    setSelectedBoardIds(ids);

    // Prevent playing if not verified
    if (!isVerified) {
      alert("Please verify your phone number in the bot first!");
      return;
    }

    const totalCost = ids.length * stake;
    if (wallet < totalCost) {
      alert("Insufficient balance!");
      return;
    }

    // Notify server of the bet
    socket.emit('game:bet', { stake: totalCost, boardIds: ids });
    
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
        {/* Loading state while verification status is unknown */}
        {isVerified === null && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-[#1a1b2e] flex flex-col items-center justify-center p-8 text-center"
          >
            {!connectionError ? (
              <>
                <div className="w-16 h-16 border-4 border-t-4 border-t-indigo-500 border-gray-200 rounded-full animate-spin mb-4"></div>
                <p className="text-white text-lg font-bold">Loading...</p>
              </>
            ) : (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center"
              >
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                  <X size={32} className="text-red-500" />
                </div>
                <h2 className="text-white text-xl font-black uppercase italic mb-2">Connection Failed</h2>
                <p className="text-gray-400 text-sm mb-8">We couldn't reach the game server. Please check your connection and try again.</p>
                <button onClick={() => window.location.reload()} className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded-xl font-black uppercase text-xs">
                  <RefreshCcw size={16} /> Retry
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {isVerified === false && (
            <motion.div
              key="verify"
              className="fixed inset-0 z-[150] bg-[#1a1b2e] flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mb-6">
                <Info size={40} className="text-orange-500" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase italic mb-2">Verification Required</h2>
              <p className="text-gray-400 text-sm mb-8">
                To ensure secure payments and fair play, please share your phone number with our bot.
              </p>
              <button 
                onClick={() => window.Telegram?.WebApp?.close()}
                className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase"
              >
                Go Back to Bot
              </button>
            </motion.div>
          )}

          {phase === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <LobbyPage 
                onPlay={() => setPhase('home')} 
                onWatch={startWatching} 
                stats={liveStats}
                winningHistory={winningHistory}
                language={language}
                myId={myId}
              />
            </motion.div>
          )}

          {phase === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <Dashboard 
                onPlay={startSelection} 
                language={language} 
                onLanguageChange={setLanguage} 
              />
            </motion.div>
          )}

          {phase === 'selection' && (
            <motion.div
              key="selection"
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <SelectionPage 
                staked={stake} 
                wallet={wallet} 
                onComplete={completeSelection} 
                language={language} 
              />
            </motion.div>
          )}

          {phase === 'game' && (
            <motion.div
              key="game"
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <GamePage 
                selectedBoardIds={selectedBoardIds} 
                stakedPerBoard={stake} 
                onRestart={() => setPhase('selection')}
                onGameEnd={addHistoryEntry}
                language={language}
              />
            </motion.div>
          )}

          {phase === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <HistoryPage history={history} onBack={() => setPhase('home')} language={language} />
            </motion.div>
          )}

          {phase === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <AdminDashboard onBack={() => setPhase('lobby')} />
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
                <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">{t.goodLuck}</h2>
                <p className="text-indigo-200 font-bold uppercase tracking-widest text-xs">
                  {selectedBoardIds.length} {t.boardsRegistered} <br />
                  {t.redirecting}
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
                      {t.rules}
                    </h3>
                    <button onClick={() => setShowRules(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <RuleItem number="1" text={t.rule1} />
                    <RuleItem number="2" text={t.rule2} />
                    <RuleItem number="3" text={t.rule3} />
                    <RuleItem number="4" text={t.rule4} />
                  </div>

                  <button 
                    onClick={() => setShowRules(false)}
                    className="mt-10 px-6 py-4 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-600 transition-colors"
                  >
                    {t.gotIt}
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
