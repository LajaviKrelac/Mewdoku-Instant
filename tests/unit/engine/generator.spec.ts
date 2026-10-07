// Owner: engine
// 03 §4 / §8.3 / §11.1 generator: king permutations, region growth, uniqueness repair and
// generate(spec): unique output, planted = solver solution, connected n regions, filters respected,
// byte-identical per seed, sizePool first draw (02 §11.4).
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { canonicalLabels, decodeRegions, decodeSolution, isConnectedPartition, isKingPermutation } from '../../../src/engine/codec';
import { canonicalKey, regionSizes, shapeOk } from '../../../src/engine/filters';
import {
  GEN_DEFAULTS,
  generate,
  growRegions,
  randomKingPerm,
  regionConnectedWithout,
  repairUnique,
} from '../../../src/engine/generator';
import { grade } from '../../../src/engine/grader';
import { makeRng } from '../../../src/engine/rng';
import { countSolutions } from '../../../src/engine/solver';
import { bruteForceCount } from '../../../src/engine/solver-oracle';
import type { GenSpec } from '../../../src/engine/types';
import { ENDLESS_ROW, pickWeighted } from '../../../src/game/ramp';
import { ALL_SIZES, isSolution, scaled } from './helpers';

const spec = (over: Partial<GenSpec> & Pick<GenSpec, 'n' | 'seed'>): GenSpec => ({
  gradeBand: [1, 5],
  allowG5Steps: 1,
  minRegion: over.n >= 6 ? 2 : 1,
  maxRegion: Math.ceil(2.5 * over.n),
  growth: 'mixed',
  maxAttempts: 5000,
  ...over,
});

describe('GEN_DEFAULTS', () => {
  it('mirrors app/config.ts cfg.gen (the engine may not import app/)', () => {
    expect(GEN_DEFAULTS.edenOneIn).toBe(cfg.gen.edenOneIn);
    expect(GEN_DEFAULTS.repairMaxIter).toBe(cfg.gen.repairMaxIter);
    expect(GEN_DEFAULTS.minRegionFromN).toBe(cfg.gen.minRegionFromN);
    expect(GEN_DEFAULTS.maxRegionFactorX2).toBe(cfg.gen.maxRegionFactor * 2);
  });
});

describe('randomKingPerm (03 §4.2)', () => {
  it('always returns a king permutation for N = 4–12', () => {
    const rng = makeRng('test:king');
    for (let t = 0; t < 900; t++) {
      const n = 4 + (t % 9);
      const p = randomKingPerm(n, rng);
      expect(isKingPermutation(p, n)).toBe(true);
    }
  });

  it('reaches both 4×4 placements and many 8×8 ones', () => {
    const rng = makeRng('test:king-variety');
    const four = new Set<string>();
    const eight = new Set<string>();
    for (let t = 0; t < 400; t++) {
      four.add(randomKingPerm(4, rng).join(''));
      eight.add(randomKingPerm(8, rng).join(''));
    }
    expect([...four].sort()).toEqual(['1302', '2031']);
    expect(eight.size).toBeGreaterThan(300);
  });

  it('throws when no placement exists (N = 2, 3)', () => {
    const rng = makeRng('test:king-none');
    expect(() => randomKingPerm(2, rng)).toThrow(RangeError);
    expect(() => randomKingPerm(3, rng)).toThrow(RangeError);
  });
});

describe('growRegions (03 §4.3)', () => {
  it('assigns every cell, keeps n connected regions and seeds region r at row r’s cat', () => {
    const rng = makeRng('test:grow');
    for (let t = 0; t < 400; t++) {
      const n = 4 + (t % 9);
      const perm = randomKingPerm(n, rng);
      const mode = t % 2 === 0 ? 'eden' : 'balanced';
      const regions = growRegions(n, perm, rng, mode);
      expect(isConnectedPartition(n, regions)).toBe(true);
      for (let r = 0; r < n; r++) expect(regions[r * n + (perm[r] as number)]).toBe(r);
      // The planted placement is a solution of the grown map.
      expect(isSolution(n, regions, perm)).toBe(true);
      expect(countSolutions(n, regions, 1).count).toBe(1);
    }
  });

  it('is deterministic per stream', () => {
    const run = (): string => {
      const rng = makeRng('test:grow-det');
      const out: string[] = [];
      for (let t = 0; t < 20; t++) {
        const perm = randomKingPerm(9, rng);
        out.push(growRegions(9, perm, rng, t % 2 ? 'eden' : 'balanced').join(''));
      }
      return out.join('|');
    };
    expect(run()).toBe(run());
  });

  it('balanced growth gives more even sizes than eden (03 §4.3 measurements)', () => {
    const rng = makeRng('test:grow-balance');
    const stats = { eden: { min: 0, max: 0 }, balanced: { min: 0, max: 0 } };
    for (let t = 0; t < 200; t++) {
      for (const mode of ['eden', 'balanced'] as const) {
        const perm = randomKingPerm(10, rng);
        const sizes = regionSizes(10, growRegions(10, perm, rng, mode));
        stats[mode].min += Math.min(...sizes);
        stats[mode].max += Math.max(...sizes);
      }
    }
    expect(stats.balanced.min).toBeGreaterThan(stats.eden.min);
    expect(stats.balanced.max).toBeLessThan(stats.eden.max);
  });
});

describe('regionConnectedWithout', () => {
  it('detects cut cells and the last cell of a region', () => {
    const regions = decodeRegions('AAABCCDBBCCDDDDD', 4); // A is a 3-cell bar in row 0
    expect(regionConnectedWithout(4, regions, 0, 1)).toBe(false); // the middle cell cuts A
    expect(regionConnectedWithout(4, regions, 0, 0)).toBe(true);
    expect(regionConnectedWithout(4, regions, 0, 2)).toBe(true);
    const single = decodeRegions('ABCCAACCADDCDDDD', 4); // B is a single cell
    expect(regionConnectedWithout(4, single, 1, 1)).toBe(false);
  });
});

describe('repairUnique (03 §4.4)', () => {
  it('yields a unique, connected map whose solution is the planted one', () => {
    const rng = makeRng('test:repair');
    let ok = 0;
    const total = scaled(240);
    for (let t = 0; t < total; t++) {
      const n = ALL_SIZES[t % ALL_SIZES.length] as number;
      const perm = randomKingPerm(n, rng);
      const regions = growRegions(n, perm, rng, t % 4 === 0 ? 'eden' : 'balanced');
      if (!repairUnique(n, regions, perm, rng)) continue;
      ok++;
      expect(isConnectedPartition(n, regions)).toBe(true);
      const res = countSolutions(n, regions);
      expect(res.count).toBe(1);
      expect(res.solutions[0]).toEqual(perm);
      if (n <= 8) expect(bruteForceCount(n, regions, 2)).toBe(1);
    }
    expect(ok).toBeGreaterThan(total / 3);
  }, 120_000);

  it('returns true at once for an already unique map, without changing it', () => {
    const regions = decodeRegions('ABCCAACCADDCDDDD', 4);
    const before = regions.join('');
    expect(repairUnique(4, regions, decodeSolution('1302', 4), makeRng('x'))).toBe(true);
    expect(regions.join('')).toBe(before);
  });

  it('gives up (false) when the iteration cap is 0', () => {
    const rng = makeRng('test:repair-cap');
    const perm = randomKingPerm(9, rng);
    const regions = growRegions(9, perm, rng, 'balanced');
    expect(repairUnique(9, regions, perm, rng, 0)).toBe(false);
  });
});

describe('generate (03 §8.3)', () => {
  const specs: GenSpec[] = [];
  for (let i = 0; i < scaled(24); i++) {
    const n = ALL_SIZES[i % ALL_SIZES.length] as number;
    const bands: GenSpec['gradeBand'][] = [[1, 3], [3, 4], [2, 5]];
    specs.push(spec({ n, seed: `test:gen:${i}`, gradeBand: bands[i % 3] as GenSpec['gradeBand'], allowG5Steps: i % 3 === 2 ? 1 : 0 }));
  }

  it('accepted records are unique, planted, connected, filtered and inside the band', () => {
    for (const s of specs) {
      const res = generate(s);
      if (!res.ok) throw new Error(`no puzzle for ${s.seed}`);
      const { record } = res;
      const n = record.n;
      expect(n).toBe(s.n);
      expect(record).not.toHaveProperty('i');
      expect(record.h).toBe(0);
      const regions = decodeRegions(record.r, n);
      const sol = decodeSolution(record.s, n);
      expect(regions).toEqual(canonicalLabels(regions));
      expect(isConnectedPartition(n, regions)).toBe(true);
      expect(isKingPermutation(sol, n)).toBe(true);
      const solved = countSolutions(n, regions);
      expect(solved.count).toBe(1);
      expect(solved.solutions[0]).toEqual(sol);
      expect(shapeOk(n, regions, s)).toBe(true);
      expect(record.g).toBeGreaterThanOrEqual(s.gradeBand[0]);
      expect(record.g).toBeLessThanOrEqual(s.gradeBand[1]);
      // The stored grade and effort are the canonical-label grade (what CI re-runs, 03 §11.2).
      const g = grade(n, regions);
      expect(g).toEqual(res.grade);
      expect([g.grade, g.effort]).toEqual([record.g, record.e]);
      if (g.grade === 5) expect(g.counts[5]).toBeLessThanOrEqual(s.allowG5Steps);
      expect(res.attempts).toBeGreaterThanOrEqual(1);
    }
  }, 120_000);

  it('is byte-identical for the same spec and differs across seeds', () => {
    for (const s of specs.slice(0, 8)) {
      expect(JSON.stringify(generate(s))).toBe(JSON.stringify(generate({ ...s })));
    }
    const a = generate(spec({ n: 8, seed: 'test:gen-a' }));
    const b = generate(spec({ n: 8, seed: 'test:gen-b' }));
    expect(a.ok && b.ok && a.record.r !== b.record.r).toBe(true);
  }, 60_000);

  it('G5 needs allowG5Steps = 1 and then uses at most one trial step', () => {
    const band = (i: number): GenSpec => spec({ n: 9, seed: `test:g5:${i}`, gradeBand: [5, 5], allowG5Steps: 1 });
    for (let i = 0; i < 3; i++) {
      const res = generate(band(i));
      expect(res.ok).toBe(true);
      if (res.ok) expect([res.grade.grade, res.grade.counts[5]]).toEqual([5, 1]);
    }
    const none = generate(spec({ n: 7, seed: 'test:g5-none', gradeBand: [5, 5], allowG5Steps: 0, maxAttempts: 40 }));
    expect(none).toEqual({ ok: false, attempts: 40, reason: 'max_attempts' });
  }, 60_000);

  it('reports max_attempts when the filters cannot be met', () => {
    const res = generate(spec({ n: 6, seed: 'test:impossible', minRegion: 7, maxRegion: 36, maxAttempts: 5 }));
    expect(res).toEqual({ ok: false, attempts: 5, reason: 'max_attempts' });
  });

  it('a duplicate key in opts.seen is skipped and the same stream continues', () => {
    const s = spec({ n: 7, seed: 'test:seen' });
    const first = generate(s);
    if (!first.ok) throw new Error('no puzzle');
    const key = canonicalKey(7, decodeRegions(first.record.r, 7));
    const second = generate(s, { seen: new Set([key]) });
    if (!second.ok) throw new Error('no second puzzle');
    expect(second.record.r).not.toBe(first.record.r);
    expect(second.attempts).toBeGreaterThan(first.attempts);
    expect(canonicalKey(7, decodeRegions(second.record.r, 7))).not.toBe(key);
  });

  it('sizePool: the first draw on the seed stream picks n (02 §11.4)', () => {
    for (let L = 1001; L <= 1012; L++) {
      const seed = `mewdoku:level:v1:${L}`;
      const want = pickWeighted(ENDLESS_ROW.sizes, (k) => makeRng(seed).int(k));
      const res = generate({ ...spec({ n: 0, seed, gradeBand: [3, 4], allowG5Steps: 0 }), minRegion: 2, sizePool: ENDLESS_ROW.sizes });
      if (!res.ok) throw new Error(`no puzzle for L${L}`);
      expect(res.record.n).toBe(want);
      const regions = decodeRegions(res.record.r, want);
      // Without sizeLimits: minRegion from n ≥ 6, maxRegion ⌈2.5 n⌉.
      expect(shapeOk(want, regions, { minRegion: 2, maxRegion: Math.ceil(2.5 * want) })).toBe(true);
    }
  }, 120_000);

  it('sizePool honours per-size sizeLimits rows', () => {
    const s: GenSpec = {
      ...spec({ n: 0, seed: 'test:limits' }),
      sizePool: [[7, 1]],
      sizeLimits: [[7, 3, 12]],
    };
    const res = generate(s);
    if (!res.ok) throw new Error('no puzzle');
    const sizes = regionSizes(7, decodeRegions(res.record.r, 7));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(12);
  }, 60_000);

  it('rejects board sizes outside 4..12', () => {
    expect(() => generate(spec({ n: 3, seed: 'x' }))).toThrow(RangeError);
    expect(() => generate(spec({ n: 13, seed: 'x' }))).toThrow(RangeError);
    expect(() => generate({ ...spec({ n: 0, seed: 'x' }) })).toThrow(RangeError);
  });
});
