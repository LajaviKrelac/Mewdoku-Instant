# mewdoku-rank — the worldwide daily ranking server

Owner: G4 (Phase 2e). Design: [docs/phase2e/spec.md §1](../docs/phase2e/spec.md#1-the-ranking-server-g4); wire contract: [`src/shared/rank-api.ts`](../src/shared/rank-api.ts) ([CONTRACTS §2–§4](../docs/phase2e/CONTRACTS.md)); the user's step-by-step deployment guide: [spec §11](../docs/phase2e/spec.md#11-deployment-guide-for-the-user). This file is the operator's view: how to run, test, deploy and operate it.

One Cloudflare Worker + one D1 (SQLite) database. All domain logic sits behind `SqlStore` over D1's own minimal shape (`SqlDb`), so the same code runs in workerd and in Node 22 (`node:sqlite`) for the dev server and the tests. **No runtime dependencies**; dev dependencies are pinned exactly (`package.json`).

```
src/worker.ts        export default { fetch, scheduled } — builds the app once per isolate
src/app.ts           createApp(deps): routing, CORS, kill switch, errors, one JSON log line per request
src/handlers/        health config session wins bracket rewards hearts profile me admin dev + views
src/core/            PURE: fb-signature nonce token ids brackets wins anticheat nickname moderation config clock crypto version
src/content/         the solution table (generated/solutions.ts, ≈ 59 KB) and its lookup rule
src/store/           SqlStore (every SQL statement) · sql-db.ts (SqlDb) · drivers/d1.ts · drivers/node-sqlite.ts
src/moderation/      our name blocklist
migrations/          0001_init.sql, 0002_wins_token.sql (applied in order by wrangler and by the Node driver)
dev/serve.ts         the Node dev server (what Playwright starts)
scripts/             build-solutions.ts (offline table + drift check) · load.ts · smoke.ts · client.ts
test/                unit/ http/ contract/ (golden fixtures shared with the client) workers/
```

## Run

```bash
npm --prefix server ci                                         # once
npm --prefix server run dev:node -- --port 8787                # Node 22 + node:sqlite, :memory:, DEV_ROUTES=true
npm --prefix server run dev:node -- --port 8787 --db /tmp/rank.sqlite --quiet   # a file database, no request log
```

The dev server uses public **test** secrets (`dev/serve.ts` `DEV_DEFAULTS`; `FB_APP_SECRET` is `e2e-fb-app-secret`, the default `signing.secret` of the e2e FBInstant stub (CONTRACTS §5), checked by `test/contract/stub.spec.ts`, which runs the stub itself), `WEB_MODE=anon`, wide per-isolate rate limits and anonymous-device quota (e2e makes many players from 127.0.0.1), and `ALLOWED_ORIGINS` for the preview servers (4173, 4174, 5173, `https://localhost:8080`). Any value can be overridden by an env var of the same name or `server/.dev.vars` (copy `.dev.vars.example`; git-ignored). It always refuses a taken port.

Dev-only routes (DEV_ROUTES exactly `true`, never production, loopback host only): `POST /dev/clock {devPool, advanceMs | offsetMs}` moves one test pool's clock; `POST /dev/config {devPool, switches}` sets the switches `GET /v1/config?devPool=` answers; `POST /dev/cron {devPool}` finalises that pool's due brackets at its own time; `POST /dev/reset {devPool}` wipes it. There is **no** seeding route: test players act through the public API (H-1). A test pool is joined with `devPool` in the session body; it gets its own players, brackets and clock (`fb:<pool>`, `web:<pool>`). FB signatures and nonces always use real time, so a moved pool clock never makes sign-in fail; in a test pool `issued_at` may also match that pool's clock, so an e2e that moves the browser clock (Playwright `page.clock`) moves the pool by the same amount (`/dev/clock {devPool, offsetMs}`) and still signs in; tokens use the pool clock, so a jump of ≥ 24 h ends them (sign in again, as in production).

`npm --prefix server run dev` runs the real Worker in workerd (`wrangler dev --local`) with a local D1; first `npm --prefix server run db:migrate:local` and a `.dev.vars`.

## Test

```bash
npm --prefix server run verify            # typecheck (3 projects) + vitest + solutions:check — what the root `npm run verify` runs
npm --prefix server test                  # vitest: unit, HTTP, contract, worker entry (≈ 175 tests, ≈ 6 s)
npm --prefix server test -- nick          # the name blocklist over every adjective × noun pair (G3 runs it before changing nick-words.ts)
npm --prefix server run typecheck         # tsconfig.json (Worker, workers-types) · tsconfig.node.json (tests, dev, node:sqlite) · tsconfig.scripts.json (root options)
npm --prefix server run solutions:check   # the table vs the packs, byte for byte; 35 generated boards re-made with the client's rules
npm --prefix server run bundle:check      # wrangler deploy --dry-run: the Worker bundles (≈ 187 KB, 63 KB gzip)
npm --prefix server run load -- --self-test   # the load script against an in-process dev server
```

What the suite covers (spec §10.2, §10.4): FB signature vectors (tampered payload or signature, re-encoded payload, padding, algorithm, `issued_at` window and `requireIssuedAt`, the ALT secret), nonces and tokens; every pipeline reason and the lookup rule (C-7, C-8), the level jump (C-13), the daily window at UTC−12 / UTC+14 (C-14), the event grace, size floors, budget, bracket cap; joins (fill to 50, the 51st, the join window, both period modes), a deterministic lost join race and 50 concurrent joins into a bracket of 45 (exactly 50, never a win row without a member row, never a second bracket or a 0-point row for one player, C-9), slot reuse (C-10), the hidden bits (C-11), deleted / suspended tokens (C-12); finalisation (ties, minimum members, hidden members, idempotent, refinalize), claims (once, ×2 once, expiry, someone else's, voided), hearts (once, own row once, the cap of 20 under a 21-heart race, C-20), names (picks, cooldown, blocklist, free text), listed on/off, deletion and tombstones, admin, CORS, rate limits, the kill switch, 413/426, SQL-shaped ids (400 before any SQL), production config refusals (dev routes, `devPool`, the ALT secret), the cron (finalise, purge, stats, retention sweep by age); `EXPLAIN QUERY PLAN` of every statement the app prepares in a full scenario (no full table scan), a bound-parameters-only grep, the single `INSERT INTO members`; every golden fixture in `test/contract/fixtures` has the same shape as the real server's answer (the client's tests parse the same files); client/server config parity (scoring modes, lives, revive, `dailyGraceMs`, batch and queue sizes); `wrangler.toml` production safety; the Worker's import graph never reaches Node; the statements per invocation at the worst case (every request, the hourly cron with six full brackets, the sweep with every loop at its limit: each ≤ Free's 50).

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
| `CONFIG_OVERRIDES` | JSON | Any other key of `src/core/config.ts` (the P-L register's `srv:` keys), deep-merged; a mistyped value is ignored and logged. E.g. `{"rewards":{"minMembers":3},"antiCheat":{"minSolveMs":{"9":[3000,9000]}}}` |

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
curl "${H[@]}" -X POST https://rank.<domain>/admin/v1/brackets/<id>/refinalize      # re-rank after a removal
curl "${H[@]}" "https://rank.<domain>/admin/v1/stats?days=7"              # DAU, wins by verdict, flags, members per bracket
```

Flags never act by themselves (`antiCheat.autoSuspendFlags` 0). A suspended player is told (403 `suspended`), never shadow-banned; deleting their data leaves a 90-day tombstone during which the same account cannot start over. Every admin action is in `admin_log` (1 year).

Logs: one JSON line per request `{t, rid, route, status, ms, code, pool, n?, verdicts?, err?, why?, fields?, deniedOrigin?}` — the player code only; never an IP, raw FB id, nickname, token or signature. `fields` lists the signed payload's field names (G-SRV-2: whether `issued_at` is there) and `deniedOrigin` the origins CORS refused (G-SRV-1).

## Cost and limits

Measured on this build at the worst case, full brackets of 50 (`test/http/budget.spec.ts` fails if any passes 50; each `prepare` is one D1 statement): nonce 0 · session 6 (new) / 9 (returning, with results) / 14 (returning while the old bracket is lazily finalised) · one win 13 (joining) · ten wins 27 (current bracket) / 38 (lazily finalising the old bracket and opening a new one) · bracket read 4 / 12 (with a lazy finalise) · heart 8 · claim 3 · profile 8 · me 2 · delete 12 · admin ≤ 6 · the hourly cron 45 (finalising `cron.finalizePerRun` = 6 full brackets, ≈ 6 each, plus the purge and the stats rollup; raise it on Paid) · the daily sweep at 03:47 UTC in its own invocation 44 (every chunk loop at `cron.sweepChunksPerRun`). One known edge on Free: a ten-win request that **loses a join race** (the bracket filled between the read and the write) retries the join, and that second ≈ 25-statement batch can pass 50; D1 then refuses the call, nothing is written (every batch is atomic and the lost one was guarded), the client gets 503 `unavailable` (Retry-After 30 s) and keeps the wins queued for its next send. On Paid (1 000 per invocation) it cannot happen. Rows written per counted win: the member row (1), the win row with its two indexes (3), the player row once per request — ≤ 5. The Worker bundle is ≈ 187 KB (63 KB gzip; Free allows 3 MB); the solution table is ≈ 59 KB of it, split lazily once per isolate. Every statement reads by key or index range (tested), and the retention sweep deletes in chunks by index range, so D1's rows-read billing never sees a table scan.

Plans and the traffic model are in spec §1.12: Free carries development, staging and a soft launch to about 1 200 daily players (writes run out first, ≈ 76 rows written per player per day including the retention deletes); Workers Paid ($5/month) covers 10 000 daily players inside the included amounts; ≈ $200–230/month at 100 000. Set usage notifications at 50 / 80 / 100 % (G-SRV-4). Before launch run `npm --prefix server run load` against staging (spec §10.4: synthetic players only, `fb:synthetic`), and read rows and CPU per request for the same window in the Cloudflare dashboard.

## Behaviour worth knowing (all inside the contract)

- A bracket is finalised 30 s after `endsAt` (`bracket.finalizeGraceMs`), so a win request that started before the end commits first; until then the view is `ended`, not `final`. Lazy (on any read) and in the hourly cron.
- A finalised view's `members` is `final_members` (the count ranked at the end); after a later deletion or suspension its rows show an honest gap in the ranks.
- Only counted wins are stored; a rejected win is judged again if re-sent. A retried counted win answers `duplicate` with its original points.
- A player has at most one running bracket: a join (or a new bracket) happens only while they have none and at least one of the submitted wins is new, so concurrent requests of one player never open two brackets or leave a 0-point row.
- Rate limits are per isolate (best effort); the exact limits are D1-backed (bracket cap, name cooldown, heart uniqueness and cap, anonymous devices per IP per day).
