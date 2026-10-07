// Owner: engine
// Grader loop and trace (03 §5.2–5.4): L1..L5 in order, restart from L1 after any progress. PURE.
import { buildTables } from './geometry';
import { viewContradiction, type View } from './masks';
import { findPigeonholeIn } from './pigeonhole';
import {
  applyStep,
  confinementIn,
  createKnowledge,
  KnowledgeStatus,
  shadowConflictIn,
  shadowStep,
  singleIn,
  trialIn,
  viewOf,
  type Knowledge,
} from './techniques';
import type { Grade, GradeOptions, GradeResult, HintStep } from './types';

/** The next L1–L5 step on K (03 §5.2 order), limited to `maxLevel`; null when stuck. */
function nextStep(k: Knowledge, v: View, maxLevel: number): HintStep | null {
  let step = singleIn(v);
  if (step === null && maxLevel >= 2) step = confinementIn(v);
  if (step === null && maxLevel >= 3) step = shadowConflictIn(v);
  if (step === null && maxLevel >= 4) step = findPigeonholeIn(v);
  if (step === null && maxLevel >= 5) step = trialIn(k);
  return step;
}

/**
 * Lazily yields the trace from K (03 §6 step 3): first one shadow step per known cat in cell order,
 * then the L1–L5 loop (each L1 followed by its shadow). Each yielded step is applied to K before
 * the next. Returns 'solved' or 'stuck' when it ends ('stuck' also covers a contradiction).
 */
export function* trace(k: Knowledge, opts?: GradeOptions): Generator<HintStep, 'solved' | 'stuck', void> {
  const maxLevel = opts?.maxLevel ?? 5;
  const n = k.tables.n;
  for (let x = 0; x < k.status.length; x++) {
    if (k.status[x] !== KnowledgeStatus.Cat) continue;
    const sh = shadowStep(k, x);
    if (sh) {
      yield sh;
      applyStep(k, sh);
    }
  }
  for (;;) {
    const v = viewOf(k);
    if (v.totalCand === 0) {
      let cats = 0;
      for (let r = 0; r < n; r++) if (v.ccount[r] === 1) cats++;
      return cats === n && !viewContradiction(v) ? 'solved' : 'stuck';
    }
    if (viewContradiction(v)) return 'stuck';
    const step = nextStep(k, v, maxLevel);
    if (step === null) return 'stuck';
    yield step;
    applyStep(k, step);
    if (step.placeCell !== undefined) {
      const sh = shadowStep(k, step.placeCell);
      if (sh) {
        yield sh;
        applyStep(k, sh);
      }
    }
  }
}

/** effort = n1 + 3·n2 + 4·n3 + 8·n4 + 2·Σ(k−2) + 15·n5 + N (03 §5.4). */
export function effortScore(counts: GradeResult['counts'], pigeonExtra: number, n: number): number {
  return counts[1] + 3 * counts[2] + 4 * counts[3] + 8 * counts[4] + 2 * pigeonExtra + 15 * counts[5] + n;
}

/** Grades the trace of an arbitrary K (used by grade() and by tests on partial states). */
export function gradeKnowledge(k: Knowledge, opts?: GradeOptions): GradeResult {
  const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  let pigeonMaxK = 0;
  let pigeonExtra = 0;
  let maxLevel = 0;
  const it = trace(k, opts);
  let res = it.next();
  while (!res.done) {
    const step = res.value;
    counts[step.level]++;
    if (step.level > maxLevel) maxLevel = step.level;
    if (step.kind === 'pigeonhole' && step.k !== undefined) {
      pigeonMaxK = Math.max(pigeonMaxK, step.k);
      pigeonExtra += step.k - 2;
    }
    res = it.next();
  }
  const grade: Grade | 6 = res.value === 'solved' ? (Math.max(1, maxLevel) as Grade) : 6;
  return { grade, counts, pigeonMaxK, effort: effortScore(counts, pigeonExtra, k.tables.n) };
}

/** Grades a region map from an empty board. grade 6 = stuck (reject). */
export function grade(n: number, regions: Uint8Array, opts?: GradeOptions): GradeResult {
  return gradeKnowledge(createKnowledge(buildTables(n, regions), [], []), opts);
}
