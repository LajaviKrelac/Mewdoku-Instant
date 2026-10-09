// Owner: C (Phase 2b; was game). Level → pack/record, hard levels, endless/substitute/daily specs, daily unlock and dates (02 §11–12).
import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import type { DailyPack, LevelPack } from '../../../src/engine/types';
import {
  dailyCardState,
  dailyMonthOf,
  dailyPuzzleId,
  dailyRecordIn,
  dailySpec,
  dateKeyOf,
  endlessRetrySpec,
  endlessSpec,
  isDailyUnlocked,
  isEndless,
  isHard,
  levelPuzzleId,
  levelRecordIn,
  localDateKey,
  localMidnightAfter,
  msUntilLocalMidnight,
  packCount,
  packFirstLevel,
  packIndexFor,
  packsToPrefetch,
  slotPoolAndBand,
  substituteSpec,
  weekdayOf,
} from '../../../src/game/progression';
import { DAILY_12_FROM, dailySlotFor, isTwelveSunday } from '../../../src/game/ramp';
import { defaults } from '../../../src/game/save';
import type { InProgressV2, SaveData } from '../../../src/game/types';
import { rec5 } from './fixtures';

describe('hard levels and ids', () => {
  it.each([
    [1, false], [10, false], [20, false], [29, false], [30, true], [31, false], [40, true],
    [100, true], [101, false], [999, false], [1000, true], [1010, true], [1011, false],
  ])('isHard(%i) = %s', (level, hard) => {
    expect(isHard(level)).toBe(hard);
  });

  it('puzzle ids: T1 for level 1, L<n>, D<date>', () => {
    expect(levelPuzzleId(1)).toBe('T1');
    expect(levelPuzzleId(37)).toBe('L37');
    expect(dailyPuzzleId('2026-10-06')).toBe('D2026-10-06');
    expect(dateKeyOf('D2026-10-06')).toBe('2026-10-06');
    expect(dateKeyOf('L37')).toBeNull();
    expect(dateKeyOf('D2026-13-01')).toBeNull();
  });
});

describe('packs (03 §9.3)', () => {
  it.each([
    [1, 0], [100, 0], [101, 1], [200, 1], [201, 2], [999, 9], [1000, 9], [1001, null], [0, null], [-3, null], [2.5, null],
  ])('packIndexFor(%s) = %s', (level, k) => {
    expect(packIndexFor(level)).toBe(k);
  });

  it('10 packs of 100; pack k starts at k·100 + 1', () => {
    expect(packCount()).toBe(10);
    expect(packFirstLevel(0)).toBe(1);
    expect(packFirstLevel(3)).toBe(301);
  });

  it.each([
    [1, []], [80, []], [81, [1]], [100, [1]], [101, [1]], [180, [1]], [181, [1, 2]], [981, [9]], [1000, [9]], [1001, []],
  ])('packsToPrefetch(%i) = %j (pack 000 is bundled)', (level, packs) => {
    expect(packsToPrefetch(level)).toEqual(packs);
  });

  it('a config variant changes the pack maths', () => {
    const c = mergeConfig({ levels: { packSize: 3, shipped: 9, prefetchAhead: 1 } });
    expect(packIndexFor(4, c)).toBe(1);
    expect(packsToPrefetch(3, c)).toEqual([1]);
    expect(packsToPrefetch(6, c)).toEqual([1, 2]);
    expect(isEndless(10, c)).toBe(true);
  });

  it('levelRecordIn finds by position or by i; null when absent', () => {
    const pack: LevelPack = { v: 1, kind: 'levels', first: 101, count: 3, gen: 't', levels: [rec5(101), rec5(102), rec5(103)] };
    expect(levelRecordIn(pack, 102)).toEqual(rec5(102));
    expect(levelRecordIn(pack, 104)).toBeNull();
    const shuffled: LevelPack = { ...pack, levels: [rec5(103), rec5(101), rec5(102)] };
    expect(levelRecordIn(shuffled, 101)).toEqual(rec5(101));
    const noI: LevelPack = { ...pack, levels: [rec5(), rec5(), rec5()] };
    expect(levelRecordIn(noI, 103)).toEqual(rec5());
  });

  it('daily month and record lookup (daily date → record)', () => {
    expect(dailyMonthOf('2026-10-06')).toBe('2026-10');
    expect(() => dailyMonthOf('2026-1-6')).toThrow(RangeError);
    const pack: DailyPack = { v: 1, kind: 'daily', month: '2026-10', gen: 't', days: { '2026-10-06': rec5() } };
    expect(dailyRecordIn(pack, '2026-10-06')).toEqual(rec5());
    expect(dailyRecordIn(pack, '2026-10-07')).toBeNull();
    expect(dailyRecordIn(pack, '2026-11-06')).toBeNull();
    expect(dailyRecordIn(pack, 'toString')).toBeNull();
  });
});

describe('generated boards (02 §11.4, §12)', () => {
  it('endless normal level: level seed, the 201–1000 pool, band G3–G4, per-size shape limits', () => {
    expect(isEndless(1000)).toBe(false);
    expect(isEndless(1001)).toBe(true);
    expect(endlessSpec(1001).gradeBand).toEqual([3, 3]); // 1000 is Hard, so 1001 is a breather
    const s = endlessSpec(1002);
    expect(s).toMatchObject({ n: 0, seed: 'mewdoku:level:v1:1002', gradeBand: [3, 4], allowG5Steps: 0, growth: 'mixed', maxAttempts: 5000 });
    expect(s.sizePool).toEqual([[8, 2], [9, 2], [10, 2], [11, 2], [12, 1]]);
    expect(s.sizeLimits).toEqual([[8, 2, 20], [9, 2, 23], [10, 2, 25], [11, 2, 28], [12, 2, 30]]);
    expect(s).toMatchObject({ edenOneIn: 4, repairMaxIter: 400 });
  });

  it('endless hard level: band G4–G5 with at most one G5 step; the next level is a breather', () => {
    expect(endlessSpec(1010)).toMatchObject({ gradeBand: [4, 5], allowG5Steps: 1 });
    const b = endlessSpec(1011);
    expect(b.sizePool).toEqual([[8, 2], [9, 2], [10, 2]]);
    expect(b.gradeBand).toEqual([3, 3]);
  });

  it('endless retry: seed :r1, band G1–G5, still at most one G5 step', () => {
    const r = endlessRetrySpec(endlessSpec(1003));
    expect(r).toMatchObject({ seed: 'mewdoku:level:v1:1003:r1', gradeBand: [1, 5], allowG5Steps: 1 });
    expect(r.sizePool).toEqual(endlessSpec(1003).sizePool);
  });

  it('substitute board: fallback seed with the slot pool and band from the ramp table', () => {
    expect(substituteSpec(37)).toMatchObject({ seed: 'mewdoku:fallback:v1:37', gradeBand: [3, 3], sizePool: [[7, 2], [8, 2], [9, 1]] });
    expect(substituteSpec(30).gradeBand).toEqual([3, 4]); // hard
    expect(substituteSpec(31)).toMatchObject({ gradeBand: [3, 3], sizePool: [[7, 2], [8, 2]] }); // breather
    expect(substituteSpec(5)).toMatchObject({ sizePool: [[5, 2], [6, 1]], sizeLimits: [[5, 1, 13], [6, 1, 15]] }); // single tiles allowed ≤ L6
    expect(substituteSpec(8).sizeLimits).toEqual([[6, 2, 15], [7, 2, 18]]);
    expect(slotPoolAndBand(2)).toEqual({ pool: [[5, 1]], band: [1, 2] });
  });

  it('daily spec: daily seed, size and band from the weekday of the date string', () => {
    expect(dailySpec('2026-10-06')).toMatchObject({ n: 8, seed: 'mewdoku:daily:v1:2026-10-06', gradeBand: [3, 3], minRegion: 2, maxRegion: 20 });
    expect(dailySpec('2026-10-11')).toMatchObject({ n: 11, gradeBand: [4, 4] }); // Sunday
    expect(dailySpec('2026-10-06').sizePool).toBeUndefined();
  });

  it('a 12×12 G4 daily every second Sunday from DAILY_12_FROM (review PAR-1); earlier dates keep the weekday table', () => {
    expect(DAILY_12_FROM).toBe('2026-10-18');
    expect(dailySpec('2026-10-04')).toMatchObject({ n: 11, gradeBand: [4, 4] }); // before: unchanged
    expect(dailySpec('2026-10-11')).toMatchObject({ n: 11, gradeBand: [4, 4] });
    expect(dailySpec('2026-10-18')).toMatchObject({ n: 12, gradeBand: [4, 4], seed: 'mewdoku:daily:v1:2026-10-18' });
    expect(dailySpec('2026-10-25')).toMatchObject({ n: 11, gradeBand: [4, 4] });
    expect(dailySpec('2026-11-01')).toMatchObject({ n: 12, gradeBand: [4, 4] });
    expect(dailySlotFor('2027-01-10')).toEqual({ n: 12, band: [4, 4] }); // 12 weeks after the first: even
    expect(dailySlotFor('2027-01-17')).toEqual({ n: 11, band: [4, 4] });
    // Only Sundays: every other weekday keeps its slot, before and after.
    for (const [date, n] of [['2026-10-19', 8], ['2026-10-20', 8], ['2026-10-21', 9], ['2026-10-22', 9], ['2026-10-23', 10], ['2026-10-24', 10]] as const) {
      expect(dailySlotFor(date).n, date).toBe(n);
      expect(isTwelveSunday(date)).toBe(false);
    }
    // Over a year: half of the Sundays are 12×12.
    let sundays = 0;
    let twelves = 0;
    for (let d = Date.UTC(2027, 0, 3); d < Date.UTC(2028, 0, 1); d += 7 * 86_400_000) {
      const key = new Date(d).toISOString().slice(0, 10);
      sundays++;
      if (dailySlotFor(key).n === 12) twelves++;
    }
    expect(sundays).toBe(52);
    expect(twelves).toBe(26);
  });
});

describe('daily unlock and dates (02 §12)', () => {
  const at = (level: number): Pick<SaveData, 'progress'> => ({ progress: { level, completed: level - 1, best: {} } });

  it('unlocked iff progress.level > 20', () => {
    expect(isDailyUnlocked(at(20))).toBe(false);
    expect(isDailyUnlocked(at(21))).toBe(true);
  });

  it('localDateKey uses the local calendar date', () => {
    expect(localDateKey(new Date(2026, 9, 6, 0, 0, 0).getTime())).toBe('2026-10-06');
    expect(localDateKey(new Date(2026, 9, 6, 23, 59, 59, 999).getTime())).toBe('2026-10-06');
    expect(localDateKey(new Date(2026, 0, 1, 12).getTime())).toBe('2026-01-01');
  });

  it.each([
    ['2026-10-05', 1], ['2026-10-06', 2], ['2026-10-11', 0], ['2024-02-29', 4], ['2000-01-01', 6],
  ])('weekdayOf(%s) = %i (from the string, not the clock)', (key, day) => {
    expect(weekdayOf(key)).toBe(day);
  });

  it('msUntilLocalMidnight: "Next puzzle in 7 h 48 min" at 16:12', () => {
    expect(msUntilLocalMidnight(new Date(2026, 9, 6, 16, 12).getTime())).toBe((7 * 60 + 48) * 60_000);
    expect(msUntilLocalMidnight(new Date(2026, 9, 6, 23, 59, 59, 999).getTime())).toBe(1);
  });

  it('localMidnightAfter: the local midnight that ends a date key (O7 counts down from the daily’s own date)', () => {
    expect(localMidnightAfter('2026-10-07')).toBe(new Date(2026, 9, 8).getTime());
    expect(localMidnightAfter('2026-12-31')).toBe(new Date(2027, 0, 1).getTime()); // month and year roll over
    expect(localMidnightAfter('2028-02-28')).toBe(new Date(2028, 1, 29).getTime());
    // Solved at 00:01 on 8 Oct, the 7 Oct daily's next puzzle is already out; same day: msUntilLocalMidnight.
    const after = new Date(2026, 9, 8, 0, 1).getTime();
    expect((localMidnightAfter('2026-10-07') as number) - after).toBeLessThan(0);
    const noon = new Date(2026, 9, 7, 12, 0).getTime();
    expect((localMidnightAfter('2026-10-07') as number) - noon).toBe(msUntilLocalMidnight(noon));
    expect(localMidnightAfter('')).toBeNull();
    expect(localMidnightAfter('D2026-10-07')).toBeNull();
  });

  it('home card states: locked / not played / in progress / solved', () => {
    const today = '2026-10-06';
    const base = defaults(0);
    expect(dailyCardState(base, today)).toBe('locked');
    const open: SaveData = { ...base, progress: { ...base.progress, level: 21 } };
    expect(dailyCardState(open, today)).toBe('not_played');
    const slot = (id: InProgressV2['id']): InProgressV2 => ({
      id, mode: 'daily', cells: '0'.repeat(64), hearts: 3, revivesUsed: 0, mistakes: 0, hintsUsed: 0, kittiesUsed: 0, elapsedMs: 0, savedAt: 0,
    });
    expect(dailyCardState({ ...open, inProgress: { level: null, daily: slot('D2026-10-06'), event: null } }, today)).toBe('in_progress');
    expect(dailyCardState({ ...open, inProgress: { level: null, daily: slot('D2026-10-05'), event: null } }, today)).toBe('not_played');
    expect(dailyCardState({ ...open, daily: { [today]: [252_000, 1, 0, 0] } }, today)).toBe('solved');
  });
});
