import { makeRng, randomKingPerm, growRegions, solveRows, solveMRV, repairUnique, repairUnique2, grade } from './queens.mjs';
const PUZZLES = +process.argv[2] || 100;
const modes = (process.argv[3] || 'eden,balanced').split(',');
const repairName = process.argv[4] || 'r2';
for (const mode of modes) {
  console.log(`\n=== mode ${mode}, repair ${repairName}: attempts per unique puzzle, time, solver cost on UNIQUE puzzles ===`);
  console.log('N | attempts/puzzle | avgMs/puzzle | p95Ms | maxMs | rowsUs(unique) | mrvUs(unique) | rowsNodes | mrvNodes | regionSize min/max avg');
  for (let N = 5; N <= 12; N++) {
    const rng = makeRng(`g2-${mode}-${N}`);
    let attempts = 0; const times = []; let rowsT = 0, mrvT = 0, rowsN = 0, mrvN = 0, minS = 0, maxS = 0;
    for (let p = 0; p < PUZZLES; p++) {
      const t0 = performance.now();
      let reg, perm;
      for (;;) {
        attempts++;
        perm = randomKingPerm(N, rng);
        reg = growRegions(N, perm, rng, mode);
        const rep = repairName === 'r1' ? repairUnique(N, reg, perm, rng) : repairUnique2(N, reg, perm, rng);
        if (rep.ok) break;
      }
      times.push(performance.now() - t0);
      const s1 = {}, s2 = {};
      let a = performance.now(); const x = solveRows(N, reg, 2, s1); let b = performance.now(); const y = solveMRV(N, reg, 2, s2); let c = performance.now();
      if (x.length !== 1 || y.length !== 1) console.log('BUG');
      rowsT += b - a; mrvT += c - b; rowsN += s1.nodes; mrvN += s2.nodes;
      const sz = new Array(N).fill(0); for (const g of reg) sz[g]++; minS += Math.min(...sz); maxS += Math.max(...sz);
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log([N, (attempts / PUZZLES).toFixed(2), avg.toFixed(2), times[Math.floor(0.95 * times.length)].toFixed(1), times[times.length - 1].toFixed(1), (1000 * rowsT / PUZZLES).toFixed(0), (1000 * mrvT / PUZZLES).toFixed(0), (rowsN / PUZZLES).toFixed(0), (mrvN / PUZZLES).toFixed(0), `${(minS / PUZZLES).toFixed(1)}/${(maxS / PUZZLES).toFixed(1)}`].join(' | '));
  }
}
