import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // Your personal Telegram ID
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:3001';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'your-super-secret-key';

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");

const bot = new Telegraf(BOT_TOKEN);

// 1. Handle user clicking "Top Up" in the WebApp
bot.start(async (ctx) => {
  const startPayload = (ctx as any).startPayload;

  if (!startPayload || !startPayload.startsWith('topup_')) {
    return ctx.reply("Welcome to Western Bingo! Please use the WebApp to manage your wallet.");
  }

  // Parse payload: topup_100_guest_1234
  const parts = startPayload.split('_');
  const amount = parseInt(parts[1]);
  const userId = parts.slice(2).join('_'); // Handles IDs with underscores

  if (isNaN(amount) || !userId) {
    return ctx.reply("Invalid top-up request.");
  }

  // Confirm to user
  await ctx.reply(`✅ Request Received!\n\nYou want to top up ${amount} ETB.\nPlease send the payment now via [Your Payment Method Info].\n\nWaiting for admin approval...`);

  // Notify Admin
  if (ADMIN_CHAT_ID) {
    await bot.telegram.sendMessage(
      ADMIN_CHAT_ID,
      `🚨 *NEW TOP-UP REQUEST*\n\n` +
      `👤 *User:* \`${userId}\`\n` +
      `💰 *Amount:* ${amount} ETB\n\n` +
      `Verify payment manually before approving.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Approve', `approve_${amount}_${userId}`),
            Markup.button.callback('❌ Reject', `reject_${userId}`)
          ]
        ])
      }
    );
  }
});

// 2. Handle Admin Approval
bot.action(/approve_(\d+)_(.+)/, async (ctx) => {
  const amount = parseInt(ctx.match[1]);
  const userId = ctx.match[2];

  try {
    const response = await fetch(`${BACKEND_URL}/admin/update-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, secret: ADMIN_SECRET })
    });

    if (response.ok) {
      await ctx.editMessageText(`✅ *Approved!*\nCredited ${amount} ETB to \`${userId}\`.`, { parse_mode: 'Markdown' });
      
      // Try to notify the user if they have a chat with the bot
      // Note: This requires the userId to be their Telegram Chat ID
      try {
        await bot.telegram.sendMessage(userId, `🎊 *Payment Approved!*\nYour balance has been updated with ${amount} ETB. Good luck!`, { parse_mode: 'Markdown' });
      } catch (e) {
        console.log("Could not notify user via bot (maybe not started).");
      }
    } else {
      await ctx.reply("❌ Error: Could not connect to game server API.");
    }
  } catch (err) {
    await ctx.reply("❌ Error: Server is offline.");
  }
});

// 3. Handle Admin Rejection
bot.action(/reject_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  await ctx.editMessageText(`❌ *Rejected* top-up for \`${userId}\`.`, { parse_mode: 'Markdown' });
  
  try {
    await bot.telegram.sendMessage(userId, `❌ *Top-up Rejected*\nYour payment could not be verified. Please contact support.`, { parse_mode: 'Markdown' });
  } catch (e) {}
});

bot.launch();
console.log("Admin Bot is running and waiting for requests...");

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));