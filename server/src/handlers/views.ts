// Owner: G4 (Phase 2e). The views the handlers answer with (CONTRACTS §2): the player, the rules, my
// bracket (open, or ended less than 24 h ago), my results, and lazy finalisation (spec §1.5).
// Honesty (H-2, H-3): rows are exactly the visible members in the server's order with the server's ranks;
// `members` is the real count of visible rows (for a finalised bracket, final_members: the count that was
// ranked, so a later deletion leaves an honest gap instead of a re-numbered list).
import type { BracketRow as WireRow, BracketSummary, BracketView, PlayerView, ResultView, RewardView, RulesView } from '../contract';
import { grantOf, heartsNew, paidPlaces, rankRows } from '../core/brackets';
import type { ServerConfig } from '../core/config';
import { rewardId, wirePool } from '../core/ids';
import { nextNickChange } from '../core/nickname';
import type { Services } from '../services';
import type { MemberRow, PlayerRow, RewardRow } from '../store/sql-store';

export function rulesView(cfg: ServerConfig): RulesView {
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
  };
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
 */
export async function finalizeIfDue(s: Services, bracketId: string, now: number): Promise<boolean> {
  const b = await s.store.getBracket(bracketId);
  if (!b) return false;
  if (b.finalized_at !== null) return true;
  if (b.ends_at + s.cfg.bracket.finalizeGraceMs > now) return false;
  const members = await s.store.members(bracketId);
  const ranked = rankRows(members.filter((m) => m.hidden === 0).map((m) => ({ slot: m.slot, points: m.points, scoredAt: m.scored_at, key: m.player_key })));
  const paid = paidPlaces(ranked, s.cfg);
  const rewards = paid.map((p) => ({
    id: rewardId(bracketId, p.slot),
    playerKey: (ranked.find((r) => r.slot === p.slot) as { key: string }).key,
    place: p.place,
    hints: p.hints,
    kitties: p.kitties,
    expiresAt: now + s.cfg.rewards.claimTtlMs,
  }));
  const done = await s.store.finalize(
    bracketId,
    ranked.map((r) => ({ slot: r.slot, rank: r.rank })),
    rewards,
    now,
  );
  if (done) {
    s.metrics.count('bracket_final', 'members', ranked.length);
    if (rewards.length > 0) s.metrics.count('reward', 'created', rewards.length);
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

const toWire = (m: MemberRow, rank: number, myKey: string, liked: ReadonlySet<number>, presence: boolean): WireRow => ({
  rank,
  slot: m.slot,
  nickname: m.nickname,
  avatarId: m.avatar,
  points: m.points,
  hearts: m.hearts,
  me: m.player_key === myKey,
  likedByMe: liked.has(m.slot),
  seenAt: seenAtOf(m, presence),
  playing: presence && m.playing === 1,
  frameId: m.frame ?? 0,
  backgroundId: m.bg ?? 0,
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
  const liked = new Set(await s.store.likedSlots(id, mine.slot));
  const final = b.finalized_at !== null;
  let rows: WireRow[];
  let count: number;
  if (final) {
    rows = members
      .filter((m) => m.hidden === 0 && m.final_rank !== null)
      .sort((x, y) => (x.final_rank as number) - (y.final_rank as number))
      .map((m) => toWire(m, m.final_rank as number, player.key, liked, s.cfg.presence.enabled));
    count = b.final_members ?? rows.length;
  } else {
    const visible = members.filter((m) => m.hidden === 0);
    rows = rankRows(visible.map((m) => ({ ...m, scoredAt: m.scored_at }))).map((m) => toWire(m, m.rank, player.key, liked, s.cfg.presence.enabled));
    count = rows.length;
  }
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
