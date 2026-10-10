// Owner: A (Phase 2b); G2 (Phase 2c: icon-fish-empty; the heart icons and their clip paths went;
// Phase 2c.1: icon-points, the level-points sparkle; Phase 2d: the back arrow, the filled gear, the play
// mark, the three helpers' art, the heads' silhouette, the flexed arm and the X's rects, look-spec
// Appendix C, each drawn by us from its written description)
// One hidden inline SVG sprite of <symbol>s (04 §5.3): Tux's moods, the white X with its edge, the
// wrong X, 12 pattern glyphs, our icon set (02 §17.6, phase2b §1.7), the fish and the board cats'
// ear-flick overlay (phase2b §1.6, §2.9). All drawn by us: the cat on a 100-unit grid, icons and the
// fish on a 24 px grid. The cat ids are unchanged (cat-idle, cat-happy, cat-sad, cat-surprised,
// cat-blink) and hold Tux; every <use> keeps working. The event accessories (acc-lantern, acc-scarf,
// acc-yarn) are added to this sprite by art/accessories.ts from the lazy `events` chunk (phase2b §1.6
// bundle column), so they cost the first load nothing.
import { CAT, catBlink, catEarFlick, catHead } from './cat-parts';
import { fishMarkup, fishOutlineMarkup } from './fish';
import { cfg, type GameConfig } from '../../app/config';
import { TOKENS } from './palette';

export type CatSymbol = 'cat-idle' | 'cat-happy' | 'cat-sad' | 'cat-surprised';
/** Phase 2b symbols (phase2b §1.7, §2.9, §4.4); Phase 2c: the empty life (fish-lives-spec §1.2). */
export type FishSymbol = 'icon-fish' | 'icon-fish-empty';
/** The board cats' ear-flick overlay (phase2b §2.9), shown only on `.cell.is-flick`. */
export type CatOverlaySymbol = 'cat-ear-flick';
/** Event accessories layered on the head and pose (phase2b §4.4); mounted lazily by art/accessories.ts. */
export type AccessorySymbol = 'acc-lantern' | 'acc-scarf' | 'acc-yarn';
export type IconSymbol =
  | 'icon-house'
  | 'icon-gear'
  | 'icon-bulb'
  | 'icon-paw'
  | 'icon-trophy'
  | 'icon-lock'
  | 'icon-calendar'
  | 'icon-play-video'
  | 'icon-close'
  | 'icon-chevron'
  // phase2b §1.7: the fish and the new icons (same 24-grid LINE style)
  | 'icon-fish'
  // Phase 2c §1.2: a life that is gone (the lives pill, the victory's kept-fish row)
  | 'icon-fish-empty'
  // Phase 2c.1 §10.2: the level points (the HUD counter, the victory's points row, How to play)
  | 'icon-points'
  | 'icon-plus'
  | 'icon-shop'
  | 'icon-globe'
  | 'icon-crown'
  | 'icon-users'
  // Phase 2d (look-spec §1.4, §1.6, §1.11, §1.14, Appendix C): the back arrow, the video badge's play
  // mark, the three helpers' full-colour art, the heads pill's head and the start toast's arm.
  | 'icon-back'
  | 'icon-play'
  | 'tool-kitty'
  | 'tool-bulb'
  | 'tool-mouse'
  | 'cat-head-flat'
  | 'art-flex';
export type GlyphIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
/** Pattern glyphs by palette index: dot, ring, triangle, square, diamond, star, plus, bar, chevron, heart, drop, moon (02 §18). */
export type GlyphSymbol = `glyph-${GlyphIndex}`;
/** `cat-blink` is the eyelid overlay the board stacks on idle cats (02 §17.3 blink). */
export type SymbolId = CatSymbol | IconSymbol | GlyphSymbol | 'mark-x' | 'cat-blink' | CatOverlaySymbol | AccessorySymbol;

/** id of the sprite's <svg> element. */
export const SPRITE_ID = 'mewdoku-sprite';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The colour-pattern glyph 9 ("heart", 02 §18): a pattern shape, not a life (the lives are fish, Phase 2c). */
const HEART = 'M12 20.6C5.4 16.4 2.6 12.6 2.6 8.9 2.6 5.9 4.9 3.6 7.8 3.6 9.6 3.6 11.1 4.5 12 5.9 12.9 4.5 14.4 3.6 16.2 3.6 19.1 3.6 21.4 5.9 21.4 8.9 21.4 12.6 18.6 16.4 12 20.6Z';
const LINE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const SOFT_FILL = 'style="fill:var(--icon-fill,none)"';

const sym = (id: string, viewBox: string, body: string): string => `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`;
const icon24 = (id: IconSymbol, body: string): string => sym(id, '0 0 24 24', body);

function starPath(cx: number, cy: number, ro: number, ri: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? ri : ro;
    const a = ((-90 + k * 36) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/**
 * The glyphs are drawn on a 24 grid with a margin; this grows each shape (and its strokes) by 1.2×
 * about the centre so it fills its 22 % box (02 §18) and stays readable on 12×12 boards.
 */
const GLYPH_FILL = 'matrix(1.2 0 0 1.2 -2.4 -2.4)';

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
    // idle: the right ear hides under the ear-flick overlay while .cell.is-flick is on (board.css)
    sym('cat-idle', '0 0 100 100', catHead({ eyes: 'open', mouth: 'smile', flickable: true })) +
    sym('cat-happy', '0 0 100 100', catHead({ eyes: 'happy', mouth: 'open', ears: 'happy', blush: true })) +
    sym('cat-sad', '0 0 100 100', catHead({ eyes: 'sad', mouth: 'frown', ears: 'droop' })) +
    sym('cat-surprised', '0 0 100 100', catHead({ eyes: 'round', mouth: 'o', ears: 'prick' })) +
    sym('cat-blink', '0 0 100 100', catBlink('fixed')) +
    sym('cat-ear-flick', '0 0 100 100', catEarFlick('fixed'))
  );
}

/**
 * The X's rect geometry on the 100-unit slot box (look-spec §1.10, measured): [x, y, width, height, rx]
 * of each white bar (layout.mark: armFraction long, barFraction thick, cornerFraction corners) and of
 * its edge (grown by edgeFraction per side; drawn only with Colour patterns on). Each pair is rotated
 * ±45° about (50, 50). Defaults: 15.5 40.9 69 18.2 6 and 12 37.4 76 25.2 9.5.
 */
export function markRects(c: GameConfig = cfg): { readonly bar: readonly number[]; readonly edge: readonly number[] } {
  const M = c.layout.mark;
  const len = M.armFraction * 100;
  const w = M.barFraction * 100;
  const r = M.cornerFraction * 100;
  const e = M.edgeFraction * 100;
  const box = (l: number, t: number, rx: number): number[] => [50 - l / 2, 50 - t / 2, l, t, rx].map((v) => Math.round(v * 10) / 10);
  return { bar: box(len, w, r), edge: box(len + 2 * e, w + 2 * e, r + e) };
}

/** Two rects of `b` ([x, y, w, h, rx]) crossed at ±45° about (cx, cy). */
export function crossRects(b: readonly number[], cx = 50, cy = 50): string {
  return [45, -45].map((d) => `<rect x="${b[0]}" y="${b[1]}" width="${b[2]}" height="${b[3]}" rx="${b[4]}" transform="rotate(${d} ${cx} ${cy})"/>`).join('');
}

/** mark-x (How to play): the board's white X, two rounded bars on the slot's 100-unit box (look-spec §1.10). */
function markSymbols(): string {
  return sym('mark-x', '0 0 100 100', `<g fill="#fff">${crossRects(markRects().bar)}</g>`);
}

function iconSymbols(): string {
  return [
    icon24('icon-house', `<path d="M6.2 9.8V18.6a1.6 1.6 0 0 0 1.6 1.6H10v-5h4v5h2.2a1.6 1.6 0 0 0 1.6-1.6V9.8" ${SOFT_FILL}/><path d="M6.2 9.8V18.6a1.6 1.6 0 0 0 1.6 1.6H10v-5h4v5h2.2a1.6 1.6 0 0 0 1.6-1.6V9.8M3.4 11.4 12 4l8.6 7.4" ${LINE}/>`),
    // Phase 2d (Appendix C, ours): a filled cog, six round-ended teeth on a thick ring whose open
    // centre (Ø 7.8) lets the white disc show through; currentColor (--ink-icon in the round buttons).
    icon24(
      'icon-gear',
      `<g fill="none" stroke="currentColor"><circle cx="12" cy="12" r="6" stroke-width="4.2"/>` +
        `<path d="M12 4.2v-.6m0 16.2v.6m6.8-12.3.5-.3m-.5 8.1.5.3M5.2 8.1l-.5-.3m.5 8.1-.5.3" stroke-width="5.4" stroke-linecap="round"/></g>`,
    ),
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
  ].join('');
}

/** Phase 2b icons (phase2b §1.7) in the same 24-grid LINE style, plus the fish. */
function newIcons(): string {
  return [
    sym('icon-fish', '0 0 24 24', fishMarkup()),
    // Phase 2c §1.2 (G2): the empty life, one 30 % ink outline around a pale wash.
    sym('icon-fish-empty', '0 0 24 24', fishOutlineMarkup()),
    // Phase 2c.1 §10.2 (G2, our drawing): a plump four-point sparkle filled with --icon-fill (gold) and
    // outlined in currentColor like icon-trophy, with a small solid sparkle at the top end.
    icon24(
      'icon-points',
      `<path d="M10.8 3.6C11.5 9.2 13.6 11.9 19.6 12.8 13.6 13.7 11.5 16.4 10.8 22 10.1 16.4 8 13.7 2 12.8 8 11.9 10.1 9.2 10.8 3.6Z" ${LINE} ${SOFT_FILL}/>` +
        `<path d="M18.8 2.2C19.1 4.2 19.7 4.9 21.8 5.2 19.7 5.5 19.1 6.2 18.8 8.2 18.5 6.2 17.9 5.5 15.8 5.2 17.9 4.9 18.5 4.2 18.8 2.2Z" fill="currentColor"/>`,
    ),
    icon24('icon-plus', `<path d="M12 5.4v13.2M5.4 12h13.2" ${LINE} stroke-width="2.6"/>`),
    icon24(
      'icon-shop',
      `<path d="M3.6 10.4h16.8l-1.7 8.2a2 2 0 0 1-2 1.6H7.3a2 2 0 0 1-2-1.6Z" ${LINE} ${SOFT_FILL}/>` +
        `<path d="M7.2 10.4C7.2 4.6 16.8 4.6 16.8 10.4M8.9 13.4l.5 3.8M12 13.4v3.8M15.1 13.4l-.5 3.8" ${LINE}/>`,
    ),
    icon24('icon-globe', `<circle cx="12" cy="12" r="8.4" ${LINE} ${SOFT_FILL}/><path d="M3.6 12h16.8M12 3.6c2.4 2.4 3.4 5.2 3.4 8.4s-1 6-3.4 8.4c-2.4-2.4-3.4-5.2-3.4-8.4s1-6 3.4-8.4Z" ${LINE}/>`),
    icon24(
      'icon-crown',
      `<path d="M4.4 17.2 3.2 8.4l5 3.6L12 5.6l3.8 6.4 5-3.6-1.2 8.8Z" ${LINE} ${SOFT_FILL}/><path d="M4.6 20.2h14.8" ${LINE}/>` +
        `<circle cx="12" cy="13.6" r="1.3" fill="currentColor"/>`,
    ),
    icon24('icon-users', `<circle cx="9" cy="8.6" r="3.2" ${LINE} ${SOFT_FILL}/><path d="M3.4 19.4a5.6 5.6 0 0 1 11.2 0M15.8 6a3 3 0 0 1 0 5.8M17.6 14.2a5 5 0 0 1 3 5.2" ${LINE}/>`),
  ].join('');
}

/** Grey of the mouse helper (look-spec §1.11): head, muzzle, ink of the whiskers and teeth edge. */
const MOUSE = { head: '#B8B4BC', muzzle: '#D9D6DC', line: '#8E8994', eye: '#1E1A22' };

/**
 * Phase 2d art (look-spec §1.4, §1.6, §1.11, §1.14, Appendix C), each drawn by us as SVG from its
 * written description, never from a frame (D-2d-0 c; provenance-G2.md):
 * - icon-back: a left arrow, a shaft and two head strokes meeting at the left, stroke 3.1, round ends;
 * - icon-play: a rounded triangle pointing right (the video badge's mark);
 * - tool-kitty: our Tux head (cat-parts), winking: the left iris open, the right eye a closed arc,
 *   an open smile with a pink tongue, the asymmetric blaze and the notched left ear;
 * - tool-bulb: a glossy yellow bulb (highlight, soft orange lower shade), a short neck and a screw base
 *   of two violet rings with a lighter ring between;
 * - tool-mouse: a grey mouse face: big round ears with pink insides, a lighter muzzle, bead eyes with
 *   catchlights, a pink nose, two white teeth, three whiskers a side;
 * - cat-head-flat: a plain cat-head silhouette, wide and soft, two pointed ears with softly rounded
 *   tips set a little outward, no notch, no face (D-2d-18), one shape in currentColor;
 * - art-flex: a flexed arm, a rounded upper arm and a raised fist, gold with a darker shade.
 * Each tool-* symbol's viewBox is its art's box, so the tool row draws it at the measured size
 * (look-spec §1.11: kitty 34.7 × 34.3, bulb 21.3 × 34, mouse 35 × 31.3 at s = 1).
 */
function art2d(): string {
  // One theme (look-spec §2.2): the full-colour art takes the token values directly (no var()).
  const { gold, hard: violet, fish, 'fish-deep': deep, 'fish-hi': hi } = TOKENS;
  const ear = (cx: number): string => `<circle cx="${cx}" cy="27" r="20" fill="${MOUSE.head}"/><circle cx="${cx}" cy="28" r="12.5" fill="${CAT.earIn}"/>`;
  const eye = (cx: number): string => `<circle cx="${cx}" cy="55" r="5.4" fill="${MOUSE.eye}"/><circle cx="${cx + 1.8}" cy="53.2" r="1.8" fill="#fff"/>`;
  return [
    icon24('icon-back', `<path d="M20.5 12H3.6m6.9-7L3.6 12l6.9 7" fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>`),
    icon24('icon-play', `<path d="M8.6 6.2v11.6L18 12Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`),
    sym('tool-kitty', '6 3 88 88', catHead({ eyes: 'wink', mouth: 'open' })),
    sym(
      'tool-bulb',
      '18.5 1.5 63 97.5',
      `<path d="M50 2C67.7 2 81 15.4 81 33c0 11.5-5.8 19.8-12.6 26.4C64.6 63 63 66.8 63 71H37c0-4.2-1.6-8-5.4-11.6C24.8 52.8 19 44.5 19 33 19 15.4 32.3 2 50 2Z" fill="${gold}"/>` +
        `<path d="M20 38c2.5 10 10.5 16.5 15.1 24 1.4 2.6 1.9 5.4 1.9 9h26c0-3.6.5-6.4 1.9-9 4.6-7.5 12.6-14 15.1-24-6 12-17 18.5-30 18.5S26 50 20 38Z" fill="${fish}"/>` +
        `<ellipse cx="36" cy="22" rx="6.5" ry="11" transform="rotate(38 36 22)" fill="#fff" opacity=".75"/>` +
        `<rect x="35" y="69" width="30" height="10" rx="5" fill="${violet}"/><rect x="36.5" y="77.5" width="27" height="9" rx="4.5" fill="#A68BDF"/>` +
        `<rect x="38" y="85" width="24" height="9" rx="4.5" fill="${violet}"/><path d="M44 92h12c-.8 4.6-3 6.6-6 6.6S44.8 96.6 44 92Z" fill="${violet}"/>`,
    ),
    sym(
      'tool-mouse',
      '1 4.5 98 88',
      ear(23) + ear(77) +
        `<ellipse cx="50" cy="60" rx="36" ry="33" fill="${MOUSE.head}"/><ellipse cx="50" cy="75" rx="21" ry="15.5" fill="${MOUSE.muzzle}"/>` +
        eye(36) + eye(64) +
        `<g fill="none" stroke="${MOUSE.line}" stroke-width="1.3" stroke-linecap="round"><path d="M32 70 8 64M31.5 74.5H6M32 79 9 85.5M68 70l24-6m-23.5 10.5H94M68 79l23 6.5"/>` +
        `<path d="M50 69v4.5m-7 .8q7 4.6 14 0"/></g>` +
        `<path d="M46 77.2h3.6v6.4a1 1 0 0 1-1 1H47a1 1 0 0 1-1-1Zm4.4 0H54v6.4a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1Z" fill="#fff" stroke="${MOUSE.line}" stroke-width=".9"/>` +
        `<ellipse cx="50" cy="67.4" rx="4.8" ry="3.4" fill="${CAT.nose}"/>`,
    ),
    sym(
      'cat-head-flat',
      '4 5.7 92 90.3',
      `<path d="M50 26c-6 0-11 .4-15 1.3L21 7.6Q17 3 15.2 9.4L10 39.5C6 46 4 54 4 62c0 21 20 34 46 34s46-13 46-34c0-8-2-16-6-22.5L84.8 9.4Q83 3 79 7.6L65 27.3c-4-.9-9-1.3-15-1.3Z" fill="currentColor"/>`,
    ),
    icon24(
      'art-flex',
      `<path d="M1.5 22v-5.8c0-3.8 2.9-6.2 6.3-5.6 1.9.3 3.3 1.5 4 3.1l1.8-4.2c-1.2-.9-1.8-2.4-1.4-4 .5-2.1 2.6-3.4 4.7-2.9l1.5.4c2.1.5 3.4 2.6 2.9 4.7-.3 1.2-1.1 2.2-2.2 2.7l-1.2 9c-.3 1.4-1.5 2.4-2.9 2.4Z" fill="${fish}"/>` +
        `<path d="M1.5 22v-3c3.6 1.4 8.4 1.6 13 .6 1.5-.3 2.8-1 3.7-2l-.4 2.4c-.3 1.2-1.5 2-2.8 2Zm11.8-12.8c1.4.8 3 1.1 4.6.8l-.3 1.4c-1.6.3-3.2 0-4.8-.7Z" fill="${deep}"/>` +
        `<ellipse cx="6.4" cy="13.2" rx="2.5" ry="1.1" transform="rotate(-24 6.4 13.2)" fill="${hi}"/>` +
        `<path d="M14.2 4.2c.8-.7 1.9-.9 2.9-.7" fill="none" stroke="${hi}" stroke-linecap="round"/>`,
    ),
  ].join('');
}

let cached: string | null = null;

/** The sprite's inner markup (symbols). Built once. Phase 2c: the heart clip paths (defs) went with the heart break. */
export function spriteMarkup(): string {
  cached ??=
    catSymbols() +
    markSymbols() +
    GLYPHS.map((g, i) => sym(`glyph-${i}`, '0 0 24 24', `<g fill="currentColor" transform="${GLYPH_FILL}">${g}</g>`)).join('') +
    iconSymbols() +
    newIcons() +
    art2d();
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

/** Re-points an icon()'s <use> at another symbol (mood swaps). */
export function setIcon(svg: SVGSVGElement, id: SymbolId): void {
  const use = svg.querySelector('use');
  if (use && use.getAttribute('href') !== `#${id}`) use.setAttribute('href', `#${id}`);
}

/** Cat colours for CSS-free contexts (e.g. the boot splash before styles load). */
export const CAT_FUR = CAT.fur;
/** Tux's white mask colour, for the same contexts. */
export const CAT_MASK = CAT.mask;
