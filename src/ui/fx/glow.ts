// Owner: B
// Solved-board glow (phase2b §2.2 t = 300): each cat cell's `.cell__glow` node (A builds it in
// board-cells.ts and styles its look in board.css: a radial gradient of --glow, fx.win.glowScale ×
// slot) fades 0 → 1 over fx.win.glowInMs, then settles to glowSettleOpacity over glowSettleMs,
// staggered glowStaggerMs in row order. Reduced motion (§2.7): a static glowSettleOpacity glow
// fading in over fx.win.reduced.glowInMs.
// F0 stub: signature final; body is B's.
import { cfg, type GameConfig } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import type { FxHandle } from './fish-flight';

/** Plays the glow on `cells` (the cat cells, in row order) of the board element `board` (`.board`). */
export function playGlow(board: HTMLElement, cells: readonly CellIndex[], reduced: boolean, c: GameConfig = cfg): FxHandle {
  void board;
  void cells;
  void reduced;
  void c;
  throw new Error('not implemented: playGlow (B, phase2b §2.2)');
}
