# TODO
- [ ] Refactor app to remove all language/translation usage (single English)
  - [ ] Update `src/types.ts`: remove `Language` type
  - [ ] Update `src/App.tsx`: remove `Language` import/props and `translations` usage
  - [ ] Update components (`Header`, `Dashboard`, `SelectionPage`, `GamePage`, `HistoryPage`, `WalletPage`, `ProfilePage`, `BottomTabs`) to remove `language` props and `translations` imports; hardcode English strings
  - [ ] Delete `src/translations.ts`
- [ ] Run `npx tsc -p tsconfig.json --noEmit`
- [ ] Run `npm run build`

