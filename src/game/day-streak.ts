// Owner: G1 (Phase 2e)
// The daily streak (docs/phase2e/spec.md §5, D-2e-12; CONTRACTS §6): our own provisional design. A local
// day (dailyDateKey: the daily's date key, daily.dayStartHour) counts once the player WINS a puzzle that
// day in a mode of dayStreak.modes (the caller filters modes, the tutorial, restored boards and replays).
// Days 1 … cycleDays; the cycle's last day pays dayStreak.reward (plus any dayStreak.dayRewards row for
// its day), at most once per counted date (`paid`); a missed day resets the run (dayStreak.missResets).
// Clock guards (§5.1): a date before the last counted one is ignored (moving the clock back neither
// counts nor resets); a jump of two or more days is a missed day (moving it forward only hurts).
// No urgency anywhere: this module only counts; the copy is G3's (§5.3).
// PURE: dates are YYYY-MM-DD strings; day arithmetic is on the calendar date (UTC maths on the key),
// never on the device clock, so DST never moves a day.
import { cfg, type GameConfig } from '../app/config';
import { DATE_KEY_RE, isNonNegInt, isRecord } from './save-fields';
import type { DayStreakRecord } from './types';

export type { DayStreakRecord } from './types';

/** `run` and `best` never exceed this (validation bound, spec §7.1). */
export const DAY_STREAK_RUN_MAX = 1_000_000;

export interface StreakReward {
  readonly hints: number;
  readonly kitties: number;
}

export interface StreakCount {
  readonly ds: DayStreakRecord;
  /** This win made `dateKey` a counted day (the first counted win of that day). */
  readonly counted: boolean;
  /** The counted day's place in the cycle, 1 … cycleDays; 0 when not counted. */
  readonly day: number;
  /** The run was broken before this day (a missed day: the run starts again at 1). */
  readonly reset: boolean;
  /** The reward paid with this day (already added to `paid`), or null. */
  readonly reward: StreakReward | null;
  /** The run before this win (for streak_reset {prev}). */
  readonly prevRun: number;
}

export interface StreakView {
  /** The last counted day's place in the cycle (1 … total); 0 with no live run. */
  readonly day: number;
  /** dayStreak.cycleDays. */
  readonly total: number;
  /** Today is already counted. */
  readonly todayDone: boolean;
  /** The run is still going: today or yesterday counted (or the clock went back). */
  readonly alive: boolean;
  /** A run existed and a day was missed ("A new streak starts today."). */
  readonly broken: boolean;
  readonly best: number;
  /** The run (consecutive counted days ending at the last counted date; 0 when not alive). */
  readonly run: number;
}

/** The empty record (spec §7.1 default). */
export function emptyDayStreak(): DayStreakRecord {
  return { dates: [], run: 0, best: 0, paid: [] };
}

/** Days since 1970-01-01 of a valid date key (calendar maths, no time zone). */
export function dayNumber(dateKey: string): number {
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(5, 7));
  const d = Number(dateKey.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** A real calendar date in YYYY-MM-DD (not 2026-02-30). */
export function isDateKey(x: unknown): x is string {
  if (typeof x !== 'string' || !DATE_KEY_RE.test(x)) return false;
  const y = Number(x.slice(0, 4));
  const m = Number(x.slice(5, 7));
  const d = Number(x.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const cycleOf = (c: GameConfig): number => Math.max(1, Math.floor(c.dayStreak.cycleDays));
const historyOf = (c: GameConfig): number => Math.max(2, Math.floor(c.dayStreak.historyDays));
const paidKeptOf = (c: GameConfig): number => Math.max(1, Math.floor(c.dayStreak.paidKept));

/** The run's place in the cycle: ((run − 1) mod cycleDays) + 1; 0 for run 0. */
export function cycleDay(run: number, c: GameConfig = cfg): number {
  if (run <= 0) return 0;
  return ((run - 1) % cycleOf(c)) + 1;
}

/** The reward of a cycle day (the cycle's last day: dayStreak.reward; plus any dayRewards row of that day); null when nothing. */
export function rewardForDay(day: number, c: GameConfig = cfg): StreakReward | null {
  const ds = c.dayStreak;
  let hints = 0;
  let kitties = 0;
  if (day === cycleOf(c)) {
    hints += ds.reward.hints;
    kitties += ds.reward.kitties;
  }
  for (const r of ds.dayRewards) {
    if (r.day === day) {
      hints += r.hints;
      kitties += r.kitties;
    }
  }
  hints = Math.max(0, Math.floor(hints));
  kitties = Math.max(0, Math.floor(kitties));
  return hints > 0 || kitties > 0 ? { hints, kitties } : null;
}

/** "<date>|<hints>|<kitties>" (save.dayStreak.paid). */
export function paidEntry(dateKey: string, r: StreakReward): string {
  return `${dateKey}|${r.hints}|${r.kitties}`;
}

const PAID_RE = /^(\d{4}-\d{2}-\d{2})\|(\d{1,4})\|(\d{1,4})$/;

/** A paid entry's parts, or null. */
export function parsePaidEntry(entry: string): { date: string; hints: number; kitties: number } | null {
  const m = PAID_RE.exec(entry);
  if (!m || !isDateKey(m[1])) return null;
  return { date: m[1] as string, hints: Number(m[2]), kitties: Number(m[3]) };
}

/** Sorted, unique, valid dates, the newest `keep`. */
function normDates(dates: readonly string[], keep: number): string[] {
  const set = new Set<string>();
  for (const d of dates) if (isDateKey(d)) set.add(d);
  const out = [...set].sort();
  return out.slice(Math.max(0, out.length - keep));
}

/** Valid paid entries, unique, sorted by date (then text), the newest `keep`. */
function normPaid(paid: readonly string[], keep: number): string[] {
  const set = new Set<string>();
  for (const p of paid) if (typeof p === 'string' && parsePaidEntry(p)) set.add(p);
  const out = [...set].sort();
  return out.slice(Math.max(0, out.length - keep));
}

/** The number of consecutive dates ending at the newest (sorted unique input). */
function chainLength(dates: readonly string[]): number {
  if (dates.length === 0) return 0;
  let n = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    if (dayNumber(dates[i] as string) - dayNumber(dates[i - 1] as string) !== 1) break;
    n++;
  }
  return n;
}

/**
 * The first counted win of a day (spec §5.1, §5.2). `dateKey` is dailyDateKey(now). Not counted: a
 * disabled streak, a bad key, a day already counted, a date before the last counted date (the clock went
 * back). A day after a missed one (gap ≥ 2 days, with dayStreak.missResets) starts the run at 1.
 */
export function countWin(ds: DayStreakRecord, dateKey: string, c: GameConfig = cfg): StreakCount {
  const none = (): StreakCount => ({ ds, counted: false, day: 0, reset: false, reward: null, prevRun: ds.run });
  if (!c.dayStreak.enabled || !isDateKey(dateKey)) return none();
  const last = ds.dates[ds.dates.length - 1];
  if (last !== undefined && dateKey <= last) return none();
  const gap = last === undefined ? Infinity : dayNumber(dateKey) - dayNumber(last);
  const consecutive = ds.run > 0 && (gap === 1 || (!c.dayStreak.missResets && Number.isFinite(gap)));
  const reset = ds.run > 0 && !consecutive;
  const run = Math.min(DAY_STREAK_RUN_MAX, consecutive ? ds.run + 1 : 1);
  const day = cycleDay(run, c);
  let paid = ds.paid;
  let reward = rewardForDay(day, c);
  if (reward && paid.some((p) => p.startsWith(`${dateKey}|`))) reward = null; // once per counted date
  if (reward) paid = normPaid([...paid, paidEntry(dateKey, reward)], paidKeptOf(c));
  const next: DayStreakRecord = {
    dates: normDates([...ds.dates, dateKey], historyOf(c)),
    run,
    best: Math.max(ds.best, run),
    paid,
  };
  return { ds: next, counted: true, day, reset, reward, prevRun: ds.run };
}

/**
 * What Home shows today (spec §5.3). Alive: the last counted date is today or yesterday (with
 * missResets; without it any run stays alive), or later than today (the clock went back: shown as
 * done, nothing counts until the date passes). Broken: a run existed and a day was missed.
 */
export function streakView(ds: DayStreakRecord, today: string, c: GameConfig = cfg): StreakView {
  const total = cycleOf(c);
  const last = ds.dates[ds.dates.length - 1];
  if (last === undefined || ds.run <= 0 || !isDateKey(today)) {
    return { day: 0, total, todayDone: false, alive: false, broken: false, best: ds.best, run: 0 };
  }
  const gap = dayNumber(today) - dayNumber(last);
  const todayDone = gap <= 0;
  const alive = gap <= 1 || !c.dayStreak.missResets;
  if (!alive) return { day: 0, total, todayDone: false, alive: false, broken: true, best: ds.best, run: 0 };
  return { day: cycleDay(ds.run, c), total, todayDone, alive: true, broken: false, best: ds.best, run: ds.run };
}

/** One day of the streak screen's week row (UI batch 2026-10-13): a date of the current cycle. */
export interface StreakWeekDay {
  readonly dateKey: string;
  /** The date's place in the cycle, 1 … cycleDays. */
  readonly day: number;
  /** A counted day of the live run. */
  readonly played: boolean;
  readonly today: boolean;
  /** What this cycle day pays (rewardForDay), or null: the row draws the gift only where a reward really pays. */
  readonly reward: StreakReward | null;
  /** That reward was paid on this date (save.dayStreak.paid). */
  readonly paid: boolean;
}

/** The YYYY-MM-DD key of a day number (dayNumber's inverse). */
export function dateKeyOfDay(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The streak screen's week row (UI batch 2026-10-13; our reward pays on the cycle's last day of the RUN, so the row
 * is the run's current cycle, not a calendar week): the cycleDays dates from the cycle's day 1. With a live run the
 * cycle is the one holding the last counted day, except when that day closed a cycle and today is not counted yet:
 * then the next cycle starts today. Without a live run (none, broken) day 1 is today. Played = a counted day of the
 * live run (a day of an older, broken run never shows). [] for a bad `today`. Pure.
 */
export function streakWeek(ds: DayStreakRecord, today: string, c: GameConfig = cfg): StreakWeekDay[] {
  if (!isDateKey(today)) return [];
  const total = cycleOf(c);
  const v = streakView(ds, today, c);
  const todayN = dayNumber(today);
  const last = ds.dates[ds.dates.length - 1];
  const lastN = v.alive && last !== undefined ? dayNumber(last) : -Infinity;
  let start = todayN;
  if (v.alive && !(v.day === total && !v.todayDone)) start = lastN - (v.day - 1);
  const paidDates = new Set<string>();
  for (const p of ds.paid) {
    const e = parsePaidEntry(p);
    if (e) paidDates.add(e.date);
  }
  const out: StreakWeekDay[] = [];
  for (let i = 0; i < total; i++) {
    const n = start + i;
    const dateKey = dateKeyOfDay(n);
    const reward = rewardForDay(i + 1, c);
    out.push({ dateKey, day: i + 1, played: n <= lastN, today: n === todayN, reward, paid: reward !== null && paidDates.has(dateKey) });
  }
  return out;
}

/**
 * Merge of two copies (spec §5.2): dates = the union (newest historyDays); run recomputed from the
 * union: the consecutive chain ending at the newest date; when that chain reaches the oldest kept date
 * (older history was dropped), it is extended with a copy's run whose last date lies in the chain (the
 * stale-device case: one device counted yesterday as day 6, the other counts today → day 7). best =
 * the max of both and the merged run; paid = the union (newest paidKept).
 */
export function mergeDayStreak(a: DayStreakRecord, b: DayStreakRecord, c: GameConfig = cfg): DayStreakRecord {
  const dates = normDates([...a.dates, ...b.dates], historyOf(c));
  let run = chainLength(dates);
  if (dates.length > 0 && run === dates.length) {
    const end = dates.length - 1;
    for (const x of [a, b]) {
      const lastX = x.dates[x.dates.length - 1];
      if (lastX === undefined || x.run <= 0) continue;
      const j = dates.indexOf(lastX);
      if (j < 0) continue;
      run = Math.max(run, x.run + (end - j));
    }
  }
  run = Math.min(DAY_STREAK_RUN_MAX, run);
  return {
    dates,
    run,
    best: Math.min(DAY_STREAK_RUN_MAX, Math.max(a.best, b.best, run)),
    paid: normPaid([...a.paid, ...b.paid], paidKeptOf(c)),
  };
}

/**
 * Validation of a stored record (spec §7.1): valid sorted unique dates (newest historyDays); run an
 * integer 0 … 1 000 000, equal to the dates' chain when that chain has a gap before it (the run ended
 * there), at least the chain otherwise (older history may have been dropped), 0 with no dates; best ≥
 * run; paid entries valid (newest paidKept). A repaired path is pushed to `rep` (save_corrupt).
 */
export function readDayStreak(x: unknown, c: GameConfig, rep: string[]): DayStreakRecord {
  if (!isRecord(x)) {
    rep.push('dayStreak');
    return emptyDayStreak();
  }
  const rawDates = Array.isArray(x.dates) ? (x.dates as unknown[]) : null;
  if (!rawDates) rep.push('dayStreak.dates');
  const dates = normDates((rawDates ?? []).filter((d): d is string => typeof d === 'string'), historyOf(c));
  if (rawDates && (dates.length !== rawDates.length || dates.some((d, i) => d !== rawDates[i]))) rep.push('dayStreak.dates');

  let run = 0;
  if (isNonNegInt(x.run) && x.run <= DAY_STREAK_RUN_MAX) run = x.run;
  else rep.push('dayStreak.run');
  const chain = chainLength(dates);
  const fixedRun = dates.length === 0 ? 0 : chain < dates.length ? chain : Math.max(run, chain);
  if (fixedRun !== run) {
    if (!rep.includes('dayStreak.run')) rep.push('dayStreak.run');
    run = fixedRun;
  }

  let best = 0;
  if (isNonNegInt(x.best) && x.best <= DAY_STREAK_RUN_MAX) best = x.best;
  else rep.push('dayStreak.best');
  if (best < run) {
    if (!rep.includes('dayStreak.best')) rep.push('dayStreak.best');
    best = run;
  }

  const rawPaid = Array.isArray(x.paid) ? (x.paid as unknown[]) : null;
  if (!rawPaid) rep.push('dayStreak.paid');
  const paid = normPaid((rawPaid ?? []).filter((p): p is string => typeof p === 'string'), paidKeptOf(c));
  if (rawPaid && (paid.length !== rawPaid.length || paid.some((p, i) => p !== rawPaid[i]))) rep.push('dayStreak.paid');
  return { dates, run, best, paid };
}
