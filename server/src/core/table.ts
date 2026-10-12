// Owner: G4 (Phase 2e). The ONE place real rows and computer rivals are combined (2026-10-12, D-2e-24): the
// live table of an open bracket, the frozen final table, the finalisation plan (ranks, rewards, totals) that
// finalizeIfDue and admin refinalize share, the target of a heart on a rival row, and the heart counts shown
// on rival rows. PURE (a test greps this file like core/rivals.ts): time comes from the caller.
// Honesty: a real row is shown exactly as stored; a rival row only in the places no real player took
// (rows ≤ max_members), and a place held by a rival is never paid and never passed down (H-4, design §5.3).
import { NICK_WORDS_V1, RETIRED_V1 } from '../contract/words';
import type { BracketRow, MemberRow } from '../store/rows';
import type { RankWrite, RewardWrite } from '../store/sql-store';
import { paidPlaces, rankRows } from './brackets';
import type { ServerConfig } from './config';
import { rewardId } from './ids';
import { decodeFinalRivals, encodeFinalRivals, isRivalSlot, liveRivalCount, parseRivalsTag, RIVAL_SLOT_BASE, rivalAt, rivalNames, rivalRoster, type FinalRival, type RivalScript, type Roster } from './rivals';

/** One row of a bracket table: a real member or a computer player (playerKey null). */
export interface TableRow {
  readonly kind: 'player' | 'rival';
  readonly slot: number;
  readonly points: number;
  readonly scoredAt: number;
  readonly nickname: string;
  readonly avatar: number;
  /** Real rows: members.hearts. Rival rows: built-in hearts (withRealHearts adds the real ones). */
  readonly hearts: number;
  readonly playerKey: string | null;
}
export type RankedRow = TableRow & { readonly rank: number };

const clampTo = (b: Pick<BracketRow, 'opened_at' | 'ends_at'>, at: number): number => Math.min(Math.max(at, b.opened_at), b.ends_at);

/** The visible real members (hidden === 0) as table rows. */
function realRows(members: readonly MemberRow[]): TableRow[] {
  return members
    .filter((m) => m.hidden === 0)
    .map((m) => ({ kind: 'player', slot: m.slot, points: m.points, scoredAt: m.scored_at, nickname: m.nickname, avatar: m.avatar, hearts: m.hearts, playerKey: m.player_key }));
}

/**
 * K for a bracket row and its member list. The two are separate reads (bracketView, the admin route: no
 * transaction between them), so a join that commits in between leaves a stale next_slot beside the new member;
 * K counted from that next_slot would show next_slot + 1 real rows plus max_members − next_slot rivals
 * (max_members + 1 rows, which the parser rejects) and bring back for one view the rival that join retired.
 * 2026-10-12, D-2e-24 (review fix): K counts from max(next_slot, 1 + the highest member slot). A member's slot
 * is the next_slot it joined at and next_slot never drops (deletes keep it), so with consistent reads this is
 * next_slot and nothing changes; with a stale bracket row it is the next_slot after that join.
 */
export function liveRivalCountOf(roster: Roster, b: Pick<BracketRow, 'next_slot' | 'max_members'>, members: readonly Pick<MemberRow, 'slot'>[]): number {
  return liveRivalCount(roster, { next_slot: nextSlotOf(b, members), max_members: b.max_members });
}

/** max(next_slot, 1 + the highest member slot): next_slot after every join the member read holds (see liveRivalCountOf). */
function nextSlotOf(b: Pick<BracketRow, 'next_slot'>, members: readonly Pick<MemberRow, 'slot'>[]): number {
  let next = b.next_slot;
  for (const m of members) if (m.slot + 1 > next) next = m.slot + 1;
  return next;
}

/**
 * A rival retired by real joins, and when (r2: the time of the join that retired it; null: r1, whose rule has no
 * time, or an r2 join whose time liveRivals had to guess, which admin must not show as a join time).
 */
export interface RetiredRival {
  readonly script: RivalScript;
  readonly at: number | null;
}

/** 2026-10-12, r2: `brackets.deleted_joins` ("slot:joined_at,…", sql-store deletePlayer) as slot → joined_at; a malformed entry is skipped. */
function deletedJoins(s: string | null | undefined): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of typeof s === 'string' && s !== '' ? s.split(',') : []) {
    const m = /^(\d{1,9}):(\d{1,16})$/.exec(e);
    if (m) out.set(Number(m[1]), Number(m[2]));
  }
  return out;
}

/** 2026-10-12, r2: every real join's time the reads hold, slot → joined_at: the member rows, plus the deleted ones (deleted_joins). */
function joinTimes(b: Pick<BracketRow, 'deleted_joins'>, members: readonly Pick<MemberRow, 'slot' | 'joined_at'>[]): Map<number, number> {
  const out = deletedJoins(b.deleted_joins);
  for (const m of members) out.set(m.slot, m.joined_at);
  return out;
}

/**
 * 2026-10-12, r2: whether the bracket row and the member rows hold the time of every real join an r2 replay may
 * need: each slot below next_slot is a member row or in deleted_joins (true for r1 and untagged brackets, which
 * need none). With consistent reads this always holds (every slot below next_slot was filled once, and a deletion
 * records its join in the same batch). It fails only when the bracket row was read before a deletion committed and
 * the members after it: then liveRivals has to guess that join's time. The callers whose answer lasts re-read the
 * bracket row (finalizeIfDue) or refuse (rivalHeartTarget); a view shows that guess once, until its next read.
 */
export function joinTimesKnown(b: Pick<BracketRow, 'rivals' | 'next_slot' | 'deleted_joins'>, members: readonly Pick<MemberRow, 'slot' | 'joined_at'>[]): boolean {
  if (parseRivalsTag(b.rivals)?.preset !== 'r2') return true;
  const known = joinTimes(b, members);
  for (let s = 0; s < b.next_slot; s++) if (!known.has(s)) return false;
  return true;
}

/**
 * Which rivals may show: `live` (K of them, liveRivalCountOf) and the `retired` rest, both in index order.
 * r1: rival i < K (a join retires the highest live index, in the join window the lowest computer row).
 * 2026-10-12, r2: a replay of the real joins that forced a removal, in slot order. The join of slot s forces one
 * when s ≥ max_members − N (the T − 1 rivals leave max_members − N places to real players), up to the N − K
 * removals K needs. Its time t_s is the joined_at of the member row with that slot, or of that slot in
 * `deleted_joins` (a deleted player: deletePlayer keeps the time). At t_s it retires the live rival that has not
 * arrived yet (arrivalAt > t_s) with the latest arrival (ties: the highest index), else the present rival ranked
 * last at t_s (points desc, scoredAt asc, slot asc). A pure function of the roster and the join times (hidden rows
 * count: they keep their slot and joined_at); live = K, so rows ≤ max_members as for r1. A later join only adds an
 * event at the end and a deletion keeps its join's time, so the live set only shrinks and a retired rival never
 * returns. Only when the reads straddle a deletion (joinTimesKnown false) is a time missing: the replay then uses the
 * nearest lower known slot's time, else opened_at, and that retirement's `at` is null. Every path (the tables,
 * finalPlan, rivalHeartTarget, admin) uses this.
 */
export function liveRivals(
  roster: Roster,
  b: Pick<BracketRow, 'next_slot' | 'max_members' | 'opened_at' | 'join_until' | 'ends_at' | 'deleted_joins'>,
  members: readonly Pick<MemberRow, 'slot' | 'joined_at'>[],
): { readonly live: readonly RivalScript[]; readonly retired: readonly RetiredRival[] } {
  const k = liveRivalCountOf(roster, b, members);
  if (roster.preset === 'r1') return { live: roster.rivals.slice(0, k), retired: roster.rivals.slice(k).map((script) => ({ script, at: null })) };
  const n = roster.rivals.length;
  const need = n - k;
  const retiredAt = new Map<number, number | null>();
  if (need > 0) {
    const joined = joinTimes(b, members);
    const slots = [...joined.keys()].sort((x, y) => x - y);
    const first = b.max_members - n;
    for (let s = first; s < first + need; s++) {
      let at = joined.get(s);
      const exact = at !== undefined;
      if (at === undefined) {
        at = b.opened_at;
        for (let j = slots.length - 1; j >= 0; j--)
          if ((slots[j] as number) < s) {
            at = joined.get(slots[j] as number) as number;
            break;
          }
      }
      const t = clampTo(b, at);
      let victim = -1;
      for (const r of roster.rivals)
        if (!retiredAt.has(r.index) && r.arrivalAt > t && (victim < 0 || r.arrivalAt >= (roster.rivals[victim] as RivalScript).arrivalAt)) victim = r.index;
      if (victim < 0) {
        let last: { points: number; scoredAt: number } | null = null;
        for (const r of roster.rivals) {
          if (retiredAt.has(r.index)) continue;
          const v = rivalAt(r, b.join_until, t) as { points: number; scoredAt: number };
          if (last === null || v.points < last.points || (v.points === last.points && v.scoredAt >= last.scoredAt)) {
            last = v;
            victim = r.index;
          }
        }
      }
      if (victim < 0) break;
      retiredAt.set(victim, exact ? t : null);
    }
    for (let i = n - 1; i >= 0 && retiredAt.size < need; i--) if (!retiredAt.has(i)) retiredAt.set(i, null);
  }
  return {
    live: roster.rivals.filter((r) => !retiredAt.has(r.index)),
    retired: roster.rivals.filter((r) => retiredAt.has(r.index)).map((script) => ({ script, at: retiredAt.get(script.index) ?? null })),
  };
}

/**
 * The rivals shown at `at` (clamped to [opened_at, ends_at]): none under `hide` or without a valid tag;
 * otherwise rival i < K (liveRivalCountOf) that has arrived. Names avoid every member's nickname, hidden rows included.
 * 2026-10-12, r2: the live rivals of liveRivals (r1: still i < K) that have arrived.
 */
function liveRivalRows(b: BracketRow, members: readonly MemberRow[], at: number, hide: boolean): TableRow[] {
  if (hide) return [];
  const roster = rivalRoster(b.rivals, b);
  if (!roster) return [];
  const t = clampTo(b, at);
  const present: { slot: number; points: number; scoredAt: number; hearts: number }[] = [];
  for (const r of liveRivals(roster, b, members).live) {
    const v = rivalAt(r, b.join_until, t);
    if (v) present.push({ slot: r.slot, ...v });
  }
  if (present.length === 0) return [];
  const names = rivalNames(roster, new Set(members.map((m) => m.nickname.toLowerCase())), NICK_WORDS_V1, RETIRED_V1);
  return present.map((p) => {
    const n = names.get(p.slot) as { nickname: string; avatar: number };
    return { kind: 'rival', slot: p.slot, points: p.points, scoredAt: p.scoredAt, nickname: n.nickname, avatar: n.avatar, hearts: p.hearts, playerKey: null };
  });
}

/**
 * The table of a running bracket at `at`: the visible real members plus the live rivals, ranked by the one
 * comparator (rankRows). Exact ties (same points, same ms: only the opening group at opened_at) go to the
 * real player, whose slot is below 9000. Without a tag (or under `hide`) this is exactly the real table.
 */
export function liveTable(b: BracketRow, members: readonly MemberRow[], at: number, hide: boolean): RankedRow[] {
  return rankRows([...realRows(members), ...liveRivalRows(b, members, at, hide)]);
}

/**
 * The table at ends_at: what finalisation freezes. It does not depend on when finalisation runs (K is fixed
 * after join_until, rivals are clamped to ends_at). 2026-10-12, r2: nor does r2's live set (no join after
 * join_until adds a replay event, and a deletion keeps its join's time in deleted_joins).
 */
export function freezeTable(b: BracketRow, members: readonly MemberRow[], hide: boolean): RankedRow[] {
  return liveTable(b, members, b.ends_at, hide);
}

/** A snapshot rival as a table row (its stored points, scoredAt, built-in hearts and name). */
const snapshotRow = (r: FinalRival): TableRow => ({ kind: 'rival', slot: r.slot, points: r.points, scoredAt: r.scoredAt, nickname: r.nickname, avatar: r.avatar, hearts: r.hearts, playerKey: null });

/**
 * A finalised bracket's rows in rank order: the visible real members with their final_rank plus the frozen
 * snapshot's rivals (none under `hide`, or when the snapshot is missing or does not decode; the caller counts
 * `rivals/decode_error`). A later deletion leaves an honest gap.
 */
export function finalTable(b: BracketRow, members: readonly MemberRow[], hide: boolean): RankedRow[] {
  const reals: RankedRow[] = members
    .filter((m) => m.hidden === 0 && m.final_rank !== null)
    .map((m) => ({ kind: 'player', slot: m.slot, points: m.points, scoredAt: m.scored_at, nickname: m.nickname, avatar: m.avatar, hearts: m.hearts, playerKey: m.player_key, rank: m.final_rank as number }));
  const snap = hide ? null : decodeFinalRivals(b.final_rivals, b);
  return [...reals, ...(snap ?? []).map((r) => ({ ...snapshotRow(r), rank: r.rank }))].sort((x, y) => x.rank - y.rank);
}

export interface FinalPlan {
  /** Real rows only: {slot, rank in the merged table}. */
  readonly ranks: RankWrite[];
  /** Real paid places only (empty when not `claimable`). */
  readonly rewards: RewardWrite[];
  readonly totals: { readonly finalMembers: number; readonly finalReal: number; readonly finalRivals: string | null };
  /** Paid places held by a rival (unpaid, not passed down). */
  readonly rivalPlaces: number;
}

/**
 * The finalisation of a bracket (finalizeIfDue and admin refinalize). A finalised bracket is re-ranked with
 * its snapshot's rivals (whatever `hide` says, so a re-rank never destroys a snapshot); a not yet finalised one
 * is the table at ends_at. `paidPlaces` sees every row (rivals count toward minMembers and the one-below rule);
 * a place held by a rival is dropped, never passed down. Rewards only when `claimable`.
 * 2026-10-12, D-2e-24 (stage 2): a finalised bracket WITHOUT a usable snapshot (finalised real-only under
 * `hide`, by pre-0003 code after a rollback, or a snapshot that does not decode) is re-ranked real-only too:
 * a frozen bracket is never recomputed from the tag and live config (design §0 "rejected"), so turning `hide`
 * off later never adds rivals to a result players already saw real-only.
 */
export function finalPlan(b: BracketRow, members: readonly MemberRow[], cfg: ServerConfig, now: number, claimable: boolean): FinalPlan {
  const table =
    b.finalized_at !== null
      ? rankRows([...realRows(members), ...(decodeFinalRivals(b.final_rivals, b) ?? []).map(snapshotRow)])
      : freezeTable(b, members, cfg.rivals.hide);
  const placed = paidPlaces(table, cfg);
  const paid = placed.filter((p) => !isRivalSlot(p.slot));
  const rewards: RewardWrite[] = !claimable
    ? []
    : paid.map((p) => {
        const row = table.find((r) => r.slot === p.slot);
        // Design §5.3, lock 2: a reward always names a real slot and a real player.
        if (!row || row.kind !== 'player' || row.playerKey === null || p.slot >= RIVAL_SLOT_BASE) throw new Error(`finalPlan: place ${p.place} is not a real player's`);
        return { id: rewardId(b.id, p.slot), playerKey: row.playerKey, place: p.place, hints: p.hints, kitties: p.kitties, expiresAt: now + cfg.rewards.claimTtlMs };
      });
  const ranks = table.filter((r) => r.kind === 'player').map((r) => ({ slot: r.slot, rank: r.rank }));
  const rivals = table.filter((r) => r.kind === 'rival');
  return {
    ranks,
    rewards,
    totals: { finalMembers: table.length, finalReal: ranks.length, finalRivals: rivals.length > 0 ? encodeFinalRivals(rivals, b) : null },
    rivalPlaces: placed.length - paid.length,
  };
}

/**
 * What a heart on rival `slot` targets at `now`, or null (no such row): under `hide`; without a valid tag or
 * snapshot; a final bracket whose snapshot lacks the slot; an open bracket whose rival i is retired (i ≥ K)
 * or has not arrived. `builtIn` is the rival's own heart count then; `maxNextSlot` the largest next_slot
 * that keeps the rival live (the store's guard against a join retiring it meanwhile).
 * 2026-10-12, r2: an open r2 bracket needs its `members` (slot, joined_at: the replay of liveRivals; a retired
 * rival cannot be hearted). Any join that forces a removal could retire this rival, so `maxNextSlot` lets only
 * the joins that force none through: max(next_slot after the member read, max_members − N). A deletion needs no
 * guard (it keeps its join's time, so it retires no rival), but reads that straddle one (joinTimesKnown false)
 * would judge from a guessed replay: then null too (the player's retry reads again).
 */
export function rivalHeartTarget(
  b: BracketRow,
  slot: number,
  now: number,
  hide: boolean,
  members: readonly Pick<MemberRow, 'slot' | 'joined_at'>[] = [],
): { builtIn: number; maxNextSlot: number } | null {
  if (hide || !isRivalSlot(slot)) return null;
  if (b.finalized_at !== null) {
    const x = decodeFinalRivals(b.final_rivals, b)?.find((r) => r.slot === slot);
    return x ? { builtIn: x.hearts, maxNextSlot: b.next_slot } : null;
  }
  const roster = rivalRoster(b.rivals, b);
  if (!roster) return null;
  if (roster.preset === 'r2') {
    if (!joinTimesKnown(b, members)) return null;
    const script = liveRivals(roster, b, members).live.find((r) => r.slot === slot);
    const v = script ? rivalAt(script, b.join_until, clampTo(b, now)) : null;
    return v ? { builtIn: v.hearts, maxNextSlot: Math.max(nextSlotOf(b, members), b.max_members - roster.rivals.length) } : null;
  }
  const i = slot - RIVAL_SLOT_BASE;
  if (i >= liveRivalCount(roster, b)) return null;
  const v = rivalAt(roster.rivals[i] as (typeof roster.rivals)[number], b.join_until, clampTo(b, now));
  return v ? { builtIn: v.hearts, maxNextSlot: b.max_members - 1 - i } : null;
}

/** Adds the real hearts given to each rival row (`realTo`: count per to_slot) to its built-in count; real rows unchanged. */
export function withRealHearts<T extends TableRow>(rows: readonly T[], realTo: ReadonlyMap<number, number>): T[] {
  return rows.map((r) => (r.kind === 'rival' ? { ...r, hearts: r.hearts + (realTo.get(r.slot) ?? 0) } : r));
}

/**
 * The preview's sample players (preview/sample-server.ts) and tests: the smallest `points ≥ 1` with a `scoredAt`
 * (`at`, or the (rank − 1)th row's scoredAt + 1; never after `at`) such that exactly `rank − 1` of `rows` (the
 * table WITHOUT the row being placed) sort ahead of (points, scoredAt, `slot`) by rankRows' comparator. Null when
 * no such value exists (ties in the opening group: two rows with the same points and the same ms around the place).
 * 2026-10-12, D-2e-24 (design §11): the preview places its one real player among the production computer players.
 */
export function pointsForRank(rows: readonly Pick<TableRow, 'points' | 'scoredAt' | 'slot'>[], rank: number, at: number, slot = 0): { points: number; scoredAt: number } | null {
  if (!Number.isInteger(rank) || rank < 1 || rank > rows.length + 1) return null;
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.scoredAt - b.scoredAt || a.slot - b.slot);
  const prev = sorted[rank - 2];
  const times = [at, ...(prev && prev.scoredAt + 1 <= at ? [prev.scoredAt + 1] : [])];
  const ahead = (p: number, s: number): number =>
    sorted.filter((r) => r.points > p || (r.points === p && (r.scoredAt < s || (r.scoredAt === s && r.slot < slot)))).length;
  const top = (sorted[0]?.points ?? 0) + 1;
  for (let p = 1; p <= top; p++) for (const s of times) if (ahead(p, s) === rank - 1) return { points: p, scoredAt: s };
  return null;
}
