// Owner: C (Phase 2b; was app)
// Layout at 320×568, 390×844 and 1280×800 (02 §19, 04 §11): no horizontal overflow, the board fully
// visible, and nothing interactive in the top-left FB safe zone (checked in every build; the zone
// only matters in fbig, but our layout keeps it clear everywhere). Also: the tutorial coach card
// never covers the board or the top bar and hides under the hint card (UX-01, UX-06, SPEC-04); a
// short desktop window (150-200 % zoom) plays without the rotate notice (UX-02, A11Y-1); keyboard
// play starts without a click (SPEC-01, A11Y-4), and a phone shows no focus ring until a key is used.
// Phase 2b (§3.6, §7): the mock banner's reserved band never overlaps the Home Level button or the
// victory's primary button (the e2e build's ?ads= mock banner follows the FB rules), and a keyboard
// alone gets through the win flow (Enter on the panel, Enter on "Level N") and the shop.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import type { LevelPack } from '../../src/engine/types';
import { defaults } from '../../src/game/save';
import type { SaveData } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const SAFE_ZONE = 64;
const LEVELS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/data/levels');
const PACK_000 = resolve(LEVELS_DIR, 'pack-000.json');

async function boot(page: Page, save?: SaveData): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
  if (save) {
    await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
    await page.reload();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  }
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(width);
}

async function boardVisible(page: Page): Promise<void> {
  const cells = page.locator('.cell');
  const count = await cells.count();
  expect(count).toBeGreaterThan(0);
  const vp = page.viewportSize();
  if (!vp) throw new Error('no viewport');
  for (const i of [0, count - 1]) {
    const box = await cells.nth(i).boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  }
}

async function safeZoneClear(page: Page): Promise<void> {
  const hits = await page.evaluate((zone) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('[hidden]')) continue;
      if (r.left < zone && r.top < zone) out.push(el.className || el.tagName);
    }
    return out;
  }, SAFE_ZONE);
  expect(hits).toEqual([]);
}

test('tutorial board fits', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(400);
  await noHorizontalOverflow(page);
  await boardVisible(page);
  await safeZoneClear(page);
});

/** The largest board in the bundled pack (content may regenerate it, so read it at test time). */
function largestBundledLevel(): { level: number; n: number } {
  const pack = JSON.parse(readFileSync(PACK_000, 'utf8')) as LevelPack;
  let best = { level: 2, n: 0 };
  pack.levels.forEach((rec, k) => {
    const level = rec.i ?? pack.first + k;
    if (level >= 2 && rec.n > best.n) best = { level, n: rec.n };
  });
  return best;
}

test('home and the largest bundled board fit', async ({ page }) => {
  const { level, n } = largestBundledLevel();
  await boot(page, { ...defaults(Date.now()), tutorialDone: true, progress: { level, completed: level - 1, best: {} } });
  await noHorizontalOverflow(page);
  await safeZoneClear(page);
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.puzzle.n ?? 0)).toBe(n);
  await noHorizontalOverflow(page);
  await boardVisible(page);
  await safeZoneClear(page);
});

/** The first 12×12 level of the shipped packs (02 §18: the smallest cells the format allows). */
function first12(): number {
  for (let k = 1; k <= 9; k++) {
    const pack = JSON.parse(readFileSync(resolve(LEVELS_DIR, `pack-${String(k).padStart(3, '0')}.json`), 'utf8')) as LevelPack;
    const rec = pack.levels.find((r) => r.n === 12);
    if (rec) return rec.i ?? pack.first;
  }
  throw new Error('no 12×12 level shipped');
}

test('a 12×12 board (fetched pack) fits with whole cells', async ({ page }) => {
  const level = first12();
  await boot(page, { ...defaults(Date.now()), tutorialDone: true, progress: { level, completed: level - 1, best: {} } });
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.puzzle.n ?? 0)).toBe(12);
  await noHorizontalOverflow(page);
  await boardVisible(page);
  await safeZoneClear(page);
  // 02 §18: about 26 px cells on a 360 px phone; never below 22 px at the 320 px minimum.
  const box = await page.locator('.cell').first().boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(22);
});


type Box = { top: number; bottom: number; visible: boolean };

async function box(page: Page, sel: string): Promise<Box | null> {
  return page.evaluate((q) => {
    const e = document.querySelector(q);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, visible: getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]') };
  }, sel);
}

/** The coach card is clear of the board and the top bar (1 px of rounding allowed). */
async function coachClear(page: Page, step: string): Promise<void> {
  await page.waitForTimeout(450); // the card's text settles, then it is placed
  const card = await box(page, '.coach__card');
  const board = await box(page, '.board');
  const bar = await box(page, '.screen--game .top-bar');
  if (!card || !board || !bar) throw new Error(`missing boxes at ${step}`);
  const overlap = (a: Box, b: Box): number => Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  expect(overlap(card, board), `${step}: card over the board`).toBeLessThanOrEqual(1);
  expect(overlap(card, bar), `${step}: card over the top bar`).toBeLessThanOrEqual(1);
}

async function dblCell(page: Page, i: number): Promise<void> {
  await page.locator('.cell').nth(i).dblclick();
  await page.waitForTimeout(350);
}

test('the tutorial coach never covers the board or the top bar, and steps aside for the hint card', async ({ page }) => {
  await boot(page);
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await coachClear(page, 'step 1');
  await dblCell(page, 1);
  await coachClear(page, 'step 2');
  await page.getByRole('button', { name: 'Got it' }).click();
  await coachClear(page, 'step 3');
  const a = await page.locator('.cell').nth(4).boundingBox();
  const b = await page.locator('.cell').nth(6).boundingBox();
  if (!a || !b) throw new Error('no board');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await coachClear(page, 'step 4');
  await dblCell(page, 7);
  await coachClear(page, 'step 5');
  // The bulb's ring stays on screen (UX-11).
  const ring = await box(page, '.coach__ring');
  const vp = page.viewportSize();
  expect(ring && vp ? ring.bottom : Infinity).toBeLessThanOrEqual((vp?.height ?? 0) - 4);
  // Step 5 accepts Apply only: the hint card has no ×, and the stale coach card, hand and ring hide.
  await page.locator('.tool--bulb').click();
  await expect(page.locator('.overlay[data-overlay=hint] .hint-card__apply')).toBeVisible();
  await expect(page.locator('.overlay[data-overlay=hint] .overlay__close')).toBeHidden();
  for (const sel of ['.coach__card', '.coach__hand', '.coach__ring']) expect((await box(page, sel))?.visible, sel).toBe(false);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.coach__card')).toBeVisible(); // step 6
});

test('a short desktop window (a 200 % zoomed browser) plays without the rotate notice', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-1280', 'desktop (fine pointer) only');
  const level = first12();
  await boot(page, { ...defaults(Date.now()), tutorialDone: true, progress: { level, completed: level - 1, best: {} } });
  await page.setViewportSize({ width: 640, height: 360 });
  await page.waitForTimeout(200);
  await expect(page.locator('.rotate-notice')).toBeHidden();
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await noHorizontalOverflow(page);
  // The column keeps the 568 px minimum and the page scrolls: whole cells of at least 24 px.
  const cell = await page.locator('.cell').first().boundingBox();
  expect(cell?.width ?? 0).toBeGreaterThanOrEqual(24);
  await page.locator('.cell').last().scrollIntoViewIfNeeded();
  await page.locator('.cell').last().click();
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.status)).toBe('playing');
});

test('keyboard play starts without a click: focus lands on the board, H opens a hint', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-1280', 'desktop keyboard only');
  await boot(page, { ...defaults(Date.now()), tutorialDone: true, progress: { level: 12, completed: 11, best: {} } });
  await page.locator('.home__play').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await expect(page.locator('.cell:focus')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cell[data-i="1"]')).toBeFocused();
  await page.locator('.top-bar__btn--settings').focus();
  await page.keyboard.press('h');
  await expect(page.locator('.overlay[data-overlay=hint] .hint-card__apply')).toBeVisible();
});

test('a phone starting the tutorial: the board has focus but shows no ring until a key is pressed', async ({ page }, info) => {
  test.skip(info.project.name === 'web-1280', 'touch-first (coarse pointer) only; desktops always show the ring');
  await boot(page);
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  const focused = page.locator('.cell:focus');
  await expect(focused).toHaveCount(1); // A11Y-4: focus is on the board, not on <body>
  const ring = (): Promise<string> => page.evaluate(() => getComputedStyle(document.querySelector('.cell:focus .cell__tile') as Element).boxShadow);
  expect(await ring()).toBe('none');
  await page.keyboard.press('ArrowDown'); // row 2, column 1: no coach highlight there
  await expect(page.locator('.cell[data-i="4"]')).toBeFocused();
  expect(await ring()).toContain('rgb(185, 82, 10)'); // --focus ring (#B9520A, phase2b §1.4) once the keyboard is in use
});

// ── phase2b: banner reserve (§3.6) and keyboard through the win flow and the shop (§7) ──

const veteranSave = (level = 15, patch: Partial<SaveData> = {}): SaveData => ({
  ...defaults(Date.now() - 3 * 86_400_000),
  tutorialDone: true,
  progress: { level, completed: level - 1, best: {} },
  ...patch,
});

async function bannerTop(page: Page): Promise<number> {
  const bar = page.locator('[data-testid="mock-banner"]');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  if (!box) throw new Error('no banner');
  return box.y;
}

/** The element's bottom sits at least ads.banner.buttonClearancePx (16) above the banner. */
async function clearOfBanner(page: Page, selector: string): Promise<void> {
  const top = await bannerTop(page);
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no ${selector}`);
  expect(box.y + box.height).toBeLessThanOrEqual(top - 16 + 0.5);
}

test('the banner reserve never overlaps the Home Level button', async ({ page }) => {
  await boot(page, veteranSave());
  await expect(page.locator('.screen--home')).toHaveAttribute('data-banner', '');
  await clearOfBanner(page, '.home__play');
  await noHorizontalOverflow(page);
});

test('the banner reserve never overlaps the victory screen\'s primary button', async ({ page }) => {
  await boot(page, veteranSave());
  // Home showed a banner; the victory needs the 60 s reload window to pass, so start from a fresh page
  // straight into a level (no Home banner first): Play is pressed before any banner can load.
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await expect(page.locator('[data-testid="mock-banner"]')).toHaveCount(0); // never during play
  await page.clock.install();
  await page.clock.fastForward(61_000);
  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  await page.clock.runFor(5000);
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-testid="mock-banner"]')).toHaveCount(0); // not on the ranking panel
  await page.clock.runFor(1500);
  await panel.locator('.ranking__tap').click();
  await page.clock.runFor(1000);
  await expect(page.locator('.victory')).toHaveAttribute('data-banner', '');
  await clearOfBanner(page, '.victory__primary');
  await noHorizontalOverflow(page);
});

test('keyboard only: Enter continues the panel, Enter on "Level N", and the shop swaps with the keyboard', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-1280', 'desktop keyboard only');
  await boot(page, veteranSave(5, { wallet: { fish: 40, earned: 40 }, stock: { hints: 0, kitties: 3 } }));
  await page.locator('.home__play').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 3000 });
  await expect(panel.locator('.ranking__tap')).toBeFocused();
  await page.keyboard.press('Enter');
  const primary = page.locator('[data-overlay="victory"] .victory__primary');
  await expect(primary).toBeEnabled({ timeout: 3000 });
  await primary.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.puzzle.id === 'L6');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  // Home → the fish pill "+" → the shop, all by keyboard.
  await page.locator('.top-bar').getByRole('button', { name: 'Home' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  const plus = page.locator('.screen--home .fish-pill__plus'); // the game screen may still be fading out
  await plus.focus();
  await expect(plus).toBeFocused();
  await page.keyboard.press('Enter');
  const shop = page.locator('[data-overlay="shop"]');
  await expect(shop).toBeVisible();
  await shop.locator('.shop__row[data-item="hint"] .shop__swap').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.stock.hints)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(shop).toBeHidden();
});

// ── 2b review fixes (R): A11Y-FOCUS-1 — focus is never lost through a screen change (spec §7) ──

test('keyboard only: focus moves into every new screen (event card → event, event Home → Home, victory Home → Home)', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-1280', 'desktop keyboard only');
  // Inside our Lantern Walk (2026-11-13 → 27 UTC), so Home has the event card.
  await page.clock.setFixedTime(new Date('2026-11-14T12:00:00Z'));
  await boot(page, veteranSave(15));
  const focusIn = (sel: string): Promise<boolean> =>
    page.evaluate((s) => {
      const a = document.activeElement;
      return !!a && a !== document.body && !!a.closest(s) && !a.closest('[inert]');
    }, sel);
  // No .focus() after a navigation: only the control about to be pressed is focused, before it.
  await page.locator('.event-card').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'event');
  await expect(page.locator('.event__play')).toBeFocused(); // its [data-autofocus] (was: <body>)
  await page.locator('.screen--event .event__home').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await expect.poll(() => focusIn('.screen--home')).toBe(true); // was: <body>
  // A level, won, then Home from the victory screen.
  await page.locator('.home__play').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 10_000 });
  await page.keyboard.press('Enter');
  const home = page.locator('[data-overlay="victory"] .victory__home');
  await expect(home).toBeVisible();
  await home.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await expect.poll(() => focusIn('.screen--home')).toBe(true); // was: <body>
  // And Tab goes on from there inside Home, not from the top of the document.
  await page.keyboard.press('Tab');
  expect(await focusIn('.screen--home')).toBe(true);
});
