// Owner: G1 (Phase 2d)
// The mouse helper (docs/phase2d/look-spec.md §1.12, §5.1): pickMouseCells only offers Empty cells
// outside the solution (never a cat cell or a marked, wrong or given cell), min(count, candidates)
// of them, deterministically per seed, [] when there are none; the reducer's MOUSE marks them, skips a
// cell that is no longer Empty, emits MARKED { source: 'mouse' }, changes no points, hearts or stats,
// and does nothing outside PLAYING.
// Phase 2d.1 (helpers-spec §1.3, §1.5, §7.6): the cells come back in PICK order (the shuffle order,
// not sorted: the visit order), a permutation-prefix of the candidates; mouseVisitMs / mouseLandMs /
// mouseRunMs; the reducer keeps that order in MARKED.cells.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { makeRng } from '../../../src/engine/rng';
import { hasMouseCandidate, mouseCandidates, mouseLandMs, mouseRunMs, mouseSeed, mouseVisitMs, pickMouseCells } from '../../../src/game/mouse';
import { reduce } from '../../../src/game/reducer';
import { CellState, type GameState } from '../../../src/game/types';
import { cell, dbl, lostState, P5, P5G, paintA, playing, run, SOL5, step, tap, wonState, WRONG5 } from './fixtures';

const N = 25;
const isSolution = (s: GameState, c: number): boolean => s.puzzle.solution[Math.floor(c / s.puzzle.n)] === c % s.puzzle.n;

/** A state with `cells` set directly (pickMouseCells reads only puzzle and cells). */
function withCells(s: GameState, set: Record<number, number>): GameState {
  const cells = s.cells.slice();
  for (const [k, v] of Object.entries(set)) cells[Number(k)] = v;
  return { ...s, cells };
}

describe('pickMouseCells (§1.12)', () => {
  it('the candidates are the Empty cells outside the solution, in board order', () => {
    const s = playing();
    const all = mouseCandidates(s);
    expect(all).toHaveLength(N - 5);
    expect(all).toEqual([...all].sort((a, b) => a - b));
    for (const c of SOL5) expect(all).not.toContain(c);
    expect(hasMouseCandidate(s)).toBe(true);
  });

  it('never picks a cat cell, a solution cell, a marked cell, a wrong cell or a given', () => {
    // Marks, a wrong cell, a placed cat and a given (P5G: row 2's cat is a Given).
    let s = playing(P5G);
    s = run(s, [tap(WRONG5[0] as number), tap(cell(3, 3)), dbl(SOL5[0] as number)]).state;
    s = withCells(s, { [WRONG5[1] as number]: CellState.Wrong });
    for (let seed = 0; seed < 200; seed++) {
      const picked = pickMouseCells(s, 3, `L3:mouse:${seed}`);
      expect(picked).toHaveLength(3);
      expect(new Set(picked).size).toBe(3);
      for (const c of picked) {
        expect(s.cells[c]).toBe(CellState.Empty);
        expect(isSolution(s, c)).toBe(false);
      }
    }
  });

  it('never more than `count`; fewer when fewer candidates exist; [] when none or a bad count', () => {
    const s = playing();
    const empties = mouseCandidates(s);
    // Leave exactly two candidates: mark every other non-solution cell.
    const keep = new Set(empties.slice(0, 2));
    const marks: Record<number, number> = {};
    for (const c of empties) if (!keep.has(c)) marks[c] = CellState.Mark;
    const two = withCells(s, marks);
    expect([...pickMouseCells(two, 3, 'x')].sort((a, b) => a - b)).toEqual([...keep]);
    expect(pickMouseCells(two, 1, 'x')).toHaveLength(1);
    // None left: every non-solution cell marked (the solution cells stay Empty).
    const none = withCells(two, Object.fromEntries([...keep].map((c) => [c, CellState.Mark])));
    expect(mouseCandidates(none)).toEqual([]);
    expect(hasMouseCandidate(none)).toBe(false);
    expect(pickMouseCells(none, 3, 'x')).toEqual([]);
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(pickMouseCells(s, bad, 'x')).toEqual([]);
    // All of them, in the shuffle's order: a permutation of the candidates.
    const all = pickMouseCells(s, 100, 'x');
    expect([...all].sort((a, b) => a - b)).toEqual(empties);
    expect(pickMouseCells(s, cfg.mouse.cells, 'x')).toHaveLength(cfg.mouse.cells);
  });

  it('deterministic per seed (the session seed `${puzzleId}:mouse:${uses}`), returned in PICK order (2d.1)', () => {
    const s = playing();
    expect(mouseSeed('L2', 0)).toBe('L2:mouse:0');
    const a = pickMouseCells(s, 3, mouseSeed('L2', 0));
    expect(pickMouseCells(s, 3, mouseSeed('L2', 0))).toEqual(a);
    // The same partial Fisher–Yates over the engine's seeded RNG (cyrb128 → sfc32), NOT sorted: the
    // shuffle's prefix is the visit order (helpers-spec §1.3).
    const pool = mouseCandidates(s);
    const rng = makeRng(mouseSeed('L2', 0));
    for (let i = 0; i < 3; i++) {
      const j = i + rng.int(pool.length - i);
      [pool[i], pool[j]] = [pool[j] as number, pool[i] as number];
    }
    expect(a).toEqual(pool.slice(0, 3));
    // A permutation-prefix of the candidates: k distinct candidates; with k = all, a permutation.
    expect(new Set(a).size).toBe(3);
    for (const c of a) expect(mouseCandidates(s)).toContain(c);
    // Over many seeds some draws are not in board order (the order is not sorted away).
    let unsorted = 0;
    for (let u = 0; u < 50; u++) {
      const d = pickMouseCells(s, 3, mouseSeed('L2', u));
      if (d.join(',') !== [...d].sort((x, y) => x - y).join(',')) unsorted++;
    }
    expect(unsorted).toBeGreaterThan(10);
    // Other uses give other draws (not all equal over a few seeds).
    const draws = new Set([0, 1, 2, 3, 4].map((u) => pickMouseCells(s, 3, mouseSeed('L2', u)).join(',')));
    expect(draws.size).toBeGreaterThan(1);
  });

  it('uniform enough: every candidate gets picked over many seeds', () => {
    const s = playing();
    const seen = new Map<number, number>();
    for (let i = 0; i < 2000; i++) for (const c of pickMouseCells(s, 3, `u:${i}`)) seen.set(c, (seen.get(c) ?? 0) + 1);
    expect([...seen.keys()].sort((a, b) => a - b)).toEqual(mouseCandidates(s));
    // 2000 × 3 / 20 = 300 per cell on average; each within a generous band.
    for (const n of seen.values()) expect(n).toBeGreaterThan(200);
  });

  it('does not mutate the state', () => {
    const s = playing();
    const before = s.cells.slice();
    pickMouseCells(s, 3, 'x');
    expect(s.cells).toEqual(before);
  });
});

describe('mouse timings (2d.1 §1.5)', () => {
  it('mouseVisitMs = dwellMs + exitMs (935); mouseLandMs(k) = k × 935 + 850', () => {
    expect(cfg.fx.mouse).toEqual({ appearMs: 115, dwellMs: 850, exitMs: 85 });
    expect(mouseVisitMs()).toBe(935);
    expect([0, 1, 2].map((k) => mouseLandMs(k))).toEqual([850, 1785, 2720]);
  });

  it('mouseRunMs(3, false) = 3 × 935 + 170; reduced motion = fx.reducedMotionFadeMs (150)', () => {
    expect(cfg.fx.markPopMs).toBe(170);
    expect(mouseRunMs(3, false)).toBe(3 * 935 + 170);
    expect(mouseRunMs(3, false)).toBe(2975);
    expect(mouseRunMs(1, false)).toBe(935 + 170);
    expect(mouseRunMs(3, true)).toBe(150);
    expect(mouseRunMs(3, true)).toBe(cfg.fx.reducedMotionFadeMs);
  });

  it('follow the config (mergeConfig)', () => {
    const c = mergeConfig({ fx: { mouse: { appearMs: 100, dwellMs: 500, exitMs: 100 }, markPopMs: 200, reducedMotionFadeMs: 90 } });
    expect(mouseVisitMs(c)).toBe(600);
    expect(mouseLandMs(2, c)).toBe(1700);
    expect(mouseRunMs(2, false, c)).toBe(1400);
    expect(mouseRunMs(2, true, c)).toBe(90);
  });
});

describe('reducer MOUSE (§1.12)', () => {
  it('marks the listed cells as one move and one MARKED { source: mouse }, in pick order (2d.1)', () => {
    const s = playing();
    const cells = pickMouseCells(s, 3, 'L2:mouse:0');
    const r = reduce(s, { type: 'MOUSE', cells, t: 42 });
    expect(r.events).toEqual([{ type: 'MARKED', cells, source: 'mouse' }]);
    // An unsorted list keeps its order in the event (the board visits in event order).
    const back = [...cells].sort((a, b) => b - a);
    expect(reduce(s, { type: 'MOUSE', cells: back, t: 42 }).events).toEqual([{ type: 'MARKED', cells: back, source: 'mouse' }]);
    for (const c of cells) expect(r.state.cells[c]).toBe(CellState.Mark);
    expect(r.state.moves).toEqual([{ t: 42, kind: 'mark', cells }]);
    expect(r.state.status).toBe('playing');
  });

  it('no points, no mistake, no heart, no helper counter, no stat', () => {
    let s = run(playing(), [dbl(SOL5[0] as number, 1)]).state; // one cat: some level points
    s = reduce(s, { type: 'MOUSE', cells: pickMouseCells(s, 3, 'x'), t: 2 }).state;
    const before = run(playing(), [dbl(SOL5[0] as number, 1)]).state;
    expect(s.levelPoints).toBe(before.levelPoints);
    expect(s.catStreak).toBe(before.catStreak);
    expect(s.scoredRows).toBe(before.scoredRows);
    expect([s.hearts, s.mistakes, s.hintsUsed, s.kittiesUsed, s.catsPlaced, s.regionsDone, s.revivesUsed]).toEqual([
      before.hearts,
      before.mistakes,
      before.hintsUsed,
      before.kittiesUsed,
      before.catsPlaced,
      before.regionsDone,
      before.revivesUsed,
    ]);
  });

  it('skips a cell that is no longer Empty (marked, cat, wrong), a solution cell, a bad index and a duplicate', () => {
    let s = playing();
    s = run(s, [tap(WRONG5[0] as number), dbl(SOL5[1] as number)]).state;
    s = withCells(s, { [WRONG5[1] as number]: CellState.Wrong });
    const fresh = cell(4, 4);
    const r = reduce(s, {
      type: 'MOUSE',
      cells: [WRONG5[0] as number, SOL5[1] as number, WRONG5[1] as number, SOL5[2] as number, -1, 99, 2.5, fresh, fresh],
      t: 3,
    });
    expect(r.events).toEqual([{ type: 'MARKED', cells: [fresh], source: 'mouse' }]);
    expect(r.state.cells[SOL5[2] as number]).toBe(CellState.Empty); // never an X on a cat cell
  });

  it('nothing to mark: no change, no event', () => {
    const s = playing();
    const r = reduce(s, { type: 'MOUSE', cells: [SOL5[0] as number], t: 1 });
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
    expect(reduce(s, { type: 'MOUSE', cells: [], t: 1 }).state).toBe(s);
    expect(reduce(s, { type: 'MOUSE', cells: null as unknown as number[], t: 1 }).state).toBe(s);
  });

  it('does nothing outside PLAYING (ready, hint, kitty, won, lost)', () => {
    const hintState = reduce(playing(), { type: 'HINT_OPEN', step: step({ kind: 'shadow' }), charged: false }).state;
    const kittyState = reduce(playing(), { type: 'KITTY', cell: SOL5[0] as number, t: 1 }).state;
    const ready = { ...playing(), status: 'ready' as const };
    for (const s of [ready, hintState, kittyState, wonState(), lostState()]) {
      const r = reduce(s, { type: 'MOUSE', cells: [cell(4, 4)], t: 9 });
      expect(r.state).toBe(s);
      expect(r.events).toEqual([]);
    }
  });

  it('the X marks are ordinary marks: a tap clears one, an erase drag clears them', () => {
    const s0 = playing(P5);
    const cells = pickMouseCells(s0, 3, 'L2:mouse:1');
    const s1 = reduce(s0, { type: 'MOUSE', cells, t: 1 }).state;
    const s2 = reduce(s1, tap(cells[0] as number, 2)).state;
    expect(s2.cells[cells[0] as number]).toBe(CellState.Empty);
    const s3 = reduce(s2, paintA(cells.slice(1), 'erase', 3)).state;
    for (const c of cells) expect(s3.cells[c]).toBe(CellState.Empty);
  });

  it('a plain mark or paint never carries a source', () => {
    const r = reduce(playing(), tap(WRONG5[0] as number));
    expect(r.events).toEqual([{ type: 'MARKED', cells: [WRONG5[0]] }]);
    expect('source' in (r.events[0] as object)).toBe(false);
    expect(P5.n).toBe(5);
  });
});
