// Owner: D (Phase 2b; was platform)
// FBIG build against tests/fixtures/fbinstant-stub.js (04 §11, 05 §4–§7). The SDK URL is routed to
// the stub; each test configures it through window.__FB_STUB_CONFIG__ before the page loads, and
// seeds the player's save as the stub's cloud copy (so the boot merge is exercised too).
// Runs in the `fbig-390` project against dist/fbig-e2e (hooks on, test placement IDs).
// Review fixes covered here: a late cloud read (PLAT-1), per-player mirrors (PLAT-2), a blocked
// localStorage with cloud save (PLAT-3), a startGameAsync that fails (PLAT-8).
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
  pause(): void;
  clearCalls(): void;
}
type TestWindow = Window & { __fbStub?: StubControl; __FB_STUB_CONFIG__?: unknown; __mewdoku?: E2EHooks };

// ── selectors (one place to adjust if the UI copy changes; strings come from src/i18n/en.ts) ──
const sel = {
  playButton: (page: Page) => page.getByRole('button', { name: /^(Continue · )?Level \d+$/ }).first(),
  nextButton: (page: Page) => page.getByRole('button', { name: /^Next: Level \d+$/ }),
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

/** Double-taps every solution cell (one cat per row) to win the current board. */
async function solve(page: Page): Promise<void> {
  const cols = await page.evaluate(() => (window as TestWindow).__mewdoku!.solution());
  expect(cols).not.toBeNull();
  for (const [row, col] of (cols ?? []).entries()) {
    await sel.cell(page, row, col).dblclick();
  }
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'won');
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
  test('an interstitial is shown at Next once 10 levels are done and the grace and cooldown passed', async ({ page }) => {
    const t0 = Date.UTC(2026, 9, 7, 10, 0, 0);
    await openGame(page, { data: { save: seededSave(15, 14) } }, { clockAt: t0 });
    await startLevel(page);
    await solve(page);
    await page.clock.fastForward(65_000); // past ads.interstitial.sessionGraceSec
    await sel.nextButton(page).click();
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
    await sel.nextButton(page).click();
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
