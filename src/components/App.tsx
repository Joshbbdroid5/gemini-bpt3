/// <reference types="react" />

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Info, X, Trophy, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import Dashboard from './Dashboard';
import Header from './Header';
import ErrorBoundary from '../ErrorBoundary';
import SelectionPage from './SelectionPage';
import GamePage from './GamePage';
import HistoryPage from './HistoryPage';
import ProfilePage from './ProfilePage';
import WalletPage from './WalletPage';
import BottomTabs, { BottomTabKey } from './BottomTabs';
import RuleItem from './RuleItem';
import { HistoryEntry, AppPhase, RoomStats, PoolUpdateData, GameState } from '../types'; // Import new types
import { connectToGame, disconnectFromGame, socket, socketEvents } from './socket';

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

const VALID_PHASES: AppPhase[] = ['home', 'selection', 'game', 'history', 'wallet', 'profile'];

export default function App() {
  // State persistence for "refreshing that exact page"
  const [phase, setPhase] = useState<AppPhase>(() => {
    const saved = localStorage.getItem('bingo_phase');
    if (saved && VALID_PHASES.includes(saved as AppPhase)) {
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
  const [telegramDisplayName, setTelegramDisplayName] = useState<string>('');
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  
  const [winningHistory, setWinningHistory] = useState<any[]>([]);

  const [roomStats, setRoomStats] = useState<RoomStats & { selectionTimeLeft?: number }>({ // Single room stats
    pool: 0, players: 0, gameId: '---', isLive: false, isEngineActive: false, state: GameState.SELECTION
  });
  const [totalActivePlayers, setTotalActivePlayers] = useState(0); // State to track total active players across all rooms

  // Persist navigation state to localStorage
  useEffect(() => {
    localStorage.setItem('bingo_phase', phase);
    localStorage.setItem('bingo_tab', bottomTab);
    localStorage.setItem('bingo_selected_ids', JSON.stringify(selectedBoardIds));
    localStorage.setItem('bingo_history', JSON.stringify(history));
  }, [phase, bottomTab, selectedBoardIds, history]);

  const currentRoomStats: RoomStats = roomStats || { // Get stats for the current stake room, or default values
    pool: 0,
    players: 0,
    gameId: '---',
    isLive: false,
    isEngineActive: false
  };

  // Engine Watchdog: Automatically return to home if the engine becomes idle
  // or maintenance mode is enabled while the user is in a phase that requires an active session.
  useEffect(() => {    
    const engineIsIdle = !roomStats.isEngineActive;
    
    if ((engineIsIdle || isMaintenanceMode) && (phase === 'game' || phase === 'selection')) {
      setPhase('home');
      if (engineIsIdle) setShowEngineIdleModal(true);
    }
  }, [roomStats, phase, isMaintenanceMode]);

  // Auto-transition from selection to game when server state changes to GAME
  useEffect(() => {
    if (phase === 'selection' && roomStats.state === GameState.GAME) {
      console.log("Server game phase started. Moving to Game Page.");
      completeSelection(selectedBoardIds);
    }
  }, [roomStats.state, phase, selectedBoardIds]);

  // Homepage Play uses only stake=10 and decides between selection vs watching.
  const handleHomePlay = () => { // No amount argument needed
    if (isMaintenanceMode) {
      alert("The system is currently under maintenance. New games cannot be started.");
      return;
    }

    if (!roomStats.isEngineActive) { // Use single roomStats
      setShowEngineIdleModal(true);
      return;
    } // Show modal if game engine is not active
    
    if (roomStats.isLive) { // Use single roomStats
      setSelectedBoardIds([]); // watching-only
      setPhase('game');
      return;
    } // If game is live, go to game page in watching-only mode
    setPhase('selection');
  };


  // Handle Socket Connection
  useEffect(() => {
    // Wake up the backend (Render cold start mitigation)
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    fetch(`${backendUrl}/health`).catch((e) => console.error("Backend health check failed:", e)); // Simple poke to wake up backend, with error logging

    const handleStatus = (status: { isVerified: boolean; phone?: string }) => {
      setIsVerified(status.isVerified);
      if (status.phone) setPhoneNumber(status.phone);
    };

    const handleWallet = (balance: number) => setWallet(balance);
    const handlePoolUpdate = (data: PoolUpdateData) => { // PoolUpdateData now contains single room
      if (data.room) setRoomStats(data.room as any); // Update single room stats
      if (data.totalActive !== void 0) setTotalActivePlayers(data.totalActive);
      if (data.isMaintenance !== void 0) setIsMaintenanceMode(data.isMaintenance);
    };
    const handleWinHistory = (history: HistoryEntry[]) => setWinningHistory(history);

    const handleInit = (data: { gameId: string; balls: number[]; selectionTimeLeft?: number; pool?: number; players?: number }) => {
      setRoomStats(prev => {
        return { 
          ...prev, 
          gameId: data.gameId, 
          selectionTimeLeft: data.selectionTimeLeft,
          pool: data.pool ?? prev.pool,
          players: data.players ?? prev.players
        };
      });
    };


    const handleConnectError = (err: Error) => {
      console.error("Socket connection error:", err);
      setConnectionError(true);
    };

    // Admin-controlled game lifecycle
    const handleGameStatus = (status: { isGameRunning: boolean; gameId: string }) => {
      setRoomStats(prev => {
        return {
          ...prev, gameId: status.gameId, isLive: status.isGameRunning
        };
      });
    };

    const handleGameStopped = (msg?: string) => {
      if (msg) alert(msg); // Show message if provided
      setPhase('home');
      setRoomStats(prev => {
        // Reset single room stats
        return { ...prev, isLive: false, isEngineActive: false, state: GameState.FINISHED };
      });
    };

    socket.on(socketEvents.USER_STATUS, handleStatus);
    socket.on(socketEvents.WALLET_UPDATE, handleWallet); // Listen for wallet updates
    socket.on(socketEvents.POOL_UPDATE, handlePoolUpdate);
    socket.on(socketEvents.GAME_INIT, handleInit);
    socket.on(socketEvents.WIN_HISTORY, handleWinHistory);
    socket.on(socketEvents.GAME_RESET, () => { 
      // Only auto-redirect if the user was actually in a game or selection
      // This prevents users browsing their Profile/History from being yanked away
      setPhase(prev => { // Reset phase and selected boards on game reset
        if (prev === 'game' || prev === 'selection') {
          setSelectedBoardIds([]);
          return 'selection';
        }
        return prev;
      });
    });
    socket.on(socketEvents.GAME_STATUS, handleGameStatus);
    socket.on(socketEvents.GAME_STOPPED, (msg?: string) => handleGameStopped(msg));
    socket.on('connect_error', handleConnectError); // Set a timeout to catch connection failures
    const timeoutId = setTimeout(() => {
      // Hard fallback: prevent permanent overlay when socket events never arrive.
      if (!socket.connected) {
        setConnectionError(true);
      }
      setIsVerified(currentStatus => {
        // Keep state consistent; overlay will switch to Connection Failed when connectionError=true.
        return currentStatus;
      });
    }, 15000); // Fail fast to avoid “blank page” perception

    // Add cleanup to prevent memory leaks and duplicate listeners
    const cleanup = () => {
      socket.off(socketEvents.USER_STATUS, handleStatus);
      socket.off(socketEvents.WALLET_UPDATE, handleWallet); // Remove wallet update listener
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
    if (tg) { // Check if Telegram WebApp is available
      tg.expand(); // Open full screen in Telegram
      const user = tg.initDataUnsafe?.user; // Get user data from Telegram
      if (user) {
        // Construct display name from first_name, last_name, or username
        const displayName = user.first_name || user.username || '';
        const lastName = user.last_name ? ` ${user.last_name}` : '';
        setTelegramDisplayName(`${displayName}${lastName}`.trim());
      }
      if (user?.id) setMyId(user.id.toString());

      connectToGame({

        initData: tg.initData,
        user: user // Pass Telegram user data to connectToGame
      });
      socket.emit('room:join'); // Join the single fixed room
    } else {

      // Fallback for browser testing
      // Persist guestId in localStorage to prevent balance reset on refresh
      let guestId = localStorage.getItem('bingoGuestId');
      if (!guestId) {
        guestId = `guest_${Math.floor(1000 + Math.random() * 9000)}`;
        localStorage.setItem('bingoGuestId', guestId);
      }
      connectToGame({ userId: guestId });
      socket.emit('room:join'); // Join the single fixed stake room
      setMyId(guestId); // Set myId for guest users
    }
    return () => {
      cleanup();
      disconnectFromGame();
    };
  }, []);

  const completeSelection = (ids: number[]) => {
    setSelectedBoardIds(ids);

    // Guard: Prevent proceeding to game if engine stopped during selection
    if (!currentRoomStats.isEngineActive) {
      setShowEngineIdleModal(true);
      setPhase('home');
      return;
    }

    // Prevent playing if not verified
    if (isVerified === false) { // Check if the user is verified
      alert("Please verify your phone number in the bot first!");
      return;
    }

    setShowGoodLuck(true);
    setTimeout(() => {
      setShowGoodLuck(false);
      setPhase('game');
    }, 3000);
  };

  const addHistoryEntry = (entry: HistoryEntry) => {
    setHistory(prev => [...prev, entry]);
  };

  const handleBackToHome = useCallback(() => {
    setPhase('home'); // Set phase to home
    setBottomTab('game'); // Ensure the tab highlight moves back to the "Game/Play" tab
  }, []);

  const handleViewHistory = useCallback(() => {
    setPhase('history');
    setBottomTab('history');
  }, []);

  const handleTabChange = useCallback(
    (tab: BottomTabKey) => {
      setBottomTab(tab);

      if (tab === 'game') { // Handle navigation to game tab
        // If user is already in a game or selection, stay there.
        // Otherwise, return to the Home dashboard.
        if (phase === 'selection' || phase === 'game') return;
        setPhase('home');
      } else if (tab === 'history') { // Handle navigation to history tab
        setPhase('history');
      } else if (tab === 'wallet') {
        setPhase('wallet');
      } else if (tab === 'profile') {
        setPhase('profile');
      }
    },
    [phase]
  );

  return (
    <div className="flex flex-col h-screen max-h-screen font-sans selection:bg-yellow-100 selection:text-yellow-900 overflow-hidden relative bg-[#0f170a]">
    <ErrorBoundary fallback={<div className="fixed inset-0 z-150 bg-red-800 flex items-center justify-center text-white text-2xl">Application crashed! Please refresh.</div>}> {/* ErrorBoundary for the entire app */}
        {/* Global Maintenance Banner */}
        {isMaintenanceMode && (
          <div className="bg-red-600 text-white px-4 py-2 z-[202] flex items-center justify-center gap-2 shadow-lg shrink-0">
            <AlertTriangle size={14} className="animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-center">
              Maintenance Mode: System paused. New bets are currently disabled.
            </span>
          </div>
        )}

        {/* Animated background overlay for transitions */}
        <AnimatePresence>
          <motion.div
             key={phase}
            initial={{ opacity: 0, scale: 0.8, borderRadius: '50%' }}
            animate={{ opacity: 0.6, scale: 1, borderRadius: '0%' }}
            exit={{ opacity: 0, scale: 1.2, borderRadius: '50%' }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 z-1 bg-linear-to-br from-yellow-500/70 via-lime-500/70 to-green-700/70 pointer-events-none"
          />
        </AnimatePresence>


        {phase !== 'selection' && phase !== 'game' && <Header onShowRules={() => setShowRules(true)} />}
  
        <main className={`flex-1 flex flex-col relative z-2 bg-black/10 backdrop-blur-[2px] overflow-hidden scroll-touch ${phase === 'game' ? 'pb-0' : 'pb-14'}`}>
          <AnimatePresence mode="wait">
            {/* Initial Loader: Prevents "Blank Black Page" while connecting to backend */}
            {isVerified === null && !connectionError && (
              <motion.div
                key="loading-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }} // Animation for loading overlay
                className="fixed inset-0 z-150 flex flex-col items-center justify-center bg-[#0f170a]"
              >
                <RefreshCw size={32} className="text-yellow-500/50 animate-spin mb-4" />
                <p className="text-yellow-500/40 text-[10px] font-black uppercase tracking-[0.3em]">
                  Connecting...
                </p>
              </motion.div>
            )}

            {isVerified === false && !connectionError && (
              <motion.div // Verification required overlay
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

            {isVerified === true && phase === 'home' && (
              <motion.div // Home page content
                key="home"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <Dashboard
                  onPlay={() => handleHomePlay()} // No amount argument
                  roomStats={roomStats}
                  isMaintenanceMode={isMaintenanceMode}
                />
              </motion.div>
            )}

            {isVerified === true && phase === 'selection' && (
              <motion.div // Selection page content
                key="selection"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <SelectionPage 
                  wallet={wallet} 
                  onComplete={completeSelection} 
                  onBack={handleBackToHome} 
                  serverTimeLeft={roomStats.selectionTimeLeft}
                />
              </motion.div>
            )}

            {isVerified === true && phase === 'game' && (
              <motion.div // Game page content
                key="game"
                initial={{ y: 300, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <GamePage 
                  selectedBoardIds={selectedBoardIds} 
                  onRestart={() => setPhase('selection')} 
                  onLeaveToHome={handleBackToHome}
                  onGameEnd={addHistoryEntry}
                />
              </motion.div>
            )}

            {isVerified === true && phase === 'history' && (
              <motion.div // History page content
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <HistoryPage history={history} onBack={handleBackToHome} />
              </motion.div>
            )}

            {isVerified === true && phase === 'wallet' && (
              <motion.div // Wallet page content
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

            {isVerified === true && phase === 'profile' && (
              <motion.div // Profile page content
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
                  telegramDisplayName={telegramDisplayName}
                  onViewHistory={handleViewHistory}
                />
              </motion.div>
            )}

            {!VALID_PHASES.includes(phase as any) && (
              <motion.div // Fallback for invalid phases
                key="fallback"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-center justify-center p-10 text-center"
              >
                <button onClick={() => { setPhase('home'); setBottomTab('game'); }} className="bg-white text-black px-6 py-2 rounded-xl font-bold">Return Home</button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {connectionError && (
              <motion.div // Connection error overlay
                key="connection-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-150 bg-red-800 flex flex-col items-center justify-center p-8 text-center text-white"
              >
                <RefreshCw size={40} className="mb-6 animate-spin-slow" />
                <h2 className="text-2xl font-black uppercase italic mb-2">Connection Lost</h2>
                <p className="text-red-200 text-sm mb-8">
                  Could not connect to the game server. Please check your internet connection or try again later.
                </p>
                <button onClick={() => window.location.reload()} className="w-full bg-white text-red-800 py-4 rounded-2xl font-black uppercase">Reload Page</button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence> {/* Animate presence for modals */}
            {showGoodLuck && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-indigo-900/90 backdrop-blur-xl text-center">
                <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center mb-6 shadow-2xl">
                    <Trophy size={40} className="text-white" aria-hidden="true" />
                  </div>
                  <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">Good Luck!</h2>
                  <p className="text-indigo-200 font-bold uppercase tracking-widest text-xs">{selectedBoardIds.length} Boards Registered <br /> Redirecting to Game</p>
                  <div className="mt-8 flex gap-2">
                    {[1, 2, 3].map(i => (
                      <motion.div key={i} animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }} className="w-2 h-2 rounded-full bg-white" />
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}

            {showEngineIdleModal && ( // Game engine idle modal
              <div className="fixed inset-0 z-201 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-xs rounded-4xl p-6 shadow-2xl flex flex-col text-center">
                  <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
                    <Clock className="text-indigo-600" size={32} />
                  </div>
                  <h3 className="text-xl font-black text-indigo-950 uppercase italic tracking-tighter mb-2">Game Starts Soon!</h3>
                  <p className="text-gray-500 text-sm font-medium leading-relaxed mb-6">The admin is getting things ready. Please wait a moment for the round to begin.</p>
                  <button onClick={() => setShowEngineIdleModal(false)} className="px-6 py-3 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-colors">Got it</button>
                </motion.div>
              </div>
            )}

            {showRules && ( // Game rules modal
              
              <div className="fixed inset-0 z-101 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black text-indigo-950 uppercase italic tracking-tighter flex items-center gap-2"><Info className="text-indigo-600" /> Game Rules</h3>
                    <button 
                      onClick={() => setShowRules(false)} 
                      className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors" 
                      aria-label="Close rules"
                      title="Close"
                    ><X size={20} /></button>
                  </div>
                  <div className="space-y-6">
                    <RuleItem number="1" text="Stake 10 ETB to enter the round." />
                    <RuleItem number="2" text="Pick your board from the 600 available options within 60 seconds." />
                    <RuleItem number="3" text="Wait for the system to call a ball every 3 seconds." />
                    <RuleItem number="4" text="Numbers are marked automatically. Complete a row, column, diagonal, or four corners to win." />
                  </div>
                  <button onClick={() => setShowRules(false)} className="mt-10 px-6 py-4 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-600 transition-colors">Got it</button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </main>

        {phase !== 'game' && <BottomTabs active={bottomTab} onTabChange={handleTabChange} />}
      </ErrorBoundary>
    </div>
  );
}
