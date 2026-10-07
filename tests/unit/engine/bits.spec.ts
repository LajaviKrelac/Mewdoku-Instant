// Owner: engine
// 03 §11.1 bits: popcount and bit iteration against naive versions over random 32-bit values.
import { describe, expect, it } from 'vitest';
import { bitIndices, forEachBit, fullMask, lowestBitIndex, popcount } from '../../../src/engine/bits';
import { makeRng } from '../../../src/engine/rng';

function naivePopcount(x: number): number {
  let k = 0;
  for (let b = 0; b < 32; b++) if ((x >>> b) & 1) k++;
  return k;
}

function naiveIndices(x: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < 32; b++) if ((x >>> b) & 1) out.push(b);
  return out;
}

const EDGE = [0, 1, 2, 3, 0x80000000, -1, 0x7fffffff, 0x55555555, 0xaaaaaaaa | 0, 0xfff, -2147483648, 1 << 30];

function samples(count: number): number[] {
  const rng = makeRng('test:bits');
  const out = [...EDGE];
  for (let i = 0; i < count; i++) {
    const x = rng.u32();
    // Mix dense, sparse and signed views of the same stream.
    out.push(x, x | 0, x & rng.u32() & rng.u32(), x >>> rng.int(32));
  }
  return out;
}

describe('bits', () => {
  const xs = samples(5000);

  it('popcount matches a naive count (signed and unsigned inputs)', () => {
    for (const x of xs) expect(popcount(x)).toBe(naivePopcount(x));
  });

  it('lowestBitIndex matches the first naive index, -1 for 0', () => {
    for (const x of xs) expect(lowestBitIndex(x)).toBe(naiveIndices(x)[0] ?? -1);
  });

  it('forEachBit and bitIndices visit every set bit once, ascending', () => {
    for (const x of xs) {
      const seen: number[] = [];
      forEachBit(x, (i) => seen.push(i));
      const want = naiveIndices(x);
      expect(seen).toEqual(want);
      expect(bitIndices(x)).toEqual(want);
    }
  });

  it('fullMask(n) has exactly bits 0..n-1 set for every n in 0..31', () => {
    for (let n = 0; n <= 31; n++) {
      const m = fullMask(n);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(naiveIndices(m)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
    expect(fullMask(12)).toBe(4095);
    expect(() => fullMask(32)).toThrow(RangeError);
    expect(() => fullMask(-1)).toThrow(RangeError);
    expect(() => fullMask(2.5)).toThrow(RangeError);
  });
});
