// UI batch (2026-10-13): messages — an approximate per-board odds model for the level-start tickers (spec §0.4 H-2a).
// We collect no pass rates, tries or fails, so these numbers are ESTIMATES from the board's own difficulty: the
// grader's grade (the hardest technique it needed), its effort score, the board size and the Hard flag. The same board
// always gets the same numbers (no clock, no randomness, no device data). The copy shows them rounded and worded as
// approximate ("about"), only in the ticker.odds.* lines (scripts/i18n-check.ts ESTIMATE_KEY_PREFIXES).
// Calibration (docs/ui-batch/messages.md): over our 1,000 shipped levels the first-try share runs 35–95 % on normal
// boards (median ≈ 70 %), 45–65 % on most Hard ones, and 20–45 % on the six G5 (what-if) boards. PURE.

/** What the model reads from a puzzle (Puzzle.grade / .effort / .n, and the level's Hard flag). */
export interface OddsInput {
  readonly grade: number;
  readonly effort: number;
  readonly n: number;
  readonly hard: boolean;
}

export interface LevelOdds {
  /** About this share of players solve the board on their first attempt: a percentage rounded to 5 (5…95). */
  readonly firstTryPct: number;
  /** About this share of the players who lost it solve it on the next attempt: a percentage rounded to 5 (5…95). */
  readonly retryPct: number;
  /** About this many attempts to a solve, on average: rounded to a half (1, 1.5, 2, 2.5 …). */
  readonly tries: number;
}

/**
 * The model's weights. An easy board starts at `base`; effort above `effortFrom` takes up to `effortDrop` off over
 * `effortSpan` (our levels: effort p10 40, p50 69, p99 135); each grade above G3 takes `perGrade` (a G5 board, a
 * what-if, `g5` more); a Hard level `hard`; each size above 8 × 8 `perSize`. A retry keeps part of what the player
 * learnt: q = p + (1 − p) × learn. Average attempts: 1 + (1 − p) / q (the first, then a run at q).
 */
export const ODDS_MODEL = {
  base: 0.94,
  effortFrom: 30,
  effortSpan: 110,
  effortDrop: 0.52,
  perGrade: 0.04,
  g5: 0.06,
  hard: 0.1,
  perSize: 0.012,
  floor: 0.2,
  ceil: 0.96,
  learn: 0.3,
} as const;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** A share 0…1 as a percentage rounded to 5, never 0 or 100 (an estimate never claims "nobody" or "everyone"). */
export function roundPct(share: number): number {
  return clamp(5 * Math.round(clamp(share, 0, 1) * 20), 5, 95);
}

/** The board's first-try share (0…1), before rounding. */
export function firstTryShare(b: OddsInput, m: typeof ODDS_MODEL = ODDS_MODEL): number {
  const effort = Number.isFinite(b.effort) ? b.effort : m.effortFrom;
  const grade = Number.isFinite(b.grade) ? b.grade : 3;
  const n = Number.isFinite(b.n) ? b.n : 8;
  const p =
    m.base -
    m.effortDrop * clamp((effort - m.effortFrom) / m.effortSpan, 0, 1) -
    m.perGrade * Math.max(0, grade - 3) -
    (grade >= 5 ? m.g5 : 0) -
    (b.hard ? m.hard : 0) -
    m.perSize * Math.max(0, n - 8);
  return clamp(p, m.floor, m.ceil);
}

/** The rounded odds the ticker.odds.* lines show for this board. */
export function levelOdds(b: OddsInput, m: typeof ODDS_MODEL = ODDS_MODEL): LevelOdds {
  const p = firstTryShare(b, m);
  const q = p + (1 - p) * m.learn;
  return { firstTryPct: roundPct(p), retryPct: roundPct(q), tries: Math.round((1 + (1 - p) / q) * 2) / 2 };
}
