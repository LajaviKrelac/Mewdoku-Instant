// Owner: app
// Web build happy and sad paths (04 §11 cases 1–12) against dist/e2e (window.__mewdoku hooks on).
// Saves are seeded through the hooks and applied with a reload; the mock ads are steered by ?ads=.
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import type { InProgressV1, SaveDataV1 } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const NOW = Date.now();
const returning = (patch: Partial<SaveDataV1> = {}): SaveDataV1 => ({
  ...defaults(NOW - 3 * 86_400_000),
  tutorialDone: true,
  sessions: 3,
  progress: { level: 5, completed: 4, best: {} },
  ...patch,
});

function today(): string {
  const d = new Date();
  const p = (x: number): string => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── helpers ──
async function ready(page: Page, screen?: 'home' | 'game'): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const app = (window as TestWindow).__mewdoku?.app();
      return !!app && app.screen !== 'boot' && (!want || app.screen === want);
    },
    screen ?? null,
  );
}

async function open(page: Page, query = '', save?: SaveDataV1): Promise<void> {
  await page.goto(`/${query}`);
  await ready(page);
  if (save) {
    await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
    await page.reload();
    await ready(page);
  }
}

const app = (page: Page) => page.evaluate(() => (window as TestWindow).__mewdoku?.app() ?? null);
const game = (page: Page) =>
  page.evaluate(() => {
    const g = (window as TestWindow).__mewdoku?.state();
    return g ? { status: g.status, hearts: g.hearts, mistakes: g.mistakes, cells: Array.from(g.cells), id: g.puzzle.id, n: g.puzzle.n } : null;
  });
const solution = (page: Page) => page.evaluate(() => (window as TestWindow).__mewdoku?.solution() ?? []);
const cell = (page: Page, i: number) => page.locator('.cell').nth(i);

async function playing(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
}
async function dbl(page: Page, i: number): Promise<void> {
  await cell(page, i).dblclick();
  await page.waitForTimeout(350); // cellLockAfterCatMs
}
/** First non-solution cells, in index order. */
async function wrongCells(page: Page, count: number): Promise<number[]> {
  const sol = await solution(page);
  const n = sol.length;
  const out: number[] = [];
  for (let i = 0; i < n * n && out.length < count; i++) if (sol[Math.floor(i / n)] !== i % n) out.push(i);
  return out;
}
async function playLevel(page: Page): Promise<void> {
  await page.locator('.home__play').click();
  await playing(page);
}

const hintTool = (page: Page) => page.locator('.tool--bulb');

test('1 · first run: the tutorial completes and leads to Level 2', async ({ page }) => {
  await open(page);
  expect((await app(page))?.session?.mode).toBe('tutorial');
  await playing(page);
  await dbl(page, 1);
  await page.getByRole('button', { name: 'Got it' }).click();
  const a = await cell(page, 4).boundingBox();
  const b = await cell(page, 6).boundingBox();
  if (!a || !b) throw new Error('no board');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await dbl(page, 7);
  await hintTool(page).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await dbl(page, 14);
  await page.getByRole('button', { name: 'Play Level 2' }).click();
  await playing(page);
  expect((await game(page))?.id).toBe('L2');
  expect((await app(page))?.save).toMatchObject({ tutorialDone: true, progress: { level: 2, completed: 1 } });
});

test('2 · a wrong cat costs a heart and leaves a red X', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const [w] = await wrongCells(page, 1);
  await dbl(page, w as number);
  expect((await game(page))?.hearts).toBe(2);
  await expect(cell(page, w as number)).toHaveAttribute('data-s', 'w');
});

test('3 · three mistakes → fail overlay → Retry → fresh board', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  for (const w of await wrongCells(page, 3)) await dbl(page, w);
  await expect(page.getByRole('button', { name: 'Retry level' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry level' }).click();
  await playing(page);
  const g = await game(page);
  expect(g).toMatchObject({ hearts: 3, mistakes: 0 });
  expect(g?.cells.every((v) => v === 0)).toBe(true);
});

test('4 · a win shows O3; Next loads the following level', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const sol = await solution(page);
  for (let r = 0; r < sol.length; r++) await dbl(page, r * sol.length + (sol[r] as number));
  await page.getByRole('button', { name: 'Next: Level 6' }).click();
  await playing(page);
  expect((await game(page))?.id).toBe('L6');
});

test('5 · reload mid-level restores the exact board', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const [w] = await wrongCells(page, 1);
  await dbl(page, w as number);
  const sol = await solution(page);
  await dbl(page, sol[0] as number);
  await cell(page, sol.length * sol.length - 1).click();
  await page.waitForTimeout(600);
  const before = (await game(page))?.cells;
  await page.reload();
  await ready(page, 'home');
  await expect(page.locator('.home__play')).toContainText('Continue');
  await page.locator('.home__play').click();
  await playing(page);
  expect((await game(page))?.cells).toEqual(before);
});

test('6 · the hint opens and Apply changes the board', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const before = (await game(page))?.cells;
  await hintTool(page).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await playing(page);
  expect((await game(page))?.cells).not.toEqual(before);
  expect((await app(page))?.save.stock.hints).toBe(4);
});

test('7 · dragging paints Xs', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const n = (await game(page))?.n ?? 0;
  const a = await cell(page, 0).boundingBox();
  const b = await cell(page, n - 1).boundingBox();
  if (!a || !b) throw new Error('no board');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  expect((await game(page))?.cells.slice(0, n)).toEqual(new Array(n).fill(1));
});

test('8 · the daily is locked before level 20 and opens after it', async ({ page }) => {
  await open(page, '', returning({ progress: { level: 20, completed: 19, best: {} } }));
  await page.locator('.daily-card').click();
  await expect(page.getByText('Solve level 20 to open the daily puzzle.')).toBeVisible();
  expect((await app(page))?.screen).toBe('home');
  await open(page, '', returning({ progress: { level: 21, completed: 20, best: {} } }));
  await page.locator('.daily-card').click();
  await playing(page);
  expect((await game(page))?.id).toBe(`D${today()}`);
});

test('9 · reload while O4 is open → O4 again, Continue still offered', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  for (const w of await wrongCells(page, 3)) await dbl(page, w);
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().overlays.includes('fail'));
  await page.reload();
  await ready(page, 'home');
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().overlays.includes('fail'));
  await page.getByRole('button', { name: /continue/i }).click();
  await playing(page);
  expect(await game(page)).toMatchObject({ hearts: 1, status: 'playing' });
});

test('10 · ads unsupported: a free hint at 0, then the countdown', async ({ page }) => {
  await open(page, '?ads=unsupported', returning({ stock: { hints: 0, kitties: 3 } }));
  await playLevel(page);
  await hintTool(page).click();
  await page.getByRole('button', { name: 'Take it' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await playing(page);
  await hintTool(page).click();
  await expect(page.getByText(/Next free hint in \d+:\d\d/)).toBeVisible();
  expect((await app(page))?.save.stock.hints).toBe(0);
});

test('11 · a level and a daily in progress are both restored', async ({ page }) => {
  const slot = (id: InProgressV1['id'], mode: 'level' | 'daily', n: number): InProgressV1 => ({
    id,
    mode,
    cells: `1${'0'.repeat(n * n - 1)}`,
    hearts: 3,
    revivesUsed: 0,
    mistakes: 0,
    hintsUsed: 0,
    kittiesUsed: 0,
    elapsedMs: 5000,
    savedAt: NOW,
  });
  // Learn the board sizes first (the slots must match their puzzles).
  await open(page, '', returning({ progress: { level: 25, completed: 24, best: {} } }));
  await playLevel(page);
  const ln = (await game(page))?.n ?? 0;
  await page.getByRole('button', { name: 'Home' }).click();
  await page.locator('.daily-card').click();
  await playing(page);
  const dn = (await game(page))?.n ?? 0;
  const seeded = returning({
    progress: { level: 25, completed: 24, best: {} },
    inProgress: { level: slot('L25', 'level', ln), daily: slot(`D${today()}`, 'daily', dn) },
  });
  await open(page, '', seeded);
  await playLevel(page);
  expect((await game(page))?.cells[0]).toBe(1);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.locator('.daily-card').click();
  await playing(page);
  expect((await game(page))?.cells[0]).toBe(1);
});

test('12 · ?ads=close: an early-closed rewarded ad grants nothing', async ({ page }) => {
  await open(page, '?ads=close', returning({ stock: { hints: 0, kitties: 3 } }));
  await playLevel(page);
  await hintTool(page).click();
  await page.getByRole('button', { name: 'Watch video' }).click();
  await expect(page.getByText('No videos right now — try again soon.')).toBeVisible();
  expect((await app(page))?.save.stock.hints).toBe(0);
  expect((await game(page))?.status).toBe('playing');
});

test('13 · a slow daily-month fetch shows the loading indicator until the board is ready', async ({ page }) => {
  // The daily month file is fetched when the daily is opened (not at boot): hold it until released.
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/\d{4}-\d{2}-[^/]*\.json$/, async (route) => {
    await gate;
    await route.continue();
  });
  await open(page, '', returning({ progress: { level: 25, completed: 24, best: {} } }));
  await page.locator('.daily-card').click();
  const layer = page.locator('.loading-layer');
  await expect(layer).toBeVisible();
  await expect(layer.getByRole('status')).toHaveText('Getting the board ready…');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'true');
  expect((await app(page))?.screen).toBe('home');
  release();
  await playing(page);
  await expect(layer).toBeHidden();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  expect((await game(page))?.id).toBe(`D${today()}`);
});

// ── Resilience (04 §8: the player never sees a dead end) ──

/** Aborts matching requests while `fail(n)` (n = 1-based request count) is true; returns the URLs seen. */
async function flaky(page: Page, pattern: RegExp, fail: (n: number) => boolean): Promise<string[]> {
  const seen: string[] = [];
  await page.route(pattern, (route) => {
    seen.push(route.request().url());
    return fail(seen.length) ? route.abort() : route.continue();
  });
  return seen;
}

test('14 · the overlay chunk failing once at boot: it is re-fetched (cache-busted) and O1 / O3 still open', async ({ page }) => {
  await open(page, '', returning());
  const seen = await flaky(page, /overlay-chunk-[\w-]+\.js(\?.*)?$/, (n) => n === 1);
  await page.reload();
  await ready(page, 'home');
  await playLevel(page);
  await hintTool(page).click();
  await expect(page.locator('[data-overlay="hint"]')).toBeVisible();
  expect((await app(page))?.save.stock.hints).toBe(4); // charged once, for a card that opened
  expect(seen.length).toBe(2);
  expect(seen[1]).toMatch(/\?retry=\d+$/);
  await page.keyboard.press('Escape');
  const sol = await solution(page);
  for (let r = 0; r < sol.length; r++) await dbl(page, r * sol.length + (sol[r] as number));
  await expect(page.getByRole('button', { name: /^Next/ })).toBeVisible();
});

test('15 · the overlay chunk never loading: the bulb charges nothing, and a lost board goes Home kept', async ({ page }) => {
  await open(page, '', returning());
  await flaky(page, /overlay-chunk-[\w-]+\.js(\?.*)?$/, () => true);
  await page.reload();
  await ready(page, 'home');
  await playLevel(page);
  await hintTool(page).click();
  await expect(page.locator('.toast')).toContainText('Hint unavailable', { timeout: 15_000 });
  expect((await game(page))?.status).toBe('playing');
  expect((await app(page))?.save.stock.hints).toBe(5);
  for (const i of await wrongCells(page, 3)) await dbl(page, i);
  await ready(page, 'home'); // no O4 can be shown: Home, with the 0-heart board saved (02 §15 step 5)
  const slot = (await app(page))?.save.inProgress.level;
  expect(slot?.hearts).toBe(0);
  expect(slot?.revivesUsed).toBe(0);
});
