import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
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
  const [phase, setPhase] = useState<AppPhase>('home');
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
  const [allRoomStats, setAllRoomStats] = useState<Record<number, any>>({});
  const [totalActivePlayers, setTotalActivePlayers] = useState(0);

  // For scroll buttons
  const mainContentRef = useRef<HTMLElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);

  const currentRoomStats = allRoomStats[stake] || {
    pool: 0,
    players: 0,
    gameId: '---',
    // nextStartTime is removed as games start immediately
    isLive: false
  };

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
    // Wake up the backend (Render cold start mitigation)
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    fetch(`${backendUrl}/health`).catch((e) => console.error("Backend health check failed:", e)); // Simple poke, added error logging

    const handleStatus = (status: { isVerified: boolean }) => {
      setIsVerified(status.isVerified);
    };

    const handleWallet = (balance: number) => setWallet(balance);
    const handlePoolUpdate = (data: any) => {
      if (data.rooms) setAllRoomStats(data.rooms);
      if (data.totalActive !== undefined) setTotalActivePlayers(data.totalActive);
    };
    const handleWinHistory = (history: any[]) => setWinningHistory(history);
    
    const handleInit = (data: any) => {
      setAllRoomStats(prev => ({ 
        ...prev, 
        [stake]: { ...prev[stake], gameId: data.gameId } 
      }));
      // isLive status is now handled by the server's broadcastPoolUpdate
    };

    const handleConnectError = (err: Error) => {
      console.error("Socket connection error:", err);
      setConnectionError(true);
    };

    socket.on('user:status', handleStatus);
    socket.on(socketEvents.WALLET_UPDATE, handleWallet);
    socket.on(socketEvents.POOL_UPDATE, handlePoolUpdate);
    socket.on(socketEvents.WIN_HISTORY, handleWinHistory);
    socket.on('game:init', handleInit);
    socket.on('game:ball', () => { /* isLive is updated via pool_sync */ });
    socket.on('game:reset', () => { /* isLive is updated via pool_sync */ });
    socket.on('connect_error', handleConnectError);

    // Set a timeout to catch connection failures
    const timeoutId = setTimeout(() => {
      setIsVerified(currentStatus => {
        if (currentStatus === null) setConnectionError(true);
        return currentStatus;
      });
    }, 30000); // Increased to 30 seconds for Render cold starts

    // Add cleanup to prevent memory leaks and duplicate listeners
    const cleanup = () => {
      socket.off('user:status', handleStatus);
      socket.off(socketEvents.WALLET_UPDATE, handleWallet);
      socket.off(socketEvents.POOL_UPDATE, handlePoolUpdate);
      socket.off(socketEvents.WIN_HISTORY, handleWinHistory);
      socket.off('game:init', handleInit);
      socket.off('game:ball');
      socket.off('game:reset');
      socket.off('connect_error', handleConnectError);
      clearTimeout(timeoutId);
    };

    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand(); // Open full screen in Telegram
      const user = tg.initDataUnsafe?.user;
      if (user?.id) setMyId(user.id.toString());

      connectToGame({
        initData: tg.initData,
        user: user
      });
      socket.emit('room:join', 10); // Default to room 10
    } else {
      // Fallback for browser testing
      // Persist guestId in localStorage to prevent balance reset on refresh
      let guestId = localStorage.getItem('bingoGuestId');
      if (!guestId) {
        guestId = `guest_${Math.floor(1000 + Math.random() * 9000)}`;
        localStorage.setItem('bingoGuestId', guestId);
      }
      connectToGame({ userId: guestId });
      socket.emit('room:join', 10);
      setMyId(guestId); // Set myId for guest users
    }
    return () => {
      cleanup();
      disconnectFromGame();
    };
  }, []);

  const t = translations[language];

  const goToRoom = (choice: number) => {
    setStake(choice);
    socket.emit('room:join', choice);

    setPhase('lobby');
  };

  const startSelection = () => {
    if (currentRoomStats.isLive) {
      startWatching();
    } else {
      setPhase('selection');
    }
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

  const handleTopUp = (amount: number) => {
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME; // e.g., @your_bingo_bot
    if (!botUsername || botUsername === 'YOUR_BOT_USERNAME_HERE') { // Added check for placeholder
      alert("Telegram bot username is not configured. Please set VITE_TELEGRAM_BOT_USERNAME.");
      return;
    }
    if (window.Telegram?.WebApp) {
      // Using the 'start' parameter to pass structured data to the bot
      const payload = `topup_${amount}_${myId}`; // Example payload: topup_100_guest_1234
      window.Telegram.WebApp.openTelegramLink(`https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`);
    } else {
      alert("This feature is only available in Telegram WebApp.");
    }
  };

  const handleDeposit = () => {
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME; // e.g., @your_bingo_bot
    if (!botUsername || botUsername === 'YOUR_BOT_USERNAME_HERE') return alert("Bot username not set. Please set VITE_TELEGRAM_BOT_USERNAME.");
    if (window.Telegram?.WebApp) {
       window.Telegram.WebApp.openTelegramLink(`https://t.me/${botUsername}?start=deposit`);
    } else {
       window.open(`https://t.me/${botUsername}?start=deposit`, '_blank');
    }
  };

  const handleWithdraw = () => {
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME; // e.g., @your_bingo_bot
    if (!botUsername || botUsername === 'YOUR_BOT_USERNAME_HERE') return alert("Bot username not set. Please set VITE_TELEGRAM_BOT_USERNAME.");
    if (window.Telegram?.WebApp) {
       window.Telegram.WebApp.openTelegramLink(`https://t.me/${botUsername}?start=withdraw`);
    } else {
       window.open(`https://t.me/${botUsername}?start=withdraw`, '_blank');
    }
  };

  const startWatching = () => {
    setSelectedBoardIds([]);
    setPhase('game');
  };

  const addHistoryEntry = (entry: HistoryEntry) => {
    setHistory(prev => [...prev, entry]);
  };

  // Scroll button logic
  const handleScroll = useCallback(() => {
    if (mainContentRef.current) {
      const { scrollHeight, clientHeight } = mainContentRef.current;
      setShowScrollButtons(scrollHeight > clientHeight);
    }
  }, []);

  useEffect(() => {
    const ref = mainContentRef.current;
    if (ref) {
      ref.addEventListener('scroll', handleScroll);
      // Initial check and re-check on resize
      const resizeObserver = new ResizeObserver(handleScroll);
      resizeObserver.observe(ref);
      return () => {
        ref.removeEventListener('scroll', handleScroll);
        resizeObserver.disconnect();
      };
    }
  }, [handleScroll]);

  const handleBackToHome = useCallback(() => {
    setPhase('home');
  }, []);

  return (
    <div className="flex flex-col h-screen max-h-screen font-sans selection:bg-yellow-100 selection:text-yellow-900 overflow-hidden relative bg-[#0f170a]">
      {/* Static background image */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1590505677148-f2910793134d?auto=format&fit=crop&q=80&w=1920')] bg-cover bg-center opacity-35 pointer-events-none z-0"></div>

      {/* Animated background overlay for transitions */}
      <AnimatePresence>
        {/* Only show this animated layer when transitioning between phases, or when a specific phase needs a distinct background animation */}
        {/* For a subtle fruit-slice effect, we can animate a radial gradient */}
        <motion.div
          key={phase} // Key changes with phase to trigger re-animation
          initial={{ opacity: 0, scale: 0.8, borderRadius: '50%' }}
          animate={{ opacity: 0.6, scale: 1, borderRadius: '0%' }}
          exit={{ opacity: 0, scale: 1.2, borderRadius: '50%' }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute inset-0 z-[1] bg-gradient-to-br from-yellow-500/70 via-lime-500/70 to-green-700/70 pointer-events-none"
        />
      </AnimatePresence>

      <Header 
        onShowRules={() => setShowRules(true)} 
        onShowHistory={() => setPhase('history')}
      />
      
      <main ref={mainContentRef} className="flex-1 flex flex-col relative z-[2] bg-black/10 backdrop-blur-[2px] overflow-y-auto custom-scrollbar">
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
                <div className="w-16 h-16 border-4 border-t-4 border-t-yellow-500 border-gray-200 rounded-full animate-spin mb-4"></div>
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
                onPlay={startSelection}
                onWatch={startWatching} 
                stats={currentRoomStats}
                winningHistory={winningHistory}
                language={language}
                onBack={handleBackToHome}
                myId={myId}
                onTopUp={handleTopUp}
                onDeposit={handleDeposit}
                onWithdraw={handleWithdraw}
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
                onPlay={goToRoom}
                onDeposit={handleDeposit}
                onWithdraw={handleWithdraw}
                allStats={allRoomStats}
                language={language} 
                onLanguageChange={setLanguage}
                // isGameActive prop removed from Dashboard
                wallet={wallet}
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
                onBack={handleBackToHome}
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

        {/* Scroll Buttons */}
        <AnimatePresence>
          {showScrollButtons && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
            >
              <button
                onClick={() => mainContentRef.current?.scrollBy({ top: -200, behavior: 'smooth' })}
                className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors shadow-lg"
                aria-label="Scroll Up"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
              </button>
              <button
                onClick={() => mainContentRef.current?.scrollBy({ top: 200, behavior: 'smooth' })}
                className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors shadow-lg"
                aria-label="Scroll Down"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </button>
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
                    <button 
                      onClick={() => setShowRules(false)} 
                      className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                      aria-label="Close rules"
                    >
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
