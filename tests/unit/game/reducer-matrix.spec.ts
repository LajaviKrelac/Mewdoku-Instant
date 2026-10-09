// Owner: C (Phase 2b; was game). 04 §4.2 status × action matrix, REVIVE / RETRY, TICK, terminal states, invariants (02 §8).
import { describe, expect, it } from 'vitest';
import { newGame } from '../../../src/game/factory';
import { ALLOWED_STATUSES, canRevive, isActionAllowed, reduce } from '../../../src/game/reducer';
import { CellState, type Action, type ActionType, type GameState, type Status } from '../../../src/game/types';
import { cell, dbl, lostState, P5, P5G, playing, run, SOL5, step, tap, types, wonState, WRONG5 } from './fixtures';

const HINT = step({ kind: 'shadow', level: 0, focusCells: [SOL5[0] as number], effectCells: [cell(1, 1)] });

/** One state per status (P5). */
function stateIn(status: Status): GameState {
  switch (status) {
    case 'ready':
      return newGame(P5, 'level');
    case 'playing':
      return playing();
    case 'hint':
      return reduce(playing(), { type: 'HINT_OPEN', step: HINT, charged: true }).state;
    case 'kitty':
      return reduce(playing(), { type: 'KITTY', cell: SOL5[0] as number, t: 1 }).state;
    case 'won':
      return wonState();
    case 'lost':
      return lostState();
  }
}

/** One representative action per type, valid on every state above (cell(1,1) is never a solution cell). */
const ACTIONS: Record<ActionType, Action> = {
  START: { type: 'START' },
  TAP: tap(cell(1, 1), 9),
  DOUBLE_TAP: dbl(SOL5[1] as number, 9),
  PAINT: { type: 'PAINT', cells: [cell(1, 1)], mode: 'mark', t: 9 },
  HINT_OPEN: { type: 'HINT_OPEN', step: HINT, charged: true },
  HINT_APPLY: { type: 'HINT_APPLY', t: 9 },
  HINT_CLOSE: { type: 'HINT_CLOSE' },
  KITTY: { type: 'KITTY', cell: SOL5[2] as number, t: 9 },
  KITTY_DONE: { type: 'KITTY_DONE' },
  REVIVE: { type: 'REVIVE', t: 9 },
  RETRY: { type: 'RETRY' },
  TICK: { type: 'TICK', dtMs: 1000 },
};

const STATUSES: Status[] = ['ready', 'playing', 'hint', 'kitty', 'won', 'lost'];

/** Expected status after an allowed action (04 §4.2 "Effect" column). */
const NEXT: Partial<Record<ActionType, Partial<Record<Status, Status>>>> = {
  START: { ready: 'playing' },
  TAP: { playing: 'playing' },
  DOUBLE_TAP: { playing: 'playing' },
  PAINT: { playing: 'playing' },
  HINT_OPEN: { playing: 'hint' },
  HINT_APPLY: { hint: 'playing' },
  HINT_CLOSE: { hint: 'playing' },
  KITTY: { playing: 'kitty' },
  KITTY_DONE: { kitty: 'playing' },
  REVIVE: { lost: 'playing' },
  RETRY: { lost: 'ready' },
  TICK: { playing: 'playing', hint: 'hint', kitty: 'kitty' },
};

const MATRIX = STATUSES.flatMap((status) =>
  (Object.keys(ACTIONS) as ActionType[]).map((type) => ({ status, type, allowed: ALLOWED_STATUSES[type].includes(status) })),
);

describe('04 §4.2 status × action matrix', () => {
  it('the table matches the spec', () => {
    expect(ALLOWED_STATUSES).toEqual({
      START: ['ready'],
      TAP: ['playing'],
      DOUBLE_TAP: ['playing'],
      PAINT: ['playing'],
      HINT_OPEN: ['playing'],
      HINT_APPLY: ['hint'],
      HINT_CLOSE: ['hint'],
      KITTY: ['playing'],
      KITTY_DONE: ['kitty'],
      REVIVE: ['lost'],
      RETRY: ['lost'],
      TICK: ['playing', 'hint', 'kitty'],
    });
    expect(isActionAllowed('hint', 'TICK')).toBe(true);
    expect(isActionAllowed('won', 'TICK')).toBe(false);
  });

  it.each(MATRIX)('$status × $type → allowed: $allowed', ({ status, type, allowed }) => {
    const s = stateIn(status);
    expect(s.status).toBe(status);
    const r = reduce(s, ACTIONS[type]);
    if (!allowed) {
      expect(r.state).toBe(s);
      expect(r.events).toEqual([]);
      return;
    }
    expect(r.state).not.toBe(s);
    expect(r.state.status).toBe(NEXT[type]?.[status]);
  });
});

describe('START and TICK', () => {
  it('START: ready → playing, no events, nothing logged', () => {
    const r = reduce(newGame(P5, 'level'), { type: 'START' });
    expect(r.state.status).toBe('playing');
    expect(r.events).toEqual([]);
    expect(r.state.moves).toEqual([]);
  });

  it('TICK adds dtMs in playing, hint and kitty; ignores non-positive or non-finite deltas', () => {
    let s = run(playing(), [{ type: 'TICK', dtMs: 1000 }, { type: 'TICK', dtMs: 250.5 }]).state;
    expect(s.elapsedMs).toBe(1250.5);
    for (const dtMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(reduce(s, { type: 'TICK', dtMs }).state).toBe(s);
    s = reduce(s, { type: 'HINT_OPEN', step: HINT, charged: false }).state;
    s = reduce(s, { type: 'TICK', dtMs: 100 }).state;
    expect(s.elapsedMs).toBe(1350.5);
    expect(reduce(stateIn('kitty'), { type: 'TICK', dtMs: 7 }).state.elapsedMs).toBe(7);
  });

  it('the timer stops in won and lost', () => {
    for (const s of [wonState(), lostState()]) expect(reduce(s, { type: 'TICK', dtMs: 1000 }).state).toBe(s);
  });
});

describe('REVIVE (02 §8, §10.2)', () => {
  it('hearts = heartsOnRevive, revivesUsed+1, board and timer kept, REVIVED, → playing', () => {
    const lost = run(playing(), [
      tap(cell(1, 1), 0),
      dbl(SOL5[0] as number, 1),
      { type: 'TICK', dtMs: 4321 },
      ...WRONG5.slice(0, 3).map((c, i) => dbl(c, 2 + i)),
    ]).state;
    expect(lost.status).toBe('lost');
    expect(canRevive(lost)).toBe(true);
    const r = reduce(lost, { type: 'REVIVE', t: 10 });
    expect(r.events).toEqual([{ type: 'REVIVED' }]);
    expect(r.state).toMatchObject({ status: 'playing', hearts: 1, revivesUsed: 1, mistakes: 3, elapsedMs: 4321, catsPlaced: 1 });
    expect(r.state.cells).toEqual(lost.cells); // Wrong cells, marks and cats all stay
    expect(r.state.cells[cell(1, 1)]).toBe(CellState.Mark);
  });

  it('one revive per attempt: the next loss offers none', () => {
    let s = reduce(lostState(), { type: 'REVIVE', t: 1 }).state;
    const r = reduce(s, dbl(WRONG5[3] as number, 2));
    expect(r.events).toEqual([{ type: 'MISTAKE', cell: WRONG5[3], heartsLeft: 0 }, { type: 'LOST' }]);
    s = r.state;
    expect(s).toMatchObject({ status: 'lost', hearts: 0, mistakes: 4, revivesUsed: 1 });
    expect(canRevive(s)).toBe(false);
    expect(reduce(s, { type: 'REVIVE', t: 3 })).toEqual({ state: s, events: [] });
  });

  it('respects rules.maxRevives and rules.heartsOnRevive', () => {
    const rules = { ...P5Rules(), maxRevives: 2, heartsOnRevive: 2 };
    let s = reduce(newGame(P5, 'level', rules), { type: 'START' }).state;
    s = run(s, WRONG5.slice(0, 3).map((c) => dbl(c))).state;
    s = reduce(s, { type: 'REVIVE', t: 1 }).state;
    expect(s.hearts).toBe(2);
    s = run(s, [dbl(WRONG5[3] as number), dbl(cell(1, 1))]).state;
    expect(s.status).toBe('lost');
    expect(canRevive(s)).toBe(true);
    expect(reduce(s, { type: 'REVIVE', t: 2 }).state.revivesUsed).toBe(2);
  });
});

function P5Rules(): GameState['rules'] {
  return newGame(P5, 'level').rules;
}

describe('RETRY (02 §8)', () => {
  it('a fresh attempt on the same puzzle: givens only, full hearts, counters and timer 0, revive available', () => {
    let s = reduce(playing(P5G), tap(cell(1, 1), 0)).state;
    s = run(s, [
      { type: 'HINT_OPEN', step: HINT, charged: true },
      { type: 'HINT_CLOSE' },
      { type: 'KITTY', cell: SOL5[0] as number, t: 1 },
      { type: 'KITTY_DONE' },
      { type: 'TICK', dtMs: 999 },
      ...WRONG5.slice(0, 3).map((c) => dbl(c, 2)),
    ]).state;
    s = reduce(s, { type: 'REVIVE', t: 3 }).state;
    s = reduce(s, dbl(WRONG5[3] as number, 4)).state;
    expect(s.status).toBe('lost');
    const r = reduce(s, { type: 'RETRY' });
    expect(r.events).toEqual([]);
    const fresh = newGame(P5G, 'level');
    expect(r.state).toEqual({ ...fresh, rules: s.rules });
    expect(r.state.puzzle).toBe(s.puzzle);
    expect(r.state.mode).toBe('level');
    expect(r.state.cells[cell(2, 4)]).toBe(CellState.Given);
    expect(r.state.catsPlaced).toBe(1);
  });

  it('keeps the attempt rules and mode (daily stays daily)', () => {
    const lost = lostState(P5, 'daily');
    const r = reduce(lost, { type: 'RETRY' });
    expect(r.state.mode).toBe('daily');
    expect(r.state.rules).toBe(lost.rules);
  });
});

describe('terminal states', () => {
  it('won: every board, helper and timer action is ignored', () => {
    const s = wonState();
    expect(s.status).toBe('won');
    for (const a of Object.values(ACTIONS)) expect(reduce(s, a).state).toBe(s);
  });

  it('a removed cat is only possible while playing (no cat removal after the win)', () => {
    const s = wonState();
    expect(reduce(s, dbl(SOL5[0] as number)).state).toBe(s);
  });
});

/** Tiny deterministic LCG for the invariant walk (no Math.random in tests). */
function lcg(seed: number): (n: number) => number {
  let x = seed >>> 0;
  return (n) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
}

describe('02 §8 invariants under random play', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i: Wrong count = mistakes, hearts = 3 + revives − mistakes, cats correct', (seed) => {
    const rnd = lcg(seed);
    let s = playing(seed % 2 === 0 ? P5 : P5G);
    for (let i = 0; i < 300; i++) {
      const c = rnd(25);
      const pick = rnd(8);
      const a: Action =
        pick < 3
          ? tap(c, i)
          : pick < 5
            ? dbl(c, i)
            : pick === 5
              ? { type: 'PAINT', cells: [c, rnd(25), rnd(25)], mode: rnd(2) ? 'mark' : 'erase', t: i }
              : pick === 6
                ? { type: 'REVIVE', t: i }
                : { type: 'RETRY' };
      s = reduce(s.status === 'ready' ? reduce(s, { type: 'START' }).state : s, a).state;
      const wrong = [...s.cells].filter((v) => v === CellState.Wrong).length;
      expect(wrong).toBe(s.mistakes);
      expect(s.hearts).toBe(s.rules.heartsPerAttempt + s.revivesUsed * s.rules.heartsOnRevive - s.mistakes);
      expect(s.hearts).toBeGreaterThanOrEqual(0);
      const cats = [...s.cells.keys()].filter((k) => s.cells[k] === CellState.Cat || s.cells[k] === CellState.Given);
      expect(cats.every((k) => SOL5.includes(k))).toBe(true);
      expect(cats.length).toBe(s.catsPlaced);
      if (s.status === 'won') s = reduce(newGame(s.puzzle, 'level'), { type: 'START' }).state;
    }
  });

  it('events are consistent: one MISTAKE per Wrong cell, LOST exactly when hearts reach 0', () => {
    const r = run(playing(), [...WRONG5.slice(0, 2).map((c) => dbl(c)), dbl(SOL5[0] as number), dbl(WRONG5[2] as number)]);
    expect(types(r.events)).toEqual(['MISTAKE', 'MISTAKE', 'CAT_PLACED', 'REGION_DONE', 'MISTAKE', 'LOST']);
  });
});
