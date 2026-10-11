# Phase 2e status: the worldwide ranking, ads, purchases in play, the daily streak and the daily challenge

Status: **built and integrated** (I-1 … I-6, 2026-10-11) on `claude/mewdoku-instant`. Every gate inside our environment is green (types, 2 969 unit tests, 178 server tests, the i18n / palette / level checks, all six builds within budget with the bundle checks, both zips, two consecutive full Playwright runs of 307 tests with no retry, the look and helper comparisons; §5). What remains is outside it: the release gates of §8, which need your accounts and a phone (the first one is the probe, §7).

Spec: [spec.md](spec.md) (the decision record §0, the server §1, the game §2–§6, cross-cutting §7, the deployment guide §11) · Interfaces: [CONTRACTS.md](CONTRACTS.md) (final; §14 lists what changed at integration) · Requests: [G1](requests-G1.md), [G2](requests-G2.md), [G3](requests-G3.md), [G4](requests-G4.md) (all closed) · Provenance: [provenance.md](../provenance.md) §13.

Your request (2026-10-11): "1) Leaderboards - same as in Meowdoku 2) Video Ads - Banner during level (always there), Interstitial (after every level starting after level some later level - same as in Meowdoku, Rewarded Video (when out of helpers during play) 3) InAppPurchases - option to buy helpers during play 4) Daily Streak - same as in meowdoku 5) Daily Challenge same as in Meowdoku", with your four answers: **own worldwide server** (U-a), **banner always during levels** (U-b), **iOS purchases on once confirmed** (U-c), **current packs** (U-d).

## 1. What was built

| Your ask | What a player sees now | Where |
|---|---|---|
| **1. Leaderboards** — real players only, our own worldwide server | After every scored win the ranking panel shows **my daily ranking**: up to 50 real players who started around the same time (a rolling 24 h bracket), each row a place, a picture, a generated name and the fish they kept; my row is highlighted and "+2 waiting" while a win is still on its way. A bracket that is not full shows only the players in it (one player alone reads "You're the only player in this ranking so far"): **never bots, never invented players or counts**. When a ranking ends, a result card: 1st place 2 hints + 2 kitties (×2 for a video), 2nd 1 + 1, 3rd 1 hint, if at least 5 players took part. Hearts are cheers (one per row). Home's ranking chip ("#5 · 28") opens the ranking sheet (list, how it works, my records). Settings → "Worldwide ranking": the name (picked from our word lists, with our 12 cat pictures), "Show me in rankings", "Delete my ranking data", the player code. Offline: the last answer marked "Last updated hh:mm", or my own records. Web-prod: personal records only (no server) | `server/` (Cloudflare Worker + D1; a Node dev server for local work and e2e), `src/shared/rank-api*.ts`, `src/app/ladder-*.ts`, `src/game/ladder*.ts`, `src/ui/overlays/{bracket-list,ladder-sheet,ladder-result,nickname-sheet,ranking-panel}.ts`, `src/ui/hud/ladder-chip.ts` |
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

The 2b method (STATUS-2b §4): the FBIG e2e twin built with `VITE_LADDER_URL=http://127.0.0.1:8787` and the local ranking server running, served uncompressed (`Accept-Encoding: identity`) by `vite preview`, the FB SDK replaced by our stub, Chromium with the cache disabled, CPU 4× slower, DevTools' Slow 4G (562.5 ms, 1.44 Mbit/s), a 390 × 844 phone; "ready" = the first screen interactive (a first run's tutorial board playing; a returning player's Home with Play). Median of 3 runs. All on one machine, the same day.

### 4.2 Results

| Build | First run (new player) | Returning player | First-load bytes at ready (8 requests) |
|---|---|---|---|
| Pre-2e (`3389380`, the 2d.1 final tree) | 3.67 s | 3.55 s | 426 KB |
| 2e as built (start of I-4) | 4.00 s (4.03 / 4.00 / 3.97) | 3.85 s | 479 KB |
| **2e after I-4** | **3.85 s (3.93 / 3.85 / 3.81; an earlier set the same hour 3.91, and 3.85 right after the cuts)** | **3.71 s** | 451 KB |

The hard requirement (≤ 4.5 s) is met with room; the target "near 3.71 s" (the 2d.1 value on its machine) is about 0.15–0.2 s away. What is left of the difference to pre-2e is the 2e code a first screen or a win needs (§4.3); the next cuts are structural (§10).

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
| Main JS (entry + modulepreload chunks) | **360** (332) | 330.4 · 346.2 · **349.5** (329.1 · 345.0) |
| CSS (first load) | 49.3 | 49.1 everywhere |
| Font · `index.html` | 17 · 1.14 | 16.7 · 1.03–1.11 |
| **First-load total** | **427** (398) | 397.1 · 413.1 · **416.3** (395.9 · 411.9) |
| **First load + 1 locale** | **470** (429) | 437.8 · 453.7 · **457.0** |
| **First load, gzip** | **158** (148.5) | 146.5 · 151.8 · **153.4** (146.2 · 151.6) |
| Worker JS (lazy) | 18.5 | 18.1 |
| Locale chunk (each of 16) | **41.9** (29.3) | 40.7 (hi) |
| Lazy JS: optional (`events`, `fb-social`, `social-flows`) | 29.3 | 13.3 · 27.1 |
| Lazy JS: fx chunk · board motion · lazy art | 15.3 · 3.8 · 4.4 | 14.9 · 3.7 · 4.3 |
| Lazy JS: ladder (`ladder-*`) | **30.5** (26, L0 placeholder) | 29.7 |
| Lazy JS: ladder boot (`ladder-boot-*`) | **34.9** (new) | 33.9 |
| Lazy JS: overlay chunk (`overlay-chunk-*`) | **56.2** (new) | 54.6 |
| Lazy JS: English strings (`en-lazy-*`) | **13.6** (new) | 13.2 |
| Lazy JS: core (the rest: hint card, RPC, sounds, generator, grader) | **23.3** (74, before the split) | 22.7 |
| Lazy CSS: fx chunk · board motion | 3.26 · 6.4 | 3.16 · 6.24 |
| Lazy CSS: ladder (`ladder-chunk-*`) | **11.05** (4, L0 placeholder) | 10.7 |
| Lazy CSS: overlay chunk | **32** (new) | 31.1 |
| Lazy CSS: the rest (`events-chunk-*`) | **7.2** (34.6, before the split) | 7.0 |
| FB zip files · zips | 100 files; ≤ 1 MB | release 73 files · 365.7 KB; preview 89 files · 502 KB |

New rows: the overlay chunk (JS, CSS), the ladder boot chunk and the lazy English strings; the ladder chunk's two L0 placeholder rows (the spec's estimates, 26 / 4 KB) re-set to measured; the core lazy rows re-set to what is left once the new rows split out. Recorded in `scripts/size-check.ts` (history comment), `tests/unit/platform/scripts.spec.ts` and 04 §9.

## 5. Verification (I-6)

All on `claude/mewdoku-instant` with the I-6 fixes of §10 item 3 in the tree, 2026-10-11 (Node 22, 4 CPUs). Every gate was run after the last code change.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 144 files, **2 969 tests passed** (the new guards: `first-load-strings.spec.ts`, `release-check.spec.ts`, `rank-probe.spec.ts`, the honesty test in `catalogs-2e.spec.ts`, the new size rows in `scripts.spec.ts`) |
| `npm --prefix server run verify` | typecheck (3 projects); 17 files, **178 tests passed** (incl. the new "10 concurrent first wins in an empty pool open ONE bracket", which fails without the pool guard: 10 brackets); `solutions:check` ok (35 generated boards re-made; levels ≤ L3000, dailies ≤ 2030-12-31, 3 events) |
| `npm run i18n:check` (and `-- --release`) | OK, 17 catalogues, the honesty check clean; 6 width warnings (§10 item 5) |
| `npm run palette:check` · `npm run levels:verify` | OK · 10 level packs, 27 daily months, 3 event packs, 0 issues |
| Builds | web, FBIG, e2e, FBIG e2e, release-web, release-FBIG, the probe: all built |
| `npm run size` on all six dists | **within budget** everywhere (§4.4; the FBIG e2e first load measured 416.3–416.4 KB from build to build against 427); bundle checks ok: no test data in any dist, the release rules clean on both release dists |
| `npm run zip:fbig` (+ `--preview`) | release 73 files · 365.7 KB; preview 89 files · 502.0 KB; the release bundle check ran before zipping |
| Playwright, all four projects (web-390, web-320, web-1280, fbig-390), `--retries=0`, against the local ranking server started by the config | **run A: 307 passed, 0 failed, 0 flaky (16.1 min); run B, right after: 307 passed, 0 failed, 0 flaky (16.2 min)**. 93 skipped in each, all viewport-bound (`test.skip` on the other phone sizes in `visual.spec.ts` 50, `layout.spec.ts` 23, `visual-board.spec.ts` 10, `i18n.spec.ts` 10); no test skipped for any other reason |
| `dev/look-compare.ts` · `dev/helpers-compare.ts` | 105 pass, 0 FAIL (19 info) · 105 pass, 0 FAIL (25 info, 10 design) |
| The probe | built against the local server and run in Chromium with our FB stub: five steps OK and the origin line; a wrong secret and a missing API show the expected red lines (§7) |
| FINAL screenshots | 56 (§11), each looked at; one regression found and fixed (the German Settings label, §10 item 3), the four variants re-captured after the fix |

Found and fixed during I-6 (each with a test, none weakened): the server's pool race (the first full Playwright run's 50-row layout test saw 49 players in the bracket); the G1 cadence test's seed after the L1 flip; the German Settings row at 320 px. Each Playwright run re-writes the visual specs' review captures in `docs/phase2d/screenshots/` and `docs/phase2e/screenshots/` (`G2-*`, `G3-*`); the changed PNGs in the tree are those captures (no assertion compares their bytes).

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
| Retention: wins and brackets 30 d, flags 90 d, inactive players 180 d | srv `retention.*` | G-LEGAL |

## 7. The probe (gates G-SRV-1 and G-SRV-2) — the first thing to do once staging is up

The probe is a tiny private Instant Game (no game in it) that checks, on a real phone, that the game can reach our ranking server from inside Facebook and that Facebook signs the player the way the server verifies. It shows six lines and never shows your player id, the signature or any token.

**Before it:** the staging server must be deployed (spec §11.1–§11.2: your Cloudflare account, then `npm --prefix server run deploy:staging`); its URL looks like `https://mewdoku-rank-staging.<your account>.workers.dev`. Staging already allows `https://*.apps.fbsbx.com` (where Instant Games run).

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
| **G-SRV-1** | The probe reaches staging from facebook.com, the Android and iPhone FB apps and messenger.com; the `Origin` each sends (§7) | you + us | the FB release with the ranking and the remote switches | open (probe ready) |
| **G-SRV-2** | One real `getSignedPlayerInfoAsync` verifies on staging (§7) | you + us | the FB ranking (without it: records) | open (probe ready) |
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

## 10. Known issues and what is left

1. **Gates outside our environment** (§8): nothing of the ranking can be switched on for real players before G-SRV-4 (Cloudflare), G-SRV-1 / G-SRV-2 (the probe), G-SRV-3 / G-LEGAL (privacy) and G-NAME (the API domain); purchases wait for G5, iOS purchases for G10. The release build is safe meanwhile: with `VITE_LADDER_URL` empty it shows the personal records.
2. **Load time:** 3.85 s for a first run on Slow 4G (pre-2e 3.67 s on the same machine; the 4.5 s requirement is met; the 3.71 s target is 0.15–0.2 s away). The next cuts are structural and were not done: the FB-only shop flow and its ledger behind a lazy loader (≈ 7 KB; the boot restore would wait for the chunk), the win queue's checks behind the ladder chunk (a win must still be queued at `WON`, offline too), and per-locale lazy parts (each locale chunk carries all its 2e copy: 40.7 KB for Hindi; only non-English players load one).
3. **Fixed at I-6, found by the e2e runs:** concurrent first wins of different players in an empty pool opened one bracket each on the server (seen as 49 test players split 48 + 1); the bracket create now has a pool guard and a server test (`brackets.spec.ts`), and spec §1 / CONTRACTS §14 record it. One G1 e2e test (`fbig.spec.ts` "persistence from the victory into the next board") still assumed the 90 s interstitial cooldown of before the L1 flip; its seed now uses the 30 s floor. The German Settings row "Ranglistenname" ran under the player's name at 320 px; the row now breaks long labels (and the German catalogue has a soft hyphen).
4. **Provisional by design** (§6): every "same as Meowdoku" detail not in your words waits for the material list; each is one key.
5. **The locale drafts** of the 2e copy are AI drafts (unreviewed, `docs/i18n/review-log.md`); six width warnings remain (the No Ads Buy label in es, pt-BR, ru, tr, vi and the Italian weekly title; they wrap at 320 px).
6. **The FB event boards** (the event screen's Top list) keep the FB leaderboard path until gate G1; release builds keep `VITE_FB_LEADERBOARDS` empty (personal results).
7. **Not built by design:** streak reminders (no server-free path, no urgency), a daily calendar, a daily reward, an anonymous web ranking in production, free-text names.

## 11. Screenshots

`docs/phase2e/screenshots/FINAL-<view>-<variant>.png` (56 files; variants `390` = 390 × 844, `320` = 320 × 568, `de-320`, `ar-320`; phones at device scale 2): the post-win ranking panel full (50 rows from G4's `bracket.full` fixture), small (3 players) and offline (the cached bracket "Last updated"), the ranking sheet opened from Home, the result card with a reward and "Collect ×2", the name sheet, Home with the chip and the streak strip, the day-7 reward (the victory row and the Home strip), the out-of-helpers card with the Buy rows and the video, Settings → Worldwide ranking, the daily card locked and unlocked, and a game with the banner (the real e2e app). The ranking views come from `dev/ladder-harness.ts` (fixture data: names from our word lists, our placeholder prices); the workstreams' captures (`G2-*`, `G3-*`) stay for reference.

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
