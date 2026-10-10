# Phase 2d status: the game screen from the user's recording

Status: **DRAFT** (integration I-1 to I-5 done, 2026-10-10; the final pass completes this file after Phase 2d.1 with the acceptance runs, the audit and the screenshots shown to the user) · Branch `claude/mewdoku-instant`, base `ececec5` (2c.1) · Spec: [look-spec](look-spec.md) (its §9 lists what the integration changed) · APIs: [CONTRACTS](CONTRACTS.md) (final) · Next: [helpers-spec](helpers-spec.md) (2d.1)

The user sent their own recording and screenshot of the original's game screen and asked: "Check the look and layout here in the original. Color palette is better also. Xs are better as well." Decision D-2d-0 allowed measuring sizes, positions and timings and sampling colours from it (parity-spec R6 reversed for this recording), with no tracing, our own art and our own copy; the trade-dress risk is the user's, and G-LEGAL still blocks a public release. Three workstreams built it in parallel (G1 logic, app and platform; G2 art, board and tokens; G3 HUD, screens, overlays and i18n), then the lead integrated them.

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

## 8. Open for the final pass (after 2d.1)

- The acceptance pass (look-spec §5.5): Playwright twice in a row, the audit, the §5.4 images shown to the user, this file completed.
- The uncompressed first-run load time is at the release-check value (§5): a lead decision.
- 2d.1 changes several 2d provisional decisions (the mouse's motion, the found head, the pulse rule, the toast → two tickers, an 11th measured colour): the 2d.1 integration re-runs `dev/look-compare.ts` (its reference numbers are the first recording's).
- Open questions for the user: look-spec §7 (Q1–Q12), in particular Q5 (banners in play) and Q11 (label weight: now thinned, within about 8 % of the original's stroke).
- Known: Italian `rank.title.period.week` is 22 characters wide against a limit of 20 (an i18n-check warning from 2c); the 16 locales' 2d keys are unreviewed AI drafts.
