// Owner: A. Stylesheet rules of the Classic look (phase2b §1.4, §1.8, §1.12):
// - colour literals live only in styles/tokens.css (allowlist elsewhere: #fff/#ffffff,
//   rgba(255,255,255,α), rgba(0,0,0,α), transparent, currentColor, inherit);
// - .btn--primary labels are ≥ 1.5rem (white on --accent is only a large-text pair, 3.15:1);
// - the retired-look guard: no retired Phase 2 value (teal, ginger, …) anywhere in src/, no data-skin;
// - tokens.css stays in sync with config, the event data and the event art.
// Phase 2d L0 (look-spec §3.2 item 1): the "Phase 2c.1: the pills row" block and the .tool__badge
// check moved to hud-css.spec.ts (G3); this file is G2's in Phase 2d.
// Phase 2d (G2, look-spec §1.2, §1.8, §1.10, §2.3): the measured tokens, the retired 2c.1 values,
// the board card without a shadow, the X as filled white bars with its edge only under [data-patterns].
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { en } from '../../../src/i18n/en';
import { eventPatternUrl } from '../../../src/ui/art/event-art';
import { EVENT_THEME_TOKENS, PALETTE } from '../../../src/ui/art/palette';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const STYLES = join(ROOT, 'src/styles');
const read = (p: string): string => readFileSync(p, 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const cssFiles = readdirSync(STYLES).filter((f) => f.endsWith('.css'));

/** CSS named colours (CSS Color 4), lower-case. `transparent` and `currentcolor` are allowed keywords. */
const NAMED = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue ' +
    'chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey ' +
    'darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray ' +
    'darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen ' +
    'fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen ' +
    'lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime ' +
    'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
    'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive ' +
    'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
    'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver ' +
    'skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen'
  ).split(' '),
);

/** Colour literals in one stylesheet that are not on the allowlist, as "line: literal". */
export function colourLiterals(css: string): string[] {
  const out: string[] = [];
  const src = stripComments(css);
  // declaration values only: the innermost {…} blocks (rules and keyframe steps), split into declarations
  for (const block of src.match(/\{[^{}]*\}/g) ?? []) {
    for (const decl of block.slice(1, -1).split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      const value = decl
        .slice(colon + 1)
        .replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, ' ')
        .replace(/"[^"]*"|'[^']*'/g, ' ');
      for (const m of value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
        if (!/^#(fff|ffffff)$/i.test(m)) out.push(m);
      }
      for (const m of value.match(/\b(?:rgba?|hsla?)\(\s*[\d.][^)]*\)/gi) ?? []) {
        const n = m.replace(/\s/g, '').toLowerCase();
        if (!/^rgba\((255,255,255|0,0,0),[\d.]+\)$/.test(n)) out.push(m);
      }
      const words = value.replace(/var\([^)]*\)/g, ' ').split(/[^a-zA-Z-]+/);
      for (const w of words) if (NAMED.has(w.toLowerCase())) out.push(w);
    }
  }
  return out;
}

describe('colour literals live only in tokens.css (phase2b §1.3, §1.12)', () => {
  it('the scanner finds hex, rgb()/hsl() with numbers and named colours, and honours the allowlist', () => {
    const css = `a{color:#123456;background:rgba(1,2,3,.5);border-color:red;fill:#fff;stroke:rgba(255, 255, 255, 0.6);
      box-shadow:0 0 0 rgba(0,0,0,.2), 0 0 rgba(var(--ink-rgb), .1);outline-color:currentColor;background-image:url("data:image/svg+xml,%23abc")}
      /* #abcdef in a comment */ .gold-ring{animation:gold-pulse 1s;color:var(--gold)}`;
    expect(colourLiterals(css)).toEqual(['#123456', 'rgba(1,2,3,.5)', 'red']);
  });

  it.each(cssFiles.filter((f) => f !== 'tokens.css'))('%s uses tokens only', (file) => {
    expect(colourLiterals(read(join(STYLES, file))), file).toEqual([]);
  });

  it('tokens.css defines the look-spec §1.2 colour tokens', () => {
    const css = read(join(STYLES, 'tokens.css'));
    const want: Record<string, string> = {
      page: '#f7f2ef', 'page-2': '#f2ebe6', card: '#ffffff', ink: '#935a5a', 'ink-2': '#935a5a', 'ink-3': '#cdbab6',
      'ink-icon': '#996767', 'ink-deep': '#2f2a35',
      accent: '#e57010', 'accent-deep': '#b4560a', 'accent-title': '#d2620c', 'accent-text': '#a84b08', 'accent-soft': '#fde9d6',
      focus: '#b9520a', 'title-on-dark': '#e57010', 'tap-text': '#ffd45c', stage: '#2a2430', gold: '#ffc23d',
      fish: '#f1aa22', 'fish-deep': '#d47e18', 'fish-hi': '#fed95d', 'life-empty': '#ede8e2', danger: '#d33a4a', wrong: '#560a1c', hard: '#6c3fb5',
      badge: '#dc2f2f', 'badge-video': '#03a84a', dot: '#f34f4f', 'toast-fill': '#fff1c8', 'toast-line': '#e98e33',
      'rule-card': '#fbf4ee', 'rule-tile': '#ddbeaa', 'rule-tile-2': '#eee1d7', 'rule-mark': '#af6d44',
      // Phase 2d.1 (helpers-spec §2.5, §3.2, §4.3, §6.4)
      plus: '#fb8515', 'done-top': '#efda25', 'done-bottom': '#fecf3d', 'done-line': '#813800', 'hint-card': '#fffcfa', apply: '#d38025',
    };
    for (const [name, hex] of Object.entries(want)) expect(new RegExp(`--${name}:\\s*${hex};`, 'i').test(css), `--${name}`).toBe(true);
    expect(css).toMatch(/--scrim:\s*rgba\(28, 23, 32, 0\.82\);/);
    expect(css).toMatch(/--glow:\s*rgba\(255, 194, 61, 0\.65\);/);
    for (const rgb of ['ink-rgb: 147, 90, 90', 'page-rgb: 247, 242, 239', 'warm-rgb: 239, 134, 39', 'pulse-rgb: 255, 165, 30', 'accent-rgb: 229, 112, 16', 'gold-rgb: 255, 194, 61']) expect(css).toContain(`--${rgb};`);
    expect(css).toMatch(/--line:\s*rgba\(147, 90, 90, 0\.14\);/);
    expect(css).toMatch(/--line-2:\s*rgba\(147, 90, 90, 0\.22\);/);
    // 2d I-polish d: re-fitted to the recording's profile below the discs (blur 8, offset 3.5, alpha .22).
    expect(css).toContain('--shadow-btn: 0 calc(3.5px * var(--s, 1)) calc(8px * var(--s, 1)) calc(-2px * var(--s, 1)) rgba(var(--warm-rgb), 0.22);');
    expect(css).toContain('--shadow-pill: 0 2px 6px rgba(var(--ink-rgb), 0.06);');
    // re-declared where the game screen sets --s, so it scales with s there (var() resolves where declared)
    expect(/\.screen--game\s*\{([^}]*)\}/.exec(stripComments(css))?.[1]).toContain('--shadow-btn: 0 calc(3.5px * var(--s, 1)) calc(8px * var(--s, 1))');
    // the region palette equals PALETTE (look-spec §1.9)
    PALETTE.forEach((hex, i) => expect(css, `--r${i}`).toMatch(new RegExp(`--r${i}:\\s*${hex.toLowerCase()};`)));
    for (const gone of ['--heart:', '--heart-empty:', '--heart-empty-line:', '--t-crack:']) expect(css, gone).not.toContain(gone);
  });

  it('the safe-area tokens take the dev override (look-spec §1.1): max(env(), var(--dev-safe-*)), never set in src', () => {
    const css = read(join(STYLES, 'tokens.css'));
    expect(css).toContain('--safe-top: max(env(safe-area-inset-top, 0px), var(--dev-safe-top, 0px));');
    expect(css).toContain('--safe-bottom: max(env(safe-area-inset-bottom, 0px), var(--dev-safe-bottom, 0px));');
    for (const f of cssFiles) expect(stripComments(read(join(STYLES, f))), f).not.toMatch(/--dev-safe-(top|bottom)\s*:/);
  });
});

describe('the primary-button rule (phase2b §1.4)', () => {
  it('.btn--primary labels are 1.5rem: white on --accent is valid only as large text', () => {
    const tokens = read(join(STYLES, 'tokens.css'));
    expect(tokens).toMatch(/--fs-btn:\s*1\.5rem;/);
    const base = stripComments(read(join(STYLES, 'base.css')));
    const rule = /\.btn--primary\s*\{([^}]*)\}/.exec(base)?.[1] ?? '';
    expect(rule).toMatch(/font-size:\s*var\(--fs-btn\)/);
    expect(rule).toMatch(/text-shadow:\s*0 1px 0 rgba\(var\(--accent-shadow-rgb\), 0\.35\)/);
    expect(tokens).toMatch(/--accent-shadow-rgb:\s*120, 50, 0;/);
    // .btn--lg (often combined with --primary) never shrinks it
    expect(/\.btn--lg\s*\{([^}]*)\}/.exec(base)?.[1]).toMatch(/font-size:\s*var\(--fs-btn\)/);
  });

  it('no stylesheet sets a smaller font-size on a primary button or its label (review A11Y-CONTRAST-1)', () => {
    // var(--fs-*) resolves from tokens.css; a value this test cannot resolve fails instead of passing.
    const tokens = stripComments(read(join(STYLES, 'tokens.css')));
    const fs = new Map<string, string>();
    for (const m of tokens.matchAll(/--(fs-[\w-]+):\s*([^;]+);/g)) fs.set(m[1] as string, (m[2] as string).trim());
    const toPx = (v: string): number | null => {
      const value = v.trim().replace(/^var\(--(fs-[\w-]+)\)$/, (_, name: string) => fs.get(name) ?? v);
      const m = /^([\d.]+)(rem|em|px)$/.exec(value);
      return m ? Number(m[1]) * (m[2] === 'px' ? 1 : 16) : null;
    };
    expect(toPx('var(--fs-btn)')).toBe(24);
    expect(toPx('var(--fs-l)')).toBe(18);
    // Classes that sit on primary buttons (white on --accent): every makeButton({ variant: 'primary' })
    // className and the hand-built ones (Home's Level button), so a rule naming only them is caught.
    const PRIMARY = ['btn--primary', 'btn--lg', 'home__play', 'victory__primary', 'event__play', 'daily-result__done', 'hint-card__apply', 'coach__gotit', 'rewarded__accept', 'rewarded__ok', 'fail__continue', 'group-result__take'];
    const ui = walk(join(ROOT, 'src/ui'), ['.ts']).map((f) => read(f));
    for (const src of ui) {
      for (const m of src.matchAll(/variant:\s*'primary'[^}]*?className:\s*'([^']+)'/g)) {
        for (const cls of (m[1] as string).split(/\s+/)) expect(PRIMARY, `primary button class .${cls}`).toContain(cls);
      }
    }
    const subjectIsPrimaryText = (selector: string): boolean => {
      const compounds = selector.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean);
      const last = compounds[compounds.length - 1] ?? '';
      const onPrimary = (c: string): boolean => PRIMARY.some((p) => new RegExp(`\\.${p}(?![\\w-])`).test(c));
      // The button itself, or its visible label inside a primary button.
      return onPrimary(last) || (/\.btn__label(?![\w-])/.test(last) && compounds.slice(0, -1).some(onPrimary));
    };
    let checked = 0;
    for (const file of cssFiles) {
      const css = stripComments(read(join(STYLES, file)));
      for (const m of css.matchAll(/([^{}@]*)\{([^{}]*)\}/g)) {
        const size = /font-size:\s*([^;]+)/.exec(m[2] ?? '')?.[1];
        if (!size) continue;
        for (const sel of (m[1] ?? '').split(',')) {
          if (!subjectIsPrimaryText(sel)) continue;
          checked++;
          const px = toPx(size);
          expect(px !== null && px >= 24, `${file}: ${sel.trim()} { font-size: ${size} }`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('small white text on orange uses --accent-text: count badges on primary buttons', () => {
    const base = stripComments(read(join(STYLES, 'base.css')));
    expect(/\.btn--primary \.btn__badge\s*\{([^}]*)\}/.exec(base)?.[1]).toMatch(/background:\s*var\(--accent-text\)/);
    // The tools' .tool__badge half (hud.css) moved to hud-css.spec.ts at Phase 2d L0 (critic C13).
  });
});

/** Every file under src/ (recursively) with one of the given extensions. */
function walk(dir: string, exts: readonly string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Retired Phase 2 look values (phase2b §1.8): the teal tokens and their shades, the ginger cat. */
const RETIRED = [
  '#17806F', // teal --accent
  '#0F5A4E', // teal --accent-deep
  '#1F9E89', // the 02 §17.2 teal
  '#167565', // its deep edge
  '#DCF2EC', // teal --accent-soft
  '#3B524E', // teal disabled button on the stage
  '#263633', // its edge
  '#F29A4A', // ginger fur
  '#D9762E', // ginger stripes
  '#FFE9CF', // ginger cream muzzle
  '#F8B9A0', // ginger inner ear
  '#C8651E', // the paw icon's darker ginger
  'rgba(23,128,111', // teal glows and shadows
  'rgba(242,154,74', // ginger side-pattern dots
];

/**
 * The 2c.1 values Phase 2d retires (look-spec §2.3), checked in src/ and index.html: the page, the
 * secondary ink, the crimson wrong X, the fish, the 2c.1 palette, the old line tint and the event motif
 * colours before they were lightened. #2F2A35 lives on as --ink-deep, so it is not listed.
 */
const RETIRED_2D = [
  '#FAF6F0', '#F1EADF', '#665E6C', '#A3193A', '#FFB81F', '#C98200', '#FFE08A',
  '#F49AAE', '#F7B98B', '#F2DC7C', '#BFDB86', '#8FD6B8', '#7CC6D6', '#9BBDF0', '#B9A7EC', '#E3A6DF', '#C7A58C', '#9AA9BC', '#A3B57F',
  'rgba(47,42,53', '#FCE3CA', '#E0E8F3', '#FCE0E6',
  // Phase 2d.1 (helpers-spec §5.2, §6.2, §6.4): our Mint (index 4 is the measured Denim now), 2d's
  // --wrong (2.64 on Denim) and the video-sampled toast fill and border (re-sampled from the PNG)
  '#52A982', '#6E0E25', '#FEF0C7', '#DD9045',
];

describe('retired-look guard (phase2b §1.8, §1.12)', () => {
  const files = walk(join(ROOT, 'src'), ['.ts', '.css', '.html', '.json']);

  it('no retired Phase 2 colour appears anywhere in src/', () => {
    expect(files.length).toBeGreaterThan(50);
    const hits: string[] = [];
    for (const f of files) {
      const text = read(f).replace(/\s+/g, '').toLowerCase();
      for (const v of RETIRED) if (text.includes(v.toLowerCase())) hits.push(`${relative(ROOT, f)}: ${v}`);
    }
    expect(hits).toEqual([]);
  });

  it('no 2c.1 value that Phase 2d retires appears in src/ or index.html (look-spec §2.3)', () => {
    const hits: string[] = [];
    for (const f of [...files, join(ROOT, 'index.html')]) {
      const text = read(f).replace(/\s+/g, '').toLowerCase();
      for (const v of RETIRED_2D) if (text.includes(v.toLowerCase())) hits.push(`${relative(ROOT, f)}: ${v}`);
    }
    expect(hits).toEqual([]);
  });

  it('nor in the page shell outside src/ (index.html, public/, the dev harness pages), and theme-color is --page', () => {
    const shell = [join(ROOT, 'index.html'), ...walk(join(ROOT, 'public'), ['.svg', '.html', '.json', '.webmanifest']), ...walk(join(ROOT, 'dev'), ['.html'])];
    const hits: string[] = [];
    for (const f of shell) {
      const text = read(f).replace(/\s+/g, '').toLowerCase();
      for (const v of [...RETIRED, ...RETIRED_2D]) if (text.includes(v.toLowerCase())) hits.push(`${relative(ROOT, f)}: ${v}`);
    }
    expect(hits).toEqual([]);
    const page = /--page:\s*(#[0-9a-fA-F]{6})/.exec(read(join(STYLES, 'tokens.css')))?.[1]?.toLowerCase();
    expect(page).toBeTruthy();
    expect(page).toBe('#f7f2ef');
    expect(/<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/.exec(read(join(ROOT, 'index.html')))?.[1]?.toLowerCase()).toBe(page);
    // The dev harness pages follow --page too (requests-G2.md R1, done at 2d I-1).
    for (const f of walk(join(ROOT, 'dev'), ['.html'])) {
      const meta = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/.exec(read(f))?.[1]?.toLowerCase();
      if (meta) expect(meta, relative(ROOT, f)).toBe(page);
    }
  });

  it('no source file mentions data-skin (one theme, no skin system)', () => {
    const hits = files.filter((f) => /data-skin|dataset\.skin/.test(read(f))).map((f) => relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  it('no English string describes the ginger cat any more', () => {
    for (const [key, value] of Object.entries(en)) expect(/ginger/i.test(String(value)), key).toBe(false);
  });

  it('the X is two filled white bars; its edge shows only with Colour patterns on; no stroke draw-in (look-spec §1.10)', () => {
    expect(cfg.layout.markOpacity).toBe(1);
    const board = stripComments(read(join(STYLES, 'board.css')));
    expect(/\}\s*\.cell__x\s*\{([^}]*)\}/.exec(board)?.[1]).toMatch(/fill:\s*#fff;/);
    expect(/\}\s*\.cell__xe\s*\{([^}]*)\}/.exec(board)?.[1]).toMatch(/fill:\s*var\(--xe/);
    // the edge's only "show" rules sit under [data-patterns]
    for (const m of board.matchAll(/([^{}]*\.cell__xe[^{}]*)\{([^{}]*)\}/g)) {
      if (!/display:\s*inline/.test(m[2] ?? '')) continue;
      for (const sel of (m[1] ?? '').split(',').filter((x) => x.includes('.cell__xe'))) expect(sel, sel.trim()).toContain('[data-patterns]');
    }
    for (const gone of ['stroke-dasharray', 'xe-draw', '--x-len', 'fx-draw']) expect(board, gone).not.toContain(gone);
    // the mouse's pop (fx.markPopMs, 1.15 → 1; in the lazy board-mouse.css since 2d.1 I-4) and the wrong X filled in --wrong
    const lazy = stripComments(read(join(STYLES, 'board-mouse.css')));
    expect(lazy).toMatch(/\.cell\.fx-pop \.cell__xg\s*\{[^}]*animation:\s*x-pop var\(--x-pop-ms, 170ms\) ease-in-out both/);
    // the tile the mouse lands on presses 0.87 → 1 over 70 ms, linear (measured B and C; I-6 refit)
    expect(lazy).toMatch(/\.cell\.fx-press \.cell__tile\s*\{\s*--squish:\s*0\.87;\s*animation:\s*tile-squish 70ms linear both;/);
    expect(board).not.toContain('fx-pop');
    expect(cfg.fx.markPopMs).toBe(170); // helpers-spec §0.6, §1.5: 140 → 170 at 2d.1 L0
    expect(/@keyframes x-pop\s*\{\s*from\s*\{\s*transform:\s*scale\(1\.15\)/.test(lazy)).toBe(true);
    expect(/\.cell\[data-s='w'\] \.cell__x\s*\{([^}]*)\}/.exec(board)?.[1]).toMatch(/fill:\s*var\(--wrong\)/);
    expect(/\.cell__pat\s*\{([^}]*)\}/.exec(board)?.[1]).toMatch(/color:\s*var\(--ink-deep\)/);
  });

  it('Phase 2d.1 draw-in (helpers-spec §4.4): the tile squishes; "\\" scales about the X centre, then "/" grows from its top-right tip; the X overshoots', () => {
    const board = stripComments(read(join(STYLES, 'board.css')));
    const rule = (sel: string): string => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(board)?.[1] ?? '';
    };
    expect(rule('.cell.fx-mark .cell__tile')).toMatch(/animation:\s*tile-squish var\(--xd-squish, 80ms\)/);
    expect(rule('.cell.fx-mark .cell__xb--a rect')).toMatch(/animation:\s*x-grow var\(--xd-s1, 70ms\)/);
    const b = rule('.cell.fx-mark .cell__xb--b rect');
    expect(b).toMatch(/transform-origin:\s*84\.5px 50px/); // the bar's top-right tip in its own frame
    expect(b).toMatch(/animation:\s*x-reveal var\(--xd-s2, 130ms\) ease-out var\(--xd-s1, 70ms\) both/);
    expect(rule('.cell.fx-mark .cell__xg')).toMatch(/animation:\s*x-over var\(--xd-settle, 250ms\)/);
    expect(/@keyframes x-grow\s*\{\s*from\s*\{\s*transform:\s*scale\(0\.3\)/.test(board)).toBe(true);
    expect(/@keyframes x-reveal\s*\{\s*from\s*\{\s*transform:\s*scaleX\(0\)/.test(board)).toBe(true);
    expect(/@keyframes x-over\s*\{[^@]*28%,\s*48%\s*\{\s*transform:\s*scale\(var\(--xd-over, 1\.1\)\)/.test(board)).toBe(true);
    expect(/@keyframes tile-squish\s*\{\s*from\s*\{\s*transform:\s*scale\(var\(--squish, 0\.9\)\)/.test(board)).toBe(true);
    // the cell's X group scales about the cell centre; each bar's rects in the bar's frame (view-box)
    expect(rule('.cell__xg,\n.cell__xg rect')).toMatch(/transform-origin:\s*50px 50px/);
    // config feeds the timings (board-view applyRenderVars)
    expect(cfg.fx.markDraw).toEqual({ squishMs: 80, stroke1Ms: 70, stroke2Ms: 130, overshoot: 1.1, settleMs: 250 });
  });

  it('Phase 2d.1 hint (helpers-spec §3.3): no board dim, no focus ring for a hint; the ghost is the outline popping at --gd; the 2b ghost pulse is gone', () => {
    const board = stripComments(read(join(STYLES, 'board.css')));
    // 2d.1 I-4: the rules that show the ghosts load with the hint card (overlay-chunk.css); board.css keeps them hidden
    const chunk = stripComments(read(join(STYLES, 'overlay-chunk.css')));
    expect(board).not.toMatch(/\.board\[data-hl='hint'\]/);
    expect(board).not.toMatch(/\.board\[data-hl\] \.cell\[data-f\]/);
    for (const css of [board, chunk]) expect(css).not.toContain('ghost-pulse');
    expect(board).not.toContain('--hint-dim');
    expect(board).toMatch(/\.cell__xog\s*\{\s*display:\s*none;/);
    expect(board).not.toContain('ghost-pop');
    expect(/\.cell\[data-ghost='x'\]\[data-s='e'\] \.cell__xog\s*\{[^}]*animation:\s*ghost-pop var\(--ghost-pop, 500ms\) linear var\(--gd, 0ms\) forwards/.test(chunk)).toBe(true);
    expect(/\.cell__xo\s*\{[^}]*fill:\s*rgba\(255, 255, 255, 0\.1\);[^}]*stroke:\s*#fff;[^}]*stroke-width:\s*1\.5px/.test(chunk)).toBe(true);
    // the keyframes of the measured pop (hint-stills §8.2, every 17 ms; refit by the lead at 2d.1 I-6):
    // .27 → 1 (67 ms) → 1.22 held 117–150 → 1 (233) → .925 held 267–367 → 1 (500), opacity .3 → 1 by 60 ms
    const kf = /@keyframes ghost-pop\s*\{([\s\S]*?)\n\}/.exec(chunk)?.[1] ?? '';
    for (const stop of [
      '0% {\n    opacity: 0.3;\n    transform: scale(0.27)',
      '6.6% {\n    transform: scale(0.7)',
      '10% {\n    transform: scale(0.86)',
      '12% {\n    opacity: 1',
      '13.4% {\n    transform: none',
      '16.6% {\n    transform: scale(1.09)',
      '20% {\n    transform: scale(1.16)',
      '23.4%,\n  30% {\n    transform: scale(1.22)',
      '33.4% {\n    transform: scale(1.18)',
      '40% {\n    transform: scale(1.09)',
      '46.6% {\n    transform: none',
      '50% {\n    transform: scale(0.96)',
      '53.4%,\n  73.4% {\n    transform: scale(0.925)',
      '80% {\n    transform: scale(0.96)',
      '90% {\n    transform: scale(0.99)',
      '100% {\n    opacity: 1;\n    transform: none',
    ]) {
      expect(kf, stop).toContain(stop);
    }
    // the coach keeps its ring
    expect(board).toMatch(/\.board\[data-hl='coach'\] \.cell\[data-f\] \.cell__tile\s*\{[^}]*coach-ring/);
  });

  it('Phase 2d.1 veil and dark tiles (helpers-spec §4.7, §6.4): the found cat keeps its tile colour; a dark tile\'s glyph is white unless faded', () => {
    const board = stripComments(read(join(STYLES, 'board.css')));
    expect(board).toMatch(/\.cell\[data-done\]:not\(\[data-s='c'\]\):not\(\[data-s='g'\]\) \.cell__tile::after\s*\{\s*opacity:\s*0\.45;/);
    expect(board).not.toMatch(/(?:^|\})\s*\.cell\[data-done\] \.cell__tile::after\s*\{/);
    expect(board).toMatch(/\.cell\[data-dark\]:not\(\[data-done\]\) \.cell__pat,\s*\.cell\[data-dark\]\[data-s='c'\] \.cell__pat,\s*\.cell\[data-dark\]\[data-s='g'\] \.cell__pat\s*\{\s*color:\s*#fff;/);
  });

  it('Phase 2d.1 mouse, cat and wave (helpers-spec §1.5, §2.4, §4.2): the sprite\'s state classes are its own (no global .is-in / .is-out), the cat sequence and the wave read their config', () => {
    // 2d.1 I-4 (requests-G2 H3): all three left the first-load board.css for the lazy board-mouse.css
    expect(stripComments(read(join(STYLES, 'board.css')))).not.toMatch(/board__mouse|fx-cat|fx-wave|cat-placed|wave-bump/);
    const board = stripComments(read(join(STYLES, 'board-mouse.css')));
    expect(board).toMatch(/\.board__mouse--in\s*\{\s*animation:\s*mouse-in var\(--mouse-in, 115ms\)/);
    expect(board).toMatch(/\.board__mouse--out\s*\{\s*animation:\s*mouse-out var\(--mouse-out, 85ms\)/);
    expect(board).not.toMatch(/\.board__mouse\.is-(in|out)/);
    expect(board).toMatch(/\.cell\.fx-cat \.cell__catg\s*\{[^}]*transform-origin:\s*50% 80%;[^}]*animation:\s*cat-placed var\(--cat-seq, 1400ms\)/);
    const kf = /@keyframes cat-placed\s*\{([\s\S]*?)\n\}/.exec(board)?.[1] ?? '';
    for (const v of ['scale(0.3)', 'scale(1.56)', 'scale(1.25)', 'scale(0.89)']) expect(kf, v).toContain(v);
    expect(board).toMatch(/\.cell\.fx-wave\s*\{[^}]*animation:\s*wave-bump 270ms linear var\(--wd, 0ms\)/);
    const wave = /@keyframes wave-bump\s*\{([\s\S]*?)\n\}/.exec(board)?.[1] ?? '';
    for (const v of ['12.2% {\n    transform: scale(0.93)', '24.8%,\n  61.9% {\n    transform: scale(1.1)']) expect(wave, v).toContain(v);
    expect(cfg.fx.unitDone.waveStepMs).toBe(33);
    expect(cfg.fx.mouse).toEqual({ appearMs: 115, dwellMs: 850, exitMs: 85 });
  });

  it('the board card has no shadow and no border (look-spec §1.8)', () => {
    const board = stripComments(read(join(STYLES, 'board.css')));
    for (const m of board.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const sels = (m[1] ?? '').split(',').map((x) => x.trim());
      if (!sels.includes('.board')) continue;
      expect(m[2], '.board').not.toMatch(/box-shadow|border\s*:/);
    }
    expect(board).toMatch(/border-radius:\s*var\(--board-radius/);
  });

  it('.btn--icon is the measured white disc: --shadow-btn, --ink-icon, Ø 37 with a 44 px hit area (look-spec §1.4, §2.2)', () => {
    const base = stripComments(read(join(STYLES, 'base.css')));
    const rule = /\.btn--icon\s*\{([^}]*)\}/.exec(base)?.[1] ?? '';
    expect(rule).toMatch(/background:\s*var\(--card\)/);
    expect(rule).toMatch(/box-shadow:\s*var\(--shadow-btn\)/);
    expect(rule).toMatch(/color:\s*var\(--ink-icon\)/);
    expect(rule).toMatch(/width:\s*37px/);
    const hit = /\.btn--icon::before\s*\{([^}]*)\}/.exec(base)?.[1] ?? '';
    expect(hit).toMatch(/width:\s*max\(100%, 44px\)/);
    expect(hit).toMatch(/height:\s*max\(100%, 44px\)/);
    // square, so a tap in its corners counts (requests-G3 R2): no border-radius on the hit area
    expect(hit).not.toMatch(/border-radius/);
  });
});

describe('tokens.css stays in sync with config, events and event art', () => {
  const tokens = read(join(STYLES, 'tokens.css'));

  it('--banner-reserve equals ads.banner.reservePx (phase2b §3.2) and base.css reserves it', () => {
    expect(tokens).toContain(`--banner-reserve: ${cfg.ads.banner.reservePx}px;`);
    const base = stripComments(read(join(STYLES, 'base.css')));
    expect(/\.screen\[data-banner\]\s*\{([^}]*)\}/.exec(base)?.[1]).toMatch(/padding-bottom:\s*calc\(var\(--banner-reserve\) \+ var\(--safe-bottom\)\)/);
  });

  it("the glow's default size equals fx.win.glowScale (phase2b §2.2)", () => {
    const board = read(join(STYLES, 'board.css'));
    const scales = [...board.matchAll(/var\(--glow-scale, ([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(scales.length).toBeGreaterThan(0);
    for (const s of scales) expect(s).toBe(cfg.fx.win.glowScale);
  });

  it('every [data-event-theme] block equals EVENT_THEME_TOKENS and eventPatternUrl()', () => {
    const arts: Record<string, 'lanterns' | 'snowflakes' | 'yarn'> = { 'lantern-walk-2026': 'lanterns', 'snow-paws-2026': 'snowflakes', 'yarn-hearts-2027': 'yarn' };
    // 2d I-4: the patterns moved to the lazy events-chunk.css (an event screen or board starts that chunk).
    const lazy = read(join(STYLES, 'events-chunk.css'));
    const blockOf = (css: string, id: string): string => new RegExp(`\\[data-event-theme='${id}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    for (const [id, t] of Object.entries(EVENT_THEME_TOKENS)) {
      const block = blockOf(tokens, id);
      expect(block, id).not.toBe('');
      expect(block).toContain(`--page: ${t.page.toLowerCase()};`);
      expect(block).toContain(`--board-card: ${t.boardCard.toLowerCase()};`);
      expect(block.replace(/\s/g, '')).toContain(`--glow:${t.glow.replace(/\s/g, '').replace(/,\./g, ',0.')};`);
      expect(block).not.toContain('--page-art');
      expect(blockOf(lazy, id)).toContain(`--page-art: ${eventPatternUrl(arts[id] as 'lanterns')};`);
    }
  });

  it('the per-script display stacks exist (phase2b §6.6) and Latin extended has its own lazy face', () => {
    for (const lang of ['ja', 'ko', 'zh', 'th', 'hi', 'ar', 'ru', 'vi']) expect(tokens, lang).toContain(`:root:lang(${lang})`);
    expect(tokens).toContain("'Hiragino Maru Gothic ProN'");
    expect(tokens).toContain("'Noto Sans Arabic'");
    const base = stripComments(read(join(STYLES, 'base.css')));
    expect(base).toContain("url('../assets/fonts/display-latin-ext.woff2')");
    expect(base.match(/unicode-range/g)).toHaveLength(2);
    expect(existsSync(join(ROOT, 'src/assets/fonts/display-latin-ext.woff2'))).toBe(true);
  });
});
