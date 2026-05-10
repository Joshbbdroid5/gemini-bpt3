# Fixes needed to complete Admin START/STOP gating

## Must-fix right now
- [ ] Implement `POST /admin/start-game` and `POST /admin/stop-game` in `server.ts`
- [ ] Emit socket events from those endpoints:
  - `game:status`
  - `game:stopped`
- [ ] Add Start/Stop buttons to `src/components/AdminDashboard.tsx`
- [ ] Fix `src/components/AdminDashboard.tsx` TSX issues (earlier tool flagged a TS error: “Cannot find name 'div'”)

## Also required for full behavior
- [ ] Ensure `resetGame()` does NOT schedule next loop when admin stopped
- [ ] Ensure clients cannot auto-submit selections when admin hasn’t started
  - currently `SelectionPage` calls `onComplete` at timer end regardless

## Validation
- [ ] Run `npm run build`
- [ ] Smoke test: admin start => users allowed to bet & see balls; admin stop => no more balls and clients show ended state

