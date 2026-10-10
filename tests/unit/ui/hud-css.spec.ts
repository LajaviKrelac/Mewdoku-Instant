// Owner: G3 (Phase 2d)
// Stylesheet rules of the HUD (hud.css and the HUD parts of screens.css, fx.css, overlays.css,
// overlay-chunk.css and i18n.css). Created at Phase 2d L0 by moving the 2c.1 pills-row block and the
// .tool__badge check out of tests/unit/ui/css-rules.spec.ts (G2; critic C13); rewritten for 2d
// (look-spec §1.1–§1.16, §5.2): the stack variables drive the rows, the measured sizes, the badges and
// their RTL offsets, the pulse keyframes, the retired 2c.1 rules, the band clearance of the overlays.
// Phase 2d.1 (helpers-spec §1.2, §2.5, §2.7, §4.5, §5.2): the found head's face and dot and its pop, the
// press and release spring, the busy row, the Score without its chip, the fx layer and the tickers.
// The helpers are copies of css-rules.spec.ts's (no cross-owner imports).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const STYLES = join(ROOT, 'src/styles');
const read = (p: string): string => readFileSync(p, 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The declarations of every rule whose selector list contains `selector` exactly (whitespace-normalised),
 * joined in source order; null when there is none.
 */
function ruleOf(css: string, selector: string): string | null {
  const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((m[1] ?? '').split(',').map(norm).includes(norm(selector))) out.push(norm(m[2] ?? ''));
  }
  return out.length ? out.join(' ') : null;
}

const hud = read(join(STYLES, 'hud.css'));
const fx = read(join(STYLES, 'fx.css'));
const screens = read(join(STYLES, 'screens.css'));
const overlays = read(join(STYLES, 'overlays.css'));
const chunk = read(join(STYLES, 'overlay-chunk.css'));
const i18n = read(join(STYLES, 'i18n.css'));
/** Phase 2d.1: the lazy fx chunk's own stylesheet (the fx layer, the tickers). */
const celebrate = read(join(ROOT, 'src/ui/fx/celebrate.css'));

describe('Phase 2d: the stack (look-spec §1.1, §4.7)', () => {
  it('the rows take their heights and gaps from the screen\'s variables, top-down from --y-top', () => {
    expect(ruleOf(hud, '.top-bar--game')).toContain('height: var(--bar)');
    expect(ruleOf(hud, '.top-bar--game')).toContain('margin-top: var(--y-top)');
    expect(ruleOf(hud, '.top-bar--game')).toContain('width: var(--col-w)');
    // The 44 px hit areas of the discs reach below the bar; they paint over the pills row.
    expect(ruleOf(hud, '.top-bar--game')).toContain('z-index: 1');
    expect(ruleOf(hud, '.pills')).toContain('height: var(--pills)');
    expect(ruleOf(hud, '.pills')).toContain('margin: var(--g-bp) calc(var(--s) * 12px) 0');
    expect(ruleOf(hud, '.rule-chips')).toContain('height: var(--rules)');
    expect(ruleOf(hud, '.rule-chips')).toContain('margin: var(--g-pr) calc(var(--s) * 13.3px) 0');
    expect(ruleOf(overlays, '.game__stage')).toContain('height: var(--board)');
    expect(ruleOf(overlays, '.game__stage')).toContain('margin-top: var(--g-rb)');
    expect(ruleOf(overlays, '.game__tools')).toContain('height: var(--tools)');
    expect(ruleOf(overlays, '.game__tools')).toContain('margin-top: var(--g-bt)');
    expect(ruleOf(overlays, '.game__col')).toContain('width: var(--col-w)');
    // The safe top is inside --y-top; the band is in the layout, so base.css's banner padding is reset (critic C12).
    const screen = ruleOf(overlays, '.screen.screen--game') ?? '';
    expect(screen).toContain('padding-top: 0');
    expect(screen).toContain('padding-bottom: var(--safe-bottom)');
    // The 2b stage (centred board, --vgap) is gone.
    expect(stripComments(overlays)).not.toContain('--vgap');
  });

  it('font sizes are rem × s (critic C4) with 10 px floors on the small texts', () => {
    expect(ruleOf(hud, '.top-bar__mid > *')).toContain('font-size: calc(var(--s) * 1.206rem)');
    expect(ruleOf(hud, '.top-bar__val')).toContain('font-size: calc(var(--s) * 1.375rem * var(--vf, 1))');
    expect(ruleOf(hud, '.chip')).toContain('font-size: max(10px, calc(var(--s) * 0.725rem))');
    expect(ruleOf(hud, '.tool__badge')).toContain('font-size: max(10px, calc(var(--s) * 1.1rem))');
    expect(ruleOf(hud, '.top-bar--game .badge--hard')).toContain('font-size: max(10px, calc(var(--s) * 0.6875rem))');
    // Phase 2d.1 §2.5: the Score's "+N" chip is gone (the "+N" pops over the cat's tile).
    expect(ruleOf(hud, '.points-pill__chip')).toBeNull();
    // 2d I-polish a: the labels and the rule text are thinned by a stroke in their background's colour
    // (Fredoka's one 600 face; 0 on the 700 system stacks, which step down to 500); the numbers carry
    // no stroke any more (measured no heavier than Fredoka 600).
    const label = ruleOf(hud, '.points-pill__name') ?? '';
    expect(label).toContain('font-weight: calc(var(--display-weight) - 200)');
    expect(label).toContain('-webkit-text-stroke: calc((700 - var(--display-weight)) * 0.0004em) var(--page)');
    expect(ruleOf(hud, '.top-bar--game .top-bar__name')).toBe(label);
    const rule = ruleOf(hud, '.chip__text') ?? '';
    expect(rule).toContain('-webkit-text-stroke: calc((700 - var(--display-weight)) * 0.0003em) var(--rule-card)');
    expect(ruleOf(hud, '.chip[data-hl] .chip__text')).toContain('-webkit-text-stroke-color: var(--accent-soft)');
    expect(ruleOf(hud, '.top-bar--game .top-bar__suffix') ?? '').not.toContain('text-stroke');
    expect(ruleOf(hud, '.points-pill__count') ?? '').not.toContain('text-stroke');
  });
});

describe('Phase 2d: the game bar (§1.4, §1.13, §1.15)', () => {
  it('discs Ø 36.8 s at the measured x; the pair centred in the span between them; the FB shift; the dot', () => {
    const btn = ruleOf(hud, '.top-bar--game .top-bar__btn') ?? '';
    // One shadow token (requests-G3 R1, 2d I-2): .btn--icon's var(--shadow-btn), which the game screen
    // re-declares with its --s (tokens.css); no scaled copy here.
    expect(btn).not.toContain('box-shadow');
    expect(ruleOf(hud, '.tool__disc')).toContain('box-shadow: var(--shadow-btn)');
    expect(btn).toContain('width: calc(var(--s) * 36.8px)');
    // At the static inline start moved by margin-inline-start: the bar mirrors in RTL on its own.
    expect(btn).toContain('margin-inline-start: calc(var(--s) * 351.6px - var(--fb-e, 0px))');
    expect(btn).not.toMatch(/(^|[ ;])(left|right):/);
    expect(ruleOf(hud, '.top-bar--game .top-bar__btn--back')).toContain('margin-inline-start: calc(var(--s) * 13.1px + var(--fb-s, 0px))');
    const mid = ruleOf(hud, '.top-bar__mid') ?? '';
    expect(mid).toContain('margin-inline-start: calc(var(--s) * 49.9px + 4px + var(--fb-s, 0px))');
    expect(mid).toContain('width: calc(var(--s) * 301.7px - 8px - var(--fb-s, 0px) - var(--fb-e, 0px))');
    expect(mid).toContain('justify-content: center');
    expect(ruleOf(hud, '.top-bar__mid > *')).toContain('min-width: calc(var(--s) * 102px)');
    // The fit steps (critic C5): the values at 0.86 × and 0.74 ×.
    expect(ruleOf(hud, "[data-fit='1']")).toContain('--vf: 0.86');
    expect(ruleOf(hud, "[data-fit='2']")).toContain('--vf: 0.74');
    const dot = ruleOf(hud, '.top-bar__dot') ?? '';
    for (const d of ['background: var(--dot)', 'width: 30.7%', 'left: 75.4%', 'top: -5.3%', 'margin: 0']) expect(dot, d).toContain(d);
    expect(ruleOf(hud, '.points-pill__label')).toBeNull();
    expect(stripComments(hud)).not.toContain('--chip-dx');
    expect(ruleOf(hud, '.points-pill[data-final] .points-pill__count')).toContain('color: var(--accent-text)');
  });

  it('RTL (§1.18): the bar mirrors on its own (logical margins); the dot mirrors with the gear; the back arrow turns', () => {
    expect(ruleOf(i18n, "[dir='rtl'] .top-bar--game")).toContain('direction: rtl');
    expect(ruleOf(i18n, "[dir='rtl'] .top-bar")).toContain('direction: ltr'); // Home keeps 2b
    expect(ruleOf(i18n, "[dir='rtl'] .top-bar--game .top-bar__dot")).toContain('left: -6.1%');
    expect(ruleOf(i18n, "[dir='rtl'] .top-bar__btn--back .btn__icon")).toContain('transform: scaleX(-1)');
    // No physical overrides are needed for what uses margin-inline-start.
    for (const sel of ['.top-bar__mid', '.points-pill__label', '.chip__art']) expect(ruleOf(i18n, `[dir='rtl'] ${sel}`), sel).toBeNull();
  });
});

describe('Phase 2d: the pills row (§1.5, §1.6)', () => {
  it('a centred auto auto grid 12 s in: heads pill (and the win-flow period counter) as wide as its heads (--hpw, audit B1), then the fish pill; no flex gap', () => {
    const row = ruleOf(hud, '.pills') ?? '';
    expect(row).toContain('grid-template-columns: auto auto');
    expect(row).toContain('justify-content: center');
    expect(row).toContain('column-gap: calc(var(--s) * 11.3px)');
    expect(row).not.toMatch(/(^|[^-])gap:/);
    expect(ruleOf(hud, '.pill--heads')).toContain('grid-area: 1 / 1');
    expect(ruleOf(hud, '.pills > .period-pill')).toContain('grid-area: 1 / 1');
    expect(ruleOf(hud, '.pill--heads')).toContain('width: calc(var(--s) * var(--hpw, 270) * 1px)');
    expect(ruleOf(hud, '.pills > .period-pill')).toContain('width: calc(var(--s) * var(--hpw, 270) * 1px)');
    expect(ruleOf(hud, '.pill--lives')).toContain('grid-column: 2');
    // The heads pill has the faint pill shadow; the fish pill none.
    expect(ruleOf(hud, '.pill--heads')).toContain('box-shadow: var(--shadow-pill)');
    expect(stripComments(hud)).not.toMatch(/\.pill--lives\s*\{[^}]*box-shadow/);
    expect(ruleOf(hud, '.pill')).not.toContain('box-shadow');
  });

  it('heads 21.33 × 21.67 s, 4 s apart, scaled by --hk; the silhouette at 50 % until found; the pop and the fade are in fx.css', () => {
    const head = ruleOf(hud, '.head') ?? '';
    expect(head).toContain('--hs: calc(var(--s) * var(--hk, 1))');
    expect(head).toContain('width: calc(var(--hs) * 21.33px)');
    expect(head).toContain('height: calc(var(--hs) * 21.67px)');
    expect(head).toContain('margin: 0 calc(var(--hs) * 2px)');
    expect(ruleOf(hud, '.head__shape')).toContain('opacity: 0.5');
    // 2d.1 §2.7: found, our face replaces the silhouette; the dot: 8 s, the 50 % tint, a 1 s white rim,
    // its centre at + (7.8, 6.6) s toward the inline end.
    expect(ruleOf(hud, '.head[data-done] > .head__shape')).toContain('visibility: hidden');
    const dot = ruleOf(hud, '.head__dot') ?? '';
    for (const d of [
      'width: calc(var(--hs) * 8px)',
      'height: calc(var(--hs) * 8px)',
      'top: calc(50% + var(--hs) * 2.6px)',
      'inset-inline-start: calc(50% + var(--hs) * 3.8px)',
      'background: linear-gradient(rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.5)) currentColor',
      'box-shadow: 0 0 0 calc(var(--hs) * 1px) #fff',
      'border-radius: 50%',
    ])
      expect(dot, d).toContain(d);
    // The pop: 0.56 → 1.20 at 30 % (83 of 280 ms) → 1.
    expect(ruleOf(fx, '.head--pop')).toContain('animation: head-found var(--head-ms, 280ms) both');
    const pop = /@keyframes head-found\s*\{([\s\S]*?)\n\}/.exec(stripComments(fx))?.[1] ?? '';
    expect(pop).toMatch(/0%\s*\{\s*transform: scale\(0\.56\)/);
    expect(pop).toMatch(/30%\s*\{\s*transform: scale\(1\.2\)/);
    expect(pop).toMatch(/100%\s*\{\s*transform: none/);
    expect(ruleOf(fx, '.head--out')).toContain('animation: head-out 150ms');
    expect(ruleOf(fx, '.pill--heads[data-out]')).toContain('animation: pill-fade-out var(--fade-ms, 200ms)');
  });

  it('fish 24.7 × 23.3 s at a 25.3 s pitch, insets 10.7 / 10.3 s', () => {
    expect(ruleOf(hud, '.life')).toContain('width: calc(var(--s) * 24.7px)');
    expect(ruleOf(hud, '.life')).toContain('height: calc(var(--s) * 23.3px)');
    expect(ruleOf(hud, '.life + .life')).toContain('margin-inline-start: calc(var(--s) * 0.6px)');
    expect(ruleOf(hud, '.pill--lives')).toContain('padding-inline-start: calc(var(--s) * 10.7px)');
    // 2d I-polish b: the fish's art (x 1.4–23.75, y 2.6–23.15 of its 24 grid) spans the slot's width; the
    // splash shares the grid, so the droplets still start at the fish.
    const art = ruleOf(hud, '.life .icon') ?? '';
    expect(ruleOf(hud, '.life__splash')).toContain(art);
    for (const d of ['top: calc(var(--s) * -2.58px)', 'left: calc(var(--s) * -1.55px)', 'width: calc(var(--s) * 26.5px)', 'height: calc(var(--s) * 26.5px)']) expect(art, d).toContain(d);
  });

  it('2d I-polish c: the helper art boxes draw the art at the measured sizes (kitty 34.7 × 34.3, bulb 21.3 × 34, mouse 35 × 31.3)', () => {
    expect(ruleOf(hud, '.tool--paw .tool__icon')).toBe('position: relative; top: calc(var(--s) * -0.9px); width: calc(var(--s) * 36px); height: calc(var(--s) * 36px);');
    expect(ruleOf(hud, '.tool--bulb .tool__icon')).toBe('width: calc(var(--s) * 21.9px); height: calc(var(--s) * 34px);');
    expect(ruleOf(hud, '.tool--mouse .tool__icon')).toBe('width: calc(var(--s) * 36.2px); height: calc(var(--s) * 32.4px);');
  });

  it('the period counter over the heads: white, centred, its "+3" inside the pill (critic C10); Home keeps the 2c chip', () => {
    const pill = ruleOf(screens, '.period-pill[data-in-game]') ?? '';
    expect(pill).toContain('justify-content: center');
    expect(pill).toContain('height: 100%');
    expect(ruleOf(screens, '.period-pill[data-in-game] .period-pill__label')).toContain('margin-inline-start: calc(100% + var(--s) * 4px)');
    expect(ruleOf(screens, '.period-pill__label')).toContain('bottom: 100%');
  });

  it('the counters share one roll (is-in / is-out) and one bump; the Score bumps its number at 1.12', () => {
    expect(ruleOf(fx, '.is-in')).toContain('animation: period-roll-in var(--bump-ms, 360ms)');
    expect(ruleOf(screens, '.is-out')).toContain('position: absolute');
    // The bump stays for the 2d fallback roll (the fx chunk not loaded yet).
    expect(ruleOf(fx, '.points-pill--bump .points-pill__count')).toContain('animation: bump var(--bump-ms, 360ms)');
    expect(ruleOf(hud, '.points-pill')).toContain('--bump-scale: 1.12');
    expect(fx).toContain('scale(var(--bump-scale, 1.25))');
    const src = readdirSync(join(ROOT, 'src/ui'), { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    const users = src.filter((f) => /['"`. ]is-(in|out)\b/.test(read(join(ROOT, 'src/ui', f))));
    expect(users).toEqual(['hud/pills.ts']);
  });

  it('the retired 2c.1 rules are gone: cat counter, points pill in the row, tight fallback, compact sizes', () => {
    const all = stripComments(hud + fx + screens);
    for (const gone of ['.pill--cats', '.pill__count', '.pill__icon', '.pills > .points-pill', '.pills[data-tight]', '.pills[data-compact]', '.points-pill__icon', '.pill--bump']) {
      expect(all, gone).not.toContain(gone);
    }
  });
});

describe('Phase 2d: the rule cards (§1.7)', () => {
  it('one white container, three --rule-card cards 7 s apart; the 32.7 s diagram at the inline start; text from 46 s', () => {
    const box = ruleOf(hud, '.rule-chips') ?? '';
    expect(box).toContain('background: var(--card)');
    expect(box).toContain('border-radius: calc(var(--s) * 10.7px)');
    expect(box).toContain('padding: calc(var(--s) * 8.3px) calc(var(--s) * 7.5px) calc(var(--s) * 7.3px)');
    expect(box).not.toContain('box-shadow');
    const card = ruleOf(hud, '.chip') ?? '';
    for (const d of ['background: var(--rule-card)', 'padding-inline-start: calc(var(--s) * 46px)', 'border-radius: calc(var(--s) * 5.6px)', 'line-height: 1.15']) expect(card, d).toContain(d);
    expect(ruleOf(hud, '.chip + .chip')).toContain('margin-inline-start: calc(var(--s) * 7px)');
    expect(ruleOf(hud, '.chip__art')).toContain('width: calc(var(--s) * 32.7px)');
    expect(ruleOf(hud, '.chip__text')).toContain('-webkit-line-clamp: 3');
    expect(ruleOf(hud, '.rule-chips[data-compact] .chip__text')).toContain('display: none');
    expect(ruleOf(hud, '.rule-chips[data-compact] .chip__art')).toContain('left: 50%');
    expect(ruleOf(hud, '.chip__art')).toContain('margin-inline-start: calc(var(--s) * -40.4px)'); // 5.6 − 46
    expect(ruleOf(hud, '.chip[data-hl]')).toContain('background: var(--accent-soft)');
    expect(ruleOf(hud, '.chip[data-hl]')).toContain('box-shadow: 0 0 0 2px var(--accent)');
  });
});

describe('Phase 2d: the helper row (§1.11)', () => {
  it('discs Ø --tools on a 103.1 s pitch, the warm shadow, no hard bottom edge; a 44 × 44 hit area at every s', () => {
    const tool = ruleOf(hud, '.tool') ?? '';
    expect(tool).toContain('width: var(--tools)');
    expect(tool).toContain('margin: 0 calc(var(--s) * 21.4px)'); // 60.3 + 2 × 21.4 = 103.1
    const hit = ruleOf(hud, '.tool::before') ?? '';
    expect(hit).toContain('width: max(100%, 44px)');
    expect(hit).toContain('height: max(100%, 44px)');
    expect(ruleOf(hud, '.tool__disc')).toContain('box-shadow: var(--shadow-btn)');
    expect(stripComments(hud)).not.toMatch(/\.tool[^{]*\{[^}]*0 4px 0 var\(--line-2\)/);
    expect(stripComments(hud)).not.toContain('.tool + .tool');
    expect(ruleOf(hud, '.tool:disabled')).toContain('opacity: 0.45');
    expect(ruleOf(hud, '.tool[data-off]')).toContain('visibility: hidden');
  });

  it('2d.1 §4.5: the whole control presses to 0.90 within 50 ms; the release spring via 1.04 over 300 ms; none with reduced motion', () => {
    expect(ruleOf(hud, '.tool')).toContain('transition: transform 50ms ease-out');
    expect(ruleOf(hud, '.tool:active:not(:disabled)')).toBe('transform: scale(0.9);');
    expect(ruleOf(hud, '.tool:active:not(:disabled) .tool__disc')).toBeNull();
    expect(ruleOf(hud, '.tool--spring')).toContain('animation: tool-spring 300ms');
    const kf = /@keyframes tool-spring\s*\{([\s\S]*?)\n\}/.exec(stripComments(hud))?.[1] ?? '';
    expect(kf).toMatch(/0%\s*\{\s*transform: scale\(0\.9\)/);
    expect(kf).toMatch(/28%,\s*45%\s*\{\s*transform: scale\(1\.04\)/);
    expect(kf).toMatch(/100%\s*\{\s*transform: none/);
    expect(ruleOf(hud, "[data-motion='reduced'] .tool:active")).toContain('transform: none');
    // Apply presses the same way (overlay-chunk.css).
    expect(ruleOf(chunk, ".btn.hint-apply:active:not([aria-disabled='true'])")).toContain('transform: scale(0.9)');
    // audit B12: on touch, :active does not hold while the finger is down; [data-pressed] (dom.ts trackPress) presses the same.
    expect(ruleOf(hud, '.tool[data-pressed]:not(:disabled)')).toBe('transform: scale(0.9);');
    expect(ruleOf(hud, "[data-motion='reduced'] .tool[data-pressed]")).toContain('transform: none');
    expect(ruleOf(chunk, ".btn.hint-apply[data-pressed]:not([aria-disabled='true'])")).toContain('transform: scale(0.9)');
    expect(ruleOf(chunk, "[data-motion='reduced'] .btn.hint-apply[data-pressed]")).toContain('transform: none');
  });

  it('audit B6 (measured: a near-white halo behind the number and its label at the count-up): the Score column\'s own halo while [data-counting], behind the digits (z −1 in an isolated column), over --count-ms', () => {
    expect(ruleOf(hud, '.points-pill')).toContain('isolation: isolate');
    const halo = ruleOf(hud, '.points-pill[data-counting]::before') ?? '';
    expect(halo).toContain('z-index: -1');
    expect(halo).toContain('animation: score-halo var(--count-ms, 350ms) linear both');
    expect(halo).toMatch(/radial-gradient\(closest-side, #fff 0%, rgba\(var\(--score-halo-rgb\), 0\.95\) 40%/);
    expect(read(join(STYLES, 'tokens.css'))).toContain('--score-halo-rgb: 255, 246, 242;'); // near-white, no saturated yellow
    const kf = /@keyframes score-halo\s*\{([\s\S]*?)\n\}/.exec(stripComments(hud))?.[1] ?? '';
    expect(kf).toMatch(/20%,\s*48\.6%\s*\{\s*opacity: 1/);
    expect(kf).toMatch(/100%\s*\{\s*opacity: 0/);
  });

  it('2d.1 §1.2 (critic): a busy row is inert and keeps its look: no disabled fade', () => {
    expect(ruleOf(hud, '.tool-bar[data-busy] .tool')).toContain('pointer-events: none');
    expect(ruleOf(hud, '.tool-bar[data-busy] .tool:disabled')).toContain('opacity: 1');
  });

  it('the idle pulse: 1.5 s, peak at 32–36 %, rest from 69 %; the glow is a pseudo-element\'s opacity', () => {
    expect(ruleOf(hud, '.tool[data-pulse]:not(:disabled) .tool__disc')).toContain('animation: tool-pulse var(--pulse-ms, 1500ms)');
    expect(ruleOf(hud, '.tool[data-pulse]:not(:disabled) .tool__disc::after')).toContain('animation: tool-glow var(--pulse-ms, 1500ms)');
    const pulseKf = /@keyframes tool-pulse\s*\{([\s\S]*?)\n\}/.exec(stripComments(hud))?.[1] ?? '';
    const glowKf = /@keyframes tool-glow\s*\{([\s\S]*?)\n\}/.exec(stripComments(hud))?.[1] ?? '';
    for (const body of [pulseKf, glowKf]) {
      expect(body).toMatch(/0%,\s*69%,\s*100%\s*\{/);
      expect(body).toMatch(/32%,\s*36%\s*\{/);
    }
    expect(pulseKf).toContain('scale(var(--pulse-scale, 1.08))');
    expect(glowKf).toContain('opacity: 1');
    // audit B2 (measured): the icon swells 1.25 × in all while its disc reaches 1.08: it adds 1.15 at the same stops.
    expect(ruleOf(hud, '.tool[data-pulse]:not(:disabled) .tool__icon')).toContain('animation: tool-icon-pulse var(--pulse-ms, 1500ms) ease-in-out infinite');
    const iconKf = /@keyframes tool-icon-pulse\s*\{([\s\S]*?)\n\}/.exec(stripComments(hud))?.[1] ?? '';
    expect(iconKf).toMatch(/0%,\s*69%,\s*100%\s*\{\s*transform: none/);
    expect(iconKf).toMatch(/32%,\s*36%\s*\{\s*transform: scale\(var\(--pulse-icon, 1\.15\)\)/);
    expect(ruleOf(hud, '.tool__disc::after')).toMatch(/rgba\(var\(--pulse-rgb\), 0\.9\)/);
  });

  it('badges: --badge 28 × 21.3 s at + (26, −28.3), growing toward the inline end; video and free; RTL mirrors', () => {
    const b = ruleOf(hud, '.tool__badge') ?? '';
    for (const d of ['background: var(--badge)', 'min-width: calc(var(--s) * 28px)', 'height: calc(var(--s) * 21.3px)', 'padding: 0 calc(var(--s) * 5px)', 'left: calc(var(--s) * 42.15px)', 'top: calc(var(--s) * -8.8px)', 'white-space: nowrap', 'color: #fff']) {
      expect(b, d).toContain(d);
    }
    // White 17.6 px digits on --badge (4.68:1); never the 2b --accent-text circle with a page ring.
    expect(b).not.toContain('--accent-text');
    expect(b).not.toContain('box-shadow');
    expect(ruleOf(hud, '.tool__badge--video')).toContain('background: var(--badge-video)');
    expect(ruleOf(hud, '.tool__badge--video')).toContain('width: calc(var(--s) * 35.3px)');
    expect(ruleOf(hud, '.tool__badge--free')).toContain('color: var(--ink-deep)');
    expect(ruleOf(hud, '.tool[data-empty] .tool__badge--count')).toContain('background: var(--ink-2)');
    expect(ruleOf(i18n, "[dir='rtl'] .tool__badge")).toContain('right: calc(var(--s) * 42.15px)');
    expect(ruleOf(i18n, "[dir='rtl'] .tool__badge")).toContain('left: auto');
    expect(ruleOf(i18n, "[dir='rtl'] .tool__badge--video")).toContain('right: calc(var(--s) * 38.2px)');
  });
});

describe('Phase 2d: the band (§1.16); the start toast retired at 2d.1 I-3', () => {
  it('2d.1 I-3: the start toast and its column fx layer are gone (the tickers replace them)', () => {
    expect(ruleOf(fx, '.start-toast')).toBeNull();
    expect(ruleOf(fx, '.game__fx')).toBeNull();
  });

  it('O2 and O4 keep their controls above the band (2d.1: O1 hides the banner and anchors to the board); the O9 toast sits above the helper badges', () => {
    const r = ruleOf(chunk, ":root[data-play-band='1'] .overlay[data-overlay='rewarded']") ?? '';
    expect(r).toContain('padding-bottom: calc(12px + var(--play-band) + var(--play-band-bottom))');
    expect(ruleOf(chunk, ":root[data-play-band='1'] .overlay[data-overlay='hint']")).toBeNull();
    expect(ruleOf(chunk, ":root[data-play-band='1'] .overlay[data-overlay='fail']")).toBe(r);
    expect(ruleOf(overlays, '.toast-layer')).toContain('bottom: var(--toast-bottom, calc(104px + var(--safe-bottom)))');
  });

  it('the X draw-in is gone from fx.css (the pop is G2\'s, board.css): no rule targets .cell__x', () => {
    const f = stripComments(fx);
    for (const gone of ['.cell__x', 'x-draw', 'xe-draw', '--x-len', 'stroke-dashoffset']) expect(f, gone).not.toContain(gone);
  });
});

describe('Phase 2d.1: the fx layer and the tickers (§2.5, §5.2)', () => {
  it('their CSS is out of the first load: only the lazy fx chunk imports celebrate.css; no ticker rule in src/styles', () => {
    for (const css of [hud, fx, screens, overlays, chunk, i18n]) expect(stripComments(css)).not.toMatch(/\.ticker|\.game-fx/);
    const importers = readdirSync(join(ROOT, 'src'), { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.ts') && read(join(ROOT, 'src', f)).includes("celebrate.css'"));
    expect(importers).toEqual([join('ui', 'fx', 'celebrate.ts')]);
    // Tokens only, as in src/styles.
    expect(stripComments(celebrate)).not.toMatch(/#(?!fff\b)[0-9a-f]{3,8}\b/i);
  });

  it('.game-fx: fixed over the viewport, above the HUD and the win scrim (5), below the overlays (40), no pointer events', () => {
    const l = ruleOf(celebrate, '.game-fx') ?? '';
    for (const d of ['position: fixed', 'z-index: 6', 'overflow: hidden', 'pointer-events: none']) expect(l, d).toContain(d);
    expect(ruleOf(screens, '.game__scrim')).toContain('z-index: 5');
  });

  it('a ticker: the slots y0 + 89.2 / 130 s, 29.3 s tall, the 1.2 s --toast-line border, the semicircle end, the text 20 s in', () => {
    const t = ruleOf(celebrate, '.ticker') ?? '';
    for (const d of [
      'top: calc(var(--y-top) + var(--s) * 89.2px)',
      'height: calc(var(--s) * 29.3px)',
      'padding-inline-start: calc(var(--s) * 20px)',
      'max-width: calc(var(--col-w) - var(--s) * 24px)',
      'white-space: nowrap',
      'color: var(--ink)',
    ])
      expect(t, d).toContain(d);
    // audit B8: the body (fill, border, round end) is the ::before, starting under the paw (8 s in), so its
    // straight top and bottom never run past the scallops; the ticker box itself has none
    expect(t).not.toMatch(/(?:^|[;\s])(?:border(?:-[a-z]+)*|background)\s*:/);
    const body = ruleOf(celebrate, '.ticker::before') ?? '';
    for (const d of [
      'z-index: -1',
      'inset-inline-start: calc(var(--s) * 8px)',
      'border: calc(var(--s) * 1.2px) solid var(--toast-line)',
      'border-inline-start: 0',
      'border-start-end-radius: calc(var(--s) * 14.65px)',
      'border-end-end-radius: calc(var(--s) * 14.65px)',
      'background: var(--toast-fill)',
    ])
      expect(body, d).toContain(d);
    expect(ruleOf(celebrate, ".ticker[data-line='2']")).toContain('top: calc(var(--y-top) + var(--s) * 130px)');
    const text = ruleOf(celebrate, '.ticker__text') ?? '';
    for (const d of ['font-size: max(10px, calc(var(--s) * 16.5px))', 'text-overflow: ellipsis', 'overflow: hidden']) expect(text, d).toContain(d);
    // audit B7: thinned like the labels (measured stroke 1.40 vs 1.87 px), in the pill's own fill
    expect(text).toContain('-webkit-text-stroke: calc((700 - var(--display-weight)) * 0.0004em) var(--toast-fill)');
    // audit B8: the paw's scallops overhang the pill 2.1 s above and below
    expect(ruleOf(celebrate, '.ticker__paw')).toContain('height: calc(var(--s) * 33.5px)');
    expect(ruleOf(celebrate, '.ticker__paw')).toContain('top: calc(var(--s) * -2.1px)');
  });

  it('audit B14: the tickers cross the game column, clipped to it (not the whole desktop viewport)', () => {
    const box = ruleOf(celebrate, '.tickers') ?? '';
    for (const d of ['position: absolute', 'left: calc(50% - var(--col-w) / 2)', 'width: var(--col-w)', 'overflow: hidden', 'pointer-events: none']) expect(box, d).toContain(d);
  });

  it('RTL: the tickers are anchored at the right and the paw turns (they move left → right, tickers.ts)', () => {
    expect(ruleOf(celebrate, "[dir='rtl'] .ticker")).toContain('right: 0');
    expect(ruleOf(celebrate, "[dir='rtl'] .ticker__paw")).toContain('transform: scaleX(-1)');
  });

  it('the hint overlay (O1, §3.2): the 75 % dim fades in linearly, the card and Apply sizes × s, no entrance animation', () => {
    expect(ruleOf(chunk, ".overlay[data-overlay='hint']")).toContain('animation: none');
    // 30 ms ahead: the original's first dimmed frame already shows α 0.078 (helpers-spec §3.2 critic; I-6 refit)
    expect(ruleOf(chunk, '.hint-dim')).toContain('animation: hint-dim-in var(--dim-ms, 300ms) linear -30ms both');
    expect(ruleOf(chunk, '.hint-dim > path')).toContain('fill: rgba(0, 0, 0, 0.75)');
    expect(ruleOf(chunk, '.hint-dim > path')).toContain('fill-rule: evenodd');
    const card = ruleOf(chunk, '.hint-card') ?? '';
    for (const d of ['background: var(--hint-card)', 'border-radius: calc(var(--hs, 1) * 15px)', 'min-height: calc(var(--hs, 1) * 70.3px)', 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25)', 'max-height: var(--hc-max, none)']) expect(card, d).toContain(d);
    const text = ruleOf(chunk, '.hint-card__text') ?? '';
    for (const d of ['overflow-y: auto', 'font-size: max(10px, calc(var(--hs, 1) * 14.5px))', 'color: var(--ink)']) expect(text, d).toContain(d);
    // audit B9 (measured: the card's sentence is in the rounded display face, stroke 1.0 px): the display face, thinned
    for (const d of ['font-family: var(--font-display)', 'font-weight: var(--display-weight)', '-webkit-text-stroke: calc((700 - var(--display-weight)) * 0.0005em) var(--hint-card)'])
      expect(text, d).toContain(d);
    // audit B13: the colour name's underline scales with the card's text (at 320 px in German it cleared line 3 by too little)
    const under = ruleOf(chunk, '.hint-card__text .color-name') ?? '';
    expect(under).toContain('text-decoration-thickness: max(1.5px, 0.16em)');
    expect(under).toContain('text-underline-offset: max(1.5px, 0.14em)');
    const apply = ruleOf(chunk, '.btn.hint-apply') ?? '';
    for (const d of ['background: var(--apply)', 'width: calc(var(--hs, 1) * 278.7px)', 'height: calc(var(--hs, 1) * 59.3px)', 'font-size: max(24px, calc(var(--hs, 1) * 28px))', 'box-shadow: none']) expect(apply, d).toContain(d);
    expect(ruleOf(chunk, '.hint-close.visually-hidden-focusable:focus')).toContain('width: 44px');
  });
});
