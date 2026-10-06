import { makeRng, randomKingPerm, growRegions, repairUnique2, grade } from '../lab/queens.mjs';
console.log('N | %maxLevel<=3 | %needs pigeon k>=3 | %needs trial');
for (let N = 5; N <= 12; N++) {
  const rng = makeRng('pk' + N); let le3 = 0, k3 = 0, tr = 0; const P = 100;
  for (let p = 0; p < P; p++) {
    let reg, perm; for (;;) { perm = randomKingPerm(N, rng); reg = growRegions(N, perm, rng, 'eden'); if (repairUnique2(N, reg, perm, rng).ok) break; }
    const g = grade(N, reg); if (g.maxLevel <= 3) le3++; if (g.used.pigeonMaxK >= 3) k3++; if (g.used.trial) tr++;
  }
  console.log([N, le3 + '%', k3 + '%', tr + '%'].join(' | '));
}
