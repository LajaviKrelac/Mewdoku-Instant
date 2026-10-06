// Independent brute-force cross-check of lab solvers (does not reuse lab solver code).
import { makeRng, solveMRV, solveRows, randomKingPerm, growRegions, repairUnique2 } from '../lab/queens.mjs';
function brute(N, reg) { // count all solutions via plain permutation enumeration
  let count = 0; const used = new Array(N).fill(false), usedReg = new Array(N).fill(false);
  (function rec(r, prev) {
    if (r === N) { count++; return; }
    for (let c = 0; c < N; c++) {
      if (used[c] || (r > 0 && Math.abs(c - prev) < 2)) continue;
      const g = reg[r * N + c]; if (usedReg[g]) continue;
      used[c] = usedReg[g] = true; rec(r + 1, c); used[c] = usedReg[g] = false;
    }
  })(0, -10);
  return count;
}
// random region maps (seeded Voronoi-ish, any connectivity) to stress solvers
const rng = makeRng('xcheck');
let mism = 0, total = 0, uniq = 0;
for (let N = 4; N <= 8; N++) for (let t = 0; t < 400; t++) {
  const reg = new Int32Array(N * N);
  for (let i = 0; i < N * N; i++) reg[i] = rng.int(N);
  for (let g = 0; g < N; g++) reg[rng.int(N * N)] = g; // may still miss some ids, fine
  const b = brute(N, reg);
  const m = solveMRV(N, reg, 1e9).length, r = solveRows(N, reg, 1e9).length;
  total++; if (b === 1) uniq++;
  if (b !== m || b !== r) { mism++; if (mism < 5) console.log('MISMATCH', N, b, m, r); }
}
console.log('random maps checked', total, 'mismatches', mism, 'unique', uniq);
// generated puzzles: verify uniqueness with brute force and planted solution validity
let bad = 0, n = 0;
for (let N = 5; N <= 9; N++) for (let t = 0; t < 60; t++) {
  const perm = randomKingPerm(N, rng); const reg = growRegions(N, perm, rng, 'eden');
  const res = repairUnique2(N, reg, perm, rng); if (!res.ok) continue;
  n++; const b = brute(N, reg); if (b !== 1) { bad++; console.log('NOT UNIQUE', N, b); }
}
console.log('generated puzzles brute-verified', n, 'non-unique', bad);
// samimsu community level 1 (6x6) solution count claim = 14
const L1 = ['AAABCD','AAABCD','BBBBCD','BBECCD','FEECCD','FFEECC'];
const reg1 = Int32Array.from(L1.join('').split('').map(ch => ch.charCodeAt(0) - 65));
console.log('community level1 brute count', brute(6, reg1));
