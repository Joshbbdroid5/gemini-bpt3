/// <reference types="react" />

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Info, X, Trophy, RefreshCw, Clock } from 'lucide-react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import SelectionPage from './components/SelectionPage';
import GamePage from './components/GamePage';
import HistoryPage from './components/HistoryPage';

import ProfilePage from './components/ProfilePage';
import WalletPage from './components/WalletPage';
import BottomTabs, { BottomTabKey } from './components/BottomTabs';
import { HistoryEntry, AppPhase } from './types';
import { connectToGame, disconnectFromGame, socket, socketEvents } from './components/socket';

const t = {
  boardsRegistered: 'Boards Registered',
  redirecting: 'Redirecting to Game',
};

declare global {
  interface Window {
    Telegram?: any;
  }
}

// Access environment variables once at the top level
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
const IS_BOT_CONFIGURED = BOT_USERNAME && BOT_USERNAME !== 'YOUR_BOT_USERNAME_HERE' && BOT_USERNAME !== '';

export default function App() {
  // State persistence for "refreshing that exact page"
  const [phase, setPhase] = useState<AppPhase>(() => {
    const saved = localStorage.getItem('bingo_phase');
    const validPhases: AppPhase[] = ['home', 'selection', 'game', 'history', 'wallet', 'profile'];
    if (saved && validPhases.includes(saved as AppPhase)) {
      return saved as AppPhase;
    }
    return 'home';
  });
  const [bottomTab, setBottomTab] = useState<BottomTabKey>(() => {
    const saved = localStorage.getItem('bingo_tab') || 'game';
    const validTabs: BottomTabKey[] = ['game', 'history', 'wallet', 'profile'];
    if (saved && validTabs.includes(saved as BottomTabKey)) {
      return saved as BottomTabKey;
    }
    return 'game';
  });

  const [stake, setStake] = useState<number>(() => {
    const saved = localStorage.getItem('bingo_stake');
    const parsed = saved ? parseInt(saved) : 10;
    return isNaN(parsed) ? 10 : parsed;
  });
  const [wallet, setWallet] = useState<number>(0);
  const [selectedBoardIds, setSelectedBoardIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('bingo_selected_ids');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('bingo_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [showRules, setShowRules] = useState(false);
  const [showGoodLuck, setShowGoodLuck] = useState(false);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [connectionError, setConnectionError] = useState(false);
  const [myId, setMyId] = useState<string>('');
  const [showEngineIdleModal, setShowEngineIdleModal] = useState(false);
  
  const [winningHistory, setWinningHistory] = useState<any[]>([]);

  const [allRoomStats, setAllRoomStats] = useState<Record<number, any>>({});
  const [totalActivePlayers, setTotalActivePlayers] = useState(0);

  // Persist navigation state to localStorage
  useEffect(() => {
    localStorage.setItem('bingo_phase', phase);
    localStorage.setItem('bingo_tab', bottomTab);
    localStorage.setItem('bingo_stake', stake.toString());
    localStorage.setItem('bingo_selected_ids', JSON.stringify(selectedBoardIds));
    localStorage.setItem('bingo_history', JSON.stringify(history));
  }, [phase, bottomTab, stake, selectedBoardIds, history]);

  const currentRoomStats = allRoomStats[stake] || {
    pool: 0,
    players: 0,
    gameId: '---',
    isLive: false,
    isEngineActive: false
  };

  // Homepage Play uses only stake=10 and decides between selection vs watching.
  const handleHomePlay = () => {
    if (!currentRoomStats.isEngineActive) {
      setShowEngineIdleModal(true);
      return;
    }

    if (currentRoomStats.isLive) {
      setSelectedBoardIds([]); // watching-only
      setPhase('game');
      return;
    }
    setPhase('selection');
  };







  // Handle Socket Connection
  useEffect(() => {
    // Wake up the backend (Render cold start mitigation)
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    fetch(`${backendUrl}/health`).catch((e) => console.error("Backend health check failed:", e)); // Simple poke, added error logging

    const handleStatus = (status: { isVerified: boolean; phone?: string }) => {
      setIsVerified(status.isVerified);
      if (status.phone) setPhoneNumber(status.phone);
    };

    const handleWallet = (balance: number) => setWallet(balance);
    const handlePoolUpdate = (data: any) => {
      if (data.rooms) {
        const rooms = { ...data.rooms };
        Object.keys(rooms).forEach(k => {
          rooms[k].isEngineActive = data.isEngineActive;
        });
        setAllRoomStats(rooms);
      }
      if (data.totalActive !== void 0) setTotalActivePlayers(data.totalActive);
    };
    const handleWinHistory = (history: any[]) => setWinningHistory(history);
    
    const handleInit = (data: any) => {
      setAllRoomStats(prev => {
        const current = prev[stake] || {};
        return { ...prev, [stake]: { ...current, gameId: data.gameId } };
      });
    };


    const handleConnectError = (err: Error) => {
      console.error("Socket connection error:", err);
      setConnectionError(true);
    };

    // Admin-controlled game lifecycle
    const handleGameStatus = (status: { isGameRunning: boolean; gameId: string }) => {
      setAllRoomStats(prev => {
        const next = { ...prev };
        next[stake] = {
          ...next[stake],
          gameId: status.gameId,
          isLive: status.isGameRunning,
        };
        return next;
      });
    };

    const handleGameStopped = (msg?: string) => {
      if (msg) alert(msg);
      setPhase('home');
      setAllRoomStats(prev => {
        const next = { ...prev };
        if (next[stake]) {
          next[stake] = { ...next[stake], isLive: false, isEngineActive: false };
        }
        return next;
      });
    };

    socket.on(socketEvents.USER_STATUS, handleStatus);
    socket.on(socketEvents.WALLET_UPDATE, handleWallet);
    socket.on(socketEvents.POOL_UPDATE, handlePoolUpdate);
    socket.on(socketEvents.GAME_INIT, handleInit);
    socket.on(socketEvents.WIN_HISTORY, handleWinHistory);
    socket.on(socketEvents.BALL_DRAWN, () => { /* isLive is updated via pool_sync */ });
    socket.on(socketEvents.GAME_RESET, () => { 
      // Only auto-redirect if the user was actually in a game or selection
      // This prevents users browsing their Profile/History from being yanked away
      setPhase(prev => {
        if (prev === 'game' || prev === 'selection') {
          setSelectedBoardIds([]);
          return 'selection';
        }
        return prev;
      });
    });
    socket.on(socketEvents.GAME_STATUS, handleGameStatus);
    socket.on(socketEvents.GAME_STOPPED, handleGameStopped);
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
      socket.off(socketEvents.USER_STATUS, handleStatus);
      socket.off(socketEvents.WALLET_UPDATE, handleWallet);
      socket.off(socketEvents.POOL_UPDATE, handlePoolUpdate);
      socket.off(socketEvents.GAME_INIT, handleInit);
      socket.off(socketEvents.WIN_HISTORY, handleWinHistory);
      socket.off(socketEvents.BALL_DRAWN);
      socket.off(socketEvents.GAME_RESET);
      socket.off(socketEvents.GAME_STATUS, handleGameStatus);
      socket.off(socketEvents.GAME_STOPPED, handleGameStopped);
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

  const startSelection = () => {
    // If game is already live, send user directly to GamePage in watching-only mode.
    if (currentRoomStats.isLive) {
      setSelectedBoardIds([]);
      setPhase('game');
      return;
    }

    // Otherwise, allow board selection and betting.
    setPhase('selection');
  };

  const completeSelection = (ids: number[]) => {
    setSelectedBoardIds(ids);

    // Prevent playing if not verified
    if (!isVerified) {
      alert("Please verify your phone number in the bot first!");
      return;
    }

    setShowGoodLuck(true);
    setTimeout(() => {
      setShowGoodLuck(false);
      setPhase('game');
    }, 3000);
  };

  const handleTopUp = (amount: number) => {
    if (!IS_BOT_CONFIGURED) {
      alert(`Configuration Error: VITE_TELEGRAM_BOT_USERNAME is not set (Current: ${BOT_USERNAME})`);
      return;
    }
    if (window.Telegram?.WebApp) {
      // Using the 'start' parameter to pass structured data to the bot
      const payload = `topup_${amount}_${myId}`; // Example payload: topup_100_guest_1234
      window.Telegram.WebApp.openTelegramLink(`https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(payload)}`);
    } else {
      alert("This feature is only available in Telegram WebApp.");
    }
  };

  const handleDeposit = () => {
    if (!IS_BOT_CONFIGURED) return alert("Bot username not set. Please check Render Environment variables.");
    if (window.Telegram?.WebApp) {
       window.Telegram.WebApp.openTelegramLink(`https://t.me/${BOT_USERNAME}?start=deposit`);
    } else {
       window.open(`https://t.me/${BOT_USERNAME}?start=deposit`, '_blank');
    }
  };

  const handleWithdraw = () => {
    if (!IS_BOT_CONFIGURED) return alert("Bot username not set. Please check Render Environment variables.");
    if (window.Telegram?.WebApp) {
       window.Telegram.WebApp.openTelegramLink(`https://t.me/${BOT_USERNAME}?start=withdraw`);
    } else {
       window.open(`https://t.me/${BOT_USERNAME}?start=withdraw`, '_blank');
    }
  };



  const addHistoryEntry = (entry: HistoryEntry) => {
    setHistory(prev => [...prev, entry]);
  };

  const handleBackToHome = useCallback(() => {
    setPhase('home');
    setBottomTab('game'); // Ensure the tab highlight moves back to the "Game/Play" tab
  }, []);

  const handleTabChange = useCallback(
    (tab: BottomTabKey) => {
      setBottomTab(tab);

      if (tab === 'game') {
        // If user is in selection, keep it. Otherwise go to game.
        if (phase === 'selection') return;
        setPhase('game');
      } else if (tab === 'history') {
        setPhase('history');
      } else if (tab === 'wallet') {
        setPhase('wallet' as any);
      } else if (tab === 'profile') {
        setPhase('profile' as any);
      }
    },
    [phase]
  );

  return (
    <div className="flex flex-col h-screen max-h-screen font-sans selection:bg-yellow-100 selection:text-yellow-900 overflow-hidden relative bg-[#0f170a]">
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
          className="absolute inset-0 z-1 bg-linear-to-br from-yellow-500/70 via-lime-500/70 to-green-700/70 pointer-events-none"
        />
      </AnimatePresence>

      {/* The Header is now only shown when not on the selection page, as selection has its own navigation */}
      {phase !== 'selection' && phase !== 'game' && <Header onShowRules={() => setShowRules(true)} />}
      {/* The GamePage also has its own header/stats bar, so hide the main Header there too */}



      <main 
        className={`flex-1 flex flex-col relative z-2 bg-black/10 backdrop-blur-[2px] overflow-hidden scroll-touch ${
          phase === 'game' ? 'pb-0' : 'pb-14'
        }`}
      >
        {/* Loading state while verification status is unknown */}

        {isVerified === null && (
          <motion.div
            key="loading"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-150 bg-primary flex flex-col items-center justify-center p-8 text-center"
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
                  <RefreshCw size={16} /> Retry
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Engine Idle Modal */}
        <AnimatePresence>
          {showEngineIdleModal && (
            <div className="fixed inset-0 z-201 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white w-full max-w-xs rounded-4xl p-6 shadow-2xl flex flex-col text-center"
                >
                  <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="text-indigo-600" size={32} />
                  </div>
                  
                  <h3 className="text-xl font-black text-indigo-950 uppercase italic tracking-tighter mb-2">
                    Game Starts Soon!
                  </h3>
                  
                  <p className="text-gray-500 text-sm font-medium leading-relaxed mb-6">
                    The admin is getting things ready. Please wait a moment for the round to begin.
                  </p>

                  <button 
                    onClick={() => setShowEngineIdleModal(false)}
                    className="px-6 py-3 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-colors"
                  > 
                    Got it
                  </button>
                </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {isVerified === false && (
            <motion.div
              key="verify"
              className="fixed inset-0 z-150 bg-primary flex flex-col items-center justify-center p-8 text-center"
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

          {phase === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <Dashboard
                onPlay={handleHomePlay}
                allStats={allRoomStats}
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
                onLeaveToHome={handleBackToHome}
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
              className="flex-1 flex flex-col min-h-0"
            >
              <HistoryPage 
                history={history} 
                onBack={handleBackToHome} 
              />
            </motion.div>
          )}

          {phase === 'wallet' && (
            <motion.div
              key="wallet"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <WalletPage 
                walletBalance={wallet} 
                phoneNumber={phoneNumber} 
                isVerified={isVerified === true}
                onRefresh={() => window.location.reload()}
                onBack={handleBackToHome} 
              />
            </motion.div>
          )}

          {phase === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <ProfilePage
                telegramName={myId}
                walletBalance={wallet}
                gamesWon={history.filter(h => h.isMyWin).length}
                totalEarnings={history.reduce((sum, h) => h.isMyWin ? sum + h.payoutPerWinner : sum, 0)}
              />
            </motion.div>
          )}

        {/* Fallback to prevent blank pages if phase is corrupted */}
        {!['home', 'selection', 'game', 'history', 'wallet', 'profile'].includes(phase as any) && (
            <motion.div
              key="fallback"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex items-center justify-center p-10 text-center"
            >
              <button onClick={() => { setPhase('home'); setBottomTab('game'); }} className="bg-white text-black px-6 py-2 rounded-xl font-bold">Return Home</button>
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
              className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-indigo-900/90 backdrop-blur-xl text-center"
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
            <div className="fixed inset-0 z-101 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
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
                    <button 
                      onClick={() => setShowRules(false)} 
                      className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                      aria-label="Close rules"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <RuleItem number="1" text="Select your entry fee (10 ETB or 20 ETB) to start." />
                    <RuleItem number="2" text="Pick your board from the 600 available options within 60 seconds." />
                    <RuleItem number="3" text="Wait for the system to call a ball every 3 seconds." />
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

      {phase !== 'game' && (
        <BottomTabs
          active={bottomTab}
          onTabChange={handleTabChange}
        />
      )}

    </div>
  );
}

function RuleItem({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center text-[10px] font-black text-indigo-600 border border-indigo-100">
        {number}
      </div>
      <p className="text-gray-600 text-sm font-medium leading-normal">{text}</p>
    </div>
  );
}
