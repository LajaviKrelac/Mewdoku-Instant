// Owner: ui-board
// Palette validation (02 §17.2, §18): pairwise CIEDE2000 ≥ 10, simulated deuteranopia/protanopia/
// tritanopia ΔE report, --ink X glyph ≥ 3:1 against every tile, and PALETTE_DE00 matches PALETTE.
import { pathToFileURL } from 'node:url';

export type Lab = readonly [L: number, a: number, b: number];
export type CvdKind = 'deuteranopia' | 'protanopia' | 'tritanopia';

export function hexToLab(hex: string): Lab {
  throw new Error('not implemented: hexToLab');
}

export function deltaE2000(a: Lab, b: Lab): number {
  throw new Error('not implemented: deltaE2000');
}

export function simulateCvd(hex: string, kind: CvdKind): string {
  throw new Error('not implemented: simulateCvd');
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(fg: string, bg: string): number {
  throw new Error('not implemented: contrastRatio');
}

export function main(argv: readonly string[]): void {
  throw new Error('not implemented: palette-check main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
