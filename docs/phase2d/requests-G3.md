# Phase 2d requests from G3 (HUD, screens, overlays, fx, i18n, audio)

Status: living list · Owner: G3 · Spec: [look-spec §3](look-spec.md#3-workstreams-disjoint-file-ownership) (ownership §3.1, order §3.2; the lead runs I-2) · Interfaces: [CONTRACTS.md](CONTRACTS.md).

## How to file a request

- Use this file when you need a change in a file you do not own (look-spec §3.1). Do not edit that file yourself. A symbol in `sprite.ts` and a token in `tokens.css` are G2's: ask here and use a placeholder meanwhile. Running a script you do not own (`palette:check`, `i18n:check`, `size`) needs no request. Editing one does. A file the table does not list is the lead's: ask here first.
- Add one row per request: the next number (R1, R2, …), from → to (G1, G2 or lead), the file and the exact change (member, key, selector or line), and why (the spec or contract section). Keep it to one line where you can.
- Meanwhile, keep working against a placeholder in your own files (look-spec §3.2). Never delete or narrow a member another workstream may still use before I-3.
- The receiving workstream notes what it did in its own file, under "Done for other workstreams' requests". Then mark the row here **done by …**. The lead runs or answers anything still open at integration step I-2.

## Requests

| # | From → to | What | Why |
|---|---|---|---|

## Done for other workstreams' requests

(none yet)

## L0 (lead, 2026-10-10): what changed in G3's files

- **New** `tests/unit/ui/hud-css.spec.ts` (yours). It holds the "Phase 2c.1: the pills row" block and the `.tool__badge` check, both moved unchanged from G2's `css-rules.spec.ts` (critic C13). The helpers are copies, not imports.
- `tests/e2e/visual.spec.ts`: the mid-game board capture moved to G2's new `visual-board.spec.ts`. Its HUD assertions went with it unchanged: three fish, the points pill and the lives label.
- English colour names (look-spec §1.9, Appendix A, critic C14): in `src/i18n/en.ts`, `color.0` Strawberry → Coral, `color.2` Lemon → Mustard, `color.7` Lavender → Violet, `color.11` Moss → Pink. Tests updated: `sanity`, `hint-text`, `coach-toast-rotate`, `review-fixes`, `review2b-fixes` and `format.spec`. The `format.spec` snapshot contains no colour name and is unchanged. Example names in comments updated: `coach.ts`, `hint-text.ts`, `how-to-play.ts`, `announcer.ts`. So were the translator notes in `src/i18n/meta.ts` (`unit`, `color`, `sources`, the `color.` group note).
- Left for G3 (the redraft):
  - The 16 locales are untouched. `npm run i18n:check` passes with 64 new stale-draft warnings: 4 keys × 16 locales. `docs/i18n/drafted-from.json` was deliberately not rewritten.
  - `meta.ts` `SAME_AS_ENGLISH.id` lists `color.2` and `color.7`. Indonesian "Lemon" and "Lavender" no longer equal the English, so those entries are now stale.
  - `meta.ts` `SAMPLES.color` is still `'Lavender'`, the width sample for `{color}`. It was kept so the length check stays the same.
  - `docs/i18n/glossary.md` and `review-log.md` still use the old names.
