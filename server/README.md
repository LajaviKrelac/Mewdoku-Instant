# mewdoku-rank — the worldwide daily ranking server

Owner: G4 (Phase 2e). Design: [docs/phase2e/spec.md §1](../docs/phase2e/spec.md#1-the-ranking-server-g4); wire contract: [`src/shared/rank-api.ts`](../src/shared/rank-api.ts) ([CONTRACTS §2–§4](../docs/phase2e/CONTRACTS.md)); the user's step-by-step deployment guide: [spec §11](../docs/phase2e/spec.md#11-deployment-guide-for-the-user). This file is the operator's view: how to run, test, deploy and operate it.

One Cloudflare Worker + one D1 (SQLite) database. All domain logic sits behind `SqlStore` over D1's own minimal shape (`SqlDb`), so the same code runs in workerd and in Node 22 (`node:sqlite`) for the dev server and the tests. **No runtime dependencies**; dev dependencies are pinned exactly (`package.json`).

```
src/worker.ts        export default { fetch, scheduled } — builds the app once per isolate
src/app.ts           createApp(deps): routing, CORS, kill switch, errors, one JSON log line per request
src/handlers/        health config session (+ join) wins bracket presence rewards hearts profile me admin dev + views
src/core/            PURE: fb-signature nonce token ids brackets wins anticheat nickname moderation config clock crypto version rivals table
src/content/         the solution table (generated/solutions.ts, ≈ 59 KB) and its lookup rule
src/store/           SqlStore (every SQL statement) · sql-db.ts (SqlDb) · drivers/d1.ts · drivers/node-sqlite.ts
src/moderation/      our name blocklist
migrations/          0001_init.sql, 0002_wins_token.sql, 0003_presence.sql, 0003_rivals.sql, 0004_deleted_joins.sql, 0004_profile_looks.sql, 0005_daily_times.sql (applied in order by wrangler and by the Node driver)
dev/serve.ts         the Node dev server (what Playwright starts)
scripts/             build-solutions.ts (offline table + drift check) · load.ts · smoke.ts · client.ts
test/                unit/ http/ contract/ (golden fixtures shared with the client) workers/
```

## Leaderboard update (auto-join and activity)

- `POST /v1/session` with `join: true` (the client sends it) puts a listed player who is in no running bracket into one at once, with 0 fish (`bracket.joinOnSession`, default on). Same guarded batch as a win's join; a 0-fish member is never paid.
- `POST /v1/presence {state: 'online' | 'playing'}` updates my own row's activity in my running bracket (`bracket` rate bucket; `presence.enabled`). Every row carries `seenAt` (the latest of the ping, the last counted win and the join; null while presence is off) and `playing`; the client turns them into "Online now", "Playing now" or "2m ago". A computer player's row (D-2e-24; merged 2026-10-13) carries an activity computed from its script like its points (`core/table.ts` `rivalActivity`): `playing` from the first win of one of its sessions until 2 minutes after the last, `seenAt` its last win or a later 90-second tick while it plays, never after the view's time (a rival of the opening group, present at `opened_at`, shows a sighting 1 minute to 20 hours before the opening until its first win, seeded per rival: `core/rivals.ts` `openingSeenBefore`, so the 8–12 of them never share one status); a final view shows it frozen at `ends_at`, as a real row's stops at the end (the client shows no status on an ended or final view). A bracket opened by a sign-in join gets its computer players exactly like one opened by a win.
- Deploy order: `db:migrate:staging` (`0003_presence.sql` adds `members.active_at` and `members.playing`) **before** `deploy:staging`. Both `0003_presence.sql` and `0003_rivals.sql` are applied by name on staging; never rename either.

## UI batch (2026-10-13): typed names, looks, rewards, the daily percentile

- **Typed names** are on by default (`nickname.freeText: true`): `PUT /v1/me/profile {nickname: {text}}` passes the shared shape rule (`src/shared/nick-text.ts`) and the hardened blocklist (two skeletons, native-script entries, whole-word short terms); a refused shape is 422 `nickname_invalid`. Admin `reset-nickname` now starts the name cooldown. Kill switch without a release: `CONFIG_OVERRIDES='{"nickname":{"freeText":false}}'` (the client then shows the name read-only).
- **Frames and backgrounds:** `frameId` / `backgroundId` (0 … 7, no cooldown; out of range is 422 `avatar_invalid`) on the player, copied to open-bracket rows like the avatar; every `PlayerView` and `BracketRow` carries them.
- **Rank rewards:** `rewards.places` 1st 3 + 3, 2nd 2 + 2, 3rd 1 + 1 (was 2 + 2, 1 + 1, 1 + 0). Amounts are frozen per reward row at finalisation: no migration; a ranking finalised after the deploy pays the new amounts.
- **The daily percentile** (spec §0.4 H-2a): an accepted, unflagged daily win adds one to its 10 s bucket in `daily_times` (per puzzle and pool, no player key); `WinResult.daily {solvers, slower}` is sent once `dailyStats.minSolvers` (20) other solvers exist. The daily sweep deletes rows older than `dailyStats.keepDays` (7).
- Deploy order: `db:migrate:staging` (0004 adds `players.frame`, `players.bg`, `members.frame`, `members.bg`; 0005 adds `daily_times`) **before** `deploy:staging`.

## Run

```bash
npm --prefix server ci                                         # once
npm --prefix server run dev:node -- --port 8787                # Node 22 + node:sqlite, :memory:, DEV_ROUTES=true
npm --prefix server run dev:node -- --port 8787 --db /tmp/rank.sqlite --quiet   # a file database, no request log
```

The dev server uses public **test** secrets (`dev/serve.ts` `DEV_DEFAULTS`; `FB_APP_SECRET` is `e2e-fb-app-secret`, the default `signing.secret` of the e2e FBInstant stub (CONTRACTS §5), checked by `test/contract/stub.spec.ts`, which runs the stub itself), `WEB_MODE=anon`, wide per-isolate rate limits and anonymous-device quota (e2e makes many players from 127.0.0.1), and `ALLOWED_ORIGINS` for the preview servers (4173, 4174, 5173, `https://localhost:8080`). Any value can be overridden by an env var of the same name or `server/.dev.vars` (copy `.dev.vars.example`; git-ignored). It always refuses a taken port.

Dev-only routes (DEV_ROUTES exactly `true`, never production, loopback host only): `POST /dev/clock {devPool, advanceMs | offsetMs}` moves one test pool's clock; `POST /dev/config {devPool, switches}` sets the switches `GET /v1/config?devPool=` answers; `POST /dev/cron {devPool}` finalises that pool's due brackets at its own time; `POST /dev/rivals {devPool, on: true | false}` gives that pool's NEW brackets computer rivals and its players the disclosure line, whatever `RIVALS` says (D-2e-24; the dev server and Playwright pin `RIVALS=off`, so a test opts in per pool); `POST /dev/reset {devPool}` wipes it (and its `/dev/rivals` switch). There is **no** seeding route: test players act through the public API (H-1); computer rivals are not rows, so `/dev/rivals` seeds nothing. A test pool is joined with `devPool` in the session body; it gets its own players, brackets and clock (`fb:<pool>`, `web:<pool>`). FB signatures and nonces always use real time, so a moved pool clock never makes sign-in fail; in a test pool `issued_at` may also match that pool's clock, so an e2e that moves the browser clock (Playwright `page.clock`) moves the pool by the same amount (`/dev/clock {devPool, offsetMs}`) and still signs in; tokens use the pool clock, so a jump of ≥ 24 h ends them (sign in again, as in production).

`npm --prefix server run dev` runs the real Worker in workerd (`wrangler dev --local`) with a local D1; first `npm --prefix server run db:migrate:local` and a `.dev.vars`.

## Test

```bash
npm --prefix server run verify            # typecheck (3 projects) + vitest + solutions:check — what the root `npm run verify` runs
npm --prefix server test                  # vitest: unit, HTTP, contract, worker entry (≈ 270 tests, ≈ 8 s)
npm --prefix server test -- nick          # the name blocklist over every adjective × noun pair (G3 runs it before changing nick-words.ts)
npm --prefix server run typecheck         # tsconfig.json (Worker, workers-types) · tsconfig.node.json (tests, dev, node:sqlite) · tsconfig.scripts.json (root options)
npm --prefix server run solutions:check   # the table vs the packs, byte for byte; 35 generated boards re-made with the client's rules
npm --prefix server run bundle:check      # wrangler deploy --dry-run: the Worker bundles (≈ 187 KB, 63 KB gzip)
npm --prefix server run load -- --self-test   # the load script against an in-process dev server
```

What the suite covers (spec §10.2, §10.4): FB signature vectors (tampered payload or signature, re-encoded payload, padding, algorithm, `issued_at` window and `requireIssuedAt`, the ALT secret), nonces and tokens; every pipeline reason and the lookup rule (C-7, C-8), the level jump (C-13), the daily window at UTC−12 / UTC+14 (C-14), the event grace, size floors, budget, bracket cap; joins (fill to 50, the 51st, the join window, both period modes), a deterministic lost join race and 50 concurrent joins into a bracket of 45 (exactly 50, never a win row without a member row, never a second bracket or a 0-point row for one player, C-9), slot reuse (C-10), the hidden bits (C-11), deleted / suspended tokens (C-12); finalisation (ties, minimum members, hidden members, idempotent, refinalize), claims (once, ×2 once, expiry, someone else's, voided), hearts (once, own row once, the cap of 20 under a 21-heart race, C-20), names (picks, cooldown, blocklist, free text), listed on/off, deletion and tombstones, admin, CORS, rate limits, the kill switch, 413/426, SQL-shaped ids (400 before any SQL), production config refusals (dev routes, `devPool`, the ALT secret), the cron (finalise, purge, stats, retention sweep by age); `EXPLAIN QUERY PLAN` of every statement the app prepares in a full scenario (no full table scan), a bound-parameters-only grep, the single `INSERT INTO members`; every golden fixture in `test/contract/fixtures` has the same shape as the real server's answer (the client's tests parse the same files); client/server config parity (scoring modes, lives, revive, `dailyGraceMs`, batch and queue sizes); `wrangler.toml` production safety; the Worker's import graph never reaches Node; the statements per invocation at the worst case (every request, the hourly cron with six full brackets, the sweep with every loop at its limit: each ≤ Free's 50). Computer rivals (D-2e-24; `test/unit/rivals.spec.ts`, `test/http/rivals.spec.ts`): the purity grep and the r1 golden fixture (also through the API and the Worker entry), the order guarantee, monotonicity, the K rule, names, the calibration bands, the snapshot codec, the finalisation plan; through the API a whole day every 10 minutes with 0–10 real joins (rows ≤ 50, only the lowest computer row retires, nothing returns or falls, every member sees the same table, the frozen table equals the live one at ends_at), hearts on rival rows, rivals never paid, the switches, test pools, the admin route and the stats. 2026-10-12, r2: the same for preset r2 (its golden fixture, monotonicity, the replay of the real joins with the deleted-member fallback, its calibration bands and CPU), and through the API r2 brackets (rivals scoring in the first hour, each forcing join retiring a rival not arrived yet or the lowest row at that moment, hearts on a retired rival refused); the tests of r1's index rule pin their bracket back to r1.

Not built: the optional workerd test layer (`@cloudflare/vitest-pool-workers`, spec §10.2 "HTTP (workerd, optional, CI)").

## The solution table

`src/content/generated/solutions.ts` holds every board a client can show per scored puzzle id: pack boards, substitutes (a pack failed to load), endless levels L1001–L3000, dailies through 2030-12-31 (generated after the last pack month), device fallbacks of pack-range dailies and event puzzles where they differ from the pack (none do today), over the current and up to 2 older content versions. The Worker never runs the generator.

```bash
npm --prefix server run solutions          # rebuild (≈ 4 min with 2 worker threads; cached in server/node_modules/.cache)
npm --prefix server run solutions -- --fresh   # drop older versions' boards
```

Rebuild in the same change whenever `src/data/**`, `src/engine/**` or the specs in `src/game/progression.ts` / `events.ts` change a board; `solutions:check` (in `verify`) fails otherwise. Ids past the table (L3001+, dailies after 2030-12-31) are accepted as `unverified` (flagged) when they are king permutations; extend the table yearly (`--endless-to`, `--daily-to`).

## Deploy

The user's guide is spec §11 (accounts, dashboards, the probe). The commands, all run from the repo root (each script runs inside `server/`, where `wrangler.toml` lives):

```bash
npm --prefix server ci
npm --prefix server run login                                   # opens the browser
npm --prefix server run d1:create:staging                       # paste the printed database_id into wrangler.toml [env.staging]
npm --prefix server run d1:create:prod -- --location=weur      # nearest hint: wnam enam weur eeur apac oc → [env.production]
npm --prefix server run db:migrate:staging
npm --prefix server run secret:staging -- FB_APP_SECRET         # each asks for the value; never put one in a file
npm --prefix server run secret:staging -- FB_APP_SECRET_ALT     # staging only (load tests, smoke): openssl rand -base64 48
npm --prefix server run secret:staging -- SESSION_SECRET        # openssl rand -base64 48
npm --prefix server run secret:staging -- ID_PEPPER             # openssl rand -base64 48 — keep a copy offline, never change it
npm --prefix server run secret:staging -- ADMIN_KEY             # openssl rand -base64 48
npm --prefix server run deploy:staging
SMOKE_ALT_SECRET=… npm --prefix server run smoke -- --url https://mewdoku-rank-staging.<account>.workers.dev
```

Production: the same with `d1:create:prod`, `db:migrate:prod`, `secret:prod` (new random values, **no** `FB_APP_SECRET_ALT`: the production Worker refuses every FB session while it is set), uncomment `routes` in `[env.production]` with the real host, `deploy:prod`, then the read-only smoke `npm --prefix server run smoke -- --url https://rank.<domain> --read-only`. In production every secret must be ≥ 32 characters, or the Worker answers 503 rather than run with it. A bad deploy: `npm --prefix server run rollback:prod`; live logs: `npm --prefix server run tail:prod`.

CI (spec §1.2): `npm --prefix server ci` → `npm --prefix server run verify` → `db:migrate:staging` → `deploy:staging` → staging smoke; on a release tag, production gets the read-only smoke only. Migrations are expand → deploy → contract.

## Configuration

Worker variables (`wrangler.toml` `[env.*.vars]`; editable in the dashboard, then copy back or the next deploy undoes it):

| Variable | Values | Note |
|---|---|---|
| `DEPLOY_ENV` | `dev` · `staging` · `production` | Production: never dev routes, never the ALT secret, secrets ≥ 32 characters |
| `RANKING_ENABLED` | `true` · `false` | Kill switch: every ranking route 503 `disabled`; `/v1/health` and `/v1/config` still answer |
| `PERIOD_MODE` | `rolling` · `utc_day` | P-L1 |
| `WEB_MODE` | `records` · `anon` | D-2e-5: production `records` |
| `DEV_ROUTES` | `false` (deployed) | Exactly `true` only on the Node dev server |
| `ALLOWED_ORIGINS` | comma list | Exact origins, `null` (only if measured), `https://*.<suffix>` (one label), `*` (last resort) |
| `MIN_CLIENT_VERSION` | e.g. `0.2.0` | Older sessions and wins: 426 |
| `RC_SWITCHES` | JSON booleans | `iapIos`, `iapInPlay`, `banner`, `bannerInPlay`, `ladder` (spec §1.15, §11.5) |
| `RIVALS` | `on` · `off` | Computer rivals in NEW brackets (D-2e-24): `[vars]` off, staging on, production off until rollout step 4. Production takes them only from `RIVALS=on` itself (a `CONFIG_OVERRIDES` value is ignored there and logged). See "Computer rivals" below |
| `CONFIG_OVERRIDES` | JSON | Any other key of `src/core/config.ts` (the P-L register's `srv:` keys), deep-merged; a mistyped value is ignored and logged. E.g. `{"rewards":{"minMembers":3},"antiCheat":{"minSolveMs":{"9":[3000,9000]}}}` |

`CONFIG_OVERRIDES` keys for computer rivals (`rivals.*`, D-2e-24): `pools` (`["fb","web"]`: the wire pools whose new brackets get them), `strength` (100; an integer 50…200, frozen into each new bracket: 80 easier, 120 harder), `disclose` (true: the rules carry `computerPlayers` and the client shows "Rankings include computer players."), `hide` (false; the emergency switch), `testPools` (false; `fb:<p>`, `web:<p>` and `fb:synthetic` get them too while on: the staging soak). Preset r1 needs `scoring.pointsPerFish` 1 and `scoring.fishMax` 3; any other scoring turns rivals off (logged).

Bindings: `DB` (D1), optional `METRICS` (Analytics Engine dataset `mewdoku_rank`). Secrets: `FB_APP_SECRET`, `SESSION_SECRET`, `ID_PEPPER`, `ADMIN_KEY`, staging-only `FB_APP_SECRET_ALT`.

## Operate

Admin routes need `Authorization: Bearer <ADMIN_KEY>` (≥ 32 characters; behind Cloudflare Access in production, so also the Access service token headers):

```bash
H=(-H "Authorization: Bearer $ADMIN_KEY" -H "CF-Access-Client-Id: $CF_ID" -H "CF-Access-Client-Secret: $CF_SECRET")
curl "${H[@]}" https://rank.<domain>/admin/v1/flags                       # open flags, newest first, with player codes
curl "${H[@]}" -X POST https://rank.<domain>/admin/v1/flags/<id>/resolve
curl "${H[@]}" https://rank.<domain>/admin/v1/players/7KQ2M9XD           # profile, last 50 wins, flags, brackets
curl "${H[@]}" -X POST https://rank.<domain>/admin/v1/players/7KQ2M9XD/suspend      # or /reinstate, /reset-nickname
curl "${H[@]}" -X DELETE https://rank.<domain>/admin/v1/players/7KQ2M9XD            # an emailed deletion request
curl "${H[@]}" -X POST https://rank.<domain>/admin/v1/brackets/<id>/refinalize      # re-rank after a removal (computer players keep their frozen points)
curl "${H[@]}" "https://rank.<domain>/admin/v1/brackets/<id>?at=<ms>"     # the computer players at <ms> beside the real rows as they are now, every row labelled player | rival
curl "${H[@]}" "https://rank.<domain>/admin/v1/brackets/<id>?live=1"      # a final bracket recomputed at ends_at (audit: frozen equals live)
curl "${H[@]}" "https://rank.<domain>/admin/v1/stats?days=7"              # DAU, wins by verdict, flags, members per bracket
```

`GET /admin/v1/brackets/{id}` (read-only, not logged) answers the bracket (times, `nextSlot`, `capacityMembers`, `finalMembers`, `finalReal`, and for a bracket with computer players `rivals: {preset, strength, sigma, quiet, roster, live, present, topFinal, hidden}`, where `topFinal` is the top rival's final total, the bound a real player must beat, and `hidden` is the emergency `rivals.hide`: players then see no computer players, while this route still lists and labels them, a final bracket's snapshot included, the rows refinalize ranks with), `rows` (`kind: "player"` with `code`, `hidden`, `finalRank`; `kind: "rival"` with `index`, `arrivalAt`, `paceTenthsPerHour`, `builtInHearts`, `realHearts`), `retiredRivals` (retired by real joins) and `hiddenPlayers` (2026-10-12, r2: `rivals.preset` is `r1` or `r2`; in an r2 bracket, rival rows add `winsPerDay` with `paceTenthsPerHour` 0, and each retired rival carries `retiredAt`, the time of the join that retired it). `at` is clamped to [opened_at, min(now, ends_at)] and moves only the computer players: the real rows carry their current points and the live/retired split counts from the current `next_slot`, so the default (now) is the table players see and a past `at` is not a rebuild of what they saw then. A final bracket answers its frozen table. The rival tag's seed never appears anywhere.

Flags never act by themselves (`antiCheat.autoSuspendFlags` 0). A suspended player is told (403 `suspended`), never shadow-banned; deleting their data leaves a 90-day tombstone during which the same account cannot start over. Every admin action is in `admin_log` (1 year).

Logs: one JSON line per request `{t, rid, route, status, ms, code, pool, n?, verdicts?, err?, why?, fields?, deniedOrigin?}` — the player code only; never an IP, raw FB id, nickname, token or signature. `fields` lists the signed payload's field names (G-SRV-2: whether `issued_at` is there) and `deniedOrigin` the origins CORS refused (G-SRV-1).

## Computer rivals (D-2e-24, user decision U-e, 2026-10-12)

A bracket created while rivals are on carries a secret tag (`brackets.rivals`: preset, seed, strength, word-list lengths), frozen at creation; the server computes up to `max_members − next_slot` computer players from it on every read (`src/core/rivals.ts`, `src/core/table.ts`: pure, integer-only, the same in workerd and Node; a golden test pins preset r1, so r1 is never edited: a new algorithm is r2). They fill the places no real player took (never more rows than `max_members`; in the join window a real join can only retire the lowest computer row), rank by the one comparator, count in `members` and toward `rewards.minMembers` and the one-below rule, take hearts like any row (a hearts row; shown as built-in + real) but never give any, and are never paid: a place one holds is not paid and not passed down (no members, players or rewards row exists for one; their slots are 9000+, which no reward id can name). Finalisation freezes them in `brackets.final_rivals`; `final_members` now counts every ranked row and `final_real` the real ones (the stats' `members_p*` stay real sizes; `brackets_rivals` counts the brackets with computer players). Metrics: `heart/rival`, `reward/rival_place`, `bracket_final/rivals`, `rivals/tag_invalid` and `rivals/decode_error` (the last two must stay 0).

The switches, least to most drastic (each reaches NEW brackets only, except `disclose` and `hide`):

| Lever | New brackets | Running brackets | Finalised | Disclosure line |
|---|---|---|---|---|
| `RIVALS=on` (pool in `rivals.pools`) | tagged | — | — | shown |
| `CONFIG_OVERRIDES {"rivals":{"pools":[]}}` | untagged | keep their rivals | keep their snapshot | still shown |
| `RIVALS=off` | untagged | keep their rivals | keep their snapshot | gone |
| `{"rivals":{"strength":90}}` | tagged at 90 | unchanged (frozen) | unchanged | — |
| `{"rivals":{"disclose":false}}` | — | — | — | gone (no client release) |
| `{"rivals":{"hide":true}}` (emergency) | untagged | not shown, not hearted; finalised real-only while on | snapshot rows not rendered (rank gaps, still valid) | gone |

**Preset r2** (2026-10-12, r2): `newRivalsTag` writes `r2:…` for every new bracket; r1 brackets keep r1 to their end (both parse; `rivalRoster` dispatches by the preset; r1's golden test is unchanged and r2 has its own, in Node and in the Worker spec). In r2 every point is a win: a rival's arrival (the opening group at `opened_at`, the others over the join window) is its first win, then it scores in sessions of 1–4 wins with a 7–9 h sleep (personas casual 45 %, regular 37 %, keen 14 %, grinder 4 %, at 3–7 / 7–14 / 14–26 / 26–40 wins a day, times σ). Which K rivals are live replays the real joins that forced a removal, in slot order at their `joined_at` (`core/table.ts` `liveRivals`): each retires a rival that has not arrived yet (the latest arrival) or else the lowest computer row at that moment. The tables, finalisation, rival hearts (an open r2 bracket's heart reads the member rows in place of the one member read: the same statement count) and the admin route all use it. A deleted member's join keeps its time: `deletePlayer` appends `slot:joined_at` to `brackets.deleted_joins` (migration 0004; r2 brackets only, in the statement that already decrements the count), so a deletion never changes which rivals show and a retired rival never returns. Only reads that straddle a deletion lack that time (`joinTimesKnown`): finalisation then reads the bracket row again and a rival heart answers 404 (the retry passes). Calibration bands are tests: over 1,000 tags with a lone player, the top rival's p50 is 9 at 15 min, 14 at 1 h and 75 at 24 h, and a player with 15 / 25 / 40 wins a day ends in the top 3 in 10 % / 62 % / 99 % of brackets. A table build takes about 0.5 ms.

Runbook: migrate 0003 first (`0003_rivals.sql`, with `0003_presence.sql` beside it; `db:migrate:*`; expand-only, the old code ignores the columns). 2026-10-12, r2: migrate 0004 before deploying the code that tags r2 (its `deletePlayer` writes `brackets.deleted_joins`; without the column every deletion would fail). Staging soaks with `RIVALS="on"` and `{"rivals":{"testPools":true}}` for 48 h, audited through the admin route (`?live=1`) and SQL (no reward id with a slot ≥ 1000, rows ≤ `max_members`). Production: ship the client with the disclosure line first, deploy with `RIVALS="off"`, then deploy again with `RIVALS="on"` (not a gradual deploy: two versions never serve one bracket). Tune with `{"rivals":{"strength":…}}` (new brackets only). To stop: `{"rivals":{"pools":[]}}` and hold 48 h (running brackets keep their rivals and the line stays), then `RIVALS="off"`; `hide` is immediate but changes the outcome of brackets finalised while it is on. Never bulk-edit `brackets.rivals` or `final_rivals`. A code rollback leaves frozen brackets valid (rank gaps); open tagged brackets lose their rival rows under the old code and, finalised by it, stay real-only (a re-rank never adds computer players to a bracket finalised without them).

## Cost and limits

Measured on this build at the worst case, full brackets of 50 (`test/http/budget.spec.ts` fails if any passes 50; each `prepare` is one D1 statement): nonce 0 · session 6 (new) / 9 (returning, with results) / 14 (returning while the old bracket is lazily finalised) · one win 13 (joining) · ten wins 27 (current bracket) / 42 (lazily finalising the old bracket and opening a new one, two dailies among them: the UI batch's daily rollup) · bracket read 4 / 12 (with a lazy finalise) · heart 8 · claim 3 · profile 12 (name, avatar, frame, background, listed) · me 2 · delete 12 · admin ≤ 6 · the hourly cron 45 (finalising `cron.finalizePerRun` = 6 full brackets, ≈ 6 each, plus the purge and the stats rollup; raise it on Paid) · the daily sweep at 03:47 UTC in its own invocation 45 (every chunk loop at `cron.sweepChunksPerRun`, plus the `daily_times` delete). One known edge on Free: a ten-win request that **loses a join race** (the bracket filled between the read and the write) retries the join, and that second ≈ 25-statement batch can pass 50; D1 then refuses the call, nothing is written (every batch is atomic and the lost one was guarded), the client gets 503 `unavailable` (Retry-After 30 s) and keeps the wins queued for its next send. On Paid (1 000 per invocation) it cannot happen. Rows written per counted win: the member row (1), the win row with its two indexes (3), the player row once per request — ≤ 5. Computer players cost 0 rows, ever, and no extra statement (measured in the same test): the create carries one more bound value (the tag); a view with them reads the bracket's heart pairs (≤ 20 per real member) instead of mine (4); a rival heart is 7 (one hearts row written; a real heart 8); a lazy finalisation of a rival bracket 10–12 and the hourly cron over six of them 33 (fewer `final_rank` writes, ≈ 2 KB of `final_rivals` TEXT each, swept with the bracket); `GET /admin/v1/brackets/{id}` 3; ≈ 0.12 ms CPU per view. The Worker bundle is ≈ 187 KB (63 KB gzip; Free allows 3 MB); the solution table is ≈ 59 KB of it, split lazily once per isolate. Every statement reads by key or index range (tested), and the retention sweep deletes in chunks by index range, so D1's rows-read billing never sees a table scan.

Plans and the traffic model are in spec §1.12: Free carries development, staging and a soft launch to about 1 200 daily players (writes run out first, ≈ 76 rows written per player per day including the retention deletes); Workers Paid ($5/month) covers 10 000 daily players inside the included amounts; ≈ $200–230/month at 100 000. Set usage notifications at 50 / 80 / 100 % (G-SRV-4). Before launch run `npm --prefix server run load` against staging (spec §10.4: synthetic players only, `fb:synthetic`), and read rows and CPU per request for the same window in the Cloudflare dashboard.

## Behaviour worth knowing (all inside the contract)

- A bracket is finalised 30 s after `endsAt` (`bracket.finalizeGraceMs`), so a win request that started before the end commits first; until then the view is `ended`, not `final`. Lazy (on any read) and in the hourly cron.
- A finalised view's `members` is `final_members` (every row ranked at the end, computer players included); after a later deletion or suspension its rows show an honest gap in the ranks.
- Only counted wins are stored; a rejected win is judged again if re-sent. A retried counted win answers `duplicate` with its original points.
- A player has at most one running bracket: a join (or a new bracket) happens only while they have none and at least one of the submitted wins is new, so concurrent requests of one player never open two brackets or leave a 0-point row.
- Rate limits are per isolate (best effort); the exact limits are D1-backed (bracket cap, name cooldown, heart uniqueness and cap, anonymous devices per IP per day).
