// Owner: G4 (Phase 2e). The views the handlers answer with (CONTRACTS §2): the player, the rules, my
// bracket (open, or ended less than 24 h ago), my results, and lazy finalisation (spec §1.5).
// Honesty (H-1, H-2, H-3, H-9; 2026-10-12, D-2e-24): every real row is a visible member exactly as stored, in
// the server's order with the server's ranks. A bracket created with computer players (brackets.rivals) also
// shows them, computed by core/table.ts in the places no real player took (never more rows than max_members);
// they are never members, players or rewards rows, and the rules carry the disclosure (`computerPlayers`).
// `members` counts every row shown (for a finalised bracket, final_members: every row that was ranked, so a
// later deletion leaves an honest gap instead of a re-numbered list).
// Leaderboard update: a real row also carries its member's activity (seenAt, playing; presence.enabled). 2026-10-13
// (merge): a computer player's row carries its scripted activity (core/table.ts rivalActivity: "playing" while one
// of its sessions runs, seenAt its last win or a later ping tick, never after the table's time), computed like its
// points; a final table's rivals are frozen at ends_at, as a real row's activity stops at the end.
import type { BracketRow as WireRow, BracketSummary, BracketView, PlayerView, ResultView, RewardView, RulesView } from '../contract';
import { grantOf, heartsNew } from '../core/brackets';
import type { ServerConfig } from '../core/config';
import { rewardId, wirePool } from '../core/ids';
import { nextNickChange } from '../core/nickname';
import { decodeFinalRivals, isRivalSlot, parseRivalsTag } from '../core/rivals';
import { finalPlan, finalTable, joinTimesKnown, liveTable, withRealHearts, type TableRow } from '../core/table';
import type { Services } from '../services';
import type { BracketRow, MemberRow, PlayerRow, RewardRow } from '../store/sql-store';

/**
 * The rules the client shows. `computerPlayers` (D-2e-24, H-9): the disclosure line "Rankings include computer
 * players.", sent only as `true` (session.ts passes rivalsNoteFor for the player's pool); with it off the rules
 * are byte-identical to before.
 */
export function rulesView(cfg: ServerConfig, computerPlayers: boolean = cfg.rivals.enabled && cfg.rivals.disclose && !cfg.rivals.hide): RulesView {
  return {
    periodMode: cfg.bracket.periodMode,
    durationMs: cfg.bracket.durationMs,
    maxMembers: cfg.bracket.maxMembers,
    scoringModes: [...cfg.scoring.modes],
    places: cfg.rewards.places.map((p) => ({ place: p.place, hints: p.hints, kitties: p.kitties })),
    minMembers: cfg.rewards.minMembers,
    doubleByVideo: cfg.rewards.doubleByVideo,
    claimTtlMs: cfg.rewards.claimTtlMs,
    hearts: { enabled: cfg.hearts.enabled, allowSelf: cfg.hearts.allowSelf, maxGivenPerBracket: cfg.hearts.maxGivenPerBracket },
    nickname: { freeText: cfg.nickname.freeText, changeCooldownMs: cfg.nickname.changeCooldownMs },
    ...(computerPlayers ? { computerPlayers: true } : {}),
  };
}

/**
 * Counts a stored computer-rivals value that is ignored (D-2e-24; both metrics must stay 0): a tag that does
 * not parse (the bracket then has no rivals) or a final snapshot that does not decode (real rows only).
 */
function countRivalsProblem(s: Pick<Services, 'metrics'>, b: BracketRow, final: boolean): void {
  if (final) {
    if (b.final_rivals !== null && decodeFinalRivals(b.final_rivals, b) === null) s.metrics.count('rivals', 'decode_error');
  } else if (b.rivals !== null && parseRivalsTag(b.rivals) === null) {
    s.metrics.count('rivals', 'tag_invalid');
  }
}

export function playerView(p: PlayerRow, cfg: ServerConfig, now: number): PlayerView {
  const nick = p.nick_adj !== null && p.nick_noun !== null && p.nick_num !== null ? { adj: p.nick_adj, noun: p.nick_noun, num: p.nick_num } : null;
  return {
    code: p.code,
    nickname: p.nickname,
    nick,
    avatarId: p.avatar,
    status: p.status,
    pool: wirePool(p.pool),
    trust: p.trust,
    listed: p.listed === 1,
    nicknameChangeAt: nextNickChange(p.nick_changed_at, cfg.nickname.changeCooldownMs, now),
    // UI batch (profile): rows from before migration 0004 read 0 (the column default), the plain look.
    frameId: p.frame ?? 0,
    backgroundId: p.bg ?? 0,
  };
}

/**
 * Finalises a bracket whose end (plus the grace that lets an in-flight win commit) has passed and that is
 * not final yet (idempotent; spec §1.5 "Finalise"). True when it is final afterwards.
 * 2026-10-12, D-2e-24: the plan (ranks, rewards, totals) comes from core/table.ts finalPlan, shared with admin
 * refinalize: the table at ends_at (so lazy, cron and concurrent finalisers freeze the same standings), every
 * row counted toward minMembers, a place held by a computer player never paid and never passed down.
 * 2026-10-12, r2: a deletion that commits between the bracket read and the members read leaves the bracket row
 * without that join's time (core/table.ts joinTimesKnown); the bracket row is then read once more (no join can
 * commit after ends_at, so that read agrees with the members), so the frozen rivals never come from a guess.
 */
export async function finalizeIfDue(s: Services, bracketId: string, now: number): Promise<boolean> {
  let b = await s.store.getBracket(bracketId);
  if (!b) return false;
  if (b.finalized_at !== null) return true;
  if (b.ends_at + s.cfg.bracket.finalizeGraceMs > now) return false;
  const members = await s.store.members(bracketId);
  if (!joinTimesKnown(b, members)) {
    b = await s.store.getBracket(bracketId);
    if (!b) return false;
    if (b.finalized_at !== null) return true;
  }
  const plan = finalPlan(b, members, s.cfg, now, true);
  const done = await s.store.finalize(bracketId, plan.ranks, plan.rewards, now, plan.totals);
  if (done) {
    countRivalsProblem(s, b, false);
    s.metrics.count('bracket_final', 'members', plan.totals.finalReal);
    const rivals = plan.totals.finalMembers - plan.totals.finalReal;
    if (rivals > 0) s.metrics.count('bracket_final', 'rivals', rivals);
    if (plan.rewards.length > 0) s.metrics.count('reward', 'created', plan.rewards.length);
    if (plan.rivalPlaces > 0) s.metrics.count('reward', 'rival_place', plan.rivalPlaces);
  }
  return true;
}

export function rewardView(r: RewardRow | null, cfg: ServerConfig, now: number): RewardView | null {
  if (!r || r.voided === 1) return null;
  const claimed = r.claimed_at !== null;
  if (!claimed && r.expires_at <= now) return null; // expired and unclaimed: not shown (spec §1.6)
  const place = r.place === 1 || r.place === 2 || r.place === 3 ? r.place : null;
  if (place === null) return null;
  return {
    rewardId: r.id,
    place,
    grant: { hints: r.hints, kitties: r.kitties },
    canDouble: cfg.rewards.doubleByVideo && !claimed,
    expiresAt: r.expires_at,
    claim: claimed ? { rewardId: r.id, grant: grantOf(r.hints, r.kitties, r.doubled === 1), doubled: r.doubled === 1, claimedAt: r.claimed_at as number } : null,
  };
}

/** SessionResponse.results: finished brackets I was ranked in, ended within claimTtlMs, newest first, ≤ 10. */
export async function resultsFor(s: Services, key: string, now: number): Promise<ResultView[]> {
  const rows = await s.store.results(key, now - s.cfg.rewards.claimTtlMs, 10);
  return rows.map((r) => {
    const reward: RewardRow | null =
      r.reward_id === null
        ? null
        : {
            id: r.reward_id,
            player_key: key,
            bracket_id: r.bracket_id,
            place: r.place ?? 0,
            hints: r.hints ?? 0,
            kitties: r.kitties ?? 0,
            created_at: 0,
            expires_at: r.expires_at ?? 0,
            claimed_at: r.claimed_at,
            doubled: r.doubled,
            voided: r.voided ?? 0,
          };
    return { bracketId: r.bracket_id, endedAt: r.ends_at, place: r.final_rank, members: r.final_members, points: r.points, reward: rewardView(reward, s.cfg, now) };
  });
}

export function noneView(pool: string, cfg: ServerConfig, now: number): BracketView {
  return {
    state: 'none',
    bracketId: null,
    pool: wirePool(pool),
    mode: cfg.bracket.periodMode,
    openedAt: null,
    endsAt: null,
    members: 0,
    maxMembers: cfg.bracket.maxMembers,
    rows: [],
    me: null,
    final: false,
    heartsNew: 0,
    result: null,
    serverTime: now,
  };
}

/**
 * Leaderboard update: a row's last activity — the latest of its presence ping, its last counted win and its join
 * (rows from before migration 0003 have active_at 0) — or null while presence is off.
 */
export function seenAtOf(m: Pick<MemberRow, 'active_at' | 'scored_at' | 'joined_at'>, presence: boolean): number | null {
  if (!presence) return null;
  const a = m.active_at ?? 0;
  return Math.max(a, m.scored_at, m.joined_at);
}

/**
 * A row's activity on the wire (Leaderboard update; none while presence is off): a real row's from its member row
 * (seenAtOf, members.playing); 2026-10-13, a computer player's from its script (TableRow.activity, core/table.ts).
 */
function activityOf(row: TableRow, member: MemberRow | undefined, presence: boolean): { seenAt: number | null; playing: boolean } {
  if (!presence) return { seenAt: null, playing: false };
  if (row.kind === 'rival') return row.activity ? { seenAt: row.activity.seenAt, playing: row.activity.playing } : { seenAt: null, playing: false };
  return member ? { seenAt: seenAtOf(member, true), playing: member.playing === 1 } : { seenAt: null, playing: false };
}

/** A table row (a real member or a computer player, core/table.ts) on the wire, with its activity (activityOf). */
const toWire = (row: TableRow, rank: number, myKey: string, liked: ReadonlySet<number>, member: MemberRow | undefined, presence: boolean): WireRow => ({
  rank,
  slot: row.slot,
  nickname: row.nickname,
  avatarId: row.avatar,
  points: row.points,
  hearts: row.hearts,
  me: row.playerKey === myKey,
  likedByMe: liked.has(row.slot),
  ...activityOf(row, member, presence),
  // UI batch (profile): a real row's frame and background (members.frame / bg); a computer player has the plain look.
  frameId: member?.frame ?? 0,
  backgroundId: member?.bg ?? 0,
});

/**
 * My bracket as the client shows it: the current one while it runs, the one that ended less than
 * `bracket.endedViewMs` ago (finalised lazily here), else `none`. Reading it marks my received hearts seen.
 */
export async function bracketView(s: Services, player: Pick<PlayerRow, 'key' | 'pool' | 'cur_bracket'>, now: number): Promise<BracketView> {
  const id = player.cur_bracket;
  if (id === null) return noneView(player.pool, s.cfg, now);
  let b = await s.store.getBracket(id);
  if (!b || b.ends_at + s.cfg.bracket.endedViewMs <= now) return noneView(player.pool, s.cfg, now);
  if (b.finalized_at === null && b.ends_at <= now && (await finalizeIfDue(s, id, now))) b = (await s.store.getBracket(id)) ?? b;
  const members = await s.store.members(id);
  const mine = members.find((m) => m.player_key === player.key);
  if (!mine) return noneView(player.pool, s.cfg, now);
  const final = b.finalized_at !== null;
  // D-2e-24: the one combining module (core/table.ts). Without a tag (or under `hide`) the table is exactly the
  // visible members; a final table is the real final ranks plus the frozen snapshot of computer players.
  countRivalsProblem(s, b, final);
  const table = final ? finalTable(b, members, s.cfg.rivals.hide) : liveTable(b, members, now, s.cfg.rivals.hide);
  // The hearts read: with computer players shown, ONE read of the bracket's heart pairs replaces likedSlots (mine
  // from it, plus the real hearts on rival rows, the same for every viewer); the statement count is unchanged.
  let liked: Set<number>;
  const realTo = new Map<number, number>();
  if (table.some((r) => r.kind === 'rival')) {
    liked = new Set();
    for (const h of await s.store.bracketHearts(id)) {
      if (h.from_slot === mine.slot) liked.add(h.to_slot);
      if (isRivalSlot(h.to_slot)) realTo.set(h.to_slot, (realTo.get(h.to_slot) ?? 0) + 1);
    }
  } else {
    liked = new Set(await s.store.likedSlots(id, mine.slot));
  }
  // Leaderboard update: a real row's activity comes from its member row (rival slots are ≥ 9000, never a member's);
  // a computer player's from its script (2026-10-13).
  const bySlot = new Map(members.map((m) => [m.slot, m] as const));
  const presence = s.cfg.presence.enabled;
  const rows: WireRow[] = withRealHearts(table, realTo).map((r) => toWire(r, r.rank, player.key, liked, r.kind === 'player' ? bySlot.get(r.slot) : undefined, presence));
  const count = final ? (b.final_members ?? rows.length) : rows.length;
  const fresh = heartsNew(mine.hearts, mine.hearts_self, mine.hearts_seen);
  if (fresh > 0) await s.store.setHeartsSeen(id, mine.slot, mine.hearts - mine.hearts_self);
  const me = rows.find((r) => r.me) ?? null;
  const ended = b.ends_at <= now;
  let result: ResultView | null = null;
  if (ended && final && mine.final_rank !== null) {
    const reward = await s.store.getReward(rewardId(id, mine.slot));
    result = {
      bracketId: id,
      endedAt: b.ends_at,
      place: mine.final_rank,
      members: b.final_members ?? count,
      points: mine.points,
      reward: rewardView(reward && reward.player_key === player.key ? reward : null, s.cfg, now),
    };
  }
  return {
    state: ended ? 'ended' : 'open',
    bracketId: id,
    pool: wirePool(b.pool),
    mode: b.mode,
    openedAt: b.opened_at,
    endsAt: b.ends_at,
    members: count,
    maxMembers: b.max_members,
    rows,
    me,
    final,
    heartsNew: fresh,
    result,
    serverTime: now,
  };
}

export function summaryOf(v: BracketView): BracketSummary | null {
  if (v.state === 'none') return null;
  return { state: v.state, bracketId: v.bracketId, rank: v.me?.rank ?? null, members: v.members, points: v.me?.points ?? 0, endsAt: v.endsAt };
}
