// Owner: read-only (Phase 2b; was engine)
// 03 §8.5 / §11.1 colour assignment: distinct colours, deterministic per puzzle id, greedy
// max-min ΔE with rotated tie-breaks, adjacent regions ≥ ΔE 10 with the shipped palette matrix.
import { describe, expect, it } from 'vitest';
import { assignColors, regionAdjacency } from '../../../src/engine/colors';
import { decodeRegions } from '../../../src/engine/codec';
import { makeRng, cyrb128 } from '../../../src/engine/rng';
import type { DeltaMatrix, PuzzleId } from '../../../src/engine/types';
import { PALETTE_DE00, PALETTE_SIZE } from '../../../src/ui/art/palette';
import { plantedMap, TUTORIAL } from './helpers';

/** A synthetic 12×12 ΔE matrix: |i − j| × 100 (adjacent palette indices are the closest). */
const LINEAR: DeltaMatrix = Array.from({ length: 144 }, (_, k) => Math.abs(Math.floor(k / 12) - (k % 12)) * 100);

function naiveAdjacency(n: number, regions: Uint8Array): number[] {
  const adj = new Array<number>(n).fill(0);
  for (let i = 0; i < n * n; i++) {
    for (let j = 0; j < n * n; j++) {
      const ortho = Math.abs(Math.floor(i / n) - Math.floor(j / n)) + Math.abs((i % n) - (j % n)) === 1;
      const [a, b] = [regions[i] as number, regions[j] as number];
      if (ortho && a !== b) adj[a] = (adj[a] as number) | (1 << b);
    }
  }
  return adj;
}

describe('regionAdjacency', () => {
  it('is the symmetric edge-adjacency of regions', () => {
    const rng = makeRng('test:adjacency');
    for (let t = 0; t < 60; t++) {
      const n = 4 + (t % 9);
      const { regions } = plantedMap(n, rng);
      expect(regionAdjacency(n, regions)).toEqual(naiveAdjacency(n, regions));
    }
    // Tutorial: A–B, A–C, A–D, B–C, C–D (B and D do not touch).
    expect(regionAdjacency(4, decodeRegions(TUTORIAL.r, 4))).toEqual([0b1110, 0b0101, 0b1011, 0b0101]);
  });
});

describe('assignColors (03 §8.5)', () => {
  it('gives every region a distinct palette colour, deterministically per puzzle id', () => {
    const rng = makeRng('test:colors');
    for (let t = 0; t < 200; t++) {
      const n = 4 + (t % 9);
      const { regions } = plantedMap(n, rng);
      const id: PuzzleId = `L${t + 2}`;
      const colors = assignColors({ id, n, regions }, PALETTE_DE00, PALETTE_SIZE);
      expect(colors).toHaveLength(n);
      expect(new Set(colors).size).toBe(n);
      for (const c of colors) expect(c).toBeLessThan(PALETTE_SIZE);
      expect(assignColors({ id, n, regions }, PALETTE_DE00)).toEqual(colors);
    }
  });

  it('adjacent regions are at least ΔE 10 apart with the shipped palette (02 §17.2)', () => {
    const rng = makeRng('test:colors-de');
    let minSeen = Number.POSITIVE_INFINITY;
    for (let t = 0; t < 400; t++) {
      const n = 4 + (t % 9);
      const { regions } = plantedMap(n, rng);
      const colors = assignColors({ id: `D2026-10-${t}`, n, regions }, PALETTE_DE00);
      const adj = regionAdjacency(n, regions);
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          if (!(((adj[a] as number) >> b) & 1)) continue;
          const de = PALETTE_DE00[(colors[a] as number) * PALETTE_SIZE + (colors[b] as number)] as number;
          minSeen = Math.min(minSeen, de);
        }
      }
    }
    expect(minSeen).toBeGreaterThanOrEqual(1000);
  });

  it('follows the greedy rule: by degree, max-min ΔE to coloured neighbours, rotated tie-break', () => {
    // Tutorial board: degrees A 3, C 3, B 2, D 2 → order A, C, B, D.
    const regions = decodeRegions(TUTORIAL.r, 4);
    for (const id of ['T1', 'L2', 'L3', 'L77', 'D2026-10-06'] as PuzzleId[]) {
      const rot = (cyrb128(id)[0] as number) % 12;
      const colors = assignColors({ id, n: 4, regions }, LINEAR);
      // A: no coloured neighbour → every colour scores +∞ → first in rotated order.
      expect(colors[0]).toBe(rot);
      // C neighbours A: the farthest index from rot under |i − j|; ties go to the earlier in rotated order.
      const far = (from: number[], used: number[]): number => {
        let best = -1;
        let bestScore = -1;
        for (let j = 0; j < 12; j++) {
          const c = (rot + j) % 12;
          if (used.includes(c)) continue;
          const score = Math.min(...from.map((f) => Math.abs(c - f)));
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        return best;
      };
      expect(colors[2]).toBe(far([rot], [rot]));
      expect(colors[1]).toBe(far([colors[0] as number, colors[2] as number], [rot, colors[2] as number]));
      expect(colors[3]).toBe(far([colors[0] as number, colors[2] as number], [rot, colors[2] as number, colors[1] as number]));
    }
  });

  it('different puzzle ids rotate the tie-breaks, so boards look varied', () => {
    const regions = decodeRegions(TUTORIAL.r, 4);
    const seen = new Set<string>();
    for (let L = 2; L < 40; L++) seen.add(assignColors({ id: `L${L}`, n: 4, regions }, PALETTE_DE00).join(','));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('works with a smaller palette and rejects a mismatched matrix or too few colours', () => {
    const small: DeltaMatrix = Array.from({ length: 36 }, (_, k) => (Math.floor(k / 6) === k % 6 ? 0 : 1500));
    const regions = decodeRegions(TUTORIAL.r, 4);
    const colors = assignColors({ id: 'T1', n: 4, regions }, small, 6);
    expect(new Set(colors).size).toBe(4);
    expect(() => assignColors({ id: 'T1', n: 4, regions }, small)).toThrow(RangeError); // 36 ≠ 12²
    expect(() => assignColors({ id: 'T1', n: 4, regions }, PALETTE_DE00.slice(0, 143))).toThrow(RangeError);
    const tiny: DeltaMatrix = [0, 1, 1, 0, 1, 1, 1, 1, 0];
    expect(() => assignColors({ id: 'T1', n: 4, regions }, tiny, 3)).toThrow(RangeError);
  });
});
