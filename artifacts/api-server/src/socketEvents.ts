export const socketEvents = {
  JOIN_ROOM: 'room:join',
  PICK_BOARD: 'game:pick_board',
  FORCE_START: 'game:force_start',

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
} as const;
