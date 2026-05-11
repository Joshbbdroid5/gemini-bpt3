import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import { generateBoard, checkWin } from './src/logic';
import fs from 'fs';
import { bot } from './admin-bot';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose, { Error as MongooseError } from 'mongoose';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(app);

// Configure CORS for Socket.io
let io: SocketIOServer; // Declare io here, initialize after DB connection

const allowedOrigins = process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, ""))
  : ["http://localhost:5173", "http://127.0.0.1:5173"];

const corsOptions = {
  cors: {
    // CRITICAL: Prevent other sites from connecting to your socket
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
};

app.use(cors(corsOptions.cors)); // Match REST API CORS policy to Socket.io
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo';

// Debugging: Check for essential environment variables
if (!ADMIN_SECRET) {
  console.error('❌ CRITICAL: ADMIN_SECRET is not set in environment variables!');
}

// MongoDB Connection
if (process.env.NODE_ENV === 'production' && MONGODB_URI.includes('localhost')) {
  console.warn('WARNING: MONGODB_URI is pointing to localhost in production. Ensure your environment variables are set on Render.');
}

console.log('Attempting to connect to MongoDB...');
const dbPromise = mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging
})
  .then((conn) => {
    console.log(`✅ Connected to MongoDB: ${conn.connection.host}`);
    console.log(`📂 Database Name: ${conn.connection.name}`);
    return conn;
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error Details:');
    if (err.message.includes('auth')) {
      console.error('👉 TIP: Authentication failed. Check your password in MONGODB_URI. (URL-encode special characters like @ to %40)');
    }
    if (err.message.includes('port number') && MONGODB_URI.startsWith('mongodb+srv')) {
      console.error('👉 TIP: SRV connection strings (mongodb+srv://) must not include a port number. Remove ":27017" or any other port from your URI string in Render.');
    }
    console.error(`Error Message: ${err.message}`);
    throw err; // Re-throw to prevent further initialization
  });

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

// PendingDeposit Schema for tracking manual payments
interface IPendingDeposit {
  userId: string;
  amount: number;
  telebirrSms: string;
  timestamp: Date;
}
const pendingDepositSchema = new mongoose.Schema<IPendingDeposit>({
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  telebirrSms: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const PendingDeposit = mongoose.model<IPendingDeposit>('PendingDeposit', pendingDepositSchema);

// User Schema
interface IUser {
  userId: string;
  balance: number;
  isVerified: boolean;
  referredBy?: string;
  phone?: string;
}
const userSchema = new mongoose.Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 1000 },
  isVerified: { type: Boolean, default: false },
  referredBy: { type: String },
  phone: { type: String }
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
  try {
    const users = await User.find({}).lean(); // lean() makes queries much faster for read-only sync
    users.forEach(u => userWallets.set(u.userId, u.balance));
    console.log(`Wallet cache synced: ${users.length} users loaded.`);

    // Sync Global Stats
       const stats = await GlobalStats.findOne({ key: 'main_stats' }).lean();
    if (stats) {
      totalVolume = stats.totalVolume;
      totalProfit = stats.totalProfit;
    } else await GlobalStats.create({ key: 'main_stats', totalVolume: 0, totalProfit: 0 }); // Ensure stats exist
  } catch (err) {
    console.error('Failed to sync cache from MongoDB:', err);
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
// Render may hit /health without any API routes being mounted yet; also avoid crashing if io isn't ready.
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const clientsCount = io ? io.engine.clientsCount : 0;
  res.json({
    status: 'ok',
    database: dbStatus,
    clients: clientsCount,
    uptime: process.uptime()
  });
});

// ADMIN ENDPOINT: Create or update user record (used for referrals)
app.post('/admin/create-user', async (req, res) => {
  const { userId, referredBy, secret } = req.body;

  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const user = await User.findOneAndUpdate(
      { userId },
      { referredBy },
      { upsert: true, new: true }
    );
    res.json({ success: true, user });
  } catch (err) {
    console.error("User Creation Error:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN ENDPOINT: Register a pending deposit
app.post('/admin/add-pending-deposit', async (req, res) => {
  const { userId, amount, telebirrSms, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await PendingDeposit.create({ userId, amount, telebirrSms });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save pending deposit' });
  }
});

// ADMIN ENDPOINT: List all pending deposits
app.get('/admin/pending-deposits', async (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const pending = await PendingDeposit.find().sort({ timestamp: -1 });
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending deposits' });
  }
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

    // REFERRAL LOGIC: Reward the inviter with 5% of the deposit
    if (user?.referredBy) {
      const bonus = amount * 0.05;
      const referrer = await User.findOneAndUpdate(
        { userId: user.referredBy },
        { $inc: { balance: bonus } },
        { new: true }
      );
    }

    // Remove from pending list upon approval
    await PendingDeposit.findOneAndDelete({ userId, amount });

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
    console.error("Wallet Update Error:", err); // Log the real error
    if (err instanceof MongooseError) {
      return res.status(400).json({ error: 'Database operation failed', details: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN ENDPOINT: Reject a deposit (cleanup)
app.post('/admin/reject-deposit', async (req, res) => {
  const { userId, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await PendingDeposit.findOneAndDelete({ userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject' });
  }
});

// ADMIN ENDPOINT: Mark user as verified (called by bot)
app.post('/admin/verify-user', async (req, res) => {
  const { userId, phone, secret } = req.body;

  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("Database not connected");
    }

    const existingUser = await User.findOne({ userId });
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

    res.json({ success: true, isNewUser: !existingUser?.phone });
  } catch (err) {
    console.error("Verification Route Error:", err); // Log the real error
    res.status(500).json({ error: 'Internal server error', details: err instanceof Error ? err.message : String(err) });
  }
});

// ADMIN ENDPOINT: Fetch specific user details for the bot profile
app.get('/admin/user-info', async (req, res) => {
  const { userId, secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const user = await User.findOne({ userId: userId as string });
    if (!user) {
      return res.json({ balance: 0, isVerified: false });
    }
    res.json({ balance: user.balance, isVerified: user.isVerified });
  } catch (err) {
    console.error("User Info Fetch Error:", err);
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
    stats: { totalVolume, totalProfit, activeBets: Array.from(roomStates.values()).reduce((a, b) => a + b.globalPool, 0), isMaintenanceMode }
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
    console.log("Maintenance mode deactivated. Resuming game loops for all rooms...");
    STAKES.forEach(stake => {
      const room = roomStates.get(stake);
      if (room && room.gameLoopTimeout) {
        clearTimeout(room.gameLoopTimeout);
      }
      runGameLoop(stake);
    });
  }

  res.json({ success: true, isMaintenanceMode });
});

// Global Game State
let totalVolume = 0;
let totalProfit = 0;
let isMaintenanceMode = false;
let isGameRunning = false;
let activePlayers = 0;

interface RoomState {
  stake: number;
  currentBalls: number[];
  globalPool: number;
  isGameOver: boolean;
  currentGameId: string;
  winningHistory: any[];
  playerBoards: Map<string, number[]>; // userId -> boardIds
  gameLoopTimeout?: any;
}

const roomStates = new Map<number, RoomState>();
const STAKES = [10];

function generateGameId(stake: number) {
  return `LB-${stake}-${Math.floor(100000 + Math.random() * 900000)}`;
}

STAKES.forEach(stake => {
  roomStates.set(stake, {
    stake,
    currentBalls: [],
    globalPool: 0,
    isGameOver: false,
    currentGameId: generateGameId(stake),
    winningHistory: [],
    playerBoards: new Map(),
  });
});

const socketMapping = new Map<string, string>(); // userId -> socketId

// Pre-generate and cache all 600 boards to ensure they are static and highly performant
const boardsCache = new Map<number, any>();
for (let i = 1; i <= 600; i++) {
  boardsCache.set(i, generateBoard(i));
}

// Mock database for verified users (In production, use a real DB)
const verifiedUsers = new Set<string>(); 

// We use a slower interval (3s) which is already good for free tier CPU limits
// If you find the server lagging, you can increase this to 5s or 10s
const broadcastPoolUpdate = () => {
  const allRoomStats: Record<number, any> = {};
  STAKES.forEach(stake => {
    const room = roomStates.get(stake)!;
    allRoomStats[stake] = {
      pool: room.globalPool,
      players: room.playerBoards.size,
      gameId: room.currentGameId,
      isLive: room.currentBalls.length > 0 && !room.isGameOver
    };
  });

  io.emit('game:pool_sync', {
    rooms: allRoomStats,
    totalActive: activePlayers
  });
};

// Global interval for drawing balls
const runGameLoop = (stake: number) => {
  const room = roomStates.get(stake)!;

  if (!isGameRunning) {
    // Admin has stopped the game.
    return;
  }

  // Only suspend the loop if maintenance is enabled and we are NOT in the middle of an active round
  if (isMaintenanceMode && room.currentBalls.length === 0 && room.globalPool === 0 && !room.isGameOver) {
    console.log(`Game loop [${stake}] suspended: Maintenance Mode is active and system is idle.`);
    return;
  }

  if (room.currentBalls.length < 75 && !room.isGameOver) {
    const ball = Math.floor(Math.random() * 75) + 1;
    if (!room.currentBalls.includes(ball)) {
      room.currentBalls.push(ball);
      io.to(`room_${stake}`).emit('game:ball', ball);

      // AUTO-CLAIM CHECK: Collect all winners for this specific ball
      const winnersThisRound: any[] = [];
      
      room.playerBoards.forEach((boardIds, userId) => {
        for (const boardId of boardIds) {
          const grid = boardsCache.get(boardId);
          const win = checkWin(grid, new Set(room.currentBalls) as any);
          
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
        room.isGameOver = true;
        const totalPayout = room.globalPool * 0.8;
        const profitShare = (room.globalPool - totalPayout);
        
        totalProfit += profitShare;
        // Persist profit to DB
        GlobalStats.updateOne({ key: 'main_stats' }, { $inc: { totalProfit: profitShare } }, { upsert: true }).exec();

        const splitPayout = totalPayout / winnersThisRound.length;

        winnersThisRound.forEach(async (w) => {
          const winnerInfo = {
            ...w,
            payout: splitPayout,
            gameId: room.currentGameId,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          room.winningHistory.unshift(winnerInfo);
          
          const user = await User.findOneAndUpdate({ userId: w.userId }, { $inc: { balance: splitPayout } }, { new: true });
          if (user) userWallets.set(w.userId, user.balance);
          
          const sId = socketMapping.get(w.userId);
          if (sId && user) io.to(sId).emit('wallet:update', user.balance);
          io.to(`room_${stake}`).emit('game:winner', winnerInfo);
        });

        if (room.winningHistory.length > 10) room.winningHistory.splice(10);
        io.to(`room_${stake}`).emit('game:win_history', room.winningHistory);
      }
    }
  }

  if (room.isGameOver || room.currentBalls.length >= 75) {
    room.gameLoopTimeout = setTimeout(() => resetGame(stake), 20000); // Give players 20 seconds to celebrate
    return; // Exit the loop
  }

  room.gameLoopTimeout = setTimeout(() => runGameLoop(stake), 3000);
};

const resetGame = (stake: number) => {
  const room = roomStates.get(stake)!;
  room.currentBalls = [];
  room.globalPool = 0;
  room.playerBoards.clear();
  room.isGameOver = false;
  room.currentGameId = generateGameId(stake);
  io.to(`room_${stake}`).emit('game:reset');
  broadcastPoolUpdate();
  room.gameLoopTimeout = setTimeout(() => runGameLoop(stake), 0); // Start next game immediately
};

// Game starts only when admin explicitly starts it.

dbPromise.then(async () => {
  try {
    await syncCache(); // Ensure cache is synced after DB connection

    io = new SocketIOServer(server, corsOptions); // Initialize Socket.io after DB is ready
    registerSocketHandlers();

    // Wait for admin to START the game via /admin/start-game.
    // Game loops will not run until isGameRunning=true.
    STAKES.forEach(stake => {
      const room = roomStates.get(stake)!;
      // Ensure room is idle on startup.
      room.currentBalls = [];
      room.globalPool = 0;
      room.playerBoards.clear();
      room.isGameOver = false;
      room.currentGameId = generateGameId(stake);
    });

    await bot.launch();
    console.log("Telegram Bot initialized");
    
    const adminId = process.env.ADMIN_CHAT_ID;
    if (adminId) {
      bot.telegram.sendMessage(adminId, "🚀 *Bot Online*\nThe game server and admin bot have started successfully.", { parse_mode: 'Markdown' })
        .catch(e => console.error("Failed to send startup message to admin:", e.message));
    }
  } catch (err) {
    console.error("Failed to start application services:", err);
  }
}).catch(err => {
  console.error("Critical: Application failed to start due to MongoDB connection failure.");
});

// Socket.io Logic
function registerSocketHandlers() {
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
    let currentBalance = 0;
    let isUserVerified = false;
    if (!user) {
      const newUser = await User.create({ userId, balance: 1000, isVerified: initData && verifyTelegramData(initData) });
      currentBalance = newUser.balance;
      isUserVerified = newUser.isVerified;
    } else {
      // Update verification status if it changed
      if (initData && verifyTelegramData(initData) && !user.isVerified) {
        await User.updateOne({ userId }, { isVerified: true }); // Update DB if now verified
      }
      currentBalance = user.balance;
      isUserVerified = user.isVerified;
    }
    socket.emit('wallet:update', currentBalance);
    socket.emit('user:status', { isVerified: isUserVerified });
  }).catch(err => console.error(`Error fetching/creating user for socket ${socket.id}:`, err));
  
  activePlayers++;
  broadcastPoolUpdate();

  // Joining a specific room
  socket.on('room:join', (stake: number) => {
    if (!STAKES.includes(stake)) return;
    
    STAKES.forEach(s => socket.leave(`room_${s}`));
    socket.join(`room_${stake}`);
    
    const room = roomStates.get(stake)!;
    socket.emit('game:init', { balls: room.currentBalls, gameId: room.currentGameId });
    socket.emit('game:win_history', room.winningHistory);
  });

  // Handle Betting/Joining Pool
  socket.on('game:bet', async (data: { stake: number; boardIds: number[] }) => {
    if (!isGameRunning) {
      socket.emit('message', 'Game has not started yet. Please wait for admin to start.');
      return;
    }
    const roomStake = data.stake / data.boardIds.length;
    const room = roomStates.get(roomStake);

    if (!room) return socket.emit('message', 'Invalid stake room.');

    if (isMaintenanceMode) {
      socket.emit('message', 'The game is currently under maintenance. No new bets are being accepted.');
      return;
    }

    if (room.currentBalls.length > 0 || room.isGameOver) {
      socket.emit('message', 'A game is currently in progress. Please wait for the next round to place bets.');
      return;
    }

    const userRecord = await User.findOne({ userId });
    const currentBalance = userRecord?.balance || 0;

    // SECURITY: Ensure user is verified before accepting bets
    if (!userRecord?.isVerified) {
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
      socket.emit('wallet:update', user.balance);
    }

    room.playerBoards.set(userId, data.boardIds);
    room.globalPool += data.stake;
    totalVolume += data.stake;
    // Persist volume to DB
    GlobalStats.updateOne({ key: 'main_stats' }, { $inc: { totalVolume: data.stake } }, { upsert: true }).exec();

    console.log(`Bet received from ${userId}: ${data.stake} ETB in Room ${roomStake}`);
    socket.join(`room_${roomStake}`);
    broadcastPoolUpdate();
  });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      socketMapping.delete(userId);
      activePlayers = Math.max(0, activePlayers - 1);
      broadcastPoolUpdate();
    });
  });
}

// Serve static files from the Vite build directory
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

app.use(express.static(distPath));

// Handle SPA routing: serve index.html for any unknown routes
app.get('*', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error(`❌ Deployment Error: index.html not found at ${indexPath}`);
    res.status(404).send("Frontend build files not found. Please ensure 'npm run build' completed successfully.");
  }
});

// Handle Graceful Shutdown for Render
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    bot.stop('SIGTERM');
    mongoose.connection.close();
  });
});

const HOST = '0.0.0.0';
server.listen(Number(PORT), HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.TELEGRAM_BOT_TOKEN) console.warn("WARNING: TELEGRAM_BOT_TOKEN is not set!");
    if (!process.env.FRONTEND_URL) console.warn("WARNING: FRONTEND_URL is not set! CORS might block connections.");
    console.log(`Production Mode: Static files serving from /dist`);
    console.log(`CORS Allowed Origin: ${process.env.FRONTEND_URL}`);
  }
});