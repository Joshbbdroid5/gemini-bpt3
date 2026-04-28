import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import { generateBoard, checkWin } from './src/logic';
import fs from 'fs';
import mongoose, { Error as MongooseError } from 'mongoose';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.io
const io = new SocketIOServer(server, {
  cors: {
    // CRITICAL: Prevent other sites from connecting to your socket
    origin: process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, "")) // Support multiple origins
      : "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors()); // Enable CORS for Express routes as well
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo';

// MongoDB Connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// TopUpHistory Schema
interface ITopUpHistory {
  userId: string;
  amount: number;
  adminSecretUsed: string; // To log which admin secret was used
  timestamp: Date;
}
const topUpHistorySchema = new mongoose.Schema<ITopUpHistory>({
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  adminSecretUsed: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const TopUpHistory = mongoose.model<ITopUpHistory>('TopUpHistory', topUpHistorySchema);
// User Schema
interface IUser {
  userId: string;
  balance: number;
  isVerified: boolean;
}
const userSchema = new mongoose.Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 1000 },
  isVerified: { type: Boolean, default: false }
});
const User = mongoose.model<IUser>('User', userSchema);

// Global Stats Schema (To persist volume/profit on Render)
interface IGlobalStats {
  key: string;
  totalVolume: number;
  totalProfit: number;
}
const globalStatsSchema = new mongoose.Schema<IGlobalStats>({
  key: { type: String, default: 'main_stats', unique: true },
  totalVolume: { type: Number, default: 0 },
  totalProfit: { type: Number, default: 0 }
});
const GlobalStats = mongoose.model<IGlobalStats>('GlobalStats', globalStatsSchema);

// In-memory cache for high-frequency access (optional, but keep for compatibility)
const userWallets = new Map<string, number>();

// Sync memory cache with DB on startup
async function syncCache() {
  const users = await User.find({});
  users.forEach(u => userWallets.set(u.userId, u.balance));
  console.log('Wallet cache synced from DB');

  // Sync Global Stats
  const stats = await GlobalStats.findOne({ key: 'main_stats' });
  if (stats) {
    totalVolume = stats.totalVolume;
    totalProfit = stats.totalProfit;
  }
}

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

// Health check endpoint for Render monitoring
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    database: dbStatus,
    clients: io.engine.clientsCount,
    uptime: process.uptime()
  });
});

// ADMIN ENDPOINT: Manually update user wallet
// This is used by your bot/admin tool to add ETB after manual payment
app.post('/admin/update-wallet', async (req, res) => {
  const { userId, amount, secret } = req.body;

  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!userId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Invalid data' });
  }

  try {
    const user = await User.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { upsert: true, new: true, runValidators: true }
    );
    
    if (user) userWallets.set(userId, user.balance);

    // Notify the user via Socket if they are currently connected
    const socketId = socketMapping.get(userId);
    if (socketId && user) {
      io.to(socketId).emit('wallet:update', user.balance);
    }

    // Log the top-up transaction
    await TopUpHistory.create({
      userId,
      amount,
      adminSecretUsed: secret,
      timestamp: new Date()
    });
    res.json({ success: true, newBalance: user?.balance });
  } catch (err) {
    if (err instanceof MongooseError) {
      return res.status(400).json({ error: 'Database operation failed', details: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN ENDPOINT: Mark user as verified (called by bot)
app.post('/admin/verify-user', async (req, res) => {
  const { userId, phone, secret } = req.body;

  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const user = await User.findOneAndUpdate(
      { userId },
      { isVerified: true, phone }, // Assuming you might want to add a phone field to User schema
      { upsert: true, new: true }
    );

    // Notify connected socket that they are now verified
    const socketId = socketMapping.get(userId);
    if (socketId) {
      io.to(socketId).emit('user:status', { isVerified: true });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN ENDPOINT: Check user status
app.get('/admin/check-user', async (req, res) => {
  const { userId, secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  const user = await User.findOne({ userId: userId as string });
  res.json({ 
    exists: !!user, 
    isVerified: user?.isVerified || false 
  });
});

// ADMIN ENDPOINT: Fetch all wallets
app.post('/admin/wallets', (req, res) => {
  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  res.json({
    wallets: Object.fromEntries(userWallets),
    stats: { totalVolume, totalProfit, activeBets: globalPool, isMaintenanceMode }
  });
});

// ADMIN ENDPOINT: Toggle Maintenance Mode
app.post('/admin/toggle-maintenance', (req, res) => {
  const { secret, enabled } = req.body;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const wasMaintenance = isMaintenanceMode;
  isMaintenanceMode = enabled;

  if (wasMaintenance && !isMaintenanceMode) {
    console.log("Maintenance mode deactivated. Resuming game loop...");
    clearTimeout(gameLoopTimeout);
    runGameLoop();
  }

  res.json({ success: true, isMaintenanceMode });
});

// Global Game State
let currentBalls: number[] = [];
let globalPool = 0;
let totalVolume = 0;
let totalProfit = 0;
let isMaintenanceMode = false;
let gameLoopTimeout: any;
let activePlayers = 0;
let currentGameId = `LB-${Math.floor(100000 + Math.random() * 900000)}`;
let winningHistory: any[] = [];
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
  // Only suspend the loop if maintenance is enabled and we are NOT in the middle of an active round
  if (isMaintenanceMode && currentBalls.length === 0 && globalPool === 0) {
    console.log("Game loop suspended: Maintenance Mode is active and system is idle.");
    return;
  }

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
        const profitShare = (globalPool - totalPayout);
        
        totalProfit += profitShare;
        // Persist profit to DB
        GlobalStats.updateOne({ key: 'main_stats' }, { $inc: { totalProfit: profitShare } }, { upsert: true }).exec();

        const splitPayout = totalPayout / winnersThisRound.length;

        winnersThisRound.forEach(async (w) => {
          const winnerInfo = {
            ...w,
            payout: splitPayout,
            gameId: currentGameId,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          winningHistory.unshift(winnerInfo);
          
          const user = await User.findOneAndUpdate({ userId: w.userId }, { $inc: { balance: splitPayout } }, { new: true });
          if (user) userWallets.set(w.userId, user.balance);
          
          const sId = socketMapping.get(w.userId);
          if (sId && user) io.to(sId).emit('wallet:update', user.balance);
          io.emit('game:winner', winnerInfo);
        });

        if (winningHistory.length > 10) winningHistory.splice(10);
        io.emit('game:win_history', winningHistory);
      }
    }
  }

  if (isGameOver || currentBalls.length >= 75) {
    console.log("Game ending, scheduled reset in 20 seconds...");
    gameLoopTimeout = setTimeout(resetGame, 20000); // Give players 20 seconds to celebrate
    return; // Exit the loop
  }

  gameLoopTimeout = setTimeout(runGameLoop, 5000);
};

const resetGame = () => {
  currentBalls = [];
  globalPool = 0;
  playerBoards.clear();
  isGameOver = false;
  currentGameId = `LB-${Math.floor(100000 + Math.random() * 900000)}`;
  io.emit('game:reset');
  broadcastPoolUpdate();
  runGameLoop(); // Restart the loop
};

// Start the first game
syncCache().then(() => {
  runGameLoop();
});

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

  // Fetch or Create User in DB
  User.findOne({ userId }).then(async (user: any) => {
    if (!user) {
      const newUser = await User.create({ userId, balance: 1000, isVerified });
      userWallets.set(userId, newUser.balance);
      socket.emit('wallet:update', newUser.balance);
    } else {
      // Update verification status if it changed
      if (isVerified && !user.isVerified) {
        await User.updateOne({ userId }, { isVerified: true });
      }
      userWallets.set(userId, user.balance);
      socket.emit('wallet:update', user.balance);
    }
  });
  
  // Sync balance with client immediately
  
  activePlayers++;
  broadcastPoolUpdate();

  // Inform the user of their verification status
  socket.emit('user:status', { isVerified: verifiedUsers.has(userId) });

  // Send currently drawn balls to the newly connected user
  socket.emit('game:init', { balls: currentBalls, gameId: currentGameId });

  // Send the current winning history to the newly connected user
  socket.emit('game:win_history', winningHistory);

  // Handle Betting/Joining Pool
  socket.on('game:bet', async (data: { stake: number; boardIds: number[] }) => {
    if (isMaintenanceMode) {
      socket.emit('message', 'The game is currently under maintenance. No new bets are being accepted.');
      return;
    }

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
    const user = await User.findOneAndUpdate({ userId }, { $inc: { balance: -data.stake } }, { new: true });
    if (user) {
      userWallets.set(userId, user.balance);
      socket.emit('wallet:update', user.balance);
    }

    playerBoards.set(userId, data.boardIds);
    globalPool += data.stake;
    totalVolume += data.stake;
    // Persist volume to DB
    GlobalStats.updateOne({ key: 'main_stats' }, { $inc: { totalVolume: data.stake } }, { upsert: true }).exec();

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

// Handle Graceful Shutdown for Render
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    mongoose.connection.close();
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