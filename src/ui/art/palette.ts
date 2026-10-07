// Owner: ui-board
// Region colours, glyphs and UI tokens (02 §17.2, §18). Mirrors styles/tokens.css (--r0…--r11 etc.).
// Colour NAMES live in i18n (colorName(i)). scripts/palette-check.ts validates these values.
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

export type TokenName = 'page' | 'card' | 'ink' | 'ink-2' | 'accent' | 'danger' | 'heart' | 'scrim';

/** UI tokens (02 §17.2). */
export const TOKENS: Readonly<Record<TokenName, string>> = Object.freeze({
  page: '#FBF6EE',
  card: '#FFFFFF',
  ink: '#3B3044',
  'ink-2': '#7A6E80',
  accent: '#1F9E89',
  danger: '#D33A4A',
  heart: '#E8506A',
  scrim: 'rgba(30,22,36,.75)',
});

/** Our cat's colours (02 §17.3): ginger fur, cream muzzle. */
export const CAT_COLORS = Object.freeze({ fur: '#F29A4A', muzzle: '#FFE9CF' });

/** `var(--rN)` for a palette index. */
export function regionColorVar(paletteIndex: number): string {
  throw new Error('not implemented: regionColorVar');
}

/** Palette index per region label: `fixed` (tutorial, game/modes fixedColors) or engine assignColors(puzzle, PALETTE_DE00). */
export function regionColorsFor(puzzle: Pick<Puzzle, 'id' | 'n' | 'regions'>, fixed: readonly number[] | null): Uint8Array {
  throw new Error('not implemented: regionColorsFor');
}
