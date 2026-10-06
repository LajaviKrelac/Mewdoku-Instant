import { makeRng, randomKingPerm, growRegions, repairUnique2, makeGrader, grade } from '../lab/queens.mjs';
// Does a grader-solved board equal the planted unique solution? (re-implements grade loop is not possible without internals; instead check grade() solved flag vs uniqueness)
const rng = makeRng('gc');
let solved = 0, n = 0, stuck = 0;
for (let N = 5; N <= 12; N++) for (let t = 0; t < 40; t++) {
  let reg, perm; for (;;) { perm = randomKingPerm(N, rng); reg = growRegions(N, perm, rng, 'balanced'); if (repairUnique2(N, reg, perm, rng).ok) break; }
  const g = grade(N, reg); n++; if (g.solved) solved++; if (g.maxLevel === 6) stuck++;
}
console.log('balanced puzzles', n, 'solved by grader', solved, 'stuck(L6)', stuck);
