// Owner: A; G2 (Phase 2d: the measured stack scaled by s, look-spec §1.1). Layout math over a grid of
// viewports, insets (even gutters: every tile inset gap / 2, look-spec §1.8), hit-testing and drag
// interpolation (02 §6.1).
// phase2b F0: readViewport / large-text computeLayout cases moved here from ui/review-fixes.spec.ts (B).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import * as layout from '../../../src/ui/board/layout';
import { cellsAlongSegment, computeLayout, evenInsets, gapFor, hitTest, readViewport, type GameLayout } from '../../../src/ui/board/layout';

const G = cfg.layout.game;

/** Row tops in viewport px, from the layout (look-spec §1.1 table columns). */
function rows(g: GameLayout): { pills: number; board: number; discs: number; banner: number } {
  const pills = g.top + g.bar + g.gaps.barToPills;
  const board = pills + g.pills + g.gaps.pillsToRules + g.rules + g.gaps.rulesToBoard;
  const discs = board + g.board + g.gaps.boardToTools;
  return { pills, board, discs, banner: discs + g.tools + g.gaps.toolsToBanner };
}

describe('computeLayout (look-spec §1.1)', () => {
  // [label, vw, vh, safeTop, safeBottom, band, n] → [s, colW, compact, slot, gap, board, y0, pills y, board y, discs y, banner y | null]
  type Row = [string, number, number, number, number, boolean, number, [number, number, boolean, number, number, number, number, number, number, number, number | null]];
  const TABLE: Row[] = [
    ['402 × 874 (62/34, band): the recording', 402, 874, 62, 34, true, 10, [1.0, 402, false, 38, 3, 390.66, 62.2, 124.5, 250.1, 693.8, 777.5]],
    ['402 × 874 web', 402, 874, 0, 0, false, 10, [1.0, 402, false, 38, 3, 390.66, 62.0, 124.3, 249.9, 693.6, null]],
    ['390 × 844 (47/34, band)', 390, 844, 47, 34, true, 10, [0.97, 390, false, 36, 3, 379, 50.6, 111.0, 232.9, 663.3, 744.5]],
    ['390 × 844 web', 390, 844, 0, 0, false, 10, [0.97, 390, false, 36, 3, 379, 60.1, 120.6, 242.4, 672.9, null]],
    ['360 × 640 web', 360, 640, 0, 0, false, 10, [0.896, 360, false, 33, 3, 349.84, 4.7, 60.5, 173.0, 570.3, null]],
    ['360 × 640 FBIG (band)', 360, 640, 0, 0, true, 10, [0.811, 326, true, 30, 2, 316.8, 0.0, 50.5, 152.4, 512.2, 580.0]],
    ['320 × 568 web', 320, 568, 0, 0, false, 10, [0.796, 320, true, 30, 2, 310.97, 3.7, 53.3, 153.3, 506.5, null]],
    ['320 × 568 web, 12 × 12', 320, 568, 0, 0, false, 12, [0.796, 320, true, 25, 2, 310.97, 3.7, 53.3, 153.3, 506.5, null]],
    ['320 × 568 FBIG (band)', 320, 568, 0, 0, true, 10, [0.712, 286, true, 27, 2, 278.14, 0.0, 44.4, 133.8, 449.7, 509.2]],
    ['320 × 568 FBIG (band), 12 × 12', 320, 568, 0, 0, true, 12, [0.712, 286, true, 22, 2, 278.14, 0.0, 44.4, 133.8, 449.7, 509.2]],
    ['1280 × 800 desktop web', 1280, 800, 0, 0, false, 10, [1.136, 457, false, 43, 3, 443.83, 0.0, 70.8, 213.5, 717.5, null]],
    ['1280 × 800 desktop web, 12 × 12', 1280, 800, 0, 0, false, 12, [1.136, 457, false, 35, 3, 443.83, 0.0, 70.8, 213.5, 717.5, null]],
    ['320 × 568 FBIG (band), 12 × 12, safe top 20', 320, 568, 20, 0, true, 12, [0.684, 275, true, 21, 2, 267.4, 20.0, 62.6, 148.6, 452.3, 509.6]],
    ['375 × 667 FBIG (band), 12 × 12, safe top 20', 375, 667, 20, 0, true, 12, [0.821, 330, true, 26, 2, 320.56, 20.0, 71.1, 174.2, 538.2, 606.9]],
    // Audit B11: the recording's device on a 9 × 9 board keeps the card (the helper recordings: card 390.67, the stack as on 10 × 10)
    ['402 × 874 (62/34, band), 9 × 9', 402, 874, 62, 34, true, 9, [1.0, 402, false, 42, 3, 390.66, 62.2, 124.5, 250.1, 693.8, 777.5]],
  ];

  it.each(TABLE)('%s matches the look-spec §1.1 table', (_label, vw, vh, safeTop, safeBottom, banner, n, want) => {
    const g = computeLayout({ vw, vh, safeTop, safeBottom, n, banner });
    const [s, colW, compact, slot, gap, board, y0, pillsY, boardY, discsY, bannerY] = want;
    expect(g.s).toBeCloseTo(s, 2);
    expect(Math.abs(g.colW - colW)).toBeLessThanOrEqual(0.5);
    expect(g.compact).toBe(compact);
    expect(g.slot).toBe(slot);
    expect(g.gap).toBe(gap);
    expect(g.board).toBeCloseTo(board, 1);
    const r = rows(g);
    for (const [got, exp] of [[g.top, y0], [r.pills, pillsY], [r.board, boardY], [r.discs, discsY]] as const) expect(Math.abs(got - exp)).toBeLessThanOrEqual(0.5);
    if (bannerY === null) expect(g.band).toBe(0);
    else {
      expect(g.band).toBe(cfg.ads.banner.bannerPx);
      expect(Math.abs(r.banner - bannerY)).toBeLessThanOrEqual(0.5);
    }
  });

  it('at the recording\'s size the measured boxes come out: card 390.66 (audit B11: the card keeps its width), tile 35, gap 3, radius 11.6, pad 5.33, discs 60.3', () => {
    const g = computeLayout({ vw: 402, vh: 874, safeTop: 62, safeBottom: 34, n: 10, banner: true });
    expect(g).toMatchObject({ s: 1, slot: 38, gap: 3, radius: G.cardRadius });
    expect(g.board).toBeCloseTo(402 - 2 * G.cardMargin, 9); // measured 390.67
    expect(g.pad).toBeCloseTo((402 - 2 * G.cardMargin - 380) / 2, 9);
    // 9 × 9 (the helper recordings): the same card, the 2.66 px the whole slots leave in the padding (7.83 to the first tile; measured 7.33–7.7)
    const g9 = computeLayout({ vw: 402, vh: 874, safeTop: 62, safeBottom: 34, n: 9, banner: true });
    expect(g9.board).toBeCloseTo(402 - 2 * G.cardMargin, 9);
    expect(g9.slot).toBe(42);
    expect(g9.pad + g9.gap / 2).toBeCloseTo(7.83, 2);
    expect(g.slot - g.gap).toBe(35);
    expect(g.tools).toBeCloseTo(60.3, 5);
    expect(g.bar).toBe(52);
    expect(g.pills).toBeCloseTo(31.3, 5);
    expect(g.rules).toBeCloseTo(60.3, 5);
    expect(g.gaps).toMatchObject({ barToPills: 10.3, pillsToRules: 8.3, rulesToBoard: 25.7, boardToTools: 53, toolsToBanner: 23.4, bottom: 12.3 });
    // 2d I-3: the 2b names (topBar, chips) are gone
    expect(g).not.toHaveProperty('topBar');
    expect(g).not.toHaveProperty('chips');
    // without the band the toolsToBanner gap is gone too
    expect(computeLayout({ vw: 402, vh: 874, safeTop: 62, safeBottom: 34, n: 10 }).gaps.toolsToBanner).toBe(0);
  });

  it('one scale s for everything: rows, gaps, pad and radius follow s; compact below layout.game.compactScale', () => {
    const g = computeLayout({ vw: 320, vh: 568, safeTop: 0, safeBottom: 0, n: 10 });
    expect(g.s).toBeCloseTo(320 / 402, 6);
    expect(g.bar).toBeCloseTo(G.bar * g.s, 6);
    expect(g.pills).toBeCloseTo(G.pills * g.s, 6);
    expect(g.tools).toBeCloseTo(G.tools * g.s, 6);
    expect(g.gaps.boardToTools).toBeCloseTo(G.boardToTools * g.s, 6);
    expect(g.radius).toBeCloseTo(G.cardRadius * g.s, 6);
    // the padding: at least round(cardPad × s), plus half of what the whole slots leave of the card (audit B11)
    expect(g.pad).toBeGreaterThanOrEqual(Math.max(3, Math.round(G.cardPad * g.s)));
    expect(g.pad).toBeCloseTo((g.board - g.slot * 10) / 2, 9);
    expect(g.pad - Math.max(3, Math.round(G.cardPad * g.s))).toBeLessThan(10 / 2);
    expect(g.compact).toBe(true);
    expect(computeLayout({ vw: 402, vh: 874, safeTop: 0, safeBottom: 0, n: 10 }).compact).toBe(false);
    // s is clamped to [minScale, maxScale]
    expect(computeLayout({ vw: 3000, vh: 3000, safeTop: 0, safeBottom: 0, n: 8 }).s).toBe(G.maxScale);
    expect(computeLayout({ vw: 100, vh: 200, safeTop: 0, safeBottom: 0, n: 8 }).s).toBe(G.minScale);
  });

  it('the spare height goes above the bar up to topSpareMax × s, the rest below', () => {
    const tall = computeLayout({ vw: 402, vh: 1200, safeTop: 10, safeBottom: 0, n: 10 });
    expect(tall.top).toBeCloseTo(10 + G.topSpareMax * tall.s, 6);
    const tight = computeLayout({ vw: 402, vh: 874, safeTop: 62, safeBottom: 34, n: 10, banner: true });
    expect(tight.top - 62).toBeLessThan(1);
  });

  it('safe areas and the banner band shrink the board when height binds', () => {
    const a = computeLayout({ vw: 430, vh: 640, safeTop: 0, safeBottom: 0, n: 9 });
    const b = computeLayout({ vw: 430, vh: 640, safeTop: 47, safeBottom: 34, n: 9 });
    const c = computeLayout({ vw: 430, vh: 640, safeTop: 47, safeBottom: 34, n: 9, banner: true });
    expect(b.s).toBeLessThan(a.s);
    expect(b.slot).toBeLessThan(a.slot);
    expect(c.slot).toBeLessThan(b.slot);
  });

  it('never overflows across a grid of viewports, board sizes, safe areas and the band', () => {
    for (let vw = 320; vw <= 1440; vw += 37) {
      for (let vh = 568; vh <= 1200; vh += 29) {
        for (const safe of [0, 24]) {
          for (const banner of [false, true]) {
            for (let n = 4; n <= 12; n++) {
              const g = computeLayout({ vw, vh, safeTop: safe, safeBottom: safe, n, banner });
              const ctx = `${vw}×${vh} n=${n} safe=${safe} band=${banner}`;
              expect(g.compact, ctx).toBe(g.s < G.compactScale);
              expect(g.slot, ctx).toBeGreaterThanOrEqual(1);
              expect(g.board, ctx).toBeCloseTo(g.slot * n + 2 * g.pad, 9);
              // audit B11: the card keeps its full size (the whole slots' remainder is padding, < n px)
              expect(g.board, ctx).toBeCloseTo(g.boardMax, 9);
              expect(g.pad, ctx).toBeGreaterThanOrEqual(Math.max(3, Math.round(G.cardPad * g.s)));
              expect(2 * g.pad - 2 * Math.max(3, Math.round(G.cardPad * g.s)), ctx).toBeLessThan(n);
              expect(g.board, ctx).toBeLessThanOrEqual(g.colW);
              expect(g.colW, ctx).toBeLessThanOrEqual(vw + 1e-9);
              const g2 = g.gaps;
              const bottom = rows(g).discs + g.tools + g2.toolsToBanner + g.band + g2.bottom;
              expect(bottom, ctx).toBeLessThanOrEqual(vh - safe + 1e-6);
              expect(g.top, ctx).toBeGreaterThanOrEqual(safe);
              // a 12×12 board on a 320 px phone with no safe areas still gets ≥ 22 px cells (look-spec §1.1;
              // 21 px with a 20 px safe top, the table row above)
              if (n === 12 && safe === 0) expect(g.slot, ctx).toBeGreaterThanOrEqual(22);
            }
          }
        }
      }
    }
  });

  it('clamps degenerate viewports instead of returning zero or negative sizes', () => {
    const g = computeLayout({ vw: 100, vh: 150, safeTop: 0, safeBottom: 0, n: 10 });
    expect(g.s).toBe(G.minScale);
    expect(g.slot).toBe(1);
    expect(g.boardMax).toBe(0);
    expect(g.gap).toBe(1);
    expect(computeLayout({ vw: 0, vh: 0, safeTop: 0, safeBottom: 0, n: 0 }).slot).toBe(1);
  });

  it('reads every value from layout.game (a config variant moves the stack)', () => {
    const c = mergeConfig({ layout: { game: { cardPad: 10, gapFraction: 0.2 } } } as never);
    const g = computeLayout({ vw: 402, vh: 874, safeTop: 0, safeBottom: 0, n: 10 }, c);
    expect(g.slot).toBe(Math.floor((402 - 2 * G.cardMargin - 20) / 10));
    expect(g.pad).toBeCloseTo((402 - 2 * G.cardMargin - g.slot * 10) / 2, 9); // 10 + the remainder
    expect(g.gap).toBe(Math.round(g.slot * 0.2));
  });
});

describe('gapFor (look-spec §1.8)', () => {
  it('is max(1, round(slot × gapFraction)): 3 at the measured slot 38, 2 at the 320 px slots', () => {
    expect(G.gapFraction).toBe(0.079);
    expect(gapFor(38)).toBe(3);
    expect(gapFor(30)).toBe(2);
    expect(gapFor(21)).toBe(2);
    expect(gapFor(12)).toBe(1);
    expect(gapFor(1)).toBe(1);
    expect(gapFor(0)).toBe(1);
    expect(gapFor(57)).toBe(5);
  });
});

describe('hitTest', () => {
  const g = { left: 100, top: 50, pad: 12, slot: 30, n: 6 };
  it('maps points to cells, gaps to the nearest cell, and clamps to the grid', () => {
    expect(hitTest(100 + 12 + 15, 50 + 12 + 15, g)).toBe(0);
    expect(hitTest(100 + 12 + 30 * 5 + 1, 50 + 12 + 30 * 2 + 29, g)).toBe(2 * 6 + 5);
    expect(hitTest(100 + 12 + 29.9, 62, g)).toBe(0);
    expect(hitTest(100 + 12 + 30.1, 62, g)).toBe(1);
    expect(hitTest(0, 0, g)).toBe(0);
    expect(hitTest(10_000, 10_000, g)).toBe(35);
    expect(hitTest(105, 10_000, g)).toBe(30); // pad area → edge cell
  });
});

describe('cellsAlongSegment', () => {
  const n = 8;
  const rc = (i: number): [number, number] => [Math.floor(i / n), i % n];
  it('returns nothing for the same cell', () => {
    expect(cellsAlongSegment(9, 9, n)).toEqual([]);
  });
  it('walks rows, columns and diagonals cell by cell, excluding the start', () => {
    expect(cellsAlongSegment(0, 3, n)).toEqual([1, 2, 3]);
    expect(cellsAlongSegment(3, 0, n)).toEqual([2, 1, 0]);
    expect(cellsAlongSegment(0, 3 * n, n)).toEqual([n, 2 * n, 3 * n]);
    expect(cellsAlongSegment(0, 3 * n + 3, n)).toEqual([n + 1, 2 * n + 2, 3 * n + 3]);
  });
  it('every step is king-adjacent and ends at the target, for all pairs', () => {
    for (let a = 0; a < n * n; a++) {
      for (let b = 0; b < n * n; b++) {
        const path = cellsAlongSegment(a, b, n);
        if (a === b) continue;
        expect(path[path.length - 1]).toBe(b);
        let prev = rc(a);
        for (const c of path) {
          const cur = rc(c);
          expect(Math.max(Math.abs(cur[0] - prev[0]), Math.abs(cur[1] - prev[1]))).toBe(1);
          prev = cur;
        }
      }
    }
  });
});

describe('readViewport', () => {
  it('reads window size and zero safe areas in jsdom', () => {
    const vp = readViewport(window);
    expect(vp.vw).toBe(window.innerWidth);
    expect(vp.vh).toBe(window.innerHeight);
    expect(vp).toMatchObject({ safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0 });
  });
});

describe('evenInsets (look-spec §1.8)', () => {
  it('every inset is gapFor(slot) / 2 on all four sides, whatever the regions', () => {
    const big = evenInsets(10, 38);
    expect(big).toHaveLength(100);
    for (const ins of big) expect(ins).toEqual({ top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 });
    for (const ins of evenInsets(12, 22)) expect(ins).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    expect(evenInsets(0, 36)).toEqual([]);
  });

  it('gives the same inset on all four sides of every tile, so every gutter is even (2 × inset = the gap)', () => {
    for (const slot of [21, 22, 25, 30, 33, 36, 38, 43, 57]) {
      const v = gapFor(slot) / 2;
      for (const n of [4, 9, 12]) {
        const ins = evenInsets(n, slot);
        expect(ins).toHaveLength(n * n);
        for (const i of ins) expect([i.top, i.right, i.bottom, i.left]).toEqual([v, v, v, v]);
      }
    }
  });

  it('the region-aware insets are gone (phase2b §1.8)', () => {
    expect('regionInsets' in layout).toBe(false);
  });
});

// ── moved from ui/review-fixes.spec.ts (phase2b F0 test split) ──

afterEach(() => {
  vi.restoreAllMocks();
});

/** A window whose visualViewport and size the test controls; getComputedStyle is spied. */
function fakeWindow(size: { w: number; h: number; dpr?: number }, vv: { width: number; height: number; scale: number } | null) {
  const gcs = vi.fn(() => ({ paddingTop: '20px', paddingRight: '0px', paddingBottom: '34px', paddingLeft: '0px', fontSize: '32px' }));
  const win = {
    document,
    get innerWidth() {
      return size.w;
    },
    get innerHeight() {
      return size.h;
    },
    get devicePixelRatio() {
      return size.dpr ?? 1;
    },
    visualViewport: vv,
    getComputedStyle: gcs,
  } as unknown as Window;
  return { win, gcs };
}

describe('readViewport (A11Y-2, A11Y-6, RP-3)', () => {
  it('measures the visual viewport at page scale 1, so pinch-zoom does not shrink the board', () => {
    const vv = { width: 390, height: 844, scale: 1 };
    const { win } = fakeWindow({ w: 390, h: 844 }, vv);
    expect(readViewport(win, true)).toMatchObject({ vw: 390, vh: 844 });
    // A 2× pinch: the visual viewport becomes 195 × 422 at scale 2.
    Object.assign(vv, { width: 195, height: 422, scale: 2 });
    expect(readViewport(win)).toMatchObject({ vw: 390, vh: 844 });
    // The on-screen keyboard shrinks the visual viewport at scale 1: followed.
    Object.assign(vv, { width: 390, height: 500, scale: 1 });
    expect(readViewport(win).vh).toBe(500);
  });

  it('reads the safe-area / rem probe once per window size, not on every relayout', () => {
    const size = { w: 390, h: 844 };
    const { win, gcs } = fakeWindow(size, null);
    const first = readViewport(win, true);
    expect(first).toMatchObject({ safeTop: 20, safeBottom: 34, remPx: 32 });
    readViewport(win);
    readViewport(win);
    expect(gcs).toHaveBeenCalledTimes(1);
    size.w = 844; // rotation
    size.h = 390;
    readViewport(win);
    expect(gcs).toHaveBeenCalledTimes(2);
  });
});

describe('computeLayout with large text (A11Y-6, look-spec §1.1 barH / rulesH)', () => {
  it('grows the rules row by min(rulesGrowMax, textScale × 1.15) and the bar by min(rulesGrowMax, textScale); compact keeps the rules row', () => {
    // the recording's phone: height-bound, so a taller bar and rules row take room from the board
    const base = { vw: 402, vh: 874, safeTop: 62, safeBottom: 34, n: 10, banner: true };
    const one = computeLayout(base);
    expect(one.rules).toBeCloseTo(G.rules * one.s, 6);
    expect(computeLayout({ ...base, textScale: 1 }).rules).toBe(one.rules);
    expect(computeLayout({ ...base, textScale: 0.5 }).rules).toBe(one.rules);
    const two = computeLayout({ ...base, textScale: 2 });
    expect(two.rules).toBeCloseTo(G.rules * two.s * Math.min(G.rulesGrowMax, 2 * 1.15), 6);
    expect(two.bar).toBeCloseTo(G.bar * two.s * Math.min(G.rulesGrowMax, 2), 6);
    expect(computeLayout({ ...base, textScale: 1.5 }).bar).toBeCloseTo(G.bar * one.s * 1.5, 6);
    // the board gives up the space
    expect(two.board).toBeLessThan(one.board);
    const compact = computeLayout({ ...base, vw: 320, vh: 568, safeTop: 0, safeBottom: 0, textScale: 2 });
    expect(compact.compact).toBe(true);
    expect(compact.rules).toBeCloseTo(G.rules * compact.s, 6); // diagrams only: no taller row
    expect(compact.bar).toBeCloseTo(G.bar * compact.s * 2, 6); // the bar's text is rem-based: it grows in compact too
  });
});

describe('the dev safe-area override (look-spec §1.1)', () => {
  it('the probe reads max(env(safe-area-inset-*), var(--dev-safe-*)) for the top and the bottom', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/ui/board/layout.ts'), 'utf8');
    expect(src).toContain('max(env(safe-area-inset-top,0px),var(--dev-safe-top,0px))');
    expect(src).toContain('max(env(safe-area-inset-bottom,0px),var(--dev-safe-bottom,0px))');
  });
});
