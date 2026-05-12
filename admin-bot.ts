import { Telegraf, Markup, Context } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();



const BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID?.trim();
const PORT = process.env.PORT || 3001;
const API_URL = process.env.INTERNAL_API_URL || process.env.VITE_API_URL || `http://127.0.0.1:${PORT}`;
const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();

// Simple state management for admin bot actions
const adminState = new Map<string, { mode: 'search' | null }>();
const getAdminState = (id: string) => adminState.get(id) || { mode: null };
const setAdminState = (id: string, state: { mode: 'search' | null }) => adminState.set(id, state);

function requireAdminSecret(ctx: Context): boolean { // Explicitly typed ctx
  if (ADMIN_SECRET) return true;
  ctx?.reply?.('❌ Bot configuration error: ADMIN_SECRET is missing on the server.');
  return false;
}

if (!BOT_TOKEN) throw new Error('TELEGRAM_ADMIN_BOT_TOKEN is required');

export const adminBot = new Telegraf<Context>(BOT_TOKEN); // Explicitly typed Telegraf instance
adminBot.start((ctx: Context) => ctx.reply('🚀 Welcome, Admin. Use /manage to control the server.')); // Explicitly typed ctx


adminBot.command('manage', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) {
    return ctx.reply('🚫 Unauthorized access.');
  }

  return ctx.reply(
    '🛠 <b>Server Management</b>\n\nSelect a management function below:',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛑 Stop Game', 'maint_on'), Markup.button.callback('🚀 Start Game', 'maint_off')],
        [Markup.button.callback('📥 Pending Deposits', 'view_pending')],
        [Markup.button.callback('📤 Pending Withdrawals', 'view_withdrawals')],
        [Markup.button.callback('📊 View Server Stats', 'view_stats')],
        [Markup.button.callback('🔍 Search User', 'search_user')],
      ]),
    }
  );
});

adminBot.action(/maint_(on|off)/, async (ctx: Context & { match: RegExpExecArray }) => { // Correctly typed ctx for regex match
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) return ctx.answerCbQuery('Unauthorized');
  if (!requireAdminSecret(ctx)) return;
 
  const enable = ctx.match[1] === 'on';

  try {
    const response = await fetch(`${API_URL}/admin/toggle-maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ADMIN_SECRET, enabled: enable }),
    });

    const data = await response.json();
    await ctx.editMessageText(`Status: ${data.isMaintenanceMode ? '🛑 Maintenance Mode Active' : '✅ Game Server Running'}`);
  } catch (err: any) {
    await ctx.reply('❌ Error: Could not reach the game server.');
  }
});

adminBot.action('view_pending', async (ctx: Context) => { // Explicitly typed ctx
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) return ctx.answerCbQuery('Unauthorized');
  if (!requireAdminSecret(ctx)) return;

  try {
    const response = await fetch(`${API_URL}/admin/pending-deposits?secret=${ADMIN_SECRET}`);
    const pending = await response.json();

    if (!Array.isArray(pending) || pending.length === 0) {
      return ctx.answerCbQuery('✅ No pending deposits.');
    }

    let msg = '📋 <b>PENDING DEPOSIT REQUESTS</b>\n\n';
    pending.forEach((req: any, index: number) => {
      msg += `${index + 1}. User: <code>${req.userId}</code> - <b>${req.amount} ETB</b>\n`;
    });

    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply('❌ Error fetching pending deposits from the server.');
  }
});

adminBot.action('view_withdrawals', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) return ctx.answerCbQuery('Unauthorized');
  if (!requireAdminSecret(ctx)) return;

  try {
    const response = await fetch(`${API_URL}/admin/pending-withdrawals?secret=${ADMIN_SECRET}`);
    const pending = await response.json();

    if (!Array.isArray(pending) || pending.length === 0) {
      return ctx.answerCbQuery('✅ No pending withdrawals.');
    }

    let msg = '💸 <b>PENDING WITHDRAWAL REQUESTS</b>\n\n';
    pending.forEach((req: any, index: number) => {
      msg += `${index + 1}. User: <code>${req.userId}</code> - <b>${req.amount} ETB</b>\n`;
    });

    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply('❌ Error fetching pending withdrawals.');
  }
});

adminBot.action('view_stats', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) return ctx.answerCbQuery('Unauthorized');
  if (!requireAdminSecret(ctx)) return;

  try {
    const response = await fetch(`${API_URL}/admin/wallets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ADMIN_SECRET })
    });
    const data = await response.json();
    const s = data.stats;

    const msg = `📊 <b>SERVER STATISTICS</b>\n\n` +
                `💰 <b>Game Volume:</b> ${s.totalVolume.toFixed(2)} ETB\n` +
                `📈 <b>Net Profit:</b> ${s.totalProfit.toFixed(2)} ETB\n` +
                `🎮 <b>Active Bets:</b> ${s.activeBets} ETB\n` +
                `⚙️ <b>Maintenance:</b> ${s.isMaintenanceMode ? 'ON' : 'OFF'}`;

    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply('❌ Error fetching stats.');
  }
});

adminBot.action('search_user', async (ctx: Context) => {
  const adminId = ctx.from?.id.toString();
  if (!adminId || adminId !== ADMIN_CHAT_ID) return ctx.answerCbQuery('Unauthorized');
  
  setAdminState(adminId, { mode: 'search' });
  return ctx.reply('🔍 Please enter the <b>User ID</b> you want to search for:', { 
    parse_mode: 'HTML',
    reply_markup: { force_reply: true } 
  });
});

adminBot.on('text', async (ctx) => {
  if (!ctx.from) {
    console.warn('Received text message without sender information in admin bot.');
    return;
  }
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
  const state = getAdminState(ctx.from.id.toString());

  if (state.mode === 'search') {
    setAdminState(ctx.from.id.toString(), { mode: null });
    const targetId = ctx.message.text.trim();

    try {
      const response = await fetch(`${API_URL}/admin/user-info?userId=${targetId}&secret=${ADMIN_SECRET}`);
      if (!response.ok) throw new Error('Server error');
      
      const data = await response.json();
      
      const msg = `👤 <b>USER INFO</b>\n\n` +
                  `🆔 <b>ID:</b> <code>${targetId}</code>\n` +
                  `💰 <b>Balance:</b> ${data.balance.toFixed(2)} ETB\n` +
                  `✅ <b>Verified:</b> ${data.isVerified ? 'Yes' : 'No'}`;
      
      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('Search error:', err);
      await ctx.reply('❌ Error: Could not fetch user data. Make sure the ID is correct.');
    }
  }
});

// Admin Approval
adminBot.action(/approve_(\d+)_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => { // Correctly typed ctx for regex match
  if (!requireAdminSecret(ctx)) return;
  const amount = parseInt(ctx.match[1], 10);
  const userId = ctx.match[2];
 
  try {
    const response = await fetch(`${API_URL}/admin/update-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, secret: ADMIN_SECRET }),
    });

    if (response.ok) {
      await ctx.editMessageText(`✅ <b>Approved!</b>\nCredited ${amount} ETB to <code>${userId}</code>.`, { parse_mode: 'HTML' }); //
    } else {
      await ctx.reply('❌ Error: Could not connect to game server API.');
    }
  } catch {
    await ctx.reply('❌ Error: Server is offline.');
  }
});

// Admin Rejection
adminBot.action(/reject_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => { // Correctly typed ctx for regex match
  if (!requireAdminSecret(ctx)) return;
  const userId = ctx.match[1];
   try {
    await fetch(`${API_URL}/admin/reject-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, secret: ADMIN_SECRET }),
    });
    await ctx.editMessageText(`❌ <b>Rejected</b> top-up for <code>${userId}</code>.`, { parse_mode: 'HTML' }); //
  } catch (err) {
    await ctx.reply(`❌ Error notifying server of rejection: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// Admin Withdrawal Paid
adminBot.action(/w_paid_(\d+)_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => {
  if (!requireAdminSecret(ctx)) return;
  const amount = parseInt(ctx.match[1], 10);
  const userId = ctx.match[2];

  try {
    await fetch(`${API_URL}/admin/complete-withdrawal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, secret: ADMIN_SECRET }),
    });
    await ctx.editMessageText(`✅ <b>Withdrawal Paid</b>\nUser: <code>${userId}</code>\nAmount: ${amount} ETB`, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply('❌ Error communicating with server.');
  }
});

// Admin Withdrawal Reject/Refund
adminBot.action(/w_ref_(\d+)_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => {
  if (!requireAdminSecret(ctx)) return;
  const amount = parseInt(ctx.match[1], 10);
  const userId = ctx.match[2];
  try {
    await fetch(`${API_URL}/admin/refund-withdrawal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, secret: ADMIN_SECRET }),
    });
    await ctx.editMessageText(`❌ <b>Withdrawal Rejected & Refunded</b>\nUser: <code>${userId}</code>`, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply('❌ Error contacting server.');
  }
});
adminBot.catch((err) => console.error('Admin Bot Error:', err));
