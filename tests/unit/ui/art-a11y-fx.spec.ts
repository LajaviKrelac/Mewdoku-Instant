// Owner: A (Phase 2b); G2 (Phase 2c: the empty life, no heart icons). Sprite, Tux, poses, event art,
// palette helpers and the board cell's X underlay (phase2b §1.5–§1.7, §1.12, §2.9, §4.4).
// Phase 2c (fish-lives-spec §1.2): icon-fish-empty (one 30 % outline, a pale wash, no eye); the heart
// icons and the heart clip paths are gone (only the colour-pattern glyph 9 is a heart).
// Phase 2c.1 (§10.2): icon-points, our level-points sparkle (gold fill, ink outline, decorative).
// phase2b F0 split: the fx and a11y cases moved to fx-a11y.spec.ts (B).
// Phase 2d (G2, look-spec §1.5–§1.11, Appendix C): the new and redrawn symbols, the X as two rounded
// rects (its edge only with Colour patterns on), the measured palette's tiers and HEAD_ORDER, ruleDiagram.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import type { EventDef } from '../../../src/game/events';
import { accessoryMarkup, mountAccessories } from '../../../src/ui/art/accessories';
import { CAT, catHead, earOuterPath, EAR_FLICK_PIVOT, MASK_PATH } from '../../../src/ui/art/cat-parts';
import { eventArt, eventPatternUrl } from '../../../src/ui/art/event-art';
import { FISH_BODY, FISH_OUTLINE_OPACITY, fishMarkup, fishOutlineMarkup } from '../../../src/ui/art/fish';
import { illustration, type IllustrationKind } from '../../../src/ui/art/illustrations';
import { mascotIllustration, startHeadTilt } from '../../../src/ui/art/mascot';
import { CAT_COLORS, HEAD_ORDER, mixHex, PALETTE, PALETTE_CORE, PALETTE_DE00, PALETTE_SIZE, paletteTier, regionColorsFor, regionColorVar, TOKENS, xEdgeColor } from '../../../src/ui/art/palette';
import { ruleDiagram } from '../../../src/ui/art/rule-art';
import { icon, markRects, mountSprite, setIcon, spriteMarkup, SPRITE_ID, type SymbolId } from '../../../src/ui/art/sprite';
import { regionAdjacency } from '../../../src/engine/colors';
import { buildCell, ensureCat } from '../../../src/ui/board/board-cells';
import { evenInsets } from '../../../src/ui/board/layout';
import EVENTS from '../../../src/data/events/events.json';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('sprite', () => {
  const ids: SymbolId[] = [
    'cat-idle', 'cat-happy', 'cat-sad', 'cat-surprised', 'cat-blink', 'mark-x',
    'icon-house', 'icon-gear', 'icon-bulb', 'icon-paw', 'icon-trophy', 'icon-lock',
    'icon-calendar', 'icon-play-video', 'icon-close', 'icon-chevron',
    ...Array.from({ length: 12 }, (_, i) => `glyph-${i}` as SymbolId),
    // phase2b §1.7, §2.9
    'icon-fish', 'icon-plus', 'icon-shop', 'icon-globe', 'icon-crown', 'icon-users', 'cat-ear-flick',
    // Phase 2c §1.2
    'icon-fish-empty',
    // Phase 2c.1 §10.2
    'icon-points',
    // Phase 2d (look-spec Appendix C)
    'icon-back', 'icon-play', 'tool-kitty', 'tool-bulb', 'tool-mouse', 'cat-head-flat', 'art-flex',
  ];

  it('mounts once and defines every symbol; the heart icons and clip paths are gone (Phase 2c)', () => {
    mountSprite();
    mountSprite();
    expect(document.querySelectorAll(`#${SPRITE_ID}`)).toHaveLength(1);
    const sprite = document.getElementById(SPRITE_ID) as Element;
    expect(sprite.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.firstChild).toBe(sprite);
    for (const id of ids) expect(sprite.querySelector(`symbol[id="${id}"]`), id).not.toBeNull();
    for (const gone of ['icon-heart', 'icon-heart-empty', 'clip-heart-l', 'clip-heart-r']) expect(sprite.querySelector(`[id="${gone}"]`), gone).toBeNull();
    // Phase 2d: the unused wrong-x drawing is deleted (the wrong X is the board's rects in --wrong).
    expect(sprite.querySelector('symbol[id="wrong-x"]')).toBeNull();
    // The colour-pattern glyph 9 is still a heart shape (a pattern, not a life).
    expect(sprite.querySelector('symbol[id="glyph-9"] path')).not.toBeNull();
  });

  it('icon-points (2c.1 §10.2): a four-point sparkle filled with --icon-fill and outlined in currentColor, plus a small solid sparkle; decorative', () => {
    mountSprite();
    const sym = document.querySelector('symbol[id="icon-points"]') as Element;
    expect(sym.getAttribute('viewBox')).toBe('0 0 24 24');
    const paths = Array.from(sym.querySelectorAll('path'));
    expect(paths).toHaveLength(2);
    const [star, small] = paths as unknown as [Element, Element];
    // The big sparkle: like icon-trophy, a gold wash (--icon-fill) under the usual 2-unit ink line.
    expect(star.getAttribute('style')).toBe('fill:var(--icon-fill,none)');
    expect(star.getAttribute('stroke')).toBe('currentColor');
    expect(star.getAttribute('stroke-width')).toBe('2');
    expect(star.getAttribute('stroke-linejoin')).toBe('round');
    // Four points: the path's extreme coordinates stay on the 24 grid with room for the stroke.
    const nums = (star.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...nums)).toBeLessThanOrEqual(23);
    expect(small.getAttribute('fill')).toBe('currentColor');
    // Never a heart, a coin or a fish: no circle, no use of the fish body.
    expect(sym.querySelector('circle')).toBeNull();
    expect(sym.innerHTML).not.toContain(FISH_BODY);
    const svg = icon('icon-points', { class: 'points-pill__icon' });
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('class')).toBe('icon icon-points points-pill__icon');
  });

  it('icon-fish-empty (look-spec §1.5): the fish silhouette as one 40 % ink outline around a pale wash; no eye, shade or scales', () => {
    mountSprite();
    const sym = document.querySelector('symbol[id="icon-fish-empty"]') as Element;
    expect(sym.getAttribute('viewBox')).toBe('0 0 24 24');
    // The same silhouette as the full fish: two shapes (tail, body).
    const outline = sym.querySelector(`g[opacity="${FISH_OUTLINE_OPACITY}"]`) as Element;
    expect(FISH_OUTLINE_OPACITY).toBe(0.4);
    expect(outline.querySelectorAll('path')).toHaveLength(2);
    expect(Array.from(outline.querySelectorAll('path')).some((p) => p.getAttribute('d') === FISH_BODY)).toBe(true);
    for (const p of Array.from(outline.querySelectorAll('path'))) {
      expect(p.getAttribute('style')).toContain('stroke:var(--ink,');
      expect(p.getAttribute('stroke-width')).toBe('2.40'); // 2 × 1.2: the fills cover the inner half
      expect(p.getAttribute('fill')).toBe('none');
    }
    const wash = sym.querySelector('g[style*="--life-empty"]') as Element;
    expect(wash.querySelectorAll('path')).toHaveLength(2);
    expect(wash.getAttribute('style')).toContain(`var(--life-empty,${TOKENS['life-empty']})`);
    // Fills paint after the strokes (one outline, no seams inside), and no eye, shade or scales.
    expect(sym.innerHTML.indexOf('--life-empty')).toBeGreaterThan(sym.innerHTML.indexOf('stroke:var(--ink'));
    expect(sym.querySelector('circle')).toBeNull();
    expect(sym.innerHTML).not.toContain('--fish');
    // It takes the full fish's room: scaled so its outer edge matches the full fish's.
    expect(sym.querySelector('g[transform]')?.getAttribute('transform')).toMatch(/scale\(0\.9\d+\)/);
    expect(fishOutlineMarkup(1)).toContain('stroke-width="2.00"');
  });

  it('icon() is decorative by default and labelled on request', () => {
    const a = icon('icon-paw', { class: 'x' });
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(a.getAttribute('class')).toBe('icon icon-paw x');
    expect(a.querySelector('use')?.getAttribute('href')).toBe('#icon-paw');
    const b = icon('cat-happy', { label: 'A happy cat' });
    expect(b.getAttribute('role')).toBe('img');
    expect(b.getAttribute('aria-label')).toBe('A happy cat');
    setIcon(b, 'cat-sad');
    expect(b.querySelector('use')?.getAttribute('href')).toBe('#cat-sad');
  });
});

describe('Tux in the sprite (phase2b §1.6)', () => {
  const symbol = (id: string): Element => {
    mountSprite();
    mountAccessories();
    return document.getElementById(SPRITE_ID)?.querySelector(`symbol[id="${id}"]`) as Element;
  };
  const html = (id: string): string => symbol(id).innerHTML.toLowerCase();

  it('the cat ids are unchanged and hold Tux: dark fur, outline, white blaze, light irises', () => {
    for (const id of ['cat-idle', 'cat-happy', 'cat-sad', 'cat-surprised']) {
      const h = html(id);
      expect(h, id).toContain(CAT_COLORS.fur.toLowerCase());
      expect(h, id).toContain(CAT_COLORS.outline.toLowerCase());
      expect(h, id).toContain(CAT_COLORS.mask.toLowerCase());
      expect(symbol(id).getAttribute('viewBox')).toBe('0 0 100 100');
      // the asymmetric blaze is the one mask path
      expect(symbol(id).querySelector(`path[d="${MASK_PATH}"]`), id).not.toBeNull();
    }
    expect(html('cat-idle')).toContain(CAT_COLORS.iris.toLowerCase());
    expect(html('cat-surprised')).toContain(CAT_COLORS.iris.toLowerCase());
    // happy: light ^ ^ arcs over the fur, blush on the mask; no tears in any mood (06 §3)
    expect(html('cat-happy')).toContain(CAT_COLORS.line.toLowerCase());
    expect(html('cat-happy')).toContain(CAT_COLORS.blush.toLowerCase());
    expect(html('cat-sad')).toContain(CAT_COLORS.line.toLowerCase());
  });

  it('signature marks: only the left ear is notched; the blaze reaches up around the right eye', () => {
    const plain = earOuterPath(24, false);
    const notched = earOuterPath(24, true);
    expect(notched.length).toBeGreaterThan(plain.length);
    expect(notched.match(/L/g)?.length).toBeGreaterThan(plain.match(/L/g)?.length ?? 0);
    const head = catHead({ eyes: 'open', mouth: 'smile', stroke: 2 });
    expect(head).toContain(notched);
    expect(head).toContain(plain);
    // the right side of the blaze rises above the eye line (y 54) to the eyebrow, the left one starts at the apex
    const pts = [...MASK_PATH.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    const rightHigh = pts.filter(([x, y]) => x > 62 && y < 46);
    const leftHigh = pts.filter(([x, y]) => x < 44 && y < 46);
    expect(rightHigh.length).toBeGreaterThan(0);
    expect(leftHigh).toHaveLength(0);
  });

  it('cat-blink covers each eye in its own skin (fur left, white right); the idle right ear can hide for the flick', () => {
    const b = html('cat-blink');
    expect(b).toContain(CAT.fur.toLowerCase());
    expect(b).toContain(CAT.mask.toLowerCase());
    expect(html('cat-idle')).toContain('var(--flick-hide,1)');
    expect(html('cat-happy')).not.toContain('--flick-hide');
    const flick = symbol('cat-ear-flick');
    expect(flick.querySelector('clipPath')).not.toBeNull();
    expect(flick.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
    expect(EAR_FLICK_PIVOT).toEqual({ x: 27, y: 33.4 });
    // board.css pivots the overlay there, mapped into the cell box at catScale
    const k = cfg.layout.catScale;
    const off = ((1 - k) / 2) * 100;
    expect([+(off + EAR_FLICK_PIVOT.x * k).toFixed(1), +(off + EAR_FLICK_PIVOT.y * k).toFixed(1)]).toEqual([30.7, 36.1]);
  });

  it('the fish, the new icons and the accessories are final art, not placeholders (phase2b §1.7, §4.4)', () => {
    const fish = html('icon-fish');
    expect(fish).toContain('var(--fish,');
    expect(fish).toContain('var(--fish-deep,');
    expect(fish).toContain('var(--fish-hi,');
    expect(symbol('icon-fish').querySelectorAll('path, circle').length).toBeGreaterThanOrEqual(7);
    // look-spec §1.5: no outline (only the scale arcs are strokes), the eye in --ink-deep
    expect(fishMarkup()).not.toContain('stroke:var(--ink,');
    expect(Array.from(symbol('icon-fish').querySelectorAll('[stroke-width]')).map((e) => e.getAttribute('stroke-width'))).toEqual(['.9']);
    expect(fish).toContain('var(--ink-deep,');
    for (const id of ['icon-plus', 'icon-shop', 'icon-globe', 'icon-crown', 'icon-users']) {
      expect(symbol(id).getAttribute('viewBox'), id).toBe('0 0 24 24');
      expect(html(id), id).toContain('currentcolor');
    }
    for (const id of ['acc-lantern', 'acc-scarf', 'acc-yarn']) {
      expect(symbol(id).getAttribute('viewBox'), id).toBe('0 0 100 100');
      expect(symbol(id).children.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('the accessories are not in the first-load sprite; mountAccessories adds them once (the events chunk)', () => {
    expect(spriteMarkup()).not.toContain('acc-');
    expect(mountAccessories()).toBe(false); // no sprite yet: nothing to do
    mountSprite();
    expect(document.querySelector('#acc-lantern')).toBeNull();
    expect(mountAccessories()).toBe(true);
    expect(mountAccessories()).toBe(true);
    for (const id of ['acc-lantern', 'acc-scarf', 'acc-yarn']) expect(document.querySelectorAll(`symbol#${id}`), id).toHaveLength(1);
    expect(accessoryMarkup().match(/<symbol /g)).toHaveLength(3);
  });

  it('the mark-x symbol is the board\'s X: two white rounded rects crossed at ±45° (look-spec §1.10)', () => {
    const rects = symbol('mark-x').querySelectorAll('rect');
    expect(rects).toHaveLength(2);
    expect(symbol('mark-x').querySelector('g')?.getAttribute('fill')).toBe('#fff');
    expect(Array.from(rects).map((r) => r.getAttribute('transform'))).toEqual(['rotate(45 50 50)', 'rotate(-45 50 50)']);
    expect([rects[0]?.getAttribute('x'), rects[0]?.getAttribute('width'), rects[0]?.getAttribute('height'), rects[0]?.getAttribute('rx')]).toEqual(['15.5', '69', '18.2', '6']);
    expect(symbol('mark-x').querySelector('path')).toBeNull();
  });

  it('nothing ginger is left in the sprite', () => {
    const m = spriteMarkup().toLowerCase();
    for (const v of ['#f29a4a', '#d9762e', '#ffe9cf', '#f8b9a0', '#17806f']) expect(m).not.toContain(v);
  });
});

describe('poses (phase2b §1.6)', () => {
  const kinds: IllustrationKind[] = ['home', 'boot', 'win', 'fail', 'daily', 'tutorial'];

  it('illustration(kind) builds a fresh, labelled-on-request SVG of Tux for every pose', () => {
    for (const k of kinds) {
      const svg = illustration(k);
      expect(svg.getAttribute('class')).toContain(`illus--${k}`);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.querySelectorAll('path').length).toBeGreaterThan(10);
      expect(svg.innerHTML.toLowerCase()).toContain(CAT_COLORS.fur.toLowerCase());
      expect(svg.innerHTML.toLowerCase()).toContain(CAT_COLORS.mask.toLowerCase());
      expect(svg).not.toBe(illustration(k));
      const labelled = illustration(k, { label: `Tux ${k}`, class: 'big' });
      expect(labelled.getAttribute('role')).toBe('img');
      expect(labelled.getAttribute('aria-label')).toBe(`Tux ${k}`);
      expect(labelled.getAttribute('class')).toBe(`illus illus--${k} big`);
    }
  });

  it('mascotIllustration renders home and boot with their labels; home has the idle-loop groups', () => {
    const home = mascotIllustration('home', { label: 'A black-and-white cat' });
    expect(home.getAttribute('aria-label')).toBe('A black-and-white cat');
    expect(home.querySelector('.illus__body .pose__tail')).not.toBeNull();
    expect(home.querySelector('.illus__body .pose__head .illus__blink')).not.toBeNull();
    // the static 4° tilt sits on an inner group, so the CSS tilt on .pose__head does not replace it
    expect(home.querySelector('.pose__head > g')?.getAttribute('transform')).toContain('rotate(4 50 60)');
    const boot = mascotIllustration('boot', { label: 'A black-and-white cat having a nap' });
    expect(boot.querySelectorAll('.illus__z')).toHaveLength(2);
    expect(boot.getAttribute('role')).toBe('img');
  });

  it('the win pose holds our fish with sparkles; tutorial waves; no instrument, heart or tears anywhere', () => {
    const win = illustration('win');
    expect(win.innerHTML).toContain('var(--fish,');
    expect(win.querySelectorAll('.illus__spark')).toHaveLength(3);
    expect(illustration('tutorial').querySelector('.illus__wave')).not.toBeNull();
    expect(illustration('daily').querySelectorAll('.illus__spark').length).toBeGreaterThan(0);
    for (const k of kinds) expect(illustration(k).querySelector('#icon-heart, use[href="#icon-heart"]')).toBeNull();
  });
});

describe('Home mascot head tilt (phase2b §2.9)', () => {
  it('mascotIllustration(home) starts its own tilt timer; boot has none', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const home = mascotIllustration('home');
    document.body.appendChild(home);
    vi.advanceTimersByTime(cfg.fx.mascotHeadTiltMinMs);
    expect(home.querySelector('.pose__head')?.getAttribute('class')).toContain('is-tilt');
    expect(mascotIllustration('boot').querySelector('.pose__head')).toBeNull();
    home.remove();
    vi.advanceTimersByTime(cfg.fx.mascotHeadTiltMaxMs * 2);
    spy.mockRestore();
  });

  it('tilts left and right in turn every fx.mascotHeadTilt{Min,Max}Ms and stops once detached', () => {
    vi.useFakeTimers();
    const svg = illustration('home'); // the same pose without mascotIllustration's own timer
    document.body.appendChild(svg);
    const head = svg.querySelector('.pose__head') as Element;
    const stop = startHeadTilt(svg, cfg, () => 0); // the earliest moment each time
    vi.advanceTimersByTime(cfg.fx.mascotHeadTiltMinMs - 1);
    expect(head.classList.contains('is-tilt-l') || head.classList.contains('is-tilt-r')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(head.classList.contains('is-tilt-l')).toBe(true);
    head.dispatchEvent(new Event('animationend'));
    expect(head.classList.contains('is-tilt-l')).toBe(false);
    vi.advanceTimersByTime(cfg.fx.mascotHeadTiltMinMs);
    expect(head.classList.contains('is-tilt-r')).toBe(true);
    svg.remove();
    head.classList.remove('is-tilt-r');
    vi.advanceTimersByTime(cfg.fx.mascotHeadTiltMaxMs * 3);
    expect(head.classList.contains('is-tilt-l') || head.classList.contains('is-tilt-r')).toBe(false);
    stop();
  });

  it('waits between min and max', () => {
    vi.useFakeTimers();
    const svg = illustration('home');
    document.body.appendChild(svg);
    const head = svg.querySelector('.pose__head') as Element;
    const stop = startHeadTilt(svg, cfg, () => 0.999);
    vi.advanceTimersByTime(cfg.fx.mascotHeadTiltMaxMs - 10);
    expect(head.getAttribute('class')).not.toContain('is-tilt');
    vi.advanceTimersByTime(20);
    expect(head.getAttribute('class')).toContain('is-tilt');
    stop();
  });
});

describe('event art (phase2b §4.4)', () => {
  const defs = EVENTS as unknown as EventDef[];

  it('eventPatternUrl returns a CSS url() of a tileable SVG for each pattern', () => {
    for (const art of ['lanterns', 'snowflakes', 'yarn'] as const) {
      const url = eventPatternUrl(art);
      expect(url.startsWith('url("data:image/svg+xml,%3Csvg')).toBe(true);
      expect(url.endsWith('%3C/svg%3E")')).toBe(true);
      expect(url).not.toMatch(/[<>#]/);
      expect(url).toContain("width='72'");
    }
  });

  it('eventArt draws the card and the header: pattern, Tux, and the event accessory', () => {
    mountSprite();
    for (const def of defs) {
      for (const kind of ['card', 'header'] as const) {
        const el = eventArt(def, kind);
        expect(el.className).toBe(`event-art event-art--${kind}`);
        expect(el.getAttribute('aria-hidden')).toBe('true');
        expect(el.dataset.art).toBe(def.theme.pageArt);
        expect(el.style.getPropertyValue('--event-page')).toBe(def.theme.page);
        expect(el.style.getPropertyValue('--event-art')).toBe(eventPatternUrl(def.theme.pageArt));
        const svg = el.querySelector('svg.event-art__pose') as SVGSVGElement;
        expect(svg).not.toBeNull();
        expect(svg.querySelector(`use[href="#acc-${def.theme.accessory}"]`)).not.toBeNull();
        expect(svg.innerHTML.toLowerCase()).toContain(CAT_COLORS.fur.toLowerCase());
      }
    }
  });
});

describe('board cell: the X is two white rounded bars, its edge only with Colour patterns on (look-spec §1.10)', () => {
  it('markRects follows layout.mark: 69 × 18.2 bars with corner 6, edges grown by 3.5 per side', () => {
    expect(markRects()).toEqual({ bar: [15.5, 40.9, 69, 18.2, 6], edge: [12, 37.4, 76, 25.2, 9.5] });
    // at slot 38 (tile 35): bar 6.9 px thick, tip to tip 26.2, the X's box 21.5 square, as measured
    const k = 38 / 100;
    const [, , len, w, r] = markRects().bar as [number, number, number, number, number];
    expect(w * k).toBeCloseTo(6.9, 1);
    expect(len * k).toBeCloseTo(26.2, 1);
    // the rotated rounded bar's box: the corner arcs set the extremes
    expect(((len + w - 4 * r) / Math.SQRT2 + 2 * r) * k).toBeCloseTo(21.5, 1);
  });

  it('every cell has g.cell__xg with two .cell__xe rects under two white .cell__x rects, and --xe = xEdgeColor(paletteIndex)', () => {
    const insets = evenInsets(1, 38)[0] as Parameters<typeof buildCell>[2];
    for (let p = 0; p < PALETTE.length; p++) {
      const refs = buildCell(p, p, insets, 0);
      expect(refs.el.style.getPropertyValue('--xe')).toBe(xEdgeColor(p));
      const g = refs.svg.querySelector('g.cell__xg') as SVGGElement;
      const rects = Array.from(g.querySelectorAll('rect'));
      expect(rects.map((e) => e.getAttribute('class'))).toEqual(['cell__xe', 'cell__xe', 'cell__x', 'cell__x']);
      expect(rects.map((e) => e.getAttribute('transform'))).toEqual(['rotate(45 50 50)', 'rotate(-45 50 50)', 'rotate(45 50 50)', 'rotate(-45 50 50)']);
      const box = (r: Element): string[] => ['x', 'y', 'width', 'height', 'rx'].map((a) => r.getAttribute(a) ?? '');
      expect(box(rects[2] as Element)).toEqual(['15.5', '40.9', '69', '18.2', '6']);
      expect(box(rects[0] as Element)).toEqual(['12', '37.4', '76', '25.2', '9.5']);
      // no strokes left (the 2b stroke X and its dash draw-in are gone)
      expect(refs.svg.querySelector('path.cell__x, path.cell__xe')).toBeNull();
      expect(refs.el.querySelector('.cell__glow')).not.toBeNull();
    }
  });

  it('a cat cell gets the cat, its blink lid and the ear-flick overlay', () => {
    const refs = buildCell(0, 3, evenInsets(1, 36)[0] as Parameters<typeof buildCell>[2], 0);
    ensureCat(refs, 'idle');
    const uses = Array.from(refs.svg.querySelectorAll('.cell__catg use')).map((u) => u.getAttribute('href'));
    expect(uses).toEqual(['#cat-idle', '#cat-blink', '#cat-ear-flick']);
    const size = refs.svg.querySelector('.cell__cat')?.getAttribute('width');
    expect(size).toBe(String(Math.round(cfg.layout.catScale * 100)));
  });
});

describe('palette helpers', () => {
  it('regionColorVar and mixHex', () => {
    expect(regionColorVar(7)).toBe('var(--r7)');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#F49AAE', '#FAF6F0', 0)).toBe('#f49aae');
  });

  it('regionColorsFor uses fixed tutorial colours or a deterministic engine assignment', () => {
    const puzzle = { id: 'T1' as const, n: 4, regions: Uint8Array.from([0, 1, 2, 2, 0, 0, 2, 2, 0, 3, 3, 2, 3, 3, 3, 3]) };
    expect(Array.from(regionColorsFor(puzzle, [3, 7, 2, 0]))).toEqual([3, 7, 2, 0]);
    const a = regionColorsFor({ ...puzzle, id: 'L9' }, null);
    const b = regionColorsFor({ ...puzzle, id: 'L9' }, null);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(new Set(a).size).toBe(4);
    for (const c of a) expect(PALETTE_CORE).toContain(c);
    // a fixed list that is too short or out of range falls back to the assignment
    expect(Array.from(regionColorsFor({ ...puzzle, id: 'L9' }, [1, 2]))).toEqual(Array.from(a));
  });
});

describe('Phase 2d palette (look-spec §1.6, §1.9)', () => {
  /** A deterministic n×n region map: n regions in vertical-ish stripes with a seeded wobble. */
  const stripes = (n: number, seed: number): Uint8Array => {
    const out = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[r * n + c] = Math.min(n - 1, Math.max(0, c + (((r * 7 + c * 3 + seed) % 5 === 0 ? 1 : 0) - ((r + seed) % 7 === 0 && c > 0 ? 1 : 0))));
    for (let g = 0; g < n; g++) out[g] = g; // every label present
    return out;
  };

  it('the 10 measured colours are the core tier; Mint (4) and Cocoa (9) are the extras', () => {
    expect(PALETTE).toEqual(['#D57374', '#FFAA6D', '#E4BB49', '#AED994', '#52A982', '#48B5B2', '#6BBCE7', '#9778D6', '#EB85B7', '#B0855A', '#A7BFD7', '#FAB4D0']);
    expect([...PALETTE_CORE]).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 10, 11]);
    expect([...paletteTier(4)]).toEqual([...PALETTE_CORE]);
    expect([...paletteTier(10)]).toEqual([...PALETTE_CORE]);
    expect([...paletteTier(11)]).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11]);
    expect([...paletteTier(12)]).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it('regionColorsFor draws n ≤ 10 boards from the core only, adds Cocoa at 11, uses all 12 at 12; adjacent regions stay ≥ ΔE 10', () => {
    for (const n of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      for (let k = 0; k < 12; k++) {
        const regions = stripes(n, k);
        const colors = regionColorsFor({ id: `L${n * 100 + k}`, n, regions }, null);
        expect(new Set(colors).size, `n=${n}`).toBe(n);
        const tier = paletteTier(n);
        for (const c of colors) expect(tier, `n=${n}`).toContain(c);
        if (n <= 10) for (const c of colors) expect([4, 9]).not.toContain(c);
        if (n === 10) expect([...colors].sort((x, y) => x - y)).toEqual([...PALETTE_CORE]);
        const adj = regionAdjacency(n, regions);
        for (let g = 0; g < n; g++) {
          for (let h = 0; h < n; h++) {
            if (((adj[g] as number) >> h) & 1) expect(PALETTE_DE00[(colors[g] as number) * PALETTE_SIZE + (colors[h] as number)] as number).toBeGreaterThanOrEqual(1000);
          }
        }
      }
    }
  });

  it('HEAD_ORDER is a permutation of 0…11 around the wheel from green: Lime, Mint, Lagoon, Sky, Slate, Violet, Orchid, Pink, Coral, Apricot, Cocoa, Mustard', () => {
    expect([...HEAD_ORDER]).toEqual([3, 4, 5, 6, 10, 7, 8, 11, 0, 1, 9, 2]);
    expect([...HEAD_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    // filtered to the 10 core colours it is the recording's order
    expect(HEAD_ORDER.filter((i) => PALETTE_CORE.includes(i))).toEqual([3, 5, 6, 10, 7, 8, 11, 0, 1, 2]);
  });

  it('xEdgeColor mixes each tile toward --ink-deep by layout.mark.edgeMix (look-spec §1.10)', () => {
    for (let i = 0; i < PALETTE.length; i++) expect(xEdgeColor(i)).toBe(mixHex(PALETTE[i] as string, TOKENS['ink-deep'], cfg.layout.mark.edgeMix));
    expect(cfg.layout.mark.edgeMix).toBe(0.85);
    expect(xEdgeColor(3)).not.toBe(PALETTE[3]);
  });
});

describe('Phase 2d symbols (look-spec Appendix C)', () => {
  const sym = (id: string): Element => {
    mountSprite();
    return document.querySelector(`symbol[id="${id}"]`) as Element;
  };

  it('icon-back: a left arrow, stroke 3.1 with round caps and joins, in currentColor', () => {
    const p = sym('icon-back').querySelector('path') as Element;
    expect(sym('icon-back').getAttribute('viewBox')).toBe('0 0 24 24');
    expect(p.getAttribute('stroke')).toBe('currentColor');
    expect(p.getAttribute('stroke-width')).toBe('3.1');
    expect(p.getAttribute('stroke-linecap')).toBe('round');
    expect(p.getAttribute('stroke-linejoin')).toBe('round');
  });

  it('icon-gear: a filled cog in currentColor, six round-ended teeth on a ring with an open centre', () => {
    const g = sym('icon-gear');
    const ring = g.querySelector('circle') as Element;
    expect(ring.getAttribute('r')).toBe('6');
    expect(ring.getAttribute('stroke-width')).toBe('4.2'); // inner radius 3.9: a Ø 7.8 hole
    expect(g.querySelector('g')?.getAttribute('fill')).toBe('none');
    const teeth = g.querySelector('path') as Element;
    expect(teeth.getAttribute('stroke-linecap')).toBe('round');
    expect((teeth.getAttribute('d') ?? '').match(/[Mm]/g)).toHaveLength(6);
    expect(g.innerHTML).not.toContain('--icon-fill');
  });

  it('icon-play: a rounded triangle pointing right', () => {
    const p = sym('icon-play').querySelector('path') as Element;
    expect(p.getAttribute('fill')).toBe('currentColor');
    expect(p.getAttribute('stroke-linejoin')).toBe('round');
  });

  it('tool-kitty is our Tux head, winking: one open iris, one closed arc, an open mouth with the pink tongue, the blaze', () => {
    const k = sym('tool-kitty');
    const h = k.innerHTML.toLowerCase();
    expect(k.querySelectorAll(`ellipse[fill="${CAT_COLORS.iris}"]`)).toHaveLength(1);
    expect(h).toContain(CAT_COLORS.mouth.toLowerCase());
    expect(h).toContain(CAT_COLORS.blush.toLowerCase());
    expect(k.querySelector(`path[d="${MASK_PATH}"]`)).not.toBeNull();
    expect(k.innerHTML).toContain(earOuterPath(24, true)); // the notched left ear
  });

  it('tool-bulb, tool-mouse: full-colour art on a square 100 box; cat-head-flat one flat currentColor shape', () => {
    expect(sym('tool-bulb').getAttribute('viewBox')).toBe('0 0 100 100');
    expect(sym('tool-bulb').innerHTML).toContain(TOKENS.gold);
    expect(sym('tool-bulb').innerHTML).toContain(TOKENS.hard);
    const m = sym('tool-mouse').innerHTML;
    for (const c of ['#B8B4BC', '#D9D6DC', CAT_COLORS.earIn, CAT_COLORS.nose]) expect(m).toContain(c);
    expect(sym('tool-mouse').querySelectorAll('circle[r="5.4"]')).toHaveLength(2); // bead eyes
    const head = sym('cat-head-flat');
    expect(head.children).toHaveLength(1);
    expect(head.querySelector('path')?.getAttribute('fill')).toBe('currentColor');
    expect(head.innerHTML).not.toContain('stroke');
    expect(sym('art-flex').innerHTML).toContain(TOKENS.fish);
    expect(sym('art-flex').innerHTML).toContain(TOKENS['fish-deep']);
    expect(sym('art-flex').querySelector('[stroke-width]')).toBeNull();
  });

  it('every new symbol is decorative through icon()', () => {
    for (const id of ['icon-back', 'icon-play', 'tool-kitty', 'tool-bulb', 'tool-mouse', 'cat-head-flat', 'art-flex'] as const) {
      expect(icon(id).getAttribute('aria-hidden'), id).toBe('true');
    }
  });
});

describe('ruleDiagram (look-spec §1.7)', () => {
  const doc = (kind: 'colours' | 'lines' | 'space'): SVGSVGElement => {
    const host = document.createElement('div');
    host.innerHTML = ruleDiagram(kind);
    return host.firstElementChild as SVGSVGElement;
  };

  it('is a decorative 3 × 3 diagram of 10.2 cells with radius 1.5 on a 32.7 box', () => {
    for (const kind of ['colours', 'lines', 'space'] as const) {
      const svg = doc(kind);
      expect(svg.getAttribute('class')).toBe('chip__art');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('viewBox')).toBe('0 0 32.7 32.7');
      const cells = Array.from(svg.querySelectorAll('rect[width="10.2"]'));
      expect(cells).toHaveLength(9);
      for (const c of cells) expect(c.getAttribute('rx')).toBe('1.5');
      expect(svg.querySelectorAll('use[href="#cat-idle"]')).toHaveLength(1);
    }
  });

  it('our three layouts: the X boxes and the cat on --rule-mark, plain cells on --rule-tile (and --rule-tile-2 for the second colour)', () => {
    const marks = (kind: 'colours' | 'lines' | 'space'): number[] =>
      Array.from(doc(kind).querySelectorAll('rect[width="10.2"]'))
        .map((r, i) => ((r.getAttribute('style') ?? '').includes('--rule-mark') ? i : -1))
        .filter((i) => i >= 0);
    expect(marks('colours')).toEqual([0, 1, 2, 3, 6]);
    expect(marks('lines')).toEqual([1, 3, 4, 5, 7]);
    expect(marks('space')).toEqual([0, 1, 3, 4]);
    // two white bars per X box
    expect(doc('colours').querySelectorAll('rect[fill="#fff"]')).toHaveLength(8);
    expect(doc('space').querySelectorAll('rect[fill="#fff"]')).toHaveLength(6);
    const second = Array.from(doc('colours').querySelectorAll('rect[width="10.2"]')).filter((r) => (r.getAttribute('style') ?? '').includes('--rule-tile-2'));
    expect(second).toHaveLength(4);
    expect(ruleDiagram('lines')).not.toContain('--rule-tile-2');
    // the X box: bars 15 % of the cell thick, the X spanning 65 % of it
    const bar = doc('lines').querySelector('rect[fill="#fff"]') as Element;
    expect(Number(bar.getAttribute('height')) / 10.2).toBeCloseTo(0.15, 2);
    expect((Number(bar.getAttribute('width')) + Number(bar.getAttribute('height'))) / Math.SQRT2 / 10.2).toBeCloseTo(0.65, 2);
  });
});
