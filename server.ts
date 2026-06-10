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
import { socketEvents } from './src/components/socket'; // Import socketEvents
import mongoose, { Error as MongooseError } from 'mongoose';
import logger from './src/logger';
import client from 'prom-client';
import { metrics, Counter, ObservableGauge } from '@opentelemetry/api';
import { 
  GameState, 
  RoomStats, 
  PoolUpdateData, 
  HistoryEntry, 
  PickBoardResult, 
  SINGLE_STAKE 
} from './src/types';

dotenv.config();

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID?.trim();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(app);

// Prometheus Monitoring Setup
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2]
});
register.registerMetric(httpRequestDurationMicroseconds);

// Configure CORS for Socket.io
let io: SocketIOServer; // Declare io here, initialize after DB connection

const allowedOrigins = process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, ""))
  : ["http://localhost:5173", "http://127.0.0.1:5173"];

const corsConfig = {
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true
};

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDurationMicroseconds.observe(
      { method: req.method, route: req.route?.path || req.path, code: res.statusCode },
      duration
    );
  });
  next();
});

app.use(cors(corsConfig)); // Match REST API CORS policy to Socket.io
app.use(express.json());

// Ensure PORT is strictly parsed as a decimal integer
const PORT = parseInt(process.env.PORT || '3001', 10);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo';

// Debugging: Check for essential environment variables
if (!ADMIN_SECRET) {
  logger.error('CRITICAL: ADMIN_SECRET is not set in environment variables!');
}

// MongoDB Connection
if (process.env.NODE_ENV === 'production' && MONGODB_URI.includes('localhost')) {
  logger.warn('MONGODB_URI is pointing to localhost in production. Ensure environment variables are set on Render.');
}

logger.info('Attempting to connect to MongoDB...');
const dbPromise = mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging
})
  .then((conn) => {
    logger.info(`Connected to MongoDB: ${conn.connection.host}`, { dbName: conn.connection.name });
    return conn;
  })
  .catch(err => {
    logger.error('MongoDB Connection Error Details', { error: err.message });
    if (err.message.includes('auth')) {
      logger.info('TIP: Authentication failed. Check your password in MONGODB_URI.');
    }
    if (err.message.includes('port number') && MONGODB_URI.startsWith('mongodb+srv')) {
      logger.info('TIP: SRV connection strings must not include a port number.');
    }
    throw err; // Re-throw to prevent further initialization
  });

// Global Game State Object to track server-wide status
const globalGameState = {
  totalVolume: 0,
  totalProfit: 0,
  isMaintenanceMode: false,
  isGameRunning: false,
  stopRequested: false,
  activePlayers: 0,
};

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

// ActivityLog Schema for tracking every movement
interface IActivityLog {
  userId: string;
  type: 'deposit' | 'withdrawal' | 'stake' | 'win' | 'adjustment';
  amount: number;
  gameId?: string;
  timestamp: Date;
}
const activityLogSchema = new mongoose.Schema<IActivityLog>({
  userId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  gameId: { type: String },
  timestamp: { type: Date, default: Date.now }
});
const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);

// User Schema
interface IUser {
  userId: string;
  username?: string;
  balance: number;
  isVerified: boolean;
  referredBy?: string;
  phone?: string;
  referredCount: number; // Added field
}
const userSchema = new mongoose.Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  username: { type: String },
  balance: { type: Number, default: 0 }, // Default to 0, awarded only upon verification
  isVerified: { type: Boolean, default: false },
  referredBy: { type: String },
  phone: { type: String, unique: true, sparse: true }, // Added unique: true and sparse: true
  referredCount: { type: Number, default: 0 }, // Added default value
});
const User = mongoose.model<IUser>('User', userSchema);

// RoomState Schema for persistence
interface IRoomState {
  currentBalls: number[];
  shuffledBalls: number[];
  globalPool: number;
  state: GameState;
  currentGameId: string;
  selectionStartTime?: number;
  selectionDuration?: number;
  playerBoards: Map<string, number[]>;
  boardStatus: Map<string, string>; // boardId string -> userId string
}

const roomStateSchema = new mongoose.Schema<IRoomState>({
  currentBalls: { type: [Number], default: [] },
  shuffledBalls: { type: [Number], default: [] },
  globalPool: { type: Number, default: 0 },
  state: { type: String, enum: Object.values(GameState), default: GameState.SELECTION },
  currentGameId: { type: String, required: true },
  selectionStartTime: { type: Number },
  selectionDuration: { type: Number },
  playerBoards: { type: Map, of: [Number], default: new Map() },
  boardStatus: { type: Map, of: String, default: new Map() },
});
const RoomStateModel = mongoose.model<IRoomState>('RoomState', roomStateSchema);

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

// Sync memory cache with DB on startup
async function syncCache() {
  try {
    const users = await User.find({}).lean(); // lean() makes queries much faster for read-only sync
    logger.info(`Database verification complete: ${users.length} users found.`);

    // Sync Global Stats
    const stats = await GlobalStats.findOne({ key: 'main_stats' }).lean();
    if (stats) {
      globalGameState.totalVolume = stats.totalVolume;
      globalGameState.totalProfit = stats.totalProfit;
    } else {
      await GlobalStats.create({ key: 'main_stats', totalVolume: 0, totalProfit: 0 }); // Ensure stats exist
    }

    // Ensure the single room state exists in DB and is loaded
    const roomDoc = await RoomStateModel.findOneAndUpdate(
      {},
      { $setOnInsert: { currentGameId: generateGameId(), state: GameState.SELECTION, globalPool: 0, currentBalls: [], shuffledBalls: [], playerBoards: new Map(), boardStatus: new Map() } },
      { upsert: true, new: true }
    );

    if (roomDoc) {
      singleRoomState = { 
        ...roomDoc.toObject(),
        playerBoards: new Map(roomDoc.playerBoards),
        boardStatus: new Map(roomDoc.boardStatus),
        winCache: new Map(), // Initialize winCache as an empty Map
      };
    }
  } catch (err) {
    logger.error('Failed to sync cache from MongoDB', { error: err });
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

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
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
      const displayId = user.username ? `${user.username}\n<i>ID: ${userId}</i>` : `<code>${userId}</code>`;
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, `👤 <b>New User Created:</b>\n${displayId}${referredBy ? `\n(Referred by: ${referredBy})` : ''}`, { parse_mode: 'HTML' }).catch(e => logger.error('Admin notify error', { error: e }));
    }
    res.json({ success: true, user });
  } catch (err) {
    logger.error("User Creation Error", { error: err, userId });
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
      const user = await User.findOne({ userId });
      const displayId = user?.username ? `${user.username}\n<i>ID: ${userId}</i>` : `<code>${userId}</code>`;

      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, 
        `🚨 <b>NEW TOP-UP REQUEST</b>\n\n👤 <b>User:</b>\n${displayId}\n💰 <b>Amount:</b> ${amount} ETB\n🧾 <b>SMS:</b>\n${telebirrSms}`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Approve', `approve_${amount}_${userId}`), Markup.button.callback('❌ Reject', `reject_${amount}_${userId}`)],
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
    const pending = await PendingDeposit.find().sort({ timestamp: -1 }).lean();
    const results = await Promise.all(pending.map(async (dep) => {
      const u = await User.findOne({ userId: dep.userId }).select('username').lean();
      return { ...dep, username: u?.username };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending deposits' });
  }
});

// ADMIN ENDPOINT: List all pending withdrawals
app.get('/admin/pending-withdrawals', async (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const pending = await PendingWithdrawal.find().sort({ timestamp: -1 }).lean();
    const results = await Promise.all(pending.map(async (w) => {
      const u = await User.findOne({ userId: w.userId }).select('username').lean();
      return { ...w, username: u?.username };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending withdrawals' });
  }
});

// ADMIN ENDPOINT: Manually update user wallet
// This is used by your bot/admin tool to add ETB after manual payment
app.post('/admin/update-wallet', async (req, res) => {
  const { userId, amount, secret, mode = 'adjust' } = req.body;

  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!userId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Invalid data' });
  }

  try {
    // Find the user to check current balance before applying the update
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (mode === 'set') {
      if (amount < 0) return res.status(400).json({ error: 'Balance cannot be negative.' });
    } else {
      // Prevent balance from going negative during adjustment
      if (amount < 0 && (user.balance + amount) < 0) {
        return res.status(400).json({ error: 'Cannot subtract, resulting balance would be negative.' });
      }
    }

    const updateOp = mode === 'set' ? { $set: { balance: amount } } : { $inc: { balance: amount } };
    const updatedUser = await User.findOneAndUpdate(
      { userId },
      updateOp,
      { new: true, runValidators: true } // `new: true` returns the updated document
    );

    if (!updatedUser) {
      return res.status(500).json({ error: 'Failed to update user balance.' });
    }
    // Remove from pending list upon approval
    await PendingDeposit.findOneAndDelete({ userId, amount });

    // Notify the user via Socket if they are currently connected
    const socketId = socketMapping.get(userId);
    if (socketId) {
      io.to(socketId).emit('wallet:update', updatedUser.balance);
    }

    // Log the top-up transaction
    await TopUpHistory.create({
      userId,
      amount,
      adminSecretUsed: secret,
      timestamp: new Date()
    });

    // Log to Activity System
    await ActivityLog.create({
      userId,
      type: mode === 'set' ? 'adjustment' : (amount > 0 ? 'deposit' : 'adjustment'),
      amount: Math.abs(amount)
    });

    // Notify User and Admin
    let notificationMessage = '';
    if (mode === 'set') {
      notificationMessage = `💳 <b>Balance Set!</b>\nYour balance has been set to <b>${amount} ETB</b>.`;
    } else {
      notificationMessage = amount > 0
        ? `🎊 <b>Payment Approved!</b>\nYour balance has been updated with <b>${amount} ETB</b>. Good luck!`
        : `💸 <b>Balance Adjusted!</b>\nYour balance has been adjusted by <b>${Math.abs(amount)} ETB</b>.`;
    }

    await Promise.all([
      notifyUser(userId, notificationMessage),
      ADMIN_CHAT_ID ? adminBot.telegram.sendMessage(ADMIN_CHAT_ID, `✅ <b>Admin Log:</b> User <code>${userId}</code> balance adjusted by ${amount} ETB. New balance: ${updatedUser.balance} ETB.`, { parse_mode: 'HTML' }) : Promise.resolve()
    ]).catch(e => logger.error('Approval notification failed', { error: e }));

    res.json({ success: true, newBalance: updatedUser.balance });
  } catch (err) {
    logger.error("Wallet Update Error", { error: err, userId, amount }); // Log the real error
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
    const socketId = socketMapping.get(userId);
    if (socketId) io.to(socketId).emit('wallet:update', user.balance);

    // Persist withdrawal request
    await PendingWithdrawal.create({ userId, amount });

    await ActivityLog.create({
      userId,
      type: 'withdrawal',
      amount
    });

    if (ADMIN_CHAT_ID) {
      const displayId = user.username ? `${user.username}\n<i>ID: ${userId}</i>` : `<code>${userId}</code>`;
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, 
        `💸 <b>NEW WITHDRAWAL REQUEST</b>\n\n👤 <b>User:</b>\n${displayId}\n💰 <b>Amount:</b> ${amount} ETB\n📱 <b>Phone:</b> <code>${user.phone || 'N/A'}</code>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Paid', `w_paid_${amount}_${userId}`), Markup.button.callback('❌ Reject & Refund', `w_ref_${amount}_${userId}`)],
          ])
        }
      ).catch(e => logger.error("Admin notify error", { error: e }));
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
  const { userId, amount, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await PendingDeposit.findOneAndDelete({ userId, amount });
    
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
    
    // Only award the initial registration bonus (1000 ETB) if the user is verifying for the first time
    const balanceUpdate = (!existingUser || !existingUser.isVerified) ? { balance: 1000 } : {};

    const user = await User.findOneAndUpdate(
      { userId },
      { 
        $set: { 
          isVerified: true, 
          phone,
          ...balanceUpdate 
        } 
      },
      { upsert: true, new: true }
    );

    // Notify connected socket that they are now verified
    const socketId = socketMapping.get(userId);
    if (socketId) {
      io.to(socketId).emit(socketEvents.USER_STATUS, { isVerified: true, phone });
      io.to(socketId).emit(socketEvents.WALLET_UPDATE, user.balance);
    }

    if (ADMIN_CHAT_ID) {
      const displayId = user.username ? `${user.username}\n<i>ID: ${userId}</i>` : `<code>${userId}</code>`;
      await adminBot.telegram.sendMessage(ADMIN_CHAT_ID, `📱 <b>User Registered:</b>\n${displayId}\nhas verified phone: <code>${phone}</code>`, { parse_mode: 'HTML' }).catch(e => logger.error('Admin registration notify error', { error: e }));
    }

    res.json({ success: true, isNewUser: !existingUser?.phone });
  } catch (err) {
    logger.error("Verification Route Error", { error: err, userId }); // Log the real error
    res.status(500).json({ error: 'Internal server error', details: err instanceof Error ? err.message : String(err) });
  }
});

// ADMIN ENDPOINT: Fetch specific user details for the bot profile
app.get('/admin/user-info', async (req, res) => {
  const { userId, secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const target = userId as string;
    // Search by ID or Username (with or without @ prefix)
    const user = await User.findOne({
      $or: [
        { userId: target },
        { username: { $in: [target, target.startsWith('@') ? target : `@${target}`] } }
      ]
    }).select('userId username balance referredCount').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userName = user.username || 'Anonymous';
    const responseBody = {
      userId: user.userId,
      balance: user.balance,
      username: userName,
      referredCount: user.referredCount,
    };
    res.json(responseBody);
  } catch (err) {
    logger.error("User Info Fetch Error", { error: err, userId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN ENDPOINT: Get referral leaderboard
app.get('/admin/referral-leaderboard', async (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const leaderboard = await User.aggregate([
      { $match: { referredBy: { $exists: true, $nin: [null, ""] } } },
      { $group: { _id: '$referredBy', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const enrichedLeaderboard = await Promise.all(leaderboard.map(async (entry) => {
      const user = await User.findOne({ userId: entry._id }).select('username userId').lean();
      return {
        userId: entry._id,
        username: user?.username || 'Anonymous',
        count: entry.count
      };
    }));

    res.json(enrichedLeaderboard);
  } catch (err) {
    logger.error("Leaderboard Fetch Error", { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// USER ENDPOINT: Fetch specific user's transaction log (deposits, withdrawals, adjustments)
app.get('/api/user-transactions', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  try {
    const logs = await ActivityLog.find({ 
      userId: userId as string,
      type: { $in: ['deposit', 'withdrawal', 'adjustment'] }
    })
    .sort({ timestamp: -1 })
    .limit(50)
    .lean();
    
    res.json(logs);
  } catch (err) {
    logger.error("User Transactions Fetch Error", { error: err, userId });
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ADMIN ENDPOINT: Get users referred by a specific user
app.get('/admin/referred-users', async (req, res) => {
  const { userId, secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const referredUsers = await User.find({ referredBy: userId as string })
      .select('userId username') // Select only necessary fields
      .lean();

    res.json(referredUsers);
  } catch (err) {
    logger.error("Referred Users Fetch Error", { error: err, userId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN ENDPOINT: Delete a user
app.post('/admin/delete-user', async (req, res) => {
  const { userId, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const deletedUser = await User.findOneAndDelete({ userId });
    if (!deletedUser) return res.status(404).json({ error: 'User not found' });

    const socketId = socketMapping.get(userId);
    if (socketId && io) {
      io.to(socketId).emit('game:stopped', 'Your account has been deleted by an administrator.');
      io.sockets.sockets.get(socketId)?.disconnect();
      socketMapping.delete(userId);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error("User Deletion Error", { error: err, userId });
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

// ADMIN ENDPOINT: Fetch user activity log
app.get('/admin/user-activity', async (req, res) => {
  const { userId, secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const logs = await ActivityLog.find({ userId: userId as string }).sort({ timestamp: -1 }).limit(50).lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ADMIN ENDPOINT: Fetch all wallets
app.post('/admin/wallets', async (req, res) => {
  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const allUsers = await User.find({}).lean();
  const walletData: Record<string, { balance: number; username?: string }> = {};
  allUsers.forEach(u => {
    walletData[u.userId] = { balance: u.balance, username: u.username };
  });

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 24h Summary: Stakes vs Payouts
  const summary24h = await ActivityLog.aggregate([
    { $match: { timestamp: { $gte: twentyFourHoursAgo }, type: { $in: ['stake', 'win'] } } },
    { $group: { _id: '$type', total: { $sum: '$amount' } } }
  ]);

  const stakes24h = summary24h.find(s => s._id === 'stake')?.total || 0;
  const payouts24h = summary24h.find(s => s._id === 'win')?.total || 0;

  // Global Deposits and Withdrawals (Recent 50)
  const recentActivity = await ActivityLog.find({ 
    type: { $in: ['deposit', 'withdrawal'] } 
  })
  .sort({ timestamp: -1 })
  .limit(50)
  .lean();

  // Group winners by Game ID to show distinct rounds
  const rounds = await GameArchive.aggregate([
    { $group: {
        _id: "$gameId",
        gameId: { $first: "$gameId" },
        date: { $first: "$timestamp" },
        pool: { $first: "$prizePool" },
        ballsDrawn: { $first: "$ballsDrawn" },
        players: { $sum: 1 }, // Note: This is winners count, real player count should be tracked in archive if needed
        winners: { $push: { boardId: "$winnerBoardId", payout: "$prizePool" } } 
    }},
    { $sort: { date: -1 } },
    { $limit: 30 }
  ]);
  // Fix payout display for aggregated winners
  rounds.forEach(r => r.winners.forEach((w: any) => w.payout = r.pool / r.winners.length));

  res.json({
    wallets: walletData,
    rounds,
    recentActivity,
    stats: { 
      totalVolume: globalGameState.totalVolume, 
      totalProfit: globalGameState.totalProfit, 
      activeBets: singleRoomState.globalPool, 
      totalUsers: allUsers.length,
      isMaintenanceMode: globalGameState.isMaintenanceMode, 
      isGameRunning: globalGameState.isGameRunning, 
      stopRequested: globalGameState.stopRequested, 
      isEngineActive: globalGameState.isGameRunning && !globalGameState.stopRequested,
      stakes24h,
      payouts24h
    }
  });
});

// ADMIN ENDPOINT: Toggle Maintenance Mode
app.post('/admin/toggle-maintenance', (req, res) => {
  const { secret, enabled } = req.body;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const wasMaintenance = globalGameState.isMaintenanceMode;
  globalGameState.isMaintenanceMode = enabled;

  if (wasMaintenance && !globalGameState.isMaintenanceMode) {
    logger.info("Maintenance mode deactivated. Resuming game loops.");
    if (singleRoomState.gameLoopTimeout) {
      clearTimeout(singleRoomState.gameLoopTimeout);
    }
    runGameLoop();
  }

  broadcastPoolUpdate();
  res.json({ success: true, isMaintenanceMode: globalGameState.isMaintenanceMode });
});

// ADMIN ENDPOINT: Explicitly start the game cycle
app.post('/admin/start-game', (req, res) => {
  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  const alreadyRunning = globalGameState.isGameRunning && !globalGameState.stopRequested;
  if (alreadyRunning) return res.json({ success: true, message: "Game already running" });
  
  globalGameState.isGameRunning = true;
  globalGameState.stopRequested = false;
  logger.info("ENGINE_STATE_CHANGE: Game engine START command received via Admin API.");

  if (singleRoomState.selectionTimer) clearTimeout(singleRoomState.selectionTimer);
  startSelectionPhase();
  broadcastPoolUpdate();

  res.json({ success: true, isGameRunning: globalGameState.isGameRunning });
});

// ADMIN ENDPOINT: Force-start the current selection round (skip countdown)
app.post('/admin/force-start-round', (req, res) => {
  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  if (!globalGameState.isGameRunning || globalGameState.stopRequested) {
    return res.status(400).json({ error: 'Game engine is not running' });
  }

  const started = forceStartSelectionRound();
  if (!started) {
    return res.status(400).json({ error: 'Round is not in selection phase' });
  }

  res.json({ success: true, message: 'Selection round force-started' });
});

// ADMIN ENDPOINT: Gracefully stop the game engine
app.post('/admin/stop-game', (req, res) => {
  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  if (!globalGameState.isGameRunning) return res.json({ success: true, isGameRunning: false, message: "Engine already idle" });

  const hasLiveGames = singleRoomState.state === GameState.GAME;

  if (!hasLiveGames) {
    // Stop immediately if no rounds are in progress
    globalGameState.isGameRunning = false;
    globalGameState.stopRequested = false;
    if (singleRoomState.selectionTimer) clearTimeout(singleRoomState.selectionTimer);
    logger.info("ENGINE_STATE_CHANGE: Game engine stopped IMMEDIATELY (no live rounds).");
    broadcastPoolUpdate();
    const stopMsg = "Games are over for today. Please come back tomorrow to play!";
    io.emit('game:stopped', stopMsg);
    return res.json({ success: true, isGameRunning: false, message: stopMsg });
  } else {
    // Set flag to stop after current rounds finish
    globalGameState.stopRequested = true;
    logger.info("ENGINE_STATE_CHANGE: Graceful STOP requested. Waiting for current rounds to finish.");
    broadcastPoolUpdate();
    return res.json({ success: true, isGameRunning: true, stopRequested: true, message: "Stop requested. Waiting for live rounds to finish." });
  }
});

// OpenTelemetry Business Metrics (meter version updated for clarity)
const meter = metrics.getMeter('bingo-business-logic', '1.0.0');

// Tracks the number of rooms currently in the LIVE (GAME) state
const activeGamesGauge = meter.createObservableGauge('bingo_active_games', {
  description: 'Number of games currently in the drawing phase',
});
activeGamesGauge.addCallback((result) => {
  const count = singleRoomState.state === GameState.GAME ? 1 : 0;
  result.observe(count);
});

// Tracks the total volume of ETB staked (lifetime of this process + DB sync)
const totalVolumeGauge = meter.createObservableGauge('bingo_total_volume_etb', {
  description: 'Total amount of ETB staked across all rounds',
});
totalVolumeGauge.addCallback((result) => {
  result.observe(globalGameState.totalVolume);
});

const jackpotWinsCounter = meter.createCounter('bingo_jackpot_wins_total', {
  description: 'Total number of winning boards declared',
});

interface RoomState {
  currentBalls: number[];
  shuffledBalls: number[];
  globalPool: number;
  state: GameState;
  currentGameId: string;
  selectionTimer?: NodeJS.Timeout;
  selectionInterval?: NodeJS.Timeout;
  selectionStartTime?: number; // Timestamp when selection phase started
  selectionDuration?: number; // Total duration of selection phase in ms
  playerBoards: Map<string, number[]>;
  boardStatus: Map<string, string>;
  winCache: Map<number, { isWinner: boolean; patterns: any[] }>;
  gameLoopTimeout?: NodeJS.Timeout;
  save?: () => Promise<any>;
  markModified?: (path: string) => void;
}
function generateGameId() {
  return `LB-${SINGLE_STAKE}-${Math.floor(100000 + Math.random() * 900000)}`;
}

// Single room state
let singleRoomState: RoomState = {
  currentBalls: [],
  shuffledBalls: [],
  globalPool: 0,
  state: GameState.SELECTION,
  currentGameId: generateGameId(),
  playerBoards: new Map(),
  boardStatus: new Map(),
  winCache: new Map(),
};

const socketMapping = new Map<string, string>(); // userId -> socketId

// Serialize board picks to prevent concurrent race conditions on the same board
let pickQueue: Promise<void> = Promise.resolve();
function enqueueBoardPick<T>(fn: () => Promise<T>): Promise<T> {
  const run = pickQueue.then(fn);
  pickQueue = run.then(() => undefined).catch(() => undefined);
  return run;
}

function getTakenBoardIds(): number[] {
  return Array.from(singleRoomState.boardStatus.keys()).map((id) => Number(id));
}

function getUserSelectedBoardIds(userId: string): number[] {
  return (singleRoomState.playerBoards.get(userId) || []).map(Number);
}

function buildPickFailure(
  userId: string,
  boardId: number,
  message: string
): PickBoardResult {
  return {
    success: false,
    boardId,
    message,
    selectedBoardIds: getUserSelectedBoardIds(userId),
    takenBoards: getTakenBoardIds(),
  };
}

async function getUserHistory(userId: string): Promise<HistoryEntry[]> {
  const logs = await ActivityLog.find({
    userId,
    type: { $in: ['stake', 'win'] },
    gameId: { $exists: true, $ne: null },
  })
    .sort({ timestamp: -1 })
    .limit(200)
    .lean();

  const byGame = new Map<string, { stakes: number; winAmount: number; latestAt: Date }>();
  for (const log of logs) {
    if (!log.gameId) continue;
    const existing = byGame.get(log.gameId) || { stakes: 0, winAmount: 0, latestAt: log.timestamp };
    if (log.type === 'stake') existing.stakes += 1;
    if (log.type === 'win') existing.winAmount = log.amount;
    if (log.timestamp > existing.latestAt) existing.latestAt = log.timestamp;
    byGame.set(log.gameId, existing);
  }

  // Collect all unique gameIds to query GameArchive once
  const uniqueGameIds = Array.from(byGame.keys());
  const gameArchives = await GameArchive.find({ gameId: { $in: uniqueGameIds } }).lean();
  const gameArchiveMap = new Map<string, any>();
  const winnerCounts = new Map<string, number>();

  gameArchives.forEach(archive => {
    gameArchiveMap.set(archive.gameId, archive);
    winnerCounts.set(archive.gameId, (winnerCounts.get(archive.gameId) || 0) + 1);
  });

  const entries: HistoryEntry[] = [];
  for (const [gameId, data] of byGame.entries()) {
    const archive = gameArchiveMap.get(gameId);
    const totalWinners = Math.max(winnerCounts.get(gameId) || 0, 1);
    const totalStaked = archive
      ? Math.round((archive.prizePool ?? 0) / 0.6)
      : data.stakes * SINGLE_STAKE; // Fallback if archive not found

    entries.push({
      gameId,
      date: new Date(data.latestAt).toLocaleDateString(),
      myBoardsCount: data.stakes,
      totalWinners,
      totalStaked, // This will be more accurate with the archive data
      payoutPerWinner: data.winAmount > 0 // If user won, this is their actual payout
        ? data.winAmount
        : archive
          ? (archive.prizePool ?? 0) / totalWinners //
          : 0,
      isMyWin: data.winAmount > 0,
    });
  }

  return entries.sort((a, b) => b.gameId.localeCompare(a.gameId));
}

async function refreshAllUserHistories() {
  await Promise.all(
    Array.from(socketMapping.entries()).map(async ([userId, socketId]) => {
      const history = await getUserHistory(userId);
      io.to(socketId).emit(socketEvents.WIN_HISTORY, history);
    })
  );
}

function getSelectionTimeLeftSeconds(): number {
  if (!singleRoomState.selectionStartTime || !singleRoomState.selectionDuration) return 0;
  return Math.max(
    0,
    Math.ceil(
      (singleRoomState.selectionStartTime + singleRoomState.selectionDuration - Date.now()) / 1000
    )
  );
}

async function emitJoinState(socket: import('socket.io').Socket, userId: string) {
  socket.emit(socketEvents.GAME_INIT, {
    balls: singleRoomState.currentBalls,
    gameId: singleRoomState.currentGameId,
    selectionTimeLeft: getSelectionTimeLeftSeconds(),
    takenBoards: getTakenBoardIds(),
    myBoardIds: getUserSelectedBoardIds(userId),
    pool: singleRoomState.globalPool * 0.6,
    players: singleRoomState.boardStatus.size,
  });

  const history = await getUserHistory(userId);
  socket.emit(socketEvents.WIN_HISTORY, history);
}

function forceStartSelectionRound(): boolean {
  if (singleRoomState.state !== GameState.SELECTION) return false;
  if (singleRoomState.selectionTimer) clearTimeout(singleRoomState.selectionTimer);
  singleRoomState.state = GameState.GAME;
  singleRoomState.shuffledBalls = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
  broadcastPoolUpdate();
  setTimeout(() => runGameLoop(), 2000);
  return true;
}

async function processBoardPick(userId: string, boardId: number): Promise<PickBoardResult> {
  if (singleRoomState.state !== GameState.SELECTION) {
    return buildPickFailure(userId, boardId, 'Selection phase has ended.');
  }

  // Fetch user record to get username and other non-balance related info if needed, but use atomic updates for balance.
  const userRecord = await User.findOne({ userId });
  if (!userRecord) {
    return buildPickFailure(userId, boardId, 'User account not found.');
  }

  if (typeof singleRoomState.playerBoards.get !== 'function') {
    singleRoomState.playerBoards = new Map(Object.entries(singleRoomState.playerBoards));
  }

  const boardKey = String(boardId);
  const currentSelected = getUserSelectedBoardIds(userId).map(String);
  const isDeselecting = currentSelected.includes(boardKey);
  const isSwapping = currentSelected.length > 0 && !currentSelected.includes(boardKey);
  const isFirstSelection = currentSelected.length === 0;

  const existingOwner = singleRoomState.boardStatus.get(boardKey);
  if (existingOwner && existingOwner !== userId) {
    return buildPickFailure(userId, boardId, 'Board already taken, please choose another.');
  }

  if (isDeselecting) {
    const updatedUser = await User.findOneAndUpdate(
      { userId },
      { $inc: { balance: SINGLE_STAKE } },
      { new: true }
    );
    if (!updatedUser) {
      return buildPickFailure(userId, boardId, 'Failed to refund balance. User not found.');
    }
    singleRoomState.boardStatus.delete(boardKey);
    singleRoomState.playerBoards.set(userId, []);
    singleRoomState.globalPool -= SINGLE_STAKE;
    // Emit wallet update
    const socketId = socketMapping.get(userId);
    if (socketId) {
      io.to(socketId).emit(socketEvents.WALLET_UPDATE, updatedUser.balance);
    }
  } else if (isSwapping) {
    const oldId = currentSelected[0];
    singleRoomState.boardStatus.delete(oldId);
    singleRoomState.boardStatus.set(boardKey, userId);
    singleRoomState.playerBoards.set(userId, [boardId]);
  } else if (isFirstSelection) {
    const updatedUser = await User.findOneAndUpdate(
      { userId, balance: { $gte: SINGLE_STAKE } }, // Ensure sufficient balance
      { $inc: { balance: -SINGLE_STAKE } },
      { new: true }
    );

    if (!updatedUser) {
      // This means either user not found (unlikely after initial check) or insufficient balance.
      // The $gte check handles insufficient balance atomically.
      return buildPickFailure(userId, boardId, 'Insufficient balance or user not found.');
    }

    singleRoomState.boardStatus.set(boardKey, userId);
    singleRoomState.playerBoards.set(userId, [boardId]);
    singleRoomState.globalPool += SINGLE_STAKE;
    globalGameState.totalVolume += SINGLE_STAKE;

    await ActivityLog.create({
      userId,
      type: 'stake',
      amount: SINGLE_STAKE,
      gameId: singleRoomState.currentGameId,
    });
    await GlobalStats.updateOne(
      { key: 'main_stats' },
      { $inc: { totalVolume: SINGLE_STAKE } },
      { upsert: true }
    ).catch((e) => logger.error('Global stats volume update error', { error: e }));

    // Emit wallet update
    const socketId = socketMapping.get(userId);
    if (socketId) {
      io.to(socketId).emit(socketEvents.WALLET_UPDATE, updatedUser.balance);
    }
  }

  if (singleRoomState.markModified) singleRoomState.markModified('playerBoards');
  if (singleRoomState.markModified) singleRoomState.markModified('boardStatus');

  return {
    success: true,
    boardId,
    selectedBoardIds: getUserSelectedBoardIds(userId),
    takenBoards: getTakenBoardIds(),
  };
}

// Debounce logic for high-concurrency state synchronization
let syncTimer: NodeJS.Timeout | null = null;
const scheduleStateSync = () => {
  if (syncTimer) return;
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    try {
      broadcastPoolUpdate();
      io.emit(socketEvents.BOARD_SYNC, {
        takenBoards: getTakenBoardIds(),
      });
      if (singleRoomState.save) await singleRoomState.save();
    } catch (err) {
      logger.error('Debounced state sync error', { error: err });
    }
  }, 300); // Batch updates every 300ms
};

// Pre-generate and cache all 600 boards to ensure they are static and highly performant
// Also build a reverse lookup map: number -> Set<boardIds>
const boardsCache = new Map<number, any>();
const numberToBoardIdsMap = new Map<number, Set<number>>();

for (let i = 1; i <= 600; i++) {
  boardsCache.set(i, generateBoard(i));
  const boardGrid = boardsCache.get(i);
  boardGrid.forEach((row: any) => {
    row.forEach((cell: any) => {
      if (typeof cell.value === 'number') {
        if (!numberToBoardIdsMap.has(cell.value)) {
          numberToBoardIdsMap.set(cell.value, new Set());
        }
        numberToBoardIdsMap.get(cell.value)?.add(i);
      }
    });
  });
}

// We use a slower interval (3s) which is already good for free tier CPU limits
// If you find the server lagging, you can increase this to 5s or 10s
const broadcastPoolUpdate = (ioInstance: SocketIOServer = io) => { // Accept io instance as argument
  const engineActive = globalGameState.isGameRunning && !globalGameState.stopRequested;

  const selectionTimeLeft = getSelectionTimeLeftSeconds();

  const roomStats: RoomStats & { selectionTimeLeft: number } = {
    pool: singleRoomState.globalPool * 0.6, // Dynamic prize calculation: 60% of current pool
    players: singleRoomState.boardStatus.size, // Accurate count of unique users with a selected board
    gameId: singleRoomState.currentGameId,
    state: singleRoomState.state,
    isLive: singleRoomState.state === GameState.GAME,
    isEngineActive: engineActive,
    selectionTimeLeft: selectionTimeLeft
  };

  // Emit directly the single room stats
  const poolUpdateData: PoolUpdateData = { 
    room: roomStats, // Changed from 'rooms' to 'room'
    totalActive: globalGameState.activePlayers,
    isEngineActive: engineActive,
    isMaintenance: globalGameState.isMaintenanceMode,
  };
  ioInstance.emit(socketEvents.POOL_UPDATE, poolUpdateData);
};

function shuffle(array: number[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Global interval for drawing balls
async function runGameLoop() {
  if (!globalGameState.isGameRunning || singleRoomState.state !== GameState.GAME) {
    return;
  }

  if (singleRoomState.currentBalls.length < singleRoomState.shuffledBalls.length) {
    const ball = singleRoomState.shuffledBalls[singleRoomState.currentBalls.length];
    singleRoomState.currentBalls.push(ball);
    io.emit(socketEvents.BALL_DRAWN, ball); // Emit to all connected clients

      // AUTO-CLAIM CHECK: Collect all winners for this specific ball
      const winnersThisRound: any[] = [];
      const currentBallsSet = new Set(singleRoomState.currentBalls);

      // Get all board IDs that contain the newly drawn ball
      const boardsWithDrawnBall = numberToBoardIdsMap.get(ball) || new Set<number>();

      // OPTIMIZATION: Instead of iterating all players, only check boards containing the drawn ball
      for (const boardId of boardsWithDrawnBall) {
        const userId = singleRoomState.boardStatus.get(boardId.toString());
        if (!userId) continue; // Skip boards not owned by any player

        const grid = boardsCache.get(boardId);
        const win = checkWin(grid, currentBallsSet);
        
        // Update the cache for this board
        singleRoomState.winCache.set(boardId, win);

        if (win.isWinner) {
          winnersThisRound.push({
            userId,
            boardId,
            patterns: win.patterns
          });
        }
      }

      if (winnersThisRound.length > 0) {
        singleRoomState.state = GameState.FINISHED;
        const totalPayout = singleRoomState.globalPool * 0.6; // 60% to players
        const houseShare = singleRoomState.globalPool * 0.4; // 40% to house
        
        globalGameState.totalProfit += houseShare;
        await GlobalStats.updateOne({ key: 'main_stats' }, { $inc: { totalProfit: houseShare } }, { upsert: true }).catch(e => logger.error('Global stats profit update error', { error: e }));

        const splitPayout = totalPayout / winnersThisRound.length;

        Promise.all(winnersThisRound.map(async (w) => {
            singleRoomState.boardStatus.set(w.boardId.toString(), w.userId);
            const user = await User.findOneAndUpdate({ userId: w.userId }, { $inc: { balance: splitPayout } }, { new: true });
            const winnerInfo = {
              ...w,
              username: user?.username || 'Anonymous',
              payout: splitPayout,
              gameId: singleRoomState.currentGameId,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            jackpotWinsCounter.add(1);
            const sId = socketMapping.get(w.userId);
            if (sId && user) io.to(sId).emit(socketEvents.WALLET_UPDATE, user.balance); // Emit to specific user
            io.emit(socketEvents.NEW_WINNER, winnerInfo); // Emit to all in the room

            await ActivityLog.create({
              userId: w.userId,
              type: 'win',
              amount: splitPayout,
              gameId: singleRoomState.currentGameId
            });

            return GameArchive.create({
              gameId: singleRoomState.currentGameId,
              winnerId: w.userId,
              winnerBoardId: w.boardId,
              prizePool: totalPayout,
              houseRake: houseShare,
              ballsDrawn: singleRoomState.currentBalls
            });
        })).catch(e => logger.error('Game completion processing error', { error: e }));
        
        if (singleRoomState.markModified) singleRoomState.markModified('boardStatus');
      }
  }

  if (singleRoomState.state === GameState.FINISHED || singleRoomState.currentBalls.length >= 75) {
    // 10-second winner declaration window — broadcast synced countdown to all clients
    if (!singleRoomState.gameLoopTimeout) {
      let secondsLeft = 10;
      io.emit(socketEvents.COUNTDOWN, secondsLeft);
      const countdownInterval = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft >= 0) io.emit(socketEvents.COUNTDOWN, secondsLeft);
      }, 1000);
      singleRoomState.gameLoopTimeout = setTimeout(() => {
        clearInterval(countdownInterval);
        singleRoomState.gameLoopTimeout = undefined;
        resetGame();
      }, 10000);
    }
    return;
  }

  singleRoomState.gameLoopTimeout = setTimeout(() => runGameLoop(), 3000);
  if (singleRoomState.save) await singleRoomState.save().catch(console.error);
}
function startSelectionPhase() {
  if (globalGameState.stopRequested) {
    console.log(`🚫 Prevented selection phase (stop requested).`);
    return;
  }
  const SELECTION_PHASE_DURATION_MS = 40000; // 40 seconds
  singleRoomState.state = GameState.SELECTION;
  singleRoomState.selectionStartTime = Date.now();
  singleRoomState.selectionDuration = SELECTION_PHASE_DURATION_MS;
  broadcastPoolUpdate();
  
  // Start 40s "Quick Pick" window to finalize Total Players for this round
  if (singleRoomState.selectionTimer) clearTimeout(singleRoomState.selectionTimer);
  if (singleRoomState.selectionInterval) clearInterval(singleRoomState.selectionInterval);

  // Start interval to broadcast selection time left every second for client sync
  singleRoomState.selectionInterval = setInterval(() => {
    if (singleRoomState.state !== GameState.SELECTION) {
      if (singleRoomState.selectionInterval) clearInterval(singleRoomState.selectionInterval);
      return;
    }
    broadcastPoolUpdate();
  }, 1000);

  singleRoomState.selectionTimer = setTimeout(() => { // Store the timer reference
    if (singleRoomState.selectionInterval) {
      clearInterval(singleRoomState.selectionInterval);
      singleRoomState.selectionInterval = undefined;
    }

    if (singleRoomState.boardStatus.size === 0) {
      logger.info("ENGINE_STATE_CHANGE: No players joined. Restarting selection phase.");
      startSelectionPhase();
      return;
    }

    singleRoomState.state = GameState.GAME;
    singleRoomState.shuffledBalls = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
    broadcastPoolUpdate();
    // Give clients a 2s buffer to transition from Selection to Game page before drawing balls
    setTimeout(() => runGameLoop(), 2000);
  }, 40000);
  if (singleRoomState.save) singleRoomState.save().catch(e => logger.error('Room selection start save error', { error: e, stake: SINGLE_STAKE }));
}

function resetGame() {
  if (singleRoomState.gameLoopTimeout) {
    clearTimeout(singleRoomState.gameLoopTimeout);
    singleRoomState.gameLoopTimeout = undefined;
  }
  if (singleRoomState.selectionInterval) {
    clearInterval(singleRoomState.selectionInterval);
    singleRoomState.selectionInterval = undefined;
  }

  singleRoomState.currentBalls = [];
  singleRoomState.shuffledBalls = [];
  singleRoomState.globalPool = 0;
  singleRoomState.playerBoards.clear();
  singleRoomState.winCache.clear();
  singleRoomState.boardStatus.clear(); // Clear board status for new game
  singleRoomState.currentGameId = generateGameId();
  io.emit(socketEvents.GAME_RESET); // Emit to all connected clients
  
  // Check if a stop was requested and no other rooms are still in a game
  if (globalGameState.stopRequested) {
    const hasLiveGames = singleRoomState.state === GameState.GAME; // Only one room now
    if (!hasLiveGames) {
      globalGameState.isGameRunning = false; // Stop engine
      if (singleRoomState.selectionTimer) {
        clearTimeout(singleRoomState.selectionTimer);
        singleRoomState.selectionTimer = undefined;
      }
      if (singleRoomState.gameLoopTimeout) {
        clearTimeout(singleRoomState.gameLoopTimeout);
        singleRoomState.gameLoopTimeout = undefined;
      }
      globalGameState.stopRequested = false; // Clear stop request
      logger.info("ENGINE_STATE_CHANGE: Game engine SHUT DOWN successfully after graceful stop.");
      broadcastPoolUpdate();
      io.emit('game:stopped', 'Games are over for today. Please come back tomorrow to play!');
      return;
    } else {
    }
  }

  startSelectionPhase();
  if (singleRoomState.markModified) singleRoomState.markModified('playerBoards');
  if (singleRoomState.markModified) singleRoomState.markModified('boardStatus');
  if (singleRoomState.save) singleRoomState.save().catch(e => logger.error('Room reset save error', { error: e, stake: SINGLE_STAKE }));
  broadcastPoolUpdate();
  refreshAllUserHistories().catch((e) => logger.error('History refresh error after reset', { error: e }));
}

// Game starts only when admin explicitly starts it.

// Per-round winning payout modal timing etc will be addressed in later steps.

dbPromise.then(async (conn) => {
  io = new SocketIOServer(server, { cors: corsConfig });
  await syncCache();
  registerSocketHandlers(io);
  
  resetGame();

  try {
    await Promise.all([mainBot.launch(), adminBot.launch()]);
    logger.info("User and Admin Bots initialized");
    
    if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== 'YOUR_ADMIN_CHAT_ID_HERE') {
      adminBot.telegram.sendMessage(ADMIN_CHAT_ID, "🚀 <b>Bots Online</b>\nThe game server and both bots have started successfully.", { parse_mode: 'HTML' }).catch(e => logger.error("Failed to send startup message", { error: e.message }));
    }
  } catch (err) {
    logger.error("Failed to start application services", { error: err });
  }
}).catch(err => {
  logger.error("Critical: Application failed to start due to MongoDB connection failure", { error: err });
});
// Socket.io Logic (now accepts io as argument)
function registerSocketHandlers(io: SocketIOServer) {
  io.on('connection', async (socket) => {
    logger.info(`User connected: ${socket.id}`);

  const { initData, user } = socket.handshake.auth;
  let isVerified = false;

  if (!initData || !verifyTelegramData(initData) || !user?.id) {
    logger.warn(`Unauthorized or non-Telegram connection attempt: ${socket.id}`);
    socket.disconnect();
    return;
  }

  const userId = user.id.toString();
  const telegramUsername = user.username ? `@${user.username}` : (user.first_name || 'User');
  isVerified = true;

  logger.debug(`Authenticated as: ${userId}`);
  socketMapping.set(userId, socket.id);

  // Force Start Round (Admin Only — requires secret)
  socket.on(socketEvents.FORCE_START, (data?: { secret?: string }) => {
    if (data?.secret !== ADMIN_SECRET) {
      logger.warn('Unauthorized FORCE_START attempt', { socketId: socket.id, userId });
      return;
    }
    forceStartSelectionRound();
  });

  // Fetch or Create User in DB
  User.findOne({ userId }).then(async (user: any) => {
    let currentBalance = 0;
    let isUserVerified = false;
    if (!user) {
      // Create unverified user record. Balance is 0 until phone verification.
      const newUser = await User.create({ userId, username: telegramUsername, balance: 0, isVerified: false });
      currentBalance = newUser.balance;
      isUserVerified = newUser.isVerified;
    } else {
      let update: any = {};
      if (telegramUsername !== 'User' && user.username !== telegramUsername) {
        update.username = telegramUsername;
      }

      if (Object.keys(update).length > 0) {
        await User.updateOne({ userId }, { $set: update });
      }
      
      currentBalance = user.balance;
      isUserVerified = user.isVerified;
    }
    socket.emit(socketEvents.WALLET_UPDATE, currentBalance);
    socket.emit(socketEvents.USER_STATUS, { isVerified: isUserVerified, phone: user?.phone, referredCount: user?.referredCount || 0 });
  }).catch(err => logger.error(`Error fetching/creating user for socket ${socket.id}`, { error: err }));
  
  globalGameState.activePlayers++;
  broadcastPoolUpdate(io); // Pass io instance to broadcastPoolUpdate

  // Joining a specific room — full state resync (also runs on reconnect)
  socket.on(socketEvents.JOIN_ROOM, async () => {
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room as string);
    });
    socket.join(`room_${SINGLE_STAKE}`);
    await emitJoinState(socket, userId);
  });


  // Concurrency-controlled board selection with server ack/nack
  socket.on(socketEvents.PICK_BOARD, (data: { boardId: number }) => {
    enqueueBoardPick(async () => {
      try {
        const result = await processBoardPick(userId, data.boardId);
        socket.emit(socketEvents.PICK_BOARD_RESULT, result);
        if (result.success) {
          scheduleStateSync();
        }
      } catch (err) {
        logger.error('Board pick processing error', { error: err, userId, boardId: data.boardId });
        socket.emit(
          socketEvents.PICK_BOARD_RESULT,
          buildPickFailure(userId, data.boardId, 'Selection failed. Please try again.')
        );
      }
    });
  });

    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.id}`);
      socketMapping.delete(userId);
      globalGameState.activePlayers = Math.max(0, globalGameState.activePlayers - 1);
      broadcastPoolUpdate();
    });
  });
}

// Serve static files from the Vite build directory
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');
const adminPath = path.join(distPath, 'admin.html');

app.use(express.static(distPath));

// Add explicit route for the admin dashboard
app.get('/admin', (req, res) => {
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    logger.error(`Dashboard Error: admin.html not found at ${adminPath}`);
    res.status(404).send("Admin dashboard file not found. Ensure the build included admin.html.");
  }
});

// Handle SPA routing: serve index.html for any unknown routes
app.get('*', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    logger.error(`Deployment Error: index.html not found at ${indexPath}`);
    res.status(404).send("Frontend build files not found. Please ensure 'npm run build' completed successfully.");
  }
});

// Handle Graceful Shutdown for Render
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    mainBot.stop('SIGTERM'); // Stop main bot
    adminBot.stop('SIGTERM'); // Stop admin bot
    mongoose.connection.close().then(() => logger.info('Database connection closed.'));
  });
});

// Render requires binding to 0.0.0.0 to be reachable externally
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info('>>> Server process successfully bound to port', { 
    port: PORT, 
    host: HOST,
    nodeEnv: process.env.NODE_ENV 
  });
  
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.TELEGRAM_BOT_TOKEN) logger.warn("TELEGRAM_BOT_TOKEN is not set!");
    if (!process.env.FRONTEND_URL) logger.warn("FRONTEND_URL is not set! CORS might block connections.");
    logger.info(`Production Mode: Static files serving from /dist`, { corsOrigin: process.env.FRONTEND_URL });
  }
});