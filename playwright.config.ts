// Owner: lead. E2E config (04 §11; phase2b §12.1 F0 item 10). Browsers are preinstalled: never run
// "playwright install".
// Phase 2b specs (written by their owners; a pattern for a spec that does not exist yet matches nothing):
//   visual.spec.ts (A)  → web-320, web-390, web-1280 (screenshots to docs/phase2b/screenshots/)
//   visual-board.spec.ts (Phase 2d G2; the board captures moved from visual.spec.ts at L0) → web-320,
//     web-390, web-1280, like visual.spec.ts (same VISUAL_OUT switch)
//   i18n.spec.ts (E)    → web-320, web-390
//   winflow.spec.ts, events.spec.ts (C) → web-390
// Screenshot switches (for a person's review, never diffed):
//   visual.spec.ts always writes docs/phase2b/screenshots/A-visual-<screen>-<width>.png; VISUAL_OUT=<dir>
//     writes them elsewhere (e.g. a scratch folder, to keep the committed set unchanged).
//   I18N_SHOTS=1 makes i18n.spec.ts also write its 320 px per-locale set to docs/i18n/screenshots/.
//   VISUAL_OUT_2E=<dir> does the same for the Phase 2e ranking captures (docs/phase2e/screenshots/G3-app-*).
// Phase 2e L0b (lead; spec §8.2 step 3, §10.3, requests-G1 R4, requests-G4 R2): a third webServer, G4's Node dev
// ranking server on 127.0.0.1:8787 (`:memory:`, DEV_ROUTES, the e2e FB test secret, ALLOWED_ORIGINS = the two
// preview origins). Both e2e builds are built against it (VITE_LADDER_URL); the web twin signs in anonymously
// (VITE_LADDER_WEB=anon). The FBInstant stub (tests/fixtures/fbinstant-stub.js) signs getSignedPlayerInfoAsync with
// the same secret (its default `signing.secret`), so the server's real signature check runs. Specs read the
// server's address from E2E_LADDER_URL (set below; tests/e2e/helpers/rank-players.ts) and every ranking test uses
// its own test pool (?ladderPool=<random> → devPool), so tests run in parallel without sharing brackets or clocks.
// The server needs `npm --prefix server ci` once (npm run verify:server says so when it is missing).
// Preview link (lead, 2026-10-11; scripts/preview-mode.ts): preview.spec.ts runs in its own project, preview-390, against
// the e2e twin of the preview build (dist/preview-e2e: the preview-link mode with the usual __E2E__ hooks, served on
// 4175). It needs no server: its ranking is the in-page sample server. The shipped link is dist/preview (no hooks).
import { defineConfig } from '@playwright/test';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';

const WEB_PORT = 4173; // dist/e2e (web build with __E2E__ hooks)
const FBIG_PORT = 4174; // dist/fbig-e2e (fbig build with hooks and test placement IDs)
const LADDER_PORT = 8787; // G4's dev ranking server (server/dev/serve.ts)
const PREVIEW_PORT = 4175; // dist/preview-e2e (the preview link's build with __E2E__ hooks)
const LADDER_URL = `http://127.0.0.1:${LADDER_PORT}`;
/**
 * The e2e FB test secret (CONTRACTS §5): the dev server's FB_APP_SECRET and the stub's default signing secret.
 * A public test value, in e2e builds only; never a real app secret (spec §10.5 #1: release dists are grepped for it).
 */
export const E2E_FB_APP_SECRET = 'e2e-fb-app-secret';
process.env.E2E_LADDER_URL ??= LADDER_URL;

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    browserName: 'chromium',
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Main web suite (smoke, winflow, events, layout, visual, i18n …) on a 390×844 phone.
    { name: 'web-390', testIgnore: /(fbig|preview)\.spec\.ts/, use: { ...phone } },
    // Layout, visual and i18n checks also run at the small phone; layout and visual at desktop size.
    {
      name: 'web-320',
      testMatch: /(layout|visual|visual-board|i18n)\.spec\.ts/,
      use: { ...phone, viewport: { width: 320, height: 568 } },
    },
    { name: 'web-1280', testMatch: /(layout|visual|visual-board)\.spec\.ts/, use: { viewport: { width: 1280, height: 800 } } },
    // FBIG build against tests/fixtures/fbinstant-stub.js (served with page.route).
    {
      name: 'fbig-390',
      testMatch: /fbig\.spec\.ts/,
      use: { ...phone, baseURL: `http://127.0.0.1:${FBIG_PORT}` },
    },
    // The preview link's features (mock ads, mock store, the sample ranking, the preview menu).
    {
      name: 'preview-390',
      testMatch: /preview\.spec\.ts/,
      use: { ...phone, baseURL: `http://127.0.0.1:${PREVIEW_PORT}` },
    },
  ],
  webServer: [
    // Phase 2e L0b: the ranking server (in-memory; every test makes its own pool and players through the API, H-1).
    {
      command: `npm --prefix server run dev:node -- --port ${LADDER_PORT} --quiet`,
      url: `${LADDER_URL}/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        FB_APP_SECRET: E2E_FB_APP_SECRET,
        DEV_ROUTES: 'true',
        WEB_MODE: 'anon',
        ALLOWED_ORIGINS: `http://127.0.0.1:${WEB_PORT},http://127.0.0.1:${FBIG_PORT}`,
      },
    },
    {
      command: 'npm run build:e2e && npm run preview:e2e',
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Phase 2e L0b: the web twin talks to the dev server with an anonymous device id (spec §0.9 web-dev / e2e).
      env: { VITE_LADDER_URL: LADDER_URL, VITE_LADDER_WEB: 'anon' },
    },
    {
      command: 'npm run build:fbig-e2e && npm run preview:fbig-e2e',
      url: `http://127.0.0.1:${FBIG_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        MEWDOKU_E2E: '1',
        // Phase 2e L0b: the FB twin signs in with the stub's signed player info (the e2e secret above).
        VITE_LADDER_URL: LADDER_URL,
        VITE_FB_PLACEMENT_INTERSTITIAL: 'e2e-interstitial',
        VITE_FB_PLACEMENT_REWARDED: 'e2e-rewarded',
        // phase2b (D's fbig.spec.ts): test banner placement and leaderboard ids for the stub.
        VITE_FB_PLACEMENT_BANNER: 'e2e-banner',
        // Phase 2c (I-1): one period board (fish kept this UTC week); `paw_points` is retired and
        // `daily_fastest` is off (`rank.dailyBoard: false`), so neither is mapped. Phase 2e (D-2e-4): the period
        // board is retired too (`rank.fbPeriodBoard: false`); it stays mapped here so fbig.spec.ts can check the
        // build never calls it although the id exists.
        VITE_FB_LEADERBOARDS: JSON.stringify({
          period_points: 'e2e_period_points',
          event_lantern_walk_2026: 'e2e_event_lantern_walk_2026',
          event_snow_paws_2026: 'e2e_event_snow_paws_2026',
          event_yarn_hearts_2027: 'e2e_event_yarn_hearts_2027',
        }),
      },
    },
    // The preview link's e2e twin (hooks on; its ranking origin is the in-page sample server, whatever the env says).
    {
      command: 'npm run build:preview-e2e && npm run preview:preview-e2e',
      url: `http://127.0.0.1:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { MEWDOKU_E2E: '1' },
    },
  ],
});
