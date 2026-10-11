# Phase 2e requests from G2 (art, board, tokens)

Status: living list · Owner: G2 · Spec: [spec §8.1](spec.md#81-ownership-disjoint-every-new-file-starts-with--owner-g1g2g3g4-phase-2e) (ownership), [CONTRACTS §9, §12](CONTRACTS.md) · The lead closes open rows at I-2.

## How to file a request

One row per request: the next number (R1, R2, …), from → to, the file and the exact change, and why (spec or contract section). The receiving workstream marks the row **done by …**; the lead answers anything still open at I-2. Meanwhile G2 keeps working against placeholders in its own files.

## Requests

| # | From → to | What | Why |
|---|---|---|---|
| R1 | G2 → G3 | In the `ladder` chunk's views (`bracket-list.ts`, `ladder-sheet.ts`, `ladder-result.ts`, `nickname-sheet.ts`): call `mountLadderArt(doc)` (`src/ui/art/ladder-art.ts`) once when the view is created (idempotent, cheap). It adds the medals, the 12 avatars, the hearts, **the two reward chests**, the name tag and the pencil, shuffle and info glyphs to the sprite. A `<use>` made before the call draws as soon as the symbol arrives. **Do not import `ladder-art.ts` from a main-bundle module** (Home, the chip, the strip): that would put the ranking art in the first load (spec §7.9; `art-2e.spec` walks the static imports from the entries and fails if it does). **Done by G3** (requests-G3, "Done for other workstreams' requests"). | CONTRACTS §9, spec §7.9 |
| R2 | G2 → G3 | Avatars: draw a row's or the name sheet's avatar with `icon(avatarSymbol(row.avatarId))` (`avatarSymbol` from `ladder-art.ts`; it maps an id to `avatar-0` … `avatar-11` and never returns an id we did not draw). Each avatar is a round badge with its own soft background disc, so it needs no CSS disc; size it square (28–32 px in rows). **Done by G3.** | Appendix C (each avatar reads at 28 px), spec §2.4 |
| R3 | G2 → G3 | The day-7 victory row and the reward chest. **Answered by G3: no change needed**, because the victory's streak row draws the first-load steps (the 7th is `streak-step-chest`). Note for later: `reward-chest` / `reward-chest-open` now live in `ladder-art.ts`, with the result card, not in `lazy-art.ts`. Moving them kept the lazy-art chunk inside its 4.4 KB row; with them it measured 6.6 KB. If the victory row ever wants the big open chest, it must be on a view that has called `mountLadderArt()`. | Appendix C, size-check row "Lazy JS (lazy art)" |
| R4 | G2 → lead | **I-4 decision (CONTRACTS §9 "G2 decides with the lead at I-4")**. G2 put `icon-streak-flame` and the four `streak-step-*` in the **first-load sprite**, because Home's strip (main bundle, spec §7.9) draws them. Cost: **+1.93 KB min / +0.67 KB gzip** on the first load (`sprite.ts` + `palette.ts`, esbuild against `3389380`). Spec §7.9's ≈ 5 KB main allowance did not list this art. If the first-run time grows by more than 0.15 s and the strip moves to the core lazy chunk (§7.9's rule), move `art2e()` with it, into `lazy-art.ts` or a module the strip imports. It is one function and nothing else depends on its place. The ranking art is lazy only: `ladder-art.ts` 8.4 KB min / 3.5 KB gzip + `palette-2e.ts` 1.9 KB / 0.9 KB, in the `ladder` chunk (its placeholder row is now 26 KB). | spec §7.9, CONTRACTS §9 |
| R5 | G2 → lead | `tests/unit/layering.spec.ts` `checkScriptEdge` (line ≈ 207): also allow `e.target === 'src/ui/art/palette-2e.ts'` (the ranking art's colour table: pure data, imports only `palette.ts`; never in the first load). Then G2 makes `scripts/palette-check.ts` `main()` pass palette-2e's tables to `artContrast()` / `artInfo()`, so the CLI `palette:check` also enforces the medal-number rows and prints the avatar rows. Until then those rows are enforced in `tests/unit/ui/palette-check.spec.ts` (vitest), and the CLI checks the `--cheer`, `--step-line` and step-edge rows. | Phase 2e palette-check rows, layering (scripts import only `palette.ts` of the art) |

## Done for other workstreams' requests

(none filed to G2 so far)

- **G2 itself, in its own test file** (`tests/unit/ui/css-rules.spec.ts`, the primary-button rule A11Y-CONTRAST-1). G3's new primary-button classes are added to the `PRIMARY` list: `ladder-result__double`, `ladder-result__ok`, `ladder-sheet__ok`, `nickname__save`, `settings__confirm-delete`. Before this, the test failed on `.ladder-result__double`. Now any font-size rule on those buttons is checked for ≥ 24 px (white on `--accent`). **A new primary button class needs a row here**, so G2 can add it.

## Notes from G2 for the others (no action needed)

- **Where each symbol lives.** `IconSymbol` (`src/ui/art/sprite.ts`) widens with every Appendix C id, plus `AvatarIndex` (0 … 11) and `AvatarSymbol`.
  - **First-load sprite** (`sprite.ts`): `icon-streak-flame`, `streak-step-empty`, `streak-step-done`, `streak-step-today`, `streak-step-chest`.
  - **Ranking art, lazy** (`ladder-art.ts`, `mountLadderArt`): `medal-1` … `medal-3`, `avatar-0` … `avatar-11`, `icon-heart-line`, `icon-heart-fill`, `reward-chest`, `reward-chest-open`, `nick-tag`, `icon-pencil`, `icon-shuffle`, `icon-info`. The module also exports `ladderArtSymbols`, `avatarSymbol`, `ART_AVATAR_COUNT` (= `AVATAR_COUNT`, tested), `MEDAL_FACE` and `HEART_POP` / `HEART_POP_MS`.
  - `lazy-art.ts` is unchanged.
- **Streak steps.**
  - `streak-step-empty` takes `--step-line` (a token, `#A6827C`, 3.10 on `--page`) and `--step-wash` (default white). To mark "the next step" (spec §5.3 "step 4 outlined"), set `--step-line: var(--accent-deep)` on that step (4.42 on `--page`). The lab captures use exactly that.
  - `streak-step-chest` opens with `--chest-open: 1; --chest-shut: 0` (spec §5.3 "7 done, the chest open").
  - There is no "missed" marker: a missed day resets (§5.1), and the strip shows empty steps with a neutral line.
- **Medals.**
  - The art has no number. Centre the rank number on the face at `MEDAL_FACE` (x 50 %, y 53 %, face radius 29 % of the box), in `--ink-deep`. palette-check holds it at ≥ 4.5:1 on every face and every paw emboss (4.91–10.42). `--ink` (#935A5A) would not pass on the gold face.
- **Hearts.**
  - `icon-heart-line` is `currentColor` (`--ink-icon` reads 4.68 on white and 3.96 on `--accent-soft`) with the `--icon-fill` wash.
  - `icon-heart-fill` paints `--cheer` (a new token, `#D9466A`: 4.17 on `--card`, 3.54 on `--accent-soft`).
  - Both have the same outer size, so swapping them on a tap does not move the row.
  - The like motion: `el.animate(HEART_POP, { duration: HEART_POP_MS, easing: 'ease-out' })` on the heart's `<svg>`, skipped with reduced motion (spec §7.7, "no heart pop").
- **Avatars.**
  - Each avatar is a complete round badge (box 0 0 100 100, disc r 47).
  - For the name sheet's radio group, each needs an accessible name from G3, e.g. "Picture 3 of 12". The art is `aria-hidden` through `icon()`.
- **The name tag** (`nick-tag`, 48 box) is drawn for a header at 40–64 px. Below 32 px the bell and the paw become specks.
