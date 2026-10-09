// Owner: B. Phase 2 review fixes on B's side: no forced style recalcs from the FX class restarts or the
// focus trap (RP-3), and readable colour-pattern glyphs on small slots (A11Y-5).
// phase2b F0 split: the readViewport and computeLayout cases (A11Y-2, A11Y-6, RP-3) moved to layout.spec.ts (A).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { focusableElements } from '../../../src/ui/a11y/focus-trap';
import { createFxTimers, flashClass } from '../../../src/ui/board/board-fx';
import { patternScaleFor } from '../../../src/ui/board/board-view';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.textContent = '';
});

describe('flashClass never forces a reflow (RP-3)', () => {
  it('adds a new class without reading layout and removes it after the time', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    const reads = vi.fn(() => 0);
    Object.defineProperty(el, 'offsetWidth', { get: reads });
    const timers = createFxTimers();
    flashClass(el, 'fx-draw', 100, timers);
    expect(el.classList.contains('fx-draw')).toBe(true);
    expect(reads).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(el.classList.contains('fx-draw')).toBe(false);
  });

  it('restarts a running flash two frames later, and the older timer does not cut the new one short', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    const timers = createFxTimers();
    flashClass(el, 'fx-pulse', 100, timers);
    vi.advanceTimersByTime(60);
    flashClass(el, 'fx-pulse', 100, timers);
    expect(el.classList.contains('fx-pulse')).toBe(false); // off for one style update
    vi.advanceTimersByTime(40); // the first flash's timer fires: it must not remove the second
    expect(el.classList.contains('fx-pulse')).toBe(true);
    vi.advanceTimersByTime(60);
    expect(el.classList.contains('fx-pulse')).toBe(false);
  });
});

describe('focusableElements reads no computed style (RP-3)', () => {
  it('uses attributes and inline styles only', () => {
    const spy = vi.spyOn(window, 'getComputedStyle');
    const box = document.createElement('div');
    box.innerHTML =
      '<button id="a">a</button><button id="b" style="display:none">b</button><div style="visibility:hidden"><button id="c">c</button></div>' +
      '<div inert><button id="d">d</button></div><button id="e">e</button>';
    document.body.append(box);
    expect(focusableElements(box).map((e) => e.id)).toEqual(['a', 'e']);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('colour-pattern glyphs on small slots (A11Y-5, UX-13)', () => {
  it('scales the 22 % glyph up to layout.patternMinPx on 11×11 / 12×12 phone slots, never above 1.6×', () => {
    expect(patternScaleFor(41)).toBe(1); // 8×8 at 390: 9 px glyph box
    const k22 = patternScaleFor(22); // 12×12 at 320
    expect(k22 * cfg.layout.patternScale * 22).toBeCloseTo(cfg.layout.patternMinPx, 5);
    expect(patternScaleFor(8)).toBe(1.6);
    expect(patternScaleFor(0)).toBe(1);
  });
});
