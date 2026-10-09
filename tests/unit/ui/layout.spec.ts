// Owner: A. Layout math (02 §19) over a grid of viewports, insets (phase2b §1.5 even gutters; the
// region-aware insets of 02 §17.4 are deleted, §1.8), hit-testing and drag interpolation (02 §6.1).
// phase2b F0: readViewport / large-text computeLayout cases moved here from ui/review-fixes.spec.ts (B).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import * as layout from '../../../src/ui/board/layout';
import { cellsAlongSegment, computeLayout, evenInsets, hitTest, readViewport } from '../../../src/ui/board/layout';

const L = cfg.layout;

describe('computeLayout (02 §19)', () => {
  it('matches the reference phone 390×844, N = 8', () => {
    const g = computeLayout({ vw: 390, vh: 844, safeTop: 0, safeBottom: 0, n: 8 });
    // phase2b §1.5 / §10: card padding 10 (was 12).
    expect(g).toMatchObject({ colW: 358, compact: false, topBar: 56, pills: 44, chips: 40, tools: 80, boardMax: 358, pad: 10 });
    expect(g.slot).toBe(Math.floor((358 - 20) / 8)); // 42
    expect(g.board).toBe(42 * 8 + 20);
  });

  it('minimum viewport 320×568 with a 12×12 board is compact and fits', () => {
    const g = computeLayout({ vw: 320, vh: 568, safeTop: 0, safeBottom: 0, n: 12 });
    expect(g.compact).toBe(true);
    expect(g.pills).toBe(L.compactPills);
    expect(g.chips).toBe(L.compactChips);
    expect(g.boardMax).toBe(288);
    expect(g.slot).toBe(22); // floor((288 − 2 × 10) / 12)
    expect(g.board).toBe(22 * 12 + 20); // 284 (phase2b boardPad 10)
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

describe('evenInsets (phase2b §1.5)', () => {
  it('every inset equals layout.insetPx from a 30 px slot, layout.insetSmallPx below, whatever the regions', () => {
    const big = evenInsets(8, 36);
    expect(big).toHaveLength(64);
    for (const ins of big) expect(ins).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    expect(evenInsets(4, 30)[0]).toEqual({ top: cfg.layout.insetPx, right: 2, bottom: 2, left: 2 });
    for (const ins of evenInsets(12, 29.9)) expect(ins).toEqual({ top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 });
    expect(evenInsets(0, 36)).toEqual([]);
  });

  it('gives the same inset on all four sides of every tile, so every gutter is even (2 × inset)', () => {
    for (const slot of [22, 29, 30, 36, 42, 57]) {
      const v = slot >= L.insetSmallBelowSlot ? L.insetPx : L.insetSmallPx;
      for (const n of [4, 9, 12]) {
        const ins = evenInsets(n, slot);
        expect(ins).toHaveLength(n * n);
        for (const i of ins) expect([i.top, i.right, i.bottom, i.left]).toEqual([v, v, v, v]);
      }
    }
    expect(L.insetPx * 2).toBe(4); // a 4 px white gutter (§1.5)
    expect(L.insetSmallPx * 2).toBe(3); // 3 px below a 30 px slot
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

describe('computeLayout with large text (A11Y-6)', () => {
  it('grows the rule-chip row with the text scale (room for a third line, at most 2.4×), leaving compact mode alone', () => {
    const base = { vw: 390, vh: 844, safeTop: 0, safeBottom: 0, n: 8 };
    expect(computeLayout(base).chips).toBe(cfg.layout.chips);
    expect(computeLayout({ ...base, textScale: 1 }).chips).toBe(cfg.layout.chips);
    expect(computeLayout({ ...base, textScale: 2 }).chips).toBe(Math.round(cfg.layout.chips * 2.3));
    expect(computeLayout({ ...base, textScale: 3 }).chips).toBe(Math.round(cfg.layout.chips * 2.4));
    expect(computeLayout({ ...base, textScale: 0.5 }).chips).toBe(cfg.layout.chips);
    // 200 % text on the reference phone: the board keeps its full width.
    expect(computeLayout({ ...base, textScale: 2 }).board).toBe(computeLayout(base).board);
    const compact = computeLayout({ ...base, vh: 568, textScale: 2 });
    expect(compact.compact).toBe(true);
    expect(compact.chips).toBe(cfg.layout.compactChips); // icons only: no taller row
  });
});
