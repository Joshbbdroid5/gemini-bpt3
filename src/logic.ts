import { BingoBoardData, BINGO_COLUMNS } from './types';

// Deterministic random number generator based on a seed
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateBoard(boardId: number): BingoBoardData {
  const rng = mulberry32(boardId + 777); // Seed based on board ID
  const board: BingoBoardData = Array(5).fill(null).map(() => Array(5).fill(null));

  const columns = ['B', 'I', 'N', 'G', 'O'] as const;
  columns.forEach((col, colIndex) => {
    const { min, max } = BINGO_COLUMNS[col];
    const available = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const picked: number[] = [];
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(rng() * available.length);
      picked.push(available.splice(idx, 1)[0]);
    }
    // Standard Bingo: sort values within column
    picked.sort((a, b) => a - b);

    picked.forEach((val, rowIndex) => {
      if (col === 'N' && rowIndex === 2) {
        board[rowIndex][colIndex] = { value: 'FREE', marked: true };
      } else {
        board[rowIndex][colIndex] = { value: val, marked: false };
      }
    });
  });

  return board;
}
export interface WinningPattern {
  name: string;
  indices: { r: number; c: number }[];
}
export function checkWin(board: BingoBoardData, called: Set<number | 'FREE'>): { isWinner: boolean; patterns: WinningPattern[] } {
  const patterns: WinningPattern[] = [];
  const isMarked = (cell: { value: number | 'FREE' }) => cell.value === 'FREE' || called.has(cell.value);
  // 1. Rows
  for (let r = 0; r < 5; r++) {
    if (board[r].every(isMarked)) {
      patterns.push({
        name: `Row ${r + 1}`,
        indices: [0, 1, 2, 3, 4].map(c => ({ r, c }))
      });
    }
  }

  // 2. Columns
  for (let c = 0; c < 5; c++) {
    if (board.every(row => isMarked(row[c]))) {
      patterns.push({
        name: `Column ${['B', 'I', 'N', 'G', 'O'][c]}`,
        indices: [0, 1, 2, 3, 4].map(r => ({ r, c }))
      });
    }
  }

  // 3. Diagonals
  if ([0, 1, 2, 3, 4].every(i => isMarked(board[i][i]))) {
    patterns.push({
      name: 'Main Diagonal',
      indices: [0, 1, 2, 3, 4].map(i => ({ r: i, c: i }))
    });
  }
  if ([0, 1, 2, 3, 4].every(i => isMarked(board[i][4 - i]))) {
    patterns.push({
      name: 'Anti-Diagonal',
      indices: [0, 1, 2, 3, 4].map(i => ({ r: i, c: 4 - i }))
    });
  }
  // 4. Corners
  if (isMarked(board[0][0]) && isMarked(board[0][4]) && isMarked(board[4][0]) && isMarked(board[4][4])) {
    patterns.push({
      name: 'Four Corners',
      indices: [
        { r: 0, c: 0 }, { r: 0, c: 4 },
        { r: 4, c: 0 }, { r: 4, c: 4 }
      ]
    });
  }

  return { isWinner: patterns.length > 0, patterns };
}
