// Owner: G2 (Phase 2d)
// Visual review captures of the board (look-spec §5.3) at 320, 390 and 1280 (the web-320, web-390 and
// web-1280 projects) and at the recording's 402 × 874 (DSF 3, its own context, run once from web-390):
// the mid-game board, the X marks (default, and with Colour patterns on: the edge), the wrong X, the
// ghost X of a hint, every palette colour on a 12 × 12 board, and the tile size, gap and radius
// checked against computeLayout. Stored as docs/phase2d/screenshots/G2-board-<name>-<width>.png
// (VISUAL_OUT overrides the folder) and reviewed by a person, never diffed in CI. The 402 × 874
// capture is "the state of the recording": our 10 × 10 level 785, whose top-left five cells are one
// Coral region, with X marks on them (the side-by-side with the user's frames is composed outside the
// repo, D-2d-0 d). Created at Phase 2d L0 by moving the board capture of visual.spec.ts; the helpers
// are copies of visual.spec.ts's (no shared helper module under tests/e2e).
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { cfg } from '../../src/app/config';
import { defaults } from '../../src/game/save';
import { periodKeyAt } from '../../src/game/scoring';
import type { SaveData } from '../../src/game/types';
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
    expect(m.pad).toBe(Math.max(3, Math.round(cfg.layout.game.cardPad * m.s)));
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
    await expect(x.locator('.cell__xg > rect.cell__x')).toHaveCount(2);
    await expect(x.locator('.cell__xg > rect.cell__xe')).toHaveCount(2);
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
      expect(w.bar).toBe('rgb(110, 14, 37)'); // --wrong #6E0E25
      expect(w.ring).toContain('rgb(110, 14, 37)');
      const edge = await page.locator('.cell[data-s="m"] .cell__xe').first().evaluate((el) => ({ display: getComputedStyle(el).display, fill: getComputedStyle(el).fill }));
      if (patterns) expect(edge.display).not.toBe('none');
      else expect(edge.display).toBe('none');
      await page.waitForTimeout(cfg.fx.sadCatsMs + 200);
      await boardShot(page, patterns ? 'x-patterns' : 'x-default');
    }
    // the ghost X of a hint: Apply's crosses at 40 % (look-spec §1.10)
    await page.locator('.tool--bulb').click();
    await page.waitForSelector('.board[data-hl="hint"]');
    await page.waitForTimeout(400);
    const ghosts = page.locator('.cell[data-ghost="x"][data-s="e"] .cell__x');
    if ((await ghosts.count()) > 0) {
      const op = await ghosts.first().evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(op).toBeGreaterThan(0.1);
      expect(op).toBeLessThan(0.7);
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
    await open(page, returning({}, 785)); // our 10 × 10 level 785: cells 0–4 are one Coral region
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
    // look-spec §1.1, §1.8: the card is 390 wide at x 6 (whole-px slots of 38: tile 35, gap 3)
    expect(box?.width).toBeCloseTo(390, 0);
    expect(box?.x).toBeCloseTo(6, 0);
    const slot = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.board') as Element).getPropertyValue('--slot')));
    expect(slot).toBe(38);
    await page.waitForTimeout(300);
    await page.locator('.board').screenshot({ path: join(OUT, 'G2-board-recording-state-402.png'), animations: 'disabled' });
    if (process.env.G2_FULL_OUT) await page.screenshot({ path: process.env.G2_FULL_OUT, animations: 'disabled' });
    await ctx.close();
  });
});
