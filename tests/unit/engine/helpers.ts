// Owner: read-only (Phase 2b; was engine)
// Shared helpers for the engine unit tests (03 §11.1): deterministic puzzle sets, random region
// maps and a test-size knob. Not a spec file.
import { canonicalLabels, decodeRegions, decodeSolution } from '../../../src/engine/codec';
import { growRegions, randomKingPerm, repairUnique } from '../../../src/engine/generator';
import { makeRng } from '../../../src/engine/rng';
import type { Puzzle, PuzzleId, Rng } from '../../../src/engine/types';

/**
 * Multiplier for the randomized test sizes. Default 1 keeps `vitest run` quick on a shared machine;
 * CI or a deep local run sets ENGINE_TEST_SCALE=4 (or more) for the full 03 §11.1 counts.
 */
export const SCALE = Math.max(1, Number(process.env.ENGINE_TEST_SCALE ?? '1') || 1);

/** `base` scaled by SCALE (integer). */
export const scaled = (base: number): number => Math.round(base * SCALE);

export function makePuzzle(n: number, regions: Uint8Array, solution: Uint8Array, id: PuzzleId = 'L2'): Puzzle {
  return { id, n, k: 1, regions, solution, givens: [], grade: 1, effort: 0, hard: false };
}

export function puzzleFromStrings(n: number, r: string, s: string, id: PuzzleId = 'L2'): Puzzle {
  return makePuzzle(n, decodeRegions(r, n), decodeSolution(s, n), id);
}

/** The 02 §11.5 tutorial board (4×4, regions A..D, solution columns 1,3,0,2). */
export const TUTORIAL = { n: 4, r: 'ABCCAACCADDCDDDD', s: '1302' } as const;

/** Our own 6×6 board with exactly 14 solutions (03 §11.1 solver fixture). */
export const FOURTEEN = { n: 6, r: 'AABBBBAABBBCAADDDCADDEECFFEEECFFFFCC', count: 14 } as const;

/** A planted map: random king permutation + grown regions (≥ 1 solution, usually many). */
export function plantedMap(n: number, rng: Rng): { regions: Uint8Array; perm: Uint8Array } {
  const perm = randomKingPerm(n, rng);
  const regions = canonicalLabels(growRegions(n, perm, rng, rng.int(2) === 0 ? 'eden' : 'balanced'));
  return { regions, perm };
}

/**
 * A "region-first" map: n random distinct seed cells grown into regions. Unlike plantedMap it may
 * have no solution at all (03 §4.4: 59–68 % of such maps), which the solver tests need.
 */
export function regionFirstMap(n: number, rng: Rng): Uint8Array {
  const cells: number[] = [];
  for (let i = 0; i < n * n; i++) cells.push(i);
  rng.shuffle(cells);
  // growRegions seeds region r at (r, perm[r]); emulate arbitrary seeds by a local flood growth.
  const regions = new Uint8Array(n * n).fill(255);
  for (let g = 0; g < n; g++) regions[cells[g] as number] = g;
  let left = n * n - n;
  while (left > 0) {
    const frontier: [number, number][] = [];
    for (let i = 0; i < n * n; i++) {
      if (regions[i] !== 255) continue;
      const r = Math.floor(i / n);
      const c = i % n;
      const nb = [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1];
      for (const j of nb) if (j >= 0 && regions[j] !== 255) frontier.push([i, regions[j] as number]);
    }
    const [cell, g] = frontier[rng.int(frontier.length)] as [number, number];
    regions[cell] = g;
    left--;
  }
  return canonicalLabels(regions);
}

/** n for the i-th item of a size-cycled set (small boards weighted heavier: they are cheap). */
function sizeFor(i: number, sizes: readonly number[]): number {
  return sizes[i % sizes.length] as number;
}

const uniqueCache = new Map<string, Puzzle[]>();

/**
 * `count` unique puzzles (repaired, not graded or shape-filtered) with sizes cycling through
 * `sizes`. Deterministic for a seed; cached per test worker.
 */
export function uniquePuzzles(seed: string, count: number, sizes: readonly number[]): Puzzle[] {
  const key = `${seed}|${count}|${sizes.join(',')}`;
  const hit = uniqueCache.get(key);
  if (hit) return hit;
  const rng = makeRng(seed);
  const out: Puzzle[] = [];
  for (let i = 0; out.length < count; i++) {
    const n = sizeFor(out.length, sizes);
    const perm = randomKingPerm(n, rng);
    const grown = growRegions(n, perm, rng, rng.int(4) === 0 ? 'eden' : 'balanced');
    if (!repairUnique(n, grown, perm, rng, 400)) continue;
    out.push(makePuzzle(n, canonicalLabels(grown), perm, `L${out.length + 2}`));
    if (i > count * 50) throw new Error('uniquePuzzles: generator is failing');
  }
  uniqueCache.set(key, out);
  return out;
}

/** Sizes for bulk soundness sets: mostly 5–9 (cheap), some 10–12. */
export const BULK_SIZES: readonly number[] = [5, 6, 7, 8, 5, 6, 7, 8, 9, 5, 6, 7, 8, 9, 10, 5, 6, 7, 8, 9, 11, 12];

/** All sizes 5..12 once per cycle. */
export const ALL_SIZES: readonly number[] = [5, 6, 7, 8, 9, 10, 11, 12];

export function isSolution(n: number, regions: Uint8Array, sol: ArrayLike<number>): boolean {
  let cols = 0;
  let regs = 0;
  for (let r = 0; r < n; r++) {
    const c = sol[r] as number;
    if (c < 0 || c >= n || (cols >> c) & 1) return false;
    cols |= 1 << c;
    const g = regions[r * n + c] as number;
    if ((regs >> g) & 1) return false;
    regs |= 1 << g;
    if (r > 0 && Math.abs(c - (sol[r - 1] as number)) < 2) return false;
  }
  return true;
}

export function solutionCellSet(p: Pick<Puzzle, 'n' | 'solution'>): Set<number> {
  const s = new Set<number>();
  for (let r = 0; r < p.n; r++) s.add(r * p.n + (p.solution[r] as number));
  return s;
}
