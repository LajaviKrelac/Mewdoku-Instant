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
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §3.2, §7.7, D-2d1-13): the hint card hides the banner;
// after it closes a new banner loads at once when ads.banner.minReloadSec has passed, else once when
// the window ends (the stub's clock), never by a second load inside the window.
// Phase 2e (G1, docs/phase2e/spec.md §2.10, §1.3, §10.3): the FB weekly board is retired (rank.fbPeriodBoard
// false): the 2b/2c tests of period_points (classic "Your rank", NEZP "Your score", the week band) became
// one test that a win never writes or reads it; the win flow signs in through getSignedPlayerInfoAsync
// (the stub signs with the e2e FB test secret) and the panel lists my real bracket (its own test pool and a
// rival made through the public API); without the identity API the build uses no ranking origin at all.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { cfg } from '../../src/app/config';
import type { AppState } from '../../src/app/store';
import { defaults } from '../../src/game/save';
import type { SaveData } from '../../src/game/types';
import { devSwitches, fbPlayer, LADDER_URL, ladderUp, newPool } from './helpers/rank-players';
import { watchStrings } from './helpers/strings';

// Phase 2e I-4: no screen of these tests may ask for an English string that no loaded table has.
watchStrings(test);

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

  // 2026-10-12: the safe zone is flag fbSafeZone (off by default; the FB app's bar sits above the game). These checks
  // keep the rule working for when it is turned on.
  const SAFE = { query: '?flags=fbSafeZone' };

  test('by default (no safe zone) the profile picture and the back arrow sit at the top left, as on the web', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(12, 11) } });
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-fb-safe'))).toBe(false);
    const profile = (await page.locator('.screen--home .home__profile').boundingBox())!;
    expect(profile.x).toBeLessThan(30);
    await startLevel(page);
    const back = (await page.locator('.screen--game .top-bar__btn--back').boundingBox())!;
    expect(back.x).toBeLessThan(64);
  });

  test('the FB safe zone holds no control on Home or in a level', async ({ page }) => {
    await openGame(page, { data: { save: seededSave(12, 11) } }, SAFE);
    expect(await page.evaluate(() => document.getElementById('app')?.dataset.platform)).toBe('fbig');
    // Phase 2e §2.5: the ranking chip (a button) sits in the top bar's lead slot, after the safe zone.
    await expect(page.locator('.screen--home button.ladder-chip')).toBeVisible();
    expect(await safeZoneHits(page)).toEqual([]);
    await startLevel(page);
    expect(await safeZoneHits(page)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a first run boots straight into the tutorial with the safe zone clear', async ({ page }) => {
    await openGame(page, {}, SAFE);
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

test.describe('FBIG rankings (Phase 2e §2.10: the FB weekly board retired; the worldwide ranking)', () => {
  const sdkBoardCalls = (page: Page) =>
    stub(page, (s) => s.calls.filter((c) => /setScoreAsync|getLeaderboardAsync|getEntriesAsync|getPlayerEntryAsync/.test(c.name)).map((c) => `${c.name}:${String(c.args[0])}`));

  test('a win signs in with getSignedPlayerInfoAsync and shows my bracket; the retired FB period board is never written or read', async ({ page }) => {
    test.skip(!(await ladderUp()), `no ranking server at ${LADDER_URL}`);
    const pool = newPool('fbl1');
    const rival = await fbPlayer(pool);
    await rival.win([2, 3, 4]);
    await openGame(page, { presets: [`player:${pool.replace(/-/g, '')}`], data: { save: seededSave(5, 4) } }, { query: `?ladderPool=${pool}` });
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 });
    expect(await count(page, 'player.getSignedPlayerInfoAsync')).toBeGreaterThanOrEqual(1);
    await startLevel(page);
    await page.waitForTimeout(5_000); // past the server's solve floor
    await solve(page);
    const list = page.locator('.overlay[data-overlay="ranking"] .rank-list[data-kind="bracket"]');
    await expect(list).toBeVisible({ timeout: 15_000 });
    const ui = await list.locator('ol.rank-rows > li.rank-row').evaluateAll((els) =>
      els.map((el) => [el.getAttribute('data-rank'), el.querySelector('.rank-row__name')?.textContent?.replace(/\u00A0/g, ' ').trim() ?? '', el.getAttribute('data-me')]),
    );
    const server = await rival.bracket();
    expect(ui).toEqual(server.rows.map((r) => [String(r.rank), r.nickname, r.me ? '0' : '1']));
    // D-2e-4: no FB leaderboard call for the period board (the event boards keep theirs).
    expect((await sdkBoardCalls(page)).filter((c) => c.includes('period_points'))).toEqual([]);
    expect((await appState(page)).save.rank.pending).not.toHaveProperty('period_points');
  });

  test("no signed player info ('no-signed-info'): no ranking origin, my period records, not one request to it and no SDK leaderboard call", async ({ page }) => {
    const sent: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith(LADDER_URL)) sent.push(r.url());
    });
    await openGame(page, { presets: ['no-signed-info', 'lb-none'], data: { save: seededSave(5, 4) } });
    await startLevel(page);
    await solve(page, { slow: true });
    await expect(sel.rankingTap(page)).toBeVisible({ timeout: 15_000 });
    const records = page.getByRole('dialog').locator('.rank-records[data-board="period"]');
    await expect(records).toBeVisible();
    await expect(records.getByText('This week', { exact: true })).toBeVisible();
    await expect(records.getByText('Total points', { exact: true })).toBeVisible();
    expect(await stub(page, (s) => s.calls.filter((c) => /eaderboard/i.test(c.name)).length)).toBe(0);
    expect((await appState(page)).save.ladder.pending).toEqual([]);
    expect(sent).toEqual([]);
  });
});

test.describe('FBIG Phase 2e: buying helpers on the out-of-helpers card (spec §4.1–§4.4)', () => {
  const o2 = (page: Page) => page.locator('.overlay[data-overlay="rewarded"]');
  async function outOfHints(page: Page, stubConfig: Record<string, unknown> = {}, opts: LoadOpts = {}): Promise<void> {
    await openGame(page, { persist: false, ...stubConfig, data: { save: seededSave(5, 4, (s) => ({ ...s, stock: { hints: 0, kitties: 3 } })) } }, opts);
    await startLevel(page);
    await sel.hintTool(page).click();
    await expect(o2(page)).toBeVisible();
  }

  test('O2 Buy: the Bulb Bundle and No Ads rows with the store prices; the pack bought → +15, one used at once (14 left), the hint card opens; consumed once', async ({ page }) => {
    await outOfHints(page);
    const buy = o2(page).locator('button.rewarded__buy[data-product="hints_15"]');
    await expect(buy).toHaveAttribute('data-state', 'ready', { timeout: 8_000 });
    await expect(o2(page).locator('button.rewarded__buy')).toHaveCount(2);
    await expect(buy).toContainText('$1.99');
    await expect(o2(page).locator('button.rewarded__buy[data-product="remove_ads"]')).toContainText('$3.99');
    await buy.click();
    await expect.poll(async () => (await appState(page)).save.stock.hints, { timeout: 8_000 }).toBe(14);
    await expect(page.locator('.overlay[data-overlay="hint"]')).toBeVisible();
    expect((await appState(page)).overlays).not.toContain('rewarded');
    expect(await count(page, 'payments.consumePurchaseAsync')).toBe(1);
    expect(await stub(page, (s) => s.calls.filter((c) => c.name === 'ad.showAsync').length)).toBe(0); // no video
    const s = (await appState(page)).save;
    expect(s.purchases.tokens.some((t) => t.startsWith('hints_15|'))).toBe(true);
    expect(s.purchases.pending).toEqual([]);
  });

  test('O2 Buy, the grant order (iap.grantBeforeConsume; consume first after the L1 flip, D-2e-10): while FB consumes, the save shows the order', async ({ page }) => {
    await outOfHints(page, { payments: { consumeDelayMs: 2_000 } });
    const buy = o2(page).locator('button.rewarded__buy[data-product="hints_15"]');
    await expect(buy).toHaveAttribute('data-state', 'ready', { timeout: 8_000 });
    await buy.click();
    await expect.poll(() => count(page, 'payments.consumePurchaseAsync'), { timeout: 8_000 }).toBe(1);
    const during = (await appState(page)).save;
    const granted = during.purchases.tokens.some((t) => t.startsWith('hints_15|'));
    if (cfg.iap.grantBeforeConsume) {
      // 2b's order (today's value): recorded and granted before the consume.
      expect(granted).toBe(true);
      expect(during.stock.hints).toBe(15);
      expect(during.purchases.pending).toEqual([]);
    } else {
      // Consume first: the token sits in the intent ledger (saved), nothing granted yet.
      expect(granted).toBe(false);
      expect(during.stock.hints).toBe(0);
      expect(during.purchases.pending).toHaveLength(1);
      expect(during.purchases.pending[0]).toMatch(/^hints_15\|stub-token-/);
      const mirrored = await page.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? '').find((v) => v.includes('stub-token-')) ?? '');
      expect(mirrored).toContain('stub-token-'); // the critical save's local mirror holds the intent
    }
    await expect.poll(async () => (await appState(page)).save.stock.hints, { timeout: 8_000 }).toBe(14);
    const after = (await appState(page)).save;
    expect(after.purchases.pending).toEqual([]);
    expect(after.purchases.tokens.some((t) => t.startsWith('hints_15|'))).toBe(true);
    expect(await count(page, 'payments.consumePurchaseAsync')).toBe(1);
  });

  test("FB's purchase dialog pauses the level's timer (pause 'purchase', spec §4.3)", async ({ page }) => {
    await outOfHints(page, { payments: { purchaseDelayMs: 3_000 } });
    const noAds = o2(page).locator('button.rewarded__buy[data-product="remove_ads"]');
    await expect(noAds).toHaveAttribute('data-state', 'ready', { timeout: 8_000 });
    const elapsed = (): Promise<number> => page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.elapsedMs ?? -1);
    const e0 = await elapsed();
    const t0 = Date.now();
    await noAds.click();
    await expect(o2(page).locator('button.rewarded__buy[data-state="busy"]')).toHaveCount(1);
    await expect.poll(async () => (await appState(page)).save.purchases.noAds, { timeout: 10_000 }).toBe(true);
    const real = Date.now() - t0;
    const e1 = await elapsed();
    expect(real).toBeGreaterThanOrEqual(3_000);
    expect(e1 - e0).toBeLessThan(real - 2_000); // the 3 s dialog did not count
  });

  test('O2 at 320 × 568 with both Buy rows and the No Ads line: every control inside the screen (or the card scrolls), at least 44 × 44', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await outOfHints(page);
    await expect(o2(page).locator('button.rewarded__buy[data-product="hints_15"]')).toHaveAttribute('data-state', 'ready', { timeout: 8_000 });
    await expect(o2(page).locator('.rewarded__buy-note')).toBeVisible();
    // Measure the card at rest: its pop-in starts at scale 0.97, and the bounding boxes include the transform.
    await page.waitForFunction(() => {
      const panel = document.querySelector('.overlay[data-overlay="rewarded"] .overlay__panel');
      return !!panel && panel.getAnimations({ subtree: true }).every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity);
    });
    const report = await page.evaluate(() => {
      const root = document.querySelector('.overlay[data-overlay="rewarded"]') as HTMLElement;
      const panel = root.querySelector('.overlay__panel') as HTMLElement | null;
      const scrolls = !!panel && panel.scrollHeight > panel.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(panel).overflowY);
      const out: { cls: string; w: number; h: number; inside: boolean }[] = [];
      for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('button'))) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        out.push({ cls: b.className, w: r.width, h: r.height, inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5 });
      }
      return { scrolls, buttons: out, overflowX: document.documentElement.scrollWidth - innerWidth };
    });
    expect(report.overflowX).toBeLessThanOrEqual(0);
    expect(report.buttons.length).toBeGreaterThanOrEqual(4); // video, two Buy rows, Not now
    for (const b of report.buttons) {
      expect(b.w, b.cls).toBeGreaterThanOrEqual(44);
      expect(b.h, b.cls).toBeGreaterThanOrEqual(44);
      if (!report.scrolls) expect(b.inside, b.cls).toBe(true);
    }
  });

  test('O2 No Ads: the entitlement at once, O2 stays open without its row (it gave no helper)', async ({ page }) => {
    await outOfHints(page);
    const noAds = o2(page).locator('button.rewarded__buy[data-product="remove_ads"]');
    await expect(noAds).toHaveAttribute('data-state', 'ready', { timeout: 8_000 });
    await noAds.focus();
    await noAds.press('Enter'); // a keyboard user (audit B5)
    await expect.poll(async () => (await appState(page)).save.purchases.noAds, { timeout: 8_000 }).toBe(true);
    await expect(o2(page)).toBeVisible();
    await expect(o2(page).locator('button.rewarded__buy')).toHaveCount(1);
    await expect(o2(page).locator('button.rewarded__buy[data-product="hints_15"]')).toBeVisible();
    // Audit B5: the focused row left; the focus is on Watch video, never dropped to <body>.
    await expect(o2(page).locator('.rewarded__accept')).toBeFocused();
    expect((await appState(page)).save.stock.hints).toBe(0);
    await expect(stubBanner(page)).toHaveCount(0); // banners stop at once
    // The next level's interstitial is gated no_ads (logged with its gate, never shown).
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await appState(page)).overlays).toEqual([]);
    await solve(page);
    await toVictory(page);
    await sel.victoryNext(page).click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    expect(await stub(page, (s) => s.calls.filter((c) => c.name === 'ad.showAsync' && c.args[0] === 'interstitial').length)).toBe(0);
    const logged = await stub(page, (s) => s.calls.filter((c) => c.name === 'logEvent' && c.args[0] === 'ad_interstitial').map((c) => c.args[2]));
    expect(logged).toContainEqual(expect.objectContaining({ trigger: 'next_level', result: 'gated', gate: 'no_ads' }));
  });

  test('iOS: no Buy row with the iOS switch off (the build default); the remote switch iapIos on brings the rows', async ({ page }) => {
    await outOfHints(page, { presets: ['ios'] });
    await page.waitForTimeout(1_000);
    await expect(o2(page).locator('button.rewarded__buy')).toHaveCount(0);
    expect(await count(page, 'payments.getCatalogAsync')).toBe(0);
    test.skip(!(await ladderUp()), `no ranking server at ${LADDER_URL} (the remote switches)`);
    const pool = newPool('fbios');
    await devSwitches(pool, { iapIos: true });
    const page2 = await page.context().newPage();
    // The first page cached its pool-less answer (localStorage['mewdoku.rc.v1'], ladder.ttlSec): start clean.
    await page2.addInitScript(() => localStorage.removeItem('mewdoku.rc.v1'));
    await outOfHints(page2, { presets: ['ios'] }, { query: `?ladderPool=${pool}` });
    await expect.poll(() => page2.evaluate(() => (window as TestWindow).__mewdoku?.remote?.()), { timeout: 10_000 }).toEqual({ iapIos: true });
    // The open card re-reads its rows when the catalogue arrives; reopen it to read them after the switch.
    await page2.keyboard.press('Escape');
    await expect.poll(async () => (await appState(page2)).overlays).toEqual([]);
    await sel.hintTool(page2).click();
    await expect(o2(page2).locator('button.rewarded__buy[data-product="hints_15"]')).toHaveAttribute('data-state', 'ready', { timeout: 8_000 });
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

    test('Settings, About, How to play, the shop, in-game Settings and the board-anchored hint card (2d.1)', async ({ page }) => {
      test.setTimeout(60_000);
      await openGame(page, { locale, persist: false, data: { save: seededSave(12, 11) } }, { query: '?flags=fbSafeZone' });
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
      // 2d.1 §3.2, §3.5, §4.8: the hint card is anchored to the board (over the rule cards), so it starts
      // below the top bar and the zone at 320 × 568 with the band (card y ≈ 80–130); the 2b sheet
      // placement ([data-placement]) is retired.
      await page.locator('.screen--game .tool--bulb').click();
      const hint = page.locator('[data-overlay="hint"]');
      await expect(hint.locator('.hint-card')).toBeVisible();
      await settle();
      expect(await hint.getAttribute('data-placement')).toBeNull();
      const cardTop = await hint.locator('.hint-card').evaluate((el) => el.getBoundingClientRect().top);
      expect(cardTop, 'the hint card below the zone').toBeGreaterThanOrEqual(64);
      expect(await zoneHits(), 'hint card').toEqual([]);
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

  test('a fresh banner on the game screen once the reload window has passed; Settings hides it and (2e) closing brings it back, once', async ({ page }) => {
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
    // Settings over the game hides it; Phase 2e (§3.1, ads.banner.reshowAfterAnyHide): closing it after the
    // window brings a new one at once (2d kept it down until the next screen), and only one.
    await page.locator('.screen--game .top-bar__btn--settings').click();
    await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
    await expect.poll(() => count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await expect(stubBanner(page)).toHaveCount(0);
    await page.clock.fastForward(61_000);
    await closeOverlays(page);
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(2);
    await expect(stubBanner(page)).toBeVisible();
    await helpersClearOfStubBanner(page);
    await page.clock.fastForward(180_000);
    await page.waitForTimeout(300);
    expect(await count(page, 'loadBannerAdAsync')).toBe(2);
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

  // Phase 2d.1 §3.2 (D-2d1-13): the banner hides while the hint card is open; after it closes it loads
  // again at once when ads.banner.minReloadSec has passed, else once when the window ends.
  test('2d.1: the hint hides the banner; closed inside the window, one new load when the window ends (the stub clock), never a second', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(12, 11) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1); // Home, at t0
    await startLevel(page); // banner to banner: it stays, no reload inside the window
    await expect(stubBanner(page)).toBeVisible();
    await stub(page, (s) => s.clearCalls());
    await page.locator('.screen--game .tool--bulb').click();
    await expect(page.locator('.overlay[data-overlay="hint"]')).toBeVisible();
    await expect.poll(() => count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    await expect(stubBanner(page)).toHaveCount(0);
    await page.clock.fastForward(10_000);
    await page.keyboard.press('Escape'); // closes the hint (the 2b close paths stay)
    await expect(page.locator('.overlay[data-overlay="hint"] .hint-card')).toBeHidden();
    await expect.poll(async () => (await appState(page)).overlays.includes('hint')).toBe(false);
    await page.waitForTimeout(300);
    expect(await count(page, 'loadBannerAdAsync')).toBe(0); // inside Meta's 60 s window: not yet
    await expect(stubBanner(page)).toHaveCount(0);
    await page.clock.fastForward(60_000); // past the window that started at t0
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await expect(stubBanner(page)).toBeVisible();
    await helpersClearOfStubBanner(page);
    await page.clock.fastForward(180_000);
    await page.waitForTimeout(300);
    expect(await count(page, 'loadBannerAdAsync')).toBe(1); // one timer per close, no retry loop
  });

  test('2d.1: the hint closed (Apply) after the reload window: a new banner at once', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(12, 11) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await startLevel(page);
    await page.clock.fastForward(61_000);
    await stub(page, (s) => s.clearCalls());
    await page.locator('.screen--game .tool--bulb').click();
    await expect(page.locator('.overlay[data-overlay="hint"]')).toBeVisible();
    await expect.poll(() => count(page, 'hideBannerAdAsync')).toBeGreaterThanOrEqual(1);
    expect(await count(page, 'loadBannerAdAsync')).toBe(0);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await expect(stubBanner(page)).toBeVisible();
    expect((await stub(page, (s) => s.find('loadBannerAdAsync')[0]?.args)) ?? []).toEqual(['e2e-banner', 'bottom']);
  });

  test('persistence from the victory into the next board (the interstitial gated by its cooldown): no hide, no reload', async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    // lastAdAt at the level's start (t0 + the 61 s jump below): the floor between full-screen ads
    // (ads.interstitial.cooldownSec, 30 s since the 2e L1 flip; it was a 90 s tenure step when this test was written
    // with lastAdAt = t0) still gates the next_level interstitial when Next is tapped a few seconds later.
    await openGame(page, { persist: false, data: { save: seededSave(12, 11, (s) => ({ ...s, ads: { ...s.ads, lastAdAt: t0 + 61_000 } })) } }, { clockAt: t0 });
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

// ── Phase 2d §1.1: with the safe zone on, the game screen keeps it clear (the back disc moves; in Arabic the gear) ──

for (const locale of ['en_US', 'ar_AR'] as const) {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ] as const) {
    test(`FBIG game screen at ${viewport.width} × ${viewport.height} (${locale}): no control in the top-left 64 × 64; the Level column clear of the discs`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // 2026-10-12: with flag fbSafeZone (off by default).
      await openGame(page, { locale, persist: false, data: { save: seededSave(12, 11) } }, { query: '?flags=fbSafeZone' });
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

// ── Phase 2e (G1, spec §3.1–§3.2, §10.3 fbig): the ad cadence and the banner during levels. The values come
// from cfg (fromCompletedLevels, the cooldown table, retryEveryN), so these stay right through the L1 flips
// (10 → 9, [120/100/90 s] → [30 s]). ──

const interstitials = (page: Page): Promise<number> => stub(page, (s) => s.calls.filter((c) => c.name === 'ad.showAsync' && c.args[0] === 'interstitial').length);

/** Three wrong cats → the fail card. */
async function failBoard(page: Page): Promise<void> {
  const cols = (await page.evaluate(() => (window as TestWindow).__mewdoku!.solution())) ?? [];
  let made = 0;
  for (let row = 0; row < cols.length && made < 3; row++) {
    const col = ((cols[row] as number) + 2) % cols.length; // never this row's cat
    await sel.cell(page, row, col).dblclick();
    await page.waitForTimeout(400); // the cell lock after a cat
    made++;
  }
  await expect(page.locator('[data-overlay="fail"] .fail__retry')).toBeEnabled({ timeout: 8_000 });
}

test.describe('FBIG Phase 2e: the ad cadence and the banner during levels', () => {
  // Two tests: one browser context shares localStorage (the save's local mirror), so a second page would
  // merge the first page's progress.
  test('the first banner comes on the board after ads.banner.fromCompletedLevels completed levels (level 10\'s board after the L1 flip)', async ({ page }) => {
    const F = cfg.ads.banner.fromCompletedLevels;
    await openGame(page, { persist: false, data: { save: seededSave(F + 1, F) } });
    await startLevel(page);
    await expect(page.locator('.screen--game')).toHaveAttribute('data-banner', '');
    await expect(stubBanner(page)).toBeVisible();
  });

  test('one completed level fewer: no band on the board and no banner call', async ({ page }) => {
    const F = cfg.ads.banner.fromCompletedLevels;
    await openGame(page, { persist: false, data: { save: seededSave(F, F - 1) } });
    await startLevel(page);
    await page.waitForTimeout(1_000);
    await expect(page.locator('.screen--game')).not.toHaveAttribute('data-banner', '');
    expect(await count(page, 'loadBannerAdAsync')).toBe(0);
  });

  test("a first run's tutorial board: no band, no banner call", async ({ page }) => {
    await openGame(page, {});
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().session?.mode === 'tutorial');
    await page.waitForTimeout(1_500);
    expect(await count(page, 'loadBannerAdAsync')).toBe(0);
    await expect(page.locator('.screen--game')).not.toHaveAttribute('data-banner', '');
  });

  test('every level from the start level: three levels in a row, each followed by an interstitial once the floor between full-screen ads has passed', async ({ page }) => {
    test.setTimeout(180_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    const floorMs = (Math.max(...cfg.ads.interstitial.cooldownSec.map((x) => x.sec)) + 1) * 1000;
    await openGame(page, { persist: false, data: { save: seededSave(15, 14) } }, { clockAt: t0 });
    await startLevel(page);
    for (let i = 1; i <= 3; i++) {
      await page.clock.fastForward(Math.max(floorMs, (cfg.ads.interstitial.sessionGraceSec + 1) * 1000));
      await solve(page);
      await page.clock.fastForward(5_000);
      await toVictory(page);
      await sel.victoryNext(page).click();
      await expect.poll(() => interstitials(page), { timeout: 10_000 }).toBe(i);
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', undefined, { timeout: 15_000 });
    }
  });

  test('Retry: an interstitial on every ads.interstitial.retryEveryN-th Retry only (P-I4)', async ({ page }) => {
    test.setTimeout(120_000);
    const n = cfg.ads.interstitial.retryEveryN;
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(15, 14) } }, { clockAt: t0 });
    await startLevel(page);
    await page.clock.fastForward((cfg.ads.interstitial.sessionGraceSec + 1) * 1000);
    for (let r = 1; r <= n; r++) {
      await failBoard(page);
      await page.locator('[data-overlay="fail"] .fail__retry').click();
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', undefined, { timeout: 15_000 });
      if (r < n) expect(await interstitials(page)).toBe(0);
      else await expect.poll(() => interstitials(page)).toBe(1);
    }
    const gated = await stub(page, (s) => s.calls.filter((c) => c.name === 'logEvent' && c.args[0] === 'ad_interstitial').map((c) => c.args[2]));
    expect(gated).toContainEqual(expect.objectContaining({ trigger: 'retry', result: 'gated', gate: 'retry_cadence' }));
  });

  test("the fail card's Home: an interstitial first (fail_home, P-I5), then Home", async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(15, 14) } }, { clockAt: t0 });
    await startLevel(page);
    await page.clock.fastForward((cfg.ads.interstitial.sessionGraceSec + 1) * 1000);
    await failBoard(page);
    await page.locator('[data-overlay="fail"] .fail__home').click();
    await expect.poll(() => interstitials(page), { timeout: 10_000 }).toBe(1);
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home', undefined, { timeout: 10_000 });
  });

  test('the banner is back on the next board after the next-level interstitial (one load when the window ends)', async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(12, 11) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await startLevel(page);
    await page.clock.fastForward(Math.max((cfg.ads.interstitial.sessionGraceSec + 1) * 1000, (cfg.ads.banner.minReloadSec + 1) * 1000));
    await solve(page, { clock: true });
    await page.clock.fastForward(5_000);
    await toVictory(page);
    await stub(page, (s) => s.clearCalls());
    await sel.victoryNext(page).click();
    await expect.poll(() => interstitials(page), { timeout: 10_000 }).toBe(1);
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', undefined, { timeout: 15_000 });
    await expect(page.locator('.screen--game')).toHaveAttribute('data-banner', '');
    await page.clock.fastForward((cfg.ads.banner.minReloadSec + 1) * 1000);
    await expect.poll(() => count(page, 'loadBannerAdAsync'), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    await expect(stubBanner(page)).toBeVisible();
    await helpersClearOfStubBanner(page);
  });

  test('after a kitty video: hidden before the video, back on the board when it ends', async ({ page }) => {
    test.setTimeout(90_000);
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { persist: false, data: { save: seededSave(12, 11, (s) => ({ ...s, stock: { hints: 3, kitties: 0 } })) } }, { clockAt: t0 });
    await expect.poll(() => count(page, 'loadBannerAdAsync')).toBe(1);
    await startLevel(page);
    await expect(stubBanner(page)).toBeVisible();
    await page.clock.fastForward((cfg.ads.banner.minReloadSec + 1) * 1000);
    await stub(page, (s) => s.clearCalls());
    await page.locator('.screen--game .tool--paw').click();
    await sel.watchVideo(page).click();
    await expect.poll(() => seqOf(page, 'ad.showAsync', 'rewarded'), { timeout: 10_000 }).toHaveLength(1);
    const shows = await seqOf(page, 'ad.showAsync', 'rewarded');
    const hides = await seqOf(page, 'hideBannerAdAsync');
    expect(hides.some((h) => h < (shows[0] ?? 0))).toBe(true);
    await expect.poll(() => count(page, 'loadBannerAdAsync'), { timeout: 10_000 }).toBe(1);
    const loads = await seqOf(page, 'loadBannerAdAsync');
    expect(loads[0] ?? 0).toBeGreaterThan(shows[0] ?? 0);
    await expect(stubBanner(page)).toBeVisible();
  });
});
