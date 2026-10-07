// Owner: game
// Win bookkeeping and records (02 §10.1). PURE: returns new SaveDataV1 objects (never mutates).
// updatedAt is left to the save scheduler, which stamps every write (04 §7.1).
import type { DailyRecord, GameState, LevelBest, SaveDataV1 } from './types';

/**
 * Level L won (02 §10.1): progress.level = L + 1, completed += 1, best[L] = [ms, mistakes],
 * inProgress.level = null. Idempotent: a level that was already counted (L < progress.level, e.g. a
 * crash-restored full board whose win was saved elsewhere, 02 §15 step 4) does not count twice and
 * keeps the faster record (as merge does, 04 §7.3). progress.level never goes backwards; times are
 * whole ms.
 */
export function applyLevelWin(save: SaveDataV1, level: number, state: GameState): SaveDataV1 {
  const record: LevelBest = [Math.round(state.elapsedMs), state.mistakes];
  const counted = level < save.progress.level;
  const prev = save.progress.best[level];
  return {
    ...save,
    progress: {
      level: Math.max(save.progress.level, level + 1),
      completed: save.progress.completed + (counted ? 0 : 1),
      best: { ...save.progress.best, [level]: better(prev, record) },
    },
    inProgress: { ...save.inProgress, level: null },
  };
}

/**
 * First-run tutorial win or "I know how to play" (02 §4.2, §10.1): tutorialDone = true,
 * progress.level ≥ 2, completed ≥ 1. No stats record. The tutorial replay saves nothing (the caller
 * does not call this).
 */
export function applyTutorialDone(save: SaveDataV1): SaveDataV1 {
  return {
    ...save,
    tutorialDone: true,
    progress: {
      ...save.progress,
      level: Math.max(save.progress.level, 2),
      completed: Math.max(save.progress.completed, 1),
    },
  };
}

/**
 * Daily won (02 §10.1): daily[date] = [ms, mistakes, hints, kitties], inProgress.daily = null.
 * Dailies do not count toward progress.completed (02 §13.2). A second win for the same date keeps the
 * faster record.
 */
export function applyDailyWin(save: SaveDataV1, dateKey: string, state: GameState): SaveDataV1 {
  const record: DailyRecord = [Math.round(state.elapsedMs), state.mistakes, state.hintsUsed, state.kittiesUsed];
  return {
    ...save,
    daily: { ...save.daily, [dateKey]: better(save.daily[dateKey], record) },
    inProgress: { ...save.inProgress, daily: null },
  };
}

/** The record with the smaller ms ([0]); ties keep the existing one. */
function better<T extends readonly number[]>(prev: T | undefined, next: T): T {
  return prev !== undefined && (prev[0] ?? Infinity) <= (next[0] ?? Infinity) ? prev : next;
}

export function levelBest(save: SaveDataV1, level: number): LevelBest | null {
  return save.progress.best[level] ?? null;
}

export function dailyRecord(save: SaveDataV1, dateKey: string): DailyRecord | null {
  return save.daily[dateKey] ?? null;
}
