// Owner: app
// Launch-time save handling (04 §5.1, §7.2–7.3; 02 §15 "Restoring on launch"): migrate the local and
// cloud copies, merge them, and apply restore steps 1–3 (stale daily, failed validation). Steps 4–5
// (full board → win flow, 0 hearts → O4) take effect when the board is opened (session.start).
import type { Puzzle } from '../engine/types';
import type { LevelsRepo } from '../game/levels-repo';
import { dateKeyOf, isEndless } from '../game/progression';
import { clearStaleSlots, merge, migrateReport, validateInProgress } from '../game/save';
import type { InProgressV1, SaveDataV1 } from '../game/types';
import type { RawSave } from '../platform/types';
import { cfg, type GameConfig } from './config';
import { withSlot } from './session-parts';

export interface LoadedSave {
  readonly save: SaveDataV1;
  /** `where` values for the save_corrupt analytics event (02 §20). */
  readonly corrupt: readonly string[];
}

/**
 * migrate() each raw copy, then merge (04 §7.3). An empty or unreadable copy never takes part in
 * the merge: its defaults carry updatedAt = now and would otherwise win the "newest" fields.
 */
export function loadSave(raw: RawSave, now: number, c: GameConfig = cfg): LoadedSave {
  const corrupt: string[] = [];
  const local = migrateReport(raw.local, now, c);
  if (raw.corrupt || local.outcome === 'reset') corrupt.push('local');
  else if (local.outcome === 'repaired') corrupt.push('local_fields');
  const localOk = local.outcome !== 'empty' && local.outcome !== 'reset';
  if (raw.cloud === null || raw.cloud === undefined) return { save: clearStaleSlots(local.save), corrupt };
  const cloud = migrateReport(raw.cloud, now, c);
  if (cloud.outcome === 'reset') corrupt.push('cloud');
  else if (cloud.outcome === 'repaired') corrupt.push('cloud_fields');
  const cloudOk = cloud.outcome !== 'empty' && cloud.outcome !== 'reset';
  if (localOk && cloudOk) return { save: merge(local.save, cloud.save), corrupt };
  return { save: clearStaleSlots(cloudOk ? cloud.save : local.save), corrupt };
}

export interface RestoreResult {
  readonly save: SaveDataV1;
  /** Slots cleared by 02 §15 steps 2–3, for analytics/logging. */
  readonly cleared: readonly ('level' | 'daily')[];
}

export interface RestoreContext {
  /** Today's local date key (YYYY-MM-DD). */
  readonly today: string;
  readonly levels: LevelsRepo;
  /** Replaces the puzzle-based check (tests, or a caller that already holds the puzzles). */
  validate?(slot: InProgressV1): boolean;
  readonly config?: GameConfig;
}

function levelOfId(id: string): number | null {
  const m = /^L(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/**
 * The puzzle a slot belongs to, when it is cheap to get: a cached or bundled level, a fetched pack,
 * or the daily record. null when it would need on-device generation (endless levels) or a
 * substitute board: then the session validates the slot when the board is opened.
 */
async function puzzleForSlot(slot: InProgressV1, kind: 'level' | 'daily', ctx: RestoreContext): Promise<Puzzle | null> {
  const c = ctx.config ?? cfg;
  if (kind === 'level') {
    const level = levelOfId(slot.id);
    if (level === null) return null;
    const cached = ctx.levels.peekLevel(level);
    if (cached || isEndless(level, c)) return cached;
    const loaded = await ctx.levels.getLevel(level);
    return loaded.source === 'substitute' ? null : loaded.puzzle;
  }
  const date = dateKeyOf(slot.id);
  return date === null ? null : (await ctx.levels.getDaily(date)).puzzle;
}

/** 02 §15 restore steps 1–3 (stale daily, failed validation). Does not navigate (04 §5.1). */
export async function applyRestoreRules(save: SaveDataV1, ctx: RestoreContext): Promise<RestoreResult> {
  const c = ctx.config ?? cfg;
  const cleared: ('level' | 'daily')[] = [];
  let out = save;
  const clear = (kind: 'level' | 'daily'): void => {
    out = withSlot(out, kind, null);
    cleared.push(kind);
  };

  // Step 1: the tutorial is never saved, so there is nothing to restore for it.
  // Step 2: a daily slot for a date before today is cleared.
  const daily = out.inProgress.daily;
  if (daily) {
    const date = dateKeyOf(daily.id);
    if (date === null || date < ctx.today) clear('daily');
  }

  // Step 3: each slot must match its expected puzzle (current level, today's daily) and pass 04 §7.2.
  const expected: Record<'level' | 'daily', string> = { level: `L${out.progress.level}`, daily: `D${ctx.today}` };
  for (const kind of ['level', 'daily'] as const) {
    const slot = out.inProgress[kind];
    if (!slot) continue;
    if (slot.mode !== kind || slot.id !== expected[kind]) {
      clear(kind);
      continue;
    }
    let ok: boolean | null;
    if (ctx.validate) ok = ctx.validate(slot);
    else {
      try {
        const puzzle = await puzzleForSlot(slot, kind, ctx);
        ok = puzzle ? validateInProgress(slot, puzzle, { mode: kind, id: slot.id }, c).ok : null;
      } catch {
        ok = null; // cannot check now (offline, generation failed): the session re-validates on open
      }
    }
    if (ok === false) clear(kind);
  }
  return { save: out, cleared };
}
