// Owner: G3 (Phase 2d)
// Stylesheet rules of the HUD (hud.css and the HUD parts of screens.css, fx.css, overlay-chunk.css).
// Created at Phase 2d L0 (look-spec §3.2 item 1, critic C13) by moving, unchanged, from
// tests/unit/ui/css-rules.spec.ts (G2): the .tool__badge half of "small white text on orange uses
// --accent-text" (the base.css half stays there) and the whole "Phase 2c.1: the pills row" block.
// The helpers below are copies of css-rules.spec.ts's (no cross-owner imports).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const STYLES = join(ROOT, 'src/styles');
const read = (p: string): string => readFileSync(p, 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the primary-button rule (phase2b §1.4): count badges on the tools', () => {
  it('small white text on orange uses --accent-text: count badges on tools', () => {
    const hud = stripComments(read(join(STYLES, 'hud.css')));
    expect(/\.tool__badge\s*\{([^}]*)\}/.exec(hud)?.[1]).toMatch(/background:\s*var\(--accent-text\)/);
  });
});

// ── Phase 2c.1 (G2, fish-lives-spec §10.2–§10.3): the pills row grid and the level-points counter ──
/** The declarations of the rule whose selector list contains `selector` exactly (whitespace-normalised). */
function ruleOf(css: string, selector: string): string | null {
  const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((m[1] ?? '').split(',').map(norm).includes(norm(selector))) return norm(m[2] ?? '');
  }
  return null;
}

describe('Phase 2c.1: the pills row and the level-points counter', () => {
  const hud = read(join(STYLES, 'hud.css'));
  const screens = read(join(STYLES, 'screens.css'));
  const fx = read(join(STYLES, 'fx.css'));
  const overlays = read(join(STYLES, 'overlay-chunk.css'));

  it('the row is a 1fr auto 1fr grid: cats (and the win-flow period counter) start, points in the middle, lives end', () => {
    const row = ruleOf(hud, '.pills') ?? '';
    expect(row).toContain('display: grid');
    expect(row).toContain('grid-template-columns: 1fr auto 1fr');
    // The page baseline (04 §1): no flex gap anywhere in the row; a grid column gap is fine.
    expect(row).not.toMatch(/(^|[^-])gap:/);
    // Both in row 1, column 1 (the period counter shares the cat counter's cell at the win).
    expect(ruleOf(hud, '.pill--cats')).toContain('grid-area: 1 / 1');
    expect(ruleOf(hud, '.pills > .period-pill')).toContain('grid-area: 1 / 1');
    expect(ruleOf(hud, '.pill--cats')).toContain('justify-self: start');
    expect(ruleOf(hud, '.pills > .points-pill')).toContain('grid-column: 2');
    expect(ruleOf(hud, '.pill--lives')).toContain('grid-column: 3');
    expect(ruleOf(hud, '.pill--lives')).toContain('justify-self: end');
    // The in-game period counter no longer adds side margins (it sits in the cat counter's cell).
    expect(ruleOf(screens, '.period-pill[data-in-game]')).not.toContain('margin');
  });

  it('the counter is a white pill with tabular digits; sizes: fs-m/20 px, fs-l/24 px from 390 px, fs-s/18 px compact', () => {
    // The counter is a .pill too (pills.ts): the white box, shadow, row height and digits come from there.
    const base = ruleOf(hud, '.pill') ?? '';
    for (const d of ['background: var(--card)', 'box-shadow: var(--shadow-1)', 'border-radius: var(--radius-pill)', 'height: 100%', 'white-space: nowrap', 'font-family: var(--font-num)']) {
      expect(base, d).toContain(d);
    }
    const pill = ruleOf(hud, '.points-pill') ?? '';
    for (const d of ['font-size: var(--fs-m)', 'color: var(--ink)', 'padding-inline-start: 8px']) expect(pill, d).toContain(d);
    // Its own rules come after the compact .pill rule, so they win at equal specificity.
    expect(hud.indexOf('.pills[data-compact] .points-pill {')).toBeGreaterThan(hud.indexOf('.pills[data-compact] .pill {'));
    expect(hud.search(/\n\.points-pill \{/)).toBeGreaterThan(hud.search(/\n\.pill \{/));
    expect(ruleOf(screens, '.points-pill__count')).toContain('font-variant-numeric: tabular-nums');
    const icon = ruleOf(hud, '.points-pill__icon') ?? '';
    expect(icon).toContain('width: 20px');
    expect(icon).toContain('--icon-fill: var(--gold)');
    expect(ruleOf(hud, '.pills:not([data-compact]) .points-pill')).toContain('font-size: var(--fs-l)');
    expect(ruleOf(hud, '.pills:not([data-compact]) .points-pill__icon')).toContain('width: 24px');
    expect(hud).toMatch(/@media \(min-width: 390px\)\s*\{\s*\.pills:not\(\[data-compact\]\) \.points-pill/);
    expect(ruleOf(hud, '.pills[data-compact] .points-pill')).toContain('font-size: var(--fs-s)');
    expect(ruleOf(hud, '.pills[data-compact] .points-pill__icon')).toContain('width: 18px');
    expect(ruleOf(hud, '.points-pill[data-final]')).toContain('background: var(--accent-soft)');
  });

  it('the tight fallback drops the icon, then steps the digits down; never an ellipsis', () => {
    expect(ruleOf(hud, '.pills[data-tight] .points-pill__icon')).toContain('display: none');
    expect(ruleOf(hud, ".pills[data-tight='2'] .points-pill")).toContain('font-size: var(--fs-xs)');
    expect(stripComments(hud)).not.toMatch(/points-pill[^{]*\{[^}]*text-overflow/);
  });

  it('the counter shares the period counter\'s roll, bump and chip rules (one set of keyframes)', () => {
    // The roll's .is-in / .is-out are the counters' own classes (pills.ts), one rule each for both counters.
    for (const sel of ['.is-in', '.is-out', '.points-pill--bump .points-pill__icon', '.points-pill__label:not([data-reduced])']) {
      expect(ruleOf(fx, sel), sel).not.toBeNull();
    }
    expect(ruleOf(fx, '.is-in')).toContain('animation: period-roll-in var(--bump-ms, 360ms)');
    expect(ruleOf(screens, '.is-out')).toContain('position: absolute');
    // No other element uses the roll classes.
    const src = readdirSync(join(ROOT, 'src/ui'), { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    const users = src.filter((f) => /['"`. ]is-(in|out)\b/.test(read(join(ROOT, 'src/ui', f))));
    expect(users).toEqual(['hud/pills.ts']);
    expect(ruleOf(screens, '.points-pill__chip')).toBe(ruleOf(screens, '.period-pill__chip'));
    expect(ruleOf(screens, '.points-pill__label')).toBe(ruleOf(screens, '.period-pill__label'));
    // The bump scale is a variable: 1.25 for the other pills, 1.18 for the points (§10.2).
    expect(fx).toContain('scale(var(--bump-scale, 1.25))');
    expect(ruleOf(hud, '.points-pill')).toContain('--bump-scale: 1.18');
    // §10.3: the cat counter fades out while the period counter fades in, over the same --fade-ms.
    expect(ruleOf(fx, '.pill--cats[data-out]')).toContain('animation: pill-fade-out var(--fade-ms, 200ms)');
  });

  it('the victory points row is a white pill with a 24 px gold sparkle; the chips row and the streak chip are gone', () => {
    const row = ruleOf(overlays, '.victory__points') ?? '';
    for (const d of ['background: var(--card)', 'color: var(--ink)', 'font-size: var(--fs-xl)', 'white-space: nowrap']) expect(row, d).toContain(d);
    expect(ruleOf(overlays, '.victory__points-icon')).toContain('width: 24px');
    expect(ruleOf(overlays, '.victory__points-icon')).toContain('--icon-fill: var(--gold)');
    for (const gone of ['.victory__streak', '.victory__score', '.victory__chip']) expect(ruleOf(overlays, gone), gone).toBeNull();
    // How to play: the note icons never shrink and sit at the inline start in RTL.
    const note = ruleOf(overlays, '.howto__note-icon') ?? '';
    expect(note).toContain('flex: none');
    expect(note).toContain('margin-inline-end: 10px');
    expect(ruleOf(overlays, '.howto__note-icon--points')).toContain('--icon-fill: var(--gold)');
  });
});
