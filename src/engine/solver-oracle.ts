// Owner: read-only (Phase 2b; was engine)
// Test oracles (03 §3.2). NEVER imported by the app bundle (enforced by tests/unit/layering.spec.ts).
// Deliberately shares no code with solver.ts so the cross-checks are independent.
import type { SolveResult } from './types';

/**
 * "Solver A": row-by-row DFS with column/region/prev-column masks and a reachability prune.
 * `count` is min(found, 2); `solutions.length` is the exact count up to `limit`.
 */
export function solveRows(n: number, regions: Uint8Array, limit = 2): SolveResult {
  const solutions: Uint8Array[] = [];
  const cols = new Uint8Array(n);
  // maxRow[g] = last row holding a cell of region g (-1 when the region is empty).
  const maxRow = new Int8Array(n).fill(-1);
  for (let i = 0; i < n * n; i++) {
    const g = regions[i] as number;
    if (g >= n) throw new RangeError(`solveRows: region label ${g} out of range`);
    const r = Math.floor(i / n);
    if (r > (maxRow[g] as number)) maxRow[g] = r;
  }
  let nodes = 0;
  const dfs = (r: number, colMask: number, regMask: number, prev: number): boolean => {
    nodes++;
    if (r === n) {
      solutions.push(cols.slice());
      return solutions.length >= limit;
    }
    // Prune: every region still without a cat must have a cell in row r or below.
    for (let g = 0; g < n; g++) if (!((regMask >> g) & 1) && (maxRow[g] as number) < r) return false;
    for (let c = 0; c < n; c++) {
      if ((colMask >> c) & 1) continue;
      if (c === prev - 1 || c === prev + 1) continue;
      const g = regions[r * n + c] as number;
      if ((regMask >> g) & 1) continue;
      cols[r] = c;
      if (dfs(r + 1, colMask | (1 << c), regMask | (1 << g), c)) return true;
    }
    return false;
  };
  if (limit >= 1) dfs(0, 0, 0, -10);
  const count = (solutions.length >= 2 ? 2 : solutions.length) as 0 | 1 | 2;
  return { count, solutions, nodes };
}

/** Plain permutation enumeration with no shared code; returns the exact count (capped at `limit`). */
export function bruteForceCount(n: number, regions: Uint8Array, limit = Number.MAX_SAFE_INTEGER): number {
  const usedCol: boolean[] = new Array<boolean>(n).fill(false);
  const usedReg: boolean[] = new Array<boolean>(256).fill(false);
  const perm: number[] = new Array<number>(n).fill(0);
  let count = 0;
  const rec = (r: number): void => {
    if (count >= limit) return;
    if (r === n) {
      count++;
      return;
    }
    for (let c = 0; c < n; c++) {
      if (usedCol[c]) continue;
      if (r > 0 && Math.abs(c - (perm[r - 1] as number)) < 2) continue;
      const g = regions[r * n + c] as number;
      if (usedReg[g]) continue;
      usedCol[c] = true;
      usedReg[g] = true;
      perm[r] = c;
      rec(r + 1);
      usedCol[c] = false;
      usedReg[g] = false;
    }
  };
  rec(0);
  return count;
}
