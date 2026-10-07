// Owner: game
// Game construction and in-progress conversion (04 §3, §7.2). PURE.
import type { Puzzle } from '../engine/types';
import { rulesFor } from './modes';
import { decodeCells, encodeCells } from './save';
import { CellState, type GameState, type InProgressV1, type ModeId, type RuleFlags } from './types';

/** Fresh attempt: givens only, full hearts, counters 0, empty move log, status 'ready' (04 §4.2 RETRY). */
export function newGame(puzzle: Puzzle, mode: ModeId, rules: RuleFlags = rulesFor(mode)): GameState {
  const n = puzzle.n;
  const cells = new Uint8Array(n * n);
  for (const r of puzzle.givens) {
    const c = puzzle.solution[r];
    if (c !== undefined && r >= 0 && r < n) cells[r * n + c] = CellState.Given;
  }
  return {
    puzzle,
    mode,
    rules,
    cells,
    hearts: rules.heartsPerAttempt,
    catsPlaced: countCats(cells),
    regionsDone: regionsDoneMask(puzzle, cells),
    status: 'ready',
    mistakes: 0,
    revivesUsed: 0,
    hintsUsed: 0,
    kittiesUsed: 0,
    elapsedMs: 0,
    openHint: null,
    moves: [],
  };
}

/**
 * Rebuilds a game from a VALIDATED slot (save.validateInProgress). Status: 'won' when the cats already
 * fill the board (02 §15 step 4, checked first), 'lost' when hearts === 0 (step 5), else 'ready'.
 * The move log is not persisted, so it starts empty. Hint/kitty overlays are never restored.
 */
export function restoreGame(puzzle: Puzzle, slot: InProgressV1, rules?: RuleFlags): GameState {
  const mode: ModeId = slot.mode;
  const flags = rules ?? rulesFor(mode);
  const cells = decodeCells(slot.cells, puzzle.n);
  const catsPlaced = countCats(cells);
  const status = catsPlaced >= puzzle.n ? 'won' : slot.hearts <= 0 ? 'lost' : 'ready';
  return {
    puzzle,
    mode,
    rules: flags,
    cells,
    hearts: slot.hearts,
    catsPlaced,
    regionsDone: regionsDoneMask(puzzle, cells),
    status,
    mistakes: slot.mistakes,
    revivesUsed: slot.revivesUsed,
    hintsUsed: slot.hintsUsed,
    kittiesUsed: slot.kittiesUsed,
    elapsedMs: slot.elapsedMs,
    openHint: null,
    moves: [],
  };
}

/** Snapshot for the save slot (level/daily modes only; the tutorial is never saved). Throws for the tutorial. */
export function toInProgress(state: GameState, savedAt: number): InProgressV1 {
  if (state.mode === 'tutorial') throw new Error('toInProgress: the tutorial is never saved');
  return {
    id: state.puzzle.id,
    mode: state.mode,
    cells: encodeCells(state.cells),
    hearts: state.hearts,
    revivesUsed: state.revivesUsed,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    kittiesUsed: state.kittiesUsed,
    elapsedMs: Math.round(state.elapsedMs),
    savedAt,
  };
}

/** Bitmask of regions that hold a Cat or Given. */
export function regionsDoneMask(puzzle: Puzzle, cells: Readonly<Uint8Array>): number {
  let mask = 0;
  for (let i = 0; i < cells.length; i++) {
    const s = cells[i];
    if (s === CellState.Cat || s === CellState.Given) mask |= 1 << (puzzle.regions[i] ?? 0);
  }
  return mask;
}

/** Number of Cat + Given cells. */
export function countCats(cells: Readonly<Uint8Array>): number {
  let count = 0;
  for (const s of cells) if (s === CellState.Cat || s === CellState.Given) count++;
  return count;
}
