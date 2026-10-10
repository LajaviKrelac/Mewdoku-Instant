// Owner: D (Phase 2b; was platform)
// FBIG build against tests/fixtures/fbinstant-stub.js (04 §11, 05 §4–§7). The SDK URL is routed to
// the stub; each test configures it through window.__FB_STUB_CONFIG__ before the page loads, and
// seeds the player's save as the stub's cloud copy (so the boot merge is exercised too).
// Runs in the `fbig-390` project against dist/fbig-e2e (hooks on, test placement IDs).
// Review fixes covered here: a late cloud read (PLAT-1), per-player mirrors (PLAT-2), a blocked
// localStorage with cloud save (PLAT-3), a startGameAsync that fails (PLAT-8).
// Phase 2b (§3.6, §5.10, §8.8): the win flow (ranking panel → victory "Level N"), banners (none
// before 10 completed levels; Home and victory with the 58 px reserve; never while the game screen
// shows), the leaderboard score reaching the stub's board (classic: "Your rank", NEZP: "Your score";
// 2b paw_points, 2c period_points below), and purchases (hints_15 granted and consumed once;
// remove_ads ends interstitials and banners; no Buy section on iOS).
// Review fixes (2026-10-09): a banner load slower than ads.readyTimeoutMs, a failing hide and a load
// that never settles never leave a banner on the game screen, and the banner is down before an
// interstitial (FB2B-1); the shop opened from the victory screen hides its banner (FB2B-2, L2B-1); a
// boot restore of No Ads takes the Home banner down (L2B-2); a failed catalogue offers Retry (FB2B-3);
// iOS says "unavailable" at once (FB2B-5); the daily panel ranks me within today, past the later time
// zones' next-day entries, with one time for one solve (FB2B-4, FB2B-7).
// Phase 2c (G3, docs/phase2c/fish-lives-spec.md §4, §5, §7.3 G3 item 6): the win submits the period board
// (period_points → the stub's e2e_period_points) with this UTC week's total, the fish kept: classic
// "Your rank: #1", NEZP "Your score: 3 fish", no API → the personal period records; the band ignores a
// future-dated entry and older weeks, and "Your rank" is exact past 200 entries (RankEntry.boardRank).
// The shop opens from Settings only (no Home or victory "+"), sells three products and has no swap
// section; iOS has no Shop row; the banner under the shop is re-based on Home → Settings → Shop; a boot
// restore of an unconsumed retired fish_250 grants 10 hints + 3 kitties once and consumes it. The daily
// board is off by default (rank.dailyBoard), so the FB2B-4 daily-band test became the period-band test
// (the daily band reader keeps its unit tests).
// Needs VITE_FB_LEADERBOARDS with period_points → e2e_period_points in the fbig-e2e build (lead, I-1).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.16, §5.3): the banner during play (ads.banner.duringPlay,
// on by default): none before 10 completed levels; from 10 the game screen reserves its band from mount
// and shows the banner when the board entry ends; a banner up on Home or the victory stays into the
// next board when nothing hid it; it is hidden before an interstitial, the mouse's video and Settings.
// The 2b "never in play" tests (incl. FB2B-1) run with ?bannerPlay=0 (an e2e-only switch that turns
// duringPlay off), which restores that rule. On FBIG the game screen keeps every control out of the
// top-left 64 × 64 (the back disc moves; in Arabic the gear does) and the Level column clear of it.
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
  leaderboard(name: string): { playerId: string; score: number }[];
  purchases(): { productID: string; purchaseToken: string; isConsumed: boolean }[];
}
type TestWindow = Window & { __fbStub?: StubControl; __FB_STUB_CONFIG__?: unknown; __mewdoku?: E2EHooks };

// ── selectors (one place to adjust if the UI copy changes; strings come from src/i18n/en.ts) ──
const sel = {
  playButton: (page: Page) => page.getByRole('button', { name: /^(Continue · )?Level \d+$/ }).first(),
  /** phase2b: the victory screen's wide "Level N" button (victory.next). */
  victoryNext: (page: Page) => page.getByRole('button', { name: /^Level \d+$/ }),
  rankingTap: (page: Page) => page.getByRole('button', { name: 'Tap to keep going' }),
  /** phase2c §5.2: the shop's only entry, Settings → Shop (shown only where the Buy section can show something). */
  homeSettings: (page: Page) => page.locator('.screen--home .top-bar__btn--settings'),
  shopRow: (page: Page) => page.locator('[data-overlay="settings"] .settings__shop-link'),
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

/** Phase 2d: `query` (e.g. '?bannerPlay=0', e2e builds only) is appended to the page URL. */
type LoadOpts = { clockAt?: number; query?: string };

async function loadGame(page: Page, stubConfig: Record<string, unknown>, opts: LoadOpts = {}): Promise<void> {
  await page.route('https://connect.facebook.net/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB_SRC }),
  );
  await page.addInitScript((config) => {
    (window as TestWindow).__FB_STUB_CONFIG__ = config;
  }, stubConfig);
  if (opts.clockAt !== undefined) await page.clock.install({ time: opts.clockAt });
  await page.goto(`/${opts.query ?? ''}`);
}

/** Phase 2d: the 2b banner rule ("never in play"), through the e2e-only ads.banner.duringPlay switch. */
const NO_PLAY_BANNER = '?bannerPlay=0';

async function openGame(page: Page, stubConfig: Record<string, unknown>, opts: LoadOpts = {}): Promise<void> {
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

/** phase2c §5.2: Home → Settings → Shop (the only way in); waits for the sheet. */
async function openShop(page: Page): Promise<void> {
  await sel.homeSettings(page).click();
  await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
  await expect(sel.shopRow(page)).toBeVisible({ timeout: 8_000 });
  await sel.shopRow(page).click();
  await expect(page.locator('[data-overlay="shop"]')).toBeVisible();
}

/** Closes every overlay with Esc (the shop sits on Settings). */
async function closeOverlays(page: Page): Promise<void> {
  await expect(async () => {
    if ((await appState(page)).overlays.length > 0) await page.keyboard.press('Escape');
    expect((await appState(page)).overlays).toEqual([]);
  }).toPass({ timeout: 5_000 });
}

/** The leaderboard band encoding, written out from the spec (§4.3), not the app's encoder. */
const PERIOD_SPAN = 100_000;
/** UTC week index of `at` from cfg.rank.periodEpoch 2026-01-05, a Monday (spec §3.5). */
const weekIndexAt = (at: number): number => {
  const d = new Date(at);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(2026, 0, 5)) / 86_400_000 / 7);
};
const pageNow = (page: Page): Promise<number> => page.evaluate(() => Date.now());

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
  test('no banner call before 10 completed levels, on Home, the game screen (no band) or the victory screen', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(6, 5) } });
    await expect(sel.playButton(page)).toBeVisible();
    await page.waitForTimeout(800);
    await startLevel(page);
    await expect(page.locator('.screen--game')).not.toHaveAttribute('data-banner', '');
    await solve(page);
    await toVictory(page);
    await page.waitForTimeout(800);
    expect(await count(page, 'loadBannerAdAsync')).toBe(0);
    await expect(page.getByTestId('fb-stub-banner')).toHaveCount(0);
  });

  test('duringPlay off (?bannerPlay=0, the 2b rule): banner on Home and on the victory screen from level 11, with the 58 px reserve; none while the game screen shows', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { data: { save: seededSave(11, 10) } }, { clockAt: t0, query: NO_PLAY_BANNER });
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

test.describe('FBIG rankings (phase2b §5, phase2c §4)', () => {
  test('classic leaderboard: this week\'s fish reach e2e_period_points as week × 100 000 + 3; the panel shows "Your rank: #1"', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(5, 4) } });
    await startLevel(page);
    await solve(page, { slow: true }); // no mistake: the 3 fish are kept
    await expect.poll(() => stub(page, (s) => s.calls.filter((c) => c.name === 'leaderboard.setScoreAsync').map((c) => c.args[0])), { timeout: 8_000 }).toEqual([
      'e2e_period_points',
    ]);
    const expected = weekIndexAt(await pageNow(page)) * PERIOD_SPAN + 3;
    expect(await stub(page, (s) => s.find('leaderboard.setScoreAsync')[0]?.args[1])).toBe(expected);
    expect(await stub(page, (s) => s.leaderboard('e2e_period_points'))).toEqual([expect.objectContaining({ playerId: 'stub-player-1', score: expected })]);
    // paw_points is retired and daily_fastest off: nothing else is submitted.
    expect(await stub(page, (s) => s.calls.filter((c) => c.name === 'getLeaderboardAsync').map((c) => c.args[0]))).toEqual(['e2e_period_points']);
    expect((await appState(page)).save.period.total).toBe(3);
    await expect(page.getByRole('dialog').getByText(/^Your rank: #1$/)).toBeVisible({ timeout: 10_000 });
  });

  test('NEZP leaderboard: the week\'s total is posted by id; the panel shows "Your score: 3 fish", never a rank', async ({ page }) => {
    await openGame(page, { presets: ['lb-nezp'], data: { save: seededSave(5, 4) } });
    await startLevel(page);
    await solve(page, { slow: true });
    await expect
      .poll(() => stub(page, (s) => s.calls.filter((c) => c.name === 'globalLeaderboards.setScoreAsync').map((c) => c.args[0])), { timeout: 8_000 })
      .toEqual(['e2e_period_points']);
    expect(await stub(page, (s) => s.find('globalLeaderboards.setScoreAsync')[0]?.args[1])).toBe(weekIndexAt(await pageNow(page)) * PERIOD_SPAN + 3);
    await expect(page.getByRole('dialog').getByText(/^Your score: 3 fish$/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog').getByText(/Your rank/)).toHaveCount(0);
  });

  test('no leaderboard API: the personal period records only, no other players and no SDK leaderboard call', async ({ page }) => {
    await openGame(page, { presets: ['lb-none'], data: { save: seededSave(5, 4) } });
    await startLevel(page);
    await solve(page, { slow: true });
    await expect(sel.rankingTap(page)).toBeVisible({ timeout: 15_000 });
    const records = page.getByRole('dialog').locator('.rank-records[data-board="period"]');
    await expect(records).toBeVisible();
    await expect(records.getByText('This week', { exact: true })).toBeVisible();
    // Phase 2c.1 (D24): Total points replaced the retired Perfect streak row.
    await expect(records.getByText('Total points', { exact: true })).toBeVisible();
    await expect(records.getByText(/Perfect/)).toHaveCount(0);
    expect(await stub(page, (s) => s.calls.filter((c) => /eaderboard/i.test(c.name)).length)).toBe(0);
  });

  test('the week band: a future-dated entry and older weeks are skipped; 250 better players this week make me #251 (past 200 entries), and the list pins #251', async ({ page }) => {
    test.setTimeout(60_000);
    // Seeded relative to the stub clock (the page's): one device a week ahead, 250 players of this week
    // with 5 fish, three of last week with 99. My 3 fish come after all of this week's 5s.
    const entries = [
      { playerId: 'ahead', period: 1, total: 1 },
      ...Array.from({ length: 250 }, (_, i) => ({ playerId: `week-${i}`, period: 0, total: 5 })),
      ...Array.from({ length: 3 }, (_, i) => ({ playerId: `last-${i}`, period: -1, total: 99 })),
    ];
    await openGame(page, { persist: false, data: { save: seededSave(5, 4) }, leaderboards: { entries: { e2e_period_points: entries } } });
    await startLevel(page);
    await solve(page, { slow: true });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/^Your rank: #251$/)).toBeVisible({ timeout: 15_000 });
    const board = await stub(page, (s) => s.leaderboard('e2e_period_points'));
    expect(board.findIndex((r) => r.playerId === 'stub-player-1')).toBe(251); // 0-based: the board's own rank is 252
    await dialog.getByRole('button', { name: /See top players/i }).click();
    await expect.poll(() => count(page, 'overlayViews.createOverlayViewWithXMLString')).toBe(1);
    const rows = await stub(page, (s) =>
      (JSON.parse(String(s.find('overlayViews.createOverlayViewWithXMLString')[0]?.args[2])) as { rows: { rank: string; kind: string; score: string }[] }).rows,
    );
    expect(rows.slice(0, 10).map((r) => `${r.rank}:${r.kind}`)).toEqual(Array.from({ length: 10 }, (_, i) => `#${i + 1}:other`));
    expect(rows.slice(10).map((r) => `${r.rank}:${r.kind}`)).toEqual(['#251:mine']);
    expect(rows[10]?.score).toMatch(/\b3\b/);
  });
});

test.describe('FBIG purchases (phase2b §8, phase2c §5)', () => {
  test('the shop opens from Settings, sells the three products and has no swap section; buying hints_15 grants +15 hints and consumes once', async ({ page }) => {
    await openGame(page, { persist: false, data: { save: seededSave(5, 4, (s) => ({ ...s, stock: { hints: 2, kitties: 3 } })) } });
    // No "+" to the shop on Home any more (the fish pill is gone).
    await expect(page.locator('.screen--home .fish-pill__plus')).toHaveCount(0);
    await openShop(page);
    const sheet = page.locator('[data-overlay="shop"]');
    await expect(sheet.locator('.shop__section--buy')).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Buy / })).toHaveCount(3, { timeout: 8_000 });
    await expect(sheet.getByRole('button', { name: /^Buy (No Ads|Bulb Bundle|Kitty Basket), / })).toHaveCount(3);
    await expect(sheet.locator('.shop__section')).toHaveCount(1);
    await expect(sheet.getByText(/swap|fish/i)).toHaveCount(0);
    const buy = page.getByRole('button', { name: /^Buy Bulb Bundle, / });
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
    await openShop(page);
    await page.getByRole('button', { name: /^Buy No Ads, / }).click();
    await expect.poll(async () => (await appState(page)).save.purchases.noAds, { timeout: 8_000 }).toBe(true);
    await expect.poll(() => count(page, 'payments.consumePurchaseAsync')).toBe(1);
    await closeOverlays(page);
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

  test('iOS: no Shop row in Settings (nothing can be sold there), no payments call (FB2B-5 superseded)', async ({ page }) => {
    await openGame(page, { presets: ['ios'], data: { save: seededSave(5, 4) } });
    await sel.homeSettings(page).click();
    await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(sel.shopRow(page)).toBeHidden();
    await expect(page.locator('[data-overlay="settings"] .settings__removeads-link')).toBeHidden();
    await expect(page.locator('.screen--home .fish-pill__plus')).toHaveCount(0);
    expect(await count(page, 'payments.purchaseAsync')).toBe(0);
    expect(await count(page, 'payments.getCatalogAsync')).toBe(0);
  });

  // Lead (Phase 2c I-2, G3's gap): Messenger.com offers the payments API but onReady never fires. Once
  // iap.readyTimeoutMs (4 s) has passed since the session started, the Buy section is 'unavailable', so
  // Settings has no Shop row and no Remove ads row (spec §5.2 D9), and no catalogue is ever asked for.
  test('Messenger.com (payments never ready): no Shop row once iap.readyTimeoutMs has passed, no catalogue call', async ({ page }) => {
    await openGame(page, { presets: ['payments-never-ready'], data: { save: seededSave(5, 4) } }, { clockAt: Date.now() });
    await page.clock.fastForward(5_000);
    await sel.homeSettings(page).click();
    await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(sel.shopRow(page)).toBeHidden();
    await expect(page.locator('[data-overlay="settings"] .settings__removeads-link')).toBeHidden();
    expect(await count(page, 'payments.onReady')).toBeGreaterThan(0);
    expect(await count(page, 'payments.getCatalogAsync')).toBe(0);
    expect(await count(page, 'payments.purchaseAsync')).toBe(0);
  });

  test('a boot restore of an unconsumed retired fish_250 grants 10 hints + 3 kitties once and consumes it', async ({ page }) => {
    // persist: true (the default): the stub keeps its player data and purchases across the reload below.
    await openGame(page, { presets: ['unconsumed-fish-250'], data: { save: seededSave(5, 4, (s) => ({ ...s, stock: { hints: 2, kitties: 3 } })) } });
    await expect.poll(async () => (await appState(page)).save.stock, { timeout: 8_000 }).toEqual({ hints: 12, kitties: 6 });
    await expect.poll(() => count(page, 'payments.consumePurchaseAsync')).toBe(1);
    expect(await stub(page, (s) => s.find('payments.consumePurchaseAsync')[0]?.args[0])).toBe('stub-unconsumed-1-fish_250');
    expect((await appState(page)).save.purchases.tokens.some((t) => t.startsWith('fish_250|'))).toBe(true);
    expect(await stub(page, (s) => s.purchases().map((p) => [p.productID, p.isConsumed]))).toEqual([['fish_250', true]]);
    // The retired pack is never offered.
    await openShop(page);
    await expect(page.getByRole('button', { name: /^Buy / })).toHaveCount(3, { timeout: 8_000 });
    await closeOverlays(page);
    // Once: a reload grants nothing more (consumed, and recorded in the ledger).
    await page.waitForTimeout(800); // the debounced cloud write of the closing state
    await page.reload();
    await page.waitForFunction(() => (window as TestWindow).__fbStub?.state.started === true && !!(window as TestWindow).__mewdoku);
    await page.waitForTimeout(1_000);
    expect((await appState(page)).save.stock).toEqual({ hints: 12, kitties: 6 });
    expect(await count(page, 'payments.consumePurchaseAsync')).toBe(0);
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

test.describe('FBIG banners never in play with duringPlay off (?bannerPlay=0; review FB2B-1)', () => {
  // Real time on purpose: Playwright's clock.fastForward can fire the stub's slow-load timer before the
  // adapter's ads.readyTimeoutMs timeout and hide the bug.
  for (const playAfterMs of [1_000, 5_000]) {
    test(`a 6 s banner load (over ads.readyTimeoutMs): Play after ${playAfterMs / 1000} s, the late banner never shows on the game screen`, async ({ page }) => {
      test.setTimeout(60_000);
      await openGame(page, { persist: false, banner: { loadDelayMs: 6_000 }, data: { save: seededSave(12, 11) } }, { query: NO_PLAY_BANNER });
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
    await openGame(page, { persist: false, errors: { hideBannerAdAsync: ['NETWORK_FAILURE'] }, data: { save: seededSave(12, 11) } }, { query: NO_PLAY_BANNER });
    await expect(stubBanner(page)).toBeVisible();
    await startLevel(page);
    await expect.poll(() => count(page, 'hideBannerAdAsync'), { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
    await expect(stubBanner(page)).toHaveCount(0);
    expect((await appState(page)).screen).toBe('game');
  });

  test('a load that never settles is given up: the victory screen loads a banner again, and it is down before the interstitial', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, banner: { load: 'never' }, data: { save: seededSave(12, 11) } }, { clockAt: t0, query: NO_PLAY_BANNER });
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
  test('Home → Settings → Shop hides the Home banner; buying No Ads there keeps it down (re-based in 2c: no fish pill "+")', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(11, 10) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await expect(stubBanner(page)).toBeVisible();
    await stub(page, (s) => s.clearCalls());
    await openShop(page);
    await expect.poll(async () => (await appState(page)).overlays).toEqual(['settings', 'shop']);
    expect(await count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await expect(stubBanner(page)).toHaveCount(0);
    await page.getByRole('button', { name: /^Buy No Ads, / }).click();
    await expect.poll(async () => (await appState(page)).save.purchases.noAds, { timeout: 8_000 }).toBe(true);
    await closeOverlays(page);
    expect((await appState(page)).screen).toBe('home');
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

test.describe('FBIG shop states (review FB2B-3)', () => {
  test('a failed catalogue shows Retry (not an empty Buy section); Retry asks again and lists the three products', async ({ page }) => {
    // 2c: Settings asks for the catalogue to decide on its Shop row (an error still shows it: Retry),
    // and opening the shop asks again (FB2B-3), so every call fails until the test clears the queue.
    const failing = Array(6).fill('NETWORK_FAILURE');
    await openGame(page, { persist: false, payments: { errors: { getCatalogAsync: failing } }, data: { save: seededSave(5, 4) } });
    await openShop(page);
    const retry = page.locator('.shop__retry');
    await expect(retry).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /^Buy / })).toHaveCount(0);
    const asked = await count(page, 'payments.getCatalogAsync');
    expect(asked).toBeGreaterThanOrEqual(1);
    await configureStub(page, { payments: { errors: { getCatalogAsync: [] } } });
    await retry.click();
    await expect(page.getByRole('button', { name: /^Buy / })).toHaveCount(3, { timeout: 8_000 });
    expect(await count(page, 'payments.getCatalogAsync')).toBe(asked + 1);
  });
});

// ── review UX-3 / UX-9 (final integration): every dialog starts below FB's top-left 64 × 64 safe zone on
// the small phone, in a left-to-right and a mirrored (Arabic) layout; the marker is the real FBIG one. ──

for (const locale of ['en_US', 'ar_AR'] as const) {
  test.describe(`FBIG dialogs clear the safe zone at 320 × 568 (${locale}; reviews UX-3, UX-9)`, () => {
    test.use({ viewport: { width: 320, height: 568 } });

    test('Settings, About, How to play, the shop, in-game Settings and a top-placed hint card', async ({ page }) => {
      test.setTimeout(60_000);
      await openGame(page, { locale, persist: false, data: { save: seededSave(12, 11) } });
      await expect(page.locator('.home__play')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-fb-safe'))).toBe(true);
      if (locale === 'ar_AR') await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl');
      // A control counts where it can be seen and tapped: its box clipped by every scrolling ancestor
      // (a tall dialog scrolls inside its panel, which starts below the zone), and not under an inert
      // dialog (a lower dialog in the stack cannot take a tap).
      const zoneHits = (): Promise<string[]> =>
        page.evaluate(() => {
          const out: string[] = [];
          for (const el of Array.from(document.querySelectorAll<HTMLElement>('.overlay button, .overlay a[href]'))) {
            if (el.closest('[hidden], [inert]')) continue;
            const r = el.getBoundingClientRect();
            let top = r.top;
            let left = r.left;
            let bottom = r.bottom;
            let right = r.right;
            for (let a = el.parentElement; a; a = a.parentElement) {
              const cs = getComputedStyle(a);
              if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
              const c = a.getBoundingClientRect();
              top = Math.max(top, c.top);
              left = Math.max(left, c.left);
              bottom = Math.min(bottom, c.bottom);
              right = Math.min(right, c.right);
            }
            if (right - left <= 0 || bottom - top <= 0) continue;
            if (left < 64 && top < 64) out.push(`${el.className} [${Math.round(left)},${Math.round(top)}]`);
          }
          return out;
        });
      const settle = (): Promise<void> => page.waitForTimeout(350); // past the dialog's entry fade
      await page.locator('.screen--home .top-bar__btn--settings').click();
      await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
      await settle();
      expect(await zoneHits(), 'Settings').toEqual([]);
      await page.locator('[data-overlay="settings"] .settings__about-link').click();
      await settle();
      expect(await zoneHits(), 'Settings → About').toEqual([]);
      await page.keyboard.press('Escape');
      await settle();
      await page.locator('[data-overlay="settings"] .settings__howto-link').click();
      await expect(page.locator('[data-overlay="how_to_play"]')).toBeVisible();
      await settle();
      expect(await zoneHits(), 'How to play').toEqual([]);
      await page.keyboard.press('Escape'); // How to play
      await expect(page.locator('[data-overlay="how_to_play"]')).toBeHidden();
      // phase2c §5.2: the shop opens from Settings (no fish pill "+" on Home).
      await page.locator('[data-overlay="settings"] .settings__shop-link').click();
      await expect(page.locator('[data-overlay="shop"]')).toBeVisible();
      await settle();
      expect(await zoneHits(), 'Shop').toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-overlay="shop"]')).toBeHidden();
      await page.keyboard.press('Escape');
      await expect(page.locator('.overlay:visible')).toHaveCount(0);
      await page.locator('.home__play').click(); // locale-neutral (startLevel matches the English label)
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
      await page.locator('.screen--game .top-bar__btn--settings').click();
      await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
      await settle();
      expect(await zoneHits(), 'in-game Settings').toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-overlay="settings"]')).toBeHidden();
      // The hint card: on the small phone it flips above the board (the bottom slot would cover it).
      await page.locator('.screen--game .tool--bulb').click();
      const card = page.locator('[data-overlay="hint"]');
      await expect(card).toBeVisible();
      await settle();
      const placement = await card.getAttribute('data-placement');
      expect(placement).toBe('top');
      const rowTop = await card.locator('.hint-card__row').evaluate((el) => el.getBoundingClientRect().top);
      expect(rowTop, 'top-placed hint card row').toBeGreaterThanOrEqual(64);
      expect(await zoneHits(), `hint card (${placement})`).toEqual([]);
    });
  });
}


// ─────────────────────────── Phase 2d §1.16: the banner during play ───────────────────────────

/** The game screen's helper row and the FB stub's bar (the native banner overlays the webview's bottom). */
const helpersClearOfStubBanner = async (page: Page): Promise<void> => {
  const bar = await stubBanner(page).boundingBox();
  if (!bar) throw new Error('no stub banner');
  const bottoms = await page.locator('.screen--game .tool-bar .tool:not([data-off])').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  expect(bottoms.length).toBeGreaterThanOrEqual(3);
  for (const b of bottoms) expect(b).toBeLessThanOrEqual(bar.y + 0.5);
};

test.describe('FBIG banner during play (phase 2d §1.16, D-2d-15)', () => {
  test('from 10 completed levels: the band from mount, the banner after the board entry; a Home banner stays into the board', async ({ page }) => {
    await openGame(page, { persist: false, data: { save: seededSave(11, 10) } });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1); // Home
    await expect(stubBanner(page)).toBeVisible();
    await stub(page, (s) => s.clearCalls());
    await startLevel(page);
    await expect(page.locator('.screen--game')).toHaveAttribute('data-banner', '');
    expect((await appState(page)).session?.bannerBand).toBe(true);
    // Banner to banner: no hide on the way in, and no second load inside the 60 s window.
    expect(await count(page, 'hideBannerAdAsync')).toBe(0);
    expect(await count(page, 'loadBannerAdAsync')).toBe(0);
    await expect(stubBanner(page)).toBeVisible();
    await helpersClearOfStubBanner(page);
  });

  test('a fresh banner on the game screen once the reload window has passed; Settings hides it and closing does not bring it back', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(12, 11) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    // Home → Settings hides it (a modal), then 61 s later the board loads its own.
    await sel.homeSettings(page).click();
    await expect.poll(() => count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await closeOverlays(page);
    await page.clock.fastForward(61_000);
    await stub(page, (s) => s.clearCalls());
    await startLevel(page);
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1); // at the entry's end
    await expect(stubBanner(page)).toBeVisible();
    await helpersClearOfStubBanner(page);
    // Settings over the game hides it; closing it, even after the window, does not reload on this screen.
    await page.locator('.screen--game .top-bar__btn--settings').click();
    await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
    await expect.poll(() => count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await expect(stubBanner(page)).toHaveCount(0);
    await page.clock.fastForward(61_000);
    await closeOverlays(page);
    await page.waitForTimeout(300);
    expect(await count(page, 'loadBannerAdAsync')).toBe(1);
    await expect(stubBanner(page)).toHaveCount(0);
  });

  test("the mouse's video: the banner is hidden before the rewarded ad shows", async ({ page }) => {
    await openGame(page, { persist: false, data: { save: seededSave(12, 11) } });
    await expect(stubBanner(page)).toBeVisible();
    await startLevel(page);
    await expect(stubBanner(page)).toBeVisible();
    await stub(page, (s) => s.clearCalls());
    await page.locator('.screen--game .tool--mouse').click();
    await sel.watchVideo(page).click();
    const marks = (): Promise<number> =>
      page.evaluate(() => Array.from((window as TestWindow).__mewdoku?.state()?.cells ?? []).filter((v) => v === 1).length);
    await expect.poll(marks, { timeout: 15_000 }).toBe(3);
    const shows = await seqOf(page, 'ad.showAsync', 'rewarded');
    const hides = await seqOf(page, 'hideBannerAdAsync');
    expect(shows.length).toBe(1);
    expect(hides.some((h) => h < (shows[0] ?? 0))).toBe(true);
    await expect(stubBanner(page)).toHaveCount(0);
  });

  test('persistence from the victory into the next board (the interstitial gated by its cooldown): no hide, no reload', async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    // lastAdAt now: the 90 s cooldown gates the next_level interstitial during this test.
    await openGame(page, { persist: false, data: { save: seededSave(12, 11, (s) => ({ ...s, ads: { ...s.ads, lastAdAt: t0 } })) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await startLevel(page);
    await page.clock.fastForward(61_000);
    await solve(page, { clock: true });
    await page.clock.fastForward(5_000);
    await toVictory(page);
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(2); // the victory's own
    await expect(stubBanner(page)).toBeVisible();
    await stub(page, (s) => s.clearCalls());
    await sel.victoryNext(page).click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    expect(await count(page, 'ad.showAsync')).toBe(0); // gated
    expect(await count(page, 'hideBannerAdAsync')).toBe(0); // banner to banner: kept
    await expect(stubBanner(page)).toBeVisible();
    await expect(page.locator('.screen--game')).toHaveAttribute('data-banner', '');
  });

  test('an interstitial between the victory and the next board: the banner is down before it shows', async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(12, 11) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await startLevel(page);
    await page.clock.fastForward(61_000); // past the session grace and the banner window
    await solve(page, { clock: true });
    await page.clock.fastForward(5_000);
    await toVictory(page);
    await expect(stubBanner(page)).toBeVisible();
    await stub(page, (s) => s.clearCalls());
    await sel.victoryNext(page).click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    const shows = await seqOf(page, 'ad.showAsync', 'interstitial');
    const hides = await seqOf(page, 'hideBannerAdAsync');
    expect(shows.length).toBe(1);
    expect(hides.some((h) => h < (shows[0] ?? 0))).toBe(true);
  });

  test('FB2B-1 kept: a slow load still in flight when Settings opens over the game is hidden when it lands', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page, { persist: false, banner: { loadDelayMs: 6_000 }, data: { save: seededSave(12, 11) } });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await startLevel(page);
    await page.locator('.screen--game .top-bar__btn--settings').click();
    await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
    await page.waitForTimeout(7_000); // the load lands at about 6 s
    expect(await count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await expect(stubBanner(page)).toHaveCount(0);
  });
});

// ── Phase 2d §1.1: the game screen keeps the FB safe zone clear (the back disc moves; in Arabic the gear) ──

for (const locale of ['en_US', 'ar_AR'] as const) {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ] as const) {
    test(`FBIG game screen at ${viewport.width} × ${viewport.height} (${locale}): no control in the top-left 64 × 64; the Level column clear of the discs`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openGame(page, { locale, persist: false, data: { save: seededSave(12, 11) } });
      await page.locator('.home__play').click();
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const hits: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('.screen--game button, .screen--game [role="button"], .screen--game a[href]'))) {
          if (el.closest('[hidden], [inert], [data-off]')) continue;
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) continue;
          if (b.left < 64 && b.top < 64) hits.push(`${el.className} [${Math.round(b.left)},${Math.round(b.top)}]`);
        }
        const box = (q: string) => document.querySelector(q)?.getBoundingClientRect() ?? null;
        return {
          hits,
          level: box('.screen--game .top-bar__text'),
          score: box('.screen--game .top-bar--game .points-pill'),
          back: box('.screen--game .top-bar__btn--home'),
          gear: box('.screen--game .top-bar__btn--settings'),
          rtl: document.documentElement.dir === 'rtl',
        };
      });
      expect(r.hits).toEqual([]);
      if (!r.level || !r.back || !r.gear) throw new Error('missing a bar part');
      // The Level column never overlaps either disc (LTR: back at the left; RTL: mirrored).
      const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5;
      expect(overlaps(r.level, r.back)).toBe(false);
      expect(overlaps(r.level, r.gear)).toBe(false);
      if (r.score) {
        expect(overlaps(r.score, r.back)).toBe(false);
        expect(overlaps(r.score, r.gear)).toBe(false);
      }
    });
  }
}
