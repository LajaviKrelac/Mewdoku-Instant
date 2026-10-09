# Phase 2c status: fish are the lives

Status: **code complete and integrated**; open gates in §8 · Date: 2026-10-09 · Branch `claude/mewdoku-instant`, base `78cbad1` (Phase 2b) · Spec: [fish-lives-spec](fish-lives-spec.md) · APIs: [fish-lives-spec §7.4](fish-lives-spec.md) and [phase2b CONTRACTS §12](../phase2b/CONTRACTS.md)

Phase 2c applies four facts the user reported first-hand on 2026-10-09 from the Play Store app. They override our earlier research (recorded in [01](../phase1/01-game-deconstruction.md) "First-hand update", rows 5.11, 7.1.2–7.1.3, 10.12, 10.16–10.17, 11.13, §17–§19):

- **F1. Fish are the lives.**
- **F2. The fish left at a win are added to the leaderboard points**, ranked per period (a total that resets).
- **F3. Level points get better without mistakes** (streak-like).
- **F4. Our invented fish currency is removed.**

It was built in three parallel workstreams: G1 game and app logic, G2 UI, art and i18n, G3 platform. The lead then integrated them (I-1 to I-6 below). Every drawing and animation is ours ([provenance §9](../provenance.md)), and no source from 06 §4 was opened.

## 1. What a player sees now

| Area | Phase 2b | Phase 2c |
|---|---|---|
| Lives | 3 hearts; a heart break on a mistake | **3 fish** in the lives pill (our fish icon; a lost life is our pale empty outline). A mistake plays our **fish loss**: the fish wriggles, flips belly-up and falls with three droplets while its outline fades in (700 ms; reduced motion: a 150 ms swap). "Out of fish" at 0; Continue gives "+1" fish |
| Win flow | 3 fish popped from the cats and flew to a fish wallet pill; "+2" bonus on Hard and dailies | The counter for **this week's points** fades in, and **only the fish still in the lives pill** lift off (last one first, each slot emptying as it leaves) and fly to it. The panel opens at 4.2 / 4.35 / 4.5 s for 1 / 2 / 3 fish (reduced motion: 1.2 s) |
| Leaderboard | Paw points (all time), "today's fastest" daily, event boards | **One period board** (`period_points`): this UTC week's total of fish kept. It is shown after every scored win, in Home's period pill and as the hub's first tab ("This week"). Event boards are kept; paw points are retired and the daily board is off |
| Level points | Base + flawless + unaided bonuses | `10 × n` (× 2 on Hard) + **perfect-streak bonus** `10 × min(streak, 10)`. A mistake or a revive breaks the streak at once (saved with the board). The victory shows "+120 points" and, after a perfect win, "Perfect ×4" |
| Economy | Fish wallet, fish for hints (15) and kitties (30), two fish packs, a fish pill "+" to the shop | **No fish currency.** No wallet, no swaps, no fish packs, no "+". The FB shop (Settings → Shop, only where something can be sold) has three products: No Ads, Bulb Bundle (15 hints), Kitty Basket (8 kitties). A retired fish pack in a ledger or an unconsumed purchase is compensated once (10 hints + 3 kitties / 30 hints + 15 kitties) |
| Event milestones | 30 / 60 / 100 fish | Hints and kitties only (spec §5.5) |
| Save | v2 (with a wallet) | **v3**: no wallet; a `streak` record and a `period` record. The v2 → v3 migration drops the wallet and any pending paw-points score |

Defaults the user did not specify are config values marked `[DECISION: default, user may change]` (spec §0.2, §8):

| Default | Value | Config key |
|---|---|---|
| Period | UTC weeks from Monday 00:00 UTC | `period.kind` |
| Leaderboard points | Fish kept × 1 | `period.pointsPerFish` |
| Level points | 10 per board size, × 2 on Hard, plus 10 per perfect win in a row (up to 10) | `levelPoints.*` |
| Modes that count | Level, daily and event for both; the tutorial for neither | `*.modes` |

## 2. Integration: every request and gap, and what happened

| # | From | Request or gap | Outcome |
|---|---|---|---|
| I-1 | G1 R6, G3 R1 | `playwright.config.ts` `VITE_FB_LEADERBOARDS`: add `period_points`, drop `paw_points` and `daily_fastest` | **Done.** The four FB ranking tests pass with the shared config |
| 1 | G2 R1 | `dev/art-harness.ts`, `dev/board-harness.ts`: the deleted `icon-heart*` ids | **Done.** They list `icon-fish-empty` (and `icon-fish`). The art harness's top-bar demo uses the real `createPeriodPill` |
| 2 | G2 R2 | `dev/b-harness.ts`, `dev/shell-fixtures.ts`: the 2c props | **Done, then further.** The b-harness win flow was rewritten for the 2c API (lives → counter, `&kept=1..3`, `win-kept-1`). Its fixtures are the period board, the victory gets `streak`/`kept`, the shop has three products and no swap, the hub gets `periodKind`, and the group place outcome gets hints. `heart-break` became `fish-loss` and `rewarded-swap` became `rewarded-video`. `shell-harness`/`shell-styles` drop `onShop` and the heart icon class. `tsc` is clean in `dev/**` |
| 3 | G1 R1 | Remove `fishRect / showFishPill / fishLabel` from the fake game screens | **Done** (`boot.spec.ts`, `harness.ts`) |
| 4 | G1 R3, G2 note | Remove the `'points'` branches and then `rank.points` | **Done.** See I-3 below. `rank.records.thisLevel` (only the paw board used it) went too, from all 17 catalogues, `meta.ts` and `drafted-from.json`. `catalogs.spec` now checks both stay gone |
| 5 | G1 R2 | Delete `a11y.fishEarned.*`, `rank.title.points`, `shop.notEnough` | Done by G2 before integration |
| 6 | G1 R4, G3 R4 | Ownership notes (`layout.spec.ts`, `src/env.d.ts`) | Noted. One writer each; no conflict found |
| 7 | G1 R5, G3 note | `RankEntry.boardRank` on band reads | Done by G3. At I-3 `ranking-flow.ts` dropped its local `BandEntry` intersection type and reads `RankEntry.boardRank` directly |
| 8 | G3 R2 | The 2b daily-band e2e test was removed (the daily board is off) | **Accepted.** The period-band test replaces it (#251 past 200 entries). The daily band keeps its unit tests; restore the old test from `78cbad1` if `rank.dailyBoard` is turned on |
| 9 | G3 R3, G2 note | `fb-dashboard.md`; provenance rows | Done by G3 and G2. The lead added an integration note to provenance §9 (no G1/G3 assets) |
| 10 | G3 gap | No e2e test for Messenger.com (payments never ready) | **Done.** New `fbig.spec.ts` test: with `payments-never-ready`, after `iap.readyTimeoutMs` Settings has no Shop and no Remove-ads row, and no catalogue or purchase call is made |
| 11 | G3 gap | The fbig e2e suite was not run with the shared config | **Done.** 34 / 34 in each full run (§3) |
| 12 | G3 gap | `npm run size` was not run on the shared `dist/` | **Done.** All four builds are within budget (§4) |
| 13 | G3 decision | Band reads stop once they hold `n` band entries (a deviation from "paging unchanged") | **Accepted.** The current week's band is at the top, so the old reader always made 4 calls against a 3 s deadline; now it makes 1–2. `boardRank` keeps "Your rank" exact at any depth (e2e #251) |
| 14 | G3 decision | The stub fills in a shorthand unconsumed purchase without `developerPayload` | **Accepted** (test fixture only) |
| 15 | G1 gap | A test read the deprecated `fx.win.scrimAtMs` and passed only because 3 fish give the same 4 200 ms | **Fixed.** `review2b-final.spec.ts` PERF-3 now uses `panelAt(3) − fx.win.scrimLeadMs` |
| 16 | G1 note | A device clock set back into an older period restarts that older key's local total | **Accepted** as the spec's literal rule. The best week and the board keep the higher value |
| 17 | G2 note | Italian `rank.title.period.week` "Classifica settimanale" is 22 characters against a soft limit of 20 | **Left as a warning** for the Italian reviewer. G2 measured that it fits at 320 px. `i18n:check` passes with 1 warning |
| 18 | G2 note | Arabic "+{count}" displays as "3+" (the project's FSI convention) | Left for the RTL reviewer (§8) |
| 19 | G1 note | Earned fish in a v2 save are dropped without conversion; only retired paid packs are compensated | **Accepted** (spec D10: the game never shipped publicly, so only test saves hold earned fish) |

**I-3, the deleted `@deprecated` members:**

- `GameScreen.fishRect / showFishPill / fishLabel` and `PillsView.showFish / fishRect / fishLabel`.
- `VictoryProps.fish / bonus / onShop`, `HomeView.fish`, `HomeCallbacks.onShop`.
- `ShopProps.fish / hintPrice / kittyPrice / onSwap`, `RewardedPromptProps.swap`.
- `Reward.fish`.
- `RankHubTab 'points'`, `RankingBoardKind 'points'`, `RankScoreView 'points'`, `RankingResultView 'level'` (the paw-points subtitle), and `DecodedScore 'points'` (`boardFormat` has no paw-points format; nothing reads or submits that board).
- `fishSourceRows`, `fishSizePx`.

Tests that checked the forwarding now assert that the members are gone. Tests that handed in stray 2b props still check that such props are ignored, through a cast. Stale "until I-3" comments were updated. Config keys stay `@deprecated` and unread: the config file never removes a key, and nothing in `src`, `scripts` or `tests` reads them (checked with grep).

## 3. Verification (final tree, 2026-10-09)

| Check | Result |
|---|---|
| `npx tsc --noEmit` (incl. `dev/**`) | clean (it had 9 errors in `dev/**` before I-2) |
| `npx vitest run` | **2 069 passed, 0 failed, 109 files** (2b final: 1 941 in 107). Net −2 from the two tests of deleted helpers (`fishSourceRows`, `fishSizePx`), +1 new CSS test |
| `npm run levels:verify` | 10 level packs, 27 daily months, 3 event packs, 0 issues |
| `npm run palette:check` | OK |
| `npm run i18n:check` (and `--release`) | OK: 17 catalogues, release `en`; 1 warning (Italian title length, §2 #17) |
| `npm run build`, `build:fbig`, `build:e2e`, `build:fbig-e2e`, `build:release` | all build, no warnings |
| `npx tsx scripts/size-check.ts` | within budget on `dist/web`, `dist/fbig`, `dist/release-web`, `dist/release-fbig`; **no ceiling changed** (§4) |
| `npm run zip:fbig` (and `zip:fbig:preview`) | release zip **290.9 KB, 61 files**, locales `en` (it warns that the four `VITE_FB_*` ids are empty, as expected before the dashboard); preview zip 388.2 KB, 77 files |
| `npx playwright test` (4 projects, no retries) | **three consecutive full runs, each 159 passed, 0 failed, 19 skipped by design, 0 flaky** (`web-390` 71 + 6 skipped, `web-320` 36 + 6, `web-1280` 18 + 7, `fbig-390` 34 + 0; about 5.8 min each). Run 1 was before L1/L2 (§5); runs 2 and 3 are on the final tree. 2b final: 153 passed, 20 skipped. The 19 skips are the existing project-scoped skips declared in the specs |
| Leftover wording | §7 |

## 4. Bundle sizes vs budgets (KB, 1 KB = 1 000 bytes)

| Row | web | FBIG | release-web | release-FBIG | Ceiling |
|---|---|---|---|---|---|
| Main JS | 263.4 | 278.0 | 262.2 | 276.8 | 279 |
| First-load total | 322.6 | 337.3 | 321.4 | 336.1 | 340 |
| First load + 1 locale | 348.6 | 363.3 | — | — | 365 |
| First load (gzip) | 119.8 | 124.8 | 119.4 | 124.4 | 126.5 |
| Lazy JS, core | 70.7 | 70.5 | 70.7 | 70.5 | 74 |
| Lazy JS, optional | 15.4 | 29.1 | 15.4 | 29.1 | 29.3 |
| Lazy CSS | 29.7 | 29.7 | 29.7 | 29.7 | 31.2 |
| Locale chunk (largest) | 26.0 | 26.0 | — | — | 28 |
| FB files | — | 77 | — | 61 | 100 |

2b final (STATUS-2b §4) had FBIG main JS 271.0 KB and first load 331.0 KB. 2c adds about 7 KB to the FB main JS: save v3, scoring, the period counter and fish loss, and the 2c strings, partly offset by the deleted currency and deprecated code. **Headroom is now under 1 KB** for the FBIG main JS (1.0 KB) and the optional lazy JS (0.2 KB). The next change that adds to either needs a reduction first, or a recorded lead decision (04 §9).

## 5. Lead decisions at integration

| # | Decision | Why |
|---|---|---|
| L1 | `fx.win.plusLabelRisePx` 24 → 6 | In the final screenshots the rising "+N" chip covered "Level N" at every win: the gap between the title and the pills row is 27 px and the chip is about 26 px tall (measured at 390, 360 and 320 px). The 24 px rise came over unchanged from the 2b fish pill. 6 px still reads as a rise. (The 2b parity-spec §2.2 row says 24; superseded here) |
| L2 | `.rank-records__value { flex: none; white-space: nowrap }` | In German at 320 px "41 Fische" broke onto two lines next to "Deine beste Woche" (the 2c period records). Now the value stays whole and the label wraps. `review2b-css.spec.ts` checks it |
| L3 | `RankingResultView 'level'` and `rank.records.thisLevel` removed with the paw board (beyond the spec's I-3 list) | Both existed only for the retired board; deleting them made `rank.points` unused, as Appendix A.3 intended |
| L4 | Config `@deprecated` keys (`fish.*`, `shop.*`, `iap.products`, the 2b `points.*`, `fx.heartBreakMs`, …) kept | The config file's rule is "never rename or remove a key". None is read; they cost a few hundred bytes |
| L5 | Accepted G3's early stop on band reads and the stub's shorthand purchase | §2 #13, #14 |
| L6 | Rows 5.11, 10.16, 10.17 and 11.13 in 01 (the spec asked for 5.10, 10.13, 10.14) | Those numbers were already taken in 01. New rows got free numbers; the content is as the spec asked |

## 6. Screenshots (`docs/phase2c/screenshots/final-*.png`)

Captured by the lead from the **built** e2e apps (`dist/e2e`, and `dist/fbig-e2e` with the FB stub). Viewports: 390 × 844 for the main set, 320 × 568 for German and Arabic (scale factor 2). The save is a returning player at level 12 with 39 fish this week and a perfect streak of 3. Every image was looked at. The two problems found there were fixed (L1, L2) and re-captured.

| File | Shows | Checked |
|---|---|---|
| `final-home.png` | Home: the period pill (trophy, "39"), no fish pill, no "+" | ✓ |
| `final-level-3-fish.png`, `-2-fish`, `-1-fish` | The lives pill with 3, 2 and 1 fish; lost lives as pale outlines, draining from the last slot; the red X on each wrong tile | ✓ |
| `final-fish-loss-a.png`, `-b.png` | The fish loss about 170 ms in (the hop and flip) and about 330 ms in (belly-up fall, droplets, the outline fading in) | ✓ |
| `final-fail.png` | "Out of fish", Continue "+1" with a fish, Retry, Home; three empty outlines behind | ✓ |
| `final-winflow-2fish-*.png` | A win with 2 fish kept, frames at about 1.05 s (counter in, 39), 1.25 s (lift-off: the last full slot empties), 1.7 s (in flight over the top-bar band), 2.3 s (arrival, the roll 39 → 40), 2.45 s (41, "+2"), 2.8 s (the chip clear of the title), 4.1 s (scrim) | ✓ |
| `final-winflow-3fish-*.png` | The same with 3 fish (39 → 42) | ✓ |
| `final-ranking-web.png`, `final-ranking-web-2-fish.png` | Web: "Weekly ranking", "+3 fish · This week: 42" / "+2 fish · This week: 41", the records (this week, best week, perfect streak "4 (best 9)" / "0 (best 9)" after the mistake, levels solved), the honest local-only line | ✓ |
| `final-victory.png` | A perfect win: three fish "+3", "This week: 42", "+100 points" (6×6: 60 + 4 × 10), "Perfect ×4" | ✓ |
| `final-victory-2-fish.png` | A win after a mistake: two full fish and one empty, "+2", "This week: 41", "+60 points", no streak chip | ✓ |
| `final-home-fb.png` | FB Home: the period pill after the 64 px safe zone, the hub trophy button, the stub banner | ✓ |
| `final-ranking-fb.png` | FB classic stub: "Your rank: #1", "Your score: 3 fish", "See top players" | ✓ |
| `final-victory-fb.png` | FB victory (perfect win, "This week: 3") | ✓ |
| `final-shop-fb.png` | Settings → Shop on FB: three products (No Ads, Bulb Bundle, Kitty Basket), no fish item, no swap | ✓ |
| `final-de-320-*.png`, `final-ar-320-*.png` | German and Arabic at 320 × 568: Home, a level with 2 fish, the ranking panel, the victory after a mistake and after a perfect win. Arabic mirrors the layout, and its lost life drains from the row's logical end; the fish icons are not mirrored (spec §1.1) | ✓ |

G2's own sets (`G2-*.png`: frame sheets of the fish loss, revive, flight and counter roll; the `visual.spec` captures) stay alongside.

## 7. Leftover "heart" and fish-currency wording

- **Built bundles** (`dist/e2e`, `dist/fbig`, `dist/release-fbig`, every JS and CSS file): "heart" appears only as an identifier:
  - the `heart_last` sound id;
  - `GameState.hearts` / `heartsLeft` (stored save and reducer fields, spec §0.5);
  - i18n key names (`game.hearts.a11y`, `howto.hearts`);
  - the `yarn-hearts-2027` event id.

  No copy says heart. None of these appears anywhere: "Swap", "Not enough fish", a fish product name, `fish-pill`, `pill--hearts`, `icon-heart`, `rank.points`, `fishEarned`, `victory.bonus`.
- **All 17 catalogues, every value** (scanned in each language's own words for heart): only `glyph.9` (the colour-pattern heart glyph, kept by spec §0.5) and `event.yarn.name` (the "Yarn Hearts" event name). No English value uses a currency word (coins, money, wallet, swap, balance, golden fish, fish pack). Every English string that mentions fish means a life or a leaderboard point.

## 8. Open gates and known issues

| Item | State |
|---|---|
| **Translations** | The 2c lines of the 16 catalogues are unreviewed AI drafts (G2, `docs/i18n/review-log.md`). The release ships English only until a native reviewer signs each locale off. Reviewers should check the Italian title length (§2 #17), the Arabic "+N" order (§2 #18) and the word chosen for "fish" as a life and as a point (glossary) |
| **Meta dashboard** | Create the period board (suggested `fish_week_v1`, [fb-dashboard §3](../phase2b/fb-dashboard.md)) and the three products. Do not create `paw_points`, `fish_250` or `fish_900`. Set `VITE_FB_LEADERBOARDS` with `period_points`. Changing `period.kind` later needs a new board name |
| **Unknowns from the user** | Period length and reset time, the points numbers, and whether dailies and events count (01 §19). Each is one config value |
| **Bundle headroom** | Under 1 KB on the FBIG main JS and the optional lazy JS (§4) |
| **FB Home shows two trophies** | The period pill (trophy + this week's fish; not a button, spec D8) sits beside the trophy button that opens the hub. A possible follow-up, for the user to decide: make the pill the hub's entry, or give the pill its own icon |
| 2b gates | G-NAME, G-LEGAL, Feedback link, Parity review, Load time: unchanged from [STATUS-2b §8](../phase2b/STATUS-2b.md) |

## 9. Acceptance checklist (spec §9)

| Group | State |
|---|---|
| Lives (fish pill, fish loss, "Out of fish", revive pop, 17 catalogues) | done; screenshots §6; `i18n:check` 0 errors |
| Win flow (only the fish left fly; 4.2 / 4.35 / 4.5 s; tutorial; restored board; period panel; victory rows) | done; unit timings (G1 `win-flow.spec`), e2e windows (`winflow.spec`), frames §6 |
| Scoring and save (§3.1 table, streak breaks at once, UTC rollover, v3 migration with one-time compensation) | done; G1 unit tests (`scoring`, `save-v3`, `streak-session`, `purchases`) |
| Leaderboards (period score encoding, one batch with the event board, band read, `boardRank` past 200, hub tabs, dashboard doc) | done; G3 unit tests and `fbig.spec` (#251) |
| No fish currency | done; §7 grep, `shop-flow`, `helper-flows`, `fbig.spec` (three products, `fish_250` restore once, Messenger) |
| Release hygiene | done: §3, §4, provenance §9, the §6 docs below, Playwright green three times in a row (§3) |

Docs updated at I-5:

- [01](../phase1/01-game-deconstruction.md) (F1–F4, rows, §17–§19)
- [differences-vs-original](../phase2/differences-vs-original.md) (§1.0 rows 2, 5, 8; §2.1, §2.5–§2.8; §3.3–§3.4; §5.3; §6 #1–#2)
- [parity-spec](../phase2b/parity-spec.md) (banner and 16 pointers)
- [STATUS-2b](../phase2b/STATUS-2b.md) (pointer)
- [CONTRACTS §12](../phase2b/CONTRACTS.md)
- [02](../phase1/02-rebuild-spec.md) (Phase 2c notes in S2, §10, §13, §15)
- [04](../phase1/04-architecture.md) (§4.3 save v3, §9 measurements)
- [provenance §9](../provenance.md)
- the three request files (pointer to §2)
