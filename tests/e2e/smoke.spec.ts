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
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §7.7): the mouse visits its three tiles in pick order
// (the X under it lands as it leaves: only the first at ≈ 1.2 s), the board locked for the run; the
// kitty's cat goes on the fewest-candidates region's tile and its "+576" reaches the Score after the
// star (0 at 1 s, 576 by 1.8 s) with the head's face; the hint's ghosts are exactly the open step's
// Empty effect tiles, Apply closes it at once and crosses exactly those, and a completed line gets
// one "Done!" label per anchor; the two tickers replace the start toast.
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import type { Puzzle } from '../../src/engine/types';
import { mouseSeed, pickMouseCells } from '../../src/game/mouse';
import { defaults } from '../../src/game/save';
import { periodKeyAt, pointsRuleFor, runTotal } from '../../src/game/scoring';
import type { InProgressV2, SaveData } from '../../src/game/types';
import { kittyReference } from '../fixtures/kitty-reference';

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
  await page.locator('.top-bar--game').getByRole('button', { name: 'Back' }).click();
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
  await page.locator('.top-bar--game').getByRole('button', { name: 'Back' }).click();
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

/** The puzzle and board of the page, as plain arrays (the picker's input). */
const boardOf = (page: Page) =>
  page.evaluate(() => {
    const g = (window as TestWindow).__mewdoku?.state();
    if (!g) return null;
    return { id: g.puzzle.id, n: g.puzzle.n, regions: Array.from(g.puzzle.regions), solution: Array.from(g.puzzle.solution), cells: Array.from(g.cells) };
  });
type BoardSnap = NonNullable<Awaited<ReturnType<typeof boardOf>>>;
const puzzleOf = (b: BoardSnap): Puzzle => ({
  id: b.id,
  n: b.n,
  k: 1,
  regions: Uint8Array.from(b.regions),
  solution: Uint8Array.from(b.solution),
  givens: [],
  grade: 1,
  effort: 1,
  hard: false,
});
/** Cell indexes whose X is visible now (marked and no longer pending under the mouse). */
const visibleX = (page: Page): Promise<number[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.board .cell')).flatMap((el, i) => (el.dataset.s === 'm' && !el.classList.contains('fx-pend') ? [i] : [])),
  );

test('21 · the mouse (web, free): O2 → 3 X marks off the solution, visited one by one in pick order, the board locked for the run; then the shared countdown', async ({ page }) => {
  await open(page, '?ads=unsupported', returning());
  await playLevel(page);
  const mouse = page.locator('.tool-bar .tool--mouse');
  await expect(mouse).toBeVisible();
  await expect(mouse).toBeEnabled();
  await expect(mouse).toHaveAttribute('aria-label', 'Mouse: crosses out 3 tiles that have no cat');
  expect(await markCells(page)).toEqual([]);
  const snap = (await boardOf(page)) as BoardSnap;
  // 2d.1 §1.3: the pick order (the seeded shuffle of the first use in this attempt) is the visit order.
  const order = pickMouseCells({ puzzle: puzzleOf(snap), cells: Uint8Array.from(snap.cells) }, 3, mouseSeed(snap.id, 0));
  await mouse.click();
  const prompt = page.locator('[data-overlay="rewarded"]');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Call the mouse?');
  await prompt.getByRole('button', { name: 'Take it' }).click();
  // The state holds the three marks at once (the board hides each X until the mouse leaves its tile).
  await expect.poll(() => markCells(page), { timeout: 5_000 }).toEqual([...order].sort((a, b) => a - b));
  const t0 = Date.now();
  await expect(page.locator('.cell[data-s="m"]')).toHaveCount(3);
  for (const i of order) expect(snap.solution[Math.floor(i / snap.n)]).not.toBe(i % snap.n);
  expect((await app(page))?.save.stock).toEqual(returning().stock); // no stock spent or granted
  // The board is busy for the run (mouseRunMs = 2 975 ms): a tap on a free tile is ignored.
  await expect(page.locator('.board')).toHaveAttribute('aria-busy', 'true');
  const free = snap.cells.findIndex((v, i) => v === 0 && !order.includes(i) && snap.solution[Math.floor(i / snap.n)] !== i % snap.n);
  const at = await cell(page, free).boundingBox();
  if (!at) throw new Error('no cell');
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2); // a raw tap (no actionability wait)
  await page.waitForTimeout(100);
  expect((await game(page))?.cells[free]).toBe(0);
  // The mouse sits on the first picked tile; at ≈ 1.2 s only that tile's X has landed (850 ms; the
  // second lands at 1 785 ms).
  await expect(page.locator('.board > .board__mouse')).toHaveAttribute('data-cell', String(order[0]));
  await page.waitForTimeout(Math.max(0, 1_250 - (Date.now() - t0)));
  expect(await visibleX(page)).toEqual([order[0]]);
  await expect(page.locator('.board > .board__mouse')).toHaveAttribute('data-cell', String(order[1]));
  // After the run: every X shows, the board takes taps again.
  await page.waitForTimeout(Math.max(0, 3_200 - (Date.now() - t0)));
  expect((await visibleX(page)).sort((a, b) => a - b)).toEqual([...order].sort((a, b) => a - b));
  await expect(page.locator('.board__mouse')).toHaveCount(0);
  await expect(page.locator('.board')).not.toHaveAttribute('aria-busy', 'true');
  await cell(page, free).click();
  expect((await game(page))?.cells[free]).toBe(1);
  // The free grant started the shared cooldown: the next tap only shows the countdown.
  await mouse.click();
  await expect(page.getByText(/The mouse is back in \d+:\d\d/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cell[data-s="m"]')).toHaveCount(4);
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

test('23 · the two level-start tickers on a fresh level and on Retry (line 1 = the Retry line), never on a resumed board', async ({ page }) => {
  await open(page, '?ads=unsupported', returning());
  await page.locator('.home__play').click();
  const tickers = page.locator('.tickers > .ticker');
  await expect(tickers).toHaveCount(2, { timeout: 3000 });
  await expect(page.locator('.ticker[data-line="1"]')).toHaveAttribute('data-key', /^(ticker\.cats|toast\.start\.level)$/);
  await expect(page.locator('.ticker[data-line="2"]')).toHaveAttribute('data-key', /^(ticker\.|period\.pill\.)/);
  await expect(page.locator('.tickers')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.start-toast')).toHaveCount(0);
  await playing(page);
  await cell(page, (await wrongCells(page, 1))[0] as number).click(); // a mark: the board is saved
  await page.waitForTimeout(800);
  await page.reload();
  await ready(page, 'home');
  await page.locator('.home__play').click();
  await playing(page);
  await page.waitForTimeout(800); // past line 2's delay
  await expect(page.locator('.ticker')).toHaveCount(0);
  // Retry after a loss: line 1 says so.
  for (const w of await wrongCells(page, 4)) {
    if ((await game(page))?.status !== 'playing') break;
    await dbl(page, w);
  }
  await expect(page.getByRole('button', { name: 'Retry level' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry level' }).click();
  await expect(page.locator('.ticker[data-line="1"]')).toHaveAttribute('data-key', 'toast.start.retry', { timeout: 3000 });
});

// ── Phase 2d.1 (helpers-spec §7.7): the kitty, the hint ──

/** The units complete in `after` and not in `before`, each with its anchor (the last changed tile in reading order). */
function doneUnits(b: BoardSnap, before: number[], after: number[]): { kind: string; index: number; anchor: number }[] {
  const n = b.n;
  const units: { kind: string; index: number; cells: number[] }[] = [];
  for (let r = 0; r < n; r++) units.push({ kind: 'row', index: r, cells: Array.from({ length: n }, (_, c) => r * n + c) });
  for (let c = 0; c < n; c++) units.push({ kind: 'col', index: c, cells: Array.from({ length: n }, (_, r) => r * n + c) });
  for (let g = 0; g < n; g++) units.push({ kind: 'region', index: g, cells: b.regions.flatMap((x, i) => (x === g ? [i] : [])) });
  const complete = (cells: number[], board: number[]): boolean =>
    cells.filter((i) => board[i] === 2 || board[i] === 4).length === 1 && cells.every((i) => board[i] !== 0);
  const out: { kind: string; index: number; anchor: number }[] = [];
  for (const u of units) {
    if (!complete(u.cells, after) || complete(u.cells, before)) continue;
    const changed = u.cells.filter((i) => before[i] !== after[i]);
    out.push({ kind: u.kind, index: u.index, anchor: Math.max(...changed) });
  }
  return out;
}

test('24 · the kitty at run 0 on a fresh level: a cat on the fewest-candidates region\'s cell, "+576" lands in the Score after the star (0 at 1 s, 576 by 1.8 s), the head shows the face', async ({ page }) => {
  await open(page, '?ads=unsupported', returning());
  await playLevel(page);
  // The lazy fx chunk (points, burst, labels) is prefetched after the game screen mounts.
  await expect(page.locator('.game-fx[data-celebrate="ready"]')).toBeAttached({ timeout: 10_000 });
  const snap = (await boardOf(page)) as BoardSnap;
  // The expected tile from the rule's independent reference, never the shipped picker (audit A-4): on this
  // untouched board, the solution cell of the smallest region (ties: the earlier solution cell).
  expect(snap.cells.every((v) => v === 0)).toBe(true);
  const target = kittyReference(snap, snap.cells);
  const sizes = Array.from({ length: snap.n }, (_, g) => snap.regions.filter((x) => x === g).length);
  expect(sizes[snap.regions[target] as number]).toBe(Math.min(...sizes));
  await expect(points(page)).toBeVisible();
  await pointsShow(page, '0');
  await page.locator('.tool-bar .tool--paw').click();
  await expect.poll(async () => (await game(page))?.cells[target], { timeout: 5_000 }).toBe(2);
  const t0 = Date.now();
  expect(snap.solution[Math.floor(target / snap.n)]).toBe(target % snap.n);
  await page.waitForTimeout(Math.max(0, 1_000 - (Date.now() - t0)));
  await expect(page.locator('.top-bar--game .points-pill__n')).toHaveText('0'); // the star is still flying
  await page.waitForTimeout(Math.max(0, 1_800 - (Date.now() - t0)));
  await expect(page.locator('.top-bar--game .points-pill__n')).toHaveText('576');
  const color = await page.evaluate((i) => {
    const g = (window as TestWindow).__mewdoku?.app();
    const region = (window as TestWindow).__mewdoku?.state()?.puzzle.regions[i] ?? -1;
    return g?.session?.colors[region] ?? -1;
  }, target);
  await expect(page.locator(`.pill--heads .head[data-done][data-color="${color}"] .head__face`)).toBeAttached();
  expect((await app(page))?.save.stock.kitties).toBe(returning().stock.kitties - 1);
});

test('25 · the hint: ghosts on exactly the open step\'s Empty effect tiles; Apply closes at once and crosses exactly those; a completed line gets one label per anchor', async ({ page }) => {
  await open(page, '?ads=unsupported', returning());
  await playLevel(page);
  await expect(page.locator('.game-fx[data-celebrate="ready"]')).toBeAttached({ timeout: 10_000 });
  const sol = await solution(page);
  const n = sol.length;
  // A cat on row 1: the first hint is its shadow (its row, column and neighbours), which completes the row.
  await dbl(page, sol[0] as number);
  await page.waitForTimeout(1_500); // the cat's own sequence is over
  const before = ((await boardOf(page)) as BoardSnap).cells;
  await hintTool(page).click();
  await expect(page.locator('.overlay[data-overlay="hint"]')).toBeVisible();
  const step = await page.evaluate(() => {
    const h = (window as TestWindow).__mewdoku?.state()?.openHint;
    return h ? { kind: h.kind, focus: h.focusCells, effects: h.effectCells, place: h.placeCell ?? null } : null;
  });
  expect(step?.kind).toBe('shadow');
  const empties = (step?.effects ?? []).filter((i) => before[i] === 0).sort((a, b) => a - b);
  // Cut-outs = the focus ∪ the Empty effects (no placeCell on a shadow step); the ghosts are the cut-outs minus the focus.
  await expect.poll(async () => (await page.locator('.cell[data-ghost="x"][data-s="e"]').count()), { timeout: 3_000 }).toBe(empties.length);
  const ghosts = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.board .cell')).flatMap((el, i) => (el.dataset.ghost === 'x' ? [i] : [])),
  );
  expect(ghosts).toEqual(empties);
  // Apply: the overlay is gone in the next frame (no exit transition).
  await page.getByRole('button', { name: 'Apply' }).click();
  const goneNextFrame = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const el = document.querySelector<HTMLElement>('.overlay[data-overlay="hint"]');
            resolve(!el || el.getBoundingClientRect().height === 0 || getComputedStyle(el).visibility === 'hidden' || Number(getComputedStyle(el).opacity) === 0);
          }),
        ),
      ),
  );
  expect(goneNextFrame).toBe(true);
  const snap = (await boardOf(page)) as BoardSnap;
  const added = snap.cells.flatMap((v, i) => (v === 1 && before[i] !== 1 ? [i] : []));
  expect(added).toEqual(ghosts);
  // One "Done!" label per anchor of the completed units (row 1 at least), within its 720 ms; a label that
  // would overlap one already placed (an anchor next to another in its row) is left out (audit A-1).
  const units = doneUnits(snap, before, snap.cells);
  expect(units.some((u) => u.kind === 'row' && u.index === 0)).toBe(true);
  const anchors = [...new Set(units.map((u) => u.anchor))].sort((a, b) => a - b);
  const shown = await page.locator('.game-fx .fx-done-label').evaluateAll((els) =>
    els.map((e) => {
      const b = (e.querySelector('text') ?? e).getBoundingClientRect();
      return { anchor: Number(e.getAttribute('data-anchor')), l: b.left, t: b.top, r: b.right, b: b.bottom };
    }),
  );
  const labels = shown.map((x) => x.anchor).sort((a, b) => a - b);
  expect(labels.length).toBeGreaterThanOrEqual(1);
  for (const a of labels) expect(anchors).toContain(a);
  for (const a of anchors) {
    if (labels.includes(a)) continue;
    // left out: a shown label's anchor sits in the same row, at most two tiles away
    expect(labels.some((b) => Math.floor(b / n) === Math.floor(a / n) && Math.abs((b % n) - (a % n)) <= 2), `anchor ${a} has a label nearby`).toBe(true);
  }
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) {
      const [p, q] = [shown[i], shown[j]] as [(typeof shown)[number], (typeof shown)[number]];
      expect(p.r <= q.l || q.r <= p.l || p.b <= q.t || q.b <= p.t, `labels ${p.anchor} and ${q.anchor} do not overlap`).toBe(true);
    }
  expect(n).toBeGreaterThan(0);
});
