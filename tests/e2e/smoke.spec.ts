// Owner: C (Phase 2b; was app)
// Web build happy and sad paths (04 §11 cases 1–12) against dist/e2e (window.__mewdoku hooks on).
// Saves are seeded through the hooks and applied with a reload; the mock ads are steered by ?ads=.
// Phase 2b: a win goes ranking panel → victory screen; on the web the panel shows personal records
// with the rank.localOnly line and no other player's row (§5.10).
// Phase 2c (G1): a mistake costs a fish (the lives pill shows 2 full); on the web there is no shop at
// all (no Home "+", no Settings Shop row); the panel's records are this week's; the victory rows.
// Phase 2c.1 (G1, fish-lives-spec §10.8): the level-points counter in the pills row follows the user's
// rule (two cats 1,248; a mistake changes nothing; the next cat 1,824; a reload resumes the points and
// the run: the next cat 2,496; Retry 0); the tutorial has no counter; the victory shows the level's
// total and no "Perfect ×N"; the web records show Total points.
// Phase 2d (G1, docs/phase2d/look-spec.md §5.3): the heads pill replaces "N / 10" (one head per colour,
// [data-done] = the cats placed); the Score sits in the game bar (.top-bar--game .points-pill__n);
// the mouse (a tap → O2 → 3 more X marks, none on a cat's tile; the M key); the level-start toast on a
// fresh level, not on a resumed one.
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import { periodKeyAt, pointsRuleFor, runTotal } from '../../src/game/scoring';
import type { InProgressV2, SaveData } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const NOW = Date.now();
const returning = (patch: Partial<SaveData> = {}): SaveData => ({
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

async function open(page: Page, query = '', save?: SaveData): Promise<void> {
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

test('2 · a wrong cat costs a fish (the lives pill shows 2 full) and leaves a red X', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const lives = page.locator('.pill--lives');
  await expect(lives.locator('.life')).toHaveCount(3);
  await expect(lives.locator('.life[data-full]')).toHaveCount(3);
  const [w] = await wrongCells(page, 1);
  await dbl(page, w as number);
  expect((await game(page))?.hearts).toBe(2);
  await expect(cell(page, w as number)).toHaveAttribute('data-s', 'w');
  await expect(lives.locator('.life[data-full]')).toHaveCount(2);
  await expect(lives).toHaveAttribute('aria-label', '2 of 3 fish left');
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

/** The ranking panel after a win: wait for it, then tap once its gate has passed. */
async function continueFromPanel(page: Page): Promise<void> {
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 5000 });
  await panel.locator('.ranking__tap').click();
}

test('4 · a win: ranking panel, then the victory screen; "Level 6" loads the following level', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const sol = await solution(page);
  for (let r = 0; r < sol.length; r++) await dbl(page, r * sol.length + (sol[r] as number));
  await continueFromPanel(page);
  await page.getByRole('button', { name: 'Level 6' }).click();
  await playing(page);
  expect((await game(page))?.id).toBe('L6');
});

test('4b · web rankings: my own records and the rankings-not-available line, never another player row', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const sol = await solution(page);
  for (let r = 0; r < sol.length; r++) await dbl(page, r * sol.length + (sol[r] as number));
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel).toContainText("Rankings with other players aren't available in this version. Here are your own records.");
  await expect(panel.locator('.rank-records')).toBeVisible();
  await expect(panel).toContainText('This week');
  await expect(panel).toContainText('Total points'); // 2c.1 (D24): instead of the retired perfect streak
  await expect(panel).not.toContainText('Perfect streak');
  await expect(panel).toContainText('Levels solved');
  expect(await panel.locator('.rank-list__row, [data-rank-row]').count()).toBe(0);
  expect((await app(page))?.save.period.total).toBe(3);
});

test('4c · no shop on the web (phase2c §5.2): no fish pill "+" on Home, no Shop row in Settings; Home shows this week\'s fish', async ({ page }) => {
  const week = periodKeyAt(Date.now());
  await open(page, '', returning({ period: { key: week, total: 42, bestKey: week, bestTotal: 42 } }));
  await expect(page.locator('.screen--home .fish-pill, .screen--home .fish-pill__plus')).toHaveCount(0);
  const pill = page.locator('.screen--home .period-pill');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('aria-label', '42 fish this week');
  await page.locator('.screen--home').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('[data-overlay="settings"]');
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Shop' })).toHaveCount(0);
  expect((await app(page))?.save).not.toHaveProperty('wallet');
});

test('4d · the victory rows: the level\'s points total, the fish kept and "This week"; no "Perfect ×N"', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  const sol = await solution(page);
  for (let r = 0; r < sol.length; r++) await dbl(page, r * sol.length + (sol[r] as number));
  await continueFromPanel(page);
  const victory = page.locator('[data-overlay="victory"]');
  await expect(victory.locator('.victory__kept')).toHaveAttribute('data-count', '3');
  await expect(victory.locator('.victory__period')).toHaveText('This week: 3');
  // 2c.1: n cats in a row, 96 × (5 + s) each: runTotal(n) (5×5 → 3,840; 8×8 → 7,296).
  const total = runTotal(sol.length, pointsRuleFor('level'));
  await expect(victory.locator('.victory__points')).toHaveText(`${total.toLocaleString('en-US')} points`);
  await expect(victory.locator('.victory__streak')).toHaveCount(0);
  expect((await app(page))?.save.points.total).toBe(total);
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
  const slot = (id: InProgressV2['id'], mode: 'level' | 'daily', n: number): InProgressV2 => ({
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
    inProgress: { level: slot('L25', 'level', ln), daily: slot(`D${today()}`, 'daily', dn), event: null },
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

test('14 · the overlay chunk failing once at boot: it is re-fetched (cache-busted) and O1 / the post-win screens still open', async ({ page }) => {
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
  await continueFromPanel(page);
  await expect(page.getByRole('button', { name: 'Level 6' })).toBeVisible();
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

// ── 2b review fixes (R): ROB-1 — a lazy chunk's stylesheet failing once is fetched again ──

test('16 · the overlay stylesheet failing once at boot: it is re-fetched (cache-busted) and the hint card is styled', async ({ page }) => {
  await open(page, '', returning());
  const seen = await flaky(page, /overlay-chunk-[\w-]+\.css(\?.*)?$/, (n) => n === 1);
  await page.reload();
  await ready(page, 'home');
  await playLevel(page);
  await hintTool(page).click();
  const card = page.locator('[data-overlay="hint"]');
  await expect(card).toBeVisible();
  expect(seen.length).toBe(2); // was: requested once, never again (every overlay unstyled)
  expect(seen[1]).toMatch(/\?retry=\d+$/);
  // Styled: the overlay root is the fixed full-screen layer of overlay-chunk.css (unstyled it is static).
  expect(await card.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  expect((await app(page))?.save.stock.hints).toBe(4);
});

test('17 · the event screen stylesheet failing once: it is re-fetched and the event screen is styled', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T12:00:00Z')); // inside Lantern Walk
  await open(page, '?ads=unsupported', returning({ progress: { level: 15, completed: 14, best: {} } }));
  const seen = await flaky(page, /events-chunk-[\w-]+\.css(\?.*)?$/, (n) => n === 1);
  await page.reload();
  await ready(page, 'home');
  await page.locator('.event-card').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'event', undefined, { timeout: 15_000 });
  expect(seen.length).toBe(2);
  expect(seen[1]).toMatch(/\?retry=\d+$/);
  // Styled: the reward track's nodes are laid out in a row (unstyled they are a plain numbered list).
  const listStyle = await page.locator('.event__nodes').evaluate((el) => getComputedStyle(el).listStyleType);
  expect(listStyle).toBe('none');
});

// ── Phase 2c.1: level points per cat (fish-lives-spec §3.1, §10.2, §10.8) ──

/** The HUD counter's number, as shown (the last number in the box is the one rolling in). Phase 2d: the bar's Score column. */
const points = (page: Page) => page.locator('.top-bar--game .points-pill');
async function pointsShow(page: Page, text: string): Promise<void> {
  await expect(points(page)).toHaveAttribute('aria-label', `Level points: ${text}`);
  await expect(points(page).locator('.points-pill__n').last()).toHaveText(text);
}

test('18 · level points: two cats 1,248; a mistake keeps them; the next cat 1,824; a reload resumes points and run (next 2,496); Retry 0', async ({ page }) => {
  await open(page, '?ads=unsupported', returning());
  await playLevel(page);
  await expect(points(page)).toBeVisible();
  await pointsShow(page, '0'); // F5.1: every level starts at 0
  const sol = await solution(page);
  const n = sol.length;
  const cat = (r: number): number => r * n + (sol[r] as number);
  await dbl(page, cat(0));
  await dbl(page, cat(1));
  await pointsShow(page, '1,248');
  const [w1, w2, w3] = await wrongCells(page, 3);
  await dbl(page, w1 as number);
  await pointsShow(page, '1,248'); // a mistake takes nothing away
  await dbl(page, cat(2));
  await pointsShow(page, '1,824'); // the run restarted: +576
  // The local save (save.localDebounceMs) holds the board with its points; a reload resumes both.
  await page.waitForTimeout(800);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mewdoku.save.v1') ?? 'null') as SaveData | null);
  expect(stored?.inProgress.level).toMatchObject({ points: 1_824, catStreak: 1 });
  await page.reload();
  await ready(page, 'home');
  await page.locator('.home__play').click();
  await playing(page);
  await pointsShow(page, '1,824');
  await dbl(page, cat(3));
  await pointsShow(page, '2,496'); // the run was restored exactly: the 2nd cat in a row adds 672
  // Fail and Retry: a new attempt starts at 0.
  await dbl(page, w2 as number);
  await dbl(page, w3 as number);
  await expect(page.getByRole('button', { name: 'Retry level' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry level' }).click();
  await playing(page);
  await pointsShow(page, '0');
});

test('19 · the tutorial shows no Score column; a level shows it in the game bar', async ({ page }) => {
  await open(page);
  expect((await app(page))?.session?.mode).toBe('tutorial');
  await playing(page);
  await dbl(page, 1);
  await expect(page.locator('.pills .pill--heads')).toBeVisible();
  await expect(points(page)).toBeHidden();
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.levelPoints)).toBe(0);
  await expect(page.locator('.pills .pill--cats, .pills .points-pill')).toHaveCount(0); // 2d: gone from the row
});

// ── Phase 2d (look-spec §5.3): heads, the mouse, the start toast ──

test('20 · the heads pill: one head per colour, [data-done] follows the cats placed (no "N / 10")', async ({ page }) => {
  await open(page, '?ads=unsupported', returning());
  await playLevel(page);
  const sol = await solution(page);
  const n = sol.length;
  const heads = page.locator('.pills .pill--heads .head');
  await expect(heads).toHaveCount(n);
  await expect(page.locator('.pills .pill--heads .head[data-done]')).toHaveCount(0);
  await expect(page.locator('.pills .pill--heads')).toHaveAttribute('aria-label', `0 of ${n} cats placed`);
  await dbl(page, 0 * n + (sol[0] as number));
  await dbl(page, 1 * n + (sol[1] as number));
  await expect(page.locator('.pills .pill--heads .head[data-done]')).toHaveCount(2);
  await expect(page.locator('.pills .pill--heads')).toHaveAttribute('aria-label', `2 of ${n} cats placed`);
  // Every head names a palette colour of the board.
  const colors = await heads.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-color'))));
  expect(new Set(colors).size).toBe(n);
  await expect(page.locator('.pills .pill--cats, .pill__count')).toHaveCount(0);
});

/** The X marks on the board now, by cell index. */
const markCells = async (page: Page): Promise<number[]> => ((await game(page))?.cells ?? []).flatMap((v, i) => (v === 1 ? [i] : []));

test('21 · the mouse (web, free): a tap → O2 → 3 more X marks, none on a cat\'s tile; then the shared countdown', async ({ page }) => {
  await open(page, '?ads=unsupported', returning());
  await playLevel(page);
  const mouse = page.locator('.tool-bar .tool--mouse');
  await expect(mouse).toBeVisible();
  await expect(mouse).toBeEnabled();
  await expect(mouse).toHaveAttribute('aria-label', 'Mouse: crosses out 3 tiles that have no cat');
  const before = await markCells(page);
  expect(before).toEqual([]);
  await mouse.click();
  const prompt = page.locator('[data-overlay="rewarded"]');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Call the mouse?');
  await prompt.getByRole('button', { name: 'Take it' }).click();
  await expect(page.locator('.cell[data-s="m"]')).toHaveCount(3);
  const sol = await solution(page);
  const n = sol.length;
  for (const i of await markCells(page)) expect(sol[Math.floor(i / n)]).not.toBe(i % n);
  expect((await app(page))?.save.stock).toEqual(returning().stock); // no stock spent or granted
  // The free grant started the shared cooldown: the next tap only shows the countdown.
  await mouse.click();
  await expect(page.getByText(/The mouse is back in \d+:\d\d/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cell[data-s="m"]')).toHaveCount(3);
});

test('22 · the M key calls the mouse (a video with the mock ads); the X marks stay on a reload', async ({ page }) => {
  await open(page, '', returning());
  await playLevel(page);
  await cell(page, 0).focus();
  await page.keyboard.press('m');
  const prompt = page.locator('[data-overlay="rewarded"]');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Watch video' }).click();
  await expect(page.locator('.cell[data-s="m"]')).toHaveCount(3, { timeout: 10_000 });
  const marks = await markCells(page);
  await page.waitForTimeout(800); // the debounced local save
  await page.reload();
  await ready(page, 'home');
  await page.locator('.home__play').click();
  await playing(page);
  expect(await markCells(page)).toEqual(marks);
});

test('23 · the level-start toast shows on a fresh level and on Retry, never on a resumed board', async ({ page }) => {
  await open(page, '?ads=unsupported', returning());
  await page.locator('.home__play').click();
  const toast = page.locator('.start-toast');
  await expect(toast).toHaveAttribute('data-kind', 'level', { timeout: 3000 });
  await expect(toast).toHaveAttribute('aria-hidden', 'true');
  await playing(page);
  await cell(page, (await wrongCells(page, 1))[0] as number).click(); // a mark: the board is saved
  await page.waitForTimeout(800);
  await page.reload();
  await ready(page, 'home');
  await page.locator('.home__play').click();
  await playing(page);
  await page.waitForTimeout(800); // past the toast's delay and entry
  await expect(page.locator('.start-toast')).toHaveCount(0);
  // Retry after a loss: 'retry'.
  for (const w of await wrongCells(page, 4)) {
    if ((await game(page))?.status !== 'playing') break;
    await dbl(page, w);
  }
  await expect(page.getByRole('button', { name: 'Retry level' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry level' }).click();
  await expect(page.locator('.start-toast')).toHaveAttribute('data-kind', 'retry', { timeout: 3000 });
});
