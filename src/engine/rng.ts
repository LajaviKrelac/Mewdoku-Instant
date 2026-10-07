// Owner: engine
// Seeded PRNG (03 §7): cyrb128 string hash → sfc32, first 15 outputs discarded, int(n) by rejection
// sampling. Integer arithmetic only; no Math.random anywhere in generator paths. PURE.
import type { Rng } from './types';

/** Number of sfc32 outputs discarded after seeding (03 §7). */
const WARMUP = 15;
const TWO_32 = 4294967296;

/** cyrb128 hash of a seed string → four uint32 (03 §7). */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32 generator returning uint32 values (03 §7). */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  let sa = a | 0;
  let sb = b | 0;
  let sc = c | 0;
  let sd = d | 0;
  return () => {
    const t = (((sa + sb) | 0) + sd) | 0;
    sd = (sd + 1) | 0;
    sa = sb ^ (sb >>> 9);
    sb = (sc + (sc << 3)) | 0;
    sc = (sc << 21) | (sc >>> 11);
    sc = (sc + t) | 0;
    return t >>> 0;
  };
}

/** Wraps a raw uint32 source as an Rng: int(n) by rejection sampling, Fisher–Yates shuffle. */
export function rngFrom(next: () => number): Rng {
  const int = (n: number): number => {
    if (!Number.isInteger(n) || n < 1 || n > TWO_32) throw new RangeError(`rng.int: bad bound ${n}`);
    // Largest multiple of n that fits in 2^32: values at or above it are rejected (no modulo bias).
    const limit = TWO_32 - (TWO_32 % n);
    for (;;) {
      const x = next();
      if (x < limit) return x % n;
    }
  };
  return {
    u32: next,
    int,
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = arr[i] as T;
        arr[i] = arr[j] as T;
        arr[j] = tmp;
      }
      return arr;
    },
  };
}

/** Rng stream for a seed string such as `mewdoku:level:v1:37` (seeds: game/ramp.ts SEEDS). */
export function makeRng(seed: string): Rng {
  const [a, b, c, d] = cyrb128(seed);
  const next = sfc32(a, b, c, d);
  for (let i = 0; i < WARMUP; i++) next();
  return rngFrom(next);
}
