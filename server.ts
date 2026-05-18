import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import { generateBoard, checkWin } from './src/logic';
import fs from 'fs';
import { mainBot, notifyUser } from './main-bot';
import { adminBot } from './admin-bot';
import { Markup } from 'telegraf';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose, { Error as MongooseError } from 'mongoose';

dotenv.config();

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID?.trim();
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

// PendingWithdrawal Schema
interface IPendingWithdrawal {
  userId: string;
  amount: number;
  timestamp: Date;
}
const pendingWithdrawalSchema = new mongoose.Schema<IPendingWithdrawal>({
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});
const PendingWithdrawal = mongoose.model<IPendingWithdrawal>('PendingWithdrawal', pendingWithdrawalSchema);

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

// Archive Schema for Auditing
const gameArchiveSchema = new mongoose.Schema({
  gameId: String,
  winnerId: String,
  winnerBoardId: Number,
  prizePool: Number,
  houseRake: Number,
  ballsDrawn: [Number],
  timestamp: { type: Date, default: Date.now }
});
const GameArchive = mongoose.model('GameArchive', gameArchiveSchema);

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
      { $set: { referredBy } },
      { upsert: true, new: true }
    );
    if (ADMIN_CHAT_ID) {
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, `👤 <b>New User Created:</b> <code>${userId}</code>${referredBy ? ` (Referred by: ${referredBy})` : ''}`, { parse_mode: 'HTML' }).catch(console.error);
    }
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
    
    // Use adminBot to notify admin of the request
    if (ADMIN_CHAT_ID) {
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, 
        `🚨 <b>NEW TOP-UP REQUEST</b>\n\n👤 <b>User:</b> <code>${userId}</code>\n💰 <b>Amount:</b> ${amount} ETB\n🧾 <b>SMS:</b>\n${telebirrSms}`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Approve', `approve_${amount}_${userId}`), Markup.button.callback('❌ Reject', `reject_${userId}`)],
          ])
        }
      );
    }
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

// ADMIN ENDPOINT: List all pending withdrawals
app.get('/admin/pending-withdrawals', async (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const pending = await PendingWithdrawal.find().sort({ timestamp: -1 });
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending withdrawals' });
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

    // Notify User and Admin
    await Promise.all([
      notifyUser(userId, `🎊 <b>Payment Approved!</b>\nYour balance has been updated with <b>${amount} ETB</b>. Good luck!`),
      ADMIN_CHAT_ID ? adminBot.telegram.sendMessage(ADMIN_CHAT_ID, `✅ <b>Approval Log:</b> User <code>${userId}</code> credited with ${amount} ETB.`, { parse_mode: 'HTML' }) : Promise.resolve()
    ]).catch(console.error);

    res.json({ success: true, newBalance: user?.balance });
  } catch (err) {
    console.error("Wallet Update Error:", err); // Log the real error
    if (err instanceof MongooseError) {
      return res.status(400).json({ error: 'Database operation failed', details: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ADMIN ENDPOINT: Request a withdrawal
app.post('/admin/withdraw-request', async (req, res) => {
  const { userId, amount, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    // Deduct immediately to prevent double spending
    user.balance -= amount;
    await user.save();
    
    // Update cache and sync sockets
    userWallets.set(userId, user.balance);
    const socketId = socketMapping.get(userId);
    if (socketId) io.to(socketId).emit('wallet:update', user.balance);

    // Persist withdrawal request
    await PendingWithdrawal.create({ userId, amount });

    if (ADMIN_CHAT_ID) {
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, 
        `💸 <b>NEW WITHDRAWAL REQUEST</b>\n\n👤 <b>User:</b> <code>${userId}</code>\n💰 <b>Amount:</b> ${amount} ETB\n📱 <b>Phone:</b> <code>${user.phone || 'N/A'}</code>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Paid', `w_paid_${amount}_${userId}`), Markup.button.callback('❌ Reject & Refund', `w_ref_${amount}_${userId}`)],
          ])
        }
      ).catch(e => console.error("Admin notify error:", e));
    }
    res.json({ success: true, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// ADMIN ENDPOINT: Refund a withdrawal
app.post('/admin/refund-withdrawal', async (req, res) => {
  const { userId, amount, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    // Remove from pending
    await PendingWithdrawal.findOneAndDelete({ userId, amount });

    const user = await User.findOneAndUpdate({ userId }, { $inc: { balance: amount } }, { new: true });
    if (user) {
      userWallets.set(userId, user.balance);
      const socketId = socketMapping.get(userId);
      if (socketId) io.to(socketId).emit('wallet:update', user.balance);
      await notifyUser(userId, `❌ <b>Withdrawal Rejected</b>\nYour request for ${amount} ETB was rejected. The amount has been refunded to your wallet.`);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// ADMIN ENDPOINT: Mark withdrawal as paid
app.post('/admin/complete-withdrawal', async (req, res) => {
  const { userId, amount, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    // Remove from pending
    await PendingWithdrawal.findOneAndDelete({ userId, amount });

    await notifyUser(userId, `💸 <b>Withdrawal Processed</b>\nYour withdrawal for ${amount} ETB has been paid! Please check your Telebirr account.`);
    if (ADMIN_CHAT_ID) {
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, `💰 <b>Withdrawal Log:</b> Marked ${amount} ETB as paid to user <code>${userId}</code>.`, { parse_mode: 'HTML' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// ADMIN ENDPOINT: Reject a deposit (cleanup)
app.post('/admin/reject-deposit', async (req, res) => {
  const { userId, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await PendingDeposit.findOneAndDelete({ userId });
    
    // Notify User and Admin
    await notifyUser(userId, `❌ <b>Deposit Rejected</b>\nYour recent top-up request could not be verified. If you believe this is a mistake, please contact support.`);
    if (ADMIN_CHAT_ID) {
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, `❌ <b>Rejection Log:</b> Rejected top-up for <code>${userId}</code>.`, { parse_mode: 'HTML' });
    }
    
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
      io.to(socketId).emit('user:status', { isVerified: true, phone });
    }

    if (ADMIN_CHAT_ID) {
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, `📱 <b>User Registered:</b> <code>${userId}</code> has verified phone: <code>${phone}</code>`, { parse_mode: 'HTML' }).catch(console.error);
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
    stats: { totalVolume, totalProfit, activeBets: Array.from(roomStates.values()).reduce((a, b) => a + b.globalPool, 0), isMaintenanceMode, isGameRunning, stopRequested, isEngineActive: isGameRunning && !stopRequested }
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

// ADMIN ENDPOINT: Explicitly start the game cycle
app.post('/admin/start-game', (req, res) => {
  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  const alreadyRunning = isGameRunning && !stopRequested;
  if (alreadyRunning) return res.json({ success: true, message: "Game already running" });
  
  isGameRunning = true;
  stopRequested = false;
  console.log("🚀 Admin started the game engine.");
  
  STAKES.forEach(stake => {
    const room = roomStates.get(stake)!;
    // Clear existing timer if any to avoid double triggers
    if (room.selectionTimer) clearTimeout(room.selectionTimer);
    startSelectionPhase(stake);
  });
  broadcastPoolUpdate();

  res.json({ success: true, isGameRunning });
});

// ADMIN ENDPOINT: Gracefully stop the game engine
app.post('/admin/stop-game', (req, res) => {
  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  if (!isGameRunning) return res.json({ success: true, isGameRunning, message: "Engine already idle" });

  const hasLiveGames = Array.from(roomStates.values()).some(r => r.state === 'GAME');
  
  if (!hasLiveGames) {
    // Stop immediately if no rounds are in progress
    isGameRunning = false;
    stopRequested = false;
    roomStates.forEach(room => {
      if (room.selectionTimer) {
        clearTimeout(room.selectionTimer);
        room.selectionTimer = undefined;
      }
    });
    console.log("🛑 Admin stopped the game engine immediately.");
    broadcastPoolUpdate();
    const stopMsg = "Games are over for today. Please come back tomorrow to play!";
    io.emit('game:stopped', stopMsg);
    return res.json({ success: true, isGameRunning, message: stopMsg });
  } else {
    // Set flag to stop after current rounds finish
    stopRequested = true;
    console.log("🛑 Graceful stop requested. Waiting for rounds to finish.");
    broadcastPoolUpdate();
    return res.json({ success: true, isGameRunning, stopRequested, message: "Stop requested. Waiting for live rounds to finish." });
  }
});

// Global Game State
let totalVolume = 0;
let totalProfit = 0;
let isMaintenanceMode = false;
let isGameRunning = false;
let stopRequested = false;
let activePlayers = 0;

type GameState = 'SELECTION' | 'GAME' | 'FINISHED';

interface RoomState {
  stake: number;
  currentBalls: number[];
  shuffledBalls: number[];
  globalPool: number;
  state: GameState;
  currentGameId: string;
  selectionTimer?: NodeJS.Timeout;
  selectionStartTime?: number; // Timestamp when selection phase started
  selectionDuration?: number; // Total duration of selection phase in ms
  playerBoards: Map<string, number[]>; // userId -> boardIds
  boardStatus: Map<number, string>; // boardId -> userId (concurrency control)
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
    shuffledBalls: [],
    globalPool: 0,
    state: 'SELECTION',
    currentGameId: generateGameId(stake),
    playerBoards: new Map(),
    boardStatus: new Map(),
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
  const engineActive = isGameRunning && !stopRequested;
  
  STAKES.forEach(stake => {
    const room = roomStates.get(stake)!;
    allRoomStats[stake] = {
      pool: room.globalPool * 0.6, // Dynamic prize calculation: 60% of current pool
      players: room.playerBoards.size,
      gameId: room.currentGameId,
      state: room.state,
      isLive: room.state === 'GAME',
      isEngineActive: engineActive
    };
  });

  io.emit('game:pool_sync', {
    rooms: allRoomStats,
    totalActive: activePlayers,
    isEngineActive: engineActive
  });
};

function shuffle(array: number[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Global interval for drawing balls
const runGameLoop = (stake: number) => {
  const room = roomStates.get(stake)!;

  if (!isGameRunning || room.state !== 'GAME') return;

  if (room.currentBalls.length < room.shuffledBalls.length) {
    const ball = room.shuffledBalls[room.currentBalls.length];
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
        room.state = 'FINISHED';
        const totalPayout = room.globalPool * 0.6; // 60% to players
        const houseShare = room.globalPool * 0.4; // 40% to house
        
        totalProfit += houseShare;
        GlobalStats.updateOne({ key: 'main_stats' }, { $inc: { totalProfit: houseShare } }, { upsert: true }).exec();

        const splitPayout = totalPayout / winnersThisRound.length;

        winnersThisRound.forEach(async (w) => {
          const winnerInfo = {
            ...w,
            payout: splitPayout,
            gameId: room.currentGameId,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          const user = await User.findOneAndUpdate({ userId: w.userId }, { $inc: { balance: splitPayout } }, { new: true });
          const sId = socketMapping.get(w.userId);
          if (sId && user) io.to(sId).emit('wallet:update', user.balance);
          io.to(`room_${stake}`).emit('game:winner', winnerInfo);

          // Archive for auditing
          await GameArchive.create({
            gameId: room.currentGameId,
            winnerId: w.userId,
            winnerBoardId: w.boardId,
            prizePool: totalPayout,
            houseRake: houseShare,
            ballsDrawn: room.currentBalls
          });
        });
      }
    }

  if (room.state === 'FINISHED' || room.currentBalls.length >= 75) {
    // 3-second winner declaration window as requested for the rapid-fire loop
    room.gameLoopTimeout = setTimeout(() => resetGame(stake), 3000);
    return; // Exit the loop
  }

  room.gameLoopTimeout = setTimeout(() => runGameLoop(stake), 3000);
};

const startSelectionPhase = (stake: number) => {
  if (stopRequested) {
    console.log(`🚫 Prevented selection phase for stake ${stake} (stop requested).`);
    return;
  }
  const room = roomStates.get(stake)!;
  const SELECTION_PHASE_DURATION_MS = 40000; // 40 seconds
  room.state = 'SELECTION';
  room.selectionStartTime = Date.now();
  room.selectionDuration = SELECTION_PHASE_DURATION_MS;
  broadcastPoolUpdate();
  
  // Start 40s "Quick Pick" window to finalize Total Players for this round
  room.selectionTimer = setTimeout(() => { // Store the timer reference
    room.state = 'GAME';
    room.shuffledBalls = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
    broadcastPoolUpdate();
    runGameLoop(stake);
  }, 40000);
};

const resetGame = (stake: number) => {
  const room = roomStates.get(stake)!;
  room.currentBalls = [];
  room.shuffledBalls = [];
  room.globalPool = 0;
  room.playerBoards.clear();
  room.boardStatus.clear();
  room.currentGameId = generateGameId(stake);
  io.to(`room_${stake}`).emit('game:reset');
  
  // Check if a stop was requested and no other rooms are still in a game
  if (stopRequested) {
    const hasLiveGames = Array.from(roomStates.values()).some(r => r.state === 'GAME');
    if (!hasLiveGames) {
      isGameRunning = false;
      stopRequested = false;
      console.log("🛑 Game engine stopped gracefully after round completion.");
      broadcastPoolUpdate();
      io.emit('game:stopped', 'Games are over for today. Please come back tomorrow to play!');
      return;
    }
  }

  startSelectionPhase(stake);
  broadcastPoolUpdate();
};

// Game starts only when admin explicitly starts it.

// Per-round winning payout modal timing etc will be addressed in later steps.

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
      room.shuffledBalls = [];
      room.globalPool = 0;
      room.playerBoards.clear();
      room.boardStatus.clear();
      room.state = 'SELECTION';
      room.currentGameId = generateGameId(stake);
    });

    await Promise.all([
      mainBot.launch(),
      adminBot.launch()
    ]);
    console.log("✅ User and Admin Bots initialized");
    
    const adminId = process.env.ADMIN_CHAT_ID;
    if (adminId) {
      adminBot.telegram.sendMessage(adminId, "🚀 <b>Bots Online</b>\nThe game server and both bots have started successfully.", { parse_mode: 'HTML' })
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
    socket.emit('user:status', { isVerified: isUserVerified, phone: user?.phone });
  }).catch(err => console.error(`Error fetching/creating user for socket ${socket.id}:`, err));
  
  activePlayers++;
  broadcastPoolUpdate();

  // Joining a specific room
  socket.on('room:join', async (stake: number) => {
    if (!STAKES.includes(stake)) return;
    
    STAKES.forEach(s => socket.leave(`room_${s}`));
    socket.join(`room_${stake}`);
    
    const room = roomStates.get(stake)!;

    socket.emit('game:init', {
      balls: room.currentBalls,
      gameId: room.currentGameId,
      selectionTimeLeft: room.selectionStartTime && room.selectionDuration
        ? Math.max(0, Math.ceil((room.selectionStartTime + room.selectionDuration - Date.now()) / 1000))
        : 0,
      takenBoards: Array.from(room.boardStatus.keys())
    });
  });


  // Concurrency-Controlled Board Selection
  socket.on('game:pick_board', async (data: { boardId: number; stake: number }) => {
    const room = roomStates.get(data.stake);
    if (!room || room.state !== 'SELECTION') return;

    const boardId = data.boardId;
    const stakeAmount = data.stake;

    const userRecord = await User.findOne({ userId });
    if (!userRecord) return;

    const currentSelected = room.playerBoards.get(userId) || [];
    const isSwapping = currentSelected.length > 0 && !currentSelected.includes(boardId);
    const isDeselecting = currentSelected.includes(boardId);
    const isFirstSelection = currentSelected.length === 0;

    // Check if taken by someone else
    const existingOwner = room.boardStatus.get(data.boardId);
    if (existingOwner && existingOwner !== userId) {
      return socket.emit('message', 'Board already taken, please choose another.');
    }

    if (isDeselecting) {
      // Refund logic
      userRecord.balance += stakeAmount;
      await userRecord.save();
      room.boardStatus.delete(boardId);
      room.playerBoards.set(userId, []);
      room.globalPool -= stakeAmount;
      socket.emit('wallet:update', userRecord.balance);
    } else if (isSwapping) {
      // Swap logic: Make previous available, take new one
      const oldId = currentSelected[0];
      room.boardStatus.delete(oldId);
      room.boardStatus.set(boardId, userId);
      room.playerBoards.set(userId, [boardId]);
    } else if (isFirstSelection) {
      // New Selection logic: Check balance and deduct
      if (userRecord.balance < stakeAmount) {
        return socket.emit('message', 'Insufficient balance.');
      }
      userRecord.balance -= stakeAmount;
      await userRecord.save();
      room.boardStatus.set(boardId, userId);
      room.playerBoards.set(userId, [boardId]);
      room.globalPool += stakeAmount;
      totalVolume += stakeAmount;
      GlobalStats.updateOne({ key: 'main_stats' }, { $inc: { totalVolume: stakeAmount } }, { upsert: true }).exec();
      socket.emit('wallet:update', userRecord.balance);
    }
    
    io.to(`room_${data.stake}`).emit('game:board_sync', {
      takenBoards: Array.from(room.boardStatus.keys())
    });
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
    mainBot.stop('SIGTERM'); // Stop main bot
    adminBot.stop('SIGTERM'); // Stop admin bot
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