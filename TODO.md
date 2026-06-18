# TODO

- [ ] Step 1: Fix ESLint import resolution causing `import-x/no-unresolved` false positives (Node built-ins + TS project).
- [ ] Step 2: Re-run `npm run lint` to confirm unresolved-module errors are gone.
- [ ] Step 3: Fix TypeScript errors in `server.ts` (string | undefined -> string, etc.).
- [ ] Step 4: Reduce `@typescript-eslint/no-explicit-any` / `no-unsafe-*` by tightening mongoose/lean() types at the boundaries.
- [ ] Step 5: Address remaining rule violations: `no-empty`, `prefer-const`, `prefer-nullish-coalescing`, `prefer-optional-chain`, `require-await`, `no-misused-promises`.
- [ ] Step 6: Re-run `npm run lint` + `npm run server` (optional) / `tsc --noEmit`.
