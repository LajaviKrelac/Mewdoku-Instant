# Phase 2d status: the game screen and the three helpers from the user's recordings

Status: **final** (Phase 2d and Phase 2d.1 built, integrated and accepted on 2026-10-10: two consecutive full Playwright runs green, both compare scripts against the recordings green, the screenshots looked at beside the user's frames; then the final audit's 20 findings verified, 18 fixed (A-3 by the auditor) and 2 kept by design, with the whole acceptance re-run, §18–§19) · Branch `claude/mewdoku-instant`, base `ececec5` (2c.1) · Specs: [look-spec](look-spec.md) (2d; its §9 lists what the 2d integration changed) and [helpers-spec](helpers-spec.md) (2d.1) · APIs: [CONTRACTS](CONTRACTS.md) and [CONTRACTS-2d1](CONTRACTS-2d1.md) (both final) · Part 1 (§1–§8) is Phase 2d; Part 2 (§9–§17) is Phase 2d.1 and the final acceptance of both; §18–§19 are the final audit's fixes and the known issues.

The user sent their own recording and screenshot of the original's game screen and asked: "Check the look and layout here in the original. Color palette is better also. Xs are better as well." Decision D-2d-0 allowed measuring sizes, positions and timings and sampling colours from it (parity-spec R6 reversed for this recording), with no tracing, our own art and our own copy; the trade-dress risk is the user's, and G-LEGAL still blocks a public release. Three workstreams built it in parallel (G1 logic, app and platform; G2 art, board and tokens; G3 HUD, screens, overlays and i18n), then the lead integrated them.

# Part 1: Phase 2d (the first recording)

## 1. What a player sees now

- **The game screen is the original's stack**, top-down, scaled by one factor: a white back disc, "Level / 96" and "Score / 0" columns and a gear with a red dot; a heads pill (one cat head per colour at 50 %, in the original's hue order; a found colour fills and pops) and a fish pill; three rule cards with 3 × 3 diagrams; the board card (no shadow, 3 px gaps, 11 % tile radius); three white helper discs (kitty, bulb, mouse) with red count badges, a green video badge and a 1.5 s idle pulse; on FBIG a 320 × 50 banner band under them.
- **The original's palette**: the page `#F7F2EF`, the mauve-brown ink `#935A5A`, and the ten region colours sampled from the screenshot (boards up to 10 × 10 use only those ten; Mint and Cocoa, ours, only on 11 × 11 / 12 × 12).
- **The original's X**: two plain white rounded bars, no outline, popping in. Colour patterns on brings back a dark edge.
- **New:** the mouse helper (crosses out 3 tiles that cannot hold a cat, one video or free grant per use, provisional, D-2d-12), a level-start toast with our own honest line, the gear's dot for unseen Settings, the banner during play on FBIG (a default the user may change, D-2d-15).
- Home and the event screen keep their layouts and take the new tokens, round buttons and the dot (D-2d-8).

## 2. Integration (I-1 to I-5)

| Step | What happened |
|---|---|
| I-1 dev harnesses | The four `dev/*-harness.html` pages carry `theme-color` `#F7F2EF` (G2 R1; `PENDING_R1` removed from `css-rules.spec.ts`, which now fails on any 2d-retired value in them); the harnesses dropped `wrong-x` / `icon-rule-*`, call `setSlot(slot, { pad, radius })` (G2 R2) and pass the new required props. **New `dev/look-compare.ts`** (look-spec §5.4): drives the built e2e app at 402 × 874 DSF 3 (safe 62 / 34 through `--dev-safe-*`, `?ads=ok`, our level 96, 2 hints, 2 kitties, 3 fish, X's on row 0, Settings never opened), measures every §5.4 item from DOM rects and pixels against `measure.md`'s numbers, reads the reference images only from `$MEWDOKU_ORIG_REF` / `$MEWDOKU_ORIG_FRAMES` and writes composites only to `$LOOK_SCRATCH` (both refused inside the repo), and saves our side as `docs/phase2d/screenshots/<prefix>-*.png` |
| I-2 requests | All 12 closed (§3) |
| I-3 required members, deletions | Required: `GameView.pulse / mouse / videoRefill / bannerBand / settingsDot`, `HomeView` and `EventScreenView.settingsDot`, `GameScreenCallbacks.onMouse`, `GameScreen.playStartToast`, `ToolBarProps.mouse / videoRefill / pulse`, `ToolBarCallbacks.onMouse`, `PillsProps.colors / regionsDone / boardId`, `BoardInput.mouse`, `KeyboardCallbacks.mouse`, `BoardView.setSlot`'s frame. Deleted: `PillsProps.compact` and `points`, `GameLayout.topBar` and `chips`, the sprite ids `icon-rule-colours / -lines / -space` and `wrong-x`, the 2b `boardPad` / `boardRadius` fallbacks in the board. The fakes (`tests/unit/app/harness.ts`, `boot.spec.ts`; `win-flow.spec.ts` fakes `WinScreen`; `screens-2b.spec.ts` and `dev/b-harness.ts` use the real screen) implement the required members. `TopBarProps.settingsDot` stays optional (look-spec §4.3). The `@deprecated phase2d` config keys stay (the config rule never removes a key) |
| Look polish (a)–(e) | §4 |
| I-4 budgets | §5 |
| I-5 docs | [provenance](../provenance.md) §11 (the G2 and G3 drafts merged; §6 the modified font files), [CONTRACTS](CONTRACTS.md) final (+ §10 the members added beyond it), look-spec §4.6 and §9, the request files' I-2 tables, [01](../phase1/01-game-deconstruction.md) ("built" note), [differences-vs-original](../phase2/differences-vs-original.md) §1.0b, [parity-spec](../phase2b/parity-spec.md) (status, §0.7, §0.8, §1.3, §3.2), [06](../phase1/06-legal-and-originality.md) §7, [02](../phase1/02-rebuild-spec.md) (S2, §17.2, §17.4, §18, §19), [04](../phase1/04-architecture.md) (§4.3 `ext.settingsSeen`, §9), [05](../phase1/05-fbig-platform.md) §6, [CONTRACTS-2b](../phase2b/CONTRACTS.md) §14. fb-dashboard B7–B9 were written by G1 |

## 3. Requests closed

| Request | Resolution |
|---|---|
| G1 R1 (game-bar hit areas) | Done by G3; at I-2 the square area moved into `base.css` for every round button |
| G1 R2 (coach over the bar at 320) | Done by G3 (`coach.ts` row layout) |
| G1 R3 / G3 R5 (Score label name) | The DOM stays: `.points-pill__name` is the label, `.points-pill__label` the "+N" chip's host (shared with the period counter); CONTRACTS §7 and look-spec §4.6 say so |
| G1 R4 (fakes need `playStartToast`) | Done (I-3) |
| G1 R5 (G1 members into CONTRACTS) | Done: CONTRACTS §10 |
| G1 R6 (05 §6, parity-spec banner lines) | Done (I-5) |
| G2 R1 (dev theme-color) | Done (I-1) |
| G2 R2 (dev ids, `setSlot` frame) | Done (I-1, I-3) |
| G2 R3 (How to play X) | Done by G3 |
| G3 R1 (`--shadow-btn` scaling) | G2 re-declared the token on `.screen--game`; `hud.css` dropped its copy and uses the token (then re-fitted, §4 d) |
| G3 R2 (square hit areas on Home / event) | Done: `base.css .btn--icon::before` has no radius; the game-bar override is gone; a new `layout` e2e test probes Home's round buttons |
| G3 R3 (probe clamped into the viewport) | Done: `layout.spec.ts` `hitAreaMisses` clamps each point |
| G3 R4 (first-load CSS over) | Done at I-4 (§5) |
| G3 R6 (required members, deletions) | Done (I-3) |

## 4. Look polish against the recording (`dev/look-compare.ts`, 402 × 874, DSF 3)

Before → after the polish: **96 pass, 9 FAIL → 105 pass, 0 FAIL** (29 info rows; the comparison images stay in the session scratchpad, never committed). Every position of look-spec §1.1, the discs, the columns, the pills, the cards, the board and the badges is within ±2 px; tiles, gaps and radii within 0.5; the X within 0.4 / 0.6; page, card, ink, icon ink and the ten tile colours at ΔE00 0.00.

| Item (lead's list) | Measured before (ours / original) | Fix | After |
|---|---|---|---|
| (a) "Level" / "Score" heavier than the original's | Stroke width (2 × ink area ÷ perimeter): labels 2.11 / 2.12 px vs 1.40 / 1.33 (×1.5); and the numbers too: 3.40 / 3.43 vs 2.39 / 2.65 (×1.4) | One font file and weight kept (D-2d-7): the labels are thinned by a text stroke in the page colour (0.04 em; the system stacks step down to their own 500), the numbers lose the 0.04 em stroke. A page-coloured stroke drew seams inside glyphs whose contours overlap (`t`, `p`, `a`, `1`, `A`, …), so the two Fredoka files had their overlaps removed (same glyphs and metrics; +200 B and +12 B; `dev/font-overlaps.py`; provenance §11.6) | labels **1.51 / 1.53** (×1.08 / 1.15), numbers **2.64 / 2.77** (×1.10 / 1.05) |
| (b) fish smaller | Drawn fish 21.7 × 20.3 vs 24.8 × 23.7 (spec 24.7 × 23.3 at 25.3) | The fish's art spans the 24.7 slot (the icon and its splash 26.5 s square, offset) | **24.8 × 23.0** at a 25.0 pitch |
| (c) kitty, bulb, mouse smaller in their discs | Kitty 33.3 × 32.3 vs 34.7 × 34.3; bulb 21.3 × 32.7 vs 21.3 × 34.0; mouse 33.7 × 30.7 vs 35.0 × 31.3 | Art boxes 36 × 36, 21.9 × 34, 36.2 × 32.4 (× s); the kitty raised 0.9 s (its art sat 1.4 px below the disc centre, the original's 0.5) | kitty **35.3 × 34.0** (centre +0.4), bulb **21.7 × 34.0**, mouse **34.7 × 31.7** |
| (d) the warm shadow fainter | Summed shadow below the disc (first 10 px), reach: helpers 470 / reach 6.3 vs 480–503 / 7; top discs 402 / 5.7 vs 538 / 7 (the bulb read 341 only because its animated disc renders 1 px higher; the script now starts at the disc's pixel edge) | `--shadow-btn` re-fitted to the recording's profile: `0 3.5px 8px -2px rgba(--warm-rgb, .22)` (was `0 3px 7px -2px … .25`), one token for every round disc | helpers **510** / 7 (×1.01–1.06), top discs **485 / 477** / 7 (×0.89–0.90) |
| (e) also seen side by side | Heads 19.7 × 19.3 vs 21.5 × 21.7; rule-card text 1.35–1.38 vs 0.97–1.00 (×1.4) | `cat-head-flat`'s viewBox fitted to the silhouette (`4 5.7 92 90.3`); the rule text thinned like the labels (0.03 em in the card's fill, `--accent-soft` on a highlighted card) | heads **21.3 × 21.0**; rule text **1.05–1.06** (×1.05–1.09) |

Measurement notes: the X box is now measured from the rects' geometry (21.5; their client boxes, 23.4, include the rounded-off corners) and from the white pixels (21.3). What stays different by design: our art (every icon drawn by us; the heads are our pointed-ear silhouette, D-2d-18; our Tux-based kitty has tall ears, so its face looks a little smaller than the original's round face at the same box), our copy and level, the darkened badge colours (D-2d-17), and the typeface (Fredoka against the original's lighter rounded face; its "Level" is about 7 % wider).

## 5. Bundle sizes and the I-4 decision (KB, 1 KB = 1 000 bytes; FBIG unless noted)

| Row | 2c.1 final | 2d build at I-4 start (G1–G3 + I-1 to I-3 and the polish; the polish added 0.1 KB of CSS and the font 0.2 KB) | After the I-4 cuts | Ceiling (old → new) | Why |
|---|---|---|---|---|---|
| Main JS | 280.6 | 298.2 (web 283.6) | 298.2 (web 283.6) | 289 → **307** | the 2d HUD, three helpers with art, the mouse flow, the banner in play, the layout; no 2d-dead JS left (the source-map attribution shows the 2d modules themselves); the structural fallback (English strings out of the main bundle) stays open |
| CSS (first load) | 43.45 | 48.3 | **44.7** (final tree 44.8: the kitty's 0.9 s offset) | 43.5 → **46** (2.8 % over 44.8) | the event page patterns (3.3 KB of data URIs) moved to the lazy `events-chunk.css` and 16 unused custom properties went; no unused selector left; the rest is the 2d HUD |
| Font | 16.5 | 16.7 | 16.7 | 17 (unchanged) | overlaps removed (§4 a): +0.2 |
| First load | 341.3 | 364.1 | **360.5** | 350 → **370** | 2.6 %; below the sum of its rows' ceilings (371), so it still binds |
| + 1 locale | 367.2 | 391.5 | **387.9** | 377 → **398** | 2.6 % |
| First load, gzip | 126.1 | 133.9 | **132.7** | 126.5 → **136.5** | 2.9 % |
| Lazy CSS | 29.8 | 30.2 | **33.6** | 31.2 → **34.6** | the event patterns moved in (only an event screen or board loads them) |
| Core lazy JS · optional lazy JS · worker · locale chunk | 70.3 · 29.1 · 17.6 · 25.9 | 71.5 · 29.1 · 17.6 · 27.4 | same | 74 · 29.3 · 18.5 · 28 (unchanged) | within |

Ceilings = the largest measured build + about 3 % (04 §9 policy), recorded in `scripts/size-check.ts` (history comment), `tests/unit/platform/scripts.spec.ts` and [04 §9](../phase1/04-architecture.md). Zips: release 300.5 KB (61 files), preview 402.5 KB (77 files), within 1 MB / 100 files.

**Load time, measured** (the STATUS-2b §4 method: `14b-firstload.mjs` on the FBIG e2e twin, Chromium, 390 × 844, cold cache, CPU 4×, DevTools Slow 4G, median of 3; the FB SDK download excluded; the 2c.1 base `ececec5` measured the same way on the same machine):

| Player | Uncompressed (2c.1 → 2d) | Gzip (2c.1 → 2d) |
|---|---|---|
| First run (the tutorial board) | 4.35 → **4.55 s** (469 KB, 7 requests) | 2.87 → **2.91 s** |
| Returning (Home) | 3.30 → **3.37 s** | 2.06 → **2.09 s** |

2d adds about 0.2 s to the worst case, and the uncompressed first run is now **at the release check's "about 4.5 s"** (STATUS-2b §8; Meta's guideline is < 5 s, before the SDK download). Options for the lead (not done here): accept and re-measure on the release build before upload as planned; or cut the first run's JS (the mouse flow, the start toast and the banner-in-play code are not needed by the tutorial board and could load after the first screen; or move the How to play / Home-only English strings out of the main bundle); or confirm that FB serves the bundle compressed (the gzip first run is 2.9 s).

**Resolved at 2d.1 I-4 (§11):** the tutorial coach became its own preloaded chunk and the 2d.1 motion went lazy; on the same machine as the final tree the 2d tree re-measures 4.52 s and the final 2d.1 tree **3.73 s** (first run, uncompressed). The ceilings above were re-set at 2d.1 I-4 (§11.3).

## 6. Verification (once, 2026-10-10; the full acceptance with two Playwright runs and the audit comes after 2d.1)

| Check | Result |
|---|---|
| `npx tsc --noEmit` (incl. `dev/**`) | clean |
| `npx vitest run` | **2 327 / 2 327** passed, 113 files |
| `npm run i18n:check` and `-- --release` | OK, 17 catalogues (release: en); 1 old warning (it `rank.title.period.week` 22 wide, max 20) |
| `npm run palette:check` | OK (the informational D-2d-6 rows listed) |
| `npm run levels:verify` | 10 level packs, 27 daily months, 3 event packs, 0 issues |
| Builds | `build`, `build:fbig`, `build:e2e`, `build:fbig-e2e` (with the Playwright config's e2e env), `build:release`: all OK |
| `npm run size` | every dist within budget: web, fbig, release-web, release-fbig (and dist/e2e, dist/fbig-e2e) |
| `zip:fbig` | release 300.5 KB, 61 files; preview 402.5 KB, 77 files |
| Playwright, all projects, no retries | first full run 213 passed, **3 failed**, 35 skipped: the new "Home's round buttons keep a square 44 × 44 hit area" test (requests G3 R2) counted Home's hidden trophy and home buttons; the helper now probes only rendered buttons (the game-screen test still requires its 5). Second full run: **216 passed, 0 failed, 35 skipped** (8.4 min, web-390, web-320, web-1280, fbig-390). After the last polish change (the kitty's 0.9 s offset) a third full run on the final tree: **216 passed, 0 failed, 35 skipped** (8.4 min) |
| `dev/look-compare.ts` (402 × 874 DSF 3 against the recording) | **105 pass, 0 FAIL**, 29 info (§4); without the reference images (measure.md numbers only) 105 pass, 0 FAIL |

## 7. Screenshots

`docs/phase2d/screenshots/INT-*.png` (our side only, from `dev/look-compare.ts` on the final e2e build): `INT-recording-402.png` (the recording's state at rest), `INT-pulse-peak-402.png` (the bulb paused at its pulse peak), `INT-game-390.png`, `INT-game-320.png`, `INT-game-1280.png`, `INT-game-de-320.png`, `INT-game-ar-320.png`. The composites with the reference are in the session scratchpad (`scratchpad/2d-INT/`), never in the repo. The workstreams' `G2-*.png` and `G3-*.png` were re-captured by the Playwright run with the polished look.

## 8. Open after Part 1, and where each went

- The acceptance pass (two Playwright runs, the images shown, this file completed): done with 2d.1, §12–§13.
- The uncompressed first-run load time at the release-check value: fixed at 2d.1 I-4, **4.52 → 3.73 s** (§11).
- 2d.1 changed several 2d provisional decisions (the mouse's motion, the found head, the pulse rule, the toast → two tickers, an 11th measured colour); `dev/look-compare.ts` was re-run on the final tree: **105 pass, 0 FAIL** (§13.1).
- Open questions for the user: look-spec §7 Q1–Q12 and helpers-spec §8 Q1–Q18 with their status after the new recordings: §14.
- Known: Italian `rank.title.period.week` is 22 characters wide against a limit of 20 (an i18n-check warning from 2c); the 16 locales' 2d and 2d.1 keys are unreviewed AI drafts (§15).

---

# Part 2: Phase 2d.1 (the three helpers, the tickers and the palette) and the final acceptance

The same day the user sent three more recordings of the original (the **mouse**, the **cat (kitty)** and the **bulb (hint)** helpers in use on Level 114, 9 × 9) and two level-start stills, asking us "to see and replicate 3 in game helpers - cat, hint, mouse". D-2d1-0 applies D-2d-0's terms to them (measure and sample; no tracing; our art and words). The spec is [helpers-spec](helpers-spec.md); G1 (logic, app, platform), G2 (art, board, tokens) and G3 (HUD, overlays, fx, i18n, audio) built it in parallel, then the lead integrated it (helpers-spec §7.2 I-1 to I-6).

## 9. What a player sees now (2d.1)

- **The mouse** (D-2d1-1): after its video, our grey mouse visits its three tiles one by one, in pick order: it pops onto a tile (the tile bumps 0.87 → 1), blinks, glances or grins, and as it leaves after 850 ms the tile's X pops in under it; ≈ 3 s for three tiles, the board locked meanwhile (`.board[aria-busy]`), the tools inert but not faded.
- **The kitty** (D-2d1-2, -3, -4, -5): with stock it acts at once and places the cat of the cat-less colour with the **fewest** open tiles. Every correct cat (kitty, hint or player) then plays the measured sequence: the cat pops to 1.56×, winks at 1.25× and settles, the tile flashes, shards in its colour burst, an orange "+N" pops one tile above, a star carries it on a curve to the **Score**, which counts up over 0.35 s without a bump inside a sparkle burst; the colour's head in the tracker becomes our cat face with a tint dot.
- **The bulb** (D-2d1-7, -13, -16): a 75 % dim over the whole screen with the relevant tiles cut out, our explanation card over the rule cards, ghost X outlines popping in 60 ms apart (the cat's row, its column, the rest), an orange **Apply** under the board (a shade darker than the original's for its white label); the banner hides while it is open. Apply closes everything in one frame and the X's **draw in** stroke by stroke.
- **Completion** (D-2d1-6): a row, column or colour that has its cat and every other tile crossed waves (33 ms per tile) and shows our gold **"Done!"** label under its last tile.
- **X's** (D-2d1-8): an X from a tap, a drag or Apply draws in ("\" from the centre, "/" from its top-right tip, a 1.1 overshoot, 250 ms) with a tile squish; only the mouse's X pops.
- **The level start** (D-2d1-12): two cream **tickers** with a paw cap scroll right to left over the pills and the rule cards, with our own honest lines from the player's own numbers (replacing 2d's toast).
- **Helpers** (D-2d1-9, -14): the discs press to 0.90 and fire on release with a small spring; the pulse waits for 5 s without a move, needs stock and stops once a helper was used in the attempt.
- **Palette** (D-2d1-10, -11): an 11th measured colour, **Denim** `#5B75B2`, replaces our Mint; boards up to 11 × 11 use only the 11 measured colours; the heads follow the measured hue ring from a per-level start; a darker `--wrong` and a white pattern glyph keep the dark tile readable.
- **Sounds** (ours; the recordings are silent): a squeak per mouse visit, a "ting" when the star lands, a two-note rise per completed unit.

## 10. Integration I-1 to I-3 (lead)

| Step | What happened |
|---|---|
| I-1 dev harnesses | The four `dev/*-harness.html` pages take the 2d.1 props and the retired ids are gone (`art-flex`); each renders with no page error (smoke at 1280 × 900). `dev/look-compare.ts`: waits for the two tickers to cross and for the bulb's pulse after `fx.helperPulse.idleMs` (requests-G1 H2), compares the ten colours our level 96 now draws (0–8 and 10, Denim for Pink; requests-G2 H5); its PNG helpers moved to `dev/compare-kit.ts`. **New `dev/helpers-compare.ts`** (helpers-spec §7.8): drives the built e2e app at 402 × 874 DSF 3 (safe 62 / 34, `?ads=ok`) on our level 273 (a 9 × 9 whose top-right colour is left with one open tile, like the recording's), kitty 1 and hint 1, with Playwright's clock (`install`, `pauseAt`, `runFor`; every CSS / WAAPI animation paused at birth and put at its age), through the tickers, the mouse, the kitty, the bulb, Apply and the win; it checks §7.8's criteria from DOM rects and computed styles (the JS-driven "+N" and labels at their last drawn frame's time, within §7.8's one-frame onset tolerance), reads the user's frames only from `$MEWDOKU_ORIG_REF2` / `$MEWDOKU_ORIG_FRAMES2` and writes composites only to `$HELPERS_SCRATCH` (both refused inside the repo), and saves our side as `docs/phase2d/screenshots/FINAL-*.png` |
| I-2 requests | All 16 closed: G1 H1–H5, G2 H1–H6, G3 H1–H5; each file's "2d.1 Integration" table says how |
| I-3 required members, deletions | Required: `GameScreen.playTickers`, `HintCardProps.cells / boardRect / cellRect`, `GameBarProps.starPoints`, `PillsProps.ringId`, `ToolBarProps.busy`. Deleted: `playStartToast` and the session's toast fallback with its test, `src/ui/fx/start-toast.ts`, `StartToastKind`, `art-flex`, `HintCardProps.avoidRect`, `sheetPlacement`, `fbTopInset`, 2b's `sparkle()` and `.cell__spark`, the review2b top-placed hint rule (its test now checks it is gone), `.points-pill__label[data-reduced]`; the readers of `fx.mouseStaggerMs` and `fx.startToast` are gone, and `layout.catScale` / `layout.hintDim` are `@deprecated phase2d.1` and unread (the config rule never removes a key). The fakes (`tests/unit/app/harness.ts`, `boot.spec.ts`) implement `playTickers` only. The three stale `G3-visual-toast-*.png` were deleted (requests-G3 H5) |
| I-6 test fix | `tests/e2e/visual.spec.ts` `pauseClock` paused the installed clock at "now + 1 ms", which raced the running clock under load ("Cannot fast-forward to the past", 3 failures in the first full run); it now pauses 100 ms ahead (as `visual-board.spec.ts` does). No assertion changed |
| I-6 harness fixes (`dev/helpers-compare.ts`) | Repeated runs showed four measurement artefacts of the fake clock, none in the app: (1) a CSS animation the harness had paused and finished (the board-entry wave) outlived its class and composited over the mouse's tile press, so the press read 1.00 in 2 of 7 runs; the seek now cancels such orphans, as the browser does without script; (2) the JS-driven "+N" and labels are compared at their last drawn frame's time (16 ms frames; within §7.8's one-frame onset tolerance); (3) when the star's landing frame falls just after +1 333, the Score row checks the pre-count value (0) instead of dropping the row; (4) a label already removed at +720 (`fx.unitDone.labelMs`) reads as faded out. After the fixes every run gave 105 pass, 0 FAIL |

## 11. Load time and budgets (I-4)

### 11.1 Method

STATUS-2b §4, unchanged: `14b-firstload.mjs` on the **FBIG e2e twin** (`build:fbig-e2e` with the Playwright config's env, served by `vite preview`), Chromium at 390 × 844, cold cache, CPU 4×, DevTools **Slow 4G**, the FB SDK replaced by the stub (its download excluded), **uncompressed** (`Accept-Encoding: identity`, FB may not compress) and gzip, **median of 3**; "ready" = the tutorial board playing (first run) or Home's Play button (returning player). Every column below was measured on the same machine on 2026-10-10 (the 2d tree `a5afc28` rebuilt from a `git archive` copy).

### 11.2 Results

| Player | 2d (`a5afc28`) | 2d.1 as built (`6602602`, before I-4) | **Final** (after I-4) |
|---|---|---|---|
| First run (the tutorial board), uncompressed | 4.52 s (469 KB, 7 requests) | 4.77 s (501 KB, 9 requests) | **3.73 s** (418 KB, 8 requests; runs 3.73 / 3.77 / 3.71); after the audit fixes (§18) **3.71 s** (420 KB, 8 requests; runs 3.67 / 3.71 / 3.83) |
| Returning (Home), uncompressed | 3.38 s (392 KB, 5 requests) | 3.56 s (420 KB, 7 requests) | **3.53 s** (418 KB, 8 requests); after the audit fixes **3.56 s** (runs 3.56 / 3.57 / 3.56) |
| First run, gzip | 2.97 s | 3.05 s | **2.31 s**; after the audit fixes **2.35 s** |
| Returning, gzip | 2.11 s | 2.21 s | **2.23 s**; after the audit fixes **2.20 s** |

The gate (the release check's "about 4.5 s", Meta's guideline < 5 s before the SDK) is met with **0.77 s of margin** on the worst case (0.79 s after the audit fixes, which added 1.0 KB of first-load CSS and 0.75 KB of JS), which is now 0.79 s faster than 2d's. The returning player pays 0.15 s more than in 2d (the coach preload, 11 KB, and the 2d.1 code in the main bundle), still 1 s inside the gate.

### 11.3 What went lazy, and what the first load still carries

The cuts (the first pass of this integration did the coach and the board CSS, this pass verified and finished them):

1. **The tutorial coach is its own small chunk, preloaded** (`src/app/coach-chunk.ts` + `coach-chunk.css` + the shared `rich-text` chunk, ≈ 11 KB). A first run's boot waited for the whole overlay chunk (≈ 70 KB of JS and CSS) after the main bundle — one more serial round trip on Slow 4G. Now boot waits only for `router.coachReady()`, and `index.html` preloads that chunk next to the entry (`vite.config.ts` `preloadFirstRun`), so it arrives with the first load; the overlay chunk loads after the first screen for every player (boot step 8). This is most of the 1.0 s gained on the first run.
2. **One `core` chunk** for the first-load modules lazy chunks share (`codeSplitting.groups`, `$initial` only): without it rolldown split six small modulepreload chunks (five extra first-load requests).
3. **The board's lazy motion** (requests-G2 H3, with its option): `src/styles/board-mouse.css` + `board-mouse.ts` now carry the mouse's visits, the whole cat-placed sequence (`board-cat.ts`) and the completion wave; the ghost rules moved to the lazy `overlay-chunk.css`. First-load CSS on FBIG **53.4 → 45.0 KB** (the 2d.1 board motion was +7.5 KB).
4. **The fx chunk** (G3's `celebrate.ts` + `celebrate.css`: the "+N", the star, the burst, the shards, the labels, the tickers) and **the lazy art** (the mouse's parts, the star, the shards and, moved at I-4, the ticker art) load at idle after the first game screen mounts.
5. **No-flash fallbacks** for anything that can fire before its chunk: a correct cat shows at rest (no flash, no "+N") and asks for the chunk; a POINTS shows 2d's roll in the Score; a completed unit shows no label and its wave classes do nothing; the tickers wait and join their crossing late; a mouse run hides its X's at once and starts when the chunk lands, timed from the `MARKED`; ghosts show only under the hint overlay, which needs the overlay chunk. `.game-fx[data-celebrate=ready]` marks both chunks in.

What stays in the first load from 2d.1, and why (source-map attribution, web build, against 2d): the units rule (`units.ts`, 1.0 KB: the reducer emits `UNITS_DONE` on the tutorial board too), the draw-in, the mouse deferral and the cat-sequence plumbing in `board-view.ts` (+2.3 KB: the tutorial's first X draws in), `board-fx.ts`' ghost and wave orders (+1.2 KB), the hint wiring, ticker lines, pulse rule and sounds in the app layer (`session.ts` +1.5, `tickers.ts` 0.9, `banner-flow.ts` +0.5, `views.ts` +0.3), the found head and count-up (`pills.ts` +0.4, `game-bar.ts` +0.5), the game screen's loader and event queue for the fx chunk (`game-screen.ts` +1.8 KB: it must exist before the chunk to queue what the chunk will play, so it cannot itself load on demand), `helper-art.ts` (1.1 KB, the mouse head shared with the first-load `tool-mouse` icon) and the 2d.1 strings (0.6 KB). Further options, not done (each a structural change beyond 2d.1, and the gate is met): make the 2b win flow lazy (`win-flow`, `ranking-flow`, `fish-flight`, `shop-flow`, `glow`: ≈ 17 KB ≈ 0.1 s for every player; it starts on the frame of `WON`, so it needs a prefetch and a load race at the win); move the Home-only and How-to-play English strings out of the main bundle; preload the coach only for a first run (an inline script deciding from a local marker; ≈ 0.06 s for returning players on the same device).

### 11.4 Budgets (KB, 1 KB = 1 000 bytes; FBIG unless noted; ceilings = the largest measured build + about 3 %, 04 §9)

| Row | 2d final | 2d.1 as built (`6602602`) | **Final** (FBIG · largest build) | Ceiling (old → new) |
|---|---|---|---|---|
| Main JS (entry + modulepreload chunks; since I-4 also `core`, `coach-chunk`, `rich-text`) | 298.2 | 316.9 | 320.1 · **322.5** (FBIG e2e) | 307 → **332** |
| CSS (the sheets `index.html` links; since I-4 also the coach's) | 44.8 | 53.4 | 47.9 (45.0 + 2.9) | 46 → **49.3** |
| Font | 16.7 | 16.7 | 16.7 | 17 (unchanged) |
| `index.html` | 0.9 | 1.0 | 1.108 (the coach preload links) | 1 → **1.14** |
| **First load** | 360.5 | 387.9 | 385.8 · **388.2** | 370 → **398** (2.5 %; below the sum of its rows' ceilings, 399.4, so it binds) |
| + 1 locale | 387.9 | 416.4 | 414.2 · **416.7** | 398 → **429** |
| First load, gzip | 132.7 | 141.4 | 143.0 · **144.3** | 136.5 → **148.5** |
| Locale chunk (each, largest: hi) | 27.4 | 28.5 | 28.5 | 28 → **29.3** (the 2d.1 strings) |
| Worker JS (lazy) | 17.6 | 18.1 | 18.1 | 18.5 (unchanged) |
| Lazy JS (optional) | 29.1 | 29.1 | 29.1 | 29.3 (unchanged) |
| **Lazy JS (fx chunk)** `celebrate-*.js` — new | — | 14.4 | 14.3 · 14.4 (web); after the audit fixes 14.83 · **14.88** (web) | **14.8**; **15.3** at the audit fixes |
| **Lazy JS (board motion)** `board-mouse-*.js` — new | — | 4.8 | 3.6 · 3.7 (web) | **3.8** |
| **Lazy JS (lazy art)** `lazy-art-*.js` — new | — | (in board-mouse) | 4.0 · 4.06 (web); after the audit fixes 4.23 · **4.27** (web) | **4.2**; **4.4** at the audit fixes |
| Lazy JS (core: overlays, hint engine, sounds, RPC, generator, grader) | 71.5 | 93.6 (all lazy JS) | 66.4 · 66.7 (web; the coach left it) | 74 (unchanged) |
| **Lazy CSS (fx chunk)** `celebrate-*.css` — new | — | 2.6 | 2.65; after the audit fixes **3.16** | **2.73**; **3.26** at the audit fixes |
| **Lazy CSS (board motion)** `board-mouse-*.css` — new | — | — | 6.2 | **6.4** |
| Lazy CSS (overlay and events chunks) | 33.6 | 38.0 (all lazy CSS) | 33.5 | 34.6 (unchanged) |

Recorded in `scripts/size-check.ts` (history comment and rows), `tests/unit/platform/scripts.spec.ts` (the ceilings and a test for the new rows) and [04 §9](../phase1/04-architecture.md). Every dist is within budget: web, fbig, e2e, fbig-e2e, release-web, release-fbig. Zips: release **321.7 KB, 69 files** (2d: 300.5 KB, 61), preview **426.8 KB, 85 files** (2d: 402.5 KB, 77), within 1 MB / 100 files.

**After the final audit fixes (§18):** the first load stays inside every ceiling (FBIG e2e, the largest: main JS 323.3 / 332, CSS 48.9 / 49.3, `index.html` 1.108 / 1.14, first load 389.9 / 398, + 1 locale 418.4 / 429, gzip 144.7 / 148.5; locale chunk 28.5 / 29.3, core lazy JS 66.7 / 74, lazy CSS 33.8 / 34.6, board motion 3.70 / 3.8 and 6.24 / 6.4); three lazy rows moved to the largest build + about 3 % (the table, recorded in `size-check.ts`, `scripts.spec.ts`, 04 §9). Zips: release **322.6 KB, 69 files**, preview **427.8 KB, 85 files**.

## 12. Verification (I-6, the final tree, 2026-10-10; re-run in full after the final audit fixes of §18)

Each row gives the result on the tree after the audit fixes; the I-6 result before them is in brackets where it differs.

| Check | Result |
|---|---|
| `npx tsc --noEmit` (incl. `dev/**`) | clean |
| `npx vitest run` | **2 474 / 2 474** passed, 122 files, twice (I-6: 2 463 in 121; 2d: 2 327 in 113) |
| `npm run i18n:check` and `-- --release` | OK, 17 catalogues (release: en); 1 old warning (it `rank.title.period.week` 22 wide, max 20) |
| `npm run palette:check` | OK (Denim's rows and the informational D-2d-6 / D-2d1-16 rows: the "+N" 2.23:1, the ticker border 2.26:1) |
| `npm run levels:verify` | 10 level packs, 27 daily months, 3 event packs, 0 issues |
| Builds | `build`, `build:fbig`, `build:e2e`, `build:fbig-e2e` (the Playwright config's env), `build:release`: all OK |
| `size-check` | within budget on every dist: web, fbig, e2e, fbig-e2e, release-web, release-fbig (§11.4; three lazy ceilings re-set to the largest build + about 3 % for the audit's art and fx, recorded in `size-check.ts`) |
| `zip:fbig`, `zip:fbig:preview` | release **322.6 KB, 69 files**; preview **427.8 KB, 85 files** (I-6: 321.7 / 426.8 KB) |
| Dev harnesses | the four `dev/*-harness.html` pages render with no page error |
| Playwright, all projects (web-390, web-320, web-1280, fbig-390), `--retries=0` | After the audit fixes, two consecutive full runs: run A **238 passed, 0 failed**, 54 skipped (10.6 min); run B **238 passed, 0 failed**, 54 skipped (10.7 min). (I-6: before the fix of §10, 235 passed, 3 failed, the `pauseAt` race in `visual.spec.ts`; then two runs of 238 / 0 / 54. A first post-audit run had 10 failures, all assertions of the old rules that B11 and B1 changed, the board's padding and the period counter's box; those tests now assert the new rules, see §18) |
| `dev/look-compare.ts` (the first recording, 402 × 874 DSF 3, level 96) | **105 pass, 0 FAIL**, 19 info (unchanged by the audit fixes) |
| `dev/helpers-compare.ts` (the three helper recordings and the stills) | **105 pass, 0 FAIL**, 25 info, 10 by design (after the audit fixes, with the reference frames; I-6 the same) |
| Load time (§11, median of 3) | first run **3.71 s**, returning **3.56 s** (Slow 4G, uncompressed; gzip 2.35 / 2.20 s); gate ≤ 4.5 s (I-6: 3.73 / 3.53 s) |

## 13. Against the recordings: what matches, what differs by design

All composites are in the session scratchpad (`2d-FINAL/run1/`, `2d-FINAL/look1/`), never in the repo; each FINAL screenshot was looked at beside the matching user frame (the same CSS-px box and ms, 10 px guides).

### 13.1 The game screen (the first recording; `dev/look-compare.ts`)

Unchanged from §4 after 2d.1: every position within ±2 px, tiles and radii within 0.5, page, card, ink, icon ink and the ten colours our level 96 draws at ΔE00 0.00 (now with Denim, index 4, at `#5B75B2`), the bulb pulse peak and its glow (ΔE00 1.15, info), the type and shadow measures as in §4. The 2d.1 changes did not move anything on the resting screen; the scene now waits for the tickers to cross and for the 5 s idle before the pulse.

### 13.2 The helpers (`dev/helpers-compare.ts`, §7.8 criteria)

| Moment | Matches (ours vs the recording) |
|---|---|
| Tickers (still-a) | line tops 151.4 / 192.2 vs 151.2 / 192.0 (±2 px; 152.8 / 193.5 before the audit's B11), heights 29.3, line 2 ahead by 0.09 of the crossing, fill `#FFF1C8` and border `#E98E33` at ΔE00 0.00 |
| Mouse (v1, tile B) | sprite scale 0.50 / 0.59 / 0.67 / 0.76 / 1.00 at +17…+117 vs 0.51 / 0.59 / 0.68 / 0.76 / 0.98; tile bump within 0.04; size 0.86 × 0.79 T vs 0.88 × 0.77; centred (0.0 / −0.4 px); the X shows as the mouse starts to leave and pops 1.15 → 1.0; after the run no hidden X and no sprite |
| Cat (v2, the kitty) | the one open tile of the corner colour; the cat's scale within 0.01 at every sample from +16 to +1 400 (0.30 → 1.56 → 1.25 → 0.89 → 1.0); the "+N" scale within 0.05 at its frame times, 42 px above the tile (−41.5 vs −42.4); the label 35.0 px below (34.9) with its pop; the head 0.56 → 1.20 → 1.00 at +0 / +83 / +280 with the face and dot in the action frame |
| Star and Score | off its Bézier ≤ 0.4 px at +850 / +1 066 / +1 300; the count-up starts at the star's landing frame, measured +1 330 … +1 345 over the runs before and after the audit (real-time frame jitter; the recording +1 333, tolerance one frame); the values follow the measured curve from that onset (575 at +1 683, 576 at rest); no bump; colours `#FB8515`, `#EFDA25`, `#FECF3D`, `#813800`, `#FFFCFA` at ΔE00 0.00 |
| Bulb (v3) | the dim's alpha 0.08 / 0.45 / 0.75 at +0 / +150 / +300 (the recording's linear fade); ghosts at 333 + 60 i ms exactly, the first one's pop 0.27 → 1.0 → 1.22 → 1.0 at its measured times; one dim hole per cut-out (16 on ours, ghosts = holes − the focus); the card 334.4 wide, 5.9 px above the board, radius 15; Apply 278.7 × 59.3, 31 px below the board; the banner hidden |
| Apply | the overlay gone in the Apply frame; the draw-in (squish 0.90 → 1, "\" grows, "/" reveals, the X at 1.10 then 1.0 by +250); one label per completed line, 34.9 px under its anchor, fading out by +720 |
| Win | the board solved by the e2e hook; the period counter, the ranking panel and the victory captured (`FINAL-win-*`, `FINAL-victory-402`) |

**Different by design** (listed in the report as `design`): our art (the mouse, the Tux cat with its wink, the star, the shards, the sparkle, the paw cap and the ticker icons), our words ("Done!", the ticker lines, the hint sentences, the Apply label), our level (273, never Level 114), Apply's darker orange (`#D38025` vs `#F0912A`, ΔE00 6.5, D-2d1-16) and Apply centred (the original's sits 6.9 px right), the dwell before the mouse's X (850 ms, the mean of the recording's 750 and 975), one face per visit (blink, glance, grin), the draw-in starting at the release (the recording's app held one frame of 67 ms first), the wave on colour regions (by king distance; only lines were recorded), the ticker speed (T = 9 s, unresolved, Q1), the heads ring's start per level (ours from the level id, Q9).

## 14. Open questions for the user (provisional decisions, all built so they are cheap to change)

### 14.1 Phase 2d (look-spec §7)

| # | Question | Status after the 2d.1 recordings | Built |
|---|---|---|---|
| Q1 | X: plain white, or the edge always / with Colour patterns? | open | plain white; the edge with Colour patterns on |
| Q2 | Colours 11 and 12 | **partly answered**: an 11th measured colour (Denim) replaced Mint; colour 12 still unseen (helpers Q10) | Denim measured; Cocoa ours for 12 × 12 |
| Q3 | What the mouse does, stock or limit | **answered** (v1): three empty tiles outside the solution, crossed one by one; the video badge stays; a daily limit is still unknown | one video per use, three tiles |
| Q4 | The gear's red dot | open | unseen Settings |
| Q5 | Banner during play vs Meta's guidance | open (the recordings show it; it also hides under the hint, D-2d1-13) | on, FBIG only |
| Q6 | The found head | **answered** (v2): the cat's face with a tint dot | built (D-2d1-5) |
| Q7 | The level-start line | **partly answered**: two tickers with statistics; when and how fast is open (helpers Q1, Q2) | two tickers with our honest lines |
| Q8 | Home and the event screen | open | colours, round buttons, the dot |
| Q9 | Which helper glows | **partly answered**: no glow at a level start with the kitty at 0; the rule is open (helpers Q7) | idle 5 s, stock, no helper used yet |
| Q10 | Starting stock | open | ours (5 hints, 3 kitties) |
| Q11 | Label weight | open (now within 8–15 % of the original's stroke) | one weight, thinned |
| Q12 | Badge colours | open | a shade darker |

### 14.2 Phase 2d.1 (helpers-spec §8)

| # | Question | Built (provisional) |
|---|---|---|
| Q1 | Ticker speed (≈ 21 s from the stills' times vs ≈ 9 s from the first recording) | T = 9 s (`fx.tickers.crossMs`) |
| Q2 | When the tickers show, repeat, start | every fresh board and Retry, once |
| Q3 | How a player's own X appears | the hint's stroke draw-in with the squish |
| Q4 | Does a player's cat get the kitty's celebration | yes, every correct cat |
| Q5 | When a multi-tile colour's label shows; again after a re-cross | cat placed and every other tile crossed; again after a re-cross |
| Q6 | Hint charged on open or on Apply; tap outside closes | on open (free reopen of the same board); tap outside, Esc, back close |
| Q7 | When a helper pulses | 5 s idle, stock, no helper used in the attempt |
| Q8 | Which tile the kitty picks | the cat-less colour with the fewest open tiles (ties: the earlier solution cell) |
| Q9 | Where the heads row starts | a fixed start per level from its id |
| Q10 | The 12th colour | our Cocoa `#B0855A` |
| Q11 | Board taps during the mouse run | locked ≈ 3 s |
| Q12 | Apply's orange (`#F0912A`, 2.39:1 for its white label) | a shade darker `#D38025` (3.05) |
| Q13 | The "+N" orange (2.23:1) | the original's orange (decorative; the Score shows the number) |
| Q14 | A helper tap at 0 | our card first (Watch video / Not now) |
| Q15 | Sounds (all recordings are silent) | our own soft sounds |
| Q16 | Other hint kinds | the same dim, card and Apply; a ghost cat for a cat |
| Q17 | A wait before a level's first banner | no extra wait (the 60 s reload window) |
| Q18 | A unit completed by a mistake | labelled unless the mistake ends the attempt |

Most useful next recordings: a 15–25 s level start (Q1, Q2, Q17), a player placing an X and a cat (Q3, Q4), a multi-tile colour completing (Q5), a helper tapped at 0 (Q14), a 12 × 12 board (Q2 / Q10), the sound on (Q15).

## 15. Release gates

Unchanged by 2d / 2d.1 and still blocking a public release: **G-LEGAL** (an IP lawyer reviews the look, now measured closer to the original's trade dress, with the final public name; the user accepted the risk, D-2d-0, D-2d1-0), **G-NAME** (the public name), the 16 locales' 2d and 2d.1 keys (unreviewed AI drafts; release builds ship English only), the banner-in-play policy question (§14 Q5), and re-measuring the load time on the release build before upload (the release-fbig first load is 384.6 KB, 3.6 KB below the measured e2e twin). Known: the Italian `rank.title.period.week` width warning (2c); the per-attempt mouse count is in memory only, so after a reload the pulse may come back on a board where only the mouse was used (accepted, CONTRACTS-2d1 §11.3). Everything still open after the final audit is listed in §19.

## 16. Screenshots

`docs/phase2d/screenshots/FINAL-*.png` (our side only; from `dev/look-compare.ts` and `dev/helpers-compare.ts` on the final e2e build at DSF 3; all 21 refreshed after the audit fixes of §18 and looked at again beside the user's frames):

- the game screen: `FINAL-recording-402.png` (the first recording's state), `FINAL-pulse-peak-402.png`, `FINAL-game-390.png`, `FINAL-game-320.png`, `FINAL-game-1280.png`, `FINAL-game-de-320.png`, `FINAL-game-ar-320.png`;
- the tickers: `FINAL-tickers-402.png` (the still-a moment), `FINAL-tickers-screen-402.png`;
- the mouse mid-visit: `FINAL-mouse-mid-visit-402.png`;
- the cat: `FINAL-cat-pop-402.png` (+116), `FINAL-cat-plus-402.png` (+166, the "+N"), `FINAL-cat-star-402.png` (+1 066, the star mid-flight), `FINAL-cat-count-end-402.png` (+1 683, the count-up's last frame: 575, then 576 at rest), `FINAL-cat-head-402.png` (the found head);
- the hint: `FINAL-hint-402.png` (the dim with the card, the ghosts and Apply), `FINAL-hint-apply-wave-402.png` (+150 after Apply: the wave and the labels);
- the win: `FINAL-win-1000-402.png`, `FINAL-win-ranking-402.png`, `FINAL-victory-402.png`; Home: `FINAL-home-402.png`.

The two acceptance runs refreshed the workstreams' `G2-*`, `G2-2d1-*`, `G3-visual-*` and `G3-2d1-*` sets; the 2d `INT-*` set stays as the record of the 2d integration.

## 17. How to run

```bash
npm ci                                   # Node 22
npm run dev                              # web build, mock ads (?ads=ok), http://localhost:5173
npx tsc --noEmit && npx vitest run       # types and the 2 474 unit tests
npm run build:e2e && npx playwright test --retries=0          # all four projects (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
npm run build:release && npm run size -- dist/release-fbig && npm run zip:fbig
# the visual acceptance against the user's recordings (frames outside the repo; composites to a scratch folder)
MEWDOKU_ORIG_REF=<still folder> MEWDOKU_ORIG_FRAMES=<60 fps frames> LOOK_SCRATCH=<scratch> npx tsx dev/look-compare.ts --prefix FINAL
MEWDOKU_ORIG_REF2=<stills> MEWDOKU_ORIG_FRAMES2=<v1/v2/v3 60 fps frames> HELPERS_SCRATCH=<scratch> npx tsx dev/helpers-compare.ts --prefix FINAL
```

## 18. Final audit fixes (fix lead, 2026-10-10)

Two independent auditors checked the integrated tree against the specs and the user's recordings (A: gates, play, reverts; B: side-by-sides at the recordings' moments). Every finding was verified first (reproduced in the built app or measured on the user's frames with the auditor's own method), then fixed or recorded. Each behavioural fix has a test that fails without it (checked by reverting the fix); each look fix was re-measured on the user's frames (composites in the session scratchpad `2d-FIX/cmp/`, never in the repo).

| # | Severity | Verdict | What was done, and the measurement after |
|---|---|---|---|
| A-1 | minor | **fixed** | Reproduced (level 60, the kitty, then the hint: row 3's anchor 31 and a colour's anchor 30, two labels 42 px apart, each ≈ 67 wide). `playDoneLabels` now leaves out a label whose box would overlap one the same action already placed (at the pop's 1.07 peak); the first unit (rows, then columns, then regions) says "Done!" for both. Built app: one clean label at 31. Tests: `done-label.spec.ts` (row + contained region → one label; two tiles apart → two; `labelsOverlap`), fails without the rule; smoke e2e 25 now checks no two labels overlap. helpers-spec §4.3 |
| A-2 | minor | **fixed** (test gap, and one more case) | `board-mouse-late.spec.ts` (new): the board-mouse chunk mocked behind a gate: never landing → at `mouseRunMs` the X's show and `aria-busy` goes; landing after that → no sprite, no hidden X, and (the second case found a glitch) the shown X's no longer pop again: the safety reveal now retires the run. Both tests fail with the auditor's revert r14; the second also without the new `mouseGen++` |
| A-3 | minor | **fixed** (by the auditor) | Verified: `scripts/size-check.ts` reads "4.52 → 3.73 s", as STATUS §11 and 04 §9 |
| A-4 | minor | **fixed** | The e2e kitty test takes its expected tile from an independent reference of the rule (`tests/fixtures/kitty-reference.ts`, shared with `kitty-pick.spec.ts`), never the shipped picker, and checks it is the smallest region's solution cell. With the auditor's revert r1 (most candidates) built into the e2e app, smoke 24 now fails |
| B1 | major | **fixed** | The heads pill is as wide as its heads (n × 25.33 + 16.6 s) and the pills row is centred (`headsPillWidth`, `--hpw`, a centred `auto auto` grid; the win flow's period counter takes the same cell and width). Measured at 9 × 9 (still-a's moment): heads 24.95–269.52, fish 280.81–377.05, first head 35.25 (the original 24.7–269.3, 280.7–377.3, 35.0; before ours 12.0–282.5 / 293.8–390.0). Tests: `pills.spec.ts`, `hud-css.spec.ts` (fail before); visual e2e: the counter takes the heads pill's place and width |
| B2 | major | **fixed** | Confirmed on the first recording's frames (t 2.4 s vs 3.2 s): the bulb's icon 21.3 → 26.7 wide (1.25 ×), its disc 60.0 → 65.0 (1.08). The icon now adds `--pulse-icon` 1.15 at the pulse's stops (`tool-icon-pulse`, both helpers). Ours at the peak: icon 21.7 → 27.0 (1.246 ×), 33.3 → 42.0 tall (1.26; theirs 1.27), disc unchanged at 1.08. Test: `hud-css.spec.ts` |
| B3 | major | **fixed** | Confirmed: the rays (`::before`) and halo (`::after`) were children of the fading wash. The wash is now its own layer (`.cell__wash`) under the rays, the container never fades, the rays are full strength 0 → +50 ms, and the halo is the measured `#FEFFEA` (no tile colour). Near-white share of the tile (34 px window, lum > 240) at +0 / +16 / +33 / +50: theirs 12 / 18 / 23 / 22 %, ours now **10 / 7 / 16 / 20 %** (was 0 / 1 / 4 / 5 %); p90 lum 243 / 225 / 252 / 248 vs 243 / 246 / 245 / 243. The +16 frame stays lower because our larger shards cross the window then. Tests: `css-rules.spec.ts` (fails on the old CSS), `board-view.spec.ts` |
| B4 | minor | **fixed** | Shards drawn 9–22 s px (boxes × 1.2 for the art's inset), ≥ 0.9 of their size from the first frame, starting 0.25–0.5 T out along their way, all round but straight down (measured "mainly up, left and down"), and for their first 150 ms inside the cat's cell, over the flash and **under the cat** (measured draw order), then in the fx layer (`CelebrateContext.cellHost`, `SHARD_UNDER_MS`). Seen at +0 … +166 beside v2: the cat is drawn over them, no ring over the ears. Tests: `points-flight.spec.ts` |
| B5 | minor | **fixed** (look); timing within tolerance | The star is redrawn plump and lemon (`#FFF35C` ring, `--star-core` body, gold only on the points' outer fifth; provenance updated); its streak is 2.2 × its size on its own layer under the trail, whose sparkles are 4–8 s px with a cream body, so 5–8 show over the streak as in v2. Timing: the star lands at +1 330 vs the recording's arrival frame +1 316 while the count-up's frames match the recording's (+1 333 onwards), i.e. one frame, inside §7.8's tolerance (the harness's measured onset varies +1 330 … +1 345 from run to run with real-time frame jitter, before the audit as after; +1 345 in the final run, inside its 17 ms tolerance); not changed (moving the landing would move the count-up off the recording). Tests: `art-a11y-fx.spec.ts`, `points-flight.spec.ts` |
| B6 | minor | **fixed** | The fx-layer glow over the digits is gone; the Score column shows a near-white halo **behind** the number and label while it counts (`.points-pill[data-counting]::before`, `--score-halo-rgb`), and the ten sparkles are spaced round the number and label. At +1 400 / +1 450, 22 px left of the number: ours `#FDF5F1` / `#FEF5F1`, theirs `#FFF5F0` / `#FEF4DB` (was `#F9EDC4` yellow); the digits stay dark. Tests: `hud.spec.ts`, `hud-css.spec.ts`, `points-flight.spec.ts` |
| B7 | minor | **fixed** | The ticker text is thinned like the labels (`-webkit-text-stroke` 0.04 em in the fill): stroke **1.34** px vs the still's 1.40 (was 1.87). Test: `hud-css.spec.ts` |
| B8 | minor | **fixed** | The paw cap redrawn from the measures (bordered scallops overhanging the pill 2.1 above and below, beans r 3.5); the pill's body (fill, border, round end) is `.ticker::before` from 8 s in, so no straight border or fill runs past the scallops, and the paw's border meets the body's in one line (no seam). Checked beside still-a (line 2) and in Arabic. Tests: `hud-css.spec.ts`, `art-a11y-fx.spec.ts` |
| B9 | minor | **fixed** | The hint card's sentence is in the display face, thinned (0.05 em in the card colour); same stroke method: ours 1.09 px (was 1.18), the auditor's theirs 1.00; the letterforms now match the original's rounded face. Test: `hud-css.spec.ts` |
| B10 | minor | **fixed** | A soft warm shadow under the label's 1 s drop: `drop-shadow(0 2s 2s rgba(150, 90, 70, .32))`. Column profile under the label (+300 after Apply, the rows under the brown drop): ours `DECAC1 → E4D5D0 → EADDD9 → EEE6E1 → F2EBE7`, theirs `E1CBC3 → E9DDD8 → EDE7E3 → F2ECEA` (a first try at α .5 was too dark, `D3B9B0 → DBC6BF`, and was refitted to .32). Test: `done-label.spec.ts` |
| B11 | minor | **fixed** | The card keeps its full width; the whole-px slots' remainder is padding (`computeLayout`). 9 × 9 at the recording's device: card 5.67–396.33 × 250.09–640.75 (theirs 5.67–396.33 × 250.3–641.0), pills 124.5 (124.3), discs 693.8–754.1 (694.0–754.3), tickers 151.4 / 192.2 (151.2 / 192.0); 10 × 10 moved closer too (board top 250.1 vs 250.0). Tests: `layout.spec.ts` (18 fail without it), `visual-board` e2e. look-spec §1.1 table re-computed |
| B12 | minor | **fixed** (Chromium); device check open | Reproduced (CDP touch hold: `:active` false, no dip). `trackPress` mirrors the press into `[data-pressed]` (pointerdown → up / cancel / leave), styled like `:active`, on the discs and Apply. Same CDP hold now reads 0.90 from +66 ms, the 1.04 spring on release, the hint opens. Tests: `hud.spec.ts`, `hint-overlay-2d1.spec.ts`, `hud-css.spec.ts` (fail without it) |
| B13 | minor | **fixed** | The colour name's underline in the hint card scales with the text (`max(1.5px, 0.16em)`, offset `max(1.5px, 0.14em)`): German at 320 × 568 now clears line 3 (seen beside the before shot); the card still fits (scroll 53 / 53). Test: `hud-css.spec.ts` |
| B14 | minor | **fixed** | The tickers cross the game column (`.tickers` is the column, clipped; the plan uses its width): at 1280 × 800 both lines stay inside x 411–869 and move at a phone's speed. Tests: `tickers-fx.spec.ts`, `hud-css.spec.ts` |
| B15 | minor | **by design** (D-2d1-7) | Apply is centred on the column by decision; the mouse's dimmed video badge shows 7 px past its end (the original's, off-centre by 6.9 px, shows 1.4). Hiding the badge would be a look the original does not have either. Recorded in helpers-spec §3.2 |
| B16 | minor | **by design** (D-2d-7) | Fredoka's digits are 11–15 % narrower than the original's face; part of the one-face decision. Letter-spacing would move the numbers off their measured centres. Recorded in look-spec §10 |

## 19. Known issues

Open after the final audit; none blocks the phase (the release gates of §15 still apply):

- **B15 (by design, D-2d1-7):** with Apply centred, the mouse's dimmed video badge shows 7 px past Apply's end (1.4 px in the original, whose Apply sits 6.9 px right of centre). Changing it would mean either the original's off-centre quirk or hiding a badge the original shows.
- **B16 (by design, D-2d-7):** Fredoka's digits are 11–15 % narrower than the original's face ("96" 22.3 vs 26.3 px wide). Part of the one-face decision (look-spec §10).
- **B5 timing (within tolerance):** the star reaches the Score at +1 330 against the recording's arrival frame +1 316; the count-up's frames match the recording's from +1 333, which is why the landing was not moved (one frame, §7.8's onset tolerance).
- **B3 at +16 ms:** the white burst's near-white share is 7 % against the recording's 18 % in that one frame, because our larger shards cross the measured window then (10 / 16 / 20 % against 12 / 23 / 22 % at +0 / +33 / +50).
- **B12 on a device:** the touch press is fixed and checked in Chromium's touch emulation (a 500 ms hold reads 0.90); a check on a real iPhone (WebKit) is still to do.
- **B11 at height-bound sizes:** where the height binds the board, the card now fills the room and the whole-px slots' remainder (< n px) is padding, so on e.g. 390 × 844 the card's inner margin is 11 px instead of 6.5 (the card 379 wide instead of 370). The original's behaviour there is not recorded (its slots are fractional); measured only at 402.
- From before the audit: the Italian `rank.title.period.week` is 22 characters wide against 20 (an i18n-check warning from 2c); the per-attempt mouse count is in memory only, so after a reload the pulse may come back on a board where only the mouse was used (CONTRACTS-2d1 §11.3); the 16 locales' 2d and 2d.1 keys are unreviewed AI drafts (release builds ship English only).
