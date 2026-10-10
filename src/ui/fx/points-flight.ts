// Owner: G3 (Phase 2d.1)
// The points of a placed cat (helpers-spec §2.5, D-2d1-4; measured on the user's v2 recording, drawn by
// us): an orange "+N" with a white outline pops one pitch above the cat's tile; at fx.points.starAtMs a
// yellow four-point star (G2's fx-star4) is born on its baseline, then flies to the Score on a quadratic
// Bézier (parameter linear in time over fx.points.flightMs) leaving a trail of small sparkles; it lands
// as a burst of sparkles with a warm glow around the number, and the game bar counts up (onLand). All
// of it is aria-hidden; the number and its announcement take the total at once elsewhere.
// Reduced motion: the "+N" fades in and out in place (fx.levelPoints.reducedPlusInMs / OutMs), nothing
// else; the Score changed at once.
// Lazy fx chunk (fx/celebrate.ts). Classes: .game-fx > svg.fx-plus, .fx-star (> .fx-star__glow +
// svg), .fx-dot (trail), .fx-burst (> .fx-burst__glow, .fx-dot).
import { cfg, type GameConfig } from '../../app/config';
import { fxEl, fxText, fxUse, keyed, seeded, type FxLoop } from './fx-loop';

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** The star's birth point relative to the "+N" centre, s-units (critic re-measure: (363, 244) under (367, 234.5)). */
export const STAR_FROM_PLUS: Pt = { x: -4, y: 9.5 };
/** The "+N" digit height 18.3 s → our display face at 26 s px (cap ≈ 0.7 em). */
export const PLUS_FONT = 26;
/** Its white outline: a 4 s stroke under the fill (paint-order), 2 s outside it. */
export const PLUS_STROKE = 4;
/** The "+N" keeps this far inside the viewport (measured: 3 px from the right edge). */
export const PLUS_MARGIN = 3;
/** The star's full size (s px) and its glow (1.5×). */
export const STAR_SIZE = 22;

/** "+N" scale keyframes [ms, scale] (v2: 0.53 → 1.0 at 83 → 1.15 at 166–216 → 1.0 at 350). */
const PLUS_SCALE: readonly (readonly [number, number])[] = [
  [0, 0.53],
  [33, 0.76],
  [83, 1],
  [133, 1.12],
  [166, 1.15],
  [216, 1.15],
  [283, 1.05],
  [350, 1],
];
/** "+N" opacity: 0.44 → 1 by 33; fades from 683 to 0.4 at 900; removed at 916. */
const PLUS_ALPHA: readonly (readonly [number, number])[] = [
  [0, 0.44],
  [33, 1],
  [683, 1],
  [900, 0.4],
];
export const PLUS_END_MS = 916;

/** The centre of the "+N": one pitch above the tile's centre. */
export function plusCenter(tile: { left: number; top: number; width: number; height: number }, pitch: number): Pt {
  return { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2 - pitch };
}

/** A centre x moved so a box of half-width `half` keeps `margin` px inside [0, vw] (both edges; centred if it cannot). */
export function clampCenterX(x: number, half: number, vw: number, margin: number): number {
  const lo = margin + half;
  const hi = vw - margin - half;
  if (lo > hi) return vw / 2;
  return Math.min(hi, Math.max(lo, x));
}

/** P0: the star's birth point under the "+N" centre. */
export function starStart(plus: Pt, s: number): Pt {
  return { x: plus.x + STAR_FROM_PLUS.x * s, y: plus.y + STAR_FROM_PLUS.y * s };
}

/** The Bézier's control point: at P0's height, one third of the way back from P2 toward P0 (holds in RTL). */
export function bezierControl(p0: Pt, p2: Pt): Pt {
  return { x: p2.x + (p0.x - p2.x) / 3, y: p0.y };
}

/** The quadratic Bézier P0 → C → P2 at parameter u ∈ [0, 1]. */
export function bezierAt(p0: Pt, c: Pt, p2: Pt, u: number): Pt {
  const v = 1 - u;
  return { x: v * v * p0.x + 2 * v * u * c.x + u * u * p2.x, y: v * v * p0.y + 2 * v * u * c.y + u * u * p2.y };
}

/** The star's timing from the POINTS event: born at starAtMs, flies from starAtMs + 17 for flightMs, lands then. */
export function starTimes(c: GameConfig = cfg): { readonly born: number; readonly fly: number; readonly land: number } {
  const P = c.fx.points;
  return { born: P.starAtMs, fly: P.starAtMs + 17, land: P.starAtMs + 17 + P.flightMs };
}

/** The "+N"'s scale and opacity at t ms after POINTS. */
export function plusAt(t: number): { readonly scale: number; readonly opacity: number } {
  return { scale: keyed(PLUS_SCALE, t), opacity: keyed(PLUS_ALPHA, t) };
}

export interface PointsFx {
  readonly loop: FxLoop;
  readonly layer: HTMLElement;
  /** The cat's tile (client rect). */
  readonly tile: DOMRect;
  /** Slot pitch in px (tile + gap). */
  readonly pitch: number;
  /** The game screen's scale s. */
  readonly s: number;
  /** "+576" (fish.plus, formatted). */
  readonly text: string;
  readonly reduced: boolean;
  /** The Score number's client rect, read when the star takes off. */
  target(): DOMRect | null;
  /** The star landed: the bar counts up (not called with reduced motion or when cancelled). */
  onLand(): void;
  /** Seed for the trail and burst (the cell index). */
  readonly seed: number;
}

const px = (v: number): string => `${Math.round(v * 100) / 100}px`;

/** Plays one cat's "+N" → star → burst. */
export function playPoints(o: PointsFx): void {
  const doc = o.layer.ownerDocument;
  const vw = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
  const s = o.s;
  const center = plusCenter(o.tile, o.pitch);
  const { svg, text } = fxText(doc, 'fx-plus', o.text, {
    'text-anchor': 'middle',
    // The digits' visual centre on the centre point: the baseline sits half a cap height below it.
    y: String(Math.round(PLUS_FONT * s * 0.35 * 100) / 100),
    'font-size': String(PLUS_FONT * s),
    'stroke-width': String(PLUS_STROKE * s),
    'stroke-linejoin': 'round',
    'paint-order': 'stroke',
    style: 'fill:var(--plus);stroke:#fff;font-family:var(--font-num);font-weight:var(--display-weight)',
  });
  svg.style.zIndex = '3';
  svg.style.filter = `drop-shadow(0 ${px(2 * s)} ${px(1.5 * s)} #e8d7d6)`;
  o.layer.appendChild(svg);
  // The outer edge (fill + outline) stays PLUS_MARGIN px inside the viewport (one layout read).
  let half = 0;
  try {
    half = text.getBBox().width / 2 + (PLUS_STROKE * s) / 2;
  } catch {
    half = (o.text.length * PLUS_FONT * s * 0.62) / 2;
  }
  const cx = clampCenterX(center.x, half, vw, PLUS_MARGIN);
  const place = (scale: number, opacity: number): void => {
    svg.style.transform = `translate(${px(cx)},${px(center.y)}) scale(${Math.round(scale * 1000) / 1000})`;
    svg.style.opacity = String(Math.round(opacity * 1000) / 1000);
  };

  if (o.reduced) {
    const L = cfg.fx.levelPoints;
    const hold = Math.max(0, PLUS_END_MS - L.reducedPlusInMs - L.reducedPlusOutMs);
    const dur = L.reducedPlusInMs + hold + L.reducedPlusOutMs;
    o.loop.add({
      delay: 0,
      dur,
      frame: (t) => place(1, keyed([[0, 0], [L.reducedPlusInMs, 1], [L.reducedPlusInMs + hold, 1], [dur, 0]], t)),
      end: () => svg.remove(),
    });
    return;
  }

  o.loop.add({
    delay: 0,
    dur: PLUS_END_MS,
    frame: (t) => {
      const a = plusAt(t);
      place(a.scale, a.opacity);
    },
    end: () => svg.remove(),
  });
  playStar(o, { x: cx, y: center.y });
}

function playStar(o: PointsFx, plus: Pt): void {
  const doc = o.layer.ownerDocument;
  const s = o.s;
  const T = starTimes();
  const P = cfg.fx.points;
  const rand = seeded(0x5eed + o.seed * 7919);
  const p0 = starStart(plus, s);
  const size = STAR_SIZE * s;
  const star = fxEl(doc, 'fx-star', `z-index:4;width:${px(size)};height:${px(size)};margin:${px(-size / 2)} 0 0 ${px(-size / 2)};opacity:0`);
  const glow = fxEl(
    doc,
    'fx-star__glow',
    `left:50%;top:50%;width:${px(size * 1.5)};height:${px(size * 1.5)};margin:${px(-size * 0.75)} 0 0 ${px(-size * 0.75)};border-radius:50%;` +
      'background:radial-gradient(closest-side,rgba(255,250,150,.85),rgba(255,214,80,.35) 55%,rgba(255,214,80,0))',
  );
  const art = fxUse(doc, 'fx-star__art', 'fx-star4', 'width:100%;height:100%;color:var(--gold);--star-core:#fffd79');
  star.append(glow, art);
  let p2: Pt = p0;
  let ctl: Pt = p0;
  let last: Pt = p0;
  let lastT = 0;
  let lastDot = -Infinity;
  const place = (p: Pt, scale: number, angle: number, stretch: number): void => {
    star.style.transform = `translate(${px(p.x)},${px(p.y)}) scale(${Math.round(scale * 1000) / 1000})`;
    glow.style.transform = `rotate(${Math.round(angle)}deg) scaleX(${Math.round(stretch * 100) / 100})`;
  };
  let landed = false;
  o.loop.add({
    delay: T.born,
    dur: T.land - T.born,
    frame: (t) => {
      if (!star.isConnected) o.layer.appendChild(star);
      star.style.opacity = '1';
      if (t < T.fly - T.born) {
        // Born on the "+N": 5 → 22 s px by +67 ms.
        place(p0, keyed([[0, 5 / STAR_SIZE], [67, 1]], t), 0, 1);
        return;
      }
      if (p2 === p0) {
        const r = o.target();
        p2 = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : p0;
        ctl = bezierControl(p0, p2);
      }
      const u = Math.min(1, (t - (T.fly - T.born)) / P.flightMs);
      const p = bezierAt(p0, ctl, p2, u);
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      // px per ms (0.2 → 0.6 × s measured along the arc): the glow streaks along the path, ≤ 1.6.
      const speed = t > lastT ? Math.hypot(dx, dy) / (t - lastT) : 0;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      place(p, 1, angle, 1 + Math.min(0.6, speed / s));
      last = p;
      lastT = t;
      if (t - lastDot >= 33 && u < 0.97) {
        lastDot = t;
        trailDot(o, p, rand);
      }
    },
    end: (cancelled) => {
      star.remove();
      if (cancelled || landed) return;
      landed = true;
      playBurst(o, p2, rand);
      o.onLand();
    },
  });
}

/** A trail sparkle (3–7 s px) left behind the star, fading in ≈ 150 ms. */
function trailDot(o: PointsFx, p: Pt, rand: () => number): void {
  const doc = o.layer.ownerDocument;
  const size = (3 + rand() * 4) * o.s;
  const jx = (rand() - 0.5) * 6 * o.s;
  const jy = (rand() - 0.5) * 6 * o.s;
  const dot = fxEl(doc, 'fx-dot', `z-index:3;width:${px(size)};height:${px(size)};margin:${px(-size / 2)} 0 0 ${px(-size / 2)};background:#fff3a0`);
  o.layer.appendChild(dot);
  o.loop.add({
    delay: 0,
    dur: 150,
    frame: (t) => {
      const k = t / 150;
      dot.style.transform = `translate(${px(p.x + jx)},${px(p.y + jy)}) scale(${Math.round((1 - 0.7 * k) * 1000) / 1000})`;
      dot.style.opacity = String(Math.round((1 - k) * 1000) / 1000);
    },
    end: () => dot.remove(),
  });
}

/** The landing burst around the Score: 10 four-point sparkles (4–15 s px) within 30 s px, a warm glow. */
function playBurst(o: PointsFx, at: Pt, rand: () => number): void {
  const doc = o.layer.ownerDocument;
  const s = o.s;
  const dur = cfg.fx.points.burstMs;
  const burst = fxEl(doc, 'fx-burst', `z-index:4;transform:translate(${px(at.x)},${px(at.y)})`);
  const g = 46 * s;
  const glow = fxEl(
    doc,
    'fx-burst__glow',
    `width:${px(g)};height:${px(g)};margin:${px(-g / 2)} 0 0 ${px(-g / 2)};border-radius:50%;` +
      'background:radial-gradient(closest-side,rgba(255,236,120,.7),rgba(255,214,80,0))',
  );
  burst.appendChild(glow);
  interface Spark {
    readonly el: HTMLElement;
    readonly x: number;
    readonly y: number;
    readonly dx: number;
    readonly dy: number;
    readonly t0: number;
  }
  const sparks: Spark[] = [];
  for (let i = 0; i < 10; i++) {
    const size = (4 + rand() * 11) * s;
    // Around the number and the "Score" label above it: biased upward.
    const a = rand() * Math.PI * 2;
    const r = (8 + rand() * 22) * s;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.8 - 6 * s;
    const el = fxEl(doc, 'fx-dot', `width:${px(size)};height:${px(size)};margin:${px(-size / 2)} 0 0 ${px(-size / 2)};background:${i % 3 ? '#ffe45c' : '#fff6b8'};opacity:0`);
    burst.appendChild(el);
    sparks.push({ el, x, y, dx: (x / r) * 7 * s, dy: (y / r) * 7 * s, t0: rand() * 160 });
  }
  o.layer.appendChild(burst);
  o.loop.add({
    delay: 0,
    dur,
    frame: (t) => {
      // The glow peaks at +70…+170 (measured 1 400–1 500) and is gone by the end.
      glow.style.opacity = String(Math.round(keyed([[0, 0.3], [70, 1], [170, 1], [dur, 0]], t) * 1000) / 1000);
      for (const sp of sparks) {
        const k = Math.max(0, t - sp.t0) / Math.max(1, dur - sp.t0);
        const grow = Math.min(1, Math.max(0, t - sp.t0) / 80);
        const scale = grow * (1 - 0.6 * k);
        sp.el.style.opacity = String(t < sp.t0 ? 0 : Math.round((1 - k * k) * 1000) / 1000);
        sp.el.style.transform = `translate(${px(sp.x + sp.dx * k)},${px(sp.y + sp.dy * k)}) scale(${Math.round(scale * 1000) / 1000})`;
      }
    },
    end: () => burst.remove(),
  });
}
