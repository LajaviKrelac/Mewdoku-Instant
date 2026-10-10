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
| R1 | G3 → G2 | `src/styles/tokens.css` `--shadow-btn` (lines 137, 171) computes `var(--s, 1)` on `:root`, where `--s` is never set, so it never scales with the game screen. Either declare `--shadow-btn` again on `.screen--game` (where game-screen.ts sets `--s`), or leave it: G3 keeps its own scaled copy for the game bar's discs and the helper discs (`hud.css`, `.top-bar--game .top-bar__btn, .tool__disc`). If G2 makes the token scale, G3 drops that copy at I-2 (about −120 B of first-load CSS). | look-spec §1.4, §1.11 (the warm shadow scales with s) |
| R2 | G3 → G2 | `src/styles/base.css` `.btn--icon::before` (the 44 × 44 hit area) has `border-radius: 50%`. Its corners therefore miss a tap, and an `elementFromPoint` probe at the corners of a 44 × 44 square fails. G3 overrides it in the game bar (`.top-bar--game .top-bar__btn::before { border-radius: 0 }`). Home's and the event screen's round buttons still have round hit areas; a square one (radius 0) would match the game bar's. | look-spec §1.1 Touch targets (critic C6) |
| R3 | G3 → G1 | `tests/e2e/layout.spec.ts` "2d: every round button keeps a 44 × 44 hit area": at 320 × 568 with no safe area, the game bar's discs sit 5.5 px from the top (disc centre y 18.6, from G2's `--y-top` and look-spec §1.4's 7.6 s). The top corners of the 44 × 44 square are then at y −2.9, off the screen, so `elementFromPoint` returns null ("nothing"). The hit areas themselves are fine: every probe inside the viewport hits. Please clamp each probe point into the viewport (`Math.min(innerWidth - 0.5, Math.max(0.5, x))`, the same for y), as `visual.spec.ts` does; a tap at the screen's edge lands on the disc. | look-spec §1.1, §1.4 |
| R4 | G3 → lead | The first-load CSS row in `scripts/size-check.ts` (43.5 KB) is exceeded. The private e2e build's `index-*.css` is 48,207 B against a ceiling of 44,544 B. G3's sheets grow by +4,031 B minified (+757 B gzip); G2's grow by +687 B. The per-sheet table is under "Notes from G3". Please re-set the ceiling at I-4 (the 2d HUD, the heads pill, the cards, the three helpers with their pulse, the start toast), or name a sheet to trim further. | look-spec §6 (bundle), the L0 note "49 B headroom" |
| R5 | G3 → lead | CONTRACTS §7 and look-spec §4.6: the Score column's label is `.points-pill__name`. `.points-pill__label` stays the "+N" chip's host, from the 2c.1 counter builder (`buildCounter` in `pills.ts`, shared with the period counter). Please rename the label in the docs at I-5 (this answers G1's R3). | CONTRACTS §7 |
| R6 | G3 → lead | At I-3, these interfaces become required (they are optional until then): `GameView.pulse`, `mouse`, `videoRefill`, `bannerBand` and `settingsDot`; `HomeView.settingsDot` and `EventView.settingsDot`; `GameScreenCallbacks.onMouse`; `GameScreen.playStartToast`; `ToolBarProps.mouse`, `videoRefill` and `pulse`; `ToolBarCallbacks.onMouse`; `PillsProps.colors`, `regionsDone` and `boardId`. Also at I-3, delete the deprecated `PillsProps.compact` and `points` (no longer read). | look-spec §3.2 step 4 |

## Done for other workstreams' requests

- **G1 R1** (hit areas of the game bar's discs): done. `.top-bar--game .top-bar__btn::before` is a 44 × 44 square, so its corners hit. `.top-bar__mid` takes no pointer events. The bar is raised (`z-index: 1`) so its hit areas reach over the pills row at 320 px. `visual.spec.ts` checks all five round buttons at 320, 390 and 1280. The remaining failure of G1's own probe at 320 is off-screen points: see R3 above.
- **G1 R2** (the coach card over the top bar at 320 × 568, step 2): done in `coach.ts`. When no slot keeps the card clear of the top bar and the board, "Got it" moves beside the text (`.coach__card[data-row]`, a shorter card). The card is placed again and keeps the new layout only when it covers less. At step 2 it now sits in the bottom slot, over the helpers (479–556 px). `layout.spec.ts` "the tutorial coach never covers…" passes at 320, 390 and 1280. Unit test: `coach-toast-rotate.spec.ts`.
- **G1 R3** (`.points-pill__label` vs `.points-pill__name`): left for the lead's docs (R5 above). The DOM stays as is, because the chip host is shared with the period counter.
- **G2 R3** (How to play mini-board X over the slot): done. `miniBoard()` draws `mark-x` over the tile's slot (`x − GAP / 2`, size `TILE + GAP`), and the mini tiles' corner is `rx` 2.2 (11 % of the 20 px tile). See `G3-visual-howto-*.png`.

## L0 (lead, 2026-10-10): what changed in G3's files

- **New** `tests/unit/ui/hud-css.spec.ts` (yours). It holds the "Phase 2c.1: the pills row" block and the `.tool__badge` check, both moved unchanged from G2's `css-rules.spec.ts` (critic C13). The helpers are copies, not imports.
- `tests/e2e/visual.spec.ts`: the mid-game board capture moved to G2's new `visual-board.spec.ts`. Its HUD assertions went with it unchanged: three fish, the points pill and the lives label.
- English colour names (look-spec §1.9, Appendix A, critic C14): in `src/i18n/en.ts`, `color.0` Strawberry → Coral, `color.2` Lemon → Mustard, `color.7` Lavender → Violet, `color.11` Moss → Pink. Tests updated: `sanity`, `hint-text`, `coach-toast-rotate`, `review-fixes`, `review2b-fixes` and `format.spec`. The `format.spec` snapshot contains no colour name and is unchanged. Example names in comments updated: `coach.ts`, `hint-text.ts`, `how-to-play.ts`, `announcer.ts`. So were the translator notes in `src/i18n/meta.ts` (`unit`, `color`, `sources`, the `color.` group note).
- Left for G3 (the redraft):
  - The 16 locales are untouched. `npm run i18n:check` passes with 64 new stale-draft warnings: 4 keys × 16 locales. `docs/i18n/drafted-from.json` was deliberately not rewritten.
  - `meta.ts` `SAME_AS_ENGLISH.id` lists `color.2` and `color.7`. Indonesian "Lemon" and "Lavender" no longer equal the English, so those entries are now stale.
  - `meta.ts` `SAMPLES.color` is still `'Lavender'`, the width sample for `{color}`. It was kept so the length check stays the same.
  - `docs/i18n/glossary.md` and `review-log.md` still use the old names.

## Notes from G3 for the others (no action needed)

- **CSS bytes per stylesheet** (raw → raw; esbuild-minified → minified; base `f9c0b8d`, measured 2026-10-10):

  | Sheet | Raw (B) | Minified (B) | Δ minified |
  |---|---|---|---|
  | `hud.css` | 10,262 → 15,829 | 5,509 → 8,647 | +3,138 |
  | `fx.css` | 15,418 → 16,637 | 7,945 → 8,588 | +643 |
  | `overlays.css` | 9,964 → 10,162 | 6,767 → 6,609 | −158 |
  | `screens.css` | 8,623 → 8,854 | 3,863 → 4,077 | +214 |
  | `i18n.css` | 4,109 → 4,989 | 793 → 987 | +194 |
  | **First load (G3's five)** | | 24,877 → 28,908 | **+4,031** (gzip +757) |
  | `overlay-chunk.css` (lazy) | 39,446 → 40,465 + the coach row rules | 26,199 → ~26,850 | ≈ +650 |
  | `events-chunk.css` (lazy) | 6,300 → 6,300 | 3,595 → 3,595 | 0 |

  Trims already made: one shared warm shadow for the discs, one rule for both bar columns, a single `--vf` fit factor, and logical margins in place of the physical RTL overrides. Also dropped: the cat counter, the points pill in the row, the tight fallback, the compact pill sizes, `fx.css`' X-draw rules, `.pill--bump .pill__icon` and the old chip CSS. What remains is the 2d HUD itself: the bar, heads, cards, three helpers with badges and the pulse, and the start toast.
- **New G3 exports beyond CONTRACTS** (all additive):
  - `src/ui/hud/game-bar.ts`: `createGameBar`, `GameBarProps`, `GameBarCallbacks`, `GameBarView` (`playEvent`, `fit`), `barValue(suffix)`.
  - `src/ui/hud/top-bar.ts`: `iconButton`, `setSettingsDot(gear, on)`.
  - `src/ui/hud/pills.ts`: `buildCounter`, `CounterSpec`, `CounterMotion`, `Counter`, `wrapCount`, `pointsMotion`, `headScale(heads, fish)`, `headColors(colors, n)`.
  - `src/ui/fx/start-toast.ts`: `createStartToast`, `startToastPlan`, `StartToastKind`.
  - `src/ui/overlays/coach.ts`: `badgeReach`, `softCover`.
  - `src/ui/screens/game-screen.ts`: `HelperKind`, `fbShift()`.
- **Selectors for e2e specs** (G1's smoke, winflow, events and layout specs): the heads pill is `.pill--heads .head[data-done]`. The Score number is `.top-bar--game .points-pill__n`, its label `.points-pill__name`, its "+N" `.points-pill__chip`. The back disc is `.top-bar--game .top-bar__btn--back` (aria-label "Back"), the gear `.top-bar--game .top-bar__btn--settings` with `.top-bar__dot`. The helpers are `.tool--paw`, `.tool--bulb` and `.tool--mouse` (`[data-off]` when hidden; `[data-pulse]` while pulsing), with `.tool__badge`, `.tool__badge--video` and `.tool__badge--free`. The start toast is `.start-toast[data-kind]`. The cat counter (`.pill--cats`) and the in-row points pill are gone.
- **CSS variables on `.screen--game`** (game-screen.ts, from G2's `computeLayout`): `--s`, `--col-w`, `--y-top`, `--bar`, `--pills`, `--rules`, `--tools`, `--g-bp`, `--g-pr`, `--g-rb`, `--g-bt`, `--g-tb`, `--g-bottom`, `--band`, `--board`, `--pulse-ms`, `--pulse-scale`, and `--fb-s` / `--fb-e` (the FB safe-zone shift at the inline start or end). While the game screen is mounted, `<html>` gets `--play-band`, `--play-band-bottom` and `--toast-bottom`, plus `data-play-band='1' | '0'`. A newer screen's values are never cleared by an older screen's destroy.
