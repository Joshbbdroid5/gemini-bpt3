import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import { generateBoard, checkWin } from './src/logic';
import fs from 'fs';

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.io
const io = new SocketIOServer(server, {
  cors: {
    // CRITICAL: Prevent other sites from connecting to your socket
    origin: process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL
      ? [process.env.FRONTEND_URL, "https://vercel.com"] // Add Vercel's domain or specific URL
      : "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors()); // Enable CORS for Express routes as well
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'your-super-secret-key';

const WALLET_FILE = './wallets.json';

// Helper to load wallets from file
const loadWallets = (): Map<string, number> => {
  if (fs.existsSync(WALLET_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
      return new Map(Object.entries(data));
    } catch (e) {
      console.error("Error loading wallets:", e);
    }
  }
  return new Map<string, number>();
};

// Helper to save wallets to file
const saveWallets = () => {
  fs.writeFileSync(WALLET_FILE, JSON.stringify(Object.fromEntries(userWallets), null, 2));
};

// Utility to verify Telegram Init Data
function verifyTelegramData(initData: string): boolean {
  if (!BOT_TOKEN || !initData) return false;
  
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  
  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  
  return hmac === hash;
}

// Basic Express route
app.get('/', (req, res) => {
  res.send('Bingo Backend is running!');
});

// ADMIN ENDPOINT: Manually update user wallet
// This is used by your bot/admin tool to add ETB after manual payment
app.post('/admin/update-wallet', (req, res) => {
  const { userId, amount, secret } = req.body;

  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!userId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const currentBal = userWallets.get(userId) || 0;
  const newBal = currentBal + amount;
  userWallets.set(userId, newBal);
  saveWallets();

  // Notify the user via Socket if they are currently connected
  const socketId = socketMapping.get(userId);
  if (socketId) {
    io.to(socketId).emit('wallet:update', newBal);
  }

  console.log(`ADMIN: Updated wallet for ${userId}. New balance: ${newBal}`);
  res.json({ success: true, newBalance: newBal });
});

// ADMIN ENDPOINT: Fetch all wallets
app.post('/admin/wallets', (req, res) => {
  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  // Convert Map to Object for JSON response
  res.json(Object.fromEntries(userWallets));
});

// Global Game State
let currentBalls: number[] = [];
let globalPool = 0;
let activePlayers = 0;
let currentGameId = `WB-${Math.floor(100000 + Math.random() * 900000)}`;
let winningHistory: any[] = [];
const userWallets = loadWallets(); // userId -> balance
const socketMapping = new Map<string, string>(); // userId -> socketId
const playerBoards = new Map<string, number[]>(); // Map of userId to their selected board IDs

// Pre-generate and cache all 600 boards to ensure they are static and highly performant
const boardsCache = new Map<number, any>();
for (let i = 1; i <= 600; i++) {
  boardsCache.set(i, generateBoard(i));
}

// Mock database for verified users (In production, use a real DB)
const verifiedUsers = new Set<string>(); 

// We use a slower interval (5s) which is already good for free tier CPU limits
// If you find the server lagging, you can increase this to 7s or 10s
const broadcastPoolUpdate = () => {
  io.emit('game:pool_sync', {
    pool: globalPool,
    players: activePlayers
  });
};

let isGameOver = false;

// Global interval for drawing balls
const runGameLoop = () => {
  if (currentBalls.length < 75 && !isGameOver) {
    const ball = Math.floor(Math.random() * 75) + 1;
    if (!currentBalls.includes(ball)) {
      currentBalls.push(ball);
      console.log(`Drawing ball: ${ball}`);
      io.emit('game:ball', ball);

      // AUTO-CLAIM CHECK: Collect all winners for this specific ball
      const winnersThisRound: any[] = [];
      
      playerBoards.forEach((boardIds, userId) => {
        for (const boardId of boardIds) {
          const grid = boardsCache.get(boardId);
          const win = checkWin(grid, new Set(currentBalls) as any);
          
          if (win.isWinner) {
            winnersThisRound.push({
              userId,
              boardId,
              patterns: win.patterns
            });
          }
        }
      });

      if (winnersThisRound.length > 0) {
        isGameOver = true;
        const totalPayout = globalPool * 0.8;
        const splitPayout = totalPayout / winnersThisRound.length;

        winnersThisRound.forEach(w => {
          const winnerInfo = {
            ...w,
            payout: splitPayout,
            gameId: currentGameId,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          winningHistory.unshift(winnerInfo);
          const currentBal = userWallets.get(w.userId) || 0;
          const newBal = currentBal + splitPayout;
          userWallets.set(w.userId, newBal);
          
          const sId = socketMapping.get(w.userId);
          if (sId) io.to(sId).emit('wallet:update', newBal);
          io.emit('game:winner', winnerInfo);
        });

        saveWallets();
        if (winningHistory.length > 10) winningHistory.splice(10);
        io.emit('game:win_history', winningHistory);
      }
    }
  }

  if (isGameOver || currentBalls.length >= 75) {
    console.log("Game ending, scheduled reset in 20 seconds...");
    setTimeout(resetGame, 20000); // Give players 20 seconds to celebrate
    return; // Exit the loop
  }

  setTimeout(runGameLoop, 5000);
};

const resetGame = () => {
  currentBalls = [];
  globalPool = 0;
  playerBoards.clear();
  isGameOver = false;
  currentGameId = `WB-${Math.floor(100000 + Math.random() * 900000)}`;
  io.emit('game:reset');
  broadcastPoolUpdate();
  runGameLoop(); // Restart the loop
};

// Start the first game
runGameLoop();

// Socket.io Logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  const { initData, user, userId: fallbackId } = socket.handshake.auth;
  let userId = fallbackId || `guest_${socket.id.substring(0, 4)}`;
  let isVerified = false;

  if (initData && verifyTelegramData(initData)) {
    userId = user?.id?.toString() || userId;
    isVerified = true;
    verifiedUsers.add(userId); // Mark user as verified if Telegram data is valid
    console.log(`Verified Telegram User: ${user?.first_name} (@${user?.username})`);
  } else {
    console.log(`Unverified connection using ID: ${userId}`);
    // For development/testing, you might want to auto-verify guests:
    // verifiedUsers.add(userId);
  }

  console.log(`Authenticated as: ${userId}`);
  socketMapping.set(userId, socket.id);

  // Initialize Wallet for new users (Default 1000 ETB)
  if (!userWallets.has(userId)) {
    userWallets.set(userId, 1000);
    saveWallets();
  }
  // Sync balance with client immediately
  socket.emit('wallet:update', userWallets.get(userId));
  
  activePlayers++;
  broadcastPoolUpdate();

  // Inform the user of their verification status
  socket.emit('user:status', { isVerified: verifiedUsers.has(userId) });

  // Send currently drawn balls to the newly connected user
  socket.emit('game:init', { balls: currentBalls, gameId: currentGameId });

  // Send the current winning history to the newly connected user
  socket.emit('game:win_history', winningHistory);

  // Handle Betting/Joining Pool
  socket.on('game:bet', (data: { stake: number; boardIds: number[] }) => {
    const currentBalance = userWallets.get(userId) || 0;

    // SECURITY: Ensure user is verified before accepting bets
    if (!verifiedUsers.has(userId)) {
      socket.emit('message', 'Please verify your account to place bets.');
      return;
    }

    // SECURITY: Validate data and balance
    if (typeof data.stake !== 'number' || !Array.isArray(data.boardIds) || data.stake <= 0) {
      console.log(`Blocked suspicious bet from ${userId}: ${data.stake}`);
      return;
    }
    
    if (currentBalance < data.stake) {
      socket.emit('message', 'Insufficient balance to place bet.');
      return;
    }

    // Deduct from wallet
    const newBalance = currentBalance - data.stake;
    userWallets.set(userId, newBalance);
    saveWallets();
    socket.emit('wallet:update', newBalance);

    playerBoards.set(userId, data.boardIds);
    globalPool += data.stake;
    console.log(`Bet received from ${userId}: ${data.stake} ETB. New Pool: ${globalPool}`);
    broadcastPoolUpdate();
  });

  // Example: Join a game room
  socket.on('room:join', (roomId: string) => {
    socket.join(roomId);
    console.log(`${userId} joined room: ${roomId}`);
    io.to(roomId).emit('message', `${userId} has joined the room.`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    socketMapping.delete(userId);
    activePlayers = Math.max(0, activePlayers - 1);
    broadcastPoolUpdate();
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.TELEGRAM_BOT_TOKEN) console.warn("WARNING: TELEGRAM_BOT_TOKEN is not set!");
    if (!process.env.FRONTEND_URL) console.warn("WARNING: FRONTEND_URL is not set! CORS might block connections.");
    console.log(`CORS allowed origin: ${process.env.FRONTEND_URL}`);
  }
});