// Owner: read-only (Phase 2b; was engine)
// Performance smoke (03 §10) for N = 5–12 with generous bounds: catches order-of-magnitude
// regressions (e.g. an exponential solver) without flaking on a busy CI machine. The real numbers
// are benchmarked outside the test run and reported in docs (03 §11.4).
import { describe, expect, it } from 'vitest';
import { decodeRegions, decodeSolution } from '../../../src/engine/codec';
import { generate } from '../../../src/engine/generator';
import { grade } from '../../../src/engine/grader';
import { getHintStep } from '../../../src/engine/hint';
import { makeRng } from '../../../src/engine/rng';
import { countSolutions } from '../../../src/engine/solver';
import { CellState } from '../../../src/engine/types';
import { makePuzzle } from './helpers';

/** Wall time of the slowest of `reps` calls. */
function worst(reps: number, fn: () => void): number {
  let max = 0;
  for (let i = 0; i < reps; i++) {
    const t = performance.now();
    fn();
    max = Math.max(max, performance.now() - t);
  }
  return max;
}

describe('perf smoke, N = 5–12', () => {
  for (let n = 5; n <= 12; n++) {
    it(`N = ${n}: generate, solve, grade and hint stay within generous bounds`, () => {
      let record = null as null | { r: string; s: string };
      const genMs = worst(1, () => {
        const res = generate({
          n,
          seed: `test:perf:${n}`,
          gradeBand: n <= 6 ? [1, 3] : [3, 4],
          allowG5Steps: 0,
          minRegion: n >= 6 ? 2 : 1,
          maxRegion: Math.ceil(2.5 * n),
          growth: 'mixed',
          maxAttempts: 5000,
        });
        if (res.ok) record = res.record;
      });
      if (record === null) throw new Error(`no puzzle at N = ${n}`);
      const { r, s } = record;
      const regions = decodeRegions(r, n);
      const p = makePuzzle(n, regions, decodeSolution(s, n));
      const solveMs = worst(5, () => countSolutions(n, regions));
      const gradeMs = worst(3, () => grade(n, regions));
      const rng = makeRng(`test:perf-hint:${n}`);
      const hintMs = worst(5, () => {
        const cells = new Uint8Array(n * n);
        for (let row = 0; row < n; row++) if (rng.int(3) === 0) cells[row * n + (p.solution[row] as number)] = CellState.Cat;
        getHintStep(p, cells);
      });
      // 03 §10 desktop targets are 2 ms (solve p99), 10 ms (grade p99), 5 ms (hint p95) and
      // 300 ms (generate average at N = 12); the bounds below are 10–50× looser on purpose.
      expect(solveMs).toBeLessThan(100);
      expect(gradeMs).toBeLessThan(500);
      expect(hintMs).toBeLessThan(250);
      expect(genMs).toBeLessThan(20_000);
    }, 60_000);
  }
});
