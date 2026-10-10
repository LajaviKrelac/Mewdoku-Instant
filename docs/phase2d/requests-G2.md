# Phase 2d requests from G2 (art, board, base tokens)

Status: living list · Owner: G2 · Spec: [look-spec §3](look-spec.md#3-workstreams-disjoint-file-ownership) (ownership §3.1, order §3.2; the lead runs I-2) · Interfaces: [CONTRACTS.md](CONTRACTS.md).

## How to file a request

- Use this file when you need a change in a file you do not own (look-spec §3.1). Do not edit that file yourself. Running a script you do not own (`palette:check`, `i18n:check`, `size`) needs no request. Editing one does. A file the table does not list is the lead's: ask here first.
- Add one row per request: the next number (R1, R2, …), from → to (G1, G3 or lead), the file and the exact change (member, key, selector or line), and why (the spec or contract section). Keep it to one line where you can.
- Meanwhile, keep working against a placeholder in your own files (look-spec §3.2). Never delete or narrow a member another workstream may still use before I-3.
- The receiving workstream notes what it did in its own file, under "Done for other workstreams' requests". Then mark the row here **done by …**. The lead runs or answers anything still open at integration step I-2.

## Requests

| # | From → to | What | Why |
|---|---|---|---|

## Done for other workstreams' requests

(none yet)

## L0 (lead, 2026-10-10): what changed in G2's files

- `tests/unit/ui/css-rules.spec.ts`: the "Phase 2c.1: the pills row" block (with its `ruleOf` helper) moved to G3's new `hud-css.spec.ts`. So did the `.tool__badge` half of "small white text on orange uses --accent-text" (critic C13). The `base.css` half (`.btn--primary .btn__badge`) stays here, as "… count badges on primary buttons".
- **New** `tests/e2e/visual-board.spec.ts` (yours): the mid-game board capture moved unchanged from `visual.spec.ts`, with copies of its helpers. It runs on `web-390`, `web-320` and `web-1280` (`playwright.config.ts`). It still writes `G2-visual-game-<width>.png` under `docs/phase2c/screenshots/` (or `VISUAL_OUT`). The test's HUD assertions moved with it unchanged: three fish, the points pill "1,248" and the lives label. Agree with G3 where they go once the HUD changes.
- Colour names (look-spec §1.9, critic C14): `tests/unit/ui/board-view.spec.ts` now expects "Violet" and "Mustard". The name comments in `src/styles/tokens.css` (`--r0`, `--r2`, `--r7`, `--r11`) and in the `PALETTE` doc comment in `src/ui/art/palette.ts` now give the new names, next to the 2c hex values until your palette lands.
- Left for G2: `scripts/palette-check.ts` `NAMES` (the output labels) still lists Strawberry, Lemon, Lavender and Moss. It is your script, and §2.3 rewrites it.
