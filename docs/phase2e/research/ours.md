# Phase 2e input: what OUR build does today (leaderboards, ads, IAP, daily streak, daily challenge)

Repo `/home/user/Mewdoku-Instant`, branch `claude/mewdoku-instant`, HEAD `9b171ed` (Phases 2, 2b, 2c, 2c.1, 2d, 2d.1 done). Read-only inventory from the code and our own docs, written 2026-10-10. No 06 §4 source was opened. "Code reading" means I traced it in the source and did not run it; everything else is backed by the docs' verification sections or by named tests.

Platform columns used below:

- **web-prod**: the production web build. `MOCK_BUILD` is false, so it has no ad network.
- **web-dev/e2e**: dev and e2e builds. Mock ads come from `?ads=ok|nofill|unsupported|close` and include a mock banner (`src/platform/web/mock-ads.ts`).
- **FBIG**: the FB adapter on facebook.com and Android. Every FB feature also needs its `VITE_FB_*` build value and the SDK probe. **None of it has been verified on Meta's side** (fb-dashboard §6, gates G1–G6).
- **FB iOS / Messenger.com**: no payments there. Everything else behaves as on FBIG.

## 0. One-screen summary

| Feature | web-prod | web-dev/e2e | FBIG | Flag (`src/app/flags.ts`) | Main config |
|---|---|---|---|---|---|
| Leaderboard (weekly fish board) | Personal records only. Home period pill. No trophy or hub | Same as web-prod | Built: classic, then NEZP, else none. Needs `VITE_FB_LEADERBOARDS`. Unverified (G1, G3) | `rankings` on | `rank.*`, `period.*` |
| Event leaderboards | Personal results | Same | Built, unverified | `rankings` on | `rank.boards.eventPrefix` |
| `daily_fastest` board | n/a | n/a | Code kept, **switched off** | — | `rank.dailyBoard: false` |
| Banner | None | Mock bar | Built: Home, victory, event **and the game screen**. Needs `VITE_FB_PLACEMENT_BANNER` plus both banner APIs | `banners` on | `ads.banner.*` |
| Interstitial | None | Mock | Built: `next_level`, `retry`, `daily_done`, `event_next`. Needs `VITE_FB_PLACEMENT_INTERSTITIAL` | — | `ads.interstitial.*` |
| Rewarded | **Free fallback** (600 s shared cooldown) | Mock | Built: `hint`, `kitty`, `mouse`, `revive` (+ `group_double`, flag off). Needs `VITE_FB_PLACEMENT_REWARDED`, else the free fallback | — | `ads.rewarded.*`, `ads.unsupportedFallback.*` |
| IAP shop | **None** (no Shop row) | None | Built: Settings → Shop / Remove ads. No Ads, Bulb Bundle (15 hints), Kitty Basket (8 kitties). Unverified (G5) | `shop` on | `iap.*` |
| Daily streak | **Does not exist** | — | — | — | — |
| Daily puzzle | Works | Works | Works | — | `daily.*` |
| Group challenges (FB tournaments) | — | — | Built, **flag off** | `groupChallenges` **off** | `groups.*` |

---

## 1. Leaderboards

### 1.1 Boards (Phase 2c: `docs/phase2c/fish-lives-spec.md` §4; `src/game/scoring.ts`; `docs/phase2b/fb-dashboard.md` §3)

| BoardKey | Suggested dashboard name | Ranks | Period | Score posted | State |
|---|---|---|---|---|---|
| `period_points` (`rank.boards.period`) | `fish_week_v1` | **The** leaderboard: fish (lives) kept at each counted win, summed over this period | **UTC week, Monday 00:00 UTC** (`period.kind: 'week'`; `'day'`/`'month'` also supported). Index 0 = week of `rank.periodEpoch` 2026-01-05 | `periodIndex × 100 000 + min(total, 99 999)` (`encodePeriodScore`). One global board whose high digits hold the band; a new week's first win replaces last week's entry | **On.** Submitted and read |
| `event_<id>` (`rank.boards.eventPrefix` + id with `-` → `_`) | `event_lantern_walk_2026`, `event_snow_paws_2026`, `event_yarn_hearts_2027` | Puzzles solved in the event, then least total time | The event's run (14–21 days) | `solved × 1 000 000 + (999 999 − min(totalSecs, 999 999))` (`encodeEventScore`) | **On.** Submitted at each event win; read by the event screen's "Top list" and the hub's Event tab |
| `daily_fastest` (`rank.boards.daily`) | `daily_fastest` | Fastest solve of today's daily | One board, each player's **local** date as the band (`rank.dailyEpoch` 2026-01-01) | `dayIndex × 100 000 + (99 999 − secs)` (`encodeDailyScore`) | **Off** (`rank.dailyBoard: false`, a 2c default the user may change). Not submitted, no "Today" tab. Band-reading code is kept |
| `paw_points` | — | Retired in 2c (all-time paw points) | — | — | Never submitted or read. The v3 migration drops its pending score |

Points per win: `keptPoints` gives fish kept × `period.pointsPerFish` (1). That is 1–3 for a counted win in `period.modes` (`['level','daily','event']`). The tutorial never scores. Per-period total cap: `period.max` 99 999. Save: `save.period = {key, total, bestKey, bestTotal}` (v3). Separate from the board are **level points** (`levelPoints.firstIncrement` 576 / `step` 96 per correct cat in a run, the user's rule). They go into the lifetime `save.points.total`. They are **not** on any FB board and appear only in personal records.

### 1.2 Submission (`src/app/session.ts` `winBoards`/`onWon`, `src/app/ranking-flow.ts` `submitAll`/`flushPending`)

- When: at `WON`, t = 0, for a **counted** win. Counted means the level was not won before, the daily's first win for its date, or an event puzzle's first win. The win must also have fish gained > 0. One batch holds `period_points` (+ the event board on an event win, + `daily_fastest` only if `rank.dailyBoard`).
- Client limits (`canSubmit`): no submit for solves under `rank.minSolveMs` (3 s) or over `rank.maxSolveMs` (24 h). At most one batch per `rank.submitMinIntervalMs` (10 s). A score that has to wait goes to `save.rank.pending[board]`.
- Retries: `flushPending` runs after the next win's batch and at boot (`boot.ts` step 8). Error or timeout → pending. `LEADERBOARD_NOT_FOUND` / unsupported → the board is latched as missing for the session and personal records show instead.
- No server-side check, so boards can be spoofed (accepted; there are no prizes).

### 1.3 Where it shows

| Surface | What | Platforms |
|---|---|---|
| **Win flow, in game** (`src/app/win-flow.ts`) | A **period counter** fades in. Each fish still in the lives pill flies to it and the counter counts up ("+N"). | All (not the tutorial or a restored win) |
| **Post-win ranking panel** (`src/ui/overlays/ranking-panel.ts`, overlay `ranking`) | Opens at 4.2 / 4.35 / 4.5 s for 1/2/3 fish kept (1.2 s with reduced motion, or with no flight). Shows **the period board after every scored win** (level, daily, event). Title "Weekly ranking", subtitle "+2 fish · This week: 42". Tap → victory screen. List states: `loading` · `overlay` (rect; off until G3) · `see_top` ("Your rank #N / Your score" + **"See top players"** → FB overlay view, full screen) · `mine` (no overlay views: my line only) · `records` (personal records with "rankings not available"). **Never a fabricated row**. Other players' names and photos appear only inside FB overlay views. | All. FB lists only with a provider |
| **Victory screen** (`victory-screen.ts`) | Shows the level's points, then the kept fish ("+2", "This week: 42"). There is no leaderboard button on it. | All |
| **Home** (`home-screen.ts`) | Top-bar lead slot: the **period pill** ("42 fish this week", our trophy icon, **not a button**). The **trophy button** that opens the **Rankings hub** appears only when `capabilities().leaderboards` is true, i.e. FB with an API and a board map. STATUS-2c §8 notes "FB Home shows two trophies" as open. | Pill: all. Trophy: FBIG only |
| **Rankings hub** (`rank-hub.ts`, `src/app/rank-hub-flow.ts`, lazy `social-flows` chunk) | Tabs: **"This week"** (default, the period band) · "Today" (only with `rank.dailyBoard`) · "Event" (while an event is live) · "Groups" (flag `groupChallenges`). Each tab has the same list states as the panel. | FBIG only (no entry on the web) |
| **Event screen "Top list"** | The ranking panel for the event board | All (web: personal results) |
| Group challenges | FB tournaments ranked on fish kept in the context. 2 kitties for taking part, 4 with the `group_double` video | FBIG, **flag off** |

### 1.4 FB API path (`src/platform/fb/fb-ranking.ts`, `fb-probe.ts`, `fb-overlay-views.ts`, `views/rank-list.ts`)

- Probe order: **classic** `getLeaderboardAsync(name)` (mine = `getPlayerEntryAsync`, top = `getEntriesAsync(n, offset)`), then **NEZP** `globalLeaderboards.setScoreAsync/getTopEntriesAsync(id)` (no rank, no "me"), else **none** (every call answers unsupported, giving personal records).
- `caps().global` = api ≠ none **and** `VITE_FB_LEADERBOARDS` (JSON map BoardKey → dashboard name/id) is non-empty. This drives the Home trophy.
- Band reads: up to 4 pages × `rank.fetchCount` 50 past entries above the shown week. "Your rank" inside the week is exact on classic (`mine.rank − (band[0].boardRank − 1)`). NEZP shows "Your score" only.
- Every call is bounded by `rank.fetchTimeoutMs` 3 s and never rejects. Overlay list in `rank.overlayPlacement: 'fullscreen'` until G3 (`'rect'` later). Top `rank.topCount` 10 rows.
- **Unverified**: which API SDK 8.0 serves, L1–L6, O1–O6 (fb-dashboard §6). In particular, how a non-friend's name is bound in the overlay XML is undocumented (O3).

### 1.5 Web

No provider. The panel always shows (the `rank.showPanelWithoutProvider` key is unread; the panel shows anyway) with **personal records**: This week · Your best week (hidden at 0) · Total points (lifetime level points) · Levels solved, plus `rank.localOnly`. No trophy, no hub, no other players. Tests: e2e `smoke` "4b · web rankings…".

### 1.6 Keys and tests

`rank.{fetchTimeoutMs 3000, topCount 10, fetchCount 50, panelPopMs, panelOutMs, panelTapMinMs 1200, tapPulseMs, submitMinIntervalMs 10000, minSolveMs 3000, maxSolveMs 86400000, dailyEpoch '2026-01-01', periodEpoch '2026-01-05', boards{points,daily,eventPrefix,period}, dailyBoard false, overlayPlacement 'fullscreen', showPanelWithoutProvider true (unread)}`. `period.{kind 'week', pointsPerFish 1, modes, max 99999}`. `levelPoints.{firstIncrement 576, step 96, modes}`. `fx.win.*` for the flight and panel timing. Env: `VITE_FB_LEADERBOARDS`. Flag: `rankings`. Tests: `tests/unit/app/ranking-flow.spec.ts`, `tests/unit/platform/fb-ranking.spec.ts`, `tests/unit/game/scoring.spec.ts`, e2e `fbig.spec.ts` "FBIG rankings" (classic #1, NEZP score-only, no-API records, week band #251).

---

## 2. Video ads

### 2.1 Banner (`src/app/banner-flow.ts`, `src/game/ad-pacing.ts` `bannerGate`, `src/platform/fb/fb-banner.ts`)

- **Capability (FBIG)**: both `loadBannerAdAsync` and `hideBannerAdAsync` must be in `getSupportedAPIs()` and be functions, and `VITE_FB_PLACEMENT_BANNER` must be non-empty. `CLIENT_UNSUPPORTED_OPERATION` latches banners off for the session. **web-prod: never.** web-dev/e2e: a mock grey bar (320 × 50 on the game screen).
- **Gate** (in order): `ads.enabled` and `ads.banner.enabled` → capability → screen (`ads.banner.screens` = home, victory, event; plus **`'game'` while `ads.banner.duringPlay`** = true, Phase 2d D-2d-15) → `progress.completed ≥ ads.banner.fromCompletedLevels` (**10**; the tutorial counts as 1, so the first banner comes on the victory of level 10 or the game screen of level 11) → not `purchases.noAds` → not the first-run tutorial.
- **During play (2d / 2d.1)**: the game screen reserves its band from mount when `eligible('game')` holds (`ads.banner.bannerPx` 50 + `layout.game` gaps), and the banner loads when the board entry ends. It is **hidden** under the hint card (O1, `ads.banner.hideDuringHint`) and re-shown when the hint closes (at once if ≥ 60 s since the last load, else one timer). It is also hidden before every interstitial and rewarded video, under Settings / How to play / Shop / Rankings hub / ranking panel, and on leaving to Home or the event screen. O4 (fail), O2 (rewarded prompt) and the coach keep it. A banner up on the victory or the previous board **stays** into the next board.
- **Reload window**: at most one load per `ads.banner.minReloadSec` 60 s (Meta's reported limit is 45 s). A screen mounted inside the window **skips** its load. There is no retry loop.
- **Not "always there" (code reading)**: on the game screen, after any hide other than the hint card's, the banner comes back only at the next eligible screen mount, and only once 60 s have passed since the last load. The hides in question are an interstitial before the board, a kitty / mouse / revive video, or Settings / Shop. Example: the victory reloads the banner, the "Level N+1" interstitial hides it, the next board mounts < 60 s after that load, and the band stays empty for that board. Also absent: levels 1–10, the tutorial, and No Ads owners.
- Layout: Home, victory and event reserve `ads.banner.reservePx` 58 px plus the safe area, with buttons ≥ `buttonClearancePx` 16 above it. Position `'bottom'` (unverified B2).
- **Policy risk**: Meta's guidance (second-hand) says no banners during active gameplay. STATUS-2d Q5 is open, G4 re-checks it, and `ads.banner.duringPlay: false` restores the 2b rule.

### 2.2 Interstitial (`interstitialGate` in `src/game/ad-pacing.ts`; `HelperFlows.interstitial` in `src/app/helper-flows.ts`; `src/app/session-transitions.ts`)

- **Triggers** (`ads.interstitial.triggers`): `next_level` (victory's "Level N" tap), `retry` (O4 Retry tap), `daily_done` (daily victory's Done), `event_next` (event victory's next puzzle / back to event). The interstitial shows **after the button tap**, never during the win flow. The transition always goes ahead whatever the ad did.
- **Gate order**: `ads.enabled` → not `purchases.noAds` → `capabilities().interstitial` → trigger listed → `progress.completed ≥ ads.interstitial.minCompletedLevels` (**10**; the tutorial counts, dailies don't) → **session grace** `sessionGraceSec` 60 s since `platform.start()` in this page load → **tenure cooldown** since `save.ads.lastAdAt`: 120 s for tenure days 0–1, 100 s for days 2–6, 90 s from day 7 (`cooldownSec [{0,120},{2,100},{7,90}]`, tenure from `save.firstSeenAt`). A gated call logs `ad_interstitial {result:'gated'}`.
- `lastAdAt` is set after an interstitial that showed **and after every completed rewarded video** (`ads.rewarded.resetsInterstitialClock: true`).
- **Never**: on game open, during play, in the first-run tutorial (its "Play Level 2" has no gate), on Home / "Home" buttons, on O4 Continue, or before 10 completed levels. With level times of 1–4 min this gives "after most levels" once past level 10. It is **not literally every level**: a quick level inside the cooldown, or the first 60 s of a page load, gets none.
- Mechanics (`src/app/ad-flow.ts`, `fb-ads.ts`): one preloaded instance, preloaded at boot and after every show. Readiness wait `ads.readyTimeoutMs` 4 s, else skipped silently. Watchdog `showWatchdogMs` 120 s. Input locked, our audio muted, banner hidden first. Reload backoff `reloadDelaysMs` 5/30/120 s, stalled load `loadTimeoutMs` 12 s.
- web-prod: none. FBIG: requires `VITE_FB_PLACEMENT_INTERSTITIAL` (empty → capability false → no interstitials).

### 2.3 Rewarded (`rewardedOrFallback` / `refill` / `onMouse` / `continueOffer` in `helper-flows.ts`; O2 `src/ui/overlays/rewarded-prompt.ts`; O4 `fail-overlay.ts`)

| Placement | When | Prompt | Grant |
|---|---|---|---|
| `hint` | Bulb tapped with `stock.hints` = 0 (helper shows a green video badge) | O2 "Out of hints": [Watch video] [Not now] | +1 hint (`hints.perRewardedAd`), **spent at once** on the hint card |
| `kitty` | Kitty tapped with `stock.kitties` = 0 | O2 "Out of kitties" | +1 kitty (`kitty.perRewardedAd`), used at once |
| `mouse` (2d) | **Every** mouse use (no stock) | O2 "Call the mouse?" | The mouse crosses out `mouse.cells` 3 tiles |
| `revive` | O4 "Out of fish" → Continue | The O4 button itself | +1 fish (`revive.heartsRestored`), at most `revive.maxPerAttempt` 1 per attempt |
| `group_double` | Group-challenge result | Group result card | 4 kitties instead of 2. **Flag off** |

- Granted only when `showAsync()` resolves (watched to the end). Early close or no-fill gives the "No videos right now — try again soon." toast and grants nothing. One rewarded placement ID serves all of them.
- **Caps**: no daily or session cap on videos. Limits are per attempt only (revive 1). Starting stock: `hints.startStock` 5, `kitty.startStock` 3.
- **Free fallback** (02 §13.3): when rewarded is unsupported (web-prod, an FB build without `VITE_FB_PLACEMENT_REWARDED`, or `CLIENT_UNSUPPORTED_OPERATION` latched), O2 offers "Here's a free hint." [Take it]. This happens at most once per `ads.unsupportedFallback.cooldownSec` **600 s**, **shared** by hint, kitty, mouse and revive (`save.ads.lastFallbackGrantAt`). Otherwise a countdown card shows ("Next free hint in m:ss", [OK]) and O4 hides Continue. No-fill on a supported platform does not trigger the fallback.
- No "refill lives" or energy placement exists: lives (3 fish) are per attempt.

### 2.4 Keys and tests

`ads.{enabled, readyTimeoutMs 4000, showWatchdogMs 120000, interstitial{minCompletedLevels 10, cooldownSec, sessionGraceSec 60, triggers}, rewarded{resetsInterstitialClock true, placements}, banner{enabled true, fromCompletedLevels 10, screens [home,victory,event], position 'bottom', reservePx 58, minReloadSec 60, buttonClearancePx 16, duringPlay true, bannerPx 50, hideDuringHint true}, unsupportedFallback{cooldownSec 600}, mock{durationMs}, reloadDelaysMs, loadTimeoutMs}`, `hints`, `kitty`, `mouse{enabled, cells 3}`, `revive`. Env: `VITE_FB_PLACEMENT_INTERSTITIAL / _REWARDED / _BANNER`. Flag: `banners`. Tests: `tests/unit/app/{ad-flow,banner-flow,interstitial,helper-flows}.spec.ts`, `tests/unit/game/economy-pacing.spec.ts`, `tests/unit/platform/{fb-ads,fb-banner,mock-ads}.spec.ts`, e2e `fbig.spec.ts` "FBIG ads", "FBIG banners…", `layout.spec.ts` (2d mock banner in the band), `smoke` 10 / 12 / 22.

---

## 3. In-app purchases

### 3.1 Catalogue (`iap.catalog`, `src/game/purchases.ts`, fb-dashboard §4)

| productID | Our name (en) | Grants | Type | Default price (set in the dashboard) |
|---|---|---|---|---|
| `remove_ads` | No Ads | `purchases.noAds = true`: no interstitials, no banners (rewarded stays) | Consumable, consumed at once and kept as a save entitlement (`iap.removeAdsMode: 'consume'`) | $3.99 |
| `hints_15` | Bulb Bundle | +15 hints | Consumable | $1.99 |
| `kitties_8` | Kitty Basket | +8 kitties | Consumable | $1.99 |
| `fish_250` / `fish_900` | (retired 2c) | Never sold. An unconsumed old purchase or ledger entry is compensated with 10 hints + 3 kitties / 30 hints + 15 kitties (`iap.retired`) | — | — |

There is **no mouse product** (the mouse has no stock and always costs one video), no lives or continue product, no subscription, and no bundle or starter pack.

### 3.2 Where the shop opens (`src/app/shell.ts` `settingsProps`, `src/app/shop-flow.ts`, `src/ui/overlays/shop-sheet.ts`)

- **Only Settings → "Shop"**, and Settings → "Remove ads" when it is on sale and not owned. Phase 2c §5.2 removed the Home, victory and O2 entries (`[DECISION]`).
- **During play**: the only path is the game screen's gear → Settings → Shop. **O2 "Out of hints / kitties" has no Buy option**: only Watch video / Not now, the free grant, or the countdown. A purchase made mid-level updates the stock badges through the `stock` bus event.
- The Shop row shows only when the Buy section can show something (`buyState()` loading / error / ready). That means **never on the web** (`hidden`), never on FB iOS (`unavailable`), and on Messenger.com only during the first `iap.readyTimeoutMs` 5 s.
- Sheet: product rows with our names and descriptions, the catalogue's localised price, Buy, or "Owned" for No Ads. States: "Getting the shop ready…", "Purchases aren't available here.", error + Try again, busy while a purchase is in flight.

### 3.3 FB payments flow (`src/platform/fb/fb-payments.ts`)

- **Availability**: `capabilities().payments` = `getPlatform() !== 'IOS'` and `payments.purchaseAsync` in `getSupportedAPIs()`. Then `payments.onReady`. The catalogue is cached `iap.catalogCacheMs` 10 min (failures are not cached), and catalogue / purchases / consume calls are bounded by `readyTimeoutMs`.
- **Purchase**: `purchaseAsync({productID, developerPayload: playerId:nonce})`. `USER_INPUT` is a silent cancel; other failures toast "We couldn't finish that purchase". Success toasts "Thank you! Your items are in." The analytics row is `iap {product, result, platform}`, never a price.
- **Grant order** (`iap.grantBeforeConsume: true`): record the ledger entry `"<productId>|<token>"` (newest `iap.tokensKept` 50) → grant → `saves.critical()` (cloud flush) → `consumePurchaseAsync(token)`. The grant is idempotent by token.
- **Restore**: automatic at boot (`shop.restore()` after start and onReady) via `getPurchasesAsync`. An unconsumed purchase not in the ledger is granted and consumed. One already in the ledger is only consumed. Refunds and non-charges are dropped and revoke nothing. There is **no "Restore purchases" button**. Cross-device: No Ads is OR-merged in the cloud save, and the paid-grant repair re-applies ledger entries only the older copy holds.
- Client-trusted: `signedRequest` is not verified (no server).
- **Unverified** P1, P3–P7 (only P2 and P8 are confirmed). G5 decides `grantBeforeConsume` and `removeAdsMode`.

### 3.4 Keys and tests

`iap.{readyTimeoutMs 5000, catalogCacheMs 600000, tokensKept 50, grantBeforeConsume true, removeAdsMode 'consume', catalog, retired, products (@deprecated)}`. Flag: `shop`. Tests: `tests/unit/app/shop-flow.spec.ts`, `product-name.spec.ts`, `tests/unit/game/purchases.spec.ts`, `tests/unit/platform/fb-payments.spec.ts`, e2e `fbig.spec.ts` "FBIG purchases" (shop from Settings, hints_15 +15 consumed once, remove_ads kills interstitial and banner, iOS no Shop row, Messenger no Shop row, retired fish_250 restore) and "FBIG banner under modals and No Ads"; e2e `smoke` 4c (no shop on the web).

---

## 4. Daily streak

**Nothing exists.** There is no day streak, login streak, streak counter, streak reward, streak freeze or streak UI on any platform.

What does exist and could be confused with a streak, or reused:

| Thing | What it is | Status |
|---|---|---|
| `save.streak {current, best}` (`src/game/types.ts` `StreakRecord`) | The 2c **cross-level perfect-win streak** ("Perfect ×N") | **Retired in 2c.1** (D19): frozen, never read or written. Still validated and merged so v3 saves parse |
| `GameState.catStreak` | Correct cats in a row **inside one level** (the level-points run, 96 × (5 + s)) | Live, but per attempt only |
| `levelPoints.streakStep` / `streakCap` | 2c per-win streak bonus | `@deprecated`, unread |
| `save.daily[YYYY-MM-DD] = [ms, mistakes, hints, kitties]` | One record per solved daily date, never pruned, union-merged across devices | **Usable as the data for a daily-solve streak** (consecutive dates with a record). No code derives one today |
| `save.sessions`, `save.firstSeenAt` | Boot counter; first-seen time (interstitial tenure) | No last-played date and no consecutive-day logic |

Docs: 02 §12 "No replay and no past days in Phase 2. A calendar and streaks are Phase 3 hooks". 02 §22 lists "a daily calendar and streaks" as Phase 3 hooks. 01 §10.10 says the original's daily streaks, calendar, rewards and reset time are **unknown**. 01 §19 lists the daily structure as an open question.

---

## 5. Daily challenge (our "Daily puzzle")

### 5.1 Content (`src/data/daily/YYYY-MM.json`, `scripts/gen-daily.ts`, `src/game/ramp.ts`, `src/game/progression.ts`, `src/game/levels-repo.ts`)

- **27 monthly packs, 2026-10 … 2028-12 (823 days)**, listed with sha256 in `src/data/levels/manifest.json` and fetched per month at runtime (not bundled). For a missing or invalid month (2029+), the daily is **generated on the device** in the worker from seed `mewdoku:daily:v1:YYYY-MM-DD`, with the same spec, so every player gets the same board.
- **Size by weekday of the date string**: Mon 8×8 ≤G3 · Tue 8×8 G3 · Wed 9×9 ≤G3 · Thu 9×9 G4 · Fri 10×10 ≤G3 · Sat 10×10 G4 · Sun 11×11 G4, **except every second Sunday from 2026-10-18: 12×12 G4** (`DAILY_12_FROM`, `isTwelveSunday`). Pack totals: 8×8 234, 9×9 235, 10×10 236, 11×11 60, 12×12 58.
- One puzzle per **local calendar date** (`localDateKey`), id `D<date>`.

### 5.2 How it is reached

- **Only the Home daily card** ("Daily puzzle · {date}", "{n}×{n} · status", calendar icon). States: **locked** "Unlocks after level 20" (a tap toasts "Solve level 20 to open the daily puzzle"; unlocked iff `progress.level > daily.unlockAfterLevel` 20) · **not played** · **in progress** · **solved m:ss** (a tap reopens O7 `daily_result`: time, mistakes, hints, "Next puzzle in …"). The daily card shows on web and FBIG alike.
- **No calendar, no past days, no replay** of a solved daily. No notification or reminder. No share.
- Its own save slot (`inProgress.daily`), so a level never discards it. The slot is cleared when Home is shown on a later date. Midnight during play: the board is credited to its original date.

### 5.3 Rules and win

- Same rules as levels (`MODES.daily`): 3 fish, 1 revive, hints, kitty and mouse charged from the shared stock (videos when out). The timer runs but is **not shown while playing**.
- Win flow = the level win flow: fish fly to the weekly counter, the **ranking panel shows the weekly period board** (no daily board), then the **victory screen, daily variant**: "Solved in m:ss", mistakes and hints, "Next puzzle in …" countdown, **Done** → interstitial gate `daily_done` → Home.
- Fail: O4 as in levels. Retry gives the same daily fresh. Home discards the attempt.

### 5.4 Rewards

- **No daily-specific reward**: no hints, kitties, trophy or badge.
- A counted (first) daily win adds the **fish kept to the weekly leaderboard** (`period.modes` includes daily) and the daily's **level points** to the lifetime total (`levelPoints.modes`). It also records `save.daily[date]` (best of [ms, mistakes, hints, kitties]). It does **not** count toward `progress.completed` (no effect on the ad gates).
- The 2b "+2 fish daily bonus" (`fish.dailyBonus`) and `points.daily` 15 are `@deprecated` and unread.

### 5.5 Daily leaderboard

`daily_fastest` (today's fastest time, local-date band, classic paging past later time zones) is fully built and tested but **switched off** (`rank.dailyBoard: false`). Its "Today" hub tab and its submission are off with it. Turning it on also needs the dashboard board and the `VITE_FB_LEADERBOARDS` entry. Docs note a research claim (01 §6.9, search summaries, single source) that the original's **daily-ranking top places pay 2 hints + 2 kitties**. Nothing like it is built.

### 5.6 Adjacent: limited-time events

Built and on. Lantern Walk 2026-11-13→27, Snow Paws 2026-12-18→2027-01-08, Yarn Hearts 2027-02-05→19. Each has 21 puzzles, unlocks after level 10, gives milestone rewards in hints and kitties, and has its own event board. They are reached from the Home event card. They are not the daily, but they are the closest thing we have to a "challenge" with a calendar.

### 5.7 Keys and tests

`daily.{unlockAfterLevel 20, firstPackMonth '2026-10'}`, `levels.fetchTimeoutMs` / `fetchRetryDelaysMs` (the month fetch), `rank.dailyBoard`, `rank.dailyEpoch`, `period.modes`, `levelPoints.modes`, `ads.interstitial.triggers` (`daily_done`). Tests: `tests/unit/game/progression.spec.ts`, `levels-repo.spec.ts`, `tests/property/levels.spec.ts` (daily packs), e2e `smoke` 8 (locked before 20), 11 (level and daily both restored), 13 (slow month fetch).

---

## 6. Gaps against the request "same as Meowdoku" (from our side only; the original's facts are in 01)

1. **Leaderboards**: the weekly fish board matches the user's first-hand F2. The period length and reset time are our default (UTC week); 01 §19 still lists them as unknown. On FB Home, the period pill and the trophy button show side by side (STATUS-2c §8). Everything FB-side is unverified (G1 API, G3 overlay names). The web has records only.
2. **Banner "always there"**: built for play on FBIG, but only from 10 completed levels. It is not re-shown on the same board after a video, Settings or Shop, so the board after an interstitial is often bannerless (code reading). It is a policy risk (Q5/G4) and absent on the web.
3. **Interstitial**: matches the reported cadence (from 10 completed levels; 120/100/90 s by tenure; after level transitions and retry). The start level is configurable (`minCompletedLevels`). The original's start level is reported variously as ~10, 12, 30, 50 or 60 (01 §11.5).
4. **Rewarded when out of helpers**: built for hint, kitty and mouse (O2 first, then video) and for revive. No caps. The web gets a free grant every 10 min instead.
5. **IAP during play**: products exist (hints_15, kitties_8, remove_ads) but are **only reachable via gear → Settings → Shop**. O2 has no Buy button, and there is no mouse product. Payments only on FB facebook.com / Android.
6. **Daily streak**: missing entirely. `save.daily` already holds the per-date history a streak could be derived from.
7. **Daily challenge**: one daily per local date, through 2028-12 plus on-device generation after that. No calendar, no past days, no daily reward and no daily leaderboard (off).

## 7. Release gates touching these features (STATUS-2b §8, fb-dashboard §8, STATUS-2d §14/§15)

- Meta dashboard: placements (interstitial, rewarded, banner), the boards (`fish_week_v1` + event boards; `daily_fastest` only if enabled), the 3 products, the `VITE_FB_*` values.
- G1 (leaderboard API, L1–L6), G2 (tournaments; `groupChallenges` stays off), G3 (overlay views; `overlayPlacement`), G4 (banners B1–B9, incl. **banner during play**, Q5), G5 (payments P1–P7), G6 (interstitial frequency vs. 120/100/90 s).
- Not one FB item has been checked on developers.facebook.com or a device (no access from this environment). The e2e suite runs them against our `tests/fixtures/fbinstant-stub.js`.

## 8. Files read

Code: `src/app/{config,flags,ad-flow,banner-flow,helper-flows,shop-flow,ranking-flow,rank-hub-flow,session,session-transitions,session-effects,shell,views,boot,win-flow}.ts`, `src/game/{ad-pacing,economy,purchases,progression,modes,scoring,stats,types,ramp,levels-repo,save}.ts`, `src/platform/types.ts`, `src/platform/web/{index,mock-ads}.ts`, `src/platform/fb/{index,fb-ranking,fb-probe,fb-payments}.ts`, `src/ui/overlays/{rewarded-prompt,shop-sheet,rank-hub,ranking-panel,daily-result,victory-screen,fail-overlay}.ts`, `src/ui/screens/home-screen.ts`, `src/ui/hud/{tool-bar,top-bar}.ts`, `src/data/daily/*.json` (shape), `src/data/levels/manifest.json`, `src/data/events/events.json`, `scripts/gen-daily.ts`, `src/i18n/en*.ts` (strings).
Docs: `docs/phase1/{01 (sections 10, 11, 19 only), 02 §12–§13, 05 §6, §8, §9, 06 §4 (the list only)}`, `docs/phase2b/{parity-spec §3, §5, §8, STATUS-2b §7–§14, fb-dashboard}`, `docs/phase2c/{fish-lives-spec §0, §4, §5, STATUS-2c §1, §8, §10.9}`, `docs/phase2d/STATUS-2d §1, §9, §14, §15, §19`.
