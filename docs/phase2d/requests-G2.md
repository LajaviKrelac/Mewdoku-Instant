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
| R1 | G2 → lead | `dev/{art,b,board,shell}-harness.html`: `<meta name="theme-color">` `#FAF6F0` → `#F7F2EF` (the new `--page`). Afterwards, remove `PENDING_R1` from `tests/unit/ui/css-rules.spec.ts` ("theme-color is --page"); G2 does that if it is done before I-2, otherwise the lead at I-2. | look-spec §1.2 (`index.html`'s theme-color follows `--page`; G2 changed it). css-rules checks the dev pages too and tolerates only the old value until then. |
| R2 | G2 → lead | At I-1: `dev/art-harness.ts:117` drops `'wrong-x'` and `dev/board-harness.ts:205` drops `'icon-rule-colours'`, `'icon-rule-lines'` and `'icon-rule-space'`, because their drawings are deleted in 2d. Then at I-3, delete those ids from `SymbolId` / `IconSymbol` in `src/ui/art/sprite.ts`; they are marked `@deprecated phase2d`. The harnesses' `board.setSlot(L.slot)` should become `board.setSlot(L.slot, { pad: L.pad, radius: L.radius })` so they show the 2d card. | look-spec §6.2 (dead art deleted); the ids stay only so `tsc` over `dev/**` stays green until I-1 |
| R3 | G2 → G3 | `src/ui/overlays/how-to-play.ts` `miniBoard()`: the redrawn `mark-x` is the board's X on the **slot's** 100-unit box, so the X spans 69 % of the box. Draw it over the tile's slot (`x − GAP / 2`, `y − GAP / 2`, size `TILE + GAP`) instead of the 2b inset 4, so the X has the board's proportions; it is 8 px wide today. Optional, for the same look: mini-tile `rx` = 11 % of the tile (2.2 at `TILE` 20). | look-spec §1.10 (`mark-x` redrawn; How to play uses it), §1.8 |

## Done for other workstreams' requests

(none filed to G2 so far)

## Notes from G2 for the others (no action needed)

- **Tool art boxes.** Each `tool-*` symbol's viewBox is fitted to its art, so `hud.css`' measured icon sizes draw the art edge to edge: kitty `6 3 88 88` (34.7 × 34.3), bulb `18.5 1.5 63 97.5` (21.3 × 34), mouse `1 4.5 98 88` (35 × 31.3).
- **`cat-head-flat`.** One path in `currentColor` on a 100 box. Its colour and its 0.5 opacity come from the heads pill (look-spec §1.6).
- **`icon-gear`.** Filled with `currentColor`, with no `--icon-fill`; the round buttons set `color: var(--ink-icon)` (`.btn--icon`).
- **`icon-fish`** faces left and has no outline (look-spec §1.5). **`icon-fish-empty`** keeps the same box; its outline is `--ink` at 40 %.
- **New G2 exports beyond CONTRACTS.**
  - `paletteTier(n)` in `palette.ts`: the tier of §1.9.
  - `markRects()` and `crossRects()` in `sprite.ts`: the X geometry.
  - The `BoardFrame` type, re-exported by `board-view.ts`.
- **`computeLayout` already returns the final §1.1 values.** The 2b names (`topBar`, `pills`, `chips`, `tools`) carry the 2d values. `tools` is now the disc diameter; the safe bottom is no longer added.
- **`--shadow-btn` scales on the game screen.** It is re-declared on `.screen--game`, so `box-shadow: var(--shadow-btn)` there uses the screen's `--s`; on `:root` it resolves with `s = 1`. `hud.css` can use the token for the top discs and the helper discs.
- **Dev safe-area override.** `--dev-safe-top` and `--dev-safe-bottom` on `:root` feed both `readViewport`'s probe and the `--safe-top` / `--safe-bottom` tokens (look-spec §1.1). Nothing in `src/` sets them.

## L0 (lead, 2026-10-10): what changed in G2's files

- `tests/unit/ui/css-rules.spec.ts`: the "Phase 2c.1: the pills row" block (with its `ruleOf` helper) moved to G3's new `hud-css.spec.ts`. So did the `.tool__badge` half of "small white text on orange uses --accent-text" (critic C13). The `base.css` half (`.btn--primary .btn__badge`) stays here, as "… count badges on primary buttons".
- **New** `tests/e2e/visual-board.spec.ts` (yours): the mid-game board capture moved unchanged from `visual.spec.ts`, with copies of its helpers. It runs on `web-390`, `web-320` and `web-1280` (`playwright.config.ts`). It still writes `G2-visual-game-<width>.png` under `docs/phase2c/screenshots/` (or `VISUAL_OUT`). The test's HUD assertions moved with it unchanged: three fish, the points pill "1,248" and the lives label. Agree with G3 where they go once the HUD changes.
- Colour names (look-spec §1.9, critic C14): `tests/unit/ui/board-view.spec.ts` now expects "Violet" and "Mustard". The name comments in `src/styles/tokens.css` (`--r0`, `--r2`, `--r7`, `--r11`) and in the `PALETTE` doc comment in `src/ui/art/palette.ts` now give the new names, next to the 2c hex values until your palette lands.
- Left for G2: `scripts/palette-check.ts` `NAMES` (the output labels) still lists Strawberry, Lemon, Lavender and Moss. It is your script, and §2.3 rewrites it.

## I-2 (lead, 2026-10-10): status of every request

| # | Status |
|---|---|
| R1 | **Done** (I-1): the four `dev/*-harness.html` pages carry `#F7F2EF`; `PENDING_R1` is gone from `css-rules.spec.ts`, which now also fails on any 2d-retired value in the dev pages. |
| R2 | **Done** (I-1 / I-3): the harnesses no longer use `wrong-x` or `icon-rule-*` and call `setSlot(slot, { pad, radius })`; the four ids are deleted from `SymbolId` / `IconSymbol`, and `setSlot`'s frame is required (the 2b `boardPad` / `boardRadius` reads are gone). |
| R3 | **Done by G3** (`how-to-play.ts` `miniBoard()`). |

---

## 2d.1 (helpers-spec, 2026-10-10)

Spec: [helpers-spec §7](helpers-spec.md#7-workstreams-interfaces-tests-and-acceptance) (ownership §7.1, order §7.2; the lead runs I-2) · Interfaces: [CONTRACTS-2d1.md](CONTRACTS-2d1.md). "How to file a request" above still applies, but ownership now follows helpers-spec §7.1, not look-spec §3.1. Number the 2d.1 rows **H1, H2, …** so they never clash with the 2d rows above.

### 2d.1 Requests

| # | From → to | What | Why |
|---|---|---|---|
| H1 | G2 → G3 | `src/ui/fx/cat-burst.ts`: draw the **shards only**. The board draws the cat sequence's **light on the neighbours and the six twinkles** inside the cat's cell (`.cell.fx-cat > .cell__light`, which overflows the tile, z-index lifted), together with the flash and the halo. So please do not draw a second light or twinkles in the fx layer. | helpers-spec §7.3 G2 item 3 gives the light and twinkles to the board, while CONTRACTS-2d1 §8 lists them under G3. One owner avoids a double glow. The light and twinkles are tile-relative (1.5 T) and end by 733 ms, inside the board. The shards leave the board, so they stay in the fx layer (§2.4). |
| H2 | G2 → G3 | `src/ui/fx/celebrate.ts`: when the lazy fx chunk loads, call `mountLazyArt()` from `src/ui/art/lazy-art.ts` once, before the first `fx-star4` or `fx-shard*` use. It is idempotent and does nothing before the sprite is mounted. | The star and the three shards left the first-load sprite (LOAD TIME: the first screen never draws them). Without the call they still appear, but only once the board's mouse chunk has been prefetched (`MOUSE_PREFETCH_MS`, 1.5 s after a board entry, which also mounts them). A cat placed earlier than that would get invisible shards and no star. |
| H3 | G2 → lead | Allow one new G2 stylesheet, `src/styles/board-mouse.css`, imported by the lazy `src/ui/board/board-mouse.ts`. Vite's `cssCodeSplit` then ships it with the `board-mouse` chunk. The `.board__mouse*` rules and the `mouse-*` keyframes (about 2.4 KB minified) would move there out of the first-load `board.css`. **Optionally, also the cat sequence:** `board.css`'s "the cat-placed sequence" block (`.cell.fx-cat`, `.cell__flash`, `.cell__light`, the `cat-*` / `flash-*` / `light-*` / `twinkle` keyframes, about 3.2 KB minified) and `board-cat.ts` could join that chunk. A cat placed before the 1.5 s prefetch lands would then get only the plain cat (no sequence), the same rule the mouse follows now. | First-load CSS grew +7.5 KB raw (+1.6 KB gzip) with 2d.1's board motion. Measured on the FBIG build, minified, by section: mouse 2.4 KB, cat sequence 3.2 KB, ghosts and hint 1.7 KB, X and its draw-in 1.4 KB, waves 0.9 KB. The mouse's part is not needed until a mouse run, which always comes after its O2 card. The cat sequence is not needed until the first cat. Not done: §7.1 does not list the file. |
| H4 | G2 → lead | Config, if wanted (G2 cannot edit `config.ts`). (a) `layout.catScale` (0.84) is no longer read by the board. The resting cat's box is `CAT_BOX = [6.8, 6.9, 86.4]` in `board-cells.ts` (helpers-spec §4.7: 0.78 T wide, 2 % T up; our art measures 0.80 × 0.76 T in the build). Either mark the key `@deprecated phase2d.1` or replace it with the box. (b) `layout.hintDim` is unread: the board's hint dim is gone (§3.3). Its token `--hint-dim` and the board's write of it are removed. | One source of truth for the values JS reads (parity-spec §0.4) |
| H5 | G2 → lead | `dev/look-compare.ts`: our level 96 now draws **Denim** in place of **Pink**. Its colours are 0–8 and 10, because n ≤ 11 boards draw from the 11 measured colours (§6.2). The "10 tile colours at ΔE00 ≤ 1" check and any letter → palette map built on 2d's colours may need updating. The board e2e capture moved from level 785 to **794** for the same reason: 785's top-left region is Denim now. | helpers-spec §6.2 (D-2d1-10) |
| H6 | G2 → G3 (I-3) | `src/styles/fx.css`: the board no longer uses `.cell.fx-drop` / `@keyframes cat-drop` (every correct cat plays the 2d.1 sequence), `@keyframes ghost-pulse` (the ghost is the outline pop), or `.cell__spark` / `@keyframes spark` (the kitty's 2b sparkle). They can go at I-3. `fx.css`'s `ghost-bob` and `ghost-clear` are still used by `board.css`. | Dead CSS in the first load (§7.9) |

### 2d.1 Done for other workstreams' requests

*(none yet)*

### 2d.1 Notes from G2 for the others (no action needed)

- **Verified (2026-10-10, private build in scratch):**
  - `tsc --noEmit` clean; full `vitest run` 121 files, 2462 tests, all pass; `palette:check` OK.
  - `visual-board.spec.ts`: 14 passed, 10 skipped by design (the 2d.1 frames run on web-390 only). It wrote `docs/phase2d/screenshots/G2-2d1-*.png` and refreshed `G2-board-*.png`.
  - `smoke`, `layout` and `winflow` pass on web-390.
  - `visual.spec.ts` (G3's) has 2 failures on web-390, both from other workstreams' 2d.1 work in progress, not from the board:
    - the recording-state test waits for `.start-toast[data-kind="level"]`, which the tickers replace;
    - the 12 × 12 Score test waits for `.points-pill__chip`, which `points-flight.ts` no longer draws.
- **Size, FBIG build** (the same tree with G2's files at 7048674 against the current tree; gzip -9):
  - `index.js` +7,864 B raw / +2,811 B gzip;
  - `index.css` +7,502 B raw / +1,608 B gzip;
  - new lazy `board-mouse.js` 4,783 B raw / 2,225 B gzip (size-check's "Lazy JS (core)" row).
  - `size-check` was already over several ceilings on that base (Main JS 309.0 / 307, CSS 46.4 / 46, Lazy JS (core) 88.6 / 74), so the I-4 ceilings need the lead either way.
  - H3 would take 2.4 to 5.6 KB back out of the first-load CSS.

- **Build landed (2026-10-10).**
  - **Board events** (CONTRACTS-2d1 §8):
    - `MARKED` (tap, paint, Apply) draws every new X in at once (`.cell.fx-mark`).
    - `MARKED { source: 'mouse' }` plays the visits (`.board__mouse[data-cell][data-face]`, `.cell.fx-pend`, `.board[aria-busy]`) in event order. The timing comes from G1's `mouseVisitMs` / `mouseLandMs` / `mouseRunMs`.
    - `CAT_PLACED` (any source) plays the cat sequence (`.cell.fx-cat`, `.cell__flash`, `.cell__light`), and `CAT_REMOVED` cancels it.
    - `UNITS_DONE` bumps the waves (`.cell.fx-wave`, inline `--wd`; a tile in two units also gets `.fx-wave2` with `--wd2`).
    - `setHighlight({ kind: 'hint' })` gives every Empty effect cell its outline ghost (`path.cell__xo`) and delay (`--gd`).
  - **The board's hint styling is gone:** the dim, the focus ring and the ghost pulse.
  - **The mouse's visits are a lazy chunk.** `board-view.ts` exports `loadMouseRun()` and `MOUSE_PREFETCH_MS`. The board prefetches the chunk 1.5 s after its entry. A mouse `MARKED` that comes before it has loaded hides its X's at once, and the run starts when the chunk lands, timed from the `MARKED`.
  - **The board draws the light and the twinkles** of the cat sequence (H1). G3's `cat-burst.ts` already draws only the shards.
  - **Bar groups:** the X's edge rects sit in their own pair of bar groups under the white pair (four `g.cell__xb` per cell). This keeps both edges under both whites with Colour patterns on. `.cell__xg rect.cell__x` still finds the two white bars.
- **S0 landed (2026-10-10).** `palette.ts`: `PALETTE[4]` = Denim `#5B75B2`, `PALETTE_CORE` (11), `paletteTier` (n ≤ 11 the core, 12 all), `HEAD_ORDER` (the ring), `headOrderFor(colors, puzzleId)`, `isDarkTile(i)`, the tokens `plus`, `done-top`, `done-bottom`, `done-line`, `hint-card`, `apply` and the new `wrong`, `toast-fill`, `toast-line` values (also in `tokens.css`). `board-fx.ts`: `ghostOrder`, `waveOrder`, `xOutlinePath`. `sprite.ts`: `cat-wink`, `board-mouse` + `board-mouse-eyes | -lids | -grin`, `fx-star4`, `fx-shard` (+ two variants `fx-shard-2`, `fx-shard-3`), `art-paw-cap`, `art-bolt`, `art-star`; `CatMood` gains `'wink'`. Since the build, the board mouse's parts, `fx-star4` and the shards are in the lazy `art/lazy-art.ts` (`mountLazyArt()`, H2), and the ticker art is in `art/helper-art.ts`.

### 2d.1 L0 (lead, 2026-10-10): what changed in G2's files

- **`color.4` "Mint" → "Denim"** (helpers-spec §6.2). Only the name changed at L0:
  - `tests/unit/ui/board-view.spec.ts`: the board comment now names the colours "Denim Violet Mustard Coral".
  - `tests/unit/ui/art-a11y-fx.spec.ts`: two test titles changed. One now ends "… Denim (4, still the 2d value until helpers-spec §6.2) and Cocoa (9) are the extras". The `HEAD_ORDER` title now lists "Lime, Denim, …". No assertion changed.
  - `tests/unit/ui/palette-check.spec.ts`: the comment over `from(4) ≥ 13.5`.
  - `src/ui/art/palette.ts`: doc comments only (the file header, `PALETTE`, `HEAD_ORDER`, `regionColorsFor`).
  - `src/styles/tokens.css`: the palette block's heading comment and the `--r4` comment.
  - **No value changed.** `PALETTE[4]` is still `#52A982` and `--r4` is still `#52a982`. `PALETTE_CORE`, the tiers, `HEAD_ORDER` and `PALETTE_DE00` are still 2d's. Your §6.2 work sets them. The comments say "until helpers-spec §6.2"; rewrite them when you do.
- **`tests/unit/ui/css-rules.spec.ts`:** `expect(cfg.fx.markPopMs).toBe(140)` is now `170` (helpers-spec §0.6, §1.5).
  - The same test still checks for `board.css`'s fallback `var(--x-pop-ms, 140ms)`. That file is yours, and §4.4 reworks the X animation, so update the CSS and its regex together.
  - Until then the inline `--x-pop-ms` that `board-view.ts` sets already gives 170 ms.
- **Left for G2:** `scripts/palette-check.ts` `NAMES[4]` (the report label) is still `'Mint'`. It is your script, and §6.2 reruns it.
- **Config you read** (read-only):
  - `fx.markDraw`, `fx.mouse`, `fx.catPlaced`, `fx.unitDone.waveStepMs`, and `fx.hint.ghostFirstMs` / `ghostStaggerMs` / `ghostPopMs`.
  - `fx.markPopMs` 170: from now on only the mouse's X pops.
  - `kitty.revealMs` 820: the board's surprised kitty and `board-fx.ts`'s cleanup read it. `board-view.spec` passes unchanged.
  - `fx.mouseStaggerMs` is @deprecated phase2d.1. `board-view.ts` reads it until your mouse run lands, and the reader goes at I-3.
