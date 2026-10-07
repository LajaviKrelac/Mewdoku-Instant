// Owner: ui-board
// Pure sizing math (02 §19), region-aware insets (02 §17.4), hit-testing and drag interpolation
// (02 §6.1, 04 §5.4). No DOM access except readViewport().
import type { CellIndex } from '../../engine/types';

export interface LayoutInput {
  /** visualViewport width/height in CSS px. */
  readonly vw: number;
  readonly vh: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly n: number;
}

/** Result of the 02 §19 formulas. All values in CSS px. */
export interface GameLayout {
  readonly colW: number;
  readonly compact: boolean; // vh < layout.compactHeight → 36 px pills/chips, chip text hidden
  readonly topBar: number;
  readonly pills: number;
  readonly chips: number;
  readonly tools: number; // 64 + 16 + safeBottom
  readonly boardMax: number;
  readonly pad: number;
  readonly slot: number; // floor((boardMax − 2·pad) / n)
  readonly board: number; // slot·n + 2·pad
}

export function computeLayout(input: LayoutInput): GameLayout {
  throw new Error('not implemented: computeLayout');
}

/** Inset of a tile inside its slot per side: 1.5 px toward the same region, 3.5 px toward another (or the edge). */
export interface CellInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export function regionInsets(n: number, regions: Uint8Array): CellInsets[] {
  throw new Error('not implemented: regionInsets');
}

/** Where the board's cell grid sits on screen. left/top = client coords of the card's outer corner. */
export interface BoardGeometry {
  readonly left: number;
  readonly top: number;
  readonly pad: number;
  readonly slot: number;
  readonly n: number;
}

/** Cell under a client point; the gap belongs to the nearest cell; clamped to the grid (02 §6.1). */
export function hitTest(clientX: number, clientY: number, g: BoardGeometry): CellIndex {
  throw new Error('not implemented: hitTest');
}

/** Cells crossed going from `from` (exclusive) to `to` (inclusive), cell by cell (no skipped cells). */
export function cellsAlongSegment(from: CellIndex, to: CellIndex, n: number): CellIndex[] {
  throw new Error('not implemented: cellsAlongSegment');
}

export interface ViewportInfo {
  readonly vw: number;
  readonly vh: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly safeLeft: number;
  readonly safeRight: number;
}

/** visualViewport (falling back to innerWidth/innerHeight) plus env(safe-area-inset-*) via a probe. */
export function readViewport(win?: Window): ViewportInfo {
  throw new Error('not implemented: readViewport');
}
