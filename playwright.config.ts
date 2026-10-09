// Owner: lead. E2E config (04 §11; phase2b §12.1 F0 item 10). Browsers are preinstalled: never run
// "playwright install".
// Phase 2b specs (written by their owners; a pattern for a spec that does not exist yet matches nothing):
//   visual.spec.ts (A)  → web-320, web-390, web-1280 (screenshots to docs/phase2b/screenshots/)
//   i18n.spec.ts (E)    → web-320, web-390
//   winflow.spec.ts, events.spec.ts (C) → web-390
// Screenshot switches (for a person's review, never diffed):
//   visual.spec.ts always writes docs/phase2b/screenshots/A-visual-<screen>-<width>.png; VISUAL_OUT=<dir>
//     writes them elsewhere (e.g. a scratch folder, to keep the committed set unchanged).
//   I18N_SHOTS=1 makes i18n.spec.ts also write its 320 px per-locale set to docs/i18n/screenshots/.
import { defineConfig } from '@playwright/test';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';

const WEB_PORT = 4173; // dist/e2e (web build with __E2E__ hooks)
const FBIG_PORT = 4174; // dist/fbig-e2e (fbig build with hooks and test placement IDs)

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
    { name: 'web-390', testIgnore: /fbig\.spec\.ts/, use: { ...phone } },
    // Layout, visual and i18n checks also run at the small phone; layout and visual at desktop size.
    {
      name: 'web-320',
      testMatch: /(layout|visual|i18n)\.spec\.ts/,
      use: { ...phone, viewport: { width: 320, height: 568 } },
    },
    { name: 'web-1280', testMatch: /(layout|visual)\.spec\.ts/, use: { viewport: { width: 1280, height: 800 } } },
    // FBIG build against tests/fixtures/fbinstant-stub.js (served with page.route).
    {
      name: 'fbig-390',
      testMatch: /fbig\.spec\.ts/,
      use: { ...phone, baseURL: `http://127.0.0.1:${FBIG_PORT}` },
    },
  ],
  webServer: [
    {
      command: 'npm run build:e2e && npm run preview:e2e',
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run build:fbig-e2e && npm run preview:fbig-e2e',
      url: `http://127.0.0.1:${FBIG_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        MEWDOKU_E2E: '1',
        VITE_FB_PLACEMENT_INTERSTITIAL: 'e2e-interstitial',
        VITE_FB_PLACEMENT_REWARDED: 'e2e-rewarded',
        // phase2b (D's fbig.spec.ts): test banner placement and leaderboard ids for the stub.
        VITE_FB_PLACEMENT_BANNER: 'e2e-banner',
        // Phase 2c (I-1): one period board (fish kept this UTC week); `paw_points` is retired and
        // `daily_fastest` is off (`rank.dailyBoard: false`), so neither is mapped.
        VITE_FB_LEADERBOARDS: JSON.stringify({
          period_points: 'e2e_period_points',
          event_lantern_walk_2026: 'e2e_event_lantern_walk_2026',
          event_snow_paws_2026: 'e2e_event_snow_paws_2026',
          event_yarn_hearts_2027: 'e2e_event_yarn_hearts_2027',
        }),
      },
    },
  ],
});
