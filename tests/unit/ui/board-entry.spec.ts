// Owner: B. Board entry (phase2b §2.9, §2.13): entryEndMs(n) ≤ 700 for n = 4…12, the diagonal wave
// order, the CSS variables playEntry publishes, the reduced fade; and the board-cat idle loops
// (breathing phase per cat, ear flicks every 8–14 s only in the idle mood) and the event accessory.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { CellState } from '../../../src/game/types';
import { cellNoise, earFlickDelayMs, entryEndMs, entryStaggerMs, entryTileDelayMs, entryTiming } from '../../../src/ui/board/board-fx';
import { createBoardView, type BoardInput, type BoardModel, type BoardView } from '../../../src/ui/board/board-view';

const F = cfg.fx;

describe('entryEndMs (§2.9)', () => {
  it('is 80 + (2n − 2) × stagger + 220, never above fx.boardEntryMs, for every board size', () => {
    for (let n = 4; n <= 12; n++) {
      const stagger = Math.min(F.boardEntryStaggerMs, F.boardEntryWaveBudgetMs / (2 * n - 2));
      expect(entryStaggerMs(n)).toBeCloseTo(stagger, 9);
      const end = entryEndMs(n);
      expect(end).toBe(Math.min(Math.round(F.boardEntryWaveStartMs + (2 * n - 2) * stagger + F.boardEntryTileMs), F.boardEntryMs));
      expect(end).toBeLessThanOrEqual(700);
    }
    expect(entryEndMs(4)).toBe(408);
    expect(entryEndMs(12)).toBe(696);
  });

  it('reduced motion: the 150 ms fade', () => {
    for (const n of [4, 8, 12]) expect(entryEndMs(n, true)).toBe(F.reducedMotionFadeMs);
    expect(entryTiming(8, true)).toEqual({ durationMs: F.reducedMotionFadeMs, staggerMs: 0 });
    expect(entryTiming(8, false)).toEqual({ durationMs: F.boardEntryTileMs, staggerMs: entryStaggerMs(8) });
  });

  it('the wave runs along the diagonals: tile (r, c) starts at 80 + (r + c) × stagger', () => {
    const n = 8;
    expect(entryTileDelayMs(0, 0, n)).toBe(F.boardEntryWaveStartMs);
    expect(entryTileDelayMs(1, 2, n)).toBe(entryTileDelayMs(2, 1, n));
    expect(entryTileDelayMs(0, 3, n)).toBeLessThan(entryTileDelayMs(1, 3, n));
    // The last tile ends exactly at entryEndMs.
    expect(entryTileDelayMs(n - 1, n - 1, n) + F.boardEntryTileMs).toBe(entryEndMs(n));
  });

  it('earFlickDelayMs spans fx.earFlickMinMs…MaxMs; cellNoise is stable and in [0, 1)', () => {
    expect(earFlickDelayMs(0)).toBe(F.earFlickMinMs);
    expect(earFlickDelayMs(1)).toBe(F.earFlickMaxMs);
    expect(earFlickDelayMs(2)).toBe(F.earFlickMaxMs);
    for (let i = 0; i < 50; i++) {
      const v = cellNoise(i, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(cellNoise(i, 3)).toBe(v);
    }
  });
});

// ─────────────────────────────── on the board view ───────────────────────────────

const N = 4;
function model(over: Partial<BoardModel> = {}): BoardModel {
  return {
    puzzleId: 'L1',
    n: N,
    regions: Uint8Array.from([0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3]),
    colors: Uint8Array.from([0, 1, 2, 3]),
    cells: new Uint8Array(N * N),
    regionsDone: 0,
    patterns: false,
    ...over,
  };
}
const withCats = (cats: readonly number[]): Uint8Array => {
  const c = new Uint8Array(N * N);
  for (const i of cats) c[i] = CellState.Cat;
  return c;
};
const input = { tap: vi.fn(), doubleTap: vi.fn(), paint: vi.fn(), bulb: vi.fn(), paw: vi.fn() } as unknown as BoardInput;

describe('BoardView.playEntry and idle loops', () => {
  let board: BoardView;
  let reduced = false;

  beforeEach(() => {
    reduced = false;
    board = createBoardView(model({ cells: withCats([1, 7]) }), input, { reducedMotion: () => reduced, random: () => 0.5 });
    document.body.appendChild(board.el);
  });
  afterEach(() => {
    board.destroy();
    vi.useRealTimers();
  });

  it('returns entryEndMs(n), publishes the --entry-* variables and gives every cell its diagonal', () => {
    vi.useFakeTimers();
    const end = board.playEntry();
    expect(end).toBe(entryEndMs(N));
    const st = board.el.style;
    expect(st.getPropertyValue('--entry-ms')).toBe(`${F.boardEntryTileMs}ms`);
    expect(st.getPropertyValue('--entry-stagger')).toBe(`${entryStaggerMs(N)}ms`);
    expect(st.getPropertyValue('--entry-start')).toBe(`${F.boardEntryWaveStartMs}ms`);
    expect(st.getPropertyValue('--entry-card-ms')).toBe(`${F.boardEntryCardMs}ms`);
    expect(st.getPropertyValue('--entry-rise')).toBe(`${F.boardEntryRisePx}px`);
    expect(board.el.classList.contains('fx-entry')).toBe(true);
    const cells = Array.from(board.el.querySelectorAll<HTMLElement>('.cell'));
    cells.forEach((c, i) => expect(c.style.getPropertyValue('--diag')).toBe(String(Math.floor(i / N) + (i % N))));
    vi.advanceTimersByTime(end + 100);
    expect(board.el.classList.contains('fx-entry')).toBe(false);
  });

  it('reduced motion: a plain fade, START after 150 ms', () => {
    reduced = true;
    expect(board.playEntry()).toBe(F.reducedMotionFadeMs);
    expect(board.el.hasAttribute('data-entry-reduced')).toBe(true);
    expect(board.el.style.getPropertyValue('--entry-stagger')).toBe('0ms');
    expect(board.el.style.getPropertyValue('--entry-rise')).toBe('0px');
  });

  it('breathing: the period and scale come from cfg; each cat has its own phase', () => {
    expect(board.el.style.getPropertyValue('--breathe-ms')).toBe(`${F.catBreatheMs}ms`);
    expect(Number(board.el.style.getPropertyValue('--breathe-k'))).toBeCloseTo(1 + F.catBreatheScale, 9);
    const delays = Array.from(board.el.querySelectorAll<HTMLElement>('.cell')).map((c) => c.style.getPropertyValue('--breathe-delay'));
    for (const d of delays) {
      const ms = -parseInt(d, 10);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThan(F.catBreatheMs);
    }
    expect(new Set(delays).size).toBeGreaterThan(N);
    // The glow size is mirrored for A's .cell__glow.
    expect(board.el.style.getPropertyValue('--glow-scale')).toBe(String(cfg.fx.win.glowScale));
  });

  it('ear flick: every cat flicks within fx.earFlickMaxMs, for fx.earFlickMs, then again later', () => {
    vi.useFakeTimers();
    board.destroy();
    board = createBoardView(model({ cells: withCats([1, 7]) }), input, { reducedMotion: () => false, random: () => 0 });
    const cat1 = board.el.querySelector<HTMLElement>('.cell[data-i="1"]') as HTMLElement;
    const seen = new Set<string>();
    for (let t = 0; t < F.earFlickMaxMs + 50; t += 20) {
      vi.advanceTimersByTime(20);
      board.el.querySelectorAll('.cell.is-flick').forEach((c) => seen.add((c as HTMLElement).dataset.i ?? ''));
    }
    expect([...seen].sort()).toEqual(['1', '7']);
    // A flick lasts earFlickMs; the next one (random 0 → earFlickMinMs) comes after it.
    expect(cat1.classList.contains('is-flick')).toBe(false);
    let flicks = 0;
    let was = false;
    for (let t = 0; t < 2 * F.earFlickMinMs + 100; t += 10) {
      vi.advanceTimersByTime(10);
      const on = cat1.classList.contains('is-flick');
      if (on && !was) flicks++;
      was = on;
    }
    expect(flicks).toBeGreaterThanOrEqual(2);
    // Cells without a cat never flick.
    expect(board.el.querySelector('.cell[data-i="0"]')?.classList.contains('is-flick')).toBe(false);
  });

  it('no ear flick outside the idle mood or with reduced motion', () => {
    vi.useFakeTimers();
    board.setMood('happy');
    for (let t = 0; t < F.earFlickMaxMs * 2; t += 50) {
      vi.advanceTimersByTime(50);
      expect(board.el.querySelectorAll('.cell.is-flick')).toHaveLength(0);
    }
    board.setMood('idle');
    reduced = true;
    for (let t = 0; t < F.earFlickMaxMs * 2; t += 50) {
      vi.advanceTimersByTime(50);
      expect(board.el.querySelectorAll('.cell.is-flick')).toHaveLength(0);
    }
  });

  it('destroy stops the idle timers', () => {
    vi.useFakeTimers();
    board.destroy();
    board = createBoardView(model({ cells: withCats([1, 7]) }), input, { reducedMotion: () => false });
    board.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('setAccessory layers acc-<name> over every cat, follows new cats, and removes it with null (§4.4)', () => {
    board.setAccessory('lantern');
    const accs = () => Array.from(board.el.querySelectorAll('use.cell__acc')).map((u) => u.getAttribute('href'));
    expect(accs()).toEqual(['#acc-lantern', '#acc-lantern']);
    const acc = board.el.querySelector('.cell[data-i="1"] use.cell__acc');
    const cat = board.el.querySelector('.cell[data-i="1"] use.cell__cat');
    expect(acc?.parentNode).toBe(cat?.parentNode);
    expect(acc?.getAttribute('width')).toBe(cat?.getAttribute('width'));
    board.update(model({ cells: withCats([1, 7, 8]) }));
    expect(accs()).toHaveLength(3);
    board.setAccessory('scarf');
    expect(accs()).toEqual(['#acc-scarf', '#acc-scarf', '#acc-scarf']);
    board.setAccessory(null);
    expect(accs()).toHaveLength(0);
  });
});
