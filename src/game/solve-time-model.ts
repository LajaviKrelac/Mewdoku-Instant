// UI batch (2026-10-13): victory — the solve-time estimate behind "faster than about N%" (spec §0.4 H-2a).
// When the ranking server has no standing for a daily (fewer than its minimum of other solvers, offline, the web
// records mode, an unlisted player) and for a level, the victory may still say roughly how quick this solve was. The
// estimate is OUR model, not a measurement: solve times on a board are log-normal around a median that grows with the
// board's size and grade (config victory.model), so "faster than" = 1 − Φ((ln t − ln median) / σ). Deterministic (the
// same board and time give the same number), rounded down to a step and clamped, and only ever shown worded
// "about" under victory.stat.*. PURE: no clock, no randomness.
import { cfg, type GameConfig } from '../app/config';

export interface SolveTimeBoard {
  /** Board size (4 … 12). */
  readonly n: number;
  /** The puzzle's grade (1 … 5). */
  readonly grade: number;
  readonly hard: boolean;
}

/** The model's median solve time in ms for a board (sizes and grades outside the table use its nearest row). */
export function medianSolveMs(board: SolveTimeBoard, c: GameConfig = cfg): number {
  const m = c.victory.model;
  const sizes = m.medianSec;
  const i = Math.max(0, Math.min(sizes.length - 1, Math.round(board.n) - 4));
  const g = Math.max(0, Math.min(m.gradeFactor.length - 1, Math.round(board.grade) - 1));
  const sec = (sizes[i] ?? 60) * (m.gradeFactor[g] ?? 1) * (board.hard ? m.hardFactor : 1);
  return Math.max(1000, sec * 1000);
}

/** The standard normal CDF Φ(z) (Abramowitz and Stegun 7.1.26 for erf; |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** The model's share of solvers slower than `ms` on this board, 0 … 100 (unrounded). */
export function modelFasterThan(ms: number, board: SolveTimeBoard, c: GameConfig = cfg): number {
  if (!(ms > 0)) return 0;
  const sigma = Math.max(0.05, c.victory.model.sigma);
  const z = (Math.log(ms) - Math.log(medianSolveMs(board, c))) / sigma;
  return 100 * (1 - normalCdf(z));
}

/** A percentage as shown: floored to victory.model.stepPct, clamped to [minPct, maxPct]. */
export function shownPct(raw: number, c: GameConfig = cfg): number {
  const m = c.victory.model;
  const step = Math.max(1, m.stepPct);
  const floored = Math.floor((Number.isFinite(raw) ? raw : 0) / step) * step;
  return Math.max(m.minPct, Math.min(m.maxPct, floored));
}
