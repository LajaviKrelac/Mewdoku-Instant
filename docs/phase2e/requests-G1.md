# Phase 2e requests from G1 (logic, app, platform client)

Status: living list · Owner: G1 · Spec: [spec §8](spec.md#8-workstreams-ownership-and-order) (ownership §8.1, order §8.2) · Interfaces: [CONTRACTS.md](CONTRACTS.md) (§12 Requests) · The lead closes open rows at I-2.

## How to file a request

- Use this file when you need a change in a file you do not own (spec §8.1). Do not edit that file yourself. Running a script you do not own (`size`, `i18n:check`, `palette:check`, `npm --prefix server test`) needs no request; editing one does. A file the table does not list is the lead's: ask here first.
- One row per request: the next number (R1, R2, …), from → to (G2, G3, G4 or lead), the file and the exact change (member, key, selector or line), and why (the spec or contract section). A wire change (`src/shared/rank-api.ts` or the contract fixtures) goes to G4 with the client impact stated; fields stay additive inside v1.
- Meanwhile, keep working against a placeholder in your own files. Never delete or narrow a member another workstream may still use before I-3.
- The receiving workstream notes what it did in its own file, under "Done for other workstreams' requests", and marks the row here **done by …**. The lead answers anything still open at I-2.

## Requests

| # | From → to | What | Why |
|---|---|---|---|

## Done for other workstreams' requests

(none filed to G1 so far)

## Notes from G1 for the others (no action needed)

(none yet)

## L0 (lead): what is ready for G1

- **Env** (`src/env.d.ts`, spec §7.3): `VITE_LADDER_URL?: string`, `VITE_LADDER_WEB?: 'off' | 'anon'`, `VITE_FB_PLACEMENT_REWARDED_{HINT,KITTY,MOUSE,REVIVE,RANK_DOUBLE}?: string`. `vite.config.ts` passes the two ladder keys through `scripts/ladder-env.ts`: the URL arrives trimmed and without a trailing slash, or `undefined` (empty, or not a plain http(s) URL); `VITE_LADDER_WEB` arrives as `'off'`, `'anon'` or `undefined`, and is always `undefined` in the `release` / `release-fbig` builds (there `cfg.ladder.web` decides). Treat `undefined` as "not given". The per-helper placement IDs come through as Vite loads them (empty or missing → fall back to `VITE_FB_PLACEMENT_REWARDED`). Unit tests do not load `vite.config.ts`: stub with `vi.stubEnv` or inject the values.
- **The `ladder` chunk**: its barrel is `src/app/ladder-chunk.ts` (yours; one dynamic import, like `events-chunk.ts`), which `scripts/locale-loaders.ts` names `assets/ladder-*.js`. Its stylesheet keeps the barrel's name, `assets/ladder-chunk-*.css` (for `loadChunk(…, { css: /ladder-chunk-[\w-]+\.css/ })`); if the views need one, G3 writes `src/styles/ladder-chunk.css` and the barrel imports it, as `events-chunk.ts` imports `events-chunk.css`. `tests/unit/layering.spec.ts` lists the barrel among the lazy entries that nothing may import statically. `size-check.ts` has placeholder rows for both files (spec §7.9 estimates; the lead re-sets them at I-4). If you pick another barrel path, file a row here so the lead moves the name rule and the rows.
- **Layering** (CONTRACTS §1): `game/`, `platform/`, `app/` and `main.ts` may import `src/shared/**`; `workers/` may not.
