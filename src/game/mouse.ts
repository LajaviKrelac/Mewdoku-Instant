// Owner: G1 (Phase 2d)
// The mouse helper's cells (docs/phase2d/look-spec.md §1.12, D-2d-12): the candidates are the Empty
// cells (no mark, no cat, not wrong, not given) that are not in the solution, i.e. tiles that cannot
// hold a cat and are not crossed out yet; the mouse marks min(count, candidates) of them, picked
// uniformly with the engine's seeded RNG (cyrb128 → sfc32), so a seed always gives the same cells.
// PURE: the seed is passed in (the session uses `${puzzle.id}:mouse:${usesThisAttempt}`).
import { makeRng } from '../engine/rng';
import { CellState, type CellIndex, type GameState } from './types';

/** The seed string of the n-th use (0-based) of the mouse in an attempt on `puzzleId` (CONTRACTS §5). */
export function mouseSeed(puzzleId: string, usesThisAttempt: number): string {
  return `${puzzleId}:mouse:${usesThisAttempt}`;
}

/** Every Empty cell outside the solution, in board order. */
export function mouseCandidates(state: Pick<GameState, 'puzzle' | 'cells'>): CellIndex[] {
  const { n, solution } = state.puzzle;
  const out: CellIndex[] = [];
  for (let i = 0; i < state.cells.length; i++) {
    if (state.cells[i] !== CellState.Empty) continue;
    if (solution[Math.floor(i / n)] === i % n) continue;
    out.push(i);
  }
  return out;
}

/** Whether the mouse has at least one cell to cross out (GameView.mouse.enabled). */
export function hasMouseCandidate(state: Pick<GameState, 'puzzle' | 'cells'>): boolean {
  const { n, solution } = state.puzzle;
  for (let i = 0; i < state.cells.length; i++) {
    if (state.cells[i] === CellState.Empty && solution[Math.floor(i / n)] !== i % n) return true;
  }
  return false;
}

/**
 * min(count, candidates) distinct candidate cells, chosen uniformly by a partial Fisher–Yates shuffle
 * seeded with `seed`, returned in board order (the board pops them in that order). [] when there is
 * no candidate or `count` is not a positive integer.
 */
export function pickMouseCells(state: Pick<GameState, 'puzzle' | 'cells'>, count: number, seed: string): CellIndex[] {
  if (!Number.isInteger(count) || count <= 0) return [];
  const pool = mouseCandidates(state);
  const k = Math.min(count, pool.length);
  if (k === 0) return [];
  const rng = makeRng(seed);
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(pool.length - i);
    const tmp = pool[i] as CellIndex;
    pool[i] = pool[j] as CellIndex;
    pool[j] = tmp;
  }
  return pool.slice(0, k).sort((a, b) => a - b);
}
