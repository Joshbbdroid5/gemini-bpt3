# TODO: Fix admin-bot.ts TypeScript errors

## Plan
1. **Replace broken references** in `admin-bot.ts`:
   - Use the exported `adminBot` instance consistently (remove any leftover `bot`/`nbot` mismatch).
2. **Bring missing constants/helpers** into `admin-bot.ts`:
   - `requireAdminSecret`, `FRONTEND_URL`, `TELEBIRR_ACCOUNT_NUMBER`, `parseAmount`.
3. **Align deposit/withdraw state helpers** with actual usage.
4. **Ensure strict TypeScript** by adding minimal `any` typings where Telegraf context types vary.
5. Run `npm run tsc -- --noEmit` to confirm compile success.

## Status
- [x] Step 1 (fixed bot/nbot mismatch)
- [x] Step 2 (added missing constants/helpers)
- [ ] Step 3
- [ ] Step 4
- [ ] Step 5 (run tsc)


