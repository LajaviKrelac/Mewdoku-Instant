// Owner: C (Phase 2b). F0 baseline of save schema v2 (phase2b §9): the v1 → v2 migration (§9.2),
// validation of the fields v2 adds (§9.2, "an invalid field gets its default") and their merge rules
// (§9.3). PURE. save.ts wires these into migrate() / merge().
// Two §9.3 rules live elsewhere because they need other modules: the paid-grant repair
// (purchases.ts repairPaidGrants, run by save.ts merge) and clearing an inProgress.event slot whose
// event has ended (events.ts clearEndedEventSlot, run by app/event-flow.ts with the defs and `now`).
import { cfg, type GameConfig, type LocaleId } from '../app/config';
import { EVENT_ID_RE, isNonNegInt, isRecord, isTime } from './save-fields';
import type { BoardKey, EventRecord, GroupRecord, SaveData } from './types';

/** The fields v2 adds to v1 (phase2b §9.1), besides settings.locale and inProgress.event. */
export type V2Fields = Pick<SaveData, 'wallet' | 'points' | 'events' | 'groups' | 'purchases' | 'rank'>;

/** §9.2 defaults of the new fields. No retro grant of fish or points [DECISION]. */
export function v2Defaults(): V2Fields {
  return {
    wallet: { fish: 0, earned: 0 },
    points: { total: 0 },
    events: {},
    groups: {},
    purchases: { noAds: false, tokens: [] },
    rank: { pending: {}, lastSubmitAt: 0 },
  };
}

/**
 * MIGRATIONS[1] (phase2b §9.2): settings.locale = 'auto', inProgress.event = null, the new fields at
 * their defaults. The level and daily slots are kept (an InProgressV1 is a valid InProgressV2).
 * Groups that are not objects are left as they are, so validation reports and repairs them.
 */
export function migrate_1_to_2(d: Record<string, unknown>): Record<string, unknown> {
  return {
    ...d,
    v: 2,
    settings: isRecord(d.settings) ? { ...d.settings, locale: 'auto' } : d.settings,
    inProgress: isRecord(d.inProgress) ? { ...d.inProgress, event: null } : d.inProgress,
    ...v2Defaults(),
  };
}

// ─────────────────────────────── validation (§9.2) ───────────────────────────────

/** "<productId>|<purchaseToken>" (§8.4, §9.2). */
const LEDGER_RE = /^[a-z0-9_]{1,40}\|.{1,200}$/;
const BOARD_KEY_RE = /^(paw_points|daily_fastest|event_[a-z0-9_]{3,40})$/;
/** Events solved per id never exceed this (§9.2). */
const EVENT_SOLVED_MAX = 1000;

const intIn = (lo: number, hi: number) => (x: unknown): x is number => isNonNegInt(x) && x >= lo && x <= hi;

export function isLocaleSetting(x: unknown, c: GameConfig = cfg): x is 'auto' | LocaleId {
  return x === 'auto' || (typeof x === 'string' && (c.i18n.locales as readonly string[]).indexOf(x) >= 0);
}

function isEventRecord(x: unknown): x is EventRecord {
  return isRecord(x) && intIn(0, EVENT_SOLVED_MAX)(x.solved) && isTime(x.ms) && isTime(x.lastAt);
}

function isGroupRecord(x: unknown): x is GroupRecord {
  return isRecord(x) && isTime(x.endsAt) && isNonNegInt(x.total) && isNonNegInt(x.wins) && (x.claimed === 0 || x.claimed === 1);
}

/** Keeps the newest `keep` groups by endsAt (§5.8: oldest dropped). */
export function capGroups(groups: Record<string, GroupRecord>, keep: number): Record<string, GroupRecord> {
  const ids = Object.keys(groups);
  if (ids.length <= keep) return groups;
  ids.sort((a, b) => (groups[b] as GroupRecord).endsAt - (groups[a] as GroupRecord).endsAt);
  const out: Record<string, GroupRecord> = {};
  for (const id of ids.slice(0, keep)) out[id] = groups[id] as GroupRecord;
  return out;
}

/** Deduplicated (first occurrence kept), valid entries only, the newest (last) `keep`. */
export function capLedger(tokens: readonly string[], keep: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (typeof t !== 'string' || !LEDGER_RE.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(Math.max(0, out.length - keep));
}

/**
 * Reads the v2-only fields of a migrated document. Invalid groups or entries get defaults and their
 * path is pushed to `rep` (save_corrupt analytics, 04 §7.2).
 */
export function readV2Fields(d: Record<string, unknown>, c: GameConfig, rep: string[]): V2Fields {
  const def = v2Defaults();
  const group = (key: string): Record<string, unknown> | null => {
    if (isRecord(d[key])) return d[key] as Record<string, unknown>;
    rep.push(key);
    return null;
  };
  const field = <T>(value: unknown, ok: (v: unknown) => v is T, fallback: T, path: string): T => {
    if (ok(value)) return value;
    rep.push(path);
    return fallback;
  };

  const w = group('wallet');
  const fishOk = intIn(0, c.fish.max);
  const wallet = w
    ? { fish: field(w.fish, fishOk, 0, 'wallet.fish'), earned: field(w.earned, fishOk, 0, 'wallet.earned') }
    : def.wallet;

  const p = group('points');
  const points = p ? { total: field(p.total, intIn(0, c.points.max), 0, 'points.total') } : def.points;

  const events: Record<string, EventRecord> = {};
  if (isRecord(d.events)) {
    for (const [id, v] of Object.entries(d.events)) {
      if (EVENT_ID_RE.test(id) && isEventRecord(v)) events[id] = { solved: v.solved, ms: v.ms, lastAt: v.lastAt };
      else if (!rep.includes('events')) rep.push('events');
    }
  } else rep.push('events');

  const groupsIn: Record<string, GroupRecord> = {};
  if (isRecord(d.groups)) {
    for (const [id, v] of Object.entries(d.groups)) {
      if (id.length > 0 && id.length <= 64 && isGroupRecord(v)) groupsIn[id] = { endsAt: v.endsAt, total: v.total, wins: v.wins, claimed: v.claimed };
      else if (!rep.includes('groups')) rep.push('groups');
    }
  } else rep.push('groups');
  const groups = capGroups(groupsIn, c.groups.keep);
  if (Object.keys(groups).length < Object.keys(groupsIn).length && !rep.includes('groups')) rep.push('groups');

  const pu = group('purchases');
  let purchases = def.purchases;
  if (pu) {
    const noAds = field(pu.noAds, (x): x is boolean => typeof x === 'boolean', false, 'purchases.noAds');
    const raw = Array.isArray(pu.tokens) ? (pu.tokens as unknown[]) : (rep.push('purchases.tokens'), []);
    const tokens = capLedger(raw.filter((t): t is string => typeof t === 'string'), c.iap.tokensKept);
    if (Array.isArray(pu.tokens) && tokens.length !== raw.length) rep.push('purchases.tokens');
    purchases = { noAds, tokens };
  }

  const r = group('rank');
  let rank = def.rank;
  if (r) {
    const pending: Partial<Record<BoardKey, number>> = {};
    if (isRecord(r.pending)) {
      for (const [k, v] of Object.entries(r.pending)) {
        if (BOARD_KEY_RE.test(k) && isNonNegInt(v) && v < 2 ** 31) pending[k as BoardKey] = v;
        else if (!rep.includes('rank.pending')) rep.push('rank.pending');
      }
    } else rep.push('rank.pending');
    rank = { pending, lastSubmitAt: field(r.lastSubmitAt, isTime, 0, 'rank.lastSubmitAt') };
  }

  return { wallet, points, events, groups, purchases, rank };
}

// ─────────────────────────────── merge (§9.3) ───────────────────────────────

/** Per event id: more `solved` wins; on a tie the smaller `ms`; `lastAt` is the max. */
function mergeEvents(a: Record<string, EventRecord>, b: Record<string, EventRecord>): Record<string, EventRecord> {
  const out: Record<string, EventRecord> = { ...a };
  for (const [id, theirs] of Object.entries(b)) {
    const mine = out[id];
    if (!mine) {
      out[id] = theirs;
      continue;
    }
    const best = theirs.solved > mine.solved || (theirs.solved === mine.solved && theirs.ms < mine.ms) ? theirs : mine;
    out[id] = { solved: best.solved, ms: best.ms, lastAt: Math.max(mine.lastAt, theirs.lastAt) };
  }
  return out;
}

/** Union; claimed, total, wins (and endsAt) are each the max. */
function mergeGroups(a: Record<string, GroupRecord>, b: Record<string, GroupRecord>, keep: number): Record<string, GroupRecord> {
  const out: Record<string, GroupRecord> = { ...a };
  for (const [id, theirs] of Object.entries(b)) {
    const mine = out[id];
    out[id] = mine
      ? {
          endsAt: Math.max(mine.endsAt, theirs.endsAt),
          total: Math.max(mine.total, theirs.total),
          wins: Math.max(mine.wins, theirs.wins),
          claimed: mine.claimed === 1 || theirs.claimed === 1 ? 1 : 0,
        }
      : theirs;
  }
  return capGroups(out, keep);
}

/**
 * The §9.3 rows for the v2 fields: wallet from the newer document; points max; events and groups
 * per id; noAds OR; ledger union (the newer document's order last), newest iap.tokensKept;
 * rank.pending from the newer document (lastSubmitAt max). settings and inProgress.event follow the
 * newer document in save.ts, which then runs the paid-grant repair (purchases.ts).
 */
export function mergeV2Fields(local: SaveData, cloud: SaveData, newer: SaveData, c: GameConfig = cfg): V2Fields {
  const older = newer === local ? cloud : local;
  const newerSet = new Set(newer.purchases.tokens);
  return {
    wallet: { ...newer.wallet },
    points: { total: Math.max(local.points.total, cloud.points.total) },
    events: mergeEvents(local.events, cloud.events),
    groups: mergeGroups(local.groups, cloud.groups, c.groups.keep),
    purchases: {
      noAds: local.purchases.noAds || cloud.purchases.noAds,
      tokens: capLedger([...older.purchases.tokens.filter((t) => !newerSet.has(t)), ...newer.purchases.tokens], c.iap.tokensKept),
    },
    rank: { pending: { ...newer.rank.pending }, lastSubmitAt: Math.max(local.rank.lastSubmitAt, cloud.rank.lastSubmitAt) },
  };
}

/** `E<eventId>/<i>` → its parts, or null. */
export function parseEventSlotId(id: string): { eventId: string; index: number } | null {
  const m = /^E([a-z0-9-]{3,40})\/(\d{1,4})$/.exec(id);
  return m ? { eventId: m[1] as string, index: Number(m[2]) } : null;
}
