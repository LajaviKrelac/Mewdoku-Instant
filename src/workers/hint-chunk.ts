// Owner: G1 (Phase 2d.1)
// The lazy hint chunk's entry and the engine worker's hint import (docs/phase2d/helpers-spec.md §2.3,
// D-2d1-2). It re-exports the engine's getHintStep unchanged and carries the kitty's NEW target rule,
// because src/engine/** is read-only: the kitty places the cat of the cat-less region with the FEWEST
// candidate tiles after every known cat's shadow (the same knowledge as engine/hint: cats and wrong
// tiles from the board, marks count as candidates); ties go to the region whose solution cell comes
// first in reading order. The recordings showed the kitty filling a one-tile region (the most
// constrained cell, forced at once); the 2b rule (most candidates) stays in engine/hint.ts for its
// golden tests and for the hint's reveal_fallback. PURE, synchronous; loaded lazily by
// engine-client.ts and imported by engine.worker.ts, so the main bundle does not grow.
import { getHintStep, knowledgeFromBoard } from '../engine/hint';
import { solutionCell } from '../engine/geometry';
import { applyStep, KnowledgeStatus, shadowStep } from '../engine/techniques';
import type { CellIndex, Puzzle } from '../engine/types';

export { getHintStep };

/**
 * Phase 2d.1 §2.3: the solution cell of the cat-less region with the fewest candidate tiles after
 * every known cat's shadow; ties: the region whose solution cell comes first in reading order (the
 * solution has one cell per row, so that is the earlier row). Throws when every region has a cat.
 * The engine is only read: knowledgeFromBoard, shadowStep and applyStep work on a fresh Knowledge.
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
  let best: CellIndex = -1;
  let bestCount = Number.POSITIVE_INFINITY;
  // Rows in order = the solution cells in reading order, so a strict "<" keeps the earlier one on a tie.
  for (let r = 0; r < n; r++) {
    const cell = solutionCell(puzzle, r);
    const g = puzzle.regions[cell] as number;
    if ((hasCat >> g) & 1) continue;
    const count = candCount[g] as number;
    if (count < bestCount) {
      best = cell;
      bestCount = count;
    }
  }
  if (best < 0) throw new Error('pickKittyCell: every region already has a cat');
  return best;
}
