// Owner: G4 (Phase 2e). Brackets (spec §1.5, D-2e-3) and rank rewards (§1.6, D-2e-17): the period maths,
// the order of rows and who is paid. PURE: the store reads and writes, this decides.
import type { PeriodMode } from '../contract';
import { DAY, utcDayStart } from './clock';
import type { RewardPlace, ServerConfig } from './config';

export interface BracketTimes {
  readonly openedAt: number;
  readonly joinUntil: number;
  readonly endsAt: number;
}

/**
 * A new bracket's windows. `rolling` (P-L1): 24 h from its first win, joinable for 2 h. `utc_day`: ends at
 * the next 00:00 UTC (the following one when less than `utcDay.minTimeLeftMs` is left) and is joinable
 * until `minTimeLeftMs` before its end.
 */
export function bracketTimes(mode: PeriodMode, now: number, cfg: ServerConfig): BracketTimes {
  if (mode === 'utc_day') {
    let endsAt = utcDayStart(now) + DAY;
    if (endsAt - now < cfg.bracket.utcDay.minTimeLeftMs) endsAt += DAY;
    return { openedAt: now, joinUntil: endsAt - cfg.bracket.utcDay.minTimeLeftMs, endsAt };
  }
  const endsAt = now + cfg.bracket.durationMs;
  return { openedAt: now, joinUntil: Math.min(now + cfg.bracket.joinWindowMs, endsAt), endsAt };
}

export interface Rankable {
  readonly slot: number;
  readonly points: number;
  readonly scoredAt: number;
}

/**
 * `points DESC`, then `scored_at ASC` (who reached the total first, P-L11), then `slot ASC`; ranks are
 * positions 1…N, never shared. The ONE ordering of the server (open views, finalisation, refinalize).
 */
export function rankRows<T extends Rankable>(rows: readonly T[]): (T & { readonly rank: number })[] {
  return [...rows]
    .sort((a, b) => b.points - a.points || a.scoredAt - b.scoredAt || a.slot - b.slot)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface PaidPlace extends RewardPlace {
  readonly slot: number;
}

/**
 * Who is paid from the frozen standings (spec §1.6, H-4): the bracket has at least `rewards.minMembers`
 * visible rows and, with `needOneBelow`, at least place + 1 (you beat someone); the row has points > 0.
 * `ranked` = every visible row in rank order, computer players included (2026-10-12, D-2e-24: they count
 * toward minMembers and the one-below rule); callers drop places held by `isRivalSlot` slots (core/table.ts
 * finalPlan), which are never paid and never passed down.
 */
export function paidPlaces(ranked: readonly (Rankable & { readonly rank: number })[], cfg: ServerConfig): PaidPlace[] {
  const visible = ranked.length;
  if (visible < cfg.rewards.minMembers) return [];
  const out: PaidPlace[] = [];
  for (const p of cfg.rewards.places) {
    if (cfg.rewards.needOneBelow && visible < p.place + 1) continue;
    const m = ranked.find((r) => r.rank === p.place);
    if (!m || m.points <= 0 || (p.hints <= 0 && p.kitties <= 0)) continue;
    out.push({ ...p, slot: m.slot });
  }
  return out;
}

/** The base grant of a stored reward, doubled when claimed doubled. */
export function grantOf(hints: number, kitties: number, doubled: boolean): { hints: number; kitties: number } {
  const k = doubled ? 2 : 1;
  return { hints: hints * k, kitties: kitties * k };
}

/** Hearts from OTHER players since the last read (spec §1.7): never negative. */
export function heartsNew(hearts: number, heartsSelf: number, heartsSeen: number): number {
  return Math.max(0, hearts - heartsSelf - heartsSeen);
}
