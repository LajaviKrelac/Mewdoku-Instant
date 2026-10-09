// Owner: B. The win flow's fish (phase2b §2.3, §2.13): source rows, the path's control point, the
// size clamp, the fx layer, the schedule (pop, flight, arrival), cleanup, cancel / finish, reduced motion.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import {
  easeFishFlight,
  ensureFxLayer,
  fishControlPoint,
  fishPose,
  fishSizePx,
  fishSourceRows,
  flightKeyframes,
  flyFish,
  quadPoint,
} from '../../../src/ui/fx/fish-flight';

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

const rect = (x: number, y: number, w = 40, h = 40): DOMRect => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON: () => ({}) }) as DOMRect;
const W = cfg.fx.win;

describe('fishSourceRows (§2.3)', () => {
  it('picks floor((n−1)/4), floor((n−1)/2), floor(3(n−1)/4); rows 0, 1, 2 on the 4×4 tutorial', () => {
    expect(fishSourceRows(4)).toEqual([0, 1, 2]);
    expect(fishSourceRows(5)).toEqual([1, 2, 3]);
    expect(fishSourceRows(8)).toEqual([1, 3, 5]);
    expect(fishSourceRows(9)).toEqual([2, 4, 6]);
    expect(fishSourceRows(12)).toEqual([2, 5, 8]);
    for (let n = 4; n <= 12; n++) {
      const [a, b, c] = fishSourceRows(n);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
      expect(c).toBeLessThan(n);
    }
  });
});

describe('fishControlPoint (§2.3)', () => {
  it('lifts the midpoint perpendicular toward the top by 0.35 × |ST|, spread −10 %, 0, +10 % per fish', () => {
    const s = { x: 100, y: 500 };
    const t = { x: 100 + 300, y: 100 };
    const len = Math.hypot(300, -400);
    const mid = { x: 250, y: 300 };
    for (const [i, k] of [
      [0, 1 - W.fishArcSpread],
      [1, 1],
      [2, 1 + W.fishArcSpread],
    ] as const) {
      const c = fishControlPoint(s, t, i);
      const d = Math.hypot(c.x - mid.x, c.y - mid.y);
      expect(d).toBeCloseTo(W.fishArcLift * len * k, 6);
      // Perpendicular to S→T, and toward the top of the screen.
      expect((c.x - mid.x) * (t.x - s.x) + (c.y - mid.y) * (t.y - s.y)).toBeCloseTo(0, 6);
      expect(c.y).toBeLessThan(mid.y);
    }
    // Deterministic per index.
    expect(fishControlPoint(s, t, 2)).toEqual(fishControlPoint(s, t, 2));
  });

  it('a vertical path bows to the right; a zero-length path stays put', () => {
    const c = fishControlPoint({ x: 50, y: 400 }, { x: 50, y: 100 }, 1);
    expect(c.x).toBeGreaterThan(50);
    expect(c.y).toBeCloseTo(250, 6);
    expect(fishControlPoint({ x: 5, y: 5 }, { x: 5, y: 5 }, 0)).toEqual({ x: 5, y: 5 });
  });
});

describe('fish geometry helpers', () => {
  it('fishSizePx: 0.5 × slot, clamped to 22…36', () => {
    expect(fishSizePx(20)).toBe(W.fishMinPx);
    expect(fishSizePx(60)).toBe(30);
    expect(fishSizePx(200)).toBe(W.fishMaxPx);
    expect(fishSizePx(Number.NaN)).toBe(W.fishMinPx);
  });

  it('the flight easing is cubic-bezier(.45,0,.25,1): fixed ends, monotone, slow start', () => {
    expect(easeFishFlight(0)).toBe(0);
    expect(easeFishFlight(1)).toBe(1);
    let prev = 0;
    for (let u = 0.05; u < 1; u += 0.05) {
      const v = easeFishFlight(u);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeFishFlight(0.2)).toBeLessThan(0.2);
    // Independent check: at curve parameter s = 0.655, x ≈ 0.5 and y ≈ 0.725.
    const s = 0.655;
    const x = 3 * (1 - s) ** 2 * s * 0.45 + 3 * (1 - s) * s * s * 0.25 + s ** 3;
    const y = 3 * (1 - s) * s * s + s ** 3;
    expect(easeFishFlight(x)).toBeCloseTo(y, 3);
  });

  it('flightKeyframes: fishPathSamples frames from S to T, shrinking to fishEndScale, tilt capped', () => {
    const s = { x: 60, y: 600 };
    const t = { x: 200, y: 80 };
    const frames = flightKeyframes(s, t, 0);
    expect(frames).toHaveLength(W.fishPathSamples);
    expect(frames[0]?.offset).toBe(0);
    expect(frames[frames.length - 1]?.offset).toBe(1);
    expect(frames[0]?.transform).toMatch(/^translate\(0\.00px, 0\.00px\) rotate\(-?\d+(\.\d)?deg\) scale\(1\.000\)$/);
    expect(frames[frames.length - 1]?.transform).toContain(`translate(${(t.x - s.x).toFixed(2)}px, ${(t.y - s.y).toFixed(2)}px)`);
    expect(frames[frames.length - 1]?.transform).toContain(`scale(${W.fishEndScale.toFixed(3)})`);
    for (const f of frames) {
      const deg = Number(/rotate\((-?[\d.]+)deg\)/.exec(f.transform)?.[1]);
      expect(Math.abs(deg)).toBeLessThanOrEqual(70);
    }
    // The path passes through the Bézier's midpoint at p = 0.5.
    const ctrl = fishControlPoint(s, t, 0);
    const m = quadPoint(s, ctrl, t, 0.5);
    expect(m.x).toBeCloseTo((s.x + 2 * ctrl.x + t.x) / 4, 6);
    // A fish swimming left is not upside down.
    expect(fishPose(-1, { x: -10, y: 0 })).toBeCloseTo(0, 9);
    expect(fishPose(1, { x: 0, y: -10 })).toBe(-70);
  });

  it('ensureFxLayer creates one layer under the root and reuses it', () => {
    const root = document.createElement('div');
    const a = ensureFxLayer(root);
    const b = ensureFxLayer(root);
    expect(a).toBe(b);
    expect(a.className).toBe('fx-layer');
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelectorAll('.fx-layer')).toHaveLength(1);
  });
});

describe('flyFish (§2.2 schedule)', () => {
  const sources = [rect(40, 500), rect(120, 560), rect(200, 620)];
  const target = rect(180, 60, 32, 32);

  it('pops each fish k × fishStaggerMs after the call and lands it hold + flight later, in order', async () => {
    vi.useFakeTimers();
    const layer = ensureFxLayer(document.body);
    const popped: [number, number][] = [];
    const arrived: [number, number][] = [];
    const t0 = Date.now();
    const h = flyFish(layer, sources, target, {
      sizePx: 24,
      reduced: false,
      onPop: (i) => popped.push([i, Date.now() - t0]),
      onArrive: (i) => arrived.push([i, Date.now() - t0]),
    });
    vi.advanceTimersByTime(0);
    expect(layer.querySelectorAll('.fx-fish')).toHaveLength(1);
    const fish = layer.querySelector<HTMLElement>('.fx-fish');
    expect(fish?.style.width).toBe('24px');
    expect(fish?.querySelector('use')?.getAttribute('href')).toBe('#icon-fish');
    expect(fish?.dataset.dir).toBe('r');
    vi.advanceTimersByTime(3000);
    const pops = [0, 1, 2].map((k) => k * W.fishStaggerMs);
    expect(popped).toEqual(pops.map((ms, k) => [k, ms]));
    // §2.2: arrivals at 2 250 / 2 400 / 2 550 when the call is at 1 200.
    expect(arrived).toEqual(pops.map((ms, k) => [k, ms + W.fishHoldMs + W.fishFlightMs]));
    expect(arrived.map(([, ms]) => ms + W.fishAtMs)).toEqual([2250, 2400, 2550]);
    // Everything is cleaned up: fish and trail dots.
    expect(layer.children).toHaveLength(0);
    await expect(h.done).resolves.toBeUndefined();
  });

  it('leaves fishTrailDots sparkle dots per fish during the flight, each removed after fishTrailMs', () => {
    vi.useFakeTimers();
    const layer = ensureFxLayer(document.body);
    flyFish(layer, sources.slice(0, 1), target, { sizePx: 24, reduced: false });
    vi.advanceTimersByTime(W.fishHoldMs + W.fishFlightMs / 2);
    const mid = layer.querySelectorAll('.fx-dot').length;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThanOrEqual(W.fishTrailDots);
    vi.advanceTimersByTime(W.fishFlightMs);
    expect(layer.querySelectorAll('.fx-dot')).toHaveLength(0);
    let max = 0;
    const seen = new Set<Element>();
    flyFish(layer, sources.slice(0, 1), target, { sizePx: 24, reduced: false });
    for (let t = 0; t < W.fishHoldMs + W.fishFlightMs + W.fishTrailMs + 50; t += 10) {
      vi.advanceTimersByTime(10);
      layer.querySelectorAll('.fx-dot').forEach((d) => seen.add(d));
      max = Math.max(max, layer.querySelectorAll('.fx-dot').length);
    }
    expect(seen.size).toBe(W.fishTrailDots);
  });

  it('cancel() removes every node at once and runs no further callbacks (teardown)', async () => {
    vi.useFakeTimers();
    const layer = ensureFxLayer(document.body);
    const onArrive = vi.fn();
    const h = flyFish(layer, sources, target, { sizePx: 24, reduced: false, onArrive });
    vi.advanceTimersByTime(W.fishHoldMs + 100);
    expect(layer.children.length).toBeGreaterThan(0);
    h.cancel();
    expect(layer.children).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    expect(onArrive).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await expect(h.done).resolves.toBeUndefined();
  });

  it('finish() lands the remaining fish at once, in order, and empties the layer (hidden page)', async () => {
    vi.useFakeTimers();
    const layer = ensureFxLayer(document.body);
    const arrived: number[] = [];
    const h = flyFish(layer, sources, target, { sizePx: 24, reduced: false, onArrive: (i) => arrived.push(i) });
    vi.advanceTimersByTime(W.fishHoldMs + W.fishFlightMs + 10); // fish 0 has landed
    expect(arrived).toEqual([0]);
    h.finish();
    expect(arrived).toEqual([0, 1, 2]);
    expect(layer.children).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    expect(arrived).toEqual([0, 1, 2]); // never twice
    await expect(h.done).resolves.toBeUndefined();
  });

  it('reduced motion: no flight, no nodes; every arrival runs at once, in order', async () => {
    const layer = ensureFxLayer(document.body);
    const arrived: number[] = [];
    const onPop = vi.fn();
    const h = flyFish(layer, sources, target, { sizePx: 24, reduced: true, onArrive: (i) => arrived.push(i), onPop });
    expect(arrived).toEqual([0, 1, 2]);
    expect(onPop).not.toHaveBeenCalled();
    expect(layer.children).toHaveLength(0);
    await expect(h.done).resolves.toBeUndefined();
  });

  it('uses WAAPI on transform and opacity only when it exists', () => {
    vi.useFakeTimers();
    const layer = ensureFxLayer(document.body);
    const calls: Keyframe[][] = [];
    const proto = HTMLElement.prototype as unknown as { animate?: unknown };
    const had = 'animate' in proto;
    proto.animate = function (frames: Keyframe[]) {
      calls.push(frames);
      return { cancel: () => undefined, finish: () => undefined } as unknown as Animation;
    };
    try {
      flyFish(layer, sources.slice(0, 1), target, { sizePx: 24, reduced: false });
      vi.advanceTimersByTime(W.fishHoldMs + W.fishFlightMs + W.fishTrailMs + 50);
    } finally {
      if (!had) delete proto.animate;
    }
    expect(calls.length).toBeGreaterThanOrEqual(2 + W.fishTrailDots); // pop, flight, trail dots
    for (const frames of calls) for (const f of frames) for (const k of Object.keys(f)) expect(['transform', 'opacity', 'offset', 'easing']).toContain(k);
    expect(calls[1]).toHaveLength(W.fishPathSamples);
  });
});
