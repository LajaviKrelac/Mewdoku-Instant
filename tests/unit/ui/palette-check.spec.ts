// Owner: ui-board. scripts/palette-check.ts: CIEDE2000, CVD simulation, contrast, and the shipped palette passes.
import { describe, expect, it, vi } from 'vitest';
import {
  computeMatrix,
  contrastRatio,
  deltaE2000,
  glyphContrast,
  hexToLab,
  main,
  MIN_CONTRAST,
  MIN_DE00,
  pairwise,
  simulateCvd,
} from '../../../scripts/palette-check';
import { PALETTE, PALETTE_DE00 } from '../../../src/ui/art/palette';

describe('palette-check', () => {
  it('CIEDE2000 matches Sharma et al. (2005) reference pairs', () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE2000([50, -1.3802, -84.2814], [50, 0, -82.7485])).toBeCloseTo(1.0, 4);
    expect(deltaE2000([50, 2.5, 0], [56, -27, -3])).toBeCloseTo(31.903, 3);
    expect(deltaE2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(1.2644, 4);
  });

  it('Lab conversion and WCAG contrast of known colours', () => {
    const white = hexToLab('#ffffff');
    expect(white[0]).toBeCloseTo(100, 2);
    expect(Math.abs(white[1])).toBeLessThan(0.01);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('CVD simulation leaves greys unchanged', () => {
    for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const g = simulateCvd('#808080', kind);
      expect(deltaE2000(hexToLab(g), hexToLab('#808080'))).toBeLessThan(1);
    }
  });

  it('PALETTE_DE00 matches the palette and every pair is ≥ 10', () => {
    const m = computeMatrix(PALETTE);
    m.forEach((v, k) => expect(Math.abs(v - (PALETTE_DE00[k] as number))).toBeLessThanOrEqual(1));
    expect((pairwise(PALETTE)[0]?.de ?? 0) >= MIN_DE00).toBe(true);
  });

  it('every glyph passes 3:1 on every tile, faded or not', () => {
    for (const row of glyphContrast()) expect(row.ratio, `${row.what} on ${row.tile}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('main() passes on the shipped palette', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const prev = process.exitCode;
    main(['--quiet']);
    expect(process.exitCode ?? 0).toBe(prev ?? 0);
    log.mockRestore();
  });
});
