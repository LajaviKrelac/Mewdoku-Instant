// Owner: G4 (Phase 2e). The per-win limits of the anti-cheat (spec §1.9, D-2e-15): fish consistency, size
// floors, the daily and event windows, and the play-time budget. PURE. No limit removes anyone: they
// reject a win or raise a flag for the admin (§1.9.7).
import { utcDateKey, HOUR } from './clock';
import { solveFloors, type ServerConfig } from './config';
import type { EventInfo } from '../content/lookup';

export type FlagKind =
  | 'bad_solution'
  | 'bad_fish'
  | 'inconsistent'
  | 'too_fast'
  | 'soft_fast'
  | 'level_jump'
  | 'window_cap'
  | 'wins_flag'
  | 'budget'
  | 'unverified'
  | 'nickname_blocked'
  | 'anon_burst';

export interface FishInput {
  readonly fish: number;
  readonly mistakes: number;
  readonly revives: number;
}

/**
 * Step 3 (spec §1.9.3): 1 ≤ fish ≤ fishMax → else `bad_fish`; revives ≤ maxRevives and the save
 * validator's own invariant `fish == fishMax + revives × fishOnRevive − mistakes` (and, after a revive,
 * fish ≤ fishOnRevive) → else `inconsistent`.
 */
export function fishProblem(w: FishInput, fishMax: number, cfg: ServerConfig): 'bad_fish' | 'inconsistent' | null {
  if (w.fish < 1 || w.fish > fishMax) return 'bad_fish';
  if (w.revives > cfg.scoring.maxRevives) return 'inconsistent';
  if (w.fish !== fishMax + w.revives * cfg.scoring.fishOnRevive - w.mistakes) return 'inconsistent';
  if (w.revives > 0 && w.fish > cfg.scoring.fishOnRevive) return 'inconsistent';
  return null;
}

/** Step 5 (§1.9.4): below the hard floor → `too_fast` (rejected); below the soft one → `soft_fast` (flagged). */
export function speedProblem(n: number, solveMs: number, cfg: ServerConfig): 'too_fast' | 'soft_fast' | null {
  const [hard, soft] = solveFloors(cfg, n);
  if (solveMs < hard) return 'too_fast';
  if (solveMs < soft) return 'soft_fast';
  return null;
}

/**
 * Step 6 (§1.9.3, critic C-14): a daily date lies within [UTC date of (now − 12 h − dailyGraceMs), UTC
 * date of (now + 15 h)]: never a date that is still in the future everywhere (UTC+14, plus 1 h), never one
 * that ended more than the grace ago anywhere (UTC−12). `date` is a real calendar date (checked by the lookup).
 */
export function dailyWindowOk(date: string, now: number, cfg: ServerConfig): boolean {
  const lo = utcDateKey(now - 12 * HOUR - cfg.antiCheat.dailyGraceMs);
  const hi = utcDateKey(now + 15 * HOUR);
  return date >= lo && date <= hi;
}

/** An event win lies within [startUtc − before, endUtc + after] (srv `antiCheat.eventGraceMs`). */
export function eventWindowOk(e: EventInfo, now: number, cfg: ServerConfig): boolean {
  return now >= e.startMs - cfg.antiCheat.eventGraceMs.before && now <= e.endMs + cfg.antiCheat.eventGraceMs.after;
}

/** The budget refilled to `now` (§1.9.5): real time, up to the capacity. */
export function budgetAt(budgetMs: number, budgetAt: number, now: number, cfg: ServerConfig): number {
  return Math.min(cfg.antiCheat.budget.capacityMs, budgetMs + Math.max(0, now - budgetAt));
}

/** What an accepted win costs: clamp(max(solveMs, softMin(n)), 0, perWinCapMs). */
export function winCost(n: number, solveMs: number, cfg: ServerConfig): number {
  const soft = solveFloors(cfg, n)[1];
  return Math.min(cfg.antiCheat.budget.perWinCapMs, Math.max(0, Math.max(solveMs, soft)));
}
