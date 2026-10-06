import { makeRng, randomKingPerm, growRegions, repairUnique2, grade, makeGrader } from './queens.mjs';
const PUZZLES = +process.argv[2] || 100;
const modes = (process.argv[3] || 'eden,balanced').split(',');
for (const mode of modes) {
  console.log(`\n=== grade distribution, mode ${mode} (levels: 1 singles, 2 confinement, 3 attack/shared-neighbour, 4 k-pigeonhole, 5 trial depth-1, 6 stuck) ===`);
  console.log('N | L1 | L2 | L3 | L4 | L5 | L6 | avg trials(L5 uses) | avg pigeon uses | max pigeon k | gradeMs avg');
  for (let N = 5; N <= 12; N++) {
    const rng = makeRng(`gr-${mode}-${N}`);
    const hist = [0, 0, 0, 0, 0, 0, 0]; let trials = 0, pig = 0, pk = 0, gms = 0;
    for (let p = 0; p < PUZZLES; p++) {
      let reg, perm;
      for (;;) { perm = randomKingPerm(N, rng); reg = growRegions(N, perm, rng, mode); if (repairUnique2(N, reg, perm, rng).ok) break; }
      const t0 = performance.now(); const g = grade(N, reg); gms += performance.now() - t0;
      hist[g.maxLevel]++; trials += g.used.trial; pig += g.used.pigeon; pk = Math.max(pk, g.used.pigeonMaxK);
      if (g.maxLevel < 6 && !g.solved) console.log('GRADER BUG', N);
    }
    console.log([N, ...hist.slice(1).map((x) => (100 * x / PUZZLES).toFixed(0) + '%'), (trials / PUZZLES).toFixed(2), (pig / PUZZLES).toFixed(2), pk, (gms / PUZZLES).toFixed(1)].join(' | '));
  }
}
