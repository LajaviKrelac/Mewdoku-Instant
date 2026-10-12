// Owner: lead (preview link, 2026-10-11; scripts/preview-mode.ts, preview/). The owner's preview link end to end, in its
// own project (preview-390) against dist/preview-e2e: the preview-link build with the usual __E2E__ hooks (the shipped
// link, dist/preview, has none). Driven through the preview menu like the owner would, it checks every Phase 2e
// feature the plain web build hides: the returning player's Home (streak day 6 of 7, the daily unlocked, the ranking
// chip), the banner during a level, the ranking panel after a win with "Preview: sample players", the day-7 reward on
// the victory, an interstitial after the level (only once the real pacing rules allow one: the session's first 60 s
// pass on Playwright's clock), the out-of-helpers card with the video and the Buy rows, a mock purchase granting +15
// hints through the real ledger, a rewarded video granting a kitty, the end of the ranking day with the result card
// and Collect ×2, the ranking sheet's hearts and the name sheet, and a new player's tutorial.
// PREVIEW_SHOTS=<dir> also writes a screenshot of each feature there (for a person to look at, never compared).
// 2026-10-12 (D-2e-24, design §11, §12.5): the other players are the server's computer players (rivals on in the preview
// config), so the counts, the fish and the places around the player come from the sample server's answers, never fixed
// numbers: a full ranking of 46–50 rows, "#5 of N" on Home, "#2 of N" on the result card, and the info view's
// "Rankings include computer players.".
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { cfg } from '../../src/app/config';
import type { AppState } from '../../src/app/store';
import type { PreviewOp } from '../../preview/ribbon';
import { watchStrings } from './helpers/strings';

watchStrings(test);

type TestWindow = Window & { __mewdoku?: E2EHooks };

const SHOTS = process.env.PREVIEW_SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

const app = (page: Page): Promise<AppState> => page.evaluate(() => (window as TestWindow).__mewdoku!.app());
const overlays = async (page: Page): Promise<string[]> => [...(await app(page)).overlays];
async function onScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction((s) => (window as TestWindow).__mewdoku?.app().screen === s, screen, { timeout: 20_000 });
}

const ribbon = (page: Page) => page.locator('.mwp-ribbon');
const banner = (page: Page) => page.locator('[data-testid="mock-banner"]');
const mockAd = (page: Page, kind: 'interstitial' | 'rewarded') => page.locator(`.mwp-ad[data-kind="${kind}"]`);
const o2 = (page: Page) => page.locator('.overlay[data-overlay="rewarded"]');
const panel = (page: Page) => page.locator('.overlay[data-overlay="ranking"]');

async function hideMenu(page: Page): Promise<void> {
  if ((await ribbon(page).getAttribute('data-open')) === '1') await page.locator('.mwp-menu__hide').click();
  await expect(page.locator('.mwp-menu')).toBeHidden();
}

/** A menu shortcut: the page reloads with ?preview=<op>, applied before the game loads. */
async function shortcut(page: Page, op: PreviewOp, screen = 'home'): Promise<void> {
  if ((await ribbon(page).getAttribute('data-open')) !== '1') await page.locator('.mwp-ribbon__tab').click();
  const loaded = page.waitForEvent('load');
  await page.locator(`.mwp-menu__op[data-op="${op}"]`).click();
  await loaded;
  await onScreen(page, screen);
  expect(new URL(page.url()).searchParams.has('preview')).toBe(false); // applied once, then dropped from the address
}

async function startLevel(page: Page): Promise<void> {
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', undefined, { timeout: 15_000 });
}

/** The ranking panel, then the victory screen. */
async function toVictory(page: Page): Promise<void> {
  const tap = panel(page).locator('.ranking__tap');
  await expect(tap).toBeEnabled({ timeout: 15_000 });
  await expect(async () => {
    await tap.click({ timeout: 1_000 });
    await expect(tap).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator('[data-overlay="victory"]')).toBeVisible({ timeout: 10_000 });
}

test.describe('the preview link (dist/preview-e2e)', () => {
  test('first visit = the returning player: menu, Home (streak day 6 of 7, daily unlocked, chip), banner in the level, the panel with sample players, the day-7 reward, then an interstitial', async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await page.goto('/');
    await onScreen(page, 'home');
    // The menu opens by itself on the first visit, says what it is and when it was built.
    await expect(ribbon(page)).toHaveAttribute('data-open', '1');
    await expect(page.locator('.mwp-menu')).toContainText('Preview build');
    await expect(page.locator('.mwp-menu__now')).toContainText('Returning player');
    await expect(page.locator('.mwp-menu__op')).toHaveCount(5);
    await expect(page.locator('.mwp-menu__built')).toContainText(/^Built \d{4}-\d\d-\d\d \d\d:\d\d UTC/);
    await shot(page, '01-menu-first-visit');
    await hideMenu(page);
    await expect(page.locator('.mwp-ribbon__tab')).toBeVisible();

    // Home: the seeded returning player.
    const s0 = (await app(page)).save;
    expect(s0.progress.level).toBe(37);
    expect(s0.stock).toEqual({ hints: 3, kitties: 2 });
    await expect(page.locator('.screen--home .streak-pill')).toHaveText('6');
    await expect(page.locator('.screen--home .streak-pill')).toHaveAttribute('aria-label', 'Streak: day 6 of 7. Solve a puzzle today for day 7.');
    await expect(page.locator('.screen--home .daily-card')).not.toHaveAttribute('data-state', 'locked');
    await expect(page.locator('.screen--home .daily-card')).toHaveAttribute('data-state', 'not_played');
    // The ranking chip from the sample server's bracket (5th among its computer players): 2026-10-12 (01 row 7.1.7) its
    // dark pill shows the time left (hh:mm:ss, ticking); rank and fish are in its name.
    const chip = page.locator('.screen--home button.ladder-chip');
    await expect(chip).toHaveAttribute('aria-label', /^Daily ranking: #5 of \d+, \d+ fish\. Ends in /, { timeout: 10_000 });
    // The server's numbers behind it (save.ladder.current): 5 h in, every computer player has arrived (46–50 rows).
    const day = (await app(page)).save.ladder.current;
    expect(day?.rank).toBe(5);
    expect(day?.members).toBeGreaterThanOrEqual(46);
    expect(day?.members).toBeLessThanOrEqual(50);
    await expect(chip).toHaveAttribute('aria-label', new RegExp(`^Daily ranking: #5 of ${day?.members}, ${day?.points} fish\\. `));
    await expect(chip.locator('.ladder-chip__time')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(chip.locator('.ladder-chip__points')).toBeHidden();
    await page.waitForTimeout(600);
    await shot(page, '02-home-returning');

    // Level 37: the banner during play, labelled.
    await startLevel(page);
    await expect(banner(page)).toBeVisible({ timeout: 10_000 });
    await expect(banner(page)).toHaveText('Preview ad · banner');
    await page.waitForTimeout(800);
    await shot(page, '03-level-banner');

    // Past the session's first 60 s (no interstitial before) and the size's solve floors, then the win.
    await page.clock.fastForward((cfg.ads.interstitial.sessionGraceSec + 5) * 1000);
    expect(await page.evaluate(() => (window as TestWindow).__mewdoku!.solve())).toBe(true);
    // The ranking panel: the sample server's bracket, labelled as sample players, my row with my fish.
    const list = panel(page).locator('.rank-list[data-kind="bracket"]');
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(list.locator('.mwp-note')).toHaveText('Preview: sample players');
    // Every row the server returned (its members: the player and the computer players), my row with my new total.
    const members = (await app(page)).save.ladder.current?.members ?? 0;
    expect(members).toBeGreaterThanOrEqual(46);
    expect(members).toBeLessThanOrEqual(50);
    await expect(list.locator('ol.rank-rows > li.rank-row')).toHaveCount(members);
    const mine = list.locator('ol.rank-rows > li.rank-row[data-me="1"] .rank-row__points');
    const kept = (await app(page)).game?.hearts ?? 0;
    await expect(mine).toContainText(String((day?.points ?? 0) + kept));
    await page.waitForTimeout(900);
    await shot(page, '04-ranking-panel-sample-players');

    // The victory: the streak's day 7 and its reward (2 hints + 2 kitties).
    await toVictory(page);
    const streak = page.locator('[data-overlay="victory"] .victory__streak');
    await expect(streak.locator('.victory__streak-text')).toHaveText('Streak: day 7 of 7');
    await expect(streak.locator('.victory__streak-reward')).toContainText('2');
    expect((await app(page)).save.dayStreak.run).toBe(7);
    expect((await app(page)).save.stock).toEqual({ hints: 3 + 2, kitties: 2 + 2 });
    await page.waitForTimeout(900);
    await shot(page, '05-victory-day7-reward');

    // Next level → the real pacing rules allow an interstitial (37 levels done, past the grace, no ad yet).
    await page.locator('[data-overlay="victory"]').getByRole('button', { name: 'Level 38' }).click();
    const ad = mockAd(page, 'interstitial');
    await expect(ad).toBeVisible({ timeout: 10_000 });
    await expect(ad).toContainText('Preview ad');
    await expect(ad.locator('.mwp-ad__close')).toBeDisabled();
    await shot(page, '06-interstitial');
    await page.clock.fastForward(2_100);
    await expect(ad.locator('.mwp-ad__close')).toBeEnabled();
    await ad.locator('.mwp-ad__close').click();
    await expect(ad).toHaveCount(0);
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.puzzle.id === 'L38', undefined, { timeout: 15_000 });
  });

  test('Out of helpers: O2 with the video and the Buy rows; a mock purchase → +15 hints (one used at once) through the ledger; a rewarded video → a kitty', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await onScreen(page, 'home');
    await shortcut(page, 'outOfHelpers');
    await expect(page.locator('.mwp-menu__now')).toContainText('Out of helpers');
    expect((await app(page)).save.stock).toEqual({ hints: 0, kitties: 0 });
    await startLevel(page);

    // The out-of-hints card: Watch video, Buy 15 hints · $1.99, Buy No Ads · $3.99.
    await page.getByRole('button', { name: /^Hint\b/ }).click();
    await expect(o2(page)).toBeVisible();
    await expect(o2(page).locator('.rewarded__accept')).toHaveText(/Watch video/);
    const buy = o2(page).locator('button.rewarded__buy[data-product="hints_15"]');
    await expect(buy).toHaveAttribute('data-state', 'ready', { timeout: 8_000 });
    await expect(buy).toContainText('$1.99');
    await expect(o2(page).locator('button.rewarded__buy[data-product="remove_ads"]')).toContainText('$3.99');
    await page.waitForTimeout(500);
    await shot(page, '07-out-of-helpers-card');

    // Buy → the preview's purchase sheet → Buy → +15 through the consume-first ledger, one hint used at once.
    await buy.click();
    const sheet = page.locator('.mwp-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Preview purchase — nothing is charged');
    await expect(sheet).toContainText('15 hints');
    await expect(sheet).toContainText('$1.99');
    await shot(page, '08-mock-purchase-sheet');
    await sheet.getByRole('button', { name: 'Buy · $1.99' }).click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await app(page)).save.stock.hints, { timeout: 8_000 }).toBe(14);
    const s = (await app(page)).save;
    expect(s.purchases.tokens.some((t) => /^hints_15\|preview-/.test(t))).toBe(true);
    expect(s.purchases.pending).toEqual([]);
    await expect(page.locator('.overlay[data-overlay="hint"]')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mewdoku.preview.purchases.v1') ?? '[]'))).toEqual([]); // consumed
    await page.waitForTimeout(400);
    await shot(page, '09-hint-after-purchase');
    await page.keyboard.press('Escape');
    await expect.poll(() => overlays(page)).not.toContain('hint');

    // The kitty at 0: the card → Watch video → the preview's rewarded video (3 s) → +1 kitty, used at once.
    const usedBefore = (await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.kittiesUsed)) ?? 0;
    await page.getByRole('button', { name: /^Kitty\b/ }).click();
    await expect(o2(page)).toBeVisible();
    await expect(o2(page).locator('button.rewarded__buy[data-product="kitties_8"]')).toContainText('$1.99');
    await o2(page).locator('.rewarded__accept').click();
    const video = mockAd(page, 'rewarded');
    await expect(video).toBeVisible();
    await expect(video).toContainText('Preview ad');
    await expect(video).toContainText('Watch to get 1 kitty');
    await shot(page, '10-rewarded-video');
    await expect(video).toHaveCount(0, { timeout: 8_000 });
    await expect.poll(async () => (await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.kittiesUsed)) ?? 0, { timeout: 8_000 }).toBe(usedBefore + 1);
    expect((await app(page)).save.stock.kitties).toBe(0);
  });

  test('End ranking day: the result card (2nd, the sample ranking) → Collect ×2 plays the video → +2 hints, +2 kitties once', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await onScreen(page, 'home');
    const before = (await app(page)).save.stock;
    await shortcut(page, 'endDay');
    const card = page.locator('.overlay[data-overlay="ladder_result"]');
    await expect(card).toHaveAttribute('data-case', 'paid', { timeout: 15_000 });
    await expect(card).toContainText(/You finished #2 of \d+\./);
    await expect(card.locator('.mwp-note')).toHaveText('Preview: sample ranking');
    const double = card.locator('button.ladder-result__double');
    await expect(double).toHaveText(/Collect ×2/);
    await page.waitForTimeout(500);
    await shot(page, '11-result-card-collect-x2');
    await double.click();
    await expect(mockAd(page, 'rewarded')).toBeVisible();
    await expect(mockAd(page, 'rewarded')).toContainText('Watch to double your ranking reward');
    await expect.poll(async () => (await app(page)).save.stock, { timeout: 15_000 }).toEqual({ hints: before.hints + 2, kitties: before.kitties + 2 });
    await expect.poll(() => overlays(page)).not.toContain('ladder_result');
    expect((await app(page)).save.ladder.claimed).toHaveLength(1);
    // A reload shows no second card and grants nothing again.
    await page.reload();
    await onScreen(page, 'home');
    await page.waitForTimeout(2_000);
    expect(await overlays(page)).not.toContain('ladder_result');
    expect((await app(page)).save.stock).toEqual({ hints: before.hints + 2, kitties: before.kitties + 2 });
  });

  test('the ranking sheet from the chip: sample players labelled, a heart, and the name sheet', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await onScreen(page, 'home');
    await hideMenu(page);
    // Once the first bracket answer is in (a sheet opened before it keeps the join line: the ladder flow does not
    // re-render an open sheet when that answer lands).
    await expect(page.locator('.screen--home button.ladder-chip')).toHaveAttribute('aria-label', /, \d+ fish\./, { timeout: 10_000 });
    await page.waitForFunction(() => localStorage.getItem('mewdoku.ladder.rows.v1') !== null, undefined, { timeout: 10_000 });
    await page.locator('.screen--home button.ladder-chip').click();
    const sheet = page.locator('.overlay[data-overlay="ladder"]');
    const list = sheet.locator('.rank-list[data-kind="bracket"]');
    await expect(list).toBeVisible({ timeout: 10_000 });
    await expect(list.locator('.mwp-note')).toHaveText('Preview: sample players');
    // 2026-10-12 (D-2e-24, H-9): the info view says the ranking includes computer players; Back returns to the list.
    await sheet.locator('button.ladder-sheet__info').click();
    await expect(sheet.locator('ul.ladder-info')).toContainText('Rankings include computer players.');
    await sheet.locator('button.overlay__back').click();
    await expect(list).toBeVisible();
    // A heart on a sample row (a computer player): +1 and pressed.
    const other = list.locator('ol.rank-rows > li.rank-row[data-me="0"]').first();
    const heart = other.locator('button.rank-row__heart');
    const n0 = Number((await heart.locator('.rank-row__hearts').textContent())?.replace(/\D+/g, '') || '0');
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
    await expect(heart.locator('.rank-row__hearts')).toHaveText(String(n0 + 1));
    await page.waitForTimeout(400);
    await shot(page, '12-ranking-sheet-heart');
    // My row's pencil → the name sheet → a new name, saved by the sample server.
    await list.locator('ol.rank-rows > li.rank-row[data-me="1"] button.rank-row__edit').click();
    const nick = page.locator('.overlay[data-overlay="nickname"]');
    await expect(nick).toBeVisible({ timeout: 10_000 });
    await nick.locator('select.nickname__adj').selectOption({ index: 3 });
    await nick.locator('select.nickname__noun').selectOption({ index: 5 });
    await nick.locator('input.nickname__num').fill('42');
    const adj = (await nick.locator('select.nickname__adj option:checked').textContent())?.trim() ?? '';
    const noun = (await nick.locator('select.nickname__noun option:checked').textContent())?.trim() ?? '';
    await shot(page, '13-name-sheet');
    await nick.locator('button.nickname__save').click();
    await expect(page.getByText('Name saved.')).toBeVisible({ timeout: 10_000 });
    expect((await app(page)).save.ladder.me?.name).toBe(`${adj} ${noun} 42`);
  });

  test('New player: a fresh save starts the tutorial; Reset brings the returning player back', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await onScreen(page, 'home');
    await shortcut(page, 'new', 'game');
    const st = await page.evaluate(() => (window as TestWindow).__mewdoku?.state());
    expect(st?.mode).toBe('tutorial');
    expect((await app(page)).save.tutorialDone).toBe(false);
    await expect(page.locator('.mwp-ribbon__tab')).toBeVisible();
    await page.waitForTimeout(1_200);
    await shot(page, '14-new-player-tutorial');
    await shortcut(page, 'reset');
    expect((await app(page)).save.progress.level).toBe(37);
    await expect(ribbon(page)).toHaveAttribute('data-open', '1');
  });
});
