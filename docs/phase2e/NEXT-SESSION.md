# Facebook test builds: uploaded (2026-10-11)

A helper session (started because environment variables added mid-session only reach a new session) did the
upload; this note records the result and what is left.

## Done

- Staging ranking server: `https://mewdoku-rank-staging.mewdoku-rank.workers.dev` (Cloudflare Worker + D1
  `mewdoku-rank-staging`, id in `server/wrangler.toml`; migrations 0001–0002; staging smoke test passed, which left
  one test player in staging). Staging secrets: `FB_APP_SECRET` plus random `SESSION_SECRET`, `ID_PEPPER`,
  `ADMIN_KEY`, `FB_APP_SECRET_ALT` (staging only, kept nowhere else; `wrangler secret put` new ones if needed).
- `FB_APP_ID` / `FB_APP_SECRET` are valid: the client-credentials grant returns an app token, and
  `GET /v21.0/<app>?fields=name` answers **"Toon Doku"** (with an app token, Graph refuses `namespace`,
  `category` and `link` as "nonexisting field").
- Uploaded once each from commit `bebbe7b` with `scripts/upload-fbig.ts` (they sit in Web Hosting as Standby):
  - `mewdoku-rank-probe-bebbe7b.zip` (4,472 bytes), comment "Connection test (probe) bebbe7b - staging server";
  - `mewdoku-instant-fbig-preview-0.1.0-bebbe7b.zip` (501,746 bytes), comment "Game test build 0.1.0 bebbe7b -
    staging ranking, no ads/IAP ids yet".
- Upload fix: Meta refuses `application/zip` with HTTP 500 "Invalid file. Expected file of one of the following
  types: application/octet-stream"; the script now sends `application/octet-stream` (unit test in
  `tests/unit/platform/scripts.spec.ts`).

## Notes for later uploads

- In the cloud container Node's built-in fetch needs `NODE_USE_ENV_PROXY=1`:
  `NODE_USE_ENV_PROXY=1 npx tsx scripts/upload-fbig.ts <zip> [--preview] --comment "…"`.
- Each successful upload adds a build to Web Hosting; never retry one that succeeded.
- Allowed hosts needed: `graph.facebook.com` (token) and `graph-video.facebook.com` (upload).

## Probe results

- facebook.com (WEB), 2026-10-11 17:23 UTC: all five checks OK; `issued_at` present (+0 s); Origin
  `https://apps-2382571989149479.apps.fbsbx.com` (referrer origin `https://shield-apps-2382571989149479.apps.fbsbx.com`).
  That origin is now the production `ALLOWED_ORIGINS` in `server/wrangler.toml` (production is not deployed yet).
- Phone browser (MOBILE_WEB), 2026-10-11 17:45 UTC: all five checks OK; `issued_at` present (+0 s); same Origin
  and referrer origin as WEB.

## Game build on Facebook

- 2026-10-11: the game test build (`bebbe7b`, staging ranking) opens and plays on Facebook. Staging recorded the
  user's real FB player (signed, pool `fb`) and three wins, L2–L4 (17:43–18:10 UTC), all `accepted`, no flags; the
  player is in a bracket. The smoke-test player sits in the separate `fb:synthetic` pool, so it never shares a
  bracket with real players.

- The user confirmed the game also works in the iPhone Facebook app and in Safari. Workers Logs: 8 real FB
  sign-ins, all 200, all with `issued_at`; wins accepted; a nickname change saved.
- Since staging version `45526ad5` (2026-10-11 18:17 UTC) each FB sign-in log line carries `origin`. Read it with
  the Workers observability API (the account token can): `POST https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/observability/telemetry/query`
  with `{"queryId":"origins","timeframe":{"from":<ms>,"to":<ms>},"view":"events","limit":100,"parameters":{"filters":[{"key":"$metadata.service","operation":"eq","type":"string","value":"mewdoku-rank-staging"}]}}`;
  the lines are in `result.events.events[].source` (`route`, `origin`, `fields`).

- iPhone FB app (IOS) probe, 2026-10-11 18:21 UTC: all five checks OK; `issued_at` present; Origin
  `https://apps-2382571989149479.apps.fbsbx.com`, matching the server log's `origin` field. Production
  `ALLOWED_ORIGINS` needs no change.

## Later uploads

- 2026-10-11 22:1x UTC: `mewdoku-instant-fbig-preview-0.1.0-f5d8cdf.zip` (503,539 bytes; the new home board, staging
  ranking), comment "Game test build 0.1.0 f5d8cdf - new home board, staging ranking, no ads/IAP ids yet"; uploaded
  from the main session (the FB variables reached it after a container restart). Checked first: tsc, 3,035 unit
  tests, size budget (89 files), home screen rendered with no page errors.
- 2026-10-11 22:2x UTC: `mewdoku-instant-fbig-preview-0.1.0-9a4d0f0.zip` (504,481 bytes; the new Home layout),
  comment "Game test build 0.1.0 9a4d0f0 - new home layout, staging ranking, no ads/IAP ids yet". Checked first: tsc,
  3,038 unit tests, size budget (89 files), Home rendered as a returning player with no page errors.
- 2026-10-12: `mewdoku-instant-fbig-preview-0.1.0-3778d6b.zip` (504.5 KB, 89 files; the Home cleanup and no FB
  safe-zone shift by default), comment "Game test build 0.1.0 3778d6b - home cleanup, no FB safe-zone shift, staging
  ranking, no ads/IAP ids yet". Checked first: tsc, 2,942 unit tests, the FBIG e2e (59), size budget.
- 2026-10-12 UTC: `mewdoku-instant-fbig-preview-0.1.0-b8bb947.zip` (505,775 bytes; the combo points and the combo
  bar's row), comment "Game test build 0.1.0 b8bb947 - combo points + combo bar row, staging ranking, no ads/IAP ids
  yet". Checked first: tsc, 3,054 unit tests, 317 e2e tests; the size check flags CSS 52.6 / 51.7 KB (the combo bar).
- 2026-10-12 UTC: `mewdoku-instant-fbig-preview-0.1.0-1159c9d.zip` (505,846 bytes; the default branch with the combo
  merged in: combo points, the combo bar's row, the Home cleanup, no FB safe-zone shift), comment "Game test build
  0.1.0 1159c9d - combo points + Home cleanup, no FB safe-zone shift, staging ranking, no ads/IAP ids yet". Checked
  first: npm run verify (3,055 unit tests, 191 server tests), 318 e2e tests; the size check still flags CSS 52.4 / 51.7 KB.
- 2026-10-12 UTC: `mewdoku-instant-fbig-preview-0.1.0-80fdfe8.zip` (505,868 bytes; the combo bonus × the fish left:
  base + base × 10 % × (combo − 1) × fish), comment "Game test build 0.1.0 80fdfe8 - combo bonus x fish left, staging
  ranking, no ads/IAP ids yet". Checked first: npm run verify (3,057 unit tests, 191 server tests); the e2e suite was
  not run on this commit (stopped on request); the size check still flags CSS 52.4 / 51.7 KB.

## Left

- Android app and Messenger: not tested (the user deferred them). Until the Android app is checked,
  `signature.requireIssuedAt` stays false.

## Left (the user, when convenient)

1. Later: the Android Facebook app (the probe or the game build), then `signature.requireIssuedAt` can go on.

## Leaderboard update (branch `leaderboard-visuals-update`, 2026-10-12)

The user asked for the ranking to look and behave like the reference game's leaderboard (screenshots and a screen
recording in the session): auto-join at sign-in, a podium leaderboard with "Online now" / "Playing now" / "2m ago",
and a rank-up animation after a win.

- **Auto-join (changes H-1).** A row may now exist with 0 fish: `POST /v1/session` with `join: true` (sent when the
  client's `ladder.autoJoin` is on) puts a listed player who is in no running bracket into one at once
  (`server/src/handlers/join.ts`, the same guarded batch as a win's join, `writeWins` with `joinEmpty`; the server
  switch is `bracket.joinOnSession`). A 0-fish member is never paid (`paidPlaces` already needs points > 0). The
  client shows the "New ranking" card (overlay `ladder_session`) once per bracket it was joined to without a win.
- **Activity.** Migration `0003_presence.sql` adds `members.active_at` and `members.playing`; `POST /v1/presence
  {state}` marks my own row (`bracket` rate bucket); sign-ins and counted wins mark it "online". Every row carries
  `seenAt` / `playing` (additive in v1: older clients ignore them, and the client shows no status without them).
  Client: `ladder.presence` (ping on a scored board's start and end, every `pingMs` while visible, none while hidden;
  "now" within `nowMs`). The info view says what others see ("ladder.info.activity").
- **Deploy order:** `npm --prefix server run db:migrate:staging` (0003) **before** `deploy:staging`; until then the
  client keeps working against the old server (no statuses, no auto-join, the "Join" chip as before).
- **UI:** `bracket-list.ts` (stopwatch pill, podium, pills, chests, `playClimb`), `ladder-session.ts`, the panel's
  bubble (`ranking-panel.ts`), styles at the end of `ladder-chunk.css`. Dev harness views: `session`, `panel-climb`,
  `panel-climb-top`, `panel-climb-new`.
- **Copy:** 12 new keys (AI drafts in all 16 locales, for native review like the rest); the titles use the existing
  `common.leaderboard` ("Leaderboard"), the body copy keeps "ranking" (glossary). "Online now" is allowed only as
  `ladder.status.online` (scripts/i18n-check.ts honesty rule).
- **Budgets:** the lazy ladder rows were re-set to the measured sizes (JS 30.0 → 37.9 KB, boot 33.9 → 36.2 KB, CSS
  11.0 → 21.8 KB). The first-load CSS row (52.4 / 51.7 KB) was already over before this branch.
- **Test builds (staging ranking, no ads/IAP ids):** FB `mewdoku-instant-fbig-preview-0.1.0-4e35ce8.zip` (515,891
  bytes, 2026-10-12) and `…-faf80f9.zip` (515,994 bytes, 2026-10-13; comment "Game test build 0.1.0 faf80f9 -
  leaderboard update (podium, rank-up animation, New ranking card, small-phone layout), staging ranking, no ads/IAP ids
  yet"), both in Web Hosting as Standby; the claude.ai preview link was republished from the same commits (version 21
  = faf80f9; it plays against the in-page sample server). Checked first on faf80f9: unit tests, 200 server tests,
  i18n, the full e2e suite (the one failure fixed and re-run). Then `…-8964a69.zip` (515,994 bytes, the same game
  code; 2026-10-13) on request, also in Standby.
- **Staging server updated (2026-10-13):** `db:migrate:staging` applied 0003, then `deploy:staging` (version
  `9ec83928-1f80-444c-b418-1552170aaffa`; the first try hit Cloudflare's rate limit, code 971, and passed after the
  wait). Smoke: `/v1/health` ok, `/v1/config` ok, `POST /v1/presence` without a token 401 (the route is live). The FB
  test builds now get auto-join, the card and the activity pills. Production is not migrated or deployed.

## UI batch (branch `claude/brave-brahmagupta-p1g0b4`, 2026-10-13 … 2026-10-14)

The user's batch after the leaderboard update (their reference screenshots in the session), built by six parallel
workstreams, merged and reviewed by the lead; per-area notes, decisions and sizes in `docs/ui-batch/*.md`.

- **Leaderboard (both screens):** no "+N fish · Your total" on the post-win panel, no "top 3 win…" line, no visible
  player count; the stopwatch directly under the title; three different chests (gold with a crown band, silver, wood;
  `reward-chest-1..3`) shown only on rows the server could pay; a tap opens a tooltip above the chest with the place's
  rewards from the server's `rules.places` (the tooltip takes no taps; an outside tap or Esc only closes it); the
  post-win card about one row taller; my row is the real row, `position: sticky` at whichever edge it leaves by; the Home
  sheet has no pencil, (i) at the start, the title centred. **Server rewards re-set: 1st 3 + 3, 2nd 2 + 2, 3rd 1 + 1.**
- **Profile:** typed names (server `nickname.freeText` default true, kill switch kept; shared shape rule
  `src/shared/nick-text.ts`; moderation hardened: look-alike folding both ways, native-script terms, an innocent-names
  list, IME-safe input); the word/number/shuffle pickers are gone; 8 frames and 8 backgrounds (0 = plain; ids 0–2 free,
  the rest unlock by level, best streak or a claimed ranking reward, `src/game/looks.ts`), stored on the server
  (migration `0004_profile_looks.sql`) and drawn wherever a picture shows (`avatarBadge`). Not built: a way for players to
  report a name (admin can reset by player code only) — worth adding before a public launch with typed names.
- **Daily Streak screen** (overlay `streak`): after the day's first counted win (between the victory's primary and the
  next board) with Continue, and from Home's pill with a back arrow; our flame (faded until today counts), the run, "Best",
  the week row = the run's current 7-day cycle with real weekday names and the chest on the paying day; the victory's
  streak row is off (`dayStreak.victoryRow: false`, `dayStreak.screenAfterWin: true`).
- **Victory:** fish only (no "+N", no "Your total"), points kept, no Home button (the daily's primary starts the next
  level too); up to two praise lines from this game's own facts (`src/app/victory-lines.ts`); the daily percentile from
  the server's real solve times once 20 other players solved it (migration `0005_daily_times.sql`, `WinResult.daily`),
  else an estimate (`src/game/solve-time-model.ts`), always worded "about" (spec §0.4 H-2a).
- **Level-start lines:** never cut ("…"), longer and richer; `ticker.odds.*` approximate expectations from our own
  `src/game/level-odds.ts` (H-2a), retry encouragement from the lost attempt, records from the player's own save.
- **Level button:** red frame + "HARD" tag on Hard levels, purple + "EXTRA HARD" on our hardest Hard boards (grade 5 or
  effort ≥ `levels.extraHardMinEffort` 90: 30 of the 98 shipped Hard levels, `src/game/level-tiers.ts`); the game bar's
  badge uses the same colours.
- **Honesty change:** spec §0.4 H-2a (the user's decision): approximate statistics are allowed only in `ticker.odds.*`
  and `victory.stat.*` (`scripts/i18n-check.ts` `ESTIMATE_KEY_PREFIXES`).
- **Review:** seven read-only reviewers found 21 issues (8 major: the tooltip over the hearts, moderation regressions and
  bypasses, Hindi name widths, IME Enter, a "new best" line that could be false); all fixed with tests. A pre-existing
  flaky server test (`brackets.spec` self-race, order-dependent levels) was fixed too.
- **Budgets:** every touched row re-set to measured + about 3 % (04 §9 "UI batch"); main JS 353.7 → 367.9 KB is the one
  to watch (moving the victory and ticker pickers into their lazy chunks would win back about 6 KB).
- **Deploy order (done on staging 2026-10-14):** `db:migrate:staging` (0004, 0005) **before** `deploy:staging` (version
  `276dbd3f-94f0-4114-a686-34ab7ca54ed0`); smoke: `/v1/health` ok, `PUT /v1/me/profile` and `POST /v1/presence` without a
  token 401. Production: not migrated or deployed (needs 0003, 0004 and 0005 before its deploy).
- **Test builds (2026-10-14):** FB `mewdoku-instant-fbig-preview-0.1.0-1d6ce5b.zip` (543,153 bytes, 89 files; staging
  ranking) uploaded, in Web Hosting as Standby (comment "Game test build 0.1.0 1d6ce5b - UI batch: …"); the claude.ai
  preview link republished from the same commit (version 22; it plays against the in-page sample server). Checked first
  on 1d6ce5b: `npm run verify` (3,246 unit tests, 224 server tests), two full e2e runs (330 passed each; the only
  failures were a 1.3 px streak-screen fit at 320 × 568 in German, fixed, and one FB purchase test under load that passed
  4/4 alone and 59/59 with its whole spec), size check within the re-set budgets.
