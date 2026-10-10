# Phase 2e spec: the worldwide daily ranking, video ads, purchases during play, the daily streak and the daily challenge

Status: **spec, ready for L0 / S0; independent critic pass applied 2026-10-11 (§13 lists every change)** · Date: 2026-10-11 · Owner: spec lead · Branch `claude/mewdoku-instant`, base `dcc6367` (Phases 2–2d.1 final, [STATUS-2d](../phase2d/STATUS-2d.md)) · Interfaces, copy-paste ready: [CONTRACTS.md](CONTRACTS.md) · Facts: [gap-analysis](gap-analysis.md), [ask-user](ask-user.md) (the material list sent to the user), [research/ours](research/ours.md), [research/original](research/original.md), [research/platform](research/platform.md).

This spec merges two scratch drafts written for the lead on 2026-10-10 (a server design of the ranking backend and a client draft of the five features, both read in full and not committed) and settles every point where they differed (§0.6). The config keys of §7.2 are in `src/app/config.ts` (L0, this stage); nothing else in `src/` changed. No source on the 06 §4 list was opened, and every word of copy and every picture named here is ours.

How to read it (§13, added by the critic pass, lists what changed after the first draft): §0 is the decision record (what the user said, what the lead decided, what is provisional and which key changes it). §1 is the server, §2 the ranking in the game, §3–§6 the other four features, §7 the cross-cutting parts, §8 who builds what, §9 the interfaces in summary (exact code in CONTRACTS), §10 tests, §11 the user's deployment guide, §12 the open questions with the provisional answer that is built meanwhile.

---

## 0. Decision record

### 0.1 The user's request (verbatim, 2026-10-11)

> "We need to create: 1) Leaderboards - same as in Meowdoku 2) Video Ads - Banner during level (always there), Interstitial (after every level starting after level some later level - same as in Meowdoku, Rewarded Video (when out of helpers during play) 3) InAppPurchases - option to buy helpers during play 4) Daily Streak - same as in meowdoku 5) Daily Challenge same as in Meowdoku"

### 0.2 The user's decisions (2026-10-11, answered in the question form; item 12 of [ask-user](ask-user.md))

| # | Question | The user's answer (verbatim) | As recorded by the lead | What we build |
|---|---|---|---|---|
| **U-a** | The leaderboard route | **"Own worldwide server"** | A REAL worldwide daily ranking (about 50 players per bracket, like the original) on our own server, with a backend and anti-cheat | §1 (server), §2 (game) |
| **U-b** | The banner during play on Facebook | **"Always during levels"** | At the bottom of the screen during play, hidden under the hint card, until Facebook stops serving banners on 2027-03-31 | §3.1 |
| **U-c** | Purchases in the Facebook iPhone app | **"On once confirmed"** | Enable purchases in the FB iOS app after the user checks Meta's current rules in the dashboard: build it behind a kill switch, default per the spec's recommendation | §4.4: built, **off** by default (`iap.iosEnabled: false`), turned on by the remote switch `iapIos` once the user has checked (§11.5) |
| **U-d** | Packs and prices; a mouse pack? | **"Current packs"** | 15 hints $1.99, 8 cats $1.99, No Ads $3.99, offered right on the out-of-helpers card next to the video option | §4.1: no new product and no mouse pack; the out-of-hints card offers the 15-hint pack and the out-of-kitties card the 8-kitty pack next to "Watch video", and **both also offer No Ads** (the current packs on the card, as decided), with its own honest line "Removes banners and full-screen ads. Videos for helpers stay." (it gives no helper and does not remove the optional videos), hidden once owned. The mouse card offers no pack (no product gives a mouse). *Critic pass (§13): the first draft left No Ads off the card by its own reading; that contradicted U-d and is reversed. Taking it off is one config edit (§12 Q-U1).* |

### 0.3 The lead's decisions (2026-10-11)

| ID | Decision |
|---|---|
| L-1 **Honesty** | The ranking shows only real players. A bracket that is not full shows fewer rows. Never bots, never invented players or statistics (§0.4) |
| L-2 **Hosting** | Cloudflare Workers + D1 (SQL) by default, with the storage behind an interface so it can move; a Node + SQLite adapter for local dev and tests (Postgres later, same interface) |
| L-3 **Identity** | `FBInstant.player.getSignedPlayerInfoAsync()` verified server-side with the app secret (HMAC-SHA256). Zero Permissions applies (games created after 2025-08-01), so other players' real names and photos are not available: a player-chosen or generated nickname (cat-themed, our own word list, moderated against a blocklist) and our own avatar art |
| L-4 **Anti-cheat** | The server verifies each submitted win (level id + the solved cat positions against the level's known solution), caps kept fish at 3 per win, rate-limits by plausible solve times per board size, and dedupes per level per day |
| L-5 **Web** | The ranking works against the same server with an anonymous device id (lower trust, flagged) or shows personal records only: the spec decides and justifies (D-2e-5) |
| L-6 **Material** | The user has not sent recordings for these features yet. Every "same as Meowdoku" detail not confirmed by the research is a provisional, clearly marked decision that is cheap to change later (a config key), and §0.7 lists them |
| L-7 **Clean room** | Never open 06 §4 sources; our own art and copy |

### 0.4 Honesty rules (binding for every workstream; tested in §10.6)

- **H-1** A ranking row exists only for a real player who joined a bracket with a verified, accepted win. No code path, server or client, creates a row any other way. Test data is created through the public API by test clients only and never ships.
- **H-2** A bracket that is not full shows exactly its members. "N players" is the server's real count of visible members. No placeholder rows, no "online now", no estimated counts, no invented statistics anywhere (also not in tickers, toasts or notifications).
- **H-3** The client renders only the rows the server returned, in the server's order, with the server's ranks. A server failure never turns into rows: it turns into the cached bracket marked "Last updated hh:mm" (still real rows of a real bracket) or the player's own records.
- **H-4** Rewards are decided by the server from the frozen final standings; a place is paid only if real players were beaten (§1.6). The client never promises that queued fish will count.
- **H-5** A suspended player is told (a neutral line), never shadow-banned; a rejected win is dropped quietly, never with an accusation.
- **H-6** Players see nicknames and avatars only; Facebook names and photos are never requested, stored or shown.
- **H-7** The anonymous web mode never shares a bracket with signed-in Facebook players (D-2e-5).
- **H-8** The existing 2b/2c rule stays: "never fabricate a player, rank, score or row" (`rank.*` doc comment).

### 0.5 Clean room (D-2e-0)

The user's future screenshots and recordings fall under the terms of D-2d-0 and D-2d1-0 (stated to the user in [ask-user](ask-user.md)): we may measure numbers, timings, the order of screens and reward amounts; no tracing; no file of the original enters the repo; our own art and words only; facts go into 01 as "first-hand (user recordings, date)". Look-alike apps' streak calendars, 7-day reward cycles and share cards are not evidence and are never built "as the original's". Our streak (§5) is our own design from the one fact we have (orig S1).

### 0.6 Spec decisions (reconciling the two drafts; each cheap to revisit)

| ID | Decision | Why | Alternative kept by a key |
|---|---|---|---|
| **D-2e-1** | **One Cloudflare Worker + one D1 database**, all domain logic behind a `Store` interface; drivers: D1 (production), `node:sqlite` (Node 22, tests and the local dev server), Postgres later. `server/` has its own `package.json`, strict TypeScript, vitest, **no runtime dependencies** | L-2; one code path in workerd and Node; small attack surface | — |
| **D-2e-2** | **FB identity = server nonce + `getSignedPlayerInfoAsync(nonce)`**, HMAC-SHA256 with `FB_APP_SECRET`; the raw FB id is never stored (player key = HMAC with `ID_PEPPER`); our own 24 h bearer token, **kept in memory only** | L-3; Meta's 8.0 reference recommends a server nonce against replay; no storage in the FB iframe | — |
| **D-2e-3** | **Rolling brackets** [PROVISIONAL P-L1]: a bracket opens at its first member's first counted win, takes joiners for 2 h or until 50, and ends for everyone 24 h after it opened (one countdown) | Closest to orig L1/L2 ("24 h from your own first play", about 50) with one shared countdown and no reset spike | srv `bracket.periodMode: 'utc_day'` |
| **D-2e-4** | **The server ranking replaces the FB weekly board.** `rank.fbPeriodBoard: false`; the Rankings hub and the FB-only Home trophy are deleted at I-3 (closes STATUS-2c §8 "two trophies"); the FB path stays only for the event boards' Top list until gate G1 is read | Global boards are probably gone (R-L1); two rankings that disagree would mislead; answers the server draft's open question 1 | `rank.fbPeriodBoard: true` |
| **D-2e-5** | **Web: personal records in production.** The anonymous device mode is built and tested (dev, e2e, staging) and, if ever switched on in production, uses its own pool `web` (never mixed with FB) | Anyone can mint anonymous ids, so one script could be fifty "players" (H-1, H-7); web-prod has no ads or purchases and serves QA and demos | `ladder.web: 'anon'` + srv `WEB_MODE=anon` |
| **D-2e-6** | **Save schema v4** (not `ext`) | The new records need typed validation and their own merge rules (union queues and ledgers, the streak chain); `ext` merges by newest copy and would lose queued wins and paid ledgers | — |
| **D-2e-7** | **Interstitial: cadence, not cooldown** [PROVISIONAL P-I2]: after every level from level 10, with a 30 s floor between full-screen ads | The user's "after every level"; the floor only stops two full-screen ads within 30 s | `ads.interstitial.cooldownSec` back to `[{0,120},{2,100},{7,90}]` |
| **D-2e-8** | **Banner: back after every hide** on the game screen (one timer), 46 s window, first on level 10's board, off from 2027-03-31 | U-b "always there" (fixes GAP-B1) | `ads.banner.reshowAfterAnyHide`, `minReloadSec`, `fromCompletedLevels`, `untilDate` |
| **D-2e-9** | **O2 gets Buy rows**: the helper's own pack, then No Ads (hint and kitty cards); prices only from FB's catalogue | U-d | `iap.o2Products`, `iap.inPlay` |
| **D-2e-10** | **Consume first, then grant**, guarded by an intent ledger in the save (exactly-once at every crash point) | Meta's wording (P-e); the IAP review | `iap.grantBeforeConsume: true` restores 2b's order |
| **D-2e-11** | **iOS purchases built, off by default**, switchable remotely without a release | U-c | `iap.iosEnabled`, remote `iapIos` |
| **D-2e-12** | **The daily streak is our own design** (any win counts, 7-day cycle, day-7 reward 2 + 2, a missed day resets, no urgency, no reminders) | Only S1 is known | `dayStreak.*` |
| **D-2e-13** | **Daily unlock after level 21** with earlier unlocks kept | Confirmed D2 | `daily.unlockAfterLevel`, `daily.keepEarlierUnlock` |
| **D-2e-14** | **Solutions ship with the Worker as plain strings** (packs + offline-precomputed generated ranges); the Worker never runs the generator | Measured: ≈ 60 KB raw / 25 KB gzip in all; on-Worker generation ≈ 100 ms average, up to 756 ms; every solution is public in the client anyway, so hashes hide nothing (§1.9) | — |
| **D-2e-15** | **Anti-cheat = a set of limits + flags; no automatic removal**; an admin suspends and the player is told | The solution check proves only that the puzzle exists (§1.9.1); stakes are a few helpers | srv `antiCheat.autoSuspendFlags` |
| **D-2e-16** | **Names from our word lists only** (adjective + cat noun + number), generated by the server at the first session, re-pickable; free text off; **12 avatars** of our own [PROVISIONAL P-L13] | L-3; no user text to moderate in 17 locales; a word pick is still a choice | srv `nickname.freeText`; `AVATAR_COUNT` (append-only) |
| **D-2e-17** | **Rewards:** 1st = 2 hints + 2 kitties (confirmed L6); 2nd = 1 + 1 and 3rd = 1 hint [PROVISIONAL P-L5]; **at least 5 members** for any reward [PROVISIONAL P-L7, ours]; ×2 after a rewarded video (client-trusted, once) | A near-empty bracket would otherwise pay every day; honest copy explains it | srv `rewards.*` |
| **D-2e-18** | **Hearts** [PROVISIONAL P-L10]: one per giver per row per bracket, your own row once (orig L5: "tapping one's own heart made it 1"), no reward, a "+N hearts from other players" line | The few facts of L5 | srv `hearts.*`, `ladder.heartsNotify` |
| **D-2e-19** | **Remote switches** live on the ranking server (`GET /v1/config`); off-only except `iapIos` | U-c without a release; a compromised server can only switch features off (and iOS purchases, a reviewed flow, on) | `remote.enabled` |
| **D-2e-20** | **Gate order:** the server (G4) starts now; the lead ships a tiny **probe bundle** that answers G-SRV-1 and G-SRV-2 as soon as staging is up; the client and UI work for the ranking proceeds in parallel against the local server (it is dark until `VITE_LADDER_URL` is set); only an FB **release** with the ranking waits for G-SRV-1/-2/-3 | Waiting would stall three workstreams on a user action; `getSignedPlayerInfoAsync` exists precisely for server verification, so the probe is very likely to pass; if it fails, the ranking ships off and the records stay (§12 Q-G1) | `VITE_LADDER_URL` empty |
| **D-2e-21** | **A fourth workstream G4 owns `server/**` and the shared contract `src/shared/rank-api.ts`** | Answers the server draft's open question 2: the server is a separate package with its own tests and deploy; G1 is already the busiest | — |
| **D-2e-22** | **API host `rank.<public domain>`**; staging on `mewdoku-rank-staging.<account>.workers.dev` until the public name exists (task #36) | Answers the server draft's open question 3 for now | §12 Q-D1 |
| **D-2e-23** | **The streak's day and the daily's day are the same local date key**, with one key for a later reset hour | One "today" for the player | `daily.dayStartHour` |

### 0.7 Register of provisional decisions (each changes with its key, then a test update)

"srv:" marks a server key (`server/src/core/config.ts` default, overridable by a Worker variable, §1.16); the rest are client keys in `src/app/config.ts`. "M" items are the material list ([ask-user](ask-user.md) items 1–11). "L1" marks a value that changes at integration step I-2 (§7.2.2), not at L0.

| ID | Provisional decision | Key(s) | Settled by |
|---|---|---|---|
| P-L1 | Rolling 24 h brackets, 2 h join window | srv `bracket.periodMode` `'rolling'`, `bracket.durationMs` 24 h, `bracket.joinWindowMs` 2 h | M2, M11 |
| P-L2 | Up to 50 members per bracket | srv `bracket.maxMembers` 50 | M1 |
| P-L3 | Players are grouped by arrival only (no skill or level matching) | srv `bracket.matchBy` `'arrival'` | — (unknown) |
| P-L4 | Level, daily and event wins add fish; the tutorial never | srv `scoring.modes`; client `period.modes` (the local estimate) | M10 (daily) |
| P-L5 | 2nd place 1 hint + 1 kitty, 3rd place 1 hint (1st 2 + 2 is confirmed) | srv `rewards.places` | M2 |
| P-L6 | ×2 by video for every paid place (confirmed for 1st) | srv `rewards.doubleByVideo` | M2 |
| P-L7 | Rewards only in brackets of at least 5 visible members | srv `rewards.minMembers` 5 | — (ours) |
| P-L8 | Unclaimed rank rewards kept 7 days | srv `rewards.claimTtlMs` | M2 |
| P-L9 | A result card for every finished bracket I scored in | `ladder.resultCard` `'always'` | M2 |
| P-L10 | Hearts on; one per giver per row per bracket; my own row once; at most 20 given per bracket; no reward; "+N hearts" line | srv `hearts.enabled`, `hearts.allowSelf`, `hearts.maxGivenPerBracket`; `ladder.heartsNotify` | M3 |
| P-L11 | Ranks are positions 1…N; a tie goes to whoever reached the total first | srv `bracket.tieBreak` `'first_reached'` | M1 |
| P-L12 | Names picked from word lists, no free text; change at most once a day after the first change | srv `nickname.freeText` false, `nickname.changeCooldownMs` 24 h | — (ours) |
| P-L13 | 12 avatars of our own | `AVATAR_COUNT` in `src/shared/rank-api.ts` (append-only) | M1 |
| P-L14 | Listed in the ranking by default; Settings can switch it off | `ladder.defaultListed`, `ladder.optOutAllowed` | — (ours; answers L8) |
| P-L15 | The panel lists every row (≤ 50) in a scroll list centred on my row | `ladder.panelRows` 0 | M1 |
| P-L16 | Personal records (web, fallback) stay weekly | `period.kind` `'week'` | M1 |
| P-L17 | Per-size minimum solve times (§1.9.4) | srv `antiCheat.minSolveMs` | our telemetry |
| P-L18 | Retention: wins 30 d, brackets 30 d, flags 90 d, inactive players 180 d | srv `retention.*` | G-LEGAL |
| P-B1 | The first banner on level 10's board | `ads.banner.fromCompletedLevels` 10 → **9** (L1) | M4 |
| P-B2 | 46 s banner reload window | `ads.banner.minReloadSec` 60 → **46** (L1) | M5 |
| P-B3 | Banners also on Home, victory and event screens (unchanged) | `ads.banner.screens` | M5 |
| P-I1 | The first interstitial when leaving level 10's victory (unchanged) | `ads.interstitial.minCompletedLevels` 10 | M4 |
| P-I2 | Every level, 30 s floor (tenure cooldown dropped) | `ads.interstitial.cooldownSec` → **`[{fromDay: 0, sec: 30}]`** (L1) | M5 |
| P-I3 | No interstitial in the first 60 s after opening (unchanged) | `ads.interstitial.sessionGraceSec` 60 | M4 |
| P-I4 | Every 2nd Retry | `ads.interstitial.retryEveryN` 2 | M5, M6 |
| P-I5 | An interstitial on the fail card's Home (our "after declining the revive") | `ads.interstitial.triggers` `'fail_home'` | M6 |
| P-R1 | +1 hint / +1 kitty per video, used at once (unchanged) | `hints.perRewardedAd`, `kitty.perRewardedAd` | M7 |
| P-R2 | The out-of-helpers card before the video (unchanged) | `ads.rewarded.promptFirst` true | M7 |
| P-R3 | Revive +1 fish, once per attempt (unchanged) | `revive.heartsRestored`, `revive.maxPerAttempt` | M6 |
| P-P1 | O2 offers the helper's own pack, then No Ads (U-d; the order and the No Ads line are ours) | `iap.o2Products` | U-d confirmation (§12 Q-U1), M7, M8 |
| P-P2 | One helper used at once after buying | `iap.useOneAfterBuy` | — |
| P-S1 | A day counts with any win (level, daily, event) | `dayStreak.modes` | M9 |
| P-S2 | A 7-day cycle | `dayStreak.cycleDays` 7 | M9 |
| P-S3 | Day 7 pays 2 hints + 2 kitties; days 1–6 nothing | `dayStreak.reward`, `dayStreak.dayRewards` | M9 |
| P-S4 | A missed day resets; no freeze, no repair by video | `dayStreak.missResets`, `dayStreak.repairByVideo` | M9 |
| P-S5 | A strip on Home and a row on the day's first victory | `dayStreak.showOnHome`, `dayStreak.victoryRow` | M9 |
| P-S6 | No ×2 on the streak reward | `dayStreak.doubleByVideo` | M9 |
| P-S7 | No server-time check of the device clock | `dayStreak.serverSkewCheck` | — (ours) |
| P-D1 | No daily reward | `daily.reward` {0, 0} | M10 |
| P-D2 | No calendar or past days | `daily.calendar` false | M10 |
| P-D3 | A new daily (and streak day) at local midnight | `daily.dayStartHour` 0 | M11 |
| P-D4 | The daily size schedule (8, 8, 9, 9, 10, 10, 11; 12 × 12 every second Sunday) unchanged | not a key: content (`scripts/gen-daily.ts`, regenerate the packs) | M11 |

**Firm** (the user's words, a confirmed fact, or a lead decision): a ranking after every scored win; points = fish kept (1–3 per win); 1st place 2 + 2 with ×2; the real-players rule; our own server, nicknames and avatars; the banner in play until 2027-03-31, hidden under the hint card and back after every hide; an interstitial after every level from a start level; rewarded videos when out of helpers; the mouse always costs a video; the current three packs and prices on the out-of-helpers card, no mouse pack; iOS purchases off until confirmed; consume first; the daily unlock after level 21; the FB weekly board retired; web personal records.

### 0.8 Gates (outside our environment; none blocks the build, each blocks switching its feature on in production)

| Gate | What to check | Who | Blocks |
|---|---|---|---|
| **G-SRV-1** (first) | A private FB test bundle (the lead's probe, §8.2 step 4 and §11.6) reaches `GET /v1/health`, `POST /v1/session/nonce` and `GET /v1/config` on staging from facebook.com, the Android FB app, the iOS FB app and Messenger.com; record any CSP error and the `Origin` the Worker logs | user + lead | The FB release with the ranking and the remote switches |
| **G-SRV-2** | In the same probe: one real `getSignedPlayerInfoAsync(nonce)` under SDK 8.0 / Zero Permissions verifies against the real app secret on staging (layout `<sig>.<payload>`, `algorithm`, `issued_at`, `player_id`, `request_payload`); `player.getSignedPlayerInfoAsync` is listed by `getSupportedAPIs()` | user + lead | The FB ranking (without it: records) |
| **G-SRV-3** | Meta policy for an external backend storing nicknames and fish totals; the Privacy Policy URL and the Data Deletion Instructions URL in the dashboard; whether ranking strangers under game-chosen names is fine under Zero Permissions; whether a notice before the first submit is needed (`ladder.noticeFirst`) | user (+ G-LEGAL) | Public release with the ranking |
| **G-SRV-4** | Cloudflare account and plan, the domain, D1 location, Access on `/admin/*`, a WAF rate rule, usage and error notifications, a CI API token | user | Staging and production |
| G1 (changed) | Global leaderboards removed on 2025-12-31? Now only for the event boards' Top list | lead (Meta access) | Event boards on FB (until read: keep `VITE_FB_LEADERBOARDS` empty in release) |
| G4 | The banner retirement timeline; whether "no banner in gameplay" is enforced (the user accepted the risk, U-b) | lead | — (`ads.banner.untilDate`) |
| G5 | Audience Network approval, business verification, payout, the purchase review with a **recording of the in-play O2 purchase** and the consume-first note | user | Purchases |
| G6 | Any interstitial frequency rule against "every level + 30 s floor" | lead | P-I2 |
| G9 | Reminders: none (no server-free path; we build none) | — | — |
| G10 | iOS purchases: Meta's current rule, `getPlatform()` and `purchasePlatform` on iOS | user | Turning `iapIos` on |
| G11 | Per-helper rewarded placements, the 30 s load floor and the preload cap on a device | lead | §3.4 on FB |
| G-LEGAL (existing) | Privacy notice text, retention numbers, the delete flow, the trade-dress risk | user | Public release |

### 0.9 Platform columns

- **web-prod:** no ads, no payments, no ranking server (personal records), the streak and the daily as on FB.
- **web-dev / e2e:** mock ads; the local ranking server with anonymous device credentials (`VITE_LADDER_WEB=anon`).
- **FBIG** (facebook.com, Android FB app): everything.
- **FB iOS:** as FBIG, except purchases behind `iap.iosEnabled` / remote `iapIos` (off).
- **Messenger.com:** no payments (`onReady` never fires); the ranking if G-SRV-1 passes there.

### 0.10 Conventions

"Ladder" is the code name of the client side of the worldwide ranking (modules `ladder-*`, config `ladder.*`, save `ladder`); copy always says "ranking". A **bracket** is one group of up to 50 players with one end time. **Points** in a bracket are fish kept, summed. Times are epoch ms; the server's clock decides every window. New files carry `// Owner: G1|G2|G3|G4 (Phase 2e)` on line 1. Decisions are D-2e-N, provisional items P-…, open questions Q-… (§12).

---
## 1. The ranking server (G4)

### 1.1 Architecture

```
 FB Instant (fbsbx sandbox)              web build (our origin)
   FBInstant SDK 8.0                       device credential (anon mode only: dev, e2e, staging)
   src/app/ladder-client.ts (G1) ── HTTPS JSON /v1, Bearer token, CORS allow-list ──┐
                                                                                     ▼
 Cloudflare Worker "mewdoku-rank" (server/src/worker.ts): export default { fetch, scheduled }
   http/      router, CORS, JSON parse with a 16 KB limit, errors, auth, isolate rate limits
   handlers/  health, config, session, wins, bracket, rewards, hearts, profile, me, admin, dev
   core/      PURE: fb-signature, nonce, token, ids, brackets, wins pipeline, anticheat, rewards,
              hearts, nickname, moderation, config, clock  (no fetch, no Date.now, no D1)
   content/   generated/solutions.ts (+ the event windows), lookup by (contentVersion, source, puzzleId)
   store/     Store interface → SqlStore → SqlDb (D1's own shape) → drivers: d1 | node-sqlite | (pg later)
   cron       hourly: finalise due brackets, retention sweep, nonce purge, daily stats
          ▼
 D1 (SQLite) "mewdoku-rank-<env>"   migrations/0001_init.sql …
 Workers Logs (structured JSON, no personal data) · Analytics Engine "mewdoku_rank" (optional counters)
```

**Repo layout** (new; G4 owns everything under `server/` and `src/shared/rank-api.ts`):

```
server/
  package.json          own scripts; "dependencies": {} (none); dev dependencies pinned exactly:
                        wrangler, typescript, vitest, @cloudflare/workers-types, tsx,
                        optional @cloudflare/vitest-pool-workers
  tsconfig.json         strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, ES2022,
                        lib ["ES2022","WebWorker"], types ["@cloudflare/workers-types"],
                        include: src, test, dev and ../src/shared/rank-api.ts, ../src/shared/nick-words.ts
  tsconfig.scripts.json scripts/ only, with the ROOT tsconfig's compiler options (critic pass: build-solutions.ts
                        imports ../src/engine and ../src/game/progression.ts, which pull in config.ts; tsc follows
                        imports, so under the server's exactOptionalPropertyTypes and WebWorker lib the root code
                        would be re-checked with options it was never written for); `typecheck` runs both projects.
                        src/shared/*.ts must compile under both option sets (the root tsc and the server tsc include them)
  vitest.config.ts      node environment
  wrangler.toml         §1.2
  .dev.vars.example     test secrets for local dev (the real .dev.vars is git-ignored)
  .gitignore            .dev.vars, .wrangler/, node_modules/
  migrations/           0001_init.sql … (SQLite / D1 DDL; applied by wrangler AND by the Node driver)
  src/
    worker.ts env.ts
    http/      router.ts cors.ts json.ts errors.ts auth.ts ratelimit.ts
    handlers/  health.ts config.ts session.ts wins.ts bracket.ts rewards.ts hearts.ts profile.ts me.ts admin.ts dev.ts
    core/      fb-signature.ts nonce.ts token.ts ids.ts brackets.ts wins.ts anticheat.ts rewards.ts
               hearts.ts nickname.ts moderation.ts config.ts clock.ts
    contract/  index.ts — re-exports ../../../src/shared/rank-api.ts (the server never redefines a wire type)
    content/   lookup.ts; generated/solutions.ts (build output, committed)
    store/     store.ts (Store), sql-store.ts, sql-db.ts (SqlDb), drivers/d1.ts, drivers/node-sqlite.ts
    moderation/ blocklist.ts (our own list, normalised skeletons)
  scripts/     build-solutions.ts (offline, Node; reads ../src/data/** and runs ../src/engine), load.ts
  dev/         serve.ts (node:http → worker.fetch, node:sqlite, test secrets, DEV_ROUTES=true)
  test/        unit/**, http/**, contract/fixtures/*.json, workers/** (optional, workerd)
src/shared/
  rank-api.ts  the wire contract (types, constants, validators, error codes); PURE, imports nothing (G4)
  nick-words.ts the nickname word lists (append-only; G3 writes the words, G4 the shape test)
```

**Shared without runtime coupling:** `src/shared/*.ts` are leaf modules (no imports, no DOM, no Worker or Node globals, no I/O), so both the client bundle (lazy chunk) and the Worker compile them into their own bundles; nothing is shared at run time. The lead's L0 adds a `shared` layer to `tests/unit/layering.spec.ts` (§8.2): `shared/` imports nothing; `game/`, `platform/` and `app/` may import it; `ui/` type-only.

**Root integration (lead):** the root `tsconfig.json` and `vitest.config.ts` do not see `server/**` (the root `include` lists `src`, `scripts`, `tests`, `dev`, which never reach `server/`); `npm run verify` gains `npm --prefix server run verify`; `scripts/size-check.ts` counts only what the client imports from `src/shared/` (inside the lazy `ladder` chunk).

`server/package.json` scripts:

| Script | Does |
|---|---|
| `dev` | `wrangler dev --local` (workerd + local D1) |
| `dev:node` | `tsx dev/serve.ts --port 8787 [--db :memory:\|<file>]` (Node 22, `node:sqlite`, `DEV_ROUTES=true`, test secrets) — what Playwright starts |
| `typecheck` / `test` | `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.scripts.json` / `vitest run` |
| `solutions` / `solutions:check` | build `src/content/generated/solutions.ts` / rebuild and diff (fails on drift) |
| `db:migrate:local` / `:staging` / `:prod` | `wrangler d1 migrations apply <db> --local` / `--remote --env staging|production` |
| `deploy:staging` / `deploy:prod` | `wrangler deploy --env staging` / `--env production` |
| `verify` | typecheck + test + solutions:check |

### 1.2 Runtime, environments, secrets, deploy

**Layers.** `core/` is pure: it takes a `Clock` and a `Store` (CONTRACTS §5), which keeps it unit-testable and movable. `Store` is domain-level (`findOpenBracket`, `joinBracket`, `applyWins`, `bracketView`, `finalize`, `claimReward`, `giveHeart`, `setProfile`, `deletePlayer`, …); `SqlStore` holds all SQL; `SqlDb` is D1's minimal shape (`prepare(sql).bind(…).first/all/run`, `batch(stmts)` = one atomic transaction). The `node:sqlite` shim wraps `DatabaseSync` and runs `batch` inside `BEGIN … COMMIT` (`ROLLBACK` and rethrow on any error, as D1 rolls a failed batch back; per-statement `meta.changes` returned like D1's), so the tests run the SQL D1 runs. `node:sqlite` needs Node ≥ 22.13 without a flag (it prints an ExperimentalWarning; checked on 22.22).

**Portable SQL** (a Postgres driver only rewrites `?` → `$n`): `INSERT … ON CONFLICT (…) DO NOTHING | DO UPDATE SET … = excluded.…` (never `INSERT OR IGNORE`); `RETURNING`; integer epoch ms and TEXT ids made in code; `CASE WHEN` instead of scalar `max(a, b)`; no SQLite date functions; booleans 0/1. DDL differs per dialect (`WITHOUT ROWID` is SQLite-only), so each dialect has its own migrations folder. **No interactive transactions** (D1 has atomic batches only): every read-modify-write is guarded statements in one batch (`UPDATE … WHERE … AND NOT EXISTS (…)` then `INSERT … ON CONFLICT DO NOTHING`), so two concurrent requests can never double-count.

**Budget per request** (Cloudflare figures from search summaries, 2026-10-10; verify at sign-up, §11.1):

| Limit | Our worst case |
|---|---|
| Free: 10 ms CPU per request | One `crypto.subtle.verify`, JSON ≤ 16 KB, one lazy parse of the solution table per isolate (≈ 1 ms). The generator never runs (D-2e-14) |
| Free: 50 D1 queries per invocation (Paid 1 000; re-checked 2026-10-11 on the D1 limits page; whether each statement of a batch counts separately is not stated, so we assume it does) | A batch of 10 wins ≈ 28 statements, plus the player read and a possible join and lazy finalise ≈ 40, hence `api.maxWinsPerRequest` **10**; the cron finalises ≤ 10 brackets per run on Free, each in its own invocation-sized batch |
| Free: 5 M rows read and 100 k rows written per day, reset 00:00 UTC; over it D1 errors until the reset (re-checked 2026-10-11) | Every query reads by key or index range (§1.10); no full scan in a request or the cron |
| Statement ≤ 100 KB, ≤ 100 bound parameters | Far below |

**`wrangler.toml`** (sketch; versions pinned, `compatibility_date` bumped on purpose only):

```toml
name = "mewdoku-rank"
main = "src/worker.ts"
compatibility_date = "2026-09-01"
workers_dev = false                 # production: custom domain only; staging may set it true
[observability]
enabled = true
head_sampling_rate = 1
[observability.logs]
invocation_logs = false             # Cloudflare's automatic per-request record carries request metadata
                                    # (URL, headers); our own JSON line (§1.14) is the only log, so no IP,
                                    # Authorization header or body is ever logged (verify at G-SRV-4)
[triggers]
crons = ["17 * * * *"]              # hourly at :17: finalise, nonce purge, stats; retention once a day (03:17 UTC run)

[[d1_databases]]                    # local dev (wrangler dev --local)
binding = "DB"
database_name = "mewdoku-rank-dev"
database_id = "local"
migrations_dir = "migrations"

[vars]
RANKING_ENABLED = "true"
PERIOD_MODE = "rolling"
WEB_MODE = "anon"
DEV_ROUTES = "false"
ALLOWED_ORIGINS = "http://127.0.0.1:4173,http://127.0.0.1:4174,https://localhost:8080"
MIN_CLIENT_VERSION = "0.0.0"
RC_SWITCHES = "{}"

[env.staging]                       # own D1 "mewdoku-rank-staging"; WEB_MODE "anon"; workers_dev = true until the domain exists
[env.production]
routes = [{ pattern = "rank.<public-domain>", custom_domain = true }]
vars = { RANKING_ENABLED = "true", PERIOD_MODE = "rolling", WEB_MODE = "records", DEV_ROUTES = "false",
         ALLOWED_ORIGINS = "https://*.apps.fbsbx.com,https://<web-origin>", MIN_CLIENT_VERSION = "<first 2e build>",
         RC_SWITCHES = "{}" }
# [[env.production.d1_databases]] DB → "mewdoku-rank-prod" (created with a location hint near most players)
# [[env.production.analytics_engine_datasets]] binding = "METRICS", dataset = "mewdoku_rank"
```

The production `ALLOWED_ORIGINS` is a first guess: G-SRV-1 records the real origin(s) the FB clients send (the Worker logs every denied origin), and the variable is set from that. Prefer the exact host `https://apps-<APP_ID>.apps.fbsbx.com` over the wildcard (the wildcard admits every Instant Game's pages).

**CORS is not the security boundary** (critic pass): no cookie or other ambient credential exists; the bearer token is sent explicitly from memory, so a foreign page cannot act as a player whatever CORS says. The allow-list only keeps other sites' scripts from spending our quota from players' browsers. Consequences: `Access-Control-Allow-Credentials` is never sent; if G-SRV-1 shows a sandboxed iframe sending `Origin: null` (or no stable origin) on some surface, the lead may add the literal `null` (or, as a last resort, `*`) to `ALLOWED_ORIGINS` for that reason alone, with the WAF rule and the per-IP buckets as the flood guard.

**Secrets** (`wrangler secret put <NAME> --env staging|production`; never in the repo; locally in `.dev.vars` with test values):

| Secret | Use | Rotation |
|---|---|---|
| `FB_APP_SECRET` | Verifies `getSignedPlayerInfoAsync` signatures. **Staging holds the live app's secret too**: the probe and every private test build run inside the real Instant Game, so FB signs with the live app's secret (there is no separate test app for an Instant Game's hosted bundles) | When Meta's app secret is reset: put the new value; sessions fail until then (seconds) |
| `FB_APP_SECRET_ALT` (staging and dev only) | A second, random test secret that the staging Worker also accepts, so `load.ts` and the CI smoke can sign synthetic players without ever holding the live secret. Its players land in the dev pool `fb:synthetic` (never the real `fb` pool, H-1). The production Worker refuses to start a session with it set (a test reads `[env.production]` and the Worker checks it at runtime) | Any time |
| `SESSION_SECRET` | HMAC of our tokens and stateless nonces | Any time; live tokens become invalid and clients sign in again (one extra round trip) |
| `ID_PEPPER` | `player_key = HMAC(ID_PEPPER, platform:id)`; the daily IP-quota hash | **Never** (it would orphan every player); kept offline as a backup |
| `ADMIN_KEY` | Bearer key of `/admin/v1/*` (≥ 32 random bytes; constant-time compare) | Any time |

`SESSION_SECRET` and `ID_PEPPER` are added to the lead's two (app secret, admin key) so the token key can rotate without renaming players and the app secret is never reused as a pepper.

**Deploy pipeline** (CI, e.g. GitHub Actions with a `CLOUDFLARE_API_TOKEN` scoped to this Worker and its D1 databases): `npm --prefix server ci` → `verify` → `wrangler d1 migrations apply mewdoku-rank-staging --remote --env staging` → `deploy:staging` → smoke (`/v1/health`, a session signed with `FB_APP_SECRET_ALT` into the `fb:synthetic` pool, one win, one bracket read) → on a release tag production gets the read-only smoke only (`/v1/health`, `/v1/config`; no synthetic player is ever created in production, H-1). Migrations are **expand → deploy → contract** (a column is added, used, and dropped only later), so `wrangler rollback` never meets a schema it cannot read.

### 1.3 Identity and sessions

**FB (D-2e-2):**

```
client                                         server
POST /v1/session/nonce                  ───▶   nonce = "n1.<exp36>.<rand16>.<mac16>"   (stateless: HMAC(SESSION_SECRET); no DB write)
FBInstant.player.getSignedPlayerInfoAsync(nonce) → { getPlayerID(), getSignature() }
POST /v1/session {platform:'fb', playerId, signature, nonce, clientVersion, contentVersion}
                                        ───▶   verify → upsert player → token
                                        ◀───   {token, expiresAt, player, rules, results, bracket, limits, serverTime}
```

Verification (`core/fb-signature.ts`):
1. Reject a `signature` over 4 KB or outside base64url (optional trailing `=` padding tolerated and stripped) plus exactly one `.`; split into `encSig.encPayload`; `encSig` must decode to 32 bytes.
2. `crypto.subtle.verify('HMAC', key(FB_APP_SECRET), b64urlDecode(encSig), utf8(encPayload))` — the MAC is over the payload's base64url text **as received**, never a re-encoding (the key imported once per isolate; constant time; on staging the same check with `FB_APP_SECRET_ALT` when the first fails, §1.2).
3. `payload = JSON.parse(utf8(b64urlDecode(encPayload)))`: `algorithm` equals `HMAC-SHA256` (case-insensitive); `player_id` a string of 1–64 characters; `request_payload === nonce`; `issued_at` (seconds) within [now − 10 min, now + 2 min] when present. Freshness rests on the nonce (server-made, 5 min, single use); `issued_at` is defence in depth, and srv `signature.requireIssuedAt` (default **false** until G-SRV-2 shows the field in a real signature, then true) makes a missing one `signature_stale`.
4. `body.playerId === payload.player_id` (a sanity check; the payload is authoritative).
5. The nonce: its MAC and expiry (5 min), then single use (`INSERT INTO seen_nonces … ON CONFLICT DO NOTHING RETURNING 1`; no row = `nonce_replay`).

The `<sig>.<payload>` layout and the field names are Meta's signed-request format as documented for older SDKs; Meta's 2026 plugin confirms "base64url … HMAC … OAuth 2.0 spec". **G-SRV-2** pins it with one real signature; the unit tests use our own vectors made with `node:crypto`. `player.getSignedASIDAsync()` (in Meta's 2026 plugin) could later let Meta's data-deletion callback find a player: srv `identity.storeAsidKey` false (§1.11).

**Player key and code.** `player_key = b64url(HMAC-SHA256(ID_PEPPER, "fb:" + player_id)).slice(0, 22)` (132 bits; the primary key); for the web `"web:" + deviceId` through the same HMAC. `code` = 8 random Crockford base-32 characters, unique, shown in Settings as "Player code 7KQ2-M9XD": for support, email deletion requests, admin lookups and logs; never an FB id.

**Token.** `v1.<b64url(JSON {k, c, p: pool, t: trust, v: clientVersion, iat, exp})>.<b64url(HMAC(SESSION_SECRET, part 2))[0..32]>` (constant-time compare), TTL `session.ttlMs` 24 h. The MAC check needs no DB read, but **every authenticated handler then reads the player's row once** (1 row read, by primary key; critic pass): a missing row (the player deleted their data) → 401 `token_invalid` and nothing is created; `status = 'suspended'` → 403 `suspended`, on reads too, so a suspended player is never served a view in which their own row has silently vanished (H-5). The client keeps it **in memory only** (one nonce and one session call per page load; no storage-key or iframe issue in the FB sandbox). A 401 `token_invalid` / `token_expired` makes the client sign in once more and retry.

**Web (D-2e-5).** `WEB_MODE=records` (production): `POST /v1/session` with `platform: 'web'` answers 403 `web_disabled`, and the web build never calls (`ladder.web: 'off'`). `WEB_MODE=anon` (dev, e2e, staging): `{platform: 'web', device: {id, secret}}`; the client makes `id` (22 base64url characters) and `secret` (32 random bytes, 43 base64url characters) once and keeps them in `localStorage['mewdoku.device.v1']`; the server stores `SHA-256(secret)` and gives `trust: 'anon'`, **pool `web`** (separate brackets), the same anti-cheat and rewards, and caps new registrations at `web.newDevicesPerIpPerDay` 5 per IP (a daily salted hash, kept 2 days).

**Test pools (dev only).** With `DEV_ROUTES=true` only, the session request may carry `devPool` (`/^[a-z0-9-]{1,32}$/`); the player's pool becomes `fb:<devPool>` / `web:<devPool>`, and `/dev/clock` offsets are per test pool. This lets Playwright run ranking tests in parallel without sharing brackets or clocks. The production server rejects `devPool` (400) and a test asserts that production config can never set `DEV_ROUTES` (§10.5).

### 1.4 API v1

**Conventions.** HTTPS only; `Content-Type: application/json` (POSTs also accept `text/plain` with a JSON body, which avoids a CORS preflight); UTF-8; request body ≤ 16 KB (413); every response is JSON with `serverTime` (epoch ms) and `Cache-Control: no-store`. Paths are versioned (`/v1/…`), fields are additive inside v1 (clients ignore unknown fields), a breaking change is `/v2` with both served during the move. The client version travels in the session request (`clientVersion`, then inside the token as `v`) and in every `WinSubmission`, **never as a custom header** (critic pass: a custom header made every call, even the unauthenticated nonce, session and config calls, a preflighted one, one more round trip each on Slow 4G); below `MIN_CLIENT_VERSION` the session (and a win carrying an old version) answers 426 `upgrade_required` and the client shows records. Auth: `Authorization: Bearer <token>` except `health`, `config`, `session/nonce` and `session`; admin routes use `Bearer <ADMIN_KEY>`. **CORS** (an abuse guard, not the auth boundary, §1.2): the `Origin` must match `ALLOWED_ORIGINS` (exact entries, the literal `null` if listed, or one `https://*.suffix` wildcard); the server echoes it with `Vary: Origin`, allows `GET, POST, PUT, DELETE, OPTIONS` and the headers `Authorization, Content-Type`, `Access-Control-Max-Age: 7200`, never `Access-Control-Allow-Credentials`; a disallowed origin gets no CORS headers and is counted with its value (`cors_denied`); `/admin/*` and `/dev/*` never send CORS headers. The unauthenticated calls are "simple" requests (GET, or POST with a `text/plain` JSON body and no custom header), so they need no preflight; the authenticated ones carry `Authorization` and are preflighted once per URL per `Max-Age` (Chromium caps it at 2 h). Paths carry no ids on hot routes, so preflights cache per URL. **Idempotency:** wins by client `winId` (UUID v4) and by (player, puzzle); claims by `rewardId`; hearts by (bracket, giver, row); `DELETE /v1/me` naturally; a retried request returns the original result. **Errors:** `{"error": {"code", "message", "retryAfterMs"?}, "serverTime"}`; the client branches on `code` only.

| Method | Path | Auth | Purpose | Main response |
|---|---|---|---|---|
| GET | `/v1/health` | none | Liveness, version, content versions, DB state (probe cached 30 s per isolate) | `HealthResponse` |
| GET | `/v1/config` | none | The remote switches (§1.15) | `ConfigResponse` |
| POST | `/v1/session/nonce` | none | A single-use nonce for the FB signature | `{nonce, expiresAt}` |
| POST | `/v1/session` | FB signature + nonce, or a device credential (anon mode) | Verify, create or refresh the player, issue a token; my results of the last 7 days; my bracket summary | `SessionResponse` |
| POST | `/v1/wins` | Bearer | 1–10 wins (live or queued, oldest first); a verdict per win; my bracket after them (the panel needs no second call) | `WinsResponse` |
| GET | `/v1/bracket` | Bearer | My open bracket, or the one that ended less than 24 h ago | `BracketView` |
| POST | `/v1/rewards/claim` | Bearer | Claim a rank reward, optionally doubled after a video; idempotent | `ClaimResponse` |
| POST | `/v1/hearts` | Bearer | Give a heart to a row of my bracket | `HeartResponse` |
| PUT | `/v1/me/profile` | Bearer | Nickname (word pick), avatar, listed on/off | `{player, serverTime}` |
| GET | `/v1/me` | Bearer | Profile, player code, a data summary (Settings) | `MeResponse` |
| DELETE | `/v1/me` | Bearer | Delete all my ranking data (§1.11) | 204 |
| GET | `/admin/v1/flags` | Admin | Open flags, newest first | `{flags}` |
| GET | `/admin/v1/players/{code}` | Admin | Profile, last 50 wins, flags, brackets | `{…}` |
| POST | `/admin/v1/players/{code}/suspend` · `/reinstate` · `/reset-nickname` | Admin | Moderation | `{player}` |
| DELETE | `/admin/v1/players/{code}` | Admin | Deletion on an email request | 204 |
| POST | `/admin/v1/brackets/{id}/refinalize` | Admin | Re-rank after a removal | `{bracket}` |
| GET | `/admin/v1/stats?days=7` | Admin | Daily aggregates (§1.14) | `{days}` |
| POST | `/dev/clock` · `/dev/reset` · `/dev/config` | dev server only (`DEV_ROUTES=true`) | Move a test pool's clock; wipe a test pool; set a test pool's remote switches (`/v1/config?devPool=` then answers them) | `{serverTime}` |

Error codes and the client's action:

| HTTP | `code` | Client |
|---|---|---|
| 400 | `bad_request` | Drop the request (a client bug); log |
| 401 | `token_invalid` · `token_expired` | Sign in once more, then retry |
| 401 | `bad_signature` · `nonce_invalid` · `nonce_replay` · `signature_stale` | Records for this page load; log (G-SRV-2 diagnostics) |
| 403 | `suspended` | Records plus the neutral line `ladder.paused` |
| 403 | `origin_not_allowed` · `web_disabled` | Records |
| 403 | `not_member` | Heart button disabled; no toast |
| 404 | `not_found` | Treat as gone |
| 409 | `nickname_cooldown` | Show the next allowed time |
| 409 | `heart_exists` · `heart_limit` | Keep the button pressed / disable the rest |
| 413 | `too_large` | Split the batch (never with ≤ 10) |
| 422 | `nickname_invalid` · `nickname_blocked` · `avatar_invalid` | Inline message in the name sheet |
| 426 | `upgrade_required` | Records |
| 429 | `rate_limited` (+ `retryAfterMs`) | Back off; keep the queue |
| 503 | `disabled` (kill switch, + `retryAfterMs`) · `unavailable` (D1 down or over quota) | Records; keep the queue; retry at the next boot or win |

Schemas are in CONTRACTS §2 (`src/shared/rank-api.ts`) with an example of every request and response in CONTRACTS §3. Validators are hand-written (no library): `puzzleId` against `/^(L[1-9]\d{0,5}|D\d{4}-\d{2}-\d{2}|E[a-z0-9-]{3,40}\/\d{1,3})$/` (the tutorial `T1` is never sent; `L1` is the tutorial's level number and is rejected too), `cats` against `/^[0-9a-b]{4,12}$/`, `winId` a UUID, `fish` 1…3 (or the event's lives), `bracketId` against `BRACKET_ID_RE`, `rewardId` against `REWARD_ID_RE`, an admin path's `{code}` against `PLAYER_CODE_RE` and `{id}` against `BRACKET_ID_RE` (CONTRACTS §2.1), every string field length-capped, unknown `platform` rejected; a failing body is 400 with the field path in `message`. A path or field that fails its pattern never reaches SQL.

### 1.5 Brackets and the period

**Options** (D-2e-3): (A) a per-player 24 h window grouped by start time (exact to L2, but rows freeze at different times in one list); **(B) rolling brackets** (one countdown per bracket; at most `joinWindowMs` lost by late joiners; finalisation spread over the day) — built; (C) a fixed UTC day (`'utc_day'`, everyone ends at 00:00 UTC; a player in UTC+9 resets at 09:00; a reset spike; with `utcDay.minTimeLeftMs` 2 h a bracket opened after 22:00 UTC runs to the next day's end). The assignment code takes the mode as a parameter, so (C) is a variable change.

**Assignment (rolling).** On the first **accepted** win with points > 0 while the player has no open bracket (`players.cur_bracket` null or `cur_ends_at ≤ now`). Players who only open the game are never placed, so no 0-point rows exist.
1. `SELECT id, members FROM brackets WHERE pool = ? AND finalized_at IS NULL AND join_until > ? AND members < max_members ORDER BY opened_at ASC LIMIT 1` (normally at most one per pool).
2. One batch: insert the member with `slot = (SELECT next_slot FROM brackets WHERE id = ?)`, guarded by capacity (`(SELECT COUNT(*) FROM members WHERE bracket_id = ?) < max_members`), the join window and not-already-member, `RETURNING slot`; `UPDATE brackets SET members = (SELECT COUNT(*) FROM members WHERE bracket_id = brackets.id), next_slot = CASE WHEN EXISTS (SELECT 1 FROM members WHERE bracket_id = brackets.id AND slot = brackets.next_slot) THEN next_slot + 1 ELSE next_slot END WHERE id = ?` (self-correcting; `members` is the capacity count, hidden rows included); `UPDATE players SET cur_bracket = ?, cur_ends_at = ? WHERE key = ? AND EXISTS (member row)`; then the win's own statements (§1.9.6), **every one of them guarded by `EXISTS (SELECT 1 FROM members WHERE bracket_id = ? AND player_key = ?)`**. Critic pass, two fixes: (a) a slot is never `COUNT(*)` — after a deletion the count drops and the next joiner would collide with a live slot (and inherit its hearts); `brackets.next_slot` only grows; (b) without the guard, a join that lost its race still inserted the `wins` row, so the win was deduped forever with its points added nowhere.
3. No row returned (filled or closed meanwhile): back to step 1, at most 3 times; the win's statements ran as no-ops, so the retry counts it exactly once.
4. Else a new bracket: id time-sortable random (`<base-36 ms><8 random base-36>`, matching `BRACKET_ID_RE`), `opened_at = now`, `join_until = now + joinWindowMs`, `ends_at = now + durationMs`, `max_members = bracket.maxMembers`, `next_slot = 0`; the player takes slot 0. (Two concurrent first joiners may open two brackets in one pool; harmless, and rare below hundreds of joins a minute.)

**Pools.** `fb` and `web` (and dev test pools) never mix. No skill or level matching (P-L3).

**Points.** A win counts in the bracket open for that player **when the server receives it** (server time). A win queued offline across a bracket's end counts in the next one: the server cannot verify when a win was really played, and the client never promises otherwise (H-4).

**Order and rows.** `points DESC`, then `scored_at ASC` (who reached the total first), then `slot ASC`; ranks are positions 1…N, no shared ranks (P-L11). Every visible member is returned (≤ 50 rows, ≈ 3 KB of JSON); the UI decides how many to list (`ladder.panelRows`). Nickname and avatar are copied into `members` at the join and updated in open brackets on a profile change, so a view reads ≈ 100 rows instead of joining 50 players.

**Sparse brackets.** A joiner joins only inside the join window; after it, a new bracket opens. A bracket with 1–49 members shows exactly that many rows; the view's `members` is the real count of **visible** rows (H-2), not the capacity count `brackets.members`. Copy never promises that more players will join (after `join_until` none can).

**Hidden rows** (critic pass): `members.hidden` is a bit set, `1` = suspended, `2` = not listed ("Show me in rankings" off). Suspend / reinstate set and clear bit 1 only; listed off / on set and clear bit 2 only in the player's **open** brackets; a row is visible when `hidden = 0`. So reinstating never re-shows an opted-out row, and switching listed on never re-shows a suspended one. Finalised brackets keep bit 2 as it was at finalisation (a later opt-out does not rewrite history; deletion does, §1.11).

**Life cycle.** `open (joinable) ─join_until→ open (closed to joiners) ─ends_at→ ended ─finalise→ final`. **Finalise** is idempotent and runs lazily on the first read or write that sees `ends_at ≤ now AND finalized_at IS NULL`, and in the hourly cron (at most 10 brackets per run on Free, 200 on Paid): read the visible members in order; one batch: `UPDATE members SET final_rank = ?` per member, `INSERT INTO rewards … ON CONFLICT (id) DO NOTHING` per eligible place (§1.6), `UPDATE brackets SET finalized_at = ?, final_members = ? WHERE id = ? AND finalized_at IS NULL` (`final_members` = the visible members ranked, the "of 37" of every result card, so a later deletion never changes a past result's count). Concurrent finalisers write the same rows. An admin removal after finalisation re-ranks (`refinalize`) and creates rewards for places that became eligible inside the claim window; claimed rewards are not revoked.

**What counts.** srv `scoring.modes` `['level','daily','event']` (P-L4; mirrors the client's `period.modes`, a contract test keeps them equal); points = fish kept × `pointsPerFish` (1); the tutorial never.

### 1.6 Rank rewards (D-2e-17)

| Item | Rule |
|---|---|
| Amounts | srv `rewards.places`: 1st 2 hints + 2 kitties (confirmed L6); 2nd 1 + 1, 3rd 1 + 0 (P-L5) |
| Eligibility (server only, from the frozen standings) | The bracket has at least `rewards.minMembers` (5, P-L7) visible members **and** at least p + 1 (`rewards.needOneBelow`: you beat a real player); the player has points > 0 and status `ok` |
| Doubling | srv `rewards.doubleByVideo` true (P-L6): the client offers Collect and Collect ×2 ▶ and claims with `double: true` only after `showRewarded('rank_double')` returned ok. The server cannot verify a rewarded view (no server-side check exists for FB rewarded ads), so the flag is trusted once, recorded and counted. The worst case is a few free helpers, which videos also give |
| Claim window | srv `rewards.claimTtlMs` 7 days (P-L8); then expired and not shown |
| Claim (idempotent) | One batch: `UPDATE rewards SET claimed_at = ?, doubled = ? WHERE id = ? AND player_key = ? AND claimed_at IS NULL AND voided = 0 AND expires_at > ?`, then read the row. `claimed_at` = this request's time → a fresh claim; else `alreadyClaimed: true` with the stored `doubled`. Grant = base × (doubled ? 2 : 1) |
| How the client learns | `SessionResponse.results` (finished brackets of the last 7 days, newest first, ≤ 10, each with its reward and claim), `BracketView.result` for the bracket that just ended, and the next boot |
| Client ledger | The client applies a grant once per `rewardId` (`save.ladder.claimed`, §7.1); a result whose claim exists on the server but not in the ledger (a crash after the claim) is applied once at the next session (repair) |
| Suspension after finalisation | The claim is refused (`suspended`) and the reward voided |

### 1.7 Hearts (D-2e-18, all [PROVISIONAL P-L10])

`POST /v1/hearts {bracketId, slot}` only from a member of that bracket (`not_member`), on a visible row, while the bracket is open or ended less than 24 h ago. One heart per (giver, row) per bracket (`heart_exists`); one's own row once (`hearts.allowSelf` true, orig L5); at most `hearts.maxGivenPerBracket` 20 given per bracket (`heart_limit`). Write (one guarded batch; both statements carry the same guards — visible target, no existing pair, and `(SELECT COUNT(*) FROM hearts WHERE bracket_id = ? AND from_slot = ?) < maxGivenPerBracket` — so a race can neither double-count nor pass the cap): `UPDATE members SET hearts = hearts + 1 WHERE bracket_id = ? AND slot = ? AND hidden = 0 AND NOT EXISTS (SELECT 1 FROM hearts WHERE bracket_id = ? AND from_slot = ? AND to_slot = ?) AND (cap)`, then `INSERT INTO hearts … SELECT … WHERE (the same guards) ON CONFLICT DO NOTHING`. `heartsNew` = hearts received **from others** since my `hearts_seen` (set on each bracket read); the client says "+3 hearts from other players" and never who. Hearts carry no reward, no text and no notification. Rate limit 60 per hour per player.

### 1.8 Nicknames and avatars (D-2e-16)

- **Generated name:** `adj + " " + noun + " " + num`, lists `NICK_WORDS_V1` in `src/shared/nick-words.ts` (≈ 64 adjectives and ≈ 64 cat nouns, plain everyday English words, ours; G3 writes them, the lead reviews), `num` 1–99. Names need not be unique; the number tells them apart. Lists are **append-only** (a word is never reordered or removed; a retired word maps to a fallback), and each player stores the indices and the rendered text, so editing a list never renames anyone. The server picks the first name and avatar from a hash of the player key at the first session (no dialog interrupts play).
- **Change:** `PUT /v1/me/profile {nickname: {adj, noun, num}}`; the first change is free, then at most once per `nickname.changeCooldownMs` 24 h (P-L12); copied to open-bracket rows. Names are the same text for every viewer in every locale (the glossary says so).
- **Blocklist build test:** every adjective + noun pair is checked against `moderation/blocklist.ts` skeletons, so no generated name can spell a blocked word.
- **Free text** (`nickname.freeText` false; only if the user asks): NFKC, 3–16 characters of `[\p{L}\p{N} ._-]`, at most 4 digits, no URL or handle patterns (`www`, `.com`, `@`, `http`); the skeleton (lowercase; 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s; non-letters stripped; repeats collapsed) is checked against the blocklist (substring for strong terms, whole word for ambiguous ones, starter entries for the 17 locales); admin `reset-nickname` falls back to a generated name. Every name is rendered with `textContent`.
- **Avatars:** `avatarId` 0 … `AVATAR_COUNT` − 1 (12, P-L13; our cat head in 12 coats by G2, provenance logged); default from the key hash; changeable with no cooldown.
- **Never stored:** FB names or photos (none are requested; under Zero Permissions none are available).

### 1.9 Anti-cheat (D-2e-15)

#### 1.9.1 Threat model

Every solution is public: shipped levels, dailies and events carry `s` in the client zip, and endless levels, substitutes and dailies after 2028-12 come from the bundled generator with public seeds. So "level id + the cats match the solution" proves that **the puzzle exists in content we know and the cats are its solution**, not that a human solved it. It still blocks forged ids and garbage, makes a bot do real work, and ties every point to one real puzzle, so one count per puzzle per player bounds a player's points by the content. The real limits: one count per puzzle per player; level order; dailies only near today; events only while live; fish 1–3 and consistent; per-size minimum solve times; a play-time budget; a cap on wins per bracket; flags and admin review. Stakes are a few helpers and a believable ranking, so cost and simplicity come first, and nothing is removed automatically.

#### 1.9.2 How the server knows the solutions (D-2e-14)

| Source | Ids | How the table gets it | Size |
|---|---|---|---|
| Level packs | `L2…L1000` | `src/data/levels/pack-*.json` (`s`) | ≈ 9.5 KB |
| Daily packs | `D2026-10-01…D2028-12-31` | `src/data/daily/*.json` | ≈ 8 KB |
| Event packs | `E<id>/<i>` | `src/data/events/*.json` (+ each event's window and lives) | ≈ 0.6 KB |
| **Endless** (device-generated) | `L1001…L3000` (`solutions.endlessTo`) | Offline `generatePuzzle(endlessSpec(L))` with the client's retry rule (`levels-repo.ts`), engine in Node | ≈ 20 KB |
| **Substitutes** (a pack failed to load) | source `substitute`, `L2…L1000` | Offline `generatePuzzle(substituteSpec(L))` | ≈ 9.5 KB |
| **Dailies after the packs** | `D2029-01-01…D2030-12-31` (`solutions.dailyTo`) | Offline `generatePuzzle(dailySpec(date))`, exactly the client's fallback path | ≈ 7 KB |
| **Device fallbacks inside the pack range** (critic pass) | every pack-range daily; every event index | The client's own fallback when a month or event pack fails to load: `generatePuzzle(dailySpec(date))` with the client's retry rule (`endlessRetrySpec`, band G1–G5), and `eventSpec(def, i)`. `gen-daily.ts` used a different retry (same band) and regenerated duplicates, so the device's board can differ from the pack's; only the ids whose fallback differs are stored | ≤ 8 KB |

Measured on this machine: shipped levels + dailies as compact arrays are **22.6 KB raw / 9.2 KB gzip** (keyed by id 43.2 / 14.6 KB; as 96-bit hashes 55.6 / 30.2 KB, larger and hiding nothing). The full table is ≈ 60 KB raw / ≈ 25 KB gzip, far below the Worker size limits (3 MB Free, 10 MB Paid). Generation in Node 22.22: 30 endless levels mean 98 ms (p90 306, max 494 ms), 28 dailies of 2029-01 mean 95 ms (max 756 ms); ≈ 3 730 boards take ≈ 6 min offline on one worker (≈ 3 min with `scripts/gen-pool.ts`). The table is keyed by `manifest.version` (today `content-bb8a756dfaf9`); the Worker keeps the current version and `solutions.keepVersions` 2 older ones. `build-solutions.ts` imports the root engine in Node at build time only; the Worker bundle holds data only. **Drift guard:** `solutions:check` (in `verify` and CI) rebuilds the pack part byte for byte and re-generates 20 random generated ids. Any change to `src/engine/**` or to the specs in `progression.ts` / `events.ts` that changes a generated board needs a table rebuild in the same change (the check fails otherwise).

**Lookup rule (critic pass; closes two holes of the first draft).** For each `puzzleId` the table holds the **set of every board the client can show for it** (pack, substitute, device fallback; over every kept content version). The client's `source` and `contentVersion` are informational (logged, flagged when unknown), **never a key that can skip the check**:
- the id is in the table → `cats` must equal one of its solutions, else `rejected / bad_solution` + flag (the first draft keyed by `(contentVersion, source, puzzleId)`, so a client sending an unknown `contentVersion` reached the "unknown" path with any king permutation; and an honest client whose daily month failed to load sent `source: 'generated'` for a pack-range date, which the table did not hold);
- the id lies **beyond** the table's ranges (`L > solutions.endlessTo`, `D > solutions.dailyTo`) → `cats` must be a king permutation (one cat per row and column, no two touching); then `accepted_flagged / unverified` (`antiCheat.unknownPuzzle: 'accept_flagged'`, alternative `'reject'`), and a daily counter warns when the table needs extending;
- any other id missing from the table (`L1`, a daily before the first pack month, an unknown event, an event index past its count) → `rejected / bad_puzzle_id`.

The build-time cost of the extra boards: ≈ 900 more generations, ≈ 1.5 min offline.

#### 1.9.3 The win pipeline (per win, cheapest first; no DB before step 7)

| # | Check | Fail → |
|---|---|---|
| 1 | Schema | 400 for the whole request |
| 2 | Mode scored (`scoring.modes`; never `T…`); player listed | `rejected / not_scored` · `rejected / unlisted` |
| 3 | Fish: 1 ≤ `fish` ≤ `fishMax` (3, or the event's `rules.hearts`); `revives` ≤ `scoring.maxRevives` (1); `fish == fishMax + revives × scoring.fishOnRevive − mistakes` (the save validator's own invariant, `save-fields.ts`); a win older than a change of these values is judged by the values its `clientVersion` shipped with only if the lead keeps the old values listed (otherwise such a change ships with a `MIN_CLIENT_VERSION` bump) | `rejected / bad_fish` or `inconsistent` + flag |
| 4 | Solution: lookup by `puzzleId` over every kept version and source (§1.9.2 lookup rule), `cats` ∈ the id's solutions | `rejected / bad_solution` + flag; beyond the table → `accepted_flagged / unverified`; not a known id → `rejected / bad_puzzle_id` |
| 5 | Time against the size floors (§1.9.4): below hard → reject; below soft → flag | `rejected / too_fast` + flag · `accepted_flagged / soft_fast` |
| 6 | Dates and windows: a daily `D<date>` must lie within [UTC date of (now − 12 h − `antiCheat.dailyGraceMs`), UTC date of (now + 15 h)]: no date that is still in the future everywhere (UTC+14 plus 1 h), and nothing older than a day past the end of that date anywhere (UTC−12). `dailyGraceMs` **25 h** (critic pass: the first draft's lower bound, now − 13 h, rejected an honest daily queued offline in the evening and sent the next afternoon, although the client keeps queued wins for 24 h, and it ignored `daily.dayStartHour`; the grace is ≥ `ladder.pendingMaxAgeMs` + the largest `dayStartHour` we would ship, and dedupe stays one count per date). An event `E<id>/<i>` within [startUtc − 1 h, endUtc + 6 h] (srv `antiCheat.eventGraceMs`) | `rejected / stale_date` · `event_closed` |
| 7 | Dedupe: the same `winId` → `duplicate` (the original result again); the same (player, puzzle) with another `winId` → `already_counted` (0 points) | — |
| 8 | Level order: `L` > `players.max_level` (else `already_counted`). A jump beyond `max_level + antiCheat.maxLevelJump` (30) is **accepted and flagged**, and the baseline moves (critic pass: honest players jump after playing with "Show me in rankings" off, offline beyond the 20-win / 24 h queue, or while the server was down; rejecting them was a false accusation by machine, and the budget, step 10, already bounds the rate); the first level win sets the baseline | `accepted_flagged / level_jump` + flag |
| 9 | Bracket cap: the member's wins in this bracket < `antiCheat.maxWinsPerWindow` (150); a flag at `flagWinsPerWindow` (60) | `rejected / window_cap` |
| 10 | Play-time budget (§1.9.5) | `rejected / budget` + flag |
| 11 | Write (§1.9.6), then join a bracket if needed (§1.5) | — |

Rejected wins are final (the client drops them from its queue and keeps them in its own records and streak); 5xx and timeouts keep a win queued.

#### 1.9.4 Per-size minimum solve times [PROVISIONAL P-L17] (`antiCheat.minSolveMs`)

| n | 4–5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|
| hard (reject) | 1.5 s | 2.0 s | 2.5 s | 3.0 s | 3.5 s | 4.0 s | 4.5 s | 5.0 s |
| soft (flag) | 4 s | 5 s | 7 s | 9 s | 11 s | 13 s | 16 s | 20 s |

The hard floor is about n × 0.4 s (placing n cats with no thought, kitties included). The soft floors are guesses until our telemetry exists; after launch, set them to the 0.5th percentile of accepted solves per n (an admin stats query). The client's own `rank.minSolveMs` (3 s) does not apply to the ladder: the server decides.

#### 1.9.5 Budget and rate limits

**Budget** (a token bucket on the player row: `budget_ms`, `budget_at`): refills at real time up to `antiCheat.budget.capacityMs` 8 h (a long offline queue fits); a new player starts with `initialMs` 1 h; each accepted win costs `clamp(max(solveMs, softMin(n)), 0, 30 min)`; a win that does not fit is rejected `budget` and flagged. This bounds the long-run rate to about one win per `softMin(n)` of real time. **Request rates** (per-isolate LRU token buckets, no D1 cost, best effort): wins 30/min and bracket reads 30/min per player, hearts 60/h, profile 10/h, claims 10/min, `session/nonce` and `session` 30/min per IP hash. Exact limits where they matter are D1-backed (the bracket cap, the nickname cooldown, heart uniqueness, anonymous registrations per IP per day). Plus one Cloudflare WAF rate rule on the domain (e.g. 300 requests / 10 s per IP) against floods that never reach the Worker (G-SRV-4).

#### 1.9.6 Dedupe and the atomic write

`wins` has `PRIMARY KEY (player_key, puzzle_id)`; a batch of 10 wins is one D1 batch. Per accepted win:

```sql
UPDATE members SET points = points + ?, wins = wins + 1, scored_at = ?
 WHERE bracket_id = ? AND player_key = ?
   AND NOT EXISTS (SELECT 1 FROM wins WHERE player_key = ? AND puzzle_id = ?);
INSERT INTO wins (player_key, puzzle_id, win_id, bracket_id, points, fish, solve_ms, n, verdict,
                  received_at, played_at_client, client_version)
SELECT …
 WHERE EXISTS (SELECT 1 FROM members WHERE bracket_id = ? AND player_key = ?)   -- critic pass: never a win row without its member row
ON CONFLICT (player_key, puzzle_id) DO NOTHING;
```

The handler reads the batch's `changes` per statement: a win whose `INSERT` changed no row was not counted (a lost join race, §1.5 step 3, or a concurrent duplicate) and is retried or answered `already_counted` from the stored row; the response never reports points the database did not add.

Then once per request: `UPDATE players SET max_level = CASE WHEN ? > max_level THEN ? ELSE max_level END, budget_ms = ?, budget_at = ?, seen_at = ? WHERE key = ?`. Win rows are kept `retention.winsDays` 30 (longer than the longest event, 21 days, plus its grace, and longer than the daily window); after that, dedupe still holds for levels through `max_level`, for dailies through the date window and for events through the event window. (A player who deletes their data loses this history with it, so the same FB account could re-score recent puzzles once as a new player; the budget, the bracket cap and flags bound it. Accepted: the alternative keeps data after a deletion request.)

#### 1.9.7 Flags, suspension, admin

Flag kinds `bad_solution`, `bad_fish`, `inconsistent`, `too_fast`, `soft_fast`, `level_jump`, `window_cap`, `wins_flag`, `budget`, `unverified`, `nickname_blocked`, `anon_burst`; each also increments `players.flag_count`. **No automatic action** (`antiCheat.autoSuspendFlags` 0 = off). **Suspend** (admin): `status = 'suspended'`; `members.hidden = 1` in every bracket of the player (rows vanish from others' views; open brackets re-rank on read); unclaimed rewards voided; the player is **told** (403 `suspended` → records + a neutral line), never shown a fake view of themselves (H-5). **Reinstate** reverses the hiding. Every admin action goes to `admin_log` (1 year). A suspended player who deletes their data keeps a tombstone `{player_key, suspended_until}` for 90 days, so delete-and-return does not lift a suspension (stated in the privacy notice).

### 1.10 Data model (`server/migrations/0001_init.sql`)

```sql
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE players (
  key TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, pool TEXT NOT NULL, trust TEXT NOT NULL,
  secret_hash TEXT, nickname TEXT NOT NULL, nick_adj INTEGER, nick_noun INTEGER, nick_num INTEGER,
  avatar INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'ok', listed INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL, nick_changed_at INTEGER,
  max_level INTEGER NOT NULL DEFAULT 0, budget_ms INTEGER NOT NULL, budget_at INTEGER NOT NULL,
  cur_bracket TEXT, cur_ends_at INTEGER, flag_count INTEGER NOT NULL DEFAULT 0, client_version TEXT
);
CREATE TABLE brackets (
  id TEXT PRIMARY KEY, pool TEXT NOT NULL, mode TEXT NOT NULL, opened_at INTEGER NOT NULL,
  join_until INTEGER NOT NULL, ends_at INTEGER NOT NULL, members INTEGER NOT NULL DEFAULT 0,
  next_slot INTEGER NOT NULL DEFAULT 0,       -- only grows (slots are never reused, §1.5)
  max_members INTEGER NOT NULL, finalized_at INTEGER, final_members INTEGER
);
CREATE INDEX brackets_open  ON brackets (pool, join_until) WHERE finalized_at IS NULL;
CREATE INDEX brackets_due   ON brackets (ends_at)          WHERE finalized_at IS NULL;
CREATE INDEX brackets_ended ON brackets (ends_at);          -- retention: the sweep reads by range, never a full scan
CREATE TABLE members (
  bracket_id TEXT NOT NULL, slot INTEGER NOT NULL, player_key TEXT NOT NULL, nickname TEXT NOT NULL,
  avatar INTEGER NOT NULL, points INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
  hearts INTEGER NOT NULL DEFAULT 0, hearts_seen INTEGER NOT NULL DEFAULT 0, hearts_self INTEGER NOT NULL DEFAULT 0,
  scored_at INTEGER NOT NULL, joined_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,          -- bit set: 1 suspended, 2 not listed; visible when 0 (§1.5)
  final_rank INTEGER,
  PRIMARY KEY (bracket_id, slot)
) WITHOUT ROWID;
CREATE UNIQUE INDEX members_player ON members (player_key, bracket_id);
CREATE TABLE wins (
  player_key TEXT NOT NULL, puzzle_id TEXT NOT NULL, win_id TEXT NOT NULL, bracket_id TEXT,
  points INTEGER NOT NULL, fish INTEGER NOT NULL, solve_ms INTEGER NOT NULL, n INTEGER NOT NULL,
  verdict TEXT NOT NULL, received_at INTEGER NOT NULL, played_at_client INTEGER, client_version TEXT,
  PRIMARY KEY (player_key, puzzle_id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX wins_id ON wins (player_key, win_id);   -- the `duplicate` lookup by winId
CREATE INDEX wins_received ON wins (received_at);            -- retention and the daily stats, by range
CREATE TABLE hearts (
  bracket_id TEXT NOT NULL, from_slot INTEGER NOT NULL, to_slot INTEGER NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (bracket_id, from_slot, to_slot)
) WITHOUT ROWID;
CREATE TABLE rewards (
  id TEXT PRIMARY KEY,                        -- bracket_id || ':' || slot (deterministic → idempotent create)
  player_key TEXT NOT NULL, bracket_id TEXT NOT NULL, place INTEGER NOT NULL,
  hints INTEGER NOT NULL, kitties INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  claimed_at INTEGER, doubled INTEGER, voided INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX rewards_player ON rewards (player_key, created_at);
CREATE INDEX rewards_expiry ON rewards (expires_at);
CREATE INDEX players_seen ON players (seen_at);              -- the inactive-player sweep
CREATE TABLE flags (id TEXT PRIMARY KEY, player_key TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL,
                    detail TEXT NOT NULL, resolved_at INTEGER);
CREATE INDEX flags_open ON flags (at) WHERE resolved_at IS NULL;
CREATE INDEX flags_player ON flags (player_key, at);
CREATE TABLE seen_nonces (h TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE ip_quota (day TEXT NOT NULL, ip_hash TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, ip_hash)) WITHOUT ROWID;
CREATE TABLE tombstones (player_key TEXT PRIMARY KEY, suspended_until INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE admin_log (id TEXT PRIMARY KEY, at INTEGER NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT);
CREATE TABLE stats_daily (day TEXT NOT NULL, name TEXT NOT NULL, v INTEGER NOT NULL, PRIMARY KEY (day, name)) WITHOUT ROWID;
```

`players.listed` = the "Show me in rankings" switch (§2.7): 0 sets bit 2 of `hidden` on my rows in open brackets and refuses wins (`unlisted`); 1 clears that bit again (§1.5 hidden rows). `members.hearts_self` marks my own heart so `heartsNew` counts only other players. Hot paths: a win in a bracket reads ≈ 105 rows and writes 5–6 (the member row, the win row with its two indexes, the player row); a join adds the bracket count, the member insert (2 with its index) and the player row; a bracket view reads ≈ 100 and writes 1 (`hearts_seen`). The retention sweep runs **once a day** (the 03:17 UTC cron run) and deletes in chunks of 1 000 **by index range only**. Critic pass: D1 bills (and the Free plan caps at 5 M per day) *rows read*, which counts every row a scan touches, so the first draft's hourly full scans of `wins` (hundreds of thousands of rows each) would have spent the Free daily read quota on their own; deleted rows and their index entries also count as rows written (§1.12).

### 1.11 Privacy

| Data | Purpose | Kept |
|---|---|---|
| Player key (HMAC of the FB game-scoped player id or the web device id), player code, pool, trust, listed | Identify a player without the FB id | Until deleted, or `retention.inactivePlayerDays` 180 after the last visit (P-L18) |
| Nickname (our words) and avatar id | Rows in other players' views | Same |
| Wins (puzzle id, fish, solve ms, received time, client time, client version, verdict) | Ranking, anti-cheat | 30 days |
| Brackets, memberships, hearts | The ranking | 30 days after the bracket ends |
| Rewards | Claim and audit | 30 days after the claim or expiry |
| Flags | Review | 90 days |
| `seen_nonces`, `ip_quota` (daily salted IP hash, anon mode only) | Replay and abuse | 5 min / 2 days |
| Tombstones (suspended and deleted) | Stop delete-and-return | 90 days |
| `admin_log` | Accountability | 1 year |
| Workers Logs (our own line only, player code only; no IPs, raw ids, nicknames, tokens or signatures; Cloudflare's automatic invocation logs are switched off, §1.2) | Operations | Cloudflare's retention (3 days Free / 7 Paid, verify) |

**Never stored:** FB names, photos, friends or raw FB ids (the raw id lives in memory during `/v1/session` only); emails; IP addresses (only the daily salted hash, anon mode only); device models, locale, location, ad ids or purchase data. **Transparency:** the privacy notice (G-LEGAL; not legal advice here) says a nickname, an avatar and fish totals are shared with up to 49 other players; Settings → "Worldwide ranking" shows the player code, the name, "Change name", "Show me in rankings" and "Delete my ranking data" (§2.7). **Deletion** (`DELETE /v1/me`; admin `DELETE /admin/v1/players/{code}` for email requests): one batch decrements the hearts this player gave, deletes those heart rows and the rows given to them, then their members (and recounts `brackets.members` of the affected brackets; `next_slot` is untouched, so no slot is reused), wins, rewards and flags and finally the player row (a tombstone only if suspended); open brackets re-rank on the next read (the row disappears, which is honest); finalised brackets keep their `final_rank` values and `final_members` (a gap in an ended list is the honest trace of a deletion); 204. The player's live token then fails at its next use (the per-request player read, §1.3), and a later sign-in creates a fresh player with the same key, a new code and a new name. **Meta's data deletion callback** carries the app-scoped id, not the Instant Games player id, so until `getSignedASIDAsync` is confirmed under Zero Permissions the dashboard gets the **Data Deletion Instructions URL** form: "use Settings → Delete my ranking data, or email us your player code" (G-SRV-3, §11.4).

### 1.12 Cost and abuse

**Plans** (search summaries, verify at sign-up): Workers Free 100 000 requests/day, 10 ms CPU; Paid ($5/month minimum) 10 M requests/month included then $0.30/M, 30 M CPU-ms included. D1 Free 5 M rows read/day, **100 000 rows written/day**, 500 MB per database; Paid 25 B rows read and 50 M rows written per month included, then $0.001/M read and $1.00/M written, 10 GB per database. On Free, a spent D1 daily quota fails queries until 00:00 UTC: the server answers 503 `unavailable` and clients show records and keep their queues.

**Traffic at 10 k daily players** (assumed per player per day: 2.5 page loads with one nonce and one session call each, 8 counted wins, 2 bracket reads, 0.5 hearts, 0.3 claims, ≈ 10 preflights): ≈ 26 requests (7.8 M/month), ≈ 56 rows written plus ≈ 20 more once the daily retention deletes run (deleted rows and their index entries count as written) ≈ **76** (23 M/month), ≈ 1 050 rows read (315 M/month; the per-request player read of §1.3 adds ≈ 15), ≈ 52 ms CPU. **Conclusions** (critic pass: recomputed with the deletes and the indexes): Free carries development, staging and a soft launch to **about 1.2 k daily players** (writes run out first); **Workers Paid at $5/month covers 10 k daily players** with everything inside the included amounts (≈ 23 M of 50 M writes); **≈ $200–230/month at 100 k** (≈ 230 M writes → ≈ $180, requests ≈ $20, the rest small). Levers, in order: batch queued wins (already ≤ 10 per call), shorter `winsDays`, monthly win partitions dropped whole instead of row deletes, and (an option, not built) moving the token and the client version into `text/plain` POST bodies so authenticated POSTs need no preflight (≈ −25 % requests; today only the unauthenticated calls avoid it, §1.4). D1 runs one primary per database: 10 k daily players is ≈ 15 requests/s at peak (≈ 50 statements/s), 100 k ≈ 500 statements/s; beyond that shard by pool or bracket hash across databases, or move hot brackets to Durable Objects.

| Abuse | Mitigation |
|---|---|
| Forged wins or ids | §1.9.3 steps 2–4 |
| A bot playing real puzzles fast | Hard and soft floors, budget, bracket cap, flags, admin |
| Sybil FB accounts filling a bracket | Each needs a real FB account and real wins; clustered flags reviewed; the payoff is a few helpers |
| Anonymous web ids | Off in production (D-2e-5); when on: the web pool and the per-IP quota |
| Replayed signatures, nonces or wins | Single-use nonce, `issued_at` window, idempotent wins, claims and hearts |
| Heart spam | One per row per bracket, ≤ 20 per bracket, a rate limit |
| Offensive names | Word lists only; the blocklist test; admin reset |
| Floods on open routes (`health`, `config`, `nonce`, `session`) | CPU-only until the signature passes; IP-hash buckets; the WAF rule; cached DB probe |
| Cost blow-up (Paid has no hard cap) | Usage notifications at 50 / 80 / 100 % (G-SRV-4); the `RANKING_ENABLED=false` kill switch |
| Token theft | TLS only; 24 h TTL; memory only; the per-request player read ends a deleted or suspended player's token at once |
| A foreign page calling the API from a player's browser | No ambient credential exists (the token is never in a cookie or storage), so it cannot act as the player; the CORS allow-list and the per-IP buckets limit quota abuse |
| Synthetic or test players reaching real players | Synthetic players exist only in staging's `fb:synthetic` pool or a dev test pool; production refuses `FB_APP_SECRET_ALT` and `devPool`; a release build pointing at a staging or `workers.dev` host fails the release check (§10.6) |

### 1.13 Failure modes

| Situation | Server | Client |
|---|---|---|
| Offline | — | The win goes to `save.ladder.pending` (≤ 20, ≤ 24 h old); flushed in calls of ≤ 10 at sign-in, after the next win, at Home mount and on `online`; the panel shows the cached bracket or records |
| Server down, 5xx or timeout | — | Same; backoff 5 / 30 / 120 s inside a page load |
| Kill switch `RANKING_ENABLED=false` | 503 `disabled` + `retryAfterMs` | Records for the page load; no retry until the next boot |
| D1 error or quota | Batches roll back; 503 `unavailable`; counter `d1_error` | Queue kept (wins are idempotent) |
| Clock skew | Server time decides every window, `endsAt`, finalisation, the daily and event windows | Countdown = `endsAt − (Date.now() + offset)`, `offset = serverTime − Date.now()` measured on each response; a device clock never changes a rank |
| Replay | Single-use nonce; `winId` and (player, puzzle) unique; claims and hearts idempotent | Retries are safe |
| Token expired | 401 `token_expired` | Sign in once more, retry |
| A bracket ended while offline | Lazy and cron finalisation | Next boot: `results` → the result card; the ended view shows final ranks for 24 h |
| Crash between claim and save | The claim is idempotent; `results` carry the claim | The ledger applies the missing grant once |
| Content regenerated | Old versions kept (`keepVersions` 2); unknown → `unverified` | Nothing to do |
| Client too old | 426 | Records |
| FB signature API missing or failing | — | No session → records (as the web) |
| Suspended | 403 `suspended` | Records + `ladder.paused` |
| Migration during a deploy | Expand → deploy → contract; `wrangler rollback` safe | — |
| Double finalisation | Idempotent guards | — |

### 1.14 Observability

One JSON log line per request (`{t, rid, route, status, ms, code: <player code|'-'>, pool, n, verdicts, err?, d1ms?}`; never IPs, raw ids, nicknames, tokens or signatures). Counters through Analytics Engine when bound (`req`, `session` with reasons, `win` with verdict and reason, `join`, `bracket_final` with members, `reward` created / claimed / doubled / expired, `heart`, `nickname`, `cors_denied` with the origin, `d1_error`, `kill_switch`, `config`). An hourly cron rollup into `stats_daily` (DAU, wins by verdict, brackets opened and finalised, members per bracket p10 / p50 / p90 — how sparse brackets are —, rewards, flags, unverified wins), each figure read by index range over the last hour only (never a full scan, §1.10), read through `/admin/v1/stats`. Alerts (G-SRV-4): Cloudflare notifications for the Worker error rate and usage, plus an external uptime check on `/v1/health` every 5 min.

### 1.15 Remote switches (`GET /v1/config`, D-2e-19)

The Worker answers `{switches, ttlSec, serverTime}` from the variable `RC_SWITCHES` (a JSON object of booleans, e.g. `{"iapIos": true}`), editable in the Cloudflare dashboard or with `wrangler deploy --var` without a game release; unknown keys are dropped; `ttlSec` 3600. No sign-in, no DB, CORS as above. The client applies the rules of §7.4 (off only, except `iapIos`).

### 1.16 Server configuration (`server/src/core/config.ts` defaults; variables override)

| Key (variable) | Default | Note |
|---|---|---|
| `RANKING_ENABLED` | true | Kill switch |
| `bracket.periodMode` (`PERIOD_MODE`) | `'rolling'` | P-L1; `'utc_day'` |
| `bracket.durationMs` / `joinWindowMs` / `utcDay.minTimeLeftMs` | 24 h / 2 h / 2 h | P-L1 |
| `bracket.maxMembers` | 50 | P-L2 |
| `bracket.matchBy` / `tieBreak` | `'arrival'` / `'first_reached'` | P-L3, P-L11 |
| `scoring.modes` / `pointsPerFish` / `fishMax` | `['level','daily','event']` / 1 / 3 | P-L4; mirrors `period.*`, `hearts.perAttempt` |
| `rewards.places` | 1: 2 + 2; 2: 1 + 1; 3: 1 + 0 | 1st confirmed; P-L5 |
| `rewards.minMembers` / `needOneBelow` / `doubleByVideo` / `claimTtlMs` | 5 / true / true / 7 d | P-L7, ours, P-L6, P-L8 |
| `hearts.enabled` / `allowSelf` / `maxGivenPerBracket` | true / true / 20 | P-L10 |
| `nickname.freeText` / `changeCooldownMs` | false / 24 h (first change free) | P-L12 |
| `antiCheat.minSolveMs` | §1.9.4 | P-L17 |
| `antiCheat.budget` | initial 1 h, capacity 8 h, per-win cap 30 min | ours |
| `antiCheat.maxWinsPerWindow` / `flagWinsPerWindow` / `maxLevelJump` | 150 / 60 / 30 | ours |
| `antiCheat.unknownPuzzle` / `eventGraceMs` / `dailyGraceMs` / `autoSuspendFlags` | `'accept_flagged'` / −1 h, +6 h / 25 h / 0 | ours (`dailyGraceMs` ≥ client `ladder.pendingMaxAgeMs` + the largest `daily.dayStartHour`; a contract test keeps it so) |
| `solutions.endlessTo` / `dailyTo` / `keepVersions` | 3000 / 2030-12 / 2 | build time |
| `session.ttlMs` / `nonce.ttlMs` / `signature.maxAgeMs` / `signature.requireIssuedAt` | 24 h / 5 min / 10 min / false (true once G-SRV-2 shows `issued_at`) | ours |
| `scoring.fishOnRevive` / `scoring.maxRevives` | 1 / 1 | mirror client `revive.heartsRestored` / `revive.maxPerAttempt` (contract test), used by the fish invariant of §1.9.3 step 3 |
| `api.maxWinsPerRequest` / `api.maxBodyBytes` | 10 / 16 KB | Free's 50-query limit |
| `WEB_MODE` / `web.newDevicesPerIpPerDay` | `records` (production), `anon` (dev, e2e, staging) / 5 | D-2e-5 |
| `retention.*` | wins 30 d, brackets 30 d, rewards 30 d, flags 90 d, inactive players 180 d, tombstones 90 d, admin log 1 y | P-L18 |
| `identity.storeAsidKey` | false | §1.3 |
| `MIN_CLIENT_VERSION`, `ALLOWED_ORIGINS`, `RC_SWITCHES`, `DEV_ROUTES` | per environment | `DEV_ROUTES` never true outside `dev:node`; `FB_APP_SECRET_ALT` never set in production (§1.2) |

---
## 2. The ranking in the game ("ladder"; G1 logic, G3 UI, G2 art)

### 2.1 The rules as the player sees them

- **Fish.** Each counted win adds the fish (lives) kept, 1–3, to my total in my current ranking (confirmed L3). Level, daily and event wins count (P-L4); the tutorial never.
- **A ranking** holds up to 50 real players (P-L2) and lasts 24 hours from its first win, with one countdown for everyone in it (P-L1). My next counted win after it ends puts me in a new one.
- **After every scored win** the ranking shows (confirmed L4), with the same timing as today.
- **Rewards** when a ranking ends: 1st place 2 hints + 2 kitties (confirmed L6), 2nd 1 + 1, 3rd 1 hint (P-L5), each doubled by a video (P-L6), when at least 5 players took part (P-L7).
- **Hearts:** tap a heart to cheer on a player, once per row, your own row once; no reward (P-L10).
- **Names:** every player has one of our generated cat names and one of our avatars; Facebook names and photos are never shown.
- **No history, no tabs** (likely L8, L9): one ranking, the current one (and the one that just ended, for 24 h).
- **Off switch:** Settings → "Show me in rankings" (P-L14), and "Delete my ranking data".

### 2.2 When the client talks to the server

| When | Call | Notes |
|---|---|---|
| Boot step 8 (idle after the first screen; a first-run player only after the tutorial) | `GET /v1/config` (remote switches, §7.4), then `POST /v1/session/nonce` → `getSignedPlayerInfoAsync(nonce)` → `POST /v1/session` | Never blocks boot or the first screen; no network request before the first screen. The config call runs only where the ranking origin is in use (FBIG with `VITE_LADDER_URL`, or the web with `ladder.web === 'anon'`): web-prod makes **no** request to it (§2.11, §10.5 #12) |
| Right after sign-in | `POST /v1/wins` with the queue (calls of ≤ 10) | Results of `SessionResponse.results` feed the result cards and the claim repair (§2.6) |
| t = 0 of `WON` (a counted, non-tutorial win; listed) | `POST /v1/wins` with the queue + this win (this one last) | Not signed in yet: the win is queued and the submit waits for the running sign-in, bounded by `ladder.panelWaitMs` |
| Home mount | `GET /v1/bracket` at most every `ladder.homeRefreshMs` 60 s; a pending result card opens (§2.6) | Only when signed in; a failure keeps the cached values, never an error text on Home |
| The `online` event | Queue flush | — |
| A heart, a claim, a name change, the listed switch, delete | the matching call | Each bounded by `ladder.timeoutMs` 4 s |

**Active** = `VITE_LADDER_URL` set, flags `rankings` and `ladder` on, `ladder.enabled` (remote `ladder` can turn it off), the player listed (`save.ladder.listed`), the adapter can identify the player (FB: `identity` present; web: `ladder.web === 'anon'`), and the session succeeded. Otherwise the panel, Home and Settings show the personal records (§2.9). The token and the server-time offset live in memory only.

### 2.3 At a win (session clock; today's timing unchanged)

```
t = 0       WON → winBookkeeping (+ the streak day, §5; + the daily reward, §6; + the win ENQUEUED in
            save.ladder.pending when it will ever be sent: a counted, scored win, listed, a ranking origin
            in this build, an identity available) → ONE critical save (a crash after it loses nothing)
            → ladderFlow.onWin(…): POST /v1/wins (queue incl. this win) — the answer carries my bracket
t = 1.0 s   the period counter shows counterBefore(); the kept fish fly (+kept), as today
t = 4.2–4.5 s  the ranking panel: 'bracket' (answer in) | 'loading' (until the answer or panelWaitMs 8 s after WON)
               | 'bracket' + stale (cached bracket still running) | 'records'
tap         the victory (the streak row, §5.3) → primary → the interstitial gate (§3.2) → next
```

- **The win sent** (`WinSubmission`, CONTRACTS §2): `winId` (a UUID v4 made in the **app** layer — `game/` stays free of randomness — with `crypto.randomUUID`, or from `crypto.getRandomValues` where that is missing (iOS Safari before 15.4); stored with the queued win), `puzzleId`, `source` (`pack` for level, daily and event packs, `generated`, `substitute`), `contentVersion` (the manifest's `version`), `cats` (`encodeSolution` of the won board: the column of the cat in each row), `fish` (kept), `mistakes`, `revives`, `hints`, `kitties`, `mice`, `solveMs`, `playedAt` (device clock, informational), `clientVersion`.
- **Counter before:** while the ladder is active, the in-game period counter and the Home chip show my bracket's points from the last answer (`save.ladder.current.points`) while its `endsAt` is in the future, else 0. Offline it is my estimate ("yours"), never a rank. The local weekly `save.period` keeps counting for the records (unchanged).
- **The answer** replaces `save.ladder.current` (no rows) and the rows cache (memory and `localStorage`, for the stale view; §7.1), removes accepted, duplicate, already-counted and rejected wins from the queue, keeps the rest, and emits `ladder:update`.

### 2.4 The post-win panel (overlay `ranking`, reworked by G3)

```
+------------------------------------------+
|  Daily ranking                     (i)   |  title rank.title.period.day + info button
|  +2 fish · Your total: 14                |  ladder.sub
|  Ends in 7 h 48 min · 37 players         |  countdown (server endsAt) + the server's real count
|  The top 3 win hints and kitties.        |  rewards line from rules.places (or the minimum line, or none)
| +--------------------------------------+ |
| | (1) (av) Sleepy Whisker 27   31  ♥ 4 |  rank (medal + number for 1–3), our avatar,
| | (2) (av) Velvet Paws 3       22  ♥ 1 |  nickname, fish, heart button + count
| | (3) (av) Cozy Biscuit 41     19  ♥ 0 |
| |  4  (av) Misty Pebble 9      16  ♥ 2 |
| |▶ 5  (av) Brave Noodle 12 You 14  ♥ 2 |  my row: highlighted, "You" tag
| |  …  (scrolls; at most the server's rows)|
| +--------------------------------------+ |
|  +3 hearts from other players            |  only when it happened
|           Tap to keep going              |  as today
+------------------------------------------+
```

- **Rows** are exactly the server's rows in its order with its ranks (H-3); `ladder.panelRows` 0 lists all of them in a scroll list (P-L15). Places 1–3 carry our medal **and** their number. My row is highlighted (`--accent-soft`) with a "You" tag; on open the list scrolls so my row is in the middle; when I scroll it away, a copy pins to the bottom of the list (`aria-hidden`; the real row stays in the list). Queued fish show on my row as a "+2 waiting" chip, and my rank stays the server's last one.
- **Not full:** exactly its members; "37 players" is the server's `members`; alone: my row and the line `ladder.alone` ("You're the only player in this ranking so far." — critic pass: the first draft added "More players join as they solve puzzles", which is false once the 2 h join window has closed). Never a placeholder (H-2).
- **Copy follows the server's rules, never constants** (critic pass): the rewards lines name the number of paid places from `rules.places.length` ("The top 3 …", or "First place …" when only one place pays; Appendix A's `.one` / `.other` keys), the minimum from `rules.minMembers`, the ×2 line only with `rules.doubleByVideo`; the info view's window line from `rules.periodMode` and `durationMs`. A server key change never leaves stale copy.
- **Names:** our English words in every locale, rendered with `textContent` and `dir="auto"` on `.rank-row__name` (bidi isolation in RTL rows; interpolated names already get first-strong isolates from `t()`).
- **Countdown:** "Ends in 7 h 48 min" from `formatDuration(endsAt − serverNow)`, refreshed every `ladder.countdownTickMs`, never announced; "Ends in less than a minute" in the last minute; "Final results" at or after `endsAt`.
- **Taps:** heart buttons and the info button do not continue; a drag or scroll in the list never counts as "tap to continue"; a tap outside the list card, the footer button, or Enter / Space / Esc continues (as today, after `rank.panelTapMinMs`).
- **States** (a new `RankingListState` kind `'bracket'`; the FB kinds stay for the event board):

| State | When | Shows |
|---|---|---|
| `loading` | The submit is running when the panel opens | Today's static skeleton (grey bars, no fake data) until the answer or `ladder.panelWaitMs` after WON |
| `bracket` | Answer received | The rows above |
| `bracket` + `stale` | No answer (offline, down, slow) and a cached bracket whose `endsAt` has not passed | The cached rows + "Last updated 14:02" (`ladder.stale`) + the offline line; my row shows the waiting fish |
| `records` | No usable cache, not listed, the web without anon, the ladder off | Today's personal records card; its note `ladder.unavailable`, `ladder.optedOut`, `ladder.paused` or `rank.localOnly` |

- **First time:** under the list, once, "This is you in the ranking: Brave Noodle 12. You can change your name and picture in Settings." (`nick.first.line`; `save.ladder.nickLineSeen`).

### 2.5 Home: the ranking chip and the ranking sheet

The top bar's lead slot (today the period pill, not a button) becomes the **ranking chip** (a button). The FB-only trophy and the Rankings hub go at I-3 (D-2e-4).

| State | Chip | Accessible name |
|---|---|---|
| In a running bracket (fresh or cached) | trophy "#5" · fish "14" | "Daily ranking: #5 of 37, 14 fish. Ends in 7 h 48 min." |
| No bracket now (none since the last ended) | trophy "Join" | "Daily ranking: solve a puzzle to join." |
| Not listed | trophy only | "Daily ranking: off." |
| Web without anon, or no server | today's period pill content ("14 fish this week") | today's `period.pill.*` |

A tap opens the overlay **`ladder`** (lazy `ladder` chunk): a full-height sheet with the panel's header and list, my row with a pencil (opens the name sheet, §2.7), an info button and Close; without a server, the same sheet in records mode (the records card plus the streak's best run). The **info view** (`ladder.info.*`) explains the fish, the 24 h and up to N players (from `rules`), the rewards and their minimum, ×2 by video, hearts, names and pictures (never the Facebook name), and how to switch the ranking off or delete the data. With `ladder.noticeFirst` true, the same info view opens once as a dialog (OK) before the first submit.

### 2.6 When a ranking ends: the result card, claim and ×2

**When:** `SessionResponse.results` (and `BracketView.result` of an ended bracket) list finished brackets of the last 7 days. When Home mounts and a result was neither shown (`save.ladder.resultsSeen`) nor claimed, the overlay **`ladder_result`** opens: never during play, over another modal or in the tutorial; one card per Home visit, the newest first; beyond `ladder.maxResultCards` 3 waiting, the older rewards are collected without ×2 (toast `ladder.claimed`). Which brackets get a card: `ladder.resultCard` `'always'` (P-L9) — every finished bracket I scored in; `'rewardOnly'` — only paid ones.

| Case | Card |
|---|---|
| Paid place | "Ranking results" · "You finished #2 of 37." · "Your reward: +1 hint, +1 kitty" · **▶ Collect ×2** (primary, when `rules.doubleByVideo` and rewarded ads are supported) · **Collect** |
| Top 3, too few players | "You finished #1 of 3." · "Not enough players took part for rewards this time." (`rules.minMembers`) · **OK** |
| Place 4 or lower (beyond `rules.places`) | "You finished #12 of 37." · "Thanks for playing! The top 3 win hints and kitties." (the count from `rules.places`) · **OK** |

**Claim flow** (idempotent per reward):
1. **Collect** → `POST /v1/rewards/claim {rewardId, double: false}`.
2. Success → apply the server's grant (`economy.grant`), add `"<rewardId>|<hints>|<kitties>"` to `save.ladder.claimed`, `saves.critical()`, toast `ladder.claimed`, close, emit `stock`.
3. **Collect ×2** → `adFlow.rewarded('rank_double')`; on ok claim with `double: true`. Video failed or closed early: toast `rewarded.noVideo`, the card stays. Video completed but the claim failed: the reward id goes into `save.ladder.doubleWatched`, and the next attempt claims ×2 **without a second video** (the original's "watched but not doubled" complaint, L6).
4. Offline or a server error: toast `ladder.claim.error` ("We'll keep your reward for a few days"); the card comes back on the next Home visit until `expiresAt`.
5. **Repair:** a result whose claim exists on the server but whose id is not in `save.ladder.claimed` (the app died after the claim) is applied once and recorded.

No Ads keeps rewarded videos (opt-in), so ×2 stays for No Ads owners. Without rewarded support (web-prod, no placement) the ×2 button is absent; there is no free ×2.

### 2.7 Name, picture, Settings

- **Name and picture:** the server generates both at the first session (§1.8); the first-panel line tells the player (§2.4). **Edit** in Settings → "Ranking name" or the pencil on my row in the sheet: the overlay **`nickname`** — a preview row, the avatar grid (a radio group of 12), two pickers (first word, second word) and the number, Shuffle, Save, Cancel. Save → `PUT /v1/me/profile`: ok → toast `nick.saved`, `save.ladder.nick` / `avatar` updated; 409 cooldown → "You can change your name again {time}"; 422 → `nick.rejected`, the sheet stays; offline → Save disabled with `nick.offline`.
- **Settings → "Worldwide ranking"** (FB with the ladder active, or web anon): "Ranking name" (opens the sheet), "Show me in rankings" (a switch; P-L14), "Delete my ranking data" (a confirm dialog), and the player code as plain text ("Player code 7KQ2-M9XD"; needed for email deletion requests).
- **Show me in rankings off:** `PUT /v1/me/profile {listed: false}` → my rows in open brackets are hidden; nothing is submitted; the panel and sheet show the records with `ladder.optedOut`; the chip shows "off"; queued wins stay on the device (sent if switched on again within their 24 h). **On again:** `{listed: true}`; I join a bracket with my next counted win. Offline: the switch and Delete are disabled with the line `settings.ladder.offline` (both need the server's answer).
- **Delete:** `DELETE /v1/me` → toast `settings.ladder.deleted`; the local ladder fields reset (queue, cache, ledgers keep only what prevents a double grant: `claimed` stays); the player becomes not listed. Rejoining later creates a fresh player with a new name.

### 2.8 Hearts (client)

A tap raises the count at once (optimistic), sets `aria-pressed=true` and sends `POST /v1/hearts`; on failure the count goes back and the toast `ladder.heart.error` shows (`heart_exists` keeps it pressed silently, `heart_limit` disables the remaining buttons for the bracket). My own row's heart is a button too, once (P-L10). "+3 hearts from other players" shows once per new `heartsNew` (`ladder.heartsNotify`). Hearts never name the sender, carry no text and send no notification.

### 2.9 Offline, server down, not listed: the honest fallbacks

| Situation | Panel after a win | Home chip and sheet | The win |
|---|---|---|---|
| Server reachable | Fresh bracket | Fresh | Sent at the win |
| Offline or down, a cached bracket still running | Cached rows + "Last updated hh:mm" + `ladder.offline`; my row "+N waiting" | Cached values | Queued |
| Offline, no usable cache | Records + `ladder.unavailable` | "Join" or the period pill; the sheet shows records | Queued |
| Not listed | Records + `ladder.optedOut` | "off" | Not queued |
| Suspended | Records + `ladder.paused` | "off" | Not queued |
| Web-prod | Records + `rank.localOnly` (today) | The period pill (a button now) → the sheet in records mode | None |

**The queue** (`save.ladder.pending`): at most `ladder.pendingMax` 20 (the oldest dropped, analytics `ladder_submit {result: 'dropped'}`), entries older than `ladder.pendingMaxAgeMs` 24 h dropped; each keeps its `winId`, and a counted win is unique per puzzle (levels have no replay, a daily counts once per date, an event index once), so the queue also dedupes by `puzzleId`. **Copy never promises that queued fish will count** (H-4). A **rejected** win is removed from the queue, logged (`ladder_submit {result: 'rejected', reason}`) and never shown as an accusation; the panel just shows the server's totals; the records and the streak still count it.

### 2.10 The FB weekly board: retired (D-2e-4)

`rank.fbPeriodBoard: false`: the session's `winBoards` drops `period_points`, the panel never reads it, and the v4 migration drops `rank.pending.period_points` (as v3 dropped `paw_points`). The **Rankings hub** (`rank-hub.ts`, `rank-hub-flow.ts`, the overlay id `rank_hub`) and **`HomeView.showTrophy`** with the top bar's trophy are deleted at I-3; the chip and the `ladder` sheet replace them. The FB list states (`overlay`, `see_top`, `mine`) and the band reads stay for the **event boards** in the event screen's Top list while `VITE_FB_LEADERBOARDS` lists them; release builds keep `VITE_FB_LEADERBOARDS` empty until G1 is read (the Top list then shows personal results, as on the web). If G1 confirms the removal, a later cleanup deletes `fb-ranking.ts`, `fb-overlay-views.ts`, `views/rank-list.ts` and the band code; moving the event boards to our server is a possible later item (§12 Q-L8). `period.*` and `save.period` stay for the records (`period.kind` `'week'`, P-L16).

### 2.11 The web (D-2e-5)

Web-prod shows the personal records only and never calls the server (a test asserts no request reaches the ladder origin). With `VITE_LADDER_WEB=anon` (dev, e2e, staging) the client keeps a device credential in `localStorage['mewdoku.device.v1']` (never in the save), signs in with it, and is bracketed with anonymous players only; the client renders those brackets like FB ones.

### 2.12 Client modules

| Module (new unless noted) | Owner | Layer | Does |
|---|---|---|---|
| `src/shared/rank-api.ts` | G4 | shared | The wire types, constants, validators, error codes (CONTRACTS §2) |
| `src/shared/nick-words.ts` | G3 | shared | `NICK_WORDS_V1` (append-only lists) |
| `src/game/ladder.ts` | G1 | game, pure | Queue operations (`enqueueWin`, `applyVerdicts`, caps and age), `toWinSubmission`, cache usability and `counterBefore`, the claim ledger and repair, results-seen bookkeeping, v4 field validation and merge (with `save-v4.ts`) |
| `src/game/nickname.ts` | G1 | game, pure | `nickText(nick, words)`, id bounds, the fallback "Cat {num}" for an unknown id |
| `src/app/ladder-client.ts` | G1 | app | HTTP over `fetch`, timeouts, response validation with the shared validators (bad rows dropped, never repaired into invented ones), the in-memory token, the server-time offset, one re-sign-in on 401; never rejects |
| `src/app/ladder-flow.ts` | G1 | app | Sign-in at idle, `onWin` at `WON`, queue flushes, the chip view, the sheet, result cards and claims, hearts, profile, listed, delete; bus `ladder:update` |
| `src/app/remote-config.ts` | G1 | app | §7.4 |
| `src/ui/overlays/bracket-list.ts` | G3 | ui | The list shared by the panel and the sheet: rows, my row, the pinned copy, hearts, a11y |
| `src/ui/overlays/ladder-sheet.ts` (`ladder`), `ladder-result.ts` (`ladder_result`), `nickname-sheet.ts` (`nickname`) | G3 | ui, lazy `ladder` chunk | §2.5–§2.7 |
| `src/ui/hud/ladder-chip.ts` | G3 | ui | §2.5 (the period pill renderer stays for the web state) |
| `src/ui/overlays/ranking-panel.ts` (changed) | G3 | ui | List kind `'bracket'`, `onHeart`, `onInfo`, the countdown, the tap rule for an interactive list |

Existing G1 files that change: `session.ts` (`onWon`: the ladder replaces `rankings.submitAll / fetch` for the panel; `winBoards` keeps the event board only; `listFor` returns the bracket state; `periodBefore` from `counterBefore()`), `views.ts` (`HomeView.ladder`, `HomeView.streak`; `showTrophy` false until deleted at I-3), `shell.ts` (`onLadder`), `router.ts` and `store.ts` (overlay ids `ladder`, `ladder_result`, `nickname`; `rank_hub` removed at I-3), `boot.ts` (step 8: remote config, sign-in, catalogue prefetch), `events.ts` (analytics rows, `ladder:update`, `PauseReason 'purchase'`), `flags.ts` (`ladder`, `dayStreak`), `platform/types.ts`, `platform/fb/{fbinstant.d.ts, fb-probe.ts, index.ts}` (identity).

**Bundle:** the `ladder` chunk (sheets, list, result card, name sheet and words) is lazy and prefetched at Home idle and at the mount of every **scored** board (the panel needs it by 4.2 s) — never before the first screen and never on the tutorial board (critic pass: "every board mount" included a first run's tutorial, whose win shows no ranking, and would have competed with the first-run load); `ladder-flow`, `ladder-client` and `remote-config` sit in the core lazy chunk; only the chip view, the streak strip and `game/ladder.ts`'s small helpers are in the main bundle (estimates §7.9).

---

## 3. Video ads (G1 logic, G3 UI)

### 3.1 The banner: always during levels (U-b, D-2e-8)

- **Where:** the game screen in every mode (level, daily, event), at the bottom under the helpers (320 × 50, the 2d band). Home, victory and event screens keep theirs (`ads.banner.screens` unchanged, P-B3).
- **First level:** level 10's board (`ads.banner.fromCompletedLevels` 10 → **9** at L1, P-B1: the tutorial counts as 1, so after winning level 9 `completed` is 9). Never in the tutorial (first run or replay), never with No Ads (as today).
- **Back after every hide (GAP-B1; `ads.banner.reshowAfterAnyHide`):** on the game screen that carries the band, whenever the banner is not up and the screen is free (no modal open except the coach, no ad showing, the board not won), it loads **at once** if `minReloadSec` has passed since the last load, else **one timer** loads it when the window ends. This generalises 2d.1's `hintClosed()` into `BannerFlow.reshowGame(reason)`, called from `modalClosed()` on the game screen (Settings, How to play, Shop, the name sheet), after every interstitial or rewarded video and every purchase dialog (a new `afterAd` / `afterPurchase` hook), from `screenShown('game')` inside the window (a timer instead of 2d's "skip this screen"), and once more `ads.banner.rateLimitedRetrySec` 15 s after a `rate_limited` answer. One timer at a time; a new hide, a screen change or the win cancels it; never a loop.
- **The hint card** still hides it and its close re-shows it through the same path (D-2d1-13).
- **Window:** `ads.banner.minReloadSec` 60 → **46** (L1, P-B2; Meta's limit is 45 s, one second of margin).
- **End date:** `ads.banner.untilDate` '2027-03-31' (local date): from that day `bannerGate` answers `'ended'`, no band is reserved and the board gets the room back with no release; the remote switches `banner` / `bannerInPlay` can turn it off earlier.
- **Policy:** Meta advises no banner during gameplay (R-A1); the user accepted it (U-b); STATUS-2d Q5 closes. `ads.banner.duringPlay` stays the switch (remote `bannerInPlay`).
- **Web:** none in web-prod; the mock bar in dev and e2e.

### 3.2 The interstitial: after every level, from level 10 (D-2e-7)

- **Start:** leaving level 10's victory (`ads.interstitial.minCompletedLevels` 10 unchanged, P-I1): the only sourced number (I1) and our current value; the later starts players report fit the original's tenure cooldowns and A/B tests (I2). M4 settles it; the change is one number.
- **Cadence: every level from there.** `ads.interstitial.cooldownSec` → `[{fromDay: 0, sec: 30}]` at L1 (P-I2): a 30 s floor between full-screen ads instead of the 120 / 100 / 90 s tenure steps. The gate code is unchanged and still reads the step table, so restoring the tenure cooldown is a config edit if M5 shows the original skips quick levels. The floor only stops two full-screen ads within 30 s (e.g. a hint video just before the win and then an interstitial; `ads.rewarded.resetsInterstitialClock` stays true).
- **Grace:** none in the first 60 s after the game opens (P-I3).
- **Triggers:** `next_level` and `event_next` every time the gate passes; `daily_done` kept; `retry` only on **every 2nd Retry** of the page load (`ads.interstitial.retryEveryN` 2, P-I4; the counter is in memory and resets at a level win; the gate answers `'retry_cadence'` otherwise); **new `fail_home`** (P-I5): the fail card's Home after a loss (our version of "after a player declines the revive", I4) runs `runBusy(() => helpers.interstitial('fail_home'))`, then discards and goes Home.
- **Never:** on open, during play, in the win flow (the panel and the victory come first; the ad follows the primary tap, as today), on the tutorial's "Play Level 2", on Home buttons outside the fail card, on the fail card's Continue, with No Ads.
- **Widened types:** `InterstitialTrigger` (config and `ad-pacing.ts`) and `InterstitialPlacement` (platform) + `'fail_home'`; `GateDecision` + `'retry_cadence'`.

### 3.3 Rewarded videos: when out of helpers

| Placement | When | Grant | Change in 2e |
|---|---|---|---|
| `hint` | Bulb at 0 (green video badge) → O2 | +1, used at once (P-R1) | O2 gains the Buy row (§4) |
| `kitty` | Kitty at 0 → O2 | +1, used at once (P-R1) | O2 gains the Buy row |
| `mouse` | Every use (confirmed R2) | Crosses out 3 tiles | No Buy row (no mouse product, U-d) |
| `revive` | The fail card's Continue | +1 fish, once per attempt (P-R3) | — |
| **`rank_double`** (new) | Collect ×2 on a ranking result | The rank reward doubled by the server | §2.6 |
| `group_double` | (flag off) | — | — |

O2 before the video stays (`ads.rewarded.promptFirst` true, P-R2; false starts the video at once and keeps O2 for the free fallback, the countdown and a Buy row). The no-fill toast stays ("No videos right now — try again soon."); on FB the Buy row is the other way out. The free fallback stays (web-prod and FB without a rewarded placement: one free grant per 600 s, then the countdown card, which now also carries the Buy row where payments exist).

### 3.4 Loading rules (all FB ad kinds; R-A3, R-A4)

- **30 s floor per placement ID:** `fb-ads.ts` keeps `lastLoadAt[placementId]`; a load asked within `ads.minLoadGapMs` 30 000 is scheduled for when the floor ends, never sent early (the banner keeps its own 46 s window).
- **No-fill backoff:** `ads.reloadDelaysMs` → **`[30 000, 60 000, 120 000]`** at L1; after the third failure, wait for the next show request (Meta: 30–60 s, never a tight loop).
- **Per-helper placement IDs:** new env values `VITE_FB_PLACEMENT_REWARDED_HINT`, `_KITTY`, `_MOUSE`, `_REVIVE`, `_RANK_DOUBLE`, each falling back to `VITE_FB_PLACEMENT_REWARDED` (a build with the shared ID only behaves as today); `fbBuildTag()` reports which were given as flags, never the values.
- **Preload:** at most `ads.maxPreloadedRewarded` 2 rewarded instances (ADS_TOO_MANY_INSTANCES from about 3, A10) plus one interstitial. Priority: `hint` when hints = 0, else `kitty` when kitties = 0, else `mouse` on a board, plus `revive` once the player has 1 fish left; preloaded on the `stock` event and at board mount; any other placement loads on demand within `ads.readyTimeoutMs` (the toast on timeout, as today). G11 checks this on a device.

### 3.5 Ads: analytics, copy, a11y

`ad_interstitial {trigger, result}` gains `trigger` `fail_home` and a new param `gate` (the `GateDecision` when gated); `ad_rewarded` gains `rank_double`; new `ad_banner {screen, result}` once per load attempt (≤ 1 per 46 s). No new ad copy (the ×2 keys are §7.6). The band stays reserved while a banner reloads (nothing jumps); the ×2 button's name says it plays a video.

---

## 4. Buying helpers during play (U-d; G1 logic, G3 UI)

### 4.1 O2 with a Buy row (D-2e-9)

**Products:** `iap.o2Products` (P-P1, U-d): the out-of-hints card offers the **Bulb Bundle (15 hints)**, the out-of-kitties card the **Kitty Basket (8 kitties)**, and both then offer **No Ads** (the user's "current packs … on the out-of-helpers card"); the mouse card offers nothing (no product gives a mouse, and No Ads does not remove the mouse's video). No Ads is hidden once owned (`purchases.noAds`), stays in Settings → Shop too, and carries its own plain line so nobody buys it expecting a helper or an end to the optional videos.

```
        (tool-bulb art)
        Out of hints
  Watch a short video for 1 hint,
      or buy a Bulb Bundle.
 [ ▶ Watch video                 ]   primary
 [ (bulb) Buy 15 hints · $1.99   ]   secondary; the price string from getCatalogAsync
 [ Buy No Ads · $3.99            ]   secondary (smaller); hidden when owned
   Removes banners and full-screen ads. Videos for helpers stay.   (note under the No Ads row)
            Not now                  ghost
```

With a Buy row the body uses `rewarded.body.buy.<placement>`; without one, today's text. The countdown variant reads "Next free hint in m:ss" with the Buy rows and [OK]; the free variant keeps [Take it] [Not now] and adds the Buy rows. Every Buy label starts with "Buy" and shows the catalogue price (critic pass: the first draft's "15 hints · $1.99" and "or get a Bulb Bundle" did not say that money is spent; FB's own dialog confirms the payment either way). Rows whose product is missing from the catalogue are left out one by one; when none is left the card is today's.

| Buy row state | When | Display |
|---|---|---|
| hidden | `iap.inPlay` off (or remote `iapInPlay` off), the web, FB without payments, iOS with its switch off, Messenger.com after `iap.readyTimeoutMs`, a catalogue error, the product not in the catalogue | No row; in play no error text and no Retry (Settings → Shop keeps those) |
| loading | Payments ready, the catalogue loading | The row disabled with "…" for the price, `aria-busy`, name "Getting the price…" |
| ready | The catalogue has the product | "Buy 15 hints · $1.99" / "Buy No Ads · $3.99" |
| busy | A purchase in flight | Every button disabled; the tapped Buy `aria-busy` |

The rows' states change while O2 is open (the catalogue arrives, a purchase starts or ends): the app calls `router.update('rewarded', props)` and `RewardedPrompt.update` re-renders the rows in place, keeping focus.

**Prices** come from `getCatalogAsync` (`Product.price`) exactly as given, never typed by us; the catalogue is prefetched at boot step 8 after `onReady` (`iap.prefetchCatalog`, `shopFlow.prefetchCatalog()`) and cached `iap.catalogCacheMs` 10 min. The dashboard prices stay $1.99 / $1.99 / $3.99 (U-d).

### 4.2 The purchase flow (consume first, guarded by an intent ledger; D-2e-10)

`askO2(placement, variant)` now resolves an **`O2Choice`**: `'accept' | 'buy' | 'decline'`. `helper-flows.ts` `refill(p)`:

1. `'buy'` → `shopFlow.buyInPlay(productId)` → `'ok' | 'cancelled' | 'error' | 'not_ready' | 'unsupported'` (a new member that resolves its result; `buy()` resolves void today).
2. **`'ok'`:** the pack is granted by the shop flow (+15 or +8), `stock` fires, O2 closes, toast `shop.thanks`; then **one is used at once** (`iap.useOneAfterBuy`, P-P2): the existing path continues (`spend` + the hint card, or `spend` + `KITTY`). If the board changed or the session ended while FB's dialog was open (`alive()` false, or the cells differ), the pack stays in stock unused. **No Ads bought from O2:** the entitlement is granted (banner hidden at once, the interstitial gate answers `no_ads`), toast `shop.thanks`, and **O2 stays open** without the No Ads row: it gave no helper, so the player still chooses between the video, the pack and Not now. `askO2` resolves `'buy'` only for a helper pack.
3. **`'cancelled'`** (FB `USER_INPUT`): back to O2 silently, buttons enabled, focus on Buy.
4. **`'error' | 'not_ready' | 'unsupported'`:** toast `shop.error`, back to O2, the Buy row re-evaluated (it may hide).

**Consume first** (Meta's wording P-e; `iap.grantBeforeConsume` true → **false** at L1, together with G1's ledger), exactly once:
1. `purchaseAsync` resolves `{productID, purchaseToken}`.
2. **Intent:** add `"<productId>|<token>"` to `save.purchases.pending`, then `saves.critical()` (the local mirror is written synchronously; the cloud flush follows).
3. `consumePurchaseAsync(token)`.
4. **Grant:** `applyPurchase` (adds the token to `purchases.tokens`, the existing ledger, and grants), removes it from `pending`, `saves.critical()`.

| Interruption | Recovery |
|---|---|
| The consume failed or timed out | `pending` stays; the boot restore sees the purchase still unconsumed in `getPurchasesAsync()`, consumes it, then grants. A token already in `tokens` is never granted twice |
| The app died after the consume, before the grant | At boot, a `pending` token not in `tokens` is granted without a consume call (it reached `pending` only after a successful `purchaseAsync`, so it was paid) |
| The app died after the grant, before leaving `pending` | At boot the token is in `tokens`: only dropped from `pending` |

`pending` merges by union (≤ `iap.pendingKept` 10) minus every token in either copy's `tokens`. `iap.grantBeforeConsume: true` still restores 2b's order. `remove_ads` in Settings → Shop uses the same path. The order and the ledger go into the IAP review notes (G5).

### 4.3 Timer, input and audio while FB's dialog is open

From the Buy tap until the purchase settles: `bus.emit('pause', {reason: 'purchase'})` (a new `PauseReason`; the session's timer stops, which matters for the daily's solve time), our audio mutes, board input stays locked (O2 is modal and `runBusy` holds the board), and `resume {reason: 'purchase'}` follows in a `finally`. If FB also fires `onPause`, the `fb_pause` reason stacks; both must resume before the timer runs again. The banner needs no hiding (FB's dialog is native and modal) but gets the `afterPurchase` re-show (§3.1).

### 4.4 iOS: built, off by default (U-c, D-2e-11)

- `iap.iosEnabled: false` until the user has checked Meta's current iOS rules (G10). Turning it on needs **no release**: the remote switch `iapIos: true` in `RC_SWITCHES` (§1.15, §11.5); shipping `true` as the build default is the permanent step afterwards.
- `fb-probe.ts` `paymentsSupported` stops hard-coding `IOS → false`: it answers from `getSupportedAPIs()` and the functions, and the new `Capabilities.paymentsIos` says the platform is iOS. The app decides `paymentsAllowed() = caps.payments && (!caps.paymentsIos || iosOn())` (iosOn = the remote switch when present, else `iap.iosEnabled`) in both `shopFlow.computeBuy()` (Settings → Shop) and the O2 Buy row. G1 lands the probe change and the app rule in one change, so iOS never sells in between.
- **The boot restore runs on iOS even with the switch off**: delivering an unconsumed paid purchase is never wrong.

### 4.5 The web and Messenger.com

Web (prod and dev): no payments bundled; O2 shows today's variants with no Buy row; no Shop row (unchanged). Messenger.com: `onReady` never fires, so the row is `loading` for `iap.readyTimeoutMs` 5 s from the start and then hidden. In-play purchases can be switched off as a whole: `iap.inPlay` (remote `iapInPlay`, off only).

### 4.6 Purchases: analytics, a11y

`iap {product, result, platform, source}` gains `source` `'shop' | 'o2'`; new `o2_shown {placement, video, buy}` (`buy` = the number of Buy rows shown, 0–2) and `o2_choice {placement, choice}` (`video | buy | no_ads | free | decline`); never a price or a payment id. The Buy button's name: "Buy Bulb Bundle, 15 hints, $1.99"; No Ads: "Buy No Ads, $3.99. Removes banners and full-screen ads. Videos for helpers stay."; loading: `aria-busy` and "Getting the price…"; focus stays on Watch video when present, else the first Buy, else Not now; after a cancel focus returns to the Buy that was tapped.

---

## 5. The daily streak (our provisional design, D-2e-12; G1 logic, G3 UI, G2 art)

**Evidence:** a 7-day streak and a "weekly reward" worth about 1st place exist (likely S1). What counts, the display, a missed day and the reset time are unknown (S2, S3). Look-alike apps are not evidence.

### 5.1 Rules

- **What counts:** a local day counts once the player **wins** a puzzle that day in a mode of `dayStreak.modes` (level, daily, event; P-S1). A win can be checked; "played" or "opened" would reward opening the app. Not counted: the tutorial, a restored already-won board, a replay. The daily unlocks only after level 21, so new players need levels to count.
- **The day** is the daily's date key: the local date of now − `daily.dayStartHour` hours (0: local midnight, P-D3), DST-safe (`localDateKey`).
- **Cycle:** days 1–7 (`dayStreak.cycleDays`, P-S2); the next counted day after day 7 is day 1 of a new cycle, and the run goes on for "best".
- **Rewards:** day 7 pays **2 hints + 2 kitties** (`dayStreak.reward`, P-S3; one review: about 1st place) in the same critical save as the win; days 1–6 nothing (`dayStreak.dayRewards` []); no ×2 (`dayStreak.doubleByVideo`, P-S6).
- **A missed day** (no counted win) breaks the run; the next counted day is day 1 (`dayStreak.missResets`, P-S4); no freeze, no repair by video (`dayStreak.repairByVideo`; a "keep your streak" video would be a new rewarded placement).
- **No fake urgency:** no countdown, no "you'll lose your streak!", no red warning, no reminder, no notification (G9). A broken run shows a neutral "A new streak starts today."
- **Clock guards:** a date earlier than the last counted date is ignored (moving the clock back neither counts nor resets); a date more than one day after the last is a missed day (moving the clock forward only hurts); one day forward, a win, then back counts "tomorrow" early, and on the real tomorrow nothing counts twice (accepted, R-N2); a cycle reward is paid at most once per counted date (`paid`). Optional, off (`dayStreak.serverSkewCheck`, P-S7): with a ranking `serverTime` seen in the last 24 h and the device clock off by more than `dayStreak.maxSkewMs` 36 h, a win does not count until the clock is back in range.

### 5.2 Engine and save (G1)

`src/game/day-streak.ts` (pure): `countWin(ds, dateKey, c)` → `{ ds, counted, day, reset, reward }`; `streakView(ds, today, c)` → `{ day, todayDone, alive, best, cycleDays }`; `mergeDayStreak(a, b, c)`. `winBookkeeping` calls `countWin` for a counted, non-tutorial, non-restored win in `dayStreak.modes`; the reward goes into the same critical save as the win, and `WinSummary.streak` carries `{ day, total, reward }` to the victory screen.

`save.dayStreak = { dates: string[], run: number, best: number, paid: string[] }`: `dates` the counted dates, sorted, unique, the newest `historyDays` 14; `run` the consecutive days ending at the last date; `best` ≥ `run`; `paid` entries `"<date>|<hints>|<kitties>"`, the newest `paidKept` 8. Day in the cycle = `((run − 1) mod cycleDays) + 1`; a reward is due when `run mod cycleDays = 0`, `run > 0` and the date is not in `paid`. **Merge:** `dates` = the union (newest 14); `run` recomputed from the union (count back from the newest date while consecutive; if that chain reaches the oldest kept date, extend it with the larger copy's `run` whose last date is in the chain — the stale-device case: one device counted yesterday as day 6, the other counts today); `best` = the max of both and the merged `run`; `paid` = the union; `repairPaidGrants` extends to `paid` (as for purchases), so a weekly reward granted on the older copy is not lost when stock merges newer-wins.

### 5.3 Display (G3, G2 art)

**Home: the streak strip** (`src/ui/hud/streak-strip.ts`; `dayStreak.showOnHome`, P-S5): one 32 px row under the Play button, above the daily card, inside `home__actions` (`fitHero` already shrinks the hero for it): our streak flame, 7 paw steps (empty, done, today-done, the day-7 chest) and the text; shown once `tutorialDone`.

| State | Text | Steps |
|---|---|---|
| No run (new, or broken) | "Solve a puzzle to start a streak." / after a break "A new streak starts today." | 7 empty |
| Run alive, today not counted | "Day 3 of 7 · Solve a puzzle today for day 4." | 3 done, step 4 outlined |
| Today counted | "Day 4 of 7 · Today counts!" | 4 done, step 4 with a soft check |
| Today counted, day 7 | "Day 7 of 7 · Streak reward collected!" | 7 done, the chest open |

**Victory, the day's first counted win only** (`dayStreak.victoryRow`): a row "Streak: day 4 of 7" with the 7 steps, today's filling in (no animation with reduced motion); on day 7 also "Streak reward: +2 hints, +2 kitties" (already granted and saved at t = 0, like the event milestone rewards); after a break "Streak: day 1 of 7". `VictoryProps.streak?` absent = no row (the tutorial, a second win the same day, a restored board). The daily result reopened from Home (O7) has no streak row. **How to play:** one note `howto.streak`.

### 5.4 Streak: analytics, a11y, tests

`streak_day {day, run}` on the first counted win of a day; `streak_reward {run}`; `streak_reset {prev}` logged lazily at the first view or win that finds the run broken. The strip is one `role="img"` element named "Streak: day 3 of 7. Solve a puzzle today for day 4." (its steps are decorative); the victory row is plain text; done steps have a shape (check or fill), never colour alone. Tests in §10.1.

---

## 6. The daily challenge (G1, G3)

### 6.1 Decisions

- **Unlock after level 21** (confirmed D2): `daily.unlockAfterLevel` 20 → **21** at L1 (D-2e-13). The copy "Unlocks after level 21" and the toast "Solve level 21 to open the daily puzzle." come from the existing keys with `{level}`. **Earlier unlocks are kept** (`daily.keepEarlierUnlock`): `isDailyUnlocked(save)` = `progress.level > unlockAfterLevel` **or** `Object.keys(save.daily).length > 0` **or** `inProgress.daily !== null`, so a tester who opened the daily under the old rule is not locked out and an in-progress daily is never stranded.
- **One puzzle per local day** from our packs (2026-10 … 2028-12), then generated on the device (unchanged); the date key uses `daily.dayStartHour` (P-D3). Critic pass: "today" is computed with `localDateKey(now)` in `shell.ts`, `session.ts`, `boot.ts` and `views.ts`, and "Next puzzle in …" with `localMidnightAfter` / `msUntilLocalMidnight`; G1 moves **every** one of them to `dailyDateKey(now)` and a new `nextDayStartAfter(dateKey, c)` (DST-safe), so the Home card, the stale-daily restore rule, the daily victory's countdown and the streak agree for any `dayStartHour`; a test with `dayStartHour: 4` pins it (behaviour-neutral at 0). The size schedule is unchanged until M11 (P-D4: changing it means regenerating the packs with `scripts/gen-daily.ts`, a lead task, not a config flip; the server's solution table follows through `solutions:check`).
- **The Home daily card:** unchanged (locked / not played / in progress / solved m:ss; a solved card reopens O7).
- **The result:** the existing flow — the fish fly, the **ranking panel** shows my bracket (a daily win adds its kept fish, P-L4), then the daily victory ("Solved in m:ss", mistakes, hints, "Next puzzle in …"), the streak row on the day's first counted win (§5.3), and Done (`daily_done` gate, then Home).
- **Counts for the ranking and the streak:** srv `scoring.modes` and `dayStreak.modes` include `'daily'` (P-L4, P-S1; D8 unknown, M10). The server checks a daily's date against its own clock (§1.9.3 step 6).
- **Daily reward:** none (`daily.reward` {0, 0}, P-D1; D7 found none, and the daily already feeds the ranking and the streak). A non-zero value is granted in `winBookkeeping` with the date's first win and shown on the daily victory ("Daily reward: +1 hint", `victory.dailyReward`) — G1 and G3 build that path now, behind the zero value.
- **Calendar or past days:** none (`daily.calendar` false, P-D2). If M10 shows one, it becomes its own work item (the content exists for every date to 2028-12).
- **Timer:** hidden during play; paused during a purchase (§4.3). `daily_fastest` stays off (`rank.dailyBoard: false`, an FB global board, retired with the others).

### 6.2 Daily: save, analytics, a11y

No new save field (`save.daily` unchanged). Analytics unchanged (`daily_start`, `daily_win`); `ladder_submit {mode: 'daily'}` and `streak_day` follow from the other features. No new copy unless `daily.reward` is non-zero (`victory.dailyReward`). A11y unchanged.

---
## 7. Cross-cutting: save, config, flags, remote switches, analytics, i18n, a11y, privacy, bundle

### 7.1 Save schema v4 (D-2e-6; G1: `src/game/save-v4.ts`, `save.ts`)

| Field | Shape | Default | Validation (an invalid field takes its default and is reported to `save_corrupt`) | Merge |
|---|---|---|---|---|
| `purchases.pending` | `string[]` `"<productId>\|<token>"` | `[]` | Known product ids (catalogue or retired), non-empty token, ≤ `iap.pendingKept` 10 | Union, minus every token in either copy's `tokens`, newest 10 |
| `ladder.listed` | `boolean` | `ladder.defaultListed` (true) | Boolean | The newer copy |
| `ladder.pending` | `LadderPendingWin[]` (a `WinSubmission` + `queuedAt`) | `[]` | Each validated with the shared `isWinSubmission`; ≤ `ladder.pendingMax` 20; `queuedAt` a time | Union by `winId` (then by `puzzleId`), the oldest dropped past 20 |
| `ladder.current` | `{ bracketId, endsAt, serverOffsetMs, fetchedAt, points, rank, members, maxMembers } \| null` (no rows) | `null` | Shape and ranges; a cache past `endsAt` stays (the counter treats it as ended) | The later `fetchedAt` |
| `ladder.claimed` | `string[]` `"<rewardId>\|<hints>\|<kitties>"` | `[]` | ≤ `ladder.claimedKept` 30 newest | Union (≤ 30); `repairPaidGrants` covers it |
| `ladder.doubleWatched` | `string[]` reward ids | `[]` | ≤ `ladder.doubleWatchedKept` 5 | Union |
| `ladder.resultsSeen` | `string[]` bracket ids | `[]` | ≤ `ladder.resultsSeenKept` 10 | Union |
| `ladder.nickLineSeen` | `boolean` | false | Boolean | OR |
| `ladder.me` | `{ name, avatarId, code } \| null` | `null` | `name` 1–40 characters, `avatarId` 0 … `AVATAR_COUNT` − 1, `code` 8 Crockford characters | The newer copy (the server is the source of truth; this is the offline display) |
| `dayStreak` | `{ dates, run, best, paid }` (§5.2) | `{ [], 0, 0, [] }` | Valid sorted unique dates ≤ `historyDays`; `run` 0 … 1 000 000 and ≥ the chain the dates show; `best` ≥ `run`; `paid` ≤ `paidKept` | §5.2 |
| `rank.pending.period_points` | — | — | Dropped by the migration (the FB board is retired) | — |

- **Migration v3 → v4** (`MIGRATIONS[3]`): adds the defaults above, drops `rank.pending.period_points`, **no retro grant** (the streak starts empty; nothing is derived from `save.daily`). `SAVE_VERSION` = 4; the storage keys `mewdoku.save.v1` and cloud `save` are unchanged.
- **Forward compatibility:** a v3 build reading a v4 cloud copy drops the new fields when it writes back; acceptable because FB serves every player the current build (noted in 04 §7 at I-5). **Consequence (critic pass): once a 2e build has reached players, the FB build is never rolled back to a pre-2e build** — a v3 writer would wipe every streak, the purchase intent ledger (`purchases.pending`: a paid but not yet granted pack would then rely on the FB restore alone) and the rank-claim ledger (the repair path would then grant recent claims a second time). An emergency fix goes forward; this goes into the release checklist and §11.5.
- **Kept out of the save** (and so out of FB's cloud): the bearer token (memory), the web device credential (`localStorage['mewdoku.device.v1']`), the remote switches cache (`localStorage['mewdoku.rc.v1']`), and the cached bracket **rows** (other players' names: memory and `localStorage['mewdoku.ladder.rows.v1']`, used only for the stale view, dropped when `endsAt` passes).
- **Size:** ≤ 20 pending wins × ≈ 250 B + small ledgers ≈ 6 KB; FB's limit is 1 MB.

### 7.2 Config (`src/app/config.ts`; lead only)

#### 7.2.1 Added at L0 (this stage; tsc and vitest green)

| Key | Value | Spec |
|---|---|---|
| `InterstitialTrigger` + `'fail_home'`; `ads.interstitial.triggers` + `'fail_home'` | — | §3.2 (no code passes it before the build) |
| `ads.interstitial.retryEveryN` | 2 | §3.2, P-I4 |
| `RewardedPlacementId` + `'rank_double'`; `ads.rewarded.placements` + `'rank_double'` | — | §2.6, §3.3 |
| `ads.rewarded.promptFirst` | true | §3.3, P-R2 |
| `ads.banner.reshowAfterAnyHide` / `untilDate` / `rateLimitedRetrySec` | true / `'2027-03-31'` / 15 | §3.1 |
| `ads.minLoadGapMs` / `ads.maxPreloadedRewarded` | 30 000 / 2 | §3.4 |
| `daily.keepEarlierUnlock` / `reward` / `calendar` / `dayStartHour` | true / {0, 0} / false / 0 | §6.1, P-D1–P-D3 |
| `rank.fbPeriodBoard` | false | §2.10 |
| `iap.iosEnabled` / `inPlay` / `o2Products` / `useOneAfterBuy` / `pendingKept` / `prefetchCatalog` | false / true / `{hint: ['hints_15', 'remove_ads'], kitty: ['kitties_8', 'remove_ads'], mouse: []}` (critic pass: `'remove_ads'` added per U-d) / true / 10 / true | §4 |
| `ladder` (new group) | `{enabled: true, web: 'off', timeoutMs: 4000, panelWaitMs: 8000, homeRefreshMs: 60 000, pendingMax: 20, pendingMaxAgeMs: 86 400 000, batchMax: 10, backoffMs: [5000, 30 000, 120 000], resultCard: 'always', maxResultCards: 3, resultsSeenKept: 10, claimedKept: 30, doubleWatchedKept: 5, optOutAllowed: true, defaultListed: true, noticeFirst: false, heartsNotify: true, countdownTickMs: 60 000, panelRows: 0}` | §2 |
| `dayStreak` (new group) | `{enabled: true, modes: ['level','daily','event'], cycleDays: 7, reward: {hints: 2, kitties: 2}, dayRewards: [], doubleByVideo: false, missResets: true, repairByVideo: false, historyDays: 14, paidKept: 8, showOnHome: true, victoryRow: true, serverSkewCheck: false, maxSkewMs: 129 600 000}` | §5 |
| `remote` (new group) | `{enabled: true, ttlSec: 3600, timeoutMs: 4000}` | §7.4 |
| Types `LadderWebMode`, `LadderResultCardMode` | — | §2 |
| `@deprecated phase2e` | `rank.showPanelWithoutProvider` (unread since 2b) | — |

#### 7.2.2 L1: value changes of existing keys (the lead, at I-2, with the tests that pin today's values)

No build stage may run a half-built behaviour (consume-first without its ledger, unlock 21 without the kept unlocks), and `tests/unit/sanity.spec.ts` pins the cooldown table, so these change only at integration. Every workstream tests its new behaviour against `mergeConfig({…})` with the target values, never against today's defaults.

| Key | Today → 2e | Needs first | Pinned by |
|---|---|---|---|
| `daily.unlockAfterLevel` | 20 → **21** | G1's kept-unlock rule | G1 tests, e2e smoke |
| `ads.banner.fromCompletedLevels` | 10 → **9** | — | G1 banner tests, e2e fbig |
| `ads.banner.minReloadSec` | 60 → **46** | G1's re-show | G1 banner tests |
| `ads.interstitial.cooldownSec` | `[{0,120},{2,100},{7,90}]` → **`[{fromDay: 0, sec: 30}]`** | G1's retry cadence | `sanity.spec.ts` (lead), G1 pacing tests |
| `ads.reloadDelaysMs` | `[5000, 30 000, 120 000]` → **`[30 000, 60 000, 120 000]`** | G1's load floor | G1 fb-ads tests |
| `iap.grantBeforeConsume` | true → **false** | G1's intent ledger | G1 shop tests |

**Unchanged on purpose** (all provisional, §0.7): `ads.interstitial.minCompletedLevels` 10, `sessionGraceSec` 60, `ads.banner.screens`, `hints.perRewardedAd` 1, `kitty.perRewardedAd` 1, `revive.*`, `period.kind` `'week'`, `period.modes`. The lead never removes a key; a key the 2e build stops reading becomes `@deprecated phase2e` at I-5 (expected: none beyond the one above; `rank.boards.period` stays read while `rank.fbPeriodBoard` can be turned on).

### 7.3 Flags and build values

- **Flags** (`src/app/flags.ts`, G1 at S0): `ladder` (on) and `dayStreak` (on); `rankings` stays the master switch of every ranking surface; `?flags=-ladder` gives the 2c records path for tests.
- **Env** (`src/env.d.ts`, lead at L0; empty = off, never a broken build): `VITE_LADDER_URL` (the API base, e.g. `https://rank.<domain>`; empty = no ladder, records as today); `VITE_LADDER_WEB` (`off` | `anon`; overrides `ladder.web` in dev / e2e builds); `VITE_FB_PLACEMENT_REWARDED_{HINT,KITTY,MOUSE,REVIVE,RANK_DOUBLE}` (each falls back to `VITE_FB_PLACEMENT_REWARDED`). `fbBuildTag()` reports which were given, as flags only. e2e builds: `VITE_LADDER_URL=http://127.0.0.1:8787`, `VITE_LADDER_WEB=anon` (web twin).

### 7.4 Remote switches (`src/app/remote-config.ts`, G1; server §1.15)

`GET /v1/config` at idle after the first screen (no sign-in), only where the ranking origin is in use (§2.2; never on web-prod), cached in `localStorage['mewdoku.rc.v1']` for `remote.ttlSec` (the read and write wrapped in try/catch: storage can be missing in the FB iframe); on failure the cache, else the build values; booleans only, unknown keys ignored — switches, not remote tuning. A switch applies from the moment it arrives (a banner already up is hidden when `banner`/`bannerInPlay` turn off; the Buy rows re-evaluate), never retroactively to a purchase already in flight.

| Switch | Overrides | Direction |
|---|---|---|
| `iapIos` | `iap.iosEnabled` | **on or off** (its purpose: iOS purchases on without a release, U-c) |
| `iapInPlay` | `iap.inPlay` | off only |
| `banner` | `ads.banner.enabled` | off only |
| `bannerInPlay` | `ads.banner.duringPlay` | off only |
| `ladder` | `ladder.enabled` | off only |

"Off only": a remote `true` cannot turn on what the build ships off, so a compromised or misconfigured server can never add ads or purchases (except iOS purchases, a reviewed flow the user decided to allow). Analytics `remote_config {result: 'ok' | 'cached' | 'default'}`.

### 7.5 Analytics (names ≤ 40, ≤ 25 params, values ≤ 99 characters; `ANALYTICS_PARAM_KEYS` gets every row; the 05 §10 limits test covers them)

| Event | Params | When |
|---|---|---|
| `ladder_auth` | `platform`, `result` (`ok \| no_api \| rejected \| error \| timeout \| disabled`) | Sign-in |
| `ladder_submit` | `mode`, `result` (`accepted \| flagged \| duplicate \| counted_before \| rejected \| queued \| dropped \| error`), `reason`, `ms` | Per win, at send or queue |
| `ladder_panel` | `state` (`bracket \| stale \| records \| loading`), `rows`, `rank`, `ms` | The panel shown (once per win) |
| `ladder_open` | `from` (`home \| settings`) | The sheet opened |
| `ladder_result` | `rank`, `size`, `rewarded` (0/1) | A result card shown |
| `ladder_claim` | `result`, `doubled` (0/1) | A claim |
| `heart_give` | `result`, `self` (0/1) | A heart |
| `nick_set` | `result`, `avatar` (0/1 changed) | A profile save |
| `ladder_listed` | `on` (0/1) | The Settings switch |
| `ladder_delete` | `result` | Delete |
| `streak_day` | `day`, `run` | The first counted win of a day |
| `streak_reward` | `run` | A cycle reward |
| `streak_reset` | `prev` | A broken run found |
| `o2_shown` | `placement`, `video`, `buy` (0/1) | O2 opened |
| `o2_choice` | `placement`, `choice` (`video \| buy \| no_ads \| free \| decline`) | O2 answered |
| `iap` (changed) | + `source` (`shop \| o2`) | — |
| `ad_interstitial` (changed) | + `gate` (the `GateDecision` when gated) | — |
| `ad_banner` | `screen`, `result` | A banner load attempt |
| `remote_config` | `result` | The fetch |

Never sent: a nickname, a player key or code, a token, a bracket or reward id, a price or a payment id.

### 7.6 i18n

New file `src/i18n/en/ui-2e.ts` (G3 at S0; Appendix A has every English string, ours), then the 16 locale drafts in the build (AI drafts, reviewed later, as in 2b–2d.1; release builds ship English only). Reused keys: `rank.title.period.day` ("Daily ranking"), `rank.tap`, `rank.localOnly`, `fish.count.*`, `rewarded.noVideo`, `shop.thanks`, `shop.error`, `shop.product.<id>.name/desc` (the Buy label's `{name}` and `{items}`), `home.daily.locked` / `lockedToast` (with level 21). **Glossary** (`docs/i18n/glossary.md`): "ranking" (never "leaderboard" in UI copy), "heart" (a cheer, never a life: fish are lives), "streak" (days in a row; not the retired perfect streak), "ranking name" (the nickname; never translated: names are the same text in every locale), "player code". `i18n:check` adds width limits for the chip (12), the Buy labels (28: "Buy 15 hints · $1.99" with a long catalogue price such as "1,99 US$") and the streak strip text (36). Ranking names are our English words in every locale and are never translated; in RTL layouts they are bidi-isolated (§2.4).

### 7.7 Accessibility

Every new control is at least 44 × 44 CSS px (rows 48 px); every new overlay uses `createOverlayShell` (`role="dialog"`, labelled by its title, focus trap, Esc closes; the result card's Esc means "later"); countdowns are never live regions; reduced motion gives fades only (no row animation, no heart pop, no step fill animation); nothing depends on colour alone (medals carry numbers, steps carry shapes); new texts follow the language on every render (A11Y-I18N-1); RTL uses logical properties (rank and avatar at the start, fish and hearts at the end). The list is `role="list"` with `listitem` rows named "#5, Brave Noodle 12, you, 14 fish, 2 hearts"; a heart button "Give a heart to Velvet Paws 3, 1 heart" with `aria-pressed`; my rank is announced politely once when the panel opens ("You are #5 of 37 in the daily ranking."). Focus: the panel opens with focus on its footer button (as today), the rows are not tab stops, only their heart buttons are; Tab from the last heart wraps inside the dialog. The e2e `i18n.spec` adds the panel, the sheet, the result card, the name sheet, O2 with both Buy rows and the streak strip in `ar` and `de` at 320 px.

### 7.8 Privacy (client side; gate G-SRV-3)

What leaves the device with the ranking on (FB): the FB-signed player id (verified, then reduced to a server key), the ranking name and avatar ids, the win records of §2.3, hearts given. Never: the FB name or photo, the locale, analytics ids, device data. Needed before a public release: a privacy policy that covers the ranking (Settings has its `privacyUrl` row), the dashboard's Data Deletion Instructions URL (§1.11), the in-game controls (§2.7), and the info line `ladder.info.names`. Whether a notice is needed before the first submit is G-SRV-3 / G-LEGAL (`ladder.noticeFirst`, built, off).

### 7.9 Bundle and load time (I-4)

| Code | Estimate | Where |
|---|---|---|
| `ladder` chunk (sheet, list, result card, name sheet, words) | ≈ 14–18 KB JS + 4 KB CSS | Lazy (new `assets/ladder-*.js` row in `size-check.ts`) |
| `ladder-flow` + `ladder-client` + `remote-config` + the shared validators | ≈ 8–10 KB | Core lazy chunk |
| The chip, the streak strip, `day-streak.ts`, `ladder.ts` helpers, the O2 Buy row | ≈ 4–5 KB | Main bundle (none is needed by a first run's tutorial board; they can move after the first screen if a ceiling binds) |
| 12 avatars, 3 medals, the hearts, the chest, the flame, the steps, the name tag | ≈ 6–8 KB | Lazy art (`lazy-art` or the `ladder` chunk) |

Savings at I-3: the rank hub and its flow (≈ 6 KB lazy). No new network request before the first screen (the remote switches, the sign-in and the catalogue prefetch wait for idle), so the first-run load gate (≤ 4.5 s uncompressed, STATUS-2d §11; today 3.71 s, 0.79 s of margin) is expected to hold; the lead re-measures at I-4 with the 2d.1 method **on an FBIG e2e twin built with `VITE_LADDER_URL` set and the local ranking server running** (critic pass: so any request that slips before the first screen is in the measurement) and resets the ceilings to the largest build + ≈ 3 % (04 §9). Budget rules for the builders: nothing of the ranking UI (panel list, sheets, result card, name sheet, words, avatars, medals) in the main bundle; the main bundle gains at most ≈ 5 KB JS and ≈ 1.5 KB CSS (the chip, the strip, the O2 Buy rows, `day-streak.ts`, `ladder.ts`' queue helpers); if the first-run time grows by more than 0.15 s, the strip and the chip move to the core lazy chunk (Home renders the period pill until it lands) before any ceiling is raised.

---

## 8. Workstreams, ownership and order

### 8.1 Ownership (disjoint; every new file starts with `// Owner: G1|G2|G3|G4 (Phase 2e)`)

| WS | Scope | Owns (files) |
|---|---|---|
| **G1** logic, app, platform client | The ladder client and flow, the save v4, the streak engine, ad pacing and the banner re-show, the in-play purchase flow and ledger, the iOS switch, the remote switches, the probe and identity, analytics, the FB stub, e2e against the local server | `src/game/**`, `src/app/**` except `config.ts`, `src/platform/**`, `src/workers/**`, `tests/unit/{game,app,platform,workers}/**` (except `platform/scripts.spec.ts`, the lead's), `tests/fixtures/fbinstant-stub.js`, `tests/fixtures/ladder-fake.ts` (new), `tests/e2e/{smoke,winflow,layout,fbig,events}.spec.ts`, **new** `tests/e2e/ladder.spec.ts` and `tests/e2e/helpers/rank-players.ts`, `docs/phase2b/fb-dashboard.md` rows, `docs/phase2e/requests-G1.md` |
| **G2** art, board | Streak flame, streak steps, trophy and medals, the reward chest, 12 avatars, the hearts, the name tag and the edit/shuffle icons, the O2 pack mini-art (reusing the shop's), art and board CSS | `src/ui/art/**`, `src/ui/board/**`, `src/styles/{art,board,tokens}.css`, `scripts/palette-check.ts`, `tests/unit/ui/{board-view,board-entry,board-mouse-late,art-a11y-fx,palette-check,css-rules,layout}.spec.ts` and a **new** `tests/unit/ui/art-2e.spec.ts`, `tests/e2e/visual-board.spec.ts`, `docs/phase2e/provenance-G2.md`, `docs/phase2e/requests-G2.md` |
| **G3** HUD, screens, overlays, i18n | The reworked ranking panel and the bracket list, the `ladder` sheet, the result card, the name sheet, the chip, the streak strip, the victory streak row and daily reward line, O2's Buy row, the Settings rows, every string and the 16 drafts, the nickname word lists | `src/ui/{hud,screens,overlays,fx,a11y}/**`, the other `src/ui/*.ts` helpers, `src/styles/**` except art / board / tokens, `src/i18n/**`, `src/shared/nick-words.ts`, `docs/i18n/**`, `tests/unit/ui/**` except G2's, `tests/unit/{shell,i18n}/**`, `tests/e2e/{visual,i18n}.spec.ts`, `docs/phase2e/provenance-G3.md`, `docs/phase2e/requests-G3.md` (sounds, if any are needed: `src/audio/**` as in 2d.1) |
| **G4** server (new, D-2e-21) | The whole backend (§1) and the wire contract | `server/**` (own `package.json`, tests, migrations, wrangler config, dev server, scripts), `src/shared/rank-api.ts`, `tests/unit/shared/**`, `docs/phase2e/requests-G4.md` |
| **Lead** | Config, contracts, integration, budgets, the probe, CI wiring, docs | `src/app/config.ts`, `src/env.d.ts`, `src/data/**`, `dev/**` (incl. the new `dev/rank-probe/`), `scripts/**`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, root `package.json`, `tests/unit/{sanity,layering,build-config}.spec.ts`, `tests/unit/platform/scripts.spec.ts`, every doc not listed above |

Read-only for everyone: `src/engine/**`, `tests/golden/**`, `tests/property/**`, `tests/e2e/determinism.spec.ts` (running them is fine). A change in another workstream's file goes through `docs/phase2e/requests-<owner>.md` (as in 2d); the lead closes requests at I-2.

### 8.2 Order

1. **L0 (lead).** Done at this stage: the config keys (§7.2.1), this spec, [CONTRACTS](CONTRACTS.md), `ask-user.md` in the repo. Still to do before S0: `src/env.d.ts` (§7.3); the `shared` layer in `tests/unit/layering.spec.ts` (`shared/` imports nothing; `game/`, `platform/`, `app/` may import it; `ui/` type-only); `vite.config.ts` chunk name `ladder` and the `VITE_LADDER_*` passthrough; root `package.json` `verify` gains `npm --prefix server run verify` (guarded so a checkout without `server/node_modules` says what to run); the four `requests-G*.md` files; a size-check row placeholder for the `ladder` chunk.
2. **S0 (additive interfaces only; each keeps `tsc` and `vitest` green; in this order):** G4 (the complete `src/shared/rank-api.ts` with real validators, the `server/` scaffold answering `/v1/health`, the contract fixtures) → G2 (placeholder symbols for every new art id, Appendix C) → G3 (the exported props types of §9.1, the English keys, optional members on existing props, stub overlays) → G1 (game, app and platform types, flags, overlay ids, stubs). CONTRACTS lists every S0 member and which become required at I-3.
3. **E1 build, in parallel.** G4: S1 the Node dev server with session, wins and bracket (+ unit and HTTP tests) → S2 rewards, hearts, profile, me, delete, admin, cron, config → S3 the solution table and `solutions:check`, the full anti-cheat, staging deploy scripts, the load script. G1, G2, G3: everything in §8.3. **L0b (lead, once G4's S1 runs):** Playwright `webServer` entry for `npm --prefix server run dev:node -- --port 8787`, the e2e builds' `VITE_LADDER_URL` / `VITE_LADDER_WEB`, the e2e FB test secret shared by the stub and the dev server.
4. **The probe (lead + user), as soon as staging answers:** `dev/rank-probe/` — a standalone FBIG bundle (SDK 8.0: `initializeAsync`, `startGameAsync`, then `GET /v1/health`, `GET /v1/config`, `POST /v1/session/nonce`, `getSignedPlayerInfoAsync(nonce)`, `POST /v1/session` against staging, every result on screen and in a copyable text box). The user uploads it as a private build and opens it on the four surfaces (§11.6): G-SRV-1 and G-SRV-2 in one go.
5. **E2 (as the user's material arrives):** each M-item updates the §0.7 register and its keys; a compare note per item, as 2d's.
6. **Integration (lead):** I-1 dev harnesses (the four `dev/*-harness.html` take the new props; a `dev/ladder-harness.html` renders the panel, sheet and result card from contract fixtures); I-2 requests and the L1 flips (§7.2.2); I-3 required members and deletions (§8.4); I-4 budgets and load time (§7.9); I-5 docs (Appendix B); I-6 acceptance (§10.7).

### 8.3 Work items

| WS | Items |
|---|---|
| **G4** | `src/shared/rank-api.ts` (types, constants, validators, error codes); `server/` scaffold; `SqlDb` + `node:sqlite` shim + D1 driver; migrations; `core/` (signature, nonce, token, ids, brackets both modes, the wins pipeline, anti-cheat, rewards, hearts, nicknames, moderation, clock); handlers; cron (finalise, retention, nonce purge, stats); admin; `/v1/config`; the dev server with test pools and the dev clock; `build-solutions.ts` + `solutions:check` + the generated table; wrangler environments; unit, HTTP, contract (fixtures) and optional workerd tests; abuse tests; `load.ts`; `server/README.md` (operator notes that point to spec §11) |
| **G1** | `game/{ladder,day-streak,nickname,save-v4}.ts`; `save.ts` v4; `progression.ts` (kept unlocks, `dayStartHour`); `ad-pacing.ts` (`fail_home`, `retry_cadence`, `untilDate` → `'ended'`); `economy`/`purchases` (pending ledger, `repairPaidGrants` over `ladder.claimed` and `dayStreak.paid`); `app/{ladder-client,ladder-flow,remote-config}.ts`; session and win wiring (§2.12); views (`HomeView.ladder`, `HomeView.streak`, `VictoryProps.streak`, daily reward); `banner-flow` `reshowGame`; the interstitial triggers and retry cadence; `fb-ads` floor, backoff, per-placement IDs and preload; `shop-flow` `buyInPlay`, `prefetchCatalog`, consume-first ledger, iOS rule; `helper-flows` `O2Choice` and the buy path; `PauseReason 'purchase'`; the probe (`paymentsIos`, `identity`); `fbinstant.d.ts`; the stub (signing, `no-signed-info` preset, payments iOS); flags, analytics rows; the `ladder` lazy chunk barrel; unit tests; e2e (`ladder`, `fbig`, `smoke`, `winflow`); `fb-dashboard.md` rows (placements, products, iOS) |
| **G2** | Art of Appendix C (our own drawings, one provenance row each); the art CSS; art unit tests; `visual-board` captures if the board changes (none expected) |
| **G3** | `bracket-list.ts`, the reworked `ranking-panel.ts`, `ladder-sheet.ts`, `ladder-result.ts`, `nickname-sheet.ts`, `ladder-chip.ts`, `streak-strip.ts`, the victory streak row and daily reward line, O2's Buy row and states, the Settings rows, the info view and the notice mode; `ui-2e.ts` English at S0, then the 16 drafts, the glossary and the review log; `nick-words.ts` (≈ 64 + 64 words; checked against the server's blocklist test before landing); unit, visual and i18n e2e; provenance |
| **Lead** | L0 and L0b; the probe bundle; the L1 flips; I-1 … I-6; the deployment guide kept current (§11); the daily packs if M11 changes the schedule |

### 8.4 Required members and deletions at I-3

Optional at S0, **required at I-3**: `Capabilities.paymentsIos`, `RewardedPromptProps.buy` / `onBuy`, `VictoryProps.streak` / `dailyReward`, `HomeView.ladder` / `streak`, `HomeCallbacks.onLadder`, `RankingPanelProps.onHeart` / `onInfo`, `PacingInput.retryIndex`, `BannerGateInput.today` (`SettingsProps.ladder` and `PlatformAdapter.identity` stay optional: absent hides the rows / means no FB identity). **Deleted at I-3:** `src/ui/overlays/rank-hub.ts`, `src/app/rank-hub-flow.ts`, the overlay id `rank_hub` and its props entry, `HomeView.showTrophy`, `HomeCallbacks.onTrophy` and the top bar's trophy button on Home (`TopBarProps.showTrophy` stays optional for the event screen if it uses it), the period-board path in `session.ts` `winBoards`, and every fake's members for them (`tests/unit/app/harness.ts`, `boot.spec.ts`). The 2c `RankingListState` kinds stay (event boards).

---
## 9. Interfaces (summary; exact TypeScript in [CONTRACTS](CONTRACTS.md))

### 9.1 TypeScript

| Area | Interface | Owner | CONTRACTS |
|---|---|---|---|
| Wire contract | `src/shared/rank-api.ts`: `Pool`, `Trust`, `PeriodMode`, `PlayerView`, `RulesView`, `SessionRequestFb/Web`, `SessionResponse`, `WinSubmission`, `WinsRequest/Response`, `WinVerdict`, `WinReason`, `BracketRow`, `BracketView`, `BracketSummary`, `ResultView`, `RewardView`, `ClaimView`, `ClaimRequest/Response`, `HeartRequest/Response`, `ProfileRequest`, `MeResponse`, `ConfigResponse`, `HealthResponse`, `ApiError`, `ErrorCode`; constants `API_VERSION`, `MAX_WINS_PER_REQUEST`, `MAX_BODY_BYTES`, `AVATAR_COUNT`, `NICK_NUM_MIN/MAX`, `REMOTE_SWITCHES`; validators `isWinSubmission`, `parseSessionResponse`, `parseWinsResponse`, `parseBracketView`, … (never throw; `null` = invalid) | G4 | §2 |
| Word lists | `src/shared/nick-words.ts`: `NICK_WORDS_V1: { adj: readonly string[]; noun: readonly string[] }` | G3 | §2.3 |
| Server internals | `Store`, `SqlDb`, `Clock`, `Env`, `ServerConfig` | G4 | §5 |
| Platform | `PlatformAdapter.identity?`, `Capabilities.paymentsIos`, `RewardedPlacement` + `'rank_double'`, `InterstitialPlacement` + `'fail_home'`, `fbinstant.d.ts` `player.getSignedPlayerInfoAsync` | G1 | §6 |
| Game | `SaveDataV4`, `LadderPendingWin`, `LadderCurrent`, `DayStreakRecord`, `day-streak.ts`, `ladder.ts`, `nickname.ts`, `isDailyUnlocked`, `dailyDateKey`, `PacingInput.retryIndex`, `GateDecision` + `'retry_cadence'`, `BannerGateInput.today`, `BannerGateDecision` + `'ended'` | G1 | §7 |
| App | `LadderClient`, `LadderFlow`, `RemoteConfig`, `ShopFlow.buyInPlay` / `prefetchCatalog` / `paymentsAllowed`, `O2Choice`, `BannerFlow.reshowGame` / `afterAd` / `afterPurchase`, `PauseReason 'purchase'`, `AppEventMap['ladder:update']`, analytics rows, `OverlayId` + `ladder`, `ladder_result`, `nickname` | G1 | §8 |
| UI | `RankingListState` + `'bracket'`, `BracketListView`, `BracketRowView`, `RankingPanelProps.onHeart` / `onInfo`, `LadderSheetProps`, `LadderResultProps`, `NicknameSheetProps`, `LadderChipView`, `StreakStripView`, `HomeView.ladder` / `streak`, `HomeCallbacks.onLadder`, `VictoryProps.streak` / `dailyReward`, `RewardedPromptProps.buy` / `onBuy`, `O2BuyView`, `SettingsProps.ladder` | G3 | §9 |
| Art | the symbol ids of Appendix C | G2 | §10 |

### 9.2 HTTP

JSON over HTTPS, `/v1`, Bearer token, `serverTime` everywhere; the endpoint table of §1.4 and the error table; request and response examples for every endpoint in CONTRACTS §3; golden fixtures in `server/test/contract/fixtures/*.json`, which the server tests produce and the client tests parse.

### 9.3 Events

App bus: `ladder:update` `{ reason: 'session' | 'wins' | 'bracket' | 'claim' | 'heart' | 'profile' | 'listed' | 'deleted' | 'offline' }` (views re-render; the panel and chip refresh); `pause` / `resume` with `reason: 'purchase'`; `stock` after a claim, a streak reward and an O2 purchase (unchanged payload). Game events: none new (the streak is bookkeeping at `WON`). Analytics: §7.5.

### 9.4 DOM contract (for e2e; G3 renders, G1 tests)

| Element | Selector and attributes |
|---|---|
| The panel's list | `.overlay[data-overlay=ranking] .rank-list[data-kind=bracket][data-stale=0\|1]` > `ol.rank-rows`; the skeleton and the records keep today's `[data-kind=loading]` / `[data-kind=records]` (with `.rank-list__note`) |
| A row | `.rank-row[data-rank][data-me=0\|1][data-slot]` > `.rank-row__medal?`, `.rank-row__avatar`, `.rank-row__name`, `.rank-row__points`, `button.rank-row__heart[aria-pressed]` > `.rank-row__hearts` |
| My pinned copy | `.rank-row--pinned[aria-hidden=true]` |
| Header lines | `.ranking__count` ("37 players"), `.ranking__countdown`, `.ranking__rewards`, `.ranking__stale`, `.ranking__hearts-new`, `button.ranking__info` |
| Home chip | `button.ladder-chip[data-state=bracket\|join\|off\|records]` > `.ladder-chip__rank`, `.ladder-chip__points` |
| Sheets and cards | `.overlay[data-overlay=ladder]` (`[data-view=list\|info\|records]`), `.overlay[data-overlay=ladder_result][data-case=paid\|too_few\|none]` with `button.ladder-result__double`, `button.ladder-result__collect`, `button.ladder-result__ok`; `.overlay[data-overlay=nickname]` with `.nickname__preview`, `[role=radiogroup].nickname__avatars`, `select.nickname__adj`, `select.nickname__noun`, `input.nickname__num`, `button.nickname__shuffle`, `button.nickname__save` |
| O2 Buy rows | `.overlay[data-overlay=rewarded] button.rewarded__buy[data-state=loading\|ready\|busy][data-product]` (one per offered product, in `iap.o2Products` order; the No Ads row also has `.rewarded__buy-note`) |
| Streak | `.streak-strip[data-day][data-today=0\|1][data-state=none\|alive\|done]`; `.victory__streak[data-day]`, `.victory__streak-reward`; `.victory__daily-reward` |
| Settings | `.settings__ladder` > `button.settings__ladder-name`, `button.switch.settings__ladder-listed[aria-checked]`, `button.settings__ladder-delete`, `.settings__ladder-code` (the app passes the code already formatted: `ui/` imports `shared/` for types only, so it cannot call `formatPlayerCode`) |
| e2e hooks (`window.__mewdoku`, e2e builds only) | `ladder()` → `{active, signedIn, pending, current}`, `remote()` → the switches in force, `streak()` → `streakView(today)` |

---

## 10. Tests and acceptance

### 10.1 Client unit tests (vitest; owners per §8.1)

| File | Covers |
|---|---|
| `tests/unit/game/ladder.spec.ts` (new, G1) | Queue (enqueue, union by `winId` then `puzzleId`, cap 20, age, `applyVerdicts` for every verdict), `toWinSubmission` for level / daily / event / substitute / generated, `encodeSolution` for n = 4…12, cache usability against `endsAt`, `counterBefore`, the claim ledger and repair, results-seen, v4 field validation |
| `tests/unit/game/day-streak.spec.ts` (new) | Day 1 → 7 → reward once → day 1 of the next cycle with the run going on; a missed day resets; clock back ignored; a jump of ≥ 2 days resets; DST weekends and a local midnight between two wins; `dayStartHour`; two wins one day count once; every mode of `dayStreak.modes` and the tutorial / restored / replay that do not; every merge case (same days, disjoint, the stale-device chain, the 14-day overflow, the paid union); validation repairs |
| `tests/unit/game/save-v4.spec.ts` (new) | v3 → v4 (defaults, `period_points` dropped, no retro grant); validation; every merge row of §7.1; `repairPaidGrants` over `ladder.claimed` and `dayStreak.paid`; a v4 document read by the v3 field readers keeps the v3 fields |
| `tests/unit/game/nickname.spec.ts` (new) | `nickText`, id bounds, the fallback for an unknown id, the append-only guard (a snapshot of the first lists' indices never changes) |
| `tests/unit/game/economy-pacing.spec.ts` (changed) | Cadence with the 30 s floor, `retryEveryN` (Retry 1 gated, 2 shown, 3 gated; reset at a win), `fail_home`, No Ads, grace, `untilDate` → `'ended'` |
| `tests/unit/game/progression.spec.ts` (changed) | Locked at level 21, open at 22, open at 21 with a daily record or an in-progress daily; `dailyDateKey` and `nextDayStartAfter` with `dayStartHour` 0 and 4 (DST weekends); with `dayStartHour: 4` the Home card, the stale-daily rule and "Next puzzle in …" agree (G1's app tests) |
| `tests/unit/app/ladder-flow.spec.ts` (new, against `tests/fixtures/ladder-fake.ts`, an in-memory fake server that answers from the contract fixtures) | Sign-in (ok, no API, rejected, timeout, disabled, suspended); submit at `WON` → bracket state; the panel states and timing (answer before 4.2 s, after, never); offline queue and every flush trigger; rejected wins quiet; the chip states and the refresh throttle; result cards (one per Home, max 3, ordering, `'rewardOnly'`); claims (ok, ×2 ok, ×2 video failed, claim failed after the video → no second video, repair); hearts (optimistic, revert, exists, limit, self); profile; listed; delete; **rows rendered = rows returned for 0, 1, 37 and 50 rows** |
| `tests/unit/app/ladder-client.spec.ts` (new) | Every fixture parses; a bad row is dropped (never repaired); timeouts; 401 → one re-sign-in; the server-time offset; `text/plain` POST bodies; no token in any analytics call |
| `tests/unit/app/remote-config.spec.ts` (new) | TTL, the fallbacks, off-only, `iapIos` both ways, bad JSON, unknown keys |
| `tests/unit/app/banner-flow.spec.ts` (changed) | Re-show after an interstitial, each video, Settings, Shop, How to play, a purchase, inside and outside the window; one timer; cancelled by the win, a modal, Home; `rate_limited` → one retry; `untilDate`; `reshowAfterAnyHide: false` = the 2d.1 rule |
| `tests/unit/app/helper-flows.spec.ts` (changed) | Buy → +15 → one used (hint opens; 14 left); cancel → O2 again; error → toast and O2; the board changed during the dialog → stock kept, nothing used; timer paused and resumed; the mouse never has a row; `promptFirst: false`; **No Ads from O2** → entitlement, banner hidden, O2 still open without that row, no helper used; No Ads owned → no No Ads row; a product missing from the catalogue → only its row hidden; the rows' state changes reach the open O2 through `router.update` |
| `tests/unit/app/shop-flow.spec.ts` (changed) | Consume-first order and every crash point of §4.2; `pending` merge; `grantBeforeConsume: true` still works; iOS off / on / remote; the restore on iOS with the switch off still grants; `buyInPlay`; `prefetchCatalog` |
| `tests/unit/platform/fb-ads.spec.ts`, `fb-probe.spec.ts`, `fb-platform.spec.ts` (changed) | The 30 s floor; backoff 30 / 60 / 120; per-placement IDs and the fallback; the preload cap and priority; `fbBuildTag` flags; iOS payments → `payments` + `paymentsIos`; the identity probe |
| `tests/unit/shared/rank-api.spec.ts` (new, G4) | Every validator against the fixtures and against crafted bad inputs (wrong types, out-of-range fish, long strings, unknown enum values, extra fields ignored) |
| `tests/unit/ui/*` (G3) | The bracket list (rows, my row, the pinned copy, medals with numbers, names via `textContent`, a11y names, RTL), the panel's tap rule with an interactive list, the sheet, the result card's cases, the name sheet, O2's four Buy states and the countdown with Buy, the chip states, the streak strip states, the victory streak row and daily reward line, the Settings rows |
| `tests/unit/ui/art-2e.spec.ts` (new, G2) | Every new symbol id exists, has a `viewBox`, uses only the palette tokens, and `avatar-0 … avatar-{AVATAR_COUNT−1}` all exist |
| `tests/unit/layering.spec.ts` (lead) | The `shared` layer rule |

### 10.2 Server tests (G4, `npm --prefix server test`)

| Layer | What | How |
|---|---|---|
| Unit (Node, in-memory SQLite) | Signature (a valid vector; a tampered payload; a tampered signature; a re-encoded payload with the same JSON (must fail: the MAC is over the received text); padding tolerated; a wrong algorithm; a stale or future `issued_at`; a missing one with `requireIssuedAt` on and off; the ALT secret accepted on a staging config into `fb:synthetic` and refused on a production config; nonce MAC, expiry, replay); tokens (tamper, expiry; a valid token of a deleted player → 401 and no row created; of a suspended player → 403 on `GET /v1/bracket` too); every §1.9.3 reason; the lookup rule (a known id with a bogus `contentVersion` and a wrong king permutation → `bad_solution`; the pack board sent as `source: 'substitute'` → accepted; a pack-range daily's device fallback → accepted; `L1`, an unknown event, an index past its count → `bad_puzzle_id`; `L3001` → `unverified`); the level jump accepted, flagged and re-baselined; a daily queued 23 h ago in UTC−12 and UTC+14 accepted, one 3 days old rejected; join atomicity (the bracket fills between the find and the join → the win counts once, in the next bracket; never a `wins` row without a member row); slot reuse (delete slot 1 of 3, the next joiner gets slot 3 and no heart of slot 1); the `hidden` bits (suspend + unlist + reinstate keeps the row hidden; listed on after a suspension keeps it hidden); the size floors; budget refill and spend; level order and jump; the daily window at the UTC−12 and UTC+14 edges; the event grace; assignment (fill to 50, the 51st opens a new bracket, the join window closes, a lost race retries, both period modes); finalise (ties, `minMembers`, `needOneBelow`, hidden members, idempotent re-run, `refinalize`); rewards (claim once, double once, expiry, another player's reward → 404, voided); hearts (once per pair, self once, the cap, hidden row, non-member); names (word picks, cooldown with the free first change, the blocklist test over every adjective × noun pair, free text when enabled); listed off/on; deletion (rows vanish, hearts decremented, tombstone, `final_members` of an ended bracket unchanged); retention sweep (and an `EXPLAIN QUERY PLAN` check that every sweep, stats and hot-path statement uses an index, never `SCAN` of a whole table); CORS (allowed, wildcard, `null` when listed, denied, preflight, never on admin, never `Allow-Credentials`); rate limits; `/v1/config` filtering | `SqlStore` over the `node:sqlite` shim with `:memory:` and the real migrations, a `FakeClock`, test secrets; signature vectors made with `node:crypto` |
| HTTP (Node) | `worker.fetch(new Request(…), env)` end to end: status codes, schemas, idempotency, a batch of 10, 413, 426, kill switch | Same driver |
| HTTP (workerd, optional, CI) | The same HTTP specs in workerd with a local D1 (Miniflare) through `@cloudflare/vitest-pool-workers`, to catch D1 quirks the shim hides | `server/test/workers/**` |
| Contract | `server/test/contract/fixtures/*.json`: a golden request/response per endpoint and per error code; the server test checks the handlers produce responses that validate and match each fixture's shape; the client tests parse the same files | Both packages |
| Solutions | `solutions:check`: the pack part equals `src/data/**`; 20 random generated ids re-generated; every entry a king permutation; the client's generator for 5 endless ids, 5 substitutes and 5 dailies after 2028-12 equals the table (determinism across Node and the client worker) | `verify`, CI |

### 10.3 End to end against the local server (Playwright; G1; wiring by the lead)

The lead's `playwright.config.ts` starts `npm --prefix server run dev:node -- --port 8787` (`:memory:`, `DEV_ROUTES=true`, the e2e FB test secret, `ALLOWED_ORIGINS` = the two preview origins) next to the two preview servers; both e2e builds get `VITE_LADDER_URL=http://127.0.0.1:8787`, the web twin `VITE_LADDER_WEB=anon`. The stub's `getSignedPlayerInfoAsync(payload)` signs `{algorithm, issued_at, player_id, request_payload}` with the same test secret through SubtleCrypto, so the real server check runs. Each ranking test uses its own test pool (`?ladderPool=<random>` in e2e builds only → `devPool`), so tests run in parallel without sharing brackets or clocks; other players are created by `tests/e2e/helpers/rank-players.ts`, which signs sessions and submits real solutions through the public API (H-1: no seeding path in the server).

**`tests/e2e/ladder.spec.ts`** (fbig-390 and web-390):
1. A win → the panel lists exactly the test players plus me, in the server's order; "N players" equals their count; my row highlighted; the count, the rows and the ranks equal `GET /v1/bracket`'s (H-3).
2. A bracket of 1 (only me) → one row and `ladder.alone`; no placeholder.
3. A heart on another row → its count +1 and `aria-pressed`; reload → still pressed; my own row once.
4. Home chip → the sheet with the same rows; the info view.
5. `/dev/clock` +24 h for the pool → Home → the result card (#1 of 5) → Collect ×2 (mock rewarded) → stock +4 / +4; a second Home visit shows no card; a 2-player bracket → "Not enough players took part".
6. The server stopped (route aborted) → a win → stale rows with "Last updated" → records after the cache ends; the queued win is sent after the route returns (count +kept).
7. Settings → "Show me in rankings" off → the panel shows records with `ladder.optedOut`; the row gone from another player's view; on again → joins with the next win.
8. Settings → Delete → the row gone; a new name after rejoining.
9. A suspended player (admin route with the test admin key) → records + `ladder.paused`.
10. The name sheet: pick, save, the new name in the panel; the cooldown message on a second change.
11. Web-prod build check: no request to the ladder origin (request interception, `/v1/config` included), records shown.
12. Settings → Delete, then a heart with the old in-memory token → the client signs in once more, gets a fresh player, and the old row never comes back.
13. A win whose first `POST /v1/wins` the route aborts, then an immediate reload → the win was in the critical save, so the reloaded app sends it once and the server counts it once (and a second reload sends nothing).

**`layout.spec.ts`** (G1, critic pass: the new surfaces at the smallest size) at 320 × 568, with and without the band, in `en` and `de`: Home with the streak strip, the daily card, the event card and the chip — nothing overlaps and Play is visible without scrolling; the post-win panel with 50 rows scrolls inside its card (no page overflow) and keeps the footer button visible; the result card, the name sheet (12 avatars, both pickers, Save) and O2 with both Buy rows and the No Ads note fit or scroll inside their dialogs; every new control's hit area ≥ 44 × 44.

**`fbig.spec.ts`** (changed): the banner back on the board after the next-level interstitial and after a hint video; the first banner on level 10's board; none in the tutorial; none with No Ads; three quick levels past 10 each followed by an interstitial when ≥ 30 s apart (fake clock); Retry 1 no ad, Retry 2 ad; the fail card's Home → an ad; O2 Buy → +15 then 14 and the hint card open, the stub's consume called once and before the grant; O2 No Ads → the banner gone, O2 still open without that row, the next level's interstitial gated `no_ads`; iOS (stub platform IOS) → no Buy row and no Shop row with the switch off, both present with the remote switch on (the test sets its pool's switches with `POST /dev/config`, and the e2e client asks `/v1/config?devPool=<pool>`); the timer paused during the purchase dialog. **`smoke.spec.ts`:** the streak on the web (win → "Day 1 of 7" on Home and on the victory; the next day (fake clock) → day 2; a skipped day → "A new streak starts today."); the daily locked before level 21; no Buy row on the web. **`winflow.spec.ts`:** the panel timing with the bracket list; the counter's before value from the cache. **`visual.spec.ts` / `i18n.spec.ts`** (G3): the panel, sheet, result card, name sheet, O2 with Buy, streak strip at 320 / 390 / 1280 and in `ar` / `de`.

### 10.4 Load and abuse tests (G4)

- **Load** (`server/scripts/load.ts`, manual before launch, against staging): synthetic players signed with `FB_APP_SECRET_ALT` (never the live app secret), all in the `fb:synthetic` pool at 30 requests/s for 5 minutes (sessions, wins in batches, bracket reads, hearts, claims); record p50 / p95 latency, error rate, D1 rows read and written per request, CPU per request; pass = p95 < 800 ms for `/v1/wins`, error rate < 0.5 %, rows written per win ≤ 5, no 10 ms CPU overrun on the Free plan's isolates.
- **Abuse** (HTTP tests, CI): a forged signature, a replayed nonce, a replayed win (`duplicate`), the same puzzle with a new `winId` (`already_counted`), a too-fast solve, a level jump of 31, 151 wins in a bracket, budget exhaustion, fish 4 and an inconsistent fish/mistakes/revives triple, a daily of a date that exists nowhere now, an event after its grace, 21 hearts, a heart from a non-member, 11 wins in one call (413 / 400), a 17 KB body, a denied origin, the per-IP anonymous registration quota, `devPool` and `/dev/*` on a production-configured worker (rejected), an admin route without or with a wrong key (401, constant-time); and (critic pass) a bogus `contentVersion` with a wrong solution, `source` spoofing, `L1` and unknown event ids, a deleted player's live token, a suspended player's read, SQL-shaped values in every id field and admin path (`'; DROP TABLE wins;--`, `%27`, very long strings: 400 before any SQL), a session signed with `FB_APP_SECRET_ALT` against a production config (refused), a heart race of 21 concurrent hearts (exactly 20 stored), 50 concurrent joins into a bracket with 45 members (exactly 50 members, the rest in a new bracket, every win counted once).

### 10.5 Security review (lead, before the first FB release with the ranking)

1. Secrets only in `wrangler secret`; `.dev.vars` git-ignored; a CI grep for anything shaped like a secret in the repo and the client bundle, and for the e2e stub's signing secret in every release `dist/*` (it may live only in e2e builds); `FB_APP_SECRET_ALT` absent from production; Cloudflare's automatic invocation logs off (`invocation_logs = false`) and a `wrangler tail` sample checked for IPs, `Authorization` values and bodies (none).
2. `DEV_ROUTES` and `devPool` impossible in production (a test reads `wrangler.toml`'s `[env.production]` and fails on `DEV_ROUTES = "true"`; the Worker refuses dev routes unless the variable is exactly `"true"` **and** the request is not on a production hostname).
3. Admin routes behind `ADMIN_KEY` (constant-time compare) and Cloudflare Access; no CORS on `/admin/*`; every admin action logged.
4. CORS allow-list from G-SRV-1's measured origins (the exact app host preferred to the wildcard); no `*` unless G-SRV-1 forces it (§1.2: CORS is an abuse guard here, not the auth boundary); never `Allow-Credentials`; `Vary: Origin`.
5. Tokens: HMAC, 24 h, memory only on the client; never logged; never in analytics.
6. Signature verification: constant-time; `algorithm` checked; nonce single use; `issued_at` window.
7. Input limits: 16 KB bodies, ≤ 10 wins, strict validators, no unknown `platform`; names rendered with `textContent` only (XSS); no free text unless switched on.
8. SQL only through bound parameters (a test greps `server/src/store` for string-built SQL with interpolated values).
9. Privacy: logs carry the player code only; no IP stored except the salted daily hash (anon only); the retention sweep runs (a test with the fake clock).
10. Dependency surface: zero runtime dependencies; dev dependencies pinned exactly; `npm audit` of the server package reviewed.
11. Kill switches tested: `RANKING_ENABLED=false` → 503 everywhere, the client falls back; remote switches off-only except `iapIos`.
12. Client: the ranking origin is the only new network destination; no request before the first screen; the web-prod build makes none.

### 10.6 Honesty checks (automated)

1. **Rows:** a unit and an e2e test assert that the rendered rows equal the server's rows (count, order, ranks) at 0, 1, partial and full brackets, and that no list ever renders more rows than the server returned.
2. **One insert path:** a server test asserts that `members` rows are inserted only by the join after an accepted win (a grep over `server/src` for `INSERT INTO members` finds exactly one statement, in `joinBracket`), and that every view has `rows.length === members`.
3. **No test data in a bundle:** a grep over every `dist/*` finds none of the e2e helper's player-name patterns or fixture names.
4. **No invented statistics:** a `scripts/` check fails on strings that claim player counts or statistics outside `ladder.players.*` (fed only by the server's `members`); the 2c grep is extended to the new keys; it also fails on a hard-coded "top 3" / "7 days" in the new English keys (the counts come from `rules.places` and `dayStreak.cycleDays`, §2.4, Appendix A).
5. **Failures:** no code path turns a server failure into rows; every fake-server error mode is covered (§10.1).
6. **No synthetic players for real players** (critic pass): the release check (`scripts/zip-fbig.ts` / `size-check.ts`) fails when a release build's `VITE_LADDER_URL` points at a `workers.dev` host or a host containing `staging`, so the staging database (with its `fb:synthetic` load-test players and private testers) can never be what released players see.

Owners: #1 and #5 G1 (client) and G4 (server); #2 G4; #3, #4 and #6 the lead (`scripts/**`).

### 10.7 Acceptance (lead, I-6)

`npx tsc --noEmit`, `npx vitest run`, `npm --prefix server run verify`, `i18n:check` (and `--release`), `palette:check`, `levels:verify`, every build, `npm run size`, the zips, the load-time measurement (§7.9), and **two consecutive full Playwright runs green** (now with the local ranking server). The honesty checks pass. Every M-item that has arrived by then is checked against our build in a compare note, and the register (§0.7) is updated. The probe's results (G-SRV-1, G-SRV-2) are recorded in STATUS-2e.

---
## 11. Deployment guide for the user

Plain steps, in order. Commands run in a terminal at the repo root with Node 22 installed; `npm --prefix server run <script>` runs a script of the server package (§1.1). Everything marked **(you)** needs your accounts; the lead prepares the rest. Cloudflare's limits and prices below come from search summaries (2026-10-10): check them when you sign up.

### 11.1 Cloudflare account (gate G-SRV-4) — (you)

1. Create a Cloudflare account and turn on two-factor sign-in.
2. Plan: **Workers Free** is enough for development, staging and a soft launch up to about 1 200 daily players; switch to **Workers Paid ($5/month)** before that (Workers & Pages → Plans). At 10 000 daily players the bill stays about $5/month; at 100 000 about $200–230/month (§1.12).
3. A domain for the API (`rank.<your domain>`): add the domain to Cloudflare (or a subdomain delegated to it). Until the public name exists (task #36), staging runs on `*.workers.dev`.
4. Notifications (Notifications → Add): Workers usage at 50 / 80 / 100 % of the included amounts, the Worker error rate, and (Paid) the D1 usage. Add an uptime check on `https://rank.<domain>/v1/health` every 5 minutes (any uptime service).
5. Create an API token for CI (My Profile → API Tokens → "Edit Cloudflare Workers" template, limited to this account) and give it to the lead as the CI secret `CLOUDFLARE_API_TOKEN`.

### 11.2 First deploy (staging, then production)

```bash
npm --prefix server ci                                   # once
npx --prefix server wrangler login                       # (you) opens the browser
npx --prefix server wrangler d1 create mewdoku-rank-staging
npx --prefix server wrangler d1 create mewdoku-rank-prod --location=weur   # pick the hint nearest most players:
                                                         # wnam, enam, weur, eeur, apac, oc
# paste each printed database_id into server/wrangler.toml ([env.staging] / [env.production] d1_databases)
npm --prefix server run db:migrate:staging
# secrets (each command asks for the value; never paste them into a file in the repo)
npx --prefix server wrangler secret put FB_APP_SECRET  --env staging      # the game's app secret (the probe runs in the real game)
npx --prefix server wrangler secret put FB_APP_SECRET_ALT --env staging   # openssl rand -base64 48 (load tests and CI only; NEVER in production)
npx --prefix server wrangler secret put SESSION_SECRET --env staging      # openssl rand -base64 48
npx --prefix server wrangler secret put ID_PEPPER      --env staging      # openssl rand -base64 48 (keep a copy offline)
npx --prefix server wrangler secret put ADMIN_KEY      --env staging      # openssl rand -base64 48
npm --prefix server run deploy:staging
curl https://mewdoku-rank-staging.<account>.workers.dev/v1/health        # {"ok":true,…}
```

Production is the same with `--env production`, `db:migrate:prod`, `deploy:prod`, the app secret, **no** `FB_APP_SECRET_ALT`, and **new** random values (never reuse staging's `ID_PEPPER` or `SESSION_SECRET`). **`ID_PEPPER` must never change** after launch (it would rename every player): keep it in a password manager. The app secret is in Meta's App Dashboard → App settings → Basic → App secret.

**Admin protection (you):** Zero Trust → Access → Applications → add a self-hosted application for `rank.<domain>/admin/*` allowing only your email, plus one **service token** (Access → Service Auth) for the command line: admin calls then send `CF-Access-Client-Id` / `CF-Access-Client-Secret` and `Authorization: Bearer <ADMIN_KEY>`. **Rate rule (you):** Security → WAF → Rate limiting rules → one rule for `rank.<domain>`, e.g. 300 requests per 10 s per IP → block for 1 minute.

### 11.3 Origins

After the probe (§11.6) the lead sets `ALLOWED_ORIGINS` for production in `server/wrangler.toml` to the origins the Worker logged (expected: the game's own `https://apps-<app id>.apps.fbsbx.com` for Facebook — preferred to the `*.apps.fbsbx.com` wildcard, which admits every Instant Game — and your web origin; `null` only if a surface sends it, §1.2), then `npm --prefix server run deploy:prod`.

### 11.4 Meta App Dashboard — (you)

| Step | Where | What |
|---|---|---|
| Products | Instant Games → In-App Purchases | Three consumable products, ids exactly `remove_ads` ($3.99), `hints_15` ($1.99), `kitties_8` ($1.99) (U-d); no mouse product; do not create `fish_250` / `fish_900` |
| Audience Network | Add the Audience Network product; Monetization Manager | Approval is needed **even for purchases**; add payout details (a financial admin who is also a property manager, a bank account, a tax id) — no ads are served before that |
| Placements | Monetization Manager → your Instant Game property | One **interstitial**, one **banner**, and **rewarded**: either one shared placement, or one each for `hint`, `kitty`, `mouse`, `revive`, `rank_double` (better per-placement figures; each falls back to the shared one). Give the ids to the lead (they become `VITE_FB_PLACEMENT_*` build values, §7.3) |
| Purchase review | Instant Games → In-App Purchases → request review | The item descriptions, and a **screen recording of the in-play purchase** (out of hints → Buy → +15, one used) plus the Shop; mention that we consume first and grant after (D-2e-10) |
| iOS purchases (G10) | Read the current In-App Purchases page and the launch checklist | If purchases are allowed in the FB iPhone app: make one test purchase on an iPhone with a test account, then turn the remote switch `iapIos` on (§11.5). Until then they stay off (U-c) |
| Privacy | App settings → Basic | **Privacy Policy URL** (covering the ranking: nickname, avatar and fish totals shared with up to 49 players; retention §1.11) and, under data deletion, the **Data Deletion Instructions URL** ("Settings → Delete my ranking data, or email us your player code") (G-SRV-3) |
| Leaderboards | — | **None needed** for the ranking (it is our server). Event boards only if gate G1 shows global boards still work |
| Build values | Given to the lead | `VITE_LADDER_URL=https://rank.<domain>`, the placement ids |

### 11.5 Switching things on and off (no game release)

The remote switches live in `server/wrangler.toml` under `[env.production] vars` → `RC_SWITCHES`, a JSON object; after an edit run `npm --prefix server run deploy:prod` (≈ 30 s). Players pick them up at their next start (cached up to 1 h).

| To … | Set |
|---|---|
| Turn **iOS purchases on** after your G10 check | `RC_SWITCHES = '{"iapIos": true}'` (and later the lead ships `iap.iosEnabled: true` as the build default) |
| Turn iOS purchases off again | `'{"iapIos": false}'` |
| Hide the Buy row in play | `'{"iapInPlay": false}'` |
| Stop banners (all, or only during play) | `'{"banner": false}'` / `'{"bannerInPlay": false}'` (banners also stop by themselves on 2027-03-31) |
| Hide the ranking | `'{"ladder": false}'` (the game shows personal records) |
| Stop the ranking server completely | `RANKING_ENABLED = "false"` (every call answers "disabled"; the game shows records and keeps queued wins) |

For an emergency the same variables can be edited in the Cloudflare dashboard (Workers → mewdoku-rank → Settings → Variables); copy the change back into `wrangler.toml`, or the next deploy undoes it. A bad deploy: `npx --prefix server wrangler rollback --env production`. Live logs: `npx --prefix server wrangler tail --env production`. **The game itself is never rolled back** to a build from before Phase 2e once 2e has reached players (§7.1: it would wipe streaks and purchase ledgers); a bad game build is fixed forward, and the switches above are the quick way to turn a feature off meanwhile.

### 11.6 The probe (G-SRV-1, G-SRV-2) — the first thing to run

The lead builds `dist-zip/mewdoku-rank-probe-<sha>.zip` (`dev/rank-probe/`, §8.2 step 4) pointed at staging. **(you)** In the App Dashboard → Instant Games → Web Hosting, upload it as a new build, move it to **Testing**, and open it on: facebook.com in a desktop browser, the Facebook app on Android, the Facebook app on iPhone, and messenger.com. Each run shows six lines (health, config, nonce, signed info — with the payload's field names and `algorithm`, so we learn whether `issued_at` is there (§1.3 `signature.requireIssuedAt`), never the player id —, session, origin — the exact `Origin` header the Worker saw, including a literal `null`) and a "Copy results" button; send the four copied texts (or screenshots) to the lead. Expected: six OK lines on each surface. A red line on any surface is a finding for §12 Q-G1, not a failure of the project.

### 11.7 Moderation and support (after launch)

Flags never remove anyone by themselves. Weekly, the lead (or you) reads `GET /admin/v1/flags` with the admin key and suspends only clear abuse (the player sees a neutral "Your ranking is paused" line). A player who emails a deletion request gives their **player code** (Settings → Worldwide ranking); delete with `DELETE /admin/v1/players/<code>`. `GET /admin/v1/stats?days=7` shows daily players, wins by verdict and how full brackets are.

---

## 12. Open questions (each built with the provisional answer; changing it is a key)

| # | Question | Built meanwhile | Key(s) | Source |
|---|---|---|---|---|
| Q-M1 | The post-win panel: rows, row contents (avatar, name, flag?, points, hearts), my row, title, other ways in | All rows (≤ 50) in a scroll list; avatar, name, fish, hearts; no flags (we store no country); the chip on Home | `ladder.panelRows`, `AVATAR_COUNT`, `period.kind` | ask-user 1 |
| Q-M2 | When a ranking ends: the card, the claim, ×2, 2nd and 3rd place rewards, the window rule | A card for every finished bracket; 2nd 1 + 1, 3rd 1 hint; ×2 for all; rolling 24 h; kept 7 days | `ladder.resultCard`, srv `rewards.*`, srv `bracket.periodMode` | ask-user 2 |
| Q-M3 | What a heart does | One per row per bracket, own row once, no reward, a received line | srv `hearts.*`, `ladder.heartsNotify` | ask-user 3 |
| Q-M4 | First banner, first interstitial and the daily's unlock on a fresh install | Banner on level 10's board; interstitial after level 10; daily after level 21 (confirmed) | `ads.banner.fromCompletedLevels`, `ads.interstitial.minCompletedLevels`, `sessionGraceSec` | ask-user 4 |
| Q-M5 | Ten levels in a row: which had an ad; the banner at level start | Every level with a 30 s floor; the banner back after every hide within 46 s | `ads.interstitial.cooldownSec`, `ads.banner.minReloadSec`, `ads.banner.screens` | ask-user 5 |
| Q-M6 | Losing: the revive offer, fish back, declining, Retry | +1 fish once; an ad on the fail card's Home; every 2nd Retry | `revive.*`, `ads.interstitial.triggers`, `retryEveryN` | ask-user 6 |
| Q-M7 | A helper at zero: prompt first?, amount, a purchase offered? | The card first; +1 used at once; our Buy row (the user asked for it, U-d) | `ads.rewarded.promptFirst`, `hints/kitty.perRewardedAd`, `iap.o2Products` | ask-user 7 |
| Q-M8 | Shop / Premium screens | Our three packs (U-d); no subscription (FB has no type for it) | `iap.catalog` | ask-user 8 |
| Q-M9 | The streak: where it shows, what counts, day 7, a missed day | Any win; 7 days; day 7 = 2 + 2; a miss resets; Home strip + victory row | `dayStreak.*` | ask-user 9 |
| Q-M10 | The daily: entry, screen, calendar, result, does it add to the ranking | Card only; no calendar; no daily reward; it adds fish | `daily.calendar`, `daily.reward`, srv `scoring.modes`, `dayStreak.modes` | ask-user 10 |
| Q-M11 | Daily sizes per weekday; midnight behaviour of the daily, the ranking and the streak | Today's schedule; local midnight for the daily and the streak; rolling brackets (no shared reset) | `daily.dayStartHour`, srv `bracket.periodMode`, the daily packs | ask-user 11 |
| Q-U1 | Confirm: **No Ads** on the out-of-hints and out-of-kitties cards too (your "current packs … on the out-of-helpers card")? | Yes, as decided (critic pass; the first draft left it off): the helper's pack first, then "Buy No Ads" with the line "Removes banners and full-screen ads. Videos for helpers stay."; not on the mouse card; hidden once owned. Our caution, for you to weigh: it gives no hint or kitty, so a player out of helpers may buy it expecting one | `iap.o2Products` (remove `'remove_ads'` to take it off) | U-d |
| Q-G1 | If the probe shows the FB bundle cannot reach our server on some surface | The ranking works where it can; elsewhere the game shows personal records; no fallback to FB global boards (D-2e-4) unless G1 shows them alive | `ladder.enabled` per surface (a later key if needed), `rank.fbPeriodBoard` | G-SRV-1 |
| Q-D1 | The public domain for `rank.<domain>` | Staging on `workers.dev`; production waits for the name (task #36) | `VITE_LADDER_URL`, `ALLOWED_ORIGINS` | D-2e-22 |
| Q-P1 | A privacy notice before the first ranking submit? | No: the info view line and Settings; the notice mode is built, off | `ladder.noticeFirst` | G-SRV-3 |
| Q-W1 | The anonymous web ranking in production? | No: records (D-2e-5) | `ladder.web`, srv `WEB_MODE` | L-5 |
| Q-R1 | Personal records weekly or daily? | Weekly (a UTC "today" next to a rolling bracket would show two different "todays") | `period.kind` | M1 |
| Q-L8 | Event boards on our server too (a later phase)? | No: the event Top list keeps the FB path (empty in release until G1) | `VITE_FB_LEADERBOARDS` | — |
| Q-S1 | Streak reminders? | None (no server-free path, G9; no urgency by design) | — | G9 |
| Q-E1 | Endless levels past 3000 and dailies past 2030-12 | Accepted and flagged `unverified`; the lead extends the table yearly | srv `solutions.endlessTo` / `dailyTo` | §1.9.2 |
| Q-C1 | When to move to Workers Paid | Before about 1 200 daily players (writes, incl. the retention deletes, run out first) | — | §1.12 |

---

## 13. Critic changes (independent review, 2026-10-11, before S0)

An independent critic checked this spec and [CONTRACTS](CONTRACTS.md) against the user's five asks and four decisions, the honesty rules, the server's security, Cloudflare Workers / D1 limits (the D1 limits and pricing pages re-checked through search on 2026-10-11: 50 / 1 000 queries per invocation, Free 5 M rows read and 100 k rows written per day, Paid 25 B / 50 M per month), FB Instant Games rules, the client, ownership and types against the code at `dcc6367`, the tests and the load budget. Every change below is already folded into the sections named; nothing in §0.2's user decisions was overridden except where the first draft contradicted one (C-1).

| # | Where | Problem found | Change |
|---|---|---|---|
| C-1 | §0.2 U-d, §0.6 D-2e-9, §0.7 P-P1, §4.1, §4.6, §12 Q-U1, `config.ts` `iap.o2Products` | The draft left **No Ads** off the out-of-helpers card by its own reading, contradicting U-d ("current packs … offered right on the out-of-helpers card") | No Ads is on the hint and kitty cards after the helper's pack, with its own line ("Removes banners and full-screen ads. Videos for helpers stay."), hidden once owned; O2 stays open after it (no helper given); the mouse card has none. Config value changed (`tsc` and `vitest` green); one edit reverses it |
| C-2 | CONTRACTS §7, §8 | `o2Buy()` and `RewardedPromptProps.buy` held **one** row while `iap.o2Products` is a list | Arrays of `O2BuyView` with `kind: 'pack' \| 'no_ads'` and a `disabled` state; `onBuy(productId)`; live updates through `router.update` |
| C-3 | §4.1, Appendix A | Purchase buttons did not say money is spent ("15 hints · $1.99", "or get a Bulb Bundle") | Every purchase label starts with "Buy"; the body says "or buy"; width limit 28 |
| C-4 | §2.4, Appendix A | `ladder.alone` promised "More players join as they solve puzzles", false once the 2 h join window closed (H-2) | "You're the only player in this ranking so far." |
| C-5 | §2.4, §2.6, Appendix A, §10.6 #4 | "Top 3", "7 days" and "Weekly" were hard-coded while the server's `rules.places` and `dayStreak.cycleDays` are configurable: a key change would leave false copy | Plural keys fed by `rules.places.length`, `rules.minMembers`, `cycleDays`; ×2 line only with `doubleByVideo`; a grep fails on the old literals |
| C-6 | Appendix A | `ladder.offline` promised the fish "will be sent" (H-4) | "We'll try to send your fish when you're back online." |
| C-7 | §1.9.2, §1.9.3 step 4 | **Security hole:** the solution lookup was keyed by the client's `contentVersion` and `source`; an unknown `contentVersion` reached the "unknown puzzle" path and any king permutation was accepted (flagged) for a known level | Lookup by `puzzleId` over every kept version and source; a known id must match one of its boards; only ids beyond the table's ranges take the `unverified` path; other unknown ids (`L1`, unknown events) are `bad_puzzle_id` |
| C-8 | §1.9.2 | False flags for honest players: a pack-range daily generated on the device after a failed month fetch (the client's retry rule differs from `gen-daily.ts`'s) and event substitutes were not in the table | The table also holds the device fallbacks (only those that differ), ≈ 8 KB, ≈ 1.5 min more offline |
| C-9 | §1.5 step 2, §1.9.6 | **Data loss:** in the join batch the `wins` row was inserted even when the member insert lost its race, so the win was deduped forever with its points added nowhere | Every win statement is guarded by `EXISTS (member row)`; the handler reads per-statement `changes`; a test fills the bracket between the find and the join |
| C-10 | §1.5, §1.10, §1.11 | **Slot collision:** `slot = members count` reuses a live slot after a deletion (PK conflict, inherited hearts) | `brackets.next_slot` (only grows); capacity by `COUNT(*)` |
| C-11 | §1.5, §1.9.7, §1.10 | `members.hidden` served both suspension and "Show me in rankings" off: reinstating re-showed an opted-out row, listing again could re-show a suspended one, and listed-on did not say what it unhides | `hidden` is a bit set (1 suspended, 2 not listed), each switch touches its own bit |
| C-12 | §1.3 | The token was verified without a DB read, so a **deleted** player's token kept reading for up to 24 h and a **suspended** player could read a view without their own row (H-5) | Every authenticated handler reads the player row once (1 row): missing → 401 `token_invalid`, suspended → 403 |
| C-13 | §1.9.3 step 8 | `level_jump` **rejected** honest players coming back from "Show me in rankings" off, a long offline spell (the queue keeps ≤ 20 wins, ≤ 24 h) or a server outage | Accepted, flagged and re-baselined; the play-time budget bounds the rate |
| C-14 | §1.9.3 step 6, §1.16 | The daily window's lower bound (now − 13 h) rejected honest dailies queued offline for up to 24 h and ignored `daily.dayStartHour` | `antiCheat.dailyGraceMs` 25 h (≥ `pendingMaxAgeMs` + `dayStartHour`, contract-tested) |
| C-15 | §1.2, §1.3, §10.4, §11.2 | Staging was to hold "the TEST app's secret", but the probe and private builds run inside the real Instant Game (signed with the live secret), and the load test needed a secret it could hold | Staging holds the app secret plus an optional `FB_APP_SECRET_ALT` (staging/dev only, pool `fb:synthetic`, refused in production); production smoke is read-only |
| C-16 | §1.2, §1.4, §11.3 | CORS treated as the security boundary; `Origin: null` from a sandboxed iframe unplanned; the `*.apps.fbsbx.com` wildcard admits every Instant Game; the custom `X-Mewdoku-Client` header forced a preflight on every call, contradicting the `text/plain` lever | CORS documented as an abuse guard (bearer tokens in memory, no ambient credential); exact app host preferred; `null` allowed only if measured; no `Allow-Credentials`; the version header dropped (version in the session body, token and wins) |
| C-17 | §1.2 `wrangler.toml`, §1.11, §10.5 | Cloudflare's automatic invocation logs record request metadata (headers), against "no IPs, tokens or bodies in logs" | `[observability.logs] invocation_logs = false`; our own line only; checked with `wrangler tail` |
| C-18 | §1.10, §1.12, §1.14 | Hourly full-table scans in the retention sweep and stats would spend D1's Free read quota (rows read count every scanned row); deletes and index entries were missing from the write estimate | Indexes `wins_received`, `wins_id`, `players_seen`, `rewards_expiry`, `brackets_ended`; retention once a day by index range; an `EXPLAIN QUERY PLAN` test; Free ≈ 1.2 k daily players (was 1.5 k), ≈ $200–230/month at 100 k (was $150) |
| C-19 | §1.10, §1.5 | `ResultView.members` ("at finalisation") had no stored value; a later deletion changed past results | `brackets.final_members` |
| C-20 | §1.7 | The hearts cap of 20 was not part of the guarded statements (a race could pass it) | Same guards on both statements; a 21-heart race test |
| C-21 | §1.4, CONTRACTS §2.1 | `bracketId`, `rewardId` and admin path ids had no pattern | `BRACKET_ID_RE`, `REWARD_ID_RE`, `PLAYER_CODE_RE` on paths; SQL-shaped abuse tests |
| C-22 | §1.3 | Signature: padding, the MAC-over-received-text rule and the optional `issued_at` were unstated | Stated; `signature.requireIssuedAt` (on once G-SRV-2 shows the field); the probe reports the payload's field names |
| C-23 | §1.1 | `server/tsconfig.json` included `scripts/`, whose `build-solutions.ts` imports root `src/engine` and `src/game` — they would be re-checked under the server's `exactOptionalPropertyTypes` and WebWorker lib | `tsconfig.scripts.json` with the root's options; shared files compile under both |
| C-24 | §1.9.3 step 3, §1.16 | The fish invariant hard-coded `revives × 1` | `scoring.fishOnRevive` / `maxRevives`, contract-tested against `revive.*` |
| C-25 | §2.3 | It was unclear whether the win reaches `save.ladder.pending` before the POST (a crash could lose it); `crypto.randomUUID` in `game/` would break its purity rule and is missing on old iOS | Enqueued in the same critical save at t = 0; the id made in `app/` with a `getRandomValues` fallback; e2e #13 |
| C-26 | §6.1, CONTRACTS §6 | `dayStartHour` reached only `dailyDateKey`; `shell.ts`, `session.ts`, `boot.ts`, `views.ts` and the "Next puzzle in" countdown still use `localDateKey` / local midnight | All move to `dailyDateKey` and a new `nextDayStartAfter`; a test at `dayStartHour: 4` |
| C-27 | §2.2, §7.4 | The remote-config fetch ran on web-prod too, contradicting "the web-prod build makes no request" | Only where the ranking origin is in use; localStorage access guarded |
| C-28 | §2.12 | The `ladder` chunk prefetch "at every board mount" included the first run's tutorial board | Scored boards only, never before the first screen |
| C-29 | §7.9 | The load-time gate was not measured with the ranking wired in; no rule for what to cut if it grows | Measured on a twin with `VITE_LADDER_URL` and the local server; main-bundle allowance ≈ 5 KB JS / 1.5 KB CSS; > 0.15 s growth → the strip and chip go lazy before any ceiling moves |
| C-30 | §7.1, §11.5 | A v3 writer drops v4 fields: rolling the FB build back after 2e would wipe streaks and the purchase and claim ledgers | "Never roll the game back below 2e; fix forward" in §7.1 and the operator guide |
| C-31 | §2.4, §7.6, §7.7 | Latin nicknames in RTL rows had no bidi isolation; focus order in a 50-row panel was unstated | `dir="auto"` on names; focus on the footer, only heart buttons are tab stops |
| C-32 | §9.4, CONTRACTS §8 | `formatPlayerCode` (a `shared/` value) called from `ui/`, which may import `shared/` for types only | The app passes the formatted code |
| C-33 | CONTRACTS §6 | `WinSummary` was placed in `src/game/session-effects.ts`; it is `src/app/session-effects.ts` | Path fixed |
| C-34 | CONTRACTS §2.2 | What the client does with a view whose rows disagree with `members`, exceed `maxMembers`, repeat slots or skip ranks was open | Shown as sent when rows were only dropped; rejected whole when malformed; never trimmed or re-ranked |
| C-35 | §10.3, §10.4, §10.5, §10.6 | Missing tests: layout at 320 × 568 for every new surface; the new abuse cases (bogus version, source spoof, deleted token, SQL-shaped ids, concurrent joins and hearts, ALT secret in production); the e2e secret in release bundles; a release build pointing at staging (synthetic players shown to real players) | Added (§10.3 #12–#13 and `layout.spec.ts`, §10.4, §10.5 #1, §10.6 #6 with owners) |
| C-36 | §11.2 | Admin calls through Cloudflare Access had no command-line path | An Access service token for the CLI |

**Checked and left as written** (for the lead's confidence, not changes): the FB signed-request format (base64url payload, HMAC-SHA256 with the app secret) and the nonce design; single-use nonces and idempotent wins, claims and hearts; the honesty rules H-1…H-8 and their tests; consume-first with the intent ledger (every crash point recovers exactly once; the existing restore already consumes ledgered tokens without granting); the iOS kill switch (off by default, remote on/off, restore always runs); the banner during play as the user's decision against Meta's advice, with the 2027-03-31 end; the 30 s per-placement load floor and the 30–120 s no-fill backoff; the interstitial cadence and its triggers; the ownership table (disjoint; G3's `nick-words.ts` and G4's `rank-api.ts` in the new `shared` layer); the interfaces against `src/platform/types.ts`, `src/game/{types,ad-pacing,levels-repo,progression}.ts`, `src/app/{events,store,session-effects,router}.ts`, `src/ui/overlays/{ranking-panel,rewarded-prompt}.ts` and `src/ui/screens/home-screen.ts` (all additive or owned end to end by one workstream); `node:sqlite` runs without a flag on Node 22.22.

---

## Appendix A. English strings (ours; G3 adds them at S0 in `src/i18n/en/ui-2e.ts`)

```ts
// The ranking
'ladder.sub.one': '+{count} fish · Your total: {total}',
'ladder.sub.other': '+{count} fish · Your total: {total}',
'ladder.endsIn': 'Ends in {time}',
'ladder.endsSoon': 'Ends in less than a minute',
'ladder.ended': 'Final results',
'ladder.players.one': '{count} player',
'ladder.players.other': '{count} players',
// critic pass: the number of paid places comes from rules.places (never a hard-coded "3")
'ladder.rewards.line.one': 'First place wins hints and kitties.',
'ladder.rewards.line.other': 'The top {count} win hints and kitties.',
'ladder.rewards.min': 'Rewards need at least {count} players in this ranking.',
'ladder.alone': "You're the only player in this ranking so far.",   // critic pass: no promise that others will join
'ladder.waiting': '+{count} waiting',
'ladder.offline': "You're offline. We'll try to send your fish when you're back online.",   // critic pass: H-4, no promise
'ladder.stale': 'Last updated {time}',
'ladder.unavailable': "The ranking couldn't load right now. Here are your own records.",
'ladder.optedOut': "You've turned rankings off in Settings. Here are your own records.",
'ladder.paused': 'Your ranking is paused. Here are your own records.',
'ladder.join': 'Join',
'ladder.joinLine': 'Solve a puzzle to join the daily ranking.',
'ladder.chip.a11y': 'Daily ranking: #{rank} of {count}, {fish}. Ends in {time}.',
'ladder.chip.join.a11y': 'Daily ranking: solve a puzzle to join.',
'ladder.chip.off.a11y': 'Daily ranking: off.',
'ladder.you': 'You',
'ladder.row.a11y': '#{rank}, {name}, {fish}, {hearts}',
'ladder.row.me.a11y': '#{rank}, {name}, you, {fish}, {hearts}',
'ladder.announce': 'You are #{rank} of {count} in the daily ranking.',
'ladder.hearts.one': '{count} heart',
'ladder.hearts.other': '{count} hearts',
'ladder.heart.give.a11y': 'Give a heart to {name}, {hearts}',
'ladder.heart.self.a11y': 'Give yourself a heart, {hearts}',
'ladder.heart.received.one': '+{count} heart from another player',
'ladder.heart.received.other': '+{count} hearts from other players',
'ladder.heart.error': "Couldn't send the heart. Try again later.",
'ladder.info': 'How it works',
'ladder.info.fish': 'Every puzzle you solve adds the fish you kept, up to 3, to your total.',
'ladder.info.window.rolling': 'A ranking lasts 24 hours from its first win and holds up to {count} players. Your first win after it ends puts you in a new one.',
'ladder.info.window.utcDay': 'A new ranking starts every day at midnight UTC and holds up to {count} players.',
'ladder.info.rewards.one': 'When a ranking ends, first place wins hints and kitties if at least {min} players took part.',
'ladder.info.rewards.other': 'When a ranking ends, the top {count} win hints and kitties if at least {min} players took part.',
'ladder.info.double': 'You can watch a video to double your reward.',   // only with rules.doubleByVideo
'ladder.info.hearts': 'Tap a heart to cheer on a player. Hearts are just for fun.',
'ladder.info.names': 'Other players see your ranking name and picture, never your Facebook name or photo.',
'ladder.info.privacy': 'You can turn rankings off or delete your ranking data in Settings.',
// End of a ranking
'ladder.result.title': 'Ranking results',
'ladder.result.place': 'You finished #{rank} of {count}.',
'ladder.result.reward': 'Your reward: {reward}',
'ladder.result.none.one': 'Thanks for playing! First place wins hints and kitties.',
'ladder.result.none.other': 'Thanks for playing! The top {count} win hints and kitties.',
'ladder.result.tooFew': 'Not enough players took part for rewards this time.',
'ladder.collect': 'Collect',
'ladder.collectDouble': 'Collect ×2',
'ladder.collectDouble.a11y': 'Watch a video to collect twice the reward',
'ladder.claimed': 'Collected!',
'ladder.claim.error': "Couldn't collect right now. We'll keep your reward for a few days.",
// Ranking name and picture
'nick.title': 'Your ranking name',
'nick.picture': 'Picture',
'nick.first': 'First word',
'nick.second': 'Second word',
'nick.number': 'Number',
'nick.shuffle': 'Shuffle',
'nick.save': 'Save',
'nick.saved': 'Name saved.',
'nick.rejected': "That name can't be used. Please pick another.",
'nick.cooldown': 'You can change your name again {time}.',
'nick.error': "Couldn't save your name. Try again later.",
'nick.offline': 'Connect to the internet to change your name.',
'nick.fallback': 'Cat {num}',
'nick.first.line': 'This is you in the ranking: {name}. You can change your name and picture in Settings.',
'nick.avatar.a11y': 'Picture {index} of {count}',
// Settings
'settings.ladder.title': 'Worldwide ranking',
'settings.ladder.name': 'Ranking name',
'settings.ladder.join': 'Show me in rankings',
'settings.ladder.code': 'Player code {code}',
'settings.ladder.offline': 'Connect to the internet to change this.',
'settings.ladder.delete': 'Delete my ranking data',
'settings.ladder.delete.confirm': 'Delete your ranking name, picture and results from our server? Your game progress stays.',
'settings.ladder.delete.ok': 'Delete',
'settings.ladder.deleted': 'Your ranking data was deleted.',
// Win flow, how to play
'a11y.fishKept.ladder.one': 'You kept {count} fish. Your ranking total: {total}.',
'a11y.fishKept.ladder.other': 'You kept {count} fish. Your ranking total: {total}.',
'howto.ladder': 'The fish you keep when you solve a puzzle count for the daily ranking.',
// O2 with Buy
// critic pass: every purchase button says "Buy"; No Ads on the card (U-d) with its plain line
'rewarded.body.buy.hint': 'Watch a short video for 1 hint, or buy a Bulb Bundle.',
'rewarded.body.buy.kitty': 'Watch a short video for 1 kitty, or buy a Kitty Basket.',
'rewarded.buy.label': 'Buy {items} · {price}',
'rewarded.buy.a11y': 'Buy {name}, {items}, {price}',
'rewarded.buy.noAds.label': 'Buy No Ads · {price}',
'rewarded.buy.noAds.note': 'Removes banners and full-screen ads. Videos for helpers stay.',
'rewarded.buy.noAds.a11y': 'Buy No Ads, {price}. Removes banners and full-screen ads. Videos for helpers stay.',
'rewarded.buy.loading': 'Getting the price…',
// Daily streak
'streak.day': 'Day {day} of {total}',
'streak.start': 'Solve a puzzle to start a streak.',
'streak.new': 'A new streak starts today.',
'streak.next': 'Solve a puzzle today for day {day}.',
'streak.today': 'Today counts!',
'streak.rewardDone': 'Streak reward collected!',
'streak.a11y': 'Streak: day {day} of {total}. {status}',
'victory.streak': 'Streak: day {day} of {total}',
'victory.streakReward': 'Streak reward: {reward}',
'howto.streak': 'Solve at least one puzzle a day to build a streak. Every {days} days in a row earn a reward of hints and kitties. If you miss a day, the streak starts again from day 1.',   // {days} = dayStreak.cycleDays
// Daily (shown only when daily.reward is not zero)
'victory.dailyReward': 'Daily reward: {reward}',
```

## Appendix B. Documents to update at integration (lead, I-5)

[01](../phase1/01-game-deconstruction.md) (facts from the user's material as "first-hand", with dates), [02](../phase1/02-rebuild-spec.md) (the ranking, streak, daily unlock, O2 Buy, ads cadence), [04](../phase1/04-architecture.md) (the `shared` layer, `server/`, save v4 and its forward-compatibility note, §9 budgets), [05](../phase1/05-fbig-platform.md) (§5.3 the CSP answer from the probe, identity, iOS payments, the ad loading rules; links moved to `/documentation/games/…`, R-D1), [06](../phase1/06-legal-and-originality.md) (the privacy notice and the deletion flow under G-LEGAL), [differences-vs-original](../phase2/differences-vs-original.md) (the ranking is real players only; our streak design; Buy on O2), [fb-dashboard](../phase2b/fb-dashboard.md) (G1's rows: placements per helper, products, iOS, no leaderboards for the ranking), [provenance](../provenance.md) (G2's and G3's 2e rows), [gap-analysis](gap-analysis.md) (status: superseded by this spec), this spec's status line, [CONTRACTS](CONTRACTS.md) final (the members added beyond it), and a new `STATUS-2e.md`.

## Appendix C. Art to draw (G2; our own drawings from these words, one provenance row each)

| Id | What |
|---|---|
| `icon-trophy` (existing) | The chip's trophy (unchanged) |
| `medal-1`, `medal-2`, `medal-3` | Round gold, silver and bronze medals with a ribbon and a paw emboss; the rank number is drawn by the UI on top (never colour alone) |
| `avatar-0` … `avatar-11` | Our cat head (the 2d.1 head silhouette family) in 12 coats: ginger, grey tabby, black, white, calico, tuxedo, cream, siamese points, brown tabby, blue-grey, tortoiseshell, white with grey patches; front view, the same eyes; each reads at 28 px |
| `icon-heart-line`, `icon-heart-fill` | A rounded heart, outline and filled (a cheer; never the lives' look — lives are fish) |
| `icon-streak-flame` | A small warm flame with a paw-shaped base, for the streak strip |
| `streak-step-empty`, `streak-step-done`, `streak-step-today`, `streak-step-chest` | A paw print outline, filled, filled with a soft check, and the day-7 chest step |
| `reward-chest`, `reward-chest-open` | A small wooden chest with a fish-shaped lock, closed and open with a glow; the result card and the day-7 victory row |
| `nick-tag` | A collar name tag (bone-free, round with a bell) for the name sheet's header |
| `icon-pencil`, `icon-shuffle`, `icon-info` | Edit, shuffle, info glyphs in the icon set's stroke weight |
| O2 pack mini-art | Reuse `icon-bulb` and `icon-paw` as the shop does (`shop-sheet.ts`); no new art |
