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

## Left (the user, in the App Dashboard)

1. Run the probe build (already in Testing) on the Android app, the iPhone app and messenger.com; paste each
   "Copy results" text back (STATUS-2e §7).
2. Then move the game build to Testing and play it.
3. With the other three results: add any new origin to production `ALLOWED_ORIGINS`; if every surface shows
   `issued_at`, set `signature.requireIssuedAt` to true (server/src/core/config.ts).
