# Phase 2e gap analysis: leaderboards, ads, purchases, daily streak and daily challenge vs Meowdoku

Status: **analysis only**, not a spec. No code, test, config or other doc was changed. Written 2026-10-10 on `claude/mewdoku-instant` @ `9b171ed` (Phases 2, 2b, 2c, 2c.1, 2d, 2d.1 done). Owner: lead. Next step: the user answers [§8](#8-decisions-for-the-user) and the material list (M1–M12, also sent as a short plain-words list). Then the lead writes `docs/phase2e/spec.md` and the parts marked "start now" in [§7](#7-proposed-build-plan) can begin.

---

## 0. Read me first

### 0.1 The user's request (verbatim)

> "We need to create:
> 1) Leaderboards - same as in Meowdoku
> 2) Video Ads - Banner during level (always there), Interstitial (after every level starting after level some later level - same as in Meowdoku, Rewarded Video (when out of helpers during play)
> 3) InAppPurchases - option to buy helpers during play
> 4) Daily Streak - same as in meowdoku
> 5) Daily Challenge same as in Meowdoku"

Items 1, 4 and 5 and the interstitial in item 2 ask for "same as Meowdoku". The banner and the rewarded video in item 2 are described in the user's own words. **Item 3 does not say "same as Meowdoku"**, which matters because there is no evidence that the original sells helpers at all (§3.c).

### 0.2 Inputs and how far to trust them

Three research notes were made for this phase and are summarised here with their fact IDs. The notes stay in the lead's scratch folder and are not in the repo.

- **Ours:** what the build at `9b171ed` does, from the code and our docs. "(code reading)" means it was traced in the source but not run.
- **The original (orig IDs L, B, I, R, P, S, D):** public sources on Oakever's app only (App Store id 6761760135, Play package `com.oakever.meowdoku`). **Every web fact comes from search-engine summaries.** Page fetches failed (DNS errors, and the App Store was refused by the proxy), so no page was read directly. First-hand facts from the user keep their earlier tags (01).
- **The platform (FB IDs A, P-, L-, PD, risks R-\*):** Meta's documentation could not be opened directly either. The proxy refused developers.facebook.com, so each Meta fact comes from search summaries and is tagged **[S]** (one summary) or **[S×2]** (two or more agreed). Meta's own Unity plugin (SDK 8.0, last commit 2026-06-01) and its Zero Permissions samples were read first-hand.

Confidence words, as in 01: **confirmed** means official text, the user's first-hand report, or several independent reports that agree. **likely** means one good source, or reports that partly disagree. **unknown** means not found. *(inference)* marks our own deductions.

### 0.3 Three platform findings that shape everything below

1. **Facebook's global leaderboards may no longer exist.** One summary of Meta's leaderboards page says they were removed on 2025-12-31, with no replacement, and that calls now reject. Only per-chat or per-group ("contextual") boards remain (FB L-a). This is a single source: four follow-up searches could not find that sentence again. It is consistent with the 2026 plugin, which has no leaderboard API (FB L-c). If it holds, a Meowdoku-style worldwide ranking **cannot be built on Facebook's APIs**. Gate **G1**.
2. **Facebook is retiring banner ads.** Fill has been falling since April 2026, and banners stop completely on **2027-03-31**. Meta also advises hiding banners during gameplay (FB A1, A5, [S×2]). Gate **G4**.
3. **Purchases work in the Facebook iOS app** (since 2024-09-16, FB P-b, [S×2] plus press), but our probe switches them off on iOS (R-P1). No subscription product type was found on Facebook either (FB P-f, likely, from absence). Gate **G10**.

### 0.4 Clean room and honesty (unchanged rules, plus one proposed decision)

- No source on the 06 §4 list was opened for this analysis.
- **Proposed D-2e-0 (needs the user's OK):** the user's new screenshots and recordings fall under the same terms as D-2d-0 and D-2d1-0 ([look-spec §0.1](../phase2d/look-spec.md), [helpers-spec §0.1](../phase2d/helpers-spec.md)):
  - We may measure numbers, timings, the order of screens and reward amounts.
  - No tracing. No file of the original enters the repo. Only our own art and words.
  - Facts are recorded in 01 as "first-hand (user recordings, date)".
- **No fabricated rows, player counts or statistics.** This rule has held since Phase 2b ("never a fabricated row", ranking panel). It affects the leaderboard most, because players believe the original's rivals are bots (orig L7).
- Features of look-alike apps (streak calendars, 7-day reward cycles, share cards; orig §8) are **not evidence** and are never built as "the original's".

### 0.5 Platform columns

- **web-prod:** the production web build, with no ad network and no payments.
- **FBIG:** the FB adapter on facebook.com and the Android FB app. Each FB feature also needs its `VITE_FB_*` value and the SDK probe. **None of it has been checked on Meta's side** (gates G1–G6).
- **FB iOS / Messenger.com:** no payments in our build today. Everything else behaves as on FBIG.

---

## 1. Leaderboards

### 1.a The ask

"Leaderboards - same as in Meowdoku".

### 1.b What we have today

| Part | web-prod | FBIG | State |
|---|---|---|---|
| **Main board** `period_points` (suggested dashboard name `fish_week_v1`). It ranks fish (lives) kept at each counted win (level, daily, event), summed over a **UTC week from Monday 00:00**. Posted score = `periodIndex × 100 000 + total` | Personal records | Tries classic `getLeaderboardAsync`, then NEZP `globalLeaderboards`, else none. Needs `VITE_FB_LEADERBOARDS` | **Built.** FB side unverified (G1 API, G3 overlay names) |
| **Submission:** at the win, one batch per counted win (first win of a level, first daily win for its date, or first win of an event puzzle) with fish > 0. No submit under 3 s or over 24 h, at most one batch per 10 s, and anything held back goes into `rank.pending`, retried on the next win and at boot | n/a | Built | Built |
| **Post-win ranking panel after every scored win:** fish fly to a counter, then the panel shows this week's board. Its list states are "Your rank #N" (classic) or "Your score" (NEZP), plus "See top players", which opens FB's full-screen overlay view (top 10). Other players' names appear only inside FB overlay views | Personal records (this week, best week, total points, levels solved) | Built | Built |
| **Home:** a period pill ("42 fish this week", **not a button**). On FBIG only, a trophy button opens a hub with the tabs This week / Today (off) / Event / Groups (flag off) | Pill only | Pill and trophy ("two trophies", open since [STATUS-2c §8](../phase2c/STATUS-2c.md)) | Built |
| **Event boards:** one per event (Lantern Walk, Snow Paws, Yarn Hearts), shown in the event screen's "Top list" | Personal results | Built | Built, unverified |
| `daily_fastest` (fastest time today) | n/a | Code kept, **off** (`rank.dailyBoard: false`) | Off |
| Rank rewards, hearts, a ~50-player group | — | — | **Missing** |

Keys: `rank.*`, `period.*` (`kind 'week'`; `'day'` exists and means a **UTC** day), `levelPoints.*`; flag `rankings`; env `VITE_FB_LEADERBOARDS`.

### 1.c What the original does

| # | Fact | Conf. | Source |
|---|---|---|---|
| L3 | It ranks the **fish (lives) kept at each win, added up** over the period | **confirmed** | user, first-hand, 2026-10-09 (01 §10.16); [unstar]; [appreview-jp] |
| L4 | The ranking is **shown after every win** (between the fish and the victory screen) | **confirmed** | [hrafsa], [leist] (01 §7.1.2); [appreview-jp] |
| L1 | It is a **daily** competition, 24 h, among **about 50 players** | likely | [chie-heart]; [as-rev-gb]; [as-jp-rev] |
| L2 | The 24 h seem to start at the **player's own first play that day**, not at a fixed hour | likely (several JP reviews) / unknown (exact rule) | [appreview-jp] |
| L6 | **1st place pays 2 kitties + 2 hints**, and a rewarded video doubles it to 4 + 4. The doubling often failed, and the developer apologised for that bug. A forum tip says the **top 3** are paid. Amounts for 2nd and 3rd place are unknown | confirmed (1st) / likely (top 3) / unknown (2nd–3rd) | [as-rev-gb]; [as-rev]; [as-ipad]; [worldsapps-disc] |
| L5 | Each row has a **heart counter** ("likes"). What hearts do is unknown | likely / unknown | [chie-heart]; [appreview-jp] |
| L7 | Players believe the rivals are **bots**; the developer calls it "additional content". Whether that is true is unknown | likely (claims) / unknown (truth) | [as-rev-hr]; [unstar]; [appbrain] |
| L8 | Added without notice in a **late-July 2026** update. No ranking history can be viewed | likely | [as-jp-rev]; [appreview-jp] |
| L9 | No friends board, tabs, or weekly or all-time view was found. The store text still promises "global leaderboards" for fastest times, which no longer describes the ranking | likely (no tabs) | [as]; [leist] |

### 1.d Platform constraints and risks

- **R-L1 (high, single source):** global boards were removed on 2025-12-31 (FB L-a). Every board we planned is global: `period_points`, `daily_fastest` and the event boards. If the removal is confirmed, the FB build would fall back to personal records, which is safe but has no other players.
- **R-L2 (medium):** we latch a board as missing only on `LEADERBOARD_NOT_FOUND`. If removed boards reject with another code, the Home trophy keeps showing, every panel open spends a failing call (bounded to 3 s), and the pending score is retried after every win.
- **What remains on Facebook:**
  - **contextual boards**, one per chat or group, named `<board>.<contextID>`, with scores set only from that context;
  - **tournaments**, where standings are shown in FB's own UI and no standings API was found (FB L-f).
  - Our tournament payload `{initialScore, config, data}` is now confirmed by Meta's plugin (R-T1).
- **Zero Permissions** (mandatory for games created from 2025-08-01): other players' names and photos show only inside FB overlay views. Meta's sample binds only the current player's name (FB L-e), so strangers appear without names.
- **A real ~50-player room** like the original's would need our own server: it matches players, holds scores and serves ranks. Whether the game may call an external HTTPS API under FB's content security policy is still unknown (05 §5.3).

### 1.e Gaps to close

| ID | Gap | Depends on |
|---|---|---|
| GAP-L1 | **Period:** the original is daily (likely), possibly a per-player 24 h window. Ours is a UTC week. Our `period.kind: 'day'` exists but means a UTC day, and a per-player window is not supported | M1, M2, M11 |
| GAP-L2 | **Who you rank against:** the original shows about 50 others. Ours is a worldwide board on FB (likely gone, R-L1) or personal records on the web | G1; decision U2 |
| GAP-L3 | **Rank rewards** (1st = 2 hints + 2 kitties, ×2 by video; top 3 likely): none built. They need a rank that is real (§0.4) | U2; M2 |
| GAP-L4 | **Panel contents:** row count, per-row contents, my row, countdown, title. The original's panel is undocumented. Ours shows my rank or score, then FB's top-10 overlay | M1 |
| GAP-L5 | **Hearts:** none built; their function is unknown | M3; U2 (needs a server) |
| GAP-L6 | **Other ways in:** the original's Home entry, if any, is unknown. Our FB Home has the pill and the trophy side by side | M1 |
| GAP-L7 | **Robustness:** R-L2 latch | none (start now) |

### 1.f Material we need from the user

- **M1:** the post-win ranking panel (screenshots of the whole list), the fish before and after one win, and any other way to open it.
- **M2:** what appears when the ranking period ends (result or reward screen, claim and ×2 offer), with clock times. Also what 2nd or 3rd place paid, if they ever got it.
- **M3:** tapping a heart on someone else's row.
- **M10, M11:** whether a daily win raises the ranking total, and the clock time the ranking resets.

### 1.g Provisional design (for anything the user cannot provide) `[PROVISIONAL]`

- **2e-L1 Period.** Switch to **daily** once M1, M2 or M11 back it. Until then keep the week. The personal view uses the player's **local** date, as the daily puzzle and the streak do. Any shared FB board uses a **UTC** day, because the score encoding needs one calendar for everyone. A per-player 24 h window is only possible with route D below.
- **2e-L2 Route** (user decision **U2**; this analysis recommends A now, with B or D on top):
  - **A. Personal daily ranking** (no server; web and FB). Shows today's fish, your best day and your last 7 days. It is the fallback in every route and the default until G1 is settled. It has no rank, so it pays no rank reward.
  - **B. FB contextual daily board.** When the game is played in a chat or group, there is one board per context, with names inside overlay views. These are real players, but solo players see A. Needs G1.
  - **C. FB tournaments.** Already built as "group challenges" (flag off). FB shows the standings, so we cannot read a rank and cannot pay rank rewards.
  - **D. Our own server.** Daily rooms of up to 50 real players, with pseudonymous cat names (never real names under Zero Permissions). It allows top-3 rewards, hearts and a per-player 24 h window. It is the closest to the original but the largest effort: hosting, privacy notice, basic anti-cheat and the CSP check.
  - **E. Computer rivals.** Only acceptable if every such row is plainly labelled as a computer cat and no player count is claimed. It conflicts with our standing rule against fabricated rows, so this analysis does **not** recommend it, and it is listed only so the user can decide.
- **2e-L3 Rank rewards.** Paid only where a real rank exists: route B with at least a minimum number of real players, or route D. 1st place gets 2 hints + 2 kitties, and an optional video doubles it (a new `rank_double` rewarded placement). 2nd and 3rd place wait for M2. Route A pays nothing.
- **2e-L4 Hearts.** Not built until M3 shows what they do and a server exists.
- **2e-L5 Home.** The period pill becomes the button (opening the hub on FB and the records on the web), and the second trophy goes. This closes the STATUS-2c §8 item.
- **2e-L6 (start now)** Fix R-L2: latch a board on any rejection that is not a network error, or after two consecutive failures.

---

## 2. Video ads

### 2A. Banner during the level ("always there")

**(a) The ask:** "Banner during level (always there)".

**(b) What we have today**

| | web-prod | FBIG |
|---|---|---|
| Where | none (no ad network, by design) | Home, victory, event screen **and the game screen** (`ads.banner.duringPlay: true`, D-2d-15) |
| From when | — | **10 completed levels** (the tutorial counts as 1), so the first banner shows on level 10's victory or level 11's board. Never in the tutorial, never with No Ads |
| Hidden | — | Under the hint card, and it returns when the card closes (matches the original, D-2d1-13). Also hidden before every video, under Settings, Shop, the rankings hub and the ranking panel, and on leaving to Home or the event screen |
| Reload | — | At most one load per 60 s (Meta's limit is 45 s). A screen that mounts inside that window **skips** its load |
| **"Always there"?** | — | **No (code reading).** After any hide other than the hint card's, the banner returns only on the **next** screen, and only once 60 s have passed since the last load. Example: the victory loads a banner, the "Level N+1" interstitial hides it, the next board mounts less than 60 s after that load, and that board stays bannerless |

Dev and e2e builds show a mock 320 × 50 bar. Keys: `ads.banner.*`, env `VITE_FB_PLACEMENT_BANNER`, flag `banners`.

**(c) What the original does**

| # | Fact | Conf. | Source |
|---|---|---|---|
| B1 | A **320 × 50 banner at the bottom during play**, centred under the helper buttons. Reviews describe a permanent bottom banner | **confirmed** | user recording, 2026-10-10 (01 §11.12); [unstar]; [as-rev] |
| B3 | **Hidden while the hint overlay is open**, with a fresh ad after it closes. **No banner** showed in two level-start stills 8 s apart (Level 114) | confirmed (seen) / unknown (rule) | user recordings, 2026-10-10 |
| B2 | Banners start at **level 10** | likely (one analyst) | [braberg]; [gam-tenure] |
| B5 | Banners on Home, victory or the ranking screen | unknown | — |

**(d) Platform**

- **Retirement:** fill has been declining since April 2026, and banners stop on 2027-03-31. No code change is needed when that happens; the slot simply stays empty (FB A1, [S×2]).
- **Guidance:** Meta advises **hiding banners when gameplay begins** (FB A5, [S×2]). This is guidance; no enforcement rule was found (R-A1). Gate G4 (open question Q5 since 2d).
- **Mechanics:** `loadBannerAdAsync` loads **and** shows, with one load per 45 s (FB A2, A4). The banner is a native view over the game, so the band stays reserved even when no ad fills.
- **Setup:** no ads are served before Audience Network approval and payout setup (FB A12).

**(e) Gaps**

- **GAP-B1:** the banner does not return on the same board after a video, Settings or Shop (the code-reading finding above).
- **GAP-B2:** the original showed **no banner at level start** in both stills. Either it waits a moment, or it shares our reload window. This conflicts with "always there" (M5).
- **GAP-B3:** the first banner's level. Ours is 10 completed levels; the original is likely 10, but this is not first-hand (M4).
- **GAP-B4:** policy and retirement (decision **U1**).
- **GAP-B5:** the web has no banner, by design and out of scope.

**(f) Material:** M4 (first banner on a fresh install) and M5 (banner present at level start, after an ad, and on Home and victory).

**(g) Provisional** `[PROVISIONAL]`

- **2e-B1 (start now):** after **any** hide on the game screen, show the banner again once the 45–60 s window allows, using one timer. This generalises the hint card's path. The band stays reserved from 10 completed levels on.
- **2e-B2:** keep `duringPlay` on, which is the user's ask, unless U1 says otherwise. Recommended: **plan** `ads.banner.enabled: false` for FB at 2027-03-31. That is a config flip that removes the band so the board grows, and it needs no new layout work for the band.

### 2B. Interstitial ("after every level, starting after some later level, same as Meowdoku")

**(b) What we have today (FBIG only; web-prod has none)**

- **Triggers:** the victory's "Level N" tap (`next_level`), O4 Retry (`retry`), daily Done (`daily_done`) and event next (`event_next`). The ad comes after the tap and never during the win flow.
- **Gate, in order:**
  1. No Ads not owned;
  2. the capability;
  3. at least **10 completed levels** (dailies do not count);
  4. **60 s since the page loaded**;
  5. a cooldown since the last ad of **120 s on tenure days 0–1, 100 s on days 2–6, and 90 s from day 7**. A completed rewarded video also restarts the cooldown.
- **Never:** on opening, during play, on the tutorial's "Play Level 2", on Home, or on O4 Continue.
- **Result:** an ad after most level transitions past level 10, **not literally every level**. A quick level inside the cooldown gets none.
- **Keys:** `ads.interstitial.*`; env `VITE_FB_PLACEMENT_INTERSTITIAL`.

**(c) What the original does**

| # | Fact | Conf. | Source |
|---|---|---|---|
| I3 | After the start, ads come **after almost every level** | **confirmed** | [ac]; [as-rev]; [unstar]; [appshunter] |
| I6 | **None during play** | **confirmed** | [as]; [gp] |
| I1 | From **level 10**, after wins **and** losses. The cooldown by tenure is 120 s (days 0–2), 100 s (days 2–7) and 90 s (from day 7), probably set remotely | likely (one origin) | [braberg]; [gam-tenure]; [sett] |
| I2 | **Player reports of the start disagree:** level 11, about 30–40, about 50, 60–100, or ad-free for about a week. That pattern fits server-side tuning *(inference)* | confirmed (a grace period exists) / unknown (level) | [appreview-jp]; [as-rev]; [as-ipad]; [x-anze] |
| I4 | Also on **Retry** (about every second retry for one reviewer) and **after declining a revive** | likely | [as-rev]; [appreview-jp]; [as-ipad] |

**(d) Platform**

- Interstitials at natural breaks are fine (FB A6), and no numeric frequency cap is published (FB A7). "After every level" is therefore our choice, with gate G6 still to confirm.
- Meta asks for **at least 30 s between loads of one placement** and a **30–60 s** retry after a no-fill (FB A8, A9). Our first retry is 5 s, and we reload at once after every show (R-A3, low).

**(e) Gaps**

- **GAP-I1:** the start level. Ours is 10, which matches the analyst. Players report later starts, and only the user's own fresh install can settle it (M4).
- **GAP-I2:** cadence. Our cooldown skips quick levels. If the user wants literally every level, the cooldown can be lowered in config, with the 30 s load floor still applying. M5 shows whether the original also skips quick levels.
- **GAP-I3:** "after declining a revive". Our O4 has no ad on Home, only on Retry (M6).
- **GAP-I4:** R-A3, the reload timing.
- Our tenure boundaries (0–1 / 2–6 / 7+) match the source within its own ambiguity ("0–2", "2–7").

**(f) Material:** M4 (the level after which the first full-screen ad appeared), M5 (ten levels in a row: which ones had an ad, including quick ones and a Retry) and M6 (an ad after declining a revive).

**(g) Provisional** `[PROVISIONAL]`

- Keep the start at 10 and the 120/100/90 s cooldown until M4 and M5 arrive. Both are config values.
- Add no `revive_declined` trigger until M6 shows one.
- **Start now:** apply R-A3 (start the backoff at 30 s, with a 30 s floor per placement between loads).

### 2C. Rewarded video ("when out of helpers during play")

**(b) What we have today**

| Placement | When | Grant | web-prod |
|---|---|---|---|
| `hint` | Bulb at 0, which shows a green video badge | The O2 card ("Watch video / Not now"), then **+1, used at once** | **Free fallback:** one free grant every 600 s, **shared** by hint, kitty, mouse and revive, else a countdown card |
| `kitty` | Kitty at 0 | Same: +1, used at once | Same |
| `mouse` | **Every** use (no stock) | O2, then the mouse crosses out 3 tiles | Same |
| `revive` | O4 "Out of fish", then Continue | **+1 fish**, at most once per attempt | Same; Continue is hidden during the countdown |
| `group_double` | Group-challenge result | 4 kitties instead of 2 | flag off |

There are no daily caps, and **one** placement ID serves all of these uses. A grant needs the video watched to the end; otherwise the toast "No videos right now — try again soon." shows. Keys: `ads.rewarded.*`, `hints`, `kitty`, `mouse`, `revive`; env `VITE_FB_PLACEMENT_REWARDED`.

**(c) What the original does**

| # | Fact | Conf. | Source |
|---|---|---|---|
| R1 | At 0 a helper shows a green play badge and is **refilled by video**. How many per video, and whether a prompt comes first, is unknown | confirmed / unknown (amount, prompt) | user recordings, 2026-10-10 (01 §6.14); [apps-island]; [ac] |
| R2 | **Mouse: always a video** | confirmed | user recordings, 2026-10-10 (01 §6.10) |
| R3 | **Revive by video** after losing all lives. The fish restored and the limit per level are unknown | confirmed / unknown (size, limit) | [as-rev]; [yt-revive]; [appreview-jp] |
| R4 | A video **doubles the rank reward** (§1.c L6) | confirmed | [as-rev-gb]; [as-ipad] |
| R5 | Rewarded videos from level 1 | likely | [braberg] |

**(d) Platform:** this is Meta's recommended use. Meta reports typical fill of 90–99 % in major markets and lower elsewhere, so the no-fill path matters (FB A8). Separate placements per use avoid "loaded too often" errors and give per-placement revenue figures (R-A4, gate G11).

**(e) Gaps**

- **GAP-R1:** the amount per video (ours is +1) (M7).
- **GAP-R2:** a prompt first, or the video at once (ours: prompt first; 2d.1 Q14) (M7).
- **GAP-R3:** fish restored by a revive and revives per level (ours: +1, once) (M6).
- **GAP-R4:** what the original shows when no video is available (M7, airplane mode).
- **GAP-R5:** a `rank_double` placement, only if a route with rank rewards is chosen (§1.g).
- **GAP-R6:** per-helper placement IDs (R-A4).

**(f) Material:** M6 and M7.

**(g) Provisional:** keep as built. **Start now:** optional per-helper placement env values that fall back to the shared ID (R-A4).

---

## 3. In-app purchases ("option to buy helpers during play")

### 3.a The ask

"InAppPurchases - option to buy helpers during play". Unlike items 1, 4 and 5, this is **not** asked as "same as Meowdoku".

### 3.b What we have today

| Part | web-prod | FBIG (facebook.com, Android) | FB iOS / Messenger.com |
|---|---|---|---|
| **Products** (all consumable): `remove_ads` No Ads ($3.99 default; kept as `purchases.noAds`), `hints_15` Bulb Bundle (+15, $1.99), `kitties_8` Kitty Basket (+8, $1.99). Prices are set in the dashboard | none | built | iOS: off in our probe. Messenger.com: the shop shows only during the first 5 s |
| **Entry:** Settings → Shop, or Remove ads. **During play, the only way in is gear → Settings → Shop. The out-of-helpers card (O2) has no Buy option** | — | built | — |
| **Flow:** record the token, grant, save to the cloud, then consume. Unconsumed purchases are restored automatically at boot. There is no Restore button, refunds revoke nothing, and nothing is checked on a server | — | built, unverified (G5) | — |
| No mouse, lives or subscription product | | | |

Keys: `iap.*`; flag `shop`.

### 3.c What the original does

| # | Fact | Conf. | Source |
|---|---|---|---|
| P1 | **iOS sells only subscriptions:** Premium at $3.99/wk, $7.99/mo or $34.99/yr, and Premium Plus at $6.99/wk, $14.99/mo or $69.99/yr. **No helper pack and no one-off Remove Ads** are listed | confirmed (list) | [as]; [as-gb-ipad]; [as-jp] |
| P2 | What Premium and Premium Plus include | **unknown** | — |
| P4 | Android: the listing is flagged "In-app purchases", but the catalogue is not visible anywhere | confirmed (flag) / unknown (catalogue) | [gp]; [applion-and] |
| P5 | **No evidence that the original sells hints, kitties or mice**, during play or anywhere. The developer says it is passing on requests to "buy hints/cats" | likely (requests) / unknown (exists) | [as-ipad]; [as-rev] |
| P6 | Fish are not sold | confirmed | user, first-hand, 2026-10-09 |

### 3.d Platform

- **Where purchases work:** facebook.com, Android, and **iOS since 2024-09-16**, but **not Messenger.com** (FB P-b). An older line in Meta's launch checklist says iOS players must not see payments, so the current text must be read first (R-P2, gate **G10**).
- **Approvals before anything can be sold** (FB P-d; R-P5, Phase 4):
  - **Audience Network approval, even with no ads;**
  - business verification;
  - a payout account;
  - a separate **purchase review**, which needs item descriptions and **screenshots or a video of the purchase flow**.
- **Product types:** only consumables were found, and **no subscription type** (FB P-f, likely, from absence in the 7.1 typings and the 2026 plugin), so the original's Premium subscriptions very probably cannot be copied here. The closest is a one-off No Ads, which we already have.
- **Order:** Meta's wording is consume first, then grant. Our ledger makes both orders safe; the switch stays and is mentioned to the reviewer (R-P3).
- `purchaseAsync` works at any time after `startGameAsync` (FB P-g). Whether FB pauses the game while its payment dialog is open is unknown, so we pause it ourselves (R-P4).

### 3.e Gaps

- **GAP-P1 (main):** there is no Buy option at the moment a helper runs out (O2).
- **GAP-P2:** iOS is excluded by our probe (R-P1, G10).
- **GAP-P3:** there is no mouse product. The mouse has no stock and always costs a video, and so does the original's (decision **U4**).
- **GAP-P4:** game time, input and audio are not paused while FB's payment dialog is open.
- **GAP-P5:** the purchase review needs a recording of the in-play flow (Phase 4 checklist).
- **GAP-P6:** "same as Meowdoku" would mean subscriptions, which FB does not appear to support (information for the user only).

### 3.f Material

- **M7:** whether the original ever offers a purchase when a helper is at 0.
- **M8:** any shop, Premium or No Ads screen with prices and contents. On iPhone this means the Premium paywall and where it pops up.
- The rest is decisions **U3** (iOS) and **U4** (packs, prices, mouse).

### 3.g Provisional `[PROVISIONAL]`

- **2e-P1 (start now): a Buy row on O2.** When payments are ready and the catalogue has the product, the out-of-hints card offers **[Watch video] [Buy 15 · {price}] [Not now]**, and the out-of-kitties card offers the 8-pack. The price is the catalogue's localised price, never one we type.
  - **After a purchase:** the stock rises by the pack, and **one is used at once**, as on the video path, because the player tapped the helper to use it.
  - **While FB's dialog is open:** board input is locked, the hidden game timer (which matters for the daily's time) is paused, and our audio is muted.
  - **On cancel:** back to O2. **On failure:** our existing toast.
  - **On the web, on Messenger.com after 5 s, or without payments:** no Buy row, the rest unchanged.
- **2e-P2:** keep the Settings → Shop entry. No mouse product unless U4 says so (it would be a new product id, a new mouse stock, a badge change and a dashboard entry).
- **2e-P3 (start now, default off):** a config switch (`iap.iosEnabled`) that replaces the hard-coded iOS exclusion with `getSupportedAPIs()` plus `onReady`. It stays off until G10 confirms iOS purchases and U3 agrees.
- **Prices:** keep $1.99 / $1.99 / $3.99 as dashboard placeholders until U4.

---

## 4. Daily streak ("same as in Meowdoku")

### 4.a The ask

"Daily Streak - same as in meowdoku".

### 4.b What we have today

**Nothing**, on any platform: no day streak, login streak, reward, freeze or UI. Some existing things look related but are not a day streak:

- `save.streak` is the retired 2c "perfect-win" streak, frozen and still parsed.
- `catStreak` counts correct cats in a row inside one level.
- `save.sessions` and `save.firstSeenAt` hold no last-played date.

What could be reused: `save.daily[date]` keeps one record per solved daily date, never pruned and merged across devices, so a **daily-puzzle-only** streak could be derived from it. Our 02 §12 and §22 list "a calendar and streaks" as Phase 3 hooks.

### 4.c What the original does

| # | Fact | Conf. | Source |
|---|---|---|---|
| S1 | A **7-day streak** exists ("play at least one game a day to get a 7-day streak"), and a "**weekly reward**" is worth about as much as 1st place in the ranking | likely (one forum post + one review) | [worldsapps-disc]; [as-jp-rev] |
| S2 | What counts as a day: "at least one game daily". Whether that means any level, the daily or just opening the app is not said | unknown | [worldsapps-disc] |
| S3 | Display, reset on a missed day, freeze or repair by video, reset time | **unknown** (only look-alike apps document these; they are not evidence) | — |

### 4.d Platform

- Everything can live on our side: the save (`setDataAsync`, 1 MB, cloud plus local mirror) and the date logic.
- **There is no server-time API** (FB PD1), so the device clock is the only time source and changing the clock can fake or break a streak (R-N2, accepted).
- **Reminders** ("don't lose your streak") are not possible without a server. Meta's app-to-user notifications are sent from a game server, and a bot needs a webhook. A "Notification Service" page exists but could not be read. Gate **G9** (R-N1).

### 4.e Gaps

All of it is missing:

- **GAP-S1:** what counts as a day.
- **GAP-S2:** the cycle length and what happens after day 7.
- **GAP-S3:** rewards, per day or on day 7.
- **GAP-S4:** where and how it is shown.
- **GAP-S5:** what a missed day does (reset, freeze, repair by video).
- **GAP-S6:** the day boundary (local midnight? the same as the daily?).
- **GAP-S7:** reminders (G9).

### 4.f Material

- **M9:** every place the streak shows, the day-7 or weekly reward screen, what the user did on a day that counted, and what a missed day did.
- **M11:** the midnight screenshots, which also show when a streak day turns over.

### 4.g Provisional design `[PROVISIONAL]`

This is our own design, not the original's. It uses only what S1 says:

- **What counts:** a local calendar day counts once the player **wins at least one puzzle** (a level, the daily or an event puzzle) that day. A win is checkable, whereas "played" is vague. The tutorial does not count.
- **Cycle:** days 1–7, shown as 7 steps. Day 7 pays **2 hints + 2 kitties**, sized like the one report that the weekly reward matches 1st place. After day 7 the next counted day starts a new cycle at day 1. We keep `best` (the longest run) for the records.
- **Missed day:** the run goes back to day 1. There is no freeze and no repair by video. A "keep your streak" video could be added later behind a flag as a new rewarded placement, if the user wants it.
- **Display:**
  - on Home, a small 7-step strip with "Day N" beside the daily card;
  - after the first win of a day, one short line ("Streak: day N") on the victory screen;
  - on day 7, a reward card with a Collect button.
  - Each video-doubling offer is off by default.
- **Time:** the same local date key as the daily (`localDateKey`). A date earlier than the last counted one is ignored, so moving the clock back does nothing. A cycle's reward is paid once.
- **Save:** a new additive field, for example `save.dayStreak {lastDate, day, best, paidCycle}`. It is **not** `save.streak`, which is retired but still parsed. The cloud merge takes the later `lastDate`, then the higher `day`.
- **Reminders:** none (G9).
- **Platforms:** web and FBIG alike.

---

## 5. Daily challenge ("same as in Meowdoku")

### 5.a The ask

"Daily Challenge same as in Meowdoku".

### 5.b What we have today (the "Daily puzzle"; works on web and FBIG)

- **Content:**
  - 27 monthly packs from 2026-10 to 2028-12 (823 days), fetched month by month;
  - after that, each daily is generated on the device from seed `mewdoku:daily:v1:<date>`, so every player still gets the same board.
  - **One puzzle per local date.**
- **Sizes by weekday:** Mon and Tue 8×8, Wed and Thu 9×9, Fri and Sat 10×10, Sun 11×11. **Every second Sunday from 2026-10-18 is 12×12.**
- **Entry:** **only the Home daily card**, locked until **level 20** is beaten (`progress.level > 20`). It then reads not played, in progress, or solved; tapping a solved day reopens its result. There is no calendar, no past days, no replay and no reminder.
- **Rules:** the same as levels (3 fish, 1 revive, shared helper stock, videos at 0). The timer is hidden during play.
- **Win:** the fish fly to the **weekly** counter and the ranking panel shows the weekly board. The daily victory screen shows the time, mistakes, hints and "Next puzzle in …". Done passes the `daily_done` ad gate, then goes Home.
- **Rewards:** nothing daily-specific. A daily win does not count toward `progress.completed`, so it has no effect on the ad gates.
- `daily_fastest` is off.
- **Keys:** `daily.{unlockAfterLevel 20, firstPackMonth}`, `rank.dailyBoard`.

### 5.c What the original does

| # | Fact | Conf. | Source |
|---|---|---|---|
| D1 | A **new daily puzzle every day**, called "Daily Challenge" in dated videos from mid-June 2026 | **confirmed** | [as]; [gp]; [yt-dc-17]; [yt-dc-18] |
| D2 | **Unlocks after passing level 21** (Apple's editorial story) | **confirmed** (iOS editorial) | [as-story] |
| D3 | One puzzle per day | likely | [gamefoliage]; [applion-and] |
| D4 | **12 × 12 boards appear in the dailies and apparently only there**. Other daily sizes are unknown | likely | [nanma80] (01 §10.10); [note-riko]; [applion-and] |
| D5 | Whether the daily shows a timer or a time on its result. One reviewer mentions a "daily puzzle percentage" they don't understand | unknown | [as]; [as-rev] |
| D6 | Reset time. A tips video promises to "get the new daily early", which suggests the device clock *(inference)* | unknown | [yt-tips] |
| D7 | Rewards, trophies, calendar or archive, past days, a daily-only board: **none found** | unknown | — |
| D8 | Whether the daily adds to the 50-player ranking | unknown | 01 §19 |

### 5.d Platform

- No platform API is needed; the content and the save are ours.
- A **daily ranking cannot be worldwide** if R-L1 holds (§1.d).
- Sharing a result into a chat (`shareAsync`, `updateAsync`) is available, but rewarding shares stays off because no current Meta policy was found (R-S1).
- The date comes from the device clock (FB PD1).

### 5.e Gaps

| ID | Gap | Fix size |
|---|---|---|
| GAP-D1 | Unlock: ours after level 20, the original after **level 21** | config (`daily.unlockAfterLevel: 21`) |
| GAP-D2 | Size schedule: ours puts 12×12 on every second Sunday; the original's frequency is unknown | M11; regenerate packs (lead/content) |
| GAP-D3 | Entry and daily screen: just a card, or a screen with a calendar or past days? | M10 |
| GAP-D4 | Result screen: time? a percentage? a rank? | M10 |
| GAP-D5 | A daily reward? | M10 |
| GAP-D6 | Reset time (ours: local midnight) | M11 |
| GAP-D7 | Does a daily win add to the ranking? (ours: yes) | M10 |
| GAP-D8 | A daily leaderboard (ours: off; likely impossible worldwide on FB) | U2 |

### 5.f Material

- **M10:** the Home entry, the daily screen if there is one, a whole daily from start to result, and the ranking total before and after.
- **M11:** a week of daily boards at their start (the sizes), and the screens just before and after midnight.
- **M4:** the locked state, only on a fresh install.

### 5.g Provisional `[PROVISIONAL]`

- **Start now:** unlock after **level 21**.
- Keep everything else as built: no calendar, no past days and no daily reward.
- A daily win counts for the streak (§4.g) and adds its fish to the ranking (as today).
- `daily_fastest` stays off unless U2 picks route B or D.
- If M10 shows a calendar or past days, those become a separate work item (the content exists for every date up to 2028-12).

---

## 6. Cross-cutting: Meta setup, gates and admin

None of this can be done from our environment, because developers.facebook.com is blocked here. It needs someone with access to the live pages and the dashboard.

| Gate | What to check | Blocks |
|---|---|---|
| **G1** leaderboards | Read `documentation/games/retain/leaderboards` and confirm or refute the removal of **global boards on 2025-12-31**. Note the error code removed boards return (R-L2). If confirmed, ship FB with `VITE_FB_LEADERBOARDS` empty, and use contextual boards only if U2 picks B | §1 route |
| G2 tournaments | Standings API, reward policy, `endTime` units. `COLLABORATIVE` tournaments are a new option. The payload shape is answered | route C |
| G3 overlay views | How names are bound for non-friends (O3) | names on any FB board |
| **G4** banners | The retirement timeline, whether "no banner in gameplay" is enforced or only advised, and the exact Ad-Free wording (R-A6) | §2A default |
| **G5** payments | Audience Network approval, business verification, payout, the purchase review (descriptions plus a **recording of the in-play purchase flow**), and the order of consume and grant | §3 |
| G6 interstitial frequency | Any cap against our 120/100/90 s cooldown | §2B |
| **G9** (new) notifications | Can any reminder be scheduled **without our own server** under Zero Permissions? | §4 reminders |
| **G10** (new) iOS purchases | Support since 2024-09-16, the current launch-checklist iOS rule, and the `getPlatform()` and `purchasePlatform` values on iOS | §3 iOS |
| G11 (new) placements | One rewarded placement per helper, and the 30 s per-placement load floor on a device | §2C |

Dashboard items:

- **Placements:** interstitial, banner, and rewarded (per helper if G11 passes).
- **Leaderboards:** only those the chosen route needs.
- **Products:** the 3 existing ones, plus any from U4.
- **Build values:** the `VITE_FB_*` values.

---

## 7. Proposed build plan

### 7.1 Stages

| Stage | What | Waits for |
|---|---|---|
| **E0** (now) | The user answers M1–M12 and U1–U4. Someone with Meta access reads G1, G4, G9 and G10. The lead adds the L0 config keys for the "start now" items and a short `docs/phase2e/CONTRACTS.md` for them | — |
| **E1 start now** | S0 interfaces, then the build, for the items below marked **now**. They do not depend on the user's material | E0 L0 only |
| **E2 after material** | The lead writes `docs/phase2e/spec.md` from M1–M11. Then S0 additions and the build for the items marked **M** | M1–M11 |
| **E3 after gates** | FB route switches (env or config), iOS on, the banner default | G1, G4, G10, U1–U3 |
| **Integration** | As in 2d: I-1 dev harnesses, I-2 requests, I-3 required members and deletions, I-4 budgets (the new cards go in lazy chunks), I-5 docs, I-6 acceptance with two Playwright runs | E1/E2 |

### 7.2 Ownership (disjoint, as in 2d)

| WS | Scope in 2e | Owns |
|---|---|---|
| **G1 logic, app, platform** | streak engine and save, period and rank-reward logic, ad pacing and banner re-show, the in-play purchase flow, payments probe, leaderboard route, analytics | `src/game/**`, `src/app/**` except `config.ts`, `src/platform/**`, `tests/fixtures/fbinstant-stub.js`, `tests/unit/{game,app,platform}/**`, `tests/e2e/{smoke,winflow,events,layout,fbig}.spec.ts`, `docs/phase2b/fb-dashboard.md` rows, `docs/phase2e/requests-G1.md` |
| **G2 art, board** | streak steps (empty, done, today, reward), the reward gift, pack art for the O2 Buy row (reusing the 2b shop art where it fits), rank medals and a heart icon only if E2 needs them. No board change is expected | `src/ui/art/**`, `src/ui/board/**`, `src/styles/{tokens,base,board,art}.css`, `docs/phase2e/provenance-G2.md`, `docs/phase2e/requests-G2.md` |
| **G3 HUD, overlays, i18n** | the O2 Buy row and its states, the Home streak strip, the streak line on victory, the day-7 reward card, the ranking panel and end-of-period card (E2), the daily screen changes (E2), every string and the 16 locale drafts | `src/ui/{hud,screens,overlays,fx,a11y}/**`, `src/styles/{hud,fx,overlays,screens,i18n,overlay-chunk}.css`, `src/i18n/**`, `docs/i18n/**`, `tests/unit/{ui,shell,i18n}/**` (except G2's), `tests/e2e/{visual,i18n}.spec.ts`, `docs/phase2e/provenance-G3.md`, `docs/phase2e/requests-G3.md` |
| **Lead** | config, contracts, dev harnesses, size budget, docs, daily pack regeneration (if M11 changes the sizes), Phase 4 checklist | `src/app/config.ts`, `src/app/flags.ts`, `dev/**`, `scripts/**`, `src/data/**`, build and test config, every other doc |

### 7.3 Work items

**Start now (E1), with no user material needed**

| WS | Item | Ref |
|---|---|---|
| G1 | Banner re-show after **any** hide on the same board (one timer, 45–60 s window) | 2e-B1, GAP-B1 |
| G1 | Ad loads: backoff starting at 30 s, a 30 s floor per placement, optional per-helper rewarded placement env values that fall back to the shared ID | R-A3, R-A4 |
| G1 | R-L2 latch: any rejection that is not a network error, or two failures in a row | 2e-L6 |
| G1 | In-play purchase: `shopFlow` callable from O2 with a product, input lock, timer pause and audio mute while the dialog is open, use-one-at-once after the grant, analytics `iap {source:'o2'}`; stub fixture and e2e | 2e-P1 |
| G1 | iOS payments switch, **default off** | 2e-P3 |
| G1 | Streak engine `src/game/day-streak.ts` (pure date logic, clock-back guard, merge), the save field, the view-model fields (Home and victory), events. Values come from `streak.*` config placeholders | §4.g |
| Lead | L0: `daily.unlockAfterLevel: 21`; `streak.*` (cycle 7, reward 2 + 2, `doubleByVideo: false`); `iap.iosEnabled: false`; `iap.inPlay: true`; `ads.minLoadGapMs: 30000`; the contracts | — |
| G2 | Streak step art, the gift art, the O2 pack mini-art (placeholders in S0) | — |
| G3 | The O2 Buy row (loading price, ready, busy, error, hidden); the Home streak strip; the victory streak line; the day-7 card (lazy); English keys at S0, then the 16 drafts | §3.g, §4.g |

**After the user's material (E2)**

| WS | Item | Material |
|---|---|---|
| G1 | Period kind and window; rank-reward logic (only for route B or D); the interstitial start and cooldown values (config, lead); revive amount and per-video amount (config); streak rules if M9 differs; a `revive_declined` trigger if M6 shows one | M1, M2, M4–M7, M9, M11 |
| G3 | Ranking panel per M1 (title, countdown, rows within what the route can honestly show); the end-of-period card (claim, ×2) per M2; daily screen and result changes per M10; streak look per M9 | M1, M2, M9, M10 |
| G2 | Medals or a heart icon only if the panel needs them; streak art per M9 | M1, M3, M9 |
| Lead | Regenerate the daily packs if the size schedule changes (M11); move the facts into 01 as first-hand | M11 |

**After the gates and decisions (E3)**

| WS | Item | Waits for |
|---|---|---|
| G1 | Leaderboard route B (contextual boards `<board>.<contextID>`), C (enable `groupChallenges`) or D (a server client; separate spec) | G1, U2 |
| G1 / lead | iOS purchases on | G10, U3 |
| Lead | `ads.banner.duringPlay` default; `ads.banner.enabled: false` for FB on 2027-03-31 | G4, U1 |
| G1 | Streak reminders, only if G9 finds a server-free path | G9 |

### 7.4 Tests and acceptance (outline)

- **Unit, G1:**
  - streak date math across local midnight, a clock moved back, a missed day, day 7 paid once, and the cloud merge;
  - banner re-show after a video, Settings and Shop;
  - the ad load floor;
  - the R-L2 latch;
  - the in-play purchase (grant, use one, cancel, failure, timer paused).
- **e2e, FBIG stub:** the out-of-hints card with Buy, then +15, then one used. iOS shows no Buy while `iosEnabled` is off. The banner is back on the board after an interstitial.
- **e2e, web:** the streak strip on Home after a win, and no Buy row.
- **Acceptance:** every M-item answered is checked against our build in a compare note, as 2d's `look-compare` was. No fabricated rows or counts (grep the strings).

---

## 8. Decisions for the user

| # | Decision | Our recommendation |
|---|---|---|
| U1 | **Banner during play on Facebook**, given that Meta advises against it and stops banners on 2027-03-31 | Keep it on, as you asked, and plan to switch banners off on FB at 2027-03-31; or default it off on FB if review risk worries you |
| U2 | **Leaderboard route** if global boards are confirmed gone: A personal daily ranking, B per-group boards, C group tournaments, D our own server with real 50-player rooms, E labelled computer rivals | A now, plus B. D only if you accept running a server. Not E |
| U3 | **Purchases in the Facebook iPhone app** once G10 confirms them | Yes |
| U4 | **Helper packs and prices**, and whether to sell a mouse pack. Today: 15 hints $1.99, 8 kitties $1.99, No Ads $3.99, no mouse pack | Keep these; no mouse pack (the mouse stays video-only, as in the original) |
| D-2e-0 | The same clean-room terms for your new screenshots and recordings as for the 2d recordings (§0.4) | Yes |

---

## 9. One-screen summary

| # | Feature | Ours today | Original (confidence) | Platform | Main gaps | Need from user | Start now |
|---|---|---|---|---|---|---|---|
| 1 | **Leaderboards** | Weekly (UTC) fish board, panel after every scored win; FB global board (unverified), web personal records | Fish kept per win (**confirmed**), after every win (**confirmed**); daily, ~50 players (likely); 1st = 2 + 2, ×2 video (**confirmed**); hearts (likely); bots? (unknown) | **Global boards possibly removed 2025-12-31** (G1); contextual boards and tournaments remain; names only in overlays | Daily period, the rivals, rank rewards, panel contents, hearts | M1, M2, M3 (+ M10, M11); U2 | R-L2 latch |
| 2a | **Banner in play** | FBIG from 10 completed levels; hidden under the hint; **not back on the same board** after a video, Settings or Shop | 320 × 50 bottom in play (**confirmed**); hidden under the hint (**confirmed**); none at level start in 2 stills; from level 10 (likely) | **Retired 2027-03-31**; Meta advises none in play (G4) | Re-show after any hide; level-start behaviour; first level | M4, M5; U1 | Re-show (2e-B1) |
| 2b | **Interstitial** | From 10 completed levels, 60 s grace, 120/100/90 s cooldown; next level, Retry, daily, event | After almost every level (**confirmed**); start level 10 (likely) to 60+ (reports) | No cap published; 30 s load floor | Start level, cadence, ad after a declined revive | M4, M5, M6 | R-A3 load floor |
| 2c | **Rewarded** | hint and kitty at 0 (+1 used at once), mouse always, revive +1 fish once; web free fallback | Refill by video (**confirmed**, amount unknown); mouse always (**confirmed**); revive (**confirmed**, size unknown) | Recommended use; per-placement IDs | Amount per video, prompt or direct, revive size | M6, M7 | Per-helper placements |
| 3 | **Buy helpers in play** | Packs exist (15 hints, 8 kitties, No Ads) but **only via Settings**; iOS off; web none | **No evidence it sells helpers**; iOS sells Premium subscriptions only (contents unknown) | iOS OK since 2024-09-16 (G10); no subscription type found; Audience Network approval + purchase review | Buy row on O2, iOS, timer pause, mouse pack? | M7, M8; U3, U4 | O2 Buy row, flow, iOS switch (off) |
| 4 | **Daily streak** | **None** (only `save.daily` history) | A 7-day streak and a "weekly reward" (likely, single sources); everything else unknown | Client-side only; device clock; reminders need a server (G9) | All of it | M9 (+ M11) | Engine, strip, day-7 card (provisional rules) |
| 5 | **Daily challenge** | Daily puzzle to 2028-12, unlock after level 20, weekday sizes, 12×12 alternate Sundays; no calendar or reward | Daily every day (**confirmed**); unlock after level 21 (**confirmed**); 12×12 in dailies only (likely); rest unknown | No API needed; no worldwide daily board | Unlock level, sizes, screen, result, reward, reset | M10, M11 (+ M4) | Unlock at 21 |

---

## References

The original (search summaries, 2026-10-10; no page read directly):

- [as]: https://apps.apple.com/us/app/meowdoku/id6761760135
- [as-jp]: https://apps.apple.com/jp/app/meowdoku/id6761760135
- [as-gb-ipad]: https://apps.apple.com/gb/app/meowdoku/id6761760135?platform=ipad
- [as-rev]: https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=iphone
- [as-rev-gb]: https://apps.apple.com/gb/app/meowdoku/id6761760135?see-all=reviews&platform=iphone
- [as-rev-hr]: https://apps.apple.com/hr/app/6761760135?see-all=reviews&platform=iphone
- [as-ipad]: https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=ipad
- [as-jp-rev]: https://apps.apple.com/jp/app/meowdoku/id6761760135?see-all=reviews&platform=ipad
- [as-story]: https://apps.apple.com/nz/iphone/story/id6795412703
- [gp]: https://play.google.com/store/apps/details?id=com.oakever.meowdoku&hl=en_US
- [unstar]: https://unstar.app/app/6761760135?platform=ios&country=en-US
- [appshunter]: https://appshunter.io/ios/app/meowdoku/id6761760135/reviews
- [appbrain]: https://www.appbrain.com/app/meowdoku-brain-puzzle-games/com.oakever.meowdoku
- [worldsapps-disc]: https://worldsapps.com/discussion-meowdoku
- [chie-heart]: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14331408414
- [appreview-jp]: https://appreview.jp/app/397538e00a1df6086ddfc4c5483cf980
- [applion-and]: https://applion.jp/Meowdoku/android-com.oakever.meowdoku/
- [apps-island]: https://apps-island.com/meowdoku
- [gamefoliage]: https://gamefoliage.com/2026/06/10/meowdoku/
- [note-riko]: https://note.com/tender_6101/n/n2148f7fb8d7a
- [braberg]: https://felixbraberg.substack.com/p/meowdoku-segments-users-ad-experience
- [gam-tenure]: https://www.gamigion.com/meowdoku-segments-users-ad-experience-by-tenure/
- [sett]: https://www.sett.ai/content/meowdoku-2m-dau-pure-ad-revenue/
- [ac]: https://www.androidcentral.com/apps-software/meowdoku-is-sudoku-but-with-cats-and-it-is-highly-addictive-but-it-has-one-big-problem
- [x-anze]: https://x.com/anze4fgo/status/2079545955129692579
- [yt-dc-17]: https://www.youtube.com/watch?v=wRoOGRO0n3c
- [yt-dc-18]: https://www.youtube.com/watch?v=hWCjw1UCIU0
- [yt-tips]: https://www.youtube.com/watch?v=R9CVpGGEi7s
- [yt-revive]: https://www.youtube.com/watch?v=xfVbb7V_xe4
- [hrafsa]: https://github.com/hrafsa/meowdoku-solver
- [leist]: https://github.com/LeistDev/Meowdoku-macros
- [nanma80]: https://github.com/nanma80/meowdoku-solver

The platform (Meta pages via search summaries [S], checked 2026-10-10; code read first-hand):

- Banner ads: https://developers.facebook.com/documentation/games/monetize/in-app-ads/banner-ads
- In-app ads overview: https://developers.facebook.com/documentation/games/monetize/in-app-ads/overview
- Monetization best practices: https://developers.facebook.com/documentation/games/monetize/best-practices
- In-app purchases: https://developers.facebook.com/documentation/games/monetize/in-app-purchases ; https://www.pocketgamer.biz/metas-in-app-purchases-bring-instant-games-to-ios/
- Launch checklist: https://developers.facebook.com/docs/games/build/instant-games/get-started/launch-checklist
- Leaderboards: https://developers.facebook.com/documentation/games/retain/leaderboards
- Notifications: https://developers.facebook.com/documentation/games/retain/notifications/overview
- Zero Permissions and web games changes: https://developers.facebook.com/blog/post/2025/07/31/web-and-instant-games-changes/
- Meta's Unity plugin (SDK 8.0) @ `ec32ba7`: https://github.com/facebook/meta-instant-games-unity-plugin
- Meta's Zero Permissions samples @ `2e2c2eb`: https://github.com/fbsamples/fbinstant-nezp-samples
