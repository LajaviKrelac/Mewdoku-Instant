// Owner: engine
// 03 §6 / §11.1 hint engine and kitty target: mistaken Marks come first, steps are sound and make
// progress on random partial boards, repeated Apply reaches the solution, pickKittyCell rules.
import { describe, expect, it } from 'vitest';
import { decodeRegions } from '../../../src/engine/codec';
import { buildTables } from '../../../src/engine/geometry';
import { findMistakenMark, getHintStep, knowledgeFromBoard, pickKittyCell } from '../../../src/engine/hint';
import { makeRng } from '../../../src/engine/rng';
import { countSolutions } from '../../../src/engine/solver';
import { applyStep, KnowledgeStatus, shadowStep } from '../../../src/engine/techniques';
import { CellState, type HintStep, type Puzzle, type Rng } from '../../../src/engine/types';
import { BULK_SIZES, makePuzzle, puzzleFromStrings, scaled, solutionCellSet, TUTORIAL, uniquePuzzles } from './helpers';

const { Empty, Mark, Cat, Wrong, Given } = CellState;

/** 02 §9.1 Apply: Empty effect cells → Mark, placeCell → Cat, mistaken_mark clears its Mark. */
function applyHint(cells: Uint8Array, step: HintStep): void {
  if (step.kind === 'mistaken_mark') {
    for (const x of step.effectCells) if (cells[x] === Mark) cells[x] = Empty;
    return;
  }
  for (const x of step.effectCells) if (cells[x] === Empty) cells[x] = Mark;
  if (step.placeCell !== undefined) cells[step.placeCell] = Cat;
}

/** A random reachable board: correct cats/givens, Wrong on non-solution cells, Marks anywhere. */
function randomBoard(p: Puzzle, rng: Rng, mistakes: boolean): Uint8Array {
  const sol = solutionCellSet(p);
  const cells = new Uint8Array(p.n * p.n);
  for (let r = 0; r < p.n; r++) {
    const x = r * p.n + (p.solution[r] as number);
    const roll = rng.int(6);
    if (roll === 0) cells[x] = Cat;
    else if (roll === 1 && rng.int(3) === 0) cells[x] = Given;
    else if (roll === 2 && mistakes) cells[x] = Mark; // a mistaken Mark
  }
  for (let i = 0; i < cells.length; i++) {
    if (sol.has(i)) continue;
    const roll = rng.int(10);
    if (roll === 0) cells[i] = Wrong;
    else if (roll <= 3) cells[i] = Mark;
  }
  return cells;
}

const solved = (p: Puzzle, cells: Uint8Array): boolean => {
  for (let r = 0; r < p.n; r++) {
    const s = cells[r * p.n + (p.solution[r] as number)];
    if (s !== Cat && s !== Given) return false;
  }
  return true;
};

describe('mistaken Marks (03 §6 step 1)', () => {
  const p = puzzleFromStrings(TUTORIAL.n, TUTORIAL.r, TUTORIAL.s, 'T1');

  it('points at the lowest-index Mark on a solution cell, before anything else', () => {
    const cells = new Uint8Array(16);
    cells[14] = Mark; // solution cell (3,2)
    cells[7] = Mark; // solution cell (1,3)
    cells[0] = Mark; // a correct X
    expect(findMistakenMark(p, cells)).toBe(7);
    expect(getHintStep(p, cells)).toEqual({
      kind: 'mistaken_mark',
      level: 0,
      focusUnits: [],
      focusCells: [7],
      effectCells: [7],
    });
  });

  it('is null when every Mark is on a non-solution cell', () => {
    const cells = new Uint8Array(16);
    for (const x of [0, 2, 3, 15]) cells[x] = Mark;
    expect(findMistakenMark(p, cells)).toBeNull();
    expect(getHintStep(p, cells).kind).not.toBe('mistaken_mark');
  });
});

describe('knowledgeFromBoard (03 §6 step 2)', () => {
  it('Cat and Given → cat, Wrong → elim, Empty and Mark → candidate', () => {
    const p = puzzleFromStrings(TUTORIAL.n, TUTORIAL.r, TUTORIAL.s, 'T1');
    const cells = new Uint8Array(16);
    cells[1] = Cat;
    cells[8] = Given;
    cells[0] = Wrong;
    cells[2] = Mark;
    const k = knowledgeFromBoard(p, cells);
    expect([k.status[1], k.status[8], k.status[0], k.status[2], k.status[3]]).toEqual([
      KnowledgeStatus.Cat,
      KnowledgeStatus.Cat,
      KnowledgeStatus.Elim,
      KnowledgeStatus.Cand,
      KnowledgeStatus.Cand,
    ]);
    expect(() => knowledgeFromBoard(p, new Uint8Array(15))).toThrow(RangeError);
    expect(() => getHintStep(p, new Uint8Array(17))).toThrow(RangeError);
  });
});

describe('getHintStep on the tutorial (02 §11.5 step 5)', () => {
  it('after steps 1–4 the hint is the single at (3,1)', () => {
    const p = puzzleFromStrings(TUTORIAL.n, TUTORIAL.r, TUTORIAL.s, 'T1');
    const cells = new Uint8Array(16);
    cells[1] = Cat;
    cells[7] = Cat;
    // Scripted X's: row 1 and column 2 (step 2), (2,1)–(2,3) (step 3), the shadow of (2,4) (step 4).
    for (const x of [0, 2, 3, 5, 9, 13, 4, 6, 11, 15, 10]) cells[x] = Mark;
    expect(getHintStep(p, cells)).toEqual({
      kind: 'single',
      level: 1,
      focusUnits: [{ kind: 'row', index: 2 }],
      focusCells: [8],
      effectCells: [],
      placeCell: 8,
    });
  });

  it('on the empty board the first step is a single, and Apply × n solves it', () => {
    const p = puzzleFromStrings(TUTORIAL.n, TUTORIAL.r, TUTORIAL.s, 'T1');
    const cells = new Uint8Array(16);
    expect(getHintStep(p, cells).kind).toBe('single');
    for (let i = 0; i < 40 && !solved(p, cells); i++) applyHint(cells, getHintStep(p, cells));
    expect(solved(p, cells)).toBe(true);
  });
});

describe('random partial boards (03 §11.1)', () => {
  const puzzles = uniquePuzzles('test:hints', scaled(400), BULK_SIZES);

  it('the step is sound, makes progress, and mistaken Marks come first', () => {
    const rng = makeRng('test:hint-boards');
    let mistaken = 0;
    for (const p of puzzles) {
      const sol = solutionCellSet(p);
      for (let rep = 0; rep < 4; rep++) {
        const cells = randomBoard(p, rng, rep % 2 === 1);
        if (solved(p, cells)) continue;
        const before = cells.slice();
        const step = getHintStep(p, cells);
        expect(cells).toEqual(before); // pure: the board is not touched
        expect(getHintStep(p, cells)).toEqual(step); // deterministic (the free-reopen cache relies on it)
        const firstBad = findMistakenMark(p, cells);
        if (firstBad !== null) {
          mistaken++;
          expect(step.kind).toBe('mistaken_mark');
          expect(step.effectCells).toEqual([firstBad]);
          for (let i = 0; i < firstBad; i++) expect(cells[i] === Mark && sol.has(i)).toBe(false);
          continue;
        }
        expect(step.kind).not.toBe('mistaken_mark');
        expect(step.kind).not.toBe('reveal_fallback'); // a well-posed puzzle always has a next step
        for (const x of step.effectCells) expect(sol.has(x)).toBe(false);
        if (step.placeCell !== undefined) expect(sol.has(step.placeCell)).toBe(true);
        const progress =
          step.effectCells.some((x) => cells[x] === Empty) ||
          (step.placeCell !== undefined && cells[step.placeCell] !== Cat && cells[step.placeCell] !== Given);
        expect(progress).toBe(true);
      }
    }
    expect(mistaken).toBeGreaterThan(0);
  }, 240_000);

  it('repeated Apply always reaches the solution, never marking a solution cell', () => {
    const rng = makeRng('test:hint-apply');
    for (const p of puzzles.slice(0, scaled(250))) {
      const sol = solutionCellSet(p);
      const cells = randomBoard(p, rng, rng.int(2) === 0);
      let guard = 0;
      while (!solved(p, cells)) {
        const step = getHintStep(p, cells);
        const markedBefore = [...sol].filter((x) => cells[x] === Mark).length;
        applyHint(cells, step);
        const markedAfter = [...sol].filter((x) => cells[x] === Mark).length;
        // A hint never marks a solution cell; mistaken_mark removes exactly one such Mark.
        expect(markedAfter).toBe(step.kind === 'mistaken_mark' ? markedBefore - 1 : markedBefore);
        if (++guard > 3 * p.n * p.n) throw new Error(`${p.id}: no convergence`);
      }
      // No stray Mark sits on a solution cell, and every cat is a solution cat.
      for (let i = 0; i < cells.length; i++) if (cells[i] === Cat) expect(sol.has(i)).toBe(true);
    }
  }, 240_000);
});

describe('reveal_fallback guard (03 §6 step 5)', () => {
  it('a board the grader cannot finish yields the kitty target', () => {
    // Our 6×6 board with 14 solutions: sound logic stalls before the end, so the hint falls back.
    const regions = decodeRegions('AABBBBAABBBCAADDDCADDEECFFEEECFFFFCC', 6);
    const sol = countSolutions(6, regions).solutions[0] as Uint8Array;
    const p = makePuzzle(6, regions, sol);
    const cells = new Uint8Array(36);
    let fallback: HintStep | null = null;
    for (let i = 0; i < 100 && fallback === null; i++) {
      const step = getHintStep(p, cells);
      if (step.kind === 'reveal_fallback') fallback = step;
      else applyHint(cells, step);
    }
    if (fallback === null) throw new Error('no fallback');
    expect(solved(p, cells)).toBe(false);
    expect(fallback.placeCell).toBe(pickKittyCell(p, cells));
    expect(fallback.focusUnits).toEqual([{ kind: 'region', index: regions[fallback.placeCell as number] }]);
    expect(fallback.focusCells).toEqual([fallback.placeCell]);
    expect(fallback.effectCells).toEqual([]);
    expect(fallback.level).toBe(0);
  });
});

describe('pickKittyCell (02 §9.2)', () => {
  /** Naive 02 §9.2: K + every cat's shadow; region without a cat with the most candidates, lowest label. */
  function naiveKitty(p: Puzzle, cells: Uint8Array): number {
    const k = knowledgeFromBoard(p, cells);
    for (let x = 0; x < cells.length; x++) {
      if (k.status[x] !== KnowledgeStatus.Cat) continue;
      const sh = shadowStep(k, x);
      if (sh) applyStep(k, sh);
    }
    const tables = buildTables(p.n, p.regions);
    let best = -1;
    let bestCount = -1;
    for (let g = 0; g < p.n; g++) {
      const unit = tables.units[2 * p.n + g] ?? [];
      if (unit.some((x) => k.status[x] === KnowledgeStatus.Cat)) continue;
      const count = unit.filter((x) => k.status[x] === KnowledgeStatus.Cand).length;
      if (count > bestCount) {
        best = g;
        bestCount = count;
      }
    }
    for (let r = 0; r < p.n; r++) {
      const x = r * p.n + (p.solution[r] as number);
      if (p.regions[x] === best) return x;
    }
    return -1;
  }

  it('returns the solution cell of the cat-less region with the most candidates (ties: lowest label)', () => {
    const rng = makeRng('test:kitty');
    for (const p of uniquePuzzles('test:kitty-puzzles', scaled(300), BULK_SIZES)) {
      const sol = solutionCellSet(p);
      const cells = randomBoard(p, rng, true);
      if (solved(p, cells)) continue;
      const x = pickKittyCell(p, cells);
      expect(sol.has(x)).toBe(true);
      expect(cells[x] === Cat || cells[x] === Given).toBe(false);
      expect(x).toBe(naiveKitty(p, cells));
    }
  }, 120_000);

  it('ignores Marks (untrusted) and breaks ties by the lowest label', () => {
    const p = puzzleFromStrings(TUTORIAL.n, TUTORIAL.r, TUTORIAL.s, 'T1');
    // Empty board: candidates per region A 4, B 1, C 5, D 6 → D, whose solution cell is (3,2) = 14.
    expect(pickKittyCell(p, new Uint8Array(16))).toBe(14);
    const marked = new Uint8Array(16).fill(Mark);
    expect(pickKittyCell(p, marked)).toBe(14);
    // With the D cat placed, its shadow leaves A {0, 4, 5, 8} 4, B {1} 1, C {3, 7} 2 → A, cell 8.
    const d = new Uint8Array(16);
    d[14] = Cat;
    expect(pickKittyCell(p, d)).toBe(8);
    // Tie: Wrong on 0 and 4 leaves A {5, 8} 2 = C {3, 7} 2 → the lower label A wins.
    d[0] = Wrong;
    d[4] = Wrong;
    expect(pickKittyCell(p, d)).toBe(8);
    // One more Wrong in A makes C the unique maximum → C's solution cell 7.
    d[5] = Wrong;
    expect(pickKittyCell(p, d)).toBe(7);
  });

  it('throws when every region already has a cat', () => {
    const p = puzzleFromStrings(TUTORIAL.n, TUTORIAL.r, TUTORIAL.s, 'T1');
    const full = new Uint8Array(16);
    for (const x of [1, 7, 8, 14]) full[x] = Cat;
    expect(() => pickKittyCell(p, full)).toThrow();
    // A solved board still has shadow steps to teach while tiles are Empty...
    expect(getHintStep(p, full).kind).toBe('shadow');
    // ...but once everything is marked there is nothing left: getHintStep throws (the app never asks).
    const done = full.map((s) => (s === Cat ? Cat : Mark));
    expect(() => getHintStep(p, done)).toThrow();
  });
});
