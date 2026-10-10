# Phase 2d requests from G1 (logic, app, platform)

Status: living list · Owner: G1 · Spec: [look-spec §3](look-spec.md#3-workstreams-disjoint-file-ownership) (ownership §3.1, order §3.2; the lead runs I-2) · Interfaces: [CONTRACTS.md](CONTRACTS.md).

## How to file a request

- Use this file when you need a change in a file you do not own (look-spec §3.1). Do not edit that file yourself. Running a script you do not own (`palette:check`, `i18n:check`, `size`) needs no request. Editing one does. A file the table does not list is the lead's: ask here first.
- Add one row per request: the next number (R1, R2, …), from → to (G2, G3 or lead), the file and the exact change (member, key, selector or line), and why (the spec or contract section). Keep it to one line where you can.
- Meanwhile, keep working against a placeholder in your own files (look-spec §3.2). Never delete or narrow a member another workstream may still use before I-3.
- The receiving workstream notes what it did in its own file, under "Done for other workstreams' requests". Then mark the row here **done by …**. The lead runs or answers anything still open at integration step I-2.

## Requests

| # | From → to | What | Why |
|---|---|---|---|

## Done for other workstreams' requests

(none yet)

## L0 (lead, 2026-10-10): what changed in G1's files

- The four colour names changed in the English catalogue (`color.0` Coral, `color.2` Mustard, `color.7` Violet, `color.11` Pink; look-spec §1.9, Appendix A, critic C14). Tests updated to match: `tests/unit/app/points-session.spec.ts` ("Mustard done."). Comments updated: `saves.spec.ts`, `resilience.spec.ts`, `tutorial-session.spec.ts` and the doc comments in `src/game/tutorial.ts`. One test title updated: `tests/unit/game/tutorial.spec.ts`. No assertion changed otherwise.
- Left for G1: the identifiers `TUTORIAL_CELLS.lavender` (`src/game/tutorial.ts`, asserted in `tutorial.spec.ts`) and the `LAVENDER` constant in `tutorial-session.spec.ts`. These are code names, not English text, so renaming them is up to G1. The `TUTORIAL_COLORS` comment now reads "Mint, Violet, Mustard, Coral" for today's `[4, 7, 2, 0]`. G1-2 changes both the value and the comment.
