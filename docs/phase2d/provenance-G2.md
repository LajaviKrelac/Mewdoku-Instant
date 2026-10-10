# Phase 2d provenance draft: workstream G2 (art, board, base tokens)

Status: draft for the lead to merge into [docs/provenance.md](../provenance.md) at I-5 ([look-spec](look-spec.md) Appendix B) · Date: 2026-10-10 · Author: Claude (Anthropic), workstream G2

## How this art was made

- **Decision D-2d-0 (user, 2026-10-10).** The user's own recording and screenshot of the original's game screen may be used as a look and layout reference: measuring sizes, positions and proportions and sampling colours are allowed. Tracing is not.
- **Drawings.** Every drawing below was written by an AI coding agent (Claude) as hand-typed SVG path data in TypeScript, from the written descriptions in [look-spec](look-spec.md) §1.4–§1.11, §1.14 and Appendix C. Where a shape could only come out like the original's (a left arrow, a cog, a play triangle), it is drawn with our own proportions on our 24- or 100-unit grid.
- **What was not used.**
  - No frame of the recording was traced, copied, or opened in an editor while drawing.
  - No source listed in [06 §4](../phase1/06-legal-and-originality.md) was opened.
  - No image, audio or text generator other than the coding agent itself was used.
- **Numbers from the recording.** These are measured sizes, positions and sampled colours. They come from `measure.md` and look-spec §1, never from pixels in our files:
  - the tile, gap and radius ratios;
  - the X's bar thickness, length and corner;
  - the card margin and padding;
  - the stack's rows and gaps;
  - the ten region colours and the page, ink, icon-ink, fish, badge, dot, toast and rule-card colours.
- **How the art was checked.** It was checked only against our own renders: a scratch art lab, and our build at 402 × 874 (`docs/phase2d/screenshots/G2-*.png`). The side-by-side comparison with the user's recording is built in the session scratchpad and is not committed (D-2d-0 d).
- **Byte counts.** "Bytes" is the symbol's markup length at run time. For the module, it is the esbuild-minified size change against `f9c0b8d`.
  - `sprite.ts`: +1.9 KB. This covers all new symbols, the shared X-rect helpers, the removed gear generator, `wrong-x` and the three rule icons.
  - `fish.ts`: −0.27 KB.
  - `rule-art.ts`: +0.84 KB, new.

## Art (SVG, hand-coded)

| Asset | File(s) | Method and words drawn from | Bytes |
|---|---|---|---|
| `icon-back` (the game bar's back arrow) | `src/ui/art/sprite.ts` (`art2d`) | One path on the 24 grid: a horizontal shaft and two head strokes meeting at the left, stroke 3.1 with round caps and joins, `currentColor`. The 20 × 17 box and the 3.1 stroke are measured numbers (look-spec §1.4). | 195 |
| `icon-gear` (redrawn; the 2c.1 line cog with a computed polar outline is retired) | `src/ui/art/sprite.ts` (`iconSymbols`) | A filled cog in `currentColor`. The body is a stroked ring (r 6, width 4.2), so its open centre (Ø 7.8) lets the white disc show through, as the spec's even-odd hole does. The six teeth are 5.4-wide round-capped strokes at 60° steps, pointing up and down. These are our own proportions on the 24 grid, not an outline copied from any cog. | 271 |
| `icon-play` (the video badge's mark) | `src/ui/art/sprite.ts` (`art2d`) | A right-pointing triangle filled and stroked in `currentColor` with round joins (rounded corners). | 167 |
| `tool-kitty` (the kitty helper's art) | `src/ui/art/sprite.ts` (`art2d`), `src/ui/art/cat-parts.ts` | Our own Tux head (phase2b §1.6, `catHead`) with the `wink` eyes and the `open` mouth, both already in our cat parts. The left eye is an open light-green iris. The right eye is a closed arc, drawn in ink because that eye sits on Tux's white blaze, where a light arc would not show. The open smile has the pink tongue. The asymmetric blaze and the notched left ear complete it. No new drawing; the viewBox is cropped to the head. | 2 605 (generated; about 80 B of code) |
| `tool-bulb` (the hint helper's art) | `src/ui/art/sprite.ts` (`art2d`) | A round glass bulb in `--gold` narrowing to a neck. It has a softer `--fish` shade along the lower glass and a white highlight ellipse (75 %). The screw base is two `--hard` violet rings with a lighter violet ring between them, plus a rounded tip. Hand-typed on the 100 grid; the viewBox is fitted to the art (21.3 × 34 at s = 1). | 763 |
| `tool-mouse` (the mouse helper's art) | `src/ui/art/sprite.ts` (`art2d`) | A grey mouse face in front view, with the colours given in look-spec §1.11. The round head is `#B8B4BC` with a lighter muzzle `#D9D6DC`. Two large round ears have Tux's pink `#F2A3B4` inside. It has bead eyes with a white catchlight, Tux's pink nose, two white front teeth with a thin grey edge, a small mouth line and three thin whiskers a side. Circles, ellipses and two short paths; the viewBox is fitted to the art (35 × 31.3). | 975 |
| `cat-head-flat` (the heads pill's head, D-2d-18) | `src/ui/art/sprite.ts` (`art2d`) | A plain cat-head silhouette, one closed path in `currentColor`. The head is wide and soft, slightly wider than tall. Two triangular ears are set a little outward, with softly rounded (quadratic) tips. The top edge between the ears is flat. No notch, no face, no outline. Drawn from look-spec §1.6's words on the 100 grid. | 252 |
| `art-flex` (the start toast's flexed arm) | `src/ui/art/sprite.ts` (`art2d`) | One silhouette on the 24 grid: a horizontal upper arm with a bicep hump, an elbow at the lower right, a forearm rising to a rounded raised fist. It is `--fish` gold with a `--fish-deep` underside and wrist crease and two `--fish-hi` highlights. No outline. | 620 |
| `icon-fish` (redrawn; the 2c.1 fish facing right with an ink outline is retired) | `src/ui/art/fish.ts` (`fishMarkup`, `FISH_BODY`), `src/ui/art/sprite.ts` | A plump round body with the head at the left, facing left. The forked tail sits at the lower right: two rounded lobes with a notch, the lower lobe in `--fish-deep`. It has a darker lower-body crescent in `--fish-deep`, a `--fish-hi` highlight on the upper body, three small scale arcs toward the tail and one `--ink-deep` eye dot. No outline. Drawn on the 24 grid. The tail was first drawn at 0° and turned 28° about the body's lower right, with the turned coordinates baked into the path. Not mirrored in RTL. The win pose draws the same markup larger (`illustrations.ts`). | 908 |
| `icon-fish-empty` (redrawn with the new silhouette) | `src/ui/art/fish.ts` (`fishOutlineMarkup`) | The 2c idea is kept: the same silhouette (tail, body) as one outline only, `--ink` at **40 %** (look-spec §1.5; was 30 %), around a `--life-empty` wash, with no eye, shade or scales. It is scaled about the fish's centre so its outer edge matches the full fish. | 754 |
| `mark-x` (redrawn; How to play) | `src/ui/art/sprite.ts` (`markSymbols`, `markRects`, `crossRects`) | The board's X: two white rounded rects crossed at ±45° about the centre of the 100 box (below). | 243 |
| `ruleDiagram(kind)` (the rule cards' 3 × 3 mini diagrams) | `src/ui/art/rule-art.ts` (new) | Cells are 10.2 squares at an 11.25 pitch on a 32.7 box, radius 1.5. Plain cells are `--rule-tile` tan; `colours` uses `--rule-tile-2` for its second region. A marked cell is a `--rule-mark` box with a white X: two bars 1.53 thick and 7.85 long, so the bars are 15 % of the box and the X spans 65 %. The cat cell shows our `#cat-idle` Tux at 90 %. **Our own three layouts** (look-spec §1.7), not the original's: colours, cat at (1, 0), X on (0, 0–2) and (2, 0); lines, cat in the centre, X on the four edge midpoints; space, cat at (0, 0), X on (0, 1), (1, 0), (1, 1). | 0.84 KB code; 1.8 KB markup |

## The board look (geometry from measured numbers; our own CSS)

| Item | File(s) | Method |
|---|---|---|
| The X glyph: two white rounded bars | `src/ui/board/board-cells.ts` (`markGroup`), `src/ui/art/sprite.ts` (`markRects`), `src/styles/board.css` | Two `rect`s per cell in `g.cell__xg` on the slot's 100-unit box, with values from `layout.mark` (measured on the user's recording, look-spec §1.10): 69 long, 18.2 thick, corner 6, centred, rotated ±45°. At slot 38 / tile 35 this gives a 6.9 px bar, 26.2 px tip to tip and a 21.5 px box. The fill is opaque white with no outline. Two edge rects, grown 3.5 per side and filled with `--xe` (the tile mixed 85 % toward `--ink-deep`), show only under `.board[data-patterns]` (D-2d-5). The wrong X uses the same rects in `--wrong`; the hint ghost uses the white rects at 40 %. Replaces the 2b round-capped strokes, their edge stroke and the dash draw-in (`xe-draw`, `--x-len`). |
| The X pop and the mouse's staggered X's | `src/ui/board/board-view.ts`, `src/styles/board.css` (`@keyframes x-pop`) | Ours (motion is not measured; the recording shows no X appearing). A new X scales 0.6 → 1.06 at 60 % → 1 over `fx.markPopMs` (140 ms, ease-out) about the cell centre. The mouse's X's pop `fx.mouseStaggerMs` (90 ms) apart, each hidden under `.fx-pend` until its turn. Reduced motion: no pop. |
| Board card and tiles | `src/styles/board.css`, `src/ui/board/board-view.ts` (`setSlot(slot, frame)`), `src/ui/board/layout.ts` (`gapFor`, `evenInsets`) | Measured ratios (look-spec §1.8): no shadow and no border on the card, radius `cardRadius × s`, padding `max(3, round(cardPad × s))`. The gap is `round(slot × 7.9 %)`; every tile is inset gap / 2. The tile radius is 11 % of the tile edge, published as `--cell-r`, a fraction of the slot. |
| The game screen's vertical stack | `src/ui/board/layout.ts` (`computeLayout`) | The measured rows and gaps of `layout.game`, all scaled by one factor s (look-spec §1.1, D-2d-1). Spare height goes above the bar (at most 62 s) and the rest below. The dev and e2e safe-area override (`--dev-safe-top` / `--dev-safe-bottom`) is read by the probe and by `--safe-*`. |
| Round icon buttons (`.btn--icon`) | `src/styles/base.css` | A white disc at a fixed Ø 37 px on Home and the event screen, with no border. It carries the warm `--shadow-btn` (a measured fit), an `--ink-icon` glyph at 22 px and a transparent hit area of at least 44 × 44 (`::before`). |

## Colours (look-spec §1.2, §1.9)

| Item | File(s) | Source |
|---|---|---|
| Region palette | `src/ui/art/palette.ts` (`PALETTE`, `PALETTE_DE00`, `PALETTE_CORE`, `HEAD_ORDER`, `paletteTier`, `regionColorsFor`), `src/styles/tokens.css` (`--r0…--r11`) | Ten colours sampled from the user's PNG screenshot (D-2d-0 a, D-2d-2): Coral `#D57374`, Apricot `#FFAA6D`, Mustard `#E4BB49`, Lime `#AED994`, Lagoon `#48B5B2`, Sky `#6BBCE7`, Violet `#9778D6`, Orchid `#EB85B7`, Slate `#A7BFD7`, Pink `#FAB4D0`. Mint `#52A982` and Cocoa `#B0855A` are ours, chosen by search in the measured L\*/C\* band (D-2d-10). Boards up to 10 × 10 use only the measured ten. `PALETTE_DE00` is recomputed by `palette:check`; the minimum pair is Sky / Slate at 10.40. `HEAD_ORDER` is the recording's order (around the wheel from green), with our two extras slotted in. |
| UI tokens | `src/ui/art/palette.ts` (`TOKENS`), `src/styles/tokens.css` | Sampled from the screenshot: page `#F7F2EF`, ink `#935A5A`, icon ink `#996767`, dot `#F34F4F`, toast `#FEF0C7` / `#DD9045`, rule card `#FBF4EE`, rule tile `#DDBEAA`, rule mark `#AF6D44`, fish `#F1AA22` / `#FED95D`, and the warm shadow and pulse fits. Darkened only to reach a contrast floor (D-2d-17): count badge `#DC2F2F` (measured `#E93636`), video badge `#03A84A` (measured `#02BE52`), fish shade `#D47E18` (measured `#D8811A`). Ours: `--page-2`, `--ink-3`, `--rule-tile-2`, `--wrong` `#6E0E25`, and `--ink-deep` (the 2c.1 ink, kept). |
| Event motif colours (lightened) | `src/ui/art/palette.ts` (`EVENT_PATTERN_COLORS`), `src/styles/tokens.css` (`--page-art` URLs) | Ours. Each motif `a` colour was mixed 15 % toward white so the new `--ink` keeps 4.5:1 on it (look-spec §2.3): lanterns `#FCE3CA` → `#FCE7D2`, snowflakes `#E0E8F3` → `#E5EBF5`, yarn `#FCE0E6` → `#FCE5EA`. |

## Retired in 2d (no longer ship)

| Asset | Why |
|---|---|
| The 2b/2c.1 X: round-capped white strokes over a `--xe` edge stroke, with the dash draw-in (`xe-draw`) | Replaced by the measured rounded bars and the pop (look-spec §1.10) |
| `wrong-x` symbol | It was unused; the wrong X is the board's rects in `--wrong`. The id stays in `SymbolId` for `dev/**` until I-3. |
| `icon-rule-colours`, `icon-rule-lines`, `icon-rule-space` | Replaced by `ruleDiagram`; the ids stay in `IconSymbol` for `dev/**` until I-3 |
| The 2c.1 line gear (polar outline, `gearPath()`), the 2c.1 fish (facing right, ink outline, top fin, belly band) and its 30 % empty outline | Redrawn above |
| The 2c.1 palette and the page, ink, fish and wrong tokens | Replaced by the measured values; css-rules' retired-look guard now also fails on the 2c.1 values (`RETIRED_2D`) |
