import { makeRng, randomKingPerm, growRegions, repairUnique2, grade } from '../lab/queens.mjs';
for (const N of [6, 8]) {
  const rng = makeRng('bias' + N); const cnt = new Map(); const S = N === 6 ? 900000 : 2000000;
  for (let i = 0; i < S; i++) { const p = Array.from(randomKingPerm(N, rng)).join(','); cnt.set(p, (cnt.get(p) || 0) + 1); }
  const vals = [...cnt.values()]; const exp = S / (N === 6 ? 90 : 5242);
  console.log(`N=${N} distinct ${cnt.size} min/exp ${(Math.min(...vals)/exp).toFixed(2)} max/exp ${(Math.max(...vals)/exp).toFixed(2)}`);
}
// daily demo region sizes
const s = 'AAAABBBBAACAADBBCCCAADDECCFAAADDCCCCDADDCCCDDDDDGGCCDDHDGCCCCCDD';
const sz = {}; for (const ch of s) sz[ch] = (sz[ch] || 0) + 1; console.log('daily demo region sizes', JSON.stringify(sz));
