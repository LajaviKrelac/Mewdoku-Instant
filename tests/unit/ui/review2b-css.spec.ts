// Owner: U (Phase 2b review fixes). The stylesheet halves of the review fixes, read from the source
// (jsdom has no layout; tests/e2e/visual.spec.ts and i18n.spec.ts measure the real thing):
// the dark victory screen (PAR-3) with sticky actions clear of the banner band (UX-1) and the fish
// pill above the rays (UX-13); the FB safe zone for dialogs and the top-placed hint card (UX-3,
// UX-9); the RTL price gap (UX-10); 44 px hub tabs (A11Y-HUB-1); an event card that grows with its
// text (I18N-TEXT-1); the Home hero that never overflows upward (UX-2); the shop row that wraps
// (UX-8); the keyword and colour-name styles (PAR-7).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const STYLES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles');
const css = (file: string): string => readFileSync(join(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list contains `selector` exactly (all media blocks). */
function decls(file: string, selector: string): string {
  const out: string[] = [];
  for (const m of css(file).matchAll(/([^{}@]*)\{([^{}]*)\}/g)) {
    const sels = (m[1] ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (sels.includes(selector)) out.push(m[2] ?? '');
  }
  return out.join(';');
}

describe('victory screen (PAR-3, UX-1, UX-13)', () => {
  it('is a dark full-screen overlay with light text, like the fail card', () => {
    expect(decls('overlay-chunk.css', ".overlay[data-overlay='victory']")).toMatch(/background:\s*var\(--stage\)/);
    expect(decls('overlay-chunk.css', '.victory__praise')).toMatch(/color:\s*var\(--title-on-dark\)/);
    expect(decls('overlay-chunk.css', '.victory__sub')).toMatch(/color:\s*rgba\(255, 255, 255, 0\.82\)/);
    expect(decls('overlay-chunk.css', '.victory__home.btn--ghost')).toMatch(/color:\s*rgba\(255, 255, 255/);
  });

  it('keeps the buttons sticky at the bottom, the reserve plus the clearance above the banner band', () => {
    const actions = decls('overlay-chunk.css', '.victory__actions');
    expect(actions).toMatch(/position:\s*sticky/);
    expect(actions).toMatch(/background:\s*var\(--stage\)/);
    expect(decls('overlay-chunk.css', '.victory[data-banner] .victory__actions')).toMatch(
      /bottom:\s*calc\(var\(--banner-reserve, 58px\) \+ var\(--banner-clear, 16px\) \+ var\(--safe-bottom\)\)/,
    );
    // fit() steps shrink the hero through its size variables.
    expect(decls('overlay-chunk.css', '.victory[data-fit]')).toMatch(/--v-hero:\s*136px/);
    expect(decls('overlay-chunk.css', '.victory[data-tight]')).toMatch(/--v-hero:\s*96px/);
    expect(decls('overlay-chunk.css', ".victory[data-fit='3']")).toMatch(/--v-hero:\s*64px/);
    expect(decls('overlay-chunk.css', '.victory__art > svg')).toMatch(/width:\s*var\(--v-hero\)/);
  });

  it('paints the reward rows above the turning rays (Phase 2c: no fish pill on top; the kept-fish row is in the column)', () => {
    expect(decls('overlay-chunk.css', '.victory__top')).toBe('');
    expect(decls('overlay-chunk.css', '.victory__col')).toMatch(/z-index:\s*0/);
    expect(decls('overlay-chunk.css', '.victory__rays')).toMatch(/z-index:\s*-1/);
  });
});

describe('FB safe zone (UX-3, UX-9)', () => {
  it('dialogs and sheets start below the zone on FBIG', () => {
    expect(decls('overlay-chunk.css', ":root[data-fb-safe] .overlay:not([data-overlay='victory']):not([data-overlay='hint'])")).toMatch(
      /padding-top:\s*max\(calc\(16px \+ var\(--safe-top\)\), var\(--fb-safe\)\)/,
    );
  });

  it('a top-placed hint card keeps its content below the zone', () => {
    expect(decls('overlay-chunk.css', ":root[data-fb-safe] .overlay[data-overlay='hint'][data-placement='top'] .hint-card")).toMatch(/var\(--fb-safe\)/);
  });
});

describe('right to left and line breaking (UX-10, UX-8)', () => {
  it('a price after a button label keeps its gap on the label side in RTL', () => {
    const rule = decls('i18n.css', "[dir='rtl'] .btn > * + .num");
    expect(rule).toMatch(/margin-left:\s*0/);
    expect(rule).toMatch(/margin-right:\s*var\(--sp-2\)/);
  });

  it('Japanese breaks between phrases', () => {
    expect(decls('i18n.css', ':root:lang(ja)')).toMatch(/word-break:\s*auto-phrase/);
  });

  it('a shop item name wraps instead of running under its button (Phase 2c: no swap button any more)', () => {
    expect(decls('overlay-chunk.css', '.shop__name')).toMatch(/overflow-wrap:\s*break-word/);
    expect(css('overlay-chunk.css')).not.toMatch(/\.shop__swap|\.shop__balance|\.rewarded__swap/);
  });

  it('a personal-records value stays on one line; its label wraps (Phase 2c integration: "41 Fische" at 320 px)', () => {
    expect(decls('overlay-chunk.css', '.rank-records__value')).toMatch(/white-space:\s*nowrap/);
    expect(decls('overlay-chunk.css', '.rank-records__value')).toMatch(/flex:\s*none/);
    expect(decls('overlay-chunk.css', '.rank-records__label')).toMatch(/min-width:\s*0/);
  });

  it('the top-bar title shrinks its name, never its " · N" suffix (I18N-TEXT-2)', () => {
    expect(decls('hud.css', '.top-bar__name')).toMatch(/text-overflow:\s*ellipsis/);
    expect(decls('hud.css', '.top-bar__suffix')).toMatch(/flex:\s*none/);
    expect(decls('hud.css', '.top-bar__text')).not.toMatch(/text-overflow/);
  });
});

describe('sizes and text (A11Y-HUB-1, I18N-TEXT-1, UX-2, PAR-7)', () => {
  it('rankings hub tabs are 44 px touch targets', () => {
    expect(decls('overlay-chunk.css', '.rank-hub__tab')).toMatch(/min-height:\s*44px/);
  });

  it('the Home event card grows with larger text: a minimum height, no fixed height', () => {
    const card = decls('screens.css', '.event-card');
    expect(card).toMatch(/min-height:\s*72px/);
    expect(card).not.toMatch(/(^|[;\s])height:\s*72px/);
    expect(decls('screens.css', '.event-card__title')).not.toMatch(/white-space:\s*nowrap/);
  });

  it('the Home hero is centred with auto margins (never overflowing up under the top bar)', () => {
    expect(decls('overlays.css', '.home__hero')).toMatch(/justify-content:\s*flex-start/);
    expect(decls('overlays.css', '.home__hero > :first-child')).toMatch(/margin-top:\s*auto/);
    expect(decls('overlays.css', '.home__hero > :last-child')).toMatch(/margin-bottom:\s*auto/);
    expect(decls('screens.css', '.screen--home[data-event][data-banner] .home__mascot > svg')).toMatch(/width:\s*96px/);
  });

  it('keywords in the accent text colour; colour names keep ink with a swatch in the tile colour', () => {
    expect(decls('overlay-chunk.css', '.kw')).toMatch(/color:\s*var\(--accent-text\)/);
    expect(decls('overlay-chunk.css', '.color-name__sw')).toMatch(/background:\s*var\(--sw\)/);
    expect(decls('overlay-chunk.css', '.color-name')).not.toMatch(/(^|[;\s])color:/);
  });
});

// ── lead, final integration: the CSS halves of UX-12, PERF-1/PERF-3 and UX-4 ──

describe('final integration: label, input lock, scrim hand-off, panel fade', () => {
  it('UX-12: the "+3" label is anchored above the period counter, and its keyframes rise from there', () => {
    const label = decls('screens.css', '.period-pill__label');
    expect(label).toMatch(/bottom:\s*100%/);
    expect(label).not.toMatch(/(^|;)\s*top:\s*0/);
    expect(decls('screens.css', '.period-pill__label[data-reduced]')).toMatch(/transform:\s*none/);
    expect(css('fx.css')).toMatch(/@keyframes period-label-rise\s*\{\s*0%\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(6px\) scale\(0\.6\);/);
  });

  it('PERF-1 / PERF-3: the input lock is one layer over the board, not a rule on every cell', () => {
    expect(decls('board.css', ".board[aria-disabled='true'] .cell")).toBe('');
    const lock = decls('board.css', ".board[aria-disabled='true']::after");
    expect(lock).toMatch(/cursor:\s*default/);
    expect(lock).toMatch(/position:\s*absolute/);
  });

  it('PERF-3: the win scrim steps aside by the router\'s [data-modal] marker, not by [inert]', () => {
    expect(decls('screens.css', '[inert] .game__scrim')).toBe('');
    expect(decls('screens.css', '.app-screen[data-modal] .game__scrim')).toMatch(/opacity:\s*0/);
  });

  it('UX-4: the ranking panel\'s leave fades its content, never its scrim', () => {
    expect(decls('overlay-chunk.css', ".overlay[data-overlay='ranking'].is-leaving")).toBe('');
    expect(decls('overlay-chunk.css', ".overlay[data-overlay='ranking'].is-leaving .overlay__panel")).toMatch(/opacity:\s*0/);
  });
});
