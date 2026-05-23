import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import logger from './src/logger';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID?.trim();
const PORT = process.env.PORT || 3001;
const API_URL = process.env.INTERNAL_API_URL || process.env.VITE_API_URL || `http://127.0.0.1:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL?.trim() || process.env.VITE_BACKEND_URL?.trim();
const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
const rawPhone = process.env.PAYMENT_PHONE?.trim();
const PAYMENT_PHONE = rawPhone && rawPhone.length > 5 ? rawPhone : '0978015131';
const TELEBIRR_ACCOUNT_NUMBER = PAYMENT_PHONE;

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');
//
export const mainBot = new Telegraf(BOT_TOKEN);

/**
 * Shared helper for server notifications (called by server.ts)
 */
export async function notifyUser(userId: string, message: string) {
  const chatId = parseInt(userId);
  if (!isNaN(chatId)) {
    try {
      await mainBot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (e) {
      logger.error(`Could not notify user ${chatId}`, { error: e });
    }
  }
}

function parseAmount(text: string): number {
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : NaN;
}

// Conversation State
const depositWithdrawState = new Map<string, { mode: 'deposit' | 'withdraw' | null }>();
const getState = (userId: string) => depositWithdrawState.get(userId) || { mode: null };
const setState = (userId: string, state: { mode: 'deposit' | 'withdraw' | null }) => depositWithdrawState.set(userId, state);
const clearState = (userId: string) => depositWithdrawState.delete(userId);

// --- 1. Start / Welcome ---
mainBot.start(async (ctx) => {
  const startPayload = (ctx as any).startPayload;

  // Referral handling
  if (startPayload && startPayload.startsWith('ref_')) {
    const referrerId = startPayload.replace('ref_', '');
    const userId = ctx.from.id.toString();
    try {
      await fetch(`${API_URL}/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, referredBy: referrerId, secret: ADMIN_SECRET }),
      });
    } catch (err) { logger.error('Referral failed', { error: err, userId }); }
  }

  if (startPayload === 'deposit') return ctx.reply('💰 Choose your deposit method:', Markup.inlineKeyboard([[Markup.button.callback('💳 Telebirr', 'deposit_method_telebirr')]]));
  if (startPayload === 'withdraw') return ctx.reply('💸 Choose your withdrawal method:', Markup.inlineKeyboard([[Markup.button.callback('💳 Telebirr', 'withdraw_method_telebirr')]]));

  // If coming from WebApp deep link: topup_100_userId
  if (startPayload && startPayload.startsWith('topup_')) {
    const parts = startPayload.split('_');
    const amount = parseInt(parts[1], 10);
    const userId = parts.slice(2).join('_');
    if (isNaN(amount)) return ctx.reply('Invalid top-up request.');

    return ctx.reply(
      `✅ <b>Request Received!</b>\n\nYou want to top up <b>${amount} ETB</b>.\n\n💳 <b>DEPOSIT INSTRUCTIONS</b>\n\n1. Send exactly <b>${amount} ETB</b> to our Telebirr account:\nNumber: <code>${TELEBIRR_ACCOUNT_NUMBER}</code>\n\n2. After paying, <b>copy</b> the confirmation SMS and <b>paste</b> it here.`,
      { parse_mode: 'HTML' }
    );
  }

  return ctx.reply(
    '✨ <b>Welcome to Lomi Bingo!</b> 🍋\n\nSelect an option to start winning:',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('👤 My Profile', 'my_profile'), Markup.button.callback('🎮 Play', 'play')],
        [Markup.button.callback('📝 Register', 'register'), Markup.button.callback('💳 Deposit', 'deposit')],
        [Markup.button.callback('💸 Withdraw', 'withdraw'), Markup.button.callback('🤝 Invite', 'invite')],
        [Markup.button.callback('ℹ️ Instruction', 'show_rules')],
        [Markup.button.callback('📞 Support', 'help_support')],
      ]),
    }
  );
});

mainBot.action('my_profile', async (ctx) => {
  const userId = ctx.from.id.toString();
  try {
    const response = await fetch(`${API_URL}/admin/user-info?userId=${userId}&secret=${ADMIN_SECRET}`);
    const data = await response.json();
    const inviteLink = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;
    const message = `👤 <b>MY PROFILE</b>\n\n🆔 <b>ID:</b> <code>${userId}</code>\n💰 <b>Balance:</b> ${data.balance.toFixed(2)} ETB\n✅ <b>Status:</b> ${data.isVerified ? 'Verified' : 'Unverified'}\n\n🔗 <b>Referral Link:</b>\n${inviteLink}`;
    await ctx.reply(message, { parse_mode: 'HTML' });
    return ctx.answerCbQuery();
  } catch (err) { return ctx.answerCbQuery('❌ Error'); }
});

mainBot.action('register', (ctx) => {
  return ctx.reply('Confirm your phone number to register:', Markup.keyboard([[Markup.button.contactRequest('📲 Confirm Phone Number')]]).resize().oneTime());
});

mainBot.on('contact', async (ctx) => {
  const userId = ctx.from.id;
  const phone = ctx.message.contact.phone_number;
  try {
    await fetch(`${API_URL}/admin/verify-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId.toString(), phone, secret: ADMIN_SECRET }),
    });
    await ctx.reply(`✅ Registered with: ${phone}`, Markup.removeKeyboard());
    return ctx.reply('You can now play!', Markup.inlineKeyboard([[Markup.button.callback('🎮 Play Now', 'play')]]));
  } catch (err) { return ctx.reply('❌ Registration error.'); }
});

mainBot.action('play', async (ctx) => {
  const userId = ctx.from.id.toString();
  const response = await fetch(`${API_URL}/admin/check-user?userId=${userId}&secret=${ADMIN_SECRET}`);
  const data = await response.json();
  if (!data.isVerified) return ctx.reply('⚠️ Register first.', Markup.inlineKeyboard([[Markup.button.callback('📝 Register', 'register')]]));
  return ctx.reply('Good luck! 🎮', Markup.inlineKeyboard([[Markup.button.webApp('Launch Game', FRONTEND_URL as string)]]));
});
//
mainBot.action('deposit', (ctx) => ctx.reply('💰 Choose method:', Markup.inlineKeyboard([[Markup.button.callback('💳 Telebirr', 'deposit_method_telebirr')]])));

mainBot.action('deposit_method_telebirr', async (ctx) => {
  await ctx.answerCbQuery();
  setState(ctx.from.id.toString(), { mode: 'deposit' });
  return ctx.reply(`🏦 <b>Deposit via Telebirr</b>\n\nPay to: <code>${TELEBIRR_ACCOUNT_NUMBER}</code>\nEnter deposit amount:`, { parse_mode: 'HTML', reply_markup: { force_reply: true } });
});

mainBot.action('withdraw', (ctx) => ctx.reply('💸 Choose method:', Markup.inlineKeyboard([[Markup.button.callback('💳 Telebirr', 'withdraw_method_telebirr')]]))); //

mainBot.action('withdraw_method_telebirr', async (ctx) => {
  await ctx.answerCbQuery();
  setState(ctx.from.id.toString(), { mode: 'withdraw' });
  return ctx.reply(`🏦 <b>Withdraw via Telebirr</b>\n\nEnter withdrawal amount:`, { parse_mode: 'HTML', reply_markup: { force_reply: true } });
});

mainBot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id.toString();
  const isReply = ctx.message.reply_to_message;
  const replyText = (isReply as any)?.text || '';
  const state = getState(userId);

  if (state.mode === 'deposit') {
    clearState(userId);
    const amount = parseAmount(text);
    if (isNaN(amount) || amount < 10) return ctx.reply('❌ Minimum 10 ETB.');
    return ctx.reply(
      `💳 <b>DEPOSIT INSTRUCTIONS</b>\n\n1. Send <b>${amount} ETB</b> to: <code>${TELEBIRR_ACCOUNT_NUMBER}</code>\n2. After paying, <b>paste</b> the SMS here.`,
      { parse_mode: 'HTML' }
    );
  }

  if (state.mode === 'withdraw') {
    clearState(userId);
    const amount = parseAmount(text);
    if (isNaN(amount) || amount < 50) return ctx.reply('❌ Minimum 50 ETB.');

    try {
      const response = await fetch(`${API_URL}/admin/withdraw-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount, secret: ADMIN_SECRET }),
      });
      const data = await response.json();
      if (response.ok) {
        return ctx.reply(`✅ Withdrawal request for ${amount} ETB received. Admin has been notified.`);
      } else {
        return ctx.reply(`❌ Request failed: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      logger.error('Withdrawal request error', { error: err, userId });
      return ctx.reply('❌ Connection error. Please try again later.');
    }
  }

  if (replyText.includes('DEPOSIT INSTRUCTIONS')) {
    const amountMatch = replyText.match(/(\d+) ETB/);
    const amount = amountMatch ? amountMatch[1] : '0';
    
    // Trigger backend which will notify Admin Bot
    await fetch(`${API_URL}/admin/add-pending-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount: parseInt(amount, 10), telebirrSms: text, secret: ADMIN_SECRET }),
    });
    return ctx.reply('✅ Confirmation received! Admin is verifying.');
  }
});

mainBot.action('help_support', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(
    '📞 Questions or Comments?\n\n' +
      'Join our community: @LomiBingoGroup\n' +
      'Direct Support: @your_admin_username\n' +
      'Email: support@lomibingo.com',
    { parse_mode: 'HTML' }
  );
});

mainBot.action('show_rules', (ctx) => ctx.reply(
  '📜 <b>Bingo Rules</b>\n\n' +
    '1. Choose your stake and select your boards.\n' +
    '2. Numbers are drawn every 5 seconds.\n' +
    '3. First player to complete a Row, Column, Diagonal, or 4 Corners wins!\n' +
    '4. Winner takes 80% of the total game pool.',
  { parse_mode: 'HTML' }
));
mainBot.action('invite', (ctx) => {
  const link = `https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}`;
  return ctx.reply('Earn 5% bonuses!', Markup.inlineKeyboard([[Markup.button.url('📤 Share Link', `https://t.me/share/url?url=${link}`)]])); //
});

mainBot.catch((err) => logger.error('Main Bot Global Error', { error: err }));