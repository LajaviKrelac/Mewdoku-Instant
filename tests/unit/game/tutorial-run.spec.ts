// Owner: C (Phase 2b; was game). The tutorial script played end to end through the mini session (02 §11.5, 04 §4.2).
import { describe, expect, it } from 'vitest';
import { reduce } from '../../../src/game/reducer';
import { CellState, type Action } from '../../../src/game/types';
import { at, bulb, cellsIn, D, P, reach, send, sendAll, settle, start, T, type Run } from './tutorial-driver';

describe('the tutorial script end to end', () => {
  it('plays steps 1–6 to the win without losing a heart or charging a helper', () => {
    let r = start();
    r = send(r, T(at(1, 2))); // a lone TAP toggles the X
    expect(r.step).toBe(1);
    expect(r.state.cells[1]).toBe(CellState.Mark);
    r = send(r, D(at(1, 2)));
    expect(r.step).toBe(2);
    r = settle(r, 'got_it');
    expect(r.step).toBe(3);
    expect(cellsIn(r.state, CellState.Mark)).toEqual([0, 2, 3, 5, 9, 13]);
    r = send(r, P([at(2, 1), at(2, 2), at(2, 3)]));
    expect(r.step).toBe(4);
    r = send(r, D(at(2, 4)));
    expect(r.step).toBe(5);
    expect(cellsIn(r.state, CellState.Empty)).toEqual([8, 12, 14]);
    const b = bulb(r);
    expect(b.hint).toMatchObject({ kind: 'single', placeCell: at(3, 1) }); // 02 §11.5 step 5
    expect(b.run.state.hintsUsed).toBe(0); // free: HINT_OPEN forced uncharged
    r = send(b.run, { type: 'HINT_CLOSE' }); // "then Apply only"
    expect(r.state.status).toBe('hint');
    r = send(r, { type: 'HINT_APPLY', t: 0 });
    expect(r.step).toBe(6);
    expect(cellsIn(r.state, CellState.Empty)).toEqual([14]);
    r = send(r, D(at(4, 3)));
    expect(r.step).toBe('done');
    expect(r.stepsSeen).toEqual([1, 2, 3, 4, 5, 6, 'done']);
    expect(r.state).toMatchObject({ status: 'won', hearts: 3, mistakes: 0, hintsUsed: 0, kittiesUsed: 0, catsPlaced: 4 });
    expect(cellsIn(r.state, CellState.Cat)).toEqual([1, 7, 8, 14]);
    expect(r.pulses).toEqual([]);
  });

  it('keyboard path for step 3: Space-tapping the two open tiles', () => {
    const r = sendAll(reach(3), [T(at(2, 2)), T(at(2, 1)), T(at(2, 3))]);
    expect(r.pulses).toEqual([5]);
    expect(r.step).toBe(4);
  });

  it('a clumsy player: wrong input at every step only pulses, never costs a heart, never skips a step', () => {
    const noise = (): Action[] => [
      ...Array.from({ length: 16 }, (_, c) => D(c)),
      P([0, 1, 2, 3, 12, 13]),
      P([5, 9], 'erase'),
      { type: 'KITTY', cell: 14, t: 0 },
      { type: 'RETRY' },
      { type: 'REVIVE', t: 0 },
    ];
    let r = start();
    r = sendAll(r, noise().filter((a) => !(a.type === 'DOUBLE_TAP' && a.cell === 1)));
    expect(r.step).toBe(1);
    r = send(r, D(1));
    for (const [step, finish] of [
      [2, (x: Run) => settle(x, 'got_it')],
      [3, (x: Run) => send(x, P([4, 5, 6]))],
      [4, (x: Run) => send(x, D(7))],
      [5, (x: Run) => send(bulb(x).run, { type: 'HINT_APPLY', t: 0 })],
      [6, (x: Run) => send(x, D(14))],
    ] as const) {
      expect(r.step).toBe(step);
      const accepted = (a: Action): boolean =>
        a.type === 'DOUBLE_TAP' && ((step === 4 && a.cell === 7) || (step === 6 && a.cell === 14));
      r = sendAll(r, noise().filter((a) => !accepted(a)));
      expect(r.step).toBe(step);
      expect(r.state.hearts).toBe(3);
      expect(r.state.mistakes).toBe(0);
      r = finish(r);
    }
    expect(r.step).toBe('done');
    expect(r.state).toMatchObject({ status: 'won', hearts: 3, mistakes: 0 });
    expect(r.pulses.length).toBeGreaterThan(50);
  });

  it('with mistakePenalty off, a wrong attempt that slips past the filter still only pulses', () => {
    const s = start().state;
    const r = reduce(s, D(0)); // (1,1) is not a solution cell
    expect(r).toEqual({ state: s, events: [{ type: 'PULSE', cell: 0 }] });
  });
});
