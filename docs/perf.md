# Performance: engine, content pipeline and bundle

Status: Phase 2 hardening (final) · Date: 2026-10-07 · Required by 03 §11.4 (benchmarks are tracked here from Phase 2 onward; they do not gate CI).

Machine for every number below: Linux container with 4 CPUs, Node 22.22, Chromium from Playwright 1.56. Times are wall-clock. The engine figures come from the engine workstream's benchmark runs; the pipeline figures come from the content workstream and from an integration re-run. Each row says which.

## 1. Engine (03 §10 targets)

| Operation | Board | Result | Source |
|---|---|---|---|
| `countSolutions(n, regions, 2)` | N = 12 | avg 0.16 ms, p99 1.45 ms | engine workstream |
| `grade(n, regions)` | N = 12 | avg 0.59 ms, p99 4.8 ms | engine workstream |
| `getHintStep(puzzle, cells)` | all sizes | p95 0.13 ms (budget `hint.mainThreadBudgetMs` = 30 ms) | engine workstream |
| `generate(spec)` | N = 12 | avg 133 ms, worst 576 ms | engine workstream |
| 20 golden specs (`tests/golden/gen-v1.json`), N = 5–12, built bundle in Chromium | mixed | about 1 s for all 20, through the module worker and again on the main thread | integration, `tests/e2e/determinism.spec.ts` |

Hints run on the main thread. A board size whose hint ever exceeds 30 ms moves to the worker (`workers/engine-client.ts`); at the measured p95 this does not happen in practice. Generating on the device (endless levels after 1000, missing daily months, substitute boards) takes about 0.1–0.6 s. A request slower than 300 ms shows the loading indicator.

`tests/unit/engine/perf.spec.ts` is a smoke test with generous bounds. It catches order-of-magnitude regressions, not small ones.

## 2. Content pipeline

| Step | Result | Source |
|---|---|---|
| `scripts/gen-levels.ts`, 999 slots, no cache | 56 s on 2 workers; 104 s on 1 thread | content workstream |
| `scripts/gen-levels.ts --workers 4 --no-cache` | 29.0 s wall (112 s summed per-slot time); packs byte-identical to the committed ones | integration re-run after the `gen-pool.ts` split |
| `scripts/gen-daily.ts` 2026-10 … 2028-12 (823 days) | 48 s | content workstream |
| `scripts/gen-daily.ts --workers 4 --no-cache` | 27.4 s wall (106 s summed); months byte-identical | integration re-run |
| With the resumable cache (`node_modules/.cache/mewdoku-content/`) | a few seconds: only the sort, the repair and the file writes run again | — |
| `scripts/verify-levels.ts` (10 packs, 27 months) | 2.3 s, 0 issues | integration |
| `vitest --project property` (every shipped record, 03 §11.2) | about 8 s (27 tests) | integration |
| Full `vitest run` (unit + dom + property) | about 37 s (73 files, 1164 tests) | Phase 2 hardening (final audit re-run) |

## 3. Engine bytes in the bundle (minified, raw)

| Where | Modules | Size |
|---|---|---|
| Engine workstream measurement, before the integration code split | main thread 14.1 KB, worker 17.0 KB | 23.4 KB in total (shared modules counted once) |
| Main bundle, after the split | `codec`, `colors`, `rng`, `bits` | about 5.6 KB |
| Lazy chunk `hint-*.js` | `hint` | 1.7 KB |
| Lazy chunk `grader-*.js` (shared by the hint engine and the main-thread generator) | `techniques`, `masks`, `pigeonhole`, `geometry`, `grader` | 7.9 KB |
| Lazy chunk `generator-*.js` (used only when the worker cannot start) | `generator`, `solver`, `filters` | 6.2 KB |
| `engine.worker-*.js` | generator, solver, grader, hint, RPC | 17.6 KB |

## 4. Bundle sizes (`npx tsx scripts/size-check.ts`, raw bytes, 1 KB = 1000 B)

Final Phase 2 builds (after the review fixes and the coach move). Budgets are the lead's Phase 2 hardening ceilings (04 §9).

| Item | Web (`dist/web`) | FBIG (`dist/fbig`) | Budget (04 §9) |
|---|---|---|---|
| Main JS (entry) | 165.4 KB | 173.3 KB | 190 KB |
| CSS | 37.8 KB | 37.8 KB | 40 KB |
| Font (Fredoka 600, Latin) | 16.5 KB | 16.5 KB | 25 KB |
| `index.html` | 0.7 KB | 0.8 KB | 4 KB |
| **First load** | **220.3 KB** | **228.3 KB** | **250 KB** |
| Worker (lazy) | 17.7 KB | 17.6 KB | 25 KB |
| Lazy JS chunks (overlays incl. the coach 24.6, grader 7.9, generator 6.2, sfx 3.6, hint 1.7, rpc 1.6) | 45.6 KB | 45.4 KB | 48 KB |
| Packs 1–9, 27 daily months, OFL and MIT texts, favicon | 273.2 KB | 273.4 KB | lazy |
| FB zip | — | 216.8 KB, 51 files | 500 KB, 60 files |

Gzip sizes are reported for reference only, because FB hosting may serve files uncompressed (05 §5.3). Main JS is about 59 KB gzipped for web and 62 KB for FBIG.

How the main bundle changed:

- Before the integration split: 187.2 KB web, 194.2 KB FBIG.
- Overlays O1–O7 moved to a lazy chunk: −15 KB.
- The hint engine and the RPC layer went lazy: −8 KB.
- The sound recipes went lazy: −3 KB.
- The non-home illustration poses went lazy: −3 KB.
- Integration result: 159.6 KB web, 166.6 KB FBIG.
- Phase 2 review fixes (resilience, the FB storage rework, a11y and layout fixes): about +10 KB.
- The tutorial coach (O8) moved into the overlay chunk, prefetched during boot on a first run: −4.4 KB.

The rest of the main bundle is what the first screen needs. Its largest parts:

- bundled `pack-000`: 11.7 KB;
- the English catalogue: 10.1 KB;
- the SVG art: sprite, cat parts and mascot, about 14 KB;
- the board: about 15 KB;
- the app layer: about 45 KB;
- the game rules: about 26 KB;
- the FB adapter: about 10 KB (FBIG only; the web adapter and the S0 splash drop out of that build).
