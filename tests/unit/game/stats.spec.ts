// Owner: game. Win bookkeeping (02 §10.1): level, tutorial and daily records.
import { describe, expect, it } from 'vitest';
import { toInProgress } from '../../../src/game/factory';
import { defaults } from '../../../src/game/save';
import { applyDailyWin, applyLevelWin, applyTutorialDone, dailyRecord, levelBest } from '../../../src/game/stats';
import type { GameState, SaveDataV1 } from '../../../src/game/types';
import { dbl, makePuzzle, playing, R5, run, S5, SOL5, tap, WRONG5 } from './fixtures';

/** A won P5 attempt with one mistake, two hints and a kitty, after 252 345.6 ms. */
function won(): GameState {
  const s = run(playing(), [
    dbl(WRONG5[0] as number),
    { type: 'HINT_OPEN', step: { kind: 'shadow', level: 0, focusUnits: [], focusCells: [], effectCells: [] }, charged: true },
    { type: 'HINT_CLOSE' },
    { type: 'HINT_OPEN', step: { kind: 'shadow', level: 0, focusUnits: [], focusCells: [], effectCells: [] }, charged: true },
    { type: 'HINT_CLOSE' },
    { type: 'KITTY', cell: SOL5[0] as number, t: 0 },
    { type: 'KITTY_DONE' },
    { type: 'TICK', dtMs: 252_345.6 },
    ...SOL5.slice(1).map((c) => dbl(c)),
  ]).state;
  expect(s.status).toBe('won');
  return s;
}

function at(level: number): SaveDataV1 {
  const d = defaults(0);
  const slot = toInProgress(run(playing(), [tap(1)]).state, 1);
  return { ...d, tutorialDone: level > 1, progress: { level, completed: level - 1, best: {} }, inProgress: { level: slot, daily: slot } };
}

describe('level win', () => {
  it('level = L + 1, completed + 1, best[L] = [ms, mistakes], level slot cleared (daily slot kept)', () => {
    const before = at(2);
    const s = applyLevelWin(before, 2, won());
    expect(s.progress).toEqual({ level: 3, completed: 2, best: { 2: [252_346, 1] } });
    expect(s.inProgress.level).toBeNull();
    expect(s.inProgress.daily).toBe(before.inProgress.daily);
    expect(before.progress.level).toBe(2); // never mutated
    expect(levelBest(s, 2)).toEqual([252_346, 1]);
    expect(levelBest(s, 3)).toBeNull();
  });

  it('is idempotent: a level already counted does not count twice and keeps the faster time', () => {
    const once = applyLevelWin(at(2), 2, won());
    const twice = applyLevelWin(once, 2, { ...won(), elapsedMs: 300_000 });
    expect(twice.progress).toEqual({ level: 3, completed: 2, best: { 2: [252_346, 1] } });
    const faster = applyLevelWin(once, 2, { ...won(), elapsedMs: 1000, mistakes: 0 });
    expect(faster.progress.best[2]).toEqual([1000, 0]);
  });
});

describe('tutorial done (win or skip)', () => {
  it('tutorialDone, level 2, completed 1, no stats record', () => {
    const s = applyTutorialDone(defaults(0));
    expect(s.tutorialDone).toBe(true);
    expect(s.progress).toEqual({ level: 2, completed: 1, best: {} });
    expect(s.daily).toEqual({});
  });

  it('never moves progress backwards', () => {
    const s = applyTutorialDone(at(40));
    expect(s.progress).toMatchObject({ level: 40, completed: 39 });
  });
});

describe('daily win', () => {
  it('daily[date] = [ms, mistakes, hints, kitties], daily slot cleared, progress untouched', () => {
    const before = at(25);
    const d = { ...won(), puzzle: makePuzzle('D2026-10-06', R5, S5), mode: 'daily' as const };
    const s = applyDailyWin(before, '2026-10-06', d);
    expect(s.daily).toEqual({ '2026-10-06': [252_346, 1, 2, 1] });
    expect(s.inProgress.daily).toBeNull();
    expect(s.inProgress.level).toBe(before.inProgress.level);
    expect(s.progress).toBe(before.progress); // dailies do not count as completed levels
    expect(dailyRecord(s, '2026-10-06')).toEqual([252_346, 1, 2, 1]);
    expect(dailyRecord(s, '2026-10-07')).toBeNull();
  });

  it('a second win for the same date keeps the faster record', () => {
    const first = applyDailyWin(at(25), '2026-10-06', won());
    expect(applyDailyWin(first, '2026-10-06', { ...won(), elapsedMs: 999_999 }).daily['2026-10-06']).toEqual([252_346, 1, 2, 1]);
  });
});
