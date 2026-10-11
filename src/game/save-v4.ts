// Owner: G1 (Phase 2e)
// Save schema v4 (docs/phase2e/spec.md §7.1, D-2e-6; CONTRACTS §6): the v3 → v4 migration (add the
// ranking client's record `ladder`, the daily streak `dayStreak` and the consume-first intent ledger
// purchases.pending at their defaults; drop the retired FB weekly board's queued score
// rank.pending.period_points; NO retro grant: the streak starts empty, nothing is derived from save.daily),
// the validation of the new fields ("an invalid field takes its default and is reported to save_corrupt")
// and their merge rows. PURE. save.ts wires these into defaults() / migrate() / merge(); the paid-grant
// repair over ladder.claimed and dayStreak.paid lives in purchases.ts (repairPaidGrants).
// Kept OUT of the save (spec §7.1): the bearer token, the web device credential, the remote switches
// cache and the cached bracket rows (other players' names).
import { cfg, type GameConfig } from '../app/config';
import { emptyDayStreak, mergeDayStreak, readDayStreak } from './day-streak';
import { emptyLadder, mergeLadder, readLadder } from './ladder';
import { parseLedgerEntry } from './purchases';
import { isRecord } from './save-fields';
import type { DayStreakRecord, LadderRecord, SaveData } from './types';

/** The fields v4 adds (purchases.pending travels inside purchases). */
export interface V4Fields {
  readonly ladder: LadderRecord;
  readonly dayStreak: DayStreakRecord;
  readonly purchasesPending: string[];
}

/** §7.1 defaults. */
export function v4Defaults(c: GameConfig = cfg): V4Fields {
  return { ladder: emptyLadder(c), dayStreak: emptyDayStreak(), purchasesPending: [] };
}

/**
 * MIGRATIONS[3] (spec §7.1): v = 4; `ladder` and `dayStreak` at their defaults; purchases.pending = [];
 * rank.pending.period_points dropped (the FB weekly board is retired, D-2e-4). Everything else is kept.
 * Groups that are not objects are left as they are, so validation reports and repairs them.
 */
export function migrate_3_to_4(d: Record<string, unknown>, c: GameConfig = cfg): Record<string, unknown> {
  const def = v4Defaults(c);
  const out: Record<string, unknown> = { ...d, v: 4, ladder: def.ladder, dayStreak: def.dayStreak };
  if (isRecord(d.purchases)) out.purchases = { ...d.purchases, pending: [] };
  const rank = d.rank;
  if (isRecord(rank) && isRecord(rank.pending) && Object.prototype.hasOwnProperty.call(rank.pending, 'period_points')) {
    const { period_points: _drop, ...pending } = rank.pending;
    out.rank = { ...rank, pending };
  }
  return out;
}

/** "<productId>|<token>" of a known product (catalogue or retired) with a non-empty token. */
export function isPendingEntry(x: unknown, c: GameConfig = cfg): x is string {
  return typeof x === 'string' && x.length <= 240 && parseLedgerEntry(x, c) !== null;
}

/** Unique valid entries, minus any token in `granted` (already in a tokens ledger), the newest iap.pendingKept. */
export function capPending(entries: readonly string[], granted: ReadonlySet<string>, c: GameConfig = cfg): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (!isPendingEntry(e, c) || seen.has(e)) continue;
    const rec = parseLedgerEntry(e, c);
    if (!rec || granted.has(rec.purchaseToken)) continue;
    seen.add(e);
    out.push(e);
  }
  return out.slice(Math.max(0, out.length - Math.max(1, c.iap.pendingKept)));
}

/** The purchase tokens of a tokens ledger. */
export function ledgerTokens(tokens: readonly string[], c: GameConfig = cfg): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    const rec = parseLedgerEntry(t, c);
    if (rec) out.add(rec.purchaseToken);
  }
  return out;
}

/** Reads the v4 fields of a migrated document; repaired paths are pushed to `rep` (save_corrupt). */
export function readV4Fields(d: Record<string, unknown>, c: GameConfig, rep: string[], tokens: readonly string[]): V4Fields {
  const ladder = readLadder(d.ladder, c, rep);
  const dayStreak = readDayStreak(d.dayStreak, c, rep);
  let purchasesPending: string[] = [];
  const pu = d.purchases;
  if (isRecord(pu)) {
    if (Array.isArray(pu.pending)) {
      purchasesPending = capPending(pu.pending as unknown[] as string[], ledgerTokens(tokens, c), c);
      if (purchasesPending.length !== pu.pending.length) rep.push('purchases.pending');
    } else rep.push('purchases.pending');
  }
  return { ladder, dayStreak, purchasesPending };
}

/**
 * The §7.1 merge rows of the v4 fields: ladder (game/ladder.ts mergeLadder), dayStreak (day-streak.ts
 * mergeDayStreak), purchases.pending = the union minus every token in either copy's `tokens` (newest
 * iap.pendingKept).
 */
export function mergeV4Fields(local: SaveData, cloud: SaveData, newer: SaveData, c: GameConfig = cfg): V4Fields {
  const older = newer === local ? cloud : local;
  const granted = ledgerTokens([...local.purchases.tokens, ...cloud.purchases.tokens], c);
  const inNewer = new Set(newer.purchases.pending);
  return {
    ladder: mergeLadder(local.ladder, cloud.ladder, newer.ladder, c),
    dayStreak: mergeDayStreak(local.dayStreak, cloud.dayStreak, c),
    purchasesPending: capPending([...older.purchases.pending.filter((e) => !inNewer.has(e)), ...newer.purchases.pending], granted, c),
  };
}
