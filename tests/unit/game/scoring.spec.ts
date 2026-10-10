// Owner: C (Phase 2b). Phase 2c (G1): UTC periods (§3.5), the period board encoding (§4.3) and the
// period points bookkeeping (§3.4). Phase 2c.1 (G1): level points per correct cat (§3.1, §10.8: the
// user's table, first-hand 2026-10-10); the 2c per-win formula and the perfect streak are gone.
// Board scores (phase2b §5.3): encode/decode round trips, ordering properties (faster = higher, newer
// day > older day, more solved > fewer), the client-side submit limits, and every encoded score < 2³¹.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { defaults } from '../../../src/game/save';
import * as scoring from '../../../src/game/scoring';
import {
  addPeriodPoints,
  addPoints,
  boardFormat,
  canSubmit,
  catIncrement,
  dayIndex,
  decodeScore,
  encodeDailyScore,
  encodeEventScore,
  encodePeriodScore,
  isPeriodKey,
  keptPoints,
  PERIOD_SPAN,
  periodIndex,
  periodKeyAt,
  periodTotal,
  pointsRuleFor,
  runTotal,
} from '../../../src/game/scoring';

const MAX31 = 2 ** 31;
const T = (iso: string): number => Date.parse(iso);

describe('level points per cat (phase2c.1 §3.1: the user\'s rule, first-hand 2026-10-10)', () => {
  const rule = pointsRuleFor('level');
  // The user's verified table: the s-th correct cat in a row adds 96 × (5 + s); running totals.
  const TABLE: readonly [s: number, add: number, total: number][] = [
    [1, 576, 576],
    [2, 672, 1_248],
    [3, 768, 2_016],
    [4, 864, 2_880],
    [5, 960, 3_840],
    [6, 1_056, 4_896],
    [7, 1_152, 6_048],
    [8, 1_248, 7_296],
    [9, 1_344, 8_640],
    [10, 1_440, 10_080],
  ];

  it.each(TABLE)('cat %i in a row adds %i; an unbroken run of that many totals %i', (s, add, total) => {
    expect(catIncrement(s, rule)).toBe(add);
    expect(runTotal(s, rule)).toBe(total);
  });

  it('11 and 12 cats (our boards reach 12×12): 11 616 and 13 248, the largest level total', () => {
    expect(runTotal(11, rule)).toBe(11_616);
    expect(runTotal(12, rule)).toBe(13_248);
    expect(catIncrement(11, rule)).toBe(1_536);
    expect(catIncrement(12, rule)).toBe(1_632);
  });

  it('catIncrement(s) = 96 × (5 + s) for s = 1…12, and the running total is the sum of the increments', () => {
    let sum = 0;
    for (let s = 1; s <= 12; s++) {
      expect(catIncrement(s, rule)).toBe(96 * (5 + s));
      sum += catIncrement(s, rule);
      expect(runTotal(s, rule)).toBe(sum);
      expect(runTotal(s, rule) % 96).toBe(0);
    }
  });

  it('no increment for s < 1 or a non-integer s; no total for k ≤ 0', () => {
    expect(catIncrement(0, rule)).toBe(0);
    expect(catIncrement(-3, rule)).toBe(0);
    expect(catIncrement(1.5, rule)).toBe(0);
    expect(catIncrement(Number.NaN, rule)).toBe(0);
    expect(runTotal(0, rule)).toBe(0);
    expect(runTotal(-2, rule)).toBe(0);
    expect(runTotal(Number.NaN, rule)).toBe(0);
  });

  it('pointsRuleFor: {576, 96} for level, daily and event; {0, 0} for the tutorial and a mode dropped from levelPoints.modes', () => {
    for (const mode of ['level', 'daily', 'event'] as const) expect(pointsRuleFor(mode)).toEqual({ first: 576, step: 96 });
    expect(pointsRuleFor('tutorial')).toEqual({ first: 0, step: 0 });
    const noDaily = mergeConfig({ levelPoints: { modes: ['level', 'event'] } });
    expect(pointsRuleFor('daily', noDaily)).toEqual({ first: 0, step: 0 });
    expect(pointsRuleFor('level', noDaily)).toEqual({ first: 576, step: 96 });
    // The {0, 0} rule scores nothing at any s.
    expect(catIncrement(5, pointsRuleFor('tutorial'))).toBe(0);
    expect(runTotal(12, pointsRuleFor('tutorial'))).toBe(0);
  });

  it('follows levelPoints.firstIncrement and levelPoints.step (config, never hard-coded)', () => {
    expect(cfg.levelPoints).toMatchObject({ firstIncrement: 576, step: 96 });
    const c = mergeConfig({ levelPoints: { firstIncrement: 100, step: 10 } });
    const r = pointsRuleFor('level', c);
    expect(r).toEqual({ first: 100, step: 10 });
    expect([1, 2, 3].map((s) => catIncrement(s, r))).toEqual([100, 110, 120]);
    expect(runTotal(3, r)).toBe(330);
  });

  it('the 2c per-win formula and the perfect streak helpers are gone; the 2b paw-points formula too', () => {
    for (const name of ['levelPointsFor', 'streakAfterWin', 'breakStreak', 'pointsFor', 'encodePointsScore']) {
      expect(name in scoring).toBe(false);
    }
  });

  it('addPoints (the lifetime total of counted level totals) is capped at points.max and never negative', () => {
    expect(addPoints(100, 55)).toBe(155);
    expect(addPoints(cfg.points.max - 5, 13_248)).toBe(cfg.points.max);
    expect(addPoints(10, -50)).toBe(10);
  });
});

describe('UTC periods (phase2c §3.5)', () => {
  const day = mergeConfig({ period: { kind: 'day' } });
  const month = mergeConfig({ period: { kind: 'month' } });

  it('the spec examples for 2026-10-09: week 2026-10-05 index 39, day 2026-10-09 index 277, month 2026-10-01 index 9', () => {
    const now = T('2026-10-09T15:30:00Z');
    expect(periodKeyAt(now)).toBe('2026-10-05');
    expect(periodIndex('2026-10-05')).toBe(39);
    expect(periodKeyAt(now, day)).toBe('2026-10-09');
    expect(periodIndex('2026-10-09', day)).toBe(277);
    expect(periodKeyAt(now, month)).toBe('2026-10-01');
    expect(periodIndex('2026-10-01', month)).toBe(9);
  });

  it('weeks start on Monday 00:00 UTC (not local time): Sunday 23:59:59.999 and Monday 00:00 straddle the boundary', () => {
    expect(periodKeyAt(T('2026-10-11T23:59:59.999Z'))).toBe('2026-10-05');
    expect(periodKeyAt(T('2026-10-12T00:00:00Z'))).toBe('2026-10-12');
    expect(periodKeyAt(T('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
    expect(periodKeyAt(T('2026-10-04T23:59:59Z'))).toBe('2026-09-28');
  });

  it('year edges: a week that starts in December, a day at New Year, the month of a leap February', () => {
    expect(periodKeyAt(T('2027-01-01T12:00:00Z'))).toBe('2026-12-28'); // a Friday; its Monday is in 2026
    expect(periodIndex('2026-12-28')).toBe(51);
    expect(periodKeyAt(T('2027-01-04T00:00:00Z'))).toBe('2027-01-04');
    expect(periodIndex('2027-01-04')).toBe(52);
    expect(periodKeyAt(T('2026-12-31T23:59:59Z'), day)).toBe('2026-12-31');
    expect(periodKeyAt(T('2027-01-01T00:00:00Z'), day)).toBe('2027-01-01');
    expect(periodKeyAt(T('2028-02-29T10:00:00Z'), month)).toBe('2028-02-01');
    expect(periodIndex('2027-01-01', month)).toBe(12);
  });

  it('the epoch is index 0; keys before it are negative', () => {
    expect(periodIndex('2026-01-05')).toBe(0);
    expect(periodIndex('2026-01-05', day)).toBe(0);
    expect(periodIndex('2026-01-01', month)).toBe(0);
    expect(periodIndex('2025-12-29')).toBe(-1);
  });

  it('a key that is not a period start of the configured kind (or not a date) throws; isPeriodKey says so', () => {
    expect(() => periodIndex('2026-10-06')).toThrow(RangeError); // a Tuesday
    expect(() => periodIndex('2026-10-02', month)).toThrow(RangeError);
    expect(() => periodIndex('2026-02-30', day)).toThrow(RangeError);
    expect(() => periodIndex('2026-10-5')).toThrow(RangeError);
    expect(isPeriodKey('2026-10-05')).toBe(true);
    expect(isPeriodKey('2026-10-06')).toBe(false);
    expect(isPeriodKey('2026-10-06', day)).toBe(true);
    expect(isPeriodKey('2026-10-01', month)).toBe(true);
    expect(isPeriodKey('')).toBe(false);
  });

  it('every key periodKeyAt gives over two years is a period start whose index steps by one', () => {
    for (const c of [cfg, day, month]) {
      let prevKey = '';
      let prevIndex = -1;
      for (let t = T('2026-01-05T00:00:00Z'); t < T('2028-01-05T00:00:00Z'); t += 6 * 3_600_000) {
        const key = periodKeyAt(t, c);
        expect(isPeriodKey(key, c)).toBe(true);
        if (key !== prevKey) {
          const i = periodIndex(key, c);
          expect(i).toBe(prevIndex + 1);
          prevKey = key;
          prevIndex = i;
        }
      }
    }
  });
});

describe('the period board encoding (phase2c §4.3)', () => {
  it('periodIndex × 100 000 + total: the current week (index 39) with 42 points posts 3 900 042; decode is the inverse', () => {
    expect(PERIOD_SPAN).toBe(100_000);
    const s = encodePeriodScore('2026-10-05', 42);
    expect(s).toBe(3_900_042);
    expect(decodeScore('period_points', s)).toEqual({ kind: 'period', periodIndex: 39, total: 42 });
    expect(boardFormat('period_points')).toBe('period');
  });

  it('the total is capped at period.max (99 999) and is never negative or fractional', () => {
    expect(encodePeriodScore('2026-10-05', 1e9)).toBe(39 * 100_000 + 99_999);
    expect(encodePeriodScore('2026-10-05', -5)).toBe(39 * 100_000);
    expect(encodePeriodScore('2026-10-05', 2.7)).toBe(39 * 100_000 + 2);
  });

  it('ordering: any newer period beats any older total; within a period more is higher', () => {
    expect(encodePeriodScore('2026-10-12', 0)).toBeGreaterThan(encodePeriodScore('2026-10-05', 99_999));
    expect(encodePeriodScore('2026-10-05', 43)).toBeGreaterThan(encodePeriodScore('2026-10-05', 42));
  });

  it('stays below 2³¹ until period index 21 473 (weeks, days and months)', () => {
    const lastWeek = new Date(T('2026-01-05T00:00:00Z') + 21_473 * 7 * 86_400_000).toISOString().slice(0, 10);
    expect(periodIndex(lastWeek)).toBe(21_473);
    expect(encodePeriodScore(lastWeek, 99_999)).toBeLessThan(MAX31);
    const day = mergeConfig({ period: { kind: 'day' } });
    const lastDay = new Date(T('2026-01-05T00:00:00Z') + 21_473 * 86_400_000).toISOString().slice(0, 10);
    expect(encodePeriodScore(lastDay, 99_999, day)).toBeLessThan(MAX31);
  });

  it('a key before the epoch encodes as index 0', () => {
    expect(encodePeriodScore('2025-12-29', 7)).toBe(7);
  });
});

describe('period points (phase2c §3.4)', () => {
  const MON = T('2026-10-05T08:00:00Z');
  const s0 = defaults(0);

  it('keptPoints: fish kept × pointsPerFish in a mode of period.modes; 0 for the tutorial or an excluded mode', () => {
    expect(keptPoints('level', 3)).toBe(3);
    expect(keptPoints('daily', 2)).toBe(2);
    expect(keptPoints('event', 1)).toBe(1);
    expect(keptPoints('tutorial', 3)).toBe(0);
    expect(keptPoints('level', 3, mergeConfig({ period: { pointsPerFish: 2 } }))).toBe(6);
    expect(keptPoints('daily', 3, mergeConfig({ period: { modes: ['level'] } }))).toBe(0);
  });

  it('adds to the current period, best follows; periodTotal reads it back', () => {
    const a = addPeriodPoints(s0, 3, MON);
    expect(a.period).toEqual({ key: '2026-10-05', total: 3, bestKey: '2026-10-05', bestTotal: 3 });
    const b = addPeriodPoints(a, 2, MON + 86_400_000);
    expect(b.period).toEqual({ key: '2026-10-05', total: 5, bestKey: '2026-10-05', bestTotal: 5 });
    expect(periodTotal(b, MON)).toBe(5);
  });

  it('the total restarts at 0 on Monday 00:00 UTC; best keeps the higher week; the old total reads as 0', () => {
    const wk1 = addPeriodPoints(addPeriodPoints(s0, 3, MON), 3, MON); // 6 in week 2026-10-05
    const nextMonday = T('2026-10-12T00:00:00Z');
    expect(periodTotal(wk1, nextMonday - 1)).toBe(6);
    expect(periodTotal(wk1, nextMonday)).toBe(0);
    const wk2 = addPeriodPoints(wk1, 2, nextMonday);
    expect(wk2.period).toEqual({ key: '2026-10-12', total: 2, bestKey: '2026-10-05', bestTotal: 6 });
    const wk2b = addPeriodPoints(addPeriodPoints(wk2, 3, nextMonday), 3, nextMonday); // 8 > 6
    expect(wk2b.period).toEqual({ key: '2026-10-12', total: 8, bestKey: '2026-10-12', bestTotal: 8 });
  });

  it('a tie moves best to the later period', () => {
    const wk1 = addPeriodPoints(s0, 3, MON);
    const wk2 = addPeriodPoints(wk1, 3, T('2026-10-13T00:00:00Z'));
    expect(wk2.period).toMatchObject({ bestKey: '2026-10-12', bestTotal: 3 });
  });

  it('capped at period.max; gained ≤ 0 returns the same save', () => {
    const near = { ...s0, period: { key: '2026-10-05', total: 99_998, bestKey: '2026-10-05', bestTotal: 99_998 } };
    expect(addPeriodPoints(near, 3, MON).period.total).toBe(99_999);
    expect(addPeriodPoints(s0, 0, MON)).toBe(s0);
    expect(addPeriodPoints(s0, -2, MON)).toBe(s0);
  });

  it('an empty record reads 0', () => {
    expect(periodTotal(s0, MON)).toBe(0);
  });
});

describe('board scores (§5.3)', () => {
  it('dayIndex counts whole days from 2026-01-01', () => {
    expect(dayIndex('2026-01-01')).toBe(0);
    expect(dayIndex('2026-01-02')).toBe(1);
    expect(dayIndex('2026-10-06')).toBe(278);
    expect(dayIndex('2028-12-31')).toBe(1095);
    expect(() => dayIndex('2026-1-1')).toThrow(RangeError);
  });

  it('daily: dayIndex × 100 000 + (99 999 − ceil secs), round trip by decodeScore', () => {
    const s = encodeDailyScore('2026-10-06', 187_200);
    expect(s).toBe(278 * 100_000 + (99_999 - 188));
    expect(decodeScore('daily_fastest', s)).toEqual({ kind: 'time', dayIndex: 278, secs: 188 });
    expect(encodeDailyScore('2026-10-06', 10_000_000_000)).toBe(278 * 100_000); // secs capped at 99 999
    expect(encodeDailyScore('2028-12-31', 0)).toBeLessThan(1.1e8 + 100_000);
  });

  it('daily ordering: faster = higher on the same day; any newer day > any older day', () => {
    expect(encodeDailyScore('2026-10-06', 60_000)).toBeGreaterThan(encodeDailyScore('2026-10-06', 61_000));
    expect(encodeDailyScore('2026-10-07', 99_000_000)).toBeGreaterThan(encodeDailyScore('2026-10-06', 1000));
  });

  it('event: solved × 1 000 000 + (999 999 − total secs); more solved > fewer, then less time', () => {
    const s = encodeEventScore(13, 3_600_500);
    expect(s).toBe(13_000_000 + (999_999 - 3601));
    expect(decodeScore('event_lantern_walk_2026', s)).toEqual({ kind: 'event', solved: 13, totalSecs: 3601 });
    expect(encodeEventScore(14, 999_999_000)).toBeGreaterThan(encodeEventScore(13, 0));
    expect(encodeEventScore(13, 1000)).toBeGreaterThan(encodeEventScore(13, 2000));
    expect(encodeEventScore(13, 5_000_000_000)).toBe(13_000_000); // capped
  });

  it('the retired paw_points has no score format of its own any more (I-3): no "points" decoding', () => {
    // Nothing submits or reads it after 2c; every live board decodes to period, time or event.
    for (const board of ['period_points', 'daily_fastest', 'event_snow_paws_2026'] as const) {
      expect(['period', 'time', 'event']).toContain(decodeScore(board, 1240).kind);
    }
    expect(boardFormat('paw_points')).not.toBe('points');
  });

  it('boardFormat by key', () => {
    expect(boardFormat('period_points')).toBe('period');
    expect(boardFormat('daily_fastest')).toBe('time');
    expect(boardFormat('event_snow_paws_2026')).toBe('event');
  });

  it('every encoded score is a non-negative integer < 2³¹', () => {
    const scores = [
      encodePeriodScore('2026-10-05', 99_999),
      encodeDailyScore('2028-12-31', 0),
      encodeDailyScore('2026-01-01', 99_999_999),
      encodeEventScore(1000, 0),
      encodeEventScore(21, 123_456_789),
    ];
    for (const s of scores) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(MAX31);
    }
  });
});

describe('canSubmit (§5.3 sanity limits)', () => {
  const NOW = 1_800_000_000_000;
  it('too fast under 3 s, too slow over 24 h, otherwise once per 10 s', () => {
    expect(canSubmit(2999, NOW, 0)).toBe('too_fast');
    expect(canSubmit(3000, NOW, 0)).toBe('ok');
    expect(canSubmit(86_400_001, NOW, 0)).toBe('too_slow');
    expect(canSubmit(60_000, NOW, NOW - 9_999)).toBe('wait');
    expect(canSubmit(60_000, NOW, NOW - 10_000)).toBe('ok');
  });

  it('a submit time in the future (clock went back) never blocks', () => {
    expect(canSubmit(60_000, NOW, NOW + 5_000)).toBe('ok');
  });
});
