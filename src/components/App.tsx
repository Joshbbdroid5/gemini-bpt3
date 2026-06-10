/// <reference types="react" />

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Info, X, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
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
import { 
  HistoryEntry, 
  AppPhase, 
  RoomStats, 
  PoolUpdateData, 
  GameState, 
  GameInitData, 
  SINGLE_STAKE 
} from '../types'; // Import new types
import { connectToGame, disconnectFromGame, resyncGameState, socket, socketEvents } from './socket';

const t = {
  connecting: 'Connecting...',
  connectingSlow: 'Server waking up, please wait…',
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

function getPlayLabel(stats: RoomStats, isMaintenanceMode: boolean): string {
  if (isMaintenanceMode) return 'Unavailable';
  if (!stats.isEngineActive) return 'Engine Starting Soon';
  if (stats.isLive) return 'Watch Live Game';
  return 'Join Selection';
}

function getTimerLabel(stats: RoomStats & { selectionTimeLeft?: number }, isEngineActive: boolean): string { 
  if (stats.isLive || stats.state === GameState.GAME) return 'Game in progress';
  if (stats.selectionTimeLeft && stats.selectionTimeLeft > 0) return `${stats.selectionTimeLeft}s left to pick`;
  return isEngineActive ? 'Selection open' : 'Waiting for admin';
}

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
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [connectionError, setConnectionError] = useState(false);
  const [isConnectingSlow, setIsConnectingSlow] = useState(false);
  const [myId, setMyId] = useState<string>('');
  const [showEngineIdleModal, setShowEngineIdleModal] = useState(false);
  const [showGameStoppedModal, setShowGameStoppedModal] = useState<string | null>(null);
  const [showNextRoundHint, setShowNextRoundHint] = useState(false);
  const [telegramDisplayName, setTelegramDisplayName] = useState<string>('');
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  
  const [referredCount, setReferredCount] = useState<number>(0);

  const [roomStats, setRoomStats] = useState<RoomStats & { selectionTimeLeft?: number }>({ // Single room stats
    pool: 0, players: 0, gameId: '---', isLive: false, isEngineActive: false, state: GameState.SELECTION, selectionTimeLeft: 0
  });
  const [totalActivePlayers, setTotalActivePlayers] = useState(0); // State to track total active players across all rooms

  // Persist navigation state to localStorage
  useEffect(() => {
    localStorage.setItem('bingo_selected_ids', JSON.stringify(selectedBoardIds));
  }, [selectedBoardIds]);

  const fetchTransactions = useCallback(async (uid: string) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    try {
      const resp = await fetch(`${backendUrl}/api/user-transactions?userId=${uid}`);
      if (resp.ok) {
        const data = await resp.json();
        setTransactions(data);
      }
    } catch (e) {
      console.error("Failed to fetch transactions:", e);
    }
  }, []);

  useEffect(() => {
    if (phase === 'wallet' && myId) fetchTransactions(myId);
  }, [phase, myId, fetchTransactions]);

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
  const handleHomePlay = () => {
    if (isMaintenanceMode) {
      toast.error('The system is under maintenance. New games cannot be started.');
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

    const handleStatus = (status: { isVerified: boolean; phone?: string; referredCount?: number }) => {
      setIsVerified(status.isVerified);
      if (status.phone) setPhoneNumber(status.phone);
      if (status.referredCount !== undefined) setReferredCount(status.referredCount);
    };

    const handleWallet = (balance: number) => setWallet(balance);
    const handlePoolUpdate = (data: PoolUpdateData) => { // PoolUpdateData now contains single room
      if (data.room) setRoomStats(data.room as any); // Update single room stats
      if (data.totalActive !== void 0) setTotalActivePlayers(data.totalActive);
      if (data.isMaintenance !== void 0) setIsMaintenanceMode(data.isMaintenance);
    };

    const handleInit = (data: GameInitData) => {
      setRoomStats(prev => {
        return { 
          ...prev, 
          gameId: data.gameId, 
          selectionTimeLeft: data.selectionTimeLeft,
          pool: data.pool ?? prev.pool,
          players: data.players ?? prev.players
        };
      });
      if (Array.isArray(data.myBoardIds)) {
        setSelectedBoardIds(data.myBoardIds);
      }
    };

    const handleWinHistory = (entries: HistoryEntry[]) => {
      setHistory(entries);
      setHistoryLoaded(true);
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
      setShowGameStoppedModal(msg || 'Games are over for today. Please come back tomorrow.');
      setPhase('home');
      setSelectedBoardIds([]);
      setRoomStats(prev => ({
        ...prev, isLive: false, isEngineActive: false, state: GameState.FINISHED
      }));
    };

    const handleConnect = () => {
      setConnectionError(false);
    };

    socket.on(socketEvents.USER_STATUS, handleStatus);
    socket.on(socketEvents.WALLET_UPDATE, handleWallet); // Listen for wallet updates
    socket.on(socketEvents.POOL_UPDATE, handlePoolUpdate);
    socket.on(socketEvents.GAME_INIT, handleInit);
    socket.on(socketEvents.WIN_HISTORY, handleWinHistory);
    socket.on(socketEvents.GAME_RESET, () => {
      setRoomStats(prev => ({ ...prev, state: GameState.SELECTION, isLive: false }));
      setSelectedBoardIds([]);
      setPhase(prev => {
        if (prev === 'game') {
          setShowNextRoundHint(true);
          return 'selection';
        }
        return prev;
      });
    });
    socket.on(socketEvents.GAME_STATUS, handleGameStatus);
    socket.on(socketEvents.GAME_STOPPED, (msg?: string) => handleGameStopped(msg));
    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    const slowConnectId = setTimeout(() => setIsConnectingSlow(true), 5000);
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
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      clearTimeout(slowConnectId);
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
    } else {
      console.warn("Telegram WebApp not detected. Access restricted.");
    }
    return () => {
      cleanup();
      disconnectFromGame();
    };
  }, []);

  const completeSelection = useCallback((ids: number[]) => {
    setSelectedBoardIds(ids);

    if (!currentRoomStats.isEngineActive) {
      setShowEngineIdleModal(true);
      setPhase('home');
      return;
    }

    if (isVerified === false) {
      toast.error('Please verify your phone number in the bot first.');
      return;
    }
    setPhase('game');
  }, [currentRoomStats.isEngineActive, isVerified]);

  const handleResync = useCallback(() => {
    setConnectionError(false);
    resyncGameState();
    if (myId) fetchTransactions(myId);
    toast.success('Syncing…');
  }, [myId, fetchTransactions]);

  const handleBackToHome = useCallback(() => {
    setPhase('home'); // Set phase to home
    setBottomTab('game'); // Ensure the tab highlight moves back to the "Game/Play" tab
  }, []);

  const handleGameEnd = useCallback((entry: HistoryEntry) => {
    setHistory(prev => [...prev, entry]);
  }, []);

  const handleRestartGame = useCallback(() => {
    setPhase('selection');
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
                  {isConnectingSlow ? t.connectingSlow : t.connecting}
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
                  onPlay={handleHomePlay}
                  isPlayDisabled={isMaintenanceMode || !roomStats.isEngineActive}
                  playButtonLabel={getPlayLabel(roomStats, isMaintenanceMode)}
                  showEngineIdleHint={showEngineIdleModal}
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
                  selectedBoardIds={selectedBoardIds}
                  onSelectionChange={(ids) => setSelectedBoardIds(ids)} 
                  onBack={handleBackToHome} 
                  onDismissHint={() => setShowNextRoundHint(false)}
                  showNextRoundHint={showNextRoundHint}
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
                  onLeaveToHome={handleBackToHome}
                  onRestartGame={handleRestartGame} // Pass the memoized restart function
                  onGameEnd={handleGameEnd} // Pass the memoized game end handler
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
                <HistoryPage history={history} isLoading={!historyLoaded} onBack={handleBackToHome} onRefresh={handleResync} />
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
                  transactions={transactions}
                  userId={myId}
                  telegramDisplayName={telegramDisplayName}
                  onRefresh={handleResync}
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
                  referredCount={referredCount}
                  botUsername={IS_BOT_CONFIGURED ? BOT_USERNAME : undefined}
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
                <button onClick={handleResync} className="w-full bg-white text-red-800 py-4 rounded-2xl font-black uppercase">Retry Connection</button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showGameStoppedModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-201 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
              >
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl flex flex-col text-center">
                  <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="text-orange-600" size={32} />
                  </div>
                  <h3 className="text-xl font-black text-indigo-950 uppercase italic tracking-tighter mb-2">Session Ended</h3>
                  <p className="text-gray-500 text-sm font-medium leading-relaxed mb-6">{showGameStoppedModal}</p>
                  <button onClick={() => setShowGameStoppedModal(null)} className="px-6 py-3 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest">Got it</button>
                </motion.div>
              </motion.div>
            )}

            {showEngineIdleModal && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-201 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
              >
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl flex flex-col text-center">
                  <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
                    <Clock className="text-indigo-600" size={32} />
                  </div>
                  <h3 className="text-xl font-black text-indigo-950 uppercase italic tracking-tighter mb-2">Game Starts Soon!</h3>
                  <p className="text-gray-500 text-sm font-medium leading-relaxed mb-6">The admin is getting things ready. Please wait a moment for the round to begin.</p>
                  <button onClick={() => setShowEngineIdleModal(false)} className="px-6 py-3 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-colors">Got it</button>
                </motion.div>
              </motion.div>
            )}

            {showRules && ( // Game rules modal
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-101 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
              >
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-black text-indigo-950 uppercase italic tracking-tighter flex items-center gap-2"><Info className="text-indigo-600" /> Game Rules</h3>
                    <button 
                      onClick={() => setShowRules(false)} 
                      className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors" 
                      aria-label="Close rules"
                      title="Close"
                    ><X size={20} /></button>
                  </div>
                  <div className="space-y-6">
                    <RuleItem number="1" text={`Stake ${SINGLE_STAKE} ETB to enter the round.`} />
                    <RuleItem number="2" text="Pick your board from the 600 available options within 40 seconds." />
                    <RuleItem number="3" text="Wait for the system to call a ball every 3 seconds." />
                    <RuleItem number="4" text="Numbers are marked automatically. Complete a row, column, diagonal, or four corners to win." />
                    <RuleItem number="5" text="After a win, you have 10 seconds to view results, then pick a board for the next round." />
                  </div>
                  <button onClick={() => setShowRules(false)} className="mt-10 px-6 py-4 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-600 transition-colors">Got it</button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {phase !== 'game' && <BottomTabs active={bottomTab} onTabChange={handleTabChange} />}
      </ErrorBoundary>
    </div>
  );
}
