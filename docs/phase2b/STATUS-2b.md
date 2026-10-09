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

Time to start: 118 KB gzipped is about 0.6 s at 1.6 Mbit/s ("slow 4G"), well within Meta's < 5 s guideline.

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
