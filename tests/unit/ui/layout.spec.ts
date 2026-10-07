// Owner: ui-board. Layout math (02 §19) over a grid of viewports, insets (02 §17.4), hit-testing and
// drag interpolation (02 §6.1).
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { cellsAlongSegment, computeLayout, hitTest, readViewport, regionInsets } from '../../../src/ui/board/layout';

const L = cfg.layout;

describe('computeLayout (02 §19)', () => {
  it('matches the reference phone 390×844, N = 8', () => {
    const g = computeLayout({ vw: 390, vh: 844, safeTop: 0, safeBottom: 0, n: 8 });
    expect(g).toMatchObject({ colW: 358, compact: false, topBar: 56, pills: 44, chips: 40, tools: 80, boardMax: 358, pad: 12 });
    expect(g.slot).toBe(Math.floor((358 - 24) / 8)); // 41
    expect(g.board).toBe(41 * 8 + 24);
  });

  it('minimum viewport 320×568 with a 12×12 board is compact and fits', () => {
    const g = computeLayout({ vw: 320, vh: 568, safeTop: 0, safeBottom: 0, n: 12 });
    expect(g.compact).toBe(true);
    expect(g.pills).toBe(L.compactPills);
    expect(g.chips).toBe(L.compactChips);
    expect(g.boardMax).toBe(288);
    expect(g.slot).toBe(22);
    expect(g.board).toBe(288);
  });

  it('desktop column is capped at 480 px', () => {
    const g = computeLayout({ vw: 1280, vh: 800, safeTop: 0, safeBottom: 0, n: 8 });
    expect(g.colW).toBe(480);
    expect(g.boardMax).toBe(480);
    expect(g.slot).toBe(57);
  });

  it('safe areas shrink the board when height is the constraint', () => {
    const a = computeLayout({ vw: 430, vh: 640, safeTop: 0, safeBottom: 0, n: 9 });
    const b = computeLayout({ vw: 430, vh: 640, safeTop: 47, safeBottom: 34, n: 9 });
    expect(b.tools).toBe(L.tools + L.toolsGap + 34);
    expect(b.boardMax).toBe(a.boardMax - 47 - 34);
    expect(b.slot).toBeLessThan(a.slot);
  });

  it('compact switches exactly at layout.compactHeight', () => {
    expect(computeLayout({ vw: 400, vh: L.compactHeight - 1, safeTop: 0, safeBottom: 0, n: 6 }).compact).toBe(true);
    expect(computeLayout({ vw: 400, vh: L.compactHeight, safeTop: 0, safeBottom: 0, n: 6 }).compact).toBe(false);
  });

  it('never overflows across a grid of viewports and board sizes', () => {
    for (let vw = 320; vw <= 1440; vw += 37) {
      for (let vh = 568; vh <= 1200; vh += 29) {
        for (const safe of [0, 24]) {
          for (let n = 4; n <= 12; n++) {
            const g = computeLayout({ vw, vh, safeTop: safe, safeBottom: safe, n });
            const ctx = `${vw}×${vh} n=${n} safe=${safe}`;
            expect(g.compact, ctx).toBe(vh < L.compactHeight);
            expect(g.slot, ctx).toBeGreaterThanOrEqual(1);
            expect(g.board, ctx).toBe(g.slot * n + 2 * g.pad);
            expect(g.board, ctx).toBeLessThanOrEqual(g.boardMax);
            expect(g.board, ctx).toBeLessThanOrEqual(vw - 2 * L.gutter);
            const column = safe + g.topBar + g.pills + g.chips + g.board + g.tools + L.vGap * L.vGapCount;
            expect(column, ctx).toBeLessThanOrEqual(vh);
            // A 12×12 board on a 360 px phone still gets ≥ 22 px cells (02 §18 touch targets).
            if (safe === 0 && n === 12) expect(g.slot, ctx).toBeGreaterThanOrEqual(22);
          }
        }
      }
    }
  });

  it('clamps degenerate viewports instead of returning zero or negative sizes', () => {
    const g = computeLayout({ vw: 100, vh: 200, safeTop: 0, safeBottom: 0, n: 10 });
    expect(g.slot).toBe(1);
    expect(g.boardMax).toBe(0);
  });
});

describe('regionInsets (02 §17.4)', () => {
  it('uses 1.5 px toward the same region and 3.5 px toward another region or the edge', () => {
    // 2×2: A A / B A
    const ins = regionInsets(2, Uint8Array.from([0, 0, 1, 0]));
    expect(ins[0]).toEqual({ top: 3.5, right: 1.5, bottom: 3.5, left: 3.5 });
    expect(ins[1]).toEqual({ top: 3.5, right: 3.5, bottom: 1.5, left: 1.5 });
    expect(ins[2]).toEqual({ top: 3.5, right: 3.5, bottom: 3.5, left: 3.5 });
    expect(ins[3]).toEqual({ top: 1.5, right: 3.5, bottom: 3.5, left: 3.5 });
  });

  it('is symmetric across every shared edge (so the gap midpoint is the slot edge)', () => {
    const n = 6;
    const regions = Uint8Array.from({ length: n * n }, (_, i) => ((i * 7) % 11) % n);
    const ins = regionInsets(n, regions);
    for (let i = 0; i < n * n; i++) {
      if (i % n < n - 1) expect(ins[i]?.right).toBe(ins[i + 1]?.left);
      if (i + n < n * n) expect(ins[i]?.bottom).toBe(ins[i + n]?.top);
    }
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
