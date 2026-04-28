import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // 1307241885
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:3001';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * Helper to safely notify a user. 
 * Telegram Chat IDs are numbers. Guest IDs (e.g., 'guest_1234') cannot receive bot messages.
 */
async function notifyUser(userId: string, message: string) {
  const chatId = parseInt(userId);
  if (!isNaN(chatId)) { // Ensure it's a valid number
    try {
      await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (e) {
      // Log specific errors for better debugging
      if (e instanceof Error) {
        console.error(`Could not notify user ${chatId} (Telegram ID): ${e.message}`);
      } else {
        console.error(`Could not notify user ${chatId} (Telegram ID):`, e);
      }
    }
  } else {
    console.warn(`Attempted to notify non-numeric userId: ${userId}. Skipping notification.`);
  }
}

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");

const bot = new Telegraf(BOT_TOKEN);

// Simple in-memory storage for registration status (Use DB for production)
const registeredUsers = new Set<number>();

// 1. Handle user clicking "Top Up" in the WebApp
bot.start(async (ctx) => {
  const startPayload = (ctx as any).startPayload;

  if (!startPayload || !startPayload.startsWith('topup_')) {
    return ctx.reply(
      "Welcome to Lomi Bingo! 🍋\nSelect an option from the menu below:",
      Markup.inlineKeyboard([
        [Markup.button.callback('📝 Register', 'register'), Markup.button.callback('🎮 Play', 'play')],
        [Markup.button.callback('💳 Deposit', 'deposit'), Markup.button.callback('💸 Withdraw', 'withdraw')],
        [Markup.button.callback('ℹ️ Instruction', 'show_rules'), Markup.button.callback('🤝 Invite', 'invite')],
        [Markup.button.callback('📞 Contact Support', 'help_support')]
      ])
    );
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

// --- 1st Button: Register ---
bot.action('register', (ctx) => {
  return ctx.reply(
    "To register, please confirm your phone number by clicking the button below.",
    Markup.keyboard([
      [Markup.button.contactRequest('📲 Confirm My Phone Number')]
    ]).resize().oneTime()
  );
});

// Handle Phone Number Sharing
bot.on('contact', async (ctx) => {
  const userId = ctx.from.id;
  const phone = ctx.message.contact.phone_number;
  
  registeredUsers.add(userId);
  
  // In a real app, you would send this to your backend/DB here
  await ctx.reply(`✅ Thank you! Registered with: ${phone}`, Markup.removeKeyboard());
  await ctx.reply("You can now play Lomi Bingo!", Markup.inlineKeyboard([
    [Markup.button.callback('🎮 Play Now', 'play')]
  ]));
});

// --- 2nd Button: Play ---
bot.action('play', (ctx) => {
  if (!registeredUsers.has(ctx.from.id)) {
    return ctx.reply("⚠️ You must register first before playing.", Markup.inlineKeyboard([
      [Markup.button.callback('📝 Register Now', 'register')]
    ]));
  }
  
  return ctx.reply("Good luck! 🎮", Markup.inlineKeyboard([
    [Markup.button.webApp('Launch Lomi Bingo', BACKEND_URL)]
  ]));
});

// --- 3rd Button: Deposit ---
bot.action('deposit', (ctx) => {
  return ctx.reply("💰 Enter the amount you wish to deposit (Minimum 10 ETB):", {
    reply_markup: { force_reply: true }
  });
});

// --- 4th Button: Withdraw ---
bot.action('withdraw', (ctx) => {
  return ctx.reply("💸 Enter the amount you wish to withdraw (Minimum 50 ETB):", {
    reply_markup: { force_reply: true }
  });
});

// Handle Inputs for Deposit/Withdraw
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const amount = parseInt(text);
  const isReply = ctx.message.reply_to_message;

  if (isReply && 'text' in isReply) {
    if (isReply.text.includes("deposit")) {
      if (isNaN(amount) || amount < 10) return ctx.reply("❌ Invalid amount. Minimum deposit is 10 ETB.");
      return ctx.reply(
        `💳 To deposit ${amount} ETB, please send payment to:\n\n` +
        `Telebirr: 0912345678 (Lomi Bingo)\n\n` +
        `After payment, please send a screenshot to @your_admin_username`
      );
    }
    
    if (isReply.text.includes("withdraw")) {
      if (isNaN(amount) || amount < 50) return ctx.reply("❌ Invalid amount. Minimum withdrawal is 50 ETB.");
      return ctx.reply(`✅ Withdrawal request for ${amount} ETB received. Our team will process it within 24 hours.`);
    }
  }
});

// --- 6th Button: Contact Support ---
bot.action('help_support', async (ctx) => {
  await ctx.answerCbQuery(); // Acknowledge the button press
  return ctx.reply(
    "📞 Questions or Comments?\n\n" +
    "Join our community: @LomiBingoGroup\n" +
    "Direct Support: @your_admin_username\n" +
    "Email: support@lomibingo.com"
  );
});

// --- 7th Button: Instruction ---
bot.action('show_rules', (ctx) => {
  return ctx.reply(
    "📜 *BINGO RULES*\n\n" +
    "1. Choose your stake and select your boards.\n" +
    "2. Numbers are drawn every 5 seconds.\n" +
    "3. First player to complete a Row, Column, Diagonal, or 4 Corners wins!\n" +
    "4. Winner takes 80% of the total game pool.",
    { parse_mode: 'Markdown' }
  );
});

// --- 8th Button: Invite ---
bot.action('invite', (ctx) => {
  const inviteLink = `https://t.me/share/url?url=https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}&text=Join me on Lomi Bingo and win big! 🍋`;
  return ctx.reply("Invite your friends and earn bonuses!", Markup.inlineKeyboard([
    [Markup.button.url('📤 Share Invite Link', inviteLink)]
  ]));
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
      
      await notifyUser(
        userId, 
        `🎊 *Payment Approved!*\nYour balance has been updated with ${amount} ETB. Good luck!`
      );
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
  
  await notifyUser(
    userId, 
    `❌ *Top-up Rejected*\nYour payment could not be verified. Please contact support.`
  );
});

bot.launch();
console.log("Admin Bot is running and waiting for requests...");

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));