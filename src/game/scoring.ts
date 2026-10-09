// Owner: C (Phase 2b). Phase 2c (G1): level points with the perfect streak, leaderboard points per
// UTC period and the period board encoding (docs/phase2c/fish-lives-spec.md §3.1–§3.6, §4.3).
// Level points, board score encodings and the client-side submit limits (phase2b §5.3). PURE.
// Every encoded score is an integer, higher is better, and < 2³¹. Decoding is used by the app to
// format overlay rows and the ranking panel (platform/ never imports this module: CONTRACTS §2).
import { cfg, type GameConfig, type ScoredMode } from '../app/config';
import type { BoardKey, ModeId, SaveData } from './types';

/** points.total += n, capped at points.max (never negative). Phase 2c: the lifetime LEVEL POINTS total. */
export function addPoints(total: number, n: number, c: GameConfig = cfg): number {
  return Math.min(c.points.max, Math.max(0, Math.floor(total) + Math.max(0, Math.floor(n))));
}

const isScored = (mode: ModeId, modes: readonly ScoredMode[]): boolean => (modes as readonly string[]).indexOf(mode) >= 0;

// ─────────────────────────────── level points (phase2c §3.1) ───────────────────────────────

/** What one counted win's level points depend on (phase2c §3.1). */
export interface LevelPointsInput {
  readonly mode: ModeId;
  /** Board size. */
  readonly n: number;
  readonly hard: boolean;
  /** The perfect streak INCLUDING this win (0 when this win had a mistake or a revive). */
  readonly streak: number;
}

/**
 * Level points of a counted win (phase2c §3.1): levelPoints.perSize × n (× hardMultiplier on a Hard
 * level) + streakStep × min(streak, streakCap). 0 for the tutorial and for a mode outside
 * levelPoints.modes. Every result is a multiple of 5 with the default config. Examples: 8×8 with a
 * mistake → 80; 8×8, 4th perfect win in a row → 120; 10×10 Hard, 12th perfect win → 300.
 */
export function levelPointsFor(input: LevelPointsInput, c: GameConfig = cfg): number {
  const lp = c.levelPoints;
  if (input.mode === 'tutorial' || !isScored(input.mode, lp.modes)) return 0;
  let base = lp.perSize * Math.max(0, Math.floor(input.n));
  if (input.hard) base *= lp.hardMultiplier;
  const streak = Math.max(0, Math.floor(input.streak));
  return base + lp.streakStep * Math.min(streak, lp.streakCap);
}

/** The streak record's ceiling (phase2c §3.8: 0 ≤ current ≤ best ≤ 1 000 000). */
export const STREAK_MAX = 1_000_000;

/**
 * The perfect streak after a counted win (phase2c §3.2): a perfect win (0 mistakes, 0 revives) in a
 * mode of levelPoints.modes adds 1 (best follows); any other win there sets current to 0 (it was
 * already 0 after the mistake). A mode outside levelPoints.modes (the tutorial) changes nothing.
 * Returns the same save when nothing changes.
 */
export function streakAfterWin(save: SaveData, mode: ModeId, perfect: boolean, c: GameConfig = cfg): SaveData {
  if (mode === 'tutorial' || !isScored(mode, c.levelPoints.modes)) return save;
  if (!perfect) return breakStreak(save);
  const current = Math.min(STREAK_MAX, save.streak.current + 1);
  return { ...save, streak: { current, best: Math.max(save.streak.best, current) } };
}

/** A mistake or a revive (phase2c §3.2): current = 0. The same save when it is already 0. */
export function breakStreak(save: SaveData): SaveData {
  if (save.streak.current === 0) return save;
  return { ...save, streak: { ...save.streak, current: 0 } };
}

// ─────────────────────────────── periods (phase2c §3.4, §3.5) ───────────────────────────────

/** score = periodIndex × PERIOD_SPAN + total; a period's total never exceeds PERIOD_SPAN − 1. */
export const PERIOD_SPAN = 100_000;
const WEEK_DAYS = 7;

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

const pad2 = (x: number): string => (x < 10 ? `0${x}` : String(x));
/** The YYYY-MM-DD key of a UTC midnight. */
function keyOfUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** UTC midnight of a real calendar date key (2026-02-30 is not one). Throws a RangeError otherwise. */
function realUtcDay(key: string): number {
  const ms = utcDay(key);
  if (keyOfUtc(ms) !== key) throw new RangeError(`bad date key ${key}`);
  return ms;
}

/** The Monday 00:00 UTC on or before a UTC midnight. */
function mondayOnOrBefore(dayMs: number): number {
  const dow = (new Date(dayMs).getUTCDay() + 6) % WEEK_DAYS; // Monday 0 … Sunday 6
  return dayMs - dow * DAY_MS;
}

/** The first UTC midnight of the period of `c.period.kind` that contains the UTC midnight `dayMs`. */
function periodStartOf(dayMs: number, c: GameConfig): number {
  switch (c.period.kind) {
    case 'day':
      return dayMs;
    case 'month': {
      const d = new Date(dayMs);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    default:
      return mondayOnOrBefore(dayMs);
  }
}

/**
 * The key (first day, `YYYY-MM-DD`) of the UTC period containing `now` (phase2c §3.5): weeks start on
 * Monday 00:00 UTC, days at 00:00 UTC, months on the 1st 00:00 UTC. 2026-10-09 → week '2026-10-05'.
 */
export function periodKeyAt(now: number, c: GameConfig = cfg): string {
  const t = Number.isFinite(now) ? now : 0;
  const d = new Date(t);
  return keyOfUtc(periodStartOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), c));
}

/** Whether `key` is a real date that starts a period of `c.period.kind` (a Monday for weeks, the 1st for months). */
export function isPeriodKey(key: string, c: GameConfig = cfg): boolean {
  try {
    const ms = realUtcDay(key);
    return periodStartOf(ms, c) === ms;
  } catch {
    return false;
  }
}

/**
 * Period index of a period key (phase2c §3.5, §4.3): index 0 is the period that contains
 * rank.periodEpoch (2026-01-05, a Monday); weeks and days count whole units from its start, months
 * count calendar months from its month. Negative before the epoch. Throws a RangeError on a key that
 * is not a period start of c.period.kind.
 */
export function periodIndex(key: string, c: GameConfig = cfg): number {
  const ms = realUtcDay(key);
  if (periodStartOf(ms, c) !== ms) throw new RangeError(`${key} does not start a ${c.period.kind}`);
  const epoch = periodStartOf(realUtcDay(c.rank.periodEpoch), c);
  switch (c.period.kind) {
    case 'day':
      return Math.round((ms - epoch) / DAY_MS);
    case 'month': {
      const a = new Date(ms);
      const b = new Date(epoch);
      return (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth());
    }
    default:
      return Math.round((ms - epoch) / (WEEK_DAYS * DAY_MS));
  }
}

/** A period total as it is stored and posted: a whole number in 0 … min(period.max, PERIOD_SPAN − 1). */
function periodCap(total: number, c: GameConfig): number {
  const t = Number.isFinite(total) ? Math.floor(total) : 0;
  return Math.min(Math.max(0, t), Math.min(c.period.max, PERIOD_SPAN - 1));
}

/**
 * period_points (phase2c §4.3): periodIndex × 100 000 + min(total, period.max). A newer period's
 * score beats any older period's total, so the board's best-score retention resets the ranking every
 * period. Below 2³¹ until period index 21 473. A key before the epoch encodes as index 0.
 */
export function encodePeriodScore(key: string, total: number, c: GameConfig = cfg): number {
  return Math.max(0, periodIndex(key, c)) * PERIOD_SPAN + periodCap(total, c);
}

/** This period's leaderboard points (phase2c §2.8): save.period.total when its key is the current one, else 0. */
export function periodTotal(save: SaveData, now: number, c: GameConfig = cfg): number {
  return save.period.key !== '' && save.period.key === periodKeyAt(now, c) ? save.period.total : 0;
}

/**
 * Adds a win's leaderboard points (phase2c §3.4): when the stored key is not the current period's,
 * the total restarts at 0 first; then += gained, capped at period.max. best keeps the highest period
 * total ever reached (a tie moves it to the later key). gained ≤ 0 changes nothing (same save).
 */
export function addPeriodPoints(save: SaveData, gained: number, now: number, c: GameConfig = cfg): SaveData {
  const add = Number.isFinite(gained) ? Math.floor(gained) : 0;
  if (add <= 0) return save;
  const key = periodKeyAt(now, c);
  const p = save.period;
  const total = periodCap((p.key === key ? p.total : 0) + add, c);
  const better = total > p.bestTotal || (total === p.bestTotal && key > p.bestKey);
  return {
    ...save,
    period: { key, total, bestKey: better ? key : p.bestKey, bestTotal: better ? total : p.bestTotal },
  };
}

/** Leaderboard points of a counted win (phase2c §3.4): fish kept × period.pointsPerFish in a mode of period.modes, else 0. */
export function keptPoints(mode: ModeId, kept: number, c: GameConfig = cfg): number {
  if (mode === 'tutorial' || !isScored(mode, c.period.modes)) return 0;
  return Math.max(0, Math.floor(Number.isFinite(kept) ? kept : 0)) * Math.max(0, Math.floor(c.period.pointsPerFish));
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

/** A board score decoded back into what the UI shows (the app formats it with i18n). */
export type DecodedScore =
  | { readonly kind: 'period'; readonly periodIndex: number; readonly total: number }
  | { readonly kind: 'time'; readonly dayIndex: number; readonly secs: number }
  | { readonly kind: 'event'; readonly solved: number; readonly totalSecs: number };

/**
 * The score format of a board: period_points → period (phase2c §4.3), daily_fastest → time,
 * event_* → event. The retired paw_points is never submitted or read after 2c (ranking-flow drops
 * it; the v3 migration drops its pending score), so it has no format of its own (removed at I-3).
 */
export function boardFormat(board: BoardKey, c: GameConfig = cfg): DecodedScore['kind'] {
  if (board === c.rank.boards.period) return 'period';
  if (board === c.rank.boards.daily) return 'time';
  return 'event';
}

/** Inverse of the encoders by board (band readers keep only the entries of the shown day or period). */
export function decodeScore(board: BoardKey, score: number, c: GameConfig = cfg): DecodedScore {
  const s = Math.max(0, Math.floor(score));
  switch (boardFormat(board, c)) {
    case 'period':
      return { kind: 'period', periodIndex: Math.floor(s / PERIOD_SPAN), total: s % PERIOD_SPAN };
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
