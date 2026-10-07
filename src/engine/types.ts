// Owner: foundation (engine workstream: additive only).
// Engine types (04 §4.1, 03). PURE: no DOM, no clocks, no platform.

/** Cell index `r * n + c` (03 §2). */
export type CellIndex = number;
export type Grade = 1 | 2 | 3 | 4 | 5;
/** Inclusive grade band, e.g. [3, 4] = G3–G4 (02 §11.2). */
export type GradeBand = readonly [lo: Grade, hi: Grade];
/** T1 (tutorial), L37 (level 37), D2026-10-06 (daily). */
export type PuzzleId = `T${number}` | `L${number}` | `D${string}`;

/**
 * Board cell states, shared by the hint engine (03 §6) and the game reducer (04 §4.2).
 * game/types.ts re-exports this as `CellState`. Encoded in saves as the chars '0'..'4'.
 */
export const CellState = { Empty: 0, Mark: 1, Cat: 2, Wrong: 3, Given: 4 } as const;
export type CellState = (typeof CellState)[keyof typeof CellState];

export interface Puzzle {
  readonly id: PuzzleId;
  readonly n: number; // 4..12
  readonly k: 1; // cats per unit (Phase 3 hook, fixed at 1)
  readonly regions: Uint8Array; // n*n canonical labels 0..n-1
  readonly solution: Uint8Array; // solution[r] = c
  readonly givens: readonly number[]; // rows whose cat is pre-placed
  readonly grade: Grade;
  readonly effort: number;
  readonly hard: boolean;
}

/** On-disk record (03 §9.1). */
export interface LevelRecord {
  i?: number;
  n: number;
  r: string;
  s: string;
  g: Grade;
  e: number;
  h: 0 | 1;
  gv?: string;
  tut?: 0 | 1;
}
export interface LevelPack {
  v: 1;
  kind: 'levels';
  first: number;
  count: number;
  gen: string;
  levels: LevelRecord[];
}
export interface DailyPack {
  v: 1;
  kind: 'daily';
  month: string;
  gen: string;
  days: Record<string, LevelRecord>;
}
/** src/data/levels/manifest.json (03 §8.1). */
export interface PackManifest {
  v: 1;
  version: string;
  gen: string;
  packs: { file: string; first: number; count: number; sha256: string }[];
  daily: { file: string; month: string; sha256: string }[];
}

export type UnitKind = 'row' | 'col' | 'region';
export interface Unit {
  kind: UnitKind;
  index: number;
}

export type HintKind =
  | 'mistaken_mark'
  | 'shadow'
  | 'single'
  | 'confine_region_line'
  | 'confine_line_region'
  | 'shadow_conflict'
  | 'pigeonhole'
  | 'trial'
  | 'reveal_fallback';

/** One explained deduction (03 §6). Also the grader's trace step. */
export interface HintStep {
  kind: HintKind;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  focusUnits: Unit[]; // units named in the explanation
  focusCells: CellIndex[]; // outlined cells
  effectCells: CellIndex[]; // become Marks on Apply (mistaken_mark: the Mark to clear)
  placeCell?: CellIndex; // becomes a Cat on Apply (always correct)
  k?: number; // pigeonhole size
}

export interface GradeResult {
  grade: Grade | 6; // 6 = stuck → reject
  counts: readonly [l0: number, l1: number, l2: number, l3: number, l4: number, l5: number];
  pigeonMaxK: number;
  effort: number;
}

/** Highest technique level the grader may use (03 §11.2 item 5: tightness check). */
export interface GradeOptions {
  maxLevel?: Grade;
}

export type GrowthMode = 'balanced' | 'eden';
/** [boardSize, integer weight] (02 §11.2). */
export type SizeWeight = readonly [n: number, weight: number];

export interface GenSpec {
  n: number;
  seed: string;
  gradeBand: GradeBand;
  allowG5Steps: 0 | 1;
  minRegion: number;
  maxRegion: number;
  growth: 'mixed' | 'balanced' | 'eden'; // mixed = balanced 75 % / eden 25 % per attempt (03 §4.3)
  maxAttempts: number;
  /**
   * Endless and substitute boards (02 §11.4): when set, the generator's FIRST draw on the seed's
   * stream picks n by weight (`rng.int(sum of weights)`), overriding `n`, and generation continues
   * on the same stream.
   */
  sizePool?: readonly SizeWeight[];
  /**
   * Engine addition (optional): per-size shape limits [n, minRegion, maxRegion] for sizePool specs,
   * e.g. from game/ramp.ts shapeLimits(n, level). Without a row for the drawn n the generator uses
   * minRegion (from n ≥ 6, else 1) and ⌈2.5 n⌉ (engine/generator.ts GEN_DEFAULTS, mirrors cfg.gen).
   */
  sizeLimits?: readonly (readonly [n: number, minRegion: number, maxRegion: number])[];
  /** Engine addition (optional): cfg.gen.edenOneIn for 'mixed' growth; default 4. */
  edenOneIn?: number;
  /** Engine addition (optional): cfg.gen.repairMaxIter; default 400. */
  repairMaxIter?: number;
}

/** Output of generate(spec). `record` has no `i`; the caller decodes it with codec.recordToPuzzle. */
export type GenResult =
  | { ok: true; record: LevelRecord; attempts: number; grade: GradeResult }
  | { ok: false; attempts: number; reason: 'max_attempts' };

export interface SolveResult {
  count: 0 | 1 | 2;
  solutions: Uint8Array[];
  nodes: number;
}

/** Seeded PRNG stream (03 §7): cyrb128 + sfc32, int(n) by rejection sampling. */
export interface Rng {
  /** Next raw 32-bit unsigned value. */
  u32(): number;
  /** Uniform integer in [0, n) by rejection sampling. n ≥ 1. */
  int(n: number): number;
  /** In-place Fisher–Yates shuffle; returns the same array. */
  shuffle<T>(arr: T[]): T[];
}

/** Precomputed per-puzzle tables (03 §2). Unit ids: rows 0..n-1, cols n..2n-1, regions 2n..3n-1. */
export interface PuzzleTables {
  readonly n: number;
  readonly regions: Uint8Array;
  /** Cells of each unit id, ascending. */
  readonly units: readonly (readonly CellIndex[])[];
  /** [rowUnit, colUnit, regionUnit] per cell. */
  readonly unitsOf: readonly (readonly [number, number, number])[];
  /** Cells attacked by a cat at i: same row, column or region, or king-adjacent (excludes i). */
  readonly attack: readonly (readonly CellIndex[])[];
  /** regRows[g][r] = bitmask of the columns of region g in row r. */
  readonly regRows: readonly (readonly number[])[];
}

/** Structural check result for a record (03 §9.4). */
export type RecordCheck = { ok: true } | { ok: false; reason: string };

/** 12×12 CIEDE2000 matrix, integers ×100, row-major (03 §8.5). Supplied by ui/art/palette.ts. */
export type DeltaMatrix = readonly number[];
