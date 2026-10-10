// Owner: G3 (Phase 2d.1)
// The screen-layer part of the cat-placed sequence (helpers-spec §2.4, D-2d1-3; measured on the user's
// v2 recording, drawn by us): two-tone shards (G2's fx-shard art in the tile's region colour) burst
// from the tile centre, fall under gravity, shrink and fade; they leave the board, so they fly in the
// screen's fx layer. The board plays the cat itself, the flash, the halo, the light on the neighbours
// and the twinkles (G2; requests-G2 H1: one owner, no double glow). Every correct cat plays it;
// reduced motion plays none of it.
// Lazy fx chunk (fx/celebrate.ts). Class: .game-fx > svg.fx-shard.
import { cfg, type GameConfig } from '../../app/config';
import { fxUse, seeded, type FxLoop } from './fx-loop';

/** Gravity in px/ms² per unit of s (≈ 900 px/s², measured). */
export const SHARD_GRAVITY = 0.0009;
/**
 * Audit B4 (measured, v2: "the cat is drawn over its tile and the flash, and partly over the shards"): for
 * their first SHARD_UNDER_MS the shards fly inside the cat's cell, over its flash and under the popping cat
 * (CelebrateContext.cellHost); then they move to the fx layer, above the board and the HUD.
 */
export const SHARD_UNDER_MS = 150;
/** The shard art fills about 0.83 of its box: the box is this much larger than the measured chunk (audit B4). */
const SHARD_BOX = 1.2;
const SHARD_IDS = ['fx-shard', 'fx-shard-2', 'fx-shard-3'] as const;

export interface Shard {
  /** Start offset from the tile centre (px). */
  readonly x: number;
  readonly y: number;
  /** Velocity, px/ms. */
  readonly vx: number;
  readonly vy: number;
  /** Size, px. */
  readonly size: number;
  /** Start angle and spin (deg, deg/ms). */
  readonly rot: number;
  readonly spin: number;
  readonly art: (typeof SHARD_IDS)[number];
}

/**
 * The shards of one burst (pure, seeded): `count` chunks drawn 9–16 s px across (the first three up to 22;
 * their boxes SHARD_BOX larger, as the art does not fill its box), thrown radially at 0.3–0.5 px/ms × s,
 * all round but straight down, starting 0.25–0.5 T out from the tile centre along their way (audit B4: the
 * measured chunks already reach the tile's edge at +16).
 */
export function shardPlan(count: number, s: number, tile: number, seed: number): Shard[] {
  const rand = seeded(seed);
  const out: Shard[] = [];
  for (let i = 0; i < count; i++) {
    // −240° … +60° from the right: all round but straight down (measured: "mainly up, left and down"; audit B4).
    const a = ((-240 + rand() * 300) * Math.PI) / 180;
    const v = (0.3 + rand() * 0.2) * s;
    const big = i < 3;
    const r0 = (0.25 + rand() * 0.25) * tile;
    out.push({
      x: Math.cos(a) * r0,
      y: Math.sin(a) * r0,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      size: (big ? 14 + rand() * 8 : 9 + rand() * 7) * SHARD_BOX * s,
      rot: rand() * 360,
      spin: (rand() - 0.5) * 0.6,
      art: SHARD_IDS[i % SHARD_IDS.length] as Shard['art'],
    });
  }
  return out;
}

/** Where a shard is at t ms (ballistic), its scale and opacity (shrink and fade from 430 ms to shardLifeMs). */
export function shardAt(sh: Shard, t: number, s: number, c: GameConfig = cfg): { x: number; y: number; scale: number; opacity: number; rot: number } {
  const life = c.fx.catPlaced.shardLifeMs;
  const fade = Math.min(430, life);
  const k = t <= fade ? 0 : Math.min(1, (t - fade) / Math.max(1, life - fade));
  return {
    x: sh.x + sh.vx * t,
    y: sh.y + sh.vy * t + 0.5 * SHARD_GRAVITY * s * t * t,
    scale: Math.min(1, 0.9 + t / 500) * (1 - 0.7 * k), // near full size from the first frame (audit B4)
    opacity: 1 - k,
    rot: sh.rot + sh.spin * t,
  };
}

export interface CatBurstFx {
  readonly loop: FxLoop;
  readonly layer: HTMLElement;
  /** The cat's tile (client rect). */
  readonly tile: DOMRect;
  readonly s: number;
  /** The region colour, as a CSS colour (var(--rN)). */
  readonly color: string;
  readonly seed: number;
  /** The cat's cell on the board: the shards start in it, under the cat (SHARD_UNDER_MS); null: the fx layer at once. */
  readonly host?: HTMLElement | null;
}

const px = (v: number): string => `${Math.round(v * 100) / 100}px`;
const r3 = (v: number): string => String(Math.round(v * 1000) / 1000);

export function playCatBurst(o: CatBurstFx): void {
  const doc = o.layer.ownerDocument;
  const cx = o.tile.left + o.tile.width / 2;
  const cy = o.tile.top + o.tile.height / 2;
  const s = o.s;

  // Shards (0 → shardLifeMs): first in the cat's cell, over the flash and under the cat (audit B4), z 2 before
  // the cell's own SVG (the cat, also z 2, paints after them); then in the fx layer.
  const life = cfg.fx.catPlaced.shardLifeMs;
  const plan = shardPlan(cfg.fx.catPlaced.shards, s, o.tile.width, 0x51a + o.seed * 977);
  let under: HTMLElement | null = null;
  let origin = { x: 0, y: 0 };
  if (o.host) {
    under = doc.createElement('span');
    under.className = 'fx-shards-under';
    under.setAttribute('aria-hidden', 'true');
    under.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2;overflow:visible;pointer-events:none';
    o.host.insertBefore(under, o.host.querySelector(':scope > svg'));
    const r = o.host.getBoundingClientRect();
    origin = { x: r.left, y: r.top };
  }
  const els = plan.map((sh) => {
    const el = fxUse(doc, 'fx-shard', sh.art, `z-index:2;width:${px(sh.size)};height:${px(sh.size)};margin:${px(-sh.size / 2)} 0 0 ${px(-sh.size / 2)};color:${o.color}`);
    (under ?? o.layer).appendChild(el);
    return el;
  });
  const leave = (): void => {
    if (!under) return;
    for (const el of els) o.layer.appendChild(el);
    under.remove();
    under = null;
    origin = { x: 0, y: 0 };
  };
  o.loop.add({
    delay: 0,
    dur: life,
    frame: (t) => {
      if (t >= SHARD_UNDER_MS) leave();
      plan.forEach((sh, i) => {
        const el = els[i];
        if (!el) return;
        const p = shardAt(sh, t, s);
        el.style.transform = `translate(${px(cx + p.x - origin.x)},${px(cy + p.y - origin.y)}) rotate(${Math.round(p.rot)}deg) scale(${r3(p.scale)})`;
        el.style.opacity = r3(p.opacity);
      });
    },
    end: () => {
      for (const el of els) el.remove();
      under?.remove();
      under = null;
    },
  });
}
