// Owner: A (Phase 2b; was ui-board); G2 (Phase 2d: the measured palette and tokens, look-spec §1.2, §2.3).
// scripts/palette-check.ts: CIEDE2000, CVD simulation, contrast, and the shipped palette passes.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import {
  computeMatrix,
  contrastRatio,
  deltaE2000,
  eventContrast,
  glyphContrast,
  hexToLab,
  main,
  MIN_CONTRAST,
  parityExceptions,
  MIN_DE00,
  MIN_TEXT_CONTRAST,
  pairwise,
  rgbaOver,
  simulateCvd,
  uiContrast,
  whiteOnTiles,
} from '../../../scripts/palette-check';
import EVENTS from '../../../src/data/events/events.json';
import { CAT_COLORS, EVENT_THEME_TOKENS, PALETTE, PALETTE_DE00, TOKENS, xEdgeColor } from '../../../src/ui/art/palette';

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

  it('PALETTE_DE00 matches the palette and every pair is ≥ 10 (min Sky / Slate 10.40, look-spec §1.9)', () => {
    const m = computeMatrix(PALETTE);
    m.forEach((v, k) => expect(Math.abs(v - (PALETTE_DE00[k] as number))).toBeLessThanOrEqual(1));
    const min = pairwise(PALETTE)[0];
    expect((min?.de ?? 0) >= MIN_DE00).toBe(true);
    expect(min?.de).toBeCloseTo(10.4, 2);
    expect([min?.i, min?.j]).toEqual([6, 10]);
    // the two colours of ours sit far from every other: Mint ≥ 13.5, Cocoa ≥ 16.5
    const from = (i: number): number => Math.min(...pairwise(PALETTE).filter((p) => p.i === i || p.j === i).map((p) => p.de));
    expect(from(4)).toBeGreaterThanOrEqual(13.5);
    expect(from(9)).toBeGreaterThanOrEqual(16.5);
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

  it('UI text pairs reach 4.5:1 and UI glyphs / large text 3:1 (WCAG 1.4.3 / 1.4.11, phase2b §1.4)', () => {
    const rows = uiContrast();
    for (const r of rows) expect(r.ratio, r.what).toBeGreaterThanOrEqual(r.min);
    const text = rows.filter((r) => r.min === MIN_TEXT_CONTRAST).map((r) => r.what);
    const large = rows.filter((r) => r.min === MIN_CONTRAST).map((r) => r.what);
    expect(text).toContain('secondary text (--ink-2 on --page-2)');
    expect(text).toContain('accent text (--accent-text on --page)');
    expect(text).toContain('count badge on primary buttons (white on --accent-text)');
    expect(text).toContain('count badge (white on --badge)');
    expect(text).toContain('rule text (--ink on --rule-card)');
    expect(text).toContain('toast text (--ink on --toast-fill)');
    expect(text).toContain('free tool badge (--ink-deep on --gold)');
    expect(text).toContain('"Tap to keep going" (--tap-text on --scrim over --page)');
    // White on the orange accent is only a LARGE-text pair: valid because labels are ≥ 1.5rem (css-rules.spec.ts).
    expect(large).toContain('primary button label, large text (white on --accent)');
    expect(contrastRatio('#FFFFFF', TOKENS.accent)).toBeLessThan(MIN_TEXT_CONTRAST);
    expect(large).toContain('focus ring (--focus on --page)');
    for (const g of ['round-button icon (--ink-icon on --card)', 'video badge mark (white on --badge-video)', 'settings dot (--dot on --card)', 'mini-diagram X (white on --rule-mark)', 'fish shade (--fish-deep on --card)']) expect(large).toContain(g);
    // retired rows (look-spec §2.3): no fish outline, the kitty is full-colour art
    expect(rows.some((r) => r.what.startsWith('fish outline'))).toBe(false);
    expect(rows.some((r) => r.what.startsWith('kitty tool icon'))).toBe(false);
  });

  it('checks the dark victory screen\'s text and graphics on --stage (review PAR-3) and the keyword colour (PAR-7)', () => {
    const rows = uiContrast();
    const victory = rows.filter((r) => r.what.startsWith('victory'));
    expect(victory.map((r) => r.what)).toEqual(
      expect.arrayContaining([
        'victory praise, large text (--title-on-dark on --stage)',
        'victory lines (white .82 on --stage)',
        'victory event reward (--tap-text on --stage)',
        'victory focus ring (--tap-text on --stage)',
      ]),
    );
    for (const r of victory) expect(r.bg === TOKENS.stage || r.what.includes('bar') || r.what.includes('chips'), r.what).toBe(true);
    expect(rows.find((r) => r.what.startsWith('rule keyword'))?.fg).toBe(TOKENS['accent-text']);
  });

  it('reproduces the look-spec §1.2 table values (computed 2026-10-10)', () => {
    const r = (fg: string, bg: string): number => Math.round(contrastRatio(fg, bg) * 100) / 100;
    expect(r(TOKENS.ink, TOKENS.page)).toBe(4.91);
    expect(r(TOKENS.ink, TOKENS.card)).toBe(5.45);
    expect(r(TOKENS.ink, TOKENS['page-2'])).toBe(4.62);
    expect(r(TOKENS.ink, TOKENS['accent-soft'])).toBe(4.62);
    expect(r(TOKENS.ink, TOKENS['rule-card'])).toBe(5.01);
    expect(r(TOKENS.ink, TOKENS['toast-fill'])).toBe(4.81);
    expect(r('#FFFFFF', TOKENS.ink)).toBe(5.45);
    expect(TOKENS['ink-2']).toBe(TOKENS.ink);
    expect(r(TOKENS['ink-icon'], TOKENS.card)).toBe(4.68);
    expect(r('#FFFFFF', TOKENS.badge)).toBe(4.68);
    expect(r('#FFFFFF', TOKENS['badge-video'])).toBe(3.13);
    expect(r(TOKENS.dot, TOKENS.card)).toBe(3.48);
    expect(r(TOKENS.dot, TOKENS.page)).toBe(3.13);
    expect(r('#FFFFFF', TOKENS['rule-mark'])).toBe(4.12);
    expect(r(TOKENS['rule-mark'], TOKENS['rule-card'])).toBe(3.78);
    expect(r(TOKENS['fish-deep'], TOKENS.card)).toBe(3.09);
    expect(r(TOKENS['ink-deep'], TOKENS.gold)).toBe(8.67);
    expect(r(TOKENS.focus, TOKENS.page)).toBe(4.42);
    expect(r(TOKENS['accent-text'], TOKENS.page)).toBe(5.14);
    expect(r(TOKENS['accent-title'], TOKENS.page)).toBe(3.44);
    // unchanged pairs
    expect(r('#FFFFFF', TOKENS.accent)).toBe(3.15);
    expect(r(TOKENS['accent-title'], TOKENS.card)).toBe(3.82);
    expect(r('#FFFFFF', TOKENS['accent-text'])).toBe(5.71);
    expect(r(TOKENS.focus, TOKENS.card)).toBe(4.91);
    expect(r(TOKENS['title-on-dark'], TOKENS.stage)).toBe(4.78);
    expect(r('#FFFFFF', TOKENS.stage)).toBe(15.07);
    expect(r('#FFFFFF', TOKENS.hard)).toBe(6.96);
    expect(r(TOKENS['tap-text'], rgbaOver(TOKENS.scrim, TOKENS.page))).toBe(7.36);
  });

  it('the recorded parity exceptions stay informational (look-spec §1.2, D-2d-6)', () => {
    const rows = parityExceptions();
    expect(rows.filter((x) => x.what.startsWith('head tint'))).toHaveLength(PALETTE.length);
    const tints = rows.filter((x) => x.what.startsWith('head tint')).map((x) => x.ratio);
    expect(Math.min(...tints)).toBeCloseTo(1.25, 2);
    expect(Math.max(...tints)).toBeCloseTo(1.76, 2);
    expect(rows.find((x) => x.what.startsWith('fish body'))?.ratio).toBeCloseTo(2.0, 2);
    expect(rows.find((x) => x.what.startsWith('toast border'))?.ratio).toBeCloseTo(2.32, 2);
    for (const x of rows) expect(x.min).toBe(0);
  });

  it('the default white X is an informational row; with Colour patterns on its edge carries WCAG 1.4.11 on every tile, normal and faded (look-spec §1.10)', () => {
    // the plain white X of the original: 1.60 (Lime) … 3.52 (Violet), faded 1.36–2.00 (D-2d-6)
    const w = whiteOnTiles();
    expect(w.min).toBeCloseTo(1.6, 2);
    expect(w.max).toBeCloseTo(3.52, 2);
    expect(w.fadedMin).toBeCloseTo(1.36, 2);
    expect(w.fadedMax).toBeCloseTo(2.0, 2);
    const rows = glyphContrast();
    const edge = rows.filter((r) => r.what === 'X edge (--xe, patterns on) vs tile');
    const white = rows.filter((r) => r.what === 'white X vs its edge (patterns on)');
    expect(edge).toHaveLength(PALETTE.length * 2);
    expect(white).toHaveLength(PALETTE.length * 2);
    for (const r of [...edge, ...white]) expect(r.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(Math.min(...edge.map((r) => r.ratio))).toBeCloseTo(3.24, 2); // worst: Violet
    expect(Math.min(...edge.filter((r) => r.faded).map((r) => r.ratio))).toBeCloseTo(5.69, 2);
    expect(Math.min(...white.map((r) => r.ratio))).toBeCloseTo(9.82, 2);
    // a faded tile is lighter, so its edge contrast is higher than the normal tile's
    for (let t = 0; t < PALETTE.length; t++) {
      const [n, f] = edge.filter((r) => r.tile === t);
      expect((f as { ratio: number }).ratio).toBeGreaterThan((n as { ratio: number }).ratio);
    }
    expect(xEdgeColor(10)).toMatch(/^#[0-9a-f]{6}$/);
    // the wrong X in --wrong: ≥ 3.41 on every tile, 6.00 faded; the pattern glyph in --ink-deep ≥ 3.24 (faded 3.30)
    const min = (what: string, faded: boolean): number => Math.min(...rows.filter((r) => r.what === what && r.faded === faded).map((r) => r.ratio));
    expect(min('wrong X (--wrong)', false)).toBeCloseTo(3.41, 2);
    expect(min('wrong X (--wrong)', true)).toBeCloseTo(6.0, 2);
    expect(min('pattern glyph (--ink-deep @ patternOpacity)', false)).toBeCloseTo(3.24, 2);
    expect(min('pattern glyph (--ink-deep @ patternOpacity)', true)).toBeCloseTo(3.3, 2);
  });

  it("Tux reads as a dark shape on every tile: fur ≥ 4.00, outline ≥ 5.23 (phase2b §1.6, look-spec §2.3)", () => {
    const rows = glyphContrast();
    const fur = rows.filter((r) => r.what === 'cat fur').map((r) => r.ratio);
    const outline = rows.filter((r) => r.what === 'cat outline').map((r) => r.ratio);
    expect(Math.min(...fur)).toBeCloseTo(4.0, 2);
    expect(Math.min(...outline)).toBeCloseTo(5.23, 2);
    expect(CAT_COLORS.fur).toBe('#2E2A33');
  });

  it('re-checks every event theme: text on its page and pattern motifs, faded tiles with its page (§1.12)', () => {
    const { ui, glyphs } = eventContrast();
    for (const r of [...ui, ...glyphs]) expect(r.ratio, 'what' in r ? r.what : '').toBeGreaterThanOrEqual('min' in r ? r.min : MIN_CONTRAST);
    for (const id of Object.keys(EVENT_THEME_TOKENS)) {
      expect(ui.some((r) => r.what === `--ink-2 on ${id} page`)).toBe(true);
      expect(glyphs.filter((r) => r.page === id)).toHaveLength(PALETTE.length * 6);
    }
    const min = (pred: (w: string) => boolean): number => Math.min(...ui.filter((r) => pred(r.what)).map((r) => r.ratio));
    // the spec's numbers on the event pages (§1.12; look-spec §1.2: the new ink ≥ 4.97)
    expect(min((w) => w.startsWith('--ink-2 on') && w.endsWith('page'))).toBeCloseTo(4.97, 2);
    expect(min((w) => w.startsWith('--accent-text on') && w.endsWith('page'))).toBeCloseTo(5.21, 2);
    expect(min((w) => w.startsWith('--accent-title') && w.endsWith('page'))).toBeCloseTo(3.48, 2);
    expect(min((w) => w.startsWith('focus ring on') && w.endsWith('page'))).toBeCloseTo(4.48, 2);
    // the motif colours were lightened (Phase 2d, look-spec §2.3) so --ink keeps 4.5 on them
    expect(min((w) => w.startsWith('--ink on') && w.includes('motif'))).toBeGreaterThanOrEqual(4.5);
    const g = (what: string): number => Math.min(...glyphs.filter((r) => r.what === what).map((r) => r.ratio));
    expect(g('wrong X (--wrong)')).toBeGreaterThanOrEqual(6.0);
    expect(g('pattern glyph (--ink-deep @ patternOpacity)')).toBeCloseTo(3.32, 2);
  });

  it('EVENT_THEME_TOKENS match the shipped event definitions (src/data/events/events.json)', () => {
    const defs = EVENTS as unknown as { id: string; theme: { page: string; boardCard: string; glow: string } }[];
    expect(defs.map((d) => d.id).sort()).toEqual(Object.keys(EVENT_THEME_TOKENS).sort());
    for (const d of defs) {
      const t = EVENT_THEME_TOKENS[d.id];
      expect(t?.page.toLowerCase(), d.id).toBe(d.theme.page.toLowerCase());
      expect(t?.boardCard.toLowerCase(), d.id).toBe(d.theme.boardCard.toLowerCase());
      expect(t?.glow.replace(/\s/g, ''), d.id).toBe(d.theme.glow.replace(/\s/g, ''));
    }
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
