# Lomi Bingo

A Telegram Mini App for playing Bingo — players join rooms, pick boards, and compete for prizes funded by entry stakes.

## Run & Operate

- `pnpm --filter @workspace/lomi-bingo run dev` — run the frontend (Vite, port 19831)
- `pnpm --filter @workspace/api-server run dev` — run the API server (builds then starts on port 8080)
- `pnpm --filter @workspace/api-server run typecheck` — typecheck the backend
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React + Vite + Tailwind v4 (artifact: `lomi-bingo`)
- **Backend**: Express 5 + Socket.io + MongoDB/Mongoose + Telegraf (artifact: `api-server`)
- **Telegram bots**: main bot (user-facing) + admin bot (management)
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/lomi-bingo/src/` — React frontend (entry: `main.tsx` → `components/App.tsx`)
- `artifacts/lomi-bingo/src/components/` — Game UI (GamePage, Dashboard, Leaderboard, etc.)
- `artifacts/api-server/src/server.ts` — Main server: Express routes, Socket.io, MongoDB schemas
- `artifacts/api-server/src/main-bot.ts` — Telegram main bot (player-facing)
- `artifacts/api-server/src/admin-bot.ts` — Telegram admin bot (management)
- `artifacts/api-server/src/logic.ts` — Bingo board generation and win detection
- `artifacts/api-server/src/types.ts` — Shared TypeScript types
- `artifacts/api-server/src/socketEvents.ts` — Socket.io event name constants (server-side)
- `artifacts/lomi-bingo/src/components/socket.ts` — Socket.io client connection

## Architecture decisions

- Telegram bots (`mainBot`, `adminBot`) export `null` if their tokens are not set — the HTTP/Socket.io server starts regardless, letting you develop without Telegram credentials
- The original server was a single 2411-line file; it was adapted in-place rather than refactored — keeping diff minimal for correctness
- `artifacts/api-server/src/server-original.ts` is the unmodified backup; excluded from TypeScript compilation
- Socket.io paths (`/socket.io`) are registered alongside `/api` in the artifact.toml so the proxy routes them correctly
- Frontend connects to the API server via `VITE_BACKEND_URL` env var (falls back to same origin)

## Required Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string (required for game to work) |
| `TELEGRAM_BOT_TOKEN` | Main player-facing bot token |
| `TELEGRAM_ADMIN_BOT_TOKEN` | Admin management bot token |
| `ADMIN_SECRET` | Shared secret for admin API endpoints |
| `ADMIN_CHAT_ID` | Telegram chat ID for admin notifications |
| `VITE_TELEGRAM_BOT_USERNAME` | Bot username shown in frontend (e.g. `LomiBingoBot`) |
| `VITE_BACKEND_URL` | Backend URL for frontend (optional; defaults to same origin) |

## Product

- Players open the app via Telegram bot, register with phone number, deposit ETB via Telebirr
- Game rooms run timed Bingo rounds: balls are drawn, players mark boards, winners are announced
- Admin controls game engine start/stop, maintenance mode, deposits/withdrawals via admin bot

## Gotchas

- The dev script builds then starts (`pnpm run build && pnpm run start`) — code changes require restarting the workflow to rebuild
- The app shows "OPEN IN TELEGRAM" in browser — expected; it requires `window.Telegram.WebApp` context
- `server-original.ts` is kept as a reference backup; never delete it
- Tailwind v4 uses `@tailwindcss/vite` plugin — no `postcss.config.js` needed

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Original source files in `.migration-backup/` for reference
