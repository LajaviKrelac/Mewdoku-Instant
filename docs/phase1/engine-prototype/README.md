# Engine prototype (Phase 1 research code)

This is our own clean-room JavaScript prototype of the puzzle engine. It is the source of every *(measured)* number in [../03-puzzle-engine.md](../03-puzzle-engine.md). It was written from first principles, with no code from the original game or from any other repository. Phase 2 ports it to strict TypeScript in `src/engine/` (see 04 §3), and this folder stays as a reference only.

| File | Purpose |
|---|---|
| `lab/queens.mjs` | Contains the PRNG (cyrb128 + sfc32), Solver A (row DFS), Solver B (unit-MRV), the random king permutation, region growth (eden/balanced/weighted), `repairUnique2`, the grader (L1–L5) and the encoders. |
| `lab/count_kings.mjs` | Counts region-free placements for N = 1…12 (OEIS A002464). |
| `lab/daily.mjs` | Deterministic daily-puzzle demo, with encoding sizes. |
| `lab/bench_*.mjs` | Benchmarks for generation, grade distribution, region-first generation, singletons and worst cases. |
| `checks/xcheck.mjs` | Checks both solvers against an independent brute-force solver. |
| `checks/bias.mjs` | Measures how far randomized-DFS placement is from uniform. |
| `checks/pk.mjs`, `checks/gradecheck.mjs` | Measure how often puzzles need large pigeonhole sets (k) or trial steps, and confirm the grader solves them. |
| `checks/filters.mjs` | Shape-filter acceptance and grade mix (03 §4.5). |
| `checks/tut.mjs` | Checks that the tutorial board (02 §11.5) has a unique solution and grades G1. |

Run with Node 22 or later from the repo root, for example:

```
node docs/phase1/engine-prototype/lab/daily.mjs
node docs/phase1/engine-prototype/checks/tut.mjs
node docs/phase1/engine-prototype/checks/filters.mjs 50
```

The prototype's `int(n)` uses `% n`, which has a small modulo bias, and its `weighted` growth mode uses `Math.pow`. Both are fixed in the production design (03 §7).
