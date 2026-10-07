// Owner: engine
// Production solver "Solver B": unit-MRV on bitboards, stops at `limit` solutions (03 §3.1). PURE.
// Written as plain functions over one state object (no per-node closures): 3–4× faster in V8.
import { fullMask, popcount } from './bits';
import type { SolveResult } from './types';

interface SolverState {
  readonly n: number;
  readonly full: number;
  readonly regions: Uint8Array;
  /** regRows[g * n + r]: columns of region g in row r. */
  readonly regRows: Int32Array;
  /** One frame per depth: cand[depth * n + r] = columns still possible in row r. */
  readonly cand: Int32Array;
  readonly sol: Uint8Array;
  readonly solutions: Uint8Array[];
  readonly limit: number;
  nodes: number;
}

/** Places a cat at (r, c) on frame `depth` into frame `depth + 1`, then recurses. */
function tryCell(s: SolverState, depth: number, r: number, c: number, rows: number, cols: number, regs: number): boolean {
  const { n, cand, regRows } = s;
  const g = s.regions[r * n + c] as number;
  const colBit = 1 << c;
  const near = (colBit | (colBit << 1) | (colBit >>> 1)) & s.full;
  const from = depth * n;
  const to = from + n;
  const gBase = g * n;
  for (let rr = 0; rr < n; rr++) {
    // Clear column c and region g everywhere; row r entirely; columns c−1..c+1 in rows r±1.
    let m = (cand[from + rr] as number) & ~colBit & ~(regRows[gBase + rr] as number);
    if (rr === r) m = 0;
    else if (rr === r - 1 || rr === r + 1) m &= ~near;
    cand[to + rr] = m;
  }
  s.sol[r] = c;
  return search(s, depth + 1, rows | (1 << r), cols | (1 << c), regs | (1 << g));
}

/** Returns true to stop the search (limit reached). */
function search(s: SolverState, depth: number, rows: number, cols: number, regs: number): boolean {
  s.nodes++;
  const { n, cand, regRows } = s;
  if (depth === n) {
    s.solutions.push(s.sol.slice());
    return s.solutions.length >= s.limit;
  }
  const base = depth * n;
  // Most constrained open unit among rows, then columns, then regions (first minimum wins).
  let best = -1;
  let bestCnt = 99;
  let bestType = 0;
  for (let r = 0; r < n; r++) {
    if ((rows >> r) & 1) continue;
    const k = popcount(cand[base + r] as number);
    if (k === 0) return false;
    if (k < bestCnt) {
      bestCnt = k;
      best = r;
      bestType = 0;
    }
  }
  for (let c = 0; c < n; c++) {
    if ((cols >> c) & 1) continue;
    const bit = 1 << c;
    let k = 0;
    for (let r = 0; r < n; r++) if ((cand[base + r] as number) & bit) k++;
    if (k === 0) return false;
    if (k < bestCnt) {
      bestCnt = k;
      best = c;
      bestType = 1;
    }
  }
  for (let g = 0; g < n; g++) {
    if ((regs >> g) & 1) continue;
    const gBase = g * n;
    let k = 0;
    for (let r = 0; r < n; r++) k += popcount((cand[base + r] as number) & (regRows[gBase + r] as number));
    if (k === 0) return false;
    if (k < bestCnt) {
      bestCnt = k;
      best = g;
      bestType = 2;
    }
  }
  if (bestType === 0) {
    let m = cand[base + best] as number;
    while (m !== 0) {
      const low = m & -m;
      if (tryCell(s, depth, best, 31 - Math.clz32(low), rows, cols, regs)) return true;
      m ^= low;
    }
  } else if (bestType === 1) {
    const bit = 1 << best;
    for (let r = 0; r < n; r++) {
      if ((cand[base + r] as number) & bit && tryCell(s, depth, r, best, rows, cols, regs)) return true;
    }
  } else {
    const gBase = best * n;
    for (let r = 0; r < n; r++) {
      let m = (cand[base + r] as number) & (regRows[gBase + r] as number);
      while (m !== 0) {
        const low = m & -m;
        if (tryCell(s, depth, r, 31 - Math.clz32(low), rows, cols, regs)) return true;
        m ^= low;
      }
    }
  }
  return false;
}

/**
 * Counts solutions up to `limit` (default 2: the uniqueness proof).
 * `count` is min(found, 2) as the SolveResult type requires; with a larger `limit`,
 * `solutions.length` is the exact count up to `limit` (tests use this against the brute force).
 */
export function countSolutions(n: number, regions: Uint8Array, limit = 2): SolveResult {
  if (regions.length !== n * n) throw new RangeError(`countSolutions: expected ${n * n} cells`);
  const full = fullMask(n);
  const regRows = new Int32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const g = regions[i] as number;
    if (g >= n) throw new RangeError(`countSolutions: region label ${g} out of range`);
    const r = Math.floor(i / n);
    regRows[g * n + r] = (regRows[g * n + r] as number) | (1 << (i - r * n));
  }
  const cand = new Int32Array((n + 1) * n);
  cand.fill(full, 0, n);
  const s: SolverState = { n, full, regions, regRows, cand, sol: new Uint8Array(n), solutions: [], limit, nodes: 0 };
  if (limit >= 1) search(s, 0, 0, 0, 0);
  const count = (s.solutions.length >= 2 ? 2 : s.solutions.length) as 0 | 1 | 2;
  return { count, solutions: s.solutions, nodes: s.nodes };
}
