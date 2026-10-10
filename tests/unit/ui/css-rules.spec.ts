// Owner: A. Stylesheet rules of the Classic look (phase2b §1.4, §1.8, §1.12):
// - colour literals live only in styles/tokens.css (allowlist elsewhere: #fff/#ffffff,
//   rgba(255,255,255,α), rgba(0,0,0,α), transparent, currentColor, inherit);
// - .btn--primary labels are ≥ 1.5rem (white on --accent is only a large-text pair, 3.15:1);
// - the retired-look guard: no retired Phase 2 value (teal, ginger, …) anywhere in src/, no data-skin;
// - tokens.css stays in sync with config, the event data and the event art.
// Phase 2d L0 (look-spec §3.2 item 1): the "Phase 2c.1: the pills row" block and the .tool__badge
// check moved to hud-css.spec.ts (G3); this file is G2's in Phase 2d.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { en } from '../../../src/i18n/en';
import { eventPatternUrl } from '../../../src/ui/art/event-art';
import { EVENT_THEME_TOKENS } from '../../../src/ui/art/palette';

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

  it('tokens.css defines the §1.4 colour tokens', () => {
    const css = read(join(STYLES, 'tokens.css'));
    const want: Record<string, string> = {
      page: '#faf6f0', 'page-2': '#f1eadf', card: '#ffffff', ink: '#2f2a35', 'ink-2': '#665e6c', 'ink-3': '#b2aab4',
      accent: '#e57010', 'accent-deep': '#b4560a', 'accent-title': '#d2620c', 'accent-text': '#a84b08', 'accent-soft': '#fde9d6',
      focus: '#b9520a', 'title-on-dark': '#e57010', 'tap-text': '#ffd45c', stage: '#2a2430', gold: '#ffc23d',
      // Phase 2c: --life-empty replaces the 2b --heart / --heart-empty / --heart-empty-line tokens.
      fish: '#ffb81f', 'fish-deep': '#c98200', 'fish-hi': '#ffe08a', 'life-empty': '#ede8e2', danger: '#d33a4a', wrong: '#a3193a', hard: '#6c3fb5',
    };
    for (const [name, hex] of Object.entries(want)) expect(new RegExp(`--${name}:\\s*${hex};`, 'i').test(css), `--${name}`).toBe(true);
    expect(css).toMatch(/--scrim:\s*rgba\(28, 23, 32, 0\.82\);/);
    expect(css).toMatch(/--glow:\s*rgba\(255, 194, 61, 0\.65\);/);
    for (const rgb of ['ink-rgb: 47, 42, 53', 'accent-rgb: 229, 112, 16', 'gold-rgb: 255, 194, 61']) expect(css).toContain(`--${rgb};`);
    for (const gone of ['--heart:', '--heart-empty:', '--heart-empty-line:', '--t-crack:']) expect(css, gone).not.toContain(gone);
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

  it('nor in the page shell outside src/ (index.html, public/, the dev harness pages), and theme-color is --page', () => {
    const shell = [join(ROOT, 'index.html'), ...walk(join(ROOT, 'public'), ['.svg', '.html', '.json', '.webmanifest']), ...walk(join(ROOT, 'dev'), ['.html'])];
    const hits: string[] = [];
    for (const f of shell) {
      const text = read(f).replace(/\s+/g, '').toLowerCase();
      for (const v of RETIRED) if (text.includes(v.toLowerCase())) hits.push(`${relative(ROOT, f)}: ${v}`);
    }
    expect(hits).toEqual([]);
    const page = /--page:\s*(#[0-9a-fA-F]{6})/.exec(read(join(STYLES, 'tokens.css')))?.[1]?.toLowerCase();
    expect(page).toBeTruthy();
    for (const f of [join(ROOT, 'index.html'), ...walk(join(ROOT, 'dev'), ['.html'])]) {
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

  it('the dark-ink X is gone: the board X is white over its edge', () => {
    expect(cfg.layout.markOpacity).toBe(1);
    const board = stripComments(read(join(STYLES, 'board.css')));
    expect(/\}\s*\.cell__x\s*\{([^}]*)\}/.exec(board)?.[1]).toMatch(/stroke:\s*#fff;/);
    expect(/\}\s*\.cell__xe\s*\{([^}]*)\}/.exec(board)?.[1]).toMatch(/stroke:\s*var\(--xe/);
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
    for (const [id, t] of Object.entries(EVENT_THEME_TOKENS)) {
      const block = new RegExp(`\\[data-event-theme='${id}'\\]\\s*\\{([^}]*)\\}`).exec(tokens)?.[1] ?? '';
      expect(block, id).not.toBe('');
      expect(block).toContain(`--page: ${t.page.toLowerCase()};`);
      expect(block).toContain(`--board-card: ${t.boardCard.toLowerCase()};`);
      expect(block.replace(/\s/g, '')).toContain(`--glow:${t.glow.replace(/\s/g, '').replace(/,\./g, ',0.')};`);
      expect(block).toContain(`--page-art: ${eventPatternUrl(arts[id] as 'lanterns')};`);
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
