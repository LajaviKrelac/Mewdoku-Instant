// Owner: B (Phase 2b); G2 (Phase 2c: the kept lives fly from the lives pill to the period counter)
// The win flow's fish (phase2b §2.2 t = 1 200 … 2 550, §2.3): our fish pop at their sources, hold,
// then fly along a quadratic Bézier to the HUD counter, turning along the path,
// shrinking to fx.win.fishEndScale and leaving fishTrailDots sparkle dots. WAAPI on transform and
// opacity only; the path is sampled at fx.win.fishPathSamples keyframes. Fish are
// `<svg><use href="#icon-fish">` in the fixed `.fx-layer` (z-index 30: above the screen, below overlays).
// C's win-flow schedules the call (t = fx.win.fishAtMs) and bumps the pill from onArrive.
// Phase 2c (fish-lives-spec §2.3): the sources are the full life icons (GameScreen.lifeSlots(), N =
// 1…maxHearts fish), the target the period counter's icon; the fish start at the life icon's size
// (fishSizeFromRect) and at scale 1 (FlyFishOptions.startScale: they are already visible as lives, so
// the pop is 1 → 1.15 → 1); the arc spread depends on N (0 for one fish, ±fishArcSpread / 2 for two,
// −1 / 0 / +1 × fishArcSpread for three, evenly spaced for more).
//
// Timing (from the call, fish k = 0, 1, 2):
//   pop     k × fishStaggerMs                      scale 0 → 1.15 → 1 over fishPopMs (onPop(k))
//   flight  k × fishStaggerMs + fishHoldMs          fishFlightMs, cubic-bezier(.45,0,.25,1)
//   arrive  k × fishStaggerMs + fishHoldMs + fishFlightMs   the node is removed, onArrive(k)
// The schedule runs on timers (the source of truth: arrivals happen even without WAAPI, as in jsdom);
// WAAPI only draws. The easing is applied in JS when the path is sampled, so the keyframes are
// evenly spaced in time and interpolated linearly.
//
// Classes (styled in src/styles/fx.css): .fx-layer > .fx-fish[data-dir=l|r] > svg.icon-fish ; .fx-dot
import { cfg, type GameConfig } from '../../app/config';
import { icon } from '../art/sprite';

/** A point in client (viewport) coordinates. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A running effect: `done` resolves (never rejects) when it ends, is cancelled or is finished. */
export interface FxHandle {
  readonly done: Promise<void>;
  /** Stops at once and removes every node it added (teardown, §2.2 "Interruptions"). */
  cancel(): void;
  /** Jumps to the end state and runs the remaining callbacks in order (page was hidden, §2.2). */
  finish(): void;
}

export interface FlyFishOptions {
  /** Fish element size in CSS px: fishSizeFromRect(lifeRect) (Phase 2c §2.3). */
  readonly sizePx: number;
  /**
   * Phase 2c §2.3: the scale the pop starts from (pop: startScale → 1.15 → 1). Default 0 (the 2b
   * pop from nothing); 2c passes 1, since the fish is already visible as a life.
   */
  readonly startScale?: number;
  /** Reduced motion (§2.7): no flight; callbacks run at once in order. */
  readonly reduced: boolean;
  /** Fish `index` (0-based, in source order) reached the pill: C bumps the count and plays the plink. */
  readonly onArrive?: (index: number) => void;
  /**
   * Fish `index` popped at its cat (§2.2 "a soft bloop tick"): C plays sfx 'fish_pop'. Optional
   * (phase2b B addition). Not called with reduced motion (there is no pop).
   */
  readonly onPop?: (index: number) => void;
}

/** Overshoot of the pop (§2.2: scale 0 → 1.15 → 1). CSS-style constant (§0.4). */
const POP_OVERSHOOT = 1.15;
/** The pop's peak sits at this fraction of fishPopMs. */
const POP_PEAK_AT = 0.6;
/** Largest tilt of a fish along its path; beyond it the fish would swim upside down. */
const MAX_TILT_DEG = 70;
/** The flight easing (§2.2). */
const FLIGHT_EASE: readonly [number, number, number, number] = [0.45, 0, 0.25, 1];

/**
 * Spread factor of fish `index` among `count` fish (2c §2.3), in units of fishArcSpread:
 * (index − (count − 1) / 2) / max(1, (count − 1) / 2). One fish: 0; two: ±½; three: −1, 0, +1 (2b);
 * more: evenly spaced from −1 to +1. The 2b default count is 3.
 */
export function fishSpread(index: number, count = 3): number {
  const n = Math.max(1, Math.floor(count));
  const mid = (n - 1) / 2;
  const v = (index - mid) / Math.max(1, mid);
  return Math.max(-1, Math.min(1, v));
}

/**
 * Bézier control point (§2.3): the midpoint of S→T lifted perpendicular, toward the top of the
 * screen, by fishArcLift × |ST| × (1 + fishSpread(index, count) × fishArcSpread): for three fish
 * −fishArcSpread, 0, +fishArcSpread (2b), for two ±fishArcSpread / 2, for one 0 (2c).
 * A vertical S→T has no "up" side: it bows toward +x (screen right).
 */
export function fishControlPoint(s: Point, t: Point, index: number, c: GameConfig = cfg, count = 3): Point {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy);
  const mid = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
  if (len === 0) return mid;
  // One of the two unit normals; flip it to point up (negative y), or right on a tie.
  let px = dy / len;
  let py = -dx / len;
  if (py > 0 || (py === 0 && px < 0)) {
    px = -px;
    py = -py;
  }
  const W = c.fx.win;
  const lift = W.fishArcLift * len * (1 + fishSpread(index, count) * W.fishArcSpread);
  return { x: mid.x + px * lift, y: mid.y + py * lift };
}

/**
 * Phase 2c §2.3: the flying fish's size from its source life icon, clamp(round(width), fishMinPx,
 * fishMaxPx), so it lifts off at the size it had in the lives pill (28 px; compact 23 → fishMinPx).
 */
export function fishSizeFromRect(rect: Pick<DOMRect, 'width'> | null | undefined, c: GameConfig = cfg): number {
  const W = c.fx.win;
  const w = rect && Number.isFinite(rect.width) ? Math.round(rect.width) : W.fishMinPx;
  return Math.min(W.fishMaxPx, Math.max(W.fishMinPx, w));
}

/** The one `.fx-layer` element under `root` (the app root), created on first use. */
export function ensureFxLayer(root: HTMLElement): HTMLElement {
  for (const child of Array.from(root.children)) {
    if (child.classList.contains('fx-layer')) return child as HTMLElement;
  }
  const layer = root.ownerDocument.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  root.appendChild(layer);
  return layer;
}

// ─────────────────────────────── geometry helpers (exported for tests) ───────────────────────────────

/** Point on the quadratic Bézier S–C–T at parameter p ∈ [0, 1]. */
export function quadPoint(s: Point, ctrl: Point, t: Point, p: number): Point {
  const q = 1 - p;
  return { x: q * q * s.x + 2 * q * p * ctrl.x + p * p * t.x, y: q * q * s.y + 2 * q * p * ctrl.y + p * p * t.y };
}

/** Derivative (direction of travel) of the quadratic Bézier at p. */
export function quadTangent(s: Point, ctrl: Point, t: Point, p: number): Point {
  return { x: 2 * (1 - p) * (ctrl.x - s.x) + 2 * p * (t.x - ctrl.x), y: 2 * (1 - p) * (ctrl.y - s.y) + 2 * p * (t.y - ctrl.y) };
}

/**
 * CSS cubic-bezier(x1, y1, x2, y2) as a function of time u ∈ [0, 1] (Newton steps, then bisection),
 * so a path sampled at evenly spaced times moves with the same easing as a CSS animation.
 */
export function cubicBezierEase(x1: number, y1: number, x2: number, y2: number): (u: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (s: number): number => ((ax * s + bx) * s + cx) * s;
  const sy = (s: number): number => ((ay * s + by) * s + cy) * s;
  const dsx = (s: number): number => (3 * ax * s + 2 * bx) * s + cx;
  return (u: number): number => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let s = u;
    for (let k = 0; k < 8; k++) {
      const err = sx(s) - u;
      if (Math.abs(err) < 1e-6) return sy(s);
      const d = dsx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = u;
    for (let k = 0; k < 40; k++) {
      const x = sx(s);
      if (Math.abs(x - u) < 1e-6) break;
      if (x < u) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sy(s);
  };
}

/** The flight easing, cubic-bezier(.45, 0, .25, 1) (§2.2). */
export const easeFishFlight = cubicBezierEase(...FLIGHT_EASE);

/** Facing (1 = right, −1 = left: the symbol faces right) and tilt in degrees for a velocity. */
export function fishPose(dir: 1 | -1, v: Point): number {
  if (v.x === 0 && v.y === 0) return 0;
  const deg = (Math.atan2(dir * v.y, dir * v.x) * 180) / Math.PI;
  return Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, deg));
}

export interface FlightKeyframe {
  readonly offset: number;
  readonly transform: string;
}

/**
 * The flight keyframes for one fish (§2.3): `samples` evenly spaced in time, positions eased with
 * cubic-bezier(.45,0,.25,1), translate relative to S, tilt along the path, scale 1 → fishEndScale.
 */
export function flightKeyframes(s: Point, t: Point, index: number, c: GameConfig = cfg, count = 3): FlightKeyframe[] {
  const W = c.fx.win;
  const ctrl = fishControlPoint(s, t, index, c, count);
  const dir: 1 | -1 = t.x >= s.x ? 1 : -1;
  const samples = Math.max(2, Math.round(W.fishPathSamples));
  const frames: FlightKeyframe[] = [];
  for (let j = 0; j < samples; j++) {
    const u = j / (samples - 1);
    const p = easeFishFlight(u);
    const pos = quadPoint(s, ctrl, t, p);
    const tilt = fishPose(dir, quadTangent(s, ctrl, t, p));
    const scale = 1 + (W.fishEndScale - 1) * p;
    frames.push({
      offset: u,
      transform: `translate(${(pos.x - s.x).toFixed(2)}px, ${(pos.y - s.y).toFixed(2)}px) rotate(${tilt.toFixed(1)}deg) scale(${scale.toFixed(3)})`,
    });
  }
  return frames;
}

const centre = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

const canAnimate = (el: Element): boolean => typeof (el as HTMLElement).animate === 'function';

/** Starts a WAAPI animation; null when WAAPI is missing or throws. */
function animate(el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!canAnimate(el)) return null;
  try {
    return el.animate(frames, opts);
  } catch {
    return null;
  }
}

/**
 * Flies one fish per `from` rect (2c: the full life icons in departure order, GameScreen.lifeSlots();
 * 2b: source cat cells) to the centre of `to` (2c: GameScreen.periodRect()). Fish k pops at
 * k × fishStaggerMs after the call (fishPopMs, from opts.startScale), holds fishHoldMs, then flies
 * fishFlightMs with cubic-bezier(.45,0,.25,1). The arc spread depends on from.length (fishSpread).
 */
export function flyFish(layer: HTMLElement, from: readonly DOMRect[], to: DOMRect, opts: FlyFishOptions, c: GameConfig = cfg): FxHandle {
  const W = c.fx.win;
  const count = from.length;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  if (opts.reduced || count === 0) {
    // §2.7: no flight; the pill counts up at once.
    for (let k = 0; k < count; k++) opts.onArrive?.(k);
    resolveDone();
    return { done, cancel: () => undefined, finish: () => undefined };
  }

  const doc = layer.ownerDocument;
  const target = centre(to);
  const size = opts.sizePx;
  const startScale = Number.isFinite(opts.startScale) ? Math.max(0, opts.startScale as number) : 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const nodes = new Set<HTMLElement>();
  const anims = new Set<Animation>();
  const arrived = new Array<boolean>(count).fill(false);
  let ended = false;

  const later = (ms: number, fn: () => void): void => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, Math.max(0, ms));
    timers.add(id);
  };
  const play = (el: HTMLElement, frames: Keyframe[], o: KeyframeAnimationOptions): void => {
    const a = animate(el, frames, o);
    if (a) anims.add(a);
  };
  const remove = (el: HTMLElement): void => {
    nodes.delete(el);
    el.parentNode?.removeChild(el);
  };
  const end = (): void => {
    if (ended) return;
    ended = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const a of anims) {
      try {
        a.cancel();
      } catch {
        // already gone
      }
    }
    anims.clear();
    for (const el of Array.from(nodes)) remove(el);
    resolveDone();
  };
  const arrive = (k: number): void => {
    if (arrived[k]) return;
    arrived[k] = true;
    opts.onArrive?.(k);
  };

  let lastEndMs = 0;
  from.forEach((rect, k) => {
    const s = centre(rect);
    const popAt = k * W.fishStaggerMs;
    const flyAt = popAt + W.fishHoldMs;
    const arriveAt = flyAt + W.fishFlightMs;
    lastEndMs = Math.max(lastEndMs, arriveAt + W.fishTrailMs);

    const fish = doc.createElement('div');
    fish.className = 'fx-fish';
    fish.dataset.dir = target.x >= s.x ? 'r' : 'l';
    fish.style.left = `${s.x.toFixed(1)}px`;
    fish.style.top = `${s.y.toFixed(1)}px`;
    fish.style.width = `${size}px`;
    fish.style.height = `${size}px`;
    fish.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    // Without WAAPI the node shows at its start scale (the CSS default is scale(0), the 2b pop).
    if (startScale > 0) fish.style.transform = `scale(${startScale})`;
    fish.appendChild(icon('icon-fish', { class: 'fx-fish__icon' }));

    later(popAt, () => {
      layer.appendChild(fish);
      nodes.add(fish);
      play(fish, [{ transform: `scale(${startScale})` }, { transform: `scale(${POP_OVERSHOOT})`, offset: POP_PEAK_AT }, { transform: 'scale(1)' }], {
        duration: W.fishPopMs,
        easing: 'ease-out',
        fill: 'both',
      });
      opts.onPop?.(k);
    });

    later(flyAt, () => {
      play(fish, flightKeyframes(s, target, k, c, count) as unknown as Keyframe[], { duration: W.fishFlightMs, easing: 'linear', fill: 'forwards' });
      const ctrl = fishControlPoint(s, target, k, c, count);
      const dots = Math.max(0, Math.round(W.fishTrailDots));
      for (let j = 0; j < dots; j++) {
        const u = (j + 1) / (dots + 1);
        later(u * W.fishFlightMs, () => {
          const p = quadPoint(s, ctrl, target, easeFishFlight(u));
          const dot = doc.createElement('div');
          dot.className = 'fx-dot';
          dot.style.left = `${p.x.toFixed(1)}px`;
          dot.style.top = `${p.y.toFixed(1)}px`;
          layer.appendChild(dot);
          nodes.add(dot);
          play(dot, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.2)' }], { duration: W.fishTrailMs, easing: 'ease-out', fill: 'forwards' });
          later(W.fishTrailMs, () => remove(dot));
        });
      }
    });

    later(arriveAt, () => {
      remove(fish);
      arrive(k);
    });
  });
  later(lastEndMs, end);

  return {
    done,
    cancel: end,
    finish() {
      if (ended) return;
      for (let k = 0; k < count; k++) arrive(k);
      end();
    },
  };
}
