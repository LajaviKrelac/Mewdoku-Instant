// Owner: engine
// Shape filters and the 8-symmetry canonical key for duplicate detection (03 §4.5, §8.4). PURE.
import { REGION_ALPHABET } from './codec';

/** Cell count per region label. */
export function regionSizes(n: number, regions: Uint8Array): number[] {
  const sizes = new Array<number>(n).fill(0);
  for (let i = 0; i < regions.length; i++) {
    const g = regions[i] as number;
    sizes[g] = (sizes[g] ?? 0) + 1;
  }
  return sizes;
}

/** Region sizes within [minRegion, maxRegion] (03 §4.5). Limits come from game/ramp.ts shapeLimits(). */
export function shapeOk(n: number, regions: Uint8Array, limits: { minRegion: number; maxRegion: number }): boolean {
  const sizes = regionSizes(n, regions);
  for (const s of sizes) if (s < limits.minRegion || s > limits.maxRegion) return false;
  return true;
}

/**
 * The 8 symmetries of the square as maps from a transformed position (r, c) to the source cell
 * (03 §8.4): identity, three rotations, and the four reflections.
 */
const SYMMETRIES: readonly ((r: number, c: number, m: number) => [number, number])[] = [
  (r, c) => [r, c],
  (r, c, m) => [c, m - r],
  (r, c, m) => [m - r, m - c],
  (r, c, m) => [m - c, r],
  (r, c, m) => [r, m - c],
  (r, c) => [c, r],
  (r, c, m) => [m - r, c],
  (r, c, m) => [m - c, m - r],
];

/** Minimum over the 8 square symmetries of the first-appearance-relabelled region string (03 §8.4). */
export function canonicalKey(n: number, regions: Uint8Array): string {
  const m = n - 1;
  const map = new Int16Array(256);
  let best: string | null = null;
  for (const sym of SYMMETRIES) {
    map.fill(-1);
    let next = 0;
    let s = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const [sr, sc] = sym(r, c, m);
        const g = regions[sr * n + sc] as number;
        if ((map[g] as number) < 0) map[g] = next++;
        s += REGION_ALPHABET.charAt(map[g] as number);
      }
    }
    if (best === null || s < best) best = s;
  }
  return best ?? '';
}
