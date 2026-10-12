// The combo (user, 2026-10-12; cfg.levelPoints.combo): the first scoring cat starts a countdown of
// 10 s of game time at combo x1; a scoring cat before it runs out raises the combo by one and restarts
// it 2 s shorter (never below 2 s); the countdown running out or a mistake ends the combo. A cat at
// combo xc is worth its increment × (100 + 10 × (c − 1)) %, rounded.
import { describe, expect, it } from 'vitest';
import { newGame, restoreGame, toInProgress } from '../../../src/game/factory';
import { rulesFor } from '../../../src/game/modes';
import { reduce } from '../../../src/game/reducer';
import { catIncrement, comboPoints, comboRunMax, comboWindowMs, runTotal } from '../../../src/game/scoring';
import type { Action, ComboRule, GameEvent, GameState } from '../../../src/game/types';
import { dbl, makePuzzle, P5, SOL5, WRONG5 } from './fixtures';

const RULE: ComboRule = { windowMs: 10_000, windowStepMs: 2_000, minWindowMs: 2_000, bonusPct: 10 };
const S10 = '0246813579';
const R10 = Array.from({ length: 10 }, (_, r) => String.fromCharCode(65 + r).repeat(10)).join('');
const P10 = makePuzzle('L10', R10, S10);
const sol10 = (r: number): number => r * 10 + parseInt(S10[r] as string, 36);
const wrong10 = (r: number): number => r * 10 + ((parseInt(S10[r] as string, 36) + 1) % 10);

const start = (p = P10): GameState => reduce(newGame(p, 'level'), { type: 'START' }).state;
const tick = (dtMs: number): Action => ({ type: 'TICK', dtMs });
const points = (events: readonly GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'POINTS' }> => e.type === 'POINTS');

function play(s0: GameState, actions: readonly Action[]): { state: GameState; events: GameEvent[] } {
  let state = s0;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = reduce(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

describe('combo rule (scoring.ts)', () => {
  it('the countdown: 10 s, 8 s, 6 s, 4 s, then 2 s for good', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((c) => comboWindowMs(c, RULE))).toEqual([10_000, 8_000, 6_000, 4_000, 2_000, 2_000, 2_000]);
  });

  it("the user's examples: x2 pays 672 × 110 %, x3 768 × 120 %, x4 864 × 130 %", () => {
    const p = rulesFor('level').points;
    expect(comboPoints(catIncrement(1, p), 1, RULE)).toBe(576);
    expect(comboPoints(catIncrement(2, p), 2, RULE)).toBe(Math.round(672 * 1.1)); // 739
    expect(comboPoints(catIncrement(3, p), 3, RULE)).toBe(Math.round(768 * 1.2)); // 922
    expect(comboPoints(catIncrement(4, p), 4, RULE)).toBe(Math.round(864 * 1.3)); // 1 123
    expect(comboPoints(672, 5, null)).toBe(672);
  });

  it('comboRunMax is runTotal without a combo, and every cat at its highest combo with one', () => {
    const p = rulesFor('level').points;
    expect(comboRunMax(10, p, null)).toBe(runTotal(10, p));
    expect(comboRunMax(3, p, RULE)).toBe(576 + 739 + 922);
  });

  it('modes: every scored mode has the combo; the tutorial has none', () => {
    expect(rulesFor('level').combo).toEqual(RULE);
    expect(rulesFor('daily').combo).toEqual(RULE);
    expect(rulesFor('tutorial').combo).toBeNull();
  });
});

describe('combo in the reducer', () => {
  it('fast cats chain x1, x2, x3 … with the bonus on each increment and a shorter countdown each time', () => {
    const t = play(start(), [dbl(sol10(0)), tick(1_000), dbl(sol10(1)), tick(1_000), dbl(sol10(2)), tick(1_000), dbl(sol10(3))]);
    const pts = points(t.events);
    expect(pts.map((e) => e.combo)).toEqual([1, 2, 3, 4]);
    expect(pts.map((e) => e.gained)).toEqual([576, 739, 922, 1_123]);
    expect(t.state).toMatchObject({ combo: 4, comboWindowMs: 4_000, comboEndsMs: 3_000 + 4_000, levelPoints: 576 + 739 + 922 + 1_123 });
  });

  it('the countdown is game time: just before it ends the combo goes on; reaching it ends the combo', () => {
    const alive = play(start(), [dbl(sol10(0)), tick(9_999), dbl(sol10(1))]);
    expect(points(alive.events).map((e) => e.combo)).toEqual([1, 2]);
    const ended = play(start(), [dbl(sol10(0)), tick(10_000)]);
    expect(ended.state).toMatchObject({ combo: 0, comboWindowMs: 0 });
    const next = reduce(ended.state, dbl(sol10(1)));
    expect(points(next.events)).toEqual([{ type: 'POINTS', cell: sol10(1), gained: 672, total: 1_248, streak: 2, combo: 1 }]);
    expect(next.state).toMatchObject({ combo: 1, comboWindowMs: 10_000, comboEndsMs: 20_000 });
  });

  it('the countdown stops shrinking at 2 s but the combo keeps growing', () => {
    const acts: Action[] = [];
    for (let r = 0; r < 8; r++) acts.push(dbl(sol10(r)), tick(1_500));
    const t = play(start(), acts);
    expect(points(t.events).map((e) => e.combo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(t.state.comboWindowMs).toBe(2_000);
  });

  it('a mistake ends the combo (and the run); the next cat starts again at x1', () => {
    const s = play(start(), [dbl(sol10(0)), tick(500), dbl(sol10(1))]).state;
    expect(s.combo).toBe(2);
    const m = reduce(s, dbl(wrong10(5)));
    expect(m.state).toMatchObject({ combo: 0, comboWindowMs: 0, catStreak: 0 });
    const next = reduce(m.state, dbl(sol10(2)));
    expect(points(next.events)[0]).toMatchObject({ gained: 576, combo: 1 });
  });

  it('a removal and a cat put back neither raise nor end the combo', () => {
    const s = play(start(P5), [dbl(SOL5[0] as number)]).state;
    const back = play(s, [dbl(SOL5[0] as number), dbl(SOL5[0] as number)]);
    expect(points(back.events)).toEqual([]);
    expect(back.state).toMatchObject({ combo: 1, comboEndsMs: 10_000 });
  });

  it('the tutorial has no combo: its cats never count one', () => {
    const t = play(reduce(newGame(P5, 'tutorial'), { type: 'START' }).state, [dbl(SOL5[0] as number), dbl(SOL5[1] as number)]);
    expect(t.state.combo).toBe(0);
  });

  it('RETRY ends the combo; a restore starts without one but keeps the combo points', () => {
    const s = play(start(P5), [dbl(SOL5[0] as number), dbl(SOL5[1] as number), dbl(WRONG5[0] as number), dbl(SOL5[2] as number), dbl(SOL5[3] as number)]).state;
    expect(s).toMatchObject({ combo: 2, levelPoints: 576 + 739 + 576 + 739 });
    const g = restoreGame(P5, toInProgress(s, 0));
    expect(g).toMatchObject({ combo: 0, comboWindowMs: 0, levelPoints: s.levelPoints, catStreak: 2 });
    const lost = play(start(P5), [dbl(SOL5[0] as number), ...WRONG5.slice(0, 3).map((c) => dbl(c))]).state;
    expect(reduce(lost, { type: 'RETRY' }).state).toMatchObject({ combo: 0, levelPoints: 0 });
  });

  it('a mistake-free slot with combo points restores exactly; one above every combo is derived', () => {
    const s = play(start(P5), SOL5.slice(0, 4).map((c) => dbl(c))).state;
    expect(s.levelPoints).toBe(comboRunMax(4, s.rules.points, RULE));
    expect(restoreGame(P5, toInProgress(s, 0)).levelPoints).toBe(s.levelPoints);
    const inflated = { ...toInProgress(s, 0), points: s.levelPoints + 1 };
    expect(restoreGame(P5, inflated).levelPoints).toBe(runTotal(4, s.rules.points));
  });
});
