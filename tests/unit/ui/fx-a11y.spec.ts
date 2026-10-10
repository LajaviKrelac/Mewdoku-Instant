// Owner: B; G3 (Phase 2d: the level-start toast, look-spec §1.14). fx and a11y utilities (shake, motion; announcer, focus trap, inert). The O3 confetti was
// removed with the Phase 2 win overlay at 2b integration (the victory screen replaced it).
// phase2b F0 split: moved from art-a11y-fx.spec.ts (A). B adds fx-fish, board-entry and the
// transitions/glow cases in their own files (phase2b §2.13).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createAnnouncer } from '../../../src/ui/a11y/announcer';
import { focusableElements, setInert, trapFocus } from '../../../src/ui/a11y/focus-trap';
import { applyMotion, resolveReducedMotion, systemPrefersReducedMotion, watchSystemReducedMotion } from '../../../src/ui/fx/motion';
import { playGlow } from '../../../src/ui/fx/glow';
import { shake, shakeOffsets } from '../../../src/ui/fx/shake';
import { createStartToast, startToastPlan } from '../../../src/ui/fx/start-toast';
import { MASCOT_POP_MS, playScreenTransition, transitionMs } from '../../../src/ui/fx/transitions';

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
    a.say('Wrong tile. 2 fish left.');
    const first = el.textContent;
    a.say('Wrong tile. 2 fish left.');
    expect(el.textContent).not.toBe(first);
    expect(el.textContent?.trim()).toBe('Wrong tile. 2 fish left.');
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

// ─────────────────────────────── phase2b §2.2 glow, §2.9 transitions ───────────────────────────────

/** Records WAAPI calls on HTMLElement while `fn` runs (jsdom has no WAAPI). */
function withAnimate(fn: (calls: { el: Element; frames: Keyframe[]; opts: KeyframeAnimationOptions }[]) => void): void {
  const calls: { el: Element; frames: Keyframe[]; opts: KeyframeAnimationOptions }[] = [];
  const proto = HTMLElement.prototype as unknown as { animate?: unknown };
  const had = 'animate' in proto;
  proto.animate = function (this: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) {
    calls.push({ el: this, frames, opts });
    return { cancel: vi.fn(), finish: vi.fn() } as unknown as Animation;
  };
  try {
    fn(calls);
  } finally {
    if (!had) delete proto.animate;
  }
}

function glowBoard(n: number): HTMLElement {
  const board = document.createElement('div');
  board.className = 'board';
  for (let i = 0; i < n; i++) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.i = String(i);
    const glow = document.createElement('span');
    glow.className = 'cell__glow';
    cell.appendChild(glow);
    board.appendChild(cell);
  }
  return board;
}

describe('playGlow (phase2b §2.2)', () => {
  const W = cfg.fx.win;

  it('fades each cat cell 0 → 1 → glowSettleOpacity, staggered in row order, and resolves at the end', async () => {
    vi.useFakeTimers();
    const board = glowBoard(6);
    let done = false;
    withAnimate((calls) => {
      const h = playGlow(board, [1, 3, 5], false);
      void h.done.then(() => (done = true));
      expect(calls).toHaveLength(3);
      calls.forEach((c, k) => {
        expect(c.el).toBe(board.querySelector(`.cell[data-i="${[1, 3, 5][k]}"] .cell__glow`));
        expect(c.opts.delay).toBe(k * W.glowStaggerMs);
        expect(c.opts.duration).toBe(W.glowInMs + W.glowSettleMs);
        expect(c.frames.map((f) => f.opacity)).toEqual([0, 1, W.glowSettleOpacity]);
        expect(c.frames[1]?.offset).toBeCloseTo(W.glowInMs / (W.glowInMs + W.glowSettleMs), 9);
        for (const f of c.frames) for (const k2 of Object.keys(f)) expect(['opacity', 'offset', 'easing']).toContain(k2);
      });
    });
    // The settled state holds after the animation (inline opacity), only on the given cells.
    expect(board.querySelector<HTMLElement>('.cell[data-i="3"] .cell__glow')?.style.opacity).toBe(String(W.glowSettleOpacity));
    expect(board.querySelector<HTMLElement>('.cell[data-i="0"] .cell__glow')?.style.opacity).toBe('');
    expect(board.classList.contains('is-glowing')).toBe(true);
    vi.advanceTimersByTime(2 * W.glowStaggerMs + W.glowInMs + W.glowSettleMs);
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it('reduced motion: a static glow at glowSettleOpacity fading in over 150 ms, no stagger', () => {
    vi.useFakeTimers();
    const board = glowBoard(4);
    withAnimate((calls) => {
      playGlow(board, [0, 2], true);
      expect(calls.map((c) => c.opts.delay)).toEqual([0, 0]);
      expect(calls.map((c) => c.opts.duration)).toEqual([W.reduced.glowInMs, W.reduced.glowInMs]);
      expect(calls[0]?.frames.map((f) => f.opacity)).toEqual([0, W.glowSettleOpacity]);
    });
  });

  it('cancel() clears the glow (teardown); without WAAPI the end state shows at once', async () => {
    const board = glowBoard(3);
    const h = playGlow(board, [0, 1, 2], false);
    expect(board.querySelector<HTMLElement>('.cell__glow')?.style.opacity).toBe(String(W.glowSettleOpacity));
    h.cancel();
    expect(board.querySelector<HTMLElement>('.cell__glow')?.style.opacity).toBe('');
    expect(board.classList.contains('is-glowing')).toBe(false);
    await expect(h.done).resolves.toBeUndefined();
    const f = playGlow(board, [2], false);
    f.finish();
    await expect(f.done).resolves.toBeUndefined();
  });
});

describe('playScreenTransition (phase2b §2.9)', () => {
  const F = cfg.fx;
  const screens = (): [HTMLElement, HTMLElement] => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    return [a, b];
  };

  it('to_game: out fades and scales to 0.98 over screenOutMs; in slides up 16 px after 80 ms over 240 ms', async () => {
    vi.useFakeTimers();
    const [oldEl, newEl] = screens();
    let resolved = false;
    withAnimate((calls) => {
      void playScreenTransition(oldEl, newEl, 'to_game', false).then(() => (resolved = true));
      const out = calls.find((c) => c.el === oldEl);
      const inn = calls.find((c) => c.el === newEl);
      expect(out?.opts.duration).toBe(F.screenOutMs);
      expect(out?.frames[1]).toEqual({ opacity: 0, transform: 'scale(0.98)' });
      expect(inn?.opts.delay).toBe(F.screenInDelayMs);
      expect(inn?.opts.duration).toBe(F.screenInMs);
      expect(inn?.frames[0]).toEqual({ opacity: 0, transform: `translateY(${F.screenSlidePx}px)` });
    });
    // The outgoing screen is inert and hidden from assistive tech during the transition.
    expect(oldEl.hasAttribute('inert')).toBe(true);
    expect(oldEl.getAttribute('aria-hidden')).toBe('true');
    expect(transitionMs('to_game', false)).toBe(Math.max(F.screenOutMs, F.screenInDelayMs + F.screenInMs));
    vi.advanceTimersByTime(transitionMs('to_game', false) - 1);
    await Promise.resolve();
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(newEl.classList.contains('is-entering')).toBe(false);
  });

  it('from_game: out fades over 160 ms, in fades over 200 ms, the Home mascot pops 0.92 → 1', () => {
    vi.useFakeTimers();
    const [oldEl, newEl] = screens();
    const mascot = document.createElement('div');
    mascot.className = 'home__mascot';
    newEl.appendChild(mascot);
    withAnimate((calls) => {
      void playScreenTransition(oldEl, newEl, 'from_game', false);
      expect(calls.find((c) => c.el === oldEl)?.opts.duration).toBe(F.screenOutMs);
      expect(calls.find((c) => c.el === newEl)?.opts.duration).toBe(F.screenBackInMs);
      const pop = calls.find((c) => c.el === mascot);
      expect(pop?.opts.duration).toBe(MASCOT_POP_MS);
      expect(pop?.frames[0]).toEqual({ transform: 'scale(0.92)' });
    });
  });

  it('reduced motion: a 120 ms crossfade; without WAAPI it resolves at once', async () => {
    vi.useFakeTimers();
    const [oldEl, newEl] = screens();
    withAnimate((calls) => {
      void playScreenTransition(oldEl, newEl, 'to_game', true);
      expect(calls.map((c) => c.opts.duration)).toEqual([F.screenReducedMs, F.screenReducedMs]);
      for (const c of calls) for (const f of c.frames) expect(Object.keys(f)).toEqual(['opacity']);
    });
    expect(transitionMs('from_game', true)).toBe(F.screenReducedMs);
    vi.useRealTimers();
    const [a, b] = screens();
    await expect(playScreenTransition(a, b, 'from_game', false)).resolves.toBeUndefined();
    await expect(playScreenTransition(null, b, 'to_game', false)).resolves.toBeUndefined();
  });
});

describe('the level-start toast (Phase 2d §1.14)', () => {
  const T = cfg.fx.startToast;
  const host = (): HTMLElement => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  };

  it('the plan: delay, in, hold, then a linear drift at exitPxPerSec × s until it has fully left; reduced: fade, hold, fade', () => {
    const p = startToastPlan({ reduced: false, width: 250, offsetToEdge: 12, scale: 1 });
    expect([p.delay, p.inMs, p.hold]).toEqual([T.delayMs, T.inMs, T.holdMs]);
    // 262 px at 100 px/s: 2.62 s (a 250 px toast takes about 2.6 s, §1.14).
    expect(p.exit).toBe(262);
    expect(p.enter).toBe(262);
    expect(p.out).toBe(2620);
    // At s = 0.712 the drift is slower in px/s and the distance is the same toast's.
    expect(startToastPlan({ reduced: false, width: 178, offsetToEdge: 8.5, scale: 0.712 }).out).toBe(Math.round((186.5 / (T.exitPxPerSec * 0.712)) * 1000));
    const r = startToastPlan({ reduced: true, width: 250, offsetToEdge: 12, scale: 1 });
    expect([r.inMs, r.hold, r.out, r.exit]).toEqual([cfg.fx.reducedMotionFadeMs, T.reducedHoldMs, cfg.fx.reducedMotionFadeMs, 0]);
  });

  it('shows our honest line and our arm, aria-hidden, one at a time; removed after its time (no WAAPI)', () => {
    vi.useFakeTimers();
    const h = host();
    const toast = createStartToast({ host: h, scale: () => 1, reduced: () => false });
    toast.play('level');
    const el = h.querySelector('.start-toast') as HTMLElement;
    expect(el.dataset.kind).toBe('level');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.start-toast__text')?.textContent).toBe('You can solve this one!');
    expect(el.querySelector('use')?.getAttribute('href')).toBe('#art-flex');
    // Never a statistic.
    expect(el.textContent).not.toMatch(/%|\d/);
    toast.play('retry');
    expect(h.querySelectorAll('.start-toast')).toHaveLength(1);
    expect(toast.current()?.dataset.kind).toBe('retry');
    vi.advanceTimersByTime(T.delayMs + T.inMs + T.holdMs + 60_000);
    expect(h.querySelector('.start-toast')).toBeNull();
    expect(toast.current()).toBeNull();
    toast.destroy();
  });

  it('WAAPI: slides in from beyond the inline start, holds, drifts out the same way (RTL: from and to the right); reduced: opacity only', () => {
    const calls: [Keyframe[], KeyframeAnimationOptions][] = [];
    const animate = vi.fn((frames: Keyframe[], opts: KeyframeAnimationOptions) => {
      calls.push([frames, opts]);
      return { cancel: vi.fn(), onfinish: null } as unknown as Animation;
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true, writable: true });
    // A 200 px toast 12 px from the left edge of a 402 px viewport.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 12, right: 212, width: 200, top: 0, bottom: 29, height: 29, x: 12, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(402);
    try {
      const h = host();
      const toast = createStartToast({ host: h, scale: () => 1, reduced: () => false });
      toast.play('hard');
      const [frames, opts] = calls[0] as [Keyframe[], KeyframeAnimationOptions];
      expect(opts.delay).toBe(T.delayMs);
      expect(opts.duration).toBe(T.inMs + T.holdMs + 2120);
      expect(frames.map((f) => f.transform)).toEqual(['translateX(-212px)', 'none', 'none', 'translateX(-212px)']);
      expect(frames[0]?.easing).toBe('ease-out');
      expect(frames[2]?.easing).toBe('linear');
      document.documentElement.dir = 'rtl';
      toast.play('hard');
      // RTL: its inline start is the right edge, 190 px from the viewport's (402 − 212) and 200 wide.
      expect((calls[1]?.[0] ?? []).map((f) => f.transform)).toEqual(['translateX(390px)', 'none', 'none', 'translateX(390px)']);
      document.documentElement.dir = 'ltr';
      const reduced = createStartToast({ host: h, scale: () => 1, reduced: () => true });
      reduced.play('level');
      const rf = calls[2]?.[0] ?? [];
      expect(rf.map((f) => f.opacity)).toEqual([0, 1, 1, 0]);
      expect(rf.some((f) => f.transform)).toBe(false);
      toast.destroy();
      reduced.destroy();
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
      document.documentElement.removeAttribute('dir');
      vi.restoreAllMocks();
    }
  });

  it('nothing while the host is not in the document (fx.startToast.enabled is checked by the caller and here)', () => {
    expect(T.enabled).toBe(true);
    const detached = document.createElement('div');
    const t = createStartToast({ host: detached, scale: () => 1, reduced: () => false });
    t.play('level');
    expect(detached.querySelector('.start-toast')).toBeNull();
    expect(t.current()).toBeNull();
  });
});
