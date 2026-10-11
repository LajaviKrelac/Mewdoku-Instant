// Owner: G1 (Phase 2e). The worldwide daily ranking end to end against the local dev server (docs/phase2e/spec.md
// §10.3, §2.3–§2.9, §0.4 H-1…H-4) on the web e2e build (VITE_LADDER_WEB=anon): every test has its own test
// pool (?ladderPool=<random> → devPool), and the other players are real sessions with real solutions made
// through the public API (tests/e2e/helpers/rank-players.ts; no seeding route). Covered: the panel lists
// exactly the server's rows in its order with its count (= GET /v1/bracket); alone → one row and the alone
// line; a heart (+1, pressed, kept after a reload); the Home chip → the sheet with the same rows; offline →
// the cached rows marked stale, the queued win sent once the server is back; a crash right after WON (the
// first submit aborted, then a reload) → the win sent once; "Show me in rankings" off → records.
// Skipped when the ranking server is not running (E2E_LADDER_URL, default :8787).
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import type { SaveData } from '../../src/game/types';
import { LADDER_URL, ladderUp, newPool, webPlayer, type RankPlayer } from './helpers/rank-players';

type TestWindow = Window & { __mewdoku?: E2EHooks };

test.beforeAll(async () => {
  test.skip(!(await ladderUp()), `no ranking server at ${LADDER_URL}`);
});

const atLevel = (level: number): SaveData => ({
  ...defaults(Date.now() - 3 * 86_400_000),
  tutorialDone: true,
  sessions: 3,
  progress: { level, completed: level - 1, best: {} },
});

async function openApp(page: Page, pool: string, save: SaveData = atLevel(20)): Promise<void> {
  await page.goto(`/?ads=unsupported&ladderPool=${pool}`);
  await page.waitForFunction(() => !!(window as TestWindow).__mewdoku && (window as TestWindow).__mewdoku?.app().screen !== 'boot');
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 });
}

/** Plays the next level and wins it after the server's soft solve floor (a hook solve is instant otherwise). */
async function winNext(page: Page): Promise<void> {
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.waitForTimeout(5_000);
  await page.evaluate(() => {
    if (!(window as TestWindow).__mewdoku?.solve()) throw new Error('solve failed');
  });
}

const panel = (page: Page) => page.locator('.overlay[data-overlay="ranking"]');
const bracketList = (page: Page) => panel(page).locator('.rank-list[data-kind="bracket"]');
/** The server's rows only (the pinned copy of my row is aria-hidden and not counted). */
const rows = (page: Page) => bracketList(page).locator('ol.rank-rows > li.rank-row');

async function rowTexts(page: Page): Promise<{ rank: string | null; me: string | null; name: string; points: string }[]> {
  return rows(page).evaluateAll((els) =>
    els.map((el) => ({
      rank: el.getAttribute('data-rank'),
      me: el.getAttribute('data-me'),
      name: el.querySelector('.rank-row__name')?.textContent?.trim() ?? '',
      points: el.querySelector('.rank-row__points')?.textContent?.replace(/\D+/g, '') ?? '',
    })),
  );
}

async function tapThrough(page: Page): Promise<void> {
  const tap = panel(page).locator('.ranking__tap');
  await expect(tap).toBeEnabled({ timeout: 5_000 });
  await tap.click();
  const home = page.locator('[data-overlay="victory"] .victory__home');
  await expect(home).toBeEnabled({ timeout: 5_000 });
  await home.click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
}

async function others(pool: string, points: readonly number[]): Promise<RankPlayer[]> {
  const out: RankPlayer[] = [];
  for (const p of points) {
    const pl = await webPlayer(pool);
    // p fish as wins of levels 2, 3, … worth 3 each, the remainder in the last one.
    const levels: number[] = [];
    const fish: number[] = [];
    let left = p;
    for (let lv = 2; left > 0; lv++) {
      levels.push(lv);
      fish.push(Math.min(3, left));
      left -= Math.min(3, left);
    }
    for (let i = 0; i < levels.length; i++) await pl.win([levels[i] as number], fish[i]);
    out.push(pl);
  }
  return out;
}

test('a win: the panel lists exactly the server bracket (rows, order, ranks, count), my row marked', async ({ page }) => {
  const pool = newPool('lad1');
  const [a] = await others(pool, [9, 6, 1]);
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await expect(bracketList(page)).toHaveAttribute('data-stale', '0');
  const server = await (a as RankPlayer).bracket();
  expect(server.members).toBe(4);
  const ui = await rowTexts(page);
  expect(ui.map((r) => [r.rank, r.name, r.points])).toEqual(server.rows.map((r) => [String(r.rank), r.nickname, String(r.points)]));
  expect(ui.filter((r) => r.me === '1')).toHaveLength(1);
  expect(ui.find((r) => r.me === '1')?.points).toBe('3');
  await expect(panel(page).locator('.ranking__count')).toContainText('4');
  // My numbers (no rows) are saved; the rows live in the rows cache only.
  const save = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save);
  expect(save?.ladder.pending).toEqual([]);
  expect(save?.ladder.current).toMatchObject({ points: 3, members: 4 });
  expect(JSON.stringify(save)).not.toContain(server.rows.find((r) => !r.me && r.rank === 1)?.nickname ?? '#');
});

test('alone in a bracket: one row (mine) and the alone line, no placeholder rows', async ({ page }) => {
  const pool = newPool('lad2');
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAttribute('data-me', '1');
  await expect(panel(page).locator('.ranking__alone')).toHaveText("You're the only player in this ranking so far.");
});

test('a heart on another row: +1 and pressed at once, kept by the server (a reload shows it pressed)', async ({ page }) => {
  const pool = newPool('lad3');
  const [a] = await others(pool, [6]);
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  const other = bracketList(page).locator('ol.rank-rows > li.rank-row[data-me="0"]').first();
  const heart = other.locator('button.rank-row__heart');
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  const before = Number((await heart.locator('.rank-row__hearts').textContent())?.replace(/\D+/g, '') || '0');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await expect(heart.locator('.rank-row__hearts')).toHaveText(String(before + 1));
  await expect.poll(async () => (await (a as RankPlayer).bracket()).rows.find((r) => r.me)?.hearts, { timeout: 5_000 }).toBe(before + 1);
  // The server keeps it: the sheet after a reload shows the heart pressed.
  await tapThrough(page);
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 });
  await page.locator('button.ladder-chip').click();
  const sheet = page.locator('.overlay[data-overlay="ladder"]');
  await expect(sheet.locator('li.rank-row[data-me="0"] button.rank-row__heart').first()).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
});

test('the Home chip shows my rank and fish; it opens the sheet with the same rows', async ({ page }) => {
  const pool = newPool('lad4');
  await others(pool, [9]);
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  const panelRows = await rowTexts(page);
  await tapThrough(page);
  const chip = page.locator('button.ladder-chip');
  await expect(chip).toHaveAttribute('data-state', 'bracket');
  await expect(chip.locator('.ladder-chip__rank')).toContainText('2');
  await expect(chip.locator('.ladder-chip__points')).toContainText('3');
  await chip.click();
  const sheet = page.locator('.overlay[data-overlay="ladder"]');
  await expect(sheet).toBeVisible();
  const sheetRows = await sheet.locator('ol.rank-rows > li.rank-row').evaluateAll((els) =>
    els.map((el) => ({ rank: el.getAttribute('data-rank'), name: el.querySelector('.rank-row__name')?.textContent?.trim() ?? '' })),
  );
  expect(sheetRows).toEqual(panelRows.map((r) => ({ rank: r.rank, name: r.name })));
});

test('offline after a win: the next panel shows the cached rows marked stale; the queued win is sent when the server is back', async ({ page }) => {
  test.setTimeout(90_000);
  const pool = newPool('lad6');
  const [a] = await others(pool, [9]);
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await tapThrough(page);
  // The server goes away.
  await page.route(`${LADDER_URL}/**`, (route) => route.abort('connectionrefused'));
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 20_000 });
  await expect(bracketList(page)).toHaveAttribute('data-stale', '1');
  await expect(panel(page).locator('.ranking__stale')).toBeVisible();
  // The server's number stays (3), never a guess; the win waits in the queue.
  expect((await rowTexts(page)).find((r) => r.me === '1')?.points).toBe('3');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.ladder?.()?.pending)).toBe(1);
  // Back online: Home flushes the queue; the server counts the win once.
  await page.unroute(`${LADDER_URL}/**`);
  await tapThrough(page);
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__mewdoku?.ladder?.()?.pending), { timeout: 15_000 }).toBe(0);
  await expect.poll(async () => (await (a as RankPlayer).bracket()).rows.find((r) => !r.me)?.points, { timeout: 5_000 }).toBe(6);
});

test('a crash right after WON (the first submit never arrives, then a reload): the queued win is sent once', async ({ page }) => {
  test.setTimeout(90_000);
  const pool = newPool('lad13');
  const [a] = await others(pool, [9]);
  await openApp(page, pool);
  let aborted = 0;
  await page.route(`${LADDER_URL}/v1/wins`, (route) => {
    aborted++;
    return route.abort('connectionreset');
  });
  await winNext(page);
  await expect.poll(() => aborted, { timeout: 10_000 }).toBeGreaterThan(0);
  // The win is in the critical save already.
  const pending = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.pending.length);
  expect(pending).toBe(1);
  await page.unroute(`${LADDER_URL}/v1/wins`);
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(`${LADDER_URL}/v1/wins`) && r.method() === 'POST') sent.push(r.postData() ?? '');
  });
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__mewdoku?.ladder?.()?.pending), { timeout: 15_000 }).toBe(0);
  await expect.poll(async () => (await (a as RankPlayer).bracket()).rows.find((r) => !r.me)?.points, { timeout: 5_000 }).toBe(3);
  // A second reload sends nothing.
  const count = sent.length;
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 });
  await page.waitForTimeout(1_000);
  expect(sent.length).toBe(count);
});

test('"Show me in rankings" off: the next win shows my records with the opted-out note, nothing is sent', async ({ page }) => {
  const pool = newPool('lad7');
  await openApp(page, pool);
  await page.locator('.screen--home').getByRole('button', { name: 'Settings' }).click();
  const listed = page.locator('[data-overlay="settings"] .settings__ladder-listed');
  await expect(listed).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
  await listed.click();
  await expect(listed).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 });
  await expect(async () => {
    const open = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().overlays ?? []);
    if (open.length > 0) await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().overlays ?? [])).toEqual([]);
  }).toPass({ timeout: 5_000 });
  const wins: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(`${LADDER_URL}/v1/wins`)) wins.push(r.method());
  });
  await winNext(page);
  await expect(panel(page)).toBeVisible({ timeout: 15_000 });
  await expect(panel(page).locator('.rank-list[data-kind="records"]')).toBeVisible();
  await expect(panel(page)).toContainText("You've turned rankings off in Settings. Here are your own records.");
  await tapThrough(page);
  await expect(page.locator('button.ladder-chip')).toHaveAttribute('data-state', 'off');
  expect(wins).toEqual([]);
});
