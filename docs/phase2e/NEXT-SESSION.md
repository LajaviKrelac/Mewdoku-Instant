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

## Left

- Android app and Messenger: not tested (the user deferred them). Until the Android app is checked,
  `signature.requireIssuedAt` stays false.

## Left (the user, when convenient)

1. Later: the Android Facebook app (the probe or the game build), then `signature.requireIssuedAt` can go on.
