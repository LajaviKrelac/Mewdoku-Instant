// Owner: C (Phase 2b; was game). A mini tutorial session for the tests (04 §4.2 "Tutorial input filter"): the filter runs
// before reduce(), advance() after every reduce and on Got it, and scripted marks bypass the filter.
import { expect } from 'vitest';
import { getHintStep } from '../../../src/engine/hint';
import type { HintStep } from '../../../src/engine/types';
import { newGame } from '../../../src/game/factory';
import { reduce } from '../../../src/game/reducer';
import { advance, filterTutorialAction, tutorialPuzzle, type TutorialFilterResult, type TutorialStepIndex } from '../../../src/game/tutorial';
import type { Action, GameState } from '../../../src/game/types';

/** 0-based index of 1-based (row, col) on the 4×4 board, as written in 02 §11.5. */
export const at = (row: number, col: number): number => (row - 1) * 4 + (col - 1);
export const T = (c: number): Action => ({ type: 'TAP', cell: c, t: 0 });
export const D = (c: number): Action => ({ type: 'DOUBLE_TAP', cell: c, t: 0 });
export const P = (cells: number[], mode: 'mark' | 'erase' = 'mark'): Action => ({ type: 'PAINT', cells, mode, t: 0 });
export const PULSE = (cell: number): TutorialFilterResult => ({ type: 'PULSE_ONLY', cell });

export interface Run {
  step: TutorialStepIndex | 'done';
  state: GameState;
  pulses: number[];
  stepsSeen: (TutorialStepIndex | 'done')[];
}

export function start(): Run {
  const state = reduce(newGame(tutorialPuzzle(), 'tutorial'), { type: 'START' }).state;
  return { step: 1, state, pulses: [], stepsSeen: [1] };
}

/** After every reduce (and on Got it), advance; scripted marks go in as a mark-mode PAINT, bypassing the filter. */
export function settle(r: Run, signal?: 'got_it'): Run {
  let { step, state } = r;
  const seen = [...r.stepsSeen];
  let sig = signal;
  while (step !== 'done') {
    const adv = advance(step, state, sig);
    sig = undefined;
    if (!adv) break;
    if (adv.scriptedMarks.length > 0) {
      state = reduce(state, { type: 'PAINT', cells: adv.scriptedMarks, mode: 'mark', t: 0 }).state;
    }
    step = adv.next;
    seen.push(step);
  }
  return { ...r, step, state, stepsSeen: seen };
}

export function send(r: Run, a: Action): Run {
  if (r.step === 'done') return r;
  const f = filterTutorialAction(r.step, r.state, a);
  if (f === null) return r;
  if (f.type === 'PULSE_ONLY') return { ...r, pulses: [...r.pulses, f.cell] };
  const res = reduce(r.state, f);
  const pulses = res.events.flatMap((e) => (e.type === 'PULSE' ? [e.cell] : []));
  return settle({ ...r, state: res.state, pulses: [...r.pulses, ...pulses] });
}

export function sendAll(r: Run, actions: Action[]): Run {
  return actions.reduce(send, r);
}

/** The session's bulb in the tutorial: a free hint from the engine (02 §9.3). */
export function bulb(r: Run): { run: Run; hint: HintStep } {
  const hint = getHintStep(r.state.puzzle, r.state.cells);
  return { run: send(r, { type: 'HINT_OPEN', step: hint, charged: true }), hint };
}

/** Plays steps 1..k−1 correctly, leaving the run at step k. */
export function reach(k: TutorialStepIndex): Run {
  let r = start();
  if (k > 1) r = sendAll(r, [T(at(1, 2)), D(at(1, 2))]);
  if (k > 2) r = settle(r, 'got_it');
  if (k > 3) r = send(r, P([at(2, 1), at(2, 2), at(2, 3)]));
  if (k > 4) r = send(r, D(at(2, 4)));
  if (k > 5) r = send(bulb(r).run, { type: 'HINT_APPLY', t: 0 });
  expect(r.step).toBe(k);
  return r;
}

export const cellsIn = (s: GameState, v: number): number[] => [...s.cells.keys()].filter((i) => s.cells[i] === v);
