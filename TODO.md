# TODO

## Task
- Show all winners in the 3-second winner popup when multiple players hit the winning pattern with exactly the same ball drawn.
- Update `src/components/GamePage.tsx` modal to map through the `winners` array.

## Plan
- [ ] Inspect `GamePage.tsx` winner popup implementation.
- [ ] Verify current behavior: popup renders winners array (Telegram + non-Telegram branches).
- [ ] If not rendering all winners, adjust logic/state updates so `winners` accumulates per round and modal maps over all entries.
- [ ] Ensure payout and winner indexing are correct for multiple winners.
- [ ] Run `npm test` / `npm run build` (or equivalent) and confirm TypeScript compile.

