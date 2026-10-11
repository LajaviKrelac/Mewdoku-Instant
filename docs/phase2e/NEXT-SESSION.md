# Next session: upload the test builds to the Facebook app

Written 2026-10-11 because environment variables added mid-session (`FB_APP_ID`, `FB_APP_SECRET`) only reach a
new session. Start one on branch `claude/mewdoku-instant` and say: "continue from docs/phase2e/NEXT-SESSION.md".

## Where things stand

- Staging ranking server is live: `https://mewdoku-rank-staging.mewdoku-rank.workers.dev` (Cloudflare Worker +
  D1 `mewdoku-rank-staging`, id in `server/wrangler.toml`). Migrations 0001–0002 applied. The staging smoke test
  passed (health, config, session, win, bracket); it left one test player in staging.
- Staging secrets are set: `FB_APP_SECRET` (from the env at the time), and random `SESSION_SECRET`, `ID_PEPPER`,
  `ADMIN_KEY`, `FB_APP_SECRET_ALT` (staging only, not kept anywhere else; `wrangler secret put` new ones if needed).
- Network: `graph.facebook.com` and `graph-video.facebook.com` are allowed (checked from curl and Node).
- In this container Node's built-in fetch needs `NODE_USE_ENV_PROXY=1` to use the proxy (wrangler does not).

## Steps (never print a secret or a token)

1. Check the variables exist: `FB_APP_ID` (numeric), `FB_APP_SECRET` (32 hex), `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID` — test presence and shape only.
2. `npm ci` and `npm --prefix server ci`.
3. Re-put the app secret on staging in case it changed:
   `printf '%s' "$FB_APP_SECRET" | (cd server && CI=1 npx wrangler secret put FB_APP_SECRET --env staging)`.
4. Check the ID and secret with Facebook: mint an app token (client-credentials grant, as in
   `scripts/upload-fbig.ts`) and `GET https://graph.facebook.com/<FB_APP_ID>?fields=name,category` with it.
5. Connection test: `npm run probe -- --url https://mewdoku-rank-staging.mewdoku-rank.workers.dev`, then
   `NODE_USE_ENV_PROXY=1 npx tsx scripts/upload-fbig.ts dist-zip/mewdoku-rank-probe-<sha>.zip --comment "rank probe <sha>"`.
6. Game test build: `VITE_LADDER_URL=https://mewdoku-rank-staging.mewdoku-rank.workers.dev npm run build:fbig`,
   `npm run zip:fbig:preview`, then
   `NODE_USE_ENV_PROXY=1 npx tsx scripts/upload-fbig.ts --preview --comment "game test <sha> (staging ranking)"`.
7. Tell the user: in the App Dashboard → Instant Games → Web Hosting, move the probe build to **Testing**, run it
   on facebook.com, the Android app, the iPhone app and messenger.com, and paste each "Copy results" text back
   (STATUS-2e §7). Then the same for the game build. Moving a build to Testing is done in the dashboard.
8. With the four probe results: set production `ALLOWED_ORIGINS` to the game's exact
   `https://apps-<FB_APP_ID>.apps.fbsbx.com` origin (plus any other origin the probe recorded), per spec §11.3.
