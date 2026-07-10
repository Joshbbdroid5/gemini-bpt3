---
name: Lomi Bingo missing secrets masked as game-logic bugs
description: Why board-reset/countdown appeared broken in Lomi Bingo's dev environment when it was actually missing required secrets
---

Lomi Bingo's api-server requires `MONGODB_URI` (Mongoose/MongoDB, not the Replit Postgres `DATABASE_URL`) and `TELEGRAM_BOT_TOKEN` to function at all.

Without `MONGODB_URI`: `dbPromise` never resolves, so `resetGame()`/`startSelectionPhase()` and the whole game loop never run — no board reset, no countdown, nothing happens after a round ends.

Without `TELEGRAM_BOT_TOKEN`: `verifyTelegramData()` always returns false, so every socket connection is immediately disconnected as unauthenticated — the client never even stays connected.

**Why:** Two rounds of code-only fixes to the reset/countdown logic in `App.tsx`/`SelectionPage.tsx`/`server.ts` did not resolve the user's report, because the actual root cause was environment configuration, not application logic. The app also only authenticates via real Telegram WebApp `initData` — there is no dev bypass, so this can't be tested in a plain browser preview.

**How to apply:** When Lomi Bingo (or similar Telegram-integrated apps) exhibits app-wide weirdness (nothing resets, nothing updates, features silently no-op) in a fresh dev environment, check `viewEnvVars` for `MONGODB_URI` and `TELEGRAM_BOT_TOKEN` (and check workflow logs for "CRITICAL" auth/DB warnings) before assuming a logic bug in game-state code.
