// Owner: B (Phase 2b; was ui-board)
// Pointer gesture recogniser on the board (02 §6.1, 04 §5.4): tap, double-tap (same cell, ≤
// input.doubleTapMs between pointerups), drag-paint with mode chosen by the start cell, cell lock
// after a double-tap (input.cellLockAfterCatMs), primary pointer only, right-click suppressed.
// A resize or rotation during a gesture cancels it like pointercancel: the geometry captured at
// pointerdown is stale, so hit-testing on with it would paint the wrong cells.
import { cfg, dragStartPx, type GameConfig } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import { CellState, type PaintMode } from '../../game/types';
import { cellsAlongSegment, hitTest, type BoardGeometry } from './layout';

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
  /** Monotonic ms clock for the double-tap window and cell lock (default performance.now). Tests inject one. */
  now?(): number;
  /** Config variant (tests). */
  config?: GameConfig;
}

interface Stream {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly cell: CellIndex;
  readonly geo: BoardGeometry;
  dragging: boolean;
  mode: PaintMode;
  last: CellIndex;
  readonly visited: Set<CellIndex>;
}

/** performance.now(), or Date.now() where it is missing (also the keyboard's cell-lock clock). */
export const defaultNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Attaches Pointer Event listeners (touch-action: none on boardEl). Returns detach(). */
export function attachGestures(boardEl: HTMLElement, cb: GestureCallbacks, opts: GestureOptions): () => void {
  const c = opts.config ?? cfg;
  const now = opts.now ?? defaultNow;
  let stream: Stream | null = null;
  let pending: { cell: CellIndex; t: number } | null = null;
  const lockedUntil = new Map<CellIndex, number>();

  const prevTouchAction = boardEl.style.touchAction;
  boardEl.style.touchAction = 'none';

  const release = (id: number): void => {
    try {
      if (boardEl.hasPointerCapture?.(id)) boardEl.releasePointerCapture(id);
    } catch {
      /* capture already gone */
    }
  };

  const reset = (): void => {
    if (stream) release(stream.id);
    stream = null;
  };

  const onDown = (e: PointerEvent): void => {
    if (e.isPrimary === false) return; // extra fingers are ignored (02 §6.1)
    if (stream) return; // one tracked pointer at a time
    if (e.pointerType === 'mouse' && e.button !== 0) return; // right/middle click: no action (02 §6.3)
    if (opts.isLocked()) return;
    const geo = opts.geometry();
    if (geo.n <= 0 || geo.slot <= 0) return;
    const cell = hitTest(e.clientX, e.clientY, geo);
    stream = { id: e.pointerId, x: e.clientX, y: e.clientY, cell, geo, dragging: false, mode: 'mark', last: cell, visited: new Set([cell]) };
    try {
      boardEl.setPointerCapture?.(e.pointerId);
    } catch {
      /* jsdom / pointer already released */
    }
  };

  const onMove = (e: PointerEvent): void => {
    const s = stream;
    if (!s || e.pointerId !== s.id) return;
    if (opts.isLocked()) return reset();
    if (!s.dragging) {
      const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      if (dist < dragStartPx(s.geo.slot, c)) return;
      s.dragging = true;
      pending = null; // a drag cancels the double-tap window
      s.mode = opts.cellState(s.cell) === CellState.Mark ? 'erase' : 'mark';
      const cur = hitTest(e.clientX, e.clientY, s.geo);
      const batch = [s.cell];
      for (const cell of cellsAlongSegment(s.cell, cur, s.geo.n)) {
        if (!s.visited.has(cell)) batch.push(cell);
        s.visited.add(cell);
      }
      s.last = cur;
      cb.paint(batch, s.mode);
      return;
    }
    const cur = hitTest(e.clientX, e.clientY, s.geo);
    if (cur === s.last) return;
    const batch: CellIndex[] = [];
    for (const cell of cellsAlongSegment(s.last, cur, s.geo.n)) {
      if (!s.visited.has(cell)) batch.push(cell);
      s.visited.add(cell);
    }
    s.last = cur;
    if (batch.length) cb.paint(batch, s.mode);
  };

  const onUp = (e: PointerEvent): void => {
    const s = stream;
    if (!s || e.pointerId !== s.id) return;
    reset();
    if (s.dragging || opts.isLocked()) return;
    const cell = s.cell;
    const t = now();
    const until = lockedUntil.get(cell);
    if (until !== undefined) {
      if (t < until) return; // cellLockAfterCatMs: a triple tap must not undo the cat
      lockedUntil.delete(cell);
    }
    if (pending && pending.cell === cell && t - pending.t <= c.input.doubleTapMs) {
      pending = null;
      lockedUntil.set(cell, t + c.input.cellLockAfterCatMs);
      cb.doubleTap(cell);
    } else {
      pending = { cell, t };
      cb.tap(cell);
    }
  };

  const onCancel = (e: PointerEvent): void => {
    if (stream && e.pointerId === stream.id) reset(); // ends a drag without a tap
  };

  const onContext = (e: Event): void => e.preventDefault();
  const onResize = (): void => reset();
  const win = boardEl.ownerDocument.defaultView;
  const viewports: EventTarget[] = [];
  if (win) viewports.push(win);
  if (win?.visualViewport) viewports.push(win.visualViewport);
  for (const t of viewports) t.addEventListener('resize', onResize);

  boardEl.addEventListener('pointerdown', onDown);
  boardEl.addEventListener('pointermove', onMove);
  boardEl.addEventListener('pointerup', onUp);
  boardEl.addEventListener('pointercancel', onCancel);
  boardEl.addEventListener('contextmenu', onContext);

  return () => {
    reset();
    for (const t of viewports) t.removeEventListener('resize', onResize);
    boardEl.removeEventListener('pointerdown', onDown);
    boardEl.removeEventListener('pointermove', onMove);
    boardEl.removeEventListener('pointerup', onUp);
    boardEl.removeEventListener('pointercancel', onCancel);
    boardEl.removeEventListener('contextmenu', onContext);
    boardEl.style.touchAction = prevTouchAction;
  };
}
