# Phase 2e status: the worldwide ranking, ads, purchases in play, the daily streak and the daily challenge

Status: **built, integrated and audited** (I-1 … I-6, then the audit fix round of §10.1, 2026-10-11) on `claude/mewdoku-instant`. Every gate inside our environment is green after the last change (types, 2 973 unit tests, 190 server tests, the i18n / palette / level checks, all six builds within budget with the bundle checks, both zips, two consecutive full Playwright runs of 312 tests with no retry, the look and helper comparisons, a first run taking input at 4.26 s; §4, §5). The two audits' 26 findings are all fixed (§10.1); what remains is outside our environment (the release gates of §8, which need your accounts and a phone; the first one is the probe, §7) or a product call (§10.2). **2026-10-12:** the post-win and Home-chip fixes (`afc67c8`) and computer rivals in the rankings (your decision U-e, D-2e-24; off in code, on only with the server variable `RIVALS=on`) were added after this; see §13.

Spec: [spec.md](spec.md) (the decision record §0, the server §1, the game §2–§6, cross-cutting §7, the deployment guide §11) · Interfaces: [CONTRACTS.md](CONTRACTS.md) (final; §14 lists what changed at integration) · Requests: [G1](requests-G1.md), [G2](requests-G2.md), [G3](requests-G3.md), [G4](requests-G4.md) (all closed) · Provenance: [provenance.md](../provenance.md) §13.

Your request (2026-10-11): "1) Leaderboards - same as in Meowdoku 2) Video Ads - Banner during level (always there), Interstitial (after every level starting after level some later level - same as in Meowdoku, Rewarded Video (when out of helpers during play) 3) InAppPurchases - option to buy helpers during play 4) Daily Streak - same as in meowdoku 5) Daily Challenge same as in Meowdoku", with your four answers: **own worldwide server** (U-a), **banner always during levels** (U-b), **iOS purchases on once confirmed** (U-c), **current packs** (U-d).

## 1. What was built

| Your ask | What a player sees now | Where |
|---|---|---|
| **1. Leaderboards** — real players (2026-10-12: plus disclosed computer players once `RIVALS=on`, §13), our own worldwide server | After every scored win the ranking panel shows **my daily ranking**: up to 50 real players who started around the same time (a rolling 24 h bracket), each row a place, a picture, a generated name and the fish they kept; my row is highlighted and "+2 waiting" while a win is still on its way. A bracket that is not full shows only the players in it (one player alone reads "You're the only player in this ranking."): **never bots, never invented players or counts**. *(2026-10-12, §13: with the server variable `RIVALS=on`, new brackets also show computer players in the places no real player took, counted in "N players" and disclosed by "Rankings include computer players."; they are never stored as players and never paid. Off in code; staging has it on, production off until the rollout.)* When a ranking ends, a result card: 1st place 2 hints + 2 kitties (×2 for a video), 2nd 1 + 1, 3rd 1 hint, if at least 5 players took part. Hearts are cheers (one per row). Home's ranking chip ("#5 · 28") opens the ranking sheet (list, how it works, my records). Settings → "Daily ranking": the name (picked from our word lists, with our 12 cat pictures), "Show me in rankings", "Delete my ranking data", the player code. Offline: the last answer marked "Last updated hh:mm" (my total stays the server's, queued fish show as "+2 waiting"), or my own records. Web-prod: personal records only (no server) | `server/` (Cloudflare Worker + D1; a Node dev server for local work and e2e), `src/shared/rank-api*.ts`, `src/app/ladder-*.ts`, `src/game/ladder*.ts`, `src/ui/overlays/{bracket-list,ladder-sheet,ladder-result,nickname-sheet,ranking-panel}.ts`, `src/ui/hud/ladder-chip.ts` |
| **2. Video ads** | **Banner** at the bottom during play on FB from level 10's board, hidden under the hint card and back after every hide within Meta's 46 s window, until Meta stops serving banners on 2027-03-31; also on Home, the victory and the event screens. **Interstitial** after every level from level 10, at most one per 30 s, also on every 2nd Retry and the fail card's Home, never in the tutorial or the first 60 s. **Rewarded video** when a helper is out (the out-of-helpers card first), with one placement per helper; the mouse always costs a video | `src/game/ad-pacing.ts`, `src/app/banner-flow.ts`, `src/platform/fb/fb-ads.ts`, `fb-banner.ts` |
| **3. Purchases in play** | The out-of-hints card offers "Buy 15 hints · $1.99" and "Buy No Ads · $3.99" next to "Watch video"; the out-of-kitties card "Buy 8 kitties" and No Ads; the mouse card the video only (no product gives a mouse). One helper is used at once after buying; the timer pauses during FB's purchase dialog. **Consume first** with an intent ledger: a paid purchase is delivered exactly once whatever crashes when. **iOS purchases are built and off** until you confirm (the remote switch `iapIos`, §6) | `src/app/shop-flow.ts`, `helper-flows.ts`, `src/game/purchases.ts`, `src/ui/overlays/rewarded-prompt.ts` |
| **4. Daily streak** | Any win counts the day; a 7-day cycle of paw steps on a Home strip and on the day's first victory; day 7 pays 2 hints + 2 kitties (a chest); a missed day starts a new streak, calmly ("A new streak starts today."), no urgency, no reminders | `src/game/day-streak.ts`, `src/ui/hud/streak-strip.ts`, `victory-screen.ts` |
| **5. Daily challenge** | Unlocks after level 21 (an earlier unlock is kept), one puzzle per local day, its fish count in the ranking and for the streak | `src/game/progression.ts`, `home-screen.ts` |

Also new: save v4 (the ranking queue, the streak, the purchase ledger), remote switches served by our server (`iapIos`, `iapInPlay`, `banner`, `bannerInPlay`, `ladder`: turn things off without a release), the rankings hub and the FB weekly board retired (the chip and the sheet replace them), the probe bundle for the first real-device check (§7).

## 2. Integration (lead)

| Step | What happened |
|---|---|
| L0, L0b | Config keys and env; `playwright.config.ts` starts the ranking dev server (`npm --prefix server run dev:node -- --port 8787`) as a `webServer`; both e2e builds get `VITE_LADDER_URL`, the web twin `VITE_LADDER_WEB=anon`; one shared e2e FB test secret (`E2E_FB_APP_SECRET`) |
| I-1 dev harnesses | The four `dev/*-harness` pages take the new props (the chip, the strip, the O2 Buy rows, the Settings rows, the victory's streak row); new `dev/ladder-harness.html` renders 36 ranking states, the bracket views from G4's golden contract fixtures (requests-G3 R14) |
| I-2 requests | All closed (§3); the **L1 flips** in `config.ts` (spec §7.2.2): `daily.unlockAfterLevel` 21, `ads.banner.fromCompletedLevels` 9, `ads.banner.minReloadSec` 46, `ads.interstitial.cooldownSec` `[{fromDay: 0, sec: 30}]`, `ads.reloadDelaysMs` `[30 s, 60 s, 120 s]`, `iap.grantBeforeConsume` false, each pinned by a test |
| I-3 required members, deletions | Required: `Capabilities.paymentsIos`, `RewardedPromptProps.buy` / `onBuy`, `VictoryProps.streak` / `dailyReward`, `HomeView.ladder` / `streak` (nullable), `HomeCallbacks.onLadder`, `RankingPanelProps.onHeart` / `onInfo`, `PacingInput.retryIndex` and `BannerGateInput.today` (nullable). Deleted: the rankings hub (`rank-hub.ts`, `rank-hub-flow.ts`, `rank_hub`), `HomeView.showTrophy`, `HomeCallbacks.onTrophy`, the Home trophy, and every fake's members for them; the event Top list moved to `src/app/event-top-flow.ts` |
| I-4 load time and budgets | §4 |
| Release checks | `scripts/release-check.ts` (spec §10.5 #1, §10.6 #3 and #6): no test data in any bundle; a release bundle carries no e2e hooks, dev routes, e2e ids, or URL on a staging, `workers.dev` or local host; run by `npm run size` on every dist and by `zip:fbig`. `npm run i18n:check` also fails on dishonest English (`honestyProblems`, §10.6 #4) |
| The probe | `npm run probe -- --url <staging>` (§7) |
| I-5 docs | This file; [CONTRACTS](CONTRACTS.md) final (§14); [provenance](../provenance.md) §13 (G2's and G3's drafts merged); spec §1, §2.7, §2.10, §2.12, §10.3 #12, §11 synced with what was built; [01](../phase1/01-game-deconstruction.md) (your words of 2026-10-11 as first-hand), [02](../phase1/02-rebuild-spec.md), [04](../phase1/04-architecture.md) (the `shared` layer, `server/`, save v4 and its forward-compatibility note, §9 budgets), [05](../phase1/05-fbig-platform.md), [06](../phase1/06-legal-and-originality.md) (§8 privacy), [differences-vs-original](../phase2/differences-vs-original.md), [gap-analysis](gap-analysis.md) (superseded); [fb-dashboard](../phase2b/fb-dashboard.md) §9 (G1's rows) |
| I-6 acceptance | §5 |

## 3. Requests closed (I-2; each row is marked in its file)

| Request | Resolution |
|---|---|
| G1 R1, R2 (the counter's `'ladder'` kind; Settings without a player) | Done by G3 |
| G1 R3 / G4 (a re-created player keeps its old name) | Lead: the server seeds the generated name with the key and the creation time; `ops.spec.ts` checks it |
| G1 R4 / G4 R2 (L0b) | Lead: `playwright.config.ts` |
| G1 R5 (the L1 flips) | Lead: `config.ts`, pinned in `sanity.spec.ts`; the old mechanisms stay tested through `mergeConfig` |
| G1 R6, G3 R10 (CONTRACTS) | Lead: CONTRACTS §14 |
| G1 R7 (spec §10.3 #12, §2.7) | Lead: reworded |
| G1 R9, G3 R18 (the response parsers in the first load) | Lead: `src/shared/rank-api-parse.ts` (main JS −6.8 KB) |
| G2 R4 (the streak art in the first-load sprite) | Lead (I-4): it moved with the strip into the overlay chunk (`src/ui/art/streak-art.ts`) |
| G2 R5 (palette-2e for the CLI) | Lead: `layering.spec.ts` allows it; `palette:check` enforces the medal rows |
| G3 R12 (the heart rule in `sanity.spec.ts`) | Lead: the cheer keys exempted, pinned to their 8 keys |
| G3 R13, R19 (size rows) | Lead (I-4): §4 |
| G3 R14 (a ranking harness) | Lead (I-1): `dev/ladder-harness.ts` |
| G3 R16 (a fresh answer shown as stale) | Lead: `ladder-flow.ts` keeps "fresh" until a refresh or a submit fails or the `offline` event fires; unit test |
| G3 R17 (e2e for the ranking captures; de / ar) | Lead (L0b); the de / ar ranking checks stay in `visual.spec.ts` |
| G4 R3, R4 (spec §11 commands, spec §1 sync) | Lead (I-5) |

## 4. Load time and budgets (I-4)

### 4.1 Method

The 2b method (STATUS-2b §4): the FBIG e2e twin built with `VITE_LADDER_URL=http://127.0.0.1:8787` and the local ranking server running, served uncompressed (`Accept-Encoding: identity`) by `vite preview`, the FB SDK replaced by our stub (routed, so **its download is not counted**), Chromium with the cache disabled, CPU 4× slower, DevTools' Slow 4G (562.5 ms, 1.44 Mbit/s), a 390 × 844 phone. Median of 3 runs, on one machine, the same day. Two milestones for a first run since the audit (A-L1): **board shown** (the tutorial board and the coach's card on screen) and **accepts input** (the game status `playing`: taps count; the 4.5 s requirement is read against this one). A returning player: Home with an enabled Play.

### 4.2 Results

| Build | First run: board shown | First run: accepts input | Returning player | First-load bytes (8 requests) |
|---|---|---|---|---|
| Pre-2e (`3389380`, the 2d.1 final tree) | 3.67 s | — | 3.55 s | 426 KB |
| 2e as built (start of I-4) | 4.00 s | — | 3.85 s | 479 KB |
| 2e after I-4 (as reported at I-6) | 3.85 s | not measured (the audit: 4.48–4.53 s) | 3.71 s | 451 KB |
| Audit fix round, before the START fix | 3.92 s | **4.54 s** (4.56 / 4.54 / 4.52): over 4.5 s | 3.78 s | 451.5 KB |
| **Audit fix round, final** | **3.94 s** (3.93 / 3.98 / 3.94) | **4.26 s** (4.26 / 4.41 / 4.24; an earlier set the same hour 4.21) | **3.71 s** (3.70 / 3.71 / 4.54) | 451.6 KB |

The I-6 report's 3.85 s was the moment the board and the coach appeared; taps counted only after the 700 ms entry wave, so measured to "accepts input" the first run was at the 4.5 s ceiling (audit A-L1). The session now starts the board when its own wave ends (`BoardView.playEntry()` returns `entryEndMs(n)`: 408 ms on the 4 × 4 tutorial board; `board-types.ts` always said so) instead of after the fixed 700 ms: **the first run takes input at 4.26 s**, ≈ 0.25 s inside the requirement (the FB SDK download is on top on a real phone). The board-shown milestone is unchanged by the audit fixes (3.90–3.94 s); what is left of the difference to pre-2e is the 2e code a first screen or a win needs (§4.3), and the next cuts are structural (§10.2).

### 4.3 What went lazy, and what the first load still carries

Moved out of the first load (FBIG e2e main JS 374.9 → 349.5 KB, first-load CSS 51.1 → 49.1 KB):

- the ranking API's **response parsers** (`src/shared/rank-api-parse.ts`, 6.8 KB) into the `ladder-boot` chunk;
- the ladder's **sign-in, sync and remote-config code** (`startLadder` in `src/app/ladder-boot.ts`);
- the **rankings hub** (deleted at I-3);
- Home's **ranking chip and streak strip**, their art (`streak-art.ts`) and their rules, into the overlay chunk (spec §7.9's rule): until it lands (right after the first screen) Home shows the period pill and keeps the strip's row reserved (invisible), so nothing jumps;
- every **English string only lazy chunks show** (all phases' — the overlays, the ranking views, the event screen, Settings, How to play, the shop, the fx labels), into one lazy `en-lazy` chunk (13 KB): `src/i18n/en-first.ts` is the first-load table, `src/i18n/en/lazy.ts` the rest, moved verbatim; which key is where is computed by `scripts/i18n-split.ts` from the static imports, and a unit test (`first-load-strings.spec.ts`) and an e2e watcher (six specs) fail if a screen ever asks for a string no loaded table has.

Still in the first load, and why: the streak engine (a win counts the day at once), the win queue and its checks (`rank-api.ts`'s validators: a win is queued in the save at the moment of `WON`, even offline), save v4 (migration and merge), the shop's consume-first ledger and boot restore (a paid purchase must be delivered at boot), the banner and ad pacing, the views and the 2e strings Home and the game screen show.

### 4.4 Budgets (KB, 1 KB = 1 000 bytes; the largest build per row; ceilings = measured + about 3 %, 04 §9)

| Row | Ceiling (was) | Measured: web · FBIG · FBIG e2e (release-web · release-FBIG) |
|---|---|---|
| Main JS (entry + modulepreload chunks) | **360** (332) | 330.8 · 346.7 · **350.0** (329.6 · 345.5) |
| CSS (first load) | 49.3 | 49.1 everywhere |
| Font · `index.html` | 17 · 1.14 | 16.7 · 1.03–1.11 |
| **First-load total** | **427** (398) | 397.6 · 413.5 · **416.8** (396.4 · 412.3) |
| **First load + 1 locale** | **470** (429) | 437.7 · 453.6 · **456.9** |
| **First load, gzip** | **158** (148.5) | 146.7 · 152.0 · **153.6** (146.3 · 151.7) |
| Worker JS (lazy) | 18.5 | 18.1 |
| Locale chunk (each of 16) | **41.9** (29.3) | 40.2 (hi; 40.7 before the audit removed four keys) |
| Lazy JS: optional (`events`, `fb-social`, `social-flows`) | 29.3 | 13.3 · 27.1 |
| Lazy JS: fx chunk · board motion · lazy art | 15.3 · 3.8 · 4.4 | 14.9 · 3.7 · 4.3 |
| Lazy JS: ladder (`ladder-*`) | **30.5** (26, L0 placeholder) | 30.0 |
| Lazy JS: ladder boot (`ladder-boot-*`) | **34.9** (new) | 33.9 |
| Lazy JS: overlay chunk (`overlay-chunk-*`) | **56.2** (new) | 55.2 |
| Lazy JS: English strings (`en-lazy-*`) | **13.6** (new) | 12.9 |
| Lazy JS: core (the rest: hint card, RPC, sounds, generator, grader) | **23.3** (74, before the split) | 22.7 |
| Lazy CSS: fx chunk · board motion | 3.26 · 6.4 | 3.16 · 6.24 |
| Lazy CSS: ladder (`ladder-chunk-*`) | **11.05** (4, L0 placeholder) | 11.0 |
| Lazy CSS: overlay chunk | **33.5** (32 at I-4; raised at the audit fix round) | 32.5 (31.1 at I-4) |
| Lazy CSS: the rest (`events-chunk-*`) | **7.2** (34.6, before the split) | 7.0 |
| FB zip files · zips | 100 files; ≤ 1 MB | release 73 files · 366.4 KB; preview 89 files · 501.7 KB |

Measured after the audit fix round (all six dists within budget). The audit's layout fixes added 1.5 KB to the overlay chunk's stylesheet (the victory's fit step 4 and its transition-free measuring, the waiting line, the Settings name row below 360 px, the danger Delete, the day-7 open chest): its ceiling went 32 → 33.5 KB (measured + about 3 %), a lazy chunk; the first load grew 0.5 KB (`ladder.waiting` and the waiting total are first-load code). At I-4: new rows: the overlay chunk (JS, CSS), the ladder boot chunk and the lazy English strings; the ladder chunk's two L0 placeholder rows (the spec's estimates, 26 / 4 KB) re-set to measured; the core lazy rows re-set to what is left once the new rows split out. Recorded in `scripts/size-check.ts` (history comment), `tests/unit/platform/scripts.spec.ts` and 04 §9.

## 5. Verification (I-6, re-run after the audit fix round)

All on `claude/mewdoku-instant` with every audit fix in the tree, 2026-10-11 (Node 22, 4 CPUs). Every gate below was run after the last code change.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 144 files, **2 973 tests passed** (I-6: 2 969; the audit's new tests: `session-2d.spec` A-L1, `hud-2e.spec` B5, B6, B9, B15, `catalogs-2e.spec` A-H2, and the B4, B7, B10–B14 assertions in existing tests) |
| `npm --prefix server run verify` | typecheck (3 projects); 18 files, **190 tests passed** (I-6: 178; the audit's `audit-a.spec.ts` with A-S1 … A-S4 now plain tests, and A-S2, A-S5, A-S6, A-T1 tests in `pipeline`, `rules` and `ops`); `solutions:check` ok (levels ≤ L3000, dailies ≤ 2030-12-31, 3 events) |
| Revert checks (each fix reverted alone, its test run, the file restored by checksum) | A-S1, A-S2 (both guards), A-S3 (budget), A-S4 (both guards), A-S5 (both parts), A-S6, A-T1 (wins, flags), A-H2, A-L1, B1, B2/B8/A-C1, B3, B4, B5, B6, B12, B13, the reduced-motion fit: every one failed without its fix (§10.1) |
| `npm run i18n:check` (and `-- --release`) | OK, 17 catalogues, the honesty check clean on every English key and every draft (A-H2); 6 width warnings (§10.2 item 7) |
| `npm run palette:check` · `npm run levels:verify` | OK · 10 level packs, 27 daily months, 3 event packs, 0 issues |
| Builds | web, FBIG, e2e, FBIG e2e, release-web, release-FBIG: all built (the probe bundle is unchanged since I-6 and was not rebuilt) |
| `npm run size` on all six dists | **within budget** everywhere (§4.4; the overlay chunk's CSS ceiling raised 32 → 33.5 KB); bundle checks ok: no test data in any dist, the release rules clean on both release dists |
| `npm run zip:fbig` (+ `--preview`) | release 73 files · 366.4 KB; preview 89 files · 501.7 KB; the release bundle check ran before zipping |
| Load time (§4, median of 3) | first run: board shown 3.94 s, **accepts input 4.26 s**; returning player 3.71 s; 451.6 KB in 8 requests |
| Playwright, all four projects (web-390, web-320, web-1280, fbig-390), `--retries=0`, against the local ranking server started by the config | **run C: 312 passed, 0 failed, 0 flaky (16.4 min); run D, right after: 312 passed, 0 failed, 0 flaky (16.6 min)**. 100 skipped in each, all viewport-bound (`test.skip` on the other projects' sizes); no test skipped for any other reason. Before them: run A 309 / 3 failed (the e2e name checks compared the server's text with the display no-break space, B7: the specs now read it as a space) and run B 311 / 1 failed (a visual test measured a transient label between `count()` and `boundingBox()`: now measured once); neither was a product failure |
| `dev/look-compare.ts` · `dev/helpers-compare.ts` | 105 pass, 0 FAIL (19 info) · 105 pass, 0 FAIL (25 info, 10 design) |
| FINAL screenshots | 72 (§11): the 28 the fixes changed re-captured and 16 added; each looked at |

Each Playwright run re-writes the visual specs' review captures in `docs/phase2d/screenshots/` and `docs/phase2e/screenshots/` (`G2-*`, `G3-*`) and the compares write theirs in `docs/phase2d/screenshots/`; the changed PNGs in the tree outside `FINAL-*` are those captures (no assertion compares their bytes).

## 6. Provisional decisions (all built; each changes with its key, then a test update)

Everything "same as Meowdoku" that your words or a confirmed fact do not settle is provisional, because no recording of these features has arrived yet (the material list [ask-user](ask-user.md) M1–M11). The full register is spec §0.7; the ones you are most likely to want to change:

| What we built | Key(s) (`src/app/config.ts`; "srv" = `server/src/core/config.ts`, overridable without a release through the Worker variable `CONFIG_OVERRIDES`) | Settled by |
|---|---|---|
| Rolling 24 h brackets (a bracket opens at its first win, takes joiners for 2 h or until 50) | srv `bracket.periodMode` `'rolling'` (or `'utc_day'`), `bracket.durationMs`, `bracket.joinWindowMs`, `bracket.maxMembers` 50 | M1, M2, M11 |
| Rewards: 1st 2 + 2, 2nd 1 + 1, 3rd 1 hint; ×2 by video; only from 5 players; kept 7 days | srv `rewards.places`, `rewards.doubleByVideo`, `rewards.minMembers`, `rewards.claimTtlMs` | M2 |
| A result card for every finished ranking | `ladder.resultCard` | M2 |
| Hearts: one per row, my own once, at most 20 given, no reward | srv `hearts.*`, `ladder.heartsNotify` | M3 |
| Names from word lists, change once a day; 12 pictures | srv `nickname.*`; `AVATAR_COUNT` | M1 |
| Listed by default, Settings can switch it off; no notice before the first submit | `ladder.defaultListed`, `ladder.optOutAllowed`, `ladder.noticeFirst` (built, off) | G-SRV-3 |
| The banner from level 10's board, back within 46 s | `ads.banner.fromCompletedLevels` 9, `ads.banner.minReloadSec` 46, `ads.banner.screens`, `ads.banner.untilDate` | M4, M5 |
| An interstitial after every level from level 10, 30 s floor, no ad in the first 60 s, every 2nd Retry, on the fail card's Home | `ads.interstitial.minCompletedLevels` 10, `cooldownSec`, `sessionGraceSec` 60, `retryEveryN` 2, `triggers` | M4, M5, M6 |
| +1 helper per video, used at once; the card before the video; revive +1 fish once | `hints.perRewardedAd`, `kitty.perRewardedAd`, `ads.rewarded.promptFirst`, `revive.*` | M6, M7 |
| The out-of-helpers card offers the helper's pack, then No Ads (Q-U1: our caution — No Ads gives no helper) | `iap.o2Products` (remove `'remove_ads'` to take it off), `iap.useOneAfterBuy`, `iap.inPlay` | U-d, M7, M8 |
| iOS purchases off | `iap.iosEnabled` false; remote `iapIos` | G10 |
| The streak: any win counts, 7 days, day 7 = 2 + 2, a miss resets, no ×2, no freeze | `dayStreak.*` | M9 |
| The daily: unlock after level 21, no reward, no calendar, local midnight | `daily.unlockAfterLevel`, `daily.reward`, `daily.calendar`, `daily.dayStartHour` | M10, M11 |
| Personal records (web, fallback) weekly | `period.kind` | M1 |
| The anonymous web ranking stays off in production | `ladder.web`, srv `WEB_MODE` | — |
| Anti-cheat: per-size minimum solve times | srv `antiCheat.minSolveMs` | our telemetry |
| Computer rivals (2026-10-12, §13): strength 100 (a player at 15 wins a day takes the top 3 in about 65 % of brackets), both pools, the disclosure line on | srv `rivals.strength`, `rivals.pools`, `rivals.disclose` (`CONFIG_OVERRIDES`; new brackets only, except the line) | telemetry; your choice on the line (spec §12 Q-CP1) |
| Retention: wins and brackets 30 d, flags 90 d, inactive players 180 d | srv `retention.*` | G-LEGAL |

## 7. The probe (gates G-SRV-1 and G-SRV-2) — the first thing to do once staging is up

The probe is a tiny private Instant Game (no game in it) that checks, on a real phone, that the game can reach our ranking server from inside Facebook and that Facebook signs the player the way the server verifies. It shows six lines and never shows your player id, the signature or any token.

**Before it:** the staging server must be deployed (spec §11.1–§11.2: your Cloudflare account, then `npm --prefix server run deploy:staging`); its URL is `https://mewdoku-rank-staging.mewdoku-rank.workers.dev` (deployed 2026-10-11; see NEXT-SESSION.md). Staging already allows `https://*.apps.fbsbx.com` (where Instant Games run).

1. Build it: `npm run probe -- --url https://mewdoku-rank-staging.<your account>.workers.dev`. It prints the file it made: `dist-zip/mewdoku-rank-probe-<sha>.zip` (index.html and fbapp-config.json at the root, about 9 KB).
2. In the Meta App Dashboard → your game → Instant Games → **Web Hosting**: "Upload version", choose that zip, and when it shows as uploaded, **move it to Testing** (not Production). It does not replace your live game.
3. Open the testing build on each of the four surfaces, logged in as yourself (a tester of the app):
   - facebook.com in a desktop browser (the game's page → "Play" the testing version);
   - the Facebook app on an **Android** phone;
   - the Facebook app on an **iPhone**;
   - **messenger.com** in a desktop browser.
4. On each, wait for "N of 5 steps OK", tap **Copy results** (or take a screenshot) and send the four texts to us. "Run again" repeats the checks.
5. When done, move the probe build out of Testing (or upload the real game over it).

What the lines mean, and what we expect: **1 health, 2 config, 3 nonce** — the page reached our server (G-SRV-1); a "no response (network or CORS refused)" here means that surface blocks the call or sends an origin we do not allow (we then read the server log and adjust `ALLOWED_ORIGINS`). **4 signed** — Facebook signed your player for our server: we expect `listed by getSupportedAPIs: yes`, `signature 2 parts`, `payload fields: algorithm, issued_at, player_id, request_payload`, `algorithm HMAC-SHA256`, `request_payload = the nonce: yes` (G-SRV-2; if `issued_at` is there we switch on the stricter freshness check). **5 session** — our server verified that signature with the app secret (G-SRV-2). **6 origin** — the page's origin, which is what the browser sends to our server; we use it to set the production allow-list to your game's exact host. Five OK lines and the origin on every surface is the expected result; a red line on one surface means the ranking stays off there (personal records), not a failure of the project.

Checked here against the local server with our FB stub: all five OK, a wrong secret → "HTTP 401 bad_signature", a missing API → "listed by getSupportedAPIs: NO" (unit tests in `tests/unit/platform/rank-probe.spec.ts`).

## 8. Release gates (outside our environment; none blocks the build, each blocks switching its feature on)

| Gate | What | Who | Blocks | State |
|---|---|---|---|---|
| **G-SRV-4** | Cloudflare account and plan, the API domain, D1 location, Access on `/admin/*`, a WAF rate rule, usage notifications, a CI token (spec §11.1) | you | staging and production | open |
| **G-SRV-1** | The probe reaches staging from facebook.com, the Android and iPhone FB apps and messenger.com; the `Origin` each sends (§7) | you + us | the FB release with the ranking and the remote switches | **passed on facebook.com (WEB), the phone browser (MOBILE_WEB) and the iPhone FB app (IOS)** 2026-10-11: all five checks OK on each, and each sends Origin `https://apps-2382571989149479.apps.fbsbx.com` (the probe line, and for IOS also the server's own `origin` log field) — the production `ALLOWED_ORIGINS`. Android app and Messenger not tested (deferred by the user) |
| **G-SRV-2** | One real `getSignedPlayerInfoAsync` verifies on staging (§7) | you + us | the FB ranking (without it: records) | **passed** 2026-10-11: every real FB sign-in on staging (facebook.com, phone browser, iPhone app; the IOS probe included) verified, every payload `algorithm,issued_at,player_id,request_payload`. `signature.requireIssuedAt` stays off until the Android app is checked (the single-use nonce already stops replays; a missing `issued_at` on Android would otherwise stop its ranking) |
| **G-SRV-3** | Meta's policy for an external backend storing nicknames and fish totals; the Privacy Policy URL and the Data Deletion Instructions URL in the dashboard; whether a notice before the first submit is needed (`ladder.noticeFirst`) | you (+ G-LEGAL) | public release with the ranking | open |
| **G5** | Audience Network approval, business verification, payout; the purchase review with a **screen recording of the in-play purchase** (out of hints → Buy → +15, one used) and the consume-first note (spec §11.4) | you | purchases | open |
| **G10** | iOS purchases: Meta's current rule; one test purchase on an iPhone; then the remote switch `iapIos` on (spec §11.5) | you | iOS purchases | open (built, off) |
| **G-LEGAL** | The privacy notice text (06 §8: what the ranking stores and shows, retention, deletion), the trade-dress risk | you | public release | open |
| **G-NAME** | The public name (task #36): the API domain `rank.<domain>`, the production `VITE_LADDER_URL` and `ALLOWED_ORIGINS` wait for it; staging runs on `workers.dev` meanwhile | you | production ranking | open |
| G1 (Meta) | Whether FB global leaderboards still work (only the event Top list would use them); release builds keep `VITE_FB_LEADERBOARDS` empty until then | us | event boards on FB | open |
| G4, G6, G11 | The banner timeline; any interstitial frequency rule; per-helper placements and the load floor on a device | us | — | open |

The release build refuses (`npm run size`, `npm run zip:fbig`) a `VITE_LADDER_URL` on staging, `workers.dev` or a local host, so the staging database can never be what released players see.

## 9. What we would like from you

1. **The probe results** (§7) from the four surfaces, once staging is up.
2. **The material list** ([ask-user](ask-user.md) items 1–11): screenshots or short recordings of the original's ranking after a win and when it ends, the hearts, the first ads on a fresh install, ten levels in a row, losing a level, a helper at zero, the shop, the streak, the daily, and the daily's sizes. Each answer settles provisional keys of §6 (measured numbers only, never copied art or words).
3. **Q-U1:** keep "Buy No Ads" on the out-of-hints and out-of-kitties cards? (Yes as built; it gives no helper.)
4. **The accounts and dashboard steps** of spec §11.1 and §11.4 (Cloudflare, the products `remove_ads` / `hints_15` / `kitties_8`, the placements, the purchase review recording, the privacy URLs), and the placement ids for the build values.
5. **The public name** (task #36) for the API domain.
6. **Computer rivals** (2026-10-12, §13): keep the line "Rankings include computer players." on (as built; spec §12 Q-CP1), how hard they should be (strength 100 as built; Q-CP2), and whether the web pool gets them too (yes as built; Q-CP3); and the policy check on counting them (G-SRV-3) before production turns them on.

## 10. Known issues and what is left

### 10.1 The audit fix round (fix lead, 2026-10-11)

Two independent audits (A: the server and the honesty rules; B: the UI in the built apps) reported 26 findings. Each was reproduced first; every behavioural or security fix has a test that was run with the fix reverted and failed (the revert check is named in the last column). The earlier fix lead's work (committed as WIP `15be558`) was kept after this check and finished.

| Finding | Verdict | What changed | Test (fails without the fix) |
|---|---|---|---|
| **A-S1** (major) a burst of > ≈ 51 first wins in an empty pool lost wins as `already_counted` | **fixed** | `postWins` places a win in ≤ 8 tries (join, create, or my bracket; a create that loses the pool guard means a joinable bracket exists); still unplaced → `503 unavailable` + `retryAfterMs`, never a final verdict; the client keeps its queue. Probed: 60/120/200 concurrent first wins all counted at once; 300 → 100 answered 503 and all 300 were counted after one resend (none lost, no bracket over 50) | `audit-a.spec` "[A-S1 …] 120 concurrent first wins" (`PLACE_TRIES` 1 → fails) |
| **A-S2** (major) fake ids past the solution table took 1st place | **fixed** | Past the table a win must have a size from the table's tail (8–12 today) and, for a level, a verified baseline within `maxLevelJump` (30); else rejected and flagged `unverified` / `bad_solution` for the admin | `audit-a.spec` "[A-S2 …]", `pipeline.spec` "[audit A-S2]" (either guard removed → fails) |
| **A-S3** (minor) the bracket cap and the play-time budget could be spent twice by parallel requests of one player | **fixed** | The wins write token (`players.wtok`, migration 0002): every statement of a wins batch is guarded by the token the request read, the player row sets a new one; a request that lost re-evaluates (≤ 4 times, then 503) | `audit-a.spec` "[A-S3 …] budget" (8 accepted of ≤ 2 with the guard removed); the cap test fails too in some interleavings (170 member wins of a cap of 150) |
| **A-S4** (minor) a delete racing a first win left an orphan member row | **fixed** (in `d892e45`, re-checked) | `freeGuard` requires the player row; the wins token now also requires it | `audit-a.spec` "[A-S4 …]" (both guards reverted → orphan member row) |
| **A-T1** (minor) the deletion test compared with a literal key | **fixed** | `ops.spec.ts` captures the real key before the delete and checks members, wins, rewards and flags with it; the audit's own test stays | removing `DELETE FROM wins` or `… flags` from `deletePlayer` → `ops.spec` fails |
| **A-L1** (minor) "ready" was the board shown, not taking input | **fixed** | §4 reports both milestones. Measured to "accepts input" the first run was 4.54 s (over 4.5 s): the session waited the full 700 ms entry on every board although `BoardView.playEntry()` returns the wave's real end (408 ms on the 4 × 4 tutorial board; the contract in `board-types.ts`); START now follows it → **4.26 s** (median of 3; 4.21 in an earlier set) | `session-2d.spec` "[audit A-L1]" (fixed 700 ms → fails) |
| **A-C1** (minor) the German Settings fix had no assertion | **fixed** | An e2e geometry check at 320 × 568 in de, en and ar, with the server's name and with the longest name the word lists make: label and name never overlap, the name is never cut, the label is one line, both inside the row | `i18n.spec` "Settings, the ranking name row … (audit A-C1, B2, B8)" (the 320 px layout reverted → fails in all three) |
| **A-S5** (minor) production could run the anonymous web pool by default | **fixed** | `web.mode` defaults to `records`; production runs `anon` only with `WEB_MODE=anon` itself (a `CONFIG_OVERRIDES` value is ignored there, with a problem line) | `rules.spec` "[audit A-S5]" |
| **A-H1** (minor) offline header "Your total: 6" while my row showed 3 + "+3 waiting" | **fixed** (with B9) | The panel subtitle and the victory's total are the server's; queued fish follow as "+3 waiting" (the victory: a second line in its pill) | `ladder-flow.spec`, `ladder-session.spec`, `hud-2e.spec`, `ladder-2e.spec` |
| **A-H2** (minor) the honesty check scanned only some English keys | **fixed** | Urgency and promise rules on every English key; an urgency word list per locale draft (`URGENCY_WORDS`, `localeHonestyProblems`), run by `npm run i18n:check` | `catalogs-2e.spec` "[audit A-H2]" (the old key filter → fails) |
| **A-S6** (minor) overlapping stats rollups double-counted | **fixed** | The watermark moves in the same batch as the sums, guarded by the value read | `ops.spec` "[audit A-S6]" (guard removed → 6 instead of 3) |
| **B1** (major) the daily victory on streak day 7 at 320 × 568 ran under Done | **fixed** | Reproduced with the banner band (without it step 3 fits). A 4th fit step drops the decorative hero and tightens the streak row. Found on the way: with reduced motion every property transitions for 150 ms, so `fit()` measured stale sizes and ran to its last step; it now measures with transitions off | `layout.spec` "(audit B1) …" (step 4 removed → the pill under Done); `layout.spec` "reduced motion — the victory fit …" (measuring flag removed → fails) |
| **B2** (major) "Ranglistenname" broke at an arbitrary letter | **fixed** | Below 360 px the name gets its own line under the label (the label keeps a line of its own, breaks only at the soft hyphen above 360 px; `overflow-wrap: anywhere` is gone) | `i18n.spec` (A-C1 row) |
| **B3** (major) the records sheet stayed full height | **fixed** (WIP, verified) | The fit / info-only rules carry the full-height rule's selector | `ladder.spec` "the web-prod path …" (old selector → 812 px of 844) |
| **B4** (minor) "Weekly ranking" above "Rankings … aren't available" | **fixed** (WIP, verified) | The records state is titled "Your records", as the sheet titles it | `victory-ranking.spec`, `ladder-2e.spec`, e2e `winflow`, `events`, `visual`, `ladder` |
| **B5** (minor) focus fell to `<body>` after buying No Ads | **fixed** (WIP, verified) | When the focused row leaves, focus goes to Watch video, else the first Buy, else Not now / OK | `hud-2e.spec` "[audit B5]"; `fbig.spec` (keyboard purchase) |
| **B6** (minor) the day-7 victory row showed a closed chest | **fixed** (WIP, verified) | `data-reward` on the victory's streak row opens the last step's chest (the Home strip's rule) | `hud-2e.spec` "day 7 …" |
| **B7** (minor) a name's number alone on the second line | **fixed** | A no-break space joins the noun and the number at render (display only; the text is otherwise the server's) | `ladder-2e.spec` (`displayName`, the rows' text) |
| **B8** (minor) the player's own name cut with an ellipsis at 320 px | **fixed** (with B2) | | `i18n.spec` (A-C1 row) |
| **B9** (minor) offline totals disagreed (H-4) | **fixed** (A-H1 row) | | |
| **B10** (minor) "Ends in 23 h 59 min3 players" for screen readers | **fixed** | The drawn dot stays `aria-hidden`; a visually hidden list separator (the locale's own, `list.separator`) is read | `ladder-2e.spec` (seen vs read text) |
| **B11** (minor) "+N waiting" missing from my row's name | **fixed** | My row's name ends with the chip's words ("…, 2 hearts, +2 waiting") | `ladder-2e.spec` (`rowLabel`, my row) |
| **B12** (minor) label in name (WCAG 2.5.3) | **fixed** (WIP, verified) | "Collect ×2" is named by its label; a Buy row's name starts with its label ("Buy 15 hints · $1.99, Bulb Bundle") | `hud-2e.spec`, `ladder-2e.spec`, `visual.spec` |
| **B13** (minor) the ×2 option never said "video" | **fixed** (WIP, verified; spacing fixed here) | A visible line under ×2, "You can watch a video to double your reward.", also its description; it now clears the button's focus ring | `ladder-2e.spec`, `visual.spec` |
| **B14** (minor) "Worldwide ranking" vs "Daily ranking"; "so far" | **fixed** | The Settings group is titled "Daily ranking" (`settings.ladder.title` removed); `ladder.alone` = "You're the only player in this ranking." in English and all 16 drafts | `hud-2e.spec`, `catalogs-2e.spec`, `ladder-2e.spec`, e2e `ladder`, `visual` |
| **B15** (minor) the irreversible Delete looked like a go-on button | **fixed** | Delete is a white button with the `--danger` text; Cancel (where the focus starts) is the primary | `hud-2e.spec` "Delete asks first …" |

### 10.2 What is left

1. **Gates outside our environment** (§8): nothing of the ranking can be switched on for real players before G-SRV-4 (Cloudflare), G-SRV-1 / G-SRV-2 (the probe), G-SRV-3 / G-LEGAL (privacy) and G-NAME (the API domain); purchases wait for G5, iOS purchases for G10. The release build is safe meanwhile: with `VITE_LADDER_URL` empty it shows the personal records.
2. **Load time:** a first run takes input at 4.26 s (board shown 3.94 s; returning player 3.71 s; Slow 4G, the FB SDK download excluded, §4). The 4.5 s requirement is met with ≈ 0.25 s (one run of three took 4.41 s); the next cuts are structural and were not done: the FB-only shop flow and its ledger behind a lazy loader (≈ 7 KB), the win queue's checks behind the ladder chunk, per-locale lazy parts.
3. **Anti-cheat, not done (A-S2 option c):** members with unresolved `unverified` or `level_jump` flags still take paid places. With the size and baseline rules a made-up id past the table no longer counts, but a scripted client that solves the shipped level packs can still climb; that is bounded by the existing floors (size minimum solve times, the play-time budget, the bracket cap) and visible to the admin through the flags. Deciding whether flagged members are paid is a product call (spec §1.6), not a fix.
4. **A burst far beyond real traffic** (hundreds of first wins in one pool within the same instant) answers some requests 503; the client keeps those wins and resends them after `retryAfterMs` (2 s), so nothing is lost, but a live win answered 503 shows the panel's offline state ("Last updated …") until the resend. A player racing itself (two devices, or a script) sees the same 503 when it loses the wins token four times.
5. **The win's own counter (B9 / A-H1, by design):** during the win, before the server answers, the in-game counter's fish flight and its live announcement still count this win's fish into "Your total" — the counter estimate of spec §2.3. The panel and the victory, shown after the answer (or its timeout), carry the server's total and "+N waiting".
6. **Provisional by design** (§6): every "same as Meowdoku" detail not in your words waits for the material list; each is one key.
7. **The locale drafts** of the 2e copy are AI drafts (unreviewed, `docs/i18n/review-log.md`); six width warnings remain (the No Ads Buy label in es, pt-BR, ru, tr, vi and the Italian weekly title; they wrap at 320 px).
8. **The FB event boards** (the event screen's Top list) keep the FB leaderboard path until gate G1; release builds keep `VITE_FB_LEADERBOARDS` empty (personal results).
9. **Not built by design:** streak reminders (no server-free path, no urgency), a daily calendar, a daily reward, an anonymous web ranking in production, free-text names.

Found and fixed at I-6 (before the audits; each with a test): the server's pool race (49 test players split 48 + 1; the pool guard and `brackets.spec.ts`), the G1 cadence test's seed after the L1 flip, the German Settings row at 320 px (since superseded by B2's two-line row).

## 11. Screenshots

`docs/phase2e/screenshots/FINAL-<view>-<variant>.png` (72 files; variants `390` = 390 × 844, `320` = 320 × 568, `de-320`, `ar-320`; phones at device scale 2): the post-win ranking panel full (50 rows from G4's `bracket.full` fixture), small (3 players), offline (the cached bracket "Last updated …", the header "+2 fish · Your total: 28 · +2 waiting", audit B9) and with the longest generated names (`panel-long-names`, audit B7); the ranking sheet opened from Home, the result card with a reward, "Collect ×2" and its video line (B13), the name sheet, Home with the chip and the streak strip, the day-7 reward (the victory row with the open chest, B6, and the Home strip), the victory offline with "+2 waiting" under the total (`victory-offline`, B9), the daily victory on a streak's day 7 with the banner band (`daily-day7-banner`, the real e2e app, fit step 4, B1), the out-of-helpers card with the Buy rows and the video, Settings → "Daily ranking" with the name under its label at 320 px (B2, B8, B14), the delete confirmation with the red Delete and the primary Cancel (`settings-delete`, B15), the daily card locked and unlocked, and a game with the banner (the real e2e app). The ranking views come from `dev/ladder-harness.ts` (fixture data: names from our word lists, our placeholder prices); the audit fix round re-captured the 28 views it changed and added 16 (each looked at). The workstreams' captures (`G2-*`, `G3-*`) stay for reference.

## 12. How to run

```bash
npm ci && npm --prefix server ci          # Node 22
# the local ranking server (in memory; dev routes on; the e2e FB secret), then the web app against it
FB_APP_SECRET=e2e-fb-app-secret npm --prefix server run dev:node -- --port 8787
VITE_LADDER_URL=http://127.0.0.1:8787 VITE_LADDER_WEB=anon npm run dev     # http://localhost:5173 (mock ads: ?ads=ok)
npx tsc --noEmit && npx vitest run       # types and the unit tests
npm --prefix server run verify            # the server: typecheck (3 projects), tests, the solutions table
npm run i18n:check && npm run palette:check && npm run levels:verify
npx playwright test --retries=0           # all four projects; builds both e2e twins and starts the ranking server itself
npm run build:release && npm run size -- dist/release-web dist/release-fbig && npm run zip:fbig
npm run probe -- --url https://mewdoku-rank-staging.<account>.workers.dev  # §7
# the harness of the ranking views: npx vite --port 5182, then /dev/ladder-harness.html (index of 36 views; ?view=…&lang=de&rm=1)
```

## 13. 2026-10-12: computer rivals (D-2e-24) and the post-win fixes

**Post-win and Home-chip fixes** (`afc67c8`, client only): the Home ranking button's dark pill counts down "hh:mm:ss" in a running bracket, like the original's (01 row 7.1.7; rank, players, fish and time are in its accessible name; at 00:00:00 Home refreshes); "+N fish" only for a win the server counted; "Final results" only over the server's final standings, with one re-read after the server's finalising grace for a player waiting on Home; "You're offline" only when known offline ("Last updated" alone on a 503, a timeout or a boot from the cache); the hearts cap per bracket; the counter before a win counts my queued fish. Spec §2.3–§2.9, §9.4; CONTRACTS §14.7. The e2e screenshots were refreshed in `35726f1`.

**Computer rivals** (your decision U-e: fill each ranking to about 50 with computer players, with a low-key disclosure line on by default). Built to the approved design in three stages (checkpoint commit `e703d97`), documented in spec §1.5 "Computer rivals", D-2e-24 and the rewritten honesty rules (H-1, H-2, H-4, H-8; new H-9), CONTRACTS §15 and `server/README.md` "Computer rivals".
- **What a player sees, when it is on:** a new ranking holds about 11 rows at the first win and 46–50 from two hours on: the real players plus computer players in the places no real player took (never more than 50 rows). In the 2-hour join window they climb steadily and a real joiner can only replace the lowest one; afterwards they play in bursts and sleep, so they overtake each other and a player who comes back can pass them. "N players", "#3 of N" and the result card count every row. The info view and How to play say "Rankings include computer players."; rows are not labelled one by one. Hearts on their rows work like any heart; they never give hearts.
- **What stays true:** every real player's row and points are real verified wins; computer players are never rows in the database (no members, players or rewards row) and never paid: a place one holds pays nobody and is not passed down (a real player 2nd behind one gets the 2nd-place reward). Admin's new `GET /admin/v1/brackets/{id}` labels every row. The stats' bracket sizes stay real (`final_real`).
- **Switches:** off in code; `RIVALS="on"` in staging (deployed 2026-10-12 with migration 0003 applied, [NEXT-SESSION](NEXT-SESSION.md); only brackets created after that deploy have computer players), `"off"` in production until the rollout (migration 0003, the client with the line released first, a 48 h staging soak, then a non-gradual deploy with `RIVALS="on"`); `CONFIG_OVERRIDES` `rivals.strength`, `pools`, `disclose`, `hide` (spec §11.5). Running brackets keep what they were created with.
- **Checked here (2026-10-12, the tree after the merge of the combo work, `7da24d2`):** `npx tsc --noEmit` 0 errors; `npx vitest run` 149 files, **3 093 tests passed** (one of four runs had 1 failure that did not come back in the next three: a flake, not identified); `npm --prefix server run typecheck` 0 errors (3 projects); `npm --prefix server test` 20 files, **277 tests passed** (191 before; the new `rivals` unit and HTTP specs, and the extended `sql`, `budget`, `deploy`, `contract`, `worker` and `rules` specs); `npm run i18n:check` OK (17 catalogues, the same 6 width warnings as §10.2 item 7). Not run in this stage: Playwright (the lead's run; `tests/e2e/preview.spec.ts` changed for the preview's computer players), the builds and `npm run size`.
- **Preset r2 (2026-10-12, r2; in the working tree, not committed or deployed):** you saw that rivals "don't get points": in r1 the 2-hour join window gave a slow, steady trickle (the top rival 3 → 6 points in 2 h, the median rival at 3 for 6+ h) and 60 % of rivals were casual, so the table looked frozen. New brackets are now tagged r2, while r1 brackets keep r1 to their end (r1's golden test is unchanged). In r2 a rival's arrival is its first win; from then on it scores in short sessions of 1–4 wins, with a sleep window, and has more wins a day (casual 45 %, regular 37 %, keen 14 %, grinder 4 %). Which rivals a late joiner replaces is decided by replaying the real joins: a rival that has not arrived yet when there is one, else the lowest computer row at that moment. Review fix: when a player who joined late deletes their data, their join time is kept (migration 0004, `brackets.deleted_joins`), so the table never swaps a visible rival for one that had left, and the final places never move because of it; **apply migration 0004 before deploying this code**. Measured over 1,000 tags with a lone player: the top rival's median is 9 points at 15 min, 14 at 1 h and 75 at the end; the median rival ends at 17; a median of 2 rivals score in every daytime 15 minutes. **Harder for players:** with 15 / 25 / 40 wins a day a player finishes in the top 3 in 10 % / 62 % / 99 % of brackets (r1: 65 % at 15 wins), so expect fewer rewards per player than with r1 (`rivals.strength` still tunes new brackets). Checked (after the review fix): `npm --prefix server test` 20 files, 312 tests passed; server typecheck 0 errors; `npx tsc --noEmit` 0 errors; `npx vitest run` 149 files, 3 093 tests passed; `npm run build`, `build:fbig` and `size` within budget for web and fbig (Playwright not run). Details: spec §1.5 "Preset r2", `server/README.md` "Computer rivals".
- **Left:** the Playwright run; the ranking e2e test with rivals in its own pool (design §12.5) is not written yet; the staging soak and its audit (admin route `?live=1`, no reward id with a slot ≥ 1000); the 16 drafts of the line are unreviewed AI drafts (`docs/i18n/review-log.md`); a policy check on counting computer players in a ranking that pays real rewards before the production flip; your three choices (spec §12 Q-CP1 keep the line, Q-CP2 difficulty, Q-CP3 the web pool).
