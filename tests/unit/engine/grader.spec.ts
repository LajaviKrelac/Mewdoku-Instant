// Owner: read-only (Phase 2b; was engine)
// 03 §5 / §11.1 grader: soundness on 2 000 generated puzzles (every elimination is a non-solution
// cell, every placement a solution cell, at every step), the result solves to the planted
// solution, grade/effort bookkeeping (03 §5.4), maxLevel tightness (03 §11.2 item 5).
import { describe, expect, it } from 'vitest';
import { decodeRegions } from '../../../src/engine/codec';
import { buildTables } from '../../../src/engine/geometry';
import { effortScore, grade, gradeKnowledge, trace } from '../../../src/engine/grader';
import { makeRng } from '../../../src/engine/rng';
import { countSolutions } from '../../../src/engine/solver';
import { createKnowledge, KnowledgeStatus } from '../../../src/engine/techniques';
import type { Grade, GradeResult, HintStep, Puzzle } from '../../../src/engine/types';
import { BULK_SIZES, plantedMap, regionFirstMap, scaled, solutionCellSet, TUTORIAL, uniquePuzzles } from './helpers';

/** Runs the full trace from an empty board and checks every step against the solution. */
function checkedTrace(p: Puzzle): { steps: HintStep[]; end: 'solved' | 'stuck'; status: Uint8Array } {
  const sol = solutionCellSet(p);
  const k = createKnowledge(buildTables(p.n, p.regions), [], []);
  const steps: HintStep[] = [];
  const it = trace(k);
  let res = it.next();
  while (!res.done) {
    const step = res.value;
    for (const x of step.effectCells) if (sol.has(x)) throw new Error(`${p.id}: ${step.kind} eliminates solution cell ${x}`);
    if (step.placeCell !== undefined && !sol.has(step.placeCell)) {
      throw new Error(`${p.id}: ${step.kind} places a cat on ${step.placeCell}`);
    }
    // A step always changes something (03 §5.2 step granularity).
    const changes = step.effectCells.some((x) => k.status[x] === KnowledgeStatus.Cand) || step.placeCell !== undefined;
    if (!changes) throw new Error(`${p.id}: ${step.kind} changes nothing`);
    steps.push(step);
    res = it.next();
  }
  return { steps, end: res.value, status: k.status };
}

/** Recomputes the GradeResult from a trace (03 §5.4). */
function fromSteps(steps: readonly HintStep[], n: number): GradeResult {
  const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  let maxK = 0;
  let extra = 0;
  for (const s of steps) {
    counts[s.level]++;
    if (s.kind === 'pigeonhole') {
      maxK = Math.max(maxK, s.k ?? 0);
      extra += (s.k ?? 2) - 2;
    }
  }
  const top = steps.reduce((m, s) => Math.max(m, s.level), 0);
  const effort = counts[1] + 3 * counts[2] + 4 * counts[3] + 8 * counts[4] + 2 * extra + 15 * counts[5] + n;
  return { grade: Math.max(1, top) as Grade, counts, pigeonMaxK: maxK, effort };
}

describe('grade() on fixtures', () => {
  it('the tutorial is G1 with four singles (02 §11.5): effort 4 + 4 = 8', () => {
    const g = grade(4, decodeRegions(TUTORIAL.r, 4));
    expect(g.grade).toBe(1);
    expect(g.counts.slice(1)).toEqual([4, 0, 0, 0, 0]);
    expect(g.effort).toBe(8);
    expect(g.pigeonMaxK).toBe(0);
  });

  it('effortScore implements 03 §5.4', () => {
    expect(effortScore([9, 1, 1, 1, 1, 1], 0, 8)).toBe(1 + 3 + 4 + 8 + 15 + 8);
    expect(effortScore([0, 5, 2, 0, 3, 0], 4, 10)).toBe(5 + 6 + 24 + 8 + 10);
  });
});

describe('soundness on generated puzzles (03 §11.1)', () => {
  const total = scaled(2000);
  const puzzles = uniquePuzzles('test:grader-sound', total, BULK_SIZES);

  it(`every step of every trace is consistent with the unique solution (${total} puzzles)`, () => {
    const hist = [0, 0, 0, 0, 0, 0, 0];
    for (const p of puzzles) {
      const { steps, end, status } = checkedTrace(p);
      const g = grade(p.n, p.regions);
      hist[g.grade] = (hist[g.grade] as number) + 1;
      // The grader never needed L6 on our puzzles (03 §5.2 measurement); the result is the solution.
      expect(end).toBe('solved');
      expect(g.grade).not.toBe(6);
      for (let r = 0; r < p.n; r++) {
        for (let c = 0; c < p.n; c++) {
          const want = p.solution[r] === c ? KnowledgeStatus.Cat : KnowledgeStatus.Elim;
          if (status[r * p.n + c] !== want) throw new Error(`${p.id}: final state differs at ${r},${c}`);
        }
      }
      // grade() is the bookkeeping of the very same trace.
      expect(g).toEqual(fromSteps(steps, p.n));
    }
    // The sample exercises every technique level.
    for (let l = 1; l <= 5; l++) expect(hist[l]).toBeGreaterThan(0);
  }, 300_000);

  it('grading is deterministic and tight: maxLevel = g solves, maxLevel = g − 1 gets stuck (03 §11.2)', () => {
    for (const p of puzzles.slice(0, scaled(400))) {
      const g = grade(p.n, p.regions);
      expect(grade(p.n, p.regions)).toEqual(g);
      if (g.grade === 6) continue;
      expect(grade(p.n, p.regions, { maxLevel: g.grade as Grade })).toEqual(g);
      if (g.grade >= 2) expect(grade(p.n, p.regions, { maxLevel: (g.grade - 1) as Grade }).grade).toBe(6);
    }
  }, 120_000);

  it('partial knowledge (some solution cats, some true eliminations) still solves to the solution', () => {
    const rng = makeRng('test:grader-partial');
    for (const p of puzzles.slice(0, scaled(300))) {
      const cats: number[] = [];
      const elims: number[] = [];
      for (let r = 0; r < p.n; r++) if (rng.int(3) === 0) cats.push(r * p.n + (p.solution[r] as number));
      for (let i = 0; i < p.n * p.n; i++) if (p.solution[Math.floor(i / p.n)] !== i % p.n && rng.int(4) === 0) elims.push(i);
      const k = createKnowledge(buildTables(p.n, p.regions), cats, elims);
      const g = gradeKnowledge(k);
      expect(g.grade).not.toBe(6);
      for (let r = 0; r < p.n; r++) expect(k.status[r * p.n + (p.solution[r] as number)]).toBe(KnowledgeStatus.Cat);
    }
  }, 120_000);
});

describe('the grader only "solves" unique puzzles', () => {
  it('on random maps with 0, 1 or many solutions: grade ≠ 6 ⇒ exactly one solution, found by the trace', () => {
    const rng = makeRng('test:grader-maps');
    let solvedUnique = 0;
    let stuck = 0;
    for (let t = 0; t < scaled(1200); t++) {
      const n = 5 + (t % 4);
      const regions = t % 2 === 0 ? plantedMap(n, rng).regions : regionFirstMap(n, rng);
      const k = createKnowledge(buildTables(n, regions), [], []);
      const g = gradeKnowledge(k);
      const s = countSolutions(n, regions);
      if (g.grade === 6) {
        stuck++;
        continue;
      }
      expect(s.count).toBe(1);
      const sol = s.solutions[0] as Uint8Array;
      for (let r = 0; r < n; r++) expect(k.status[r * n + (sol[r] as number)]).toBe(KnowledgeStatus.Cat);
      solvedUnique++;
    }
    expect(solvedUnique).toBeGreaterThan(0);
    expect(stuck).toBeGreaterThan(0);
  }, 120_000);
});
