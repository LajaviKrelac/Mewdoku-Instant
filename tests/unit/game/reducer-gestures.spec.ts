// Owner: game. 02 §6.2 cell-state × gesture table, 02 §8 mistake model, region done, win/lose, move log.
import { describe, expect, it } from 'vitest';
import { newGame } from '../../../src/game/factory';
import { reduce } from '../../../src/game/reducer';
import { CellState, type Action, type GameEvent, type GameState } from '../../../src/game/types';
import { cell, dbl, P5, P5G, paintA, playing, run, SOL5, tap, WRONG5 } from './fixtures';

type StateName = 'Empty' | 'Mark' | 'Cat' | 'Wrong' | 'Given';
type Gesture = 'tap' | 'double' | 'drag-mark' | 'drag-erase';

const GIVEN_CELL = cell(2, 4); // row 2's cat is a Given in P5G
const SOL_CELL = SOL5[0] as number; // (0,0)
const NON_SOL = WRONG5[0] as number; // (0,1)

/** A playing state whose `target` cell is in state `name`; `solution` picks a solution / non-solution cell. */
function arrange(name: StateName, solution: boolean): { s: GameState; target: number } {
  if (name === 'Given') return { s: playing(P5G), target: GIVEN_CELL };
  const target = solution ? SOL_CELL : NON_SOL;
  const s0 = playing();
  switch (name) {
    case 'Empty':
      return { s: s0, target };
    case 'Mark':
      return { s: reduce(s0, tap(target)).state, target };
    case 'Cat':
      return { s: reduce(s0, dbl(SOL_CELL)).state, target: SOL_CELL };
    case 'Wrong':
      return { s: reduce(s0, dbl(NON_SOL)).state, target: NON_SOL };
  }
}

function act(g: Gesture, c: number): Action {
  if (g === 'tap') return tap(c, 5);
  if (g === 'double') return dbl(c, 5);
  return paintA([c], g === 'drag-mark' ? 'mark' : 'erase', 5);
}

interface Row {
  from: StateName;
  gesture: Gesture;
  solution: boolean;
  to: StateName;
  events: GameEvent['type'][];
}

// Every cell of the 02 §6.2 table; a cat attempt is split into its §8 outcomes (solution / not).
const TABLE: Row[] = [
  { from: 'Empty', gesture: 'tap', solution: false, to: 'Mark', events: ['MARKED'] },
  { from: 'Empty', gesture: 'double', solution: true, to: 'Cat', events: ['CAT_PLACED', 'REGION_DONE'] },
  { from: 'Empty', gesture: 'double', solution: false, to: 'Wrong', events: ['MISTAKE'] },
  { from: 'Empty', gesture: 'drag-mark', solution: false, to: 'Mark', events: ['MARKED'] },
  { from: 'Empty', gesture: 'drag-erase', solution: false, to: 'Empty', events: [] },
  { from: 'Mark', gesture: 'tap', solution: false, to: 'Empty', events: ['UNMARKED'] },
  { from: 'Mark', gesture: 'double', solution: true, to: 'Cat', events: ['CAT_PLACED', 'REGION_DONE'] },
  { from: 'Mark', gesture: 'double', solution: false, to: 'Wrong', events: ['MISTAKE'] },
  { from: 'Mark', gesture: 'drag-mark', solution: false, to: 'Mark', events: [] },
  { from: 'Mark', gesture: 'drag-erase', solution: false, to: 'Empty', events: ['UNMARKED'] },
  { from: 'Cat', gesture: 'tap', solution: true, to: 'Cat', events: ['PULSE'] },
  { from: 'Cat', gesture: 'double', solution: true, to: 'Empty', events: ['CAT_REMOVED'] },
  { from: 'Cat', gesture: 'drag-mark', solution: true, to: 'Cat', events: [] },
  { from: 'Cat', gesture: 'drag-erase', solution: true, to: 'Cat', events: [] },
  { from: 'Wrong', gesture: 'tap', solution: false, to: 'Wrong', events: ['PULSE'] },
  { from: 'Wrong', gesture: 'double', solution: false, to: 'Wrong', events: ['PULSE'] },
  { from: 'Wrong', gesture: 'drag-mark', solution: false, to: 'Wrong', events: [] },
  { from: 'Wrong', gesture: 'drag-erase', solution: false, to: 'Wrong', events: [] },
  { from: 'Given', gesture: 'tap', solution: true, to: 'Given', events: ['PULSE'] },
  { from: 'Given', gesture: 'double', solution: true, to: 'Given', events: ['PULSE'] },
  { from: 'Given', gesture: 'drag-mark', solution: true, to: 'Given', events: [] },
  { from: 'Given', gesture: 'drag-erase', solution: true, to: 'Given', events: [] },
];

describe('02 §6.2 cell state × gesture', () => {
  it.each(TABLE)('$from + $gesture (solution: $solution) → $to $events', (row) => {
    const { s, target } = arrange(row.from, row.solution);
    expect(s.cells[target]).toBe(CellState[row.from]);
    const before = s.cells.slice();
    const r = reduce(s, act(row.gesture, target));
    expect(r.state.cells[target]).toBe(CellState[row.to]);
    expect(r.events.map((e) => e.type)).toEqual(row.events);
    expect(s.cells).toEqual(before); // never mutated
    if (row.events.length === 0 || row.events[0] === 'PULSE') expect(r.state).toBe(s); // no state change
    else expect(r.state.cells).not.toBe(s.cells); // copy-on-write
  });

  it('a double-tap gesture (tap 1 then tap 2) always means "place a cat"', () => {
    for (const start of ['Empty', 'Mark'] as const) {
      const { s } = arrange(start, true);
      const r = run(s, [tap(SOL_CELL, 1), dbl(SOL_CELL, 2)]);
      expect(r.state.cells[SOL_CELL]).toBe(CellState.Cat);
      const w = run(arrange(start, false).s, [tap(NON_SOL, 1), dbl(NON_SOL, 2)]);
      expect(w.state.cells[NON_SOL]).toBe(CellState.Wrong);
    }
  });

  it('a slow second tap on an X clears it (two taps)', () => {
    const r = run(playing(), [tap(NON_SOL, 0), tap(NON_SOL, 400)]);
    expect(r.state.cells[NON_SOL]).toBe(CellState.Empty);
    expect(r.events.map((e) => e.type)).toEqual(['MARKED', 'UNMARKED']);
  });

  it('PAINT changes only matching cells, dedupes, ignores out-of-range cells, emits one event', () => {
    let s = run(playing(), [tap(cell(1, 0)), dbl(SOL_CELL), dbl(NON_SOL)]).state;
    const cells = [cell(1, 0), SOL_CELL, NON_SOL, cell(1, 1), cell(1, 1), cell(3, 3), -1, 99, 2.5];
    const r = reduce(s, paintA(cells, 'mark', 7));
    expect(r.events).toEqual([{ type: 'MARKED', cells: [cell(1, 1), cell(3, 3)] }]);
    s = r.state;
    const e = reduce(s, paintA([cell(1, 0), cell(1, 1), SOL_CELL, NON_SOL], 'erase', 8));
    expect(e.events).toEqual([{ type: 'UNMARKED', cells: [cell(1, 0), cell(1, 1)] }]);
    expect(e.state.cells[cell(3, 3)]).toBe(CellState.Mark);
  });

  it('out-of-range cells are ignored without a pulse', () => {
    const s = playing();
    for (const c of [-1, 25, 1.5, Number.NaN]) {
      expect(reduce(s, tap(c))).toEqual({ state: s, events: [] });
      expect(reduce(s, dbl(c))).toEqual({ state: s, events: [] });
    }
  });

  it('no auto-X: placing a cat changes only its own cell', () => {
    const s = playing();
    const r = reduce(s, dbl(SOL_CELL));
    const changed = [...r.state.cells.keys()].filter((i) => r.state.cells[i] !== s.cells[i]);
    expect(changed).toEqual([SOL_CELL]);
  });
});

describe('02 §8 mistake model', () => {
  it('a correct cat: Cat, catsPlaced+1, CAT_PLACED then REGION_DONE with the region label', () => {
    const r = reduce(playing(), dbl(cell(3, 1), 3));
    expect(r.state.catsPlaced).toBe(1);
    expect(r.events).toEqual([
      { type: 'CAT_PLACED', cell: cell(3, 1), source: 'player' },
      { type: 'REGION_DONE', region: 3 }, // D
    ]);
    expect(r.state.regionsDone).toBe(1 << 3);
    expect(r.state.hearts).toBe(3);
  });

  it('a wrong cat: Wrong, hearts−1, mistakes+1, MISTAKE{cell, heartsLeft}', () => {
    const r = reduce(playing(), dbl(NON_SOL, 3));
    expect(r.state.hearts).toBe(2);
    expect(r.state.mistakes).toBe(1);
    expect(r.events).toEqual([{ type: 'MISTAKE', cell: NON_SOL, heartsLeft: 2 }]);
    expect(r.state.status).toBe('playing');
  });

  it('the last cat wins: WON after CAT_PLACED/REGION_DONE, status won', () => {
    const r = run(playing(), SOL5.map((c, i) => dbl(c, i)));
    expect(r.state.status).toBe('won');
    expect(r.state.catsPlaced).toBe(5);
    expect(r.state.regionsDone).toBe(0b11111);
    expect(r.events.slice(-3).map((e) => e.type)).toEqual(['CAT_PLACED', 'REGION_DONE', 'WON']);
    expect(r.events.filter((e) => e.type === 'REGION_DONE')).toHaveLength(5);
  });

  it('a Given counts toward the win and its region starts done', () => {
    const s = playing(P5G);
    expect(s.catsPlaced).toBe(1);
    expect(s.regionsDone).toBe(1 << 2);
    const r = run(s, SOL5.filter((c) => c !== GIVEN_CELL).map((c) => dbl(c)));
    expect(r.state.status).toBe('won');
  });

  it('the third mistake loses: MISTAKE{heartsLeft: 0} then LOST, status lost', () => {
    const r = run(playing(), WRONG5.slice(0, 3).map((c) => dbl(c)));
    expect(r.state.status).toBe('lost');
    expect(r.state.hearts).toBe(0);
    expect(r.events.slice(-2)).toEqual([{ type: 'MISTAKE', cell: WRONG5[2], heartsLeft: 0 }, { type: 'LOST' }]);
  });

  it('a wrong attempt is rejected even when the cell breaks no visible rule', () => {
    // (4,4) is attacked by nothing on an empty board, but it is not the solution cell.
    const r = reduce(playing(), dbl(cell(4, 4)));
    expect(r.state.cells[cell(4, 4)]).toBe(CellState.Wrong);
  });

  it('mistakePenalty = false (tutorial rules): a wrong attempt only pulses', () => {
    const s = reduce(newGame(P5, 'tutorial'), { type: 'START' }).state;
    expect(s.rules.mistakePenalty).toBe(false);
    expect(reduce(s, dbl(NON_SOL))).toEqual({ state: s, events: [{ type: 'PULSE', cell: NON_SOL }] });
  });

  it('removing a cat clears its region bit and costs nothing', () => {
    const s = run(playing(), [dbl(SOL_CELL), dbl(SOL_CELL, 9)]).state;
    expect(s.cells[SOL_CELL]).toBe(CellState.Empty);
    expect(s.catsPlaced).toBe(0);
    expect(s.regionsDone).toBe(0);
    expect(s.hearts).toBe(3);
  });
});

describe('move log (02 §22, 04 §4.2)', () => {
  it('records every changing action with its t, in order', () => {
    const lost = run(playing(), [
      tap(cell(1, 0), 1),
      tap(cell(1, 0), 2),
      paintA([cell(1, 0), cell(1, 1)], 'mark', 3),
      paintA([cell(1, 1)], 'erase', 4),
      dbl(SOL_CELL, 5),
      dbl(SOL_CELL, 6),
      dbl(WRONG5[0] as number, 7),
      tap(WRONG5[0] as number, 8), // pulse: not logged
      dbl(WRONG5[1] as number, 9),
      dbl(WRONG5[2] as number, 10),
    ]).state;
    const revived = reduce(lost, { type: 'REVIVE', t: 11 }).state;
    expect(revived.moves).toEqual([
      { t: 1, kind: 'mark', cells: [cell(1, 0)] },
      { t: 2, kind: 'unmark', cells: [cell(1, 0)] },
      { t: 3, kind: 'mark', cells: [cell(1, 0), cell(1, 1)] },
      { t: 4, kind: 'unmark', cells: [cell(1, 1)] },
      { t: 5, kind: 'cat', cell: SOL_CELL, source: 'player' },
      { t: 6, kind: 'uncat', cell: SOL_CELL },
      { t: 7, kind: 'wrong', cell: WRONG5[0] },
      { t: 9, kind: 'wrong', cell: WRONG5[1] },
      { t: 10, kind: 'wrong', cell: WRONG5[2] },
      { t: 11, kind: 'revive' },
    ]);
    expect(reduce(lost, { type: 'RETRY' }).state.moves).toEqual([]);
  });

  it('START, TICK, HINT_OPEN, HINT_CLOSE and KITTY_DONE are not logged', () => {
    const hint = { kind: 'shadow' as const, level: 0 as const, focusUnits: [], focusCells: [], effectCells: [] };
    const r = run(newGame(P5, 'level'), [
      { type: 'START' },
      { type: 'TICK', dtMs: 1000 },
      { type: 'HINT_OPEN', step: hint, charged: true },
      { type: 'TICK', dtMs: 1000 },
      { type: 'HINT_CLOSE' },
      { type: 'KITTY', cell: SOL_CELL, t: 4 },
      { type: 'KITTY_DONE' },
    ]);
    expect(r.state.moves).toEqual([{ t: 4, kind: 'cat', cell: SOL_CELL, source: 'kitty' }]);
  });
});
