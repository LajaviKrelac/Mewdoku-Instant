// Owner: C (Phase 2b; was game)
// Game construction and in-progress conversion (04 §3, §7.2). PURE.
// Phase 2c.1 (G1, fish-lives-spec §3.2.2–§3.2.3): every attempt starts with 0 level points, cat run 0
// and no scored rows; the in-progress slot carries all three, and restoreGame takes them back when
// they are consistent with the board, else derives them (never inflating the points).
import type { Puzzle } from '../engine/types';
import { rulesFor } from './modes';
import { decodeCells, encodeCells, isNonNegSafeInt, validateSlot } from './save-fields';
import { runTotal } from './scoring';
import { CellState, type GameState, type InProgressV2, type ModeId, type PointsRule, type RuleFlags } from './types';

/**
 * Fresh attempt: givens only, full hearts, counters 0, empty move log, status 'ready' (04 §4.2 RETRY).
 * Phase 2c.1 §3.2.2: levelPoints 0, catStreak 0, scoredRows 0 (F5.1: every level and Retry start at 0).
 */
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
    levelPoints: 0,
    catStreak: 0,
    scoredRows: 0,
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
    // Phase 2c.1 §3.2.3: levelPoints, catStreak, scoredRows (from the slot, or derived).
    ...slotPoints(puzzle, cells, slot, flags.points),
  };
}

/** The level-points part of a GameState (phase2c.1 §3.2). */
export interface AttemptPoints {
  readonly levelPoints: number;
  readonly catStreak: number;
  readonly scoredRows: number;
}

/** Number of set bits of a 32-bit int (the row and region bitmasks: n ≤ 12 bits). */
export function popcount(x: number): number {
  let v = x >>> 0;
  let k = 0;
  while (v) {
    v &= v - 1;
    k++;
  }
  return k;
}

/** Bitmask of the rows holding a Cat, and of the rows holding a Given (phase2c.1 §3.2.3 (a)). */
function rowMasks(n: number, cells: Readonly<Uint8Array>): { cat: number; given: number } {
  let cat = 0;
  let given = 0;
  for (let i = 0; i < n * n; i++) {
    if (cells[i] === CellState.Cat) cat |= 1 << Math.floor(i / n);
    else if (cells[i] === CellState.Given) given |= 1 << Math.floor(i / n);
  }
  return { cat, given };
}

/**
 * The attempt's level points from a slot (phase2c.1 §3.2.3). The slot's points / catStreak /
 * scoredRows are taken when all three are present and CONSISTENT with the board:
 * (a) scoredRows < 2ⁿ, holds every row with a Cat and no row with a Given; (b) with k =
 * popcount(scoredRows), catStreak ≤ k; (c) runTotal(catStreak) + (k − catStreak) × first ≤ points ≤
 * runTotal(k); (d) mistakes = 0 ⇒ catStreak = k and points = runTotal(k). (c)'s upper bound is
 * checked tighter than the spec's runTotal(k) [G1 DECISION]: the k − catStreak cats before the last
 * mistake can total at most runTotal(k − catStreak) (one unbroken run), so points ≤ runTotal(k − s) +
 * runTotal(s); a value above that no sequence of cats can produce. Otherwise they are DERIVED
 * [DECISION] (D20): scoredRows = the rows holding a Cat (k), and with 0 mistakes catStreak = k and
 * points = runTotal(k) (exact unless a cat had been removed); with mistakes, catStreak = 0 and points
 * = k × first, the lowest total those k cats can have, so a restore never inflates points. Deriving
 * is not an error (no RangeError; the board is kept).
 */
export function slotPoints(puzzle: Puzzle, cells: Readonly<Uint8Array>, slot: InProgressV2, rule: PointsRule): AttemptPoints {
  const n = puzzle.n;
  const rows = rowMasks(n, cells);
  /** The lowest total of k scored cats whose last run is s long: runTotal(s) + (k − s) × first. */
  const low = (s: number, k: number): number => runTotal(s, rule) + (k - s) * rule.first;
  const { points, catStreak, scoredRows } = slot;
  if (isNonNegSafeInt(points) && isNonNegSafeInt(catStreak) && isNonNegSafeInt(scoredRows)) {
    const k = popcount(scoredRows);
    const ok =
      scoredRows < 2 ** n &&
      (scoredRows & rows.cat) === rows.cat &&
      (scoredRows & rows.given) === 0 &&
      catStreak <= k &&
      low(catStreak, k) <= points &&
      points <= runTotal(k - catStreak, rule) + runTotal(catStreak, rule) &&
      // (d): with catStreak = k the two bounds meet, so points = runTotal(k) is already checked.
      (slot.mistakes !== 0 || catStreak === k);
    if (ok) return { levelPoints: points, catStreak, scoredRows };
  }
  const k = popcount(rows.cat);
  const s = slot.mistakes === 0 ? k : 0; // derived: run k (exact) without mistakes, else 0 (lower bound)
  return { levelPoints: low(s, k), catStreak: s, scoredRows: rows.cat };
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

/**
 * Snapshot for the save slot (level/daily/event modes only; the tutorial is never saved). Throws for
 * the tutorial. Phase 2c.1 §3.2.3: always writes points, catStreak and scoredRows.
 */
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
    points: state.levelPoints,
    catStreak: state.catStreak,
    scoredRows: state.scoredRows,
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
