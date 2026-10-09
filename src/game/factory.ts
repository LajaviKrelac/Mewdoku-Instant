// Owner: C (Phase 2b; was game)
// Game construction and in-progress conversion (04 §3, §7.2). PURE.
import type { Puzzle } from '../engine/types';
import { rulesFor } from './modes';
import { decodeCells, encodeCells, validateSlot } from './save-fields';
import { CellState, type GameState, type InProgressV2, type ModeId, type RuleFlags } from './types';

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
 * Rebuilds a game from a saved slot (02 §15 restore steps 4–6). The slot is validated against the
 * puzzle first (04 §7.2 checks, with the mode implied by `puzzle.id` and the hearts/revive limits of
 * the RuleFlags the game will use: `rules`, else rulesFor(slot.mode)), and an invalid
 * slot throws a RangeError naming the failed check: the caller clears that slot and starts fresh
 * (02 §15 step 3). Status: 'won' when the cats already fill the board (step 4, checked first), 'lost'
 * when hearts === 0 (step 5), else 'ready' (step 6). The move log is not persisted, so it starts
 * empty; hint and kitty overlays are never restored (anything charged stays charged).
 */
export function restoreGame(puzzle: Puzzle, slot: InProgressV2, rules?: RuleFlags): GameState {
  const slotMode = typeof slot === 'object' && slot !== null ? slot.mode : 'level';
  const flags = rules ?? rulesFor(slotMode === 'daily' || slotMode === 'event' ? slotMode : 'level');
  const check = checkSlot(puzzle, slot, flags);
  if (!check.ok) throw new RangeError(`restoreGame(${puzzle.id}): invalid slot (${check.reason})`);
  const mode: ModeId = slot.mode;
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

/**
 * validateInProgress for restoreGame. The expected mode follows the puzzle id (L… → level, D… →
 * daily; T1 is never saved), so a slot cannot restore a board in the wrong mode.
 */
function checkSlot(puzzle: Puzzle, slot: InProgressV2, rules: RuleFlags): { ok: true } | { ok: false; reason: string } {
  if (typeof slot !== 'object' || slot === null) return { ok: false, reason: 'shape' };
  const p = puzzle.id[0];
  const mode = p === 'L' ? 'level' : p === 'D' ? 'daily' : p === 'E' ? 'event' : null;
  if (mode === null) return { ok: false, reason: 'id' };
  return validateSlot(slot, puzzle, { mode, id: puzzle.id }, rules);
}

/** Snapshot for the save slot (level/daily modes only; the tutorial is never saved). Throws for the tutorial. */
export function toInProgress(state: GameState, savedAt: number): InProgressV2 {
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
