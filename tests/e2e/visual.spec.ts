// Owner: A (phase2b §1.12)
// Visual review screenshots of the Classic look at 320, 390 and 1280 (the web-320, web-390 and
// web-1280 projects): Home, mid-game, ranking, victory, fail, settings, shop and event. They are
// stored under docs/phase2b/screenshots/ (VISUAL_OUT overrides the folder) and reviewed by a person,
// never diffed in CI. Each test also asserts the few things a screenshot cannot show on its own: the
// screen is really there and the Classic tokens are live.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import type { SaveData } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const OUT = process.env.VISUAL_OUT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/phase2b/screenshots');
mkdirSync(OUT, { recursive: true });

const NOW = Date.now();
const returning = (patch: Partial<SaveData> = {}): SaveData => ({
  ...defaults(NOW - 3 * 86_400_000),
  tutorialDone: true,
  sessions: 4,
  progress: { level: 12, completed: 11, best: {} },
  wallet: { fish: 128, earned: 128 },
  ...patch,
});

async function ready(page: Page, screen?: string): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const app = (window as TestWindow).__mewdoku?.app();
      return !!app && app.screen !== 'boot' && (!want || app.screen === want);
    },
    screen ?? null,
  );
}

async function open(page: Page, save: SaveData): Promise<void> {
  await page.goto('/');
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await ready(page, 'home');
  await page.waitForTimeout(500); // the Home mascot pops in
}

async function shot(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(OUT, `A-visual-${name}-${width}.png`) });
}

const solution = (page: Page) => page.evaluate(() => (window as TestWindow).__mewdoku?.solution() ?? []);
const cell = (page: Page, i: number) => page.locator('.cell').nth(i);

async function startLevel(page: Page): Promise<number[]> {
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.waitForTimeout(300);
  return solution(page);
}

async function placeCat(page: Page, i: number): Promise<void> {
  await cell(page, i).dblclick();
  await page.waitForTimeout(350); // cellLockAfterCatMs
}

async function solve(page: Page): Promise<void> {
  const sol = await startLevel(page);
  for (let r = 0; r < sol.length; r++) await placeCat(page, r * sol.length + (sol[r] as number));
}

test.describe('Classic look, visual review (phase2b §1.12)', () => {
  test('home', async ({ page }) => {
    await open(page, returning());
    await expect(page.locator('.home__mascot svg.illus--home')).toBeVisible();
    // the one token set is live: off-white page, orange accent
    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { page: cs.getPropertyValue('--page').trim(), accent: cs.getPropertyValue('--accent').trim() };
    });
    expect(vars).toEqual({ page: '#faf6f0', accent: '#e57010' });
    await shot(page, 'home');
  });

  test('mid-game', async ({ page }) => {
    await open(page, returning());
    const sol = await startLevel(page);
    const n = sol.length;
    for (const r of [0, 2]) await placeCat(page, r * n + (sol[r] as number));
    for (const i of [n + ((sol[1] as number) + 2) % n, n + ((sol[1] as number) + 3) % n, 3 * n + ((sol[3] as number) + 1) % n]) {
      await cell(page, i).click();
      await page.waitForTimeout(330);
    }
    // even gutters and the white X over its edge
    const x = page.locator('.cell[data-s="m"]').first();
    await expect(x.locator('.cell__xe')).toHaveCount(2);
    expect(await x.evaluate((el) => getComputedStyle(el.querySelector('.cell__x') as Element).stroke)).toBe('rgb(255, 255, 255)');
    await page.waitForTimeout(400);
    await shot(page, 'game');
  });

  test('fail', async ({ page }) => {
    await open(page, returning());
    const sol = await startLevel(page);
    const n = sol.length;
    // one wrong cat in each of three rows: three hearts lost
    for (const r of [0, 2, 4]) await placeCat(page, r * n + (((sol[r] as number) + 1) % n));
    await expect(page.locator('.overlay[data-overlay="fail"]')).toBeVisible({ timeout: 6000 });
    await page.waitForTimeout(900);
    await shot(page, 'fail');
  });

  test('ranking and victory', async ({ page }) => {
    await open(page, returning());
    await solve(page);
    await expect(page.locator('.overlay[data-overlay="ranking"]')).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(700);
    await shot(page, 'ranking');
    await page.waitForTimeout(1300); // the tap gate
    await page.mouse.click(10, (page.viewportSize()?.height ?? 600) - 10);
    await expect(page.locator('.overlay[data-overlay="victory"]')).toBeVisible({ timeout: 4000 });
    await page.waitForTimeout(900);
    await shot(page, 'victory');
  });

  test('settings', async ({ page }) => {
    await open(page, returning());
    await page.locator('.top-bar__btn--settings').click();
    await expect(page.locator('.overlay[data-overlay="settings"]')).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, 'settings');
  });

  test('shop', async ({ page }) => {
    await open(page, returning());
    await page.locator('.fish-pill__plus').first().click();
    await expect(page.locator('.overlay[data-overlay="shop"]')).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, 'shop');
  });

  test('event', async ({ page }) => {
    // inside Lantern Walk (2026-11-13 → 2026-11-27 UTC); level 12 is past its unlock level
    await page.clock.setFixedTime(new Date('2026-11-16T12:00:00Z'));
    await open(page, returning());
    await expect(page.locator('.event-card')).toBeVisible();
    await shot(page, 'event-card');
    await page.locator('.event-card').click();
    await ready(page, 'event');
    await expect(page.locator('[data-event-theme="lantern-walk-2026"]').first()).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, 'event');
  });
});
