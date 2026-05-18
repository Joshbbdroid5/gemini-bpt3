import { io, Socket } from 'socket.io-client';

// This URL will be updated once we deploy the Node.js server
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

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
  WIN_HISTORY: 'game:win_history',
  COUNTDOWN: 'game:countdown',
  WALLET_UPDATE: 'wallet:update',
} as const;

export interface ServerToClientEvents {
  [socketEvents.USER_STATUS]: (status: { isVerified: boolean; phone?: string }) => void;
  [socketEvents.GAME_INIT]: (data: any) => void;
  [socketEvents.GAME_STATUS]: (status: { isGameRunning: boolean; gameId: string }) => void;
  [socketEvents.GAME_STOPPED]: () => void;
  [socketEvents.GAME_RESET]: () => void;
  [socketEvents.BALL_DRAWN]: (num: number) => void;
  [socketEvents.NEW_WINNER]: (data: any) => void;
  [socketEvents.POOL_UPDATE]: (data: any) => void;
  [socketEvents.BOARD_SYNC]: (data: { takenBoards: number[] }) => void;
  [socketEvents.WIN_HISTORY]: (history: any[]) => void;
  [socketEvents.COUNTDOWN]: (seconds: number) => void;
  [socketEvents.WALLET_UPDATE]: (balance: number) => void;
}

export interface ClientToServerEvents {
  [socketEvents.JOIN_ROOM]: (roomId: number) => void;
  [socketEvents.PICK_BOARD]: (data: { boardId: number; stake: number }) => void;
  [socketEvents.FORCE_START]: () => void;
}

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SOCKET_URL, {
  autoConnect: false,
  reconnectionAttempts: 5,
});

export const connectToGame = (authData: any) => {
  socket.auth = authData;
  socket.connect();
};

export const disconnectFromGame = () => {
  socket.disconnect();
};