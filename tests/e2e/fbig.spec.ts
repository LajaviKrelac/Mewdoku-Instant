// Owner: D (Phase 2b; was platform)
// FBIG build against tests/fixtures/fbinstant-stub.js (04 §11, 05 §4–§7). The SDK URL is routed to
// the stub; each test configures it through window.__FB_STUB_CONFIG__ before the page loads, and
// seeds the player's save as the stub's cloud copy (so the boot merge is exercised too).
// Runs in the `fbig-390` project against dist/fbig-e2e (hooks on, test placement IDs).
// Review fixes covered here: a late cloud read (PLAT-1), per-player mirrors (PLAT-2), a blocked
// localStorage with cloud save (PLAT-3), a startGameAsync that fails (PLAT-8).
// Phase 2b (§3.6, §5.10, §8.8): the win flow (ranking panel → victory "Level N"), banners (none
// before 10 completed levels; Home and victory with the 58 px reserve; never while the game screen
// shows), the paw_points score reaching the stub's leaderboard (classic: "Your rank", NEZP: "Your
// score"), and purchases (hints_15 granted and consumed once; remove_ads ends interstitials and
// banners; no Buy section on iOS).
// Review fixes (2026-10-09): a banner load slower than ads.readyTimeoutMs, a failing hide and a load
// that never settles never leave a banner on the game screen, and the banner is down before an
// interstitial (FB2B-1); the shop opened from the victory screen hides its banner (FB2B-2, L2B-1); a
// boot restore of No Ads takes the Home banner down (L2B-2); a failed catalogue offers Retry (FB2B-3);
// iOS says "unavailable" at once (FB2B-5); the daily panel ranks me within today, past the later time
// zones' next-day entries, with one time for one solve (FB2B-4, FB2B-7).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import type { AppState } from '../../src/app/store';
import { defaults } from '../../src/game/save';
import type { SaveData } from '../../src/game/types';

const STUB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/fbinstant-stub.js');
const STUB_SRC = readFileSync(STUB_PATH, 'utf8');

interface StubCall {
  seq: number;
  name: string;
  args: unknown[];
  t: number;
  beforeInit: boolean;
}
interface StubControl {
  calls: StubCall[];
  state: { initialized: boolean; started: boolean; progress: number[] };
  names(): string[];
  count(name: string): number;
  find(name: string): StubCall[];
  pause(): void;
  clearCalls(): void;
}
type TestWindow = Window & { __fbStub?: StubControl; __FB_STUB_CONFIG__?: unknown; __mewdoku?: E2EHooks };

// ── selectors (one place to adjust if the UI copy changes; strings come from src/i18n/en.ts) ──
const sel = {
  playButton: (page: Page) => page.getByRole('button', { name: /^(Continue · )?Level \d+$/ }).first(),
  /** phase2b: the victory screen's wide "Level N" button (victory.next). */
  victoryNext: (page: Page) => page.getByRole('button', { name: /^Level \d+$/ }),
  rankingTap: (page: Page) => page.getByRole('button', { name: 'Tap to keep going' }),
  shop: (page: Page) => page.getByRole('button', { name: 'Shop' }).first(),
  hintTool: (page: Page) => page.getByRole('button', { name: /^Hint\b/ }),
  watchVideo: (page: Page) => page.getByRole('button', { name: 'Watch video' }),
  cell: (page: Page, row: number, col: number) => page.locator(`[aria-label^="Row ${row + 1}, column ${col + 1},"]`).first(),
  noVideoToast: (page: Page) => page.getByText('No videos right now — try again soon.'),
};

/** A save past the tutorial, at `level`, with `completed` levels; tweak with `patch`. */
function seededSave(level: number, completed: number, patch: (s: SaveData) => SaveData = (s) => s): SaveData {
  const now = Date.now();
  const base = defaults(now - 30 * 86_400_000); // tenure 30 days → 90 s cooldown
  return patch({
    ...base,
    updatedAt: now,
    tutorialDone: true,
    sessions: 5,
    progress: { ...base.progress, level, completed },
  });
}

async function loadGame(page: Page, stubConfig: Record<string, unknown>, opts: { clockAt?: number } = {}): Promise<void> {
  await page.route('https://connect.facebook.net/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB_SRC }),
  );
  await page.addInitScript((config) => {
    (window as TestWindow).__FB_STUB_CONFIG__ = config;
  }, stubConfig);
  if (opts.clockAt !== undefined) await page.clock.install({ time: opts.clockAt });
  await page.goto('/');
}

async function openGame(page: Page, stubConfig: Record<string, unknown>, opts: { clockAt?: number } = {}): Promise<void> {
  await loadGame(page, stubConfig, opts);
  await page.waitForFunction(() => (window as TestWindow).__fbStub?.state.started === true && !!(window as TestWindow).__mewdoku);
}

const stub = <T>(page: Page, fn: (s: StubControl) => T): Promise<T> =>
  page.evaluate((src) => {
    const s = (window as TestWindow).__fbStub as StubControl;
    return (new Function('s', `return (${src})(s)`) as (s: StubControl) => T)(s);
  }, fn.toString());

const appState = (page: Page): Promise<AppState> => page.evaluate(() => (window as TestWindow).__mewdoku!.app());

async function startLevel(page: Page): Promise<void> {
  await expect(sel.playButton(page)).toBeVisible();
  await sel.playButton(page).click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
}

/**
 * Double-taps every solution cell (one cat per row) to win the current board. `slow`: the last cat
 * lands after rank.minSolveMs (3 s), so the score is submitted (phase2b §5.3: faster solves are not).
 */
async function solve(page: Page, opts: { slow?: boolean; clock?: boolean } = {}): Promise<void> {
  const cols = await page.evaluate(() => (window as TestWindow).__mewdoku!.solution());
  expect(cols).not.toBeNull();
  const list = cols ?? [];
  for (const [row, col] of list.entries()) {
    if (opts.slow && row === list.length - 1) {
      if (opts.clock) await page.clock.fastForward(3_500);
      else await page.waitForTimeout(3_500);
    }
    await sel.cell(page, row, col).dblclick();
  }
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'won');
}

/** phase2b win flow: the ranking panel (tap once its gate opens), then the victory screen's "Level N". */
async function toVictory(page: Page): Promise<void> {
  await expect(sel.rankingTap(page)).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await sel.rankingTap(page).click({ timeout: 1_000 });
    await expect(sel.rankingTap(page)).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(sel.victoryNext(page)).toBeEnabled({ timeout: 10_000 });
}

const count = (page: Page, name: string): Promise<number> => stub(page, new Function('s', `return s.count(${JSON.stringify(name)})`) as (s: StubControl) => number);

test.describe('FBIG lifecycle', () => {
  test('initializeAsync first, progress 100 before startGameAsync, locale after start', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(5, 4) } });
    const names = await stub(page, (s) => s.names());
    expect(names[0]).toBe('initializeAsync');
    const beforeInit = await stub(page, (s) => s.calls.filter((c) => c.beforeInit).map((c) => c.name));
    expect(beforeInit).toEqual(['initializeAsync']);
    const start = names.indexOf('startGameAsync');
    const progress = await stub(page, (s) => s.calls.filter((c) => c.name === 'setLoadingProgress').map((c) => [c.seq, c.args[0]]));
    const startSeq = await stub(page, (s) => s.calls.find((c) => c.name === 'startGameAsync')?.seq ?? -1);
    expect(progress.some(([seq, pct]) => (seq as number) < startSeq && pct === 100)).toBe(true);
    const locale = names.indexOf('getLocale');
    if (locale >= 0) expect(locale).toBeGreaterThan(start);
  });

  test('the cloud copy is merged into the save at boot', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(17, 16) } });
    const s = await appState(page);
    expect(s.save.progress.level).toBe(17);
    expect(s.save.tutorialDone).toBe(true);
  });

  test('onPause saves at once with setDataAsync and never flushes', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(5, 4) } });
    await startLevel(page);
    await stub(page, (s) => s.clearCalls());
    await stub(page, (s) => s.pause());
    await expect.poll(() => stub(page, (s) => s.count('player.setDataAsync')), { timeout: 2_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    expect(await stub(page, (s) => s.count('player.flushDataAsync'))).toBe(0);
  });
});

test.describe('FBIG storage', () => {
  test('a move is saved with a debounced setDataAsync; a win flushes', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(5, 4) } });
    await startLevel(page);
    // Let the boot-time write (sessions + 1, debounced) land first, so it cannot blur the check below.
    await expect.poll(() => stub(page, (s) => s.count('player.setDataAsync')), { timeout: 8_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await stub(page, (s) => s.clearCalls());
    // One mark on a non-solution cell (single tap = X).
    const cols = (await page.evaluate(() => (window as TestWindow).__mewdoku!.solution())) ?? [];
    const col0 = cols[0] ?? 0;
    await sel.cell(page, 0, col0 === 0 ? 1 : 0).click();
    await page.waitForTimeout(1_000);
    expect(await stub(page, (s) => s.count('player.setDataAsync'))).toBe(0); // still inside the 3 s window
    await expect.poll(() => stub(page, (s) => s.count('player.setDataAsync')), { timeout: 6_000 }).toBeGreaterThan(0);
    expect(await stub(page, (s) => s.count('player.flushDataAsync'))).toBe(0);

    await solve(page);
    await expect.poll(() => stub(page, (s) => s.count('player.flushDataAsync')), { timeout: 5_000 }).toBe(1);
  });
});

test.describe('FBIG save robustness', () => {
  /** The returning player's cloud copy: level 40, 9 hints and kitties, sound off, an hour old. */
  const cloudCopy = (): SaveData =>
    seededSave(40, 39, (s) => ({
      ...s,
      updatedAt: Date.now() - 3_600_000,
      stock: { hints: 9, kitties: 9 },
      settings: { ...s.settings, sound: false },
    }));

  test('a cloud read slower than the boot timeout is merged when it arrives; the next session keeps the cloud stock (PLAT-1)', async ({ page, context }) => {
    test.setTimeout(45_000);
    const cloud = cloudCopy();
    await openGame(page, { data: { save: cloud }, persist: false, getDataDelayMs: 4_500 });
    // Boot gave up waiting (cloudLoadTimeoutMs) and started a first run …
    expect((await appState(page)).save.tutorialDone).toBe(false);
    // … then the late copy is merged into the live save, and only then do cloud writes start.
    await expect.poll(async () => (await appState(page)).save.progress.level, { timeout: 5_000 }).toBe(40);
    const s = await appState(page);
    expect(s.save.stock).toEqual({ hints: 9, kitties: 9 });
    expect(s.save.settings.sound).toBe(false);
    await expect.poll(() => stub(page, (st) => st.count('player.setDataAsync')), { timeout: 6_000 }).toBeGreaterThan(0);
    await page.close();

    // A session whose read fails outright (on a device with no mirror yet) never wins the next
    // merge with its fresh defaults.
    const p1 = await context.newPage();
    await p1.addInitScript(() => localStorage.clear());
    const failing = Array(12).fill('NETWORK_FAILURE');
    await openGame(p1, { data: { save: cloud }, persist: false, errors: { getDataAsync: failing } });
    expect((await appState(p1)).save.progress.level).toBe(1);
    await p1.waitForTimeout(800); // the session's mirror write (defaults, fresh updatedAt)
    expect(await stub(p1, (st) => st.count('player.setDataAsync'))).toBe(0);
    await p1.close();
    const p2 = await context.newPage();
    await openGame(p2, { data: { save: cloud }, persist: false });
    const merged = (await appState(p2)).save;
    expect(merged.progress.level).toBe(40);
    expect(merged.stock).toEqual({ hints: 9, kitties: 9 });
    expect(merged.settings.sound).toBe(false);
  });

  test("two FB accounts in one browser never see or merge each other's progress (PLAT-2)", async ({ page, context }) => {
    await openGame(page, { playerId: 'player-A', persist: false, data: { save: cloudCopy() } });
    expect((await appState(page)).save.progress.level).toBe(40);
    await page.waitForTimeout(800); // A's mirror is written
    await page.close();
    const b = await context.newPage();
    await openGame(b, { playerId: 'player-B', persist: false });
    const s = await appState(b);
    expect(s.save.progress.level).toBe(1);
    expect(s.save.progress.best).toEqual({});
    expect(s.save.stock).toEqual(defaults(Date.now()).stock);
    const keys = await b.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mewdoku.save.v1')).sort());
    expect(keys).toContain('mewdoku.save.v1:player-A');
  });

  test("a blocked localStorage does not claim progress can't be saved while cloud save works (PLAT-3)", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await openGame(page, { persist: false, data: { save: seededSave(9, 8) } });
    const s = await appState(page);
    expect(s.save.progress.level).toBe(9);
    expect(s.ui.storage).toBe('ok');
    await page.waitForTimeout(600);
    await expect(page.getByText("Progress can't be saved on this device right now.")).toHaveCount(0);
  });

  test('a startGameAsync that fails once is retried; failing twice shows an honest error with a retry (PLAT-8)', async ({ page, context }) => {
    await openGame(page, { persist: false, data: { save: seededSave(5, 4) }, errors: { startGameAsync: ['INVALID_OPERATION'] } });
    expect(await stub(page, (s) => s.count('startGameAsync'))).toBe(2);
    await expect(sel.playButton(page)).toBeVisible();
    await page.close();

    const p2 = await context.newPage();
    await loadGame(p2, { persist: false, errors: { startGameAsync: ['INVALID_OPERATION', 'INVALID_OPERATION'] } });
    await expect(p2.getByRole('alert')).toContainText("The game couldn't start.");
    await expect(p2.getByText('Oops, something hiccupped. You can keep playing.')).toHaveCount(0);
    await expect(p2.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

test.describe('FBIG ads', () => {
  test('an interstitial is shown at the victory "Level N" once 10 levels are done and the grace and cooldown passed', async ({ page }) => {
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { data: { save: seededSave(15, 14) } }, { clockAt: t0 });
    await startLevel(page);
    await solve(page);
    await page.clock.fastForward(65_000); // past ads.interstitial.sessionGraceSec
    await toVictory(page);
    expect(await stub(page, (s) => s.calls.filter((c) => c.name === 'ad.showAsync').length)).toBe(0); // never during the win flow
    await sel.victoryNext(page).click();
    await expect
      .poll(() => stub(page, (s) => s.calls.filter((c) => c.name === 'ad.showAsync' && c.args[0] === 'interstitial').length))
      .toBe(1);
  });

  test('no interstitial before 10 completed levels', async ({ page }) => {
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { data: { save: seededSave(6, 5) } }, { clockAt: t0 });
    await startLevel(page);
    await solve(page);
    await page.clock.fastForward(65_000);
    await toVictory(page);
    await sel.victoryNext(page).click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    expect(await stub(page, (s) => s.calls.filter((c) => c.name === 'ad.showAsync').length)).toBe(0);
  });

  test('a 10 s rewarded video is not cut off and grants the hint', async ({ page }) => {
    test.setTimeout(45_000);
    await openGame(page, { presets: ['slow-rewarded'], data: { save: seededSave(5, 4, (s) => ({ ...s, stock: { hints: 0, kitties: 3 } })) } });
    await startLevel(page);
    await sel.hintTool(page).click();
    await sel.watchVideo(page).click();
    const started = Date.now();
    await expect.poll(async () => (await appState(page)).overlays.includes('hint'), { timeout: 20_000 }).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(9_000);
    expect(await stub(page, (s) => s.calls.some((c) => c.name === 'ad.showSettled' && c.args[1] === 'ok'))).toBe(true);
  });

  test('an ad that never becomes ready is skipped after ads.readyTimeoutMs', async ({ page }) => {
    await openGame(page, { presets: ['never-ready'], data: { save: seededSave(5, 4, (s) => ({ ...s, stock: { hints: 0, kitties: 3 } })) } });
    await startLevel(page);
    await sel.hintTool(page).click();
    await sel.watchVideo(page).click();
    const started = Date.now();
    await expect(sel.noVideoToast(page)).toBeVisible({ timeout: 8_000 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(3_500);
    expect((await appState(page)).overlays).not.toContain('hint');
    expect(await stub(page, (s) => s.count('ad.showAsync'))).toBe(0);
  });
});

test.describe('FBIG layout', () => {
  /** Visible controls whose box reaches into the top-left 64×64 safe zone (02 §19, 05 §5). */
  const safeZoneHits = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || el.closest('[hidden]')) continue;
        if (r.left < 64 && r.top < 64) out.push(el.className || el.tagName);
      }
      return out;
    });

  test('the FB safe zone holds no control on Home or in a level', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(12, 11) } });
    expect(await page.evaluate(() => document.getElementById('app')?.dataset.platform)).toBe('fbig');
    expect(await safeZoneHits(page)).toEqual([]);
    await startLevel(page);
    expect(await safeZoneHits(page)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a first run boots straight into the tutorial with the safe zone clear', async ({ page }) => {
    await openGame(page, {});
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().session?.mode === 'tutorial');
    expect(await safeZoneHits(page)).toEqual([]);
  });
});

// ─────────────────────────── phase2b ───────────────────────────

/** Bottom of the band a banner may cover: the viewport height minus the 58 px reserve (ads.banner.reservePx). */
const RESERVE_PX = 58;
const CLEARANCE_PX = 16;

/** The visible screen root's computed padding-bottom and data-banner flag. */
const screenBand = (page: Page): Promise<{ banner: boolean; pad: number } | null> =>
  page.evaluate(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('.screen, .victory')).find(
      (e) => e.getBoundingClientRect().height > 0 && !e.closest('[inert]'),
    );
    if (!el) return null;
    return { banner: el.hasAttribute('data-banner'), pad: parseFloat(getComputedStyle(el).paddingBottom) || 0 };
  });

test.describe('FBIG banners (phase2b §3)', () => {
  test('no banner call before 10 completed levels, on Home or on the victory screen', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(6, 5) } });
    await expect(sel.playButton(page)).toBeVisible();
    await page.waitForTimeout(800);
    await startLevel(page);
    await solve(page);
    await toVictory(page);
    await page.waitForTimeout(800);
    expect(await count(page, 'loadBannerAdAsync')).toBe(0);
    await expect(page.getByTestId('fb-stub-banner')).toHaveCount(0);
  });

  test('banner on Home and on the victory screen from level 11, with the 58 px reserve; none while the game screen shows', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { data: { save: seededSave(11, 10) } }, { clockAt: t0 });
    // Home: one load, at the bottom, with the reserve band.
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    expect((await stub(page, (s) => s.find('loadBannerAdAsync')[0]?.args)) ?? []).toEqual(['e2e-banner', 'bottom']);
    await expect(page.getByTestId('fb-stub-banner')).toBeVisible();
    await expect.poll(async () => (await screenBand(page))?.banner).toBe(true);
    expect((await screenBand(page))?.pad ?? 0).toBeGreaterThanOrEqual(RESERVE_PX);
    const play = await sel.playButton(page).boundingBox();
    const vh = page.viewportSize()?.height ?? 844;
    expect((play?.y ?? 0) + (play?.height ?? 0)).toBeLessThanOrEqual(vh - RESERVE_PX - CLEARANCE_PX + 0.5);

    // Into the game: hidden before the game screen, and no load while it shows.
    await startLevel(page);
    expect(await count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('fb-stub-banner')).toHaveCount(0);
    await stub(page, (s) => s.clearCalls());
    await page.clock.fastForward(61_000); // past ads.banner.minReloadSec while playing
    await solve(page, { clock: true });
    await page.clock.fastForward(5_000); // the win flow up to the ranking panel
    expect(await count(page, 'loadBannerAdAsync')).toBe(0); // never in play, never on the ranking panel

    // Victory: the second load, the reserve, and the "Level N" button clear of the band.
    await toVictory(page);
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await expect(page.getByTestId('fb-stub-banner')).toBeVisible();
    const next = await sel.victoryNext(page).boundingBox();
    expect((next?.y ?? 0) + (next?.height ?? 0)).toBeLessThanOrEqual(vh - RESERVE_PX - CLEARANCE_PX + 0.5);

    // Leaving for the next board hides it again before the game screen.
    await sel.victoryNext(page).click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    expect(await count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('fb-stub-banner')).toHaveCount(0);
  });
});

test.describe('FBIG rankings (phase2b §5)', () => {
  test('classic leaderboard: the paw_points score reaches the board; the panel shows "Your rank"', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(5, 4) } });
    await startLevel(page);
    await solve(page, { slow: true });
    await expect.poll(() => stub(page, (s) => s.calls.filter((c) => c.name === 'leaderboard.setScoreAsync').map((c) => c.args[0])), { timeout: 8_000 }).toEqual([
      'e2e_paw_points',
    ]);
    const posted = (await stub(page, (s) => s.find('leaderboard.setScoreAsync')[0]?.args[1])) as number;
    expect(posted).toBe((await appState(page)).save.points.total);
    await expect(page.getByRole('dialog').getByText(/^Your rank: #1$/)).toBeVisible({ timeout: 10_000 });
  });

  test('NEZP leaderboard: the score is posted by id; the panel shows "Your score", never a rank', async ({ page }) => {
    await openGame(page, { presets: ['lb-nezp'], data: { save: seededSave(5, 4) } });
    await startLevel(page);
    await solve(page, { slow: true });
    await expect
      .poll(() => stub(page, (s) => s.calls.filter((c) => c.name === 'globalLeaderboards.setScoreAsync').map((c) => c.args[0])), { timeout: 8_000 })
      .toEqual(['e2e_paw_points']);
    await expect(page.getByRole('dialog').getByText(/^Your score: /).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog').getByText(/Your rank/)).toHaveCount(0);
  });

  test('no leaderboard API: personal records only, no other players and no SDK leaderboard call', async ({ page }) => {
    await openGame(page, { presets: ['lb-none'], data: { save: seededSave(5, 4) } });
    await startLevel(page);
    await solve(page, { slow: true });
    await expect(sel.rankingTap(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog').getByText('Total points')).toBeVisible();
    expect(await stub(page, (s) => s.calls.filter((c) => /eaderboard/i.test(c.name)).length)).toBe(0);
  });
});

test.describe('FBIG purchases (phase2b §8)', () => {
  test('buying hints_15 grants +15 hints and consumes the purchase once', async ({ page }) => {
    await openGame(page, { persist: false, data: { save: seededSave(5, 4, (s) => ({ ...s, stock: { hints: 2, kitties: 3 } })) } });
    await sel.shop(page).click();
    const buy = page.getByRole('button', { name: /^Buy Bulb Bundle, / });
    await expect(buy).toBeVisible({ timeout: 8_000 });
    await buy.click();
    await expect.poll(async () => (await appState(page)).save.stock.hints, { timeout: 8_000 }).toBe(17);
    await expect.poll(() => count(page, 'payments.consumePurchaseAsync')).toBe(1);
    const s = (await appState(page)).save;
    expect(s.purchases.tokens.some((t) => t.startsWith('hints_15|'))).toBe(true);
    expect(await stub(page, (st) => st.calls.find((c) => c.name === 'payments.purchaseAsync')?.args[0])).toMatchObject({
      productID: 'hints_15',
      developerPayload: expect.stringMatching(/^stub-player-1:/),
    });
    await page.waitForTimeout(500);
    expect(await count(page, 'payments.consumePurchaseAsync')).toBe(1);
  });

  test('remove_ads is consumed and kept: no interstitial and no banner afterwards', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(15, 14) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1); // a banner on Home before the purchase
    await sel.shop(page).click();
    await page.getByRole('button', { name: /^Buy No Ads, / }).click();
    await expect.poll(async () => (await appState(page)).save.purchases.noAds, { timeout: 8_000 }).toBe(true);
    await expect.poll(() => count(page, 'payments.consumePurchaseAsync')).toBe(1);
    await page.keyboard.press('Escape');
    await stub(page, (s) => s.clearCalls());
    await page.clock.fastForward(70_000); // past the session grace and the banner window
    await startLevel(page);
    await solve(page, { clock: true });
    await page.clock.fastForward(65_000);
    await toVictory(page);
    await page.waitForTimeout(800);
    await sel.victoryNext(page).click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    expect(await stub(page, (s) => s.calls.filter((c) => c.name === 'ad.showAsync' || c.name === 'loadBannerAdAsync').map((c) => c.name))).toEqual([]);
  });

  test('iOS: no Buy section, only "Swap fish"', async ({ page }) => {
    await openGame(page, { presets: ['ios'], data: { save: seededSave(5, 4) } });
    await sel.shop(page).click();
    await expect(page.getByText('Swap fish').first()).toBeVisible();
    await expect(page.getByText("Purchases aren't available here.")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /^Buy / })).toHaveCount(0);
    expect(await count(page, 'payments.purchaseAsync')).toBe(0);
  });
});

// ─────────────────────────── review fixes (2026-10-09) ───────────────────────────

const stubBanner = (page: Page) => page.getByTestId('fb-stub-banner');
const configureStub = (page: Page, patch: Record<string, unknown>): Promise<void> =>
  page.evaluate((p) => (window as unknown as { __fbStub: { configure(x: unknown): void } }).__fbStub.configure(p), patch);
const seqOf = (page: Page, name: string, filter?: string): Promise<number[]> =>
  page.evaluate(
    ([n, f]) =>
      ((window as TestWindow).__fbStub as StubControl).calls.filter((c) => c.name === n && (f === '' || c.args[0] === f)).map((c) => c.seq),
    [name, filter ?? ''] as const,
  );

test.describe('FBIG banners never in play (review FB2B-1)', () => {
  // Real time on purpose: Playwright's clock.fastForward can fire the stub's slow-load timer before the
  // adapter's ads.readyTimeoutMs timeout and hide the bug.
  for (const playAfterMs of [1_000, 5_000]) {
    test(`a 6 s banner load (over ads.readyTimeoutMs): Play after ${playAfterMs / 1000} s, the late banner never shows on the game screen`, async ({ page }) => {
      test.setTimeout(60_000);
      await openGame(page, { persist: false, banner: { loadDelayMs: 6_000 }, data: { save: seededSave(12, 11) } });
      await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
      const loadAt = Date.now();
      await page.waitForTimeout(Math.max(0, playAfterMs - (Date.now() - loadAt)));
      await startLevel(page);
      await page.waitForTimeout(Math.max(0, 7_500 - (Date.now() - loadAt))); // the load lands at about 6 s
      expect((await appState(page)).screen).toBe('game');
      expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.status)).toBe('playing');
      expect(await count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
      await expect(stubBanner(page)).toHaveCount(0);
    });
  }

  test('a hideBannerAdAsync that fails once is retried: no banner stays on the game screen', async ({ page }) => {
    await openGame(page, { persist: false, errors: { hideBannerAdAsync: ['NETWORK_FAILURE'] }, data: { save: seededSave(12, 11) } });
    await expect(stubBanner(page)).toBeVisible();
    await startLevel(page);
    await expect.poll(() => count(page, 'hideBannerAdAsync'), { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
    await expect(stubBanner(page)).toHaveCount(0);
    expect((await appState(page)).screen).toBe('game');
  });

  test('a load that never settles is given up: the victory screen loads a banner again, and it is down before the interstitial', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, banner: { load: 'never' }, data: { save: seededSave(12, 11) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await startLevel(page);
    await configureStub(page, { banner: { load: 'ok' } });
    await page.clock.fastForward(61_000); // past ads.banner.minReloadSec (and Meta's 45 s) while playing
    await solve(page, { clock: true });
    await page.clock.fastForward(5_000);
    await toVictory(page);
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(2); // a new load, not the hung one
    await expect(stubBanner(page)).toBeVisible();
    await sel.victoryNext(page).click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    await expect(stubBanner(page)).toHaveCount(0);
    const shows = await seqOf(page, 'ad.showAsync', 'interstitial');
    const hides = await seqOf(page, 'hideBannerAdAsync');
    expect(shows.length).toBe(1);
    expect(hides.some((h) => h < (shows[0] ?? 0))).toBe(true); // §3.2: hidden before the interstitial
  });
});

test.describe('FBIG banner under modals and No Ads (reviews FB2B-2, L2B-1, L2B-2)', () => {
  test('the shop opened from the victory fish pill hides the banner; buying No Ads there keeps it down', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(11, 10) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await startLevel(page);
    await page.clock.fastForward(61_000);
    await solve(page, { clock: true });
    await page.clock.fastForward(5_000);
    await toVictory(page);
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(2);
    await expect(stubBanner(page)).toBeVisible();
    await stub(page, (s) => s.clearCalls());
    await page.locator('.victory').getByRole('button', { name: 'Shop' }).click();
    await expect.poll(async () => (await appState(page)).overlays).toEqual(['victory', 'shop']);
    expect(await count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await expect(stubBanner(page)).toHaveCount(0);
    await page.getByRole('button', { name: /^Buy No Ads, / }).click();
    await expect.poll(async () => (await appState(page)).save.purchases.noAds, { timeout: 8_000 }).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await appState(page)).overlays).toEqual(['victory']);
    await page.clock.fastForward(61_000);
    await page.waitForTimeout(300);
    await expect(stubBanner(page)).toHaveCount(0);
    expect(await count(page, 'loadBannerAdAsync')).toBe(0);
  });

  test('a boot restore that grants No Ads takes the Home banner down at once', async ({ page }) => {
    const unconsumed = [
      {
        productID: 'remove_ads',
        purchaseToken: 'tok-restore-1',
        paymentID: 'pay-1',
        purchaseTime: String(Math.floor(Date.now() / 1000)),
        developerPayload: 'stub-player-1:x',
        paymentActionType: 'charge',
        isConsumed: false,
      },
    ];
    await openGame(page, { persist: false, payments: { readyDelayMs: 1_500, unconsumed }, data: { save: seededSave(15, 14) } });
    await expect(stubBanner(page)).toBeVisible(); // the Home banner loaded before onReady
    expect((await appState(page)).save.purchases.noAds).toBe(false);
    await expect.poll(async () => (await appState(page)).save.purchases.noAds, { timeout: 8_000 }).toBe(true);
    await expect(stubBanner(page)).toHaveCount(0);
    expect((await appState(page)).screen).toBe('home');
    expect(await count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
  });
});

test.describe('FBIG shop states (reviews FB2B-3, FB2B-5)', () => {
  test('a failed catalogue shows Retry (not an empty Buy section); Retry asks again and lists the five products', async ({ page }) => {
    await openGame(page, { persist: false, payments: { errors: { getCatalogAsync: ['NETWORK_FAILURE'] } }, data: { save: seededSave(5, 4) } });
    await sel.shop(page).click();
    const retry = page.locator('.shop__retry');
    await expect(retry).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /^Buy / })).toHaveCount(0);
    await retry.click();
    await expect(page.getByRole('button', { name: /^Buy / })).toHaveCount(5, { timeout: 8_000 });
    expect(await count(page, 'payments.getCatalogAsync')).toBe(2);
  });

  test('iOS: "Purchases aren\'t available here." at once, never "Getting the shop ready…"', async ({ page }) => {
    await openGame(page, { presets: ['ios'], data: { save: seededSave(5, 4) } });
    await sel.shop(page).click();
    await expect(page.getByText("Purchases aren't available here.")).toBeVisible({ timeout: 1_500 });
    await expect(page.getByText('Getting the shop ready…')).toHaveCount(0);
  });
});

test.describe('FBIG daily ranking across time zones (reviews FB2B-4, FB2B-7)', () => {
  test("twelve next-day entries above today: the panel says #1 for today's best, one time for one solve, and the list starts at #1", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route('https://connect.facebook.net/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB_SRC }),
    );
    // The board is seeded in the page, from the page's own local date (dayIndex of today and tomorrow).
    await page.addInitScript((save) => {
      const d = new Date();
      const today = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 86_400_000);
      const at = (day: number, secs: number): number => day * 100_000 + (99_999 - secs);
      const entries = [
        ...Array.from({ length: 12 }, (_, i) => ({ playerId: `ahead-${i}`, score: at(today + 1, 60 + i) })),
        ...Array.from({ length: 3 }, (_, i) => ({ playerId: `today-${i}`, score: at(today, 200 + 10 * i) })),
      ];
      (window as TestWindow).__FB_STUB_CONFIG__ = { persist: false, data: { save }, leaderboards: { entries: { e2e_daily_fastest: entries } } };
    }, seededSave(25, 24));
    await page.goto('/');
    await page.waitForFunction(() => (window as TestWindow).__fbStub?.state.started === true && !!(window as TestWindow).__mewdoku);
    await page.locator('.daily-card').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    await solve(page, { slow: true });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/^Your rank: #1$/)).toBeVisible({ timeout: 15_000 });
    const solved = /Solved in (\d+:\d\d)/.exec(await dialog.innerText())?.[1];
    expect(solved).toBeTruthy();
    await expect(dialog.getByText(`Your score: ${solved}`)).toBeVisible();
    await dialog.getByRole('button', { name: /See top players/i }).click();
    await expect.poll(() => count(page, 'overlayViews.createOverlayViewWithXMLString')).toBe(1);
    const rows = await stub(page, (s) =>
      (JSON.parse(String(s.find('overlayViews.createOverlayViewWithXMLString')[0]?.args[2])) as { rows: { rank: string; kind: string }[] }).rows,
    );
    expect(rows.map((r) => `${r.rank}:${r.kind}`)).toEqual(['#1:mine', '#2:other', '#3:other', '#4:other']);
  });
});

