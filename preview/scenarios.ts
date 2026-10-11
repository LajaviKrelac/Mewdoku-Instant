// Owner: lead (preview link, 2026-10-11). The seeded saves of the preview menu's shortcuts, built with the game's
// own save module (defaults → the fields a real player would have → the same validation every load runs). PURE:
// `now` is passed in; the date keys come from the game's own day maths (dailyDateKey, periodKeyAt).
import { cfg, type GameConfig } from '../src/app/config';
import { dailyDateKey } from '../src/game/progression';
import { defaults, migrate } from '../src/game/save';
import { periodKeyAt } from '../src/game/scoring';
import type { LevelBest, SaveData } from '../src/game/types';

const DAY = 86_400_000;

/** The returning player of the preview (the menu's "Returning player"; also the first visit). */
export const RETURNING = {
  level: 37,
  hints: 3,
  kitties: 2,
  /** Fish kept this week (the personal records' period total). */
  weekFish: 26,
  /** Counted streak days ending yesterday: the next win today is day 7 of 7 (the cycle's reward). */
  streakDays: 6,
  streakBest: 8,
  tenureDays: 20,
} as const;

/** The local date key `days` days before `now` (noon of that local day, so a DST change never skips a date). */
export function localDaysAgo(now: number, days: number, c: GameConfig = cfg): string {
  const d = new Date(now);
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - days, 12).getTime();
  return dailyDateKey(noon, c);
}

/** A few best times of the levels just played (ms, mistakes), so the records read like a real player's. */
function bests(level: number): Record<number, LevelBest> {
  const out: Record<number, LevelBest> = {};
  for (let l = Math.max(2, level - 8); l < level; l++) out[l] = [62_000 + ((l * 7919) % 41) * 1000, l % 3 === 0 ? 1 : 0];
  return out;
}

/**
 * Level 37 reached (36 completed: banners and interstitials are on, the daily is open), the streak on day 6 of 7
 * (the next win pays the day-7 reward), 3 hints and 2 kitties, 26 fish kept this week, past the tutorial.
 */
export function returningSave(now: number, c: GameConfig = cfg): SaveData {
  const base = defaults(now - RETURNING.tenureDays * DAY, c);
  const week = periodKeyAt(now, c);
  const dates: string[] = [];
  for (let k = RETURNING.streakDays; k >= 1; k--) dates.push(localDaysAgo(now, k, c));
  const save: SaveData = {
    ...base,
    updatedAt: now,
    sessions: 14,
    tutorialDone: true,
    progress: { level: RETURNING.level, completed: RETURNING.level - 1, best: bests(RETURNING.level) },
    stock: { hints: RETURNING.hints, kitties: RETURNING.kitties },
    period: { key: week, total: RETURNING.weekFish, bestKey: week, bestTotal: RETURNING.weekFish },
    dayStreak: { dates, run: RETURNING.streakDays, best: RETURNING.streakBest, paid: [] },
  };
  // The same validation as every load (a field it would repair is a bug in this seed: tests/unit/preview).
  return migrate(save, now, c);
}

/** The menu's "Out of helpers": the current save (a returning one when the tutorial is not done) with 0 / 0. */
export function outOfHelpersSave(current: SaveData | null, now: number, c: GameConfig = cfg): SaveData {
  const base = current && current.tutorialDone ? current : returningSave(now, c);
  return { ...base, updatedAt: now, stock: { hints: 0, kitties: 0 } };
}
