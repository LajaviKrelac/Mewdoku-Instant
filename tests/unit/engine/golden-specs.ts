// Owner: read-only (Phase 2b; was engine)
// The 20 fixed generator specs behind tests/golden/gen-v1.json (03 §11.3): N = 5–12, ramp-like
// bands, a daily slot, endless (sizePool) and substitute boards. Shared with the cross-engine
// Playwright check, which replays the first five in Chromium.
import type { GenSpec, GradeBand, SizeWeight } from '../../../src/engine/types';

const ENDLESS_POOL: readonly SizeWeight[] = [[8, 2], [9, 2], [10, 2], [11, 2], [12, 1]];
const POOL_41_100: readonly SizeWeight[] = [[7, 1], [8, 2], [9, 2], [10, 1]];

function fixed(n: number, seed: string, band: GradeBand, minRegion: number): GenSpec {
  return {
    n,
    seed,
    gradeBand: band,
    allowG5Steps: band[1] === 5 ? 1 : 0,
    minRegion,
    maxRegion: Math.ceil(2.5 * n),
    growth: 'mixed',
    maxAttempts: 5000,
  };
}

function pooled(seed: string, pool: readonly SizeWeight[], band: GradeBand): GenSpec {
  return { ...fixed(12, seed, band, 2), n: 0, maxRegion: 30, sizePool: pool };
}

export const GOLDEN_SPECS: readonly GenSpec[] = [
  fixed(5, 'mewdoku:level:v1:2', [1, 2], 1),
  fixed(5, 'mewdoku:level:v1:3', [1, 2], 1),
  fixed(6, 'mewdoku:level:v1:5', [1, 2], 1),
  fixed(6, 'mewdoku:level:v1:8', [1, 3], 2),
  fixed(7, 'mewdoku:level:v1:9', [1, 3], 2),
  fixed(7, 'mewdoku:level:v1:14', [2, 3], 2),
  fixed(8, 'mewdoku:level:v1:17', [2, 3], 2),
  fixed(8, 'mewdoku:level:v1:25', [3, 3], 2),
  fixed(9, 'mewdoku:level:v1:30', [3, 4], 2),
  fixed(9, 'mewdoku:level:v1:47', [3, 4], 2),
  fixed(10, 'mewdoku:level:v1:60', [4, 4], 2),
  fixed(10, 'mewdoku:level:v1:77', [3, 4], 2),
  fixed(11, 'mewdoku:level:v1:150', [4, 5], 2),
  fixed(11, 'mewdoku:level:v1:163', [3, 4], 2),
  fixed(12, 'mewdoku:level:v1:250', [4, 5], 2),
  fixed(12, 'mewdoku:level:v1:333', [3, 4], 2),
  fixed(8, 'mewdoku:daily:v1:2026-10-06', [3, 3], 2),
  fixed(9, 'mewdoku:daily:v1:2026-10-07', [1, 3], 2),
  pooled('mewdoku:level:v1:1001', ENDLESS_POOL, [3, 4]),
  pooled('mewdoku:fallback:v1:42', POOL_41_100, [3, 4]),
];
