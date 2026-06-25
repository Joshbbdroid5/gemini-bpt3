import { Telegraf, Markup, Context } from 'telegraf';
import dotenv from 'dotenv';
import { logger } from './lib/logger';

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
const API_HEADERS = { 'Content-Type': 'application/json' };


function requireAdminSecret(ctx: Context): boolean { // Explicitly typed ctx
  if (ADMIN_SECRET) return true;
  ctx?.reply?.('❌ Bot configuration error: ADMIN_SECRET is missing on the server.');
  return false;
}

if (!BOT_TOKEN) {
  logger.warn('TELEGRAM_ADMIN_BOT_TOKEN is not set — admin bot will be disabled');
}

export const adminBot = BOT_TOKEN ? new Telegraf<Context>(BOT_TOKEN) : null;

const manageKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🚀 Start Engine', 'engine_start'), Markup.button.callback('🛑 Stop Engine', 'engine_stop')],
  [Markup.button.callback('🛡️ Maint ON', 'maint_on'), Markup.button.callback('✅ Maint OFF', 'maint_off')],
  [Markup.button.callback('📥 Pending Deposits', 'view_pending')],
  [Markup.button.callback('📤 Pending Withdrawals', 'view_withdrawals')],
  [Markup.button.callback('📊 View Server Stats', 'view_stats')],
  [Markup.button.callback('🔍 Search User', 'search_user')],
  [Markup.button.callback('🏆 Referral Leaderboard', 'view_referrals')],
]);

adminBot?.start((ctx: Context) => ctx.reply('🚀 Welcome, Admin. Use /manage to control the server.')); // Explicitly typed ctx

adminBot?.command('manage', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) {
    return ctx.reply('🚫 Unauthorized access.');
  }

  return ctx.reply(
    '🛠 <b>Server Management</b>\n\nSelect a management function below:',
    {
      parse_mode: 'HTML',
      ...manageKeyboard,
    }
  );
});

adminBot?.action(/maint_(on|off)/, async (ctx: Context & { match: RegExpExecArray }) => { // Correctly typed ctx for regex match
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();
 
  const enable = ctx.match[1] === 'on';

  try {
    const response = await fetch(`${API_URL}/admin/toggle-maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ADMIN_SECRET, enabled: enable }),
    });

    const data: any = await response.json();
    await ctx.editMessageText(
      `Status: ${data.isMaintenanceMode ? '🛑 Maintenance Mode Active' : '✅ Game Server Running'}`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'manage_menu')]])
    );
    await ctx.answerCbQuery(data.isMaintenanceMode ? '🛡️ Maintenance Enabled' : '✅ Maintenance Disabled');
  } catch (err: any) {
    await ctx.reply('❌ Error: Could not reach the game server.');
  }
});

adminBot?.action('engine_start', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();

  try {
    const response = await fetch(`${API_URL}/admin/start-game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ADMIN_SECRET }),
    });
    const data: any = await response.json();
    await ctx.answerCbQuery(data.message || '🚀 Engine Started');
    await ctx.editMessageText(
      `✅ <b>Engine Status:</b> ${data.message || 'Started'}`, 
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'manage_menu')]]) }
    );
  } catch (err: any) {
    await ctx.reply('❌ Error: Could not start engine.');
  }
});

adminBot?.action('engine_stop', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '⚠️ <b>CONFIRM SHUTDOWN</b>\n\nAre you sure you want to stop the game engine? This will prevent new selection phases from starting once the current rounds finish.',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛑 Yes, Stop Engine', 'engine_stop_confirm')],
        [Markup.button.callback('🔙 Cancel', 'manage_menu')]
      ])
    }
  );
});

adminBot?.action('engine_stop_confirm', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();

  try {
    const response = await fetch(`${API_URL}/admin/stop-game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ADMIN_SECRET }),
    });
    const data: any = await response.json();
    await ctx.answerCbQuery('🛑 Stop Requested');
    await ctx.editMessageText(`🛑 <b>Engine Status:</b> ${data.message}`, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.editMessageText('❌ Error: Could not stop engine.', { parse_mode: 'HTML' });
  }
});

adminBot?.action('manage_menu', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  
  return ctx.editMessageText(
    '🛠 <b>Server Management</b>\n\nSelect a management function below:',
    {
      parse_mode: 'HTML',
      ...manageKeyboard,
    }
  );
});

adminBot?.action('view_pending', async (ctx: Context) => { // Explicitly typed ctx
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();

  try {
    const response = await fetch(`${API_URL}/admin/pending-deposits?secret=${ADMIN_SECRET}`);
    const pending: any = await response.json();

    if (!Array.isArray(pending) || pending.length === 0) {
      await ctx.answerCbQuery('✅ No pending deposits.'); return;
    }

    let msg = '📋 <b>PENDING DEPOSIT REQUESTS</b>\n\n';
    pending.forEach((req: any, index: number) => {
      const display = req.username ? `${req.username} (<i>ID: ${req.userId}</i>)` : `<code>${req.userId}</code>`;
      msg += `${index + 1}. ${display} - <b>${req.amount} ETB</b>\n`;
    });

    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply('❌ Error fetching pending deposits from the server.');
  }
});

adminBot?.action('view_withdrawals', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();

  try {
    const response = await fetch(`${API_URL}/admin/pending-withdrawals?secret=${ADMIN_SECRET}`);
    const pending: any = await response.json();

    if (!Array.isArray(pending) || pending.length === 0) {
      await ctx.answerCbQuery('✅ No pending withdrawals.'); return;
    }

    let msg = '💸 <b>PENDING WITHDRAWAL REQUESTS</b>\n\n';
    pending.forEach((req: any, index: number) => {
      const display = req.username ? `${req.username} (<i>ID: ${req.userId}</i>)` : `<code>${req.userId}</code>`;
      msg += `${index + 1}. ${display} - <b>${req.amount} ETB</b>\n`;
    });

    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply('❌ Error fetching pending withdrawals.');
  }
});

adminBot?.action('view_stats', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();

  try {
    const response = await fetch(`${API_URL}/admin/wallets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ADMIN_SECRET })
    });
    const data: any = await response.json();
    const s = data.stats;

    const msg = `📊 <b>SERVER STATISTICS</b>\n\n` +
                `💰 <b>Game Volume:</b> ${s.totalVolume.toFixed(2)} ETB\n` +
                `📈 <b>Net Profit:</b> ${s.totalProfit.toFixed(2)} ETB\n` +
                `🎮 <b>Active Bets:</b> ${s.activeBets} ETB\n` +
                `⚙️ <b>Maintenance:</b> ${s.isMaintenanceMode ? 'ON' : 'OFF'}\n` +
                `🚀 <b>Engine:</b> ${s.isGameRunning ? (s.stopRequested ? 'Stopping...' : 'Running') : 'Idle'}`;

    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply('❌ Error fetching stats.');
  }
});

adminBot?.action('search_user', async (ctx: Context) => {
  const adminId = ctx.from?.id.toString();
  if (!adminId || adminId !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  
  setAdminState(adminId!, { mode: 'search' });
  return ctx.reply('🔍 Please enter the <b>User ID</b> or <b>Username</b> you want to search for:', { 
    parse_mode: 'HTML',
    reply_markup: { force_reply: true } 
  });
});

adminBot?.action('view_referrals', async (ctx: Context) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();

  try {
    const response = await fetch(`${API_URL}/admin/referral-leaderboard?secret=${ADMIN_SECRET}`);
    if (!response.ok) throw new Error('Server error');
    const data: any = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      await ctx.reply('📭 No referrals found yet.'); return;
    }

    let msg = '🏆 <b>TOP REFERRERS</b>\n\n';
    data.forEach((entry: any, index: number) => {
      const displayName = entry.username.startsWith('@') ? entry.username : `<code>${entry.username}</code>`;
      msg += `${index + 1}. ${displayName} (<i>ID: ${entry.userId}</i>)\n   └─ <b>${entry.count}</b> referrals\n\n`;
    });

    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (err: any) {
    logger.error('Leaderboard error', { error: String(err) });
    await ctx.reply('❌ Error: Could not fetch referral leaderboard.');
  }
});

adminBot?.on('text', async (ctx): Promise<void> => {
  if (!ctx.from) {
    logger.warn('Received text message without sender information in admin bot.');
    return;
  }
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
  const state = getAdminState(ctx.from.id.toString());

  if (state.mode === 'search') {
    setAdminState(ctx.from.id.toString(), { mode: null });
    const targetId = ctx.message.text.trim();

    try {
      const response = await fetch(`${API_URL}/admin/user-info?userId=${encodeURIComponent(targetId)}&secret=${ADMIN_SECRET}`);
      if (!response.ok) {
        if (response.status === 404) { await ctx.reply('❌ User not found.'); return; }
        throw new Error('Server error');
      }
      
      const data: any = await response.json();
      const actualId = data.userId;
      
      const msg = `👤 <b>USER INFO</b>\n\n` +
                  `👤 <b>User:</b> ${data.username || 'Anonymous'}\n` +
                  `<i>ID: ${actualId}</i>\n\n` +
                  `💰 <b>Balance:</b> ${data.balance.toFixed(2)} ETB`;

      await ctx.reply(msg, { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🗑️ Delete User', `del_conf_${actualId}`)]])
      });
    } catch (err: any) {
      logger.error('Search error', { error: String(err) });
      await ctx.reply('❌ Error: Could not fetch user data. Make sure the ID is correct.');
    }
  }
});

// Admin Approval
adminBot?.action(/approve_(\d+)_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => { // Correctly typed ctx for regex match
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();
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
adminBot?.action(/reject_(\d+)_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => { // Updated to match approve pattern
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();
  const amount = parseInt(ctx.match[1], 10);
  const userId = ctx.match[2];
   try {
    await fetch(`${API_URL}/admin/reject-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, secret: ADMIN_SECRET }),
    });
    await ctx.editMessageText(`❌ <b>Rejected</b> top-up for <code>${userId}</code>.`, { parse_mode: 'HTML' }); //
  } catch (err: any) {
    await ctx.reply(`❌ Error notifying server of rejection: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// Admin Withdrawal Paid
adminBot?.action(/w_paid_(\d+)_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();
  const amount = parseInt(ctx.match[1], 10);
  const userId = ctx.match[2];

  try {
    await fetch(`${API_URL}/admin/complete-withdrawal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, secret: ADMIN_SECRET }),
    });
    await ctx.editMessageText(`✅ <b>Withdrawal Paid</b>\nUser: <code>${userId}</code>\nAmount: ${amount} ETB`, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply('❌ Error communicating with server.');
  }
});

// Admin Withdrawal Reject/Refund
adminBot?.action(/w_ref_(\d+)_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => {
  if (!ctx.from || ctx.from.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();
  const amount = parseInt(ctx.match[1], 10);
  const userId = ctx.match[2];
  try {
    await fetch(`${API_URL}/admin/refund-withdrawal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, secret: ADMIN_SECRET }),
    });
    await ctx.editMessageText(`❌ <b>Withdrawal Rejected & Refunded</b>\nUser: <code>${userId}</code>`, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply('❌ Error contacting server.');
  }
});

// Delete Confirmation
adminBot?.action(/del_conf_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => {
  if (ctx.from?.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  const userId = ctx.match[1];
  await ctx.editMessageReplyMarkup(
    Markup.inlineKeyboard([
      [Markup.button.callback('⚠️ Confirm Delete', `del_exec_${userId}`)],
      [Markup.button.callback('🔙 Cancel', 'manage_menu')]
    ]).reply_markup
  );
});

// Delete Execution
adminBot?.action(/del_exec_(.+)/, async (ctx: Context & { match: RegExpExecArray }) => {
  if (ctx.from?.id.toString() !== ADMIN_CHAT_ID) { void ctx.answerCbQuery('Unauthorized'); return; }
  if (!requireAdminSecret(ctx)) return void ctx.answerCbQuery();
  const userId = ctx.match[1];

  try {
    const response = await fetch(`${API_URL}/admin/delete-user`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ userId, secret: ADMIN_SECRET }),
    });

    if (response.ok) {
      await ctx.editMessageText(`✅ User <code>${userId}</code> has been deleted.`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply('❌ Failed to delete user.');
    }
  } catch (err: any) {
    await ctx.reply('❌ Error: Server unreachable.');
  }
});

adminBot?.catch((err) => {
  // The .catch handler expects a function that returns MaybePromise<void>.
  // logger.error returns the logger instance, so we wrap the call in an arrow function.
  logger.error('Admin Bot Global Error', { error: String(err) });
});
