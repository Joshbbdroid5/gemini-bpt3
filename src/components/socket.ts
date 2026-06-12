import { io, Socket } from 'socket.io-client';
import {
  GameInitData,
  HistoryEntry,
  PickBoardResult,
  PoolUpdateData,
} from '../types';

const isNode =
  typeof process !== 'undefined' && process.versions && !!process.versions.node;

// Environment-aware URL resolution to prevent Node.js crashes
const SOCKET_URL: string = isNode
  ? process.env.VITE_BACKEND_URL || 'http://localhost:3001'
  : import.meta.env.VITE_BACKEND_URL || window.location.origin;

export const socketEvents = {
  // Outgoing Events (Player -> Server)
  JOIN_ROOM: 'room:join',
  PICK_BOARD: 'game:pick_board',
  FORCE_START: 'game:force_start',

  // Incoming Events (Server -> Player)
  USER_STATUS: 'user:status',
  GAME_INIT: 'game:init',
  GAME_STATUS: 'game:status',
  GAME_STOPPED: 'game:stopped',
  GAME_RESET: 'game:reset',
  BALL_DRAWN: 'game:ball',
  NEW_WINNER: 'game:winner',
  POOL_UPDATE: 'game:pool_sync',
  BOARD_SYNC: 'game:board_sync',
  PICK_BOARD_RESULT: 'game:pick_board_result',
  WIN_HISTORY: 'game:win_history',
  COUNTDOWN: 'game:countdown',
  WALLET_UPDATE: 'wallet:update',
} as const; // Added ensuring this is properly closed

export interface ServerToClientEvents {
  [socketEvents.USER_STATUS]: (status: {
    isVerified: boolean;
    phone?: string;
    referredCount?: number;
  }) => void;
  [socketEvents.GAME_INIT]: (data: GameInitData) => void;
  [socketEvents.GAME_STATUS]: (status: {
    isGameRunning: boolean;
    gameId: string;
  }) => void;
  [socketEvents.GAME_STOPPED]: (msg?: string) => void;
  [socketEvents.GAME_RESET]: () => void;
  [socketEvents.BALL_DRAWN]: (num: number) => void;
  [socketEvents.NEW_WINNER]: (data: any) => void;
  [socketEvents.POOL_UPDATE]: (data: PoolUpdateData) => void;
  [socketEvents.BOARD_SYNC]: (data: { takenBoards: number[] }) => void;
  [socketEvents.PICK_BOARD_RESULT]: (result: PickBoardResult) => void;
  [socketEvents.WIN_HISTORY]: (history: HistoryEntry[]) => void;
  [socketEvents.COUNTDOWN]: (seconds: number) => void;
  [socketEvents.WALLET_UPDATE]: (balance: number) => void;
}

export interface ClientToServerEvents {
  [socketEvents.JOIN_ROOM]: () => void;
  [socketEvents.PICK_BOARD]: (data: { boardId: number }) => void;
  [socketEvents.FORCE_START]: (data: { secret: string }) => void;
}

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  SOCKET_URL,
  {
    autoConnect: false,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  }
);

const onSocketConnect = () => {
  socket.emit(socketEvents.JOIN_ROOM);
};

export const connectToGame = (authData: any) => {
  socket.auth = authData;
  socket.off('connect', onSocketConnect);
  socket.on('connect', onSocketConnect);
  if (socket.connected) {
    onSocketConnect();
  } else {
    socket.connect();
  }
};

export const disconnectFromGame = () => {
  socket.off('connect', onSocketConnect);
  socket.disconnect();
};

/** Re-fetch room state, wallet, and history without a full page reload. */
export const resyncGameState = () => {
  if (socket.connected) {
    socket.emit(socketEvents.JOIN_ROOM);
  } else {
    socket.connect();
  }
};
