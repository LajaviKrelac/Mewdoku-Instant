import { makeRng, randomKingPerm, growRegions, solveRows, solveMRV, repairUnique, grade } from './queens.mjs';
const TRIALS = +process.argv[2] || 200;
const modes = (process.argv[3] || 'eden,balanced,weighted').split(',');
for (const mode of modes) {
  console.log(`\n=== growth mode: ${mode} ===`);
  console.log('N | initUnique% | init0sol? | repairOK% | avgRepairIters | avgGenMs | maxGenMs | rowsNodes(avg) | mrvNodes(avg) | rowsUs | mrvUs | mismatches');
  for (let N = 5; N <= 12; N++) {
    const rng = makeRng(`bench-${mode}-${N}`);
    let initUnique = 0, ok = 0, iters = 0, genMs = 0, maxMs = 0, rowsNodes = 0, mrvNodes = 0, rowsT = 0, mrvT = 0, mism = 0, n = 0;
    for (let t = 0; t < TRIALS; t++) {
      const t0 = performance.now();
      const perm = randomKingPerm(N, rng);
      const reg = growRegions(N, perm, rng, mode);
      // solver comparison on the raw grown map
      let s1 = {}, s2 = {};
      let a = performance.now(); const r1 = solveRows(N, reg, 2, s1); let b = performance.now(); const r2 = solveMRV(N, reg, 2, s2); let c = performance.now();
      rowsT += b - a; mrvT += c - b; rowsNodes += s1.nodes; mrvNodes += s2.nodes;
      if (r1.length !== r2.length) mism++;
      if (r2.length === 1) initUnique++;
      const rep = repairUnique(N, reg, perm, rng);
      const ms = performance.now() - t0;
      if (rep.ok) { ok++; iters += rep.iters; }
      genMs += ms; maxMs = Math.max(maxMs, ms); n++;
    }
    console.log([N, (100 * initUnique / n).toFixed(1), '-', (100 * ok / n).toFixed(1), (iters / Math.max(1, ok)).toFixed(2), (genMs / n).toFixed(2), maxMs.toFixed(1), (rowsNodes / n).toFixed(0), (mrvNodes / n).toFixed(0), (1000 * rowsT / n).toFixed(0), (1000 * mrvT / n).toFixed(0), mism].join(' | '));
  }
}
