// Owner: read-only (Phase 2b; was engine)
// 03 §3 / §11.1 solver: Solver B (countSolutions) against brute force on 2 000 random maps
// (N = 4–8, exact counts) and against Solver A on 1 000 maps (N = 5–12); known fixtures.
import { describe, expect, it } from 'vitest';
import { decodeRegions, isKingPermutation } from '../../../src/engine/codec';
import { makeRng } from '../../../src/engine/rng';
import { countSolutions } from '../../../src/engine/solver';
import { bruteForceCount, solveRows } from '../../../src/engine/solver-oracle';
import {
  ALL_SIZES,
  FOURTEEN,
  isSolution,
  plantedMap,
  regionFirstMap,
  scaled,
  TUTORIAL,
  uniquePuzzles,
} from './helpers';

const ALL = Number.MAX_SAFE_INTEGER;
const key = (sols: readonly Uint8Array[]): string => sols.map((s) => s.join(',')).sort().join('|');

describe('fixtures', () => {
  it('the tutorial board has exactly one solution, 1302 (02 §11.5)', () => {
    const regions = decodeRegions(TUTORIAL.r, 4);
    const res = countSolutions(4, regions);
    expect(res.count).toBe(1);
    expect(res.solutions.map((s) => s.join(''))).toEqual(['1302']);
    expect(bruteForceCount(4, regions)).toBe(1);
    expect(solveRows(4, regions).count).toBe(1);
  });

  it('our 6×6 board has exactly 14 solutions', () => {
    const regions = decodeRegions(FOURTEEN.r, 6);
    const all = countSolutions(6, regions, ALL);
    expect(all.solutions).toHaveLength(FOURTEEN.count);
    expect(all.count).toBe(2); // count is capped at 2 (SolveResult type)
    expect(new Set(all.solutions.map((s) => s.join(''))).size).toBe(14);
    for (const s of all.solutions) expect(isSolution(6, regions, s)).toBe(true);
    expect(bruteForceCount(6, regions)).toBe(14);
    expect(key(solveRows(6, regions, ALL).solutions)).toBe(key(all.solutions));
  });

  it('a board where one region spans everything else has no solution', () => {
    // Regions B, C, D are single cells in a row: three cats in one row are impossible.
    const regions = decodeRegions('ABCDAAAAAAAAAAAA', 4);
    expect(countSolutions(4, regions).count).toBe(0);
    expect(bruteForceCount(4, regions)).toBe(0);
  });
});

describe('countSolutions contract', () => {
  it('stops at `limit`: count is min(found, 2), solutions.length ≤ limit', () => {
    const regions = decodeRegions(FOURTEEN.r, 6);
    for (const limit of [0, 1, 2, 3, 13, 14, 15]) {
      const res = countSolutions(6, regions, limit);
      expect(res.solutions).toHaveLength(Math.min(limit, 14));
      expect(res.count).toBe(Math.min(limit, 14, 2));
    }
    const first = countSolutions(6, regions, 1);
    expect(first.nodes).toBeGreaterThan(0);
    expect(first.nodes).toBeLessThan(countSolutions(6, regions, ALL).nodes);
  });

  it('rejects a wrong cell count or an out-of-range label', () => {
    expect(() => countSolutions(4, new Uint8Array(15))).toThrow(RangeError);
    expect(() => countSolutions(4, decodeRegions('ABCCAACCADDCDDDD', 4).map((g) => (g === 3 ? 7 : g)))).toThrow(
      RangeError,
    );
  });

  it('is deterministic (same solutions in the same order)', () => {
    const rng = makeRng('test:solver-det');
    for (let t = 0; t < 50; t++) {
      const { regions } = plantedMap(5 + (t % 8), rng);
      const n = Math.round(Math.sqrt(regions.length));
      const a = countSolutions(n, regions, 5);
      const b = countSolutions(n, regions, 5);
      expect(b.nodes).toBe(a.nodes);
      expect(b.solutions).toEqual(a.solutions);
    }
  });
});

describe('Solver B vs oracles', () => {
  it(`equals brute force (exact counts and solution sets) on ${scaled(2000)} random maps, N = 4–8`, () => {
    const rng = makeRng('test:solver-vs-brute');
    const total = scaled(2000);
    const hist = { zero: 0, one: 0, many: 0 };
    for (let t = 0; t < total; t++) {
      const n = 4 + (t % 5);
      // Alternate planted maps (≥ 1 solution) and region-first maps (often 0 solutions).
      const regions = t % 2 === 0 ? plantedMap(n, rng).regions : regionFirstMap(n, rng);
      const b = countSolutions(n, regions, ALL);
      const brute = bruteForceCount(n, regions);
      if (b.solutions.length !== brute) expect({ t, n, b: b.solutions.length }).toEqual({ t, n, b: brute });
      const a = solveRows(n, regions, ALL);
      if (key(a.solutions) !== key(b.solutions)) expect(key(b.solutions)).toBe(key(a.solutions));
      for (const s of b.solutions) {
        if (!isSolution(n, regions, s) || !isKingPermutation(s, n)) throw new Error(`invalid solution ${s.join('')}`);
      }
      // The limit-2 answer used in production agrees with the exact count.
      expect(countSolutions(n, regions).count).toBe(Math.min(brute, 2));
      if (brute === 0) hist.zero++;
      else if (brute === 1) hist.one++;
      else hist.many++;
    }
    // The sample really covers all three outcomes.
    expect(hist.zero).toBeGreaterThan(total / 20);
    expect(hist.one).toBeGreaterThan(total / 50);
    expect(hist.many).toBeGreaterThan(total / 20);
  }, 120_000);

  it(`equals Solver A on ${scaled(1000)} maps, N = 5–12 (limit 2)`, () => {
    const rng = makeRng('test:solver-vs-rows');
    const total = scaled(1000);
    for (let t = 0; t < total; t++) {
      const n = ALL_SIZES[t % ALL_SIZES.length] as number;
      const regions = t % 3 === 2 ? regionFirstMap(n, rng) : plantedMap(n, rng).regions;
      const a = solveRows(n, regions, 2);
      const b = countSolutions(n, regions, 2);
      if (a.count !== b.count) expect({ t, n, count: b.count }).toEqual({ t, n, count: a.count });
      if (b.count === 1) expect(b.solutions[0]).toEqual(a.solutions[0]);
      for (const s of b.solutions) expect(isSolution(n, regions, s)).toBe(true);
    }
  }, 120_000);

  it(`agrees with Solver A on ${scaled(200)} generated unique puzzles, N = 5–12`, () => {
    for (const p of uniquePuzzles('test:solver-unique', scaled(200), ALL_SIZES)) {
      const b = countSolutions(p.n, p.regions);
      const a = solveRows(p.n, p.regions);
      expect(b.count).toBe(1);
      expect(a.count).toBe(1);
      expect(b.solutions[0]).toEqual(p.solution);
      expect(a.solutions[0]).toEqual(p.solution);
      if (p.n <= 9) expect(bruteForceCount(p.n, p.regions, 2)).toBe(1);
    }
  }, 120_000);
});
