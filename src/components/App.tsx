import React, { useState, useCallback, useEffect } from 'react';
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
  SINGLE_STAKE,
} from '../types';
import { connectToGame, disconnectFromGame, resyncGameState, socket, socketEvents } from './socket';

declare global {
  interface Window { Telegram?: any; }
}

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
const IS_BOT_CONFIGURED = BOT_USERNAME && BOT_USERNAME !== 'YOUR_BOT_USERNAME_HERE' && BOT_USERNAME !== '';
const VALID_PHASES: AppPhase[] = ['home', 'selection', 'game', 'history', 'wallet', 'profile'];

function getPlayLabel(stats: RoomStats, isMaintenanceMode: boolean): string {
  if (isMaintenanceMode) return 'Unavailable';
  if (!stats.isEngineActive) return 'Engine Starting Soon';
  if (stats.isLive) return 'Watch Live Game';
  return 'Join Selection';
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(() => {
    const saved = localStorage.getItem('bingo_phase');
    return saved && VALID_PHASES.includes(saved as AppPhase) ? (saved as AppPhase) : 'home';
  });
  const [bottomTab, setBottomTab] = useState<BottomTabKey>(() => {
    const saved = localStorage.getItem('bingo_tab') || 'game';
    const valid: BottomTabKey[] = ['game', 'history', 'wallet', 'profile'];
    return valid.includes(saved as BottomTabKey) ? (saved as BottomTabKey) : 'game';
  });
  const [wallet, setWallet] = useState(0);
  const [selectedBoardIds, setSelectedBoardIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('bingo_selected_ids');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [connectionError, setConnectionError] = useState(false);
  const [isConnectingSlow, setIsConnectingSlow] = useState(false);
  const [myId, setMyId] = useState('');
  const [showEngineIdleModal, setShowEngineIdleModal] = useState(false);
  const [showGameStoppedModal, setShowGameStoppedModal] = useState<string | null>(null);
  const [showNextRoundHint, setShowNextRoundHint] = useState(false);
  const [telegramDisplayName, setTelegramDisplayName] = useState('');
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [referredCount, setReferredCount] = useState(0);
  const [roomStats, setRoomStats] = useState<RoomStats & { selectionTimeLeft?: number }>({
    pool: 0, players: 0, gameId: '---', isLive: false, isEngineActive: false,
    state: GameState.SELECTION, selectionTimeLeft: 0,
  });

  useEffect(() => {
    localStorage.setItem('bingo_selected_ids', JSON.stringify(selectedBoardIds));
  }, [selectedBoardIds]);

  const fetchTransactions = useCallback(async (uid: string, signal?: AbortSignal) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    try {
      const resp = await fetch(`${backendUrl}/api/user-transactions?userId=${uid}`, { signal });
      if (resp.ok) setTransactions(await resp.json());
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError')
        console.error('Failed to fetch transactions:', e.message.replace(/[\r\n]/g, ' '));
    }
  }, []);

  useEffect(() => {
    if (phase === 'wallet' && myId) {
      const controller = new AbortController();
      fetchTransactions(myId, controller.signal);
      return () => controller.abort();
    }
  }, [phase, myId, fetchTransactions]);

  // Engine watchdog
  useEffect(() => {
    if ((!roomStats.isEngineActive || isMaintenanceMode) && (phase === 'game' || phase === 'selection')) {
      setPhase('home');
      if (!roomStats.isEngineActive) setShowEngineIdleModal(true);
    }
  }, [roomStats.isEngineActive, isMaintenanceMode, phase]);

  // Auto-transition selection → game
  useEffect(() => {
    if (phase === 'selection' && roomStats.state === GameState.GAME) {
      completeSelection(selectedBoardIds);
    }
  }, [roomStats.state, phase]);

  const handleHomePlay = () => {
    if (isMaintenanceMode) { toast.error('Under maintenance.'); return; }
    if (!roomStats.isEngineActive) { setShowEngineIdleModal(true); return; }
    if (roomStats.isLive) { setSelectedBoardIds([]); setPhase('game'); return; }
    setPhase('selection');
  };

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const healthController = new AbortController();
    fetch(`${backendUrl}/health`, { signal: healthController.signal }).catch(() => {});

    let connectionTimeoutId: ReturnType<typeof setTimeout>;

    const handleStatus = (status: { isVerified: boolean; phone?: string; referredCount?: number }) => {
      clearTimeout(connectionTimeoutId);
      setIsVerified(status.isVerified);
      if (status.phone) setPhoneNumber(status.phone);
      if (status.referredCount !== undefined) setReferredCount(status.referredCount);
    };
    const handleWallet = (balance: number) => setWallet(balance);
    const handlePoolUpdate = (data: PoolUpdateData) => {
      if (data.room) setRoomStats(data.room as any);
      if (data.isMaintenance !== void 0) setIsMaintenanceMode(data.isMaintenance);
    };
    const handleInit = (data: GameInitData) => {
      setRoomStats(prev => ({
        ...prev, gameId: data.gameId, selectionTimeLeft: data.selectionTimeLeft,
        pool: data.pool ?? prev.pool, players: data.players ?? prev.players,
      }));
      if (Array.isArray(data.myBoardIds)) setSelectedBoardIds(data.myBoardIds);
    };
    const handleWinHistory = (entries: HistoryEntry[]) => { setHistory(entries); setHistoryLoaded(true); };
    const handleConnectError = (err: Error) => {
      console.error('Socket connection error:', String(err?.message ?? '').replace(/[\r\n]/g, ' '));
      clearTimeout(connectionTimeoutId);
      setConnectionError(true);
    };
    const handleGameStatus = (status: { isGameRunning: boolean; gameId: string }) => {
      setRoomStats(prev => ({ ...prev, gameId: status.gameId, isLive: status.isGameRunning }));
    };
    const handleGameStopped = (msg?: string) => {
      setShowGameStoppedModal(msg || 'Games are over for today. Please come back tomorrow.');
      setPhase('home');
      setSelectedBoardIds([]);
      setRoomStats(prev => ({ ...prev, isLive: false, isEngineActive: false, state: GameState.FINISHED }));
    };
    const handleConnect = () => setConnectionError(false);
    const handleGameReset = () => {
      setRoomStats(prev => ({ ...prev, state: GameState.SELECTION, isLive: false }));
      setSelectedBoardIds([]);
      setPhase(prev => { if (prev === 'game') { setShowNextRoundHint(true); return 'selection'; } return prev; });
    };

    socket.on(socketEvents.USER_STATUS, handleStatus);
    socket.on(socketEvents.WALLET_UPDATE, handleWallet);
    socket.on(socketEvents.POOL_UPDATE, handlePoolUpdate);
    socket.on(socketEvents.GAME_INIT, handleInit);
    socket.on(socketEvents.WIN_HISTORY, handleWinHistory);
    socket.on(socketEvents.GAME_RESET, handleGameReset);
    socket.on(socketEvents.GAME_STATUS, handleGameStatus);
    socket.on(socketEvents.GAME_STOPPED, handleGameStopped);
    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);

    const slowConnectId = setTimeout(() => setIsConnectingSlow(true), 5000);
    connectionTimeoutId = setTimeout(() => {
      setIsVerified(cur => { if (cur === null) setConnectionError(true); return cur; });
    }, 18000);

    const tg = window.Telegram?.WebApp;
    if (tg && tg.initData) {
      tg.expand();
      const user = tg.initDataUnsafe?.user;
      if (user) {
        const lastName = user.last_name ? ` ${user.last_name}` : '';
        setTelegramDisplayName(`${user.first_name || user.username || ''}${lastName}`.trim());
      }
      if (user?.id) setMyId(user.id.toString());
      connectToGame({ initData: tg.initData, user });
    } else {
      // Not in Telegram — show error immediately
      clearTimeout(connectionTimeoutId);
      clearTimeout(slowConnectId);
      setConnectionError(true);
    }

    return () => {
      socket.off(socketEvents.USER_STATUS, handleStatus);
      socket.off(socketEvents.WALLET_UPDATE, handleWallet);
      socket.off(socketEvents.POOL_UPDATE, handlePoolUpdate);
      socket.off(socketEvents.GAME_INIT, handleInit);
      socket.off(socketEvents.WIN_HISTORY, handleWinHistory);
      socket.off(socketEvents.GAME_RESET, handleGameReset);
      socket.off(socketEvents.GAME_STATUS, handleGameStatus);
      socket.off(socketEvents.GAME_STOPPED, handleGameStopped);
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      healthController.abort();
      clearTimeout(slowConnectId);
      clearTimeout(connectionTimeoutId);
      disconnectFromGame();
    };
  }, []);

  const handleSelectionChange = useCallback((ids: number[]) => setSelectedBoardIds(ids), []);
  const handleDismissNextRoundHint = useCallback(() => setShowNextRoundHint(false), []);

  const completeSelection = useCallback((ids: number[]) => {
    setSelectedBoardIds(ids);
    if (!roomStats.isEngineActive) { setShowEngineIdleModal(true); setPhase('home'); return; }
    if (isVerified === false) { toast.error('Please verify your phone number in the bot first.'); return; }
    setPhase('game');
  }, [roomStats.isEngineActive, isVerified]);

  const handleResync = useCallback(() => {
    setConnectionError(false);
    resyncGameState();
    if (myId) fetchTransactions(myId);
    toast.success('Syncing…');
  }, [myId, fetchTransactions]);

  const handleBackToHome = useCallback(() => { setPhase('home'); setBottomTab('game'); }, []);
  const handleGameEnd = useCallback((entry: HistoryEntry) => setHistory(prev => [...prev, entry]), []);
  const handleRestartGame = useCallback(() => setPhase('selection'), []);
  const handleViewHistory = useCallback(() => { setPhase('history'); setBottomTab('history'); }, []);

  const handleTabChange = useCallback((tab: BottomTabKey) => {
    setBottomTab(tab);
    if (tab === 'game') { if (phase !== 'selection' && phase !== 'game') setPhase('home'); }
    else if (tab === 'history') setPhase('history');
    else if (tab === 'wallet') setPhase('wallet');
    else if (tab === 'profile') setPhase('profile');
  }, [phase]);

  // ─── Overlay states that must render at the true root, outside any transform context ───
  const showTelegramError = connectionError;
  const showLoader = isVerified === null && !connectionError;
  const showVerifyScreen = isVerified === false && !connectionError;

  return (
    <div className="flex flex-col h-screen max-h-screen font-sans overflow-hidden relative bg-[#0f170a]">
      <ErrorBoundary fallback={
        <div className="fixed inset-0 bg-red-800 flex items-center justify-center text-white text-2xl font-black">
          Application crashed! Please refresh.
        </div>
      }>

        {/* ── Full-screen overlays — NO transform ancestors so fixed positioning works ── */}

        {showLoader && (
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0f170a]">
            <RefreshCw size={32} className="text-yellow-500/50 animate-spin mb-4" />
            <p className="text-yellow-500/40 text-[10px] font-black uppercase tracking-[0.3em]">
              {isConnectingSlow ? 'Server waking up, please wait…' : 'Connecting...'}
            </p>
          </div>
        )}

        {showTelegramError && (
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0f170a] p-8 text-center">
            <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mb-6">
              <RefreshCw size={36} className="text-indigo-400" />
            </div>
            <h2 className="text-2xl font-black text-white uppercase italic mb-2">Open in Telegram</h2>
            <p className="text-gray-400 text-sm mb-8 max-w-xs leading-relaxed">
              This app must be opened through the Telegram bot. Please use the bot link to access Lomi Bingo.
            </p>
            <button
              onClick={handleResync}
              className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase text-xs tracking-widest"
            >
              Retry
            </button>
          </div>
        )}

        {showVerifyScreen && (
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#1a1b2e] p-8 text-center">
            <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mb-6">
              <Info size={40} className="text-orange-500" />
            </div>
            <h2 className="text-2xl font-black text-white uppercase italic mb-2">Verification Required</h2>
            <p className="text-gray-400 text-sm mb-8 max-w-xs leading-relaxed">
              To ensure secure payments and fair play, please share your phone number with our bot.
            </p>
            <button
              onClick={() => window.Telegram?.WebApp?.close()}
              className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase"
            >
              Go Back to Bot
            </button>
          </div>
        )}

        {/* ── Main app (only visible when verified) ── */}
        {isVerified === true && !connectionError && (
          <>
            {isMaintenanceMode && (
              <div className="bg-red-600 text-white px-4 py-2 z-[202] flex items-center justify-center gap-2 shadow-lg shrink-0">
                <AlertTriangle size={14} className="animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-center">
                  Maintenance Mode: System paused. New bets are currently disabled.
                </span>
              </div>
            )}

            {/* Background gradient overlay */}
            <AnimatePresence>
              <motion.div
                key={phase}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 z-[1] bg-gradient-to-br from-yellow-500/70 via-lime-500/70 to-green-700/70 pointer-events-none"
              />
            </AnimatePresence>

            {phase !== 'selection' && phase !== 'game' && (
              <Header onShowRules={() => setShowRules(true)} />
            )}

            <main className={`flex-1 flex flex-col relative z-[2] bg-black/10 backdrop-blur-[2px] overflow-hidden scroll-touch ${phase === 'game' ? 'pb-0' : 'pb-14'}`}>
              <AnimatePresence mode="wait">
                {phase === 'home' && (
                  <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                    <Dashboard
                      onPlay={handleHomePlay}
                      isPlayDisabled={isMaintenanceMode || !roomStats.isEngineActive}
                      playButtonLabel={getPlayLabel(roomStats, isMaintenanceMode)}
                      showEngineIdleHint={showEngineIdleModal}
                    />
                  </motion.div>
                )}
                {phase === 'selection' && (
                  <motion.div key="selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                    <SelectionPage
                      wallet={wallet}
                      selectedBoardIds={selectedBoardIds}
                      onSelectionChange={handleSelectionChange}
                      onBack={handleBackToHome}
                      onDismissHint={handleDismissNextRoundHint}
                      showNextRoundHint={showNextRoundHint}
                      serverTimeLeft={roomStats.selectionTimeLeft}
                    />
                  </motion.div>
                )}
                {phase === 'game' && (
                  <motion.div key="game" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex-1 flex flex-col min-h-0">
                    <GamePage
                      selectedBoardIds={selectedBoardIds}
                      onLeaveToHome={handleBackToHome}
                      onRestartGame={handleRestartGame}
                      onGameEnd={handleGameEnd}
                    />
                  </motion.div>
                )}
                {phase === 'history' && (
                  <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                    <HistoryPage history={history} isLoading={!historyLoaded} onBack={handleBackToHome} onRefresh={handleResync} />
                  </motion.div>
                )}
                {phase === 'wallet' && (
                  <motion.div key="wallet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                    <WalletPage
                      walletBalance={wallet}
                      phoneNumber={phoneNumber}
                      isVerified={true}
                      transactions={transactions}
                      userId={myId}
                      telegramDisplayName={telegramDisplayName}
                      onRefresh={handleResync}
                      onBack={handleBackToHome}
                    />
                  </motion.div>
                )}
                {phase === 'profile' && (
                  <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
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
              </AnimatePresence>
            </main>

            {phase !== 'game' && <BottomTabs active={bottomTab} onTabChange={handleTabChange} />}

            {/* ── In-app modals (rendered at root level, outside main) ── */}
            <AnimatePresence>
              {showGameStoppedModal && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[201] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl flex flex-col text-center">
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
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[201] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl flex flex-col text-center">
                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clock className="text-indigo-600" size={32} />
                    </div>
                    <h3 className="text-xl font-black text-indigo-950 uppercase italic tracking-tighter mb-2">Game Starts Soon!</h3>
                    <p className="text-gray-500 text-sm font-medium leading-relaxed mb-6">The admin is getting things ready. Please wait a moment for the round to begin.</p>
                    <button onClick={() => setShowEngineIdleModal(false)} className="px-6 py-3 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-colors">Got it</button>
                  </motion.div>
                </motion.div>
              )}
              {showRules && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[101] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-2xl font-black text-indigo-950 uppercase italic tracking-tighter flex items-center gap-2">
                        <Info className="text-indigo-600" /> Game Rules
                      </h3>
                      <button onClick={() => setShowRules(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors" aria-label="Close rules">
                        <X size={20} />
                      </button>
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
          </>
        )}

      </ErrorBoundary>
    </div>
  );
}
