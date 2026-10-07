// Owner: engine
// 03 §9 / §11.1 codec and validate: round trip on 10 000 generated records, structural validation
// (03 §9.4) rejects malformed records, connectivity detection on hand-crafted disconnected maps.
import { describe, expect, it } from 'vitest';
import {
  canonicalLabels,
  checkRecord,
  decodeGivens,
  decodeRegions,
  decodeSolution,
  encodeRegions,
  encodeSolution,
  isConnectedPartition,
  isDailyPack,
  isKingPermutation,
  isLevelPack,
  puzzleToRecord,
  recordToPuzzle,
} from '../../../src/engine/codec';
import { makeRng } from '../../../src/engine/rng';
import type { LevelRecord, Puzzle } from '../../../src/engine/types';
import { plantedMap, scaled, TUTORIAL } from './helpers';

const TUT_RECORD: LevelRecord = { i: 1, n: 4, r: TUTORIAL.r, s: TUTORIAL.s, g: 1, e: 8, h: 0, gv: '', tut: 1 };

const map = (rows: string[]): Uint8Array => Uint8Array.from(rows.join(''), (ch) => ch.charCodeAt(0) - 65);

describe('labels and strings', () => {
  it('canonicalLabels numbers regions by first appearance and is idempotent', () => {
    const raw = Uint8Array.from([3, 3, 1, 0, 3, 1, 2, 0, 2]);
    const canon = canonicalLabels(raw);
    expect(Array.from(canon)).toEqual([0, 0, 1, 2, 0, 1, 3, 2, 3]);
    expect(canonicalLabels(canon)).toEqual(canon);
    expect(canon).not.toBe(raw);
  });

  it('encodeRegions canonicalises; decodeRegions inverts it', () => {
    expect(encodeRegions(Uint8Array.from([2, 2, 0, 1]))).toBe('AABC');
    expect(Array.from(decodeRegions('ABCCAACCADDCDDDD', 4))).toEqual([0, 1, 2, 2, 0, 0, 2, 2, 0, 3, 3, 2, 3, 3, 3, 3]);
    expect(() => decodeRegions('ABC', 4)).toThrow(RangeError);
    expect(() => decodeRegions('ABCCAACCADDCDDDE', 4)).toThrow(RangeError); // E ≥ n
    expect(() => decodeRegions('ABCCAACCADDCDDDa', 4)).toThrow(RangeError);
  });

  it('solutions are n base-36 digits', () => {
    expect(encodeSolution(Uint8Array.from([10, 0, 11, 1]))).toBe('a0b1');
    const twelve = Uint8Array.from([0, 2, 4, 6, 8, 10, 1, 3, 5, 7, 9, 11]);
    expect(encodeSolution(twelve)).toBe('02468a13579b');
    expect(decodeSolution('02468a13579b', 12)).toEqual(twelve);
    expect(Array.from(decodeSolution('1302', 4))).toEqual([1, 3, 0, 2]);
    expect(() => decodeSolution('130', 4)).toThrow(RangeError);
    expect(() => decodeSolution('1304', 4)).toThrow(RangeError); // digit ≥ n
    expect(() => decodeSolution('13A2', 4)).toThrow(RangeError); // upper case is not base-36 here
  });

  it('givens are base-36 row indices', () => {
    expect(decodeGivens(undefined)).toEqual([]);
    expect(decodeGivens('')).toEqual([]);
    expect(decodeGivens('03b')).toEqual([0, 3, 11]);
    expect(() => decodeGivens('0-')).toThrow(RangeError);
  });

  it('isKingPermutation checks columns and the no-touch rule', () => {
    expect(isKingPermutation(Uint8Array.from([1, 3, 0, 2]), 4)).toBe(true);
    expect(isKingPermutation(Uint8Array.from([0, 1, 3, 2]), 4)).toBe(false); // diagonal touch
    expect(isKingPermutation(Uint8Array.from([1, 3, 1, 3]), 4)).toBe(false); // repeated column
    expect(isKingPermutation(Uint8Array.from([1, 3, 0]), 4)).toBe(false); // wrong length
    expect(isKingPermutation(Uint8Array.from([1, 3, 0, 4]), 4)).toBe(false); // column ≥ n
  });
});

describe('isConnectedPartition (validate)', () => {
  it('accepts connected maps, including the tutorial and snake-shaped regions', () => {
    expect(isConnectedPartition(4, decodeRegions(TUTORIAL.r, 4))).toBe(true);
    expect(isConnectedPartition(4, map(['AAAA', 'BBBA', 'CCBA', 'DCBA']))).toBe(true);
    expect(isConnectedPartition(5, map(['AAAAA', 'BBBBA', 'BCCCC', 'BCDDD', 'BCDEE']))).toBe(true);
  });

  it('rejects hand-crafted disconnected maps', () => {
    // A split by B in the same row.
    expect(isConnectedPartition(4, map(['ABAC', 'BBCC', 'DDDD', 'DDDD']))).toBe(false);
    // Diagonal contact only: two A cells touching at a corner.
    expect(isConnectedPartition(4, map(['ABCC', 'BACC', 'DDDD', 'DDDD']))).toBe(false);
    // A region whose second component is far away (bottom-right).
    expect(isConnectedPartition(4, map(['AABB', 'CCBB', 'CDDD', 'CDDA']))).toBe(false);
    // Wrap-around is not adjacency: A at the end of row 0 and the start of row 1.
    expect(isConnectedPartition(4, map(['BBBA', 'ACCC', 'DDDD', 'DDDD']))).toBe(false);
  });

  it('rejects missing labels, out-of-range labels and wrong lengths', () => {
    expect(isConnectedPartition(4, map(['AAAA', 'BBBB', 'CCCC', 'CCCC']))).toBe(false); // no D
    expect(isConnectedPartition(4, map(['AAAA', 'BBBB', 'CCCC', 'DDDE']))).toBe(false); // E ≥ n
    expect(isConnectedPartition(4, new Uint8Array(15))).toBe(false);
  });
});

describe('checkRecord (03 §9.4)', () => {
  it('accepts the tutorial record and decodes it', () => {
    expect(checkRecord(TUT_RECORD)).toEqual({ ok: true });
    const p = recordToPuzzle(TUT_RECORD, 'T1');
    expect(p).toMatchObject({ id: 'T1', n: 4, k: 1, grade: 1, effort: 8, hard: false, givens: [] });
    expect(Array.from(p.solution)).toEqual([1, 3, 0, 2]);
  });

  const base = { n: 4, r: TUTORIAL.r, s: TUTORIAL.s, g: 1, e: 8, h: 0 };
  const bad: [string, unknown][] = [
    ['not an object', null],
    ['an array', [base]],
    ['n too small', { ...base, n: 3 }],
    ['n too large', { ...base, n: 13 }],
    ['n not an integer', { ...base, n: 4.5 }],
    ['r too short', { ...base, r: TUTORIAL.r.slice(1) }],
    ['r not a string', { ...base, r: 7 }],
    ['s too long', { ...base, s: '13020' }],
    ['bad region letter', { ...base, r: 'ABCCAACCADDCDDDx' }],
    ['label ≥ n', { ...base, r: 'ABCCAACCADDCDDDE' }],
    ['labels do not cover A..D', { ...base, r: 'ABCCAACCACCCCCCC' }],
    ['labels not canonical', { ...base, r: 'BACCBBCCBDDCDDDD' }],
    ['disconnected region', { ...base, r: 'ABCAAACCADDCDDDD' }],
    ['s with a bad digit', { ...base, s: '13z2' }],
    ['s repeats a column', { ...base, s: '1313' }],
    ['s has touching cats', { ...base, s: '0213' }],
    ['cats share a region', { ...base, s: '2031' }],
    ['g out of range', { ...base, g: 6 }],
    ['g missing', { ...base, g: undefined }],
    ['e negative', { ...base, e: -1 }],
    ['e fractional', { ...base, e: 1.5 }],
    ['h not 0/1', { ...base, h: 2 }],
    ['tut not 0/1', { ...base, tut: 2 }],
    ['i not a positive integer', { ...base, i: 0 }],
    ['gv not a string', { ...base, gv: 3 }],
    ['gv row ≥ n', { ...base, gv: '4' }],
    ['gv repeats a row', { ...base, gv: '11' }],
    ['gv bad digit', { ...base, gv: '-' }],
  ];
  it.each(bad)('rejects: %s', (_label, rec) => {
    const res = checkRecord(rec);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason.length).toBeGreaterThan(0);
  });

  it('the "cats share a region" case is a real king permutation (only the region rule fails)', () => {
    expect(isKingPermutation(decodeSolution('2031', 4), 4)).toBe(true);
  });

  it('recordToPuzzle throws on a malformed record', () => {
    expect(() => recordToPuzzle({ ...TUT_RECORD, s: '1313' }, 'L5')).toThrow(/L5/);
  });
});

describe('round trip', () => {
  it(`LevelRecord ⇄ Puzzle on ${scaled(10_000)} generated records`, () => {
    const rng = makeRng('test:codec-roundtrip');
    const total = scaled(10_000);
    for (let t = 0; t < total; t++) {
      const n = 4 + (t % 9);
      const { regions, perm } = plantedMap(n, rng);
      const givens: number[] = [];
      for (let r = 0; r < n; r++) if (rng.int(8) === 0) givens.push(r);
      const p: Puzzle = {
        id: `L${t + 2}`,
        n,
        k: 1,
        regions,
        solution: perm,
        givens,
        grade: (1 + rng.int(5)) as Puzzle['grade'],
        effort: rng.int(500),
        hard: rng.int(2) === 1,
      };
      const rec = puzzleToRecord(p, t + 2);
      const json = JSON.parse(JSON.stringify(rec)) as unknown;
      const check = checkRecord(json);
      if (!check.ok) throw new Error(`record ${t}: ${check.reason}`);
      const back = recordToPuzzle(json as LevelRecord, p.id);
      const same =
        back.id === p.id &&
        back.n === n &&
        back.k === 1 &&
        back.grade === p.grade &&
        back.effort === p.effort &&
        back.hard === p.hard &&
        back.regions.join() === p.regions.join() &&
        back.solution.join() === p.solution.join() &&
        back.givens.join() === givens.join() &&
        JSON.stringify(puzzleToRecord(back, t + 2)) === JSON.stringify(rec) &&
        rec.i === t + 2 &&
        rec.r.length === n * n &&
        rec.s.length === n;
      if (!same) expect({ back, rec }).toEqual({ back: p, rec: puzzleToRecord(p, t + 2) });
    }
  }, 60_000);

  it('daily records omit i; givens are omitted when empty', () => {
    const p = recordToPuzzle(TUT_RECORD, 'D2026-10-06');
    const rec = puzzleToRecord(p);
    expect(rec).not.toHaveProperty('i');
    expect(rec).not.toHaveProperty('gv');
    expect(rec).toEqual({ n: 4, r: TUTORIAL.r, s: TUTORIAL.s, g: 1, e: 8, h: 0 });
  });
});

describe('containers', () => {
  it('isLevelPack / isDailyPack check the 03 §9.2 shape', () => {
    const lp = { v: 1, kind: 'levels', first: 1, count: 1, gen: 'x', levels: [TUT_RECORD] };
    const dp = { v: 1, kind: 'daily', month: '2026-10', gen: 'x', days: { '2026-10-06': TUT_RECORD } };
    expect(isLevelPack(lp)).toBe(true);
    expect(isDailyPack(dp)).toBe(true);
    expect(isLevelPack(dp)).toBe(false);
    expect(isDailyPack(lp)).toBe(false);
    expect(isLevelPack({ ...lp, v: 2 })).toBe(false);
    expect(isLevelPack({ ...lp, levels: {} })).toBe(false);
    expect(isDailyPack({ ...dp, days: [] })).toBe(false);
    expect(isLevelPack(null)).toBe(false);
    expect(isDailyPack('pack')).toBe(false);
  });
});
