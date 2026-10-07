// Owner: engine
// Generator pipeline (03 §4): plant a king permutation, grow regions, repair uniqueness, filter.
// Deterministic for a seed (03 §7): integer arithmetic only, index-ordered iteration. PURE.
import { canonicalLabels, encodeRegions, encodeSolution, MAX_N, MIN_N } from './codec';
import { canonicalKey, shapeOk } from './filters';
import { grade } from './grader';
import { makeRng } from './rng';
import { countSolutions } from './solver';
import type { GenResult, GenSpec, GrowthMode, LevelRecord, Rng, SizeWeight } from './types';

/**
 * Engine-side defaults for the GenSpec fields that are optional (03 §4.3–4.5). They mirror
 * app/config.ts `cfg.gen` (the engine may not import app/, 04 §2); tests/unit/engine asserts the
 * mirror. Changing any of them changes generator output and needs a generator version bump.
 */
export const GEN_DEFAULTS = Object.freeze({
  /** 'mixed' growth: eden when rng.int(edenOneIn) === 0 (25 %), else balanced. */
  edenOneIn: 4,
  /** repairUnique2 iteration cap (03 §4.4). */
  repairMaxIter: 400,
  /** sizePool specs: minimum region size applies from this n (03 §4.5). */
  minRegionFromN: 6,
  /** sizePool specs: largest region ≤ ⌈2.5 n⌉, kept as an integer ×2 (03 §4.5). */
  maxRegionFactorX2: 5,
});

/** Optional, non-serialisable inputs to generate() (the content pipeline's duplicate check). */
export interface GenerateOptions {
  /** Canonical keys already used (03 §8.4); a duplicate is rejected and the stream continues. */
  readonly seen?: { has(key: string): boolean };
}

/** Randomized row DFS with |c − prev| ≥ 2 (03 §4.2). */
export function randomKingPerm(n: number, rng: Rng): Uint8Array {
  const p = new Uint8Array(n);
  const dfs = (r: number, used: number, prev: number): boolean => {
    if (r === n) return true;
    const order: number[] = [];
    for (let c = 0; c < n; c++) order.push(c);
    rng.shuffle(order);
    for (const c of order) {
      if ((used >> c) & 1) continue;
      if (c === prev - 1 || c === prev + 1) continue;
      p[r] = c;
      if (dfs(r + 1, used | (1 << c), c)) return true;
    }
    return false;
  };
  if (!dfs(0, 0, -10)) throw new RangeError(`randomKingPerm: no king permutation for n=${n}`);
  return p;
}

const UNASSIGNED = 255;

/** Bitmask of the region labels orthogonally adjacent to cell i (UNASSIGNED neighbours ignored). */
function neighbourLabels(n: number, regions: Uint8Array, i: number): number {
  const r = Math.floor(i / n);
  const c = i - r * n;
  let mask = 0;
  const add = (j: number): void => {
    const g = regions[j] as number;
    if (g !== UNASSIGNED) mask |= 1 << g;
  };
  if (r > 0) add(i - n);
  if (c > 0) add(i - 1);
  if (c < n - 1) add(i + 1);
  if (r < n - 1) add(i + n);
  return mask;
}

/**
 * Grows n regions from the n cat cells (03 §4.3 frontier rules). Returns labels per cell; the cat
 * of row r seeds region r (labels are canonicalised later, 03 §2).
 */
export function growRegions(n: number, perm: Uint8Array, rng: Rng, mode: GrowthMode): Uint8Array {
  const total = n * n;
  const regions = new Uint8Array(total).fill(UNASSIGNED);
  const size = new Int32Array(n);
  for (let r = 0; r < n; r++) {
    regions[r * n + (perm[r] as number)] = r;
    size[r] = 1;
  }
  const pairCell = new Int32Array(total * 4);
  const pairReg = new Int32Array(total * 4);
  for (let remaining = total - n; remaining > 0; remaining--) {
    // Frontier: (cell, region) pairs, cell index ascending, then region label ascending.
    let len = 0;
    for (let i = 0; i < total; i++) {
      if (regions[i] !== UNASSIGNED) continue;
      let m = neighbourLabels(n, regions, i);
      while (m !== 0) {
        const low = m & -m;
        pairCell[len] = i;
        pairReg[len] = 31 - Math.clz32(low);
        len++;
        m ^= low;
      }
    }
    if (len === 0) throw new Error('growRegions: empty frontier'); // unreachable: the grid is connected
    let pick = 0;
    if (mode === 'eden') {
      pick = rng.int(len);
    } else {
      // balanced: smallest size among regions with a frontier pair, then uniform among its pairs.
      let minSize = Number.MAX_SAFE_INTEGER;
      for (let k = 0; k < len; k++) minSize = Math.min(minSize, size[pairReg[k] as number] as number);
      let count = 0;
      for (let k = 0; k < len; k++) if (size[pairReg[k] as number] === minSize) count++;
      let t = rng.int(count);
      for (let k = 0; k < len; k++) {
        if (size[pairReg[k] as number] !== minSize) continue;
        if (t === 0) {
          pick = k;
          break;
        }
        t--;
      }
    }
    const g = pairReg[pick] as number;
    regions[pairCell[pick] as number] = g;
    size[g] = (size[g] as number) + 1;
  }
  return regions;
}

/** Reusable flood-fill buffers for the connectivity checks of one repair run (no per-check allocation). */
interface FloodScratch {
  readonly seen: Uint8Array;
  readonly stack: Int32Array;
  /** Incremented per check, so `seen` never needs clearing (wraps after 255 checks). */
  stamp: number;
}

function floodScratch(total: number): FloodScratch {
  return { seen: new Uint8Array(total), stack: new Int32Array(total), stamp: 0 };
}

function connectedWithout(n: number, regions: Uint8Array, g: number, excluded: number, fs: FloodScratch): boolean {
  const total = n * n;
  let start = -1;
  let count = 0;
  for (let i = 0; i < total; i++) {
    if (regions[i] === g && i !== excluded) {
      count++;
      if (start < 0) start = i;
    }
  }
  if (count === 0) return false;
  const { seen, stack } = fs;
  if (fs.stamp === 255) {
    seen.fill(0);
    fs.stamp = 0;
  }
  const mark = ++fs.stamp;
  let sp = 0;
  stack[sp++] = start;
  seen[start] = mark;
  let reached = 0;
  while (sp > 0) {
    const i = stack[--sp] as number;
    reached++;
    const r = Math.floor(i / n);
    const c = i - r * n;
    for (let d = 0; d < 4; d++) {
      let j: number;
      if (d === 0) {
        if (r === 0) continue;
        j = i - n;
      } else if (d === 1) {
        if (r === n - 1) continue;
        j = i + n;
      } else if (d === 2) {
        if (c === 0) continue;
        j = i - 1;
      } else {
        if (c === n - 1) continue;
        j = i + 1;
      }
      if (seen[j] !== mark && j !== excluded && regions[j] === g) {
        seen[j] = mark;
        stack[sp++] = j;
      }
    }
  }
  return reached === count;
}

/** true when region g stays non-empty and 4-connected once `excluded` leaves it. */
export function regionConnectedWithout(n: number, regions: Uint8Array, g: number, excluded: number): boolean {
  return connectedWithout(n, regions, g, excluded, floodScratch(n * n));
}

/** Packs a move (cell x joins region g2) into one integer: x * 16 + g2. */
const packMove = (x: number, g2: number): number => x * 16 + g2;

/** Applies the first move (in list order) that keeps the losing region connected. */
function applyFirstMove(n: number, regions: Uint8Array, moves: readonly number[], fs: FloodScratch): boolean {
  for (const mv of moves) {
    const x = Math.floor(mv / 16);
    const g2 = mv - x * 16;
    if (!connectedWithout(n, regions, regions[x] as number, x, fs)) continue;
    regions[x] = g2;
    return true;
  }
  return false;
}

/** Moves of cell x into each distinct orthogonally adjacent region (label ascending). */
function pushMovesOf(n: number, regions: Uint8Array, x: number, out: number[]): void {
  let m = neighbourLabels(n, regions, x) & ~(1 << (regions[x] as number));
  while (m !== 0) {
    const low = m & -m;
    out.push(packMove(x, 31 - Math.clz32(low)));
    m ^= low;
  }
}

/** "repairUnique2" (03 §4.4): mutates `regions` until exactly one solution; false on failure. */
export function repairUnique(n: number, regions: Uint8Array, perm: Uint8Array, rng: Rng, maxIter = 400): boolean {
  const total = n * n;
  const isSolCat = new Uint8Array(total);
  for (let r = 0; r < n; r++) isSolCat[r * n + (perm[r] as number)] = 1;
  const fs = floodScratch(total);
  for (let iter = 0; iter < maxIter; iter++) {
    const res = countSolutions(n, regions, 2);
    if (res.count === 1) return true;
    if (res.count === 0) return false; // unreachable while the planted solution survives
    const s2 = res.solutions.find((s) => s.some((c, r) => c !== perm[r]));
    if (s2 === undefined) return false;
    // Targeted moves: S2's cat cells in rows where S2 differs from S1 (03 §4.4).
    const moves: number[] = [];
    for (let r = 0; r < n; r++) if (s2[r] !== perm[r]) pushMovesOf(n, regions, r * n + (s2[r] as number), moves);
    rng.shuffle(moves);
    if (applyFirstMove(n, regions, moves, fs)) continue;
    // Escape: a random boundary move of any cell that is not an S1 cat.
    const escapes: number[] = [];
    for (let i = 0; i < total; i++) if (!isSolCat[i]) pushMovesOf(n, regions, i, escapes);
    rng.shuffle(escapes);
    if (!applyFirstMove(n, regions, escapes, fs)) return false;
  }
  return false;
}

/** Weighted size pick on the stream (02 §11.4): x = rng.int(Σ weights), walked over the pool in order. */
function pickSize(pool: readonly SizeWeight[], rng: Rng): number {
  let total = 0;
  for (const [, w] of pool) total += w;
  let x = rng.int(total);
  for (const [n, w] of pool) {
    if (x < w) return n;
    x -= w;
  }
  throw new RangeError('generate: empty size pool');
}

/** Shape limits for the drawn n (03 §4.5). Fixed-n specs carry them directly. */
function limitsFor(spec: GenSpec, n: number): { minRegion: number; maxRegion: number } {
  if (!spec.sizePool) return { minRegion: spec.minRegion, maxRegion: spec.maxRegion };
  const row = spec.sizeLimits?.find(([size]) => size === n);
  if (row) return { minRegion: row[1], maxRegion: row[2] };
  return {
    minRegion: n >= GEN_DEFAULTS.minRegionFromN ? spec.minRegion : 1,
    maxRegion: (GEN_DEFAULTS.maxRegionFactorX2 * n + 1) >> 1,
  };
}

/**
 * generate(spec) (03 §8.3): one RNG stream per spec.seed; with spec.sizePool the first draw picks n
 * (02 §11.4). Applies shape filters and the grade band (G5 at most spec.allowG5Steps steps).
 * Runs in Node scripts and in the engine worker. `opts.seen` adds the duplicate check (03 §8.4).
 */
export function generate(spec: GenSpec, opts: GenerateOptions = {}): GenResult {
  const rng = makeRng(spec.seed);
  const n = spec.sizePool && spec.sizePool.length > 0 ? pickSize(spec.sizePool, rng) : spec.n;
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) throw new RangeError(`generate: board size ${n} outside ${MIN_N}..${MAX_N}`);
  const limits = limitsFor(spec, n);
  const edenOneIn = spec.edenOneIn ?? GEN_DEFAULTS.edenOneIn;
  const repairMaxIter = spec.repairMaxIter ?? GEN_DEFAULTS.repairMaxIter;
  const [lo, hi] = spec.gradeBand;
  for (let attempt = 1; attempt <= spec.maxAttempts; attempt++) {
    const perm = randomKingPerm(n, rng);
    const mode: GrowthMode =
      spec.growth === 'mixed' ? (rng.int(edenOneIn) === 0 ? 'eden' : 'balanced') : spec.growth;
    const grown = growRegions(n, perm, rng, mode);
    if (!repairUnique(n, grown, perm, rng, repairMaxIter)) continue;
    if (!shapeOk(n, grown, limits)) continue;
    // Grade the canonical labelling: region scan order depends on labels, and CI re-grades records.
    const regions = canonicalLabels(grown);
    const g = grade(n, regions);
    if (g.grade === 6 || g.grade < lo || g.grade > hi) continue;
    if (g.grade === 5 && g.counts[5] > spec.allowG5Steps) continue;
    if (opts.seen && opts.seen.has(canonicalKey(n, regions))) continue;
    const record: LevelRecord = { n, r: encodeRegions(regions), s: encodeSolution(perm), g: g.grade, e: g.effort, h: 0 };
    return { ok: true, record, attempts: attempt, grade: g };
  }
  return { ok: false, attempts: spec.maxAttempts, reason: 'max_attempts' };
}
