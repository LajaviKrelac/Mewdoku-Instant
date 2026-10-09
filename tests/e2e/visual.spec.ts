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

// ── Phase 2b review fixes (group U): short phones with the banner band ─────────────────────────────
// The banner band never covers a primary action (UX-1, I18N-LAYOUT-1): the victory screen's "Done",
// "Level N" and "Puzzle N" and its Home, and the event screen's Play, Top list and Home sit at least
// ads.banner.buttonClearancePx (16) above the mock banner at 320 × 568 (web-320) and 360 × 640 and
// 375 × 667 (web-390). Home with the event card and the banner never overlaps itself (UX-2,
// I18N-LAYOUT-2). The victory rays never paint over the fish pill (UX-13).

const IN_EVENT = new Date('2026-11-16T12:00:00Z').getTime(); // Lantern Walk: 2026-11-13 → 2026-11-27
const CLEARANCE = 16;
type Size = readonly [number, number];
const shortPhones = (project: string): readonly Size[] =>
  project === 'web-320' ? [[320, 568]] : project === 'web-390' ? [[360, 640], [375, 667]] : [];

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}
const boxOf = (page: Page, sel: string): Promise<Box | null> =>
  page.evaluate((s) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(s)).find((e) => e.getBoundingClientRect().height > 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }, sel);
/** The element at the centre of `sel` is `sel` itself (nothing, the banner included, covers it). */
const onTop = (page: Page, sel: string): Promise<boolean> =>
  page.evaluate((s) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(s)).find((e) => e.getBoundingClientRect().height > 0);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  }, sel);

async function bannerTop(page: Page): Promise<number> {
  const b = await boxOf(page, '[data-testid="mock-banner"]');
  expect(b, 'the mock banner shows').not.toBeNull();
  return (b as Box).top;
}

/** Above the band by the clearance, and really on top (a tap lands on it). */
async function clearOfBand(page: Page, sel: string, top: number, clearance = CLEARANCE): Promise<void> {
  const b = await boxOf(page, sel);
  expect(b, sel).not.toBeNull();
  expect((b as Box).bottom, `${sel} bottom vs the banner at ${top}`).toBeLessThanOrEqual(top - clearance + 0.5);
  expect(await onTop(page, sel), `${sel} is not covered`).toBe(true);
}

async function openAt(page: Page, [w, h]: Size, query = '?ads=ok'): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.clock.install({ time: IN_EVENT });
  await page.goto(`/${query}`);
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(returning({ progress: { level: 37, completed: 36, best: {} } })));
  await page.reload();
  await ready(page, 'home');
  await page.clock.runFor(1500);
}

async function playUntilVictory(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(250);
    if ((await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.status)) === 'playing') break;
  }
  await page.clock.fastForward(61_000); // past the banner's reload window
  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  await page.clock.runFor(6500);
  await page.locator('[data-overlay="ranking"] .ranking__tap').click();
  await page.clock.runFor(1500);
  await page.waitForTimeout(300);
  await page.clock.runFor(1000);
  await expect(page.locator('.victory')).toHaveAttribute('data-banner', '');
}

test.describe('short phones with the banner band (review UX-1, UX-2, I18N-LAYOUT-1, I18N-LAYOUT-2)', () => {
  for (const variant of ['level', 'daily', 'event'] as const) {
    test(`the ${variant} victory keeps its buttons above the banner`, async ({ page }, info) => {
      const sizes = shortPhones(info.project.name);
      test.skip(sizes.length === 0, 'phone sizes only');
      for (const size of sizes) {
        await openAt(page, size);
        if (variant === 'daily') await page.locator('.daily-card').click();
        else if (variant === 'level') await page.locator('.home__play').click();
        else {
          await page.locator('.event-card').click();
          await page.clock.runFor(1500);
          await ready(page, 'event');
          await page.locator('.screen--event .event__play').click();
        }
        await playUntilVictory(page);
        const top = await bannerTop(page);
        await clearOfBand(page, '.victory__primary', top);
        if (variant !== 'daily') await clearOfBand(page, '.victory__home', top, 0);
        await shot(page, `review-victory-${variant}-banner-${size[1]}`);
      }
    });
  }

  test('the event screen keeps Play, Top list and Home above the banner', async ({ page }, info) => {
    const sizes = shortPhones(info.project.name);
    test.skip(sizes.length === 0, 'phone sizes only');
    for (const size of sizes) {
      await openAt(page, size);
      await page.clock.fastForward(61_000); // the banner may load again on the next screen
      await page.locator('.event-card').click();
      await page.clock.runFor(2000);
      await ready(page, 'event');
      await page.clock.runFor(1500);
      await expect(page.locator('.screen--event')).toHaveAttribute('data-banner', '');
      const top = await bannerTop(page);
      await clearOfBand(page, '.event__play', top);
      await clearOfBand(page, '.event__top', top, 0);
      await clearOfBand(page, '.event__home', top, 0);
    }
  });

  test('Home with the event card and the banner never overlaps itself', async ({ page }, info) => {
    const sizes = shortPhones(info.project.name);
    test.skip(sizes.length === 0, 'phone sizes only');
    for (const size of sizes) {
      await openAt(page, size);
      await page.waitForTimeout(400);
      await expect(page.locator('.screen--home')).toHaveAttribute('data-event', '');
      await expect(page.locator('.screen--home')).toHaveAttribute('data-banner', '');
      const bar = (await boxOf(page, '.screen--home .top-bar')) as Box;
      const word = (await boxOf(page, '.home__wordmark')) as Box;
      const card = (await boxOf(page, '.event-card')) as Box;
      const mascot = await boxOf(page, '.home__mascot > svg');
      expect(word.top, 'the wordmark starts below the top bar').toBeGreaterThanOrEqual(bar.bottom - 0.5);
      if (mascot) expect(mascot.bottom, 'the mascot ends above the event card').toBeLessThanOrEqual(card.top + 0.5);
      await clearOfBand(page, '.home__play', await bannerTop(page));
      await shot(page, `review-home-event-banner-${size[1]}`);
    }
  });

  test('the victory rays never paint over the fish pill (UX-13)', async ({ page }, info) => {
    test.skip(info.project.name !== 'web-390', 'one size is enough');
    await page.setViewportSize({ width: 360, height: 640 });
    await open(page, returning());
    await solve(page);
    await expect(page.locator('.overlay[data-overlay="ranking"]')).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(2000);
    await page.mouse.click(10, 630);
    await expect(page.locator('.overlay[data-overlay="victory"]')).toBeVisible({ timeout: 4000 });
    // Make the rays solid, huge and hit-testable (hit testing follows paint order): the pill must
    // still be the element on top.
    await page.addStyleTag({
      content:
        '.victory__rays{pointer-events:auto!important;background:#f00!important;-webkit-mask-image:none!important;mask-image:none!important;width:3000px!important;height:3000px!important;margin:-1500px 0 0 -1500px!important}',
    });
    expect(await onTop(page, '.victory__top .fish-pill__count')).toBe(true);
    expect(await onTop(page, '.victory__top .fish-pill__plus')).toBe(true);
  });
});
