// Owner: G1 (Phase 2c)
// Save schema v3 (docs/phase2c/fish-lives-spec.md §3.8): the v2 → v3 migration (drop the fish
// wallet and the retired paw_points pending score, add the perfect streak and the period points),
// validation of the two v3 records ("an invalid field gets its default"), and their merge rows.
// PURE. save.ts wires these into defaults() / migrate() / merge(); the one-time compensation of the
// retired fish packs lives in purchases.ts (compensateRetired), run by save.ts after validation.
// Phase 2c.1 (§3.2.4, D19): the perfect streak is retired but kept in v3: nothing writes it any more;
// its validation and merge rows below still run so every v3 document parses.
import type { GameConfig } from '../app/config';
import { isPeriodKey, STREAK_MAX } from './scoring';
import { isNonNegInt, isRecord } from './save-fields';
import type { PeriodRecord, SaveData, StreakRecord } from './types';

/** The fields v3 adds (phase2c §3.8). */
export type V3Fields = Pick<SaveData, 'streak' | 'period'>;

/** §3.8 defaults: streak {0, 0}, period {'', 0, '', 0}. No retro grant [DECISION]. */
export function v3Defaults(): V3Fields {
  return { streak: { current: 0, best: 0 }, period: { key: '', total: 0, bestKey: '', bestTotal: 0 } };
}

/**
 * MIGRATIONS[2] (phase2c §3.8): drop `wallet` (earned fish are not converted [DECISION]: the game never
 * shipped publicly), add the v3 records at their defaults, drop a pending `paw_points` score (the board
 * is retired). Everything else is kept (purchases, noAds, ledger, events, groups, points, stock).
 * Groups that are not objects are left as they are, so validation reports and repairs them.
 */
export function migrate_2_to_3(d: Record<string, unknown>): Record<string, unknown> {
  const { wallet: _wallet, ...rest } = d;
  const out: Record<string, unknown> = { ...rest, v: 3, ...v3Defaults() };
  const rank = d.rank;
  if (isRecord(rank) && isRecord(rank.pending) && Object.prototype.hasOwnProperty.call(rank.pending, 'paw_points')) {
    const { paw_points: _paw, ...pending } = rank.pending;
    out.rank = { ...rank, pending };
  }
  return out;
}

// ─────────────────────────────── validation (§3.8) ───────────────────────────────

const intIn = (lo: number, hi: number) => (x: unknown): x is number => isNonNegInt(x) && x >= lo && x <= hi;

/** A stored key: '' (none yet) or a real period start of the configured period.kind. */
function keyOk(x: unknown, c: GameConfig): x is string {
  return x === '' || (typeof x === 'string' && isPeriodKey(x, c));
}

function readStreak(x: unknown, rep: string[]): StreakRecord {
  const def = v3Defaults().streak;
  if (!isRecord(x)) {
    rep.push('streak');
    return def;
  }
  const ok = intIn(0, STREAK_MAX);
  let current = 0;
  let best = 0;
  if (ok(x.current)) current = x.current;
  else rep.push('streak.current');
  if (ok(x.best)) best = x.best;
  else rep.push('streak.best');
  if (best < current) {
    best = current; // §3.8 repair: best = max
    if (!rep.includes('streak.best')) rep.push('streak.best');
  }
  return { current, best };
}

/**
 * The period record (§3.8): keys '' or a period start of period.kind, else the whole record resets
 * (a changed period kind starts fresh); totals 0…period.max; a total without a key is 0; best is the
 * highest period total ever reached, so it is never below the current total (repaired to it).
 */
function readPeriod(x: unknown, c: GameConfig, rep: string[]): PeriodRecord {
  const def = v3Defaults().period;
  if (!isRecord(x) || !keyOk(x.key, c) || !keyOk(x.bestKey, c)) {
    rep.push('period');
    return def;
  }
  const ok = intIn(0, c.period.max);
  const key = x.key;
  const bestKey = x.bestKey;
  let total = 0;
  let bestTotal = 0;
  if (ok(x.total)) total = x.total;
  else rep.push('period.total');
  if (ok(x.bestTotal)) bestTotal = x.bestTotal;
  else rep.push('period.bestTotal');
  if (key === '' && total > 0) {
    total = 0;
    if (!rep.includes('period.total')) rep.push('period.total');
  }
  if (bestKey === '' && bestTotal > 0) {
    bestTotal = 0;
    if (!rep.includes('period.bestTotal')) rep.push('period.bestTotal');
  }
  if (total > bestTotal) {
    if (!rep.includes('period.bestTotal')) rep.push('period.bestTotal');
    return { key, total, bestKey: key, bestTotal: total };
  }
  return { key, total, bestKey, bestTotal };
}

/** Reads the v3 records of a migrated document; repaired paths are pushed to `rep` (save_corrupt). */
export function readV3Fields(d: Record<string, unknown>, c: GameConfig, rep: string[]): V3Fields {
  return { streak: readStreak(d.streak, rep), period: readPeriod(d.period, c, rep) };
}

// ─────────────────────────────── merge (§3.8) ───────────────────────────────

/**
 * The §3.8 merge rows: streak.current from the newer document, best = max of both; period: equal keys
 * → total = max, different keys → the later key's key and total; best = the higher bestTotal (tie: the
 * later bestKey), never below the merged total.
 */
export function mergeV3Fields(local: SaveData, cloud: SaveData, newer: SaveData): V3Fields {
  const streak: StreakRecord = {
    current: newer.streak.current,
    best: Math.max(local.streak.best, cloud.streak.best, newer.streak.current),
  };
  const a = local.period;
  const b = cloud.period;
  let key: string;
  let total: number;
  if (a.key === b.key) {
    key = a.key;
    total = Math.max(a.total, b.total);
  } else {
    const later = a.key > b.key ? a : b;
    key = later.key;
    total = later.total;
  }
  const bestOf = a.bestTotal > b.bestTotal || (a.bestTotal === b.bestTotal && a.bestKey >= b.bestKey) ? a : b;
  let bestKey = bestOf.bestKey;
  let bestTotal = bestOf.bestTotal;
  if (total > bestTotal || (total === bestTotal && total > 0 && key > bestKey)) {
    bestKey = key;
    bestTotal = total;
  }
  return { streak, period: { key, total, bestKey, bestTotal } };
}
