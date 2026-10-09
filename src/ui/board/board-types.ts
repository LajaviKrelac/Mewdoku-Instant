// Owner: B (Phase 2b)
// Board view contract types (04 §5.3), re-exported by board-view.ts (the module callers import).
import type { CellIndex, HintStep, PuzzleId } from '../../engine/types';
import type { EventAccessory } from '../../game/events';
import type { GameEvent, PaintMode } from '../../game/types';
import type { BoardGeometry } from './layout';

export interface BoardModel {
  /** A change of puzzleId (or n/regions/colors reference) rebuilds the grid; otherwise cells are diffed. */
  readonly puzzleId: PuzzleId;
  readonly n: number;
  readonly regions: Uint8Array;
  /** Palette index per region label (ui/art/palette.ts regionColorsFor). */
  readonly colors: Uint8Array;
  readonly cells: Readonly<Uint8Array>;
  readonly regionsDone: number;
  /** Colour patterns setting (02 §18). */
  readonly patterns: boolean;
}

export type CatMood = 'idle' | 'happy' | 'sad' | 'surprised';

/** Dim everything except the focus (O1 hint, O8 coach). */
export type BoardHighlight =
  | { readonly kind: 'hint'; readonly step: HintStep } // focus outlined; effect cells show ghost Xs / ghost clear; placeCell a ghost cat
  | { readonly kind: 'coach'; readonly cells: readonly CellIndex[] }; // pulsing outline on the focus cells

/** Board input, wired to the session by game-screen. Keyboard H/K map to bulb/paw. */
export interface BoardInput {
  tap(cell: CellIndex): void;
  doubleTap(cell: CellIndex): void;
  paint(cells: CellIndex[], mode: PaintMode): void;
  bulb(): void;
  paw(): void;
}

export interface BoardViewOptions {
  reducedMotion(): boolean;
  /** Ear-flick intervals after the first (phase2b §2.9); default Math.random. Tests pass a fixed one. */
  random?(): number;
}

export interface BoardView {
  /** The board card element (role="grid"); game-screen places it. */
  readonly el: HTMLElement;
  update(model: BoardModel): void;
  /** Slot size from layout.computeLayout (re-applied on resize). */
  setSlot(slotPx: number): void;
  geometry(): BoardGeometry;
  cellElement(cell: CellIndex): HTMLElement | null;
  /** Client rect of a cell's tile (coach positioning). */
  cellRect(cell: CellIndex): DOMRect | null;
  setHighlight(h: BoardHighlight | null): void;
  /** Input lock (02 §6.4): gestures/keyboard ignored, aria-disabled set. */
  setLocked(locked: boolean): void;
  setMood(mood: CatMood): void;
  /** Event mode (phase2b §4.4): layer the accessory symbol acc-<name> over every cat; null removes it. */
  setAccessory(accessory: EventAccessory | null): void;
  /**
   * Transient FX for reducer events: MARKED draw-in, CAT_PLACED drop, MISTAKE flash + shake + sad
   * cats for fx.sadCatsMs, REGION_DONE fade, PULSE, WON happy cats after fx.winHappyDelayMs, KITTY sparkle.
   */
  playEvent(ev: GameEvent): void;
  /**
   * Board entry animation (phase2b §2.9: card rise + diagonal tile wave). Returns entryEndMs(n), the
   * ms from now after which the session dispatches START (≤ fx.boardEntryMs; reducedMotionFadeMs with
   * reduced motion). See board-fx.ts entryEndMs.
   */
  playEntry(): number;
  focusCell(cell: CellIndex): void;
  destroy(): void;
}
