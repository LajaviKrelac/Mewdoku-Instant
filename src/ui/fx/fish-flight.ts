// Owner: B
// The win flow's fish (phase2b §2.2 t = 1 200 … 2 550, §2.3): three of our fish pop at their source
// cats, hold, then fly along a quadratic Bézier to the HUD fish pill, turning along the path,
// shrinking to fx.win.fishEndScale and leaving fishTrailDots sparkle dots. WAAPI on transform and
// opacity only; the path is sampled at fx.win.fishPathSamples keyframes. Fish are
// `<svg><use href="#icon-fish">` in the fixed `.fx-layer` (z-index 30: above the screen, below overlays).
// C's win-flow schedules the call (t = fx.win.fishAtMs) and bumps the pill from onArrive.
// F0 stub: signatures final; bodies are B's.
import { cfg, type GameConfig } from '../../app/config';

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
  /** Fish element size in CSS px: fishSizePx(slot). */
  readonly sizePx: number;
  /** Reduced motion (§2.7): no flight; callbacks run at once in order. */
  readonly reduced: boolean;
  /** Fish `index` (0-based, in source order) reached the pill: C bumps the count and plays the plink. */
  readonly onArrive?: (index: number) => void;
}

/**
 * Flies one fish per `from` rect (source cat cells, in order) to the centre of `to` (the pill icon,
 * GameScreen.fishRect()). Fish k pops at k × fishStaggerMs after the call (fishPopMs), holds
 * fishHoldMs, then flies fishFlightMs with cubic-bezier(.45,0,.25,1).
 */
export function flyFish(layer: HTMLElement, from: readonly DOMRect[], to: DOMRect, opts: FlyFishOptions, c: GameConfig = cfg): FxHandle {
  void layer;
  void from;
  void to;
  void opts;
  void c;
  throw new Error('not implemented: flyFish (B, phase2b §2.3)');
}

/**
 * Source rows for the three fish (§2.3): floor((n−1)/4), floor((n−1)/2), floor(3(n−1)/4); on the
 * 4×4 tutorial this gives rows 0, 1, 2. The source cat is that row's solution cell.
 */
export function fishSourceRows(n: number): readonly [number, number, number] {
  void n;
  throw new Error('not implemented: fishSourceRows (B, phase2b §2.3)');
}

/**
 * Bézier control point (§2.3): the midpoint of S→T lifted perpendicular, toward the top of the
 * screen, by fishArcLift × |ST| × (1 + spread), spread = −fishArcSpread, 0, +fishArcSpread for fish 0, 1, 2.
 */
export function fishControlPoint(s: Point, t: Point, index: number, c: GameConfig = cfg): Point {
  void s;
  void t;
  void index;
  void c;
  throw new Error('not implemented: fishControlPoint (B, phase2b §2.3)');
}

/** fishSizeFraction × slot, clamped to fishMinPx…fishMaxPx (§2.3). */
export function fishSizePx(slotPx: number, c: GameConfig = cfg): number {
  void slotPx;
  void c;
  throw new Error('not implemented: fishSizePx (B, phase2b §2.3)');
}

/** The one `.fx-layer` element under `root` (the app root), created on first use. */
export function ensureFxLayer(root: HTMLElement): HTMLElement {
  void root;
  throw new Error('not implemented: ensureFxLayer (B, phase2b §2.3)');
}
