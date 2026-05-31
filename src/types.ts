export interface BingoCell {
  value: number | 'FREE';
  marked: boolean;
}

export type BingoBoardData = BingoCell[][];

export type AppPhase = 'home' | 'selection' | 'game' | 'history' | 'wallet' | 'profile';

export enum GameState {
  SELECTION = 'SELECTION',
  GAME = 'GAME',
  FINISHED = 'FINISHED',
}

export interface RoomStats {
  pool: number;
  players: number;
  gameId: string;
  state: GameState;
  isLive: boolean;
  isEngineActive: boolean;
}

export interface PoolUpdateData {
  room: RoomStats; // Single room stats
  totalActive: number;
  isEngineActive: boolean;
  isMaintenance: boolean;
}

export interface HistoryEntry {
  gameId: string;
  date: string;
  totalStaked: number;
  totalWinners: number;
  payoutPerWinner: number;
  myBoardsCount: number;
  isMyWin: boolean;
}

export const BINGO_COLUMNS = {
  B: { min: 1, max: 15 },
  I: { min: 16, max: 30 },
  N: { min: 31, max: 45 },
  G: { min: 46, max: 60 },
  O: { min: 61, max: 75 },
};

export const TOTAL_BOARDS = 600;
