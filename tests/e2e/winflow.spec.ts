// Owner: C (Phase 2b). Phase 2c (G1, docs/phase2c/fish-lives-spec.md §2, §3, §7.3 e2e): the fish
// that fly are the lives kept, to this week's points counter; the panel opens at 4.5 s for 3 fish
// (4.4–4.8) and 4.2 s for 1 fish (4.1–4.5); reduced motion ≤ 1.4 s; two wins leave
// save.period.total = 6.
// Phase 2c.1 (G1, §10.3, §10.8): the level-points counter stays centred in the pills row with the
// level's total ([data-final]) until the scrim; the period counter appears in the cat counter's place;
// the victory shows the level's total (runTotal(n) for a mistake-free solve); save.streak is never
// written; the panel times are unchanged.
// The post-win flow end to end (phase2b §2.2, §2.7, §2.13) on the web e2e build: solve through the
// hook → rewards saved at once → the in-game period counter counts +3 → the ranking panel → tap → the
// victory screen with the wide "Level 3" → the next board, input locked until its entry ends. Home and
// Gear do nothing before the panel.
// Phase 2d (G1, docs/phase2d/look-spec.md §1.13, §5.3): the Score lives in the game bar
// (.top-bar--game .points-pill, [data-final] at the win); the period counter takes the heads pill's
// place (.pills .period-pill[data-in-game]); the fish still fly with the 2c times; Back and Gear are
// aria-disabled until the panel; UX-12 becomes "the +N chip never covers the period total or the bar's
// Level and Score columns".
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §2.5, §7.7): the last cat's star and the Score's
// count-up end on the level's total with [data-final], and the period counter still appears at 1 000 ms.
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import { periodKeyAt, pointsRuleFor, runTotal } from '../../src/game/scoring';
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

/** `count` wrong cats (double clicks on non-solution cells), each a mistake that costs a fish. */
async function mistakes(page: Page, count: number): Promise<void> {
  const sol = await page.evaluate(() => (window as TestWindow).__mewdoku?.solution() ?? []);
  const n = sol.length;
  let done = 0;
  for (let i = 0; i < n * n && done < count; i++) {
    if (sol[Math.floor(i / n)] === i % n) continue;
    await page.locator('.cell').nth(i).dblclick();
    await page.waitForTimeout(350); // cellLockAfterCatMs
    done++;
  }
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

async function tapPanel(page: Page): Promise<void> {
  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 3000 });
  await panel.locator('.ranking__tap').click();
}

/** The level's total of an unbroken run over the current board, as English formats it ("3,840"). */
async function fullRun(page: Page): Promise<{ total: number; text: string }> {
  const n = await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.puzzle.n ?? 0);
  const total = runTotal(n, pointsRuleFor('level'));
  return { total, text: total.toLocaleString('en-US') };
}

/** Phase 2d: the bar's Score column (the 2c.1 points counter, moved out of the pills row). */
const score = (page: Page) => page.locator('.top-bar--game .points-pill');

const stored = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('mewdoku.save.v1');
    return raw ? (JSON.parse(raw) as SaveData) : null;
  });

test('win with 3 fish kept: rewards at once, the lives fly to "this week" (+3), panel at 4.5 s, tap → victory "Level 3" → next board after its entry', async ({ page }) => {
  await open(page, atLevel(2));
  await playNext(page);
  await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(3);
  const run = await fullRun(page);
  const headsBox = await page.locator('.pills .pill--heads').boundingBox();
  const t0 = await solve(page);

  // t = 0: the period points, the level's points total and progress are already saved (the critical save).
  const s = await stored(page);
  expect(s).not.toHaveProperty('wallet');
  expect(s?.period).toMatchObject({ key: periodKeyAt(Date.now()), total: 3 });
  expect(s?.streak).toEqual({ current: 0, best: 0 }); // 2c.1: retired, never written
  expect(s?.progress.level).toBe(3);
  expect(s?.points.total).toBe(run.total);

  // 2c.1 §10.3 / 2d §1.13: the level's total stays on screen in the bar's Score column, marked final.
  const pts = score(page);
  await expect(pts).toHaveAttribute('data-final', '');
  await expect(pts).toHaveAttribute('aria-label', `Level points: ${run.text}`);

  // Back and Gear do nothing before the panel (aria-disabled, §1.4 win-flow lock).
  const back = page.locator('.top-bar--game .top-bar__btn--home');
  const gear = page.locator('.top-bar--game .top-bar__btn--settings');
  await expect(back).toHaveAttribute('aria-disabled', 'true');
  await expect(gear).toHaveAttribute('aria-disabled', 'true');
  await back.click({ force: true });
  await gear.click({ force: true });
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().screen)).toBe('game');
  expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.app().overlays.includes('settings'))).toBe(false);

  // The in-game period counter counts up to +3; each life empties as its fish leaves.
  const counter = page.locator('.pills .period-pill[data-in-game]');
  await expect(counter).toBeVisible({ timeout: 2000 });
  // 2d §1.13: the period counter takes the heads pill's place (the same grid cell); the Score stays in the bar.
  const periodBox = await counter.boundingBox();
  expect(headsBox && periodBox ? Math.abs(periodBox.x - headsBox.x) : Infinity).toBeLessThanOrEqual(2);
  expect(headsBox && periodBox ? Math.abs(periodBox.y - headsBox.y) : Infinity).toBeLessThanOrEqual(2);
  await expect(page.locator('.pills .pill--heads')).toBeHidden({ timeout: 1000 });
  await expect(counter).toHaveAttribute('aria-label', '3 fish this week', { timeout: 4000 });
  await expect(counter.locator('.period-pill__n').last()).toHaveText('3');
  await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(0);
  await expect(pts).toBeVisible();
  await expect(pts.locator('.points-pill__n').last()).toHaveText(run.text);

  const dt = await panelAfter(page, t0);
  expect(dt).toBeGreaterThanOrEqual(4400);
  expect(dt).toBeLessThanOrEqual(4800);

  const panel = page.locator('[data-overlay="ranking"]');
  await expect(panel).toContainText('Weekly ranking');
  await expect(panel).toContainText('+3 fish');
  await tapPanel(page);

  const victory = page.locator('[data-overlay="victory"]');
  const primary = victory.locator('.victory__primary');
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Level 3/);
  await expect(primary).toBeEnabled({ timeout: 2000 });
  await expect(victory.locator('.victory__kept')).toHaveAttribute('data-count', '3');
  await expect(victory.locator('.victory__period')).toHaveText('This week: 3');
  await expect(victory.locator('.victory__points')).toHaveText(`${run.text} points`);
  await expect(victory.locator('.victory__streak')).toHaveCount(0); // 2c.1: no "Perfect ×N"
  // §2.7: no fish pill, no "+" (shop).
  await expect(victory.locator('.fish-pill, .fish-pill__plus')).toHaveCount(0);
  await primary.click();

  // The next board: input locked (status ready) until its entry ends, then playing.
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.puzzle.id === 'L3');
  const first = await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.status);
  expect(first).toBe('ready');
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', undefined, { timeout: 3000 });
});

test('a 1-fish win (two mistakes): one fish flies, the panel at 4.2 s (4.1–4.5), no streak chip', async ({ page }) => {
  await open(page, atLevel(2, { streak: { current: 5, best: 5 } }));
  await playNext(page);
  await mistakes(page, 2);
  await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(1);
  // 2c.1: a mistake no longer touches the retired cross-level streak.
  expect((await page.evaluate(() => (window as TestWindow).__mewdoku?.app().save.streak))).toEqual({ current: 5, best: 5 });
  const run = await fullRun(page); // the mistakes came before every cat: the run is unbroken
  const t0 = await solve(page);
  const dt = await panelAfter(page, t0);
  expect(dt).toBeGreaterThanOrEqual(4100);
  expect(dt).toBeLessThanOrEqual(4500);
  await expect(page.locator('.pills .period-pill[data-in-game]')).toHaveAttribute('aria-label', '1 fish this week');
  await tapPanel(page);
  const victory = page.locator('[data-overlay="victory"]');
  await expect(victory.locator('.victory__kept')).toHaveAttribute('data-count', '1');
  await expect(victory.locator('.victory__streak')).toHaveCount(0);
  await expect(victory.locator('.victory__points')).toHaveText(`${run.text} points`);
  expect((await stored(page))?.streak).toEqual({ current: 5, best: 5 });
});

test('2c.1: the points counter stays visible with the level\'s total until the scrim; a mid-level mistake resets the run', async ({ page }) => {
  await open(page, atLevel(2));
  await playNext(page);
  const sol = await page.evaluate(() => (window as TestWindow).__mewdoku?.solution() ?? []);
  const n = sol.length;
  await page.locator('.cell').nth(sol[0] as number).dblclick();
  await page.waitForTimeout(350);
  await mistakes(page, 1);
  const t0 = await solve(page); // cats 2…n: a new run after the mistake
  const rule = pointsRuleFor('level');
  const total = rule.first + runTotal(n - 1, rule);
  const text = total.toLocaleString('en-US');
  const pts = score(page);
  await expect(pts).toHaveAttribute('data-final', '');
  await expect(pts).toHaveAttribute('aria-label', `Level points: ${text}`);
  // Sample the counter every frame until the scrim: always there and never hidden.
  const r = await page.evaluate(async () => {
    const out = { frames: 0, hidden: 0 };
    await new Promise<void>((resolve) => {
      const step = (): void => {
        const app = (window as TestWindow).__mewdoku?.app();
        const scrim = document.querySelector('.screen--game .game__scrim') as HTMLElement | null;
        const pill = document.querySelector('.top-bar--game .points-pill') as HTMLElement | null;
        out.frames++;
        if (!pill || pill.hidden || pill.getBoundingClientRect().width === 0) out.hidden++;
        if (app?.overlays.includes('ranking') || (scrim && !scrim.hidden)) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return out;
  });
  expect(r.frames).toBeGreaterThan(10);
  expect(r.hidden).toBe(0);
  const dt = await panelAfter(page, t0);
  expect(dt).toBeGreaterThanOrEqual(4250); // 2 fish: 4 350 ms (the 2c window, unchanged)
  expect(dt).toBeLessThanOrEqual(4650);
  expect((await stored(page))?.points.total).toBe(total);
  await tapPanel(page);
  await expect(page.locator('[data-overlay="victory"] .victory__points')).toHaveText(`${text} points`);
});

test('2d.1 §2.5: the last cat\'s star and count-up end on the level\'s total with [data-final]; the period counter still appears at t = 1 000', async ({ page }) => {
  await open(page, atLevel(2));
  await playNext(page);
  await expect(page.locator('.game-fx[data-celebrate="ready"]')).toBeAttached({ timeout: 10_000 });
  const sol = await page.evaluate(() => (window as TestWindow).__mewdoku?.solution() ?? []);
  const n = sol.length;
  // Every cat but the last by double clicks (each a scoring cat in one run), then the last one.
  for (let r = 0; r < n - 1; r++) {
    await page.locator('.cell').nth(r * n + (sol[r] as number)).dblclick();
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(2_000); // the earlier stars have landed
  const rule = pointsRuleFor('level');
  const before = runTotal(n - 1, rule).toLocaleString('en-US');
  const total = runTotal(n, rule).toLocaleString('en-US');
  const num = page.locator('.top-bar--game .points-pill__n');
  await expect(num).toHaveText(before);
  const last = (n - 1) * n + (sol[n - 1] as number);
  await page.locator('.cell').nth(last).dblclick();
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'won');
  // The period counter takes the heads pill's place at t = 1 000 (2c times, unchanged).
  const shownAt = await page.waitForFunction(
    (start) => {
      const el = document.querySelector<HTMLElement>('.pills .period-pill[data-in-game]');
      return el && !el.hidden && el.getBoundingClientRect().width > 0 ? performance.now() - start : false;
    },
    t0,
    { polling: 'raf', timeout: 5_000 },
  );
  const dt = (await shownAt.jsonValue()) as number;
  expect(dt).toBeGreaterThanOrEqual(900);
  expect(dt).toBeLessThanOrEqual(1_300);
  // The Score still shows the total before this cat until the star lands (1 330 ms), then counts up.
  if (dt < 1_250) await expect(num).toHaveText(before);
  await expect(num).toHaveText(total, { timeout: 3_000 });
  await expect(page.locator('.top-bar--game .points-pill')).toHaveAttribute('data-final', '');
});

test('reduced motion: the panel at 1.2 s (≤ 1.4 s) with the counter already +3', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, atLevel(2));
  await playNext(page);
  const t0 = await solve(page);
  const dt = await panelAfter(page, t0);
  expect(dt).toBeLessThanOrEqual(1400);
  expect(dt).toBeGreaterThanOrEqual(1100);
  await expect(page.locator('.pills .period-pill[data-in-game]')).toHaveAttribute('aria-label', '3 fish this week');
});

test('two wins: save.period.total = 6 and points.total = both levels\' totals; save.streak untouched; the Home pill shows 6 fish this week', async ({ page }) => {
  await open(page, atLevel(2));
  await playNext(page);
  const first = await fullRun(page);
  await solve(page);
  await tapPanel(page);
  const primary = page.locator('[data-overlay="victory"] .victory__primary');
  await expect(primary).toBeEnabled({ timeout: 3000 });
  await primary.click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', undefined, { timeout: 5000 });
  // F5.1: the next level starts at 0.
  await expect(score(page)).toHaveAttribute('aria-label', 'Level points: 0');
  await expect(score(page)).not.toHaveAttribute('data-final', '');
  await expect(page.locator('.pills .pill--heads')).toBeVisible(); // a new board brings the heads back
  await expect(page.locator('.pills .period-pill[data-in-game]')).toBeHidden();
  const second = await fullRun(page);
  await solve(page);
  await tapPanel(page);
  await expect(page.locator('[data-overlay="victory"] .victory__streak')).toHaveCount(0);
  await expect(page.locator('[data-overlay="victory"] .victory__points')).toHaveText(`${second.text} points`);
  await expect(page.locator('[data-overlay="victory"] .victory__period')).toHaveText('This week: 6');
  const s = await stored(page);
  expect(s?.period).toMatchObject({ key: periodKeyAt(Date.now()), total: 6 });
  expect(s?.points.total).toBe(first.total + second.total);
  expect(s?.streak).toEqual({ current: 0, best: 0 });
  await page.locator('[data-overlay="victory"] .victory__home').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await expect(page.locator('.screen--home .period-pill')).toHaveAttribute('aria-label', '6 fish this week');
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
          // 2d: the Level column's h1 carries the whole title as its name ("Level 2").
          title: g.querySelector('.top-bar__text')?.getAttribute('aria-label') ?? g.querySelector('.top-bar__title')?.textContent ?? '',
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

// ── review UX-12, re-based in 2d (§1.13 critic C10): the in-game "+3" sits inside the period counter, at the
// inline end of its total; it never covers that total, the bar's Level column or its Score column ──

for (const size of [null, { width: 320, height: 568 }] as const) {
  test(`UX-12 (2d): the "+3" chip never covers the period total or the bar's columns, and stays on screen${size ? ` at ${size.width}×${size.height}` : ''}`, async ({ page }) => {
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
          const pill = document.querySelector('.pills .period-pill[data-in-game]');
          const chip = pill?.querySelector('.period-pill__chip') ?? document.querySelector('.period-pill__chip');
          const visible = (e: Element | null | undefined): e is Element => {
            if (!e || (e as HTMLElement).hidden) return false;
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && Number(getComputedStyle(e).opacity) > 0.05;
          };
          if (t >= 1500 && visible(chip) && pill) {
            seen++;
            const c = chip.getBoundingClientRect();
            const hit = (name: string, q: string): void => {
              const e = document.querySelector(q);
              if (!visible(e)) return;
              const b = e.getBoundingClientRect();
              const x = Math.min(c.right, b.right) - Math.max(c.left, b.left);
              const y = Math.min(c.bottom, b.bottom) - Math.max(c.top, b.top);
              if (x > 1 && y > 1) bad.push(`t=${Math.round(t)}: chip over ${name}`);
            };
            hit('the period total', '.pills .period-pill[data-in-game] .period-pill__n');
            hit('the Level column', '.top-bar--game .top-bar__text');
            hit('the Score column', '.top-bar--game .points-pill');
            if (c.top < 0) bad.push(`t=${Math.round(t)}: chip top ${c.top.toFixed(1)} < 0`);
            if (c.right > window.innerWidth + 0.5 || c.left < -0.5) bad.push(`t=${Math.round(t)}: chip off screen`);
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
