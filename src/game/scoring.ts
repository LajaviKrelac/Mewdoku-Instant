// Owner: C
// Paw points, board score encodings and the client-side submit limits (phase2b §5.3). PURE.
// Every encoded score is an integer, higher is better, and < 2³¹. Decoding is used by the app to
// format overlay rows and the ranking panel (platform/ never imports this module: CONTRACTS §2).
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
  if (input.tutorial || input.mode === 'tutorial') return 0;
  const p = c.points;
  let pts = p.perSize * Math.max(0, Math.floor(input.n));
  if (input.hard) pts *= p.hardMultiplier;
  if (input.mistakes === 0 && input.revivesUsed === 0) pts += p.flawless;
  if (input.hintsUsed === 0 && input.kittiesUsed === 0) pts += p.unaided;
  if (input.mode === 'daily') pts += p.daily;
  if (input.mode === 'event') pts += p.event;
  return pts;
}

/** points.total += n, capped at points.max (never negative). */
export function addPoints(total: number, n: number, c: GameConfig = cfg): number {
  return Math.min(c.points.max, Math.max(0, Math.floor(total) + Math.max(0, Math.floor(n))));
}

const DAY_MS = 86_400_000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcDay(key: string): number {
  const m = KEY_RE.exec(key);
  if (!m) throw new RangeError(`bad date key ${key}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Whole days from rank.dailyEpoch (2026-01-01) to a YYYY-MM-DD daily key. Throws on a bad key. */
export function dayIndex(dateKey: string, c: GameConfig = cfg): number {
  return Math.round((utcDay(dateKey) - utcDay(c.rank.dailyEpoch)) / DAY_MS);
}

const DAILY_SPAN = 100_000;
const DAILY_SECS_MAX = 99_999;
const EVENT_SPAN = 1_000_000;
const EVENT_SECS_MAX = 999_999;

/** Whole seconds of a solve, rounded up (a 2.1 s solve is 3 s), never negative. */
function ceilSecs(ms: number): number {
  return Math.max(0, Math.ceil(Math.max(0, ms) / 1000));
}

/** daily_fastest: dayIndex × 100 000 + (99 999 − secs), secs = min(ceil(ms / 1000), 99 999). */
export function encodeDailyScore(dateKey: string, ms: number, c: GameConfig = cfg): number {
  const day = Math.max(0, dayIndex(dateKey, c));
  const secs = Math.min(ceilSecs(ms), DAILY_SECS_MAX);
  return day * DAILY_SPAN + (DAILY_SECS_MAX - secs);
}

/** event_<id>: solved × 1 000 000 + (999 999 − min(totalSecs, 999 999)). */
export function encodeEventScore(solved: number, totalMs: number): number {
  const n = Math.max(0, Math.floor(solved));
  return n * EVENT_SPAN + (EVENT_SECS_MAX - Math.min(ceilSecs(totalMs), EVENT_SECS_MAX));
}

/** paw_points: points.total, capped at points.max. */
export function encodePointsScore(total: number, c: GameConfig = cfg): number {
  return Math.min(c.points.max, Math.max(0, Math.floor(total)));
}

/** A board score decoded back into what the UI shows (the app formats it with i18n). */
export type DecodedScore =
  | { readonly kind: 'points'; readonly points: number }
  | { readonly kind: 'time'; readonly dayIndex: number; readonly secs: number }
  | { readonly kind: 'event'; readonly solved: number; readonly totalSecs: number };

/** The score format of a board (§5.3): paw_points → points, daily_fastest → time, event_* → event. */
export function boardFormat(board: BoardKey, c: GameConfig = cfg): DecodedScore['kind'] {
  if (board === c.rank.boards.points) return 'points';
  if (board === c.rank.boards.daily) return 'time';
  return 'event';
}

/** Inverse of the encoders by board (daily readers keep only entries whose dayIndex is the shown day). */
export function decodeScore(board: BoardKey, score: number, c: GameConfig = cfg): DecodedScore {
  const s = Math.max(0, Math.floor(score));
  switch (boardFormat(board, c)) {
    case 'points':
      return { kind: 'points', points: s };
    case 'time':
      return { kind: 'time', dayIndex: Math.floor(s / DAILY_SPAN), secs: DAILY_SECS_MAX - (s % DAILY_SPAN) };
    default:
      return { kind: 'event', solved: Math.floor(s / EVENT_SPAN), totalSecs: EVENT_SECS_MAX - (s % EVENT_SPAN) };
  }
}

/**
 * Client-side sanity limits (§5.3): no submission for a solve under rank.minSolveMs or over
 * rank.maxSolveMs, and at most one per rank.submitMinIntervalMs (the latest score waits in rank.pending).
 * A lastSubmitAt in the future (the device clock went back) never blocks.
 */
export function canSubmit(solveMs: number, now: number, lastSubmitAt: number, c: GameConfig = cfg): 'ok' | 'too_fast' | 'too_slow' | 'wait' {
  if (solveMs < c.rank.minSolveMs) return 'too_fast';
  if (solveMs > c.rank.maxSolveMs) return 'too_slow';
  if (lastSubmitAt <= now && now - lastSubmitAt < c.rank.submitMinIntervalMs) return 'wait';
  return 'ok';
}
