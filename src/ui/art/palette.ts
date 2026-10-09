// Owner: A (Phase 2b)
// Region colours, glyphs and UI tokens (02 §17.2, §18; phase2b §1.3–§1.6). Mirrors styles/tokens.css
// (--r0…--r11 etc.). Colour NAMES live in i18n (colorName(i)). scripts/palette-check.ts validates these
// values. Phase 2b: one token set, the Classic look (TOKENS), Tux's colours (CAT_COLORS), the event
// theme overrides (EVENT_THEME_TOKENS) and xEdgeColor(), the white X's tinted edge per tile (§1.5).
import { cfg, type GameConfig } from '../../app/config';
import { assignColors } from '../../engine/colors';
import type { DeltaMatrix, Puzzle } from '../../engine/types';

export const PALETTE_SIZE = 12;

/** Region colours by palette index: Strawberry, Apricot, Lemon, Lime, Mint, Lagoon, Sky, Lavender, Orchid, Cocoa, Slate, Moss. */
export const PALETTE: readonly string[] = Object.freeze([
  '#F49AAE', '#F7B98B', '#F2DC7C', '#BFDB86', '#8FD6B8', '#7CC6D6',
  '#9BBDF0', '#B9A7EC', '#E3A6DF', '#C7A58C', '#9AA9BC', '#A3B57F',
]);

/**
 * CIEDE2000 between palette colours, integers ×100, row-major 12×12 (03 §8.5). Computed by the
 * foundation from PALETTE (sRGB D65; min pair Sky/Slate = 10.12). palette-check.ts must recompute
 * it and fail if PALETTE changes without updating this matrix.
 */
export const PALETTE_DE00: DeltaMatrix = Object.freeze([
     0, 2467, 4367, 5069, 5147, 4797, 3286, 2234, 1348, 2147, 2876, 4389,
  2467,    0, 1906, 2903, 3558, 3674, 3698, 3787, 3437, 1023, 3056, 2636,
  4367, 1906,    0, 1331, 2641, 3765, 4983, 5292, 5201, 2170, 3901, 1782,
  5069, 2903, 1331,    0, 1660, 3304, 4598, 5635, 5667, 2665, 3592, 1058,
  5147, 3558, 2641, 1660,    0, 1786, 2973, 3567, 3823, 3184, 2546, 1524,
  4797, 3674, 3765, 3304, 1786,    0, 1563, 2533, 3534, 3189, 1558, 2792,
  3286, 3698, 4983, 4598, 2973, 1563,    0, 1338, 2488, 3103, 1012, 3978,
  2234, 3787, 5292, 5635, 3567, 2533, 1338,    0, 1144, 3172, 1257, 4875,
  1348, 3437, 5201, 5667, 3823, 3534, 2488, 1144,    0, 2922, 2139, 4925,
  2147, 1023, 2170, 2665, 3184, 3189, 3103, 3172, 2922,    0, 2352, 2227,
  2876, 3056, 3901, 3592, 2546, 1558, 1012, 1257, 2139, 2352,    0, 2906,
  4389, 2636, 1782, 1058, 1524, 2792, 3978, 4875, 4925, 2227, 2906,    0,
]);

export type TokenName =
  | 'page'
  | 'page-2'
  | 'card'
  | 'ink'
  | 'ink-2'
  | 'ink-3'
  | 'accent'
  | 'accent-deep'
  | 'accent-title'
  | 'accent-text'
  | 'accent-soft'
  | 'focus'
  | 'title-on-dark'
  | 'tap-text'
  | 'stage'
  | 'amber-text'
  | 'gold'
  | 'fish'
  | 'fish-deep'
  | 'fish-hi'
  | 'danger'
  /** Phase 2c §1.2: the wash inside an empty life (icon-fish-empty); replaces the 2b --heart* tokens. */
  | 'life-empty'
  | 'scrim'
  | 'glow'
  | 'wrong'
  | 'hard';

/**
 * The one token set of the Classic look (phase2b §1.3, §1.4). Values are ours (R6: nothing sampled
 * from the original). Mirrors styles/tokens.css (tests/unit/ui/palette-check.spec.ts keeps them equal)
 * and is validated by scripts/palette-check.ts:
 * - `accent` carries white labels only at ≥ 24 px (WCAG large text, 3.15:1); smaller orange text
 *   uses `accent-text`, large titles `accent-title`, the focus ring `focus`.
 * - `wrong` (#A3193A) stays: --danger only reaches ~2.2:1 on the pastel tiles, so the wrong-X glyph
 *   and its ring use this deeper crimson to meet 3:1 (02 §18). --danger stays the UI error colour.
 * - `amber-text` stays the gold-family text colour (daily card "In progress").
 */
export const TOKENS: Readonly<Record<TokenName, string>> = Object.freeze({
  page: '#FAF6F0',
  'page-2': '#F1EADF',
  card: '#FFFFFF',
  ink: '#2F2A35',
  'ink-2': '#665E6C',
  'ink-3': '#B2AAB4',
  accent: '#E57010',
  'accent-deep': '#B4560A',
  'accent-title': '#D2620C',
  'accent-text': '#A84B08',
  'accent-soft': '#FDE9D6',
  focus: '#B9520A',
  'title-on-dark': '#E57010',
  'tap-text': '#FFD45C',
  stage: '#2A2430',
  'amber-text': '#8A5A00',
  gold: '#FFC23D',
  fish: '#FFB81F',
  'fish-deep': '#C98200',
  'fish-hi': '#FFE08A',
  danger: '#D33A4A',
  'life-empty': '#EDE8E2',
  scrim: 'rgba(28,23,32,.82)',
  glow: 'rgba(255,194,61,.65)',
  wrong: '#A3193A',
  hard: '#6C3FB5',
});

/**
 * Tux, our tuxedo-style cat (phase2b §1.6): dark fur with a sheen, a near-black outline, a white
 * asymmetric blaze, bib, socks and tail tip, light-green irises, pink nose and inner ears. Expression
 * lines drawn on the dark fur use `line` (ink lines vanish on black fur); on the white mask they are ink.
 */
export const CAT_COLORS = Object.freeze({
  fur: '#2E2A33',
  sheen: '#46404E',
  outline: '#16131A',
  mask: '#FBF8F4',
  earIn: '#F2A3B4',
  nose: '#F28AA0',
  blush: '#FF8FA6',
  mouth: '#6B2B3F',
  line: '#F6F0E8',
  iris: '#BFE38A',
  pupil: '#16131A',
});

/**
 * Event theme overrides (phase2b §1.3, §4.3, §4.4) as they are written in the [data-event-theme]
 * blocks of styles/tokens.css: an event may theme the page, its pattern, the board card and the glow,
 * never the region colours, --ink, --wrong or the X tokens. palette-check re-checks every text pair and
 * the faded-tile glyphs on each event page; tests keep tokens.css (and src/data/events, when present)
 * equal to these values.
 */
export interface EventThemeTokens {
  readonly page: string;
  readonly boardCard: string;
  readonly glow: string;
}

export const EVENT_THEME_TOKENS: Readonly<Record<string, EventThemeTokens>> = /* @__PURE__ */ Object.freeze({
  'lantern-walk-2026': { page: '#FFF4E6', boardCard: '#FFFFFF', glow: 'rgba(255,170,60,.65)' },
  'snow-paws-2026': { page: '#F3F6FA', boardCard: '#FFFFFF', glow: 'rgba(150,200,255,.6)' },
  'yarn-hearts-2027': { page: '#FFF1F3', boardCard: '#FFFFFF', glow: 'rgba(255,140,170,.6)' },
});

/**
 * Event page-pattern motif colours (ui/art/event-art.ts): `a` for the motifs, `b` (lighter) for their
 * details. Each is only a shade off its page, so text drawn over the pattern keeps ≥ 4.5:1 for --ink,
 * --ink-2 and --accent-text (scripts/palette-check.ts checks every motif colour).
 */
export const EVENT_PATTERN_COLORS: Readonly<Record<'lanterns' | 'snowflakes' | 'yarn', { readonly a: string; readonly b: string }>> = /* @__PURE__ */ Object.freeze({
  lanterns: { a: '#FCE3CA', b: '#FDEDDC' },
  snowflakes: { a: '#E0E8F3', b: '#E9EEF6' },
  yarn: { a: '#FCE0E6', b: '#FDEAEE' },
});

/** `var(--rN)` for a palette index. */
export function regionColorVar(paletteIndex: number): string {
  return `var(--r${paletteIndex})`;
}

/** Palette index per region label: `fixed` (tutorial, game/modes fixedColors) or engine assignColors(puzzle, PALETTE_DE00). */
export function regionColorsFor(puzzle: Pick<Puzzle, 'id' | 'n' | 'regions'>, fixed: readonly number[] | null): Uint8Array {
  if (fixed && fixed.length >= puzzle.n && fixed.slice(0, puzzle.n).every(isPaletteIndex)) {
    return Uint8Array.from(fixed.slice(0, puzzle.n));
  }
  return assignColors(puzzle, PALETTE_DE00, PALETTE_SIZE);
}

function isPaletteIndex(v: number): boolean {
  return Number.isInteger(v) && v >= 0 && v < PALETTE_SIZE;
}

/** '#RRGGBB' → [r, g, b] (0..255). */
export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Mixes `hex` toward `toward` by `t` (0..1) in sRGB, like CSS color-mix in srgb. Returns '#rrggbb'. */
export function mixHex(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  const out = a.map((v, i) => Math.round(v + ((b[i] as number) - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The X edge colour of a tile (phase2b §1.5): mixHex(tile, --ink, layout.markEdgeMix). board-cells
 * sets it as --xe on each cell; palette-check verifies edge vs tile ≥ 3 and white vs edge ≥ 3.
 * Follows TOKENS.ink, so A's new ink value (§1.4) carries through.
 */
export function xEdgeColor(paletteIndex: number, c: GameConfig = cfg): string {
  return mixHex(PALETTE[paletteIndex] ?? (PALETTE[0] as string), TOKENS.ink, c.layout.markEdgeMix);
}
