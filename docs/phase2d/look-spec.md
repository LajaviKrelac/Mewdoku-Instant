# Phase 2d spec: match the original's game screen (look, layout, palette, X marks)

Status: **built and integrated** (G1–G3, integration I-1 to I-5 on 2026-10-10; the deviations the integration made are listed in §9 and marked "as built" where they apply; the acceptance pass ran with 2d.1 on 2026-10-10, [STATUS-2d](STATUS-2d.md); **Phase 2d.1** ([helpers-spec](helpers-spec.md), built and integrated the same day) replaces §1.6 (found head), §1.9 (Denim), §1.10 (the draw-in), §1.11 (press, pulse), §1.12 (the mouse's motion), §1.13 (the "+N"), §1.14 (the toast → two tickers) and adds to §1.16; D-2d-9 … D-2d-13 are marked "replaced by 2d.1") · Spec date: 2026-10-10 · Owner: game design + tech lead · Branch `claude/mewdoku-instant`, base `ececec5` (Phase 2c.1 integrated: `tsc` clean, 2 175 unit tests in 110 files, 172 e2e)

**Config is already done.** The spec stage added every 2d key to `src/app/config.ts` (§0.6) and marked the game-screen keys 2d stops reading `@deprecated`. No value an existing reader uses changed, so the tree is still green: `npx tsc --noEmit` clean and `npx vitest run` **2 175 / 2 175 (110 files)** after the edit (2026-10-10). Workstreams G1–G3 do not edit `config.ts`.

Inputs: the user's request and recording (§0.1); the measurements of that recording (`measure.md`), the research on what the recording does not show (`research.md`) and the code map (`code-map.md`), all three in the session scratchpad (`scratchpad/2d/`, not in the repo); [parity-spec](../phase2b/parity-spec.md) (2b), [fish-lives-spec](../phase2c/fish-lives-spec.md) (2c, 2c.1 §10), [STATUS-2c](../phase2c/STATUS-2c.md), [CONTRACTS-2b](../phase2b/CONTRACTS.md), [01](../phase1/01-game-deconstruction.md), [04](../phase1/04-architecture.md) §9, [05](../phase1/05-fbig-platform.md) §5.5 and §6, [06](../phase1/06-legal-and-originality.md); the source at `ececec5` (read 2026-10-10: `src/ui/board/{layout,board-cells,board-view}.ts`, `src/ui/hud/{top-bar,pills,rule-chips,tool-bar}.ts`, `src/ui/screens/game-screen.ts`, `src/ui/art/{palette,sprite}.ts`, `src/engine/colors.ts`, `src/app/{views,helper-flows,banner-flow,config}.ts`, `src/game/{ad-pacing,types}.ts`, `src/platform/types.ts`, `src/styles/tokens.css`, `src/i18n/en.ts`). The interfaces of §4 are repeated, copy-paste ready, in [CONTRACTS.md](CONTRACTS.md).

---

## 0. Read me first

### 0.1 The user's request and the decision record (2026-10-10)

The user's request, verbatim: **"Check the look and layout here in the original. Color palette is better also. Xs are better as well."** With it the user supplied **their own screen recording** of the original's game screen (Meowdoku's **iOS** app, as the iPhone frames and the iOS control centre at the end show; Level 96, a 10×10 board, an iPhone at 3×, so a 402 × 874 CSS px viewport) and a screenshot of the same screen. (The user's earlier first-hand reports were from the Play Store app; 01 §18 entry 13 records that both now show fish.) Standing instructions that still apply: "match everything perfectly in phase 2 so we have solid base before phase 3" and "No alternate themes. Just have one theme (match it fully)".

**Decision D-2d-0 (user, 2026-10-10).** Phase 2d makes our game screen match the original's look, layout, palette and X marks as the user's recording shows them, with our own art and our own copy. Concretely:

| # | Decision | Scope |
|---|---|---|
| a | The user's recording and screenshot may be used as a **look and layout reference**: measuring proportions, positions and sizes, timing motion, and **sampling colours** are allowed. This reverses parity-spec §0.3 **R6** ("no colour, size or timing is sampled") for this recording. | every value in §1 marked "measured" |
| b | The **trade-dress risk** of matching the look this closely is **accepted by the user**. Gate **G-LEGAL** (an IP lawyer reviews the look with the final public name) still blocks any public release, and **G-NAME** still applies. | release gates (parity-spec §0.3 R3, R5) |
| c | **No tracing.** No shape is traced or copied from a frame. Every icon (cat-head silhouette, fish, back arrow, gear, bulb, winking cat, mouse, play badge, emoji-like art, rule diagrams) is drawn by us as SVG from the written description in §1. | G2 art; provenance rows |
| d | **No files** of the original are used (art, animation, audio, text). The recording's frames never enter the repo; the side-by-side acceptance images (§5.4) are made in a scratch folder and shown to the user, never committed. | everyone |
| e | **Our own copy.** The rule-card texts keep our own wording (06 §3 lists rule-chip wording and UI strings as not to be copied); the level-start toast says our own honest line (§1.14); one-word generic labels ("Level", "Score") are treated like the "Level N" title of 06 §3's generic list. | G3 i18n |
| f | Facts the recording shows are recorded in 01 as **"first-hand (user recording, 2026-10-10)"**; what it cannot show is listed in §0.4 and decided in §1 as `[DECISION]` or asked in §7. | lead (01) |

The same decision is recorded, briefly, in [parity-spec §0.3](../phase2b/parity-spec.md) and in [06 §3](../phase1/06-legal-and-originality.md) (the "Values read from code" and "Trade dress combination" rows).

### 0.2 Clean room in 2d

- **Allowed (D-2d-0 a):** positions, sizes, proportions, corner radii, gaps, stroke thicknesses and colours measured on the user's recording and screenshot; motion timed on the recording (the bulb pulse, the toast's drift). These are numbers, not expression.
- **Not allowed:** tracing any outline; reusing any pixel, frame, sound or string; opening any source in 06 §4; copying the original's level layouts (the visual acceptance uses **our** level 96, not theirs: 06 §3 "Level content"); copying its rule-card or toast wording.
- **Art** is drawn from the words in §1 (G2), with one row each in `docs/phase2d/provenance-G2.md` (author, method "hand-written SVG path data from the look-spec description", date). Where a drawing could only come out like the original's (a white disc, a cog, a left arrow), it is drawn with our own proportions on our 24-unit grid.
- **Reference files** stay in `scratchpad/orig-ref` (outside the repo). Scripts that read them take the folder from an environment variable (`MEWDOKU_ORIG_REF`) and write only to a scratch folder.

### 0.3 Sources and confidence

- **Measured (user recording, 2026-10-10):** every number in §1 with that tag comes from `measure.md` (PIL + numpy on the 3× frames, divided by 3; 60 fps for timing). **Colours come from the PNG screenshot**: the video decodes about gamma 0.84 darker, so its raw values (the lead's first samples, e.g. salmon `#CC6766`, page `#F4EEEC`) are **not** used; the corrected values match the PNG within 1 unit.
- **Research (search summaries only; no page fetched, 06 §4 respected):** what the helpers do, the board fade, banners in play. Confidence tags as in 01: confirmed · likely · inferred · unknown.
- **Ours:** `[DECISION]` marks our choice where the original is unknown; `[DECISION: default, user may change]` a default the user can flip in config; `[DECISION-PENDING-USER]` a choice we build behind a flag and ask about in §7.

### 0.4 What the recording does not show (decided in §1, asked in §7)

| Unknown | Where decided |
|---|---|
| What a head of the heads pill looks like once its colour has a cat | §1.6 `[DECISION]` |
| The original's colours beyond the 10 of this level (11×11, 12×12 need 11 and 12) | §1.9 `[DECISION]` (two of ours) |
| Tile and gap rules for n ≠ 10 | §1.8 `[DECISION]` (the same ratios) |
| What the mouse does and whether it has a stock | §1.12 `[DECISION-PENDING-USER]` (research: 3 X's, one video per use) |
| What decides which helper pulses | §1.11 `[DECISION]` (rule "auto" fits both observations) |
| The toast's trigger, entry and full text | §1.14 `[DECISION]` (our honest copy) |
| What the red dot on the gear means | §1.15 `[DECISION]` (unseen Settings) |
| A placed cat, a wrong X, a finished region, the win, other screen sizes | unchanged from 2b/2c (§2) |

### 0.5 Conventions

- **s** is the game screen's scale (§1.1). Sizes are CSS px **at s = 1** (the recording's 402 px wide viewport) and are multiplied by s unless marked "fixed". Positions are given relative to the game column (its left edge x = 0, width 402 s) and to **y0**, the top of the top-bar band.
- "% tile" is a share of the tile edge; "slot" is the tile plus one gap (the cell's grid slot, 02 §19).
- Times are ms. CSS-only constants (keyframe stops, sizes no JS reads) live as custom properties at the top of the owning stylesheet (parity-spec §0.4); everything JS reads is in `GameConfig`.
- **New** marks a file that does not exist yet. File paths are repo-relative.

### 0.6 Config added at the spec stage (`src/app/config.ts`, done 2026-10-10)

| Key | Value | Use |
|---|---|---|
| `layout.game` | `refWidth 402, minScale 0.6, maxScale 1.2, compactScale 0.85, topSpareMax 62, bar 52, barToPills 10.3, pills 31.3, pillsToRules 8.3, rules 60.3, rulesGrowMax 2, rulesToBoard 25.7, boardToTools 53, tools 60.3, toolsToBanner 23.4, bottom 12.3, cardMargin 5.67, cardPad 5.17, cardRadius 11.6, gapFraction 0.079, tileRadiusFraction 0.11` | the stack and the board (§1.1, §1.8) |
| `layout.mark` | `armFraction 0.69, barFraction 0.182, cornerFraction 0.06, edgeFraction 0.035, edgeMix 0.85` | the X (§1.10) |
| `fx.helperPulse` | `{ target: 'auto', periodMs: 1500, peakScale: 1.08 }` | §1.11 |
| `fx.headFoundMs` | 300 | §1.6 |
| `fx.markPopMs` | 140 | §1.10 |
| `fx.mouseStaggerMs` | 90 | §1.12 |
| `fx.startToast` | `{ enabled: true, delayMs: 150, inMs: 300, holdMs: 1200, exitPxPerSec: 100, reducedHoldMs: 1500 }` | §1.14 |
| `mouse` | `{ enabled: true, cells: 3 }` | §1.12 |
| `settingsDot` | `{ version: 1 }` | §1.15 |
| `ads.banner.duringPlay` | `true` | §1.16 |
| `ads.banner.bannerPx` | 50 | §1.16 |
| `ads.rewarded.placements` | + `'mouse'` (the list had no reader) | §1.12 |
| types | `RewardedPlacementId` + `'mouse'`; `BannerScreen` + `'game'`; new `HelperPulseTarget` | — |
| `@deprecated phase2d` | `layout.gutter, colMax, topBar, pills, chips, tools, toolsGap, vGap, vGapCount, boardPad, boardRadius, compactHeight, compactPills, compactChips, cellRadiusFraction, insetPx, insetSmallPx, insetSmallBelowSlot, markScale, markStrokeFraction, markEdgeFraction, markEdgeMix`; `fx.markDrawMs` (added by the critic: the pop replaces the draw-in) | unread once 2d is built (§6) |

---

## 1. The target screen

### 1.1 The vertical stack and the scale

**Measured (user recording, 2026-10-10)** at 402 × 874 with the device's safe areas (top 62, bottom 34) and a banner. The original stacks the screen **top-down with fixed gaps**; it does not centre the board (ours leaves 130 px empty above and below it today).

| Row (top to bottom) | Height at s = 1 | Gap above | Original y (402 × 874) | Ours at s = 1, safe 62/34, band (§5.4 target) |
|---|---|---|---|---|
| Safe area / spare | — | — | 0–62 (blank page) | 0–62.6 |
| Top bar band: back disc, Level / Score columns, gear disc | `bar` 52 (discs centred at 26) | — | discs 69.7–106.5 (centre 88.0) | band 62.6–114.6, disc centre 88.6 |
| Pills row: heads pill + fish pill | `pills` 31.3 | `barToPills` 10.3 | 124.3–155.7 | 124.9–156.2 |
| Rules container (three rule cards) | `rules` 60.3 | `pillsToRules` 8.3 | 164.0–224.3 | 164.5–224.8 |
| Board card (square) | card width | `rulesToBoard` 25.7 | 250.0–641.0 | 250.5–640.5 |
| Helper discs (badges reach 9 s above) | `tools` 60.3 | `boardToTools` 53.0 | 694.0–754.3 | 693.5–753.8 |
| Banner (only with the band, §1.16) | `ads.banner.bannerPx` 50, fixed | `toolsToBanner` 23.4 | 777.7–827.7 | 777.2–827.2 |
| Bottom | `bottom` 12.3 | — | 827.7–840 (+ 34 safe) | 827.2–840 |

**The scale** (G2, `computeLayout`, all values from `layout.game`; A = vh − safeTop − safeBottom; B = `ads.banner.bannerPx` when the band is reserved, else 0):

```
fixed  = bar + barToPills + pills + pillsToRules + rules + rulesToBoard + boardToTools + tools
         + (band ? toolsToBanner : 0) + bottom                       // 336.9 with the band, 313.5 without
card   = refWidth − 2 × cardMargin                                    // 390.66
sW     = min(vw, refWidth × maxScale) / refWidth
sH     = (A − B) / (fixed + card)
s      = clamp(min(sW, sH), minScale, maxScale)
colW   = refWidth × s                                                  // the game column, centred in the viewport
compact = s < compactScale                                             // rule cards show diagrams only (§1.7)
rulesH = rules × s × (textScale > 1 && !compact ? min(rulesGrowMax, textScale × 1.15) : 1)   // A11Y-6 kept
barH   = bar × s × (textScale > 1 ? min(rulesGrowMax, textScale) : 1)  // the bar's two text lines are rem-based (§1.3), so it grows too (also in compact)
grown  = rulesH + barH;  rest = fixed − rules − bar                    // the rows that never grow
boardMax = min(colW − 2 × cardMargin × s, A − B − rest × s − grown)
pad    = max(3, round(cardPad × s));  slot = max(1, floor((boardMax − 2 × pad) / n));  board = slot × n + 2 × pad
gap    = max(1, round(slot × gapFraction));  inset = gap / 2           // every tile, every side (hitTest unchanged)
spare  = A − rest × s − grown − board − B
y0     = safeTop + min(max(0, spare) / 2, topSpareMax × s)             // spare goes above (capped), the rest below
```

(At text scale 1, `barH = bar × s` and `rulesH = rules × s`, so every number in the table below is unchanged by the `barH` term; critic change C4.)

The card is centred horizontally; the column is centred in the viewport (on desktop the page beside it keeps the 2b side fill). Fine pointers keep the 568 px minimum height (`layout.minViewportH`, unchanged). **FB safe zone** (05 §5.5: the top-left 64 × 64 px stays empty): on FBIG the back disc's inline-start edge sits at least `layout.fbSafeZonePx` + 4 px from the viewport's left edge (it moves right when the column would put it inside the zone). The Level / Score pair then **re-centres between the two discs** (§1.4 Fit), because at the measured x the Level column would overlap the moved disc (at 402: disc 68–104.8, column 99–201). In Arabic the stack mirrors; the safe zone stays at the top **left**, so there the gear (and its dot) is the one that moves. The pills row is not a control: at s below about 0.9 with no safe top (320 × 568 FBIG: the heads pill at y 44–67) the first heads may pass under the zone's lower part; accepted (the pill's name and the board carry the same information), checked in the `layout` e2e so no **control** enters the zone.

**Touch targets.** Every round button keeps a transparent hit area of at least **44 × 44 px at every s** (a `::before` centred on the disc, inset `min(0, (d − 44) / 2)`): the top discs are 29.3 px at 320 web and 26.2 px at 320 FBIG, the helper discs 48.0 and **42.9** px. The hit areas never overlap one another (the closest pair, the helper discs at 320 FBIG, are 73 px apart centre to centre).

**What shrinks at 320 × 568** (the whole column fits without scrolling in every row of the table below; all sizes × s): web s = 0.796 / FBIG with the band s = 0.712: top discs 29.3 / 26.2, labels 15.4 / 13.7 px, numbers 17.5 / 15.7 px, pills row 24.9 / 22.3 tall (heads 17.0 / 15.2 wide at n = 10), rule cards 92 × 35.6 / 82 × 31.8 with **diagrams only** (compact), tiles 28 / 25 (n = 10), helper discs 48.0 / 42.9, badge digits 14.0 / 12.5 px. Text never goes below the floors of §1.3.

**Results at the review sizes** (computed with the formula above; n = 10 unless noted):

| Viewport (safe top/bottom, band) | s | colW | compact | slot / gap / tile | board | y0 | pills y | board y | discs y | banner y | spare below |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 402 × 874 (62/34, band): the recording | 1.000 | 402 | no | 38 / 3 / 35 | 390 | 62.6 | 124.9 | 250.5 | 693.5 | 777.2 | 0.6 |
| 402 × 874 web (0/0, no band) | 1.000 | 402 | no | 38 / 3 / 35 | 390 | 62.0 | 124.3 | 249.9 | 692.9 | — | 108.5 |
| 390 × 844 (47/34, band): iPhone 14/15 FBIG | 0.970 | 390 | no | 36 / 3 / 33 | 370 | 55.1 | 115.5 | 237.4 | 658.8 | 740.0 | 8.1 |
| 390 × 844 web (Playwright `web-390`) | 0.970 | 390 | no | 36 / 3 / 33 | 370 | 60.1 | 120.6 | 242.4 | 663.9 | — | 109.7 |
| 360 × 640 web | 0.896 | 360 | no | 33 / 3 / 30 | 340 | 9.6 | 65.4 | 177.9 | 565.4 | — | 9.6 |
| 360 × 640 FBIG (band) | 0.811 | 326 | yes | 30 / 2 / 28 | 308 | 4.4 | 54.9 | 156.8 | 507.8 | 575.6 | 4.4 |
| 320 × 568 web (`web-320`) | 0.796 | 320 | yes | 30 / 2 / 28 | 308 | 5.2 | 54.8 | 154.8 | 505.0 | — | 5.2 |
| 320 × 568 web, 12 × 12 | 0.796 | 320 | yes | 25 / 2 / 23 | 308 | 5.2 | 54.8 | 154.8 | 505.0 | — | 5.2 |
| 320 × 568 FBIG (band) | 0.712 | 286 | yes | 27 / 2 / 25 | 278 | 0.1 | 44.4 | 133.8 | 449.6 | 509.2 | 0.1 |
| 320 × 568 FBIG (band), 12 × 12 | 0.712 | 286 | yes | 22 / 2 / 20 | 272 | 3.1 | 47.4 | 136.8 | 446.6 | 506.2 | 3.1 |
| 1280 × 800 desktop web | 1.136 | 457 | no | 43 / 3 / 40 | 442 | 0.9 | 71.7 | 214.4 | 716.6 | — | 0.9 |
| 1280 × 800 desktop web, 12 × 12 | 1.136 | 457 | no | 35 / 3 / 32 | 432 | 5.9 | 76.7 | 219.4 | 711.6 | — | 5.9 |
| 320 × 568 FBIG (band), 12 × 12, **safe top 20** (critic) | 0.684 | 275 | yes | 21 / 2 / 19 | 260 | 23.7 | 66.3 | 152.3 | 448.6 | 505.9 | 3.7 |
| 375 × 667 FBIG (band), 12 × 12, safe top 20 (critic) | 0.821 | 330 | yes | 26 / 2 / 24 | 320 | 20.3 | 71.4 | 174.5 | 537.9 | 606.6 | 0.3 |

The smallest slot is 22 px for 12 × 12 at 320 × 568 on FBIG with no safe top (as today), and **21 px** when that phone also reports a 20 px safe top (an iPhone SE-class webview with a status bar; re-computed by the critic). 21 px still clears `patternMinPx` 7 and the drag threshold `max(8, 0.2 × cell)`; the `layout` e2e adds the 20 px safe-top case (via `--dev-safe-top`) so whole cells and the gesture specs are checked there. Desktop uses a column up to `refWidth × maxScale` = 482 px wide (≈ the 2b `colMax` 480).

**Compact mode** (s < 0.85: 320 × 568, 360 × 640 with the band) only hides the rule-card text (§1.7); every other size follows s. The 2b compact sizes (36 px pills, icon-only chips) and the 2c.1 tight fallback of the pills row are retired.

**Dev and e2e override for the safe areas** (G2): the safe-area probe in `readViewport` and the `--safe-top` / `--safe-bottom` tokens use `max(env(safe-area-inset-top, 0px), var(--dev-safe-top, 0px))` (bottom alike). Nothing sets `--dev-safe-*` in production; the visual acceptance sets 62 / 34 px on `:root` to reproduce the recording's device (§5.4).

### 1.2 Colour tokens (one theme)

The page, ink and helper colours are **sampled from the user's screenshot** (D-2d-0 a); the rest are ours. Every value lives in `src/styles/tokens.css` and its mirror `TOKENS` in `src/ui/art/palette.ts` (G2). Contrast ratios were computed on 2026-10-10 with `scripts/palette-check.ts`'s own `contrastRatio`.

| Token | 2c.1 value | **2d value** | Source | Use | Checked contrast |
|---|---|---|---|---|---|
| `--page` | `#FAF6F0` | **`#F7F2EF`** | measured | page, everywhere | — |
| `--page-2` | `#F1EADF` | **`#F2EBE6`** | ours (one step below the new page) | wells, desktop side fill | ink on it 4.62 |
| `--card`, `--board-card` | `#FFFFFF` | `#FFFFFF` | measured | board card, pills, rules container, discs | — |
| `--ink` | `#2F2A35` | **`#935A5A`** | measured (mauve-brown) | all text (labels, numbers, rule text, toast) and the line icons outside the round buttons | 4.91 on page, 5.45 on card, 4.62 on page-2 and on `--accent-soft`, 5.01 on a rule card, 4.81 on the toast, 4.97–5.03 on the three event pages; white on it 5.45 (O9 toast, empty badge) |
| `--ink-2` | `#665E6C` | **`#935A5A`** | measured (the original shows one text colour) | secondary text | as `--ink` |
| `--ink-3` | `#B2AAB4` | **`#CDBAB6`** | ours | disabled, hairlines (no text) | — |
| `--ink-icon` | — | **`#996767`** (new) | measured (critic, 2026-10-10: the back arrow and the gear are a solid `#996767`, lighter than the text; ΔE00 4.55 from `--ink`) | the icons inside the white round buttons: back arrow, gear (game, Home, event screen), Home's trophy and house | 4.68 on the white disc (graphic, needs 3) |
| `--ink-deep` | — | **`#2F2A35`** (new; the 2c.1 ink) | ours | graphics that need a dark colour: colour-pattern glyphs, the X edge mix, the "Free" badge text | glyph at 0.85 ≥ 3.24 on every tile (faded 0.65: 3.30); on `--gold` 8.67 |
| `--ink-rgb` | `47, 42, 53` | **`147, 90, 90`** | follows `--ink` | soft shadows, `--line`, `--line-2` | — |
| `--line`, `--line-2` | `rgba(47,42,53,.1)` / `.16` | **`rgba(147,90,90,.14)`** / **`.22`** | ours | hairlines | — |
| `--page-rgb` | `250, 246, 240` | **`247, 242, 239`** | follows `--page` | — | — |
| `--warm-rgb` | — | **`239, 134, 39`** (new) | measured (fit) | the round buttons' shadow | — |
| `--shadow-btn` | — | **`0 3px 7px -2px rgba(var(--warm-rgb), .25)`** (new; × s via the screen's `--s` on the game screen). **As built (I-polish d): `0 3.5px 8px -2px rgba(var(--warm-rgb), .22)`**, re-fitted to the recording's profile below the discs (§9) | measured (fit: 8.7 below, 5.3 at the sides) | top discs, helper discs, Home's icon buttons | — |
| `--shadow-pill` | — | **`0 2px 6px rgba(var(--ink-rgb), .06)`** (new) | measured (very faint, about 8 below) | the heads pill only | — |
| `--pulse-rgb` | — | **`255, 165, 30`** (new) | measured (fit; `#F7C880` at the disc edge, fades by about 11 px) | the helper pulse glow | — |
| `--badge` | — | **`#DC2F2F`** (new) | measured `#E93636`, darkened to meet 4.5 for its 17.6 px digits | count badges | white on it 4.68 |
| `--badge-video` | — | **`#03A84A`** (new) | measured `#02BE52`, darkened to meet 3 for the white play mark | the "watch a video" badge | white mark 3.13 |
| `--dot` | — | **`#F34F4F`** (new) | measured | the gear's red dot | 3.48 on the disc, 3.13 on the page |
| `--toast-fill`, `--toast-line` | — | **`#FEF0C7`**, **`#DD9045`** (new) | measured (colour-corrected video) | the level-start toast | ink on the fill 4.81 |
| `--rule-card` | — | **`#FBF4EE`** (new) | measured | rule card fill | ink 5.01 |
| `--rule-tile`, `--rule-tile-2` | — | **`#DDBEAA`**, **`#EEE1D7`** (new) | measured (tan); ours (the lighter "other region" tan, §1.7) | mini-diagram tiles (decorative) | — |
| `--rule-mark` | — | **`#AF6D44`** (new) | measured | mini-diagram X box | white X on it 4.12; 3.78 on the card |
| `--fish`, `--fish-deep`, `--fish-hi` | `#FFB81F`, `#C98200`, `#FFE08A` | **`#F1AA22`**, **`#D47E18`**, **`#FED95D`** | measured (`--fish-deep` measured `#D8811A`, darkened 1 step to reach 3:1 on white) | fish art everywhere | shade on white 3.09 |
| `--wrong` | `#A3193A` | **`#6E0E25`** | ours (the old crimson fails 3:1 on Coral, Violet, Cocoa, Mint) | wrong X and its ring | ≥ 3.41 on every tile, 6.00 on faded tiles |
| `--r0` … `--r11` | §1.9 | §1.9 | measured (10) + ours (2) | region tiles | §1.9 |
| unchanged | `--accent` family, `--focus`, `--title-on-dark`, `--stage`, `--scrim`, `--tap-text`, `--gold*`, `--glow`, `--danger`, `--hard`, `--amber-text`, `--life-empty`, the event theme overrides | — | — | — | `--focus` 4.42 on the new page (needs 3); `--accent-text` 5.14; `--accent-title` 3.44 (large) |

`index.html`'s `theme-color` follows `--page` (`#F7F2EF`; G2, css-rules test unchanged).

**Accepted contrast exceptions for parity** (WCAG 1.4.11; each also carries its information another way; recorded as D-2d-6):

| Graphic | Ratio | Why accepted |
|---|---|---|
| Plain white X on a tile (default; §1.10) | 1.60 (Lime) … 3.52 (Violet); faded 1.36–2.00 | the user asked for the original's X; **Colour patterns on** restores the edge (≥ 3.24 edge/tile, white/edge ≥ 9.82); the cell's accessible name says "crossed out" |
| Head tints on the white pill (§1.6) | 1.25–1.76 | the same information is in the pill's name ("3 of 10 cats placed") and on the board |
| Fish body on the white pill | 2.00 (shade 3.09) | the count is in the pill's name ("2 of 3 fish left"); full vs empty differ in shape |
| Mini-diagram tan tiles, toast border | 1.60, 2.32 | decorative; the rule text and the toast text pass |

### 1.3 Type

| Text | Size at s = 1 | Weight (ours) | Original (measured) | Colour |
|---|---|---|---|---|
| "Level" / "Score" labels | 19.3 px | 600; **as built: thinned** (a 0.04 em text stroke in `--page` over Fredoka's one face; 500 on the system stacks), §9 | ≈ 500 | `--ink` |
| Level number, Score number | 22 px | 600 + `-webkit-text-stroke: .04em currentColor` (≈ 800); **as built: 600 without the stroke** (measured like for like, the original's numbers are no heavier than Fredoka 600), §9 | ≈ 800 | `--ink` |
| Rule-card text | 11.6 px, **min 10 px**, line-height 1.15 (13.3 px) | 600, display face (was system UI); **as built: thinned** (a 0.03 em stroke in the card's fill), §9 | ≈ 600 | `--ink` |
| Count badge digits | 17.6 px | 600, `--font-num` | ≈ 600 | white |
| Toast | 16.3 px | 600 | ≈ 600 | `--ink` |

- **Units (critic change C4).** Every font size here is written in rem times the screen scale, `calc(var(--s) * <px ÷ 16>rem)` (19.3 px → `calc(var(--s) * 1.206rem)`), so the user's text size still applies (02 §18 "rem-based sizes", A11Y-6); the bar and the rules row grow with the text scale (§1.1 `barH`, `rulesH`). **Floors**: no text on the game screen renders below 10 px: `max(10px, …)` on the rule-card text, the Hard badge (11 s px), the "+N" chips (13 s px) and the badge texts; at 320 × 568 FBIG (s = 0.712) the Hard badge and the score chip would otherwise be 7.8 and 9.3 px.
- One display face stays: Fredoka 600 (`display-latin.woff2`, 16 468 B; the font row has 532 B left). A second weight does not fit the font budget (§6). The numbers get their heavier look from a 0.04 em text stroke in their own colour (Chrome 80+, iOS 14+; G3 checks it at 320 px so the counters do not blur). `[DECISION]` D-2d-7.
- Optional (G2, only if it fits): a **digits-only** Fredoka 700 subset (U+0030–0039, `+`, `,`, `.`, U+00A0, U+202F) under 1.5 KB replaces the text stroke for the numbers; it needs `pyftsubset` and a lead decision on the font row (04 §9). Not required for acceptance.
- Other scripts use the per-script stacks of 2b (§6.6), unchanged.

### 1.4 Top bar (game screen)

**Measured**, at s = 1, relative to the column and y0 (the recording's numbers in brackets):

| Part | Spec |
|---|---|
| Back disc | white Ø 36.8, `--shadow-btn`, centre (31.5, 26) [31.5, 88.0]. Icon `icon-back` (new, G2): a left arrow 20 × 17 drawn with a 3.1 stroke, round caps and joins, `--ink-icon` (measured `#996767`, critic C1). Accessible name `common.back` ("Back"). It does what Home did (`GameScreenCallbacks.onHome`, unchanged). On FBIG: §1.1 safe-zone rule. |
| Gear disc | white Ø 36.8, `--shadow-btn`, centre (370, 26) [370.0, 88.0]. Icon `icon-gear` **redrawn** (G2; Home and the event screen use it too): a **filled** six-tooth cog 21 × 22 in `--ink-icon` with a round hole Ø 8 cut out (even-odd fill, so the disc shows through). Name `common.settings`, or `common.settings.new` while the dot shows (§1.15). |
| Red dot | Ø 11.3, `--dot`, no ring, centre at the gear centre + (15.0, −14.7) [384.8, 73.3]; RTL mirrors with the gear. §1.15. |
| Level column | centred at x = 201 − 51 = 150 [149.5]. Label = `splitTitle(title).name` ("Level", "Daily", "Lantern Walk"); value = the suffix without its separator ("96", "Tue 6 Oct", "13"). Label cap top at y0 + 4.3 (baseline y0 + 18.0); value baseline y0 + 41.3 [80.0 and 103.3]. The label may ellipsize; the value never shrinks or truncates (I18N-TEXT-2, N1 kept). The **Hard badge** (`common.hard`, `--hard`, white, `max(10px, 11 s px)`, height `max(14px, 16 s)`, radius half its height) sits after the value, 4 s apart, the pair centred in the column `[DECISION]` (no Hard level in the recording). |
| Score column | centred at x = 201 + 51 = 252 [252.0]. Label `game.score` ("Score", new); value = the level points (`GameView.points`, `formatNumber`), "0" at a level start. **Hidden** when `points` is null (the tutorial): the Level column then centres at x = 201 `[DECISION]`. §1.13 for the roll, the chip and `[data-final]`. |
| Fit (critic C5) | Each column is **at least** 102 s wide with its content centred, and grows with its content; the pair sits side by side, centred in the **free span between the two discs** (each disc's inner edge + 4 px clearance). On the web and at rest that span is centred at x = 201 s, so short content ("Level / 96", "Score / 0") lands exactly at the measured centres 150 s and 252 s; on FBIG the back disc moves right (§1.1) and the pair follows (at 402: centres ≈ 177 and 279). When the pair is wider than the span: both **values** step to 0.86 × (`data-fit="1"`) and 0.74 × (`data-fit="2"`), and the **labels** ellipsize only after that ("Lantern Walk" at 19.3 px is ≈ 116 px, wider than 102: it widens its column instead of losing its end). A date value or a long event name is the usual case. Checked after a render, on resize and on a language change (G3). |
| Heading | The Level column is the page's `h1` (`.top-bar__text`) with `aria-label` = the whole title ("Level 96", "Lantern Walk · 13"). The Score column is `role="img"` with `game.points.a11y` ("Level points: 2,016"), not focusable, not a live region (2c.1 D22 kept). |
| Win-flow lock | Back and gear are `aria-disabled` and ignore presses from `WON` until the ranking panel (2b §2.2, unchanged; the classes `.top-bar__btn--home` and `.top-bar__btn--settings` stay, §4.6). |
| Hit area | each disc keeps a transparent hit area of at least 44 × 44 **at every s** (§1.1 Touch targets; critic C6: the old "s ≥ 0.8" left 320 × 568, s = 0.796, without one). |

Home and the event screen keep their own top bars (2b layout), restyled only: the white discs with `--shadow-btn` at a fixed Ø 37 px (they do not scale; 44 px hit area), `--ink-icon` icons 22 px, the filled gear, the red dot (§1.15). The look lives on `.btn--icon` in `base.css` (G2; only the top bars use that class): white fill, no border, `--shadow-btn`, `color: var(--ink-icon)`; the game bar (hud.css, G3) scales it by s. `[DECISION]` D-2d-8 (the recording shows only the game screen).

### 1.5 Pills row: the heads pill and the fish pill

**Measured**: the row spans x 12–390 [12.0–390.0] at y0 + 62.3, height 31.3 s; a two-column grid `1fr auto`, column gap 11.3 s.

| Part | Spec |
|---|---|
| Heads pill (replaces the cat counter "0 / 10") | white, radius = half its height, `--shadow-pill`; 270 × 31.3 at n = 10 [12.0–282.0]. Holds **n heads** (§1.6). Each head 21.3 × 21.7, 4.0 apart (pitch 25.33), the group centred, top inset 4.7 [first head x 22.3]. When n heads do not fit (n = 11, 12, or a narrow pill), heads and gaps shrink together so the group keeps 10.5 s of inset at each end (12 heads at s = 1: head 17.7). `role="img"`, `aria-label` = `game.cats.a11y` ("3 of 10 cats placed", reused). |
| Fish pill (the lives) | white, **no shadow**, radius = half its height; 96.7 × 31.3 [293.3–390.0]. 3 fish (`maxHearts`), each 24.7 × 23.3 at pitch 25.3 (as built: the slot is 24.7 × 23.3 and the fish's art fills its width, §9), insets 10.7 start / 10.3 end, top 4.0; one more fish adds 25.3 s to the pill (the heads pill gives the space). Lives drain from the last slot, the loss and revive motions of 2c §1.3–§1.4 are unchanged; `.pill--lives`, `.life[data-full]` and the accessible name stay. |
| Fish art | `icon-fish` **redrawn** (G2, `src/ui/art/fish.ts`): a plump round body with the head at the **left**, facing left; a forked tail at the lower right; one eye dot; three small scale arcs; a highlight on the upper body; **no outline**. Body `--fish`, lower-body shade `--fish-deep`, highlight `--fish-hi`, eye `--ink-deep`. Not mirrored in RTL. `icon-fish-empty` keeps 2c's idea (the same silhouette as one outline in `--ink` at 40 %, a `--life-empty` wash). Every screen that shows a fish (victory, the win flight, O4's Continue badge, How to play) uses the same two symbols. |
| RTL | the grid mirrors (heads at the right, fish at the left), as the 2c row did; the heads keep their order from the inline start. |

### 1.6 The cat-heads tracker

> **Phase 2d.1 (built, integrated 2026-10-10):** a found colour's head becomes our cat face with a tint dot and pops 0.56 → 1.2 → 1 (D-2d1-5 replaces D-2d-9), and the heads follow the measured hue ring from a per-level start: [helpers-spec](helpers-spec.md) §2.7, §6.5.

| Item | Spec |
|---|---|
| What it shows | **measured**: one head per region colour on the board (n heads for n × n), a flat cat-head silhouette in a **50 % tint** of that colour on the white pill (the measured heads are the region colours mixed 50 % with white within 1 unit). Ours: the head is the region colour (`var(--rN)`) at **opacity 0.5** over the white pill, which is exactly that mix and needs no `color-mix()` (iOS 14 / Chrome 80 baseline). |
| Order | **measured**: around the colour wheel starting at green, not board order. Ours: palette order `HEAD_ORDER` = `[3, 4, 5, 6, 10, 7, 8, 11, 0, 1, 9, 2]` (Lime, Mint, Lagoon, Sky, Slate, Violet, Orchid, Pink, Coral, Apricot, Cocoa, Mustard; §1.9), filtered to the colours on the board. On the recording's 10 colours this gives exactly its order. |
| Silhouette | `cat-head-flat` (new symbol, G2): **a plain cat-head silhouette of our own with two pointed ears** (lead decision D-2d-18, 2026-10-10, for closer parity: the original's heads have pointed ears; a generic pointed-ear head is a common shape, drawn by us from these words, never from a frame): a wide rounded head slightly wider than tall, two triangular ears with softly rounded tips set a little outward, no notch, no face, no outline, one flat shape filled with `currentColor`. |
| Found `[DECISION]` D-2d-9 | When a colour gets its cat (`regionsDone` bit set; the board fades that region, 2b unchanged): its head turns to the **full region colour** (opacity 1) and pops (scale 1 → 1.25 → 1 over `fx.headFoundMs` 300 ms, ease-out) on `REGION_DONE`. Research found no description of the original's change (`research.md` Q2.3). |
| Removed cat | `CAT_REMOVED` (the region is no longer done): the head goes back to the tint over `fx.reducedMotionFadeMs` (150), no pop. The view diffs `regionsDone` from its props (the event carries no region). |
| Restore, Retry, new board | set from props without motion. |
| Reduced motion | colour change in place, no pop. |
| Tutorial | 4 heads, same rules. |
| Win flow | §1.13. |
| DOM | `.pill.pill--heads > svg.head[data-color=<palette index>][data-done]` (n of them). |

### 1.7 Rule cards

**Measured**: one white container x 13.3–388.7 (375.3 × 60.3) at y0 + 102.0, radius 10.7, **no shadow**, padding 8.3 top, 7.5 at the sides; three cards 115.7 × 44.7, 7.0 apart, radius 5.6, fill `--rule-card`.

| Part | Spec |
|---|---|
| Diagram | a 3 × 3 mini board of 32.7 (cells 10.2, gap 1.05), 5.6 from the card's inline start, vertically centred. Cells: plain `--rule-tile` (radius 1.5); a **marked** cell is a `--rule-mark` box (radius 1.5) with a white X (two rounded bars, 15 % of the box thick, spanning 65 %); a **cat** cell is a `--rule-mark` box with our Tux head (`#cat-idle`) at 90 % of the cell. Built by `ruleDiagram(kind)` (new, G2, `src/ui/art/rule-art.ts`, returns SVG markup). `aria-hidden`. |
| Our three diagrams `[DECISION]` (ours, not the original's layouts) | **colours**: the top row and the left column are one colour region in `--rule-tile`, the other four cells a second region in `--rule-tile-2`; the cat at (row 1, col 0); X boxes on (0,0), (0,1), (0,2), (2,0). **lines**: the cat in the centre; X boxes on (0,1), (1,0), (1,2), (2,1). **space**: the cat in the top-left corner; X boxes on (0,1), (1,0), (1,1). In RTL the diagram moves with the card to its inline start (the right) and is **not** flipped (boards stay LTR, §1.18). |
| Text | our existing keys, values unchanged: `game.chip.colours` "1 cat each colour", `game.chip.lines` "1 cat each line", `game.chip.space` "Cats keep apart"; inline start 46 from the card edge, inline-end padding 6, vertically centred, at most 3 lines (clamped with an ellipsis); the long text (`*.a11y`) stays the `title` and the screen-reader text. The original's card wording is not used (06 §3). |
| Compact (s < 0.85) | the diagram is centred in the card and the visible text is hidden (the screen-reader text stays), like 2b's icon-only chips. |
| Large text | the row grows (`rulesGrowMax`, §1.1); the cards stretch to the row; the diagram stays its size. |
| Tutorial highlight | `[data-hl]` on the emphasised card: a 2 px `--accent` ring and the card fill `--accent-soft` (2b's ring kept, new fill). The coach's soft rects keep the selector `.chip[data-hl]`. |
| DOM | unchanged names (§4.6): `ul.rule-chips[data-compact] > li.chip.chip--colours|lines|space[data-hl] > svg.chip__art + span.chip__text + span.sr-only`; the container is the `ul`. `icon-rule-*` are deleted (§6). |

### 1.8 Board card and tiles

**Measured** (10 × 10): card 390.67 wide [5.67–396.33], radius 11.5–11.7, **no shadow and no border**; card edge to the first tile 6.67; tile 35.0, gap 3.0 (8.6 % of the tile, 7.9 % of the slot), pitch 38; tile radius 3.83 (**11 % of the tile**); flat tiles, no border, gradient or shadow.

| Item | 2d rule (G2) | At s = 1, n = 10 |
|---|---|---|
| Card | `--board-card`, radius `cardRadius × s`, **no shadow** (`--shadow-card` no longer used on the board), side margin `cardMargin × s` | 390 wide (whole-px slots), radius 11.6 |
| Padding | `pad = max(3, round(cardPad × s))` to the first **slot** edge; the first tile edge adds half a gap | 5 + 1.5 = 6.5 |
| Gap / inset | `gap = max(1, round(slot × gapFraction))`, every tile inset `gap / 2` on every side (`evenInsets`, even as in 2b) | 3 / 1.5 |
| Tile radius | `tileRadiusFraction × (slot − gap)` | 3.85 |
| n ≠ 10 `[DECISION]` | the same ratios (unknown in the original): the gap and radius follow the slot, the padding and card radius follow s | 12 × 12 at 320 × 568 FBIG: slot 22, gap 2, tile 20 |
| Done region | unchanged: the veil 45 % toward `--page` over 400 ms (the original's fade is confirmed, its look unknown; research Q2.1) | — |
| Cats, glow, wrong ring, hint dim, focus ring | unchanged (no cat or wrong cell in the recording) | — |

### 1.9 Region palette

> **Phase 2d.1 (built, integrated 2026-10-10):** an 11th measured colour, Denim `#5B75B2`, replaces Mint at index 4; boards up to 11 × 11 draw only from the 11 measured colours, Cocoa only on 12 × 12 (D-2d1-10 replaces D-2d-10): [helpers-spec](helpers-spec.md) §6.

**Measured**: the 10 colours of the recording (PNG values); **ours**: Mint and Cocoa for 11 × 11 and 12 × 12 (the biggest board is 12 × 12: 79 levels, 58 dailies, the Yarn Hearts event). Index meanings are kept where the hue still fits, so the tutorial's indices, the How to play mini boards and most colour names stay (the name changes are four keys, Appendix A).

| Index | Name (`color.N`) | 2d hex | L* C* h° | Source | Tier | White X on it |
|---|---|---|---|---|---|---|
| 0 | **Coral** (was Strawberry) | `#D57374` | 60 42 24 | measured (salmon) | core | 3.21 |
| 1 | Apricot | `#FFAA6D` | 77 51 60 | measured (orange) | core | 1.87 |
| 2 | **Mustard** (was Lemon) | `#E4BB49` | 78 61 87 | measured | core | 1.83 |
| 3 | Lime | `#AED994` | 82 40 132 | measured (light green) | core | 1.60 |
| 4 | Mint | `#52A982` | 63 38 161 | **ours** | extra (n = 12) | 2.85 |
| 5 | Lagoon | `#48B5B2` | 68 32 194 | measured (teal) | core | 2.46 |
| 6 | Sky | `#6BBCE7` | 73 32 246 | measured | core | 2.11 |
| 7 | **Violet** (was Lavender) | `#9778D6` | 57 55 306 | measured (purple) | core | 3.52 |
| 8 | Orchid | `#EB85B7` | 68 46 349 | measured (magenta-pink) | core | 2.45 |
| 9 | Cocoa | `#B0855A` | 59 32 69 | **ours** | extra (n ≥ 11) | 3.31 |
| 10 | Slate | `#A7BFD7` | 76 15 259 | measured (grey-blue) | core | 1.90 |
| 11 | **Pink** (was Moss) | `#FAB4D0` | 80 30 352 | measured | core | 1.68 |

- **Distinctness (checked, ΔE00 with palette-check's `deltaE2000`):** the minimum pair is **10.40** (Sky / Slate, both measured; the hard floor `MIN_DE00` is 10); Mint is ≥ **13.5** and Cocoa ≥ **16.5** from every other colour. Colour-vision report (informational): deuteranopia 4.11, protanopia 3.34, tritanopia 4.78, the same as the 10 measured colours alone (the two extras lower none). The two extras were chosen by search inside the measured band (L* 57–82, C* 15–61) for the largest ΔE00 to the ten and the largest CVD separation, then rounded to a mint and a caramel brown that read as "the same family" `[DECISION]` D-2d-10.
- **How colours are assigned** (G2, `regionColorsFor` in `palette.ts`; the read-only `engine/colors.ts` is unchanged): an n × n board draws from a **tier**: n ≤ 10 uses the **10 core** colours {0, 1, 2, 3, 5, 6, 7, 8, 10, 11}, n = 11 adds Cocoa (9), n = 12 uses all 12. `regionColorsFor` takes the k × k sub-matrix of `PALETTE_DE00` for the tier (k = max(10, n) colours), calls `assignColors(puzzle, sub, k)` (largest-degree region first; each takes the unused colour that maximises the minimum ΔE00 to its coloured neighbours; ties in a palette order rotated by the puzzle id) and maps the result back to palette indices. So a 10 × 10 board always shows exactly the original's 10 colours, and a board never shows a colour the original was not seen to use unless it needs more than 10. Fixed colours (the tutorial) bypass it as today. Colours are never saved (they are recomputed when a board mounts), so no save changes.
- **Tutorial** (G1, `src/game/tutorial.ts`): `TUTORIAL_COLORS` becomes `[3, 7, 2, 0]` (Lime, Violet, Mustard, Coral), all core; step 1 still names index 7 ("Violet").
- `PALETTE_DE00` is recomputed by `npm run palette:check` (it prints the matrix when stale); `tokens.css --r0…--r11` equal `PALETTE`.
- `HEAD_ORDER` (§1.6) and the tier constant `PALETTE_CORE` live in `palette.ts` beside `PALETTE`.

### 1.10 The X glyph

> **Phase 2d.1 (built, integrated 2026-10-10):** new X's from taps, paints and Apply draw in stroke by stroke with a tile squish; only the mouse's X pops (D-2d1-8); the hint's ghost X is the X's outline: [helpers-spec](helpers-spec.md) §4.4, §3.3.

**Measured** (tile 35.0): pure white `#FFFFFF`, opaque, **no outline and no shadow**; each bar 6.9 thick (**19.7 % of the tile**); the X's box 21.5 square (**61.5 %**), centred; tip to tip along a bar 26.3 (**75 %**); ends **rounded squares** (the width profile from the tip fits two rounded rectangles with corner radius ≈ 6.5 % of the tile); inner crossing corners only slightly soft.

| Item | 2d spec (G2) |
|---|---|
| Geometry | Two `rect`s in the cell's 100-unit box (the slot): each `armFraction` 69 units long, `barFraction` 18.2 thick, corner radius `cornerFraction` 6, centred at (50, 50), rotated +45° and −45°: `<rect x="15.5" y="40.9" width="69" height="18.2" rx="6" transform="rotate(45 50 50)">` and the same with −45. At slot 38 / tile 35 that is a 6.9 bar, a 21.5 box and a 26.2 tip-to-tip, matching the measurement. Wrapped in `g.cell__xg` (for the pop). |
| Colour | white (`#fff`, the css-rules allowlist). |
| Edge (accessibility) `[DECISION]` D-2d-5 | **Off by default** (the original has none; the user asked for its X). With **Colour patterns on** (`.board[data-patterns]`), two edge rects under the white ones, each grown by `edgeFraction` 3.5 units per side (`x 12, y 37.4, 76 × 25.2, rx 9.5`), filled with `--xe` = `mixHex(tile, --ink-deep, edgeMix 0.85)`: edge vs tile ≥ **3.24**, white vs edge ≥ **9.82** on every tile, ≥ 5.69 on faded tiles. `xEdgeColor(paletteIndex)` reads `layout.mark.edgeMix` and `TOKENS['ink-deep']`. The Settings note of Colour patterns says so (Appendix A). |
| Appearing | a pop: `g.cell__xg` scales 0.6 → 1.06 (at 60 %) → 1 over `fx.markPopMs` (140 ms, ease-out), origin at the centre. Replaces the 2b stroke draw-in (`x-draw`, `xe-draw`, `--x-len`, dash rules: deleted). Reduced motion: none. Painting several cells: the same pop on each, no stagger. The mouse's X's: §1.12. |
| Wrong cell | the same two rects filled `--wrong` (`#6E0E25`, ≥ 3.41 on every tile) and the 2 px inset ring in `--wrong` (`layout.wrongRingPx`), as 2b; no white X. |
| Hint ghost X | the same white rects at opacity 0.4 (with the edge when patterns are on), as 2b's ghost. |
| `mark-x` sprite symbol | redrawn to the same two rects (How to play uses it). `wrong-x` (already unused) is deleted. |
| Rule-card mini X | §1.7 (15 % bars, 65 % span, on `--rule-mark`). |

### 1.11 Helper row, badges and the idle pulse

> **Phase 2d.1 (built, integrated 2026-10-10):** the discs press to 0.90 and fire on release (D-2d1-14); the pulse needs 5 s idle, stock and no helper used in the attempt (D-2d1-9 replaces D-2d-11); a busy tool row keeps full opacity: [helpers-spec](helpers-spec.md) §4.5, §4.6, §1.2.

**Measured**: three white discs Ø 60.3 at y0 + 632 [694.0–754.3], centres x 98.8 / 202.0 / 305.0 → **201 s − 103.1 s, 201 s, 201 s + 103.1 s** (pitch 103.1), `--shadow-btn`, **no hard bottom edge** (the 2b 4 px grey edge is removed). Order: **kitty · bulb · mouse**.

| Tool | Icon (new full-colour art, G2; drawn by us from these words) | Size at s = 1 |
|---|---|---|
| Kitty (`.tool--paw`, our existing kitty: places one correct cat; as built the art boxes are 36 × 36, 21.9 × 34 and 36.2 × 32.4 s so the drawn art measures the sizes in this column, §9) | `tool-kitty`: our **Tux** head, front view, **winking**: the left eye an open iris (Tux's light-green iris), the right eye a closed arc in `--cat-line`, an open smiling mouth with a small pink tongue, Tux's asymmetric white blaze and notched left ear | 34.7 × 34.3 |
| Bulb (`.tool--bulb`, the hint) | `tool-bulb`: a glossy round bulb in warm yellow (`--gold` with a lighter highlight ellipse and a soft orange lower shade), a narrow neck and a two-ring screw base in `--hard` violet with a lighter middle ring | 21.3 × 34.0 |
| Mouse (`.tool--mouse`, §1.12) | `tool-mouse`: a grey mouse face, front view: a round head (`#B8B4BC` with a lighter muzzle `#D9D6DC`), two large round ears with pink insides (Tux's inner-ear pink `#F2A3B4`), black bead eyes with a catchlight, a small pink nose, two white front teeth, three thin whiskers per side | 35.0 × 31.3 |

| Badge | Spec |
|---|---|
| Count | `--badge` rounded rectangle 28.0 × 21.3, radius 7.5, no ring; white digits 17.6 px; centre at the disc centre + (26.0, −28.3) (RTL: −26.0); it does **not** scale with the pulse. **Growth (critic C7):** `min-width` 28 s, `padding-inline` 5 s, `white-space: nowrap`; a longer text ("15", "100", "Free", "Gratis") widens the badge toward the inline end from its inline-start edge (the start edge stays at the measured centre − 14 s), never truncates |
| Free (tutorial bulb) | the same shape and growth rule in `--gold`, text `game.tool.free` in `--ink-deep` |
| Watch a video | `--badge-video` rounded rectangle 35.3 × 21.0, radius 7.5, a white rounded play triangle about 9.5 × 11 (`icon-play`, new); centre + (25.7, −28.8) |
| Which | kitty and bulb: the count when > 0; "Free" for the tutorial bulb; at 0 the video badge when a rewarded video can refill it (`GameView.videoRefill`: the platform can show rewarded ads), else a muted "0" (white on `--ink-2`). Mouse: the video badge when `videoRefill`, else no badge (web) |
| Bump | 2b's badge bump on a stock increase, unchanged |

**Idle pulse (measured)**: the suggested helper's disc and icon scale 1.00 → 1.08 with a warm glow, period **1.50 s**, forever: rise 0.48 s (0 → 32 %), hold to 36 %, fall 0.50 s (to 69 %), rest 0.47 s (to 100 %); the glow's opacity follows the scale (0 at rest, 1 at the peak); glow = `0 0 9px 2px rgba(var(--pulse-rgb), .9)` × s on a pseudo-element whose opacity animates (no box-shadow animation); the badge stays still. Keyframes in `hud.css` from `fx.helperPulse.periodMs` and `peakScale` (mirrored to `--pulse-ms`, `--pulse-scale` by the screen).

**Which helper pulses** `[DECISION]` D-2d-11 (`fx.helperPulse.target`, default `'auto'`): the recording shows the bulb pulsing on a board with five X marks and the user's screenshot (level start, nothing marked) shows the **kitty** glowing. Rule `'auto'`: while the attempt is `playing`, no overlay, hint card or coach is open, it is not the tutorial and the win flow has not started: the **kitty** pulses while every cell of the board is empty (nothing marked or placed), otherwise the **bulb**; a helper pulses only while it is enabled. `'bulb'` / `'kitty'` pin one; `'off'` stops it. Reduced motion: no pulse.

**Disabled** tools (`disabled`): opacity 0.45, no pulse, the badge stays readable.

**Hit area**: each helper disc keeps a 44 × 44 hit area at every s (§1.1; at 320 × 568 FBIG the disc is 42.9).

**Keyboard**: H (hint) and K (kitty) unchanged; **M** for the mouse (the screen's key handler and the board's key handler), ignored while `GameView.mouse` is not shown and enabled.

**Coach (tutorial step 5, G3 `coach.ts`; critic C8).** The round spotlight on the bulb must contain its badge: with the new badge offset the badge's far corner is 55.8 px from the disc centre at s = 1 while today's spotlight radius is 52.2 px (the 30.15 px disc radius + `HOLE_PAD` 4 + `SPOT_EXTRA` 18), so `roundSpot` takes the union of `.tool` and its `.tool__badge` rects (or a larger `SPOT_EXTRA`). `toolRow()` skips a tool with `[data-off]` (the hidden mouse keeps its slot and a non-zero rect). The card's preferred slot, the gap between the board and the tools, is now 53 s − 9 s of badges (≈ 44 px at s = 1) and too small for the card, so on phones the card lands below the top bar over the pills and rule cards (not soft rects except the highlighted card) or at the bottom over the tool row; the `layout` e2e "the coach never covers the board or the top bar" keeps holding and runs at 320 × 568, 390 × 844 and 1280 × 800.

### 1.12 The mouse helper `[DECISION-PENDING-USER]` D-2d-12

> **Phase 2d.1 (built, integrated 2026-10-10):** the mouse is now measured: it visits its three tiles one by one and leaves an X on each, with the board locked (D-2d1-1 replaces the 90 ms stagger of D-2d-12): [helpers-spec](helpers-spec.md) §1.

**What we know**: the recording shows a grey mouse button with a green "play" badge (watch a video). Research (one forum post, 3 Sep 2026, likely): the mouse **puts X's on 3 random cells that cannot hold a cat**; a staged rollout; how it is earned is unknown (`research.md` Q1.5).

**What we build** (behind `cfg.mouse.enabled`; `cfg.mouse.cells` = 3; cheap to change or switch off):

| Step | Rule |
|---|---|
| Tap | O2 (the rewarded prompt) opens with placement `'mouse'`: "Call the mouse?" with Watch video / Not now on FBIG; on the web its free variant (or the countdown while the shared fallback cooldown runs, `ads.unsupportedFallback.cooldownSec`, as hints and kitties use it). There is **no stock**: every use is one video (or one fallback grant). |
| Grant | after the video (or the free grant): the app picks the cells and dispatches `MOUSE`. |
| Cells | `pickMouseCells(state, cfg.mouse.cells, seed)` (new, G1, `src/game/mouse.ts`, pure): the candidates are the **empty** cells (not marked, no cat, not wrong) **not in the solution**; it picks `min(cells, candidates)` of them uniformly with the engine's seeded RNG, seed = `cyrb128(puzzleId + ':mouse:' + usesThisAttempt)` (deterministic for tests). |
| Reducer | `{ type: 'MOUSE'; cells; t }`: while `playing`, each listed cell that is still empty and not a solution cell becomes a Mark; the result emits `MARKED { cells, source: 'mouse' }`. No points, no mistake, no stat; the player can clear these X's like their own. |
| Enabled | `GameView.mouse.enabled`: tools ready (as the bulb) and at least one candidate cell exists. Shown (`mouse.shown`) when `cfg.mouse.enabled`, not in the tutorial, and the mode allows the kitty (`modes.ts kittyAllowed`). When not shown, the button stays in the row with `data-off` (invisible, inert, out of the Tab order) so the kitty and bulb do not move. |
| Motion | the X's pop one after another `fx.mouseStaggerMs` (90 ms) apart (board, on `MARKED` with `source: 'mouse'`); the mark sound per X as for painting (throttled as today). Reduced motion: all at once, no pop. |
| Screen reader | "The mouse crossed out 3 tiles." (`a11y.mouse`, plural) as the action's one utterance. |
| Analytics | `mouse_used { mode, cells }`; the rewarded video logs `ad_rewarded { placement: 'mouse' }` as the others do. |
| Platform | `RewardedPlacement` + `'mouse'`. The FB adapter uses one rewarded placement ID for every placement, so no new FB ID; the mock ads and the FB stub accept it. |
| Save | none (no stock). |

### 1.13 Score, the "+N" chip and the win flow

> **Phase 2d.1 (built, integrated 2026-10-10):** the "+N" pops over the cat's tile and a star carries it to the Score, which counts up without a bump; the roll, the bump and the inline chip are retired (D-2d1-4): [helpers-spec](helpers-spec.md) §2.5.

The 2c.1 level points (576 + 96 per cat in a run) move from the pills row into the top bar's **Score** column (§1.4). Every rule, time and announcement of fish-lives-spec §3 and §10 stays; only the place and the look change.

| Item | 2d |
|---|---|
| Number | `GameView.points` via `formatNumber`; "0" at a level start; set without motion by props (first render, restore, Retry, new board, language change). |
| `POINTS` event | the number rolls from `total − gained` to `total` (`fx.levelPoints.rollMs` 360, 2c.1's shared roll) and bumps (scale 1 → 1.12 → 1); no icon (the column has none). |
| "+N" chip | `fish.plus` "+576", `max(10px, 13 s px)` white on `--accent-text`, radius full, padding 2 s × 6 s, at the **inline end of the number**, vertically centred on it; it rises `fx.levelPoints.plusRisePx` (6) and fades over `plusMs` (700); one at a time. Reduced motion: fades in and out in place (2c.1). It never covers the "Score" label or the gear: **clamp (critic C9)**: when its inline-end edge would pass the gear disc's inner edge − 4 px, it shifts toward the inline start until it ends there (it may then overlap the number's last digits for its 700 ms; estimated with Fredoka's ≈ 0.6 em digits: at 320 × 568 FBIG, after the safe-zone shift, "2,016" with "+576" ends ≈ 10 px past the gear's clearance edge, and a 5-digit score with "+1,632" ≈ 28 px). Checked at 320 px web and FBIG in en, de and ar. |
| At the win | `[data-final]` when `catsPlaced ≥ n`: the number turns `--accent-text` (5.14 on the page) and stays so until the board changes; the Score column stays visible through the whole win flow (2c.1 F5.5). |
| Period counter (win flow, t = 1 000) | appears **in the heads pill's place**: the heads fade out over `fx.win.fishPillFadeMs` (200) while `.period-pill[data-in-game]` fades in, stretched over the same grid cell, white, content centred (`icon-trophy` 20 s + the period total, 17.6 s px, `--ink`). A new board brings the heads back. (2c.1 put it in the cat counter's cell; the heads pill is that cell now.) |
| Period "+N" chip in game (critic C10) | Today the win flow's "+3" chip is anchored **above** the period pill (`screens.css` `.period-pill__label { bottom: 100% }`, UX-12). Over the heads pill that puts it at y0 + 36–60 s, right under the Level column (x 99–201 s), so it would cover "96" (the 2c.1 L1 problem again). In game (`.period-pill[data-in-game]`) the chip sits **inside the pill at the inline end of the period total**, vertically centred, and rises at most `fx.win.plusLabelRisePx` within the pill's height; Home's period pill keeps the 2c rule. The `winflow` e2e UX-12 test changes from "above the counter" to "never over the period total, the Level column or the Score column". |
| Fish flight | unchanged code and times (2c §2.2–§2.3): sources `lifeSlots()` (the fish pill, now at the row's inline end), target `periodRect()` (the trophy in the heads pill); the path crosses the row (about 190 px at 402, 150 at 320) and lifts into the top-bar band. No new key. |
| Victory, ranking panel | unchanged layout (2c.1); they follow the tokens and the redrawn fish. |

### 1.14 Level-start toast `[DECISION]` D-2d-13

> **Phase 2d.1 (built, integrated 2026-10-10):** replaced by the two level-start tickers with our own honest lines (D-2d1-12 replaces D-2d-13; `start-toast.ts` deleted at I-3): [helpers-spec](helpers-spec.md) §5.

**Measured**: a cream pill **29.0 tall**, centre y0 + 103.8 (over the heads pill's bottom and the rules container's top), fill `#FEF0C7`, a ≈ 1.5 orange border `#DD9045`, ink text ≈ 16.3 px, a flexed-arm emoji ≈ 24 × 24 at its end; it **drifts left at a constant 100 px/s** and is gone 1.37 s into the recording. Not seen: its entry, its full text ("…ared this level!") and its trigger.

| Item | Spec (G3 UI, G1 trigger) |
|---|---|
| Copy | **Our own, honest**: no statistic, never "N % of players". `toast.start.level` "You can solve this one!", `toast.start.hard` "A hard one. You've got this!", `toast.start.retry` "Fresh start. You can do it!" (Appendix A). Every level can be solved, so each line is true. |
| Art | `art-flex` (new, G2): our own flexed arm, 24 s square, a rounded upper arm and a raised fist in `--fish` gold with a `--fish-deep` shade, no outline; `aria-hidden`. |
| Look | the pill above; padding-inline 12 s start, 4 s end; text, 4 s gap, the art; `--toast-fill`, `--toast-line` border 1.5 s, text `--ink`. |
| When | G1 calls `GameScreen.playStartToast(kind)` from `playBoardEntry()` on a **fresh board or a Retry** (never on a resumed board, a revive or the tutorial; not when `fx.startToast.enabled` is off). `kind` = `'retry'` for a Retry, else `'hard'` on a Hard level, else `'level'` (dailies and events: `'level'`). |
| Motion | `delayMs` (150) after the entry starts, it slides in from beyond the inline-start edge to x = 12 s over `inMs` (300, ease-out), holds `holdMs` (1 200), then **drifts out toward the inline start at `exitPxPerSec` × s (100 px/s × s), linear**, and is removed once fully off-screen (a 250 px toast takes about 2.6 s). RTL: it slides in from and out to the right. Reduced motion: fades in, holds `reducedHoldMs` (1 500), fades out (`fx.reducedMotionFadeMs` each way). |
| Layering | above the HUD rows, below every overlay; `pointer-events: none`; one at a time (a new one replaces a running one). |
| Screen readers | `aria-hidden` (decorative encouragement; announcing it would interrupt the level-start line). |
| DOM | `.start-toast[data-kind]` in the game screen's own fx layer. |
| Not O9 | the existing toast layer (O9, `toast.ts`) stays for messages; this is a separate component (`src/ui/fx/start-toast.ts`, new). |

### 1.15 The settings dot `[DECISION]` D-2d-14

**Measured**: a red dot on the gear (§1.4). What drives it in the original is unknown (research Q4). A dot must mean something real, so ours marks **something in Settings the player has not seen**:

- It shows while `save.ext.settingsSeen` (a number; absent = 0) is below `cfg.settingsDot.version` (1 at 2d: Colour patterns now also outline the X, a real change in Settings).
- Opening Settings from any screen sets `save.ext.settingsSeen = cfg.settingsDot.version` (saved at once; the cloud merge keeps the larger number). Raise `version` with a future release that adds or changes a Settings row; `0` turns the dot off.
- Shown on the game screen's gear, Home's gear and the event screen's gear (`GameView.settingsDot`, `HomeView.settingsDot`, `EventScreenView.settingsDot`); accessible name `common.settings.new` ("Settings, something new") while shown.
- No schema bump: `SaveData.ext` is the "new data without a schema bump" hook (04 §4.3). G1 adds the merge rule (max) and the validation (a finite number ≥ 0, else dropped).

### 1.16 Banner during play `[DECISION: default, user may change]` D-2d-15

> **Phase 2d.1 (built, integrated 2026-10-10):** the banner hides while the hint overlay is open and returns after it (D-2d1-13): [helpers-spec](helpers-spec.md) §3.2.

**Measured**: a standard 320 × 50 banner centred at y 777.7–827.7, 23.4 under the helper discs, 12.3 above the safe area. Research: confirmed for the app (reviews describe a permanent bottom banner in play; `research.md` Q5).

**Platform constraint** (parity-spec §3.1, [search: Meta docs], not first-hand): Meta's guidance says no banners during active gameplay. The user's parity instruction and the recording point the other way; parity-spec §0.7–§0.8 made the placement a default the user may change. We build it **on** (`ads.banner.duringPlay: true`), record the review and policy risk (app review, monetisation), and ask the user to confirm (§7 Q5). Gate **G4** (fb-dashboard B1–B5) re-checks the banner before production; turning `duringPlay` off restores the 2b rule.

| Item | Rule (G1 unless noted) |
|---|---|
| Gate | `bannerGate` with `screen: 'game'` qualifies only when `ads.banner.duringPlay` is on, then the same checks: `ads.banner.enabled`, the capability (both banner APIs + `VITE_FB_PLACEMENT_BANNER`), `progress.completed ≥ fromCompletedLevels` (10), not `noAds`, not the first-run tutorial. |
| Band (layout) | `GameView.bannerBand` = the gate says a banner **may** show on this game screen (computed at mount, not after a load), so the board never jumps mid-level. With the band, `computeLayout` reserves `toolsToBanner × s + bannerPx` (§1.1) above `bottom × s` + safeBottom. A change of `bannerBand` (No Ads bought) re-runs the layout. |
| Show | when the game screen's board entry ends (`screenShown('game')`), if the last `loadBannerAdAsync` was ≥ `minReloadSec` (60 s) ago; else skip this screen (no retry loop; the band stays). **Persistence**: a banner already up on the victory screen (or a previous game screen) stays up into the next game screen when no hide happened in between (no `screenGone` + `hide` pair on a banner-to-banner transition). |
| Hide | before any interstitial or rewarded ad (`adFlow.beforeShow`, unchanged; the mouse's video included), when a full-screen or modal overlay opens over the game (Settings, How to play, the shop, the rankings hub, **the ranking panel**), on leaving to Home or the event screen, and never on the tutorial; O4 (fail) is a results screen and keeps the banner `[DECISION]`. Not hidden by the hint card (O1), O2 (its own video hides it), the coach, toasts. After a hide it shows again only on the next eligible screen mount after the 60 s window. FB2B-1's late-load hardening stays: a load that lands after a hide is hidden. |
| FB facts | `loadBannerAdAsync(placement, 'bottom')` loads **and shows**; one load per 45 s (`RATE_LIMITED`); 50 dp, bottom, overlaying the webview (B5 unverified: the band may be wrong by the banner height; the lead tunes `bannerPx` at G4). |
| Overlays above the band | every overlay that can be open on the game screen while the banner shows keeps its controls above the band (the FB banner is a native view over the webview: anything under it can be neither seen nor tapped): the O9 toast, the hint card (O1), **the rewarded prompt (O2) and the fail overlay (O4)** (critic C11: O4 keeps the banner by the rule above, O2 until its video starts), the coach and the start toast. The game screen publishes `--play-band` (px: `toolsToBanner × s + bannerPx`, 0 without the band) and `--play-band-bottom` (px: `bottom × s` + safeBottom, the banner's distance from the viewport bottom) on `<html>` while mounted (G3); the overlays add `--play-band` + `--play-band-bottom` to their bottom padding or offset. |
| Screen padding (critic C12) | `base.css` gives `.screen[data-banner]` a `padding-bottom` of `--banner-reserve` (58 px) + safe bottom for Home, victory and the event screen. On the game screen the band is already in `computeLayout`, so `.screen--game[data-banner]` resets that padding to `var(--safe-bottom)` (G3, `overlays.css`), or the band would be reserved twice. |
| Web | production web has **no ads**: no banner and no band (the board is larger than on FBIG). Dev and e2e builds with `?ads=` keep the 2b mock bar (`[data-testid=mock-banner]`), now also on the game screen, drawn **320 × 50, centred, at `bottom: var(--play-band-bottom, 0px)`** (inline style; `platform/` may not import `ui/`, so it reads the variable the game screen publishes; 0 on other screens keeps the 2b full-width bar at the bottom) so the 402 × 874 acceptance shows it where the original's is (G1, `mock-ads.ts`). |
| No Ads | unchanged (`noAds` closes the gate; `entitlementChanged` hides a banner on show). |

### 1.17 Motion summary (every animation on the game screen)

| Motion | Trigger | Timing | Reduced motion |
|---|---|---|---|
| Board entry wave | mount, Retry | 2b §2.9, unchanged (`fx.boardEntry*`) | 2b |
| X pop | a new Mark (tap, paint, hint Apply) | `fx.markPopMs` 140, 0.6 → 1.06 → 1 | none |
| Mouse X's | `MARKED` with `source: 'mouse'` | pops `fx.mouseStaggerMs` 90 apart | all at once |
| Head found | `REGION_DONE` | `fx.headFoundMs` 300, fill + 1 → 1.25 → 1 | colour change only |
| Head lost | `CAT_REMOVED` (region undone) | fade 150 | instant |
| Helper pulse | `GameView.pulse` | 1 500 period: 32 % peak (×1.08 + glow), 36 % hold, 69 % rest | none |
| Score roll, bump, "+N" | `POINTS` | 2c.1 (`fx.levelPoints`) | 2c.1 |
| Fish loss / revive | `MISTAKE` / `REVIVED` | 2c §1.3–§1.4 | 2c |
| Start toast | `playStartToast` | in 300, hold 1 200, out at 100 px/s × s | fade, hold 1 500 |
| Badge bump | stock increase | 2b | 2b |
| Win flow | `WON` | 2c / 2c.1 times unchanged; period counter over the heads pill | 2c |
| Done-region veil, cat moods, blink, ear flick, glow | — | 2b, unchanged | 2b |

### 1.18 Accessibility and RTL summary

- Contrast: §1.2 (every text pair ≥ 4.5; graphics ≥ 3 except the recorded parity exceptions D-2d-6, each with another channel).
- Names: back "Back"; gear "Settings" / "Settings, something new"; Level heading = the title; Score `role="img"` "Level points: N"; heads pill "N of M cats placed"; fish pill "N of 3 fish left"; tools: "Kitty, 2 left", "Hint, 2 left"; a kitty or bulb at 0 with the video badge "Kitty: watch a video for more" (`game.tool.video.a11y`); the mouse always "Mouse: crosses out 3 tiles that have no cat" (`game.tool.mouse.a11y`; O2 says the video part when it opens) (Appendix A); the toast and every art piece `aria-hidden`; a mouse with `data-off` is `hidden`-equivalent (`inert`, `aria-hidden`, out of the Tab order).
- Announcements: unchanged except the mouse's line (§1.12).
- Keyboard: Tab order back → gear → board → kitty → bulb → mouse (DOM order; the Level and Score columns are not focusable); H, K, M.
- RTL: the stack, the bar's columns, the pills, the cards, the tool row, badge offsets, the "+N" chips and the toast mirror with logical properties; the **board stays LTR** (`i18n.css` `[dir='rtl'] .board { direction: ltr }`, unchanged: rows and columns are not mirrored), and so do the rule-card mini diagrams' cell order inside a mirrored card (`ruleDiagram` returns one SVG; the card mirrors its position, §1.7); the FB safe zone stays at the physical top left (§1.1).
- Large text (A11Y-6): the rules row grows (§1.1); 200 % zoom keeps no overlap (layout e2e).

---

## 2. What does not change, and the other screens

### 2.1 Unchanged

The rules, the reducer's mistake model, gestures (including drag-to-mark, which research now rates likely for the app), the engine, the 1 000 levels, the dailies and the events; lives as fish, revive, level points (576 + 96 per cat in a run), the period board, the win-flow times, the victory and ranking layouts (2c, 2c.1); hints and kitties and their stocks (`hints.startStock` 5, `kitty.startStock` 3; the recording's "2" badges are a player's stock, not a look, §7 Q10); interstitial pacing; saves (**still v3**: the only new stored datum is `ext.settingsSeen`); the 17 locales and the release-locale rule; the clean-room process; the Tux art and moods, the glow, the done-region veil.

### 2.2 Tokens that change globally, and how the other screens follow

One theme (the user: "No alternate themes. Just have one theme (match it fully)"), so the token changes of §1.2 apply **everywhere**:

| Change | Home | Event screen | Overlays (Settings, How to play, shop, hub, O1, O2, O4, coach) | Victory, ranking panel (dark `--stage`) |
|---|---|---|---|---|
| `--page` `#F7F2EF`, `--page-2` | yes | its event theme still overrides `--page` | yes (sheet backdrops) | no (dark) |
| Text `--ink` / `--ink-2` = `#935A5A` | yes | yes (re-checked on each event page: ≥ 4.97) | yes (O9 becomes a mauve pill with white text, 5.45) | white text stays |
| `--ink-rgb` (soft shadows, hairlines) | yes | yes | yes | — |
| Region palette, X, fish art | — | the event board | How to play's mini boards and fish | the kept-fish row, the flight |
| Round icon buttons (white disc, `--shadow-btn`, filled gear, red dot) | trophy + gear at Ø 37 | home + gear at Ø 37 | — | — |
| Layout | unchanged | unchanged | unchanged (O9, O1, the coach keep above the play band) | unchanged |

`[DECISION]` D-2d-8: Home and the event screen keep their 2b layouts (the recording shows neither); they take the tokens, the button look and the dot so the one theme stays consistent. The user may ask to change them later (§7 Q8).

### 2.3 Contrast checks after the change (`scripts/palette-check.ts`, G2)

`npm run palette:check` must pass with these changes, all computed on 2026-10-10 and listed in §1.2:

- `glyphContrast` per tile, normal and faded: the X edge rows use `mixHex(tile, TOKENS['ink-deep'], layout.mark.edgeMix)` and apply to the patterns-on state (≥ 3.24 / ≥ 9.82); the **default** white X becomes an informational row (1.60–3.52; D-2d-6); wrong X `--wrong` ≥ 3.41; pattern glyph `--ink-deep` at 0.85 ≥ 3.24 (faded 0.65: 3.30); Tux fur ≥ 4.00, outline ≥ 5.23.
- `uiContrast`: the 36 pairs with the new tokens (all pass: §1.2), plus new rows: round-button icon (`--ink-icon` on `--card`, graphic) 4.68; count badge (white on `--badge`) 4.68; video badge mark (white on `--badge-video`, graphic) 3.13; dot vs card (graphic) 3.48; rule text (`--ink` on `--rule-card`) 5.01; toast text (`--ink` on `--toast-fill`) 4.81; mini X (white on `--rule-mark`, graphic) 4.12; fish shade (`--fish-deep` on `--card`, graphic) 3.09. The "free tool badge" row becomes `--ink-deep` on `--gold` (8.67). The "fish outline (--ink on --fish)" row is removed (no outline). "kitty tool icon (--accent on --card)" is removed (full-colour art).
- `eventContrast`: every text pair on each event page with the new `--ink` (≥ 4.97), the motif colours of `EVENT_PATTERN_COLORS` included; if a motif colour drops a pair under 4.5, G2 lightens that motif colour (ours) and records it.
- The ΔE matrix and pairwise ≥ 10 (§1.9); the CVD report.
- `tests/unit/ui/palette-check.spec.ts` updates its hard-coded table values; `tests/unit/ui/css-rules.spec.ts` keeps "colour literals only in tokens.css" and the retired-look guard, which **adds** the 2c.1 values that 2d retires (`#FAF6F0`, `#665E6C`, `#A3193A`, `#FFB81F`, `#C98200`, the 2c.1 palette hexes) except where a 2d token reuses one (`#2F2A35` lives on as `--ink-deep`).

---

## 3. Workstreams (disjoint file ownership)

Three workstreams plus the lead. Every new file starts with `// Owner: G1|G2|G3 (Phase 2d)`. **Running** a script you do not own (`palette:check`, `i18n:check`, `size`) is fine; **editing** one is a request (`docs/phase2d/requests-G1|G2|G3.md`). A file not listed belongs to the lead; ask before touching it. Read-only for everyone: `src/engine/**`, `src/ui/dom.ts`, `tests/golden/**`, `src/data/**`, `tests/property/**`.

### 3.1 Ownership

| WS | Scope | Owns (create or modify) |
|---|---|---|
| **G1: logic, app, platform** | the mouse (§1.12), the view-model fields (§4.3), the pulse rule, the toast trigger, the settings dot (data), the banner in play (§1.16), the tutorial colours | `src/game/**` (`types.ts` `MOUSE` action and `MARKED.source`; `reducer.ts`; **new** `mouse.ts`; `modes.ts`; `tutorial.ts` `TUTORIAL_COLORS`, `tutorialAllowsTool(…, 'mouse')`; `ad-pacing.ts` `bannerGate` `'game'`; `save-fields.ts` / `save.ts` `ext.settingsSeen` validation and merge); `src/app/**` **except** `config.ts` (`views.ts`, `session.ts`, `session-parts.ts`, `session-effects.ts`, `session-types.ts`, `helper-flows.ts`, `banner-flow.ts`, `shell.ts`, `boot.ts`, `router.ts`, `store.ts`, `events.ts`, `win-flow.ts` if needed); `src/platform/**` (`types.ts` `RewardedPlacement`; `web/mock-ads.ts` banner on the game screen and its position; `fb/*` only if the placement needs it); `src/main.ts`; `src/workers/**` (no change expected); `tests/fixtures/fbinstant-stub.js`; `tests/unit/game/**`, `tests/unit/app/**`, `tests/unit/platform/**` (except `scripts.spec.ts`, lead), `tests/unit/layering.spec.ts`; `tests/e2e/{smoke,winflow,events,layout,fbig}.spec.ts`; `docs/phase2b/fb-dashboard.md` (B-rows for the banner in play); `docs/phase2d/requests-G1.md` |
| **G2: art, board, base tokens** | §1.1 layout math, §1.2 tokens, §1.8 board, §1.9 palette, §1.10 X, every new or redrawn art piece, palette-check | `src/ui/art/**` (`palette.ts` `PALETTE`, `PALETTE_DE00`, `PALETTE_CORE`, `HEAD_ORDER`, tiers in `regionColorsFor`, `TOKENS`, `xEdgeColor`; `sprite.ts` symbols `icon-back`, `icon-gear` (redrawn), `icon-play`, `tool-kitty`, `tool-bulb`, `tool-mouse`, `cat-head-flat`, `art-flex`, `mark-x` (redrawn), deletes `icon-rule-*` and `wrong-x`; `fish.ts` (redrawn fish and outline); **new** `rule-art.ts` `ruleDiagram`); `src/ui/board/**` (`layout.ts` `computeLayout`, `gapFor`, `evenInsets`, `readViewport` dev override; `board-cells.ts` X rects; `board-view.ts` `setSlot(slot, frame?)`, tile and card radius vars, X pop, mouse stagger; `board-fx.ts`; `keyboard.ts` M key; `board-types.ts`, `board-highlight.ts`, `gestures.ts` if touched); `src/styles/tokens.css`, `base.css`, `board.css`, `art.css`; `index.html` (`theme-color` only); `scripts/palette-check.ts`; `src/assets/fonts/**` (optional digits face, §1.3); `tests/unit/ui/{layout,board-view,board-entry,gestures,art-a11y-fx,palette-check,css-rules,review-fixes}.spec.ts`; `tests/e2e/visual-board.spec.ts` (**new**, lead creates it at L0); `docs/phase2d/provenance-G2.md` (**new**); `docs/phase2d/requests-G2.md` |
| **G3: HUD, screens, overlays, fx, i18n, audio** | §1.3 type, §1.4 bar, §1.5–§1.7 pills, heads, cards, §1.11 tool row and pulse, §1.13 score and win-flow UI, §1.14 toast UI, §1.15 dot UI, §2.2 other screens, every string | `src/ui/hud/**` (**new** `game-bar.ts`; `top-bar.ts` restyle, dot, exports; `pills.ts` heads pill, fish pill sizes, the score counter export, period counter over the heads; `rule-chips.ts` cards; `tool-bar.ts` three tools, badges, pulse); `src/ui/screens/**` (`game-screen.ts` relayout vars, `playStartToast`, `onMouse`, chrome lock; `home-screen.ts`, `event-screen.ts` dot and buttons); `src/ui/fx/**` (**new** `start-toast.ts`); `src/ui/overlays/**` (`rewarded-prompt.ts` `'mouse'`; `settings-modal.ts` (no new row; its patterns note is a string change); `coach.ts`, `hint-card.ts`, `toast.ts` above the play band; `how-to-play.ts` helpers note and art); `src/ui/a11y/**`; `src/ui/*.ts` (root UI helpers, if needed); `src/styles/{hud,fx,overlays,screens,i18n,overlay-chunk,events-chunk}.css`; `src/i18n/**` (English in **new** `src/i18n/en/ui-2d.ts`, the 16 locales, `meta.ts`, `index.ts` if needed); `src/audio/**` (no change expected); `docs/i18n/**`; `tests/unit/ui/{hud,pills,fx-fish,fx-a11y,period-text,review2b-css,hud-css}.spec.ts` (`hud-css.spec.ts` created by the lead at L0); `tests/unit/shell/**`; `tests/unit/i18n/**`; `tests/unit/sanity.spec.ts`; `tests/e2e/{visual,i18n}.spec.ts`; `docs/phase2d/provenance-G3.md` (**new**, the motions); `docs/phase2d/requests-G3.md` |
| **Lead** | config (done), budgets, dev harnesses, docs, integration | `src/app/config.ts` (done; later value changes go through the lead), `dev/**` (incl. **new** `dev/look-compare.ts`), `scripts/size-check.ts`, `tests/unit/platform/scripts.spec.ts` (ceiling tests), `playwright.config.ts`, `vite.config.ts`, `package.json`, `vitest.config.ts`, `tests/e2e/determinism.spec.ts`, every doc not listed above |

Why this split: the board, its tokens and every drawing share one owner (G2), so the palette, the X and `palette-check` land together (the palette cannot land without the wrong-X and glyph changes, code map (a)); everything placed on the HUD is G3's, so the bar, the pills, the cards, the tools and their CSS land together; G1 owns every data decision and the platform. `sprite.ts` and `tokens.css` are G2's only; G3 asks for a symbol or a token by request and uses a placeholder (§3.2) meanwhile.

### 3.2 Order

1. **L0 (lead, before anyone starts; mechanical):** move the "Phase 2c.1: the pills row" block of `tests/unit/ui/css-rules.spec.ts` into **new** `tests/unit/ui/hud-css.spec.ts` (G3), **and the `hud.css` half of "small white text on orange uses --accent-text: count badges on primary buttons and tools"** (the `.tool__badge` assertion; the red badge changes it; the `base.css` half stays in css-rules, critic C13); move the board captures of `tests/e2e/visual.spec.ts` (mid-game board, X close-ups, palette) into **new** `tests/e2e/visual-board.spec.ts` (G2) and add it to `playwright.config.ts` (`web-390`, `web-320`, `web-1280`); **change the four colour names** (`color.0` Coral, `color.2` Mustard, `color.7` Violet, `color.11` Pink in the English catalogue) **together with every test that names them**, whoever owns it (critic C14: G1 `points-session.spec` "Lemon done.", G2 `board-view.spec` "Lavender", G3 `sanity`, `hint-text`, `coach-toast-rotate`, `review-fixes`, `review2b-fixes`, `format.spec` and its snapshot, plus comments in `saves`, `resilience`, `tutorial-session`, `tutorial.spec`), so that no workstream's S0 turns another's tests red; G3 redrafts the 16 locales later; create `docs/phase2d/requests-G{1,2,3}.md`. Tree stays green.
2. **S0, interfaces first** (each workstream's first commit; additive only; each fixes the compile errors it causes in its own files):
   - G1: `Action` `MOUSE`, `MARKED.source?`, `RewardedPlacement` + `'mouse'`, `pickMouseCells` (stub returning `[]` is fine), the `GameView` fields filled with neutral values (`pulse: null`, `mouse: { shown: false, enabled: false }`, `videoRefill: false`, `bannerBand: false`, `settingsDot: false`) once G3's optional fields exist.
   - G2: `computeLayout` returns the new fields (§4.1) while still returning the 2b names; `gapFor`, `HEAD_ORDER`, `PALETTE_CORE`, `ruleDiagram` (placeholder grid), every new symbol id with a **placeholder** shape (a circle with a letter), the new tokens with their final values.
   - G3: `GameView` optional fields, `GameScreenCallbacks.onMouse?`, `GameScreen.playStartToast?`, `toolRect('mouse')`, `RewardedPromptProps.placement` + `'mouse'`, `TopBarProps.settingsDot?`, `HomeView.settingsDot?`, `EventScreenView.settingsDot?`, and **all English keys with final values** (Appendix A) in `src/i18n/en/ui-2d.ts` (M1 copy freeze).
3. **Parallel build** (§3.3). Nobody deletes a member another workstream may still use. **`tsc` covers `dev/**`** (lead-owned harnesses that build `createTopBar`, `createPills`, `createRuleChips`, `createToolBar` and call `computeLayout` directly), so until I-3 every props or callbacks interface those harnesses use (`TopBarProps`, `PillsProps`, `RuleChipsProps`, `ToolBarProps`, `ToolBarCallbacks`, `GameLayout`) only **gains optional members**: a member a harness passes is not removed or made required before I-1 / I-3 (critic C15). `GameLayout`'s 2b names keep existing from S0 but carry the 2d values (`tools` becomes the disc diameter, `topBar` = `bar`, `pills` and `chips` the scaled rows); no unit test asserts those px values, and the e2e suites run at I-6.
4. **Integration (lead):** I-1 `dev/**` (art, board, shell and b harnesses: the new props, symbols and the stack; `dev/look-compare.ts`); I-2 the requests; I-3 make the optional S0 members required and delete the 2c.1 members 2d retired (`PillsProps.compact`, the cat counter, the tight fallback, `ToolBarProps` 2b shape if replaced), updating the fake game screens that implement `GameScreen` / `WinScreen` (`tests/unit/app/harness.ts`, `boot.spec.ts`, `win-flow.spec.ts`, `tests/unit/shell/screens-2b.spec.ts`, `dev/b-harness.ts`) as 2c.1 did; I-4 budgets (§6); I-5 docs (Appendix B); I-6 acceptance (§5.5).

### 3.3 Work items

**G1**
1. `game/types.ts`, `reducer.ts`, **new** `mouse.ts`, `modes.ts`: §1.12 (`MOUSE`, `MARKED.source`, `pickMouseCells`, `mouseAllowed` = `kittyAllowed`).
2. `tutorial.ts`: `TUTORIAL_COLORS = [3, 7, 2, 0]`; `tutorialAllowsTool(step, 'mouse')` = false.
3. `ad-pacing.ts`, `banner-flow.ts`, `shell.ts`, `session.ts`, `boot.ts`: §1.16 (gate, band, persistence across banner screens, hides, FB2B-1 kept).
4. `helper-flows.ts`: `onMouse` (O2 → rewarded or fallback → `MOUSE`); `HelperPlacement` includes `'mouse'`.
5. `views.ts`: `selectGameView` new fields (§4.3) with the pulse rule (§1.11) and `videoRefill` (`capabilities.rewarded`); `selectHomeView` / `selectEventView` `settingsDot`.
6. `session.ts`: `playStartToast(kind)` from `playBoardEntry()` (§1.14); the `onMouse` callback. **Every** path that opens Settings marks `ext.settingsSeen` (§1.15): the game's `onSettings` (`session.ts`) and Home's and the event screen's gear (`shell.ts`), best done once where the router opens `'settings'` (critic C16).
7. `session-effects.ts`: the mouse line (`a11y.mouse`); `events.ts`: `mouse_used`.
8. `save-fields.ts` / `save.ts`: `ext.settingsSeen` validation and merge (max).
9. `platform/types.ts`, `web/mock-ads.ts` (game-screen banner, 320 × 50 at the band), `tests/fixtures/fbinstant-stub.js` (placement `'mouse'`).
10. Tests and e2e (§5.1, §5.3); `fb-dashboard.md` B-rows (banner in play, G4).

**G2**
1. `palette.ts`, `tokens.css`: §1.2, §1.9 (`PALETTE`, `PALETTE_DE00` from `palette:check`, `PALETTE_CORE`, `HEAD_ORDER`, tiers, `TOKENS` incl. `ink-deep` and `ink-icon`, `xEdgeColor`); rewrite the source comments that still say "R6: nothing sampled" (`tokens.css` header, the `TOKENS` docblock) to point at D-2d-0.
2. `layout.ts`: §1.1 (`computeLayout`, `gapFor`, `evenInsets`, the dev safe-area override).
3. `board-cells.ts`, `board-view.ts`, `board-fx.ts`, `board.css`: §1.8, §1.10 (card, radii, X rects, edge only with patterns, pop, wrong and ghost X, mouse stagger); `keyboard.ts`: M.
4. Art (`sprite.ts`, `fish.ts`, **new** `rule-art.ts`): every symbol of §3.1, each with a provenance row; size targets (§6.2).
5. `base.css` (`.btn--icon` look, §1.4 last paragraph), `layout.ts` probe and `tokens.css` `--safe-*` (`--dev-safe-*` override), `art.css`, `index.html` theme-color. The X pop's keyframes and class live in `board.css` / `board-fx.ts` (G2); G3 deletes `fx.css`'s `x-draw` rules once the pop lands (after 2d no `fx.css` rule targets `.cell__x*`).
6. `palette-check.ts`: §2.3.
7. Tests, `visual-board.spec.ts`, screenshots `docs/phase2d/screenshots/G2-*.png`.

**G3**
1. **New** `game-bar.ts` (+ `top-bar.ts` exports and restyle, the dot): §1.4, §1.13 (score column on the shared counter builder from `pills.ts`).
2. `pills.ts`: heads pill and tracker (§1.5–§1.6), fish pill sizes, period counter over the heads (§1.13); delete the cat counter, the points pill element, the tight fallback, the compact sizes.
3. `rule-chips.ts`: cards (§1.7) on `ruleDiagram`.
4. `tool-bar.ts`: three tools, badges, pulse (§1.11); `game-screen.ts`: the stack vars, `onMouse`, M key, `playStartToast`, `--play-band`, chrome lock on the new bar.
5. **New** `fx/start-toast.ts` (§1.14); overlays above the band (O9, O1, **O2, O4**, coach; §1.16); `coach.ts` spotlight with the badge and `toolRow` skipping `[data-off]` (§1.11); `rewarded-prompt.ts` mouse (title, video, free and countdown texts, `tool-mouse` art; `{count}` = `formatNumber(cfg.mouse.cells)`); `how-to-play.ts` helpers note and the new helper art; `settings-modal.ts` (no new row; its patterns note changes value); `overlays.css` `.screen--game[data-banner]` padding reset (§1.16).
6. `home-screen.ts`, `event-screen.ts`: the dot and the button look (§2.2).
7. CSS: `hud.css` (bar, pills, heads, cards, tools, badges, pulse keyframes, score chip), `fx.css` (toast, head pop; delete `x-draw`), `overlays.css`, `screens.css`, `i18n.css` (RTL offsets: badges, dot, chip, toast), `overlay-chunk.css` / `events-chunk.css` (tokens only).
8. i18n: Appendix A in `en/ui-2d.ts` (S0), the 16 drafts, `meta.ts` (maxLength: `game.score` ≤ 10 characters, `toast.start.*` ≤ 32, `game.tool.mouse` ≤ 12), `drafted-from.json` (`npm run i18n:check -- --write-drafted-from`), glossary ("Score" = the HUD label of the level points; "mouse" = the third helper), review log.
9. Tests and e2e (§5.2, §5.3); screenshots `docs/phase2d/screenshots/G3-*.png`.

---

## 4. Cross-workstream interfaces (exact; copy-paste versions in [CONTRACTS.md](CONTRACTS.md))

### 4.1 G2 → G3: layout (`src/ui/board/layout.ts`), lands in S0

`LayoutInput` gains `banner?: boolean` (the band is reserved). `GameLayout` gains `s`, `top`, `bar`, `rules`, `gaps`, `band`, `gap`, `radius` and keeps the 2b names (`colW`, `compact`, `topBar` = `bar`, `pills`, `chips` = `rules`, `tools` = the disc diameter, `boardMax`, `pad`, `slot`, `board`). New `gapFor(slotPx, c?)`. `evenInsets(n, slotPx, c?)` keeps its signature (inset = `gapFor(slot) / 2`). `readViewport` unchanged (the override is CSS). `BoardView.setSlot(slotPx, frame?: { pad: number; radius: number })` (the card's padding and radius from the layout; absent = the old behaviour). `BoardInput.mouse?(): void` (the board's own key handler forwards M, as it forwards H and K through `bulb` and `paw`). **At I-3** the frame and `mouse` became required and the 2b names `topBar` and `chips` were deleted ([CONTRACTS](CONTRACTS.md) final).

### 4.2 G2 → G3: art and palette

`HEAD_ORDER`, `PALETTE_CORE`, `ruleDiagram(kind: RuleChip): string` (a type-only import of `RuleChip` from `ui/hud/rule-chips.ts`; erased at build, so no art → HUD runtime edge), symbol ids (`icon-back`, `icon-gear`, `icon-play`, `tool-kitty`, `tool-bulb`, `tool-mouse`, `cat-head-flat`, `art-flex`, `mark-x`, `icon-fish`, `icon-fish-empty`) in `IconSymbol` / `SymbolId`; tokens of §1.2 as CSS custom properties.

### 4.3 G1 → G3: view models (G3 declares them optional in S0; G1 fills them; required at I-3)

```ts
// src/ui/screens/game-screen.ts (G3 declares)
export type HelperKind = 'paw' | 'bulb' | 'mouse';
export type StartToastKind = 'level' | 'hard' | 'retry';
export interface GameView { /* 2c.1 members */
  readonly pulse: 'paw' | 'bulb' | null;               // §1.11
  readonly mouse: { readonly shown: boolean; readonly enabled: boolean };   // §1.12
  readonly videoRefill: boolean;                         // a rewarded video can refill (§1.11 badges)
  readonly bannerBand: boolean;                          // §1.16
  readonly settingsDot: boolean;                         // §1.15
}
export interface GameScreenCallbacks { /* … */ onMouse(): void }
export interface GameScreen { /* … */
  toolRect(tool: HelperKind): DOMRect | null;
  playStartToast(kind: StartToastKind): void;
}
```

`HomeView.settingsDot: boolean`, `EventScreenView.settingsDot: boolean`, `TopBarProps.settingsDot?: boolean`. `RewardedPromptProps.placement: 'hint' | 'kitty' | 'mouse'`.

### 4.4 G1 → G2 / G3: game events

`GameEvent` `{ type: 'MARKED' | 'UNMARKED'; cells: CellIndex[]; source?: 'mouse' }`. Board (G2): the staggered pop for `source: 'mouse'`. Pills (G3): `REGION_DONE` → head pop; `CAT_REMOVED` → diff `regionsDone`.

### 4.5 G3 → G1: strings and UI members

Every key of Appendix A with its final English value in S0; `a11y.mouse` (plural) called as `tn('a11y.mouse', cells.length, { count })`; `toast.start.<kind>` read by G3 only.

### 4.6 DOM contract (e2e)

| Element | Selector |
|---|---|
| Game bar | `header.top-bar.top-bar--game`; back `.top-bar__btn--home.top-bar__btn--back`; gear `.top-bar__btn--settings` with `.top-bar__dot` while shown; Level column `h1.top-bar__text` (`aria-label` = title) > `.top-bar__name` + `.top-bar__suffix` (+ `.badge--hard`) |
| Score | `.top-bar--game .points-pill` (`[data-final]`, `hidden`) > `.points-pill__name` (the label "Score"), `.points-pill__n` (the number), `.points-pill__label > .points-pill__chip` (the "+N" chip and its host, the 2c.1 counter builder shared with the period counter); no longer inside `.pills` (I-5: requests G1 R3 / G3 R5) |
| Pills | `.pills > .pill.pill--heads[role=img] > svg.head[data-color][data-done]`; `.pills > .pill.pill--lives > .life[data-full]`; win flow `.pills > .period-pill[data-in-game]` (`.period-pill__n`) |
| Rule cards | `ul.rule-chips[data-compact] > li.chip.chip--colours|lines|space[data-hl] > svg.chip__art, .chip__text, .sr-only` |
| Board | `.board`, `.cell[data-s]`, `.cell__xg > rect.cell__xe ×2 (patterns on) + rect.cell__x ×2` |
| Tools | `.tool-bar > button.tool.tool--paw|bulb|mouse[data-pulse][data-empty][data-free][data-off] > .tool__disc > svg.tool__icon` and `.tool__badge.tool__badge--count|--video|--free` (`data-off`: the mouse's slot kept, the button invisible and inert) |
| Toast | `.start-toast[data-kind=level|hard|retry]` |
| Banner | `.screen--game[data-banner]` (band reserved; padding reset, §1.16); mock `[data-testid=mock-banner]`; stub `[data-testid=fb-stub-banner]` |
| Removed | `.pill--cats`, `.pill__count`, `.pills > .points-pill`, `.pills[data-tight]`, `.tool + .tool` spacing rule, `.cell__xe` outside patterns mode |

### 4.7 CSS custom properties set by the game screen (G3) on `.screen--game`

`--s`, `--col-w`, `--y-top` (y0), `--bar`, `--pills`, `--rules` (and `--chips` = `--rules`), `--tools`, `--g-bp`, `--g-pr`, `--g-rb`, `--g-bt`, `--g-tb`, `--g-bottom`, `--band`, `--board`, `--safe-top`, `--safe-bottom`, `--pulse-ms`, `--pulse-scale`; on `<html>` while mounted: `--play-band` and `--play-band-bottom` (§1.16). The board (G2) sets `--pad`, `--board-radius`, `--slot`, `--gap`, `--cell-r` on `.board`.

### 4.8 Who lands what first

| Interface | Producer | Lands | Consumer can start with |
|---|---|---|---|
| `GameLayout` fields, `gapFor`, `setSlot(frame)` | G2 | S0 | the 2b names until then |
| Symbols, `ruleDiagram`, `HEAD_ORDER`, tokens | G2 | S0 (placeholders), final art in the build stage | placeholders behind the same ids |
| `GameView` fields, callbacks, `playStartToast`, `toolRect('mouse')` | G3 declares (optional) | S0 | G1 fills them after S0 |
| `MOUSE`, `MARKED.source`, `RewardedPlacement` | G1 | S0 | — |
| English keys | G3 | S0 (copy freeze M1) | G1 uses `t()` keys |

---

## 5. Test plan

### 5.1 G1 unit (`tests/unit/game/**`, `tests/unit/app/**`, `tests/unit/platform/**`)

- `mouse.spec` (new): `pickMouseCells` returns only empty non-solution cells, `min(k, candidates)` of them, deterministic per seed, `[]` when none; the reducer's `MOUSE` marks them, ignores a cell that became non-empty, emits `MARKED { source: 'mouse' }`, changes no points, hearts or stats, does nothing outside `playing`.
- `helper-flows.spec`: the mouse through O2 → rewarded → `MOUSE`; the web free and countdown variants share the fallback cooldown; `ad_rewarded { placement: 'mouse' }`; `mouse_used`.
- `flags-views.spec`: `pulse` per the `'auto'` rule (kitty on an empty board, bulb after a mark, null in the tutorial, under a modal, in the win flow, when the target is disabled; `'bulb'`, `'kitty'`, `'off'` via `mergeConfig`); `mouse.shown` / `enabled`; `videoRefill`; `bannerBand` per the gate; `settingsDot` from `ext.settingsSeen`.
- `banner-flow.spec`, `economy-pacing.spec`: the game screen qualifies only with `duringPlay`; a banner stays up from victory into the next game; hides before ads and the listed overlays; FB2B-1 late load still hidden; `duringPlay: false` restores every 2b case.
- `tutorial.spec`: `TUTORIAL_COLORS` `[3, 7, 2, 0]`, the mouse never allowed.
- `session` / `tutorial-session.spec`: `playStartToast` called with `'level'`, `'hard'`, `'retry'` on fresh boards and Retry; never on resume, revive or the tutorial.
- `save.spec`: `ext.settingsSeen` kept, invalid dropped, merged by max; the save stays v3.
- Platform: `mock-ads.spec` (game-screen banner and position), `fb-ads.spec` (`'mouse'` uses the one rewarded ID), stub.

### 5.2 G2 and G3 unit

- G2 `layout.spec`: every row of the §1.1 table (s, colW, compact, slot, gap, board, y0 within 0.5 px) for n = 10 and 12; text scale grows the rules row and shrinks the board; `gapFor`; `evenInsets` = `gapFor / 2`; `hitTest` unchanged.
- G2 `art-a11y-fx.spec`: the X is two rects with the §1.10 attributes in every cell; edge rects only styled visible under `[data-patterns]`; `xEdgeColor` uses `ink-deep` and `edgeMix`; every new symbol exists and is decorative; `regionColorsFor` uses only `PALETTE_CORE` for n ≤ 10, adds 9 at 11, all at 12, and keeps adjacent ΔE ≥ 10; `HEAD_ORDER` is a permutation of 0…11.
- G2 `palette-check.spec`, `css-rules.spec`: §2.3; tokens.css mirrors `TOKENS`; no `box-shadow` on `.board`.
- G2 `board-view.spec`: aria labels with the new names ("Row 1, column 2, Violet, empty"); the X pop class; the mouse stagger.
- G3 `hud.spec` (bar, cards, tools): Level / Score columns from `splitTitle`; Score hidden for null; the Hard badge; the dot and its name; the fit steps; three tools with the right badges (count, free, video, muted 0, none); `[data-pulse]` follows `GameView.pulse`; disabled tools do not pulse; M key.
- G3 `pills.spec`: n heads in `HEAD_ORDER`, tint vs found, the pop on `REGION_DONE`, the un-fill on `CAT_REMOVED`, reduced motion; the fish pill sizes; the period counter over the heads at the win and the heads back on a new board; no `.pill--cats`, no `data-tight`.
- G3 `hud-css.spec` (new): the stack variables drive the rows; the badge offsets mirror in RTL; the pulse keyframes stops (0 / 32 / 36 / 69 / 100 %).
- G3 `fx-a11y.spec` / new `start-toast.spec`: the toast's phases and its removal; RTL direction; reduced motion; `aria-hidden`.
- G3 `catalogs.spec`, `sanity.spec`: Appendix A keys in all 17 catalogues; `game.cats` gone everywhere; the four colour names; `colorName(7) === 'Violet'`; `hint-text.spec` and the format snapshot with the new names.

### 5.3 End-to-end (Playwright, built apps)

| Spec (owner) | Change |
|---|---|
| `smoke` (G1) | heads instead of "N / 10" (`.head[data-done]` count = cats placed); the Score text in `.points-pill__n`; the mouse: a tap → O2 free (web) → 3 more `.cell[data-s=m]`, none on a solution cell; M key; the start toast appears on a fresh level and not on resume |
| `winflow` (G1) | `.period-pill[data-in-game]` over the heads pill; the fish still fly (times unchanged); `[data-final]` on the score; back and gear locked; the UX-12 chip test becomes "the +N chip never covers the period total or the bar's columns" (§1.13) |
| `events` (G1) | an event puzzle shows the bar's title split ("Lantern Walk" / "13") with the whole label visible at 390 (the column widens, §1.4 Fit) and the score |
| `layout` (G1) | at 320 × 568, 360 × 640, 390 × 844, 1280 × 800 and with 2× text: every row inside the viewport, no overlap between rows, the stack order of §1.1, the board centred; 12 × 12 whole cells, also at 320 × 568 with `--dev-safe-top: 20px` and the band (slot 21); every round button's hit area ≥ 44 × 44 (`elementFromPoint` at the hit area's corners); the coach never covers the board or the bar; the banner band and the helpers do not overlap; on FBIG no **control** in the top-left 64 × 64 and the Level column clear of the moved back disc; keyboard order |
| `fbig` (G1) | banner in play: none before 10 completed levels; on the game screen after 10 with the band; hidden before an interstitial, the mouse's video and Settings; persistence from victory into the next game; `duringPlay` off (a config variant build or a URL override in e2e builds only) restores "never in play" |
| `visual-board` (G2, new) | the board at 402, 390, 320 and 1280: X marks (default and patterns on), wrong X, ghost X, every palette colour on a 12 × 12 board, the tile radius and gap |
| `visual` (G3) | the full game screen at 402 × 874 (safe override 62/34, band), 390 × 844, 320 × 568, 1280 × 800; the bulb at its pulse peak; the toast mid-drift; the win flow with the period counter; Home and Settings with the new tokens |
| `i18n` (G3) | de, fr, ar at 320 × 568: the bar's columns fit (fit steps), the cards (compact) and the score chip fit, RTL mirroring; the level number never truncated |

### 5.4 Visual acceptance against the recording (lead, `dev/look-compare.ts`)

Required before 2d is called done. The script builds nothing; it drives the built e2e app with Playwright and composes images **in a scratch folder** (never in the repo, D-2d-0 d):

1. **402 × 874, DSF 3**, `:root { --dev-safe-top: 62px; --dev-safe-bottom: 34px }`, `?ads=` (mock banner, the band reserved), a seeded returning player at **our** level 96 (10 × 10), stock 2 hints and 2 kitties, 3 fish, score 0, X marks on row 0 columns 0–4, Settings never opened (the dot shows); captured once at rest and once with the bulb pulse paused at its peak (`document.getAnimations()` set to 32 %). Composed side by side with the colour-corrected recording frame `t2.400`, the pulse-peak frame `t3.200` and `still.png` from `$MEWDOKU_ORIG_REF`, at the same CSS-px scale with 50 px guides.
2. The same screen of ours at **390 × 844**, **320 × 568**, **1280 × 800**, **German 320 × 568** and **Arabic 320 × 568**, each beside the original at 402 for reference.

**Pass criteria at 402 × 874** (checked by the script from DOM rects and pixels, then looked at by the lead and shown to the user): every box in the §1.1 table, the discs, the columns' centres, the heads' and fish's first and last x, the cards and the badges within **±2 px** of the measured original; tile 35 ± 0.5, gap 3 ± 0.5, tile radius 3.8 ± 0.5; X bar 6.9 ± 0.4, X box 21.5 ± 0.6, no outline; page, card, ink, **icon ink** and the 10 tile colours within ΔE00 ≤ 1 of the measured PNG values; no shadow on the board card, warm shadow on the discs. Differences that remain by design are listed in the result: our art (our own drawings of every icon; the heads are our own pointed-ear silhouette, D-2d-18), our copy, our level, the font weight of the labels, and the colours darkened for contrast (count badge `#DC2F2F` vs `#E93636`, ΔE00 3.3; video badge `#03A84A` vs `#02BE52`, ΔE00 6.3; fish shade; D-2d-17, §7 Q12).

### 5.5 Acceptance checklist (Phase 2d done)

- [ ] `npx tsc --noEmit` (incl. `dev/**`) clean; `npx vitest run` green; `levels:verify`, `palette:check`, `i18n:check` (and `--release`) pass.
- [ ] Every build and both FB zips build; `npm run size` within the ceilings or a recorded lead decision (§6).
- [ ] Playwright green twice in a row on the final tree.
- [ ] §5.4 composed and looked at; pass criteria met; the images shown to the user (not committed).
- [ ] Provenance rows for every new or redrawn art piece and motion; no reference frame or sampled image in the repo (`git status` clean of `orig-ref` material).
- [ ] Docs of Appendix B updated; STATUS-2d written.

---

## 6. Bundle plan

### 6.1 Headroom at `ececec5` (code map (m))

First-load CSS **49 B**; FBIG first-load gzip **420 B** (release-FBIG 791 B); main JS 8.4 KB (FBIG); font 532 B; optional lazy JS 192 B; core lazy JS 3.5 KB; lazy CSS 1.4 KB. Everything 2d adds to the game screen is first-load (04 §9 "What stays in the main bundle").

### 6.2 Dead code to delete, and what is added (estimates; raw bytes unless noted)

| Item | Owner | Main JS | First-load CSS |
|---|---|---|---|
| Points pill look in the row (`.points-pill*` pill rules, sizing, compact) → score column rules | G3 | — | −2.05 KB, +0.6 KB |
| Cat counter (`.pill--cats`, `.pill__icon`, `.pill__count`, `[data-complete]`, compact; `game.cats` ×17) | G3 | −0.3 KB | −1.0 KB |
| Tight fallback (`measureTight`, `TIGHT_STEPS`, resize listener, `[data-tight]`) | G3 | −0.4 KB | −0.27 KB |
| Pills and chips compact sizes | G3 | — | −0.4 KB |
| Chip look → card look | G3 | −0.1 KB | −0.95 KB, +0.8 KB |
| `icon-rule-colours/-lines/-space` | G2 | −0.8 KB | — |
| `wrong-x` (already unused) | G2 | −0.3 KB | — |
| X stroke draw-in (`x-draw`, `xe-draw`, `--x-len`, dash rules) → pop | G2 / G3 | −0.1 KB | −0.5 KB, +0.15 KB |
| Tool hard edge, `.tool + .tool`, `.tool--paw` accent | G3 | — | −0.2 KB |
| **Added:** game bar (two columns, fit, dot) | G3 | +1.2 KB | +0.9 KB |
| **Added:** heads pill and tracker | G3 / G2 | +0.6 KB (+0.3 KB silhouette) | +0.4 KB |
| **Added:** rule cards (`ruleDiagram`) | G2 / G3 | +0.7 KB | (in the card rules) |
| **Added:** helper art (`tool-kitty` ≤ 1.0 KB, `tool-bulb` ≤ 0.5 KB, `tool-mouse` ≤ 0.8 KB, `icon-play`, `icon-back`, `art-flex` ≤ 0.4 KB; the gear and fish redrawn at today's size) | G2 | +2.9 KB | — |
| **Added:** third tool, badges, pulse | G3 | +0.4 KB | +0.9 KB |
| **Added:** mouse flow, reducer, picker, views, banner in play | G1 | +1.9 KB | — |
| **Added:** start toast | G3 | +0.6 KB | +0.4 KB |
| **Added:** layout math, tokens | G2 | +0.4 KB | +0.3 KB |
| **Added:** English strings (Appendix A, net of `game.cats`) | G3 | +0.9 KB | — |
| **Net (estimate)** | | **≈ +8.0 KB** (gzip ≈ +2.8 KB) | **≈ −0.7 KB** |

Art is written compactly (relative path commands, one decimal, shared gradients avoided; flat fills with one highlight shape), and each piece is measured against its target above (G2 reports the bytes in `provenance-G2.md`).

### 6.3 Expected effect per row, and the ceilings

| Row (FBIG) | At `ececec5` | Expected after 2d | Ceiling | Action |
|---|---|---|---|---|
| Main JS | 280.6 KB | ≈ 288.6 KB | 289 | within, about 0.4 KB left: no headroom for overruns |
| First-load CSS | 43.45 KB | ≈ 42.8 KB | 43.5 | within (deletions pay for the new rules) |
| Font | 16.47 KB | 16.47 KB | 17 | unchanged (the digits face is optional and needs its own decision) |
| First load (raw) | 341.3 KB | ≈ 348.6 KB | 350 | within |
| + 1 locale | 367.2 KB | ≈ 375.5 KB | 377 | within |
| **First load, gzip** | 126.1 KB | **≈ 128.9 KB** | **126.5** | **over** |
| Locale chunk (largest) | 25.9 KB | ≈ 26.5 KB | 28 | within |
| Core lazy JS | 70.3 KB | ≈ 70.6 KB (O2 mouse texts, How to play note) | 74 | within |

The gzip row will not hold: 420 B cannot carry a third helper with three full-colour drawings and a new top bar. **Plan:** the workstreams delete everything in §6.2 first and keep their additions at the targets; at I-4 the lead measures and, for each row still over, records a decision in [04 §9](../phase1/04-architecture.md) and in `scripts/size-check.ts` under the 04 §9 policy (measured maximum + about 3 %). **Expected (critic C18: the estimates' own error is larger than the margins):** first load gzip 126.5 → ≈ 133 KB (**certain**); main JS 289 → ≈ 297 KB (**likely**: a 0.4 KB margin on an ≈ 8 KB estimate); first load 350 → ≈ 359 KB and + 1 locale 377 → ≈ 387 KB (likely, they follow main JS); first-load CSS 43.5 → ≈ 45 KB (**coin flip**: a −0.7 KB estimate against a 49 B margin, with ± 1 KB on the deletions and the critic's additions — `.btn--icon` restyle, hit areas, badge growth, `--play-band` offsets, the RTL offsets — not in §6.2). Each raise happens only if the measured value exceeds its ceiling. Why it is acceptable: the load-time gate (STATUS-2b §8: about 4.5 s on Slow 4G) has room; +8 KB raw is about 0.05 s of transfer at 1.44 Mbit/s on the 4.3 s estimate of STATUS-2c §10.4, and the lead re-measures before upload. The structural reduction (moving the How to play and tutorial English strings out of the main bundle) stays the fallback if a ceiling raise is refused.

---

## 7. Open questions for the user (each with our provisional decision, all built so they are cheap to change)

| # | Question | Provisional decision (built) | Where to change |
|---|---|---|---|
| Q1 | **X accessibility**: plain white X like the original, the edge always, or the edge only with Colour patterns on? | Plain white by default (your "Xs are better"); the dark edge returns with **Colour patterns on** (D-2d-5) | `board.css` `[data-patterns]` rule |
| Q2 | **Two more colours** for 11 × 11 and 12 × 12: can you record a 12 × 12 board of the original, or keep ours? | Ours: Mint `#52A982` and Cocoa `#B0855A`, used only when a board needs more than 10 (D-2d-10) | `palette.ts`, `tokens.css` |
| Q3 | **The mouse**: what does it do in your game, and does it have a stock or a daily limit? | Crosses out 3 random tiles that cannot hold a cat, one video per use, no stock (D-2d-12) | `cfg.mouse` (`enabled`, `cells`) |
| Q4 | **The red dot** on the gear: what does it mean in your game? | Something in Settings you have not seen yet; clears when you open Settings (D-2d-14) | `cfg.settingsDot.version` |
| Q5 | **Banner during play**: keep it, knowing Meta's guidance (read through search summaries) says no banners during active gameplay (risk: app review, ad revenue)? | On, like your recording, on FBIG only (D-2d-15) | `ads.banner.duringPlay` |
| Q6 | **Heads**: what does a head look like in your game once its colour has a cat? | It fills with the full colour and pops (D-2d-9) | `pills.ts`, `hud.css` |
| Q7 | **Level-start toast**: when does it show, and what does it say? (We cannot show "N % of players" because we have no such data.) | Every new level and Retry, our own encouraging line (D-2d-13) | `fx.startToast.enabled`, `toast.start.*` |
| Q8 | **Home and the event screen**: should they change like the game screen? Can you record them? | Only colours, round buttons and the dot; layouts unchanged (D-2d-8) | — |
| Q9 | **Which helper glows**: in your screenshot the cat glows at the start, in the video the bulb. Is that how it works? | The cat while nothing is marked, then the bulb (D-2d-11) | `fx.helperPulse.target` |
| Q10 | **Helper counts**: your game showed 2 and 2; ours start with 5 hints and 3 kitties. Change the starting stock? | Keep ours (economy, not look) | `hints.startStock`, `kitty.startStock` |
| Q11 | **Label weight**: your game's "Level" / "Score" labels are a little lighter than our one font weight allows within the size budget. Is that close enough? | Keep one weight; heavier numbers through a text stroke (D-2d-7) | `hud.css` |
| Q12 | **Badge colours** (critic): your game's red count badge (`#E93636`) and green video badge (`#02BE52`) are too light for their white digits and play mark by the accessibility rule we follow (4.16 and 2.47, needing 4.5 and 3). Keep them a shade darker (`#DC2F2F`, `#03A84A`; visible side by side), or match exactly and accept the lower contrast? | A shade darker (D-2d-17) | `tokens.css` `--badge`, `--badge-video` |

Research facts that touch other phases are noted, not built: the leaderboard period may be **daily** in the original (reviews say "daily ranking"; ours is weekly, a 2c default the user may change); top daily places pay 2 hints + 2 kitties; Restart may show an ad.

---

## 8. Decision log (Phase 2d)

| # | Decision | Kind |
|---|---|---|
| D-2d-0 | Match the original's game-screen look and layout from the user's recording: measuring and colour sampling allowed (R6 reversed for it), trade-dress risk accepted, G-LEGAL still blocks release, no tracing, our own art and copy | **user, 2026-10-10** |
| D-2d-1 | The screen is a top-down stack of the measured rows and gaps, scaled by one factor s (height- or width-bound), spare height above (≤ 62 s) then below | ours (the original was seen at one size) |
| D-2d-2 | Palette colours sampled from the PNG screenshot, not the darker video | measured |
| D-2d-3 | Tile, gap and radius ratios of the 10 × 10 board apply to every n | ours |
| D-2d-4 | The X is two rounded rects (75 % × 19.7 % of the tile, corner 6.5 %); a pop replaces the draw-in | measured / ours (motion) |
| D-2d-5 | No X edge by default; the edge only with Colour patterns on | ours, asked (Q1) |
| D-2d-6 | Contrast exceptions for parity: white X, head tints, fish body, decorative diagram tiles and toast border | ours, recorded |
| D-2d-7 | One font weight; numbers emboldened with a text stroke | ours (budget) |
| D-2d-8 | Home and the event screen take tokens, buttons and the dot, not a new layout | ours, asked (Q8) |
| D-2d-9 | A found head fills with the full colour and pops | ours, asked (Q6); **replaced by 2d.1** (D-2d1-5: the cat face with a tint dot, measured) |
| D-2d-10 | Mint and Cocoa as colours 11 and 12; n ≤ 10 boards use only the 10 measured colours; four colour names change | ours, asked (Q2); **replaced by 2d.1** (D-2d1-10: Denim measured, 11 colours up to 11 × 11) |
| D-2d-11 | Pulse rule 'auto' (kitty on an untouched board, then the bulb) | ours, asked (Q9); **replaced by 2d.1** (D-2d1-9: idle 5 s, stock, no helper used yet) |
| D-2d-12 | The mouse: 3 X's on cells without a cat, one video per use, no stock, behind `cfg.mouse` | research (likely, one source) + ours, asked (Q3); **motion replaced by 2d.1** (D-2d1-1: the measured visits; the rule confirmed by the recording) |
| D-2d-13 | Level-start toast with our honest copy on new levels and Retry | ours, asked (Q7); **replaced by 2d.1** (D-2d1-12: two tickers) |
| D-2d-14 | The settings dot marks unseen Settings (`ext.settingsSeen` vs `settingsDot.version`) | ours, asked (Q4) |
| D-2d-15 | Banner during play on FBIG, band reserved from mount, persisting across banner screens | default, user may change (Q5) |
| D-2d-16 | The score's level points move into the top bar as "Score"; the period counter takes the heads pill's place at a win | ours (the task's direction; 2c.1 times unchanged) |
| D-2d-17 | Darkened only where a contrast floor required it: badge red, video green, fish shade, wrong X | ours |
| D-2d-18 | The tracker heads are our own plain pointed-ear cat-head silhouette (not Tux's notched outline), for closer parity | lead, 2026-10-10 |

---

## Appendix A. Strings (English, ours; G3 adds them in S0, the 16 drafts in the build stage)

**New keys**

| Key | English | Notes |
|---|---|---|
| `game.score` | Score | the top bar's column label (≤ 10 characters) |
| `game.tool.mouse` | Mouse | the third helper's name |
| `game.tool.mouse.a11y` | Mouse: crosses out {count} tiles that have no cat | tool button name; `{count}` = `cfg.mouse.cells` |
| `game.tool.video.a11y` | {tool}: watch a video for more | kitty or bulb at 0 with the video badge; `{tool}` = the tool's name |
| `a11y.mouse.one` / `.other` | The mouse crossed out {count} tile. / The mouse crossed out {count} tiles. | the mouse action's announcement |
| `rewarded.title.mouse` | Call the mouse? | O2 |
| `rewarded.video.mouse` | Watch a short video and the mouse crosses out {count} tiles that have no cat. | O2 video variant |
| `rewarded.free.mouse` | The mouse is free this time. | O2 free variant (web) |
| `rewarded.countdown.mouse` | The mouse is back in {time} | O2 countdown variant (web) |
| `toast.start.level` | You can solve this one! | start toast (≤ 32) |
| `toast.start.hard` | A hard one. You've got this! | start toast, Hard level |
| `toast.start.retry` | Fresh start. You can do it! | start toast, Retry |
| `common.settings.new` | Settings, something new | the gear's name while the dot shows |
| `mouse.unavailable` | The mouse is hiding. Try again in a moment. | toast when the O2 chunk cannot load (`helper-flows.ts` `cardsReady`, like `kitty.unavailable`; critic C17) |

`{count}` in `game.tool.mouse.a11y` and `rewarded.video.mouse` is `formatNumber(cfg.mouse.cells)` (G3 reads `cfg`, as `game-screen.ts` already does); the drafts are written for 3 and re-checked if `cells` changes.

**Changed values** (key kept; redraft all 16 locales; `drafted-from.json`). The four `color.*` values change at **L0** (lead, with every test that names them, §3.2); the other two at G3's S0.

| Key | 2c.1 | 2d |
|---|---|---|
| `color.0` | Strawberry | Coral |
| `color.2` | Lemon | Mustard |
| `color.7` | Lavender | Violet |
| `color.11` | Moss | Pink |
| `howto.helpers` | Stuck? The bulb explains one step. The paw finds a cat for you. | Stuck? The bulb explains one step. The kitty finds a cat for you. The mouse crosses out a few tiles that have no cat. |
| `settings.patterns.note` | Adds a small symbol to every colour. | Adds a small symbol to every colour and outlines the crosses. |

**Removed keys** (all 17 catalogues, `meta.ts`, `drafted-from.json`): `game.cats` (the heads pill replaces the counter; `game.cats.a11y` stays as its name).

**Kept, unchanged values**: `game.chip.*` and `game.chip.*.a11y` (the rule cards), `game.title.*`, `common.back`, `common.home`, `common.hard`, `game.points.a11y`, `fish.plus`, `game.tool.*` (2b), `rewarded.watch`, `rewarded.take`, `rewarded.noVideo`.

**Glossary** (`docs/i18n/glossary.md`): "Score" is the HUD label of the level points (never used for fish); "mouse" is the third helper (a small animal, not the computer device); colour names are tile names, not cosmetic words; the start-toast lines must stay encouraging and must never state a statistic.

## Appendix B. Documents to update at integration (lead, I-5)

Done at I-5 (2026-10-10) unless marked otherwise; [STATUS-2d](STATUS-2d.md) is a draft the final pass completes after 2d.1.

- `docs/phase2d/STATUS-2d.md` (new): what a player sees, requests, verification, budgets and decisions, screenshots, open questions.
- [01](../phase1/01-game-deconstruction.md): the first-hand rows are added at the spec stage (§8, §12, §6, §11.12, §19); mark them "built" at integration.
- [parity-spec](../phase2b/parity-spec.md): §0.3 (done at the spec stage), a banner line, §0.7 rows (X edge, banners in play, our own values → measured), §0.8 banners row, §1.3–§1.5 pointers, §3.2 banner rule pointer.
- [06](../phase1/06-legal-and-originality.md): §3 rows (done at the spec stage), §7 note (R6 reversed for the recording).
- [02](../phase1/02-rebuild-spec.md): S2 HUD, §17.2 palette, §17.4 board look, §18 X and accessibility, §19 layout.
- [04](../phase1/04-architecture.md): §9 budgets (I-4 decision), §4.3 `ext.settingsSeen`.
- [05](../phase1/05-fbig-platform.md) §6 and [fb-dashboard](../phase2b/fb-dashboard.md): banners in play, G4.
- [differences-vs-original](../phase2/differences-vs-original.md): the closed look items and what stays different.
- [CONTRACTS-2b](../phase2b/CONTRACTS.md): a §14 pointer to [CONTRACTS-2d](CONTRACTS.md).
- [provenance](../provenance.md): rows from `provenance-G2.md` and `provenance-G3.md` (art, motions; "2c.1 art retired in 2d" for the replaced fish, gear and rule icons).

## Appendix C. Art to draw (G2; each from the words here and in §1, never from a frame)

| Symbol | Words | Grid | Target bytes |
|---|---|---|---|
| `icon-back` | left arrow: a horizontal shaft and two head strokes meeting at the left, round caps and joins, stroke 3.1 at 20 × 17 | 24 | 0.1 KB |
| `icon-gear` | a filled cog with six rounded teeth and a round centre hole (even-odd) | 24 | 0.3 KB |
| `icon-play` | a rounded triangle pointing right | 24 | 0.1 KB |
| `tool-kitty` | Tux's head, front, winking (left iris open, right eye a light arc), open smile with a pink tongue, the blaze and the notched ear | 100 | ≤ 1.0 KB |
| `tool-bulb` | glossy yellow bulb with a highlight and an orange lower shade, a short neck, a two-ring violet screw base | 100 | ≤ 0.5 KB |
| `tool-mouse` | grey round face, big round ears with pink insides, bead eyes with catchlights, pink nose, two white teeth, three whiskers a side | 100 | ≤ 0.8 KB |
| `cat-head-flat` | A plain cat-head silhouette with two pointed, softly rounded ears (no notch, no face) as one flat shape, `currentColor` (D-2d-18) | 100 | ≤ 0.3 KB |
| `art-flex` | a flexed arm: rounded upper arm and a raised fist, gold with a darker shade, no outline | 24 | ≤ 0.4 KB |
| `icon-fish`, `icon-fish-empty` | §1.5 (head left, plump, forked tail lower right, eye dot, three scale arcs, highlight, no outline; the empty one an outline only) | 24 | as today |
| `mark-x` | the §1.10 rects | 100 | as today |
| `ruleDiagram(kind)` | §1.7 (3 × 3, tan, brown X boxes, Tux head cell) | 33 | ≤ 0.7 KB (code) |

## Critic changes (2026-10-10, independent critic before the build)

**Re-measured** with PIL + numpy on `full000.png` (geometry; the video frame) and `still.png` (colours), pixels ÷ 3; scripts in `scratchpad/2d/critic/`:

| Value | Spec had | Critic measured | Verdict |
|---|---|---|---|
| X bar thickness | 6.9 (19.7 %) | 7.04 (20.1 %; alias-free strip integration across the arm, 4 tiles of row 0) | kept (0.14 px) |
| X tip to tip / box | 26.2–26.3 / 21.5 | ≈ 26.3 (width profile ends 13.2 from the centre) / 21.3–21.7; the X's area (304 px²) matches two 26.2 × 6.9 bars with 2.3 px corners | kept |
| Tile radius | 3.83 (11 %) | 3.74–3.92 (area-deficit fit on 7 tiles) | kept |
| Card edge → first tile; card; tile; gap | 6.67 (built as 6.5); 390.67; 35; 3 | 6.67 (6.33 vertically); 390.67; 35.0; 3.0 | kept |
| Helper discs | Ø 60.3; centres 98.8 / 202.0 / 305.0 | Ø 59.3–60.3 at rest (≈ 62 while glowing); centres 99.0 / 202.2 / 305.8 | kept (< 1 px) |
| Text ink | `#935A5A` | `#935A5A` (labels, numbers, rule text) | kept |
| **Icon ink** (back arrow, gear) | `#935A5A` | **`#996767`** (solid fill, 756 and 1 505 px; ΔE00 4.55 from the text) | **changed: new `--ink-icon`** |
| Cat heads | 21.3 × 21.7, pitch 25.33, first x 22.3, top 129.0 | 21.33 × 21.67, pitch 25.33, first x 22.3, top 129.0 | kept |
| Top discs, dot, badges | Ø 36.8 at 31.5 / 370; dot (384.8, 73.3) `#F34F4F`; `#E93636`, `#02BE52` | 36.7 at 31.7 / 370.0; dot (384.8, 73.3) `#F34F4F`; `#E93636`, `#02BE52` | kept |
| Palette ΔE00, CVD, contrast claims; §1.1 table | as written | recomputed with `palette-check`'s functions and the §1.1 formula: identical | kept; two table rows added |

**Changes:**

- **C1** `--ink-icon #996767` for the icons in the white round buttons (§1.2, §1.4, §2.3, CONTRACTS §3, 01 row 12.12).
- **C2** §0.1: the recording is of the **iOS** app (iPhone frames, iOS control centre), not the Play Store app.
- **C3** §1.1: two rows for a 20 px safe top; the smallest slot is 21 px there (the "stays 22" claim held only without a safe top); `layout` e2e covers it.
- **C4** §1.1, §1.3: font sizes are rem × s (02 §18 "rem-based sizes"), with a 10 px floor; the bar grows with the text scale (`barH`) like the rules row (config comment updated; no value changed).
- **C5** §1.1, §1.4: the Level / Score pair re-centres between the discs and the columns widen with their content. Before, on FBIG the moved back disc (68–104.8 at 402) overlapped the Level column (99–201), and "Lantern Walk" (≈ 116 px) was cut to fit 102 px.
- **C6** §1.1, §1.4, §1.11: 44 × 44 hit areas at **every** s, for the top discs and the helper discs (42.9 px at 320 × 568 FBIG; the old rule skipped s < 0.8, i.e. 320 × 568).
- **C7** §1.11: badges grow with their text (min-width 28 s, padding 5 s), so "15", "Free" and "Gratis" fit.
- **C8** §1.11: the coach's bulb spotlight (52.2 px) did not contain the new badge (55.8 px); `toolRow` skips the hidden mouse; where the card goes now that the gap under the board is 53 s.
- **C9** §1.13: the score's "+N" chip is clamped before the gear (at 320 × 568 FBIG it would otherwise run ≈ 10–28 px past the gear's clearance edge).
- **C10** §1.13: the in-game period "+N" chip sits inside the heads pill. Anchored above it as today, it would cover the Level number (the 2c.1 L1 bug again); the `winflow` UX-12 test changes with it.
- **C11** §1.16: O2 and O4 stay open while a banner shows, so they keep their controls above the band; new `--play-band-bottom` (also positions the mock banner, which may not import `ui/`).
- **C12** §1.16: `.screen--game[data-banner]` resets `base.css`'s 58 px banner padding (the band would be reserved twice).
- **C13** §3.2 L0: the `.tool__badge` half of a G2-owned css-rules test moves to G3's `hud-css.spec.ts` (the red badge breaks it).
- **C14** §3.2 L0, Appendix A: the four colour-name values change at L0 with every test that names them (G1 `points-session`, G2 `board-view`, G3 shell / i18n specs), so no S0 turns another owner's tests red.
- **C15** §3.2, CONTRACTS: `tsc` covers the lead's `dev/**`, so the HUD props and `GameLayout` only gain optional members until I-1 / I-3; `GameLayout`'s 2b names carry 2d values from S0.
- **C16** §3.3 G1-6: every path that opens Settings marks `settingsSeen` (Home and event gear in `shell.ts`, not only the game's).
- **C17** Appendix A, CONTRACTS §6: `mouse.unavailable` (the `cardsReady` toast `helper-flows.ts` needs per placement); `{count}` comes from `cfg.mouse.cells`.
- **C18** §6.3: realistic expectations. The gzip raise is certain. Main JS and the two first-load totals are likely over. First-load CSS is a coin flip. Wording fixed ("exceeds").
- **C19** §1.7, §1.18: the board and the mini diagrams stay LTR in RTL; the mouse's accessible name is the same with the video badge; `data-off` is inert and hidden from screen readers; the Hard badge has floors.
- **C20** §5.3, §5.4, §7: e2e additions (hit areas, safe top 20, event label, coach, UX-12); by-design differences listed (head silhouette with rounded ears, darkened badge colours); new **Q12** on the badge colours.
- **C21** §3.3 G2: rewrite the "R6: nothing sampled" source comments; the exact `.btn--icon` look; the X pop's keyframes live in `board.css` and G3 deletes `fx.css`'s `x-draw`. §4.2: `ruleDiagram`'s `RuleChip` import is type-only.
- **C22** `src/app/config.ts` (comments only): the look-spec section numbers in the 2d docblocks were stale (§1.7 → §1.10, §1.9 → §1.11, …); `fx.markDrawMs` is marked `@deprecated phase2d`. `npx tsc --noEmit` is clean and `npx vitest run` passes **2 175 / 2 175 (110 files)** after the edit.

## 9. Integration changes (lead, I-1 to I-5, 2026-10-10)

What the integration changed against the spec above, with the measurements behind each change (`dev/look-compare.ts` at 402 × 874, DSF 3, safe 62 / 34, the band, our level 96 with five X's, against `measure.md` and the reference frames read from the scratchpad; the composites stay there). Before → after: **96 pass, 9 FAIL → 105 pass, 0 FAIL** (29 info rows).

| # | Change | Why (measured, ours vs the original) | Where |
|---|---|---|---|
| 1 | The "Level" / "Score" labels are thinned by a text stroke in the page colour (0.04 em over Fredoka's one 600 face; the system stacks step down to their own 500); the numbers lose the 2d text stroke; the rule-card text is thinned the same way (0.03 em in the card's fill, `--accent-soft` on a highlighted card). D-2d-7 stands (one font file, one weight); §1.3's "+ .04em text stroke" on the numbers is dropped. | Stroke width (2 × ink area ÷ perimeter, the same method on both): labels 2.11 / 2.12 → **1.51 / 1.53** (original 1.40 / 1.33); numbers 3.40 / 3.43 → **2.64 / 2.77** (2.39 / 2.65); rule text 1.35–1.38 → **1.05–1.06** (0.97–1.00) | `hud.css` |
| 2 | The display font's overlapping contours are removed (both Fredoka files; same glyphs and metrics; 16 468 → 16 668 B and 2 692 → 2 704 B; `dev/font-overlaps.py`; provenance §11.6). | A background-coloured stroke drew seams where two contours cross (`t`, `p`, `a`, `1`, `A`, `Ł`, …: 50 glyphs of 215 before, none visible after) | `src/assets/fonts/` |
| 3 | The fish's art fills the 24.7-wide slot (`.life .icon` and the splash: 26.5 s square at −1.55 / −2.58 s). | Drawn fish 21.7 × 20.3 → **24.8 × 23.0** (the original 24.8 × 23.7; spec 24.7 × 23.3) | `hud.css` (§1.5) |
| 4 | `cat-head-flat`'s viewBox is the silhouette's own box (`4 5.7 92 90.3`). | Heads 19.7 × 19.3 → **21.3 × 21.0** (21.5 × 21.7) | `sprite.ts` (§1.6) |
| 5 | The helper art boxes: kitty 36 × 36 (raised 0.9 s: the head's art sits low in its box), bulb 21.9 × 34, mouse 36.2 × 32.4 (× s). | Drawn art kitty 33.3 × 32.3 → **35.3 × 34.0** (34.7 × 34.3), bulb 21.3 × 32.7 → **21.7 × 34.0** (21.3 × 34.0), mouse 33.7 × 30.7 → **34.7 × 31.7** (35.0 × 31.3) | `hud.css` (§1.11) |
| 6 | `--shadow-btn` re-fitted: `0 3.5px 8px -2px rgba(var(--warm-rgb), .22)` (was `0 3px 7px -2px … .25`); one token for the bar's and the helpers' discs (requests G3 R1). | Shadow below the disc (summed deviation of the first 10 px; reach): helpers 470 → **510** (original 480–503), reach 6.3 → **7** (7); top discs 402 → **485** (538), reach 5.7 → **7** (7) | `tokens.css` (§1.2) |
| 7 | Every round button's 44 × 44 hit area is square (Home and the event screen too; requests G3 R2); the `layout` e2e probe clamps its points into the viewport (G3 R3) and also checks Home. | §1.1 Touch targets | `base.css`, `layout.spec.ts` |
| 8 | Budgets (§6.3): the event page patterns (3.3 KB) moved to the lazy `events-chunk.css`, 16 unused custom properties went (first-load CSS 48.3 → 44.7 KB, 44.8 on the final tree); then main JS 289 → 307, CSS 43.5 → 46, first load 350 → 370, + 1 locale 377 → 398, gzip 126.5 → 136.5, lazy CSS 31.2 → 34.6 KB (measured + about 3 %, 04 §9). Load time, the 2b method: FBIG first run on Slow 4G uncompressed **4.55 s** (2c.1 base 4.35 s; gate about 4.5 s), gzip 2.91 s; returning 3.37 / 2.09 s. | §6.3 expected these raises; [STATUS-2d](STATUS-2d.md) §4 | `scripts/size-check.ts` |
| 9 | I-3: every S0 optional member is required (`GameView` 5 fields, `HomeView` / `EventScreenView.settingsDot`, `onMouse`, `playStartToast`, `ToolBarProps` / `ToolBarCallbacks`, `PillsProps`, `BoardInput.mouse`, `KeyboardCallbacks.mouse`, `setSlot`'s frame); deleted: `PillsProps.compact` and `points`, `GameLayout.topBar` / `chips`, the sprite ids `icon-rule-*` and `wrong-x`. `TopBarProps.settingsDot` stays optional (§4.3). | §3.2 step 4 | [CONTRACTS](CONTRACTS.md) |
| 10 | The X box in `look-compare` is measured from the rects' geometry (21.5 px; their client boxes, 23.4, include the rounded-off corners) and from the white pixels (21.3). | §5.4 (X box 21.5 ± 0.6) | `dev/look-compare.ts` |

**Deviations and choices the workstreams made in the build** (recorded at I-5 from their reports; none changes a measured number):

- G1: the per-attempt mouse use counter restarts on mount and on Retry (`HelperFlows.newAttempt`), and `pickMouseCells` returns its cells in board order, so the X's pop in reading order. An "untouched" board for the `'auto'` pulse means every cell is Empty or Given. `pulse` is null under reduced motion in the view; when the chosen helper is disabled neither pulses. Banner persistence (§1.16) covers any move into an eligible game screen, from Home too (the same banner-to-banner rule); `screenGone()` is no longer a hide. The tutorial (a replay too) never reserves the band. A restored lost board (O4 open at mount) calls `screenShown('game')`. Settings marks `settingsSeen` from the shell on every `router.open('settings')`. Duplicate cells in `MOUSE` are marked once. The FB stub banner stays at the viewport's bottom edge (Meta's native banner); only the web mock sits at the band. e2e builds only: `?bannerPlay=0` turns `duringPlay` off.
- G2: `tool-kitty` reuses our Tux head with its wink eyes and open mouth (about 80 B of code); its closed eye is drawn in ink because it sits on the white blaze. The filled gear is a thick stroked ring with six round-capped teeth (271 B; the even-odd outline came to 637 B), which shows the same hole. Each `tool-*` symbol's viewBox is fitted to its art. The comparison board uses our level 785 (the five top-left cells one Coral region); `dev/look-compare.ts` uses our level 96 (Sky there). `--shadow-btn` is re-declared on `.screen--game`. The event motifs' `a` colours were mixed 15 % toward white so the new ink keeps 4.5:1 on them. The retired-colour guard skips `#B2AAB4` (the FB rank overlay's own canvas colour).
- G3: the game bar has `z-index: 1` so its discs' 44 px hit areas reach over the pills row at 320 (the win-flow scrim and the fx layer stay above it). When no slot keeps the coach card clear of the bar and the board, "Got it" moves beside the text (`[data-row]`). How to play's mini-board X covers the slot (tile + gap) and its tiles have an 11 % corner. `visual.spec` waits for the start toast to leave before the game shots (a separate shot keeps the toast mid-drift). In Arabic the heads pill mirrors: the first colour sits at the inline start (the right). The start-toast CSS stays first-load (a lazy toast could show unstyled at a level start).
