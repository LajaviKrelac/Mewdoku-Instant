// Owner: ui-board
// Pointer gesture recogniser on the board (02 §6.1, 04 §5.4): tap, double-tap (same cell, ≤
// input.doubleTapMs between pointerups), drag-paint with mode chosen by the start cell, cell lock
// after a double-tap (input.cellLockAfterCatMs), primary pointer only, right-click suppressed.
import type { CellIndex } from '../../engine/types';
import type { CellState, PaintMode } from '../../game/types';
import type { BoardGeometry } from './layout';

export interface GestureCallbacks {
  /** Applied instantly (no waiting for a possible second tap). */
  tap(cell: CellIndex): void;
  /** The second tap on the same cell within doubleTapMs. The first tap has already been emitted. */
  doubleTap(cell: CellIndex): void;
  /** One call per pointermove batch; the first call of a drag includes the start cell. */
  paint(cells: CellIndex[], mode: PaintMode): void;
}

export interface GestureOptions {
  /** Read at pointerdown. */
  geometry(): BoardGeometry;
  /** Current state of a cell, to pick the drag mode (Mark → erase, else mark). */
  cellState(cell: CellIndex): CellState;
  /** Board input lock (02 §6.4): when true, pointerdown is ignored and active streams are dropped. */
  isLocked(): boolean;
}

/** Attaches Pointer Event listeners (touch-action: none on boardEl). Returns detach(). */
export function attachGestures(boardEl: HTMLElement, cb: GestureCallbacks, opts: GestureOptions): () => void {
  throw new Error('not implemented: attachGestures');
}
