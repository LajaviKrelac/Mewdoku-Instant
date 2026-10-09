// Owner: C. Paw points and board scores (phase2b §5.3): the points table (every result a multiple of
// 5), encode/decode round trips, ordering properties (faster = higher, newer day > older day, more
// solved > fewer), the client-side submit limits, and every encoded score < 2³¹.
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import {
  addPoints,
  boardFormat,
  canSubmit,
  dayIndex,
  decodeScore,
  encodeDailyScore,
  encodeEventScore,
  encodePointsScore,
  pointsFor,
  type PointsInput,
} from '../../../src/game/scoring';

const base: PointsInput = { mode: 'level', n: 8, hard: false, mistakes: 0, revivesUsed: 0, hintsUsed: 0, kittiesUsed: 0, tutorial: false };
const MAX31 = 2 ** 31;

describe('pointsFor (§5.3)', () => {
  it('the spec examples: 8×8 with 1 mistake and 1 hint = 40; 10×10 Hard, flawless, unaided = 120', () => {
    expect(pointsFor({ ...base, mistakes: 1, hintsUsed: 1 })).toBe(40);
    expect(pointsFor({ ...base, n: 10, hard: true })).toBe(120);
  });

  it('each part of the table', () => {
    const plain = { ...base, mistakes: 1, kittiesUsed: 1 };
    expect(pointsFor(plain)).toBe(40); // base 5 × 8
    expect(pointsFor({ ...plain, mistakes: 0 })).toBe(50); // + flawless
    expect(pointsFor({ ...plain, mistakes: 0, revivesUsed: 1 })).toBe(40); // a revive is not flawless
    expect(pointsFor({ ...plain, kittiesUsed: 0 })).toBe(50); // + unaided
    expect(pointsFor({ ...plain, mode: 'daily' })).toBe(55); // + daily
    expect(pointsFor({ ...plain, mode: 'event' })).toBe(45); // + event
    expect(pointsFor({ ...plain, hard: true })).toBe(80); // base × 2
    expect(pointsFor({ ...base, mode: 'tutorial', tutorial: true })).toBe(0);
    expect(pointsFor({ ...base, tutorial: true })).toBe(0);
  });

  it('every result is a multiple of 5 (n 4…12, all flag combinations, every mode)', () => {
    for (let n = 4; n <= 12; n++) {
      for (const mode of ['level', 'daily', 'event'] as const) {
        for (let mask = 0; mask < 16; mask++) {
          const p = pointsFor({
            ...base,
            mode,
            n,
            hard: (mask & 1) !== 0,
            mistakes: mask & 2 ? 2 : 0,
            hintsUsed: mask & 4 ? 1 : 0,
            revivesUsed: mask & 8 ? 1 : 0,
          });
          expect(p % 5).toBe(0);
          expect(p).toBeGreaterThan(0);
        }
      }
    }
  });

  it('addPoints is capped at points.max and never negative', () => {
    expect(addPoints(100, 55)).toBe(155);
    expect(addPoints(cfg.points.max - 5, 55)).toBe(cfg.points.max);
    expect(addPoints(10, -50)).toBe(10);
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

  it('points: the total, capped; decode is the identity', () => {
    expect(encodePointsScore(1240)).toBe(1240);
    expect(encodePointsScore(5e12)).toBe(cfg.points.max);
    expect(decodeScore('paw_points', 1240)).toEqual({ kind: 'points', points: 1240 });
  });

  it('boardFormat by key', () => {
    expect(boardFormat('paw_points')).toBe('points');
    expect(boardFormat('daily_fastest')).toBe('time');
    expect(boardFormat('event_snow_paws_2026')).toBe('event');
  });

  it('every encoded score is a non-negative integer < 2³¹', () => {
    const scores = [
      encodePointsScore(cfg.points.max),
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
