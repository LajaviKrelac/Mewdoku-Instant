// Owner: engine
// 03 §5.2 / §11.1 techniques: one hand-checked fixture per technique (lower levels make no
// progress), and the optimised finders against the naive reference (reference.ts) on thousands of
// states, which pins the exact definitions, scan orders and the L4 bound k ≤ ⌊m/2⌋.
import { describe, expect, it } from 'vitest';
import { decodeRegions } from '../../../src/engine/codec';
import { buildTables } from '../../../src/engine/geometry';
import { trace } from '../../../src/engine/grader';
import { makeRng } from '../../../src/engine/rng';
import {
  applyStep,
  cloneKnowledge,
  createKnowledge,
  findConfinement,
  findPigeonhole,
  findShadowConflict,
  findSingle,
  findTrial,
  firstEmptyUnit,
  hasContradiction,
  KnowledgeStatus,
  propagate,
  shadowStep,
  type Knowledge,
} from '../../../src/engine/techniques';
import type { HintStep, Puzzle } from '../../../src/engine/types';
import { scaled, uniquePuzzles } from './helpers';
import {
  refBoard,
  refConfinement,
  refPigeonhole,
  refPropagate,
  refShadow,
  refShadowConflict,
  refSingle,
  refTrace,
  refTrial,
} from './reference';

function knowledge(n: number, r: string, cats: number[], elims: number[]): Knowledge {
  return createKnowledge(buildTables(n, decodeRegions(r, n)), cats, elims);
}

const FINDERS = [findSingle, findConfinement, findShadowConflict, findPigeonhole, findTrial] as const;

/** Asserts that levels below `level` find nothing and returns the step of `level`. */
function onlyFrom(k: Knowledge, level: 1 | 2 | 3 | 4 | 5): HintStep | null {
  for (let l = 1; l < level; l++) expect(FINDERS[l - 1]?.(k) ?? null).toBeNull();
  return FINDERS[level - 1]?.(k) ?? null;
}

describe('hand-checked fixtures, one per technique', () => {
  it('L1 single: tutorial after cats at (1,2) and (2,4) with their shadows', () => {
    const k = knowledge(4, 'ABCCAACCADDCDDDD', [1, 7], []);
    for (const cat of [1, 7]) {
      const sh = shadowStep(k, cat);
      if (sh) applyStep(k, sh);
    }
    // Candidates left: 8, 12, 14. Row 2 (unit 2) is the first unit with exactly one: cell 8.
    expect(onlyFrom(k, 1)).toEqual({
      kind: 'single',
      level: 1,
      focusUnits: [{ kind: 'row', index: 2 }],
      focusCells: [8],
      effectCells: [],
      placeCell: 8,
    });
  });

  it('L2 confinement: region C (cells 5, 10) lies in column 0, so 0, 15, 20 go', () => {
    // AAAAB / CAABB / CAAAB / DDAAE / DEEEE, empty board.
    const k = knowledge(5, 'AAAABCAABBCAAABDDAAEDEEEE', [], []);
    expect(onlyFrom(k, 2)).toEqual({
      kind: 'confine_region_line',
      level: 2,
      focusUnits: [
        { kind: 'region', index: 2 },
        { kind: 'col', index: 0 },
      ],
      focusCells: [5, 10],
      effectCells: [0, 15, 20],
    });
  });

  it('L3 shadow conflict: the 03 §5.2 domino — row 1 is confined to (1,1)–(1,2), so (0,2) goes', () => {
    // AABBB / ACCBB / AAADD / AEDDD / EEDDD; region C is the domino {6, 7} and row 1 holds only it.
    const k = knowledge(5, 'AABBBACCBBAAADDAEDDDEEDDD', [], [0, 1, 5, 8, 9]);
    expect(onlyFrom(k, 3)).toEqual({
      kind: 'shadow_conflict',
      level: 3,
      focusUnits: [{ kind: 'row', index: 1 }],
      focusCells: [2],
      effectCells: [2],
    });
  });

  it('L4 pigeonhole k = 2: columns 0 and 1 only fit in regions A and E, so (4,2) goes', () => {
    // AABBB / AABCD / AACCD / EAEDD / EEEDD.
    const k = knowledge(5, 'AABBBAABCDAACCDEAEDDEEEDD', [], [0, 1, 7, 8, 9, 10, 11, 14, 16, 17, 18]);
    expect(onlyFrom(k, 4)).toEqual({
      kind: 'pigeonhole',
      level: 4,
      focusUnits: [
        { kind: 'col', index: 0 },
        { kind: 'col', index: 1 },
        { kind: 'region', index: 0 },
        { kind: 'region', index: 4 },
      ],
      focusCells: [5, 6, 15, 20, 21],
      effectCells: [22],
      k: 2,
    });
  });

  it('L4 pigeonhole k = 3: regions B, C, F only fit in columns 3–5, so (5,3) and (5,4) go', () => {
    // AAABCC / AADBBC / DDDBBB / EDDFFF / EDFFEF / EEEEEF.
    const k = knowledge(6, 'AAABCCAADBBCDDDBBBEDDFFFEDFFEFEEEEEF', [], [3, 8, 9, 10, 12, 13, 14, 18, 22, 26, 28]);
    expect(onlyFrom(k, 4)).toEqual({
      kind: 'pigeonhole',
      level: 4,
      focusUnits: [
        { kind: 'region', index: 1 },
        { kind: 'region', index: 2 },
        { kind: 'region', index: 5 },
        { kind: 'col', index: 3 },
        { kind: 'col', index: 4 },
        { kind: 'col', index: 5 },
      ],
      focusCells: [4, 5, 11, 15, 16, 17, 21, 23, 27, 29, 35],
      effectCells: [33, 34],
      k: 3,
    });
  });

  it('L5 trial: a cat at (0,0) propagates until row 4 is empty', () => {
    const r = 'AAAABBAACCBBDDCBBEFFCBBEFFCBEEFFFEEE';
    const elims = [2, 4, 5, 6, 7, 8, 10, 14, 15, 16, 17, 18, 19, 21, 23, 25, 26, 27, 29, 33];
    const k = knowledge(6, r, [], elims);
    const step = onlyFrom(k, 5);
    expect(step).toEqual({
      kind: 'trial',
      level: 5,
      focusUnits: [{ kind: 'row', index: 4 }],
      focusCells: [0],
      effectCells: [0],
    });
    // Independent check with the reference propagation.
    const b = refBoard(6, decodeRegions(r, 6));
    const st = k.status.slice();
    st[0] = KnowledgeStatus.Cat;
    expect(refPropagate(b, st)).toBe(4);
  });
});

describe('knowledge helpers', () => {
  it('createKnowledge / applyStep / cloneKnowledge', () => {
    const k = knowledge(4, 'ABCCAACCADDCDDDD', [1], [0]);
    expect(Array.from(k.status.slice(0, 3))).toEqual([KnowledgeStatus.Elim, KnowledgeStatus.Cat, KnowledgeStatus.Cand]);
    const c = cloneKnowledge(k);
    applyStep(c, { kind: 'single', level: 1, focusUnits: [], focusCells: [7], effectCells: [2, 0], placeCell: 7 });
    expect([c.status[2], c.status[7], k.status[2]]).toEqual([KnowledgeStatus.Elim, KnowledgeStatus.Cat, KnowledgeStatus.Cand]);
    // Effects never turn a cat back into an elimination; mistaken_mark is a board-only step.
    applyStep(c, { kind: 'shadow', level: 0, focusUnits: [], focusCells: [], effectCells: [1] });
    applyStep(c, { kind: 'mistaken_mark', level: 0, focusUnits: [], focusCells: [3], effectCells: [3] });
    expect([c.status[1], c.status[3]]).toEqual([KnowledgeStatus.Cat, KnowledgeStatus.Cand]);
  });

  it('contradictions and the first empty unit (03 §5.1)', () => {
    const k = knowledge(4, 'ABCCAACCADDCDDDD', [], [4, 5, 6, 7]); // row 1 emptied
    expect(hasContradiction(k)).toBe(true);
    expect(firstEmptyUnit(k)).toEqual({ kind: 'row', index: 1 });
    const two = knowledge(4, 'ABCCAACCADDCDDDD', [0, 2], []); // two cats in row 0
    expect(hasContradiction(two)).toBe(true);
    expect(firstEmptyUnit(two)).toBeNull();
    // After the shadows row 1 is empty: an empty unit is reported before a two-cat unit.
    expect(propagate(cloneKnowledge(two))).toBe(1);
    expect(hasContradiction(knowledge(4, 'ABCCAACCADDCDDDD', [], []))).toBe(false);
  });

  it('propagate solves the tutorial without a contradiction and finds one after a wrong cat', () => {
    const ok = knowledge(4, 'ABCCAACCADDCDDDD', [], []);
    expect(propagate(ok)).toBe(-1);
    expect([1, 7, 8, 14].every((x) => ok.status[x] === KnowledgeStatus.Cat)).toBe(true);
    const wrong = knowledge(4, 'ABCCAACCADDCDDDD', [0], []);
    expect(propagate(wrong)).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Snapshots of K before every step of the engine trace from an empty board. With `settled`, only
 * states where every cat's shadow is applied (the next step is L1–L5, not a shadow): the states in
 * which the grader actually searches L1–L5.
 */
function traceStates(p: Puzzle, settled = false): Uint8Array[] {
  const k = createKnowledge(buildTables(p.n, p.regions), [], []);
  const out: Uint8Array[] = [];
  for (const step of trace(k)) if (!settled || step.level > 0) out.push(k.status.slice());
  return out;
}

describe('engine finders = naive reference (exact definitions and scan order)', () => {
  const puzzles = uniquePuzzles('test:techniques', scaled(160), [5, 6, 7, 8, 9, 6, 7, 8, 10, 12]);

  it('L1–L4 agree at every state of every trace', () => {
    let states = 0;
    for (const p of puzzles) {
      const tables = buildTables(p.n, p.regions);
      const b = refBoard(p.n, p.regions);
      for (const st of traceStates(p)) {
        const k: Knowledge = { tables, status: st };
        expect(findSingle(k)).toEqual(refSingle(b, st));
        expect(findConfinement(k)).toEqual(refConfinement(b, st));
        expect(findShadowConflict(k)).toEqual(refShadowConflict(b, st));
        expect(findPigeonhole(k)).toEqual(refPigeonhole(b, st));
        states++;
      }
    }
    expect(states).toBeGreaterThan(scaled(160) * 10);
  }, 240_000);

  it('L5 agrees wherever L1–L4 are stuck, and on random states (N ≤ 8)', () => {
    const rng = makeRng('test:trial-states');
    let stuck = 0;
    for (const p of puzzles.filter((q) => q.n <= 8)) {
      const tables = buildTables(p.n, p.regions);
      const b = refBoard(p.n, p.regions);
      for (const st of traceStates(p)) {
        const k: Knowledge = { tables, status: st };
        const lower = findSingle(k) ?? findConfinement(k) ?? findShadowConflict(k) ?? findPigeonhole(k);
        if (lower !== null && rng.int(12) !== 0) continue;
        if (lower === null) stuck++;
        expect(findTrial(k)).toEqual(refTrial(b, st));
      }
    }
    expect(stuck).toBeGreaterThan(0);
  }, 240_000);

  it('the L4 bound k ≤ ⌊m/2⌋ loses no deduction (03 §5.2 complement argument)', () => {
    // Every set of k ≤ m − 2 units has a complement of m − k ≥ 2 units for the reversed pair with
    // the same eliminations, so searching up to ⌊m/2⌋ finds a step iff searching up to m − 2 does.
    // (k = m − 1 has a complement of 1, which is L1/L2, not L4.) The argument needs settled states:
    // a closed unit must hold no candidate, which holds once every cat's shadow is applied.
    let wideOnlyBeyondBound = 0;
    for (const p of puzzles.filter((q) => q.n <= 9)) {
      const b = refBoard(p.n, p.regions);
      for (const st of traceStates(p, true)) {
        const wide = refPigeonhole(b, st, (m) => m - 2);
        const narrow = refPigeonhole(b, st);
        expect(narrow !== null).toBe(wide !== null);
        if (wide !== null && narrow !== null && (wide.k ?? 0) !== narrow.k) wideOnlyBeyondBound++;
      }
    }
    expect(wideOnlyBeyondBound).toBe(0); // ascending k: the first hit is the same either way
  }, 240_000);

  it('whole traces equal the reference from empty and from random partial boards (N ≤ 8)', () => {
    const rng = makeRng('test:trace-eq');
    for (const p of puzzles.filter((q) => q.n <= 8).slice(0, scaled(60))) {
      const tables = buildTables(p.n, p.regions);
      const b = refBoard(p.n, p.regions);
      for (let rep = 0; rep < 3; rep++) {
        const cats: number[] = [];
        const elims: number[] = [];
        if (rep > 0) {
          for (let r = 0; r < p.n; r++) if (rng.int(3) === 0) cats.push(r * p.n + (p.solution[r] as number));
          for (let i = 0; i < p.n * p.n; i++) {
            if (p.solution[Math.floor(i / p.n)] !== i % p.n && rng.int(5) === 0) elims.push(i);
          }
        }
        const k = createKnowledge(tables, cats, elims);
        const want = refTrace(b, k.status.slice());
        const it = trace(k);
        const got: HintStep[] = [];
        let res = it.next();
        while (!res.done) {
          got.push(res.value);
          res = it.next();
        }
        expect(got).toEqual(want.steps);
        expect(res.value).toBe(want.end);
        expect(res.value).toBe('solved');
      }
    }
  }, 240_000);

  it('shadow steps match the reference', () => {
    const p = puzzles[0] as Puzzle;
    const b = refBoard(p.n, p.regions);
    const k = createKnowledge(buildTables(p.n, p.regions), [], []);
    for (let x = 0; x < p.n * p.n; x++) expect(shadowStep(k, x)).toEqual(refShadow(b, k.status, x));
  });
});
