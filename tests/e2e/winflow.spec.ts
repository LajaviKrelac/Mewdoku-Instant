// Owner: C
// The post-win flow end to end (phase2b §2.2, §2.7, §2.13) on the web e2e build: solve through the
// hook → rewards saved at once → the in-game fish pill counts +3 → the ranking panel at 4.5 s
// (4.4–4.8) → tap → the victory screen with the wide "Level 3" → the next board, input locked until
// its entry ends. With reduced motion the panel comes at 1.2 s (≤ 1.4). Home and Gear do nothing
// before the panel.
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import type { SaveData } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const NOW = Date.now();
const atLevel = (level: number, patch: Partial<SaveData> = {}): SaveData => ({
  ...defaults(NOW - 3 * 86_400_000),
  tutorialDone: true,
  sessions: 3,
  progress: { level, completed: level - 1, best: {} },
  ...patch,
});

async function open(page: Page, save: SaveData): Promise<void> {
  await page.goto('/?ads=unsupported');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home' || (window as TestWindow).__mewdoku?.app().screen === 'game');
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
}

async function playNext(page: Page): Promise<void> {
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
}

/** Solves through the hook; returns performance.now() at WON (page clock). */
async function solve(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ok = (window as TestWindow).__mewdoku?.solve() ?? false;
    if (!ok) throw new Error('solve failed');
    return performance.now();
  });
}

/** ms from `t0` (page clock) until the ranking panel is on the overlay stack. */
async function panelAfter(page: Page, t0: number): Promise<number> {
  const h = await page.waitForFunction(
    (start) => ((window as TestWindow).__mewdoku?.app().overlays.includes('ranking') ? performance.now() - start : false),
    t0,
    { polling: 'raf', timeout: 10_000 },
  );
  return (await h.jsonValue()) as number;
}

test('win: rewards at once, fish +3, panel at 4.5 s, tap → victory "Level 3" → next board after its entry', async ({ page }) => {
  await open(page, atLevel(2));
  await playNext(page);
  const t0 = await solve(page);

  // t = 0: fish, points and progress are already saved (the critical save went to localStorage).
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('mewdoku.save.v1');
    return raw ? (JSON.parse(raw) as SaveData) : null;
  });
  expect(stored?.wallet.fish).toBe(3);
  expect(stored?.progress.level).toBe(3);
  expect(stored?.points.total).toBeGreaterThan(0);

  // Home and Gear do nothing before the panel.
  await page.locator('.top-bar').getByRole('button', { name: 'Home' }).click({ force: true });
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().screen)).toBe('game');

  // The in-game fish pill counts up to +3.
  const pill = page.locator('.pills .fish-pill');
  await expect(pill).toBeVisible({ timeout: 2000 });
  await expect(pill.locator('.fish-pill__main')).toHaveAttribute('aria-label', '3 fish', { timeout: 4000 });

  const dt = await panelAfter(page, t0);
  expect(dt).toBeGreaterThanOrEqual(4400);
  expect(dt).toBeLessThanOrEqual(4800);

  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 3000 });
  await panel.locator('.ranking__tap').click();

  const primary = page.locator('[data-overlay="victory"] .victory__primary');
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Level 3/);
  await expect(primary).toBeEnabled({ timeout: 2000 });
  await expect(page.locator('[data-overlay="victory"]')).toContainText('+3');
  await primary.click();

  // The next board: input locked (status ready) until its entry ends, then playing.
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.puzzle.id === 'L3');
  const first = await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.status);
  expect(first).toBe('ready');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', undefined, { timeout: 3000 });
});

test('reduced motion: the panel at 1.2 s (≤ 1.4 s) with the count already +3', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, atLevel(2));
  await playNext(page);
  const t0 = await solve(page);
  const dt = await panelAfter(page, t0);
  expect(dt).toBeLessThanOrEqual(1400);
  expect(dt).toBeGreaterThanOrEqual(1100);
  await expect(page.locator('.pills .fish-pill .fish-pill__main')).toHaveAttribute('aria-label', '3 fish');
});

test('a Hard level shows the bonus chip and +5 fish in total', async ({ page }) => {
  await open(page, atLevel(30, { wallet: { fish: 10, earned: 10 } }));
  await playNext(page);
  await solve(page);
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 3000 });
  await panel.locator('.ranking__tap').click();
  const victory = page.locator('[data-overlay="victory"]');
  await expect(victory).toContainText('Hard level bonus +2');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.wallet.fish)).toBe(15);
});
