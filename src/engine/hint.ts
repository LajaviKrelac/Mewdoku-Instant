// Owner: engine
// Hint engine from the player's live board (03 §6) and the kitty target (02 §9.2). PURE, synchronous.
// The app calls these through the async wrapper in workers/engine-client.ts.
//
// getHintStep is a pure function of (puzzle, cells): the same board always yields the same step,
// which is what the session's free-reopen cache (02 §9.1, keyed by the cells string) relies on.
import { buildTables, isSolutionCell, solutionCell, unitFromId } from './geometry';
import { trace } from './grader';
import { applyStep, createKnowledge, KnowledgeStatus, shadowStep, type Knowledge } from './techniques';
import { CellState, type CellIndex, type HintStep, type Puzzle, type PuzzleTables } from './types';

const tablesCache = new WeakMap<Uint8Array, PuzzleTables>();

/** Tables for a puzzle, cached by its regions array (puzzles are immutable). */
function tablesOf(puzzle: Puzzle): PuzzleTables {
  const hit = tablesCache.get(puzzle.regions);
  if (hit && hit.n === puzzle.n) return hit;
  const t = buildTables(puzzle.n, puzzle.regions);
  tablesCache.set(puzzle.regions, t);
  return t;
}

function checkCells(puzzle: Puzzle, cells: Readonly<Uint8Array>): void {
  if (cells.length !== puzzle.n * puzzle.n) {
    throw new RangeError(`hint: expected ${puzzle.n * puzzle.n} cells, got ${cells.length}`);
  }
}

const isCatState = (s: number | undefined): boolean => s === CellState.Cat || s === CellState.Given;

/** Lowest-index Mark that sits on a solution cell, or null (03 §6 step 1). */
export function findMistakenMark(puzzle: Puzzle, cells: Readonly<Uint8Array>): CellIndex | null {
  checkCells(puzzle, cells);
  for (let i = 0; i < cells.length; i++) if (cells[i] === CellState.Mark && isSolutionCell(puzzle, i)) return i;
  return null;
}

/** K from the board (03 §6 step 2): Cat/Given → cat, Wrong → elim, everything else (Marks too) → cand. */
export function knowledgeFromBoard(puzzle: Puzzle, cells: Readonly<Uint8Array>): Knowledge {
  checkCells(puzzle, cells);
  const cats: CellIndex[] = [];
  const elims: CellIndex[] = [];
  for (let i = 0; i < cells.length; i++) {
    const s = cells[i];
    if (isCatState(s)) cats.push(i);
    else if (s === CellState.Wrong) elims.push(i);
  }
  return createKnowledge(tablesOf(puzzle), cats, elims);
}

/** 03 §6 step 4: an effect cell is Empty on the board, or the placed cell is not yet a cat. */
function hasNewEffect(step: HintStep, cells: Readonly<Uint8Array>): boolean {
  if (step.placeCell !== undefined && !isCatState(cells[step.placeCell])) return true;
  for (const x of step.effectCells) if (cells[x] === CellState.Empty) return true;
  return false;
}

/**
 * The next step to teach (03 §6): a mistaken_mark first, else the first trace step with a new effect
 * on the board, else reveal_fallback. `cells` holds CellState values (engine/types.ts).
 * Throws when the board is already solved (no cat-less region is left to reveal).
 */
export function getHintStep(puzzle: Puzzle, cells: Readonly<Uint8Array>): HintStep {
  const mistaken = findMistakenMark(puzzle, cells);
  if (mistaken !== null) {
    return { kind: 'mistaken_mark', level: 0, focusUnits: [], focusCells: [mistaken], effectCells: [mistaken] };
  }
  for (const step of trace(knowledgeFromBoard(puzzle, cells))) {
    if (hasNewEffect(step, cells)) return step;
  }
  const cell = pickKittyCell(puzzle, cells);
  const region = puzzle.regions[cell] as number;
  return {
    kind: 'reveal_fallback',
    level: 0,
    focusUnits: [unitFromId(2 * puzzle.n + region, puzzle.n)],
    focusCells: [cell],
    effectCells: [],
    placeCell: cell,
  };
}

/**
 * Kitty target (03 §6): the solution cell of the cat-less region with the most candidates (ties:
 * lowest label), counted after every known cat's shadow. Throws when every region has a cat.
 */
export function pickKittyCell(puzzle: Puzzle, cells: Readonly<Uint8Array>): CellIndex {
  const k = knowledgeFromBoard(puzzle, cells);
  for (let x = 0; x < k.status.length; x++) {
    if (k.status[x] !== KnowledgeStatus.Cat) continue;
    const sh = shadowStep(k, x);
    if (sh) applyStep(k, sh);
  }
  const n = puzzle.n;
  const candCount = new Int32Array(n);
  let hasCat = 0;
  for (let i = 0; i < n * n; i++) {
    const g = puzzle.regions[i] as number;
    if (k.status[i] === KnowledgeStatus.Cat) hasCat |= 1 << g;
    else if (k.status[i] === KnowledgeStatus.Cand) candCount[g] = (candCount[g] as number) + 1;
  }
  let best = -1;
  for (let g = 0; g < n; g++) {
    if ((hasCat >> g) & 1) continue;
    if (best < 0 || (candCount[g] as number) > (candCount[best] as number)) best = g;
  }
  if (best < 0) throw new Error('pickKittyCell: every region already has a cat');
  for (let r = 0; r < n; r++) {
    const cell = solutionCell(puzzle, r);
    if (puzzle.regions[cell] === best) return cell;
  }
  throw new Error('pickKittyCell: region has no solution cell'); // unreachable for a valid puzzle
}
