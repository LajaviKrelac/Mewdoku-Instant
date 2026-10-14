// Owner: C (Phase 2b; was app)
// Layout at 320×568, 390×844 and 1280×800 (02 §19, 04 §11): no horizontal overflow, the board fully
// visible, and nothing interactive in the top-left FB safe zone (checked in every build; the zone
// only matters in fbig, but our layout keeps it clear everywhere). Also: the tutorial coach card
// never covers the board or the top bar and hides under the hint card (UX-01, UX-06, SPEC-04); a
// short desktop window (150-200 % zoom) plays without the rotate notice (UX-02, A11Y-1); keyboard
// play starts without a click (SPEC-01, A11Y-4), and a phone shows no focus ring until a key is used.
// Phase 2b (§3.6, §7): the mock banner's reserved band never overlaps the Home Level button or the
// victory's primary button (the e2e build's ?ads= mock banner follows the FB rules), and a keyboard
// alone gets through the win flow (Enter on the panel, Enter on "Level N") and Settings.
// Phase 2c (G1, §5.2): the web build has no shop (no Home "+", no Settings Shop row), so the
// keyboard shop part became "Settings by keyboard shows no Shop row"; the FB shop is fbig.spec's (G3).
// Phase 2c.1 (G1, fish-lives-spec §10.2, §10.8): on level 310 (12×12) with 11 cats and 11,616 points
// (the widest cat counter and a 5-digit total) the cat counter, the points counter and the lives pill
// never overlap and stay inside the pills row, with the points counter centred; during the win flow
// the period counter (in the cat counter's place) never overlaps the points counter; the counter is
// not focusable.
// Phase 2d (G1, docs/phase2d/look-spec.md §1.1, §1.16, §5.3): the game screen is the measured top-down
// stack (bar, pills, rules, board, tools, then the banner band): every row inside the viewport, in
// that order, never overlapping, the board centred, at 320 × 568, 360 × 640, 390 × 844, 1280 × 800 and
// with 2× text; 12 × 12 keeps whole cells, also at 320 × 568 with a 20 px safe top and the band (slot
// ≥ 21); every round button keeps a 44 × 44 hit area (elementFromPoint at its corners); the banner and
// the helpers never overlap; Tab goes back → gear → board → kitty → bulb → mouse. On the web the game
// screen's back disc sits where the original's is (top left): the FB safe zone is checked on Home here
// and on the game screen in the FBIG build (fbig.spec.ts). The 2c.1 pills test now checks the heads
// pill, the fish pill and the bar's Score column.
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §3.2, §4.8, §7.7): the hint card covers the rules row
// below the bar and above the board, Apply sits under the board fully on screen and above the band
// (320 × 568, 390 × 844, 1280 × 800, with and without the band); the "+N" and the "Done!" labels stay
// inside the viewport for a cat in each corner tile; in German at 320 × 568 with the band (and with 2×
// text) the card stays below the bar and off the board, scrolling inside when its text cannot fit.
// Phase 2e (G1, docs/phase2e/spec.md §10.3 layout, critic C-35): at 320 × 568, with and without the band,
// in English and German: Home with the ranking chip, the streak strip, the daily card and the event card
// (nothing overlaps, Play on screen without scrolling); the post-win panel with 50 real rows (a test pool
// on the dev server) scrolls inside its card, no page overflow, the footer button on screen, every heart
// a 44 × 44 hit area; the result card and the name sheet (12 avatars, both pickers, Save) fit or scroll
// inside their dialogs. The web Home's ranking chip is a button at the bar's inline start: the FB safe
// zone matters only in the FBIG build, where the chip sits after the zone (fbig.spec.ts checks it).
// D-2e-25 (2026-10-14, ads.banner.collapseWhenEmpty): with ?ads=nofill Home reserves its band for the load and gives
// it back on the mock's no_fill answer, and the board opened next mounts without the band (data-play-band="0").
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import type { LevelPack } from '../../src/engine/types';
import { defaults } from '../../src/game/save';
import { pointsRuleFor, runTotal } from '../../src/game/scoring';
import type { InProgressV2, SaveData } from '../../src/game/types';
import { devAdvance, devCron, fillPool, LADDER_URL, ladderUp, newPool } from './helpers/rank-players';
import { watchStrings } from './helpers/strings';
import { gotItNewRanking, settleHome } from './helpers/new-ranking';
import { continueStreak, keepStreakScreen } from './helpers/streak-screen';

// Phase 2e I-4: no screen of these tests may ask for an English string that no loaded table has.
watchStrings(test);
// Leaderboard update: the "New ranking" card is closed with Got it whenever it shows.
gotItNewRanking(test);
continueStreak(test); // UI batch (2026-10-13): Continue on the Daily Streak screen after the day's first win

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
    // Leaderboard update: the sign-in joins a ranking; its "New ranking" card is closed before Home is measured.
    await settleHome(page);
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

/**
 * Nothing interactive in the top-left 64 × 64. Phase 2d: on the web the game screen's back disc sits
 * where the original's does (the FB shift is FBIG-only, look-spec §1.1), so the game screen is skipped
 * here (fbig.spec.ts checks it in the FBIG build).
 */
async function safeZoneClear(page: Page): Promise<void> {
  const hits = await page.evaluate((zone) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]'))) {
      if (el.closest('.screen--game')) continue;
      // Phase 2e (spec §2.5): the ranking chip was the web bar's lead button; since the Home layout of 2026-10-11 the
      // profile picture is (FBIG shifts the lead slot past the zone).
      if ((el.classList.contains('ladder-chip') || el.classList.contains('home__profile')) && document.getElementById('app')?.dataset.platform !== 'fbig') continue;
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
  // 02 §18 / look-spec §1.1: never below 22 px at the 320 px minimum (with the banner band: slot 22).
  const box = await page.locator('.cell').first().boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(22 - 0.5);
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
  // 2d.1 §3.2, §3.5: the Apply pill; no visible close control (in the tutorial none at all).
  await expect(page.locator('.overlay[data-overlay=hint] button.hint-apply')).toBeVisible();
  await expect(page.locator('.overlay[data-overlay=hint] .overlay__close, .overlay[data-overlay=hint] .hint-close')).toBeHidden();
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
  // The column keeps the 568 px minimum and the page scrolls: whole cells of at least 22 px (2d §1.1:
  // a 12 × 12 board in a 568 px column with the banner band, s = 0.712, slot 22).
  const cell = await page.locator('.cell').first().boundingBox();
  expect(cell?.width ?? 0).toBeGreaterThanOrEqual(22 - 0.5);
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
  await expect(page.locator('.overlay[data-overlay=hint] button.hint-apply')).toBeVisible(); // 2d.1: the Apply pill
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
  // Phase 2d §1.16: the game screen reserves its band (the e2e mock follows the FB rules).
  await expect(page.locator('.screen--game')).toHaveAttribute('data-banner', '');
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

test('D-2e-25 (?ads=nofill): Home gives its banner reserve back after the empty answer; the board opened next mounts without the band', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-390', 'one phone is enough (no layout measured)');
  // Every data-banner change on Home, in order ('on' = added, 'off' = removed), from the first frame of each page load.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __homeBand: string[] }).__homeBand = seen;
    new MutationObserver((records) => {
      for (const r of records) {
        if ((r.target as Element).classList?.contains('screen--home')) seen.push(r.oldValue === null ? 'on' : 'off');
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-banner'], attributeOldValue: true });
  });
  await page.goto('/?ads=nofill');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(veteranSave()));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await settleHome(page);
  // A returning player past level 9: Home reserved its band for the load, then gave it back on the mock's no_fill.
  expect(await page.evaluate(() => (window as unknown as { __homeBand: string[] }).__homeBand)).toEqual(['on', 'off']);
  await expect(page.locator('.screen--home')).not.toHaveAttribute('data-banner', '');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().ui.bannerReserved)).toBe(false);
  await expect(page.locator('[data-testid="mock-banner"]')).toHaveCount(0);
  // The next board: no band from its first frame (data-play-band="0"), so it never loads one mid-level.
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await expect(page.locator('html')).toHaveAttribute('data-play-band', '0');
  await expect(page.locator('.screen--game')).not.toHaveAttribute('data-banner', '');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().session?.bannerBand)).toBe(false);
  await expect(page.locator('[data-testid="mock-banner"]')).toHaveCount(0);
});

test('keyboard only: Enter continues the panel, Enter on "Level N", and Settings (no Shop row on the web) by keyboard', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-1280', 'desktop keyboard only');
  await boot(page, veteranSave(5, { stock: { hints: 0, kitties: 3 } }));
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
  // Home → Settings, all by keyboard: the web has nothing to sell, so there is no Shop row (§5.2).
  // 2d §1.4: the game bar's back disc ("Back") does what Home did.
  await page.locator('.top-bar--game').getByRole('button', { name: 'Back' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await expect(page.locator('.screen--home .fish-pill__plus')).toHaveCount(0);
  const gear = page.locator('.screen--home').getByRole('button', { name: 'Settings' }); // the game screen may still be fading out
  await gear.focus();
  await expect(gear).toBeFocused();
  await page.keyboard.press('Enter');
  const settings = page.locator('[data-overlay="settings"]');
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Shop' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
});

// ── 2b review fixes (R): A11Y-FOCUS-1 — focus is never lost through a screen change (spec §7) ──

test('keyboard only: focus moves into every new screen (event card → event, event Home → Home, victory "Level N" → the board, its Back → Home)', async ({ page }, info) => {
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
  await expect(page.locator('.home__play')).toBeFocused(); // its [data-autofocus] (was: <body>)
  // A level, won. UI batch (victory): the victory has no Home; its "Level N" by keyboard → focus in the next board,
  // whose Back → Home.
  await page.locator('.home__play').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 10_000 });
  await page.keyboard.press('Enter');
  const primary = page.locator('[data-overlay="victory"] .victory__primary');
  await expect(primary).toBeEnabled({ timeout: 3000 });
  await expect(page.locator('[data-overlay="victory"] .victory__home')).toHaveCount(0);
  await primary.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const g = (window as TestWindow).__mewdoku?.state();
    return g?.puzzle.id === 'L16' && g.status === 'playing';
  });
  await expect.poll(() => focusIn('.screen--game')).toBe(true); // was: <body>
  await page.locator('.top-bar--game').getByRole('button', { name: 'Back' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await expect(page.locator('.home__play')).toBeFocused(); // was: <body>
  // And Tab goes on from there inside Home, not from the top of the document.
  await page.keyboard.press('Tab');
  expect(await focusIn('.screen--home')).toBe(true);
});

// ── Phase 2c.1 → 2d: the pills row (heads + fish) and the bar's Score column (§10.2 D21, look-spec §1.4–§1.5, §1.13) ──

/** Level 310 (12×12) from the bundled pack: its solution columns (base 36, one per row). */
function level310(): { level: number; n: number; sol: number[] } {
  for (let k = 0; k <= 9; k++) {
    const pack = JSON.parse(readFileSync(resolve(LEVELS_DIR, `pack-${String(k).padStart(3, '0')}.json`), 'utf8')) as LevelPack;
    const idx = pack.levels.findIndex((r, j) => (r.i ?? pack.first + j) === 310);
    const rec = pack.levels[idx];
    if (rec) return { level: 310, n: rec.n, sol: Array.from(rec.s, (ch) => parseInt(ch, 36)) };
  }
  throw new Error('level 310 not shipped');
}

type Rect = { left: number; right: number; top: number; bottom: number };

test('12×12 with 11 cats and 11,616 points: 12 heads and the fish pill disjoint in the row, the Score in the bar between the columns, not focusable', async ({ page }) => {
  const { level, n, sol } = level310();
  expect(n).toBe(12);
  const rule = pointsRuleFor('level');
  const cells = Array.from({ length: n * n }, (_, i) => (Math.floor(i / n) < 11 && sol[Math.floor(i / n)] === i % n ? '2' : '0')).join('');
  const slot: InProgressV2 = {
    id: `L${level}`,
    mode: 'level',
    cells,
    hearts: 3,
    revivesUsed: 0,
    mistakes: 0,
    hintsUsed: 0,
    kittiesUsed: 0,
    elapsedMs: 60_000,
    savedAt: Date.now(),
    points: runTotal(11, rule),
    catStreak: 11,
    scoredRows: (1 << 11) - 1,
  };
  expect(slot.points).toBe(11_616);
  await boot(page, { ...defaults(Date.now()), tutorialDone: true, progress: { level, completed: level - 1, best: {} }, inProgress: { level: slot, daily: null, event: null } });
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  const pts = page.locator('.top-bar--game .points-pill');
  await expect(pts).toHaveAttribute('aria-label', 'Level points: 11,616');
  await expect(page.locator('.pills .pill--heads .head')).toHaveCount(12);
  await expect(page.locator('.pills .pill--heads .head[data-done]')).toHaveCount(11);
  await noHorizontalOverflow(page);

  const rects = await page.evaluate(() => {
    const r = (q: string): Rect | null => {
      const e = document.querySelector(q);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    const heads = Array.from(document.querySelectorAll('.pills .pill--heads .head')).map((e) => {
      const b = e.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    });
    return {
      row: r('.pills'),
      headsPill: r('.pills .pill--heads'),
      lives: r('.pills .pill--lives'),
      heads,
      level: r('.top-bar--game .top-bar__text'),
      score: r('.top-bar--game .points-pill'),
      back: r('.top-bar--game .top-bar__btn--home'),
      gear: r('.top-bar--game .top-bar__btn--settings'),
    };
  });
  const { row, headsPill, lives, heads, level: lvl, score, back, gear } = rects;
  if (!row || !headsPill || !lives || !lvl || !score || !back || !gear) throw new Error(`missing a box: ${JSON.stringify(rects)}`);
  // LTR: heads, then fish, no overlap, both inside the row; every head inside its pill, none overlapping.
  expect(headsPill.right).toBeLessThanOrEqual(lives.left + 0.5);
  for (const [name, b] of Object.entries({ headsPill, lives })) {
    expect(b.left, name).toBeGreaterThanOrEqual(row.left - 0.5);
    expect(b.right, name).toBeLessThanOrEqual(row.right + 0.5);
  }
  heads.forEach((h, i) => {
    expect(h.left, `head ${i}`).toBeGreaterThanOrEqual(headsPill.left - 0.5);
    expect(h.right, `head ${i}`).toBeLessThanOrEqual(headsPill.right + 0.5);
    const next = heads[i + 1];
    if (next) expect(h.right, `head ${i} / ${i + 1}`).toBeLessThanOrEqual(next.left + 0.5);
  });
  // The bar: back · Level · Score · gear, left to right, without overlap.
  expect(back.right).toBeLessThanOrEqual(lvl.left + 0.5);
  expect(lvl.right).toBeLessThanOrEqual(score.left + 0.5);
  expect(score.right).toBeLessThanOrEqual(gear.left + 0.5);
  // The 5-digit number is never cut (I18N-TEXT-2).
  const cut = await pts.locator('.points-pill__n').last().evaluate((el) => el.scrollWidth > el.clientWidth + 0.5);
  expect(cut).toBe(false);

  // Not focusable (§10.2 A11y, §1.4 Heading): no tab stop on the Score column or inside it.
  const focusable = await page.evaluate(() => {
    const el = document.querySelector('.top-bar--game .points-pill') as HTMLElement | null;
    if (!el) return -1;
    const inside = el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])').length;
    return inside + (el.tabIndex >= 0 ? 1 : 0);
  });
  expect(focusable).toBe(0);

  // The win (the 12th cat): 13,248. From the period counter's beat until the scrim, the period counter
  // (in the heads pill's place) never overlaps the fish pill, and the Score stays in the bar.
  await page.locator('.cell').nth(11 * n + (sol[11] as number)).dblclick();
  await expect(pts).toHaveAttribute('aria-label', 'Level points: 13,248');
  const bad = await page.evaluate(async () => {
    const t0 = performance.now();
    const out: string[] = [];
    let seen = 0;
    const box = (q: string): DOMRect | null => {
      const e = document.querySelector(q) as HTMLElement | null;
      return e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null;
    };
    await new Promise<void>((done) => {
      const step = (): void => {
        const t = performance.now() - t0;
        const period = box('.pills .period-pill[data-in-game]');
        const l = box('.pills .pill--lives');
        const p = box('.top-bar--game .points-pill');
        if (period) {
          seen++;
          if (l && period.right > l.left + 0.5 && period.left < l.right - 0.5) out.push(`t=${Math.round(t)} period × lives`);
          if (!p) out.push(`t=${Math.round(t)} no Score`);
        }
        const scrim = document.querySelector('.screen--game .game__scrim') as HTMLElement | null;
        if (t > 4600 || (scrim && !scrim.hidden)) done();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return { out, seen };
  });
  expect(bad.out).toEqual([]);
  expect(bad.seen).toBeGreaterThan(0);
});

// ── Phase 2d: the measured stack (look-spec §1.1), hit areas, the banner band, keyboard order ──

type Row = { name: string; top: number; bottom: number; left: number; right: number };

/** The game screen's rows, top to bottom (§1.1), and the mock banner when it shows. */
async function stackRows(page: Page): Promise<{ rows: Row[]; banner: Row | null; vw: number; vh: number }> {
  return page.evaluate(() => {
    const r = (name: string, q: string): Row | null => {
      const e = document.querySelector(q) as HTMLElement | null;
      if (!e || e.closest('[hidden]') || e.getClientRects().length === 0) return null;
      const b = e.getBoundingClientRect();
      return { name, top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    };
    const rows = [
      r('bar', '.screen--game header.top-bar--game'),
      r('pills', '.screen--game .pills'),
      r('rules', '.screen--game ul.rule-chips'),
      r('board', '.screen--game .board'),
      r('tools', '.screen--game .tool-bar'),
    ].filter((x): x is Row => x !== null);
    return { rows, banner: r('banner', '[data-testid="mock-banner"]'), vw: window.innerWidth, vh: window.innerHeight };
  });
}

/** Every row inside the viewport, in the §1.1 order, no two overlapping; the board centred; the banner below the tools. */
async function stackOk(page: Page, label: string): Promise<void> {
  const { rows, banner, vw, vh } = await stackRows(page);
  expect(rows.map((x) => x.name), label).toEqual(['bar', 'pills', 'rules', 'board', 'tools']);
  for (const x of rows) {
    expect(x.top, `${label}: ${x.name} top`).toBeGreaterThanOrEqual(-0.5);
    expect(x.bottom, `${label}: ${x.name} bottom`).toBeLessThanOrEqual(vh + 0.5);
    expect(x.left, `${label}: ${x.name} left`).toBeGreaterThanOrEqual(-0.5);
    expect(x.right, `${label}: ${x.name} right`).toBeLessThanOrEqual(vw + 0.5);
  }
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1] as Row;
    const b = rows[i] as Row;
    expect(a.bottom, `${label}: ${a.name} over ${b.name}`).toBeLessThanOrEqual(b.top + 0.5);
  }
  const board = rows.find((x) => x.name === 'board') as Row;
  expect(Math.abs((board.left + board.right) / 2 - vw / 2), `${label}: board centred`).toBeLessThanOrEqual(1);
  if (banner) {
    const tools = rows.find((x) => x.name === 'tools') as Row;
    expect(tools.bottom, `${label}: the helpers over the banner`).toBeLessThanOrEqual(banner.top + 0.5);
    expect(banner.bottom, `${label}: banner on screen`).toBeLessThanOrEqual(vh + 0.5);
  }
}

async function playAt(page: Page, level: number, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(veteranSave(level)));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.waitForTimeout(250); // the layout settles after the entry
}

test('2d stack: bar, pills, rules, board, tools in order, inside the viewport, no overlap, the board centred (also 360 × 640)', async ({ page }, info) => {
  // Without ads (no band) and with the mock banner's band (level ≥ 11: the gate reserves it from mount).
  await playAt(page, 15, '?ads=unsupported');
  await stackOk(page, `${info.project.name} no band`);
  await noHorizontalOverflow(page);
  await playAt(page, 15);
  await expect(page.locator('.screen--game')).toHaveAttribute('data-banner', '');
  await expect(page.locator('[data-testid="mock-banner"]')).toBeVisible();
  await stackOk(page, `${info.project.name} band`);
  if (info.project.name === 'web-390') {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(250);
    await stackOk(page, '360 × 640 band');
    await noHorizontalOverflow(page);
  }
});

test('2d stack with 2× text: the rows grow, still inside, in order and without overlap', async ({ page }, info) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = 'html { font-size: 200% !important; }';
      document.head.appendChild(st);
    });
  });
  await playAt(page, 15, '?ads=unsupported');
  await stackOk(page, `${info.project.name} 2× text`);
  await noHorizontalOverflow(page);
});

test('2d: the mock banner sits in the band, 320 × 50 and centred, and never over the helpers', async ({ page }) => {
  await playAt(page, 15);
  const bar = page.locator('[data-testid="mock-banner"]');
  await expect(bar).toBeVisible();
  const b = await bar.boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  if (!b) throw new Error('no banner');
  expect(b.height).toBeCloseTo(50, 0);
  expect(b.width).toBeCloseTo(Math.min(320, vw), 0);
  expect(Math.abs(b.x + b.width / 2 - vw / 2)).toBeLessThanOrEqual(1);
  // Every helper disc and its badge stay above the banner.
  const tools = await page.locator('.tool-bar .tool:not([data-off]), .tool-bar .tool__badge').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().bottom),
  );
  for (const bottom of tools) expect(bottom).toBeLessThanOrEqual(b.y + 0.5);
});

test('2d: 12×12 whole cells at 320 × 568 with a 20 px safe top and the band (slot ≥ 21)', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-320', 'the small phone');
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--dev-safe-top', '20px'));
  });
  const level = first12();
  await playAt(page, level);
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.puzzle.n ?? 0)).toBe(12);
  await expect(page.locator('.screen--game')).toHaveAttribute('data-banner', '');
  await boardVisible(page);
  await noHorizontalOverflow(page);
  await stackOk(page, '320 × 568, safe top 20, band, 12 × 12');
  const box = await page.locator('.cell').first().boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(21 - 0.5);
  // The bar starts below the safe top.
  const bar = await page.locator('.screen--game header.top-bar--game').boundingBox();
  expect(bar?.y ?? 0).toBeGreaterThanOrEqual(20 - 0.5);
  // A whole cell still takes a tap and a drag (the gesture thresholds hold at 21 px).
  await page.locator('.cell').nth(1).click();
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.cells[1])).toBe(1);
});

/**
 * Misses of the 44 × 44 hit areas of the round buttons matching `selector`: elementFromPoint at the
 * corners of a 44 × 44 square around each centre (and the centre). A corner off the screen is clamped
 * into the viewport (requests-G3 R3: at 320 × 568 with no safe area the bar's discs sit 5.5 px from the
 * top, and a tap at the screen's edge lands there).
 */
async function hitAreaMisses(page: Page, selector: string, min: number): Promise<string[]> {
  return page.evaluate(
    ([sel, want]) => {
      const out: string[] = [];
      // the rendered ones (Home hides its trophy and home buttons when they do not apply)
      const buttons = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((b) => b.getBoundingClientRect().width > 0);
      if (buttons.length < want) out.push(`only ${buttons.length} round buttons`);
      const clamp = (v: number, hi: number): number => Math.min(hi - 0.5, Math.max(0.5, v));
      for (const el of buttons) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const h = 21.5; // just inside a 44 × 44 square around the centre
        for (const [dx, dy] of [[-h, -h], [h, -h], [-h, h], [h, h], [0, 0]] as const) {
          const hit = document.elementFromPoint(clamp(cx + dx, innerWidth), clamp(cy + dy, innerHeight));
          if (!hit || !(hit === el || el.contains(hit))) out.push(`${el.className} at (${dx}, ${dy}): ${hit ? hit.className || hit.tagName : 'nothing'}`);
        }
      }
      return out;
    },
    [selector, min] as const,
  );
}

test('2d: every round button keeps a 44 × 44 hit area (elementFromPoint at its corners)', async ({ page }, info) => {
  await playAt(page, 15);
  const misses = await hitAreaMisses(page, '.screen--game .top-bar--game .top-bar__btn, .screen--game .tool-bar .tool:not([data-off])', 5);
  expect(misses, info.project.name).toEqual([]);
});

test("2d: Home's round buttons keep a square 44 × 44 hit area too (requests-G3 R2)", async ({ page }, info) => {
  await boot(page, veteranSave(15));
  const misses = await hitAreaMisses(page, '.screen--home .top-bar .btn--icon', 1);
  expect(misses, info.project.name).toEqual([]);
});

test('2d keyboard order: back → gear → board → kitty → bulb → mouse', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-1280', 'desktop keyboard only');
  await playAt(page, 15, '?ads=unsupported');
  await page.locator('.top-bar--game .top-bar__btn--home').focus();
  const order: string[] = [];
  const which = (): Promise<string> =>
    page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return 'none';
      if (a.matches('.top-bar__btn--home')) return 'back';
      if (a.matches('.top-bar__btn--settings')) return 'gear';
      if (a.closest('.board')) return 'board';
      if (a.matches('.tool--paw')) return 'kitty';
      if (a.matches('.tool--bulb')) return 'bulb';
      if (a.matches('.tool--mouse')) return 'mouse';
      return a.className || a.tagName;
    });
  order.push(await which());
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    order.push(await which());
  }
  expect(order).toEqual(['back', 'gear', 'board', 'kitty', 'bulb', 'mouse']);
});

// ─────────────────────────── Phase 2d.1 (helpers-spec §3.2, §4.8, §7.7) ───────────────────────────

/** Client rects of the first match of each selector (null when absent or not rendered). */
async function rectsOf<K extends string>(page: Page, sels: Record<K, string>): Promise<Record<K, Rect | null>> {
  return page.evaluate((map) => {
    const out: Record<string, Rect | null> = {};
    for (const [k, q] of Object.entries(map)) {
      const e = document.querySelector(q);
      const r = e?.getBoundingClientRect();
      out[k] = r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    }
    return out;
  }, sels as Record<string, string>) as Promise<Record<K, Rect | null>>;
}

const HINT = {
  card: '.overlay[data-overlay="hint"] .hint-card',
  apply: '.overlay[data-overlay="hint"] button.hint-apply',
  bar: '.screen--game header.top-bar--game',
  rules: '.screen--game .rule-chips',
  board: '.screen--game .board',
  banner: '[data-testid="mock-banner"]',
};

/** Opens the hint on the playing board and checks the card and Apply against the stack (§3.2). */
async function hintPlacedOk(page: Page, label: string): Promise<void> {
  await page.locator('.tool--bulb').click();
  await expect(page.locator(HINT.card)).toBeVisible();
  await page.waitForTimeout(400); // past the dim's fade and its rebuild at dimMs
  const r = await rectsOf(page, HINT);
  const vw = page.viewportSize()?.width ?? 0;
  const vh = page.viewportSize()?.height ?? 0;
  const { card, apply, bar, rules, board, banner } = r;
  if (!card || !apply || !bar || !rules || !board) throw new Error(`${label}: missing ${JSON.stringify(r)}`);
  // The card: inside the viewport, below the bar, above the board, over the rule cards.
  expect(card.left, `${label}: card left`).toBeGreaterThanOrEqual(-0.5);
  expect(card.right, `${label}: card right`).toBeLessThanOrEqual(vw + 0.5);
  expect(card.top, `${label}: card below the bar`).toBeGreaterThanOrEqual(bar.bottom - 0.5);
  expect(card.bottom, `${label}: card off the board`).toBeLessThanOrEqual(board.top + 0.5);
  const vOverlap = Math.min(card.bottom, rules.bottom) - Math.max(card.top, rules.top);
  const hOverlap = Math.min(card.right, rules.right) - Math.max(card.left, rules.left);
  expect(vOverlap, `${label}: card over the rules row (height)`).toBeGreaterThanOrEqual(0.75 * (rules.bottom - rules.top));
  expect(hOverlap, `${label}: card over the rules row (width)`).toBeGreaterThanOrEqual(0.75 * Math.min(rules.right - rules.left, card.right - card.left));
  // Apply: fully on screen, under the board, above the banner band.
  expect(apply.left, `${label}: Apply left`).toBeGreaterThanOrEqual(-0.5);
  expect(apply.right, `${label}: Apply right`).toBeLessThanOrEqual(vw + 0.5);
  expect(apply.top, `${label}: Apply under the board`).toBeGreaterThanOrEqual(board.bottom - 0.5);
  expect(apply.bottom, `${label}: Apply on screen`).toBeLessThanOrEqual(vh + 0.5);
  if (banner) expect(apply.bottom, `${label}: Apply above the band`).toBeLessThanOrEqual(banner.top + 0.5);
  await page.keyboard.press('Escape');
  await expect(page.locator(HINT.card)).toBeHidden();
  await page.waitForFunction(() => !(window as TestWindow).__mewdoku?.app().overlays.includes('hint'));
}

test('2d.1: the hint card covers the rules row below the bar; Apply sits under the board, on screen, above the band', async ({ page }, info) => {
  await playAt(page, 15, '?ads=unsupported');
  await hintPlacedOk(page, `${info.project.name} no band`);
  await playAt(page, 15);
  await expect(page.locator('.screen--game')).toHaveAttribute('data-banner', '');
  await hintPlacedOk(page, `${info.project.name} band`);
});

test('2d.1: in German at 320 × 568 with the band (also 2× text) the card stays below the bar and off the board, scrolling inside if needed', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-320', 'the small phone');
  const german = (): SaveData => {
    const s = veteranSave(15);
    return { ...s, settings: { ...s.settings, locale: 'de' } };
  };
  for (const big of [false, true]) {
    if (big) {
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const st = document.createElement('style');
          st.textContent = 'html { font-size: 200% !important; }';
          document.head.appendChild(st);
        });
      });
    }
    await page.goto('/');
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
    await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(german()));
    await page.reload();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
    await expect(page.locator('html')).toHaveAttribute('lang', /^de/);
    await page.locator('.home__play').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    await page.waitForTimeout(250);
    await page.locator('.tool--bulb').click();
    await expect(page.locator(HINT.card)).toBeVisible();
    await page.waitForTimeout(400);
    const r = await rectsOf(page, HINT);
    if (!r.card || !r.bar || !r.board) throw new Error('missing rects');
    expect(r.card.top, `de${big ? ' 2×' : ''}: card below the bar`).toBeGreaterThanOrEqual(r.bar.bottom - 0.5);
    expect(r.card.bottom, `de${big ? ' 2×' : ''}: card off the board`).toBeLessThanOrEqual(r.board.top + 0.5);
    // The card and its text block (§3.2: text that does not fit scrolls inside the card).
    const scroll = await page.evaluate((q) => {
      const el = document.querySelector<HTMLElement>(q);
      if (!el) return null;
      const parts = [el, el.querySelector<HTMLElement>('.hint-card__text')].filter((x): x is HTMLElement => !!x);
      const over = parts.filter((x) => x.scrollHeight > x.clientHeight + 1);
      return { overflows: over.length > 0, scrollable: over.every((x) => /auto|scroll/.test(getComputedStyle(x).overflowY) || parts.some((p) => p !== x && /auto|scroll/.test(getComputedStyle(p).overflowY) && p.contains(x))) };
    }, HINT.card);
    expect(scroll?.scrollable, `de${big ? ' 2×' : ''}: overflowing text scrolls inside the card`).toBe(true);
    await page.keyboard.press('Escape');
  }
});

/** Shipped levels (packs 000–009) whose solution puts cats in the corners, covering all four. */
function cornerLevels(): { level: number; n: number; corners: { row: number; col: number }[] }[] {
  const out: { level: number; n: number; corners: { row: number; col: number }[] }[] = [];
  const need = new Set(['tl', 'tr', 'bl', 'br']);
  for (let k = 0; k <= 9 && need.size > 0; k++) {
    const pack = JSON.parse(readFileSync(resolve(LEVELS_DIR, `pack-${String(k).padStart(3, '0')}.json`), 'utf8')) as LevelPack;
    pack.levels.forEach((rec, j) => {
      const level = rec.i ?? pack.first + j;
      if (level < 11 || rec.n > 9 || need.size === 0 || (rec.gv ?? '') !== '') return;
      const n = rec.n;
      const top = parseInt(rec.s[0] as string, 36);
      const bottom = parseInt(rec.s[n - 1] as string, 36);
      const corners: { row: number; col: number }[] = [];
      const tag = (row: number, col: number): string => `${row === 0 ? 't' : 'b'}${col === 0 ? 'l' : 'r'}`;
      for (const [row, col] of [[0, top], [n - 1, bottom]] as const) {
        if ((col === 0 || col === n - 1) && need.has(tag(row, col))) corners.push({ row, col });
      }
      if (corners.length === 0) return;
      for (const c of corners) need.delete(tag(c.row, c.col));
      out.push({ level, n, corners });
    });
  }
  return out;
}

test('2d.1: the "+N" and the "Done!" labels stay inside the viewport for a cat in each corner tile', async ({ page }, info) => {
  test.setTimeout(120_000);
  const levels = cornerLevels();
  const seen = new Set(levels.flatMap((l) => l.corners.map((c) => `${c.row === 0 ? 't' : 'b'}${c.col === 0 ? 'l' : 'r'}`)));
  expect([...seen].sort(), 'a shipped level for every corner').toEqual(['bl', 'br', 'tl', 'tr']);
  for (const { level, n, corners } of levels) {
    await playAt(page, level, '?ads=unsupported');
    await expect(page.locator('.game-fx[data-celebrate="ready"]')).toBeAttached({ timeout: 10_000 });
    const vw = page.viewportSize()?.width ?? 0;
    const vh = page.viewportSize()?.height ?? 0;
    for (const { row, col } of corners) {
      const label = `${info.project.name} level ${level} (${row},${col})`;
      // Cross the rest of the row, then the corner cat completes it: "+N" over it, "Done!" under it.
      for (let c = 0; c < n; c++) if (c !== col) await page.locator('.cell').nth(row * n + c).click();
      await page.locator('.cell').nth(row * n + col).dblclick();
      const found = await page.waitForFunction(
        (anchor) => {
          const plus = document.querySelector('.game-fx .fx-plus');
          const done = document.querySelector(`.game-fx .fx-done-label[data-anchor="${anchor}"]`);
          if (!plus || !done) return false;
          const a = plus.getBoundingClientRect();
          const b = done.getBoundingClientRect();
          return { plus: { left: a.left, top: a.top, right: a.right, bottom: a.bottom }, done: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } };
        },
        row * n + col,
        { polling: 'raf', timeout: 3_000 },
      );
      const r = (await found.jsonValue()) as { plus: Rect; done: Rect };
      expect(r.plus.left, `${label}: +N left`).toBeGreaterThanOrEqual(3 - 0.5);
      expect(r.plus.right, `${label}: +N right`).toBeLessThanOrEqual(vw - 3 + 0.5);
      expect(r.plus.top, `${label}: +N top`).toBeGreaterThanOrEqual(0);
      expect(r.done.left, `${label}: label left`).toBeGreaterThanOrEqual(2 - 0.5);
      expect(r.done.right, `${label}: label right`).toBeLessThanOrEqual(vw - 2 + 0.5);
      expect(r.done.bottom, `${label}: label bottom`).toBeLessThanOrEqual(vh);
      await page.waitForTimeout(1_500); // the sequence ends before the next corner
    }
  }
});

// ─────────────────────────── Phase 2e (G1) ───────────────────────────

interface Box2e {
  readonly sel: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The visible boxes of `sels` (one per selector, the first visible match). */
async function boxesOf(page: Page, sels: readonly string[]): Promise<Box2e[]> {
  return page.evaluate((list) => {
    const out: Box2e[] = [];
    for (const sel of list) {
      const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]'));
      if (!el) continue;
      const r = el.getBoundingClientRect();
      out.push({ sel, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out;
  }, sels as string[]);
}

const overlaps = (a: Box2e, b: Box2e): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/** Every visible button of `root` inside the viewport, or the dialog's panel scrolls; each at least 44 × 44. */
async function dialogFits(page: Page, root: string): Promise<{ problems: string[]; scrolls: boolean }> {
  return page.evaluate((sel) => {
    const r = document.querySelector(sel) as HTMLElement | null;
    if (!r) return { problems: [`no ${sel}`], scrolls: false };
    const panel = r.querySelector<HTMLElement>('.overlay__panel') ?? r;
    let scrolls = false;
    for (let el: HTMLElement | null = panel; el; el = el.parentElement === r ? null : el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) scrolls = true;
    }
    for (const el of Array.from(panel.querySelectorAll<HTMLElement>('*'))) {
      if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) scrolls = true;
    }
    const problems: string[] = [];
    for (const b of Array.from(r.querySelectorAll<HTMLElement>('button, select, input, [role="radio"]'))) {
      const box = b.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || b.closest('[hidden]')) continue;
      if (box.width < 44 - 0.5 || box.height < 44 - 0.5) problems.push(`${b.className || b.tagName} ${Math.round(box.width)}×${Math.round(box.height)}`);
      const inside = box.left >= -0.5 && box.right <= innerWidth + 0.5 && box.top >= -0.5 && box.bottom <= innerHeight + 0.5;
      if (!inside && !scrolls) problems.push(`${b.className || b.tagName} off screen`);
    }
    if (document.documentElement.scrollWidth > innerWidth) problems.push('page overflows sideways');
    return { problems, scrolls };
  }, root);
}

/** The local date key of `ms` in the page (the streak's and the daily's day, dayStartHour 0). */
const localKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('Phase 2e: Home at 320 × 568 — the ranking chip, Play, the streak strip, the daily and the event cards never overlap; Play on screen without scrolling (no band / band; en / de)', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-320', 'the small phone');
  test.setTimeout(90_000);
  const T = new Date(2026, 10, 15, 12, 0, 0).getTime(); // the Lantern Walk is on (its Home card shows)
  await page.clock.install({ time: T });
  for (const ads of ['unsupported', 'ok'] as const) {
    for (const locale of ['en', 'de'] as const) {
      const base = veteranSave(30);
      const save: SaveData = { ...base, settings: { ...base.settings, locale }, dayStreak: { dates: [localKey(T - 86_400_000)], run: 3, best: 3, paid: [] } };
      await page.goto(`/?ads=${ads}`);
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
      await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
      await page.reload();
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
      await settleHome(page);
      await page.waitForTimeout(600);
      const label = `${ads} ${locale}`;
      // Home layout (2026-10-11): the profile picture and the streak pill in the top bar, the chip floating at the left.
      const sels = ['.screen--home .home__profile', '.screen--home .streak-pill', '.screen--home button.ladder-chip', '.screen--home .home__play', '.screen--home .daily-card', '.screen--home .event-card', '.screen--home .top-bar__btn--settings'];
      const boxes = await boxesOf(page, sels);
      expect(boxes.map((b) => b.sel), label).toEqual(sels);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i] as Box2e, boxes[j] as Box2e), `${label}: ${boxes[i]?.sel} × ${boxes[j]?.sel}`).toBe(false);
      }
      const vp = page.viewportSize() ?? { width: 320, height: 568 };
      const limit = ads === 'ok' ? await bannerTop(page) : vp.height;
      const play = boxes.find((b) => b.sel.endsWith('.home__play')) as Box2e;
      expect(play.y + play.h, `${label}: Play on screen`).toBeLessThanOrEqual(limit + 0.5);
      for (const b of boxes) expect(b.x >= -0.5 && b.x + b.w <= vp.width + 0.5, `${label}: ${b.sel} inside`).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await noHorizontalOverflow(page);
      expect(await hitAreaMisses(page, '.screen--home button.ladder-chip', 1), label).toEqual([]);
      expect(await hitAreaMisses(page, '.screen--home button.streak-pill', 1), label).toEqual([]); // UI batch: 44 px tall
    }
  }
});

test('Phase 2e: the post-win panel with 50 real rows scrolls inside its card (no page overflow), its footer button on screen, every heart a 44 × 44 hit area', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-320', 'the small phone');
  test.skip(!(await ladderUp()), `no ranking server at ${LADDER_URL}`);
  test.setTimeout(150_000);
  const pool = newPool('lay50');
  await fillPool(pool, 49);
  await page.goto(`/?ads=unsupported&ladderPool=${pool}`);
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(veteranSave(30)));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 15_000 });
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.waitForTimeout(5_000); // past the server's soft solve floor
  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  const panel = page.locator('.overlay[data-overlay="ranking"]');
  const rows = panel.locator('.rank-list[data-kind="bracket"] ol.rank-rows > li.rank-row');
  await expect(rows).toHaveCount(50, { timeout: 20_000 });
  // Leaderboard update: measured once the rank-up has landed (rows move while it plays).
  await expect(panel.locator('.rank-list[data-climbing]')).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(500);
  const report = await page.evaluate(() => {
    const ol = document.querySelector('.overlay[data-overlay="ranking"] ol.rank-rows') as HTMLElement;
    let el: HTMLElement | null = ol;
    while (el && !(el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    const list = el?.getBoundingClientRect() ?? null;
    return {
      scroller: el ? el.className || el.tagName : null,
      inPanel: !!el && !!el.closest('.overlay[data-overlay="ranking"]'),
      page: { w: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight - innerHeight },
      list: list ? { top: list.top, bottom: list.bottom } : null,
    };
  });
  expect(report.scroller).not.toBeNull();
  expect(report.inPanel).toBe(true);
  expect(report.page.w).toBeLessThanOrEqual(0);
  expect(report.page.h).toBeLessThanOrEqual(1);
  const tap = await panel.locator('.ranking__tap').boundingBox();
  const vp = page.viewportSize() ?? { width: 320, height: 568 };
  expect(tap && tap.y >= 0 && tap.y + tap.height <= vp.height + 0.5).toBe(true);
  // The hearts on screen (inside the list's visible part) each take a 44 × 44 tap: the box is at least 44 × 44
  // and a tap lands on the heart at its centre and 21.5 px out along both axes. A heart is a pill (a disc at
  // 320 px), and hit testing follows the rounded edge, so the square's corners are not probed here.
  const misses = await page.evaluate((bounds) => {
    const out: string[] = [];
    const hearts = Array.from(document.querySelectorAll<HTMLElement>('.overlay[data-overlay="ranking"] ol.rank-rows button.rank-row__heart')).filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && bounds !== null && r.top - 22 >= bounds.top && r.bottom + 22 <= bounds.bottom;
    });
    if (hearts.length < 2) out.push(`only ${hearts.length} hearts in view`);
    for (const el of hearts) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.push(`heart box ${r.width.toFixed(2)}×${r.height.toFixed(2)}`);
      for (const [dx, dy] of [[-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5], [0, 0]] as const) {
        const hit = document.elementFromPoint(Math.min(innerWidth - 0.5, Math.max(0.5, cx + dx)), cy + dy);
        if (!hit || !(hit === el || el.contains(hit))) out.push(`heart ${Math.round(r.width)}×${Math.round(r.height)} at (${dx}, ${dy}): ${hit ? hit.className || hit.tagName : 'nothing'}`);
      }
    }
    return out;
  }, report.list);
  expect(misses).toEqual([]);
});

test('Phase 2e: the profile sheet (the name, Picture · Frame · Background, Save) fits or scrolls inside its dialog at 320 × 568 (en, de)', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-320', 'the small phone');
  test.skip(!(await ladderUp()), `no ranking server at ${LADDER_URL}`);
  test.setTimeout(90_000);
  for (const locale of ['en', 'de'] as const) {
    const base = veteranSave(30);
    await page.goto(`/?ads=unsupported&ladderPool=${newPool('layn')}`);
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
    await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify({ ...base, settings: { ...base.settings, locale } }));
    await page.reload();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 15_000 });
    await page.locator('.screen--home .top-bar__btn--settings').click();
    await page.locator('[data-overlay="settings"] button.settings__ladder-name').click();
    const sheet = page.locator('.overlay[data-overlay="nickname"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.locator('.nickname__avatars [role="radio"]')).toHaveCount(12);
    await page.waitForTimeout(300);
    // UI batch (profile): every tab's grid (one at a time) fits the same way
    for (const tab of ['avatar', 'frame', 'bg'] as const) {
      await sheet.locator(`[role="tab"][data-tab="${tab}"]`).click();
      const r = await dialogFits(page, '.overlay[data-overlay="nickname"]');
      expect(r.problems, `${locale} ${tab}`).toEqual([]);
      await sheet.locator('button.nickname__save').scrollIntoViewIfNeeded();
      await expect(sheet.locator('button.nickname__save')).toBeInViewport();
    }
  }
});

test('Phase 2e: the result card (a paid place, ×2) fits inside its dialog at 320 × 568 (en, de)', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-320', 'the small phone');
  test.skip(!(await ladderUp()), `no ranking server at ${LADDER_URL}`);
  test.setTimeout(150_000);
  for (const locale of ['en', 'de'] as const) {
    const pool = newPool('layr');
    await fillPool(pool, 4);
    const base = veteranSave(30);
    await page.goto(`/?ads=ok&ladderPool=${pool}`);
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
    await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify({ ...base, settings: { ...base.settings, locale } }));
    await page.reload();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 15_000 });
    await page.locator('.home__play').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    await page.waitForTimeout(5_000);
    await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
    await expect(page.locator('.overlay[data-overlay="ranking"] .rank-list[data-kind="bracket"]')).toBeVisible({ timeout: 20_000 });
    await devAdvance(pool, 24 * 3_600_000 + 60_000);
    await devCron(pool);
    await page.goto(`/?ads=ok&ladderPool=${pool}`);
    const card = page.locator('.overlay[data-overlay="ladder_result"]');
    await expect(card).toHaveAttribute('data-case', 'paid', { timeout: 20_000 });
    await page.waitForTimeout(300);
    const r = await dialogFits(page, '.overlay[data-overlay="ladder_result"]');
    expect(r.problems, locale).toEqual([]);
    await expect(card.locator('button.ladder-result__double')).toBeInViewport();
    await expect(card.locator('button.ladder-result__collect')).toBeInViewport();
  }
});

/**
 * Audit B1: the daily victory on a streak's day 7 carries the most lines of any victory (Solved, the praise and
 * statistic lines (UI batch), the stats, "Next puzzle", the points and the fish pill). At 320 × 568 every line must sit
 * above the sticky primary ("Level N"; it was Done) (fit step 4/5 with the banner band), in English and German, on the
 * records path and with the ranking. UI batch (2026-10-13): the streak row is off (dayStreak.victoryRow); the Daily
 * Streak screen that the primary opens carries day 7 and its reward, and it must fit the same way (Continue fully on
 * screen, above the band).
 */
test('Phase 2e (audit B1): the daily victory on a streak\'s day 7 at 320 × 568 — every line above Done, nothing to scroll (en, de; records and ranking)', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-320', 'the small phone');
  test.setTimeout(180_000);
  const ladder = await ladderUp();
  const DAY = 86_400_000;
  await keepStreakScreen(page); // the streak screen is checked below (this test presses nothing on it)
  // With the banner band (ads=ok) the content needs fit step 4 (it ran under Done before the fix); without it, step 3.
  const runs: (readonly ['records' | 'ranking', 'ok' | 'unsupported', 'en' | 'de'])[] = [
    ['records', 'ok', 'en'],
    ['records', 'ok', 'de'],
    ['records', 'unsupported', 'de'],
    ...(ladder ? ([['ranking', 'ok', 'en'], ['ranking', 'ok', 'de']] as const) : []),
  ];
  for (const [path, ads, locale] of runs) {
    const label = `${path} ${locale} ads=${ads}`;
    const now = Date.now();
    const base = veteranSave(30); // the daily is unlocked after level 21
    const save: SaveData = {
      ...base,
      settings: { ...base.settings, locale },
      // six days in a row up to yesterday: today's first win is the cycle's day 7 (its reward)
      dayStreak: { dates: [6, 5, 4, 3, 2, 1].map((d) => localKey(now - d * DAY)), run: 6, best: 6, paid: [] },
    };
    await page.goto(path === 'records' ? `/?ads=${ads}&flags=-ladder` : `/?ads=${ads}&ladderPool=${newPool('b1v')}`);
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
    await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
    await page.reload();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
    if (path === 'ranking') await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 15_000 });
    await page.locator('.daily-card').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    if (path === 'ranking') await page.waitForTimeout(5_000); // past the server's soft solve floor
    await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
    const panel = page.locator('.overlay[data-overlay="ranking"]');
    await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 20_000 });
    await panel.locator('.ranking__tap').click();
    const victory = page.locator('.overlay[data-overlay="victory"]');
    await expect(victory.locator('.victory')).toHaveAttribute('data-variant', 'daily', { timeout: 6_000 });
    await expect(victory.locator('.victory__streak')).toBeHidden(); // UI batch: the Daily Streak screen after Done says day 7
    await expect(victory.locator('.victory__kept')).toBeVisible();
    await page.waitForTimeout(900); // the button delay and the fit's second frame
    const r = await page.evaluate(() => {
      const scroller = document.querySelector('.overlay[data-overlay="victory"]') as HTMLElement;
      const actions = (scroller.querySelector('.victory__actions') as HTMLElement).getBoundingClientRect();
      const out: string[] = [];
      for (const sel of ['.victory__praise', '.victory__sub', '.victory__daily', '.victory__lines', '.victory__daily-reward', '.victory__streak', '.victory__streak-reward', '.victory__points', '.victory__kept']) {
        const el = scroller.querySelector<HTMLElement>(sel);
        if (!el || el.closest('[hidden]')) continue;
        const b = el.getBoundingClientRect();
        if (b.height === 0) continue;
        if (b.bottom > actions.top + 0.5) out.push(`${sel} ends at ${b.bottom.toFixed(1)}, under Done's footer (from ${actions.top.toFixed(1)})`);
        if (b.top < -0.5) out.push(`${sel} starts above the screen (${b.top.toFixed(1)})`);
      }
      return { out, overflow: scroller.scrollHeight - scroller.clientHeight, fit: scroller.querySelector('.victory')?.getAttribute('data-fit') ?? null };
    });
    expect(r.out, `${label} (fit ${r.fit})`).toEqual([]);
    expect(r.overflow, `${label}: content taller than the screen (fit ${r.fit})`).toBeLessThanOrEqual(1);
    await expect(victory.locator('.victory__primary')).toBeInViewport({ ratio: 1 });
    await noHorizontalOverflow(page);
    // UI batch (2026-10-13): Done → the Daily Streak screen: day 7 with its reward, every line above Continue, nothing to
    // scroll, Continue on screen and clear of the banner band.
    await victory.locator('.victory__primary').click();
    const streak = page.locator('.overlay[data-overlay="streak"]');
    await expect(streak.locator('.streak-screen__n')).toHaveText('7');
    await expect(streak.locator('.streak-week__day').nth(6)).toHaveAttribute('data-paid', '');
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => {
      const scroller = document.querySelector('.overlay[data-overlay="streak"]') as HTMLElement;
      const actions = (scroller.querySelector('.streak-screen__actions') as HTMLElement).getBoundingClientRect();
      const out: string[] = [];
      for (const sel of ['.streak-screen__title', '.streak-screen__hero', '.streak-screen__run', '.streak-screen__best', '.streak-week', '.streak-screen__status']) {
        const b = (scroller.querySelector(sel) as HTMLElement).getBoundingClientRect();
        if (b.bottom > actions.top + 0.5) out.push(`${sel} ends at ${b.bottom.toFixed(1)}, under Continue (from ${actions.top.toFixed(1)})`);
        if (b.top < -0.5) out.push(`${sel} starts above the screen (${b.top.toFixed(1)})`);
      }
      return { out, overflow: scroller.scrollHeight - scroller.clientHeight };
    });
    expect(st.out, `${label}: the streak screen`).toEqual([]);
    expect(st.overflow, `${label}: the streak screen taller than the screen`).toBeLessThanOrEqual(1);
    await expect(streak.locator('.streak-screen__continue')).toBeInViewport({ ratio: 1 });
    // With the band reserved, Continue stays ads.banner.buttonClearancePx above it (as the victory's buttons).
    const band = await page.evaluate(() => {
      const root = document.querySelector('.overlay[data-overlay="streak"] .streak-screen') as HTMLElement;
      if (!root.hasAttribute('data-banner')) return null;
      const cs = getComputedStyle(root);
      const cont = (root.querySelector('.streak-screen__continue') as HTMLElement).getBoundingClientRect();
      return { bottom: cont.bottom, limit: innerHeight - parseFloat(cs.getPropertyValue('--banner-reserve')) - parseFloat(cs.getPropertyValue('--banner-clear')) };
    });
    if (ads === 'ok') expect(band, `${label}: the streak screen reserves the band`).not.toBeNull();
    if (band) expect(band.bottom, `${label}: Continue clear of the band`).toBeLessThanOrEqual(band.limit + 0.5);
    await noHorizontalOverflow(page);
  }
});

/**
 * Found while checking audit B1: with reduced motion every property transitions for 150 ms (fx.css), so fit() measured
 * each step before its sizes applied and ran to its last step (or, before step 4, left the content under Done). It now
 * measures with transitions off: the level victory on a streak's day 7 at 320 × 568 keeps its (smaller) hero and fits.
 */
test('Phase 2e (fix lead): reduced motion — the victory fit measures each step at once (day 7 at 320 × 568 keeps a smaller hero, nothing under Done)', async ({ page }, info) => {
  test.skip(info.project.name !== 'web-320', 'the small phone');
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const now = Date.now();
  const base = veteranSave(30);
  const save: SaveData = { ...base, dayStreak: { dates: [6, 5, 4, 3, 2, 1].map((d) => localKey(now - d * 86_400_000)), run: 6, best: 6, paid: [] } };
  await page.goto('/?ads=unsupported&flags=-ladder');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen !== 'boot');
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await expect(page.locator('[data-motion="reduced"]').first()).toBeAttached();
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  await page.locator('.overlay[data-overlay="ranking"] .ranking__tap').click({ timeout: 20_000 });
  const victory = page.locator('.overlay[data-overlay="victory"]');
  await expect(victory.locator('.victory__primary')).toBeVisible({ timeout: 6_000 });
  await expect(victory.locator('.victory__streak')).toBeHidden(); // UI batch: no streak row (the Daily Streak screen)
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const sc = document.querySelector('.overlay[data-overlay="victory"]') as HTMLElement;
    const root = sc.querySelector('.victory') as HTMLElement;
    const actions = (sc.querySelector('.victory__actions') as HTMLElement).getBoundingClientRect();
    const kept = (sc.querySelector('.victory__kept') as HTMLElement).getBoundingClientRect();
    return { fit: Number(root.dataset.fit ?? '0'), stage: getComputedStyle(sc.querySelector('.victory__stage') as Element).display, overflow: sc.scrollHeight - sc.clientHeight, gap: actions.top - kept.bottom };
  });
  expect(r.fit, 'a compaction step before the last one fits').toBeLessThan(4);
  expect(r.stage).not.toBe('none');
  expect(r.overflow).toBeLessThanOrEqual(1);
  expect(r.gap, 'the fish pill above Done').toBeGreaterThanOrEqual(0);
});
