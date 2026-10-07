// Owner: ui-board
// Keyboard play (02 §6.3, §18): roving tabindex on the cell buttons, arrows move, Space = tap,
// Enter = double-tap, H = hint, K = kitty. Esc is handled globally by the router.
import type { CellIndex } from '../../engine/types';

export interface KeyboardCallbacks {
  tap(cell: CellIndex): void;
  doubleTap(cell: CellIndex): void;
  bulb(): void;
  paw(): void;
}

export interface KeyboardOptions {
  readonly n: number;
  cellElement(cell: CellIndex): HTMLElement | null;
  isLocked(): boolean;
}

export interface KeyboardHandle {
  focused(): CellIndex;
  /** Moves the roving tabindex (and DOM focus when `focusDom`). */
  focus(cell: CellIndex, focusDom?: boolean): void;
  detach(): void;
}

export function attachKeyboard(boardEl: HTMLElement, cb: KeyboardCallbacks, opts: KeyboardOptions): KeyboardHandle {
  throw new Error('not implemented: attachKeyboard');
}
