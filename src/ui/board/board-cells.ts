// Owner: A (Phase 2b); G2 (Phase 2d: the X is two white rounded bars, look-spec §1.10)
// Cell DOM for the board (04 §5.3, 02 §17.4, §18): one <button class="cell"> per cell holding a
// coloured tile (inset gap / 2 on every side, look-spec §1.8) and one inline SVG with the X, plus
// the cat, blink lid and pattern glyph <use>s created on demand. State lives in data-s (e|m|c|w|g).
// The X (look-spec §1.10, measured): two white rounded rects (.cell__x) in g.cell__xg (the pop
// scales the group), layout.mark.armFraction long and barFraction thick on the slot's 100-unit box,
// corner cornerFraction, rotated ±45° about the centre. Under them two edge rects (.cell__xe), grown by
// edgeFraction per side and filled with --xe (the tile mixed toward --ink-deep, xEdgeColor), drawn
// only with Colour patterns on (board.css, D-2d-5). Default: plain white, as the original.
// Two inert nodes B animates (phase2b §12.3 A → B), styled in board.css: `span.cell__glow` behind the
// cat (every cell; the solved-board glow) and `use.cell__ear` (href #cat-ear-flick) in the cat group
// (every cat cell; shown only on .cell.is-flick).
// PERF-1 (2b review): per-cell custom properties sit on the element that reads them, not on the
// <button>: an inline custom property on the button is inherited by every node below it, so a 12×12
// board had ~1 400 nodes with their own variable sets and any board-level change (the entry, inert,
// a slot) restyled all of them (400 → 60 ms at 4× CPU). The tile carries --c and --diag, the cat SVG
// --diag and --breathe-delay (board-view), the blink lid --blink-dur / --blink-delay; --xe stays on the
// button (the two edge strokes and A's tests read it there); the even insets are board-level
// (board-view). --diag, --breathe-delay and the blink pair are registered as NON-inherited
// (registerCellProperties; their initial values equal the CSS fallbacks), so they never reach a
// descendant either. --row was never read by any rule and is gone.
import { cfg } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import { CellState } from '../../game/types';
import { colorName, glyphName, t } from '../../i18n';
import { xEdgeColor } from '../art/palette';
import { markRects } from '../art/sprite';
import type { CatMood } from './board-types';
import type { CellInsets } from './layout';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** data-s letters per CellState (04 §5.3). */
export const STATE_CODE: Readonly<Record<number, string>> = {
  [CellState.Empty]: 'e',
  [CellState.Mark]: 'm',
  [CellState.Cat]: 'c',
  [CellState.Wrong]: 'w',
  [CellState.Given]: 'g',
};

const STATE_LABEL = {
  [CellState.Empty]: 'a11y.cell.empty',
  [CellState.Mark]: 'a11y.cell.mark',
  [CellState.Cat]: 'a11y.cell.cat',
  [CellState.Wrong]: 'a11y.cell.wrong',
  [CellState.Given]: 'a11y.cell.given',
} as const;

export interface CellRefs {
  readonly el: HTMLButtonElement;
  readonly tile: HTMLElement;
  readonly svg: SVGSVGElement;
  /** The cell index (the blink lid's per-cat timing comes from it). */
  readonly index: CellIndex;
  cat: SVGUseElement | null;
  pattern: SVGUseElement | null;
}

/**
 * The per-cell custom properties that must not inherit (PERF-1): registered once per document with
 * inherits: false and the initial value of their CSS fallback (fx.css `var(--diag, 0)`,
 * `var(--breathe-delay, 0ms)`; board.css `var(--blink-dur, 5s) var(--blink-delay, 0ms)`), so every
 * rule computes exactly what it did before. Without CSS.registerProperty (older engines, jsdom) they
 * inherit as before: same look, slower restyles.
 */
export const CELL_PROPERTIES: readonly { readonly name: string; readonly syntax: string; readonly initialValue: string }[] = [
  { name: '--diag', syntax: '<number>', initialValue: '0' },
  { name: '--breathe-delay', syntax: '<time>', initialValue: '0ms' },
  { name: '--blink-dur', syntax: '<time>', initialValue: '5s' },
  { name: '--blink-delay', syntax: '<time>', initialValue: '0ms' },
];

let registered = false;

/** Registers CELL_PROPERTIES (once; an engine that already has one, or lacks the API, is fine). */
export function registerCellProperties(): void {
  if (registered) return;
  registered = true;
  const api = (globalThis as { CSS?: { registerProperty?: (d: PropertyDefinition) => void } }).CSS;
  if (typeof api?.registerProperty !== 'function') return;
  for (const p of CELL_PROPERTIES) {
    try {
      api.registerProperty({ name: p.name, syntax: p.syntax, inherits: false, initialValue: p.initialValue });
    } catch {
      // already registered (a second app instance, HMR): the first registration stands
    }
  }
}

/** The blink lid's period and phase for a cell (fx.catBlinkMinMs…MaxMs, a stable per-cell phase). */
export function blinkTiming(cell: CellIndex): { readonly dur: string; readonly delay: string } {
  const span = cfg.fx.catBlinkMaxMs - cfg.fx.catBlinkMinMs;
  return {
    dur: `${Math.round(cfg.fx.catBlinkMinMs + cellNoise(cell, 1) * span)}ms`,
    delay: `${-Math.round(cellNoise(cell, 2) * cfg.fx.catBlinkMaxMs)}ms`,
  };
}

/** Colour name for a palette index, with its glyph name when patterns are on (02 §18). */
export function colourLabel(paletteIndex: number, patterns: boolean): string {
  const color = colorName(paletteIndex);
  return patterns ? t('unit.colorWithGlyph', { color, glyph: glyphName(paletteIndex) }) : color;
}

export function cellLabel(cell: CellIndex, n: number, paletteIndex: number, state: number, patterns: boolean): string {
  const key = STATE_LABEL[state as CellState] ?? 'a11y.cell.empty';
  return t('a11y.cell', {
    row: Math.floor(cell / n) + 1,
    col: (cell % n) + 1,
    color: colourLabel(paletteIndex, patterns),
    state: t(key),
  });
}

/** A seeded-per-cell pseudo-random in [0, 1) so blink timings differ per cat but stay stable. */
function cellNoise(cell: CellIndex, salt: number): number {
  let x = (cell + 1) * 2654435761 + salt * 40503;
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * One cell. `insets`: the tile insets for a cell outside a board (a board sets them once on itself,
 * PERF-1, and passes null). `diag`: the entry wave's diagonal r + c (fx.css), on the tile and the SVG.
 */
export function buildCell(cell: CellIndex, paletteIndex: number, insets: CellInsets | null = null, diag = 0): CellRefs {
  registerCellProperties();
  const doc = document;
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'cell';
  el.setAttribute('role', 'gridcell');
  el.tabIndex = -1;
  el.dataset.i = String(cell);
  el.dataset.s = 'e';
  el.style.setProperty('--xe', xEdgeColor(paletteIndex));
  if (insets) {
    el.style.setProperty('--it', `${insets.top}px`);
    el.style.setProperty('--ir', `${insets.right}px`);
    el.style.setProperty('--ib', `${insets.bottom}px`);
    el.style.setProperty('--il', `${insets.left}px`);
  }

  const tile = doc.createElement('span');
  tile.className = 'cell__tile';
  tile.style.setProperty('--c', `var(--r${paletteIndex})`);
  tile.style.setProperty('--diag', String(diag));
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cell__g');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.setProperty('--diag', String(diag));
  svg.appendChild(markGroup(doc));
  // phase2b §2.2 glow node (inert until B animates it; A styles it in board.css).
  const glow = doc.createElement('span');
  glow.className = 'cell__glow';
  glow.setAttribute('aria-hidden', 'true');
  el.append(tile, glow, svg);
  return { el, tile, svg, index: cell, cat: null, pattern: null };
}

/** One decimal, no trailing zero (compact attribute values). */
const num = (v: number): string => String(Math.round(v * 10) / 10);

/** g.cell__xg: two edge rects (.cell__xe, shown with Colour patterns on) under the two white bars (.cell__x). */
function markGroup(doc: Document): SVGGElement {
  const g = doc.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'cell__xg');
  const { bar, edge } = markRects();
  for (const [cls, b] of [['cell__xe', edge], ['cell__x', bar]] as const) {
    for (const deg of [45, -45]) {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', cls);
      rect.setAttribute('x', num(b[0] as number));
      rect.setAttribute('y', num(b[1] as number));
      rect.setAttribute('width', num(b[2] as number));
      rect.setAttribute('height', num(b[3] as number));
      rect.setAttribute('rx', num(b[4] as number));
      rect.setAttribute('transform', `rotate(${deg} 50 50)`);
      g.appendChild(rect);
    }
  }
  return g;
}

function makeUse(cls: string, href: string, box: readonly [number, number, number]): SVGUseElement {
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('class', cls);
  use.setAttribute('href', href);
  use.setAttribute('x', String(box[0]));
  use.setAttribute('y', String(box[1]));
  use.setAttribute('width', String(box[2]));
  use.setAttribute('height', String(box[2]));
  return use;
}

/** The cat <use> (0.84 × cell, phase2b §1.5) plus its blink lid and ear-flick overlay; created the first time a cell needs a cat. */
export function ensureCat(refs: CellRefs, mood: CatMood): SVGUseElement {
  if (refs.cat) return refs.cat;
  const size = Math.round(cfg.layout.catScale * 100);
  const off = (100 - size) / 2;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'cell__catg');
  const cat = makeUse('cell__cat', `#cat-${mood}`, [off, off, size]);
  const blink = makeUse('cell__blink', '#cat-blink', [off, off, size]);
  // The lid's own timing (board.css .cell__blink animation), on the lid itself (PERF-1).
  const bt = blinkTiming(refs.index);
  blink.style.setProperty('--blink-dur', bt.dur);
  blink.style.setProperty('--blink-delay', bt.delay);
  // phase2b §2.9 ear flick overlay: hidden unless the cell has .is-flick (B toggles it).
  const ear = makeUse('cell__ear', '#cat-ear-flick', [off, off, size]);
  g.append(cat, blink, ear);
  refs.svg.appendChild(g);
  refs.cat = cat;
  return cat;
}

export function setCatMood(refs: CellRefs, mood: CatMood): void {
  const href = `#cat-${mood}`;
  if (refs.cat && refs.cat.getAttribute('href') !== href) refs.cat.setAttribute('href', href);
}

/** The colour-pattern glyph (22 % of the cell, top-left corner of the tile, 02 §18). */
export function ensurePattern(refs: CellRefs, paletteIndex: number): void {
  if (refs.pattern) return;
  const size = Math.round(cfg.layout.patternScale * 100);
  const use = makeUse('cell__pat', `#glyph-${paletteIndex}`, [12, 12, size]);
  refs.svg.insertBefore(use, refs.svg.firstChild);
  refs.pattern = use;
}
