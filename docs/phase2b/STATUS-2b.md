# Phase 2b status: "parity" (close the 8 headline differences)

Status: integration complete, pending the release gates of §8 · Date: 2026-10-09 · Branch `claude/mewdoku-instant` · Spec: [parity-spec](parity-spec.md) · Contracts: [CONTRACTS](CONTRACTS.md) (§11 = the final APIs)

Phase 2b closes, or narrows as far as platform rules and the clean-room line allow, the eight headline differences between our rebuild and the original that [differences-vs-original §1](../phase2/differences-vs-original.md) listed after Phase 2. It was built in five parallel workstreams (A visual identity and art, B animation and screens, C logic and app, D platform, E localization) on top of the lead's F0 contracts, then integrated by the lead. Every asset, sound and string is ours ([provenance §8](../provenance.md)); no source from 06 §4 was opened.

## 1. What changed since Phase 2

| Area | Phase 2 | Phase 2b |
|---|---|---|
| Look | A ginger cat, teal accent, ink X, region-aware gaps; a skin-free single look | **One theme, the Classic look**: "Tux", our own tuxedo-style cat (notched left ear, asymmetric blaze; 4 moods, 6 poses, idle loops), orange accents and titles, a white X over a thin tinted edge, even gutters, an off-white page. The ginger art and teal tokens are deleted, and a guard test keeps them out |
| Win | O3 overlay: hop, confetti, Next at 1.8 s | Rewards saved at `WON`; glow, three fish flying to a pill, "+3" (+2 bonus), scrim, **ranking panel at 4.5 s**, then the **victory screen** with the wide orange "Level N". O3 and its confetti are removed |
| Currency | none | **Fish** (3 per win, +2 on Hard and dailies), swapped for hints (15) and kitties (30) in a shop sheet |
| Ads | FBIG interstitials 120/100/90 s after 10 levels | the same, plus **banners** on Home, victory and event screens (never in play), and a "No Ads" purchase |
| Events | none | **Three of our own events** (Lantern Walk, Snow Paws, Yarn Hearts; 21 puzzles each, milestones), Home card, event screen, event mode and board |
| Rankings | none | Post-win **ranking panel**, rankings hub, five FB boards via a classic / NEZP / none probe, overlay views, personal-records fallback; group challenges (flag off) |
| Languages | English | **17 locales** (16 AI drafts), runtime resolution, plurals, RTL Arabic; release builds ship English until reviewed |
| Purchases | none | FBIG payments on facebook.com and Android: 5 products, purchase / grant / consume / boot restore |
| Motion | blink, drop, hop; instant screens; 250 ms entry | board-entry wave (700 ms), screen transitions, board-cat breathing and ear flicks, heart break, the win flow |
| Save | v1 | **v2** (wallet, points, events, groups, purchases ledger, rank queue, locale), migration and merge rules |
| Bundle | first load 228 KB (FBIG) | first load 317 KB raw / 118 KB gzip (FBIG), with the overlays' and event screen's CSS in their lazy chunks (§4) |

**The integration pass (this lead)** worked through every cross-workstream request ([§9](#9-integration-requests-and-what-happened-to-each)), split the CSS into the lazy chunks, removed the dead O3 win overlay, set the budgets, merged the provenance drafts and updated the docs ([CONTRACTS](CONTRACTS.md) §11, [02](../phase1/02-rebuild-spec.md), [04 §9–§10](../phase1/04-architecture.md), [05](../phase1/05-fbig-platform.md), [06](../phase1/06-legal-and-originality.md) §3/§5/§7, [differences §1.0](../phase2/differences-vs-original.md), [provenance](../provenance.md)).

## 2. How to run

| Command | What |
|---|---|
| `npm run dev` | Web dev server (all 17 locales, mock ads and a mock banner) |
| `npm run dev:fbig` | FBIG build on `https://127.0.0.1:8080` (basic-ssl). Open `https://www.facebook.com/embed/instantgames/<APP_ID>/player?game_url=https://localhost:8080` (05 §11) |
| `npm run build` / `build:fbig` / `build:e2e` / `build:fbig-e2e` | `dist/web`, `dist/fbig` (preview, all locales), `dist/e2e` (test hooks), `dist/fbig-e2e` (with `MEWDOKU_E2E=1` and the test placement / leaderboard ids, as `playwright.config.ts` sets them) |
| `npm run build:release` | The release builds `dist/release-web` and `dist/release-fbig` (only `i18n.releaseLocales`, today `en`), then `i18n:check --release` |
| `npm run size` | Budgets of 04 §9 on every built dist |
| `npm run zip:fbig` / `zip:fbig:preview` | The production zip from `dist/release-fbig` / a preview zip from `dist/fbig` (`dist-zip/`) |
| `npm run release:fbig` | verify → `build:release` → size → production zip |
| `npm run verify` | typecheck, unit tests, `levels:verify`, `palette:check`, `i18n:check` |
| `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test` | All four projects; its web servers build `dist/e2e` and `dist/fbig-e2e` themselves. Never run `playwright install` |

URL switches (dev and e2e builds only; compiled out of production):

- `?ads=ok` (default) · `nofill` · `unsupported` · `close`: the mock interstitial, rewarded ad and banner (`unsupported`: no ads, the free 10-minute fallback; `close`: a rewarded ad closed early grants nothing).
- `?i18n=pseudo`: the long pseudo-locale (`xx-long`) over the active catalogue, to find clipped layouts.
- The language itself: Settings → Language (the override is saved), or the browser's `navigator.languages`.

Screenshot switches (for review, never diffed): `tests/e2e/visual.spec.ts` writes `docs/phase2b/screenshots/A-visual-<screen>-<width>.png` on every run (`VISUAL_OUT=<dir>` writes elsewhere); `I18N_SHOTS=1` makes `tests/e2e/i18n.spec.ts` write its 320 px per-locale set to `docs/i18n/screenshots/`.

## 3. Verification (final run, 2026-10-09)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **1 794 passed, 0 failed, 102 files** (F0: 1 186 in 76 files; Phase 2 final: 1 166 in 73) |
| `npx tsx scripts/verify-levels.ts` | 10 level packs, 27 daily months, **3 event packs**, 0 issues |
| `npx tsx scripts/palette-check.ts` | OK (the token set and the three event themes) |
| `npx tsx scripts/i18n-check.ts` (and `--release`) | OK: 17 catalogues, release `en`, 0 warnings |
| `npm run build`, `build:fbig`, `build:e2e`, `build:fbig-e2e`, `build:release` | all build, no warnings |
| `npx tsx scripts/size-check.ts` | within budget on `dist/web`, `dist/fbig`, `dist/release-web`, `dist/release-fbig` (§4) |
| `npx tsx scripts/zip-fbig.ts` | release zip **279.6 KB, 61 files** (locales: en); preview zip 371.7 KB, 77 files (all 17 locales) |
| `npx playwright test` (4 projects, no retries) | **103 passed, 0 failed, 7 skipped by design, 0 flaky**: `web-390` 45 + 3 skipped, `web-320` 20 + 3 skipped, `web-1280` 16 + 1 skipped, `fbig-390` 22 (Phase 2 final: 48 passed, 5 skipped). New 2b specs: `winflow`, `events`, `visual`, `i18n`, plus 2b cases in `smoke`, `layout` and `fbig` |

The 7 skips are declared in `tests/e2e/layout.spec.ts`: three desktop-only tests (a fine pointer: the short-window test and two keyboard tests) skip in `web-390` and `web-320`, and the coarse-pointer focus-ring test skips in `web-1280`. There are no other skips.

## 4. Bundle sizes vs budgets

Raw bytes (1 KB = 1 000 B) from `scripts/size-check.ts`; FB hosting may serve files uncompressed (05 §5.3). The ceilings are the integration's: the largest measured build plus about 3 %, with the policy recorded in [04 §9](../phase1/04-architecture.md).

| Item | Web | FBIG | Release FBIG | Ceiling | 2b spec §11 proposal | Phase 2 |
|---|---|---|---|---|---|---|
| Main JS | 243.6 | 257.7 | 256.5 | **266** | 210 | 173.3 |
| CSS (first load) | 42.1 | 42.1 | 42.1 | **43.5** | 53 | 37.8 |
| Font (first load) | 16.5 | 16.5 | 16.5 | **17** | 25 | 16.5 |
| `index.html` | 0.8 | 0.9 | 0.9 | **1** | 4 | 0.8 |
| **First-load total** | **302.9** | **317.2** | **316.0** | **327** | 280 | 228.3 |
| First load + 1 locale | 326.0 | 340.3 | — | **351** | 305 | — |
| **First load, gzip** | **113.1** | **117.9** | **117.6** | **121.5** | — | not measured |
| Worker JS (lazy) | 17.7 | 17.6 | 17.6 | 18.5 | 25 | 17.6 |
| Locale chunk (largest, hi) | 23.1 | 23.1 | — | **28** | 24 | — |
| Lazy JS, core | 65.9 | 65.7 | 65.7 | **68** | 62 | 45.4 |
| Lazy JS, optional (events, fb-social, social-flows) | 15.1 | 27.4 | 27.4 | **28.5** | 25 | — |
| Lazy CSS (overlay and events chunks) | 27.4 | 27.4 | 27.4 | **28.5** | — | — |
| FB files | — | 77 | 61 | 100 (cap 500) | 100 | 51 |
| FB zip | — | 371.7 (preview) | **279.6** | ≤ 1 MB (warn 750) | 750 | 216.8 |

**Before and after the integration pass** (same builds, first load): web 330.7 → **302.9 KB raw**, 117.9 → **113.1 KB gzip**; FBIG 345.0 → **317.2 KB raw**, 122.7 → **117.9 KB gzip**; first-load CSS 70.9 → **42.1 KB**; core lazy JS 74.8 → 65.9 KB (the social flows moved to the optional row, and the O3 overlay went).

What the pass did, and what it left:

- **Lazy CSS.** The JS of everything the first screen does not need was already lazy (the overlay chunk with the ranking panel, victory, shop, rankings hub and group result; the events chunk with the event screen; `social-flows`; `fb-social`; the locale chunks). Their CSS was not: Vite ran with `cssCodeSplit: false`. Now `src/styles/overlay-chunk.css` and `events-chunk.css` hold those rules and load with their chunks (Vite's preload helper adds the stylesheet before the chunk resolves). The rules moved unchanged and in source order; the reduced-motion and media-query rules that override them moved with them.
- **Dead code.** The Phase 2 O3 win overlay (replaced by the victory screen), its confetti module, CSS and two config keys.
- **Duplication.** Checked from the source maps: only the engine modules appear twice (the worker and the main-thread fallback chunks), by design.
- **Kept in the main bundle, on purpose:** the game screen and board (a first run starts on the tutorial board), pack-000 (the first 100 levels play without a fetch), the save migration and merge, the win flow (it must start on the `WON` frame; lazy-loading it would save about 8 KB and add a load race at the moment that matters), and D's social facades (they keep `capabilities()` final at `init()`).

**Time to start (measured, review DOC-1).** The earlier estimate here ("118 KB gzipped is about 0.6 s at 1.6 Mbit/s") counted transfer time alone; it ignored the round trips of each request chain (HTML → JS/CSS → pack, font, worker) and parse and run time, and understated the real first load 4–7×. Measured on 2026-10-09 (group P fix pass) with the perf review's first-load script (`scratchpad/review2b-perf/14-firstload.mjs`): Chromium, phone viewport, cache disabled, 4× CPU slowdown, DevTools network presets (Slow 4G: 562.5 ms latency, 1.44 Mbit/s down; Fast 4G: 165 ms, 8.1 Mbit/s), median of 3 runs, time until Home's Level button (returning player) or the tutorial board (first run) is usable. The builds were the e2e builds of the working tree (hooks on; a release build is the same code without them). **The FBIG figures exclude the fbinstant SDK download**: the stub SDK was served locally and unthrottled.

| Build, player | Slow 4G gzip | Slow 4G uncompressed | Fast 4G gzip | Fast 4G uncompressed |
|---|---|---|---|---|
| Web, first run (tutorial board) | 2.99 s | 4.39 s | 1.17 s | 1.34 s |
| Web, returning (Home) | 2.77 s | 3.85 s | 1.05 s | 1.18 s |
| FBIG, first run (tutorial board) | 2.93 s | 4.45 s | 1.32 s | 1.36 s |
| FBIG, returning (Home) | 2.23 s | 3.39 s | 0.90 s | 1.08 s |
| FBIG, time to `startGameAsync` (first run / returning) | 2.62 / 1.90 s | 4.08 / 3.07 s | 0.88 / 0.69 s | — |

Everything is inside Meta's < 5 s guideline, but with little headroom where FB serves the files uncompressed (05 §5.3): the FBIG first run on Slow 4G is at 4.45 s before the SDK download is counted. The 05 §5.4 target "time to `startGameAsync` ≤ 2 s on a mid-range Android over 4G" is met on Fast 4G and for a returning player on gzip Slow 4G, and **missed** on Slow 4G otherwise (2.6–4.1 s). The perf reviewers' run on cc0aac4 gave the same picture, a little faster (web 2.63 / 2.91 s gzip, FBIG 2.10 / 2.83 s gzip and 3.20 / 4.30 s uncompressed on Slow 4G). **Release check:** run the script against the release FBIG build before each upload; the uncompressed FBIG first run on Slow 4G should stay under about 4.5 s.

## 5. Screenshots (`docs/phase2b/screenshots/final-*.png`)

Captured from the built e2e apps (`dist/e2e`; the rankings hub and FBIG Home from `dist/fbig-e2e` with the SDK stub) at 390 × 844, and Arabic and German at 320 × 568, all at 2× pixel density. Each was looked at; the one problem found (the wordmark crowding the top bar on a short screen with a banner, worst in the taller system fonts of non-Latin scripts) was fixed with a smaller Home mascot on short screens with a banner.

| File | Shows |
|---|---|
| `final-home-fresh-390` | Home just after the tutorial (Level 2, 3 fish, daily locked, no banner before 10 levels) |
| `final-home-returning-390` | Home at Level 37 with 128 fish, the daily open and the (mock) banner band |
| `final-home-event-banner-390` | Home inside Lantern Walk: the event card with Tux's lantern bust, 4 / 21 solved, and the banner |
| `final-event-screen-390` | The event screen: header art, reward track, "Play puzzle 5", Top list |
| `final-game-midplay-390` | Level 37 mid-play: cats, white X marks with their edge, two pills, rule chips, tools |
| `final-game-mistake-heartbreak-390` | A mistake: the red X with its ring, sad cats, the third heart breaking |
| `final-game-hint-390` | A hint card over the board, with the focus highlight |
| `final-win-1-glow-390` | t ≈ 0.8 s: happy cats glowing; Home and Gear aria-disabled |
| `final-win-2-fish-flight-390` | t ≈ 1.85 s: three fish in flight to the centred fish pill, trail sparkles |
| `final-win-3-fish-counted-390` | t ≈ 2.9 s: 131 fish and the rising "+3" |
| `final-win-4-ranking-panel-390` | The ranking panel (web: my records and the honest "not available" line) |
| `final-win-5-victory-390` | The victory screen: praise, Tux leaping with a fish, rays, rewards, the wide orange "Level 38" |
| `final-fail-390` | Out of hearts: Continue (+1 heart), Retry level, Home |
| `final-shop-390` | The shop sheet (web: fish swaps only) |
| `final-settings-390`, `final-settings-language-390` | Settings with the Language and Shop rows; the language list |
| `final-fbig-home-390` | FBIG Home with the trophy and the stub's banner |
| `final-rankings-hub-390` | The rankings hub (FBIG, classic leaderboards in the stub): "Your score" and "See top players" |
| `final-home-ar-320`, `final-game-ar-320` | Arabic: right-to-left Home; the board and top bar stay left to right |
| `final-home-de-320`, `final-game-de-320` | German at the small phone |

The workstreams' own sets are kept: `A-*` (art harness and `visual.spec.ts`, re-captured by this integration run), `B-*` (B's harness), and `docs/i18n/screenshots/` (E).

## 6. The eight headline differences

Full table with the original's side: [differences-vs-original §1.0](../phase2/differences-vs-original.md).

| # | Headline | Status | What remains, and why |
|---|---|---|---|
| 1 | Cat and colour identity | **Closed** | Our own cat, colours and sizes (legality: R1, R6); the X edge (accessibility minimum, WCAG 1.4.11). Trade-dress risk accepted by the user, gated by G-LEGAL |
| 2 | Win flow and fish | **Closed** | Our own fish art and words, our own timings fitted to the reported waits, our own victory layout (the original's is unknown) |
| 3 | Ad load | **Partly closed** | No banners during play (Meta's guidance); no ads on the production web (no ad network); banner details unverified (G4) |
| 4 | Limited-time events | **Closed** | Our own names, themes and contents (legality; the original's contents are unknown); names to clear (G8) |
| 5 | Rankings and identity | **Partly closed** | Other players only inside FB overlay views, personal records on the web (platform); group challenges flagged off until G2; every SDK detail unverified (G1, G3) |
| 6 | Language | **Partly closed** | Release builds ship English until native review (process); 17 locales against the iOS app's 62 |
| 7 | Accessibility | **Kept by design** | The user kept the extras (headline 7); defaults look like the original |
| 8 | Purchases | **Partly closed** | Not on iOS, Messenger.com or the web, no subscriptions (platform); payment details unverified (G5) |

Remaining differences by reason are listed in [parity-spec §0.7](parity-spec.md).

## 7. Unverified FB SDK behaviours

Every FB-side behaviour the 2b code relies on is listed, with where it is used, its source and what happens if it is wrong, in **[fb-dashboard.md §6](fb-dashboard.md)**: banners B1–B6, leaderboards L1–L5, overlay views O1–O6, tournaments T1–T4, payments P1–P8. Only P2 and P8 are confirmed. Nothing was read first-hand on developers.facebook.com (it was unreachable); the rest comes from web-search summaries of Meta's pages, Meta's public samples and third-party adapters. Each feature runs in a safe fallback until its gate (parity-spec §14, G1–G8) is checked: personal records instead of lists, no banners unless both banner APIs exist, the participation reward mode, full-screen overlay lists, and No Ads consumed and kept in the save. The dashboard setup itself (placement ids, the five leaderboards with "higher is better", the five products with their default prices) is in fb-dashboard §1–§5 and its Phase 4 checklist in §8.

## 8. Release gates (nothing here blocks the build; each blocks a public release)

| Gate | What | Owner | State |
|---|---|---|---|
| **G-NAME** | Choose and clear a distinct public name; set `app.name`. "Mewdoku" plus the Classic look is the highest-risk combination (06 §6.1, naming shortlist) | user | open |
| **G-LEGAL** | An IP lawyer reviews the Classic look together with the final public name (parity-spec §0.3, R3); 06 §3/§7 are marked reversed (done) | user + lawyer | open |
| **Translations** | A native reviewer per locale approves it in `docs/i18n/review-log.md`; only then does it join `i18n.releaseLocales` (`i18n:check --release` enforces the log) | user / reviewers | open: all 16 are unreviewed AI drafts |
| **Meta dashboard** | Placements (interstitial, rewarded, banner), five leaderboards, five products, `VITE_FB_*` values; then G1–G8 checked on developers.facebook.com and devices before each flag goes on in production (`groupChallenges` stays off until G2; `rank.overlayPlacement` stays `'fullscreen'` until G3) | lead + D (Phase 4) | open ([fb-dashboard §8](fb-dashboard.md)) |
| **Parity review** | The words-only review of the Classic look and timings against the original (parity-spec §1.14, R6: impressions in words, our own values) and its findings applied as config changes | a person playing the Play Store app | open (`parity-review.md` does not exist yet) |
| G-CLEAN | Provenance rows for every new asset; no 06 §4 source opened; the banned-phrase test in all 17 catalogues | lead | done |

## 9. Integration requests and what happened to each

All requests from the five workstreams' hand-offs (`2b-requests.json`). "Done" items are covered by tests unless noted.

| From → to | Request | Outcome |
|---|---|---|
| A → lead | Favicon in the Classic colours | done (`public/favicon.svg`; the page-shell guard in `css-rules.spec.ts` also checks it) |
| A → C | `theme-color` `#FAF6F0` | done (`index.html` and the dev pages; tested equal to `--page`) |
| A → B | Ear-flick pivot cleanup in `fx.css` | done |
| A → B | X draw timing through `--x-draw-ms` / `--x-draw-gap` | done |
| A → B, E | `--display-weight`, `.num` / `--font-num` for digits, `--accent-title` for the wordmarks | done (remaining `font-weight: 600` rules are body text) |
| A → C | Event accessories live in the lazy events chunk: load it when an event board can mount first | done: an event session starts loading the chunk (`SessionDeps.events.preload`) |
| A → lead | Note the `visual.spec.ts` screenshots and `VISUAL_OUT` | done (`playwright.config.ts`, §2) |
| A not done | §1.14 parity findings; running `visual.spec.ts` in the real config; bundle | the review needs a person (§8); `visual.spec.ts` ran green in all three projects; bundle §4 |
| B → C | Call `GameScreen.showScrim()` at `fx.win.scrimAtMs` | done (not with reduced motion or without a panel) |
| B → C / C → B | Home and Gear aria-disabled during the blocking part of the win flow | done: `WinFlowDeps.onBlockingChange` → `GameView.chromeLocked` |
| B → C | Play `fish_pop` from `FlyFishOptions.onPop` | done (the flow's own pops only when no flight runs) |
| B → C | Ranking panel fade-out (`rank.panelOutMs`) before the victory | done: the victory opens after the fade, as a step on the flow clock |
| B → C | `HomeEventCardView.art` from the events chunk | done (`ViewContext.eventArt`, set when the chunk lands) |
| B → A, lead | Accessory and glow styling notes; fish size after the parity review | no change needed; the fish size waits for the parity review (§10) |
| C → D | `social-flows` under the optional lazy JS; explicit chunk name | done (`size-check.ts`, `chunkFileName`) |
| C → D | `daily_fastest` lists only for the shown day | done: `RankListView.keep` (D renders only kept rows), `ListContext.day` (my entry of another day is not "my rank") |
| C → lead | Budgets | done (§4, 04 §9) |
| C → lead | CONTRACTS update | done (CONTRACTS §11) |
| D → lead | `release:fbig` script; `zip:fbig:preview` | done |
| D → C | Submit before fetching the ranking | done: `submit` starts first, older queued scores flush after it (`flushPending({ except })`) |
| D → C | `boot-locale.spec.ts` TS2349 | already fixed in the tree (tsc clean) |
| D → lead | Record the ceilings and zip rules in 04 §9/§10 and STATUS; update 05 from fb-dashboard §6 | done |
| D → lead | CONTRACTS §4.4 notes | done |
| E → lead | Locale chunk cap 28 KB | done |
| E → A, B | Logical properties for RTL | done; `i18n.css` keeps only the absolute offsets |
| E → B | `.daily-card__title` overflow with the pseudo-locale | done (`overflow-wrap: break-word`) |
| E → lead | CONTRACTS §4.5 (setLocale, new exports, `formatShortDateFor`) | done |
| E → lead | One banned-phrase list | done (`sanity.spec.ts` imports it from `scripts/i18n-check.ts`) |
| E → lead | Document `I18N_SHOTS=1` | done |
| E not done | Native review; per-locale screenshots of the new screens | open (§8); not added (the Arabic and German shots of §5 cover Home and game) |
| Lead (found here) | `zip-fbig` misread a locale whose chunk hash contains a dash (`locale-th-BLfe0o-k.js` → "th-BLfe0o"), which would have refused a release zip once Thai is approved | fixed, with a test |

## 10. Known issues and TODOs

- **Translations are unreviewed AI drafts.** Shipped only in dev, e2e and preview builds. No per-locale screenshots of the new screens (victory, ranking, shop, event, hint card, fail); only Home, game and Settings per locale.
- **Fonts for non-Latin scripts** are system stacks; they render with system fallbacks and were checked only in screenshots (Arabic and German here, E's set in `docs/i18n/screenshots/`).
- **The in-game fish is small** (22 px on an 8×8 board at 390 px: 0.5 × slot clamped to 22–36). It follows the config; the lead may raise `fx.win.fishSizeFraction` or `fishMinPx` after the parity review.
- **START after the board entry** is scheduled at `fx.boardEntryMs` (700 ms), not at `playEntry()`'s `entryEndMs` (CONTRACTS §4.3). Harmless: input arrives up to 550 ms later than it could under reduced motion.
- **The ranking panel's footer** ("Tap to keep going") is a transparent ghost button over the scrimmed board, so a dimmed board cat can show behind it.
- **Group challenges** are implemented and unit-tested in both reward modes but were never run in a browser (flag off).
- **A failed CSS download for a lazy chunk** (network loss at that moment) leaves that chunk's overlays unstyled until reload: Vite's preload helper does not re-add a stylesheet it already tried. The JS retry path is unaffected. Not seen in testing; in the FB zip the files are local.
- `win.next` (the O3 "Next" label) is now unused; keys are never removed (CONTRACTS §6.2).
- The B-* harness screenshots predate the integration (they show B's harness, not the app).

## 11. Review fixes, group P (platform, banner, economy, rankings, events, data; 2026-10-09)

A six-lens review of cc0aac4 found these; each was reproduced by an independent verifier, fixed at the root, and covered by tests that fail on cc0aac4 (unit tests checked against the old modules; e2e tests run against a cc0aac4 build).

| Finding | Fix | Tests |
|---|---|---|
| **FB2B-1 (blocker)** A banner load slower than `ads.readyTimeoutMs`, a load that never settles, or one failed `hideBannerAdAsync` left the banner up during play, and ads then showed over it | `banner-flow`: a load that answered `timeout` (or threw) counts as maybe up, so the next `hide()` always reaches the adapter, which hides a late banner when it lands. `fb-banner`: a failed hide keeps the banner counted as up and is retried (`HIDE_RETRY_MS` 1 s, 3 times, and on every later hide); a load that never settles is given up after `stuckLoadMs` (56 s: under the 60 s window, over Meta's 45 s), so a later screen loads again | `banner-flow.spec` (6), `fb-banner.spec` (5), `fbig.spec` "banners never in play" (4: a 6 s load with Play at 1 s and 5 s, a failing hide, a never-settling load, hide before the interstitial) |
| **FB2B-2 / L2B-1** The shop opened from the victory fish pill left the banner over its Buy buttons; No Ads bought there left it up | the shell treats an open victory overlay as a banner screen (modal open hides, close re-gates after the window); boot passes the shop's `onOpen` hook (hide) | `shell-2b.spec` (3), `fbig.spec` victory shop |
| **L2B-2** No Ads becoming true (boot restore, purchase, late cloud merge) did not take a banner on show down | `BannerFlow.entitlementChanged()`, called from the shop's `changed` and from the external-save merge when it brings No Ads; the reserve stays until the screen unmounts (§3.2) | `banner-flow.spec` (2), `fbig.spec` boot restore |
| **FB2B-3** A failed or slow `getCatalogAsync` gave an empty Buy section, cached 10 min, and Settings still offered Remove ads | an empty catalogue is the `error` state with Retry and is never cached; reopening the shop asks again; Remove ads only when the catalogue lists `remove_ads` | `shop-flow.spec` (2), `shell-2b.spec`, `fbig.spec` catalogue Retry |
| **FB2B-4** `daily_fastest` lists hid today's players once later time zones posted the next day, and "Your rank" was the board's global rank | readers page past the next-day entries to the shown day's band (`RankingProvider.top(…, keep)`, `RankListView.keep`; classic `getEntriesAsync(50, offset)`, at most 4 pages) and number rows inside it; the panel's rank is my position in that band, never the board's (fb-dashboard §3) | `fb-ranking.spec` (3), `fb-platform.spec`, `ranking-flow.spec` (2), `fbig.spec` daily across time zones |
| **FB2B-5** iOS showed "Getting the shop ready…" for 5 s | payments known to be unavailable answer `unavailable` at once | `shop-flow.spec`, `fbig.spec` iOS |
| **FB2B-6** A board in `VITE_FB_LEADERBOARDS` but missing in the dashboard opened an empty list | `LEADERBOARD_NOT_FOUND` from any call latches the board for the session; `RankingProvider.supports(board)` (additive) lets ranking-flow show personal records | `fb-ranking.spec` (3), `fb-platform.spec`, `ranking-flow.spec` |
| **FB2B-7** "Solved in 0:03" next to "Your score: 0:04" | the board entry of the solve just made shows my own time (daily and event encodings) | `ranking-flow.spec`, `fbig.spec` daily |
| **RANK-1** The event Top list labelled the event total "This puzzle" | no "This puzzle" row outside a just-played puzzle | `shell-2b.spec` |
| **L2B-4** (shell part) After an event ended, "Back to event" and the event screen's Play ended in `toast.error` | `showEvent` and Play go Home once the event has ended (§4.4) | `shell-2b.spec` (2), `events.spec` e2e |
| **PERF-2** A slow locale chunk held the first screen twice (2.4 s instead of 1.2 s), with a blank FBIG page after `startGameAsync` | step 4 waits for the guessed chunk only what step 3 left of its budget; a full wait only when the resolved locale differs; the loading indicator shows during a long step-4 wait on FBIG | `boot-locale.spec` (3) |
| **PAR-1** Dailies were never 12×12 | every second Sunday from 2026-10-18 is 12×12 G4 (`DAILY_12_FROM`, `isTwelveSunday`); the daily packs were regenerated (`gen-daily --from 2026-10`): exactly the 58 such Sundays changed, every other day is byte-identical; `verify-levels` 0 issues. The packs (2026-10 to 2028-12) now hold 8×8 on 234 days, 9×9 on 235, 10×10 on 236, 11×11 on 60 and 12×12 on 58. On-device generation of a 12×12 G4 after the packs (2029 on) took a median 0.3 s and at most 1.9 s in Node, far inside `loading.failSafeMs` (25 s) | `progression.spec`, `tests/property/levels.spec.ts` |
| **DOC-1** The time-to-start estimate | measured table in §4 | — |
| Platform note | a release zip with an empty `VITE_FB_*` placement or leaderboard id now warns (the build carries a `mewdoku-fb-ids:` marker, never the ids) | `scripts.spec` |

Not fixed in group P's files (requests to their owners): the victory fish pill does not follow the wallet after a purchase or swap made from it (L2B-3, `session.ts`); the event victory still offers "Play puzzle N+1" after the end and `nextEventIndex` ignores the end (L2B-4 rest, `views.ts`, `session.ts`; the shell now lands such a "Back to event" on Home); the spec and 02 §12 still describe the daily table without the 12×12 Sundays, and §8.6 says "hidden" where §8.5 and the build say `shop.unavailable` (lead docs).

Known limits left: the FB overlay list shows my own row with the board's whole-second value (0:04 for a 3.3 s solve) while the panel shows 0:03; a day's band that starts more than 200 entries down the board shows the empty list (fb-dashboard §3 names the Phase 4 alternatives).
