// Owner: foundation. E2E config (04 §11). Browsers are preinstalled: never run "playwright install".
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
    // Main web suite (smoke etc.) on a 390×844 phone.
    { name: 'web-390', testIgnore: /fbig\.spec\.ts/, use: { ...phone } },
    // Layout checks also run at the small phone and desktop sizes.
    {
      name: 'web-320',
      testMatch: /layout\.spec\.ts/,
      use: { ...phone, viewport: { width: 320, height: 568 } },
    },
    { name: 'web-1280', testMatch: /layout\.spec\.ts/, use: { viewport: { width: 1280, height: 800 } } },
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
      },
    },
  ],
});
