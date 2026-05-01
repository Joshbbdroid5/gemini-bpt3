import { io, Socket } from 'socket.io-client';

// This URL will be updated once we deploy the Node.js server
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnectionAttempts: 5,
});

export const socketEvents = {
  // Outgoing Events (Player -> Server)
  JOIN_ROOM: 'room:join',
  PLACE_BET: 'game:bet',
  
  // Incoming Events (Server -> Player)
  BALL_DRAWN: 'game:ball',
  NEW_WINNER: 'game:winner',
  POOL_UPDATE: 'game:pool_sync',
  WIN_HISTORY: 'game:win_history',
  COUNTDOWN: 'game:countdown',
  WALLET_UPDATE: 'wallet:update',
};

export const connectToGame = (authData: any) => {
  socket.auth = authData;
  socket.connect();
};

export const disconnectFromGame = () => {
  socket.disconnect();
};