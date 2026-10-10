// Owner: G3 (Phase 2d.1)
// The points of a cat (helpers-spec §2.5, D-2d1-4): the "+N" one pitch above the tile, the star's start
// under it, the Bézier control point, the landing at starAtMs + 17 + flightMs, the count-up hand-off,
// the burst, cancelling, reduced motion; and the lazy fx chunk's loop. jsdom has no layout: rects are
// given, time is Vitest's fake clock (performance.now and requestAnimationFrame included).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createCelebrate, type CelebrateContext } from '../../../src/ui/fx/celebrate';
import { SPRITE_ID } from '../../../src/ui/art/sprite';
import { SHARD_GRAVITY, shardAt, shardPlan } from '../../../src/ui/fx/cat-burst';
import { createFxLoop, keyed, seeded } from '../../../src/ui/fx/fx-loop';
import {
  bezierAt,
  bezierControl,
  clampCenterX,
  plusAt,
  plusCenter,
  STAR_FROM_PLUS,
  starStart,
  starTimes,
  SPARK_PATH,
  STREAK_MAX,
  streakFor,
} from '../../../src/ui/fx/points-flight';

const rect = (left: number, top: number, w: number, h: number): DOMRect =>
  ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

describe('the "+N" and the star\'s path (helpers-spec §2.5)', () => {
  it('the "+N" is centred one pitch above the tile centre and clamped 3 px inside the viewport', () => {
    // The measured cat (0,8) at 402: tile centre (369.5, 277.2), pitch 42.1 → (369.5, 235.1).
    const c = plusCenter(rect(350, 257.7, 39, 39), 42.1);
    expect(c.x).toBeCloseTo(369.5, 5);
    expect(c.y).toBeCloseTo(235.1, 5);
    // Its outer half-width 31.4: the right edge would pass 402 − 3, so it moves left.
    expect(clampCenterX(369.5, 31.4, 402, 3)).toBeCloseTo(367.6, 5);
    expect(clampCenterX(200, 31.4, 402, 3)).toBe(200);
    expect(clampCenterX(10, 31.4, 402, 3)).toBeCloseTo(34.4, 5);
    // Wider than the viewport: centred.
    expect(clampCenterX(10, 300, 402, 3)).toBe(201);
  });

  it('P0 = the "+N" centre + (−4, +9.5) s; C = (P2.x + (P0.x − P2.x) / 3, P0.y); the curve runs P0 → P2', () => {
    expect(STAR_FROM_PLUS).toEqual({ x: -4, y: 9.5 });
    const p0 = starStart({ x: 367, y: 234.5 }, 1);
    expect(p0).toEqual({ x: 363, y: 244 }); // the critic's re-measure
    expect(starStart({ x: 100, y: 100 }, 0.5)).toEqual({ x: 98, y: 104.75 });
    const p2 = { x: 252.5, y: 95.8 };
    const c = bezierControl(p0, p2);
    expect(c.x).toBeCloseTo(252.5 + (363 - 252.5) / 3, 6); // ≈ 289.3, measured 289
    expect(c.y).toBe(244);
    expect(bezierAt(p0, c, p2, 0)).toEqual(p0);
    expect(bezierAt(p0, c, p2, 1)).toEqual(p2);
    const mid = bezierAt(p0, c, p2, 0.5);
    expect(mid.x).toBeCloseTo(0.25 * 363 + 0.5 * c.x + 0.25 * 252.5, 6);
    // RTL: the bar mirrors and the same formula holds.
    const rtl = bezierControl({ x: 39, y: 244 }, { x: 149.5, y: 95.8 });
    expect(rtl.x).toBeCloseTo(149.5 - 110.5 / 3, 6);
  });

  it('the "+N" pops 0.53 → 1.0 at 83 → 1.15 at 166–216 → 1.0 at 350, opaque by 33, fading from 683 to 0.4 at 900', () => {
    expect(plusAt(0)).toEqual({ scale: 0.53, opacity: 0.44 });
    expect(plusAt(33).opacity).toBe(1);
    expect(plusAt(83).scale).toBe(1);
    expect(plusAt(166).scale).toBe(1.15);
    expect(plusAt(216).scale).toBe(1.15);
    expect(plusAt(350).scale).toBe(1);
    expect(plusAt(683).opacity).toBe(1);
    expect(plusAt(900).opacity).toBeCloseTo(0.4, 6);
  });

  it('the star: born at starAtMs, flies from +17 for flightMs, lands at 1 330', () => {
    expect(starTimes()).toEqual({ born: cfg.fx.points.starAtMs, fly: cfg.fx.points.starAtMs + 17, land: cfg.fx.points.starAtMs + 17 + cfg.fx.points.flightMs });
    expect(starTimes().land).toBe(1330);
  });

  it('the glow streaks along the path while fast: 1 at rest, + speed / s, at most 1.6 (§2.5 "Star look")', () => {
    expect(STREAK_MAX).toBe(1.6);
    expect(streakFor(0, 1)).toBe(1);
    expect(streakFor(0.3, 1)).toBeCloseTo(1.3, 9);
    expect(streakFor(0.3, 0.75)).toBeCloseTo(1.4, 9);
    expect(streakFor(5, 1)).toBe(1.6);
  });
});

describe('the fx loop (lazy chunk)', () => {
  it('the chunk mounts the star\'s and the shards\' symbols into the sprite (requests-G2 H2)', () => {
    const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sprite.id = SPRITE_ID;
    document.body.appendChild(sprite);
    expect(document.getElementById('fx-star4')).toBeNull();
    createCelebrate(document.createElement('div'), {
      cellRect: () => null,
      color: () => 'var(--r0)',
      pitch: () => 42,
      s: () => 1,
      reduced: () => false,
      scoreRect: () => null,
      countTo: () => undefined,
    });
    expect(document.getElementById('fx-star4')).not.toBeNull();
    expect(document.getElementById('fx-shard')).not.toBeNull();
    sprite.remove();
  });

  it('keeps one requestAnimationFrame chain when pieces add pieces during a frame (the trail)', () => {
    // A manual frame queue: a second chain shows as two callbacks waiting for the same frame.
    let q: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      q.push(cb);
      return q.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const loop = createFxLoop(window);
    let adds = 0;
    loop.add({
      delay: 0,
      dur: 500,
      frame: () => {
        adds += 1;
        loop.add({ delay: 0, dur: 50, frame: () => undefined });
      },
    });
    const waiting: number[] = [];
    for (let k = 0; k < 10; k++) {
      vi.advanceTimersByTime(16);
      const run = q;
      q = [];
      for (const cb of run) cb(performance.now());
      waiting.push(q.length);
    }
    expect(adds).toBeGreaterThan(5);
    expect(waiting.every((n) => n === 1)).toBe(true);
    loop.cancel();
    vi.restoreAllMocks();
  });

  it('draws a piece due now in the same call, then every frame by elapsed time; ends it; cancel ends the rest', () => {
    const loop = createFxLoop(window);
    const seen: number[] = [];
    const ends: boolean[] = [];
    loop.add({ delay: 0, dur: 100, frame: (t) => seen.push(Math.round(t)), end: (c) => ends.push(c) });
    expect(seen).toEqual([0]);
    vi.advanceTimersByTime(120);
    expect(seen[seen.length - 1]).toBe(100);
    expect(ends).toEqual([false]);
    let late = 0;
    loop.add({ delay: 50, dur: 100, frame: () => (late += 1), end: (c) => ends.push(c) });
    expect(late).toBe(0);
    vi.advanceTimersByTime(80);
    expect(late).toBeGreaterThan(0);
    loop.cancel();
    expect(ends).toEqual([false, true]);
    expect(loop.size()).toBe(0);
  });

  it('keyed() interpolates piecewise-linearly; seeded() repeats per seed', () => {
    expect(keyed([[0, 0], [100, 1]], 50)).toBe(0.5);
    expect(keyed([[0, 0], [100, 1]], -5)).toBe(0);
    expect(keyed([[0, 0], [100, 1]], 500)).toBe(1);
    const a = seeded(7);
    const b = seeded(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

/** The game screen's side of the chunk: a tile at (350, 257.7) for every cell, s = 1, pitch 42.1. */
const ctx = (over: Partial<CelebrateContext> = {}): CelebrateContext => ({
  cellRect: () => rect(350, 257.7, 39, 39),
  color: () => 'var(--r3)',
  pitch: () => 42.1,
  s: () => 1,
  reduced: () => false,
  scoreRect: () => rect(240, 85, 25, 21),
  countTo: () => undefined,
  ...over,
});

describe('playing POINTS (celebrate.play)', () => {
  const setup = (reduced = false) => {
    const layer = document.createElement('div');
    layer.className = 'game-fx';
    document.body.appendChild(layer);
    const onLand = vi.fn();
    const target = vi.fn(() => rect(240, 85, 25, 21));
    const fx = createCelebrate(layer, ctx({ reduced: () => reduced, scoreRect: target, countTo: onLand }));
    fx.play({ type: 'POINTS', cell: 8, gained: 576, total: 576, streak: 1 });
    return { layer, fx, onLand, target };
  };

  it('the "+N" is aria-hidden SVG text in --plus with a white outline; the star appears at 783 and lands at 1 330 (± 1 frame)', () => {
    const { layer, onLand, target } = setup();
    const plus = layer.querySelector('svg.fx-plus') as SVGSVGElement;
    expect(plus.getAttribute('aria-hidden')).toBe('true');
    const text = plus.querySelector('text') as SVGTextElement;
    expect(text.textContent).toBe('+576');
    expect(text.getAttribute('style')).toContain('fill:var(--plus)');
    expect(text.getAttribute('style')).toContain('stroke:#fff');
    expect(text.getAttribute('paint-order')).toBe('stroke');
    expect(plus.style.transform).toContain('scale(0.53)');
    vi.advanceTimersByTime(770);
    expect(layer.querySelector('.fx-star')).toBeNull();
    vi.advanceTimersByTime(20); // 790: born on the "+N", not flying yet
    expect(layer.querySelector('.fx-star')).not.toBeNull();
    expect(target).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50); // 840: in flight; the target is read once when it takes off
    expect(target).toHaveBeenCalledTimes(1);
    // The trail: fx-star4 sparkles; the glow's tail streaks behind the star along its path.
    const trail = layer.querySelectorAll('svg.fx-spark');
    expect(trail.length).toBeGreaterThan(0);
    expect(trail[0]?.querySelector('path')?.getAttribute('d')).toBe(SPARK_PATH);
    expect(trail[0]?.getAttribute('aria-hidden')).toBe('true');
    expect((layer.querySelector('.fx-star__tail') as HTMLElement).style.transform).toMatch(/rotate\(-?\d+deg\) scaleX\(1(\.\d+)?\)/);
    vi.advanceTimersByTime(1330 - 840 - 20);
    expect(onLand).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(onLand).toHaveBeenCalledWith(576);
    // The star itself is gone; its tail runs on into the number for ≈ 5 frames.
    expect(layer.querySelector('.fx-star__art')).toBeNull();
    expect(layer.querySelector('.fx-star__tail')).not.toBeNull();
    expect(layer.querySelector('.fx-burst')).not.toBeNull();
    expect(layer.querySelectorAll('.fx-burst svg.fx-spark')).toHaveLength(10);
    vi.advanceTimersByTime(100);
    expect(layer.querySelector('.fx-star')).toBeNull();
    expect(layer.querySelector('svg.fx-plus')).toBeNull(); // removed at 916
    vi.advanceTimersByTime(cfg.fx.points.burstMs + 50);
    expect(layer.children.length).toBe(0);
  });

  it('a props render (cancel) ends the "+N" and the star: no landing, nothing left', () => {
    const { layer, fx, onLand } = setup();
    vi.advanceTimersByTime(900);
    fx.cancel();
    expect(layer.children.length).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(onLand).not.toHaveBeenCalled();
    expect(fx.running()).toBe(0);
  });

  it('reduced motion: the "+N" fades in and out in place; no star, no landing (the Score changed at once)', () => {
    const { layer, onLand } = setup(true);
    const plus = layer.querySelector('svg.fx-plus') as SVGSVGElement;
    expect(plus.style.opacity).toBe('0');
    expect(plus.style.transform).toContain('scale(1)');
    vi.advanceTimersByTime(cfg.fx.levelPoints.reducedPlusInMs + 20);
    expect(plus.style.opacity).toBe('1');
    vi.advanceTimersByTime(2000);
    expect(layer.querySelector('.fx-star, .fx-burst, svg.fx-plus')).toBeNull();
    expect(onLand).not.toHaveBeenCalled();
  });
});

describe('the cat burst (celebrate.play(CAT_PLACED), §2.4 screen layer)', () => {
  it('the shards: thrown at 0.3–0.5 px/ms × s, mostly up and sideways, then falling at ≈ 900 px/s² × s; shrink and fade from 430 ms', () => {
    const plan = shardPlan(10, 1, 39, 1);
    expect(plan).toHaveLength(10);
    for (const sh of plan) {
      const v = Math.hypot(sh.vx, sh.vy);
      expect(v).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(v).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(sh.size).toBeGreaterThanOrEqual(9);
      expect(sh.size).toBeLessThanOrEqual(22);
    }
    expect(plan.filter((sh) => sh.vy < 0).length).toBeGreaterThanOrEqual(7);
    const sh = { x: 0, y: 0, vx: 0, vy: 0, size: 10, rot: 0, spin: 0, art: 'fx-shard' as const };
    expect(shardAt(sh, 1000, 1).y).toBeCloseTo(0.5 * SHARD_GRAVITY * 1000 * 1000, 6); // 450 px after 1 s
    expect(SHARD_GRAVITY * 1e6).toBeCloseTo(900, 6);
    expect(shardAt(sh, 430, 1).opacity).toBe(1);
    expect(shardAt(sh, cfg.fx.catPlaced.shardLifeMs, 1).opacity).toBe(0);
    expect(shardPlan(10, 1, 39, 1)).toEqual(plan); // seeded: the same burst for the same cell
  });

  it('10 two-tone shards in the region colour, gone by shardLifeMs; no light or twinkles here (the board draws them, requests-G2 H1)', () => {
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    const fx = createCelebrate(layer, ctx());
    fx.play({ type: 'CAT_PLACED', cell: 8, source: 'kitty' });
    const shards = Array.from(layer.querySelectorAll<SVGSVGElement>('svg.fx-shard'));
    expect(shards).toHaveLength(cfg.fx.catPlaced.shards);
    for (const sh of shards) {
      expect(sh.getAttribute('aria-hidden')).toBe('true');
      expect(sh.style.color).toBe('var(--r3)');
      expect(sh.querySelector('use')?.getAttribute('href')).toMatch(/^#fx-shard(-2|-3)?$/);
    }
    expect(layer.querySelector('.fx-light, .fx-twinkle')).toBeNull();
    expect(layer.children.length).toBe(cfg.fx.catPlaced.shards);
    vi.advanceTimersByTime(cfg.fx.catPlaced.shardLifeMs + 20);
    expect(layer.children.length).toBe(0);
  });
});

describe('which event plays what (CONTRACTS-2d1 §8)', () => {
  it('reduced motion plays no burst; other events play nothing; a tile that is gone plays nothing', () => {
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    createCelebrate(layer, ctx({ reduced: () => true })).play({ type: 'CAT_PLACED', cell: 8, source: 'player' });
    expect(layer.children.length).toBe(0);
    const fx = createCelebrate(layer, ctx({ cellRect: () => null }));
    fx.play({ type: 'POINTS', cell: 8, gained: 96, total: 672, streak: 2 });
    fx.play({ type: 'MARKED', cells: [1, 2] });
    fx.play({ type: 'REGION_DONE', region: 1 });
    expect(layer.children.length).toBe(0);
  });
});
