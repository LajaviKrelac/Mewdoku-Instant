// Owner: ui-board
// Cell DOM for the board (04 §5.3, 02 §17.4, §18): one <button class="cell"> per cell holding a
// coloured tile (inset per region-aware gaps) and one inline SVG with the X strokes, plus the cat,
// blink lid and pattern glyph <use>s created on demand. State lives in data-s (e|m|c|w|g).
import { cfg } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import { CellState } from '../../game/types';
import { colorName, glyphName, t } from '../../i18n';
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
  cat: SVGUseElement | null;
  pattern: SVGUseElement | null;
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

export function buildCell(cell: CellIndex, paletteIndex: number, insets: CellInsets, rowIndex: number): CellRefs {
  const doc = document;
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'cell';
  el.setAttribute('role', 'gridcell');
  el.tabIndex = -1;
  el.dataset.i = String(cell);
  el.dataset.s = 'e';
  const st = el.style;
  st.setProperty('--c', `var(--r${paletteIndex})`);
  st.setProperty('--it', `${insets.top}px`);
  st.setProperty('--ir', `${insets.right}px`);
  st.setProperty('--ib', `${insets.bottom}px`);
  st.setProperty('--il', `${insets.left}px`);
  st.setProperty('--row', String(rowIndex));
  const span = cfg.fx.catBlinkMaxMs - cfg.fx.catBlinkMinMs;
  st.setProperty('--blink-dur', `${Math.round(cfg.fx.catBlinkMinMs + cellNoise(cell, 1) * span)}ms`);
  st.setProperty('--blink-delay', `${-Math.round(cellNoise(cell, 2) * cfg.fx.catBlinkMaxMs)}ms`);

  const tile = doc.createElement('span');
  tile.className = 'cell__tile';
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cell__g');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const a = Math.round(((1 - cfg.layout.markScale) / 2) * 100); // 52 % of the cell → 24..76
  const b = 100 - a;
  for (const d of [`M${a} ${a} ${b} ${b}`, `M${b} ${a} ${a} ${b}`]) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('class', 'cell__x');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  el.append(tile, svg);
  return { el, tile, svg, cat: null, pattern: null };
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

/** The cat <use> (0.82 × cell, 02 §17.3) plus its blink lid; created the first time a cell needs a cat. */
export function ensureCat(refs: CellRefs, mood: CatMood): SVGUseElement {
  if (refs.cat) return refs.cat;
  const size = Math.round(cfg.layout.catScale * 100);
  const off = (100 - size) / 2;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'cell__catg');
  const cat = makeUse('cell__cat', `#cat-${mood}`, [off, off, size]);
  const blink = makeUse('cell__blink', '#cat-blink', [off, off, size]);
  g.append(cat, blink);
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
