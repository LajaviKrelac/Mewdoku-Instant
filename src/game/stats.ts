// Owner: game
// Win bookkeeping and records (02 §10.1). PURE: returns new SaveDataV1 objects.
import type { GameState, LevelBest, DailyRecord, SaveDataV1 } from './types';

/**
 * Level L won: progress.level = L+1, completed += 1, best[L] = [ms, mistakes], inProgress.level = null.
 * progress.level never goes backwards (max), and times are stored as whole ms.
 */
export function applyLevelWin(save: SaveDataV1, level: number, state: GameState): SaveDataV1 {
  const record: LevelBest = [Math.round(state.elapsedMs), state.mistakes];
  return {
    ...save,
    progress: {
      level: Math.max(save.progress.level, level + 1),
      completed: save.progress.completed + 1,
      best: { ...save.progress.best, [level]: record },
    },
    inProgress: { ...save.inProgress, level: null },
  };
}

/** First-run tutorial win or skip: tutorialDone, progress.level ≥ 2, completed ≥ 1. No stats record. */
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

/** Daily won: daily[date] = [ms, mistakes, hints, kitties], inProgress.daily = null. */
export function applyDailyWin(save: SaveDataV1, dateKey: string, state: GameState): SaveDataV1 {
  const record: DailyRecord = [Math.round(state.elapsedMs), state.mistakes, state.hintsUsed, state.kittiesUsed];
  return {
    ...save,
    daily: { ...save.daily, [dateKey]: record },
    inProgress: { ...save.inProgress, daily: null },
  };
}

export function levelBest(save: SaveDataV1, level: number): LevelBest | null {
  return save.progress.best[level] ?? null;
}

export function dailyRecord(save: SaveDataV1, dateKey: string): DailyRecord | null {
  return save.daily[dateKey] ?? null;
}
