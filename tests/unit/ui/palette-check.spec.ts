// Owner: ui-board. scripts/palette-check.ts: CIEDE2000, CVD simulation, contrast, and the shipped palette passes.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import {
  computeMatrix,
  contrastRatio,
  deltaE2000,
  glyphContrast,
  hexToLab,
  main,
  MIN_CONTRAST,
  MIN_DE00,
  MIN_TEXT_CONTRAST,
  pairwise,
  simulateCvd,
  uiContrast,
} from '../../../scripts/palette-check';
import { PALETTE, PALETTE_DE00, TOKENS } from '../../../src/ui/art/palette';

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

  it('checks the colour-pattern glyph on every tile, normal and faded (02 §18 non-colour cue)', () => {
    const rows = glyphContrast().filter((r) => r.what.startsWith('pattern glyph'));
    expect(rows).toHaveLength(PALETTE.length * 2);
    for (const r of rows) expect(r.ratio, `pattern glyph on ${r.tile}${r.faded ? ' faded' : ''}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    // The old 0.5 / 0.32 opacities failed (2.1-2.6:1): the check must notice a regression.
    expect(cfg.layout.patternOpacity).toBeGreaterThanOrEqual(0.8);
  });

  it('UI text pairs reach 4.5:1 and UI glyphs 3:1 (WCAG 1.4.3 / 1.4.11)', () => {
    const rows = uiContrast();
    for (const r of rows) expect(r.ratio, r.what).toBeGreaterThanOrEqual(r.min);
    const text = rows.filter((r) => r.min === MIN_TEXT_CONTRAST).map((r) => r.what);
    expect(text).toContain('primary button label (white on --accent)');
    expect(text).toContain('secondary text (--ink-2 on --page-2)');
    // The spec's provisional values would fail: white on #1F9E89 is 3.3:1, #7A6E80 on --page-2 4.1:1.
    expect(contrastRatio('#FFFFFF', '#1F9E89')).toBeLessThan(MIN_TEXT_CONTRAST);
    expect(contrastRatio('#7A6E80', TOKENS['page-2'])).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it('styles/tokens.css mirrors the TOKENS colours the checks validate', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/tokens.css'), 'utf8');
    for (const [name, hex] of Object.entries(TOKENS)) {
      if (!hex.startsWith('#')) continue;
      const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
      expect(m?.[1]?.toLowerCase(), `--${name}`).toBe(hex.toLowerCase());
    }
  });

  it('main() passes on the shipped palette', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const prev = process.exitCode;
    main(['--quiet']);
    expect(process.exitCode ?? 0).toBe(prev ?? 0);
    log.mockRestore();
  });
});
