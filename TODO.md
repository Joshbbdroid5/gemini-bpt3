# TODO - Admin-controlled START/STOP for Bingo

- [x] Create server-side `isGameRunning` flag and stop/start helpers
- [x] Gate `runGameLoop` and room reset so loops only run when admin has started (will implement now)
- [ ] Add REST endpoints: `POST /admin/start-game` and `POST /admin/stop-game` (missing)
- [ ] Add socket broadcasts for game status: `game:status` and `game:stopped`
- [ ] Update AdminDashboard UI with Start/Stop buttons
- [ ] Update client socket listeners and UI states (waiting/ended)
- [ ] Prevent auto-submission from SelectionPage unless game is running
- [ ] Ensure server accepts bets only when admin has started
- [ ] Run TypeScript build / sanity checks

