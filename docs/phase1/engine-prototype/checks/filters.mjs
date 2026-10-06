import { makeRng, randomKingPerm, growRegions, repairUnique2, grade } from '../lab/queens.mjs';
// Measure acceptance of shape filters: minRegion>=2, maxRegion<=ceil(2.5N), and grade distribution among accepted.
const P = +process.argv[2] || 120;
console.log('mode | N | raw/s | pass shape% | accepted: L<=2 | L3 | L4 | L5 | ms per accepted');
for (const mode of ['eden', 'balanced']) for (let N = 5; N <= 12; N++) {
  const rng = makeRng(`flt-${mode}-${N}`);
  let raw = 0, pass = 0; const h = [0,0,0,0,0,0,0]; const t0 = performance.now();
  while (pass < P && raw < P * 60) {
    let reg, perm; for (;;) { perm = randomKingPerm(N, rng); reg = growRegions(N, perm, rng, mode); if (repairUnique2(N, reg, perm, rng).ok) break; }
    raw++;
    const sz = new Array(N).fill(0); for (const g of reg) sz[g]++;
    const mn = Math.min(...sz), mx = Math.max(...sz);
    if (mn < 2 || mx > Math.ceil(2.5 * N)) continue;
    pass++; h[grade(N, reg).maxLevel]++;
  }
  const ms = (performance.now() - t0) / Math.max(pass, 1);
  const pc = (x) => (100 * x / Math.max(pass,1)).toFixed(0) + '%';
  console.log([mode, N, raw, (100*pass/raw).toFixed(1)+'%', pc(h[1]+h[2]), pc(h[3]), pc(h[4]), pc(h[5]+h[6]), ms.toFixed(1)].join(' | '));
}
