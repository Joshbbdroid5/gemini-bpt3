## Telegram Deposit/Withdraw Method Selection - TODO

- [ ] Update `admin-bot.ts` deposit flow:
  - [ ] Replace current `deposit` handler to show inline keyboard: “Choose your deposit method”
  - [ ] Add `deposit_method_telebirr` action handler to display Telebirr account details
  - [ ] After Telebirr selection, request amount with `force_reply` using a reply token like `deposit_amount:`

- [ ] Update `admin-bot.ts` withdraw flow:
  - [ ] Replace current `withdraw` handler to show inline keyboard: “Choose your withdrawal method”
  - [ ] Add `withdraw_method_telebirr` action handler to display Telebirr withdrawal account details
  - [ ] After Telebirr selection, request amount with `force_reply` using a reply token like `withdraw_amount:`

- [ ] Update `bot.on('text')` amount parsing:
  - [ ] Detect replies by message text tokens (`deposit_amount:` / `withdraw_amount:`)
  - [ ] Ensure existing pending deposit creation (Telebirr SMS) still works for deposit confirmations

- [ ] TypeScript/build validation (`npm run build`)
- [ ] Manual Telegram test: Deposit → Telebirr → amount → Telebirr SMS → admin approve

