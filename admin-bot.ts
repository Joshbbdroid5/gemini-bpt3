import { Telegraf, Markup, Context } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();



const BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID?.trim();
const PORT = process.env.PORT || 3001;
const API_URL = process.env.INTERNAL_API_URL || process.env.VITE_API_URL || `http://127.0.0.1:${PORT}`;
const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();

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
    '🛠 *Server Management*\n\nToggle Maintenance Mode to start or stop game rounds.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛑 Stop Game', 'maint_on'), Markup.button.callback('🚀 Start Game', 'maint_off')],
        [Markup.button.callback('📋 View Pending Deposits', 'view_pending')],
      ]),
    }
  );
});

adminBot.action(/maint_(on|off)/, async (ctx: Context & { match: RegExpExecArray }) => { // Correctly typed ctx for regex match
  if (ctx.from?.id.toString() !== ADMIN_CHAT_ID) return ctx.answerCbQuery('Unauthorized');
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
  if (ctx.from?.id.toString() !== ADMIN_CHAT_ID) return ctx.answerCbQuery('Unauthorized');
  if (!requireAdminSecret(ctx)) return;

  try {
    const response = await fetch(`${API_URL}/admin/pending-deposits?secret=${ADMIN_SECRET}`);
    const pending = await response.json();

    if (!Array.isArray(pending) || pending.length === 0) {
      return ctx.reply('✅ No pending deposit requests at the moment.');
    }

    let msg = '📋 *PENDING DEPOSIT REQUESTS*\n\n';
    pending.forEach((req: any, index: number) => {
      msg += `${index + 1}. User: \`${req.userId}\` - *${req.amount} ETB*\n`;
    });

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply('❌ Error fetching pending deposits from the server.');
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
adminBot.catch((err) => console.error('Admin Bot Error:', err));
