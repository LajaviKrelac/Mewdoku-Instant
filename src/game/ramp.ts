// Owner: C (Phase 2b; was foundation). Shared by scripts/ and the runtime.
// The 02 §11.2 size/difficulty ramp, the 02 §12 weekday table, seed strings (03 §7) and the
// GenSpec builder that applies the shape-filter rules (03 §4.5). PURE.
import { cfg, type GameConfig } from '../app/config';
import type { GenSpec, Grade, GradeBand, SizeWeight } from '../engine/types';

export interface RampRow {
  /** First and last level of the row, inclusive. */
  readonly from: number;
  readonly to: number;
  /** Board sizes with integer weights (02 §11.2 "pool"). */
  readonly sizes: readonly SizeWeight[];
  /** Grade band for normal levels. */
  readonly normal: GradeBand;
  /** Grade band for Hard levels; null where the row has no hard column (hard starts at level 30). */
  readonly hard: GradeBand | null;
}

/** 02 §11.2. Level 1 is the hand-made tutorial board (02 §11.5). */
export const RAMP: readonly RampRow[] = Object.freeze([
  { from: 1, to: 1, sizes: [[4, 1]], normal: [1, 1], hard: null },
  { from: 2, to: 3, sizes: [[5, 1]], normal: [1, 2], hard: null },
  { from: 4, to: 6, sizes: [[5, 2], [6, 1]], normal: [1, 2], hard: null },
  { from: 7, to: 10, sizes: [[6, 2], [7, 1]], normal: [1, 3], hard: null },
  { from: 11, to: 20, sizes: [[6, 1], [7, 2], [8, 1]], normal: [2, 3], hard: null },
  { from: 21, to: 40, sizes: [[7, 2], [8, 2], [9, 1]], normal: [3, 3], hard: [3, 4] },
  { from: 41, to: 100, sizes: [[7, 1], [8, 2], [9, 2], [10, 1]], normal: [3, 4], hard: [4, 4] },
  { from: 101, to: 200, sizes: [[8, 2], [9, 2], [10, 2], [11, 1]], normal: [3, 4], hard: [4, 5] },
  { from: 201, to: 1000, sizes: [[8, 2], [9, 2], [10, 2], [11, 2], [12, 1]], normal: [3, 4], hard: [4, 5] },
] satisfies RampRow[]);

/** Levels beyond the shipped packs reuse the 201–1000 pool and bands (02 §11.4). */
export const ENDLESS_ROW: RampRow = RAMP[RAMP.length - 1] as RampRow;

/** Level L is Hard iff L ≥ hardFrom && L % hardEvery === 0 (02 §11.3). */
export function isHardLevel(level: number, c: GameConfig = cfg): boolean {
  return level >= c.levels.hardFrom && level % c.levels.hardEvery === 0;
}

/** The ramp row for level L (≥ 1); levels past the table use ENDLESS_ROW. */
export function rampRowFor(level: number): RampRow {
  for (const row of RAMP) if (level >= row.from && level <= row.to) return row;
  return ENDLESS_ROW;
}

/** Grade band for a slot: the hard column for Hard levels (falling back to normal), else normal. */
export function bandFor(row: RampRow, hard: boolean): GradeBand {
  return hard && row.hard ? row.hard : row.normal;
}

/** Breather pool (02 §11.2 step 2): the smallest ⌈k/2⌉ of the pool's k sizes, weights kept. */
export function breatherPool(sizes: readonly SizeWeight[]): SizeWeight[] {
  const sorted = [...sizes].sort((a, b) => a[0] - b[0]);
  return sorted.slice(0, Math.ceil(sorted.length / 2));
}

/** Breather band: narrowed to its lowest grade, e.g. G3–G4 → G3. */
export function breatherBand(band: GradeBand): GradeBand {
  return [band[0], band[0]];
}

/** G5 is allowed only when the band reaches 5, and then in at most one step (03 §5.3). */
export function allowG5Steps(band: GradeBand): 0 | 1 {
  return band[1] === 5 ? 1 : 0;
}

/** Weighted pick: `rng.int(sum of weights)` walked over the pool in order (02 §11.2 step 4). */
export function pickWeighted(pool: readonly SizeWeight[], draw: (n: number) => number): number {
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let x = draw(total);
  for (const [n, w] of pool) {
    if (x < w) return n;
    x -= w;
  }
  throw new Error('pickWeighted: empty pool');
}

// ─────────────────────────────── Daily (02 §12) ───────────────────────────────

export interface DailySlot {
  readonly n: number;
  readonly band: GradeBand;
}

/** Indexed by getUTCDay() of the date string: 0 = Sunday … 6 = Saturday. */
export const WEEKDAY_SLOTS: readonly DailySlot[] = Object.freeze([
  { n: 11, band: [4, 4] }, // Sun 11×11 G4
  { n: 8, band: [1, 3] }, // Mon 8×8 ≤G3
  { n: 8, band: [3, 3] }, // Tue 8×8 G3
  { n: 9, band: [1, 3] }, // Wed 9×9 ≤G3
  { n: 9, band: [4, 4] }, // Thu 9×9 G4
  { n: 10, band: [1, 3] }, // Fri 10×10 ≤G3
  { n: 10, band: [4, 4] }, // Sat 10×10 G4
] satisfies DailySlot[]);

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Weekday 0..6 (Sun..Sat) from a YYYY-MM-DD string, never from the device clock (02 §12). */
export function weekdayOfDateKey(dateKey: string): number {
  const m = DATE_KEY.exec(dateKey);
  if (!m) throw new Error(`bad date key: ${dateKey}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

export function dailySlotFor(dateKey: string): DailySlot {
  return WEEKDAY_SLOTS[weekdayOfDateKey(dateKey)] as DailySlot;
}

// ─────────────────────────────── Seeds (03 §7) ───────────────────────────────

export const SEEDS = Object.freeze({
  level: (level: number): string => `mewdoku:level:v1:${level}`,
  schedule: 'mewdoku:schedule:v1',
  sort: 'mewdoku:sort:v1',
  daily: (dateKey: string): string => `mewdoku:daily:v1:${dateKey}`,
  fallback: (level: number): string => `mewdoku:fallback:v1:${level}`,
  retry: (seed: string): string => `${seed}:r1`,
});

// ─────────────────────────────── GenSpec builder ───────────────────────────────

export interface SpecInput {
  /** Board size; ignored by the generator when sizePool is set. Use 0 with sizePool. */
  readonly n: number;
  readonly seed: string;
  readonly band: GradeBand;
  /** Level number for the single-cell-region exception; null for dailies. */
  readonly level: number | null;
  readonly sizePool?: readonly SizeWeight[];
  readonly tutorial?: boolean;
}

/**
 * Builds a GenSpec with the 03 §4.5 shape filters: minRegion 2 for N ≥ 6 (except the tutorial and
 * levels ≤ 6), maxRegion ⌈2.5 N⌉. With a sizePool the region limits are computed by the generator
 * from the drawn n, so minRegion/maxRegion here use the pool's largest size as an upper bound and
 * the generator re-derives them via shapeLimits(n, level).
 */
export function makeGenSpec(input: SpecInput, c: GameConfig = cfg): GenSpec {
  const n = input.sizePool ? Math.max(...input.sizePool.map(([s]) => s)) : input.n;
  const lim = shapeLimits(n, input.level, input.tutorial === true, c);
  const spec: GenSpec = {
    n: input.sizePool ? 0 : input.n,
    seed: input.seed,
    gradeBand: input.band,
    allowG5Steps: allowG5Steps(input.band),
    minRegion: lim.minRegion,
    maxRegion: lim.maxRegion,
    growth: 'mixed',
    maxAttempts: c.gen.maxAttempts,
  };
  return input.sizePool ? { ...spec, sizePool: input.sizePool } : spec;
}

/** Shape-filter limits for a board of size n (03 §4.5). */
export function shapeLimits(
  n: number,
  level: number | null,
  tutorial = false,
  c: GameConfig = cfg,
): { minRegion: number; maxRegion: number } {
  const exempt = tutorial || (level !== null && level <= c.gen.singleCellRegionsUpToLevel);
  const minRegion = !exempt && n >= c.gen.minRegionFromN ? c.gen.minRegionSize : 1;
  return { minRegion, maxRegion: Math.ceil(c.gen.maxRegionFactor * n) };
}

/** Widened band for the endless retry after maxAttempts failures (02 §11.4): G1–G5. */
export const RETRY_BAND: GradeBand = Object.freeze([1, 5] as const satisfies readonly [Grade, Grade]);
