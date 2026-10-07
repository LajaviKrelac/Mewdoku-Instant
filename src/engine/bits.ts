// Owner: engine
// Bit helpers for ≤ 32-bit row/column/region masks (03 §2). PURE.

/** Population count of a 32-bit value (branch-free SWAR, 03 §2). */
export function popcount(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Index (0..31) of the lowest set bit, or -1 when x === 0. */
export function lowestBitIndex(x: number): number {
  return x === 0 ? -1 : 31 - Math.clz32(x & -x);
}

/** Calls fn with each set bit's index, ascending. */
export function forEachBit(mask: number, fn: (index: number) => void): void {
  let m = mask | 0;
  while (m !== 0) {
    const low = m & -m;
    fn(31 - Math.clz32(low));
    m ^= low;
  }
}

/** Indices of the set bits, ascending. */
export function bitIndices(mask: number): number[] {
  const out: number[] = [];
  forEachBit(mask, (i) => out.push(i));
  return out;
}

/** Mask with bits 0..n-1 set (n ≤ 31). */
export function fullMask(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 31) throw new RangeError(`fullMask: n out of range: ${n}`);
  return (1 << n) - 1;
}
