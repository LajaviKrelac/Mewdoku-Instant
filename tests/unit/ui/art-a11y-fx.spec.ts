// Owner: A. Sprite, Tux, poses, event art, palette helpers and the board cell's X underlay
// (phase2b §1.5–§1.7, §1.12, §2.9, §4.4).
// phase2b F0 split: the fx and a11y cases moved to fx-a11y.spec.ts (B).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import type { EventDef } from '../../../src/game/events';
import { accessoryMarkup, mountAccessories } from '../../../src/ui/art/accessories';
import { CAT, catHead, earOuterPath, EAR_FLICK_PIVOT, MASK_PATH } from '../../../src/ui/art/cat-parts';
import { eventArt, eventPatternUrl } from '../../../src/ui/art/event-art';
import { fishMarkup } from '../../../src/ui/art/fish';
import { illustration, type IllustrationKind } from '../../../src/ui/art/illustrations';
import { mascotIllustration, startHeadTilt } from '../../../src/ui/art/mascot';
import { CAT_COLORS, mixHex, PALETTE, regionColorsFor, regionColorVar, TOKENS, xEdgeColor } from '../../../src/ui/art/palette';
import { icon, mountSprite, setIcon, spriteMarkup, SPRITE_ID, type SymbolId } from '../../../src/ui/art/sprite';
import { buildCell, ensureCat } from '../../../src/ui/board/board-cells';
import { evenInsets } from '../../../src/ui/board/layout';
import EVENTS from '../../../src/data/events/events.json';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('sprite', () => {
  const ids: SymbolId[] = [
    'cat-idle', 'cat-happy', 'cat-sad', 'cat-surprised', 'cat-blink', 'mark-x', 'wrong-x',
    'icon-house', 'icon-gear', 'icon-bulb', 'icon-paw', 'icon-heart', 'icon-heart-empty', 'icon-trophy', 'icon-lock',
    'icon-calendar', 'icon-play-video', 'icon-close', 'icon-chevron', 'icon-rule-colours', 'icon-rule-lines', 'icon-rule-space',
    ...Array.from({ length: 12 }, (_, i) => `glyph-${i}` as SymbolId),
    // phase2b §1.7, §2.9
    'icon-fish', 'icon-plus', 'icon-shop', 'icon-globe', 'icon-crown', 'icon-users', 'cat-ear-flick',
  ];

  it('mounts once and defines every symbol plus the heart clip paths', () => {
    mountSprite();
    mountSprite();
    expect(document.querySelectorAll(`#${SPRITE_ID}`)).toHaveLength(1);
    const sprite = document.getElementById(SPRITE_ID) as Element;
    expect(sprite.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.firstChild).toBe(sprite);
    for (const id of ids) expect(sprite.querySelector(`symbol[id="${id}"]`), id).not.toBeNull();
    expect(sprite.querySelector('#clip-heart-l')).not.toBeNull();
    expect(sprite.querySelector('#clip-heart-r')).not.toBeNull();
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
    expect(fishMarkup(2)).toContain('stroke-width="2"');
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

  it('the mark-x symbol is the white X over its edge', () => {
    const paths = symbol('mark-x').querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('stroke-width')).toBe('20');
    expect(paths[0]?.getAttribute('style')).toContain('var(--xe');
    expect(paths[1]?.getAttribute('stroke')).toBe('#fff');
    expect(paths[1]?.getAttribute('stroke-width')).toBe('12');
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

describe('board cell: the white X over its edge (phase2b §1.5, §1.12)', () => {
  it('every cell has two .cell__xe strokes under the two white .cell__x strokes, and --xe = xEdgeColor(paletteIndex)', () => {
    const insets = evenInsets(1, 36)[0] as Parameters<typeof buildCell>[2];
    for (let p = 0; p < PALETTE.length; p++) {
      const refs = buildCell(p, p, insets, 0);
      expect(refs.el.style.getPropertyValue('--xe')).toBe(xEdgeColor(p));
      const paths = Array.from(refs.svg.querySelectorAll('path'));
      expect(paths.map((e) => e.getAttribute('class'))).toEqual(['cell__xe', 'cell__xe', 'cell__x', 'cell__x']);
      const a = Math.round(((1 - cfg.layout.markScale) / 2) * 100);
      expect(a).toBe(23);
      expect(paths[0]?.getAttribute('d')).toBe('M23 23 77 77');
      expect(paths[2]?.getAttribute('d')).toBe('M23 23 77 77');
      // 12 + 2 × 4 = 20 units (layout.markStrokeFraction + 2 × markEdgeFraction)
      expect(paths[0]?.getAttribute('stroke-width')).toBe('20');
      expect(paths[2]?.getAttribute('stroke-width')).toBeNull();
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
    expect(Array.from(regionColorsFor(puzzle, [4, 7, 2, 0]))).toEqual([4, 7, 2, 0]);
    const a = regionColorsFor({ ...puzzle, id: 'L9' }, null);
    const b = regionColorsFor({ ...puzzle, id: 'L9' }, null);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(new Set(a).size).toBe(4);
    for (const c of a) expect(c).toBeLessThan(PALETTE.length);
    // a fixed list that is too short or out of range falls back to the assignment
    expect(Array.from(regionColorsFor({ ...puzzle, id: 'L9' }, [1, 2]))).toEqual(Array.from(a));
  });
});

describe('phase2b palette additions', () => {
  it('xEdgeColor mixes each tile toward --ink by layout.markEdgeMix (phase2b §1.5)', () => {
    for (let i = 0; i < PALETTE.length; i++) expect(xEdgeColor(i)).toBe(mixHex(PALETTE[i] as string, TOKENS.ink, cfg.layout.markEdgeMix));
    expect(xEdgeColor(3)).not.toBe(PALETTE[3]);
  });
});
