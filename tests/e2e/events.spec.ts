// Owner: C (Phase 2b). Phase 2c (G1): an event win adds its kept fish to this week's points and the
// post-win panel is the period board (D5, D7); milestones grant hints and kitties only (§5.5).
// A limited-time event end to end (phase2b §4.4, §4.5, §4.9) with the page's Date fixed inside our
// Lantern Walk (2026-11-13 → 2026-11-27 UTC): the Home card → the event screen (lazy events chunk) →
// "Play puzzle 1" → win → the weekly ranking panel (web: my records) → the victory shows 1 / 21 →
// back Home, where the card says 1 / 21 solved. Before the start the card teases; a locked player
// gets the "Opens after level 10" toast.
// Phase 2c.1 (G1, §3.3 D17, §10.8): event puzzles score level points with the same rule: the HUD
// counter shows during play and the victory shows the puzzle's total.
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import { periodKeyAt, pointsRuleFor, runTotal } from '../../src/game/scoring';
import type { SaveData } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const INSIDE = new Date('2026-11-14T12:00:00Z');
const BEFORE = new Date('2026-11-12T00:00:00Z'); // 24 h before the start: the teaser

const player = (level: number, patch: Partial<SaveData> = {}): SaveData => ({
  ...defaults(INSIDE.getTime() - 3 * 86_400_000),
  tutorialDone: true,
  sessions: 3,
  progress: { level, completed: level - 1, best: {} },
  ...patch,
});

async function open(page: Page, when: Date, save: SaveData): Promise<void> {
  await page.clock.setFixedTime(when);
  await page.goto('/?ads=unsupported');
  await page.waitForFunction(() => {
    const s = (window as TestWindow).__mewdoku?.app().screen;
    return s === 'home' || s === 'game';
  });
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
}

test('Lantern Walk: card → event screen → puzzle 1 → win → victory 1 / 21 → Home card 1 / 21', async ({ page }) => {
  await open(page, INSIDE, player(15));
  const card = page.locator('.event-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Lantern Walk');
  await expect(card).toContainText('0 / 21 solved');
  await card.click();

  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'event');
  const screen = page.locator('.screen--event');
  await expect(screen).toContainText('Lantern Walk');
  await expect(screen).toContainText('Light the way, one cat at a time.');
  await screen.getByRole('button', { name: 'Play puzzle 1' }).click();

  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  const id = await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.puzzle.id);
  expect(id).toBe('Elantern-walk-2026/0');
  const app = await page.evaluate(() => (window as TestWindow).__mewdoku?.app());
  expect(app?.session?.mode).toBe('event');
  // D17: the level-points counter shows on an event puzzle, from 0.
  const pts = page.locator('.pills .points-pill');
  await expect(pts).toBeVisible();
  await expect(pts).toHaveAttribute('aria-label', 'Level points: 0');
  const n = (await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.puzzle.n)) ?? 0;
  const total = runTotal(n, pointsRuleFor('event'));

  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  await expect(pts).toHaveAttribute('aria-label', `Level points: ${total.toLocaleString('en-US')}`);
  const saved = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save);
  expect(saved?.events['lantern-walk-2026']?.solved).toBe(1);
  expect(saved).not.toHaveProperty('wallet');
  // D5: the kept fish go to this (UTC) week's points: 2026-11-14 is in the week of Monday 2026-11-09.
  expect(saved?.period).toMatchObject({ key: periodKeyAt(INSIDE.getTime()), total: 3 });
  expect(periodKeyAt(INSIDE.getTime())).toBe('2026-11-09');
  expect(saved?.points.total).toBe(total); // 2c.1: the puzzle's total, added once (a counted win)
  expect(saved?.streak).toEqual({ current: 0, best: 0 }); // 2c.1: retired, never written

  // D7: the post-win panel is the period board in every mode; the event board stays on the event screen.
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel).toContainText('Weekly ranking');
  await expect(panel).toContainText('+3 fish');
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 3000 });
  await panel.locator('.ranking__tap').click();

  const victory = page.locator('[data-overlay="victory"]');
  await expect(victory).toBeVisible();
  await expect(victory).toContainText('1 / 21 solved');
  await expect(victory.locator('.victory__primary')).toHaveText(/Play puzzle 2/);
  await expect(victory.locator('.victory__kept')).toHaveAttribute('data-count', '3');
  await expect(victory.locator('.victory__points')).toHaveText(`${total.toLocaleString('en-US')} points`);
  await expect(victory.locator('.victory__streak')).toHaveCount(0);
  await victory.getByRole('button', { name: 'Home' }).click();

  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await expect(page.locator('.event-card')).toContainText('1 / 21 solved');
});

test('before the start: a teaser card that is not a button target; locked players get a toast', async ({ page }) => {
  await open(page, BEFORE, player(15));
  const card = page.locator('.event-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Starts in');
  await card.click({ force: true });
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().screen)).toBe('home');

  await open(page, INSIDE, player(8));
  await expect(page.locator('.event-card')).toContainText('Opens after level 10');
  await page.locator('.event-card').click();
  await expect(page.locator('.toast')).toContainText('Opens after level 10');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().screen)).toBe('home');
});

test('an event screen left open across the end: Play goes Home quietly, never an error toast (review L2B-4)', async ({ page }) => {
  const nearEnd = new Date('2026-11-26T23:57:00Z'); // Lantern Walk ends 2026-11-27T00:00Z
  // Every toast text shown on the page, whenever it was shown (a toast lasts only fx.toastMs).
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __toasts: string[] }).__toasts = seen;
    new MutationObserver(() => {
      for (const el of Array.from(document.querySelectorAll('.toast'))) {
        const text = el.textContent ?? '';
        if (text !== '' && !seen.includes(text)) seen.push(text);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.clock.install({ time: nearEnd });
  await page.goto('/?ads=unsupported');
  await page.waitForFunction(() => ['home', 'game'].includes((window as TestWindow).__mewdoku?.app().screen ?? ''));
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(player(15)));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await page.locator('.event-card').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'event');
  const play = page.locator('.screen--event').getByRole('button', { name: 'Play puzzle 1' });
  await expect(play).toBeVisible();
  await page.clock.fastForward(4 * 60_000); // the event ends while its screen is open
  await play.click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await page.waitForTimeout(600); // past the first toast's 150 ms settle delay (toast.ts)
  expect(await page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts)).toEqual([]); // never toast.error
  await expect(page.locator('.event-card')).toBeHidden(); // §4.4: after the end the card is gone
});

test('milestones grant hints and kitties only (phase2c §5.5): puzzle 3 → +2 hints, puzzle 7 → +2 hints, never fish', async ({ page }) => {
  const at = (solved: number): SaveData =>
    player(15, { events: { 'lantern-walk-2026': { solved, ms: solved * 60_000, lastAt: INSIDE.getTime() - 60_000 } }, stock: { hints: 1, kitties: 1 } });
  for (const [solved, reward] of [
    [2, { hints: 3, kitties: 1 }],
    [6, { hints: 3, kitties: 1 }],
    [15, { hints: 3, kitties: 2 }],
  ] as const) {
    await open(page, INSIDE, at(solved));
    await page.locator('.event-card').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'event');
    await page.locator('.screen--event').getByRole('button', { name: `Play puzzle ${solved + 1}` }).click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
    const saved = await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save);
    expect(saved?.stock, `milestone at ${solved + 1}`).toEqual(reward);
    expect(saved).not.toHaveProperty('wallet');
    const panel = page.locator('[data-overlay="ranking"]');
    await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 10_000 });
    await panel.locator('.ranking__tap').click();
    const victory = page.locator('[data-overlay="victory"]');
    await expect(victory).toContainText(reward.kitties > 1 ? '+1 kitty' : '+2 hints');
    await expect(victory).not.toContainText(/\+\d+ fish\b(?! ·)/);
  }
});
