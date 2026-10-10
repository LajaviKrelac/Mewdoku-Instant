// Owner: G1 (Phase 2d)
// The mouse helper's cells (docs/phase2d/look-spec.md §1.12, D-2d-12): the candidates are the Empty
// cells (no mark, no cat, not wrong, not given) that are not in the solution, i.e. tiles that cannot
// hold a cat and are not crossed out yet; the mouse marks min(count, candidates) of them, picked
// uniformly with the engine's seeded RNG (cyrb128 → sfc32), so a seed always gives the same cells.
// PURE: the seed is passed in (the session uses `${puzzle.id}:mouse:${usesThisAttempt}`).
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §1.3, §1.5, D-2d1-1): the cells come back in PICK order
// (the seeded partial shuffle), which is the order the mouse visits them; the visit timings
// (mouseVisitMs, mouseLandMs, mouseRunMs) come from fx.mouse and fx.markPopMs.
import { cfg, type GameConfig } from '../app/config';
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
 * seeded with `seed`, returned in PICK order (phase 2d.1 §1.3: the mouse visits them in this order;
 * consecutive cells are not forced apart). [] when there is no candidate or `count` is not a positive
 * integer.
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
  return pool.slice(0, k);
}

/** Phase 2d.1 §1.5: one visit, fx.mouse.dwellMs + fx.mouse.exitMs (935): the next visit starts then. */
export function mouseVisitMs(c: GameConfig = cfg): number {
  return c.fx.mouse.dwellMs + c.fx.mouse.exitMs;
}

/**
 * Phase 2d.1 §1.5: when the k-th (0-based) X lands, from the MARKED { source: 'mouse' } event:
 * k × mouseVisitMs + dwellMs (the mouse leaves and the X pops in under it).
 */
export function mouseLandMs(k: number, c: GameConfig = cfg): number {
  return Math.max(0, k) * mouseVisitMs(c) + c.fx.mouse.dwellMs;
}

/**
 * Phase 2d.1 §1.5: the whole run, count × mouseVisitMs + fx.markPopMs (2 975 for three tiles): the
 * board stays locked this long after the dispatch. Reduced motion: fx.reducedMotionFadeMs (the X's
 * fade in together, no sprite).
 */
export function mouseRunMs(count: number, reduced: boolean, c: GameConfig = cfg): number {
  if (reduced) return c.fx.reducedMotionFadeMs;
  return Math.max(0, count) * mouseVisitMs(c) + c.fx.markPopMs;
}
