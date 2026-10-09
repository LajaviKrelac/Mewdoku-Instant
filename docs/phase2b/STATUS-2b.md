# Phase 2b status: "parity" (close the 8 headline differences)

> **Superseded in part by Phase 2c (2026-10-09):** fish are the lives, kept fish feed a per-period leaderboard, level points carry a perfect-streak bonus, and the fish currency is gone. See [docs/phase2c/STATUS-2c.md](../phase2c/STATUS-2c.md).

Status: **code complete, review fixes integrated**; pending only the release gates of §8 · Date: 2026-10-09 · Branch `claude/mewdoku-instant` · Spec: [parity-spec](parity-spec.md) · Contracts: [CONTRACTS](CONTRACTS.md) (§11 = the final APIs, §11.7 = the review fixes' API changes)

Phase 2b closes, or narrows as far as platform rules and the clean-room line allow, the eight headline differences between our rebuild and the original that [differences-vs-original §1](../phase2/differences-vs-original.md) listed after Phase 2. It was built in five parallel workstreams (A visual identity and art, B animation and screens, C logic and app, D platform, E localization) on top of the lead's F0 contracts, then integrated by the lead. A six-lens code review then found 47 confirmed issues; three fixer groups (P platform and data, R app core and performance, U UI, accessibility and i18n) fixed most of them, and the lead's final integration finished every item they handed over (§11, §12). Every asset, sound and string is ours ([provenance §8](../provenance.md)); no source from 06 §4 was opened.

**Where we are now, in one paragraph.** Everything Phase 2b set out to build is built, reviewed, fixed and verified: type check clean, 1 941 unit tests, the level and palette checks, 17 catalogues, every build and both FB zips, the bundle budgets, and the whole Playwright suite (153 passing tests in four projects, 20 project-scoped skips) green three times in a row with no flaky test. All 47 review findings are fixed (§11); the re-run reviewer scripts show every blocker and major fixed (§13). What stands between this build and a public release is not code: a public name and an IP review of the Classic look, native review of 16 machine-drafted languages, the Meta dashboard set-up with the SDK behaviours checked on real devices, and a person's parity review against the original (§8).

## 1. What changed since Phase 2

| Area | Phase 2 | Phase 2b |
|---|---|---|
| Look | A ginger cat, teal accent, ink X, region-aware gaps; a skin-free single look | **One theme, the Classic look**: "Tux", our own tuxedo-style cat (notched left ear, asymmetric blaze; 4 moods, 6 poses, idle loops), orange accents and titles, a white X over a thin tinted edge, even gutters, an off-white page. The ginger art and teal tokens are deleted, and a guard test keeps them out |
| Win | O3 overlay: hop, confetti, Next at 1.8 s | Rewards saved at `WON`; glow, three fish flying to a pill, "+3" (+2 bonus), scrim, **ranking panel at 4.5 s**, then the **dark victory screen** with the wide orange "Level N" (a crossfade from the panel). O3 and its confetti are removed |
| Currency | none | **Fish** (3 per win, +2 on Hard and dailies), swapped for hints (15) and kitties (30) in a shop sheet |
| Ads | FBIG interstitials 120/100/90 s after 10 levels | the same, plus **banners** on Home, victory and event screens (never in play, also when a load is slow, stuck or a hide fails), and a "No Ads" purchase |
| Events | none | **Three of our own events** (Lantern Walk, Snow Paws, Yarn Hearts; 21 puzzles each, milestones), Home card, event screen, event mode and board |
| Rankings | none | Post-win **ranking panel**, rankings hub, five FB boards via a classic / NEZP / none probe, overlay views, personal-records fallback; the daily board read per day; group challenges (flag off) |
| Languages | English | **17 locales** (16 AI drafts), runtime resolution, plurals, RTL Arabic, switching in place; release builds ship English until reviewed |
| Purchases | none | FBIG payments on facebook.com and Android: 5 products, purchase / grant / consume / boot restore |
| Motion and sound | blink, drop, hop; instant screens; 250 ms entry | board-entry wave (700 ms) with its own cue, screen transitions that start at the tap, board-cat breathing and ear flicks, heart break, the win flow |
| Daily | 8×8 to 11×11 by weekday | the same, plus **12×12 every second Sunday** from 2026-10-18 |
| Save | v1 | **v2** (wallet, points, events, groups, purchases ledger, rank queue, locale), migration and merge rules |
| Bundle | first load 228 KB (FBIG) | first load 331 KB raw / 123 KB gzip (FBIG), with the overlays' and event screen's CSS in their lazy chunks (§4) |

**The integration pass** worked through every cross-workstream request (§9), split the CSS into the lazy chunks, removed the dead O3 win overlay, set the budgets, merged the provenance drafts and updated the docs. **The final integration** (this lead, after the review fixes) did every item the fixer groups could not do in their own files (§12), re-set the budgets (§4), re-ran the reviewers' scripts (§13), refreshed the screenshots (§5) and updated [parity-spec](parity-spec.md) §0.5, §0.7, §2.5, §5.3, §6.5, §8.6 and Appendix E, [CONTRACTS](CONTRACTS.md) §1 and §11.7, [02 §12](../phase1/02-rebuild-spec.md), [04 §9](../phase1/04-architecture.md), [fb-dashboard §7](fb-dashboard.md) and [differences-vs-original](../phase2/differences-vs-original.md) §1.0, §2, §3.5 and §5.1.

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

The Feedback row in Settings (review PAR-5) shows only when `support.feedbackUrl` (config) is an `https:` or `mailto:` link; it is empty by default, and on FBIG the row also needs `support.feedbackOnFbig` (off until Meta's external-link rules are checked).

## 3. Verification (final run, 2026-10-09, after the review fixes)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **1 941 passed, 0 failed, 107 files** (integration pass: 1 794 in 102; F0: 1 186 in 76; Phase 2 final: 1 166 in 73) |
| `npx tsx scripts/verify-levels.ts` | 10 level packs, 27 daily months (with the 58 regenerated 12×12 Sundays), **3 event packs**, 0 issues |
| `npx tsx scripts/palette-check.ts` | OK (the token set and the three event themes) |
| `npx tsx scripts/i18n-check.ts` (and `--release`) | OK: 17 catalogues, release `en`, 0 warnings |
| `npm run build`, `build:fbig`, `build:e2e`, `build:fbig-e2e`, `build:release` | all build, no warnings |
| `npx tsx scripts/size-check.ts` | within the re-set budgets on `dist/web`, `dist/fbig`, `dist/release-web`, `dist/release-fbig` (§4) |
| `npx tsx scripts/zip-fbig.ts` (and `--preview`) | release zip **288.8 KB, 61 files** (locales: en; it warns that the four `VITE_FB_*` ids are empty, as they are until the dashboard is set up, §8); preview zip 382.3 KB, 77 files (all 17 locales) |
| `npx playwright test` (4 projects, no retries), **three full runs** | **153 passed, 0 failed, 20 skipped by design, 0 flaky, in each of three consecutive full runs** (`web-390` 68 + 6 skipped, `web-320` 35 + 7, `web-1280` 17 + 7, `fbig-390` 33; the integration pass had 103). New since the integration pass: the review fixes' e2e cases across every spec, and the final integration's "+3" checks (390 and 320 × 568) and FBIG dialogs at 320 × 568 (en_US and ar_AR) |

The 20 skips are all declared in the specs and scoped to a project (`test.skip(info.project.name …)`): the desktop-only tests (a fine pointer: the short-window test and three keyboard tests) skip on the two phones (4 + 4), the coarse-pointer focus-ring test skips on the desktop (1), the short-phone banner layouts skip on the desktop (6) and one runs at 390 only (1), and four i18n review checks each run at the one size they are about (2 + 2). There are no other skips.

**Flakes.** One test had been seen failing once before the final integration: `layout.spec.ts` "keyboard only: focus moves into every new screen" (web-1280), during group U's run while group R's focus recovery in `router.ts` (`focusSoon`) was still being written. It did not fail in any run since: the three full runs above, the targeted runs, and 15 back-to-back repeats of both desktop keyboard tests with four workers (30 / 30 passed). Its assertion was also tightened at the root of what it checks (the A11Y-FOCUS-1 hand-over): Home's Level button now carries `data-autofocus`, so the router lands focus on one defined control instead of "the first heading or control that takes focus" (which depends on whether a short-window media rule hides the wordmark), and the test asserts exactly that control instead of polling for any focus inside Home. No other test failed or retried in any run.

**Independent audit.** An auditor re-ran these checks on the same tree, including two more full Playwright runs, and got the same results (§15).

## 4. Bundle sizes vs budgets

Raw bytes (1 KB = 1 000 B) from `scripts/size-check.ts`; FB hosting may serve files uncompressed (05 §5.3). Policy ([04 §9](../phase1/04-architecture.md)): the first load as small as practical and well within Meta's < 5 s guidance; each ceiling is the largest measured build plus about 3 %; a ceiling moves only by a lead decision recorded in 04 §9 and the `size-check.ts` history.

| Item | Web | FBIG | Release web | Release FBIG | Ceiling (was) | Phase 2 |
|---|---|---|---|---|---|---|
| Main JS | 256.4 | 271.0 | 255.2 | 269.8 | **279** (266) | 173.3 |
| CSS (first load) | 42.6 | 42.6 | 42.6 | 42.6 | 43.5 | 37.8 |
| Font (first load) | 16.5 | 16.5 | 16.5 | 16.5 | 17 | 16.5 |
| `index.html` | 0.8 | 0.9 | 0.8 | 0.9 | 1 | 0.8 |
| **First-load total** | **316.3** | **331.0** | 315.1 | 329.8 | **340** (327) | 228.3 |
| First load + 1 locale | 339.8 | 354.4 | — | — | **365** (351) | — |
| **First load, gzip** | **117.9** | **122.9** | 117.5 | 122.5 | **126.5** (121.5) | not measured |
| Worker JS (lazy) | 17.7 | 17.6 | 17.7 | 17.6 | 18.5 | 17.6 |
| Locale chunk (largest, hi) | 23.5 | 23.5 | — | — | 28 | — |
| Lazy JS, core | 71.8 | 71.5 | 71.8 | 71.5 | **74** (68) | 45.4 |
| Lazy JS, optional (events, fb-social, social-flows) | 15.2 | 28.4 | 15.2 | 28.4 | **29.3** (28.5) | — |
| Lazy CSS (overlay and events chunks) | 30.3 | 30.3 | 30.3 | 30.3 | **31.2** (28.5) | — |
| FB files | — | 77 | — | 61 | 100 (cap 500) | 51 |
| FB zip | — | 382.3 (preview) | — | **288.8** | ≤ 1 MB (warn 750) | 216.8 |

**What the review fixes cost, and the budget decision.** The 47 fixes grew main JS by 13 KB (FBIG 257.7 → 271.0: the banner and ranking hardening, the router's screen-out and focus recovery, the lazy-CSS retry, relabelling on a language change, the shared viewport reading), the core lazy JS by 6 KB (65.7 → 71.8: relabelling in every overlay, the rich teaching text, the victory's fit steps, the shop's live line) and the lazy CSS by 2.9 KB (27.4 → 30.3: the dark victory, the FB safe zone, sticky victory actions). Five rows went over. Cheap reductions in the lazy chunks were tried first and found nothing to cut: no selector in the lazy stylesheets is unused (three candidates are built at runtime), the minified CSS has no duplicated blocks, and the source maps show no module in two chunks except the by-design engine fallback. Moving the rankings-hub and group-result UIs into the optional chunk would save 4.8 KB of core lazy JS, but it needs a second overlay loader in the router, which is not a cheap change; it is noted for Phase 3. So the over-budget ceilings were set to the measured maximum plus about 3 % (the first-load total at 2.7 %, below the sum of its rows' ceilings, so it still binds), and the optional lazy JS as well (still within its 28.5 KB at 28.4, but with 0.1 KB left).

**Time to start (measured, the perf review's method).** `scratchpad/fix2b-P/perf/14b-firstload.mjs` on the final e2e builds: Chromium, phone viewport, cache disabled, 4× CPU slowdown, DevTools network presets (Slow 4G: 562.5 ms latency, 1.44 Mbit/s; Fast 4G: 165 ms, 8.1 Mbit/s), median of 3 runs, time until Home's Level button (returning player) or the tutorial board (first run) is usable. Gzip = `vite preview`'s compression; uncompressed = `Accept-Encoding: identity` (the worst case where FB serves files as they are, 05 §5.3). **The FBIG figures exclude the fbinstant SDK download** (the stub SDK is served locally).

| Build, player | Slow 4G gzip | Slow 4G uncompressed | Fast 4G gzip | Fast 4G uncompressed |
|---|---|---|---|---|
| Web, first run (tutorial board) | 2.79 s | 4.22 s | 0.95 s | 1.17 s |
| Web, returning (Home) | 2.61 s | 3.73 s | 0.83 s | 1.06 s |
| FBIG, first run (tutorial board) | 2.74 s | 4.25 s | 0.95 s | 1.22 s |
| FBIG, returning (Home) | 1.99 s | 3.14 s | 0.67 s | 0.87 s |
| FBIG, time to `startGameAsync` (first run / returning) | 2.54 / 1.84 s | 4.02 / 3.00 s | 0.74 / 0.53 s | 1.02 / 0.75 s |

Everything is inside Meta's < 5 s guideline, a little faster than the group P measurement on the same method earlier the same day (FBIG first run Slow 4G 2.93 → 2.74 s gzip, 4.45 → 4.25 s uncompressed) despite the larger bundle: boot now needs 7 requests before a first-run board instead of 11. Headroom stays thin where FB serves the files uncompressed: the FBIG first run on Slow 4G is at 4.25 s before the SDK download. The 05 §5.4 target "time to `startGameAsync` ≤ 2 s on a mid-range Android over 4G" is met on Fast 4G and for a returning player on gzip Slow 4G, and **missed** on Slow 4G otherwise (2.5–4.0 s). **Release check:** run the script against the release FBIG build before each upload; the uncompressed FBIG first run on Slow 4G should stay under about 4.5 s.

## 5. Screenshots (`docs/phase2b/screenshots/final-*.png`)

Re-captured after the review fixes from the final e2e builds (`dist/e2e`; FBIG Home and the rankings hub from `dist/fbig-e2e` with the SDK stub), at 2× pixel density, with `scratchpad/fin/capture.mjs`. Each was looked at (below the table: what was checked and found).

| File | Shows |
|---|---|
| `final-home-fresh-390` | Home just after the tutorial (Level 2, 3 fish, daily locked, no banner before 10 levels) |
| `final-home-returning-390` | Home at Level 37 with 128 fish, the daily open and the (mock) banner band |
| `final-home-event-banner-390` | Home inside Lantern Walk: the event card with Tux's lantern bust, 4 / 21 solved, and the banner |
| `final-event-screen-390` | The event screen: header art, reward track, "Play puzzle 5", Top list, Home in the footer |
| `final-game-midplay-390` | Level 37 mid-play: cats, white X marks with their edge, done regions faded, two pills, rule chips, tools |
| `final-game-mistake-heartbreak-390` | A mistake: the red X with its ring, sad cats, the third heart breaking |
| `final-game-hint-390` | A hint card over the board, with the focus highlight |
| `final-win-1-glow-390` | t ≈ 0.8 s: happy cats glowing; Home and Gear aria-disabled |
| `final-win-2-fish-flight-390` | t ≈ 1.85 s: three fish in flight to the centred fish pill, trail sparkles |
| `final-win-3-fish-counted-390` | t ≈ 2.9 s: 131 fish, and the "+3" chip rising from above the pill (UX-12: it no longer covers the count) |
| `final-win-4-ranking-panel-390` | The ranking panel (web: my records and the honest "not available" line) |
| `final-win-5-victory-390` | The **dark** victory screen (PAR-3): praise, Tux leaping with a fish, rays, rewards, the wide orange "Level 38" |
| `final-fail-390` | Out of hearts: Continue (+1 heart), Retry level, Home |
| `final-shop-390` | The shop sheet (web: fish swaps only) |
| `final-settings-390`, `final-settings-language-390` | Settings with the Language and Shop rows (no Feedback row: `support.feedbackUrl` is empty by default, checked); the language list |
| `final-fbig-home-390` | FBIG Home with the trophy, the pill after the 64 px safe zone, and the stub's banner |
| `final-rankings-hub-390` | The rankings hub (FBIG, classic leaderboards in the stub): "Your score" and "See top players" |
| `final-home-event-banner-320` | 320 × 568 Home with the event card **and** the banner: the wordmark, the smaller mascot, the card and Play never overlap (UX-2) |
| `final-event-victory-banner-320` | 320 × 568 event victory with the banner: progress, the milestone line, "Play puzzle 4" and Home all above the banner band (UX-1, I18N-LAYOUT-1) |
| `final-game-320` | 320 × 568 level: compact chips (icons only), the board with whole cells |
| `final-home-ar-320`, `final-game-ar-320` | Arabic: right-to-left Home and pills; the board and top bar stay left to right |
| `final-home-de-320`, `final-game-de-320` | German at the small phone |

Looked at, and what was found: no clipped or overlapping text, no control under the banner band, the dark victory reads well (praise in `--title-on-dark`), Arabic mirrors the pills and the daily card while the board stays left to right. One trade-off remains visible in `final-win-3`: the "+3" chip, which now starts above the pill as UX-12 asked (the reviewer's and group R's fix, with the same 24 px rise), ends its rise over the centred top-bar title for about 0.3 s. The chip is opaque by B's design for that case; a shorter rise is one config value (`fx.win.plusLabelRisePx`) if the parity review prefers it (§10).

The workstreams' own sets are kept: `A-*` (art harness and `visual.spec.ts`, re-captured by the final Playwright runs; `A-visual-review-*` are the short phones with the banner band, 320 × 568, 360 × 640 and 375 × 667, that `visual.spec.ts` writes since the review fixes: Home with an event, and the level, daily and event victories, all looked at, every action above the band), `B-*` (B's harness, predating the integration), and `docs/i18n/screenshots/` (E).

## 6. The eight headline differences

Full table with the original's side: [differences-vs-original §1.0](../phase2/differences-vs-original.md).

| # | Headline | Status | What remains, and why |
|---|---|---|---|
| 1 | Cat and colour identity | **Closed** | Our own cat, colours and sizes (legality: R1, R6); the X edge (accessibility minimum, WCAG 1.4.11). Trade-dress risk accepted by the user, gated by G-LEGAL |
| 2 | Win flow and fish | **Closed** | Our own fish art and words, our own timings fitted to the reported waits, our own victory layout (the original's is unknown; ours is now dark, like its overlays) |
| 3 | Ad load | **Partly closed** | No banners during play (Meta's guidance); no ads on the production web (no ad network); banner details unverified (G4) |
| 4 | Limited-time events | **Closed** | Our own names, themes and contents (legality; the original's contents are unknown); names to clear (G8) |
| 5 | Rankings and identity | **Partly closed** | Other players only inside FB overlay views, personal records on the web (platform); group challenges flagged off until G2; every SDK detail unverified (G1, G3) |
| 6 | Language | **Partly closed** | Release builds ship English until native review (process); 17 locales against the iOS app's 62 |
| 7 | Accessibility | **Kept by design** | The user kept the extras (headline 7); defaults look like the original |
| 8 | Purchases | **Partly closed** | Not on iOS, Messenger.com or the web, no subscriptions (platform); payment details unverified (G5) |

Remaining differences by reason: §14 and [parity-spec §0.7](parity-spec.md).

## 7. Unverified FB SDK behaviours

Every FB-side behaviour the 2b code relies on is listed, with where it is used, its source and what happens if it is wrong, in **[fb-dashboard.md §6](fb-dashboard.md)**: banners B1–B6, leaderboards L1–L5, overlay views O1–O6, tournaments T1–T4, payments P1–P8. Only P2 and P8 are confirmed. Nothing was read first-hand on developers.facebook.com (it was unreachable); the rest comes from web-search summaries of Meta's pages, Meta's public samples and third-party adapters. Each feature runs in a safe fallback until its gate (parity-spec §14, G1–G8) is checked: personal records instead of lists, no banners unless both banner APIs exist, the participation reward mode, full-screen overlay lists, and No Ads consumed and kept in the save.

The review fixes lean on four of those rows harder, so they come first when the gates are checked on devices:

| Row | What the fix assumes | If wrong |
|---|---|---|
| B3 (hide) | `hideBannerAdAsync` may reject (we retry 3 times, 1 s apart, and on every later hide) and a banner may land after a `timeout` answer (the next hide always reaches the SDK) | A banner could stay during play only if every hide keeps failing; the e2e suite covers a slow load, a stuck load, a failing hide and the interstitial order against the stub |
| B4 / B1 (stuck load) | A load that never settles is abandoned after 56 s (`stuckLoadMs`, under the 60 s window and over Meta's reported 45 s) | A later screen asks for a banner while the SDK still works on the old load: at worst `RATE_LIMITED`, no banner |
| L3 (paging) | Classic `getEntriesAsync(count, offset)` pages past the next day's `daily_fastest` entries (≤ 4 × 50) | The day's band past 200 entries shows the honest empty list; per-day or UTC-keyed boards are the Phase 4 alternatives (fb-dashboard §3) |
| L4 (`LEADERBOARD_NOT_FOUND`) | The error names a board missing in the dashboard; the board is then treated as unsupported for the session (personal records) | A missing board shows an empty list instead of records |

One device behaviour (not SDK) joins them: the AudioContext is now created at an idle moment before the first gesture and only resumed (with the silent iOS unlock buffer) inside it (PERF-1). That is the common web-audio unlock pattern, and it works in Chromium here; it is still to be heard on FB's Android app and on iOS before release (if a WebView refused a context made early, the first tap would build one as before).

## 8. Release gates (nothing here blocks the build; each blocks a public release)

| Gate | What | Owner | State |
|---|---|---|---|
| **G-NAME** | Choose and clear a distinct public name; set `app.name`. "Mewdoku" plus the Classic look is the highest-risk combination (06 §6.1, naming shortlist) | user | open |
| **G-LEGAL** | An IP lawyer reviews the Classic look together with the final public name (parity-spec §0.3, R3); 06 §3/§7 are marked reversed (done) | user + lawyer | open |
| **Translations** | A native reviewer per locale approves it in `docs/i18n/review-log.md`; only then does it join `i18n.releaseLocales` (`i18n:check --release` enforces the log) | user / reviewers | open: all 16 are unreviewed AI drafts |
| **Meta dashboard** | Placements (interstitial, rewarded, banner), five leaderboards, five products, `VITE_FB_*` values (a release zip with an empty id now warns); then G1–G8 checked on developers.facebook.com and devices before each flag goes on in production (`groupChallenges` stays off until G2; `rank.overlayPlacement` stays `'fullscreen'` until G3), the four rows of §7 first | lead + D (Phase 4) | open ([fb-dashboard §8](fb-dashboard.md)) |
| **Feedback link** | Choose `support.feedbackUrl` (an `https:` or `mailto:` link) for the web; turn on `support.feedbackOnFbig` only after Meta's rules on external links are checked (review PAR-5) | user + lead | open (row hidden until then) |
| **Parity review** | The words-only review of the Classic look and timings against the original (parity-spec §1.14, R6: impressions in words, our own values) and its findings applied as config changes (fish size, the "+3" rise, timings) | a person playing the Play Store app | open (`parity-review.md` does not exist yet) |
| **Load time** | Before each upload: the first-load script on the release FBIG build; the uncompressed first run on Slow 4G under about 4.5 s (§4) | lead | measured on this build's FBIG e2e twin (same code plus test hooks): 4.25 s |
| G-CLEAN | Provenance rows for every new asset; no 06 §4 source opened; the banned-phrase test in all 17 catalogues (now also the original's Indonesian victory label, CLEAN-1) | lead | done |

## 9. Integration requests (the integration pass) and what happened to each

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

- **Translations are unreviewed AI drafts.** Shipped only in dev, e2e and preview builds. No per-locale screenshots of the new screens (victory, ranking, shop, event, hint card, fail); only Home, game and Settings per locale (E's set), plus Arabic and German here.
- **Fonts for non-Latin scripts** are system stacks; they render with system fallbacks and were checked only in screenshots.
- **The "+3" chip passes over the top-bar title** at the end of its 24 px rise (about 0.3 s; `final-win-3`). UX-12 asked for the chip to start above the pill so it never covers the rolling count, with the same rise; the top bar's centred title sits right above the centred pill, so the rise crosses it. The chip is opaque, so it stays legible. If the parity review prefers, `fx.win.plusLabelRisePx` (24) can be lowered; the e2e check (chip above the pill, on screen) holds for any rise.
- **The in-game fish is small** (22 px on an 8×8 board at 390 px: 0.5 × slot clamped to 22–36). It follows the config; the lead may raise `fx.win.fishSizeFraction` or `fishMinPx` after the parity review.
- **The ranking panel's footer** ("Tap to keep going") is a transparent ghost button over the scrimmed board, so a dimmed board cat can show behind it (`final-win-4`).
- **Two remaining long tasks on a 12×12 at 4× CPU** (PERF-1, PERF-3; §13): the new board's first build after the tap (150–200 ms, after the first visual answer, which now comes within 15–60 ms) and the screen's `inert` restyle at the scrim step (70–90 ms, now under the scrim's composited fade instead of in the panel's first frame). Both are under the 4× slowdown of a low-end phone; at 1× they are gone or under 60 ms.
- **START after the board entry** is scheduled at `fx.boardEntryMs` (700 ms), not at `playEntry()`'s `entryEndMs` (CONTRACTS §4.3). Harmless: input arrives up to 550 ms later than it could under reduced motion.
- **Group challenges** are implemented and unit-tested in both reward modes but were never run in a browser (flag off).
- **The rankings hub and group result UIs** ride in the core overlay chunk (4.8 KB) though only the trophy and group flows open them; moving them to the optional chunk needs a second overlay loader (§4, Phase 3).
- **A day's `daily_fastest` band that starts more than 200 entries down** the board shows the empty list (§7 L3; fb-dashboard §3 names the Phase 4 alternatives).
- **No Ads bought on Home keeps the empty 58 px banner band** until Home is left (the reserve is per screen, §3.2 of the spec); the banner itself goes at once (L2B-2).
- `win.next` (the O3 "Next" label) is unused; keys are never removed (CONTRACTS §6.2).
- The `B-*` harness screenshots predate the integration (they show B's harness, not the app).

## 11. The six-lens code review: 47 findings, all fixed

A six-lens review of the integrated build (cc0aac4) produced 47 findings, each reproduced by an independent verifier. Fixer groups P (platform, banner, economy, rankings, events, data), R (app core, router, performance) and U (UI, accessibility, i18n) fixed them in their own files; what needed another group's file was handed to the lead, who finished it in the final integration (§12). Every fix has a test that fails on the old code (unit tests checked against the old modules; e2e tests against a cc0aac4 build), and the reviewers' own scripts were re-run on the final build for every blocker and major (§13).

| Lens | Blocker | Major | Minor | Nit | Total | Fixed |
|---|---|---|---|---|---|---|
| Platform (FB SDK) | 1 | 3 | 0 | 3 | 7 | 7 |
| Logic | 0 | 1 | 3 | 0 | 4 | 4 |
| Parity | 0 | 0 | 3 | 3 | 6 | 6 |
| UX | 0 | 2 | 3 | 5 | 10 | 10 |
| Robustness and performance | 0 | 2 | 3 | 1 | 6 | 6 |
| Accessibility, i18n, clean room | 0 | 3 | 7 | 4 | 14 | 14 |
| **Total** | **1** | **11** | **19** | **16** | **47** | **47** |

"Fixed" means the defect is gone and a test guards it. Two of them keep a measured remainder that is a trade-off rather than the defect (PERF-1, PERF-3: §10), and one fix brings a visible trade-off (UX-12: §10).

| Finding | Sev. | What was wrong | Fix (by) | Tests |
|---|---|---|---|---|
| **FB2B-1** | blocker | A slow (> 4 s), stuck or failed-hide banner stayed up during play; ads then showed over it | A `timeout` load counts as maybe up, so the next hide reaches the SDK and hides a late banner; a failed hide is retried (1 s, 3×, and on every later hide); a never-settling load is given up after 56 s (P) | `banner-flow.spec` (6), `fb-banner.spec` (5), `fbig.spec` "banners never in play" (4) |
| FB2B-2 | major | The shop opened from the victory left the banner over its Buy buttons; No Ads bought there left it up | An open victory counts as a banner screen (a modal hides, closing re-gates); boot passes the shop's `onOpen` (hide) (P) | `shell-2b.spec` (3), `fbig.spec` victory shop |
| FB2B-3 | major | A failed or slow catalogue gave an empty Buy section, cached 10 min; Settings still offered Remove ads | An empty catalogue is the `error` state with Retry, never cached; reopening asks again; Remove ads only when `remove_ads` is listed (P) | `shop-flow.spec` (2), `shell-2b.spec`, `fbig.spec` Retry |
| FB2B-4 | major | `daily_fastest` hid today's players once later time zones posted the next day; "Your rank" was the board's rank | Readers page past the next-day entries to the shown day's band (≤ 4 × 50) and rank inside it (P) | `fb-ranking.spec` (3), `fb-platform.spec`, `ranking-flow.spec` (2), `fbig.spec` time zones |
| FB2B-5 | nit | iOS showed "Getting the shop ready…" for 5 s | Known-unavailable payments answer `unavailable` at once (P) | `shop-flow.spec`, `fbig.spec` iOS |
| FB2B-6 | nit | A board missing in the dashboard opened an empty list | `LEADERBOARD_NOT_FOUND` latches the board; `supports(board)`; personal records instead (P) | `fb-ranking.spec` (3), `fb-platform.spec`, `ranking-flow.spec` |
| FB2B-7 | nit | "Solved in 0:03" next to "Your score: 0:04" | The panel shows my own time for the solve just made (P); the FB overlay list's own row too, via `RankListView.formatMine` (lead) | `ranking-flow.spec`, `review2b-final.spec`, `fbig.spec` daily (row text) |
| **L2B-1** | major | = FB2B-2 seen from the flow: the victory's shop under the banner | as FB2B-2 (P) | as FB2B-2 |
| L2B-2 | minor | No Ads becoming true (restore, purchase, late merge) left a banner up | `BannerFlow.entitlementChanged()` from the shop and the merge (P) | `banner-flow.spec` (2), `fbig.spec` restore |
| L2B-3 | minor | The victory's fish pill kept the old count after a swap or purchase from its "+" | The open victory follows `wallet.fish` (a store subscription while it is open) (lead) | `review2b-final.spec` |
| L2B-4 | minor | After an event ended mid-puzzle the victory offered "Play puzzle N+1", then `toast.error` | The shell lands "Back to event" and the event screen's Play on Home after the end (P); the victory reads "Back to event" and `nextEventIndex` is null after the end (lead) | `shell-2b.spec` (2), `event-flow.spec`, `events.spec` e2e |
| PAR-1 | minor | Dailies were never 12×12 | Every second Sunday from 2026-10-18 is 12×12 G4; only those 58 days regenerated (P) | `progression.spec`, `tests/property/levels.spec.ts` |
| PAR-3 | minor | The victory was a light page; the original's overlays are dark | Opaque `--stage`, light text, orange "Level N" (U) | `review2b-css.spec`, `palette-check.spec` |
| PAR-5 | nit | No Feedback entry in Settings | The row, config `support.feedbackUrl` / `feedbackOnFbig` and strings (U); the shell passes the URL (lead). Hidden by default | `review2b-fixes.spec`, `shell-2b.spec` (3) |
| PAR-6 | minor | Leaving the victory showed the solved board again | The victory is the outgoing layer of the screen change (R) | `router.spec`, `session-leave.spec`, `winflow.spec` e2e |
| PAR-7 | nit | Teaching copy did not stress rule keywords or show colour names in their colour | Rich text: keyword marks and colour swatches in the coach, hint and How to play (U) | `review2b-fixes.spec`, `format.spec`, `catalogs.spec`, `review2b-css.spec` |
| PAR-8 | nit | No sound when a board enters | A `board_in` cue (U), played with every entry wave, never for a restored won or lost board (lead) | `review2b-fixes.spec`, `review2b-final.spec` (2) |
| **UX-1** | major | The banner hid the victory's and event screen's actions on short phones | Sticky actions above the banner band, fit steps for the hero; the event screen's actions in a footer (U) | `review2b-css.spec`, `review2b-fixes.spec`, `visual.spec` short phones |
| **UX-2** | major | Home with an event and a banner overlapped itself at 320–375 px | The hero fits: the mascot shrinks (down to 64 px) and never overlaps (U) | `review2b-fixes.spec`, `review2b-css.spec`, `visual.spec` |
| UX-3 | minor | FBIG dialogs' close buttons inside FB's 64 × 64 safe zone (Arabic) | Dialogs start below the zone on `:root[data-fb-safe]` (U); the marker is set at boot (lead) | `review2b-css.spec`, `boot.spec`, `i18n.spec`, `fbig.spec` dialogs at 320 (en_US, ar_AR) |
| UX-4 | minor | Win-flow transitions flashed the bare board | Panel → victory crossfade, the panel closes once the victory is opaque (R); the panel's leave fades its content, not its scrim (lead) | `win-flow.spec`, `router.spec`, `review2b-css.spec`, `winflow.spec` e2e |
| UX-8 | minor | Localized layout at 320: wrapping labels, CJK breaks, Russian shop names, top-bar suffix | Wrap rules, phrase breaks for CJK, shop rows that wrap, a suffix that never ellipsizes (U) | `review2b-css.spec`, `review2b-fixes.spec`, `i18n.spec` |
| UX-9 | nit | A top-placed hint card ran into the FB safe zone | Its content starts below the zone (U) | `review2b-css.spec`, `review2b-fixes.spec`, `fbig.spec` (top-placed card at 320) |
| UX-10 | nit | Arabic Buy buttons lost the gap before the price | RTL gap rule (U) | `review2b-css.spec`, `i18n.spec` |
| UX-12 | nit | The rising "+3" first covered the pill's icon and count | The chip starts above the pill and rises from there (lead, R's guidance) | `review2b-css.spec`, `winflow.spec` e2e at 390 and 320 |
| UX-13 | nit | Victory rays painted over the fish pill | z-order (U) | `review2b-css.spec`, `visual.spec` |
| UX-14 | nit | The tutorial coach card sat over the tool row's badges | The card steps clear of the badges (U) | `review2b-fixes.spec` |
| **ROB-1** | major | A failed lazy stylesheet was never retried: unstyled overlays or event screen | `loadChunk({ css })` re-fetches a failed stylesheet with a cache-busting URL before the chunk resolves (R); the event flow's own loader uses the same pattern (lead) | `lazy-chunk.spec`, `lazy-chunk-css.spec`, `review2b-final.spec`, `smoke.spec` |
| **PERF-1** | major | 0.4–1.0 s from tap to first visual change starting a level (4–6× CPU) | The screen-out starts at the tap and the board builds after a frame; per-element custom properties; the scroll read moved (R); the board's lock is one layer; the AudioContext is prewarmed; the click sound waits a frame; one viewport reading per window (lead) | `router.spec`, `session-leave.spec`, `board-view.spec`, `board-entry.spec`, `ui-sounds.spec`, `audio.spec`, `boot.spec`, `review2b-css.spec` |
| ROB-2 | minor | A failed locale chunk was never retried; picking the language again did nothing | A cache-busting retry (U); a pick that falls back toasts and restores the previous choice, so picking again retries (lead) | `set-locale.spec`, `shell-2b.spec` (2), `i18n.spec` |
| PERF-2 | minor | A slow locale chunk held the first screen twice; FBIG showed a blank page | One bounded wait; the loading indicator on FBIG (P) | `boot-locale.spec` (3) |
| PERF-3 | minor | 230–420 ms hitches at the winning tap and the panel's open (12×12, 4–6×) | Per-element properties (R); the screen turns inert at the scrim step, the scrim hand-off by `[data-modal]` (lead) | `router.spec`, `review2b-final.spec`, `review2b-css.spec` |
| DOC-1 | nit | STATUS understated the first load 4–7× | Measured times (P; re-measured §4) | — |
| **A11Y-I18N-1** | major | A language switch left Settings, a cached Shop and Home's tagline in the old language | Every view relabels on a locale change (`createLocaleText`) (U); the board and cell labels too (lead) | `review2b-fixes.spec`, `i18n.spec` |
| **A11Y-FOCUS-1** | major | Focus fell to `<body>` on screen changes | The router moves focus into each new screen (R); Home's Level button is its target (lead) | `router.spec`, `layout.spec` keyboard |
| **I18N-LAYOUT-1** | major | The banner covered the event victory's primary and Home at 360 and 320 | as UX-1 (U) | `visual.spec` short phones |
| I18N-LAYOUT-2 | minor | The fish pill covered the wordmark with an event and a banner | as UX-2 (U) | `review2b-fixes.spec`, `visual.spec` |
| A11Y-CONTRAST-1 | minor | Home's Level label at 18 px below 360 px was 3.15:1 | The label keeps 24 px (WCAG large text) and a long label wraps inside the button (U) | `css-rules.spec` |
| I18N-TEXT-1 | minor | The event card clipped text at 130 %+ | `min-height`, grows with text (U) | `review2b-css.spec`, `i18n.spec` |
| I18N-TEXT-2 | minor | The event title lost its puzzle number in 10 of 17 locales at 320 | The name ellipsizes, the suffix never (U) | `review2b-css.spec`, `review2b-fixes.spec`, `i18n.spec` |
| RANK-1 | minor | The event Top list labelled the event total "This puzzle" | No "This puzzle" row outside a just-played puzzle (P) | `shell-2b.spec` |
| A11Y-LIVE-1 | minor | Shop swaps gave no screen-reader feedback | A polite live line; gated buttons described (U) | `review2b-fixes.spec` |
| I18N-RTL-1 | minor | Arabic reward "+" on the wrong side | Isolated, direction-aware reward text (U) | `review2b-fixes.spec`, `format.spec` |
| A11Y-NAME-1 | nit | The event progress bar had no name | Named by its visible line (U) | `review2b-fixes.spec` |
| A11Y-DL-1 | nit | `<dt>`/`<dd>` inside a `<div>` | Valid list markup (U) | `review2b-fixes.spec` |
| A11Y-HUB-1 | nit | 40 px hub tabs; ArrowRight wrong way in RTL | 44 px tabs; arrows follow the visual order (U) | `review2b-css.spec`, `review2b-fixes.spec` |
| CLEAN-1 | nit | The original's Indonesian victory label missing from the banned phrases | Added to the shared list (U) | `sanity.spec`, `catalogs.spec` |

## 12. Final integration: every item the fixer groups handed over

From `scratchpad/fix2b-handoffs.json` (`not_fixed` and `cross_group_requests` of groups P, R and U). All are done; the tests are in §11.

| From | Item | Outcome |
|---|---|---|
| P | L2B-3: the victory's fish pill follows the wallet (`session.ts openVictory`) | done as proposed (a `store.select` on `wallet.fish` while the win's victory is open; unbound at teardown and before a new victory) |
| P | L2B-4 rest: `selectVictoryView` `last` after the end; `nextEventIndex` null after the end | done; "Back to event" then lands on Home through P's shell guard, no start, no toast |
| P | PAR-1 docs (parity-spec §0.5, differences row and §5.1, 02 §12, CONTRACTS §1) | done |
| P | CONTRACTS §4.4 / §11 API notes; parity-spec §8.6 "hidden" → `shop.unavailable`; §5.3 reader rule for `daily_fastest` | done (CONTRACTS §11.7; parity-spec §8.6, §5.3) |
| P | The over-budget rows | §4: cheap reductions tried, ceilings re-set to measured + about 3 %, recorded in 04 §9 and the `size-check.ts` history |
| P | FB2B-7 optional: my exact time in the FB overlay list | done (`RankListView.formatMine`, set by `ranking-flow.showList(…, mine)`; my row only, never another player's equal score) |
| R | PERF-3 rest: make the screen inert earlier; the scrim hand-off needs a class, not `[inert]` | done: `router.reserveModal()` at the win flow's scrim step (`WinFlowDeps.onScrim`), released at teardown or a screen change; `[inert] .game__scrim` → `.app-screen[data-modal] .game__scrim`. Measured: no long task left at the panel's open (was 107–130 ms) |
| R | UX-12 CSS (`screens.css`, `fx.css`) and its e2e test | done as proposed, plus the test at 320 × 568 (§10 for the trade-off) |
| R | A11Y-FOCUS-1: `data-autofocus` on Home's Level button; tighten the layout test | done |
| R | PERF-1 / PERF-3: the `board.css` `[aria-disabled] .cell` rule | replaced by one `::after` layer on the board (R's measured option); header comment updated |
| R | UX-4: the ranking panel's `.is-leaving` fades its content only | done |
| R | ROB-1: the event flow's default loader with the CSS pattern | done |
| R | PERF-1 tap latency: audio `onGesture`, the UI click sound, `readViewport` on mount | the AudioContext is prewarmed at idle and the gesture only resumes it; the click sound plays after the next frame (the haptic stays in the gesture); game screens share one viewport reading per window, cleared on a resize. Measured: first frame after the tap 15–23 ms (was 415–544) |
| R | Docs: CONTRACTS §11 (router, transitions, win flow, lazy chunk, board) and STATUS | done (CONTRACTS §11.7) |
| U | PAR-8: play `board_in` at board entry, not for restored won or lost boards | done (`playBoardEntry` in `session.ts`, at mount and on Retry) |
| U | PAR-5: pass `feedbackUrl` from config in the shell (web; FBIG only with `feedbackOnFbig`) | done |
| U | ROB-2 part 2: `applyLocale` returns the locale; toast when a pick falls back | done; the previous choice is restored as well, so the same row can be picked again to retry |
| U | A11Y-I18N-1 rest: the board's and cells' aria-labels on a locale change | done (`board-view.ts` `onLocaleChanged`) |
| U | UX-3 / UX-9: the FBIG e2e test for dialogs at 320 (en_US, ar_AR) and a top-placed hint card | done (`fbig.spec`; the check clips each control by its scrolling ancestors and skips inert dialogs, so a tall dialog scrolled inside its panel is judged by what can be seen and tapped) |
| U | UX-3 optional: `data-fb-safe` at boot | done (right after `init()`) |
| U | Docs: parity-spec §2.5 (dark victory) and the §1.2 / §2.5 contradiction, §6.5, §0.7 Feedback row, differences rows 194 and 261 / 263, STATUS screenshots of the dark victory | done |
| U | Budgets (core lazy JS 74, lazy CSS 31.5 proposed) | core lazy 74; lazy CSS 31.2 (measured 30.3 + 3 %) |
| U | The flaky `layout.spec` keyboard test | §3 |

## 13. The reviewers' scripts, before and after (blockers and majors)

Re-run unchanged (copied to `scratchpad/fin/repro/`, only their output folders changed) against fresh `dist/e2e` and `dist/fbig-e2e` builds of the final tree. "Before" is the verifier's record on cc0aac4.

| Finding | Script | Before | After |
|---|---|---|---|
| FB2B-1 | platform `verify/v1.ts`, `v1b.ts`, `v1c.ts` | A 6 s banner load with Play at 1 s and 5 s: banner visible over Hint and Kitty, `hideBannerAdAsync` 0; a failing hide (then working again): banner stays, hides 1, also after Settings and Home; a never-settling load: loads stay at 1, no banner for the rest of the session; `ad.showAsync` with the banner up and no hide before it | Banner not visible in play, hides 1, in both runs; failing hide retried (hides 2 → 3) and the banner gone once the SDK hides; stuck load given up, Home loads a new banner; `hideBannerAdAsync` before `ad.showAsync`, no banner in the next level |
| FB2B-2 / L2B-1 | platform `v2.ts`; logic `v1.ts`, `v1b.ts` | Shop over the victory: hides 0, banner visible, "Buy Fish Crate" under it (y 758–802 vs 794); after No Ads still visible | Hides +1 on the shop's open, banner not visible, all five Buy buttons clear; after No Ads and after closing still not visible |
| FB2B-3 | platform `v3.ts` | A failed or slow catalogue: an empty Buy section, no Retry, reopening never asks again (1 call) | `error` with "Try again"; reopening asks again (2 calls) and lists the five products |
| FB2B-4 | platform `v4.ts` | "Your rank: #13", "Your score: 0:04" vs "Solved in 0:03"; the list held only my row | "Your rank: #1", "Your score: 0:03"; the list holds today's four rows (#1 mine at 0:03, then 3:20, 3:30, 3:40) |
| UX-1 | ux `ux1.mjs`, `ux1b.mjs` | Daily "Done" under the banner at 375 × 667, 360 × 640 and 320 × 568 (centre hit the banner); event primary 6 px from the band | Every primary and Home above the band at all three sizes, hit-tests land on the button; the event screen's Top list and Home clear |
| UX-2 | ux `ux2.mjs`, `ux2fb.mjs` | 320–375 px with event + banner: wordmark 11–20 px under the pill, mascot 13–23 px into the card | 0 px overlap for every size and combination (also FBIG at 360 and 375) |
| ROB-1 | perf-verify `rob1.mjs`, `rob1b.mjs`, `rob1c.mjs` | The failed `overlay-chunk-*.css` requested once, never again: a static, transparent hint card over the top bar; unstyled panel and victory; unstyled event screen | Re-fetched once as `…css?retry=1` (261 rules); hint card fixed at z 40, panel and victory styled, event screen styled |
| PERF-1 | perf-verify `perf1.mjs` (L314 12×12, L201) | First frame after the tap: Home → L314 415–544 ms at 4×, 1 054 ms at 6×; victory → next 485 ms at 4× | Home → L314 15–23 ms at 4×, 39 ms at 6×, 15 ms at 1×; victory → next 29–62 ms at 4×, 43 ms at 6×; L201 19 / 39 ms; reduced motion 26 / 37 ms |
| PERF-3 (minor, measured too) | `fin/repro/review2b-perfverify/perf3-final.mjs` (L314, 4×, long tasks after `WON`) | Verifier (trace): winning tap 232 ms, panel open 171 ms (4×); group R's runs after its part: panel open 107–130 ms, winning tap about 178 ms | No long task at the panel's open; the inert restyle at the scrim step 68–89 ms; the winning tap's task 66–86 ms |
| A11Y-I18N-1 | a11y-verify `i18n1.cjs`, `i18n2.cjs` | Settings, a reopened Shop and Home's tagline stayed English after Deutsch; the game's top bar and tools too | All German at once: Settings (open and reopened), the Shop, Home's tagline and daily card, the game's top bar, tools and chips |
| A11Y-FOCUS-1 | a11y-verify `focus1.cjs`, `focus2.cjs` | Focus on `<body>` after event card → event, event Home → Home, game Home → Home, victory Home → Home | Event screen: "Play puzzle 1"; Home (each way): the Level button; Tab goes on in order from there |
| I18N-LAYOUT-1 | a11y-verify `vicban3.cjs`, `vicban.cjs`, `vicdaily.cjs` | 360 × 640: "Play puzzle 4" 24 px under the banner, Home off screen; 320 × 568 the same; daily "Done" almost fully covered | Every primary and Home above the band at 320, 360 and 390 in English and German; no scrolling overlay |

## 14. Remaining differences from the original, and why

The eight headlines and what remains of each are in §6; the full table with the original's side is [differences-vs-original §1.0](../phase2/differences-vs-original.md), and every remaining difference has its reason in [parity-spec §0.7](parity-spec.md). The reasons fall into four groups:

| Reason | What stays different |
|---|---|
| **Legality** (clean room, R1, R6) | Our own cat (Tux), fish art, sounds, strings, event names and themes; our own colour, size and timing values (fitted to the reported waits, never sampled); copy says "fish", never "golden fish" |
| **Platform** (Meta's rules, no ad network or backend on the web) | No banners during play; no ads on the production web (a free fallback grant instead); other players' names only inside FB overlay views and personal records on the web; group rewards for taking part; no purchases on iOS, Messenger.com or the web and no subscriptions; no Feedback link on FBIG until Meta's external-link rules are checked; a web boot screen and keyboard and mouse input |
| **Unknown on the original's side** | What fish buy, the points table, what each board ranks, event contents (21 puzzles, milestones, no pass); the style of the board entry, screen transitions, idle motion, heart break and the victory layout; the campaign's board-size mix; the Android language list (we ship 17, the iOS app lists 62) |
| **Kept by the user's choice** (headline 7) | Accessibility extras: colour patterns, Reduce motion, screen-reader labels, keyboard play (all off or invisible by default), and the thin tinted edge under the white X (the accessibility minimum, WCAG 1.4.11) |

Moved to parity by the review fixes: 12×12 dailies every second Sunday (PAR-1), a dark victory screen like the original's overlays (PAR-3), a Feedback link in Settings on the web (PAR-5), a board-entry cue (PAR-8; we match the Yandex web build's cue, the Play app's sounds are unknown), the victory's way out never showing the solved board again (PAR-6), and teaching copy that stresses its rule words (PAR-7).

## 15. Independent audit (2026-10-09, after the final integration)

An auditor who wrote none of the fixes re-ran the checks on the uncommitted tree, compared this document with the results, and played the web build.

- **Re-run, all as stated above.** `tsc` clean; vitest 1 941 passed in 107 files; `verify-levels` 10 / 27 / 3, 0 issues; `palette-check` OK; `i18n-check` and `--release` OK; `build`, `build:fbig` and `build:release` with no warnings; `size-check` matched every row of §4 to the decimal on all four dists; zips 288.8 KB / 61 files and 382.3 KB / 77 files. Playwright twice: 153 passed, 20 skipped, 0 failed, with the per-project split of §3 both times. The §11 lens table and all 47 rows' severities match the review's findings file, and the daily size counts in 02 §12 match the packs.
- **Fixes checked by reverting them.** Six findings drawn at random: PERF-1, L2B-4, PERF-3, CLEAN-1, I18N-RTL-1 and A11Y-LIVE-1. Each fix was removed in turn: L2B-4 in both its P and lead halves, and A11Y-LIVE-1 and PERF-3 in two parts each. Every time, the covering tests failed without the fix and passed again once the file was restored (checked by checksum).
- **Played on `dist/web`** (390 × 844, touch). The tutorial. Levels 2–11: on Level 2 a mistake (red X, 2 of 3 hearts) and an applied hint. The full win flow: glow, fish flight, the ranking panel with personal records, and the dark victory with the wide orange "Level N". A hint swapped for 15 fish from the victory's "+": the live line read "1 hint added. Fish left: 0. Not enough fish yet.", and the victory's pill and reward line followed to 0 (L2B-3). Settings → Language → Deutsch: Settings, Home, the game and the board's and cells' labels all switched at once, then back to English. With the clock inside Lantern Walk: the Home card, the event screen (focus on "Play puzzle 1"), puzzle 1 to the event victory ("Play puzzle 2", 1 / 21 solved), and the 12 × 12 Sunday daily on 15 Nov. There was no page error, console error, failed request or toast. What was seen matches [differences-vs-original §1.0](../phase2/differences-vs-original.md) for the web build: no ads, no trophy without FB leaderboards, only the shop's swaps, and no Feedback row by default.
- **Fixed here.** Three comments (`ui/overlays/settings-modal.ts`, `i18n/en/ui-2b.ts`) named the Feedback config key `app.feedbackUrl`; the key is `support.feedbackUrl`. The change is comment-only.
- **Not re-checked here:** the FBIG build in a browser beyond the e2e suite, the load times of §4, the reviewers' scripts of §13, and a third Playwright run.
