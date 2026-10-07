// Owner: ui-board. Phase 2 review fixes on the board side: pinch-zoom never shrinks the board (A11Y-2),
// large text grows the rule-chip row (A11Y-6), no forced style recalcs from the viewport probe, the FX
// class restarts or the focus trap (RP-3), and readable colour-pattern glyphs on small slots (A11Y-5).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { focusableElements } from '../../../src/ui/a11y/focus-trap';
import { createFxTimers, flashClass } from '../../../src/ui/board/board-fx';
import { patternScaleFor } from '../../../src/ui/board/board-view';
import { computeLayout, readViewport } from '../../../src/ui/board/layout';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.textContent = '';
});

/** A window whose visualViewport and size the test controls; getComputedStyle is spied. */
function fakeWindow(size: { w: number; h: number; dpr?: number }, vv: { width: number; height: number; scale: number } | null) {
  const gcs = vi.fn(() => ({ paddingTop: '20px', paddingRight: '0px', paddingBottom: '34px', paddingLeft: '0px', fontSize: '32px' }));
  const win = {
    document,
    get innerWidth() {
      return size.w;
    },
    get innerHeight() {
      return size.h;
    },
    get devicePixelRatio() {
      return size.dpr ?? 1;
    },
    visualViewport: vv,
    getComputedStyle: gcs,
  } as unknown as Window;
  return { win, gcs };
}

describe('readViewport (A11Y-2, A11Y-6, RP-3)', () => {
  it('measures the visual viewport at page scale 1, so pinch-zoom does not shrink the board', () => {
    const vv = { width: 390, height: 844, scale: 1 };
    const { win } = fakeWindow({ w: 390, h: 844 }, vv);
    expect(readViewport(win, true)).toMatchObject({ vw: 390, vh: 844 });
    // A 2× pinch: the visual viewport becomes 195 × 422 at scale 2.
    Object.assign(vv, { width: 195, height: 422, scale: 2 });
    expect(readViewport(win)).toMatchObject({ vw: 390, vh: 844 });
    // The on-screen keyboard shrinks the visual viewport at scale 1: followed.
    Object.assign(vv, { width: 390, height: 500, scale: 1 });
    expect(readViewport(win).vh).toBe(500);
  });

  it('reads the safe-area / rem probe once per window size, not on every relayout', () => {
    const size = { w: 390, h: 844 };
    const { win, gcs } = fakeWindow(size, null);
    const first = readViewport(win, true);
    expect(first).toMatchObject({ safeTop: 20, safeBottom: 34, remPx: 32 });
    readViewport(win);
    readViewport(win);
    expect(gcs).toHaveBeenCalledTimes(1);
    size.w = 844; // rotation
    size.h = 390;
    readViewport(win);
    expect(gcs).toHaveBeenCalledTimes(2);
  });
});

describe('computeLayout with large text (A11Y-6)', () => {
  it('grows the rule-chip row with the text scale (room for a third line, at most 2.4×), leaving compact mode alone', () => {
    const base = { vw: 390, vh: 844, safeTop: 0, safeBottom: 0, n: 8 };
    expect(computeLayout(base).chips).toBe(cfg.layout.chips);
    expect(computeLayout({ ...base, textScale: 1 }).chips).toBe(cfg.layout.chips);
    expect(computeLayout({ ...base, textScale: 2 }).chips).toBe(Math.round(cfg.layout.chips * 2.3));
    expect(computeLayout({ ...base, textScale: 3 }).chips).toBe(Math.round(cfg.layout.chips * 2.4));
    expect(computeLayout({ ...base, textScale: 0.5 }).chips).toBe(cfg.layout.chips);
    // 200 % text on the reference phone: the board keeps its full width.
    expect(computeLayout({ ...base, textScale: 2 }).board).toBe(computeLayout(base).board);
    const compact = computeLayout({ ...base, vh: 568, textScale: 2 });
    expect(compact.compact).toBe(true);
    expect(compact.chips).toBe(cfg.layout.compactChips); // icons only: no taller row
  });
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
