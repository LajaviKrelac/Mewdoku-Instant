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
 * The shards of one burst (pure, seeded): `count` chunks 9–16 s px across (the first three up to 22),
 * thrown radially at 0.3–0.5 px/ms × s, mostly up and sideways.
 */
export function shardPlan(count: number, s: number, tile: number, seed: number): Shard[] {
  const rand = seeded(seed);
  const out: Shard[] = [];
  for (let i = 0; i < count; i++) {
    // −200° … +20° from the right: the upper half and a little below on both sides.
    const a = ((-200 + rand() * 220) * Math.PI) / 180;
    const v = (0.3 + rand() * 0.2) * s;
    const big = i < 3;
    out.push({
      x: (rand() - 0.5) * 0.3 * tile,
      y: (rand() - 0.5) * 0.3 * tile,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      size: (big ? 14 + rand() * 8 : 9 + rand() * 7) * s,
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
    scale: Math.min(1, 0.6 + t / 125) * (1 - 0.7 * k),
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
}

const px = (v: number): string => `${Math.round(v * 100) / 100}px`;
const r3 = (v: number): string => String(Math.round(v * 1000) / 1000);

export function playCatBurst(o: CatBurstFx): void {
  const doc = o.layer.ownerDocument;
  const cx = o.tile.left + o.tile.width / 2;
  const cy = o.tile.top + o.tile.height / 2;
  const s = o.s;

  // Shards (0 → shardLifeMs).
  const life = cfg.fx.catPlaced.shardLifeMs;
  const plan = shardPlan(cfg.fx.catPlaced.shards, s, o.tile.width, 0x51a + o.seed * 977);
  const els = plan.map((sh) => {
    const el = fxUse(doc, 'fx-shard', sh.art, `z-index:2;width:${px(sh.size)};height:${px(sh.size)};margin:${px(-sh.size / 2)} 0 0 ${px(-sh.size / 2)};color:${o.color}`);
    o.layer.appendChild(el);
    return el;
  });
  o.loop.add({
    delay: 0,
    dur: life,
    frame: (t) => {
      plan.forEach((sh, i) => {
        const el = els[i];
        if (!el) return;
        const p = shardAt(sh, t, s);
        el.style.transform = `translate(${px(cx + p.x)},${px(cy + p.y)}) rotate(${Math.round(p.rot)}deg) scale(${r3(p.scale)})`;
        el.style.opacity = r3(p.opacity);
      });
    },
    end: () => {
      for (const el of els) el.remove();
    },
  });
}
