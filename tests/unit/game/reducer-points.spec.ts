// Owner: G1 (Phase 2c.1)
// Level points per correct cat in the reducer (docs/phase2c/fish-lives-spec.md §3.1–§3.2.2, §10.8):
// the user's rule (first-hand, Play Store Meowdoku, 2026-10-10): the s-th correct cat in a row adds
// 96 × (5 + s); a mistake takes nothing away and resets the run; hint and kitty cats count like the
// player's; every level and every Retry start at 0. Our decisions: a removal changes nothing (D15) and
// a cat put back in a row that already scored adds nothing (D16); givens never score (D18).
import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import { newGame, restoreGame, toInProgress } from '../../../src/game/factory';
import { rulesFor } from '../../../src/game/modes';
import { reduce } from '../../../src/game/reducer';
import { runTotal } from '../../../src/game/scoring';
import { CellState, type Action, type GameEvent, type GameState } from '../../../src/game/types';
import { cell, dbl, lostState, makePuzzle, P5, P5G, playing, run, SOL5, step, tap, types, WRONG5 } from './fixtures';

/**
 * 10×10 for the user's sequences: region = row (A…J), solution columns 0 2 4 6 8 1 3 5 7 9. The
 * reducer only needs the solution and a region per cell, so no generator is involved.
 */
const S10 = '0246813579';
const R10 = Array.from({ length: 10 }, (_, r) => String.fromCharCode(65 + r).repeat(10)).join('');
const P10 = makePuzzle('L10', R10, S10);
const sol10 = (r: number): number => r * 10 + parseInt(S10[r] as string, 36);
/** A non-solution cell of row r (the column after the solution, wrapping). */
const wrong10 = (r: number): number => r * 10 + ((parseInt(S10[r] as string, 36) + 1) % 10);

const pointsOf = (events: readonly GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'POINTS' }> => e.type === 'POINTS');

/** Applies actions one by one and records levelPoints and catStreak after each. */
function trace(s0: GameState, actions: readonly Action[]): { state: GameState; totals: number[]; runs: number[]; events: GameEvent[] } {
  let state = s0;
  const totals: number[] = [];
  const runs: number[] = [];
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = reduce(state, a);
    state = r.state;
    events.push(...r.events);
    totals.push(state.levelPoints);
    runs.push(state.catStreak);
  }
  return { state, totals, runs, events };
}

describe('the user\'s rule on a 10×10 board (F5.2: 96 × (5 + s) per cat in a row)', () => {
  it('a mistake-free solve: POINTS carry gained 576…1 440, totals 576…10 080 and run 1…10; levelPoints follows', () => {
    const t = trace(playing(P10), Array.from({ length: 10 }, (_, r) => dbl(sol10(r), r)));
    const pts = pointsOf(t.events);
    expect(pts.map((e) => e.gained)).toEqual([576, 672, 768, 864, 960, 1_056, 1_152, 1_248, 1_344, 1_440]);
    expect(pts.map((e) => e.total)).toEqual([576, 1_248, 2_016, 2_880, 3_840, 4_896, 6_048, 7_296, 8_640, 10_080]);
    expect(pts.map((e) => e.streak)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pts.map((e) => e.cell)).toEqual(Array.from({ length: 10 }, (_, r) => sol10(r)));
    expect(t.totals).toEqual(pts.map((e) => e.total));
    expect(t.state).toMatchObject({ status: 'won', levelPoints: 10_080, catStreak: 10, scoredRows: 0b11_1111_1111 });
  });

  it('the mistake-reset sequence C C C M C C M C C C C C gives 576, 1 248, 2 016, 2 016, 2 592, 3 264, 3 264, 3 840, 4 512, 5 280, 6 144, 7 104', () => {
    let row = 0;
    let bad = 0;
    const C = (): Action => dbl(sol10(row++), row);
    const M = (): Action => dbl(wrong10(9 - bad++), 100 + bad);
    const seq = [C(), C(), C(), M(), C(), C(), M(), C(), C(), C(), C(), C()];
    const t = trace(playing(P10), seq);
    expect(t.totals).toEqual([576, 1_248, 2_016, 2_016, 2_592, 3_264, 3_264, 3_840, 4_512, 5_280, 6_144, 7_104]);
    // s back to 1 at the first cat after each mistake (0 right after it).
    expect(t.runs).toEqual([1, 2, 3, 0, 1, 2, 0, 1, 2, 3, 4, 5]);
    expect(pointsOf(t.events).map((e) => e.gained)).toEqual([576, 672, 768, 576, 672, 576, 672, 768, 864, 960]);
    // Two mistakes leave one fish; the board is solved with 7 104 against 10 080 unbroken.
    expect(t.state).toMatchObject({ status: 'won', hearts: 1, mistakes: 2, levelPoints: 7_104 });
  });

  it('a mistake takes nothing away (no POINTS event, levelPoints unchanged) and resets the run to 0', () => {
    const s = run(playing(P10), [dbl(sol10(0)), dbl(sol10(1))]).state;
    const r = reduce(s, dbl(wrong10(5)));
    expect(types(r.events)).toEqual(['MISTAKE']);
    expect(r.state).toMatchObject({ levelPoints: 1_248, catStreak: 0, scoredRows: 0b11 });
  });
});

describe('who places the cat (F5.4) and what is not a cat', () => {
  it('player, hint (Apply with a placeCell) and kitty cats all score and continue the run: C H K C → 576, 1 248, 2 016, 2 880', () => {
    let s = reduce(playing(), dbl(SOL5[0] as number)).state;
    const totals = [s.levelPoints];
    s = reduce(s, { type: 'HINT_OPEN', step: step({ kind: 'single', placeCell: SOL5[1] as number }), charged: true }).state;
    let r = reduce(s, { type: 'HINT_APPLY', t: 1 });
    expect(pointsOf(r.events)).toEqual([{ type: 'POINTS', cell: SOL5[1], gained: 672, total: 1_248, streak: 2 }]);
    s = r.state;
    totals.push(s.levelPoints);
    r = reduce(s, { type: 'KITTY', cell: SOL5[2] as number, t: 2 });
    expect(pointsOf(r.events)).toEqual([{ type: 'POINTS', cell: SOL5[2], gained: 768, total: 2_016, streak: 3 }]);
    s = reduce(r.state, { type: 'KITTY_DONE' }).state;
    totals.push(s.levelPoints);
    s = reduce(s, dbl(SOL5[3] as number)).state;
    totals.push(s.levelPoints);
    expect(totals).toEqual([576, 1_248, 2_016, 2_880]);
    expect(s.catStreak).toBe(4);
  });

  it('D15 / D16: a removal changes nothing; putting the cat back adds nothing and keeps the run (C C, remove 2, re-place 2, C → 576, 1 248, 1 248, 1 248, 2 016)', () => {
    const c2 = SOL5[1] as number;
    const t = trace(playing(), [dbl(SOL5[0] as number), dbl(c2), dbl(c2), dbl(c2), dbl(SOL5[2] as number)]);
    expect(t.totals).toEqual([576, 1_248, 1_248, 1_248, 2_016]);
    expect(t.runs).toEqual([1, 2, 2, 2, 3]);
    expect(types(t.events)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE', 'CAT_PLACED', 'POINTS', 'REGION_DONE', 'CAT_REMOVED', 'CAT_PLACED', 'REGION_DONE', 'CAT_PLACED', 'POINTS', 'REGION_DONE']);
    expect(t.state.scoredRows).toBe(0b111);
  });

  it('a re-placed cat by a hint or the kitty scores nothing either (the row already scored)', () => {
    const c = SOL5[0] as number;
    let s = run(playing(), [dbl(c), dbl(c)]).state; // place, remove
    expect(s).toMatchObject({ levelPoints: 576, catStreak: 1, catsPlaced: 0, scoredRows: 0b1 });
    const k = reduce(s, { type: 'KITTY', cell: c, t: 3 });
    expect(types(k.events)).toEqual(['CAT_PLACED', 'REGION_DONE']);
    expect(k.state).toMatchObject({ levelPoints: 576, catStreak: 1 });
    s = reduce(s, { type: 'HINT_OPEN', step: step({ kind: 'single', placeCell: c }), charged: true }).state;
    const h = reduce(s, { type: 'HINT_APPLY', t: 4 });
    expect(types(h.events)).toEqual(['HINT_APPLIED', 'CAT_PLACED', 'REGION_DONE']);
    expect(h.state.levelPoints).toBe(576);
  });

  it('marks, paint, a hint\'s eliminations or mistaken_mark clear, opening or closing a hint and ticks change nothing', () => {
    const s0 = reduce(playing(), dbl(SOL5[0] as number)).state;
    const same = (s: GameState) => expect([s.levelPoints, s.catStreak, s.scoredRows]).toEqual([576, 1, 0b1]);
    let s = run(s0, [tap(cell(1, 1)), tap(cell(1, 1)), { type: 'PAINT', cells: [cell(3, 3), cell(4, 4)], mode: 'mark', t: 1 }, { type: 'TICK', dtMs: 500 }]).state;
    same(s);
    s = reduce(s, { type: 'HINT_OPEN', step: step({ kind: 'shadow', effectCells: [cell(1, 0)] }), charged: true }).state;
    same(s);
    s = reduce(s, { type: 'HINT_APPLY', t: 2 }).state;
    same(s);
    s = reduce(s, tap(SOL5[3] as number)).state;
    s = reduce(s, { type: 'HINT_OPEN', step: step({ kind: 'mistaken_mark', effectCells: [SOL5[3] as number] }), charged: true }).state;
    s = reduce(s, { type: 'HINT_APPLY', t: 3 }).state;
    same(s);
    s = reduce(reduce(s, { type: 'HINT_OPEN', step: step({ kind: 'shadow' }), charged: false }).state, { type: 'HINT_CLOSE' }).state;
    same(s);
  });

  it('D18: givens never score (P5G: row 2 is given); the other four cats total runTotal(4)', () => {
    const g = playing(P5G);
    expect(g).toMatchObject({ levelPoints: 0, catStreak: 0, scoredRows: 0, catsPlaced: 1 });
    const t = trace(g, [0, 1, 3, 4].map((r) => dbl(SOL5[r] as number)));
    expect(t.state).toMatchObject({ status: 'won', levelPoints: runTotal(4, g.rules.points), catStreak: 4, scoredRows: 0b11011 });
    expect(t.state.levelPoints).toBe(2_880);
  });
});

describe('the attempt (F5.1): fail, revive, Retry, a new board', () => {
  it('LOST keeps the points; a revive keeps them and the next cat adds 576', () => {
    let s = run(playing(), [dbl(SOL5[0] as number), dbl(SOL5[1] as number), ...WRONG5.slice(0, 3).map((c) => dbl(c))]).state;
    expect(s).toMatchObject({ status: 'lost', hearts: 0, levelPoints: 1_248, catStreak: 0 });
    const rv = reduce(s, { type: 'REVIVE', t: 1 });
    expect(types(rv.events)).toEqual(['REVIVED']);
    s = rv.state;
    expect(s).toMatchObject({ status: 'playing', levelPoints: 1_248, catStreak: 0, scoredRows: 0b11 });
    const r = reduce(s, dbl(SOL5[2] as number));
    expect(pointsOf(r.events)).toEqual([{ type: 'POINTS', cell: SOL5[2], gained: 576, total: 1_824, streak: 1 }]);
  });

  it('RETRY starts the attempt at 0 / 0 / 0, and so does a new board', () => {
    const lost = run(playing(), [dbl(SOL5[0] as number), ...WRONG5.slice(0, 3).map((c) => dbl(c))]).state;
    expect(lost.levelPoints).toBe(576);
    const r = reduce(lost, { type: 'RETRY' }).state;
    expect([r.levelPoints, r.catStreak, r.scoredRows]).toEqual([0, 0, 0]);
    const fresh = newGame(P5, 'daily');
    expect([fresh.levelPoints, fresh.catStreak, fresh.scoredRows]).toEqual([0, 0, 0]);
    expect(reduce(reduce(r, { type: 'START' }).state, dbl(SOL5[4] as number)).state.levelPoints).toBe(576);
  });

  it('a scoring winning cat emits CAT_PLACED, POINTS, REGION_DONE, WON, and the state at WON holds the level total', () => {
    const s = run(playing(), SOL5.slice(0, 4).map((c) => dbl(c))).state;
    const r = reduce(s, dbl(SOL5[4] as number));
    expect(types(r.events)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE', 'WON']);
    expect(r.state).toMatchObject({ status: 'won', levelPoints: 3_840, catStreak: 5 });
  });
});

describe('modes that score nothing ({0, 0})', () => {
  it('the tutorial: no POINTS event and 0 (its wrong tiles only pulse)', () => {
    const t = trace(playing(P5, 'tutorial'), [dbl(WRONG5[0] as number), ...SOL5.map((c) => dbl(c))]);
    expect(types(t.events)).not.toContain('POINTS');
    expect(types(t.events)).not.toContain('MISTAKE');
    expect(t.state).toMatchObject({ status: 'won', levelPoints: 0 });
  });

  it('a mode dropped from levelPoints.modes: no POINTS event and 0', () => {
    const rules = rulesFor('daily', mergeConfig({ levelPoints: { modes: ['level', 'event'] } }));
    const t = trace(reduce(newGame(P5, 'daily', rules), { type: 'START' }).state, SOL5.map((c) => dbl(c)));
    expect(types(t.events)).not.toContain('POINTS');
    expect(t.state.levelPoints).toBe(0);
  });

  it('event puzzles score like levels (eventRules keeps the points rule)', () => {
    const s = reduce(newGame(makePuzzle('Elantern-walk-2026/0', 'AABBCABBCCADBCCDDEECDEEEE', '02413'), 'event'), { type: 'START' }).state;
    expect(reduce(s, dbl(SOL5[0] as number)).state.levelPoints).toBe(576);
  });
});

/** Tiny deterministic LCG (no Math.random in tests). */
function lcg(seed: number): (n: number) => number {
  let x = seed >>> 0;
  return (n) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
}

describe('invariants under random play (every action, hints and kitties included)', () => {
  const popcount = (x: number): number => x.toString(2).replace(/0/g, '').length;

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('seed %i: points never drop except at RETRY, stay within the run bounds, and a slot restores them exactly', (seed) => {
    const rnd = lcg(seed);
    const puzzle = seed % 3 === 0 ? P5G : P5;
    let s = playing(puzzle);
    for (let i = 0; i < 400; i++) {
      const c = rnd(25);
      const pick = rnd(10);
      const a: Action =
        pick < 2
          ? tap(c, i)
          : pick < 6
            ? dbl(pick < 4 ? (SOL5[rnd(5)] as number) : c, i)
            : pick === 6
              ? { type: 'KITTY', cell: SOL5[rnd(5)] as number, t: i }
              : pick === 7
                ? { type: 'REVIVE', t: i }
                : pick === 8
                  ? { type: 'RETRY' }
                  : { type: 'HINT_OPEN', step: step({ kind: 'single', placeCell: SOL5[rnd(5)] as number }), charged: true };
      const prev = s.status === 'ready' ? reduce(s, { type: 'START' }).state : s;
      const r = reduce(prev, a);
      s = r.state;
      if (s.status === 'hint') s = reduce(s, { type: 'HINT_APPLY', t: i }).state;
      if (s.status === 'kitty') s = reduce(s, { type: 'KITTY_DONE' }).state;
      if (a.type === 'RETRY' && prev.status === 'lost') expect([s.levelPoints, s.catStreak, s.scoredRows]).toEqual([0, 0, 0]);
      else expect(s.levelPoints).toBeGreaterThanOrEqual(prev.levelPoints);
      const rule = s.rules.points;
      const k = popcount(s.scoredRows);
      let catRows = 0;
      let givenRows = 0;
      for (let j = 0; j < 25; j++) {
        if (s.cells[j] === CellState.Cat) catRows |= 1 << Math.floor(j / 5);
        if (s.cells[j] === CellState.Given) givenRows |= 1 << Math.floor(j / 5);
      }
      expect(s.scoredRows & catRows).toBe(catRows);
      expect(s.scoredRows & givenRows).toBe(0);
      expect(s.catStreak).toBeLessThanOrEqual(k);
      expect(s.levelPoints).toBeGreaterThanOrEqual(runTotal(s.catStreak, rule) + (k - s.catStreak) * rule.first);
      expect(s.levelPoints).toBeLessThanOrEqual(runTotal(k - s.catStreak, rule) + runTotal(s.catStreak, rule));
      if (s.mistakes === 0) expect([s.catStreak, s.levelPoints]).toEqual([k, runTotal(k, rule)]);
      // The slot written with the board restores the same points, run and rows (never derived).
      const back = restoreGame(puzzle, toInProgress(s, i));
      expect([back.levelPoints, back.catStreak, back.scoredRows]).toEqual([s.levelPoints, s.catStreak, s.scoredRows]);
      if (s.status === 'won') s = playing(puzzle);
    }
  });

  it('the fixtures: a lost P5 has scored nothing', () => {
    expect(lostState().levelPoints).toBe(0);
  });
});
