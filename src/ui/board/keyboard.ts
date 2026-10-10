// Owner: B (Phase 2b; was ui-board); G2 (Phase 2d: M = the mouse helper)
// Keyboard play (02 §6.3, §18): roving tabindex on the cell buttons, arrows move, Space = tap,
// Enter = double-tap, H = hint, K = kitty, M = mouse (Phase 2d, look-spec §1.11: forwarded to
// BoardInput.mouse, which the screen ignores while the mouse is not shown and enabled). Esc is handled
// globally by the router.
// Like a pointer double-tap, Enter locks its cell for input.cellLockAfterCatMs (02 §6.2): a quick
// second Enter (or Space) must not undo the cat that was just placed.
import { cfg, type GameConfig } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import { defaultNow } from './gestures';

export interface KeyboardCallbacks {
  tap(cell: CellIndex): void;
  doubleTap(cell: CellIndex): void;
  bulb(): void;
  paw(): void;
  /** Phase 2d: the M key (optional until I-3, like BoardInput.mouse). */
  mouse?(): void;
}

export interface KeyboardOptions {
  readonly n: number;
  cellElement(cell: CellIndex): HTMLElement | null;
  isLocked(): boolean;
  /** Monotonic ms clock for the cell lock (default performance.now, as in gestures). Tests inject one. */
  now?(): number;
  /** Config variant (tests). */
  config?: GameConfig;
}

export interface KeyboardHandle {
  focused(): CellIndex;
  /** Moves the roving tabindex (and DOM focus when `focusDom`). */
  focus(cell: CellIndex, focusDom?: boolean): void;
  detach(): void;
}

/** data-i on each cell button carries its index (set by board-view). */
function cellIndexOf(el: EventTarget | null, boardEl: HTMLElement): CellIndex | null {
  if (!(el instanceof Element)) return null;
  const cellEl = el.closest<HTMLElement>('[data-i]');
  if (!cellEl || !boardEl.contains(cellEl)) return null;
  const i = Number(cellEl.dataset.i);
  return Number.isInteger(i) ? i : null;
}

export function attachKeyboard(boardEl: HTMLElement, cb: KeyboardCallbacks, opts: KeyboardOptions): KeyboardHandle {
  const n = opts.n;
  const total = n * n;
  const now = opts.now ?? defaultNow;
  let current: CellIndex = 0;
  /** The cell of the last Enter and when its cellLockAfterCatMs ends. */
  let lock = { cell: -1, until: 0 };

  const focus = (cell: CellIndex, focusDom = false): void => {
    const next = Math.max(0, Math.min(total - 1, cell));
    if (next !== current) opts.cellElement(current)?.setAttribute('tabindex', '-1');
    current = next;
    const el = opts.cellElement(current);
    if (!el) return;
    el.setAttribute('tabindex', '0');
    if (focusDom) el.focus({ preventScroll: true });
  };

  // Initial roving state: only the first cell is in the tab order.
  for (let i = 0; i < total; i++) opts.cellElement(i)?.setAttribute('tabindex', i === 0 ? '0' : '-1');

  const onKey = (e: KeyboardEvent): void => {
    // Keyboard in use on this board: from now on its focus ring shows on touch-first devices too (board.css).
    if (boardEl.dataset.kbd === undefined) boardEl.dataset.kbd = '';
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const fromCell = cellIndexOf(e.target, boardEl);
    if (fromCell !== null && fromCell !== current) focus(fromCell);
    const r = Math.floor(current / n);
    const c = current % n;
    let move: CellIndex | null = null;
    switch (e.key) {
      case 'ArrowUp':
      case 'Up':
        move = r > 0 ? current - n : current;
        break;
      case 'ArrowDown':
      case 'Down':
        move = r < n - 1 ? current + n : current;
        break;
      case 'ArrowLeft':
      case 'Left':
        move = c > 0 ? current - 1 : current;
        break;
      case 'ArrowRight':
      case 'Right':
        move = c < n - 1 ? current + 1 : current;
        break;
      case 'Home':
        move = e.shiftKey ? 0 : r * n;
        break;
      case 'End':
        move = e.shiftKey ? total - 1 : r * n + n - 1;
        break;
      default:
        break;
    }
    if (move !== null) {
      e.preventDefault();
      focus(move, true);
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const act = key === ' ' || key === 'Spacebar' ? 'tap' : key === 'Enter' ? 'double' : key === 'h' ? 'bulb' : key === 'k' ? 'paw' : key === 'm' && cb.mouse ? 'mouse' : null;
    if (!act) return;
    e.preventDefault(); // no page scroll on Space, no synthetic click on Enter
    if (e.repeat || opts.isLocked()) return;
    if (act === 'tap' || act === 'double') {
      const t = now();
      if (lock.cell === current && t < lock.until) return;
      if (act === 'double') lock = { cell: current, until: t + (opts.config ?? cfg).input.cellLockAfterCatMs };
    }
    if (act === 'tap') cb.tap(current);
    else if (act === 'double') cb.doubleTap(current);
    else if (act === 'bulb') cb.bulb();
    else if (act === 'mouse') cb.mouse?.();
    else cb.paw();
  };

  // Clicking or tapping a cell moves the roving tabindex there, so Tab returns to it.
  const onFocusIn = (e: FocusEvent): void => {
    const i = cellIndexOf(e.target, boardEl);
    if (i !== null && i !== current) focus(i);
  };

  boardEl.addEventListener('keydown', onKey);
  boardEl.addEventListener('focusin', onFocusIn);

  return {
    focused: () => current,
    focus,
    detach() {
      boardEl.removeEventListener('keydown', onKey);
      boardEl.removeEventListener('focusin', onFocusIn);
    },
  };
}
