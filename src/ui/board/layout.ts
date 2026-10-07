// Owner: ui-board
// Pure sizing math (02 §19), region-aware insets (02 §17.4), hit-testing and drag interpolation
// (02 §6.1, 04 §5.4). No DOM access except readViewport().
import { cfg, type GameConfig } from '../../app/config';
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

/**
 * 02 §19:
 *   colW = min(W − 2·gutter, 480); boardMax = min(colW, H − safeTop − topBar − pills − chips − tools − 12·4)
 *   slot = floor((boardMax − 2·pad) / N); board = slot·N + 2·pad; compact = H < 640.
 * Degenerate viewports clamp the slot to ≥ 1 px so callers never see 0 or negative sizes.
 */
export function computeLayout(input: LayoutInput, c: GameConfig = cfg): GameLayout {
  const L = c.layout;
  const n = Math.max(1, Math.floor(input.n));
  const safeTop = Math.max(0, input.safeTop || 0);
  const safeBottom = Math.max(0, input.safeBottom || 0);
  const colW = Math.max(0, Math.min(input.vw - 2 * L.gutter, L.colMax));
  const compact = input.vh < L.compactHeight;
  const topBar = L.topBar;
  const pills = compact ? L.compactPills : L.pills;
  const chips = compact ? L.compactChips : L.chips;
  const tools = L.tools + L.toolsGap + safeBottom;
  const vGaps = L.vGap * L.vGapCount;
  const boardMax = Math.max(0, Math.min(colW, input.vh - safeTop - topBar - pills - chips - tools - vGaps));
  const pad = L.boardPad;
  const slot = Math.max(1, Math.floor((boardMax - 2 * pad) / n));
  const board = slot * n + 2 * pad;
  return { colW, compact, topBar, pills, chips, tools, boardMax, pad, slot, board };
}

/** Inset of a tile inside its slot per side: 1.5 px toward the same region, 3.5 px toward another (or the edge). */
export interface CellInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export function regionInsets(n: number, regions: Uint8Array, c: GameConfig = cfg): CellInsets[] {
  const same = c.layout.insetSamePx;
  const diff = c.layout.insetDiffPx;
  const out: CellInsets[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const col = i % n;
    const g = regions[i];
    const side = (rr: number, cc: number): number =>
      rr >= 0 && rr < n && cc >= 0 && cc < n && regions[rr * n + cc] === g ? same : diff;
    out.push({ top: side(r - 1, col), right: side(r, col + 1), bottom: side(r + 1, col), left: side(r, col - 1) });
  }
  return out;
}

/** Where the board's cell grid sits on screen. left/top = client coords of the card's outer corner. */
export interface BoardGeometry {
  readonly left: number;
  readonly top: number;
  readonly pad: number;
  readonly slot: number;
  readonly n: number;
}

function clampIndex(v: number, n: number): number {
  return v < 0 ? 0 : v >= n ? n - 1 : v;
}

/** Cell under a client point; the gap belongs to the nearest cell; clamped to the grid (02 §6.1). */
export function hitTest(clientX: number, clientY: number, g: BoardGeometry): CellIndex {
  const slot = g.slot > 0 ? g.slot : 1;
  // Insets are symmetric across every slot boundary (1.5|1.5 or 3.5|3.5), so the slot edge is the
  // midpoint of each gap and floor() assigns each half-gap to its nearest tile.
  const col = clampIndex(Math.floor((clientX - g.left - g.pad) / slot), g.n);
  const row = clampIndex(Math.floor((clientY - g.top - g.pad) / slot), g.n);
  return row * g.n + col;
}

/**
 * Cells crossed going from `from` (exclusive) to `to` (inclusive), cell by cell (no skipped cells).
 * A DDA walk between cell centres: every step moves to a king-adjacent cell, so a fast swipe that
 * jumps several cells between two pointermove events still paints every cell on its path.
 */
export function cellsAlongSegment(from: CellIndex, to: CellIndex, n: number): CellIndex[] {
  if (from === to) return [];
  const r0 = Math.floor(from / n);
  const c0 = from % n;
  const r1 = Math.floor(to / n);
  const c1 = to % n;
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  const out: CellIndex[] = [];
  let prev = from;
  for (let k = 1; k <= steps; k++) {
    const r = Math.round(r0 + ((r1 - r0) * k) / steps);
    const c = Math.round(c0 + ((c1 - c0) * k) / steps);
    const cell = r * n + c;
    if (cell !== prev) out.push(cell);
    prev = cell;
  }
  return out;
}

export interface ViewportInfo {
  readonly vw: number;
  readonly vh: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly safeLeft: number;
  readonly safeRight: number;
}

const probes = new WeakMap<Document, HTMLElement>();

function safeAreaProbe(doc: Document): HTMLElement | null {
  let probe = probes.get(doc) ?? null;
  if (probe && probe.isConnected) return probe;
  if (!doc.body) return null;
  probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
  doc.body.appendChild(probe);
  probes.set(doc, probe);
  return probe;
}

function px(v: string | null | undefined): number {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
}

/** visualViewport (falling back to innerWidth/innerHeight) plus env(safe-area-inset-*) via a probe. */
export function readViewport(win: Window = window): ViewportInfo {
  const vv = win.visualViewport;
  const vw = vv && vv.width > 0 ? vv.width : win.innerWidth;
  const vh = vv && vv.height > 0 ? vv.height : win.innerHeight;
  const probe = safeAreaProbe(win.document);
  const cs = probe ? win.getComputedStyle(probe) : null;
  return {
    vw,
    vh,
    safeTop: px(cs?.paddingTop),
    safeBottom: px(cs?.paddingBottom),
    safeLeft: px(cs?.paddingLeft),
    safeRight: px(cs?.paddingRight),
  };
}
