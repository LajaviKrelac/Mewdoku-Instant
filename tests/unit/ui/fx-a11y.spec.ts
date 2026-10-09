// Owner: B. fx and a11y utilities (shake, confetti, motion; announcer, focus trap, inert).
// phase2b F0 split: moved from art-a11y-fx.spec.ts (A). B adds fx-fish, board-entry and the
// transitions/glow cases in their own files (phase2b §2.13).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createAnnouncer } from '../../../src/ui/a11y/announcer';
import { focusableElements, setInert, trapFocus } from '../../../src/ui/a11y/focus-trap';
import { burstConfetti } from '../../../src/ui/fx/confetti';
import { applyMotion, resolveReducedMotion, systemPrefersReducedMotion, watchSystemReducedMotion } from '../../../src/ui/fx/motion';
import { shake, shakeOffsets } from '../../../src/ui/fx/shake';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
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
    vi.useFakeTimers();
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
    vi.useRealTimers();
  });

  it('restoreOnNextFrame: focus returns on the next frame, after the closing writes (RP-3)', () => {
    vi.useFakeTimers();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const box = document.createElement('div');
    box.innerHTML = '<button>1</button>';
    document.body.appendChild(box);
    const release = trapFocus(box, { restoreOnNextFrame: true });
    expect(box.contains(document.activeElement)).toBe(true);
    release();
    (document.activeElement as HTMLElement).blur(); // the closing overlay hides its focused button
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(20);
    expect(document.activeElement).toBe(outside);
    vi.useRealTimers();
  });

  it('restoreOnNextFrame leaves focus alone when another dialog took it meanwhile', () => {
    vi.useFakeTimers();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const box = document.createElement('div');
    box.innerHTML = '<button>1</button>';
    document.body.appendChild(box);
    const release = trapFocus(box, { restoreOnNextFrame: true });
    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    other.innerHTML = '<button id="o">o</button>';
    document.body.appendChild(other);
    release();
    (other.querySelector('#o') as HTMLElement).focus(); // a new modal opened in the same task
    vi.advanceTimersByTime(20);
    expect((document.activeElement as HTMLElement).id).toBe('o');
    vi.useRealTimers();
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
