// Owner: ui-board
// One hidden inline SVG sprite of <symbol>s (04 §5.3): cat moods, X, wrong-X, 12 pattern glyphs and
// our icon set (02 §17.6). All drawn by us: the cat on a 100-unit grid, icons on a 24 px grid.
import { CAT, catBlink, catHead } from './cat-parts';
import { TOKENS } from './palette';

export type CatSymbol = 'cat-idle' | 'cat-happy' | 'cat-sad' | 'cat-surprised';
export type IconSymbol =
  | 'icon-house'
  | 'icon-gear'
  | 'icon-bulb'
  | 'icon-paw'
  | 'icon-heart'
  | 'icon-heart-empty'
  | 'icon-trophy'
  | 'icon-lock'
  | 'icon-calendar'
  | 'icon-play-video'
  | 'icon-close'
  | 'icon-chevron'
  | 'icon-rule-colours'
  | 'icon-rule-lines'
  | 'icon-rule-space';
export type GlyphIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
/** Pattern glyphs by palette index: dot, ring, triangle, square, diamond, star, plus, bar, chevron, heart, drop, moon (02 §18). */
export type GlyphSymbol = `glyph-${GlyphIndex}`;
/** `cat-blink` is the eyelid overlay the board stacks on idle cats (02 §17.3 blink). */
export type SymbolId = CatSymbol | IconSymbol | GlyphSymbol | 'mark-x' | 'wrong-x' | 'cat-blink';

/** id of the sprite's <svg> element. */
export const SPRITE_ID = 'mewdoku-sprite';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEART = 'M12 20.6C5.4 16.4 2.6 12.6 2.6 8.9 2.6 5.9 4.9 3.6 7.8 3.6 9.6 3.6 11.1 4.5 12 5.9 12.9 4.5 14.4 3.6 16.2 3.6 19.1 3.6 21.4 5.9 21.4 8.9 21.4 12.6 18.6 16.4 12 20.6Z';
const LINE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const SOFT_FILL = 'style="fill:var(--icon-fill,none)"';

const sym = (id: string, viewBox: string, body: string): string => `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`;
const icon24 = (id: IconSymbol, body: string): string => sym(id, '0 0 24 24', body);

function gearPath(): string {
  const pts: string[] = [];
  const at = (r: number, deg: number): string => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  };
  for (let k = 0; k < 8; k++) {
    const a = k * 45;
    pts.push(at(9.6, a - 10), at(9.6, a + 10), at(7.2, a + 17), at(7.2, a + 28));
  }
  return `M${pts.join('L')}Z`;
}

function starPath(cx: number, cy: number, ro: number, ri: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? ri : ro;
    const a = ((-90 + k * 36) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Pattern glyphs (02 §18), filled with currentColor on a 24 grid. */
const GLYPHS: readonly string[] = [
  '<circle cx="12" cy="12" r="5.6"/>',
  '<circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" stroke-width="3"/>',
  '<path d="M12 4.6 19.6 18.2H4.4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  '<rect x="5.6" y="5.6" width="12.8" height="12.8" rx="2"/>',
  '<path d="M12 3.4 20.6 12 12 20.6 3.4 12Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  `<path d="${starPath(12, 12.8, 9.4, 4)}" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`,
  '<path d="M9.8 4.4h4.4v5.4h5.4v4.4h-5.4v5.4H9.8v-5.4H4.4V9.8h5.4z"/>',
  '<rect x="3.8" y="9.3" width="16.4" height="5.4" rx="1.6"/>',
  '<path d="M4.4 16.4 12 8.6l7.6 7.8" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>',
  `<path d="${HEART}"/>`,
  '<path d="M12 3.2C14.6 6.6 18.6 10.8 18.6 14.6A6.6 6.6 0 0 1 5.4 14.6C5.4 10.8 9.4 6.6 12 3.2Z"/>',
  '<path d="M15.2 3.8A8.6 8.6 0 1 0 20.4 16.4 7 7 0 0 1 15.2 3.8Z"/>',
];

function catSymbols(): string {
  return (
    sym('cat-idle', '0 0 100 100', catHead({ eyes: 'open', mouth: 'smile' })) +
    sym('cat-happy', '0 0 100 100', catHead({ eyes: 'happy', mouth: 'open' })) +
    sym('cat-sad', '0 0 100 100', catHead({ eyes: 'sad', mouth: 'frown', ears: 'droop' })) +
    sym('cat-surprised', '0 0 100 100', catHead({ eyes: 'round', mouth: 'o' })) +
    sym('cat-blink', '0 0 100 100', catBlink('fixed'))
  );
}

function markSymbols(): string {
  return (
    sym('mark-x', '0 0 100 100', '<path d="M24 24 76 76M76 24 24 76" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>') +
    sym(
      'wrong-x',
      '0 0 100 100',
      `<circle cx="50" cy="50" r="43" fill="none" style="stroke:var(--wrong,${TOKENS.wrong})" stroke-width="6"/>` +
        `<path d="M29 29 71 71M71 29 29 71" fill="none" style="stroke:var(--wrong,${TOKENS.wrong})" stroke-width="11" stroke-linecap="round"/>`,
    )
  );
}

function iconSymbols(): string {
  return [
    icon24('icon-house', `<path d="M6.2 9.8V18.6a1.6 1.6 0 0 0 1.6 1.6H10v-5h4v5h2.2a1.6 1.6 0 0 0 1.6-1.6V9.8" ${SOFT_FILL}/><path d="M6.2 9.8V18.6a1.6 1.6 0 0 0 1.6 1.6H10v-5h4v5h2.2a1.6 1.6 0 0 0 1.6-1.6V9.8M3.4 11.4 12 4l8.6 7.4" ${LINE}/>`),
    icon24('icon-gear', `<path d="${gearPath()}" ${LINE} ${SOFT_FILL}/><circle cx="12" cy="12" r="3.1" ${LINE}/>`),
    icon24(
      'icon-bulb',
      `<path d="M9 16.4C6.9 15.1 5.6 12.9 5.6 10.4a6.4 6.4 0 0 1 12.8 0c0 2.5-1.3 4.7-3.4 6v1.4H9z" ${LINE} ${SOFT_FILL}/>` +
        `<path d="M9.6 20.6h4.8M8.9 10.2a3.2 3.2 0 0 1 2.6-3" ${LINE}/>`,
    ),
    icon24(
      'icon-paw',
      `<g fill="currentColor"><path d="M12 11.8c-3.4 0-6.2 3.5-6.2 6 0 1.7 1.3 2.6 2.8 2.6 1.4 0 2.1-.8 3.4-.8s2 .8 3.4.8c1.5 0 2.8-.9 2.8-2.6 0-2.5-2.8-6-6.2-6z"/>` +
        `<ellipse cx="5.6" cy="10.4" rx="2" ry="2.6" transform="rotate(-24 5.6 10.4)"/><ellipse cx="9.4" cy="6" rx="2.1" ry="2.8" transform="rotate(-8 9.4 6)"/>` +
        `<ellipse cx="14.6" cy="6" rx="2.1" ry="2.8" transform="rotate(8 14.6 6)"/><ellipse cx="18.4" cy="10.4" rx="2" ry="2.6" transform="rotate(24 18.4 10.4)"/></g>`,
    ),
    icon24('icon-heart', `<path d="${HEART}" fill="currentColor"/><path d="M6.4 7.6A2.4 2.4 0 0 1 8.6 6.2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>`),
    icon24('icon-heart-empty', `<path d="${HEART}" ${LINE} ${SOFT_FILL}/>`),
    icon24(
      'icon-trophy',
      `<path d="M7.4 4.2h9.2v4.6a4.6 4.6 0 0 1-9.2 0z" ${LINE} ${SOFT_FILL}/>` +
        `<path d="M7.4 6H5.6a2.3 2.3 0 0 0 0 4.6h2.2M16.6 6h1.8a2.3 2.3 0 0 1 0 4.6h-2.2M12 13.4v3.2M8.4 20h7.2M9.6 16.6h4.8V20H9.6z" ${LINE}/>`,
    ),
    icon24(
      'icon-lock',
      `<rect x="5.4" y="10.4" width="13.2" height="9.8" rx="2.4" ${LINE} ${SOFT_FILL}/><path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4" ${LINE}/><circle cx="12" cy="15.2" r="1.4" fill="currentColor"/>`,
    ),
    icon24(
      'icon-calendar',
      `<rect x="3.8" y="5.4" width="16.4" height="14.8" rx="2.6" ${LINE} ${SOFT_FILL}/><path d="M3.8 10h16.4M8.4 3.4v3.6M15.6 3.4v3.6" ${LINE}/><rect x="7.6" y="12.8" width="3.6" height="3.6" rx=".9" fill="currentColor"/>`,
    ),
    icon24('icon-play-video', `<rect x="3" y="5.6" width="18" height="12.8" rx="3.2" ${LINE} ${SOFT_FILL}/><path d="M10.2 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`),
    icon24('icon-close', `<path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" ${LINE} stroke-width="2.4"/>`),
    icon24('icon-chevron', `<path d="M9.4 5.8 15.6 12l-6.2 6.2" ${LINE} stroke-width="2.4"/>`),
    icon24(
      'icon-rule-colours',
      `<rect x="2.6" y="4.6" width="9" height="14.8" rx="2.6" style="fill:var(--r7,#B9A7EC)"/><rect x="12.4" y="4.6" width="9" height="14.8" rx="2.6" style="fill:var(--r2,#F2DC7C)"/>` +
        `<circle cx="7.1" cy="12" r="2.2" fill="currentColor"/><circle cx="16.9" cy="12" r="2.2" fill="currentColor"/>`,
    ),
    icon24(
      'icon-rule-lines',
      `<rect x="9" y="2.6" width="6" height="18.8" rx="2.2" style="fill:var(--r6,#9BBDF0)"/><rect x="2.6" y="9" width="18.8" height="6" rx="2.2" style="fill:var(--r6,#9BBDF0)" fill-opacity=".75"/>` +
        `<circle cx="12" cy="12" r="2.4" fill="currentColor"/>`,
    ),
    icon24(
      'icon-rule-space',
      `<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4" style="fill:var(--r4,#8FD6B8)" fill-opacity=".55"/>` +
        `<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.6 2.4"/>` +
        `<circle cx="12" cy="12" r="2.6" fill="currentColor"/>`,
    ),
  ].join('');
}

/** Clip paths that split icon-heart along a zig-zag crack (hud/pills heart crack, 02 §17.5). */
const DEFS =
  '<clipPath id="clip-heart-l"><path d="M0 0H12.6L10.8 7.6 13.4 11.4 10.6 15.2 12.4 24H0Z"/></clipPath>' +
  '<clipPath id="clip-heart-r"><path d="M24 0H12.6L10.8 7.6 13.4 11.4 10.6 15.2 12.4 24H24Z"/></clipPath>';

let cached: string | null = null;

/** The sprite's inner markup (symbols + defs). Built once. */
export function spriteMarkup(): string {
  cached ??=
    `<defs>${DEFS}</defs>` +
    catSymbols() +
    markSymbols() +
    GLYPHS.map((g, i) => sym(`glyph-${i}`, '0 0 24 24', `<g fill="currentColor">${g}</g>`)).join('') +
    iconSymbols();
  return cached;
}

/** Inserts the sprite once at the start of <body> (idempotent). Boot calls it before any view. */
export function mountSprite(doc: Document = document): void {
  if (doc.getElementById(SPRITE_ID)) return;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('id', SPRITE_ID);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  svg.innerHTML = spriteMarkup();
  const body = doc.body ?? doc.documentElement;
  body.insertBefore(svg, body.firstChild);
}

/** `<svg><use href="#id"></svg>`: aria-hidden unless `label` is given (then role="img" + aria-label). */
export function icon(id: SymbolId, opts?: { class?: string; label?: string }): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const kind = id.startsWith('cat-') ? 'cat' : id.startsWith('glyph-') ? 'glyph' : id.startsWith('icon-') ? id.slice(5) : id;
  svg.setAttribute('class', `icon icon-${kind}${opts?.class ? ` ${opts.class}` : ''}`);
  svg.setAttribute('focusable', 'false');
  if (opts?.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

/** Re-points an icon()'s <use> at another symbol (mood swaps, heart full/empty). */
export function setIcon(svg: SVGSVGElement, id: SymbolId): void {
  const use = svg.querySelector('use');
  if (use && use.getAttribute('href') !== `#${id}`) use.setAttribute('href', `#${id}`);
}

/** Cat colours for CSS-free contexts (e.g. the boot splash before styles load). */
export const CAT_FUR = CAT.fur;
