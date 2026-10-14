// Owner: G1 (Phase 2e). The worldwide daily ranking end to end against the local dev server (docs/phase2e/spec.md
// §10.3, §2.3–§2.9, §0.4 H-1…H-4) on the web e2e build (VITE_LADDER_WEB=anon): every test has its own test
// pool (?ladderPool=<random> → devPool), and the other players are real sessions with real solutions made
// through the public API (tests/e2e/helpers/rank-players.ts; no seeding route). Covered: the panel lists
// exactly the server's rows in its order with its count (= GET /v1/bracket); alone → one row and the alone
// line; a heart (+1, pressed, kept after a reload); the Home chip → the sheet with the same rows; offline →
// the cached rows marked stale, the queued win sent once the server is back; a crash right after WON (the
// first submit aborted, then a reload) → the win sent once; "Show me in rankings" off → records.
// G1 resume (§10.3 #5, #8–#12): a ranking ends → the result card → Collect ×2 (mock video) → +4 / +4 once;
// too few players → "Not enough players"; Settings → Delete → my row gone, a new player code when I join
// again; a suspended player → records + the paused line; the name sheet (pick, save, the cooldown line);
// the web-prod path (no ranking origin) sends not one request (the remote switches included); a deletion
// on the server (an email request) → the old token signs in again as a fresh player and the old row never
// comes back. My own row takes one heart.
// Skipped when the ranking server is not running (E2E_LADDER_URL, default :8787).
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import type { SaveData } from '../../src/game/types';
import { adminDelete, adminSuspend, devAdvance, devCron, LADDER_URL, ladderUp, newPool, webPlayer, type RankPlayer } from './helpers/rank-players';
import { watchStrings } from './helpers/strings';
import { gotItNewRanking, newRankingOk } from './helpers/new-ranking';
import { continueStreak } from './helpers/streak-screen';

// Phase 2e I-4: no screen of these tests may ask for an English string that no loaded table has.
watchStrings(test);
// Leaderboard update: the "New ranking" card is closed with Got it whenever it shows.
gotItNewRanking(test);
continueStreak(test); // UI batch (2026-10-13): Continue on the Daily Streak screen after the day's first win

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

async function openApp(page: Page, pool: string, save: SaveData = atLevel(20), ads = 'unsupported'): Promise<void> {
  await page.goto(`/?ads=${ads}&ladderPool=${pool}`);
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
/** The server's rows (UI batch: my row is one of them, sticky in CSS; there is no copy of it). */
const rows = (page: Page) => bracketList(page).locator('ol.rank-rows > li.rank-row');

/** The rows as shown; a name's no-break space before its number (audit B7, display only) reads as the server's space. */
async function rowTexts(page: Page): Promise<{ rank: string | null; me: string | null; name: string; points: string }[]> {
  return rows(page).evaluateAll((els) =>
    els.map((el) => ({
      rank: el.getAttribute('data-rank'),
      me: el.getAttribute('data-me'),
      name: el.querySelector('.rank-row__name')?.textContent?.replace(/\u00A0/g, ' ').trim() ?? '',
      points: el.querySelector('.rank-row__points')?.textContent?.replace(/\D+/g, '') ?? '',
    })),
  );
}

async function tapThrough(page: Page): Promise<void> {
  const tap = panel(page).locator('.ranking__tap');
  await expect(tap).toBeEnabled({ timeout: 5_000 });
  await tap.click();
  // UI batch (victory): no Home on the victory: its "Level N" starts the next level, whose own Home goes Home.
  const before = await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.puzzle.id ?? '');
  const next = page.locator('[data-overlay="victory"] .victory__primary');
  await expect(next).toBeEnabled({ timeout: 5_000 });
  await next.click();
  await page.waitForFunction((id) => {
    const g = (window as TestWindow).__mewdoku?.state();
    return !!g && g.puzzle.id !== id && g.status === 'playing';
  }, before);
  await page.locator('.top-bar--game .top-bar__btn--home').click();
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
  // UI batch: no visible player count; the server's count is read out in the announcement only.
  await expect(panel(page).locator('.ranking__count')).toHaveCount(0);
  await expect(panel(page).locator('[role="status"]')).toContainText('of 4');
  // My numbers (no rows) are saved; the rows live in the rows cache only.
  const save = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save);
  expect(save?.ladder.pending).toEqual([]);
  expect(save?.ladder.current).toMatchObject({ points: 3, members: 4 });
  expect(JSON.stringify(save)).not.toContain(server.rows.find((r) => !r.me && r.rank === 1)?.nickname ?? '#');
  // UI batch (victory): the victory's kept-fish row is the fish alone (no "Your total: 3"; the panel says it).
  await panel(page).locator('.ranking__tap').click();
  await expect(page.locator('[data-overlay="victory"] .victory__kept')).toHaveAttribute('data-count', '3', { timeout: 10_000 });
  await expect(page.locator('[data-overlay="victory"] .victory__period')).toHaveCount(0);
});

test('leaderboard update: the sign-in joins with 0 fish, the "New ranking" card shows once, the others see me online then playing, the podium and pills in the panel', async ({ page }) => {
  await page.removeLocatorHandler(newRankingOk(page));
  const pool = newPool('ladaj');
  const [other] = await others(pool, [3]);
  await openApp(page, pool);
  const card = page.locator('.overlay[data-overlay="ladder_session"]');
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.locator('.overlay__title')).toHaveText('New ranking');
  await expect(card.locator('.lb-timer__text')).toHaveText(/^\d\d:\d\d:\d\d$/);
  await card.locator('.ladder-session__ok').click();
  await expect(card).toBeHidden();
  // The server holds my 0-fish row; the other player sees it "online" (a sign-in is activity).
  const seen = await (other as RankPlayer).bracket();
  expect(seen.rows.map((r) => [r.rank, r.points, r.me])).toEqual([
    [1, 3, true],
    [2, 0, false],
  ]);
  expect(seen.rows[1]?.seenAt).not.toBeNull();
  expect(seen.rows[1]?.playing).toBe(false);
  // A reload: the same ranking, no card again.
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 });
  await page.waitForTimeout(1_500);
  await expect(card).toBeHidden();
  // A level starts: "Playing now" for the others; the win: the podium and the pills in the panel.
  await winNext(page);
  await expect.poll(async () => (await (other as RankPlayer).bracket()).rows.find((r) => !r.me)?.points, { timeout: 15_000 }).toBe(3);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await expect(bracketList(page).locator('.lb-pod:not([hidden])')).toHaveCount(2);
  await expect(rows(page).locator('.lb-status:not([hidden])')).toHaveCount(2);
});

test('leaderboard update: a level in play marks my row "playing" for the others', async ({ page }) => {
  const pool = newPool('ladpl');
  const [other] = await others(pool, [3]);
  await openApp(page, pool);
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await expect.poll(async () => (await (other as RankPlayer).bracket()).rows.find((r) => !r.me)?.playing, { timeout: 10_000 }).toBe(true);
});

test('alone in a bracket: one row (mine) and the alone line, no placeholder rows', async ({ page }) => {
  const pool = newPool('lad2');
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAttribute('data-me', '1');
  await expect(panel(page).locator('.ranking__alone')).toHaveText("You're the only player in this ranking.");
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
  // My own row takes one heart too (hearts.allowSelf, orig L5), then it is pressed for good.
  const mine = bracketList(page).locator('ol.rank-rows > li.rank-row[data-me="1"] button.rank-row__heart');
  await mine.click();
  await expect(mine).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await (a as RankPlayer).bracket()).rows.find((r) => !r.me)?.hearts, { timeout: 5_000 }).toBe(1);
  // The server keeps it: the sheet after a reload shows the heart pressed.
  await tapThrough(page);
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 });
  await page.locator('button.ladder-chip').click();
  const sheet = page.locator('.overlay[data-overlay="ladder"]');
  await expect(sheet.locator('li.rank-row[data-me="0"] button.rank-row__heart').first()).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
});

test('the Home chip counts down and names my rank and fish; it opens the sheet with the same rows', async ({ page }) => {
  const pool = newPool('lad4');
  await others(pool, [9]);
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  const panelRows = await rowTexts(page);
  await tapThrough(page);
  const chip = page.locator('button.ladder-chip');
  await expect(chip).toHaveAttribute('data-state', 'bracket');
  // 2026-10-12 (01 row 7.1.7): the dark pill shows the time left (hh:mm:ss, ticking); rank and fish are in the name.
  await expect(chip).toHaveAttribute('aria-label', /^Daily ranking: #2 of \d+, 3 fish\. Ends in /);
  await expect(chip.locator('.ladder-chip__time')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(chip.locator('.ladder-chip__rank')).toBeHidden();
  await chip.click();
  const sheet = page.locator('.overlay[data-overlay="ladder"]');
  await expect(sheet).toBeVisible();
  const sheetRows = await sheet.locator('ol.rank-rows > li.rank-row').evaluateAll((els) =>
    els.map((el) => ({ rank: el.getAttribute('data-rank'), name: el.querySelector('.rank-row__name')?.textContent?.replace(/\u00A0/g, ' ').trim() ?? '' })),
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

/** The overlays open now (a closed overlay may stay in the DOM, hidden). */
const overlays = (page: Page) => page.evaluate(() => (window as TestWindow).__mewdoku?.app().overlays ?? []);

/** The stock in the live save. */
const stock = (page: Page) => page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.stock ?? null);

/** The pool's bracket ends (24 h + the finalisation grace on its own clock) and its cron finalises it. */
async function endBracket(pool: string): Promise<void> {
  await devAdvance(pool, 24 * 3_600_000 + 60_000);
  await devCron(pool);
}

test('a ranking ends: the result card (#1 of 5) → Collect ×2 plays the video → +6 hints, +6 kitties once; the next Home visit shows no card', async ({ page }) => {
  test.setTimeout(120_000);
  const pool = newPool('lad5');
  await others(pool, [1, 1, 1, 1]);
  await openApp(page, pool, atLevel(20), 'ok');
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await tapThrough(page);
  const before = await stock(page);
  await endBracket(pool);
  await page.reload();
  const card = page.locator('.overlay[data-overlay="ladder_result"]');
  await expect(card).toHaveAttribute('data-case', 'paid', { timeout: 15_000 });
  await expect(card).toContainText('You finished #1 of 5.');
  await card.locator('button.ladder-result__double').click();
  // UI batch: 1st place pays 3 + 3 (the server's rules.places), doubled.
  await expect.poll(() => stock(page), { timeout: 20_000 }).toEqual({ hints: (before?.hints ?? 0) + 6, kitties: (before?.kitties ?? 0) + 6 });
  await expect.poll(() => overlays(page)).not.toContain('ladder_result');
  const s = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder);
  expect(s?.claimed).toHaveLength(1);
  // Again (a new page load): no card, no second grant.
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 });
  await page.waitForTimeout(1_500);
  expect(await overlays(page)).not.toContain('ladder_result');
  expect(await stock(page)).toEqual({ hints: (before?.hints ?? 0) + 6, kitties: (before?.kitties ?? 0) + 6 });
});

test('a 2-player ranking ends with me first: "Not enough players took part for rewards this time." and no reward', async ({ page }) => {
  test.setTimeout(90_000);
  const pool = newPool('lad5b');
  await others(pool, [1]);
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await tapThrough(page);
  const before = await stock(page);
  await endBracket(pool);
  await page.reload();
  const card = page.locator('.overlay[data-overlay="ladder_result"]');
  await expect(card).toHaveAttribute('data-case', 'too_few', { timeout: 15_000 });
  await expect(card).toContainText('You finished #1 of 2.');
  await expect(card).toContainText('Not enough players took part for rewards this time.');
  await expect(card.locator('button.ladder-result__collect:visible, button.ladder-result__double:visible')).toHaveCount(0);
  await card.locator('button.ladder-result__ok').click();
  await expect.poll(() => overlays(page)).not.toContain('ladder_result');
  expect(await stock(page)).toEqual(before);
});

/** Home → Settings (the "Daily ranking" rows once signed in). */
async function openSettings(page: Page): Promise<void> {
  await page.locator('.screen--home').getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('[data-overlay="settings"] .settings__ladder')).toBeVisible({ timeout: 10_000 });
}

async function closeAll(page: Page): Promise<void> {
  await expect(async () => {
    const open = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().overlays ?? []);
    if (open.length > 0) await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().overlays ?? [])).toEqual([]);
  }).toPass({ timeout: 5_000 });
}

test('Settings → Delete my ranking data: my row leaves the other players\' view; joining again makes a new player (a new code)', async ({ page }) => {
  test.setTimeout(90_000);
  const pool = newPool('lad8');
  const [a] = await others(pool, [6]);
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await tapThrough(page);
  expect((await (a as RankPlayer).bracket()).members).toBe(2);
  const oldCode = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.me?.code);
  await openSettings(page);
  await page.locator('[data-overlay="settings"] button.settings__ladder-delete').click();
  await page.locator('[data-overlay="settings"] .settings__confirm-delete').click();
  await expect(page.getByText('Your ranking data was deleted.')).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await (a as RankPlayer).bracket()).members, { timeout: 5_000 }).toBe(1);
  expect((await (a as RankPlayer).bracket()).rows.every((r) => r.me)).toBe(true);
  const after = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder);
  expect(after).toMatchObject({ listed: false, me: null, current: null, pending: [] });
  await closeAll(page);
  await expect(page.locator('button.ladder-chip')).toHaveAttribute('data-state', 'off');
  // Joining again: "Show me in rankings" on → a fresh player (a new code), placed by the next win.
  await openSettings(page);
  const listed = page.locator('[data-overlay="settings"] .settings__ladder-listed');
  await expect(listed).toHaveAttribute('aria-checked', 'false');
  await listed.click();
  await expect(listed).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
  await closeAll(page);
  const newCode = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.me?.code);
  expect(newCode).toBeTruthy();
  expect(newCode).not.toBe(oldCode);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await (a as RankPlayer).bracket()).members, { timeout: 5_000 }).toBe(2);
});

test('a suspended player (admin): told with the paused line and shown their records, never a view without their row; nothing sent', async ({ page }) => {
  test.setTimeout(90_000);
  const pool = newPool('lad9');
  await others(pool, [6]);
  await openApp(page, pool);
  const code = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.me?.code ?? '');
  expect(code).toMatch(/^[0-9A-Z]{8}$/);
  await adminSuspend(code);
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await expect(page.locator('button.ladder-chip')).toHaveAttribute('data-state', 'off', { timeout: 10_000 });
  const wins: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(`${LADDER_URL}/v1/wins`)) wins.push(r.method());
  });
  await winNext(page);
  await expect(panel(page).locator('.rank-list[data-kind="records"]')).toBeVisible({ timeout: 15_000 });
  await expect(panel(page)).toContainText('Your ranking is paused. Here are your own records.');
  await expect(panel(page).locator('.rank-row:visible')).toHaveCount(0);
  expect(wins).toEqual([]);
});

test('the profile sheet: type a name, save → the new name in the panel; inside the cooldown the sheet says when and a frame still saves', async ({ page }) => {
  test.setTimeout(90_000);
  const pool = newPool('lad10');
  const [a] = await others(pool, [6]);
  await openApp(page, pool);
  await openSettings(page);
  await page.locator('[data-overlay="settings"] button.settings__ladder-name').click();
  const sheet = page.locator('.overlay[data-overlay="nickname"]');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  // UI batch (profile): a typed name (the server's nickname.freeText is on by default)
  const name = 'Captain Purr';
  await sheet.locator('input.nickname__input').fill(name);
  await sheet.locator('button.nickname__save').click();
  await expect(page.getByText('Profile saved.')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => overlays(page)).not.toContain('nickname');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.me?.name)).toBe(name);
  await closeAll(page);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  expect((await rowTexts(page)).find((r) => r.me === '1')?.name).toBe(name);
  expect((await (a as RankPlayer).bracket()).rows.find((r) => !r.me)?.nickname).toBe(name);
  await tapThrough(page);
  // Inside the server's cooldown the sheet says when up front, and a new name cannot be saved…
  await openSettings(page);
  await page.locator('[data-overlay="settings"] button.settings__ladder-name').click();
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet).toContainText('You can change your name again', { timeout: 10_000 });
  await sheet.locator('input.nickname__input').fill('Captain Purr 2');
  await expect(sheet.locator('button.nickname__save')).toHaveAttribute('aria-disabled', 'true');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.me?.name)).toBe(name);
  // …but a frame (no cooldown) saves, and the other players see it on my row.
  await sheet.locator('input.nickname__input').fill(name);
  await sheet.locator('[role="tab"][data-tab="frame"]').click();
  await sheet.locator('.nickname__frames [role="radio"][data-frame="1"]').click();
  await sheet.locator('button.nickname__save').click();
  await expect(page.getByText('Profile saved.')).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.me?.frameId)).toBe(1);
  expect((await (a as RankPlayer).bracket()).rows.find((r) => !r.me)?.frameId).toBe(1);
});

test('the web-prod path (no ranking origin, ?flags=-ladder ≡ ladder.web off): not one request to the ranking origin, /v1/config included; records everywhere', async ({ page }) => {
  test.setTimeout(90_000);
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(LADDER_URL)) seen.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await page.goto('/?ads=unsupported&flags=-ladder');
  await page.waitForFunction(() => !!(window as TestWindow).__mewdoku && (window as TestWindow).__mewdoku?.app().screen !== 'boot');
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(atLevel(20)));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await page.waitForTimeout(2_000); // boot step 8 (idle) has run
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.ladder?.()?.active)).toBe(false);
  const chip = page.locator('button.ladder-chip');
  await expect(chip).toHaveAttribute('data-state', 'records');
  await chip.click();
  const sheet = page.locator('.overlay[data-overlay="ladder"] .ladder-sheet[data-view="records"]');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  // Audit B3: the records sheet fits its content (a bottom sheet), never the full height with empty white below.
  await expect(sheet).toHaveAttribute('data-fit', '');
  await page.waitForTimeout(400); // the sheet's slide-in
  const fit = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const last = el.querySelector('.ladder-sheet__records-box')?.getBoundingClientRect() ?? r;
    return { h: r.height, vh: window.innerHeight, below: r.bottom - last.bottom };
  });
  expect(fit.h, 'records sheet height').toBeLessThan(fit.vh * 0.75);
  expect(fit.below, 'white below the records').toBeLessThan(120);
  await closeAll(page);
  await page.locator('.screen--home').getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
  await expect(page.locator('[data-overlay="settings"] .settings__ladder')).toBeHidden();
  await closeAll(page);
  await winNext(page);
  await expect(panel(page).locator('.rank-list[data-kind="records"]')).toBeVisible({ timeout: 15_000 });
  await expect(panel(page).locator('.ranking__title')).toHaveText('Your records'); // audit B4
  await tapThrough(page);
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.pending)).toEqual([]);
  expect(seen).toEqual([]);
});

test('a deletion on the server (an email request): the old token signs in once more as a fresh player; the old row never comes back', async ({ page }) => {
  // (Leaderboard update: that fresh player's sign-in joins the open ranking with 0 fish, as any sign-in does.)
  test.setTimeout(90_000);
  const pool = newPool('lad12');
  const [a] = await others(pool, [6]);
  await openApp(page, pool);
  await winNext(page);
  await expect(bracketList(page)).toBeVisible({ timeout: 15_000 });
  const oldCode = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.me?.code ?? '');
  await adminDelete(oldCode);
  await expect.poll(async () => (await (a as RankPlayer).bracket()).members, { timeout: 5_000 }).toBe(1);
  const sessions: string[] = [];
  page.on('request', (r) => {
    if (r.url() === `${LADDER_URL}/v1/session` && r.method() === 'POST') sessions.push('session');
  });
  // A heart with the old in-memory token → 401 → one sign-in again (a fresh player) → not a member any more.
  const heart = bracketList(page).locator('ol.rank-rows > li.rank-row[data-me="0"] button.rank-row__heart').first();
  await heart.click();
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.ladder.me?.code), { timeout: 10_000 }).not.toBe(oldCode);
  expect(sessions).toHaveLength(1);
  // Leaderboard update: the fresh player's sign-in joins the ranking at once (a new 0-fish row); the old row, with
  // its fish, never comes back, and the one heart the click sent (again, as the fresh player) counts at most once.
  const after = await (a as RankPlayer).bracket();
  expect(after.members).toBeLessThanOrEqual(2);
  expect(after.rows.filter((r) => !r.me).every((r) => r.points === 0)).toBe(true);
  expect(after.rows.find((r) => r.me)?.hearts ?? 0).toBeLessThanOrEqual(1);
});
