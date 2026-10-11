// Owner: G4 (Phase 2e). Every SQL statement of the server (spec §1.2, §1.5, §1.9.6, §1.10, §1.11). Rules:
//   - bound parameters only (`?`), never a value interpolated into SQL (a test greps this file);
//   - portable SQL (a Postgres driver only rewrites `?` → `$n`): ON CONFLICT … DO NOTHING / DO UPDATE,
//     RETURNING, CASE instead of scalar max(), no SQLite date functions, booleans 0/1, no bit operators;
//   - no interactive transactions: every read-modify-write is guarded statements inside ONE batch, so two
//     concurrent requests can never double-count (critic C-9, C-10, C-20);
//   - every hot-path, sweep and stats statement reads by key or index range (EXPLAIN QUERY PLAN test).
// The ONE statement that inserts a `members` row is in writeWins (H-1: a row exists only after an accepted
// win; spec §10.6 #2 greps for it).
import type { SqlDb, SqlStatement, SqlValue } from './sql-db';
import type { BracketRow, FlagRow, MemberRow, PlayerRow, ResultRow, RewardRow } from './rows';

export type { BracketRow, FlagRow, MemberRow, PlayerRow, ResultRow, RewardRow } from './rows';

export interface NewPlayer {
  readonly key: string;
  readonly code: string;
  readonly pool: string;
  readonly trust: 'signed' | 'anon';
  readonly secretHash: string | null;
  readonly nickname: string;
  readonly nick: { readonly adj: number; readonly noun: number; readonly num: number } | null;
  readonly avatar: number;
  readonly status: 'ok' | 'suspended';
  readonly budgetMs: number;
  readonly clientVersion: string;
}

export interface NewBracket {
  readonly id: string;
  readonly pool: string;
  readonly mode: 'rolling' | 'utc_day';
  readonly openedAt: number;
  readonly joinUntil: number;
  readonly endsAt: number;
  readonly maxMembers: number;
}

export interface WinWrite {
  readonly puzzleId: string;
  readonly winId: string;
  readonly points: number;
  readonly fish: number;
  readonly solveMs: number;
  readonly n: number;
  readonly verdict: 'accepted' | 'accepted_flagged';
  readonly playedAt: number;
  readonly clientVersion: string;
}

export interface FlagWrite {
  readonly id: string;
  readonly kind: string;
  readonly detail: string;
}

export type BracketTarget =
  | { readonly kind: 'current'; readonly bracketId: string }
  | { readonly kind: 'join'; readonly bracketId: string }
  | { readonly kind: 'create'; readonly bracket: NewBracket };

export interface WriteWinsInput {
  readonly playerKey: string;
  readonly nickname: string;
  readonly avatar: number;
  readonly now: number;
  /** null: no win to write (only the player update and flags). */
  readonly target: BracketTarget | null;
  readonly wins: readonly WinWrite[];
  readonly player: { readonly maxLevel: number; readonly budgetMs: number; readonly budgetAt: number };
  readonly flags: readonly FlagWrite[];
}

export interface WriteWinsResult {
  /** Joining: the slot taken, or null when the join lost its race (every guarded statement was a no-op). */
  readonly joinedSlot: number | null;
  /** Per win (same order): did its row go in (its points were added)? */
  readonly inserted: readonly boolean[];
}

/** A profile change (spec §1.8): any subset; the name change carries its cooldown guard. */
export interface ProfileUpdate {
  nickname?: {
    readonly text: string;
    readonly nick: { readonly adj: number; readonly noun: number; readonly num: number } | null;
    readonly changedAt: number | null;
    /** The guard: nick_changed_at must be NULL or ≤ this (now − cooldown); null = no guard (admin reset). */
    readonly cooldownBefore: number | null;
  };
  avatar?: number;
  listed?: boolean;
}

export interface StoredWinRow {
  readonly puzzle_id: string;
  readonly win_id: string;
  readonly points: number;
}

export interface RankWrite {
  readonly slot: number;
  readonly rank: number;
}

export interface RewardWrite {
  readonly id: string;
  readonly playerKey: string;
  readonly place: number;
  readonly hints: number;
  readonly kitties: number;
  readonly expiresAt: number;
}

export interface SweepCutoffs {
  readonly winsBefore: number;
  readonly bracketsEndedBefore: number;
  readonly rewardsExpiredBefore: number;
  readonly flagsBefore: number;
  readonly playersSeenBefore: number;
  readonly tombstonesBefore: number;
  readonly adminLogBefore: number;
  readonly ipQuotaDayBefore: string;
  readonly statsDayBefore: string;
  readonly tombstoneUntil: number;
}

/** "?, ?, ?" for n values. */
const marks = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

/** Hidden bits without bit operators (portable): 1 suspended, 2 not listed. */
const SET_SUSPENDED = 'CASE WHEN hidden = 1 OR hidden = 3 THEN hidden ELSE hidden + 1 END';
const CLEAR_SUSPENDED = 'CASE WHEN hidden = 1 OR hidden = 3 THEN hidden - 1 ELSE hidden END';
const SET_UNLISTED = 'CASE WHEN hidden >= 2 THEN hidden ELSE hidden + 2 END';
const CLEAR_UNLISTED = 'CASE WHEN hidden >= 2 THEN hidden - 2 ELSE hidden END';

/** The guard every win statement carries: the bracket still runs and is not finalised. */
const RUNNING = 'EXISTS (SELECT 1 FROM brackets WHERE id = ? AND ends_at > ? AND finalized_at IS NULL)';

export class SqlStore {
  constructor(readonly db: SqlDb) {}

  private q(sql: string, ...values: SqlValue[]): SqlStatement {
    return this.db.prepare(sql).bind(...values);
  }

  // ───────────────────────────────────────────── health

  async ping(): Promise<boolean> {
    const r = await this.q('SELECT 1 AS ok').first<{ ok: number }>();
    return r?.ok === 1;
  }

  // ───────────────────────────────────────────── players

  getPlayer(key: string): Promise<PlayerRow | null> {
    return this.q('SELECT * FROM players WHERE key = ?', key).first<PlayerRow>();
  }

  getPlayerByCode(code: string): Promise<PlayerRow | null> {
    return this.q('SELECT * FROM players WHERE code = ?', code).first<PlayerRow>();
  }

  /** 'created', 'exists' (the key is taken: a concurrent first session) or 'code_taken' (retry with a new code). */
  async insertPlayer(p: NewPlayer, now: number): Promise<'created' | 'exists' | 'code_taken'> {
    const row = await this.q(
      `INSERT INTO players (key, code, pool, trust, secret_hash, nickname, nick_adj, nick_noun, nick_num, avatar, status, listed,
                            created_at, seen_at, nick_changed_at, max_level, budget_ms, budget_at, cur_bracket, cur_ends_at, flag_count, client_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, 0, ?, ?, NULL, NULL, 0, ?)
       ON CONFLICT DO NOTHING RETURNING key`,
      p.key,
      p.code,
      p.pool,
      p.trust,
      p.secretHash,
      p.nickname,
      p.nick?.adj ?? null,
      p.nick?.noun ?? null,
      p.nick?.num ?? null,
      p.avatar,
      p.status,
      now,
      now,
      p.budgetMs,
      now,
      p.clientVersion,
    ).first<{ key: string }>();
    if (row) return 'created';
    return (await this.getPlayer(p.key)) ? 'exists' : 'code_taken';
  }

  async touchPlayer(key: string, now: number, clientVersion: string): Promise<void> {
    await this.q('UPDATE players SET seen_at = ?, client_version = ? WHERE key = ?', now, clientVersion, key).run();
  }

  async tombstoneUntil(key: string): Promise<number | null> {
    const r = await this.q('SELECT suspended_until FROM tombstones WHERE player_key = ?', key).first<{ suspended_until: number }>();
    return r?.suspended_until ?? null;
  }

  // ───────────────────────────────────────────── nonces, quotas

  /** Single use (spec §1.3 step 5): false = replay. */
  async useNonce(hash: string, expiresAt: number): Promise<boolean> {
    const r = await this.q('INSERT INTO seen_nonces (h, expires_at) VALUES (?, ?) ON CONFLICT DO NOTHING', hash, expiresAt).run();
    return r.meta.changes === 1;
  }

  /** The anonymous mode's registrations from one IP hash today, this one included. */
  async bumpIpQuota(day: string, ipHash: string): Promise<number> {
    const r = await this.q(
      'INSERT INTO ip_quota (day, ip_hash, n) VALUES (?, ?, 1) ON CONFLICT (day, ip_hash) DO UPDATE SET n = ip_quota.n + 1 RETURNING n',
      day,
      ipHash,
    ).first<{ n: number }>();
    return r?.n ?? 1;
  }

  // ───────────────────────────────────────────── wins

  /** The counted wins among these ids (dedupe by winId and by puzzle, one read per request). */
  async storedWins(key: string, winIds: readonly string[], puzzleIds: readonly string[]): Promise<StoredWinRow[]> {
    if (winIds.length === 0 && puzzleIds.length === 0) return [];
    const r = await this.q(
      `SELECT puzzle_id, win_id, points FROM wins WHERE player_key = ? AND puzzle_id IN (${marks(puzzleIds.length)})
       UNION SELECT puzzle_id, win_id, points FROM wins WHERE player_key = ? AND win_id IN (${marks(winIds.length)})`,
      key,
      ...puzzleIds,
      key,
      ...winIds,
    ).all<StoredWinRow>();
    return r.results;
  }

  getMember(bracketId: string, key: string): Promise<MemberRow | null> {
    return this.q('SELECT * FROM members WHERE player_key = ? AND bracket_id = ?', key, bracketId).first<MemberRow>();
  }

  /** The oldest joinable bracket of the pool (normally at most one; spec §1.5 step 1). */
  async findOpenBracket(pool: string, now: number): Promise<string | null> {
    const r = await this.q(
      'SELECT id FROM brackets WHERE pool = ? AND join_until > ? AND finalized_at IS NULL AND members < max_members ORDER BY opened_at ASC LIMIT 1',
      pool,
      now,
    ).first<{ id: string }>();
    return r?.id ?? null;
  }

  /**
   * One atomic batch (spec §1.5 step 2, §1.9.6): [create the bracket] → [join: the member insert guarded by
   * capacity, window and not-already-member; the self-correcting count and next_slot; the player's
   * current bracket] → per win: the member's points (guarded: no win row yet for this puzzle or winId,
   * bracket running) and the win row (guarded: the member exists, bracket running) → the player's level
   * baseline and budget → flags. On a join, everything after the member insert is guarded by the member
   * row, so a lost join race leaves no trace and the handler retries (critic C-9).
   */
  async writeWins(input: WriteWinsInput): Promise<WriteWinsResult> {
    const { playerKey: key, now, target } = input;
    const stmts: SqlStatement[] = [];
    const bracketId = target === null ? null : target.kind === 'create' ? target.bracket.id : target.bracketId;
    const joining = target !== null && target.kind !== 'current';
    let joinIndex = -1;
    // A join (or a new bracket) happens only while the player has no running bracket and at least one of
    // these wins is not stored yet: a request that lost a race to another request of the same player never
    // opens a second bracket or leaves a 0-point row (H-1: a row exists only with a counted win).
    // Audit A: the player row must still exist (EXISTS, not NOT EXISTS), so a join or create racing "Delete my
    // ranking data" never leaves a member row (with the nickname) or win rows of a deleted player behind.
    const freeGuard = 'EXISTS (SELECT 1 FROM players WHERE key = ? AND (cur_ends_at IS NULL OR cur_ends_at <= ?))';
    const newGuard =
      input.wins.length === 0
        ? '1 = 0'
        : `(${input.wins.map(() => '(NOT EXISTS (SELECT 1 FROM wins WHERE player_key = ? AND puzzle_id = ?) AND NOT EXISTS (SELECT 1 FROM wins WHERE player_key = ? AND win_id = ?))').join(' OR ')})`;
    const guardArgs: SqlValue[] = [key, now];
    for (const w of input.wins) guardArgs.push(key, w.puzzleId, key, w.winId);
    if (target?.kind === 'create') {
      const b = target.bracket;
      // Integration I-6 (lead): a new bracket opens only while the pool has no joinable one. Without this guard,
      // concurrent first wins of DIFFERENT players in a pool with no open bracket each opened their own (seen in
      // e2e: 49 players split 48 + 1). A create that loses this race inserts nothing, so its member insert finds
      // no bracket and the handler's retry joins the bracket that won (spec §1.5 "normally at most one").
      const poolGuard = 'NOT EXISTS (SELECT 1 FROM brackets o WHERE o.pool = ? AND o.join_until > ? AND o.finalized_at IS NULL AND o.members < o.max_members)';
      stmts.push(
        this.q(
          `INSERT INTO brackets (id, pool, mode, opened_at, join_until, ends_at, members, next_slot, max_members)
           SELECT ?, ?, ?, ?, ?, ?, 0, 0, ? WHERE ${freeGuard} AND ${newGuard} AND ${poolGuard}`,
          b.id,
          b.pool,
          b.mode,
          b.openedAt,
          b.joinUntil,
          b.endsAt,
          b.maxMembers,
          ...guardArgs,
          b.pool,
          now,
        ),
      );
    }
    if (joining && bracketId !== null) {
      joinIndex = stmts.length;
      stmts.push(
        this.q(
          `INSERT INTO members (bracket_id, slot, player_key, nickname, avatar, points, wins, hearts, hearts_seen, hearts_self, scored_at, joined_at, hidden)
           SELECT b.id, b.next_slot, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, 0 FROM brackets b
            WHERE b.id = ? AND b.finalized_at IS NULL AND b.join_until > ? AND b.ends_at > ?
              AND (SELECT COUNT(*) FROM members m WHERE m.bracket_id = b.id) < b.max_members
              AND NOT EXISTS (SELECT 1 FROM members m WHERE m.bracket_id = b.id AND m.player_key = ?)
              AND ${freeGuard} AND ${newGuard}
           ON CONFLICT DO NOTHING RETURNING slot`,
          key,
          input.nickname,
          input.avatar,
          now,
          now,
          bracketId,
          now,
          now,
          key,
          ...guardArgs,
        ),
        this.q(
          `UPDATE brackets SET members = (SELECT COUNT(*) FROM members WHERE bracket_id = ?),
                  next_slot = CASE WHEN EXISTS (SELECT 1 FROM members WHERE bracket_id = ? AND slot = brackets.next_slot) THEN next_slot + 1 ELSE next_slot END
            WHERE id = ?`,
          bracketId,
          bracketId,
          bracketId,
        ),
        this.q(
          `UPDATE players SET cur_bracket = ?, cur_ends_at = (SELECT ends_at FROM brackets WHERE id = ?)
            WHERE key = ? AND EXISTS (SELECT 1 FROM members WHERE bracket_id = ? AND player_key = ?)`,
          bracketId,
          bracketId,
          key,
          bracketId,
          key,
        ),
      );
    }
    const insertIndex: number[] = [];
    if (bracketId !== null) {
      for (const w of input.wins) {
        stmts.push(
          this.q(
            `UPDATE members SET points = points + ?, wins = wins + 1, scored_at = ?
              WHERE bracket_id = ? AND player_key = ?
                AND NOT EXISTS (SELECT 1 FROM wins WHERE player_key = ? AND puzzle_id = ?)
                AND NOT EXISTS (SELECT 1 FROM wins WHERE player_key = ? AND win_id = ?)
                AND ${RUNNING}`,
            w.points,
            now,
            bracketId,
            key,
            key,
            w.puzzleId,
            key,
            w.winId,
            bracketId,
            now,
          ),
        );
        insertIndex.push(stmts.length);
        stmts.push(
          this.q(
            `INSERT INTO wins (player_key, puzzle_id, win_id, bracket_id, points, fish, solve_ms, n, verdict, received_at, played_at_client, client_version)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE EXISTS (SELECT 1 FROM members WHERE bracket_id = ? AND player_key = ?) AND ${RUNNING}
             ON CONFLICT DO NOTHING`,
            key,
            w.puzzleId,
            w.winId,
            bracketId,
            w.points,
            w.fish,
            w.solveMs,
            w.n,
            w.verdict,
            now,
            w.playedAt,
            w.clientVersion,
            bracketId,
            key,
            bracketId,
            now,
          ),
        );
      }
    }
    const memberGuard = joining && bracketId !== null ? ' AND EXISTS (SELECT 1 FROM members WHERE bracket_id = ? AND player_key = ?)' : '';
    const guardValues: SqlValue[] = joining && bracketId !== null ? [bracketId, key] : [];
    stmts.push(
      this.q(
        // seen_at is the session's (indexed for the inactive sweep): not rewritten per win, so a counted win
        // writes ≤ 5 rows (member 1, win + its 2 indexes 3, player 1; spec §10.4).
        `UPDATE players SET max_level = CASE WHEN ? > max_level THEN ? ELSE max_level END, budget_ms = ?, budget_at = ?,
                flag_count = flag_count + ? WHERE key = ?${memberGuard}`,
        input.player.maxLevel,
        input.player.maxLevel,
        input.player.budgetMs,
        input.player.budgetAt,
        input.flags.length,
        key,
        ...guardValues,
      ),
    );
    // ≤ 19 flags per statement (5 values each, ≤ 100 bound parameters with the guard).
    for (let i = 0; i < input.flags.length; i += 19) {
      const chunk = input.flags.slice(i, i + 19);
      const values: SqlValue[] = [];
      for (const f of chunk) values.push(f.id, key, now, f.kind, f.detail.slice(0, 300));
      const rows = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      stmts.push(
        this.q(
          memberGuard
            ? `INSERT INTO flags (id, player_key, at, kind, detail) SELECT * FROM (VALUES ${rows}) AS v WHERE EXISTS (SELECT 1 FROM members WHERE bracket_id = ? AND player_key = ?)`
            : `INSERT INTO flags (id, player_key, at, kind, detail) VALUES ${rows}`,
          ...values,
          ...guardValues,
        ),
      );
    }
    const res = await this.db.batch(stmts);
    let joinedSlot: number | null = null;
    if (joinIndex >= 0) {
      const row = res[joinIndex]?.results?.[0] as { slot?: number } | undefined;
      joinedSlot = typeof row?.slot === 'number' ? row.slot : null;
    }
    return { joinedSlot, inserted: insertIndex.map((i) => (res[i]?.meta.changes ?? 0) === 1) };
  }

  // ───────────────────────────────────────────── brackets

  getBracket(id: string): Promise<BracketRow | null> {
    return this.q('SELECT * FROM brackets WHERE id = ?', id).first<BracketRow>();
  }

  async members(bracketId: string): Promise<MemberRow[]> {
    return (await this.q('SELECT * FROM members WHERE bracket_id = ?', bracketId).all<MemberRow>()).results;
  }

  async likedSlots(bracketId: string, fromSlot: number): Promise<number[]> {
    const r = await this.q('SELECT to_slot FROM hearts WHERE bracket_id = ? AND from_slot = ?', bracketId, fromSlot).all<{ to_slot: number }>();
    return r.results.map((x) => x.to_slot);
  }

  async setHeartsSeen(bracketId: string, slot: number, seen: number): Promise<void> {
    await this.q('UPDATE members SET hearts_seen = ? WHERE bracket_id = ? AND slot = ?', seen, bracketId, slot).run();
  }

  /** Brackets past their end (plus the finalisation grace) and not yet final, oldest first. */
  async dueBrackets(before: number, limit: number, pools: readonly string[] | null = null): Promise<string[]> {
    // `pools`: the dev cron of one test pool (never the production cron, which takes every pool).
    const r =
      pools === null
        ? await this.q('SELECT id FROM brackets WHERE ends_at <= ? AND finalized_at IS NULL ORDER BY ends_at ASC LIMIT ?', before, limit).all<{ id: string }>()
        : await this.q(`SELECT id FROM brackets WHERE ends_at <= ? AND finalized_at IS NULL AND pool IN (${marks(pools.length)}) ORDER BY ends_at ASC LIMIT ?`, before, ...pools, limit).all<{ id: string }>();
    return r.results.map((x) => x.id);
  }

  /** "UPDATE members SET final_rank = CASE slot WHEN … END" in chunks of ≤ 30 members (≤ 100 bound values). */
  private rankStatements(bracketId: string, ranks: readonly RankWrite[], guardFinal: boolean): SqlStatement[] {
    const out: SqlStatement[] = [];
    for (let i = 0; i < ranks.length; i += 30) {
      const chunk = ranks.slice(i, i + 30);
      const values: SqlValue[] = [];
      for (const r of chunk) values.push(r.slot, r.rank);
      values.push(bracketId, ...chunk.map((r) => r.slot));
      const guard = guardFinal ? ' AND EXISTS (SELECT 1 FROM brackets WHERE id = ? AND finalized_at IS NULL)' : '';
      if (guardFinal) values.push(bracketId);
      out.push(
        this.q(
          `UPDATE members SET final_rank = CASE slot ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} ELSE final_rank END
            WHERE bracket_id = ? AND slot IN (${marks(chunk.length)})${guard}`,
          ...values,
        ),
      );
    }
    return out;
  }

  private rewardStatement(bracketId: string, rewards: readonly RewardWrite[], now: number, guardFinal: boolean): SqlStatement | null {
    if (rewards.length === 0) return null;
    const values: SqlValue[] = [];
    for (const r of rewards) values.push(r.id, r.playerKey, bracketId, r.place, r.hints, r.kitties, now, r.expiresAt);
    const rows = rewards.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    if (guardFinal) values.push(bracketId);
    return this.q(
      `INSERT INTO rewards (id, player_key, bracket_id, place, hints, kitties, created_at, expires_at)
       SELECT * FROM (VALUES ${rows}) AS v WHERE ${guardFinal ? 'EXISTS (SELECT 1 FROM brackets WHERE id = ? AND finalized_at IS NULL)' : '1 = 1'}
       ON CONFLICT (id) DO NOTHING`,
      ...values,
    );
  }

  /**
   * Freezes the standings (spec §1.5 "Finalise", idempotent): ranks for the visible members, the rewards
   * of the paid places, finalized_at and final_members — every statement guarded by `finalized_at IS
   * NULL`, so a concurrent finaliser changes nothing. True when this call finalised.
   */
  async finalize(bracketId: string, ranks: readonly RankWrite[], rewards: readonly RewardWrite[], now: number): Promise<boolean> {
    const stmts = this.rankStatements(bracketId, ranks, true);
    const rw = this.rewardStatement(bracketId, rewards, now, true);
    if (rw) stmts.push(rw);
    stmts.push(this.q('UPDATE brackets SET finalized_at = ?, final_members = ? WHERE id = ? AND finalized_at IS NULL', now, ranks.length, bracketId));
    const res = await this.db.batch(stmts);
    return (res[res.length - 1]?.meta.changes ?? 0) === 1;
  }

  /** Admin re-rank after a removal (spec §1.5): new ranks, final_members, rewards for newly paid places; claimed ones stay. */
  async refinalize(bracketId: string, ranks: readonly RankWrite[], rewards: readonly RewardWrite[], now: number): Promise<void> {
    const stmts = [this.q('UPDATE members SET final_rank = NULL WHERE bracket_id = ?', bracketId), ...this.rankStatements(bracketId, ranks, false)];
    const rw = this.rewardStatement(bracketId, rewards, now, false);
    if (rw) stmts.push(rw);
    stmts.push(this.q('UPDATE brackets SET final_members = ?, finalized_at = CASE WHEN finalized_at IS NULL THEN ? ELSE finalized_at END WHERE id = ?', ranks.length, now, bracketId));
    await this.db.batch(stmts);
  }

  /** My finished brackets with a final rank, ended after `since`, newest first (SessionResponse.results). */
  async results(key: string, since: number, limit: number): Promise<ResultRow[]> {
    const r = await this.q(
      `SELECT m.bracket_id, m.slot, m.points, m.final_rank, b.ends_at, b.final_members,
              r.id AS reward_id, r.place, r.hints, r.kitties, r.expires_at, r.claimed_at, r.doubled, r.voided
         FROM members m JOIN brackets b ON b.id = m.bracket_id
         LEFT JOIN rewards r ON r.id = m.bracket_id || ':' || m.slot
        WHERE m.player_key = ? AND b.finalized_at IS NOT NULL AND b.ends_at > ? AND m.final_rank IS NOT NULL
        ORDER BY b.ends_at DESC LIMIT ?`,
      key,
      since,
      limit,
    ).all<ResultRow>();
    return r.results;
  }

  getReward(id: string): Promise<RewardRow | null> {
    return this.q('SELECT * FROM rewards WHERE id = ?', id).first<RewardRow>();
  }

  /** Spec §1.6 claim: fresh when this request's update changed the row; the stored row either way. */
  async claim(rewardId: string, key: string, double: boolean, now: number): Promise<{ fresh: boolean; row: RewardRow | null }> {
    const res = await this.db.batch([
      this.q(
        'UPDATE rewards SET claimed_at = ?, doubled = ? WHERE id = ? AND player_key = ? AND claimed_at IS NULL AND voided = 0 AND expires_at > ?',
        now,
        double ? 1 : 0,
        rewardId,
        key,
        now,
      ),
      this.q('SELECT * FROM rewards WHERE id = ? AND player_key = ?', rewardId, key),
    ]);
    return { fresh: (res[0]?.meta.changes ?? 0) === 1, row: (res[1]?.results?.[0] as RewardRow | undefined) ?? null };
  }

  // ───────────────────────────────────────────── hearts

  /**
   * Spec §1.7 (critic C-20): both statements carry the same guards — a visible target, no existing pair,
   * fewer than `cap` given from this slot — so a race can neither double-count nor pass the cap. The
   * reads after them say what happened.
   */
  async giveHeart(
    bracketId: string,
    fromSlot: number,
    toSlot: number,
    now: number,
    cap: number,
  ): Promise<{ added: boolean; hearts: number | null; given: number; exists: boolean; targetVisible: boolean }> {
    const self = fromSlot === toSlot ? 1 : 0;
    const res = await this.db.batch([
      this.q(
        `UPDATE members SET hearts = hearts + 1, hearts_self = hearts_self + ?
          WHERE bracket_id = ? AND slot = ? AND hidden = 0
            AND NOT EXISTS (SELECT 1 FROM hearts WHERE bracket_id = ? AND from_slot = ? AND to_slot = ?)
            AND (SELECT COUNT(*) FROM hearts WHERE bracket_id = ? AND from_slot = ?) < ?`,
        self,
        bracketId,
        toSlot,
        bracketId,
        fromSlot,
        toSlot,
        bracketId,
        fromSlot,
        cap,
      ),
      this.q(
        `INSERT INTO hearts (bracket_id, from_slot, to_slot, at) SELECT ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM members WHERE bracket_id = ? AND slot = ? AND hidden = 0)
            AND (SELECT COUNT(*) FROM hearts WHERE bracket_id = ? AND from_slot = ?) < ?
         ON CONFLICT DO NOTHING`,
        bracketId,
        fromSlot,
        toSlot,
        now,
        bracketId,
        toSlot,
        bracketId,
        fromSlot,
        cap,
      ),
      this.q('SELECT hearts, hidden FROM members WHERE bracket_id = ? AND slot = ?', bracketId, toSlot),
      this.q('SELECT COUNT(*) AS n FROM hearts WHERE bracket_id = ? AND from_slot = ?', bracketId, fromSlot),
      this.q('SELECT 1 AS x FROM hearts WHERE bracket_id = ? AND from_slot = ? AND to_slot = ?', bracketId, fromSlot, toSlot),
    ]);
    const target = res[2]?.results?.[0] as { hearts: number; hidden: number } | undefined;
    const given = (res[3]?.results?.[0] as { n: number } | undefined)?.n ?? 0;
    return {
      added: (res[1]?.meta.changes ?? 0) === 1,
      hearts: target ? target.hearts : null,
      given: Number(given),
      exists: (res[4]?.results?.length ?? 0) > 0,
      targetVisible: target !== undefined && target.hidden === 0,
    };
  }

  // ───────────────────────────────────────────── profile

  /**
   * Name, avatar and listed in one batch; the rows of my OPEN brackets follow (spec §1.5 hidden rows, §1.8).
   * The name change is guarded by its cooldown (`changeAllowedBefore`: nick_changed_at must be null or
   * ≤ it), so two concurrent changes cannot both pass. False when the guarded name change did not apply.
   */
  async updateProfile(key: string, p: ProfileUpdate): Promise<boolean> {
    const stmts: SqlStatement[] = [];
    const open = 'EXISTS (SELECT 1 FROM brackets b WHERE b.id = members.bracket_id AND b.finalized_at IS NULL)';
    let nameIndex = -1;
    if (p.nickname) {
      const n = p.nickname;
      nameIndex = stmts.length;
      const cooldown = n.cooldownBefore === null ? '' : ' AND (nick_changed_at IS NULL OR nick_changed_at <= ?)';
      stmts.push(
        this.q(
          `UPDATE players SET nickname = ?, nick_adj = ?, nick_noun = ?, nick_num = ?, nick_changed_at = ? WHERE key = ?${cooldown}`,
          n.text,
          n.nick?.adj ?? null,
          n.nick?.noun ?? null,
          n.nick?.num ?? null,
          n.changedAt,
          key,
          ...(n.cooldownBefore === null ? [] : [n.cooldownBefore]),
        ),
        this.q(`UPDATE members SET nickname = ? WHERE player_key = ? AND ${open} AND EXISTS (SELECT 1 FROM players WHERE key = ? AND nickname = ?)`, n.text, key, key, n.text),
      );
    }
    if (p.avatar !== undefined) {
      stmts.push(
        this.q('UPDATE players SET avatar = ? WHERE key = ?', p.avatar, key),
        this.q(`UPDATE members SET avatar = ? WHERE player_key = ? AND ${open}`, p.avatar, key),
      );
    }
    if (p.listed !== undefined) {
      stmts.push(
        this.q('UPDATE players SET listed = ? WHERE key = ?', p.listed ? 1 : 0, key),
        this.q(`UPDATE members SET hidden = ${p.listed ? CLEAR_UNLISTED : SET_UNLISTED} WHERE player_key = ? AND ${open}`, key),
      );
    }
    if (stmts.length === 0) return true;
    const res = await this.db.batch(stmts);
    return nameIndex < 0 || (res[nameIndex]?.meta.changes ?? 0) === 1;
  }

  /** Flags outside a win request (a blocked free-text name); each also counts in players.flag_count. */
  async addFlags(key: string, flags: readonly FlagWrite[], now: number): Promise<void> {
    if (flags.length === 0) return;
    await this.db.batch([
      ...flags.map((f) => this.q('INSERT INTO flags (id, player_key, at, kind, detail) VALUES (?, ?, ?, ?, ?)', f.id, key, now, f.kind, f.detail.slice(0, 300))),
      this.q('UPDATE players SET flag_count = flag_count + ? WHERE key = ?', flags.length, key),
    ]);
  }

  async meData(key: string, since: number): Promise<{ brackets: number; wins30d: number; rewards: number }> {
    const r = await this.q(
      `SELECT (SELECT COUNT(*) FROM members WHERE player_key = ?) AS brackets,
              (SELECT COUNT(*) FROM wins WHERE player_key = ? AND received_at >= ?) AS wins30d,
              (SELECT COUNT(*) FROM rewards WHERE player_key = ?) AS rewards`,
      key,
      key,
      since,
      key,
    ).first<{ brackets: number; wins30d: number; rewards: number }>();
    return { brackets: Number(r?.brackets ?? 0), wins30d: Number(r?.wins30d ?? 0), rewards: Number(r?.rewards ?? 0) };
  }

  // ───────────────────────────────────────────── deletion (spec §1.11)

  /**
   * One batch: the hearts this player gave are taken back from their targets (and those targets'
   * "seen" counters clamped), every heart row from or to them deleted, the capacity counts of their
   * brackets decremented (next_slot untouched: no slot is reused), then their members, wins, rewards and
   * flags, a tombstone when suspended (delete-and-return does not lift a suspension), the player row.
   * Finalised brackets keep final_rank and final_members.
   */
  async deletePlayer(key: string, tombstoneUntil: number): Promise<void> {
    const mine = 'SELECT bracket_id FROM members WHERE player_key = ?';
    await this.db.batch([
      this.q(
        `UPDATE members SET hearts = hearts - (SELECT COUNT(*) FROM hearts h WHERE h.bracket_id = members.bracket_id AND h.to_slot = members.slot
                                                  AND h.from_slot = (SELECT m2.slot FROM members m2 WHERE m2.bracket_id = members.bracket_id AND m2.player_key = ?))
          WHERE bracket_id IN (${mine}) AND player_key <> ?`,
        key,
        key,
        key,
      ),
      this.q(
        `UPDATE members SET hearts_seen = CASE WHEN hearts_seen > hearts - hearts_self THEN hearts - hearts_self ELSE hearts_seen END
          WHERE bracket_id IN (${mine}) AND player_key <> ?`,
        key,
        key,
      ),
      this.q('DELETE FROM hearts WHERE (bracket_id, from_slot) IN (SELECT bracket_id, slot FROM members WHERE player_key = ?)', key),
      this.q('DELETE FROM hearts WHERE (bracket_id, to_slot) IN (SELECT bracket_id, slot FROM members WHERE player_key = ?)', key),
      this.q(`UPDATE brackets SET members = members - 1 WHERE id IN (${mine})`, key),
      this.q('DELETE FROM members WHERE player_key = ?', key),
      this.q('DELETE FROM wins WHERE player_key = ?', key),
      this.q('DELETE FROM rewards WHERE player_key = ?', key),
      this.q('DELETE FROM flags WHERE player_key = ?', key),
      this.q(
        `INSERT INTO tombstones (player_key, suspended_until) SELECT key, ? FROM players WHERE key = ? AND status = 'suspended'
         ON CONFLICT (player_key) DO UPDATE SET suspended_until = excluded.suspended_until`,
        tombstoneUntil,
        key,
      ),
      this.q('DELETE FROM players WHERE key = ?', key),
    ]);
  }

  // ───────────────────────────────────────────── admin (spec §1.9.7)

  async listFlags(limit: number): Promise<(FlagRow & { code: string | null })[]> {
    const r = await this.q(
      `SELECT f.id, f.player_key, f.at, f.kind, f.detail, f.resolved_at, p.code FROM flags f LEFT JOIN players p ON p.key = f.player_key
        WHERE f.resolved_at IS NULL ORDER BY f.at DESC LIMIT ?`,
      limit,
    ).all<FlagRow & { code: string | null }>();
    return r.results;
  }

  async resolveFlag(id: string, now: number): Promise<boolean> {
    return (await this.q('UPDATE flags SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL', now, id).run()).meta.changes === 1;
  }

  async playerDetail(key: string): Promise<{ wins: Record<string, unknown>[]; flags: Omit<FlagRow, 'player_key'>[]; brackets: Record<string, unknown>[] }> {
    const [wins, flags, brackets] = await Promise.all([
      this.q(
        'SELECT puzzle_id, points, fish, solve_ms, n, verdict, received_at, played_at_client, client_version FROM wins WHERE player_key = ? ORDER BY received_at DESC LIMIT 50',
        key,
      ).all<Record<string, unknown>>(),
      this.q('SELECT id, at, kind, detail, resolved_at FROM flags WHERE player_key = ? ORDER BY at DESC LIMIT 100', key).all<Omit<FlagRow, 'player_key'>>(),
      this.q(
        `SELECT m.bracket_id, m.slot, m.points, m.wins, m.hidden, m.final_rank, b.ends_at, b.finalized_at, b.final_members
           FROM members m JOIN brackets b ON b.id = m.bracket_id WHERE m.player_key = ? ORDER BY b.ends_at DESC LIMIT 50`,
        key,
      ).all<Record<string, unknown>>(),
    ]);
    return { wins: wins.results, flags: flags.results, brackets: brackets.results };
  }

  /** Suspend: status, bit 1 in every bracket of the player, unclaimed rewards voided, logged. */
  async suspend(key: string, logId: string, now: number, detail: string): Promise<void> {
    await this.db.batch([
      this.q("UPDATE players SET status = 'suspended' WHERE key = ?", key),
      this.q(`UPDATE members SET hidden = ${SET_SUSPENDED} WHERE player_key = ?`, key),
      this.q('UPDATE rewards SET voided = 1 WHERE player_key = ? AND claimed_at IS NULL', key),
      this.q("INSERT INTO admin_log (id, at, action, target, detail) VALUES (?, ?, 'suspend', ?, ?)", logId, now, key, detail),
    ]);
  }

  /** Reinstate: clears bit 1 only (an opted-out row stays hidden, critic C-11). Voided rewards stay voided. */
  async reinstate(key: string, logId: string, now: number, detail: string): Promise<void> {
    await this.db.batch([
      this.q("UPDATE players SET status = 'ok' WHERE key = ?", key),
      this.q(`UPDATE members SET hidden = ${CLEAR_SUSPENDED} WHERE player_key = ?`, key),
      this.q('DELETE FROM tombstones WHERE player_key = ?', key),
      this.q("INSERT INTO admin_log (id, at, action, target, detail) VALUES (?, ?, 'reinstate', ?, ?)", logId, now, key, detail),
    ]);
  }

  async adminLog(id: string, now: number, action: string, target: string | null, detail: string | null): Promise<void> {
    await this.q('INSERT INTO admin_log (id, at, action, target, detail) VALUES (?, ?, ?, ?, ?)', id, now, action, target, detail).run();
  }

  async stats(fromDay: string): Promise<{ day: string; name: string; v: number }[]> {
    return (await this.q('SELECT day, name, v FROM stats_daily WHERE day >= ? ORDER BY day ASC, name ASC', fromDay).all<{ day: string; name: string; v: number }>()).results;
  }

  // ───────────────────────────────────────────── cron

  async purgeNonces(now: number): Promise<number> {
    return (await this.q('DELETE FROM seen_nonces WHERE expires_at < ?', now).run()).meta.changes;
  }

  async getMeta(k: string): Promise<string | null> {
    return (await this.q('SELECT v FROM meta WHERE k = ?', k).first<{ v: string }>())?.v ?? null;
  }

  async setMeta(k: string, v: string): Promise<void> {
    await this.q('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', k, v).run();
  }

  /** The hourly rollup's reads (spec §1.14), each by index range. */
  async statsWindow(from: number, to: number, dayStart: number): Promise<{
    winsByVerdict: { verdict: string; n: number }[];
    flagsByKind: { kind: string; n: number }[];
    dau: number;
    endedToday: { final_members: number | null; members: number }[];
  }> {
    const [w, f, d, e] = await Promise.all([
      this.q('SELECT verdict, COUNT(*) AS n FROM wins WHERE received_at >= ? AND received_at < ? GROUP BY verdict', from, to).all<{ verdict: string; n: number }>(),
      this.q('SELECT kind, COUNT(*) AS n FROM flags WHERE at >= ? AND at < ? GROUP BY kind', from, to).all<{ kind: string; n: number }>(),
      this.q('SELECT COUNT(*) AS n FROM players WHERE seen_at >= ?', dayStart).first<{ n: number }>(),
      this.q('SELECT final_members, members FROM brackets WHERE ends_at >= ? AND ends_at < ?', dayStart, to).all<{ final_members: number | null; members: number }>(),
    ]);
    return { winsByVerdict: w.results, flagsByKind: f.results, dau: Number(d?.n ?? 0), endedToday: e.results };
  }

  /** stats_daily: `add` sums into the day's value, `set` replaces it (two multi-row upserts at most). */
  async writeStats(day: string, add: Record<string, number>, set: Record<string, number>): Promise<void> {
    const stmts: SqlStatement[] = [];
    const upsert = (entries: [string, number][], merge: string): void => {
      for (let i = 0; i < entries.length; i += 30) {
        const chunk = entries.slice(i, i + 30);
        const values: SqlValue[] = [];
        for (const [name, v] of chunk) values.push(day, name, v);
        stmts.push(
          this.q(
            `INSERT INTO stats_daily (day, name, v) VALUES ${chunk.map(() => '(?, ?, ?)').join(', ')} ON CONFLICT (day, name) DO UPDATE SET v = ${merge}`,
            ...values,
          ),
        );
      }
    };
    upsert(Object.entries(add).filter(([, v]) => v !== 0), 'stats_daily.v + excluded.v');
    upsert(Object.entries(set), 'excluded.v');
    if (stmts.length > 0) await this.db.batch(stmts);
  }

  /**
   * The daily retention sweep (spec §1.10, P-L18): deletes in chunks, each read by index range only (D1
   * bills every scanned row; critic C-18). Returns the rows deleted per kind.
   */
  async sweep(c: SweepCutoffs, chunk: number, chunksPerRun: number): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const add = (k: string, n: number): void => void (out[k] = (out[k] ?? 0) + n);
    const repeat = async (k: string, step: () => Promise<number>, size: number): Promise<void> => {
      for (let i = 0; i < chunksPerRun; i++) {
        const n = await step();
        add(k, n);
        if (n < size) break;
      }
    };
    await repeat(
      'wins',
      async () =>
        (
          await this.q(
            'DELETE FROM wins WHERE (player_key, puzzle_id) IN (SELECT player_key, puzzle_id FROM wins WHERE received_at < ? ORDER BY received_at LIMIT ?)',
            c.winsBefore,
            chunk,
          ).run()
        ).meta.changes,
      chunk,
    );
    // Brackets: ≈ 50 members each, so 20 brackets per chunk keeps a chunk near `chunk` rows.
    const perChunk = Math.max(1, Math.floor(chunk / 50));
    await repeat(
      'brackets',
      async () => {
        const ids = (
          await this.q('SELECT id FROM brackets WHERE ends_at < ? AND finalized_at IS NOT NULL ORDER BY ends_at LIMIT ?', c.bracketsEndedBefore, perChunk).all<{ id: string }>()
        ).results.map((r) => r.id);
        if (ids.length === 0) return 0;
        const res = await this.db.batch([
          this.q(`DELETE FROM hearts WHERE bracket_id IN (${marks(ids.length)})`, ...ids),
          this.q(`DELETE FROM members WHERE bracket_id IN (${marks(ids.length)})`, ...ids),
          this.q(`DELETE FROM brackets WHERE id IN (${marks(ids.length)})`, ...ids),
        ]);
        add('members', res[1]?.meta.changes ?? 0);
        return ids.length;
      },
      perChunk,
    );
    await repeat(
      'rewards',
      async () => (await this.q('DELETE FROM rewards WHERE id IN (SELECT id FROM rewards WHERE expires_at < ? ORDER BY expires_at LIMIT ?)', c.rewardsExpiredBefore, chunk).run()).meta.changes,
      chunk,
    );
    await repeat(
      'flags',
      async () => (await this.q('DELETE FROM flags WHERE id IN (SELECT id FROM flags WHERE at < ? ORDER BY at LIMIT ?)', c.flagsBefore, chunk).run()).meta.changes,
      chunk,
    );
    await repeat(
      'players',
      async () => {
        const res = await this.db.batch([
          this.q(
            `INSERT INTO tombstones (player_key, suspended_until)
             SELECT key, ? FROM players WHERE key IN (SELECT key FROM players WHERE seen_at < ? ORDER BY seen_at LIMIT ?) AND status = 'suspended'
             ON CONFLICT (player_key) DO UPDATE SET suspended_until = excluded.suspended_until`,
            c.tombstoneUntil,
            c.playersSeenBefore,
            chunk,
          ),
          this.q('DELETE FROM players WHERE key IN (SELECT key FROM players WHERE seen_at < ? ORDER BY seen_at LIMIT ?)', c.playersSeenBefore, chunk),
        ]);
        return res[1]?.meta.changes ?? 0;
      },
      chunk,
    );
    add('tombstones', (await this.q('DELETE FROM tombstones WHERE suspended_until < ?', c.tombstonesBefore).run()).meta.changes);
    await repeat(
      'admin_log',
      async () => (await this.q('DELETE FROM admin_log WHERE id IN (SELECT id FROM admin_log WHERE at < ? ORDER BY at LIMIT ?)', c.adminLogBefore, chunk).run()).meta.changes,
      chunk,
    );
    add('ip_quota', (await this.q('DELETE FROM ip_quota WHERE day < ?', c.ipQuotaDayBefore).run()).meta.changes);
    add('stats_daily', (await this.q('DELETE FROM stats_daily WHERE day < ?', c.statsDayBefore).run()).meta.changes);
    return out;
  }

  // ───────────────────────────────────────────── dev routes only (DEV_ROUTES=true on a loopback host)

  /** Wipes one test pool (`fb:<p>` and `web:<p>`): a delete only, never a seed (H-1). */
  async resetPool(devPool: string): Promise<void> {
    const pools = [`fb:${devPool}`, `web:${devPool}`];
    const inPools = 'SELECT id FROM brackets WHERE pool IN (?, ?)';
    const players = 'SELECT key FROM players WHERE pool IN (?, ?)';
    await this.db.batch([
      this.q(`DELETE FROM hearts WHERE bracket_id IN (${inPools})`, ...pools),
      this.q(`DELETE FROM members WHERE bracket_id IN (${inPools})`, ...pools),
      this.q(`DELETE FROM rewards WHERE bracket_id IN (${inPools})`, ...pools),
      this.q(`DELETE FROM wins WHERE player_key IN (${players})`, ...pools),
      this.q(`DELETE FROM flags WHERE player_key IN (${players})`, ...pools),
      this.q(`DELETE FROM tombstones WHERE player_key IN (${players})`, ...pools),
      this.q('DELETE FROM brackets WHERE pool IN (?, ?)', ...pools),
      this.q('DELETE FROM players WHERE pool IN (?, ?)', ...pools),
    ]);
  }
}

/** The domain-level storage interface (spec §1.2): SqlStore over D1 or node:sqlite today, Postgres later. */
export type Store = SqlStore;
