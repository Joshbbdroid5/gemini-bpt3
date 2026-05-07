import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID?.trim(); // 1307241885
const PORT = process.env.PORT || 3001;

// For internal requests within the same Render service
const API_URL = process.env.INTERNAL_API_URL || process.env.VITE_API_URL || `http://127.0.0.1:${PORT}`;

// The public URL used to launch the WebApp (Must be HTTPS)
const FRONTEND_URL = process.env.FRONTEND_URL?.trim() || process.env.VITE_BACKEND_URL?.trim();

const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();

// Payment Details
const PAYMENT_PHONE = process.env.PAYMENT_PHONE || '0978015131';

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

if (!ADMIN_CHAT_ID) {
  console.warn("⚠️ WARNING: ADMIN_CHAT_ID is not set. Admin commands will be inaccessible.");
} else {
  console.log(`🚀 Admin Bot initialized. Authorized Admin ID: ${ADMIN_CHAT_ID}`);
} 

export const bot = new Telegraf(BOT_TOKEN);

function requireAdminSecret(ctx: any): boolean {
  if (ADMIN_SECRET) return true;
  ctx.reply("❌ Bot configuration error: ADMIN_SECRET is missing on the server.");
  return false;
}

// 1. Handle user clicking "Top Up" in the WebApp
bot.start(async (ctx) => {
  const startPayload = (ctx as any).startPayload;

  // Language selection entrypoint
  if (!startPayload) {
    return ctx.reply('🌐 Select your language to continue', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'English', callback_data: 'lang_en' },
            { text: 'አማርኛ', callback_data: 'lang_am' }
          ],
          [
            { text: 'Oromoo', callback_data: 'lang_om' }
          ]
        ]
      }
    });
  }

  // If user selected a language via inline button, launch the WebApp with start_param=lang_xx
  if (typeof startPayload === 'string' && startPayload.startsWith('lang_')) {
    const lang = startPayload.replace('lang_', '');

    if (lang === 'en' || lang === 'am' || lang === 'om') {
      if (!FRONTEND_URL) {
        return ctx.reply('❌ Bot configuration error: FRONTEND_URL is missing.');
      }

      // Pass language into the WebApp so App.tsx can localize
      return ctx.reply(
        '✅ Language selected. Opening the game…',
        Markup.inlineKeyboard([
          [Markup.button.webApp('Launch Lomi Bingo', `${FRONTEND_URL}?start_param=lang_${lang}`)]
        ])
      );
    }
  }


  // Handle Referrals: /start ref_12345
  if (startPayload && startPayload.startsWith('ref_')) {
    const referrerId = startPayload.replace('ref_', '');
    const userId = ctx.from.id.toString();

    try {
      // Only set referrer if user doesn't exist yet
      const response = await fetch(`${API_URL}/admin/check-user?userId=${userId}&secret=${ADMIN_SECRET}`);
      const data = response.ok ? await response.json() : { exists: false };
      if (!data.exists) {
        await fetch(`${API_URL}/admin/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, referredBy: referrerId, secret: ADMIN_SECRET })
        });
      }
    } catch (err) {
      console.error("Referral processing failed:", err);
    }
  }

  if (startPayload === 'deposit') {
    return ctx.reply("💰 Enter the amount you wish to deposit (Minimum 10 ETB):", {
      reply_markup: { force_reply: true }
    });
  }

  if (startPayload === 'withdraw') {
    return ctx.reply("💸 Enter the amount you wish to withdraw (Minimum 50 ETB):", {
      reply_markup: { force_reply: true }
    });
  }

  if (!startPayload || !startPayload.startsWith('topup_')) {
    return ctx.reply(
      "✨ *Welcome to Lomi Bingo!* 🍋\n\nRefreshingly lucky! Select an option from the menu below to start winning:",
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('👤 My Profile', 'my_profile'), Markup.button.callback('🎮 Play', 'play')],
          [Markup.button.callback('📝 Register', 'register'), Markup.button.callback('💳 Deposit', 'deposit')],
          [Markup.button.callback('💸 Withdraw', 'withdraw'), Markup.button.callback('🤝 Invite', 'invite')],
          [Markup.button.callback('ℹ️ Instruction', 'show_rules')],
          [Markup.button.callback('📞 Contact Support', 'help_support')]
        ])
      }
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

// --- My Profile Handler ---
bot.action('my_profile', async (ctx) => {
  if (!requireAdminSecret(ctx)) return;
  const userId = ctx.from.id.toString();
  try {
    const response = await fetch(`${API_URL}/admin/user-info?userId=${userId}&secret=${ADMIN_SECRET}`);
    if (!response.ok) throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
    const data = await response.json().catch(() => ({ balance: 0, isVerified: false })); // Handle JSON parse error
    
    const inviteLink = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;
    
    const message = 
      `👤 *MY PROFILE*\n\n` +
      `🆔 *User ID:* \`${userId}\`\n` +
      `💰 *Balance:* ${data.balance.toFixed(2)} ETB\n` +
      `✅ *Status:* ${data.isVerified ? 'Verified' : 'Unverified'}\n\n` +
      `🔗 *Your Referral Link:* \n${inviteLink}\n\n` +
      `_Share this link! You earn a 5% bonus every time your friends deposit._`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
    return ctx.answerCbQuery();
  } catch (err: any) {
    console.error("Profile fetch error:", err);
    return ctx.answerCbQuery("❌ Error fetching profile.");
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

// --- Admin Server Control ---
bot.command('manage', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) {
    return ctx.reply("🚫 Unauthorized access.");
  }
  return ctx.reply(
    "🛠 *Server Management*\n\nToggle Maintenance Mode to start or stop game rounds.",
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛑 Stop Game', 'maint_on'), Markup.button.callback('🚀 Start Game', 'maint_off')],
        [Markup.button.callback('📋 View Pending Deposits', 'view_pending')]
      ])
    }
  );
});

bot.action(/maint_(on|off)/, async (ctx) => {
  if (ctx.from?.id.toString() !== ADMIN_CHAT_ID) return ctx.answerCbQuery("Unauthorized");
  if (!requireAdminSecret(ctx)) return;
  const enable = ctx.match[1] === 'on';
  
  try {
    const response = await fetch(`${API_URL}/admin/toggle-maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ADMIN_SECRET, enabled: enable })
    });
    const data = await response.json();
    await ctx.editMessageText(`Status: ${data.isMaintenanceMode ? '🛑 Maintenance Mode Active' : '✅ Game Server Running'}`);
  } catch (err: any) {
    await ctx.reply("❌ Error: Could not reach the game server.");
  }
});

bot.action('view_pending', async (ctx) => {
  if (ctx.from?.id.toString() !== ADMIN_CHAT_ID) return ctx.answerCbQuery("Unauthorized");
  if (!requireAdminSecret(ctx)) return;
  try {
    const response = await fetch(`${API_URL}/admin/pending-deposits?secret=${ADMIN_SECRET}`);
    const pending = await response.json();

    if (!Array.isArray(pending) || pending.length === 0) {
      return ctx.reply("✅ No pending deposit requests at the moment.");
    }

    let msg = "📋 *PENDING DEPOSIT REQUESTS*\n\n";
    pending.forEach((req: any, index: number) => {
      msg += `${index + 1}. User: \`${req.userId}\` - *${req.amount} ETB*\n`;
    });
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply("❌ Error fetching pending deposits from the server.");
  }
});

// Handle Phone Number Sharing
bot.on('contact', async (ctx) => {
  if (!requireAdminSecret(ctx)) return;
  const userId = ctx.from.id;
  const phone = ctx.message.contact.phone_number;
  
  try {
    const response = await fetch(`${API_URL}/admin/verify-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId.toString(), phone, secret: ADMIN_SECRET })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Backend failed to verify: ${response.status} ${JSON.stringify(errorData)}`);
    }

    // Check if the user was already verified to give appropriate feedback
    const userData = await response.json().catch(() => ({ isNewUser: false })); // Assuming the backend returns user data or status
    const message = userData.isNewUser ? `✅ Thank you! Registered with: ${phone}` : `✅ Your registration details have been updated to: ${phone}`;

    await ctx.reply(message, Markup.removeKeyboard());
  } catch (err) {
    console.error("❌ Registration error details:", err);
    return ctx.reply("❌ Sorry, there was an error saving your registration. Please try again later.");
  }

  return ctx.reply("You can now play Lomi Bingo!", Markup.inlineKeyboard([
    [Markup.button.callback('🎮 Play Now', 'play')]
  ]));
});

// --- 2nd Button: Play ---

// --- 2nd Button: Play ---
bot.action('play', async (ctx) => {
  if (!requireAdminSecret(ctx)) return;
  const userId = ctx.from.id.toString();
  
  let data: { isVerified: boolean }; // Define the expected type for data
  try {
    // Check registration status from backend
    const response = await fetch(`${API_URL}/admin/check-user?userId=${userId}&secret=${ADMIN_SECRET}`);
    
    if (!response.ok) {
      // If the response itself indicates an error (e.g., 404, 500 from backend)
      console.error(`Backend responded with an error for user ${userId}: ${response.status} ${response.statusText}`);
      data = { isVerified: false }; // Treat as unverified on backend error
    } else {
      // Attempt to parse JSON
      data = await response.json().catch(jsonErr => {
        console.error(`Error parsing user status JSON for user ${userId}:`, jsonErr);
        return { isVerified: false }; // Treat as unverified on JSON parse error
      });
    }
  } catch (fetchErr) {
    // This catch block handles network errors or other issues preventing the fetch call
    console.error(`Error checking user status for user ${userId}:`, fetchErr);
    data = { isVerified: false }; // Treat as unverified on fetch error
  }

  if (!data.isVerified) {
    return ctx.reply("⚠️ You must register first before playing.", Markup.inlineKeyboard([
      [Markup.button.callback('📝 Register Now', 'register')]
    ]));
  }

  if (!FRONTEND_URL) {
    return ctx.reply("❌ Bot configuration error: FRONTEND_URL is missing.");
  }
  
  return ctx.reply("Good luck! 🎮", Markup.inlineKeyboard([
    [Markup.button.webApp('Launch Lomi Bingo', FRONTEND_URL as string)]
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
      return ctx.replyWithMarkdown(
        `💳 *DEPOSIT INSTRUCTIONS*\n\n` +
        `1. Send exactly *${amount} ETB* to our Telebirr account:\n` +
        `Number: \`${PAYMENT_PHONE}\`\n` +
        `(_Tap the number above to copy it_)\n\n` +
        `2. After paying, *copy* the Telebirr confirmation SMS and *paste* it here as a reply to this message.`
      );
    }
    
    if (isReply.text.includes("withdraw")) {
      if (isNaN(amount) || amount < 50) return ctx.reply("❌ Invalid amount. Minimum withdrawal is 50 ETB.");
      return ctx.reply(`✅ Withdrawal request for ${amount} ETB received. Our team will process it within 24 hours.`);
    }

    // Handle the pasted Telebirr confirmation SMS
    if (isReply.text.includes("DEPOSIT INSTRUCTIONS")) {
      // Extract amount from instructions message: "1. Send exactly *100 ETB* to..."
      const amountMatch = isReply.text.match(/\*(\d+) ETB\*/);
      const amountFromMsg = amountMatch ? amountMatch[1] : '0';
      const userId = ctx.from.id.toString();

      if (ADMIN_CHAT_ID) {
        // Save to DB as pending via API
        await fetch(`${API_URL}/admin/add-pending-deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount: parseInt(amountFromMsg), telebirrSms: text, secret: ADMIN_SECRET })
        }).catch(err => console.error("Failed to register pending deposit:", err));

        await bot.telegram.sendMessage(
          ADMIN_CHAT_ID,
          `🚨 *DEPOSIT VERIFICATION NEEDED*\n\n` +
          `👤 *User ID:* \`${userId}\`\n` +
          `💰 *Amount:* ${amountFromMsg} ETB\n` +
          `🧾 *Telebirr Message:* \n\n${text}\n\n` +
          `Please verify this transaction ID manually in your Telebirr app.`,
          { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('✅ Approve', `approve_${amountFromMsg}_${userId}`),
                Markup.button.callback('❌ Reject', `reject_${userId}`)
              ]
            ])
          }
        );
        return ctx.reply("✅ Confirmation received! The admin is now verifying your payment. Your balance will be updated shortly.");
      }
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
  if (!requireAdminSecret(ctx)) return;
  const amount = parseInt(ctx.match[1]);
  const userId = ctx.match[2];

  try {
    const response = await fetch(`${API_URL}/admin/update-wallet`, {
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
  } catch (err: any) {
    await ctx.reply("❌ Error: Server is offline.");
  }
});

// 3. Handle Admin Rejection
bot.action(/reject_(.+)/, async (ctx) => {
  if (!requireAdminSecret(ctx)) return;
  const userId = ctx.match[1];

  try {
    // Cleanup server record
    await fetch(`${API_URL}/admin/reject-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, secret: ADMIN_SECRET })
    });

    await ctx.editMessageText(`❌ *Rejected* top-up for \`${userId}\`.`, { parse_mode: 'Markdown' });
    
    await notifyUser(
      userId, 
      `❌ *Top-up Rejected*\nYour payment could not be verified. Please contact support.`
    );
  } catch (err) {
    await ctx.reply(`❌ Error notifying server of rejection: ${err instanceof Error ? err.message : String(err)}`);
  }
});

bot.catch((err) => {
  console.error("Unhandled Telegram bot error:", err);
});