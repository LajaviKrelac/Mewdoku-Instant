# Next session: Facebook upload (2026-10-11)

Where things stand, and the exact steps for the session that has `FB_APP_ID` and `FB_APP_SECRET` in its
environment and `graph-video.facebook.com` in its allowed domains. Settings changes reach a new session only.

## Done

- **Staging ranking server** is live: `https://mewdoku-rank-staging.mewdoku-rank.workers.dev`
  (Cloudflare account "Mare1988@gmail.com's Account", Worker `mewdoku-rank-staging`, D1 `mewdoku-rank-staging`,
  id in `server/wrangler.toml`). Migrations 0001–0002 applied. `/v1/health` answers `db: ok`.
- Its secrets are set in Cloudflare only (they cannot be read back): `FB_APP_SECRET` (the app's real secret),
  `SESSION_SECRET`, `ID_PEPPER`, `ADMIN_KEY`, `FB_APP_SECRET_ALT` (random, staging only). To run the smoke test
  again, put a new `FB_APP_SECRET_ALT` (`openssl rand -base64 48 | npx wrangler secret put FB_APP_SECRET_ALT --env staging`)
  and pass the same value as `SMOKE_ALT_SECRET`.
- The smoke test passed (health, config, session, win, bracket). It left one test player on staging.
- Node's `fetch` needs `NODE_USE_ENV_PROXY=1` in this cloud container (the agent proxy); wrangler and curl do not.

## To do, in order

1. Check the environment (names and shapes only; never print a value):
   `[ -n "$FB_APP_ID" ] && [ -n "$FB_APP_SECRET" ] && echo ok`, and
   `curl -sS -o /dev/null -w "%{http_code}\n" https://graph-video.facebook.com/` (anything but `000`).
2. Rebuild the two zips (`dist-zip/` is not in git):
   ```bash
   npm ci && npm --prefix server ci
   npm run probe -- --url https://mewdoku-rank-staging.mewdoku-rank.workers.dev
   VITE_LADDER_URL=https://mewdoku-rank-staging.mewdoku-rank.workers.dev npm run build:fbig
   npm run zip:fbig:preview
   ```
3. Upload, probe first (`scripts/upload-fbig.ts`: app token from `FB_APP_ID` + `FB_APP_SECRET`, then
   `POST graph-video.facebook.com/{app_id}/assets` with `type=BUNDLE`):
   ```bash
   NODE_USE_ENV_PROXY=1 npx tsx scripts/upload-fbig.ts dist-zip/mewdoku-rank-probe-<sha>.zip --comment "rank probe <sha>"
   NODE_USE_ENV_PROXY=1 npx tsx scripts/upload-fbig.ts --preview --comment "test build <sha> (staging ranking)"
   ```
   A token error means the ID and secret do not match (or the app has no Instant Games product).
4. The user, in the App Dashboard → Instant Games → Web Hosting: move the probe build to **Testing**, open it on
   facebook.com, the Android app, the iPhone app and messenger.com, and send back the "Copy results" text
   (STATUS-2e §7). Then the same for the game test build.
5. With the probe results: set the production `ALLOWED_ORIGINS` to the exact origin line 6 reports
   (`https://apps-<FB_APP_ID>.apps.fbsbx.com` expected); turn on the stricter freshness check if `issued_at` is
   present (G-SRV-2). Production deploy still waits for the public name (G-NAME).

## Not possible from here

Moving builds to Testing or Production, ad placements (Monetization Manager), leaderboards and in-app products
are dashboard work (`docs/phase2b/fb-dashboard.md` §8, §9.5).
