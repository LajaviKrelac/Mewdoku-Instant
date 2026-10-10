// Owner: C (Phase 2b; was game). Hint open/apply/close (02 §9.1 step 4) and kitty (02 §9.2) in the reducer (04 §4.2).
// Phase 2c.1: hint and kitty cats score like the player's (POINTS after their CAT_PLACED, fish-lives-spec F5.4).
import { describe, expect, it } from 'vitest';
import { reduce } from '../../../src/game/reducer';
import { CellState, type GameState, type Move } from '../../../src/game/types';
import type { HintStep } from '../../../src/engine/types';
import { cell, dbl, P5, playing, run, SOL5, step, tap, types, WRONG5 } from './fixtures';

/** Last logged move. */
const lastMove = (s: GameState): Move | undefined => s.moves[s.moves.length - 1];

function openHint(s: GameState, h: HintStep, charged = true): GameState {
  return reduce(s, { type: 'HINT_OPEN', step: h, charged }).state;
}

describe('HINT_OPEN / HINT_CLOSE', () => {
  it('opens the step, counts only charged opens, emits nothing', () => {
    const h = step({ kind: 'single', placeCell: SOL5[0] as number });
    const r = reduce(playing(), { type: 'HINT_OPEN', step: h, charged: true });
    expect(r.events).toEqual([]);
    expect(r.state).toMatchObject({ status: 'hint', openHint: h, hintsUsed: 1 });
    const closed = reduce(r.state, { type: 'HINT_CLOSE' });
    expect(closed.events).toEqual([]);
    expect(closed.state).toMatchObject({ status: 'playing', openHint: null, hintsUsed: 1 });
    expect(closed.state.cells).toBe(r.state.cells); // nothing applied
    const reopened = openHint(closed.state, h, false); // free reopen (02 §9.1)
    expect(reopened.hintsUsed).toBe(1);
  });

  it('a second HINT_OPEN while the card is open is ignored', () => {
    const s = openHint(playing(), step({ kind: 'shadow' }));
    expect(reduce(s, { type: 'HINT_OPEN', step: step({ kind: 'single' }), charged: true }).state).toBe(s);
  });
});

describe('HINT_APPLY (02 §9.1 step 4)', () => {
  it('eliminations: only Empty effect cells become Marks; Marks, Wrong and Cats stay', () => {
    const empty1 = cell(1, 1);
    const empty2 = cell(3, 3);
    const marked = cell(1, 0);
    const wrong = WRONG5[0] as number;
    const s0 = run(playing(), [tap(marked), dbl(wrong), dbl(SOL5[1] as number)]).state;
    const h = step({ kind: 'confine_region_line', level: 2, effectCells: [empty1, marked, wrong, SOL5[1] as number, empty2, empty1] });
    const r = reduce(openHint(s0, h), { type: 'HINT_APPLY', t: 42 });
    expect(r.events).toEqual([
      { type: 'HINT_APPLIED', step: h },
      { type: 'MARKED', cells: [empty1, empty2] },
    ]);
    expect(r.state.cells[empty1]).toBe(CellState.Mark);
    expect(r.state.cells[empty2]).toBe(CellState.Mark);
    expect(r.state.cells[marked]).toBe(CellState.Mark);
    expect(r.state.cells[wrong]).toBe(CellState.Wrong);
    expect(r.state.cells[SOL5[1] as number]).toBe(CellState.Cat);
    expect(r.state).toMatchObject({ status: 'playing', openHint: null, hearts: 2 });
    expect(lastMove(r.state)).toEqual({ t: 42, kind: 'mark', cells: [empty1, empty2] });
  });

  it('never auto-marks a solution cell, even if a (buggy) step lists one', () => {
    const h = step({ kind: 'shadow', effectCells: [SOL5[2] as number, cell(1, 1)] });
    const r = reduce(openHint(playing(), h), { type: 'HINT_APPLY', t: 1 });
    expect(r.state.cells[SOL5[2] as number]).toBe(CellState.Empty);
    expect(r.events[1]).toEqual({ type: 'MARKED', cells: [cell(1, 1)] });
  });

  it('mistaken_mark: the Mark on a solution cell is cleared (UNMARKED)', () => {
    const x = SOL5[3] as number;
    const s0 = reduce(playing(), tap(x)).state;
    const h = step({ kind: 'mistaken_mark', level: 0, focusCells: [x], effectCells: [x] });
    const r = reduce(openHint(s0, h), { type: 'HINT_APPLY', t: 5 });
    expect(r.events).toEqual([
      { type: 'HINT_APPLIED', step: h },
      { type: 'UNMARKED', cells: [x] },
    ]);
    expect(r.state.cells[x]).toBe(CellState.Empty);
    expect(lastMove(r.state)).toEqual({ t: 5, kind: 'unmark', cells: [x] });
  });

  it('a forced cat is placed as a Cat (source hint), scores (POINTS), with REGION_DONE; a Mark there is replaced', () => {
    const target = SOL5[3] as number;
    const s0 = reduce(playing(), tap(target)).state;
    const h = step({ kind: 'single', placeCell: target });
    const r = reduce(openHint(s0, h), { type: 'HINT_APPLY', t: 8 });
    expect(r.events).toEqual([
      { type: 'HINT_APPLIED', step: h },
      { type: 'CAT_PLACED', cell: target, source: 'hint' },
      { type: 'POINTS', cell: target, gained: 576, total: 576, streak: 1 },
      { type: 'REGION_DONE', region: 3 },
    ]);
    expect(r.state.catsPlaced).toBe(1);
    expect(r.state.hearts).toBe(3);
    expect(lastMove(r.state)).toEqual({ t: 8, kind: 'cat', cell: target, source: 'hint' });
  });

  it('eliminations and a forced cat together, the cat last; the last cat wins the level', () => {
    const last = SOL5[4] as number;
    const s0 = run(playing(), SOL5.slice(0, 4).map((c) => dbl(c))).state;
    const h = step({ kind: 'reveal_fallback', effectCells: [cell(4, 4)], placeCell: last });
    const r = reduce(openHint(s0, h), { type: 'HINT_APPLY', t: 9 });
    expect(types(r.events)).toEqual(['HINT_APPLIED', 'MARKED', 'CAT_PLACED', 'POINTS', 'REGION_DONE', 'WON']);
    expect(r.state.status).toBe('won');
    expect(r.state.openHint).toBeNull();
  });

  it('a placeCell that is not a solution cell, or already a Cat, places nothing', () => {
    const wrongPlace = step({ kind: 'single', placeCell: WRONG5[0] as number });
    const r1 = reduce(openHint(playing(), wrongPlace), { type: 'HINT_APPLY', t: 1 });
    expect(types(r1.events)).toEqual(['HINT_APPLIED']);
    expect(r1.state.cells[WRONG5[0] as number]).toBe(CellState.Empty);
    const s = reduce(playing(), dbl(SOL5[0] as number)).state;
    const again = step({ kind: 'single', placeCell: SOL5[0] as number });
    const r2 = reduce(openHint(s, again), { type: 'HINT_APPLY', t: 2 });
    expect(types(r2.events)).toEqual(['HINT_APPLIED']);
    expect(r2.state.catsPlaced).toBe(1);
  });

  it('a step with no new effect still closes the card and logs no move', () => {
    const s0 = reduce(playing(), tap(cell(1, 1))).state;
    const h = step({ kind: 'shadow', effectCells: [cell(1, 1)] });
    const r = reduce(openHint(s0, h), { type: 'HINT_APPLY', t: 3 });
    expect(types(r.events)).toEqual(['HINT_APPLIED']);
    expect(r.state.moves).toEqual(s0.moves);
    expect(r.state.status).toBe('playing');
  });
});

describe('KITTY (02 §9.2)', () => {
  it('places a correct cat (source kitty) that scores, kittiesUsed+1, → kitty, then KITTY_DONE → playing', () => {
    const target = SOL5[1] as number;
    const r = reduce(playing(), { type: 'KITTY', cell: target, t: 3 });
    expect(r.events).toEqual([
      { type: 'CAT_PLACED', cell: target, source: 'kitty' },
      { type: 'POINTS', cell: target, gained: 576, total: 576, streak: 1 },
      { type: 'REGION_DONE', region: 1 },
    ]);
    expect(r.state).toMatchObject({ status: 'kitty', kittiesUsed: 1, catsPlaced: 1, hearts: 3 });
    expect(r.state.moves).toEqual([{ t: 3, kind: 'cat', cell: target, source: 'kitty' }]);
    const done = reduce(r.state, { type: 'KITTY_DONE' });
    expect(done.events).toEqual([]);
    expect(done.state.status).toBe('playing');
    expect(done.state.moves).toBe(r.state.moves);
  });

  it('a player X on the target is replaced by the cat', () => {
    const target = SOL5[2] as number;
    const s = reduce(playing(), tap(target)).state;
    const r = reduce(s, { type: 'KITTY', cell: target, t: 1 });
    expect(r.state.cells[target]).toBe(CellState.Cat);
  });

  it('the kitty cat that completes the board goes straight to won (no KITTY_REVEAL)', () => {
    const s = run(playing(), SOL5.slice(0, 4).map((c) => dbl(c))).state;
    const r = reduce(s, { type: 'KITTY', cell: SOL5[4] as number, t: 1 });
    expect(types(r.events)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE', 'WON']);
    expect(r.state.status).toBe('won');
    expect(reduce(r.state, { type: 'KITTY_DONE' }).state).toBe(r.state);
  });

  it('an invalid target (non-solution, Cat, out of range) is a no-op', () => {
    const s = reduce(playing(), dbl(SOL5[0] as number)).state;
    for (const c of [WRONG5[0] as number, SOL5[0] as number, -1, 25, 0.5]) {
      expect(reduce(s, { type: 'KITTY', cell: c, t: 1 })).toEqual({ state: s, events: [] });
    }
  });

  it('board input is locked during the reveal', () => {
    const s = reduce(playing(), { type: 'KITTY', cell: SOL5[0] as number, t: 1 }).state;
    expect(reduce(s, tap(cell(1, 1))).state).toBe(s);
    expect(reduce(s, dbl(SOL5[1] as number)).state).toBe(s);
    expect(reduce(s, { type: 'HINT_OPEN', step: step({ kind: 'shadow' }), charged: true }).state).toBe(s);
  });
});

describe('P5 fixture sanity', () => {
  it('P5 solution cells are one per row, column and region', () => {
    const rows = SOL5.map((c) => Math.floor(c / 5));
    const cols = SOL5.map((c) => c % 5);
    const regions = SOL5.map((c) => P5.regions[c]);
    for (const xs of [rows, cols, regions]) expect(new Set(xs).size).toBe(5);
  });
});
