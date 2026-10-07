// Owner: ui-board
// One hidden inline SVG sprite of <symbol>s (04 §5.3): cat moods, X, wrong-X, 12 pattern glyphs and
// our icon set (02 §17.6). All drawn by us on a 24 px grid.

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
export type SymbolId = CatSymbol | IconSymbol | GlyphSymbol | 'mark-x' | 'wrong-x';

/** id of the sprite's <svg> element. */
export const SPRITE_ID = 'mewdoku-sprite';

/** Inserts the sprite once at the start of <body> (idempotent). Boot calls it before any view. */
export function mountSprite(doc?: Document): void {
  throw new Error('not implemented: mountSprite');
}

/** `<svg><use href="#id"></svg>`: aria-hidden unless `label` is given (then role="img" + aria-label). */
export function icon(id: SymbolId, opts?: { class?: string; label?: string }): SVGSVGElement {
  throw new Error('not implemented: icon');
}
