// Owner: C
// Paw points, board score encodings and the client-side submit limits (phase2b §5.3). PURE.
// Every encoded score is an integer, higher is better, and < 2³¹. Decoding is used by the app to
// format overlay rows and the ranking panel (platform/ never imports this module: CONTRACTS §2).
// F0 stub: signatures are final for C's own callers (ranking-flow, win-flow, views); bodies are C's.
import { cfg, type GameConfig } from '../app/config';
import type { BoardKey, ModeId } from './types';

/** What a win's points depend on (phase2b §5.3). */
export interface PointsInput {
  readonly mode: ModeId;
  /** Board size. */
  readonly n: number;
  readonly hard: boolean;
  readonly mistakes: number;
  readonly revivesUsed: number;
  readonly hintsUsed: number;
  readonly kittiesUsed: number;
  /** The first-run tutorial and its replay score 0. */
  readonly tutorial: boolean;
}

/**
 * Points for one win (§5.3): base points.perSize × n (× hardMultiplier when hard), + flawless
 * (0 mistakes, 0 revives), + unaided (0 hints, 0 kitties), + daily, + event; tutorial 0. Always a
 * multiple of 5. Example: 8×8, 1 mistake, 1 hint → 40; 10×10 Hard, flawless, unaided → 120.
 */
export function pointsFor(input: PointsInput, c: GameConfig = cfg): number {
  void input;
  void c;
  throw new Error('not implemented: pointsFor (C, phase2b §5.3)');
}

/** Whole days from rank.dailyEpoch (2026-01-01) to a YYYY-MM-DD daily key. */
export function dayIndex(dateKey: string, c: GameConfig = cfg): number {
  void dateKey;
  void c;
  throw new Error('not implemented: dayIndex (C, phase2b §5.3)');
}

/** daily_fastest: dayIndex × 100 000 + (99 999 − secs), secs = min(ceil(ms / 1000), 99 999). */
export function encodeDailyScore(dateKey: string, ms: number, c: GameConfig = cfg): number {
  void dateKey;
  void ms;
  void c;
  throw new Error('not implemented: encodeDailyScore (C, phase2b §5.3)');
}

/** event_<id>: solved × 1 000 000 + (999 999 − min(totalSecs, 999 999)). */
export function encodeEventScore(solved: number, totalMs: number): number {
  void solved;
  void totalMs;
  throw new Error('not implemented: encodeEventScore (C, phase2b §5.3)');
}

/** paw_points: points.total, capped at points.max. */
export function encodePointsScore(total: number, c: GameConfig = cfg): number {
  void total;
  void c;
  throw new Error('not implemented: encodePointsScore (C, phase2b §5.3)');
}

/** A board score decoded back into what the UI shows (the app formats it with i18n). */
export type DecodedScore =
  | { readonly kind: 'points'; readonly points: number }
  | { readonly kind: 'time'; readonly dayIndex: number; readonly secs: number }
  | { readonly kind: 'event'; readonly solved: number; readonly totalSecs: number };

/** Inverse of the encoders by board (daily readers keep only entries whose dayIndex is the shown day). */
export function decodeScore(board: BoardKey, score: number, c: GameConfig = cfg): DecodedScore {
  void board;
  void score;
  void c;
  throw new Error('not implemented: decodeScore (C, phase2b §5.3)');
}

/**
 * Client-side sanity limits (§5.3): no submission for a solve under rank.minSolveMs or over
 * rank.maxSolveMs, and at most one per rank.submitMinIntervalMs (the latest score waits in rank.pending).
 */
export function canSubmit(solveMs: number, now: number, lastSubmitAt: number, c: GameConfig = cfg): 'ok' | 'too_fast' | 'too_slow' | 'wait' {
  void solveMs;
  void now;
  void lastSubmitAt;
  void c;
  throw new Error('not implemented: canSubmit (C, phase2b §5.3)');
}
