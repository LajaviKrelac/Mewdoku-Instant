import { makeRng, randomKingPerm, growRegions, repairUnique2, grade } from './queens.mjs';
const P = +process.argv[2] || 150;
console.log('N | %puzzles with a 1-cell region | avg #1-cell regions | meanGrade(with) | meanGrade(without) | %L4+ (without singletons)');
for (let N = 6; N <= 12; N++) {
  const rng = makeRng('sing' + N);
  let withS = 0, cnt = 0, gW = 0, gWo = 0, nWo = 0, hardWo = 0;
  for (let p = 0; p < P; p++) {
    let reg, perm;
    for (;;) { perm = randomKingPerm(N, rng); reg = growRegions(N, perm, rng, 'eden'); if (repairUnique2(N, reg, perm, rng).ok) break; }
    const sz = new Array(N).fill(0); for (const g of reg) sz[g]++;
    const s = sz.filter((x) => x === 1).length; cnt += s;
    const gl = grade(N, reg).maxLevel;
    if (s) { withS++; gW += gl; } else { nWo++; gWo += gl; if (gl >= 4) hardWo++; }
  }
  console.log([N, (100 * withS / P).toFixed(0) + '%', (cnt / P).toFixed(2), (gW / Math.max(1, withS)).toFixed(2), (gWo / Math.max(1, nWo)).toFixed(2), (100 * hardWo / Math.max(1, nWo)).toFixed(0) + '%'].join(' | '));
}
