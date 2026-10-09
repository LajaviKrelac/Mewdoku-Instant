// Owner: read-only (Phase 2b; was engine)
// 03 §4.5 / §8.4 filters: region sizes, shape limits, 8-symmetry canonical key.
import { describe, expect, it } from 'vitest';
import { canonicalLabels, decodeRegions, encodeRegions } from '../../../src/engine/codec';
import { canonicalKey, regionSizes, shapeOk } from '../../../src/engine/filters';
import { makeRng } from '../../../src/engine/rng';
import { plantedMap, TUTORIAL } from './helpers';

/** Applies a square symmetry to a map: out(r, c) = in(f(r, c)). */
function transform(n: number, regions: Uint8Array, f: (r: number, c: number) => [number, number]): Uint8Array {
  const out = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const [sr, sc] = f(r, c);
      out[r * n + c] = regions[sr * n + sc] as number;
    }
  }
  return out;
}

const SYMS = (m: number): ((r: number, c: number) => [number, number])[] => [
  (r, c) => [r, c],
  (r, c) => [m - c, r], // rotate 90°
  (r, c) => [m - r, m - c], // 180°
  (r, c) => [c, m - r], // 270°
  (r, c) => [r, m - c], // mirror left-right
  (r, c) => [m - r, c], // mirror top-bottom
  (r, c) => [c, r], // transpose
  (r, c) => [m - c, m - r], // anti-transpose
];

describe('regionSizes / shapeOk (03 §4.5)', () => {
  it('counts cells per label', () => {
    expect(regionSizes(4, decodeRegions(TUTORIAL.r, 4))).toEqual([4, 1, 5, 6]);
  });

  it('applies inclusive min and max region sizes', () => {
    const tut = decodeRegions(TUTORIAL.r, 4);
    expect(shapeOk(4, tut, { minRegion: 1, maxRegion: 10 })).toBe(true);
    expect(shapeOk(4, tut, { minRegion: 1, maxRegion: 6 })).toBe(true);
    expect(shapeOk(4, tut, { minRegion: 1, maxRegion: 5 })).toBe(false); // D has 6
    expect(shapeOk(4, tut, { minRegion: 2, maxRegion: 10 })).toBe(false); // B has 1
  });
});

describe('canonicalKey (03 §8.4)', () => {
  it('is invariant under the 8 symmetries of the square and under relabelling', () => {
    const rng = makeRng('test:canon');
    for (let t = 0; t < 120; t++) {
      const n = 4 + (t % 9);
      const { regions } = plantedMap(n, rng);
      const key = canonicalKey(n, regions);
      expect(key).toHaveLength(n * n);
      expect(key.charAt(0)).toBe('A');
      // The key is itself a canonical region string of one of the 8 images.
      const images = SYMS(n - 1).map((f) => encodeRegions(transform(n, regions, f)));
      expect(images).toContain(key);
      expect(key).toBe([...images].sort()[0]);
      for (const f of SYMS(n - 1)) {
        const img = transform(n, regions, f);
        expect(canonicalKey(n, img)).toBe(key);
        // Relabel with a random permutation of labels.
        const perm = rng.shuffle(Array.from({ length: n }, (_, i) => i));
        expect(canonicalKey(n, img.map((g) => perm[g] as number))).toBe(key);
      }
    }
  });

  it('distinguishes maps that are not symmetric images of each other', () => {
    const rng = makeRng('test:canon-distinct');
    const keys = new Map<string, string>();
    for (let t = 0; t < 300; t++) {
      const { regions } = plantedMap(8, rng);
      const key = canonicalKey(8, regions);
      const own = encodeRegions(regions);
      const prev = keys.get(key);
      if (prev !== undefined) {
        // A collision must be a genuine symmetric image.
        const images = SYMS(7).map((f) => encodeRegions(transform(8, decodeRegions(prev, 8), f)));
        expect(images).toContain(own);
      }
      keys.set(key, own);
    }
    expect(keys.size).toBeGreaterThan(290);
  });

  it('the tutorial and its mirror share a key; canonicalLabels does not change it', () => {
    const tut = decodeRegions(TUTORIAL.r, 4);
    const mirror = transform(4, tut, (r, c) => [r, 3 - c]);
    expect(canonicalKey(4, mirror)).toBe(canonicalKey(4, tut));
    expect(canonicalKey(4, canonicalLabels(mirror))).toBe(canonicalKey(4, tut));
  });
});
