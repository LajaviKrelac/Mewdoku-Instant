// Owner: engine
// 03 §7 / §11.1 rng: cyrb128 + sfc32 golden outputs, warm-up, int(n) by rejection sampling
// (unbiased, χ² over 10⁶ draws), shuffle is a permutation, determinism.
import { describe, expect, it } from 'vitest';
import { cyrb128, makeRng, rngFrom, sfc32 } from '../../../src/engine/rng';
import { SEEDS } from '../../../src/game/ramp';

// Golden values: produced by src/engine/rng.ts and cross-checked against the Phase 1 prototype
// (docs/phase1/engine-prototype/lab/queens.mjs cyrb128/sfc32/makeRng), which agree bit for bit.
const GOLDEN: readonly { seed: string; hash: number[]; first20: number[] }[] = [
  {
    seed: 'mewdoku:level:v1:37',
    hash: [3242534604, 3615656507, 1006000411, 3415287683],
    first20: [
      2784541030, 1952625374, 3014222258, 730238726, 4167594881, 2492567358, 3230732556, 1822360374, 1644268391,
      3638060507, 2274864977, 1545025716, 3057313509, 2726995911, 2163117481, 2225246253, 2208960174, 3179909112,
      2380334604, 2438660656,
    ],
  },
  {
    seed: 'mewdoku:daily:v1:2026-10-06',
    hash: [1954665671, 2688729888, 3698083889, 424607737],
    first20: [
      2898082712, 2498474160, 3340299148, 851551368, 3520381401, 3186905472, 2319339252, 3953666341, 1598985363,
      3214222663, 1604061441, 713436766, 3441366382, 782073418, 2366062561, 1645181724, 2845035178, 2948239060,
      768829263, 912043759,
    ],
  },
  {
    seed: 'mewdoku:schedule:v1',
    hash: [1541357245, 912486912, 3877703495, 719847201],
    first20: [
      267989380, 2990778351, 2375591524, 905049480, 737989484, 1750892099, 2251115652, 4082604436, 622390968,
      1282843271, 642637069, 734727911, 2128312293, 1115790005, 1077803412, 1201643776, 2811461690, 1684166861,
      4151716610, 1581073913,
    ],
  },
];

describe('cyrb128 / sfc32 / makeRng', () => {
  it.each(GOLDEN)('golden hash and first 20 outputs for $seed', ({ seed, hash, first20 }) => {
    expect(cyrb128(seed)).toEqual(hash);
    const rng = makeRng(seed);
    expect(Array.from({ length: 20 }, () => rng.u32())).toEqual(first20);
  });

  it('seed strings from game/ramp.ts SEEDS hash as documented', () => {
    expect(SEEDS.level(37)).toBe(GOLDEN[0]?.seed);
    expect(SEEDS.daily('2026-10-06')).toBe(GOLDEN[1]?.seed);
    expect(SEEDS.schedule).toBe(GOLDEN[2]?.seed);
  });

  it('cyrb128 returns four uint32 values, also for the empty string', () => {
    for (const s of ['', 'a', 'mewdoku', '日本語', 'x'.repeat(1000)]) {
      const h = cyrb128(s);
      expect(h).toHaveLength(4);
      for (const v of h) expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
    }
  });

  it('makeRng discards the first 15 sfc32 outputs (03 §7)', () => {
    const seed = 'test:warmup';
    const [a, b, c, d] = cyrb128(seed);
    const raw = sfc32(a, b, c, d);
    const rawOut = Array.from({ length: 25 }, () => raw());
    const rng = makeRng(seed);
    expect(Array.from({ length: 10 }, () => rng.u32())).toEqual(rawOut.slice(15));
  });

  it('is deterministic per seed and differs between seeds', () => {
    const draw = (seed: string): number[] => {
      const r = makeRng(seed);
      return Array.from({ length: 50 }, () => r.u32());
    };
    expect(draw('s1')).toEqual(draw('s1'));
    expect(draw('s1')).not.toEqual(draw('s2'));
    expect(draw('mewdoku:level:v1:1')).not.toEqual(draw('mewdoku:level:v1:1:r1'));
  });

  it('u32 outputs are uint32', () => {
    const r = makeRng('test:u32');
    for (let i = 0; i < 10000; i++) {
      const x = r.u32();
      expect(Number.isInteger(x) && x >= 0 && x <= 0xffffffff).toBe(true);
    }
  });
});

describe('rng.int', () => {
  it('stays in [0, n) for many bounds, including 1 and 2^32', () => {
    const r = makeRng('test:int-range');
    for (const n of [1, 2, 3, 5, 7, 10, 12, 100, 1000, 2 ** 31 + 1, 2 ** 32]) {
      for (let i = 0; i < 2000; i++) {
        const x = r.int(n);
        expect(Number.isInteger(x) && x >= 0 && x < n).toBe(true);
      }
    }
  });

  it('rejects bad bounds', () => {
    const r = makeRng('test:int-bad');
    for (const n of [0, -1, 1.5, Number.NaN, 2 ** 32 + 1]) expect(() => r.int(n)).toThrow(RangeError);
  });

  it('uses rejection sampling, not a biased modulo', () => {
    // n = 3: the largest multiple of 3 below 2^32 is 2^32 − 1, so 0xFFFFFFFF must be rejected.
    const script = [0xffffffff, 0xffffffff, 7];
    const r = rngFrom(() => script.shift() as number);
    expect(r.int(3)).toBe(7 % 3);
    expect(script).toHaveLength(0);
    // n = 2^31 + 1: limit = 2^31 + 1, so 2^31 + 1 itself is rejected, 2^31 accepted as is.
    const script2 = [2 ** 31 + 1, 2 ** 31];
    const r2 = rngFrom(() => script2.shift() as number);
    expect(r2.int(2 ** 31 + 1)).toBe(2 ** 31);
  });

  it('is unbiased: χ² over 10⁶ draws (03 §11.1)', () => {
    const r = makeRng('test:chi2');
    for (const n of [7, 12]) {
      const counts = new Array<number>(n).fill(0);
      const draws = 1_000_000;
      for (let i = 0; i < draws; i++) {
        const x = r.int(n);
        counts[x] = (counts[x] as number) + 1;
      }
      const expected = draws / n;
      const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
      // p = 0.001 critical values: df 6 → 22.46, df 11 → 31.26.
      expect(chi2).toBeLessThan(n === 7 ? 22.46 : 31.26);
    }
  });

  it('a large non-power-of-two bound is unbiased in its top half (where modulo bias would show)', () => {
    // With n = 3·2^30, x % n maps [n, 2^32) onto [0, 2^30): a modulo version would put 2/3 more
    // draws below 2^30 than in each other 2^30 band. Rejection keeps all three bands equal.
    const n = 3 * 2 ** 30;
    const r = makeRng('test:big-n');
    const bands = [0, 0, 0];
    for (let i = 0; i < 300_000; i++) {
      const b = Math.floor(r.int(n) / 2 ** 30);
      bands[b] = (bands[b] as number) + 1;
    }
    for (const c of bands) expect(Math.abs(c - 100_000)).toBeLessThan(1500);
  });
});

describe('rng.shuffle', () => {
  it('returns the same array, permuted', () => {
    const r = makeRng('test:shuffle');
    for (let len = 0; len <= 40; len++) {
      const a = Array.from({ length: len }, (_, i) => i);
      const out = r.shuffle(a);
      expect(out).toBe(a);
      expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: len }, (_, i) => i));
    }
  });

  it('is deterministic per seed', () => {
    const s = (seed: string): number[] => makeRng(seed).shuffle(Array.from({ length: 30 }, (_, i) => i));
    expect(s('a')).toEqual(s('a'));
    expect(s('a')).not.toEqual(s('b'));
  });

  it('draws all 24 orders of 4 items uniformly (χ²)', () => {
    const r = makeRng('test:shuffle-uniform');
    const counts = new Map<string, number>();
    const trials = 240_000;
    for (let i = 0; i < trials; i++) {
      const key = r.shuffle([0, 1, 2, 3]).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(24);
    const expected = trials / 24;
    let chi2 = 0;
    for (const c of counts.values()) chi2 += (c - expected) ** 2 / expected;
    expect(chi2).toBeLessThan(49.73); // df 23, p = 0.001
  });
});
