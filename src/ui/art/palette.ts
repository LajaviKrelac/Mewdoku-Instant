// Owner: A (Phase 2b); G2 (Phase 2d: the measured palette and tokens, tiers, HEAD_ORDER)
// Region colours, glyphs and UI tokens (02 §17.2, §18; phase2b §1.3–§1.6; look-spec §1.2, §1.9).
// Mirrors styles/tokens.css (--r0…--r11 etc.). Colour NAMES live in i18n (colorName(i)).
// scripts/palette-check.ts validates these values. One token set (TOKENS), Tux's colours
// (CAT_COLORS), the event theme overrides (EVENT_THEME_TOKENS) and xEdgeColor(), the X's dark edge
// per tile, drawn only with Colour patterns on (look-spec §1.10, D-2d-5).
// Phase 2d (D-2d-0, user decision 2026-10-10): ten region colours and the page, ink and helper
// colours are sampled from the user's own screenshot of the original's game screen; index 4 and Cocoa
// (11 and 12) and every darkened or derived value are ours (look-spec §1.2, §1.9).
// Phase 2d.1 L0 (helpers-spec §6.2): index 4 is named Denim (was Mint); it keeps 2d's own value here
// until G2 sets the measured Denim (D-2d1-10).
import { cfg, type GameConfig } from '../../app/config';
import { assignColors } from '../../engine/colors';
import type { DeltaMatrix, Puzzle } from '../../engine/types';

export const PALETTE_SIZE = 12;

/**
 * Region colours by palette index: Coral, Apricot, Mustard, Lime, Denim, Lagoon, Sky, Violet, Orchid,
 * Cocoa, Slate, Pink. Ten measured on the user's recording (PNG still, D-2d-2); index 4 (named Denim
 * since 2d.1 L0, still 2d's own value until helpers-spec §6.2) and Cocoa (9) are ours, used only by
 * boards that need more than ten colours (look-spec §1.9, D-2d-10).
 */
export const PALETTE: readonly string[] = Object.freeze([
  '#D57374', '#FFAA6D', '#E4BB49', '#AED994', '#52A982', '#48B5B2',
  '#6BBCE7', '#9778D6', '#EB85B7', '#B0855A', '#A7BFD7', '#FAB4D0',
]);

/** The 10 colours measured on the user's recording (palette indices); n ≤ 10 boards use only these. */
export const PALETTE_CORE: readonly number[] = Object.freeze([0, 1, 2, 3, 5, 6, 7, 8, 10, 11]);

/**
 * Heads-pill order (look-spec §1.6: around the colour wheel from green, as the recording shows):
 * Lime, Denim, Lagoon, Sky, Slate, Violet, Orchid, Pink, Coral, Apricot, Cocoa, Mustard.
 */
export const HEAD_ORDER: readonly number[] = Object.freeze([3, 4, 5, 6, 10, 7, 8, 11, 0, 1, 9, 2]);

/**
 * CIEDE2000 between palette colours, integers ×100, row-major 12×12 (03 §8.5), from PALETTE (sRGB
 * D65; min pair Sky/Slate = 10.40). palette-check.ts recomputes it and fails (printing the fresh
 * matrix) if PALETTE changes without updating this one.
 */
export const PALETTE_DE00: DeltaMatrix = Object.freeze([
     0, 2387, 3906, 5201, 5416, 5064, 4793, 2965, 1623, 2116, 3619, 2040,
  2387,    0, 1790, 3658, 4387, 4344, 4460, 4686, 3498, 1652, 3525, 2957,
  3906, 1790,    0, 2354, 3357, 3813, 4891, 6028, 5150, 2025, 4125, 4365,
  5201, 3658, 2354,    0, 1796, 2473, 4025, 5085, 5926, 3250, 3339, 4980,
  5416, 4387, 3357, 1796,    0, 1352, 3088, 4182, 6139, 3346, 2878, 5430,
  5064, 4344, 3813, 2473, 1352,    0, 1737, 3609, 5009, 3627, 2034, 5055,
  4793, 4460, 4891, 4025, 3088, 1737,    0, 2779, 4655, 4083, 1040, 4284,
  2965, 4686, 6028, 5085, 4182, 3609, 2779,    0, 2147, 4212, 1969, 2702,
  1623, 3498, 5150, 5926, 6139, 5009, 4655, 2147,    0, 3469, 3101, 1113,
  2116, 1652, 2025, 3250, 3346, 3627, 4083, 4212, 3469,    0, 3341, 3273,
  3619, 3525, 4125, 3339, 2878, 2034, 1040, 1969, 3101, 3341,    0, 2896,
  2040, 2957, 4365, 4980, 5430, 5055, 4284, 2702, 1113, 3273, 2896,    0,
]);

export type TokenName =
  | 'page'
  | 'page-2'
  | 'card'
  | 'ink'
  | 'ink-2'
  | 'ink-3'
  /** Phase 2d: the icons inside the white round buttons (back arrow, gear, Home's trophy and house). */
  | 'ink-icon'
  /** Phase 2d: the 2c.1 ink, for graphics that need a dark colour (pattern glyphs, the X edge, "Free"). */
  | 'ink-deep'
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
  | 'hard'
  // Phase 2d (look-spec §1.2): count badges, the video badge, the gear's dot, the start toast, rule cards.
  | 'badge'
  | 'badge-video'
  | 'dot'
  | 'toast-fill'
  | 'toast-line'
  | 'rule-card'
  | 'rule-tile'
  | 'rule-tile-2'
  | 'rule-mark';

/**
 * The one token set (phase2b §1.3, §1.4; look-spec §1.2). Phase 2d (D-2d-0): the page, card, ink,
 * icon ink, fish, badge, dot, toast and rule-card colours are sampled from the user's own screenshot
 * of the original's game screen; the badge red, the video green, the fish shade and --wrong are
 * darkened only as far as a contrast floor needs (D-2d-17); the rest are ours. Mirrors
 * styles/tokens.css (tests/unit/ui/palette-check.spec.ts keeps them equal) and is validated by
 * scripts/palette-check.ts:
 * - `ink` (#935A5A) is every text colour (4.91 on --page); `ink-deep` (the 2c.1 ink) is for graphics
 *   that need a dark colour: the colour-pattern glyphs, the X edge with patterns on, "Free" on gold.
 * - `accent` carries white labels only at ≥ 24 px (WCAG large text, 3.15:1); smaller orange text
 *   uses `accent-text`, large titles `accent-title`, the focus ring `focus`.
 * - `wrong` (#6E0E25): the wrong X and its ring, ≥ 3.41:1 on every tile (the 2c.1 crimson failed 3:1 on
 *   the darker measured tiles); --danger stays the UI error colour.
 * - `amber-text` stays the gold-family text colour (daily card "In progress").
 */
export const TOKENS: Readonly<Record<TokenName, string>> = Object.freeze({
  page: '#F7F2EF',
  'page-2': '#F2EBE6',
  card: '#FFFFFF',
  ink: '#935A5A',
  'ink-2': '#935A5A',
  'ink-3': '#CDBAB6',
  'ink-icon': '#996767',
  'ink-deep': '#2F2A35',
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
  fish: '#F1AA22',
  'fish-deep': '#D47E18',
  'fish-hi': '#FED95D',
  danger: '#D33A4A',
  'life-empty': '#EDE8E2',
  scrim: 'rgba(28,23,32,.82)',
  glow: 'rgba(255,194,61,.65)',
  wrong: '#6E0E25',
  hard: '#6C3FB5',
  badge: '#DC2F2F',
  'badge-video': '#03A84A',
  dot: '#F34F4F',
  'toast-fill': '#FEF0C7',
  'toast-line': '#DD9045',
  'rule-card': '#FBF4EE',
  'rule-tile': '#DDBEAA',
  'rule-tile-2': '#EEE1D7',
  'rule-mark': '#AF6D44',
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
  lanterns: { a: '#FCE7D2', b: '#FDEDDC' },
  snowflakes: { a: '#E5EBF5', b: '#E9EEF6' },
  yarn: { a: '#FCE5EA', b: '#FDEAEE' },
});

/** `var(--rN)` for a palette index. */
export function regionColorVar(paletteIndex: number): string {
  return `var(--r${paletteIndex})`;
}

/** The palette indices an n×n board draws from (look-spec §1.9): n ≤ 10 the 10 core colours, 11 adds Cocoa (9), 12 uses all 12. */
export function paletteTier(n: number): readonly number[] {
  if (n <= PALETTE_CORE.length) return PALETTE_CORE;
  if (n === PALETTE_CORE.length + 1) return [...PALETTE_CORE, 9].sort((x, y) => x - y);
  return Array.from({ length: PALETTE_SIZE }, (_, i) => i);
}

/**
 * Palette index per region label: `fixed` (tutorial, game/modes fixedColors) or the engine's
 * assignColors on the board's tier (look-spec §1.9): the k × k sub-matrix of PALETTE_DE00 for the
 * tier's colours, mapped back to palette indices. So a 10×10 board shows exactly the 10 measured
 * colours, and Denim (4) / Cocoa (9) appear only on boards that need more than 10.
 */
export function regionColorsFor(puzzle: Pick<Puzzle, 'id' | 'n' | 'regions'>, fixed: readonly number[] | null): Uint8Array {
  if (fixed && fixed.length >= puzzle.n && fixed.slice(0, puzzle.n).every(isPaletteIndex)) {
    return Uint8Array.from(fixed.slice(0, puzzle.n));
  }
  const tier = paletteTier(puzzle.n);
  const k = tier.length;
  if (k === PALETTE_SIZE) return assignColors(puzzle, PALETTE_DE00, PALETTE_SIZE);
  const sub: number[] = [];
  for (const a of tier) for (const b of tier) sub.push(PALETTE_DE00[a * PALETTE_SIZE + b] as number);
  return assignColors(puzzle, sub, k).map((j) => tier[j] as number);
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
 * The X's dark edge for a tile (look-spec §1.10, D-2d-5): mixHex(tile, --ink-deep, layout.mark.edgeMix).
 * Drawn only with Colour patterns on (.board[data-patterns]); board-cells sets it as --xe on each cell;
 * palette-check verifies edge vs tile ≥ 3 and white vs that edge ≥ 3 on every tile, faded or not.
 */
export function xEdgeColor(paletteIndex: number, c: GameConfig = cfg): string {
  return mixHex(PALETTE[paletteIndex] ?? (PALETTE[0] as string), TOKENS['ink-deep'], c.layout.mark.edgeMix);
}
