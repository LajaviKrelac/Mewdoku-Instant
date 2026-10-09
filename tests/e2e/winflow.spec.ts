// Owner: C
// The post-win flow end to end (phase2b §2.2, §2.7, §2.13) on the web e2e build: solve through the
// hook → rewards saved at once → the in-game fish pill counts +3 → the ranking panel at 4.5 s
// (4.4–4.8) → tap → the victory screen with the wide "Level 3" → the next board, input locked until
// its entry ends. With reduced motion the panel comes at 1.2 s (≤ 1.4). Home and Gear do nothing
// before the panel.
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import type { SaveData } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const NOW = Date.now();
const atLevel = (level: number, patch: Partial<SaveData> = {}): SaveData => ({
  ...defaults(NOW - 3 * 86_400_000),
  tutorialDone: true,
  sessions: 3,
  progress: { level, completed: level - 1, best: {} },
  ...patch,
});

async function open(page: Page, save: SaveData): Promise<void> {
  await page.goto('/?ads=unsupported');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home' || (window as TestWindow).__mewdoku?.app().screen === 'game');
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
}

async function playNext(page: Page): Promise<void> {
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
}

/** Solves through the hook; returns performance.now() at WON (page clock). */
async function solve(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ok = (window as TestWindow).__mewdoku?.solve() ?? false;
    if (!ok) throw new Error('solve failed');
    return performance.now();
  });
}

/** ms from `t0` (page clock) until the ranking panel is on the overlay stack. */
async function panelAfter(page: Page, t0: number): Promise<number> {
  const h = await page.waitForFunction(
    (start) => ((window as TestWindow).__mewdoku?.app().overlays.includes('ranking') ? performance.now() - start : false),
    t0,
    { polling: 'raf', timeout: 10_000 },
  );
  return (await h.jsonValue()) as number;
}

test('win: rewards at once, fish +3, panel at 4.5 s, tap → victory "Level 3" → next board after its entry', async ({ page }) => {
  await open(page, atLevel(2));
  await playNext(page);
  const t0 = await solve(page);

  // t = 0: fish, points and progress are already saved (the critical save went to localStorage).
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('mewdoku.save.v1');
    return raw ? (JSON.parse(raw) as SaveData) : null;
  });
  expect(stored?.wallet.fish).toBe(3);
  expect(stored?.progress.level).toBe(3);
  expect(stored?.points.total).toBeGreaterThan(0);

  // Home and Gear do nothing before the panel.
  await page.locator('.top-bar').getByRole('button', { name: 'Home' }).click({ force: true });
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().screen)).toBe('game');

  // The in-game fish pill counts up to +3.
  const pill = page.locator('.pills .fish-pill');
  await expect(pill).toBeVisible({ timeout: 2000 });
  await expect(pill.locator('.fish-pill__main')).toHaveAttribute('aria-label', '3 fish', { timeout: 4000 });

  const dt = await panelAfter(page, t0);
  expect(dt).toBeGreaterThanOrEqual(4400);
  expect(dt).toBeLessThanOrEqual(4800);

  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 3000 });
  await panel.locator('.ranking__tap').click();

  const primary = page.locator('[data-overlay="victory"] .victory__primary');
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Level 3/);
  await expect(primary).toBeEnabled({ timeout: 2000 });
  await expect(page.locator('[data-overlay="victory"]')).toContainText('+3');
  await primary.click();

  // The next board: input locked (status ready) until its entry ends, then playing.
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.puzzle.id === 'L3');
  const first = await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.status);
  expect(first).toBe('ready');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', undefined, { timeout: 3000 });
});

test('reduced motion: the panel at 1.2 s (≤ 1.4 s) with the count already +3', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, atLevel(2));
  await playNext(page);
  const t0 = await solve(page);
  const dt = await panelAfter(page, t0);
  expect(dt).toBeLessThanOrEqual(1400);
  expect(dt).toBeGreaterThanOrEqual(1100);
  await expect(page.locator('.pills .fish-pill .fish-pill__main')).toHaveAttribute('aria-label', '3 fish');
});

test('a Hard level shows the bonus chip and +5 fish in total', async ({ page }) => {
  await open(page, atLevel(30, { wallet: { fish: 10, earned: 10 } }));
  await playNext(page);
  await solve(page);
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 3000 });
  await panel.locator('.ranking__tap').click();
  const victory = page.locator('[data-overlay="victory"]');
  await expect(victory).toContainText('Hard level bonus +2');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.wallet.fish)).toBe(15);
});

// ── 2b review fixes (R): PAR-6 / UX-4 — no frame falls back to the bare or stale board ──

/**
 * Installs a rAF sampler (page side) that records, every frame, the ranking and victory overlays'
 * computed opacities and every game screen still in the document with its title and opacity.
 */
async function startSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Sample = { t: number; rank: number; vic: number; games: { title: string; op: number }[] };
    const w = window as Window & { __samples?: Sample[]; __sampling?: boolean };
    w.__samples = [];
    w.__sampling = true;
    const t0 = performance.now();
    const op = (el: Element | null): number => {
      if (!el || (el as HTMLElement).hidden || !el.isConnected) return 0;
      let o = 1;
      for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o;
    };
    const tick = (): void => {
      if (!w.__sampling) return;
      w.__samples?.push({
        t: Math.round(performance.now() - t0),
        rank: op(document.querySelector('[data-overlay="ranking"]')),
        vic: op(document.querySelector('[data-overlay="victory"]')),
        games: Array.from(document.querySelectorAll('.app-screen > .screen--game')).map((g) => ({
          title: g.querySelector('.top-bar__title')?.textContent ?? '',
          op: op(g),
        })),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopSampler(page: Page): Promise<{ t: number; rank: number; vic: number; games: { title: string; op: number }[] }[]> {
  return page.evaluate(() => {
    const w = window as Window & { __samples?: { t: number; rank: number; vic: number; games: { title: string; op: number }[] }[]; __sampling?: boolean };
    w.__sampling = false;
    return w.__samples ?? [];
  });
}

async function toVictory(page: Page): Promise<void> {
  await open(page, atLevel(2));
  await playNext(page);
  await solve(page);
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 10_000 });
  await startSampler(page);
  await panel.locator('.ranking__tap').click();
  const primary = page.locator('[data-overlay="victory"] .victory__primary');
  await expect(primary).toBeEnabled({ timeout: 3000 });
  await page.waitForTimeout(300);
  const samples = await stopSampler(page);
  // UX-4: panel → victory is a crossfade; the solved board is never left bare (it was, for ~150 ms,
  // between the panel's fade-out and the victory's fade-in). Coverage = 1 − (1 − panel)(1 − victory).
  const worst = Math.min(...samples.map((s) => 1 - (1 - s.rank) * (1 - s.vic)));
  expect(samples.length).toBeGreaterThan(5);
  expect(worst).toBeGreaterThanOrEqual(0.6);
}

test('PAR-6 / UX-4: panel → victory crossfades, and "Level 3" never shows the solved Level 2 board again', async ({ page }) => {
  await toVictory(page);
  await startSampler(page);
  await page.locator('[data-overlay="victory"] .victory__primary').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.puzzle.id === 'L3');
  await page.waitForTimeout(500);
  const samples = await stopSampler(page);
  expect(samples.length).toBeGreaterThan(5);
  // The old screen (title "Level 2") may only exist while the victory still covers it completely.
  const stale = samples.filter((s) => s.games.some((g) => /^Level 2(?!\d)/.test(g.title) && g.op > 0.02) && s.vic < 0.98);
  expect(stale).toEqual([]);
  // The victory is what fades out (§2.9 "victory → next game: outgoing fade"), into the new board.
  expect(samples.some((s) => s.vic > 0.05 && s.vic < 0.95)).toBe(true);
  const end = samples[samples.length - 1]?.games ?? [];
  expect(end).toHaveLength(1);
  expect(end[0]?.title).toMatch(/^Level 3(?!\d)/);
});

test('PAR-6: Home from the victory never shows the solved board again', async ({ page }) => {
  await toVictory(page);
  await startSampler(page);
  await page.locator('[data-overlay="victory"] .victory__home').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await page.waitForTimeout(400);
  const samples = await stopSampler(page);
  const stale = samples.filter((s) => s.games.some((g) => g.op > 0.02) && s.vic < 0.98);
  expect(stale).toEqual([]);
});

// ── review UX-12: the rising "+3" starts above the in-game fish pill, never over its icon and count ──

for (const size of [null, { width: 320, height: 568 }] as const) {
  test(`UX-12: the "+3" chip stays above the in-game fish pill (and on screen) while it rises${size ? ` at ${size.width}×${size.height}` : ''}`, async ({ page }) => {
    if (size) await page.setViewportSize(size);
    await open(page, atLevel(2));
    await playNext(page);
    const r = await page.evaluate(async () => {
      const ok = (window as TestWindow).__mewdoku?.solve() ?? false;
      if (!ok) throw new Error('solve failed');
      const t0 = performance.now();
      let seen = 0;
      const bad: string[] = [];
      await new Promise<void>((resolve) => {
        const step = (): void => {
          const t = performance.now() - t0;
          const chip = document.querySelector('.fish-pill__label .fish-pill__chip');
          const pill = document.querySelector('.pills .fish-pill');
          if (t >= 1500 && chip && pill) {
            seen++;
            const c = chip.getBoundingClientRect();
            const p = pill.getBoundingClientRect();
            if (c.bottom > p.top + 1) bad.push(`t=${Math.round(t)}: chip bottom ${c.bottom.toFixed(1)} > pill top ${p.top.toFixed(1)}`);
            if (c.top < 0) bad.push(`t=${Math.round(t)}: chip top ${c.top.toFixed(1)} < 0`);
          }
          if (t >= 4200) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      return { seen, bad };
    });
    expect(r.bad).toEqual([]);
    expect(r.seen).toBeGreaterThan(0);
  });
}
