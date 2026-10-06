import { makeRng, randomKingPerm, growRegions, repairUnique2, solveRows, solveMRV } from './queens.mjs';
for (const N of [12, 14, 16]) {
  const rng = makeRng('worst' + N); const P = N === 12 ? 300 : 60;
  let maxR = 0, maxM = 0, sumR = 0, sumM = 0, genT = 0, maxGen = 0;
  for (let p = 0; p < P; p++) {
    const t0 = performance.now(); let reg, perm;
    for (;;) { perm = randomKingPerm(N, rng); reg = growRegions(N, perm, rng, 'eden'); if (repairUnique2(N, reg, perm, rng, solveMRV, 1000).ok) break; }
    const gt = performance.now() - t0; genT += gt; maxGen = Math.max(maxGen, gt);
    let a = performance.now(); solveRows(N, reg, 2); let b = performance.now(); solveMRV(N, reg, 2); let c = performance.now();
    maxR = Math.max(maxR, b - a); maxM = Math.max(maxM, c - b); sumR += b - a; sumM += c - b;
  }
  console.log(`N=${N}: gen avg ${(genT / P).toFixed(1)}ms max ${maxGen.toFixed(0)}ms | uniqueness proof rowDFS avg ${(sumR / P).toFixed(2)}ms max ${maxR.toFixed(1)}ms | MRV avg ${(sumM / P).toFixed(3)}ms max ${maxM.toFixed(2)}ms`);
}
