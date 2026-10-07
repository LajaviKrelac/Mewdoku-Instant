// Owner: ui-board. Sprite, illustrations, palette helpers, fx and a11y utilities.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createAnnouncer } from '../../../src/ui/a11y/announcer';
import { focusableElements, setInert, trapFocus } from '../../../src/ui/a11y/focus-trap';
import { illustration, type IllustrationKind } from '../../../src/ui/art/illustrations';
import { mixHex, PALETTE, regionColorsFor, regionColorVar } from '../../../src/ui/art/palette';
import { icon, mountSprite, setIcon, SPRITE_ID, type SymbolId } from '../../../src/ui/art/sprite';
import { burstConfetti } from '../../../src/ui/fx/confetti';
import { applyMotion, resolveReducedMotion, systemPrefersReducedMotion, watchSystemReducedMotion } from '../../../src/ui/fx/motion';
import { shake, shakeOffsets } from '../../../src/ui/fx/shake';

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

describe('illustrations', () => {
  it('builds a fresh SVG for every pose', () => {
    const kinds: IllustrationKind[] = ['home', 'boot', 'win', 'fail', 'daily', 'tutorial'];
    for (const k of kinds) {
      const svg = illustration(k);
      expect(svg.getAttribute('class')).toContain(`illus--${k}`);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.querySelectorAll('path').length).toBeGreaterThan(10);
      expect(svg).not.toBe(illustration(k));
    }
    const labelled = illustration('win', { label: 'A ginger cat in a party hat', class: 'big' });
    expect(labelled.getAttribute('role')).toBe('img');
    expect(labelled.getAttribute('class')).toBe('illus illus--win big');
  });
});

describe('palette helpers', () => {
  it('regionColorVar and mixHex', () => {
    expect(regionColorVar(7)).toBe('var(--r7)');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#F49AAE', '#FBF6EE', 0)).toBe('#f49aae');
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

describe('fx', () => {
  it('shake: three decaying cycles, skipped under reduced motion or without WAAPI', () => {
    expect(shakeOffsets(6)).toEqual([0, 6, -6, 4, -4, 2, -2, 0]);
    const el = document.createElement('div');
    expect(shake(el, { reducedMotion: true })).toBeNull();
    const animate = vi.fn(() => ({}) as Animation);
    (el as unknown as { animate: typeof animate }).animate = animate;
    expect(shake(el)).not.toBeNull();
    expect(animate).toHaveBeenCalledWith(expect.any(Array), { duration: cfg.fx.wrongShakeMs, easing: 'linear' });
  });

  it('confetti: cfg.fx.confettiCount pieces, removed after cfg.fx.confettiMs or on cleanup', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    burstConfetti(host);
    expect(host.querySelectorAll('.confetti .cf')).toHaveLength(cfg.fx.confettiCount);
    vi.advanceTimersByTime(cfg.fx.confettiMs + 250);
    expect(host.querySelector('.confetti')).toBeNull();
    const stop = burstConfetti(host, { count: 5 });
    expect(host.querySelectorAll('.cf')).toHaveLength(5);
    stop();
    expect(host.querySelector('.confetti')).toBeNull();
  });

  it('motion: setting resolution, system query and root attribute', () => {
    expect(resolveReducedMotion('on', false)).toBe(true);
    expect(resolveReducedMotion('off', true)).toBe(false);
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(systemPrefersReducedMotion({} as Window)).toBe(false);
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    const fakeWin = {
      matchMedia: () => ({
        matches: true,
        addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.push(l),
        removeEventListener: () => listeners.pop(),
      }),
    } as unknown as Window;
    expect(systemPrefersReducedMotion(fakeWin)).toBe(true);
    const seen: boolean[] = [];
    const off = watchSystemReducedMotion((p) => seen.push(p), fakeWin);
    listeners[0]?.({ matches: false } as MediaQueryListEvent);
    off();
    expect(seen).toEqual([false]);
    expect(listeners).toHaveLength(0);
    const root = document.createElement('div');
    applyMotion(root, true);
    expect(root.dataset.motion).toBe('reduced');
    applyMotion(root, false);
    expect(root.dataset.motion).toBe('full');
  });
});

describe('a11y', () => {
  it('announcer: polite status region; identical repeats still change the text', () => {
    const a = createAnnouncer();
    const el = document.querySelector('[role=status]') as HTMLElement;
    expect(el.getAttribute('aria-live')).toBe('polite');
    a.say('Wrong tile. 2 hearts left.');
    const first = el.textContent;
    a.say('Wrong tile. 2 hearts left.');
    expect(el.textContent).not.toBe(first);
    expect(el.textContent?.trim()).toBe('Wrong tile. 2 hearts left.');
    a.say('Cat placed. 4 of 8.');
    expect(el.textContent).toBe('Cat placed. 4 of 8.');
    a.clear();
    expect(el.textContent).toBe('');
    a.destroy();
    expect(document.querySelector('[role=status]')).toBeNull();
  });

  it('focusableElements skips disabled, hidden and negative tabindex elements', () => {
    const box = document.createElement('div');
    box.innerHTML =
      '<button id="a">a</button><button disabled>b</button><button hidden>c</button><a href="#">d</a>' +
      '<span tabindex="-1">e</span><span tabindex="0" id="f">f</span><div hidden><button>g</button></div>';
    document.body.appendChild(box);
    expect(focusableElements(box).map((e) => e.id || e.textContent)).toEqual(['a', 'd', 'f']);
  });

  it('trapFocus keeps Tab inside, focuses the initial element and restores focus on release', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const box = document.createElement('div');
    box.innerHTML = '<button id="one">1</button><button id="two">2</button>';
    document.body.appendChild(box);
    const one = box.querySelector('#one') as HTMLElement;
    const two = box.querySelector('#two') as HTMLElement;
    const release = trapFocus(box, { initialFocus: two });
    expect(document.activeElement).toBe(two);
    const tab = (shift = false): boolean => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }));
    expect(tab()).toBe(false); // prevented: wrapped to the first
    expect(document.activeElement).toBe(one);
    tab(true);
    expect(document.activeElement).toBe(two);
    outside.focus(); // focus escaping is pulled back in
    expect(box.contains(document.activeElement)).toBe(true);
    release();
    expect(document.activeElement).toBe(outside);
  });

  it('setInert toggles inert plus an aria-hidden fallback and restores the previous value', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    b.setAttribute('aria-hidden', 'false');
    setInert([a, b], true);
    expect(a.hasAttribute('inert')).toBe(true);
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(b.getAttribute('aria-hidden')).toBe('true');
    setInert([a, b], false);
    expect(a.hasAttribute('inert')).toBe(false);
    expect(a.hasAttribute('aria-hidden')).toBe(false);
    expect(b.getAttribute('aria-hidden')).toBe('false');
  });
});
