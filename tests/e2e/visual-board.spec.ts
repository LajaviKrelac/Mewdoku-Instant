// Owner: G2 (Phase 2d; Phase 2d.1: the frames of the helpers' board motion, helpers-spec §7.7, §7.8)
// Visual review captures of the board (look-spec §5.3) at 320, 390 and 1280 (the web-320, web-390 and
// web-1280 projects) and at the recording's 402 × 874 (DSF 3, its own context, run once from web-390):
// the mid-game board, the X marks (default, and with Colour patterns on: the edge), the wrong X, the
// ghost X of a hint, every palette colour on a 12 × 12 board, and the tile size, gap and radius
// checked against computeLayout. Stored as docs/phase2d/screenshots/G2-board-<name>-<width>.png
// (VISUAL_OUT overrides the folder) and reviewed by a person, never diffed in CI. The 402 × 874
// capture is "the state of the recording": our 10 × 10 level 794, whose top-left five cells are one
// Coral region, with X marks on them (the side-by-side with the user's frames is composed outside the
// repo, D-2d-0 d). Created at Phase 2d L0 by moving the board capture of visual.spec.ts; the helpers
// are copies of visual.spec.ts's (no shared helper module under tests/e2e).
// Phase 2d.1 (helpers-spec §7.7, §7.8): frames of the board's helper motion at exact ms after the action,
// at 402 × 874 DSF 3 on our own 9 × 9 level 262 (its smallest colour is two tiles whose cat is the top-right
// corner, so the kitty places it there): the mouse's second visit, the cat sequence, a ghost X's pop, the
// draw-in after Apply and the waves of the row and column it completes; and the Denim tile (an X, a wrong X,
// the white pattern glyph). Time is controlled with page.clock (timers, rAF, performance.now) plus a
// freeze-and-seek of the CSS animations (every animation created after the action is paused when it
// appears and set to "now − its start" before each shot). Written as docs/phase2d/screenshots/G2-2d1-*.png;
// the side-by-sides with the user's frames are composed outside the repo (D-2d-0 d).
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { cfg } from '../../src/app/config';
import { defaults } from '../../src/game/save';
import { periodKeyAt } from '../../src/game/scoring';
import type { SaveData } from '../../src/game/types';
import { mouseLandMs, mouseRunMs, mouseVisitMs } from '../../src/game/mouse';
import { PALETTE } from '../../src/ui/art/palette';
import { gapFor } from '../../src/ui/board/layout';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const OUT = process.env.VISUAL_OUT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/phase2d/screenshots');
mkdirSync(OUT, { recursive: true });

const NOW = Date.now();
/** A returning player at `level` (39 fish this week, this UTC week's key); a stale 2c `streak` record. */
const returning = (patch: Partial<SaveData> = {}, level = 12): SaveData => {
  const base = defaults(NOW - 3 * 86_400_000);
  const key = periodKeyAt(NOW);
  return {
    ...base,
    tutorialDone: true,
    sessions: 4,
    progress: { level, completed: level - 1, best: {} },
    streak: { current: 3, best: 9 },
    period: { key, total: 39, bestKey: key, bestTotal: 39 },
    ...patch,
  };
};

async function ready(page: Page, screen?: string): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const app = (window as TestWindow).__mewdoku?.app();
      return !!app && app.screen !== 'boot' && (!want || app.screen === want);
    },
    screen ?? null,
  );
}

async function open(page: Page, save: SaveData): Promise<void> {
  await page.goto('/');
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await ready(page, 'home');
  await page.waitForTimeout(500); // the Home mascot pops in
}

async function boardShot(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  await page.locator('.board').screenshot({ path: join(OUT, `G2-board-${name}-${width}.png`), animations: 'disabled' });
}

const solution = (page: Page) => page.evaluate(() => (window as TestWindow).__mewdoku?.solution() ?? []);
const cell = (page: Page, i: number) => page.locator('.cell').nth(i);

async function startLevel(page: Page): Promise<number[]> {
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.waitForTimeout(300);
  return solution(page);
}

async function placeCat(page: Page, i: number): Promise<void> {
  await cell(page, i).dblclick();
  await page.waitForTimeout(350); // cellLockAfterCatMs
}

async function mark(page: Page, cells: readonly number[]): Promise<void> {
  for (const i of cells) {
    await cell(page, i).click();
    await page.waitForTimeout(330); // past the double-tap window
  }
  await page.waitForTimeout(cfg.fx.markPopMs + 100); // the pop has settled
}

/** The board's measured look (look-spec §1.8) against its own --slot: tile, gap, tile radius, the card. */
async function checkBoardLook(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const board = document.querySelector('.board') as HTMLElement;
    const cs = getComputedStyle(board);
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('.cell__tile')).slice(0, 2).map((t) => t.getBoundingClientRect());
    const t0 = tiles[0] as DOMRect;
    const t1 = tiles[1] as DOMRect;
    return {
      slot: parseFloat(cs.getPropertyValue('--slot')),
      pad: parseFloat(cs.getPropertyValue('--pad')),
      boxShadow: cs.boxShadow,
      borderWidth: cs.borderTopWidth,
      cardRadius: parseFloat(cs.borderTopLeftRadius),
      tile: t0.width,
      gap: t1.left - t0.right,
      tileRadius: parseFloat(getComputedStyle(document.querySelector('.cell__tile') as Element).borderTopLeftRadius),
      firstTile: t0.left - board.getBoundingClientRect().left,
      boardW: board.getBoundingClientRect().width,
      n: parseFloat(cs.getPropertyValue('--n')),
      s: parseFloat(getComputedStyle(document.querySelector('.screen--game') as Element).getPropertyValue('--s')) || null,
    };
  });
  const gap = gapFor(m.slot);
  expect(m.boxShadow).toBe('none');
  expect(m.borderWidth).toBe('0px');
  expect(m.gap).toBeCloseTo(gap, 1);
  expect(m.tile).toBeCloseTo(m.slot - gap, 1);
  expect(m.tileRadius).toBeCloseTo(cfg.layout.game.tileRadiusFraction * (m.slot - gap), 1);
  expect(m.firstTile).toBeCloseTo(m.pad + gap / 2, 1);
  if (m.s) {
    expect(m.cardRadius).toBeCloseTo(cfg.layout.game.cardRadius * m.s, 1);
    // final audit B11 (measured on 9 × 9): the card keeps its size; what the whole-px slots leave of it is padding,
    // so the pad is at least round(cardPad × s) and less than half a slot's px more per side (n px in all)
    const pad0 = Math.max(3, Math.round(cfg.layout.game.cardPad * m.s));
    expect(m.pad).toBeGreaterThanOrEqual(pad0 - 0.01);
    expect(m.pad - pad0).toBeLessThan(m.n / 2);
    expect(m.boardW).toBeCloseTo(m.slot * m.n + 2 * m.pad, 1);
  }
}

test.describe('Phase 2d visual review: the board (look-spec §1.8–§1.10, §5.3)', () => {
  test('mid-game: the measured tiles, gap and radius; the white X with no edge', async ({ page }) => {
    await open(page, returning());
    const sol = await startLevel(page);
    const n = sol.length;
    for (const r of [0, 2]) await placeCat(page, r * n + (sol[r] as number));
    await mark(page, [n + ((sol[1] as number) + 2) % n, n + ((sol[1] as number) + 3) % n, 3 * n + ((sol[3] as number) + 1) % n]);
    await checkBoardLook(page);
    // the X: two white rounded bars, no edge without Colour patterns (look-spec §1.10)
    const x = page.locator('.cell[data-s="m"]').first();
    // Phase 2d.1 (helpers-spec §4.4): each bar in its own rotated group
    await expect(x.locator('.cell__xg > g.cell__xb rect.cell__x')).toHaveCount(2);
    await expect(x.locator('.cell__xg > g.cell__xb rect.cell__xe')).toHaveCount(2);
    const look = await x.evaluate((el) => ({
      fill: getComputedStyle(el.querySelector('.cell__x') as Element).fill,
      stroke: getComputedStyle(el.querySelector('.cell__x') as Element).stroke,
      edge: getComputedStyle(el.querySelector('.cell__xe') as Element).display,
    }));
    expect(look).toEqual({ fill: 'rgb(255, 255, 255)', stroke: 'none', edge: 'none' });
    // the HUD the capture shows (DOM contract, look-spec §4.6): three fish, the score of two cats in a row
    await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(3);
    await expect(page.locator('.points-pill__n')).toHaveText('1,248');
    await page.waitForTimeout(400);
    await boardShot(page, 'game');
  });

  test('X close-ups: default, with Colour patterns on (the edge), the wrong X and the ghost X', async ({ page }) => {
    for (const patterns of [false, true]) {
      const save = returning();
      await open(page, { ...save, settings: { ...save.settings, patterns } });
      const sol = await startLevel(page);
      const n = sol.length;
      await mark(page, [((sol[0] as number) + 2) % n, ((sol[0] as number) + 4) % n]);
      // a cat outside the solution: the wrong X in --wrong with its ring, no white X
      const wrong = n + ((sol[1] as number) + 3) % n;
      await placeCat(page, wrong);
      await expect(cell(page, wrong)).toHaveAttribute('data-s', 'w');
      const w = await cell(page, wrong).evaluate((el) => ({
        bar: getComputedStyle(el.querySelector('.cell__x') as Element).fill,
        ring: getComputedStyle(el.querySelector('.cell__tile') as Element).boxShadow,
      }));
      expect(w.bar).toBe('rgb(86, 10, 28)'); // --wrong #560A1C (helpers-spec §6.4)
      expect(w.ring).toContain('rgb(86, 10, 28)');
      const edge = await page.locator('.cell[data-s="m"] .cell__xe').first().evaluate((el) => ({ display: getComputedStyle(el).display, fill: getComputedStyle(el).fill }));
      if (patterns) expect(edge.display).not.toBe('none');
      else expect(edge.display).toBe('none');
      await page.waitForTimeout(cfg.fx.sadCatsMs + 200);
      await boardShot(page, patterns ? 'x-patterns' : 'x-default');
    }
    // the ghost X of a hint (helpers-spec §3.3): the X's outline, 1.5 px white over 10 % white
    await page.locator('.tool--bulb').click();
    await page.waitForSelector('.board[data-hl="hint"]');
    await page.waitForTimeout(cfg.fx.hint.ghostFirstMs + 20 * cfg.fx.hint.ghostStaggerMs + cfg.fx.hint.ghostPopMs);
    const ghosts = page.locator('.cell[data-ghost="x"][data-s="e"] path.cell__xo');
    if ((await ghosts.count()) > 0) {
      const look = await ghosts.first().evaluate((el) => ({ stroke: getComputedStyle(el).stroke, width: getComputedStyle(el).strokeWidth, fill: getComputedStyle(el).fill }));
      expect(look).toEqual({ stroke: 'rgb(255, 255, 255)', width: '1.5px', fill: 'rgba(255, 255, 255, 0.1)' });
      await expect(page.locator('.cell[data-ghost="x"] .cell__x').first()).toBeHidden();
    }
    await boardShot(page, 'x-ghost');
  });

  test('every palette colour on a 12 × 12 board, at the measured ratios', async ({ page }) => {
    await open(page, returning({}, 310)); // our level 310 is 12 × 12: all 12 colours
    await startLevel(page);
    await expect(page.locator('.cell')).toHaveCount(144);
    const colours = await page.evaluate(() =>
      Array.from(new Set(Array.from(document.querySelectorAll<HTMLElement>('.cell__tile')).map((t) => getComputedStyle(t).backgroundColor))),
    );
    const rgb = (hex: string): string => {
      const v = parseInt(hex.slice(1), 16);
      return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`;
    };
    expect(colours.sort()).toEqual(PALETTE.map(rgb).sort());
    await checkBoardLook(page);
    await boardShot(page, 'palette-12');
  });

  test('the recording\'s state at 402 × 874, DSF 3: X marks over five Coral tiles in the top row', async ({ browser }, info) => {
    test.skip(info.project.name !== 'web-390', 'one capture, in its own 402 × 874 context');
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    // the recording's device: safe areas 62 / 34 through the dev override (look-spec §1.1)
    await page.addInitScript(() => {
      const set = (): void => {
        document.documentElement.style.setProperty('--dev-safe-top', '62px');
        document.documentElement.style.setProperty('--dev-safe-bottom', '34px');
      };
      if (document.documentElement) set();
      else document.addEventListener('DOMContentLoaded', set);
    });
    // our 10 × 10 level 794: cells 0–4 are one Coral region (2d used 785; with 2d.1's eleven-colour tier
    // its top-left region is Denim now, helpers-spec §6.2)
    await open(page, returning({}, 794));
    await startLevel(page);
    const coral = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.cell__tile'))
        .slice(0, 5)
        .map((t) => getComputedStyle(t).backgroundColor),
    );
    expect(new Set(coral)).toEqual(new Set(['rgb(213, 115, 116)'])); // Coral #D57374
    await mark(page, [0, 1, 2, 3, 4]);
    await checkBoardLook(page);
    const box = await page.locator('.board').boundingBox();
    // look-spec §1.1, §1.8 (final audit B11): the card is its full 390.66 wide at x 5.67, as measured (390.67 at 5.67);
    // whole-px slots of 38 (tile 35, gap 3), the 10.66 px they leave in the padding
    expect(box?.width).toBeCloseTo(402 - 2 * cfg.layout.game.cardMargin, 1);
    expect(box?.x).toBeCloseTo(cfg.layout.game.cardMargin, 1);
    const slot = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.board') as Element).getPropertyValue('--slot')));
    expect(slot).toBe(38);
    await page.waitForTimeout(300);
    await page.locator('.board').screenshot({ path: join(OUT, 'G2-board-recording-state-402.png'), animations: 'disabled' });
    if (process.env.G2_FULL_OUT) await page.screenshot({ path: process.env.G2_FULL_OUT, animations: 'disabled' });
    await ctx.close();
  });
});

// ─────────────────────────── Phase 2d.1: frames of the board's helper motion ───────────────────────────

/**
 * Freeze-and-seek (helpers-spec §7.8 item 2): page.clock moves timers, rAF and performance.now; CSS
 * animations run on the document timeline, so every animation created after `watch()` is paused when it
 * first appears (after each timer or rAF callback, and when the watched selector first matches) and set to
 * "now − its start" before a shot. A plain string: the page must not see bundler helpers.
 */
const FREEZE = `(() => {
  const stamps = new WeakMap();
  let on = false;
  const stamp = () => {
    if (!on) return;
    const now = performance.now();
    for (const a of document.getAnimations()) if (!stamps.has(a)) { stamps.set(a, now); a.pause(); }
  };
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) => st(() => { if (typeof fn === 'function') fn(...args); stamp(); }, ms);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => raf((t) => { fn(t); stamp(); });
  window.__fx = {
    t0: null,
    seek() {
      stamp();
      const now = performance.now();
      for (const a of document.getAnimations()) {
        const s = stamps.has(a) ? stamps.get(a) : now;
        if (s > -1e9) a.currentTime = Math.max(0, now - s);
      }
    },
    watch(sel) {
      window.__fx.t0 = null;
      for (const a of document.getAnimations()) stamps.set(a, -1e9);
      on = true;
      const check = () => { if (window.__fx.t0 === null && document.querySelector(sel)) { window.__fx.t0 = performance.now(); stamp(); } };
      new MutationObserver(check).observe(document.documentElement, { subtree: true, attributes: true, childList: true, attributeFilter: ['class', 'data-ghost', 'data-s'] });
      check();
    },
  };
})();`;

type FxWindow = TestWindow & { __fx?: { t0: number | null; seek(): void; watch(sel: string): void } };

/** The recording's device (402 × 874, DSF 3, safe 62 / 34), a returning player on `level`, the clock frozen on the playing board. */
async function frozenBoard(browser: import('@playwright/test').Browser, baseURL: string | undefined, level: number, patch: Partial<SaveData> = {}): Promise<{ page: Page; close(): Promise<void>; sol: number[] }> {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, baseURL });
  const page = await ctx.newPage();
  await page.addInitScript({
    content: `(() => { const set = () => { document.documentElement.style.setProperty('--dev-safe-top', '62px'); document.documentElement.style.setProperty('--dev-safe-bottom', '34px'); }; if (document.documentElement) set(); else document.addEventListener('DOMContentLoaded', set); })();`,
  });
  await page.goto('/?ads=ok');
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(returning(patch, level)));
  await page.clock.install();
  await page.addInitScript({ content: FREEZE });
  await page.reload();
  await ready(page, 'home');
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await page.clock.runFor(600);
  await page.locator('.home__play').click();
  for (let k = 0; k < 120 && !(await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing')); k++) {
    await page.clock.runFor(100);
    await page.waitForTimeout(10);
  }
  await page.clock.runFor(cfg.fx.tickers.crossMs + 3000); // past the entry and the level-start tickers
  const sol = await solution(page);
  return { page, sol, close: () => ctx.close() };
}

/** Waits (real time, nudging the frozen clock) until the watched selector matched. */
async function untilWatched(page: Page): Promise<void> {
  for (let k = 0; k < 300; k++) {
    if (await page.evaluate(() => (window as FxWindow).__fx!.t0 !== null)) return;
    await page.waitForTimeout(20);
    if (k % 4 === 3) await page.clock.runFor(16);
  }
  throw new Error('the watched element never appeared');
}

/** Moves the frozen clock to t0 + `t` ms (forward only) and seeks every new animation there. */
async function seekTo(page: Page, t: number): Promise<void> {
  const st = await page.evaluate(() => ({ t0: (window as FxWindow).__fx!.t0 as number, now: performance.now() }));
  const dt = st.t0 + t - st.now;
  if (dt > 0) await page.clock.runFor(dt);
  await page.evaluate(() => (window as FxWindow).__fx!.seek());
}

async function frame(page: Page, name: string, clip: { x: number; y: number; width: number; height: number }): Promise<void> {
  await page.screenshot({ path: join(OUT, `G2-2d1-${name}.png`), clip });
}

const pad4 = (t: number): string => String(Math.round(t)).padStart(4, '0');

test.describe('Phase 2d.1 frames: the helpers on the board (helpers-spec §1.5, §2.4, §3.3, §4.2, §4.4; 402 × 874)', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'web-390', 'one set, in its own 402 × 874 DSF 3 context');
  });

  test('the mouse: its second visit at 0 … 935 ms, then the board with its three X\'s', async ({ browser }, info) => {
    const { page, close, sol } = await frozenBoard(browser, info.project.use.baseURL, 262);
    await page.evaluate(() => (window as FxWindow).__fx!.watch('.board__mouse'));
    await page.locator('.tool--mouse').click();
    await page.clock.runFor(400);
    await page.locator('.overlay button', { hasText: 'Watch video' }).click();
    for (let k = 0; k < 200 && !(await page.evaluate(() => (window as FxWindow).__fx!.t0 !== null)); k++) {
      await page.clock.runFor(50);
      await page.waitForTimeout(10);
    }
    await untilWatched(page);
    const visit = mouseVisitMs();
    const pend = await page.evaluate(() => Array.from(document.querySelectorAll('.cell.fx-pend')).map((c) => Number(c.getAttribute('data-i'))));
    expect(pend).toHaveLength(3);
    await expect(page.locator('.board')).toHaveAttribute('aria-busy', 'true');
    let tile: { x: number; y: number; width: number; height: number } | null = null;
    let cellOfVisit = -1;
    for (const t of [0, 17, 33, 50, 67, 117, 450, 850, 867, 900, 935]) {
      await seekTo(page, visit + t);
      if (!tile) {
        cellOfVisit = Number(await page.locator('.board__mouse').getAttribute('data-cell'));
        await expect(page.locator('.board__mouse')).toHaveAttribute('data-face', 'glance');
        tile = await page.locator('.cell').nth(cellOfVisit).locator('.cell__tile').boundingBox();
      }
      const box = tile as { x: number; y: number; width: number; height: number };
      if (t === 0) await expect(page.locator('.cell').nth(cellOfVisit)).toHaveClass(/fx-press/);
      if (t === 450) {
        // the sprite at rest: 0.86 × 0.79 T, 1 % T above the tile centre (helpers-spec §1.4); the tile at rest
        const m = await page.locator('.board__mouse').boundingBox();
        const tr = (await page.locator('.cell').nth(cellOfVisit).locator('.cell__tile').boundingBox()) ?? box;
        expect((m?.width ?? 0) / tr.width).toBeCloseTo(0.861, 1);
        expect((m?.height ?? 0) / tr.width).toBeCloseTo(0.787, 1);
        expect((m?.y ?? 0) + (m?.height ?? 0) / 2 - (tr.y + tr.height / 2)).toBeCloseTo(-0.01 * tr.width, 0);
        await expect(page.locator('.cell').nth(cellOfVisit)).toHaveClass(/fx-pend/);
      }
      if (t === 850) await expect(page.locator('.cell').nth(cellOfVisit)).not.toHaveClass(/fx-pend/);
      await frame(page, `mouse-${pad4(t)}`, { x: box.x + box.width / 2 - 50, y: box.y + box.height / 2 - 50, width: 100, height: 100 });
    }
    await seekTo(page, mouseRunMs(3, false) + 50);
    await expect(page.locator('.board__mouse')).toHaveCount(0);
    await expect(page.locator('.cell.fx-pend')).toHaveCount(0);
    const n = sol.length;
    const marked = await page.evaluate(() => Array.from(document.querySelectorAll('.cell[data-s="m"]')).map((c) => Number(c.getAttribute('data-i'))));
    expect(marked.sort((a, b) => a - b)).toEqual([...pend].sort((a, b) => a - b));
    for (const i of marked) expect(sol[Math.floor(i / n)]).not.toBe(i % n); // none on a solution tile
    expect(mouseLandMs(1)).toBe(visit + cfg.fx.mouse.dwellMs);
    await page.locator('.board').screenshot({ path: join(OUT, 'G2-2d1-mouse-end.png') });
    await close();
  });

  test('the cat: the kitty\'s cat on the top-right tile at 0 … 1 400 ms', async ({ browser }, info) => {
    const { page, close, sol } = await frozenBoard(browser, info.project.use.baseURL, 262);
    expect(sol[0]).toBe(8); // our level 262: the top-right tile is the cat of its smallest colour
    await page.evaluate(() => (window as FxWindow).__fx!.watch('.cell.fx-cat'));
    await page.locator('.tool--paw').click();
    await untilWatched(page);
    const cat = page.locator('.cell').nth(8);
    await expect(cat).toHaveAttribute('data-s', 'c');
    const rest: number[] = [];
    for (const t of [0, 16, 33, 83, 116, 166, 300, 566, 600, 816, 950, 1400]) {
      await seekTo(page, t);
      if (t === 0) await expect(cat.locator('.cell__flash')).toHaveCount(1);
      if (t === 566) await expect(cat.locator('use.cell__cat')).toHaveAttribute('href', '#cat-wink');
      const w = (await cat.locator('.cell__catg').boundingBox())?.width ?? 0;
      rest.push(w);
      await frame(page, `cat-${pad4(t)}`, { x: 266, y: 190, width: 130, height: 150 });
    }
    // scale over the resting size: 1.56 at 116, 1.25 at 300 … 816, 0.89 at 950, 1 at 1 400
    const F = rest[rest.length - 1] as number;
    expect((rest[4] as number) / F).toBeCloseTo(1.56, 1);
    expect((rest[6] as number) / F).toBeCloseTo(1.25, 1);
    expect((rest[9] as number) / F).toBeCloseTo(1.25, 1);
    expect((rest[10] as number) / F).toBeCloseTo(0.89, 1);
    // at rest: the art about 0.80 × 0.75 of the tile (helpers-spec §4.7: 0.78 × 0.77 measured; our head is a
    // little wider than tall), from the cat's geometry box in the cell's 100-unit box
    const art = await cat.evaluate((el) => {
      const use = el.querySelector('use.cell__cat') as SVGGraphicsElement;
      const b = use.getBBox();
      const tile = (el.querySelector('.cell__tile') as HTMLElement).getBoundingClientRect().width;
      const k = el.getBoundingClientRect().width / 100;
      return { w: (b.width * k) / tile, h: (b.height * k) / tile };
    });
    expect(art.w).toBeCloseTo(0.8, 1);
    expect(art.h).toBeCloseTo(0.76, 1);
    await seekTo(page, 1500);
    await expect(cat).not.toHaveClass(/fx-cat/);
    await close();
  });

  test('the bulb: one ghost X pops (0 … 500 ms from its slot), then Apply draws the X\'s in and the completed row and column wave', async ({ browser }, info) => {
    const { page, close } = await frozenBoard(browser, info.project.use.baseURL, 262);
    // the kitty's cat on (0,8) first, as in the recordings
    await page.locator('.tool--paw').click();
    for (let k = 0; k < 150 && !(await page.evaluate(() => document.querySelector('.cell[data-s="c"]') !== null)); k++) {
      await page.waitForTimeout(20);
      await page.clock.runFor(16);
    }
    await page.clock.runFor(3000);
    await page.evaluate(() => (window as FxWindow).__fx!.watch('.cell[data-ghost="x"]'));
    await page.locator('.tool--bulb').click();
    await untilWatched(page);
    // the shadow's ghosts: row 0 left → right, then column 8 top → bottom, then (1,7); 60 ms apart from 333
    const order = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.cell[data-ghost="x"]'))
        .map((c) => [Number(c.dataset.i), parseInt(c.style.getPropertyValue('--gd'), 10)] as const)
        .sort((a, b) => a[1] - b[1])
        .map(([i]) => i),
    );
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 17, 26, 35, 44, 53, 62, 71, 80, 16]);
    const slot = cfg.fx.hint.ghostFirstMs + 6 * cfg.fx.hint.ghostStaggerMs; // ghost (0,6)
    const g = await page.locator('.cell').nth(6).locator('.cell__tile').boundingBox();
    for (const t of [0, 67, 133, 233, 300, 500]) {
      await seekTo(page, slot + t);
      await frame(page, `ghost-${pad4(t)}`, { x: (g?.x ?? 0) - 5, y: (g?.y ?? 0) - 5, width: 49, height: 49 });
    }
    await seekTo(page, 2500);
    await frame(page, 'hint-open', { x: 0, y: 160, width: 402, height: 480 });
    // Apply: every new X draws in at once; row 0 and column 8 are complete
    await page.evaluate(() => (window as FxWindow).__fx!.watch('.cell.fx-mark'));
    await page.locator('button.hint-apply').click();
    await untilWatched(page);
    await expect(page.locator('.cell.fx-mark')).toHaveCount(17);
    const t1 = await page.locator('.cell').nth(1).locator('.cell__tile').boundingBox();
    for (const t of [0, 35, 70, 135, 200, 250]) {
      await seekTo(page, t);
      await frame(page, `drawin-${pad4(t)}`, { x: (t1?.x ?? 0) - 5, y: (t1?.y ?? 0) - 5, width: 49, height: 49 });
    }
    await seekTo(page, 300);
    // the waves: row 0 from its right end, column 8 from its bottom, 33 ms a tile (helpers-spec §4.2)
    const wd = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>('.cell.fx-wave')).map((c) => [c.dataset.i, c.style.getPropertyValue('--wd')])));
    expect(wd['8']).toBe('0ms');
    expect(wd['0']).toBe(`${8 * cfg.fx.unitDone.waveStepMs}ms`);
    expect(wd['80']).toBe('0ms');
    for (const t of [400, 560, 720]) {
      await seekTo(page, t);
      await frame(page, `apply-${pad4(t)}`, { x: 0, y: 190, width: 402, height: 460 });
    }
    await close();
  });

  test('the Denim tile: an X, a wrong X in the darker --wrong and the white pattern glyph (helpers-spec §6.4)', async ({ browser }, info) => {
    const base = returning({}, 12);
    const { page, close, sol } = await frozenBoard(browser, info.project.use.baseURL, 12, { settings: { ...base.settings, patterns: true } });
    const n = sol.length;
    const denim = await page.evaluate(() => Array.from(document.querySelectorAll('.cell[data-dark]')).map((c) => Number(c.getAttribute('data-i'))));
    expect(denim.length).toBeGreaterThan(2);
    for (const i of denim) {
      const bg = await page.locator('.cell').nth(i).locator('.cell__tile').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toBe('rgb(91, 117, 178)'); // Denim #5B75B2
    }
    const off = denim.filter((i) => sol[Math.floor(i / n)] !== i % n);
    // an X on one, a wrong cat on another
    await page.locator('.cell').nth(off[0] as number).click();
    await page.clock.runFor(400);
    await page.locator('.cell').nth(off[1] as number).dblclick();
    await page.clock.runFor(cfg.fx.sadCatsMs + 600);
    const wrong = page.locator('.cell').nth(off[1] as number);
    await expect(wrong).toHaveAttribute('data-s', 'w');
    expect(await wrong.locator('.cell__x').first().evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(86, 10, 28)');
    const glyph = await page.locator('.cell').nth(off[2] ?? (off[0] as number)).locator('.cell__pat').evaluate((el) => getComputedStyle(el).color);
    expect(glyph).toBe('rgb(255, 255, 255)');
    await page.locator('.board').screenshot({ path: join(OUT, 'G2-2d1-denim.png') });
    await close();
  });
});
