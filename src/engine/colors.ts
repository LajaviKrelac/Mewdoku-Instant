// Owner: read-only (Phase 2b; was engine)
// Region → palette assignment by adjacency and ΔE (03 §8.5). Palette-agnostic: the ΔE matrix and
// palette size come from ui/art/palette.ts (PALETTE_DE00) via the caller. Deterministic. PURE.
import { popcount } from './bits';
import { cyrb128 } from './rng';
import type { DeltaMatrix, Puzzle } from './types';

/** Bitmask of edge-adjacent region labels, per region label. */
export function regionAdjacency(n: number, regions: Uint8Array): number[] {
  const adj = new Array<number>(n).fill(0);
  for (let i = 0; i < n * n; i++) {
    const g = regions[i] as number;
    const c = i % n;
    const right = c < n - 1 ? (regions[i + 1] as number) : g;
    const down = i + n < n * n ? (regions[i + n] as number) : g;
    for (const h of [right, down]) {
      if (h === g) continue;
      adj[g] = (adj[g] as number) | (1 << h);
      adj[h] = (adj[h] as number) | (1 << g);
    }
  }
  return adj;
}

/**
 * Distinct palette index per region label (03 §8.5): regions by degree (desc, ties by label); each
 * takes the unused colour maximising the min ΔE to coloured neighbours; ties by palette order rotated
 * by cyrb128(puzzle.id)[0] mod paletteSize. The tutorial does not use this (fixed colours, 02 §11.5).
 */
export function assignColors(
  puzzle: Pick<Puzzle, 'id' | 'n' | 'regions'>,
  deltaE: DeltaMatrix,
  paletteSize = 12,
): Uint8Array {
  const { n, regions } = puzzle;
  if (deltaE.length !== paletteSize * paletteSize) {
    throw new RangeError(`assignColors: ΔE matrix has ${deltaE.length} entries, expected ${paletteSize * paletteSize}`);
  }
  if (n > paletteSize) throw new RangeError(`assignColors: ${n} regions but only ${paletteSize} colours`);
  const adj = regionAdjacency(n, regions);
  const order: number[] = [];
  for (let g = 0; g < n; g++) order.push(g);
  order.sort((a, b) => popcount(adj[b] as number) - popcount(adj[a] as number) || a - b);
  const rotation = cyrb128(puzzle.id)[0] % paletteSize;
  const colors = new Uint8Array(n);
  const coloured = new Uint8Array(n);
  const used = new Uint8Array(paletteSize);
  for (const g of order) {
    let bestColour = -1;
    let bestScore = -1;
    for (let j = 0; j < paletteSize; j++) {
      const col = (rotation + j) % paletteSize;
      if (used[col]) continue;
      // Min ΔE to already-coloured neighbours; +∞ when none is coloured yet.
      let score = Number.POSITIVE_INFINITY;
      for (let h = 0; h < n; h++) {
        if (!coloured[h] || !(((adj[g] as number) >> h) & 1)) continue;
        score = Math.min(score, deltaE[col * paletteSize + (colors[h] as number)] as number);
      }
      if (score > bestScore) {
        bestScore = score;
        bestColour = col;
      }
    }
    colors[g] = bestColour;
    coloured[g] = 1;
    used[bestColour] = 1;
  }
  return colors;
}
