// UI batch (2026-10-13): profile — which avatar frames and backgrounds a player may pick ("Mix: some free, rest
// unlock", the user's call). Ids 0–2 of each are free; the rest unlock by progress this device's save can back: the
// level reached (progress.level, the next level to play), the best day streak (dayStreak.best), a ranking prize
// claimed (ladder.claimed is not empty: a paid 1st–3rd place). Nothing here claims an achievement the save does not
// hold (H-8). The server stores any id in range (it cannot see this progress), so a look already worn stays worn
// even where this device has not unlocked it (picked on another device): only a NEW pick is checked.
// PURE: the save's numbers in, no clock, no randomness, no I/O. The table is append-only, one entry per id of
// FRAME_COUNT / BACKGROUND_COUNT (src/shared/rank-api.ts; a test keeps the lengths equal).
import type { SaveData } from './types';

export type LookUnlock =
  | { readonly kind: 'free' }
  | { readonly kind: 'level'; readonly level: number }
  | { readonly kind: 'streak'; readonly days: number }
  | { readonly kind: 'prize' };

const FREE: LookUnlock = { kind: 'free' };
const level = (n: number): LookUnlock => ({ kind: 'level', level: n });
const streak = (days: number): LookUnlock => ({ kind: 'streak', days });
const PRIZE: LookUnlock = { kind: 'prize' };

/** Frames by id: none, solid, double, beaded, scalloped, studded, laurel, starry (art/looks-art.ts). */
export const FRAME_UNLOCKS: readonly LookUnlock[] = Object.freeze([FREE, FREE, FREE, level(25), streak(7), level(100), PRIZE, level(300)]);
/** Backgrounds by id: the coat's disc, cream, mint, polka, stripes, night sky, sunburst, rainbow (art/looks-art.ts). */
export const BACKGROUND_UNLOCKS: readonly LookUnlock[] = Object.freeze([FREE, FREE, FREE, level(50), streak(14), level(200), PRIZE, level(500)]);

/** The progress the unlocks read. */
export interface LookProgress {
  /** The next level to play (progress.level). */
  readonly level: number;
  /** The best run of counted days (dayStreak.best). */
  readonly bestStreak: number;
  /** Ranking prizes claimed on this device (ladder.claimed entries). */
  readonly prizes: number;
}

export function lookProgress(save: Pick<SaveData, 'progress' | 'dayStreak' | 'ladder'>): LookProgress {
  return { level: save.progress.level, bestStreak: save.dayStreak.best, prizes: save.ladder.claimed.length };
}

export function isUnlocked(u: LookUnlock, p: LookProgress): boolean {
  switch (u.kind) {
    case 'free':
      return true;
    case 'level':
      return p.level >= u.level;
    case 'streak':
      return p.bestStreak >= u.days;
    case 'prize':
      return p.prizes > 0;
  }
}

/**
 * Per id 0 … count − 1: null when it may be picked, else what unlocks it. `worn` (the id the player wears now) is
 * never locked. An id past the table (a newer server's look) is locked behind nothing we can show: it is not offered.
 */
export function lookLocks(table: readonly LookUnlock[], count: number, p: LookProgress, worn: number): (LookUnlock | null)[] {
  const out: (LookUnlock | null)[] = [];
  for (let id = 0; id < Math.min(count, table.length); id++) {
    const u = table[id] as LookUnlock;
    out.push(id === worn || isUnlocked(u, p) ? null : u);
  }
  return out;
}
