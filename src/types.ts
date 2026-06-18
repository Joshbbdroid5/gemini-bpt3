export interface BingoCell {
  value: number | 'FREE';
  marked: boolean;
}

export type BingoBoardData = BingoCell[][];

export type AppPhase =
  | 'home'
  | 'selection'
  | 'game'
  | 'history'
  | 'wallet'
  | 'profile';

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
  selectionTimeLeft?: number;
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

export interface PickBoardResult {
  success: boolean;
  boardId: number;
  selectedBoardIds: number[];
  message?: string;
  takenBoards?: number[];
}

export interface GameInitData {
  gameId: string;
  balls: number[];
  selectionTimeLeft?: number;
  pool?: number;
  players?: number;
  takenBoards?: number[];
  myBoardIds?: number[];
}

export const BINGO_COLUMNS = {
  B: { min: 1, max: 15 },
  I: { min: 16, max: 30 },
  N: { min: 31, max: 45 },
  G: { min: 46, max: 60 },
  O: { min: 61, max: 75 },
};

export const TOTAL_BOARDS = 600;
export const SINGLE_STAKE = 10;

export interface IGlobalGameState {
  totalVolume: number;
  totalProfit: number;
  isMaintenanceMode: boolean;
  isGameRunning: boolean;
  stopRequested: boolean;
  activePlayers: number;
}

export interface IAdminCreateUserBody {
  userId: string;
  referredBy?: string;
  secret: string;
}

export interface IAdminAddPendingDepositBody {
  userId: string;
  amount: number;
  telebirrSms: string;
  secret: string;
}

export interface IAdminUpdateWalletBody {
  userId: string;
  amount: number;
  secret: string;
  mode?: 'adjust' | 'set';
}

export interface IAdminWithdrawRequestBody {
  userId: string;
  amount: number;
  secret: string;
}

export interface IAdminRefundWithdrawalBody {
  userId: string;
  amount: number;
  secret: string;
}

export interface IAdminCompleteWithdrawalBody {
  userId: string;
  amount: number;
  secret: string;
}

export interface IAdminRejectDepositBody {
  userId: string;
  amount: number;
  secret: string;
}

export interface IAdminVerifyUserBody {
  userId: string;
  phone: string;
  secret: string;
}

export interface IAdminToggleMaintenanceBody {
  secret: string;
  enabled: boolean;
}

export interface IAdminQuery { userId?: string; secret?: string }

export interface IWinnerInfo {
  userId: string;
  boardId: number;
  patterns: any[];
}

export interface ISocketAuthUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  [key: string]: any;
}

export interface IUserLean {
  userId: string;
  username?: string;
  balance: number;
  isVerified: boolean;
  referredBy?: string;
  phone?: string;
  referredCount: number;
}

export interface IRoomDocToObject {
  currentGameId: string;
  state: GameState;
  globalPool: number;
  currentBalls: number[];
  shuffledBalls: number[];
  selectionStartTime?: number;
  selectionDuration?: number;
  playerBoards: Record<string, number[]>; // Mongoose Map.toObject() converts to plain object
  boardStatus: Record<string, string>; // Mongoose Map.toObject() converts to plain object
}
