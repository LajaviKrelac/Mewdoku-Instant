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

---

## Phase 2d.1 (helpers-spec, 2026-10-10)

### How this art and motion were made

- **Decision D-2d1-0 (user, 2026-10-10)** under D-2d-0's terms: the user's three recordings (mouse, cat, bulb) and two stills may be used to measure sizes, positions, timings and sequences and to sample colours. Tracing is not allowed, and no file of the original enters the repo.
- **Drawings.** Every drawing below was written by an AI coding agent (Claude) as hand-typed SVG in TypeScript, from the words in [helpers-spec](helpers-spec.md) §1.4, §2.4, §5.2 and Appendix C. Where a shape can only come out one way (a four-point star, a paw print, a lightning bolt), it is drawn with our own proportions on our own grid.
- **Motion.** The timings, scales and orders are the spec's measured numbers (helpers-spec §1.5, §2.4, §3.3, §4.2, §4.4). The easing of the cat's scale segments is fitted to the measured scale samples listed in the spec and in `mouse-cat.md` (numbers only).
- **What was not used.**
  - No frame of the recordings was traced, copied, or opened in an editor while drawing.
  - No source listed in [06 §4](../phase1/06-legal-and-originality.md) was opened.
  - No image, audio or text generator other than the coding agent itself was used.
- **How it was checked.** Our build at 402 × 874, DSF 3 was frozen at exact milliseconds after each action (`page.clock` plus a pause-and-seek of the CSS animations) and saved as `docs/phase2d/screenshots/G2-2d1-*.png`. Those frames were then looked at beside the user's frames at the same moments (60 fps, same CSS-px box, 10 px guides): the mouse's second visit (v1), the cat (v2), and a ghost and the draw-in (v3). The side-by-sides stay in the session scratchpad (`2d1-G2/cmp-*.png`) and are never committed.
- **Bytes.** "Markup" is the symbol's length in the sprite at run time. "Code" is the esbuild-minified module.
  - First load: `helper-art.ts` 2.8 KB code. It holds the mouse's head and eyes, which moved here from `sprite.ts`'s `tool-mouse`, so the net new part is the ticker art.
  - Lazy: `lazy-art.ts` 2.5 KB and `board-mouse.ts` 2.6 KB (code). Both go in the lazy `board-mouse` chunk, 4.8 KB raw (2.2 KB gzip) after bundling.
  - Measured on the FBIG build against a copy of the same tree with G2's files at `7048674`: main JS +7.9 KB raw (+2.8 KB gzip), plus `palette.ts` +0.5 KB; first-load CSS +7.5 KB raw (+1.6 KB gzip).

### Art (SVG, hand-coded)

| Asset | File(s) | Method and words drawn from | Markup |
|---|---|---|---|
| `cat-wink` (the celebrating cat, helpers-spec §2.4) | `src/ui/art/sprite.ts` (`catSymbols`), `src/ui/art/cat-parts.ts` | Our Tux head (`catHead`) with the existing `wink` eyes and the `smile` mouth. The left eye is open. The right eye is a closed upward arc in ink on the white blaze. A tiny white four-point glint sits just past the arc's outer end, where it overlaps the dark fur so it shows. No new face drawing. | 2 602 (generated; about 200 B of code) |
| `board-mouse`, `board-mouse-eyes`, `board-mouse-lids`, `board-mouse-grin` (the board mouse, §1.4) | `src/ui/art/helper-art.ts` (`mouseHead`, `mouseEyes`), `src/ui/art/lazy-art.ts` | Our 2d `tool-mouse` face split into parts on its own box (`1 4.5 98 88`). `tool-mouse` is now `mouseHead()` + `mouseEyes()`, so it draws as before. The **head** has the ears with pink insides, the head and muzzle, three whiskers a side, the nose, the closed mouth and the two teeth. The **eyes** are the bead eyes with catchlights. The **lids** are two rounded lids in the head's grey covering each eye from its top, with a dark closed-eye curve along their lower edge; the board scales them from the top edge. The **grin** is an open mouth below the nose: a dark rounded mouth, a pink tongue, the two teeth at its top edge and the nose redrawn over it. | 782 + 255 + 300 + 383 |
| `fx-star4` (the points star, §2.5; used by G3) | `src/ui/art/lazy-art.ts` | A four-point star with concave sides (four cubic curves between the tips) on the 24 grid, in `currentColor`. It has a round soft core: two circles in `var(--star-core, #FFFD79)`, the outer one at 70 %. | 348 |
| `fx-shard`, `fx-shard-2`, `fx-shard-3` (the cat's shards, §2.4; used by G3) | `src/ui/art/lazy-art.ts` (`shard`) | Three irregular rounded polygons (chunky crystal bits) on the 24 grid. Each has a lit face (the whole chunk in `currentColor`, i.e. the tile's colour), a shaded face (the lower-right facet in black at 18 %, so the colour × 0.82) and a small white highlight facet at 45 %. | 408 / 399 / 390 |
| `art-paw-cap` (the ticker's inline-start cap, §5.2) | `src/ui/art/helper-art.ts` (`pawCap`) | On a 30 × 31 box: the pill's outline runs from its top edge around four scallops (circles of r 4.3 at (12.4, 4.9), (7, 11.4), (7, 19.6), (12.4, 26.1); the first and last touch the pill's edges) and back along its bottom edge. It is filled with `--toast-fill` and stroked 1.2 in `--toast-line`. Each scallop holds a round toe bean (r 2.8, `#FFCD9B`). A large main pad (an ellipse) has a radial `#FFD4A5` → `#FFE1B5` gradient that fades into the fill. | 867 |
| `art-bolt` (ticker line 1's icon) | `src/ui/art/helper-art.ts` | A chunky zig-zag bolt on the 24 grid in `--gold`. Its corners are rounded by a 1.4 stroke of the same gold (no outline colour). The lower-right facet is in `--fish` orange, and a thin pale highlight runs along the upper-left edge. | 290 |
| `art-star` (ticker line 2's icon) | `src/ui/art/helper-art.ts` (`star5`) | A plump five-point star on the 24 grid (radii 9.4 / 4.6). It is `--gold` with its tips rounded by a round-joined 3-unit gold stroke. A pale facet and a small white highlight sit at the upper left, with a faint `--fish` inner line toward the bottom. | 537 |
| The ghost X's outline (`path.cell__xo`, §3.3) | `src/ui/board/board-fx.ts` (`xOutlinePath`), `src/ui/board/board-cells.ts` (`ensureGhost`) | Computed, not drawn. It is the union outline of the two X bars of `layout.mark` (a plus shape turned 45°: eight rounded bar ends and four concave corners, with no inner crossing lines). It is grown so that the 1.5 px white non-scaling stroke ends 0.8 px outside the real X on a 39 px tile, as measured. Patterns on adds a 3 px `--xe` copy under it. | 357 (path data) |

### The board's motion (measured numbers; our own CSS and code)

| Item | File(s) | Method |
|---|---|---|
| X draw-in (§4.4, D-2d1-8) | `src/ui/board/board-cells.ts` (bar groups), `src/styles/board.css` (`.fx-mark`, `tile-squish`, `x-grow`, `x-reveal`, `x-over`), `board-view.ts` | Each rect sits in a rotated bar group, so CSS scales it in the bar's own frame. The two edge groups come first and the two white ones last, so both edges stay under both whites. On every new X of a tap, a paint or Apply, all at once: the tile squishes 0.90 → 1 over 80 ms; "\" scales 0.3 → 1 about the X's centre over 70 ms; "/" is revealed from its top-right tip (84.5, 50 in its frame) over 130 ms after that; the group goes to 1.1 by 70 ms, holds, and is back to 1 at 250 ms. The durations come from `fx.markDraw`. Reduced motion: a 150 ms WAAPI fade. |
| The mouse's visits (§1.4–§1.5, D-2d1-1) | `src/ui/board/board-mouse.ts` (lazy chunk), `src/styles/board.css` (`.board__mouse*`, `mouse-in`, `mouse-out`, `mouse-blink`, `mouse-glance`, `mouse-grin`, `mouse-narrow`, `mouse-tilt`) | One sprite per visit over the tile: 0.86 × 0.79 T (measured 0.88 × 0.77), 1 % T above the centre. Visits run in event order, `mouseVisitMs` (935) apart, with the times from G1's `mouseLandMs` / `mouseRunMs`. The tile presses 0.88 → 1 (70 ms). The mouse comes in from 0.5 (faint at +16, then about linear to 1 by +115, opaque by +66: fitted to the v1 samples). The face is blink, glance or grin (k mod 3; our timings, shaped on the observed ones). At +850 the X pops 1.15 → 1 (170 ms) under it while it shrinks to 0.77 and fades (opaque to +35, 0.93 at +50, 0.5 at +67, gone at +85). The run follows elapsed time, so late timers catch up, and a finaliser at `mouseRunMs` removes every hidden X. |
| The cat-placed sequence (§2.4, D-2d1-3) | `src/ui/board/board-cat.ts`, `src/styles/board.css` (`.fx-cat`, `cat-placed`, `.cell__flash`, `cat-wash`, `cat-rays`, `cat-halo`, `.cell__light`, `cat-light`, `cat-twinkle`) | Scale, in units of the resting size, about 50 % 80 % of the cat: 0.3 at 16 ms, 1.56 at 116–133, 1.25 at 300, held to 816, 0.89 at 950, held to 1 000, then 1 at 1 400. Each segment's easing is fitted to the measured samples. The wink runs from 350 to 780 (`cat-wink`). The flash is our twelve soft white rays (a repeating conic gradient, masked round) and a white wash: 0.55 at 50, 0.65 from 200 to 366, gone by 733. The halo mixes the tile's colour with the measured `#FEFFEA` (33 → 83 ms). The light is a 3-slot radial white glow at up to 25 %, peaking at 300. Six four-point twinkles (white, `--r11` pink, `--twinkle-cyan`) sit at our own offsets within 1.5 T, each 360 ms from 133 to 373. The cell is lifted while the cat overflows. A `CAT_REMOVED` or a props render cancels the sequence. |
| Ghost X pop (§3.3) | `src/ui/board/board-highlight.ts`, `src/styles/board.css` (`ghost-pop`) | Ghosts appear at 333 + 60 i ms in `ghostOrder` (inline `--gd`). Each pops over 500 ms with the measured keyframes: 0 % scale 0.25 opacity 0.3 → 12 % opacity 1 → 13 % 1 → 27 % 1.22 → 47 % 1 → 60 % 0.92 → 100 % 1. The ghost cat pops at 333, then bobs (2b). The board's 2b hint dim, focus ring and `ghost-pulse` are retired. |
| Completion waves (§4.2, D-2d1-6) | `src/ui/board/board-fx.ts` (`waveOrder`), `board-view.ts`, `src/styles/board.css` (`wave-bump`, `wave-glow`) | Each tile of a completed unit starts at k × 33 ms (`--wd`), from the end nearer the anchor; a region steps by king distance (ours). Scale 0.93 at +33, 1.10 at +67 held to +167, 1 by +270. A pale yellow glow (`--wave-rgb`) peaks at +50. A tile in two units bumps twice (`--wd2`). |
| Done veil and resting cat (§4.7, D-2d1-15) | `src/styles/board.css`, `src/ui/board/board-cells.ts` (`CAT_BOX`) | The veil skips the found cat's own tile. The resting cat's box is 86.4 units at (6.8, 6.9) on the slot box. Our Tux's art (84.9 × 80.4 of its grid) then measures 31.0 × 29.7 px on a 39 px tile in our build (0.80 × 0.76 T; measured 0.78 × 0.77 T), with its centre 2 % T above the tile centre. |
| Dark tiles (§6.4, D-2d1-11) | `src/ui/art/palette.ts` (`isDarkTile`), `board-cells.ts` (`data-dark`), `src/styles/board.css` | On a tile where white reaches 4:1 (Denim), the pattern glyph is white unless the tile is faded. |

### Colours (helpers-spec §6)

| Item | File(s) | Source |
|---|---|---|
| Denim `#5B75B2` (palette index 4) | `src/ui/art/palette.ts`, `src/styles/tokens.css` (`--r4`) | Sampled from the user's PNG still (helpers-spec §6.1). It replaces our Mint `#52A982`. `PALETTE_DE00` is recomputed; Denim's nearest colour is Violet at 14.19. |
| Tier, heads ring and its start | `src/ui/art/palette.ts` (`PALETTE_CORE`, `paletteTier`, `HEAD_ORDER`, `headOrderFor`) | n ≤ 11 boards draw from the 11 measured colours; n = 12 adds our Cocoa. The ring order is measured (§6.5). The start is ours: `cyrb128(puzzleId)[0] mod count`. |
| `--wrong` `#560A1C`; `--toast-fill` `#FFF1C8`, `--toast-line` `#E98E33` | `palette.ts` (`TOKENS`), `tokens.css` | `--wrong` is ours: 2d's crimson darkened until it reaches 3:1 on Denim (3.18). The toast colours are re-sampled from the PNG still (§5.2). |
| `--plus`, `--done-top`, `--done-bottom`, `--done-line`, `--hint-card` (measured); `--apply` (the measured `#F0912A` darkened to 3.05 for white large text) | `palette.ts`, `tokens.css` | helpers-spec §2.5, §3.2, §4.3 |
| `--halo-rgb` 254, 255, 234 (measured cc), `--wave-rgb` 255, 236, 150 (edge measured `#FFF2C0`–`#FFF6C7` cc), `--twinkle-cyan` `#C4F2FF` (ours) | `tokens.css` | the cat's halo, the wave glow, the twinkles |

### Retired in 2d.1

| Asset | Why |
|---|---|
| Mint `#52A982`, 2d's `--wrong` `#6E0E25`, the video-sampled toast `#FEF0C7` / `#DD9045` | Replaced (§6.2, §6.4, §5.2). css-rules' retired-look guard fails on them. |
| The 2d X pop for player and hint marks, and the mouse's 90 ms stagger | Replaced by the draw-in and the visiting mouse. `x-pop` stays only as the mouse's X (1.15 → 1). |
| The kitty's surprised mood, the 2b kitty `sparkle()` call and the cat drop on `CAT_PLACED` | Replaced by the cat sequence. `sparkle()` itself is left in `board-fx.ts` for the lead's I-3, and the `cat-drop` keyframes are in G3's `fx.css`. |
| The board's hint dim (`--hint-dim`), its focus ring and `ghost-pulse` for hints | The hint overlay dims the screen (G3) and the ghosts are outlines. |
| `art-flex` | Still in the sprite and `@deprecated phase2d.1`; its id is deleted at I-3 (the tickers use `art-bolt` and `art-star`). |
