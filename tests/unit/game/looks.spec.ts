// UI batch (2026-10-13): profile — which frames and backgrounds a player may pick (src/game/looks.ts): ids 0–2 free,
// the rest by progress the save backs (the level reached, the best day streak, a ranking reward claimed); what the
// player already wears is never locked; one table entry per wire id.
import { describe, expect, it } from 'vitest';
import { BACKGROUND_UNLOCKS, FRAME_UNLOCKS, isUnlocked, lookLocks, lookProgress, type LookProgress } from '../../../src/game/looks';
import { defaults } from '../../../src/game/save';
import { BACKGROUND_COUNT, FRAME_COUNT } from '../../../src/shared/rank-api';

const fresh: LookProgress = { level: 1, bestStreak: 0, prizes: 0 };

describe('look unlocks (game/looks.ts)', () => {
  it('one entry per frame and background id; ids 0–2 of each are free, every other one names its unlock', () => {
    expect(FRAME_UNLOCKS).toHaveLength(FRAME_COUNT);
    expect(BACKGROUND_UNLOCKS).toHaveLength(BACKGROUND_COUNT);
    for (const table of [FRAME_UNLOCKS, BACKGROUND_UNLOCKS]) {
      expect(table.slice(0, 3).map((u) => u.kind)).toEqual(['free', 'free', 'free']);
      expect(table.slice(3).every((u) => u.kind !== 'free')).toBe(true);
    }
    // the mix the user asked for: levels, a streak and a ranking reward on both
    for (const kind of ['level', 'streak', 'prize'] as const) {
      expect(FRAME_UNLOCKS.some((u) => u.kind === kind), kind).toBe(true);
      expect(BACKGROUND_UNLOCKS.some((u) => u.kind === kind), kind).toBe(true);
    }
  });

  it('the progress comes from the save: the next level to play, the best streak, the claimed rewards', () => {
    const s = defaults(Date.UTC(2026, 9, 13));
    expect(lookProgress(s)).toEqual({ level: s.progress.level, bestStreak: s.dayStreak.best, prizes: 0 });
    const t = { ...s, progress: { ...s.progress, level: 120 }, dayStreak: { ...s.dayStreak, best: 9 }, ladder: { ...s.ladder, claimed: ['mgj1a0k3x9f2:11|1|1'] } };
    expect(lookProgress(t)).toEqual({ level: 120, bestStreak: 9, prizes: 1 });
  });

  it('each kind unlocks at its threshold, not before', () => {
    expect(isUnlocked({ kind: 'free' }, fresh)).toBe(true);
    expect(isUnlocked({ kind: 'level', level: 25 }, { ...fresh, level: 24 })).toBe(false);
    expect(isUnlocked({ kind: 'level', level: 25 }, { ...fresh, level: 25 })).toBe(true);
    expect(isUnlocked({ kind: 'streak', days: 7 }, { ...fresh, bestStreak: 6 })).toBe(false);
    expect(isUnlocked({ kind: 'streak', days: 7 }, { ...fresh, bestStreak: 7 })).toBe(true);
    expect(isUnlocked({ kind: 'prize' }, fresh)).toBe(false);
    expect(isUnlocked({ kind: 'prize' }, { ...fresh, prizes: 1 })).toBe(true);
  });

  it('lookLocks: null for what may be picked, the unlock for the rest; the worn id is never locked', () => {
    const fresh8 = lookLocks(FRAME_UNLOCKS, FRAME_COUNT, fresh, 0);
    expect(fresh8.map((l) => l === null)).toEqual([true, true, true, false, false, false, false, false]);
    expect(fresh8[3]).toEqual(FRAME_UNLOCKS[3]);
    // worn on another device (the server stores any id): stays open here
    expect(lookLocks(FRAME_UNLOCKS, FRAME_COUNT, fresh, 6)[6]).toBeNull();
    const veteran: LookProgress = { level: 1000, bestStreak: 30, prizes: 4 };
    expect(lookLocks(BACKGROUND_UNLOCKS, BACKGROUND_COUNT, veteran, 0).every((l) => l === null)).toBe(true);
    // a count past the table offers no more than the table knows
    expect(lookLocks(FRAME_UNLOCKS, FRAME_COUNT + 3, veteran, 0)).toHaveLength(FRAME_COUNT);
  });
});
