export interface BingoCell {
  value: number | 'FREE';
  marked: boolean;
}

export type BingoBoardData = BingoCell[][];

export type AppPhase = 'lobby' | 'home' | 'selection' | 'game' | 'history' | 'wallet' | 'profile' | 'verifying' | 'admin';


export interface GameStats {
  gameId: string;
  players: number;
  staked: number;
  derash: number;
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

export type Language = 'en' | 'am' | 'om';
