// Owner: G1 (Phase 2d.1)
// Unit completion and UNITS_DONE (docs/phase2d/helpers-spec.md §4.1, §7.6, D-2d1-6): a row, column or
// colour region is complete when it holds its cat (Cat or Given) and every other tile is Mark or
// Wrong; the reducer reports each newly complete unit once (rows → columns → regions) with its anchor
// (the last changed tile of the unit in reading order; for the mouse, in its visit order), after
// MARKED / CAT_PLACED / POINTS / REGION_DONE and before WON, for every board action; never on an
// unmark and never in an action that ends in LOST. Boards are our own (fixtures.ts).
import { describe, expect, it } from 'vitest';
import { getHintStep } from '../../../src/engine/hint';
import { reduce } from '../../../src/game/reducer';
import { CellState, type GameEvent, type GameState } from '../../../src/game/types';
import { changedCells, completedUnits, isUnitComplete, unitCells } from '../../../src/game/units';
import { cell, dbl, P5G, P9C, paintA, playing, run, SOL5, SOL9C, step, tap } from './fixtures';

const types = (events: readonly GameEvent[]): string[] => events.map((e) => e.type);
const unitsOf = (events: readonly GameEvent[]) => {
  const ev = events.find((e) => e.type === 'UNITS_DONE');
  return ev && ev.type === 'UNITS_DONE' ? ev.units : null;
};
/** Sets cells directly (the unit rule reads only puzzle and cells). */
function withCells(s: GameState, set: Record<number, number>): GameState {
  const cells = s.cells.slice();
  for (const [k, v] of Object.entries(set)) cells[Number(k)] = v;
  return { ...s, cells };
}
const row0Rest = [cell(0, 1), cell(0, 2), cell(0, 3), cell(0, 4)];

describe('isUnitComplete (§4.1)', () => {
  it('a row completes only with its cat and every other tile Mark or Wrong', () => {
    let s = playing();
    expect(isUnitComplete(s, 'row', 0)).toBe(false);
    s = withCells(s, { [cell(0, 1)]: CellState.Mark, [cell(0, 2)]: CellState.Mark, [cell(0, 3)]: CellState.Wrong, [cell(0, 4)]: CellState.Mark });
    expect(isUnitComplete(s, 'row', 0)).toBe(false); // every other tile crossed, no cat yet
    s = withCells(s, { [SOL5[0] as number]: CellState.Cat });
    expect(isUnitComplete(s, 'row', 0)).toBe(true);
    s = withCells(s, { [cell(0, 4)]: CellState.Empty });
    expect(isUnitComplete(s, 'row', 0)).toBe(false); // one Empty tile left
  });

  it('a cat alone never completes a line; Given counts as a cat', () => {
    const s = withCells(playing(), { [SOL5[0] as number]: CellState.Cat });
    expect(isUnitComplete(s, 'row', 0)).toBe(false);
    expect(isUnitComplete(s, 'col', 0)).toBe(false);
    const g = playing(P5G); // row 2's cat (cell 14) is a Given
    expect(g.cells[14]).toBe(CellState.Given);
    const done = withCells(g, { 10: CellState.Mark, 11: CellState.Mark, 12: CellState.Mark, 13: CellState.Wrong });
    expect(isUnitComplete(done, 'row', 2)).toBe(true);
  });

  it('columns and regions follow the same rule; a one-tile region is complete with its cat', () => {
    const s = withCells(playing(P9C), { [SOL9C[0] as number]: CellState.Cat });
    expect(P9C.regions[8]).toBe(2); // C
    expect(unitCells(P9C, 'region', 2)).toEqual([8]);
    expect(isUnitComplete(s, 'region', 2)).toBe(true);
    expect(isUnitComplete(s, 'col', 8)).toBe(false);
    expect(unitCells(P9C, 'col', 8)).toEqual([8, 17, 26, 35, 44, 53, 62, 71, 80]);
    expect(unitCells(P9C, 'row', 9)).toEqual([]);
    expect(isUnitComplete(s, 'row', -1)).toBe(false);
  });
});

describe('completedUnits / changedCells', () => {
  it('only units newly complete, rows → columns → regions, anchors among the changed cells', () => {
    const s = playing();
    // (4,3) completes row 4, column 3 and region E at once (every other tile of the three crossed).
    const crossed: Record<number, number> = {};
    for (const c of [20, 21, 22, 24, 3, 8, 13, 18, 17]) crossed[c] = CellState.Mark;
    const prev = withCells(s, crossed);
    const next = withCells(prev, { 23: CellState.Cat });
    expect(changedCells(prev.cells, next.cells)).toEqual([23]);
    expect(completedUnits(prev, next, [23])).toEqual([
      { kind: 'row', index: 4, anchor: 23 },
      { kind: 'col', index: 3, anchor: 23 },
      { kind: 'region', index: 4, anchor: 23 },
    ]);
    // Already complete before: not again.
    expect(completedUnits(next, next, [23])).toEqual([]);
    expect(changedCells(next.cells, next.cells)).toEqual([]);
  });

  it('the anchor is the unit\'s LAST changed cell in the order given', () => {
    const P9 = P9C;
    const s = withCells(playing(P9), { 8: CellState.Cat });
    const marks = [0, 1, 2, 3, 4, 6, 7]; // row 0 except (0,5) (crossed before) and the cat on 8
    const prev = withCells(s, { 5: CellState.Mark });
    const next = withCells(prev, Object.fromEntries(marks.map((c) => [c, CellState.Mark])));
    expect(completedUnits(prev, next, marks)).toEqual([{ kind: 'row', index: 0, anchor: 7 }]);
    expect(completedUnits(prev, next, [7, 6, 4, 3, 2, 1, 0])).toEqual([{ kind: 'row', index: 0, anchor: 0 }]);
  });
});

describe('UNITS_DONE in the reducer (§4.1)', () => {
  it('a row completed by tiles 0–4, 6, 7 with the cat on 8: anchor 7 (PAINT); the event follows MARKED', () => {
    let s = run(playing(P9C), [dbl(SOL9C[0] as number), tap(5)]).state; // the cat on (0,8), (0,5) crossed
    const r = reduce(s, paintA([0, 1, 2, 3, 4, 6, 7], 'mark'));
    expect(types(r.events)).toEqual(['MARKED', 'UNITS_DONE']);
    expect(unitsOf(r.events)).toEqual([{ kind: 'row', index: 0, anchor: 7 }]);
    s = r.state;
    expect(isUnitComplete(s, 'row', 0)).toBe(true);
  });

  it('TAP: the last crossing tap completes the row; a cat alone (DOUBLE_TAP on an empty row) does not', () => {
    const cat = reduce(playing(), dbl(SOL5[0] as number));
    expect(types(cat.events)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE']);
    const s = run(cat.state, row0Rest.slice(0, 3).map((c) => tap(c))).state;
    const r = reduce(s, tap(cell(0, 4)));
    expect(types(r.events)).toEqual(['MARKED', 'UNITS_DONE']);
    expect(unitsOf(r.events)).toEqual([{ kind: 'row', index: 0, anchor: cell(0, 4) }]);
  });

  it('DOUBLE_TAP: after CAT_PLACED / POINTS / REGION_DONE; rows, columns, regions in one event', () => {
    const crossed = [20, 21, 22, 24, 3, 8, 13, 18, 17];
    const s = run(playing(), crossed.map((c) => tap(c))).state;
    const r = reduce(s, dbl(23));
    expect(types(r.events)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE', 'UNITS_DONE']);
    expect(unitsOf(r.events)).toEqual([
      { kind: 'row', index: 4, anchor: 23 },
      { kind: 'col', index: 3, anchor: 23 },
      { kind: 'region', index: 4, anchor: 23 },
    ]);
  });

  it('before WON: the winning cat that completes its row', () => {
    let s = run(playing(), SOL5.slice(0, 4).map((c) => dbl(c))).state;
    s = run(s, [20, 21, 22, 24].map((c) => tap(c))).state;
    const r = reduce(s, dbl(23));
    expect(types(r.events)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE', 'UNITS_DONE', 'WON']);
    expect(unitsOf(r.events)).toEqual([{ kind: 'row', index: 4, anchor: 23 }]);
  });

  it('KITTY: a one-tile region completes with the kitty\'s cat (REGION_DONE and UNITS_DONE in one action)', () => {
    const r = reduce(playing(P9C), { type: 'KITTY', cell: 8, t: 1 });
    expect(types(r.events)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE', 'UNITS_DONE']);
    expect(unitsOf(r.events)).toEqual([{ kind: 'region', index: 2, anchor: 8 }]);
    expect(r.state.status).toBe('kitty');
  });

  it('HINT_APPLY: HINT_APPLIED stays first; the shadow of the corner cat crosses 16 tiles and completes row 0 and column 8', () => {
    // The recordings' sequence on our own board: one X in row 0 (the mouse's), the kitty's cat on the
    // one-tile corner region, then the bulb: the shadow step crosses the cat's row, column and the one
    // remaining neighbour (17 attacked tiles, one already crossed).
    let s = playing(P9C);
    s = reduce(s, { type: 'MOUSE', cells: [5], t: 1 }).state;
    s = reduce(s, { type: 'KITTY', cell: 8, t: 2 }).state;
    s = reduce(s, { type: 'KITTY_DONE' }).state;
    const hint = getHintStep(P9C, s.cells);
    expect(hint.kind).toBe('shadow');
    expect(hint.focusCells).toEqual([8]);
    s = reduce(s, { type: 'HINT_OPEN', step: hint, charged: true }).state;
    const r = reduce(s, { type: 'HINT_APPLY', t: 3 });
    expect(types(r.events)).toEqual(['HINT_APPLIED', 'MARKED', 'UNITS_DONE']);
    const marked = r.events[1];
    expect(marked?.type === 'MARKED' ? [...marked.cells].sort((a, b) => a - b) : null).toEqual([
      0, 1, 2, 3, 4, 6, 7, 16, 17, 26, 35, 44, 53, 62, 71, 80,
    ]);
    expect(unitsOf(r.events)).toEqual([
      { kind: 'row', index: 0, anchor: 7 },
      { kind: 'col', index: 8, anchor: 80 },
    ]);
  });

  it('MOUSE: the anchor is the X that lands last (visit order), and the event follows the MARKED', () => {
    const s = run(playing(), [dbl(SOL5[0] as number), tap(cell(0, 1)), tap(cell(0, 2))]).state;
    const a = reduce(s, { type: 'MOUSE', cells: [cell(0, 4), cell(0, 3)], t: 5 });
    expect(types(a.events)).toEqual(['MARKED', 'UNITS_DONE']);
    expect(unitsOf(a.events)).toEqual([{ kind: 'row', index: 0, anchor: cell(0, 3) }]);
    const b = reduce(s, { type: 'MOUSE', cells: [cell(0, 3), cell(0, 4)], t: 5 });
    expect(unitsOf(b.events)).toEqual([{ kind: 'row', index: 0, anchor: cell(0, 4) }]);
  });

  it('a mistake that completes a unit emits it (Wrong is crossed); one that ends in LOST does not', () => {
    const s = run(playing(), [dbl(SOL5[0] as number), ...row0Rest.slice(0, 3).map((c) => tap(c))]).state;
    const r = reduce(s, dbl(cell(0, 4))); // not a solution cell: Wrong
    expect(types(r.events)).toEqual(['MISTAKE', 'UNITS_DONE']);
    expect(unitsOf(r.events)).toEqual([{ kind: 'row', index: 0, anchor: cell(0, 4) }]);
    const last = reduce({ ...s, hearts: 1 }, dbl(cell(0, 4)));
    expect(types(last.events)).toEqual(['MISTAKE', 'LOST']);
    expect(last.state.cells[cell(0, 4)]).toBe(CellState.Wrong);
  });

  it('an unmark never emits; unmarking and crossing again emits again (no state stored)', () => {
    let s = run(playing(), [dbl(SOL5[0] as number), ...row0Rest.map((c) => tap(c))]).state;
    expect(isUnitComplete(s, 'row', 0)).toBe(true);
    const off = reduce(s, tap(cell(0, 2)));
    expect(types(off.events)).toEqual(['UNMARKED']);
    const erase = reduce(s, paintA(row0Rest, 'erase'));
    expect(types(erase.events)).toEqual(['UNMARKED']);
    s = off.state;
    const again = reduce(s, tap(cell(0, 2)));
    expect(types(again.events)).toEqual(['MARKED', 'UNITS_DONE']);
    expect(unitsOf(again.events)).toEqual([{ kind: 'row', index: 0, anchor: cell(0, 2) }]);
  });

  it('removing the cat of a complete unit, a mistaken-mark hint and other actions never emit', () => {
    const s = run(playing(), [dbl(SOL5[0] as number), ...row0Rest.map((c) => tap(c))]).state;
    expect(types(reduce(s, dbl(SOL5[0] as number)).events)).toEqual(['CAT_REMOVED']);
    // A mistaken mark (a Mark on a solution cell) cleared by the hint.
    const m = run(playing(), [tap(SOL5[1] as number)]).state;
    const open = reduce(m, { type: 'HINT_OPEN', step: step({ kind: 'mistaken_mark', focusCells: [SOL5[1] as number], effectCells: [SOL5[1] as number] }), charged: false }).state;
    expect(types(reduce(open, { type: 'HINT_APPLY', t: 1 }).events)).toEqual(['HINT_APPLIED', 'UNMARKED']);
    expect(reduce(s, { type: 'TICK', dtMs: 1000 }).events).toEqual([]);
  });

  it('a mark that completes nothing carries no UNITS_DONE (the 2d events are unchanged)', () => {
    const r = reduce(playing(), tap(cell(0, 1)));
    expect(r.events).toEqual([{ type: 'MARKED', cells: [cell(0, 1)] }]);
  });
});
