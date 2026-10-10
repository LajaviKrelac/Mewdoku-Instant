# Phase 2c status: fish are the lives

Status: **code complete and integrated**; open gates in §8 · **Phase 2c.1 (per-cat level points, 2026-10-10): built and integrated, §10** · Date: 2026-10-09 (2c.1: 2026-10-10) · Branch `claude/mewdoku-instant`, base `78cbad1` (Phase 2b) · Spec: [fish-lives-spec](fish-lives-spec.md) · APIs: [fish-lives-spec §7.4](fish-lives-spec.md) and [phase2b CONTRACTS §12](../phase2b/CONTRACTS.md)

Phase 2c applies four facts the user reported first-hand on 2026-10-09 from the Play Store app. They override our earlier research (recorded in [01](../phase1/01-game-deconstruction.md) "First-hand update", rows 5.11, 7.1.2–7.1.3, 10.12, 10.16–10.17, 11.13, §17–§19):

- **F1. Fish are the lives.**
- **F2. The fish left at a win are added to the leaderboard points**, ranked per period (a total that resets).
- **F3. Level points get better without mistakes** (streak-like). **2026-10-10 (F5):** the user gave the exact rule: per correct cat inside one level, 96 × (5 + s); built as Phase 2c.1 (§10).
- **F4. Our invented fish currency is removed.**

It was built in three parallel workstreams: G1 game and app logic, G2 UI, art and i18n, G3 platform. The lead then integrated them (I-1 to I-6 below). Every drawing and animation is ours ([provenance §9](../provenance.md)), and no source from 06 §4 was opened.

## 1. What a player sees now

| Area | Phase 2b | Phase 2c |
|---|---|---|
| Lives | 3 hearts; a heart break on a mistake | **3 fish** in the lives pill (our fish icon; a lost life is our pale empty outline). A mistake plays our **fish loss**: the fish wriggles, flips belly-up and falls with three droplets while its outline fades in (700 ms; reduced motion: a 150 ms swap). "Out of fish" at 0; Continue gives "+1" fish |
| Win flow | 3 fish popped from the cats and flew to a fish wallet pill; "+2" bonus on Hard and dailies | The counter for **this week's points** fades in, and **only the fish still in the lives pill** lift off (last one first, each slot emptying as it leaves) and fly to it. The panel opens at 4.2 / 4.35 / 4.5 s for 1 / 2 / 3 fish (reduced motion: 1.2 s) |
| Leaderboard | Paw points (all time), "today's fastest" daily, event boards | **One period board** (`period_points`): this UTC week's total of fish kept. It is shown after every scored win, in Home's period pill and as the hub's first tab ("This week"). Event boards are kept; paw points are retired and the daily board is off |
| Level points | Base + flawless + unaided bonuses | ~~`10 × n` (× 2 on Hard) + perfect-streak bonus, "Perfect ×4"~~ **Superseded by Phase 2c.1 (§10):** each correct cat inside the level adds 96 × (5 + s) (576, 672, …); a mistake resets the run; every level and Retry start at 0; a live counter in the HUD; the victory shows the level's total |
| Economy | Fish wallet, fish for hints (15) and kitties (30), two fish packs, a fish pill "+" to the shop | **No fish currency.** No wallet, no swaps, no fish packs, no "+". The FB shop (Settings → Shop, only where something can be sold) has three products: No Ads, Bulb Bundle (15 hints), Kitty Basket (8 kitties). A retired fish pack in a ledger or an unconsumed purchase is compensated once (10 hints + 3 kitties / 30 hints + 15 kitties) |
| Event milestones | 30 / 60 / 100 fish | Hints and kitties only (spec §5.5) |
| Save | v2 (with a wallet) | **v3**: no wallet; a `streak` record and a `period` record. The v2 → v3 migration drops the wallet and any pending paw-points score |

Defaults the user did not specify are config values marked `[DECISION: default, user may change]` (spec §0.2, §8):

| Default | Value | Config key |
|---|---|---|
| Period | UTC weeks from Monday 00:00 UTC | `period.kind` |
| Leaderboard points | Fish kept × 1 | `period.pointsPerFish` |
| Level points | ~~10 per board size, × 2 on Hard, plus 10 per perfect win in a row (up to 10)~~ 2c.1: the user's rule (not a default any more): 576 for the first cat in a row, +96 per further cat in the run | `levelPoints.firstIncrement`, `levelPoints.step` |
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

> **Replaced at 2c.1 (2026-10-10):** the `final-*.png` files listed below were the 2c set; they showed the 2c pills row (no points counter), "Perfect ×N" and the Perfect streak records row, so they were deleted and the folder now holds the **2c.1 set (§10.7)**. The 2c set stays in git history at `23cc250`. The table is kept as the record of what was checked at 2c.

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
| Scoring and save (§3.1 table, streak breaks at once, UTC rollover, v3 migration with one-time compensation) | done; G1 unit tests (`scoring`, `save-v3`, `streak-session`, `purchases`). **2c.1:** the perfect streak is retired; `streak-session.spec` was replaced by `points-session.spec` and `reducer-points.spec` (§10) |
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

---

## 10. Phase 2c.1: level points per cat (2026-10-10)

Status: **built and integrated** · Spec: [fish-lives-spec §0.1 F5, §3.1–§3.2, §10](fish-lives-spec.md) · APIs: [fish-lives-spec §10.10](fish-lives-spec.md) and [CONTRACTS §13](../phase2b/CONTRACTS.md) · Base `23cc250` (2c) · Built by G1 (game and app logic) and G2 (UI, art, i18n); integrated by the lead.

The user gave the **exact level-points rule** first-hand (Play Store Meowdoku, 2026-10-10). It replaces 2c's per-win formula and its cross-level "Perfect ×N" streak:

- Level points belong to **one level**; every level and every Retry start at **0**.
- Each correct cat adds **96 × (5 + s)**, s = correct cats in a row since the start or the last mistake: 576, 672, 768, …; an unbroken run totals 576, 1 248, 2 016, 2 880, 3 840, 4 896, 6 048, 7 296, 8 640, 10 080.
- A mistake takes nothing away; it resets the run, so the next cat adds 576 again.
- Hint and kitty (paw) cats count exactly like the player's.
- The total shows **during play** and **at the win**.
- The weekly leaderboard is unchanged: the fish left at a win (F2).

Config: `levelPoints.firstIncrement` = 576, `levelPoints.step` = 96 (`src/app/config.ts`); the 2c keys `perSize`, `hardMultiplier`, `streakStep`, `streakCap` are `@deprecated` and unread.

### 10.1 What a player sees now

| Area | Phase 2c | Phase 2c.1 |
|---|---|---|
| Level points | Per counted win: `10 × n` (× 2 Hard) + a perfect-streak bonus | Per correct cat inside the level, 96 × (5 + s); 0 at every level and Retry |
| During play | Nothing | A **points counter** centred in the pills row (our sparkle `icon-points`, "0" at the start). Each scoring cat rolls it up, bumps the icon and shows a small rising "+576" chip. A mistake shows nothing on it. Hidden in the tutorial |
| Win flow | The period counter appears centred | The points counter stays with the level's total, highlighted (`[data-final]`), until the scrim; the period counter appears **in the cat counter's place**. Times unchanged (4.2 / 4.35 / 4.5 s) |
| Victory | "+120 points" and "Perfect ×4" | "**10,080 points**" (the level's total, counted or not) above the kept-fish row; no streak chip |
| Records (web, period board) | This week · best week · Perfect streak · Levels solved | This week · best week · **Total points** · Levels solved |
| Screen reader | — | The running total is appended to the cat's own line, one utterance: "Cat placed. 3 of 10. 2,016 points." |
| Save | v3 with `streak` | Still v3; three optional slot fields (`points`, `catStreak`, `scoredRows`); `streak` frozen |
| Analytics | `win_points.streak` | `win_points { mode, fish, total, points, run }` |

Decisions the user did not cover (spec §10.12): **[DECISION] D15:** removing a placed cat (a double-tap on it) changes neither the points nor the run: it cannot be a wrong cat, so it is not a mistake, and points are never taken back. **D16:** putting a cat back in a row that already scored adds nothing, so remove and re-place cannot farm points. D17: dailies and events score the same way; the tutorial does not. D18: givens never score.

### 10.2 Integration: every request and gap, and what happened

| # | From | Request or gap | Outcome |
|---|---|---|---|
| P1 | G1 | `tests/e2e/fbig.spec.ts` "no leaderboard API" still expected "Perfect streak" | **Done.** It now expects "Total points" and asserts no "Perfect" text in the records card |
| P2, R7 | G1, G2 | `dev/**`: drop `streak` from the victory and records fixtures, level totals, `points` on the game view, a POINTS demo, `icon-points` in the icon lists | **Done.** `shell-fixtures.ts gameView` derives `points` as a restore would (`runTotal(k)` without mistakes, k × 576 with them, null in the tutorial). `b-harness.ts`: a new `game-points` view (+672, +768, a mistake, then +576); the victories use level totals (`levelTotal(n, mistakes)`) and their game screens show the same total; no `streak` anywhere. Opened in the dev server: `game-points` ends at "2,592", the victories and the records card render, no console error. `board-harness.ts` passes the real reducer's `levelPoints` to the pills. `icon-points` added to the art and board harness icon lists. `tsc` is clean in `dev/**` |
| P3 | G1 → G2 | `visual.spec` / `i18n.spec` tested the retired chip | Already done by G2 (both assert no `.victory__streak`). The lead only fixed a stale comment in `visual.spec` |
| P4, R8 | G1, G2 | I-3: delete `VictoryProps.streak` and `PersonalRecordsView.streak`; make `GameView.points` and `PillsProps.points` required (`number \| null`) | **Done.** No G1 change was needed. Test fixtures that build a `GameView` or `PillsProps` (`screens`, `screens-2b`, `review2b-fixes`, `pills`) now pass `points: null`. The stale-prop cases in `victory-ranking.spec` hand in `streak` through a cast and still check it is ignored (the main victory test now passes one too). `ranking-flow.spec` dropped its `streak` record |
| P5, R6 | G1, G2 | The FBIG main JS and first-load totals were over budget | **Lead decision L7** (§10.4): those three ceilings raised to measured + about 3 % |
| P6 | G1 | `restoreGame` check (c) uses the tighter upper bound `runTotal(k − s) + runTotal(s)` | **Accepted** (L8). Recorded in spec §3.2.3 and D20 |
| P7 | G1 | `streak-session.spec` replaced by `points-session.spec`; new `reducer-points.spec` | **Noted** in §9 above |
| P8 | G1 | An invalid slot points field is a repair (`save_corrupt` 'local_fields'); a slot merely without the fields is not | **Accepted** as specified (§3.2.3 "Read") |
| N1 | G2 | Arabic at 320 px on a Hard level: "المستوى 310" was cut to "المستوى …", hiding the level number | **Fixed** (L9). `splitTitle` also puts a trailing level number in the non-shrinking suffix when the title has no " · ". At 320 px the title now reads "المست… 310" beside "صعب" (`final-ar-320-title-310.png`; Russian "Уров… 310" too). New unit cases and a new `i18n.spec` test (web-320) |
| Ownership | G1 note | G2 edited `scripts/palette-check.ts` (three contrast rows) | **Accepted**: the rows are correct and `palette:check` passes |
| Gap | G1, G2 | Neither workstream ran `fbig.spec.ts` or re-verified on the shared tree | **Done**: full Playwright runs below (fbig-390 included) |
| Gap | lead | `docs/phase2c/screenshots/points-*.png` are G2's pre-integration captures; `points-hud-ar-320.png` shows the N1 truncation | Kept as G2's record; the final set (§10.7) shows the fix |

Also at I-5: spec status line, §3.2.3 and D20 (P6); [CONTRACTS §13](../phase2b/CONTRACTS.md) (and pointers in §12); [02](../phase1/02-rebuild-spec.md) (status, S2 HUD, §10 victory, §15 save); [04](../phase1/04-architecture.md) (§4.3 slot fields, §9 budget); [01](../phase1/01-game-deconstruction.md) and [differences-vs-original](../phase2/differences-vs-original.md) ("built"); the [parity-spec](../phase2b/parity-spec.md) banner and the §2.5 / §5.3 pointers; [provenance §10](../provenance.md) integration note; the request files (pointer here).

### 10.3 Verification (final tree, 2026-10-10)

| Check | Result |
|---|---|
| `npx tsc --noEmit` (incl. `dev/**`) | clean |
| `npx vitest run` | **2 175 passed, 0 failed, 110 files** (2c final: 2 069 in 109) |
| `npm run levels:verify` | 10 level packs, 27 daily months, 3 event packs, 0 issues |
| `npm run palette:check` | OK |
| `npm run i18n:check` (and `--release`) | OK: 17 catalogues, release `en`; 1 warning (the Italian title length, §2 #17) |
| `npm run build`, `build:fbig`, `build:e2e`, `build:fbig-e2e`, `build:release` | all build, no warnings |
| `npx tsx scripts/size-check.ts` | within budget on `dist/web`, `dist/fbig`, `dist/release-web`, `dist/release-fbig` **after L7** (§10.4); before it, FBIG and release-FBIG were over on main JS and the first-load totals |
| `npm run zip:fbig` (and `zip:fbig:preview`) | release zip **292.2 KB, 61 files**, locales `en` (the expected warnings for the four empty `VITE_FB_*` ids); preview zip 390.0 KB, 77 files |
| `npx playwright test` (4 projects, no retries) | **two consecutive full runs on the final tree, each 172 passed, 0 failed, 23 skipped by design, 0 flaky** (`web-390` 76 + 10 skipped, `web-320` 42 + 6, `web-1280` 20 + 7, `fbig-390` 34 + 0; about 7.2 min each with 2 workers). A preliminary full run earlier the same day, on the same `src/**` before the N1 e2e test was added, was green too (171 passed, 22 skipped). The 23 skips are the project-scoped skips declared in the specs. `visual.spec` wrote its captures to a scratch folder (`VISUAL_OUT`), so G2's committed sets are unchanged |
| Play checks in the built app | 13 / 13 (§10.6) |
| Leftover wording | §10.8 |

### 10.4 Bundle sizes and lead decision L7 (KB, 1 KB = 1 000 bytes)

| Row | web | FBIG | release-web | release-FBIG | Ceiling |
|---|---|---|---|---|---|
| Main JS | 265.9 | 280.6 | 264.7 | 279.4 | **289** (was 279) |
| CSS (first load) | 43.5 | 43.5 | 43.5 | 43.5 | 43.5 |
| First-load total | 326.6 | 341.3 | 325.4 | 340.1 | **350** (was 340) |
| First load + 1 locale | 352.6 | 367.2 | — | — | **377** (was 365) |
| First load (gzip) | 121.0 | 126.1 | 120.6 | 125.7 | 126.5 |
| Lazy JS, core | 70.5 | 70.3 | 70.5 | 70.3 | 74 |
| Lazy JS, optional | 15.4 | 29.1 | 15.4 | 29.1 | 29.3 |
| Lazy CSS | 29.8 | 29.8 | 29.8 | 29.8 | 31.2 |
| Locale chunk (largest) | 25.9 | 25.9 | — | — | 28 |
| FB files | — | 77 | — | 61 | 100 |

**L7 (budget).** 2c.1 grew the FBIG main JS from 278.2 KB (the 2c tree with the 2c.1 config) to 280.6 KB: G1 +0.6 KB (the reducer fields, the slot fields and their restore checks, the POINTS announcement), G2 +1.7 KB (the counter with its roll, chip, cell swap and tight fallback; `icon-points` 0.3 KB; the 2c.1 strings), net of the deleted per-win formula, perfect streak, streak chip and their strings; the N1 split adds about 0.1 KB. The first-load CSS grew 41.9 → 43.45 KB. Both workstreams had already trimmed (one counter builder shared with the period pill, the points pill on the `.pill` base rule, shorter selectors and motion data). A further 1.6 KB cut would need a structural change (for example moving the How to play and tutorial English strings out of the main bundle), which is not worth its risk at integration. So, as the task and 04 §9 allow, only the three rows that were over moved, each to the measured maximum + about 3 %: main JS 279 → 289 KB, first-load total 340 → 350 KB (2.6 %, kept below the sum of its rows' ceilings so it still binds), first load + 1 locale 365 → 377 KB (2.7 %). Recorded in `scripts/size-check.ts`, `tests/unit/platform/scripts.spec.ts` (the boundary tests now follow the ceiling constants) and [04 §9](../phase1/04-architecture.md). Load time was **not re-measured**. By the 2b method (STATUS-2b §4) the FBIG first run on Slow 4G uncompressed took 4.25 s at a 331 KB first load; the 10 KB added since then is about 0.06 s of transfer at 1.44 Mbit/s, so an estimated 4.3 s, still under the about 4.5 s Load time gate (STATUS-2b §8), which is re-measured before each upload.

**Rows within but tight (unchanged on purpose):** first-load CSS 43.45 / 43.5 KB (49 B left), first load gzip 126.1 / 126.5 KB, optional lazy JS 29.1 / 29.3 KB. The next change that adds to any of them needs a reduction first or another recorded lead decision.

### 10.5 Lead decisions at 2c.1 integration

| # | Decision | Why |
|---|---|---|
| L7 | Main JS 289 KB, first load 350 KB, + 1 locale 377 KB | §10.4 |
| L8 | Accept G1's tighter restore bound (P6) | It only rejects totals no sequence of cats can produce; a rejected slot is derived, never inflated (D20's intent) |
| L9 | N1: `splitTitle` keeps a trailing level number visible | The level number is the one part of a level title a player needs; the name may shrink, as for event and daily titles (I18N-TEXT-2) |
| L10 | The 2c `final-*.png` set was deleted and replaced by the 2c.1 set | The task asked to replace the older ones; the 2c images showed the retired streak chip and the 2c pills row. They stay in git history (`23cc250`) |
| L11 | `PillsProps.points` / `GameView.points` required (`number \| null`); test fixtures pass `null`; stale `streak` props are tested through casts | Spec §10.9 I-3; the same pattern as the 2c I-3 deletions |

### 10.6 Play checks in the built e2e app (`dist/e2e`, Chromium, 390 × 844, touch)

Driven by a lead script through real double taps, the bulb and the paw (the `__mewdoku` hooks only read state and seed the save). Every row checks the HUD text (`.points-pill__n`), its accessible name and `GameState.levelPoints` / `catStreak`.

| # | Check | Result |
|---|---|---|
| A | Level 66 (10 × 10), no mistakes: the HUD after each cat | **576, 1,248, 2,016, 2,880, 3,840, 4,896, 6,048, 7,296, 8,640, 10,080** (run 1…10); "0" before the first cat; the winning cat leaves "10,080" with `[data-final]`; the victory reads "10,080 points"; `points.total` grew by 10 080 |
| B | A mistake after cat 3 | 576, 1,248, 2,016 → mistake: **2,016** (run 0, 2 fish) → next cat **2,592 (+576)** → 3,264 (+672) |
| C | A kitty cat and a hint cat | C (576) → kitty **1,248 (+672, run 2)** → hint Apply that placed a cat (the 5th hint; the first four only crossed out tiles) **2,016 (+768, run 3)** → player cat 2,880 (+864, run 4) |
| D | Reload mid-level after C C M C | Before: 1,824, run 1. After the reload and "Continue": **1,824, run 1**, the same scored rows and 2 fish; the next cat **2,496 (+672, run 2)**; Home and back again: 2,496, run 2 |
| E | Reload after three clean cats | Resumes 2,016, run 3; the next cat 2,880 (+864) |
| — | A win after a mistake after cat 4 (10 × 10) | Victory "7,776 points" (2 880 + 4 896) with 2 fish kept (`final-victory-mistake.png`) |
| — | German and Arabic, level 50 (Hard, 10 × 10), C C C M + 7 cats | "8.064 Punkte" / "8,064 نقطة" (2 016 + 6 048) |

### 10.7 Screenshots (`docs/phase2c/screenshots/final-*.png`)

Captured by the lead from the **built** e2e app (`dist/e2e`). 390 × 844 for the main set, 320 × 568 for German and Arabic; scale factor 2. The save is a returning player at level 66 (50 for de / ar) with 39 fish this week. Every image was looked at.

| File | Shows | Checked |
|---|---|---|
| `final-points-hud.png` | Mid-level, five cats in a row: "5 / 10", the counter "3,840" centred, 3 fish; the previous "+960" chip fading | ✓ |
| `final-points-plus.png` | The sixth cat: "+1,056" rising from the pill's top edge, clear of "Level 66"; "4,896" | ✓ |
| `final-winflow-a.png` | The winning cat: "+1,440", "10,080" highlighted, "10 / 10" complete | ✓ |
| `final-winflow-b.png` | t ≈ 1.3 s: the period counter ("39") in the cat counter's place; the last fish lifting off; "10,080" stays | ✓ |
| `final-winflow-c.png` | t ≈ 2.1 s: the three kept fish in flight on their arc over the top bar to the trophy counter; the lives pill shows three outlines | ✓ |
| `final-winflow-d.png` | t ≈ 3.0 s: "42" with "+3"; three empty outlines; "10,080" still on screen | ✓ |
| `final-ranking.png` | Web records: This week 42 fish · Your best week 42 fish · **Total points 10,080** · Levels solved; the honest local-only line | ✓ |
| `final-victory.png` | "Nailed it!", "Level 66 complete", **"10,080 points"** with the sparkle, then 3 fish "+3" · "This week: 42"; no streak chip | ✓ |
| `final-victory-mistake.png` | "7,776 points"; 2 fish and 1 outline, "+2" · "This week: 41" | ✓ |
| `final-fail.png` | "Out of fish" after C C M M M: Continue "+1" fish, Retry, Home; the counter keeps "1,248" behind the scrim | ✓ |
| `final-de-320-hud.png`, `final-ar-320-hud.png` | Level 50 Hard at 320 px after C C C M C C C: "6 / 10", "4.032" / "4,032", 2 fish and an outline; Arabic mirrored (lives at the left, cats at the right), the title "المستوى 50" with "صعب" | ✓ |
| `final-de-320-plus.png`, `final-ar-320-plus.png` | "+864" rising, "4.896" / "4,896"; no overlap with the title or the badge | ✓ |
| `final-de-320-winflow.png`, `final-ar-320-winflow.png` | The period counter ("39") in the cat counter's cell (at the right in Arabic), "8.064" / "8,064" highlighted, the fish lifting off | ✓ |
| `final-de-320-victory.png`, `final-ar-320-victory.png` | "8.064 Punkte" / "8,064 نقطة", the kept-fish row "+2" · "Diese Woche: 41" / "هذا الأسبوع: 41"; everything fits at 320 px | ✓ |
| `final-ar-320-title-310.png` | N1: level 310 (Hard) in Arabic at 320 px: "المست… 310" beside "صعب"; the level number visible | ✓ |

No regression was found in these captures. G2's review captures (`points-*.png`) and the 2c sets (`G2-*.png`) stay alongside.

### 10.8 Leftover "heart", fish-currency and "Perfect ×N" wording

- **Built bundles** (the final `dist/web`, `dist/fbig`, `dist/e2e`, `dist/release-web`, `dist/release-fbig`; every JS, CSS, HTML and JSON file except level and daily data; the same 12 identifier hits in each): "heart" appears only as identifiers: `heart_last`, `game.hearts.a11y` / `howto.hearts` key names, the `hearts` state and validation fields, `glyph.9`'s English value "heart" (the colour-pattern glyph, spec §0.5) and the `@deprecated` config keys `heartBreakMs` / `heartCrackMs`. Fish-pack ids appear only in config (`iap.products` `@deprecated`, `iap.retired` for compensation); `wallet` only in the v2 → v3 migration. "swap" only as the CSS `font-display: swap`. **No** "Perfect ×", `victory__streak`, `victory.streak`, `rank.records.streak`, "Perfect streak", "Not enough fish", coins or golden fish anywhere.
- **All 17 catalogues, every value**, scanned in each language's own word for heart: only `glyph.9` and `event.yarn.name` ("Yarn Hearts"). No English value uses a currency word or the retired streak; the removed 2c.1 keys are absent from every catalogue.

### 10.9 Open items

| Item | State |
|---|---|
| Translations | The 2c.1 lines of the 16 catalogues are unreviewed AI drafts (G2, `docs/i18n/review-log.md` "Phase 2c.1"); the release ships English only |
| Bundle headroom | First-load CSS 49 B, gzip 0.4 KB, optional lazy JS 0.2 KB (§10.4); the load time on Slow 4G is estimated, not re-measured (§10.4) |
| User questions | What removing a cat does in the original (we chose D15/D16), whether dailies and events score there (D17), and how the original draws its running total (ours is our own design) |
| 2c items | §8 above is unchanged (Meta dashboard, two trophies on FB Home, 2b gates) |

### 10.10 Acceptance (spec §10.11)

| Group | State |
|---|---|
| Rule | done: the user's table and 11 616 / 13 248 (`scoring.spec`), the mistake-reset sequence and C H K C (`reducer-points.spec`), and the same numbers in the built app (§10.6) |
| Save | done: a reload restores 1 824 / run 1 and the next cat adds 672 (unit, e2e `smoke`, §10.6 D); a pre-2c.1 slot derives; `v: 3`; `save.streak` never written (`winflow`, `events` e2e) |
| HUD and win | done: three disjoint pills with "11 / 12" and a 5-digit total at 320 / 390 / 1280 and in de / fr / ar (`layout`, `visual`, `i18n` e2e); win-flow times unchanged (`winflow`); victory and records (§10.7) |
| Screen reader | done: one utterance per cat ending with the running total (`points-session.spec`) |
| Data, copy, hygiene | done: `win_points { …, points, run }`; 6 new / 3 changed / 6 removed keys, `i18n:check` 0 errors; §10.3 gates; provenance §10; screenshots looked at |
