# 03 · Puzzle engine: rules, solver, generator, grader, level pipeline

Status: Phase 1 deliverable · Date: 2026-10-06

This document specifies the logic core of the rebuild: the formal rules, a solver that counts solutions up to 2, a generator, a human-technique difficulty grader that also produces the hints, a seeded PRNG, the offline level-pack pipeline, the data format, performance targets and the test plan.

All of it is **our own work**. A working JavaScript prototype, written and measured during Phase 1, is committed at [`engine-prototype/`](engine-prototype/). Every number in this file marked *(measured)* was produced by that prototype on a 4-vCPU Xeon at 2.1 GHz under Node 22. Phase 2 ports the prototype to strict TypeScript in `src/engine/` (see 04 §3).

Confidence tags follow [01](01-game-deconstruction.md): *confirmed* means verified in code we read or reproduced by our own measurement; *inferred* means our own design.

## 1. Formal model

### 1.1 Instance and solution

- An **instance** is `P = (N, R)` where `N ∈ [4, 12]` and `R : {0..N−1}² → {0..N−1}` is the region map. Every region must be non-empty and 4-connected.
- A **solution** is a permutation `p` of `{0..N−1}`, where `p[r]` is the column of the cat in row `r`, such that:
  1. `|p[r] − p[r+1]| ≥ 2` for all `r < N−1`. This is the no-touch rule; one cat per row and per column already rules out orthogonal neighbours, so only diagonal neighbours in consecutive rows need checking.
  2. The regions `R(r, p[r])` are pairwise distinct, which means exactly one cat per region.
- A puzzle is **well-posed** when it has exactly one solution.

*confirmed.* The same formulation appears in open-source Queens and Star Battle solvers ([samimsu-smt], [cspuz-sb]).

### 1.2 Useful equivalences

- No-touch is the same as "every 2×2 window holds at most one cat".
- With N cats and N regions, requiring **at least one** cat per region already forces exactly one (pigeonhole). Solvers only need an "at least one" constraint for regions.
- SAT encoding size at N = 12 (corrected by fact-check): 144 Boolean variables and **1 862 clauses**. That is 36 at-least-one clauses for rows, columns and regions; 24 × 66 pairwise at-most-one clauses for rows and columns (none needed for regions); and 242 diagonal clauses. This encoding is used only as an offline cross-check. **We do not ship SAT or SMT code** (z3-wasm is unnecessary).

### 1.3 Counting (minimum board size)

The number of region-free placements (one cat per row and column, no touching) is OEIS A002464 ([oeis]). *(measured, `lab/count_kings.mjs`)*

| N | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| placements | 1 | 0 | 0 | 2 | 14 | 90 | 646 | 5 242 | 47 622 | 479 306 | 5 296 790 | 63 779 034 |

What follows from this:

- 2×2 and 3×3 boards are impossible.
- 4×4 has only two (mirror-image) placements, so it is only useful as a tutorial.
- 5×5 is the smallest board with real choice.
- The region map must cut these candidates down to exactly one.

### 1.4 Generalisation

This puzzle is 1-star Star Battle. A general Star Battle puzzle has k stars per row, column and region ([cspuz-sb]). The engine types carry `k = 1` as a constant so that a later variant can be added without changing the data format (Phase 3 hook).

## 2. Representations

- Cell index: `i = r·N + c`. Since N ≤ 12, a row or column set fits in one 32-bit integer bitmask.
- Region map: `Uint8Array(N·N)` holding labels `0..N−1`. Labels are **canonical**: numbered by first appearance in row-major order.
- Solution: `Uint8Array(N)` with `sol[r] = c`.
- Precomputed per puzzle:
  - `regRows[g][r]`: bitmask of the columns of region g in row r;
  - `attack[i]`: the cells eliminated by a cat at i (same row, column or region, or king-adjacent);
  - `unitsOf[i] = [row, N + col, 2N + region]`.
- Popcount uses a branch-free SWAR helper (`bits.ts`).

## 3. Solver

### 3.1 Algorithm (production: "Solver B", unit-MRV on bitboards)

```ts
// countSolutions(n, regions, limit = 2) → { count, sols: Uint8Array[], nodes }
// cand[r] = bitmask of columns still possible in row r
function rec(cand, doneRows, doneCols, doneRegs, depth):
  if depth == n: record sol; return count >= limit           // stop early at 2
  // Pick the most constrained open unit among the 3n units (rows, columns, regions)
  for each open row r:     k = popcount(cand[r]);                           if k == 0 return false
  for each open col c:     k = #rows r with bit c in cand[r];               if k == 0 return false
  for each open region g:  k = Σ_r popcount(cand[r] & regRows[g][r]);       if k == 0 return false
  best = unit with the smallest k
  for each candidate cell (r, c) of best:
    nc = copy(cand); place(nc, r, c)     // clear row r; clear column c and region g everywhere;
                                         // in rows r±1, also clear columns c−1, c, c+1
    sol[r] = c
    if rec(nc, doneRows|1<<r, doneCols|1<<c, doneRegs|1<<g, depth+1): return true
  return false
```

This is Knuth's Algorithm X with the minimum-remaining-values rule ([knuth-dlx]), written on bitboards instead of dancing links. *confirmed (prototype `solveMRV`)*

### 3.2 Oracles (tests only)

- **Solver A**: row-by-row DFS with column, region and previous-column masks, plus a "region still reachable" prune (`solveRows`).
- **Brute force**: plain permutation enumeration with no shared code (`checks/xcheck.mjs`).
- **Agreement so far** *(measured)*:
  - A, B and brute force agree on 2 000 random region maps with N = 4–8, with 0 mismatches.
  - A and B agree on 7 200 generated instances.
  - All 288 generated puzzles with N = 5–9 were confirmed unique by brute force.

### 3.3 Measured performance (desktop Node, uniqueness proof with limit = 2)

| N | Solver B average | Solver B nodes (average) | Solver A average | Notes |
|---|---|---|---|---|
| 5–9 | 6–30 µs | 9–60 | 11–53 µs | — |
| 10 | ~40 µs | ~80 | 151 µs | — |
| 11 | ~60 µs | ~100 | 512 µs | — |
| 12 | 82 µs (worst 0.59 ms) | 110–191 | 1.6–3.5 ms (worst 15.6 ms) | — |
| 14 / 16 | worst 6.5 ms / 52 ms | — | worst 210 ms / 8.75 s | **Out of scope:** we cap N at 12 |

Mobile WebViews are probably 3–10× slower (inferred; not measured). Even so, uniqueness checks fit easily in a frame.

**Anti-pattern to avoid**, seen in a popular open-source Queens clone ([samimsu-solve]): checking regions only at the leaves. That makes the search walk all of A002464(N) placements (63.8 M at N = 12). The clone also uses z3 only in an offline Node script, not in its browser worker.

## 4. Generator

### 4.1 Pipeline

```
(a) plant a random valid placement p        → guarantees at least 1 solution
(b) grow N regions from the N cat cells      → random 4-connected partition
(c) uniqueness repair                        → targeted moves until exactly 1 solution
(d) filters: shape, grade band, dedup        → accept, or go back to (a)
```

### 4.2 (a) Random king permutation

Randomized DFS over rows: shuffle the column order in each row and require `|c − prev| ≥ 2`. It always succeeds for N ≥ 4 and takes microseconds.

Note *(measured)*: this is **not uniform**. At N = 8 the most frequent placement appears 3.72× as often as uniform sampling would give, and the least frequent 0.51×. Region growth adds far more randomness, so this is acceptable for v1.

[DECISION] Optional v2: sample uniformly by unranking an index `k < A002464(N)`. A counting DP over `(row, usedMask, prevCol)` has 2¹² · 12 states per row at N = 12.

### 4.3 (b) Region growth

The N regions start as single cells at the N cat positions. Each step assigns one unassigned cell that is orthogonally adjacent to a region, until no unassigned cells remain.

| Mode | Rule for picking the next (cell, region) pair | Character *(measured)* |
|---|---|---|
| `eden` | Uniformly random frontier pair | Very uneven sizes (smallest 1.2–1.7 cells, largest 9–33). Many single-cell regions. |
| `balanced` | Random pair among those touching a currently **smallest** region | More even (smallest 1.6–2.5, largest 7.8–29). Higher filter pass rate (§4.5). |
| `weighted` | Weight ∝ size⁻⁴, as in cspuz `_initial_blocks` ([cspuz-sb]) | Uses `Math.pow`, a floating-point function. **Not allowed** where determinism matters (§7). |

[DECISION] Production uses **`balanced` 75 % / `eden` 25 %** for shape variety. The choice is made per attempt by the seeded RNG. Both modes use integer arithmetic only.

Precise rules, which are needed for byte-identical output:

- The **frontier** is the list of pairs `(cell, region)` where `cell` is unassigned and orthogonally adjacent to a cell of `region`. It is rebuilt in a fixed order: cell index ascending, then region label ascending. A cell next to two regions appears twice.
- `eden`: pick `frontier[rng.int(frontier.length)]`.
- `balanced`: let `m` be the smallest size among regions that have **at least one** frontier pair. A region boxed in by others is ignored, and this rule is what guarantees termination. Pick uniformly among the frontier pairs whose region has size `m`.
- Termination: every step assigns one cell, so growth ends after N² − N steps. The board is always fully assigned, because the grid is connected and every unassigned cell eventually touches some region.

### 4.4 (c) Uniqueness repair ("repairUnique2")

```text
S1 = planted solution
loop up to 400 iterations:
  sols = countSolutions(R, limit 2)
  if sols.count == 1: return OK
  S2 = the solution that differs from S1
  moves = [(x, g, g2) for each row r with S2[r] ≠ S1[r]:
              x = (r, S2[r]); g = R(x); g2 = region of an orthogonal neighbour of x, g2 ≠ g]
  shuffle(moves)
  apply the first move whose removal keeps region g connected   → R(x) := g2
  if no move applies: escape = a random boundary move of any cell that is not an S1 cat (connectivity kept)
  if no escape applies: return FAIL
return FAIL  → the caller restarts from (a)
```

**Why it converges.**

- S2 has exactly one cat per region. Moving S2's cat cell x out of region g leaves g with no S2 cat, so **S2 dies**.
- x is not S1's cat. S1's cat in g is a different cell, because x lies in a row where S2 and S1 differ. So **S1 survives**, and g keeps its S1 cat and is never empty.

*confirmed by proof and measurement.*

**Measured** (`lab/bench_gen2.mjs`, `bench_worst.mjs`, Eden growth, 100–300 puzzles per N):

| N | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|
| Attempts per unique puzzle | 1.00 | 1.00 | 1.02 | 1.08 | 1.15 | 1.38 | 1.61 | 1.99 |
| Average generation time (ms) | 0.26 | 0.53 | 0.47 | 1.10 | 2.19 | 5.17 | 9.26 | 24–36 |
| p95 (ms) | 1.0 | | | | | | | 103–120 |
| Worst seen (ms) | | | | | | | | 144–368 |

- `balanced` growth is 2–3× slower: at N = 12 it averages 69 ms, worst 524 ms.
- Without the escape move the success rate collapses from 89 % (N = 5) to 2.7 % (N = 12).

**Why plain generate-and-test fails.** Without repair, the unique fraction (Eden) is 24 % at N = 5, 2.7 % at N = 6, 0.3 % at N = 7 and 0 % at N ≥ 8. Random region-first maps are worse: 59–68 % have no solution at all. *(measured)*

### 4.5 (d) Filters

[DECISION] These filters are based on the measurements below.

| Filter | Rule | Why |
|---|---|---|
| Single-cell regions | For N ≥ 6, minimum region size ≥ 2 (except the tutorial and levels ≤ 6) | Single-cell regions make puzzles easier and look lopsided. 65–85 % of raw Eden puzzles have one. At N = 12 the mean grade is 3.25 with single-cell regions and 3.80 without. |
| Largest region | ≤ ⌈2.5 N⌉ cells | Avoids one colour flooding the board, as in the 2026-10-06 demo with region sizes 14/6/20/18/1/1/3/1 |
| Grade band | `g ∈ slot.band` (02 §11.2) | Difficulty curve |
| Duplicates | Canonical key not already used (§8.4) | Variety |

**Measured acceptance under the shape filters** (`checks/filters.mjs`, 100 accepted puzzles per row; the grade columns show the grade mix of the accepted puzzles):

| Mode | N | Pass shape | ≤G2 | G3 | G4 | G5 | ms per accepted puzzle |
|---|---|---|---|---|---|---|---|
| balanced | 5 | 79 % | 13 % | 70 % | 14 % | 3 % | 0.4 |
| balanced | 6 | 54 % | 15 % | 56 % | 17 % | 12 % | 1.0 |
| balanced | 7 | 39 % | 14 % | 47 % | 35 % | 4 % | 2.9 |
| balanced | 8 | 42 % | 12 % | 30 % | 53 % | 5 % | 5.8 |
| balanced | 9 | 36 % | 9 % | 23 % | 61 % | 7 % | 12.7 |
| balanced | 10 | 36 % | 9 % | 16 % | 66 % | 9 % | 32.5 |
| balanced | 11 | 36 % | 9 % | 12 % | 70 % | 9 % | 71.1 |
| balanced | 12 | 34 % | 6 % | 10 % | 76 % | 8 % | 209.9 |
| eden | 8 | 16 % | 19 % | 33 % | 47 % | 1 % | 6.4 |
| eden | 12 | 7.5 % | 6 % | 13 % | 75 % | 6 % | 305.6 |

Costs this implies for the offline pipeline (desktop):

- A G≤3 slot at N = 12 needs about 210 ms / 0.16 ≈ 1.3 s.
- A G4 slot at N = 10 needs about 50 ms.
- 1 000 levels take an estimated **≤ 10 minutes** on a single core, and the work parallelises with `worker_threads`.
- **G≤2 at N ≥ 9 is rare.** For that reason the ramp in 02 §11.2 keeps G1–G2 on small boards.

## 5. Human-technique grader

### 5.1 Knowledge state and notation

| Symbol | Meaning |
|---|---|
| status(x) ∈ {cand, elim, cat} | State of each cell x |
| U | The 3N units: rows, columns and regions |
| Cand(u) | Candidate cells in unit u |
| open(u) | Unit u has no cat |
| A(x) | Cells attacked by a cat at x: same row, same column, same region, or king-adjacent |
| Contradiction | Some open u has `Cand(u) = ∅`, or some unit holds two cats |

The grader assumes **perfect bookkeeping**: after each placement, A(x) is eliminated automatically (technique L0). The original has no auto-X (01 §4.7), so real players experience slightly higher difficulty than the grade suggests. Telemetry calibrates this in Phase 4.

### 5.2 Techniques (precise definitions)

| Level | Name (our term) | Definition | Effect |
|---|---|---|---|
| L0 | **Shadow** | For every cat x: every candidate in A(x) | → elim. Free bookkeeping; does not count toward the grade. |
| L1 | **Single** | Some open u has `\|Cand(u)\| = 1` (row, column or region) | → cat on that cell (then L0) |
| L2 | **Confinement** | An open u with `\|Cand(u)\| ≥ 2` has every candidate inside one other unit v of a different kind (region→row, region→column, row→region, column→region) | → elim `Cand(v) \ Cand(u)` |
| L3 | **Shadow conflict** | A candidate x and an open unit u with `x ∉ u` and `Cand(u) ⊆ A(x)`. A cat at x would wipe out u. Example: a region confined to the domino (r,c)–(r,c+1) eliminates (r±1,c) and (r±1,c+1). | → elim x |
| L4 | **Pigeonhole (k)** | For a kind pair (A,B) ∈ {(region,row), (region,column), (row,region), (column,region), (row,column), (column,row)}: a set S of **k ≥ 2** open A-units whose candidates all lie in exactly k B-units T | → elim every candidate of T not in `∪ Cand(S)`. Record k. It suffices to test `2 ≤ k ≤ ⌊m/2⌋`, where m is the number of open units of each kind (equal for all three kinds in a consistent state). The reason: "S (k A-units) inside T" is equivalent to "the other m − k B-units lie inside the other m − k A-units" for the reversed pair (B,A), and gives the same eliminations. All six pairs are tested, so both directions are covered. (k = 1 is L2.) |
| L5 | **Trial** (one step) | For a candidate x: place a hypothetical cat at x, then propagate with L0–L4 until nothing changes; a contradiction appears | → elim x |
| L6 | **Stuck** | None of the above applies and candidates remain | The puzzle is **rejected** |

Grader loop:

```text
loop:
  if all cells are decided: done
  if contradiction: broken (cannot happen on a well-posed puzzle)
  try L1, then L2, L3, L4, L5 in order; after ANY progress, restart from L1
  if nothing applies: grade = 6 → reject
grade = highest level used; counts[level]++ ; pigeonMaxK = max k seen
```

**Step granularity and scan order.** The stored grade `g` and effort `e` must be reproducible by CI (§11.2), so every implementation must use exactly these rules:

- A **step** is one application of one technique that changes something: it places a cat, or eliminates at least one candidate. A technique that would change nothing is not a step.
- Unit order is rows 0…N−1, then columns 0…N−1, then regions 0…N−1 (unit ids 0…3N−1). Cell order is index ascending.
- L1: the first unit in unit order with no cat and exactly one candidate.
- L2: for each unit u in unit order (no cat, at least 2 candidates), try target kinds in the order row, column, region. The target v is the unit of that kind containing `Cand(u)[0]`; skip it if v = u or if not every candidate of u is in v. The first (u, v) with a non-empty elimination wins.
- L3: for each candidate x in cell order, for each open unit u in unit order with x ∉ u: the first (x, u) with `Cand(u) ⊆ A(x)` wins.
- L4: outer loop k = 2…⌊m/2⌋; middle loop over kind pairs in the order listed above; inner loop over k-subsets of the open A-units in lexicographic order of unit id. The first productive (k, pair, S) wins.
- L5: candidates x in cell order. Propagate a copy with L0–L4 (L1 included) until nothing changes. The first x that reaches a contradiction wins. The **contradiction unit** reported for the hint text is the first unit in unit order that has no cat and no candidate.
- The prototype (`lab/queens.mjs`) follows these orders, except that its L4 loop bound is `k ≤ ⌊N/2⌋ + 1` with a skip when `m ≤ k`. The TS port uses the bound above. Shipped grades are always produced by the TS code that CI re-runs, never by the prototype.

**Termination and cost.** Every step removes at least one candidate (a placement removes the placed cell from the candidates), so the loop ends after at most N² steps. Per step, L1–L3 cost O(N³) cell-unit checks, and L4 costs O(6 · C(m, ⌊m/2⌋) · N²) in the worst case: C(12, 6) = 924 subsets at N = 12. L5 multiplies the cost of propagation by the number of candidates. Measured: 0.1–5 ms per full grade on desktop (§5.3).

*inferred design; confirmed working.* On 1 600 graded puzzles (Eden and balanced, N = 5–12) and 320 balanced fact-check puzzles, the grader solved every one, never needed L6, and every result matched the planted unique solution.

### 5.3 Measured grade distribution, raw (no shape filter), Eden growth, 100 puzzles per N

| N | G1 | G2 | G3 | G4 | G5 | ≤G3 total | Needs pigeonhole k ≥ 3 |
|---|---|---|---|---|---|---|---|
| 5 | 19 % | 25 % | 51 % | 5 % | 0 % | 95 % | 0 % |
| 7 | 12 % | 24 % | 48 % | 14 % | 2 % | 82 % | ≤ 7 % |
| 8 | 6 % | 30 % | 45 % | 15 % | 4 % | 80 % | ≤ 7 % |
| 9 | 4 % | 29 % | 40 % | 25 % | 2 % | 69 % | ≤ 7 % |
| 10 | 2 % | 19 % | 39 % | 36 % | 4 % | 66 % | ≤ 7 % |
| 11 | 2 % | 19 % | 22 % | 49 % | 8 % | 50 % | 16 % |
| 12 | 0 % | 9 % | 25 % | 57 % | 9 % | 28 % | 25 % |

- The largest pigeonhole k seen: 2 at N = 5–6, 3 at N = 7–10, 4–5 at N = 11–12.
- Grading takes 0.1–5 ms per puzzle on desktop.
- Players experience **G5 (trial) as guessing**. The store says "Guessing won't save you" (01 §3.4). [DECISION] G5 is allowed **only on Hard levels from level 101 onward** (02 §11.2), and in at most one step per puzzle (`counts[5] ≤ 1`).

### 5.4 Grade and effort score

- `grade = maxLevel ∈ {1..5}`
- `effort = 1·n1 + 3·n2 + 4·n3 + 8·n4 + 2·Σ(k−2 over pigeonhole steps) + 15·n5 + N`, where `nL` is the number of times level L was used.

[DECISION] These weights are our own starting point. They are recalibrated against median solve time per band once telemetry exists (Phase 4). Within a level band, levels are ordered by effort.

## 6. Hint engine (from the player's live state)

Input:

- the puzzle and its solution;
- the current cells: Empty, Mark, Cat, Wrong or Given;
- the player's Marks.

Steps:

1. **Mistaken-mark check.** If any Mark sits on a solution cell, return `{kind: 'mistaken_mark', level: 0, focusCells: [x], effectCells: [x], focusUnits: []}` for the **lowest** such cell index x. Apply clears that Mark.
2. **Knowledge state K.** Cats and Givens become `cat`. Wrong cells become `elim`. Everything else becomes `cand`. **The player's Marks are ignored**, because they are untrusted.
3. Run the grader step by step from K (same scan order as §5.2), emitting a **trace**. Each step is `{kind, level, focusUnits, focusCells, effectCells, placeCell?, k?}`:
   - First, one `shadow` step (level 0) for each cat in K, in cell order: `focusCells = [cat]`, `effectCells = A(cat) ∩ cand`. Each is applied to K before the next.
   - Then the L1–L5 loop. An L1 step has `placeCell` and empty `effectCells`. It is immediately followed by a `shadow` step for the new cat.
   - Kinds: L1 → `single`; L2 → `confine_region_line` when u is a region, otherwise `confine_line_region`; L3 → `shadow_conflict`; L4 → `pigeonhole`; L5 → `trial`.
   - `focusUnits`: L1 [u]; L2 [u, v]; L3 [u] with `focusCells = [x]`; L4 S then T; L5 [contradiction unit] with `focusCells = [x]`.
4. Return the **first step with a new effect**: at least one of its `effectCells` is **Empty** on the board, or its `placeCell` is not a Cat on the board. Its prerequisites are guaranteed to be on the board already; otherwise an earlier step would have had a new effect.
5. If the trace ends (all N cats known) without such a step, return `reveal_fallback` with `placeCell = pickKittyCell(...)`. This cannot happen while the board is not solved, because a well-posed puzzle always has a next step. It is kept as a guard.
6. Text: render with the 02 §9.1 templates, using `focusUnits` mapped to colour names and 1-based row and column numbers.
7. Apply (reducer, 02 §9.1): Empty `effectCells` become Marks; `placeCell` becomes a Cat (always correct). For `mistaken_mark`, the Mark is cleared instead.

`pickKittyCell(puzzle, cells) → CellIndex` (02 §9.2): build K as in step 2 and apply every cat's shadow. Among regions with no cat, choose the one with the most `cand` cells, breaking ties by the lowest label. Return that region's solution cell, i.e. `(r, sol[r])` for the row r whose solution cell lies in that region. Cost is O(N²).

Soundness invariant, enforced by property test:

- every `effectCell` is a non-solution cell;
- every `placeCell` is a solution cell.

Cost and API: the pure engine function is `getHintStep(puzzle, cells): HintStep` (synchronous). The app calls it through `async getHint(state): Promise<HintStep>`, which runs on the main thread when the measured p95 is ≤ 30 ms on the reference device and otherwise moves to the engine worker. The wrapper is async from day one so that move is free. The free-reopen cache (02 §9.1) lives in the session, keyed by the `cells` string.

## 7. Seeded PRNG and determinism

- **Hash:** `cyrb128(seedString)` → four uint32 values.
- **PRNG:** `sfc32(a, b, c, d)`, with the first 15 outputs discarded.
- **API:** `u32()`, `int(n)` and `shuffle(arr)`. In production `int(n)` uses **rejection sampling**; the prototype used `% n`, which has a small bias.
- **Determinism rules:**
  - integer arithmetic only in every generator path: no `Math.random`, `Math.pow`, `Math.exp` or floating-point weights;
  - iteration order is always by index, never by `Map` or `Set` insertion order of computed keys;
  - every algorithm change bumps the **generator version** in the seed string.

Seed formats:

| Use | Seed string |
|---|---|
| Level slot (shipped packs and endless levels) | `mewdoku:level:v1:<levelNumber>` |
| Size schedule for levels 2–1000 (02 §11.2) | `mewdoku:schedule:v1` (one stream, consumed level by level) |
| Effort-sort noise (§8.3) | `mewdoku:sort:v1` |
| Daily puzzle | `mewdoku:daily:v1:<YYYY-MM-DD>` |
| Substitute board when a pack fails to load (02 §11.4) | `mewdoku:fallback:v1:<levelNumber>` |
| Endless retry after 5 000 failed attempts | `<seed>:r1` |
| Generator attempts | No per-attempt seed. All attempts for one slot consume the slot's single RNG stream in order, so the result is reproducible. |

Evidence:

- *(measured)* repeated runs in one Node engine are identical. For example, the 2026-10-06 N = 8 demo gave regions `AAAABBBBAACAADBBCCCAADDECCFAAADDCCCCDADDCCCDDDDDGGCCDDHDGCCCCCDD` and solution `53724160` (grade G2), reproduced exactly by the fact-check.
- Cross-engine determinism (V8, JavaScriptCore, SpiderMonkey) is **likely but untested**. Phase 2 adds a Playwright test that generates five fixed seeds in Chromium and compares them with the Node golden outputs. Determinism matters far less in practice, because shipped levels and dailies are **pre-generated data** (§8). Runtime generation is only a fallback.
- cspuz ships its own XorShift for the same reason: Python's `random` does not promise cross-version reproducibility ([cspuz-rand]).

## 8. Level-pack pipeline

### 8.1 Overview

```
scripts/gen-levels.ts ──► src/data/levels/pack-000.json … pack-009.json  (levels 1–1000)
scripts/gen-daily.ts  ──► src/data/daily/2026-10.json … 2028-12.json     (one record per date)
scripts/verify-levels.ts  (CI) re-checks every record (§10.2)
src/data/levels/manifest.json  {version, packs:[{file, first, count, sha256}], daily:[…]}
```

Packs are **generated offline, reviewed, and committed to git**. The client never generates shipped content. It loads the packs it needs as same-origin static files.

### 8.2 Slot schedule

`scripts/level-schedule.ts` turns the ramp table into one slot per level: `{level, n, gradeBand, hard, breather, sortable}`. The table lives in `src/game/ramp.ts`, which the runtime also uses for endless and substitute boards (04 §3). The RNG seeded with `mewdoku:schedule:v1` picks `n` per slot with the exact four-step algorithm in 02 §11.2 (breather, no three in a row, weighted pick). `sortable = !hard && !breather && level ≥ 2`.

Level 1 is the hand-made tutorial board (02 §11.5), stored with `gv` (givens) empty and `tut: 1`.

### 8.3 Per-slot generation

The same `generate(spec)` function serves shipped slots (here, with `n` from the schedule), endless levels and dailies (both use the slot RNG's first draw or the weekday table to fix `n`, 02 §11.4, §12), and substitute boards.

```text
for slot in schedule:
  rng = makeRng(`mewdoku:level:v1:${slot.level}`)
  repeat (cap 5 000 attempts, else fail the build with a report):
    p   = randomKingPerm(n, rng)
    R   = growRegions(n, p, rng, rng.int(4) == 0 ? 'eden' : 'balanced')
    if !repairUnique2(n, R, p, rng).ok: continue
    if !shapeOK(R, slot): continue
    G   = grade(n, R);  if G.maxLevel ∉ slot.band or (G.maxLevel == 5 and G.counts[5] > 1): continue
    key = canonicalKey(R); if key in seen: continue
    accept → record {i, n, r: encode(R), s: base36(p), g, e, h}

then, for each ramp-table row (02 §11.2), using rng = makeRng('mewdoku:sort:v1'):
  S = the sortable slots of the row, in level order
  key(rec) = rec.e × (90 + rng.int(21))         // ±10 % noise, integer only; draws in level order
  reassign the records of S to the slots of S in ascending key order (ties: original level)
  repair: for each slot j of S in level order, if levels j−2, j−1 and j share N,
          swap j's record with the first later slot of S whose record has a different N
          (if none exists, keep it and print a warning in the build report)
  finally set rec.i = slot level for every record
```

Hard and breather slots never move, so their `h` flag and their lower-size rule always hold.

### 8.4 Canonical key (duplicate detection)

- Take the minimum, over the 8 symmetries of the square (4 rotations × reflection), of the region string relabelled by first appearance.
- One shared `seen` set covers the level packs and the daily packs.
- Collisions are astronomically unlikely, but the check is cheap and also protects against generator bugs.

### 8.5 Region colour assignment (render time, deterministic)

1. Build the region adjacency graph: two regions are adjacent if they share an edge.
2. Order regions by degree, highest first, with ties broken by label.
3. For each region, pick the **unused** palette colour that maximises the minimum ΔE (CIEDE2000, a precomputed 12×12 matrix of integers ×100) to its already-coloured neighbours. A region with no coloured neighbour scores +∞ for every colour. Break ties by palette order, rotated by `cyrb128(puzzleId)[0] mod 12`, so that boards look varied.
4. Every region gets a **distinct** colour, because players read "one cat per colour" (fact-check correction: do not reuse colours across non-adjacent regions).
5. Exception: the tutorial uses the fixed colours listed in 02 §11.5.

The ΔE target is 10. The palette script (02 §17.2) guarantees that every pair of palette colours is at least 10 apart, so adjacent regions are always at least 10 apart too.

### 8.6 Daily packs

- One file per month, about 4 KB each, holding the 28–31 records for that month.
- The size and grade per weekday follow 02 §12.
- The same pipeline is used with the seed `mewdoku:daily:v1:<date>`.
- Phase 2 generates 2026-10 through 2028-12. The client falls back to worker generation for any month that is missing.

## 9. Compact data format (v1)

### 9.1 Level record

```jsonc
{
  "i": 37,                 // level number (omitted in daily records; the date is the key)
  "n": 8,                  // board size
  "r": "AABBBCCC…",        // n·n region letters A..L, row-major, canonical first-appearance labels
  "s": "53724160",         // n base-36 digits: column of the cat in row r
  "g": 3,                  // grade 1..5 (§5)
  "e": 41,                 // effort score (integer)
  "h": 0,                  // 1 = Hard level
  "gv": "",                // optional: base-36 row indices whose cat is a Given (pre-placed)
  "tut": 0                 // optional: 1 = tutorial board
}
```

### 9.2 Containers

```jsonc
// src/data/levels/pack-000.json
{ "v": 1, "kind": "levels", "first": 1, "count": 100, "gen": "mewdoku-gen/1.0.0", "levels": [ … ] }

// src/data/daily/2026-10.json
{ "v": 1, "kind": "daily", "month": "2026-10", "gen": "mewdoku-gen/1.0.0",
  "days": { "2026-10-06": { "n": 9, "r": "…", "s": "…", "g": 4, "e": 63, "h": 0 }, … } }
```

### 9.3 Sizes

- About `n² + n + 40` bytes per record: ~105 B at N = 8, ~195 B at N = 12.
- A 100-level pack is about 14 KB raw JSON (about 4 KB gzipped).
- **Pack 000 is bundled into the JS** for an instant first level. Later packs are fetched when the player reaches level `first − 20`.
- Alternative (v2, if needed): wall-bit encoding, `2N(N−1)` bits in base64 (44 chars at N = 12, about 3× smaller). It needs connected regions, which we guarantee.

### 9.4 Validation on load (client)

Before use, the client checks:

- `v === 1`;
- the string lengths match `n`;
- the labels cover `A … A+n−1`;
- `s` is a valid king permutation;
- the cat regions are distinct.

The client does **not** re-run uniqueness (CI guarantees it). A corrupt record is skipped with a `pack_fallback` analytics event, and the level gets a substitute board (02 §11.4, seed `mewdoku:fallback:v1:<L>`).

## 10. Performance targets

| Operation | Desktop target | Low-end Android WebView target | Where it runs |
|---|---|---|---|
| Validate a cat attempt | O(1) | O(1) | Main thread |
| `countSolutions(limit 2)`, N ≤ 12 | p99 ≤ 2 ms | p99 ≤ 20 ms | Worker or CI |
| `grade()`, N ≤ 12 | p99 ≤ 10 ms | — (offline only) | CI and worker |
| `getHint()` | p95 ≤ 5 ms | p95 ≤ 30 ms (otherwise move to worker) | Main thread or worker |
| Generate an accepted puzzle, N = 12 | average ≤ 300 ms | ≤ 3 s, prefetched one level ahead | Worker |
| Full pack generation (1 000 levels) | ≤ 10 min, single core | — | Node script |
| Engine code size (minified) | ≤ 15 KB | — | — |

## 11. Test plan

### 11.1 Unit tests (Vitest, `tests/unit/engine/*`)

| Area | Tests |
|---|---|
| `bits` | popcount and bit iteration against naive versions over random 32-bit values |
| `rng` | Golden first-20 outputs for three seeds; `int(n)` is unbiased (χ² over 10⁶ draws); `shuffle` is a permutation |
| `codec` | Encode/decode round trip on 10 000 generated puzzles; rejects malformed records (bad length, labels, non-king `s`, duplicate regions) |
| `validate` | Connectivity detection with hand-crafted disconnected maps |
| Solver | B equals brute force on 2 000 seeded random maps, N = 4–8 (all counts, not just ≤ 2); B equals A on 1 000 generated puzzles, N = 5–12; known fixtures (the tutorial board has 1 solution; a 6×6 board with 14 solutions, built by us) |
| Generator | Each output is unique; the planted solution equals the solver's solution; regions are connected and N in number; filters respected; same seed gives a byte-identical result |
| Grader | One crafted fixture per technique, where only that technique makes progress; **soundness**: on 2 000 generated puzzles every elimination is a non-solution cell and every placement a solution cell, at every step; the result solves to the planted solution |
| Hint engine | Random partial states (a random subset of correct cats, random Wrong reveals, random player Marks including mistaken ones): the step is sound, makes progress, mistaken Marks come first, and repeated Apply always reaches the solution |
| Colour assignment | Distinct colours; deterministic per puzzle ID; minimum ΔE between adjacent regions ≥ 10 on every shipped record; tutorial colours fixed |
| Kitty target | `pickKittyCell` always returns a solution cell in a region without a cat, choosing the region with the most candidates and breaking ties by the lowest label |

### 11.2 Property tests over shipped content (`tests/property/levels.spec.ts`, runs in CI on every commit)

For **every** record in `src/data/levels/*.json` and `src/data/daily/*.json`:

1. It decodes and passes §9.4.
2. `countSolutions(limit 2).count === 1`, and the solution equals `s`.
3. For N ≤ 9, an independent brute-force count also equals 1.
4. A fresh `grade()` equals the stored `g` (so the grade is reproducible), `g ≤ 5`, `g` is inside the slot band, and G5 appears at most once and only on allowed slots.
5. It is **solvable by the grader without guessing up to its rated difficulty**: grading with `maxLevel = g` finishes, and grading with `maxLevel = g − 1` gets stuck (so the rating is tight).
6. The shape filters hold.
7. No canonical-key duplicates exist across all packs.
8. Level numbers are contiguous from 1 to 1000; `h` matches the hard schedule; the tutorial is level 1; no three consecutive levels share N where the pool allowed otherwise; every breather slot has the lower size and grade (02 §11.2).
9. Manifest SHA-256 values match the files.

Runtime budget: roughly 1 000 × (solve + grade) ≈ under 10 s in CI.

### 11.3 Determinism and regression

- **Golden snapshot:** the generator output for 20 fixed seeds (N = 5–12) is stored in `tests/golden/gen-v1.json`. Any change fails CI unless the generator version is bumped.
- **Cross-engine:** a Playwright test runs the same five seeds in Chromium and compares them with the Node golden file.

### 11.4 Benchmarks (not gating)

`vitest bench` for the solver, grader and generator at N = 8, 10 and 12. Results are tracked in `docs/perf.md` from Phase 2 onward.

<!-- References -->
[samimsu-smt]: https://github.com/samimsu/queens-game-linkedin/blob/main/src/utils/solveQueensSMT.ts
[samimsu-solve]: https://github.com/samimsu/queens-game-linkedin/blob/main/src/utils/solveQueens.ts
[cspuz-sb]: https://github.com/semiexp/cspuz/blob/main/cspuz/puzzle/star_battle.py
[cspuz-rand]: https://github.com/semiexp/cspuz/blob/main/cspuz/generator/deterministic_random.py
[knuth-dlx]: https://arxiv.org/abs/cs/0011047
[oeis]: https://oeis.org/A002464
