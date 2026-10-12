// Owner: lead (preview link, 2026-10-11). The ranking server of the preview build, inside the page: the /v1 API of
// src/shared/rank-api.ts answered from an in-memory store (kept in localStorage['mewdoku.preview.rank.v1'] so a
// reload keeps the day), with G4's own server code deciding everything it can:
//   - the win pipeline (server/src/core/wins.ts evaluateWins: fish, the solution table, size floors, level order,
//     duplicates, the budget) over the real solution table (server/src/content), so only the player's own real
//     wins and kept fish count;
//   - the bracket maths and views (server/src/core/brackets.ts, server/src/handlers/views.ts: rankRows, paidPlaces,
//     finalisation, the result and reward views, hearts seen, the rules the client shows) running on MemStore, which
//     implements the store methods those views call with the SQL store's row shapes (server/src/store/rows.ts);
//   - names and pictures from our word lists (core/nickname.ts generateNick / checkPick, the blocklist), ids
//     (core/ids.ts), the default server config (core/config.ts).
// What is NOT real, and is said so on screen (preview/labels.ts, "Preview: sample players"): the other players.
// 2026-10-12 (D-2e-24, design §11): the other players are the server's computer players (core/rivals.ts, core/table.ts):
// every new bracket gets a rivals tag (previewConfig turns rivals on), so the views emit the production rival rows,
// rival hearts and the disclosure (rules.computerPlayers); the preview stores no sample member rows any more. The
// handlers are a thin re-statement of server/src/handlers/* without HMAC tokens (a random token in memory: the preview
// may run where crypto.subtle is missing) and without rate limits. Two preview operations: the next new player starts
// as the "returning player" (5th, in a bracket opened 5 h ago: their fish are set to the place among the rivals), and
// "end the day" (the next session ends the player's bracket at once with their fish set so they finish 2nd;
// finalisation and the reward are the real code).
import {
  ERROR_STATUS,
  MAX_WINS_PER_REQUEST,
  AVATAR_COUNT,
  validateClaimRequest,
  validateHeartRequest,
  validateProfileRequest,
  validateSessionRequest,
  validateWinsRequest,
  type ClaimResponse,
  type ConfigResponse,
  type ErrorCode,
  type HealthResponse,
  type HeartResponse,
  type MeResponse,
  type ProfileResponse,
  type SessionResponse,
  type WinResult,
  type WinsResponse,
} from '../src/shared/rank-api';
import { NICK_WORDS_V1, RETIRED_V1 } from '../src/shared/nick-words';
import { SOLUTIONS } from '../server/src/content/generated/solutions';
import { createLookup, type ContentLookup } from '../server/src/content/lookup';
import { bracketTimes, grantOf } from '../server/src/core/brackets';
import { DEFAULT_CONFIG, type ServerConfig } from '../server/src/core/config';
import { cryptoRng, randomBase36, seededRng, type Rng } from '../server/src/core/crypto';
import { newBracketId, newPlayerCode } from '../server/src/core/ids';
import { checkPick, generateNick, renderNick } from '../server/src/core/nickname';
import { isRivalSlot, newRivalsTag } from '../server/src/core/rivals';
import { freezeTable, liveTable, pointsForRank, rivalHeartTarget, type TableRow } from '../server/src/core/table';
import { evaluateWins } from '../server/src/core/wins';
import { bracketView, finalizeIfDue, noneView, playerView, resultsFor, rulesView, summaryOf } from '../server/src/handlers/views';
import type { Services } from '../server/src/services';
import type { BracketRow, MemberRow, ResultRow, RewardRow } from '../server/src/store/rows';
import type { FinalTotals, RankWrite, RewardWrite, Store } from '../server/src/store/sql-store';
import { loadState, readRaw, saveState, type KV, type MBracket, type MMember, type MPlayer, type SampleState } from './sample-state';

export { SAMPLE_STATE_KEY, emptyState, loadState, queueOperation, type SampleState } from './sample-state';

const POOL = 'web';
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Kept wins per player (the real server keeps 30 days). */
const WINS_KEPT = 300;

/**
 * The returning player's day so far: 5th in a bracket opened 5 h ago (2026-10-12, D-2e-24: among the computer players,
 * 46–50 rows by then; their fish are whatever that place takes, pointsForRank, last scored 50 min ago).
 */
export const RETURNING_DAY = { rank: 5, openedAgoMs: 5 * HOUR, maxLevel: 36 } as const;
/** "End ranking day": the place the player finishes in (a paid one: 1 hint + 1 kitty, ×2 by video). */
const END_DAY_RANK = 2;
/** Tags tried after the first when no fish total gives the place (exact ties around it; design §11). */
const PLACE_RETRIES = 8;

/**
 * The store methods server/src/handlers/views.ts calls (bracketView, finalizeIfDue, resultsFor), over the state, with
 * the SQL store's signatures and row shapes (type-checked against SqlStore through Pick<Store, …>).
 */
type ViewStore = Pick<Store, 'getBracket' | 'members' | 'likedSlots' | 'bracketHearts' | 'setHeartsSeen' | 'getReward' | 'finalize' | 'results'>;

export class MemStore implements ViewStore {
  constructor(private readonly st: () => SampleState) {}

  getBracket(id: string): Promise<BracketRow | null> {
    const b = this.st().brackets[id];
    return Promise.resolve(b ? { ...b } : null);
  }

  members(bracketId: string): Promise<MemberRow[]> {
    return Promise.resolve((this.st().members[bracketId] ?? []).map((m) => ({ ...m })));
  }

  likedSlots(bracketId: string, fromSlot: number): Promise<number[]> {
    return Promise.resolve(this.st().hearts.filter((h) => h.bracket_id === bracketId && h.from_slot === fromSlot).map((h) => h.to_slot));
  }

  /** D-2e-24: every heart pair of the bracket (bracketView reads this instead of likedSlots when rivals are shown). */
  bracketHearts(bracketId: string): Promise<{ from_slot: number; to_slot: number }[]> {
    return Promise.resolve(this.st().hearts.filter((h) => h.bracket_id === bracketId).map((h) => ({ from_slot: h.from_slot, to_slot: h.to_slot })));
  }

  setHeartsSeen(bracketId: string, slot: number, seen: number): Promise<void> {
    const m = (this.st().members[bracketId] ?? []).find((x) => x.slot === slot);
    if (m) m.hearts_seen = seen;
    return Promise.resolve();
  }

  getReward(id: string): Promise<RewardRow | null> {
    const r = this.st().rewards[id];
    return Promise.resolve(r ? { ...r } : null);
  }

  finalize(
    bracketId: string,
    ranks: readonly RankWrite[],
    rewards: readonly RewardWrite[],
    now: number,
    totals: FinalTotals = { finalMembers: ranks.length, finalReal: ranks.length, finalRivals: null },
  ): Promise<boolean> {
    const st = this.st();
    const b = st.brackets[bracketId];
    if (!b || b.finalized_at !== null) return Promise.resolve(false);
    const members = st.members[bracketId] ?? [];
    for (const r of ranks) {
      const m = members.find((x) => x.slot === r.slot);
      if (m) m.final_rank = r.rank;
    }
    for (const w of rewards) {
      st.rewards[w.id] ??= {
        id: w.id,
        player_key: w.playerKey,
        bracket_id: bracketId,
        place: w.place,
        hints: w.hints,
        kitties: w.kitties,
        created_at: now,
        expires_at: w.expiresAt,
        claimed_at: null,
        doubled: null,
        voided: 0,
      };
    }
    b.finalized_at = now;
    // D-2e-24: every ranked row (computer players included), the real rows, and the frozen computer players.
    b.final_members = totals.finalMembers;
    b.final_real = totals.finalReal;
    b.final_rivals = totals.finalRivals;
    return Promise.resolve(true);
  }

  results(key: string, since: number, limit: number): Promise<ResultRow[]> {
    const st = this.st();
    const out: ResultRow[] = [];
    for (const [id, members] of Object.entries(st.members)) {
      const b = st.brackets[id];
      if (!b || b.finalized_at === null || b.ends_at <= since) continue;
      const m = members.find((x) => x.player_key === key);
      if (!m || m.final_rank === null) continue;
      const r = st.rewards[`${id}:${m.slot}`];
      out.push({
        bracket_id: id,
        slot: m.slot,
        points: m.points,
        final_rank: m.final_rank,
        ends_at: b.ends_at,
        final_members: b.final_members ?? 0,
        reward_id: r ? r.id : null,
        place: r ? r.place : null,
        hints: r ? r.hints : null,
        kitties: r ? r.kitties : null,
        expires_at: r ? r.expires_at : null,
        claimed_at: r ? r.claimed_at : null,
        doubled: r ? r.doubled : null,
        voided: r ? r.voided : null,
      });
    }
    out.sort((a, b) => b.ends_at - a.ends_at);
    return Promise.resolve(out.slice(0, limit));
  }
}

export interface SampleServerDeps {
  readonly now?: () => number;
  readonly storage?: KV | null;
  readonly rng?: Rng;
  readonly config?: ServerConfig;
  readonly content?: ContentLookup;
  /** Simulated network time per answer (ms); 0 in tests. */
  readonly latencyMs?: number;
  /** The state to start from when there is no storage (a blocked localStorage): the page's queued operation. */
  readonly initial?: SampleState | null;
}

export interface SampleAnswer {
  readonly status: number;
  readonly body: unknown;
}

export interface SampleServer {
  /** One API call (method, path with query, parsed JSON body or undefined, the Authorization header). Never rejects. */
  handle(method: string, path: string, body: unknown, auth: string | null): Promise<SampleAnswer>;
  /** A fetch for the sample origin's URLs (preview/platform.ts routes them here). */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /** The state (tests; preview/platform.ts reads nothing else). */
  state(): SampleState;
}

/**
 * The server config of the preview: the deployed defaults, the anonymous web pool on (it is a web page), and computer
 * rivals on (2026-10-12, D-2e-24, design §11: the preview link shows a full ranking; the rules carry the disclosure).
 */
export function previewConfig(): ServerConfig {
  return { ...DEFAULT_CONFIG, web: { ...DEFAULT_CONFIG.web, mode: 'anon' }, rivals: { ...DEFAULT_CONFIG.rivals, enabled: true } };
}

function defaultRng(): Rng {
  return typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function' ? cryptoRng : seededRng(Date.now() & 0x7fffffff);
}

class Fail {
  constructor(
    readonly code: ErrorCode,
    readonly message: string,
    readonly retryAfterMs?: number,
  ) {}
}

export function createSampleServer(deps: SampleServerDeps = {}): SampleServer {
  const cfg = deps.config ?? previewConfig();
  const clock = deps.now ?? (() => Date.now());
  const storage = deps.storage ?? null;
  const rng = deps.rng ?? defaultRng();
  let content: ContentLookup | null = deps.content ?? null;
  const lookup = (): ContentLookup => (content ??= createLookup(SOLUTIONS));
  let st = storage ? loadState(storage) : (deps.initial ?? loadState(null));
  let lastRaw = readRaw(storage);
  const tokens = new Map<string, { key: string; exp: number }>();
  const store = new MemStore(() => st);
  // The server's views read cfg, store and metrics only (bracketView, finalizeIfDue, resultsFor; tests/unit/preview).
  const services = { cfg, store, metrics: { count: () => undefined } } as unknown as Services;
  const words = NICK_WORDS_V1;
  const retired = RETIRED_V1;
  // D-2e-24: new brackets get computer rivals as services.ts rivalsForPool decides for a real pool (inlined: the
  // preview does not bundle services.ts).
  const rivalsOn = cfg.rivals.enabled && !cfg.rivals.hide && cfg.rivals.pools.includes(POOL);
  const persist = (): void => {
    lastRaw = saveState(storage, st);
  };
  /** Another tab of the preview changed the stored state since we last wrote it: read it again (memory stays as is). */
  const refresh = (): void => {
    const raw = readRaw(storage);
    if (raw !== null && raw !== lastRaw) {
      st = loadState(storage);
      lastRaw = raw;
    }
  };

  const ok = (body: unknown, status = 200): SampleAnswer => ({ status, body });
  const fail = (code: ErrorCode, message: string, retryAfterMs?: number): never => {
    throw new Fail(code, message, retryAfterMs);
  };
  const int = (lo: number, hi: number): number => {
    const b = rng.bytes(2);
    return lo + ((((b[0] as number) << 8) | (b[1] as number)) % (hi - lo + 1));
  };

  // ── players, brackets, places among the computer players ──

  function newName(seedBytes: Uint8Array, taken: ReadonlySet<string>): { nickname: string; nick: { adj: number; noun: number; num: number }; avatar: number } {
    for (let i = 0; i < 8; i++) {
      const g = generateNick(i === 0 ? seedBytes : rng.bytes(7), words, retired);
      const nickname = renderNick(words, g.nick);
      if (!taken.has(nickname)) return { nickname, nick: g.nick, avatar: g.avatarId };
    }
    const g = generateNick(rng.bytes(7), words, retired);
    return { nickname: renderNick(words, g.nick), nick: g.nick, avatar: g.avatarId };
  }

  function createPlayer(key: string, secret: string, clientVersion: string, now: number): MPlayer {
    const name = newName(rng.bytes(7), new Set());
    const p: MPlayer = {
      key,
      code: newPlayerCode(rng),
      pool: POOL,
      trust: 'anon',
      secret_hash: null,
      secret,
      nickname: name.nickname,
      nick_adj: name.nick.adj,
      nick_noun: name.nick.noun,
      nick_num: name.nick.num,
      avatar: name.avatar,
      status: 'ok',
      listed: 1,
      created_at: now,
      seen_at: now,
      nick_changed_at: null,
      max_level: 0,
      budget_ms: cfg.antiCheat.budget.initialMs,
      budget_at: now,
      cur_bracket: null,
      cur_ends_at: null,
      flag_count: 0,
      client_version: clientVersion,
      wtok: randomBase36(rng, 10),
    };
    st.players[key] = p;
    return p;
  }

  /**
   * A bracket opened at `openedAt`, with no member yet. 2026-10-12 (D-2e-24): tagged with computer rivals while the
   * config gives the web pool rivals (services.ts rivalsForPool for a real pool), like the real create.
   */
  function createBracket(openedAt: number): MBracket {
    const t = bracketTimes(cfg.bracket.periodMode, openedAt, cfg);
    const id = newBracketId(openedAt, rng);
    const b: MBracket = {
      id,
      pool: POOL,
      mode: cfg.bracket.periodMode,
      opened_at: t.openedAt,
      join_until: t.joinUntil,
      ends_at: t.endsAt,
      members: 0,
      next_slot: 0,
      max_members: cfg.bracket.maxMembers,
      finalized_at: null,
      final_members: null,
      rivals: rivalsOn ? newRivalsTag(cfg.rivals.strength, rng, words) : null,
      final_rivals: null,
      final_real: null,
      deleted_joins: null,
    };
    st.brackets[id] = b;
    st.members[id] = [];
    return b;
  }

  /**
   * Sets my fish (and when I last scored, never after `at`) so I hold `rank` in `table()` (the bracket's table without
   * my row), with the fewest fish that do it (core/table.ts pointsForRank). When exact ties around the place make it
   * unreachable, a tagged bracket draws a new tag (up to PLACE_RETRIES; a demo operation, like the old sample fish);
   * after that (or untagged: an old saved state's sample members) I get the fish of the row at that place.
   */
  function place(b: MBracket, me: MMember, rank: number, table: () => readonly TableRow[], at: number): void {
    for (let i = 0; ; i++) {
      const others = table().filter((r) => r.slot !== me.slot);
      const r = pointsForRank(others, rank, at, me.slot);
      if (r) {
        me.points = r.points;
        me.scored_at = r.scoredAt;
        return;
      }
      if (b.rivals === null || i >= PLACE_RETRIES) {
        me.points = Math.max(1, [...others].sort((x, y) => y.points - x.points)[rank - 1]?.points ?? 1);
        me.scored_at = at;
        return;
      }
      b.rivals = newRivalsTag(cfg.rivals.strength, rng, words);
    }
  }

  function addMember(b: MBracket, m: { key: string; nickname: string; avatar: number; points: number; wins: number; hearts: number; scoredAt: number; joinedAt: number }): MMember {
    const row: MMember = {
      bracket_id: b.id,
      slot: b.next_slot,
      player_key: m.key,
      nickname: m.nickname,
      avatar: m.avatar,
      points: m.points,
      wins: m.wins,
      hearts: m.hearts,
      hearts_seen: 0,
      hearts_self: 0,
      scored_at: m.scoredAt,
      joined_at: m.joinedAt,
      hidden: 0,
      final_rank: null,
    };
    (st.members[b.id] ??= []).push(row);
    b.next_slot++;
    b.members++;
    return row;
  }

  function join(p: MPlayer, b: MBracket, points: number, wins: number, now: number): MMember {
    const m = addMember(b, { key: p.key, nickname: p.nickname, avatar: p.avatar, points, wins, hearts: 0, scoredAt: now, joinedAt: now });
    if (p.listed === 0) m.hidden = 2;
    p.cur_bracket = b.id;
    p.cur_ends_at = b.ends_at;
    return m;
  }

  const memberOf = (bracketId: string, key: string): MMember | null => (st.members[bracketId] ?? []).find((m) => m.player_key === key) ?? null;
  const running = (p: MPlayer, now: number): MBracket | null => {
    const b = p.cur_bracket === null ? null : st.brackets[p.cur_bracket];
    return b && b.ends_at > now && memberOf(b.id, p.key) ? b : null;
  };

  /**
   * The returning player's record: level 36 done, today's bracket opened 5 h ago, joined 20 min after it opened, 5th
   * among the computer players now (last scored 50 min ago). No hearts: computer players never give any (H-9).
   */
  function seedReturning(p: MPlayer, now: number): void {
    p.max_level = RETURNING_DAY.maxLevel;
    p.created_at = now - 20 * DAY;
    const b = createBracket(now - RETURNING_DAY.openedAgoMs);
    const at = now - 50 * MIN;
    const me = join(p, b, 0, 0, at);
    me.joined_at = b.opened_at + 20 * MIN;
    place(b, me, RETURNING_DAY.rank, () => liveTable(b, st.members[b.id] ?? [], now, cfg.rivals.hide), at);
    me.wins = Math.max(1, Math.ceil(me.points / 3));
  }

  /**
   * "End ranking day": the player's running bracket (or a new one) ends now. 2026-10-12 (D-2e-24, design §11): it is
   * stretched to a full day so far (opened at least 6 h ago, the join window from there) and the player's fish are set
   * so they finish 2nd among the computer players at the end (moving the times reshapes the table at that moment, as
   * the old code rearranged its sample fish: a demo operation); then the real finalisation ranks it, freezes the
   * computer players and pays the places (server/src/handlers/views.ts finalizeIfDue).
   */
  async function endDay(p: MPlayer, now: number): Promise<void> {
    let b = running(p, now);
    if (!b) {
      b = createBracket(now - 6 * HOUR);
      join(p, b, 0, 0, now - 30 * MIN);
    }
    // An unlisted player's row is hidden, so the real finalisation ranks them nowhere (no card): the real rule.
    const me = memberOf(b.id, p.key) as MMember;
    const bracket = b;
    b.opened_at = Math.min(b.opened_at, now - 6 * HOUR);
    b.ends_at = now - cfg.bracket.finalizeGraceMs - 1000;
    b.join_until = Math.min(b.opened_at + cfg.bracket.joinWindowMs, b.ends_at);
    me.joined_at = Math.max(Math.min(me.joined_at, b.join_until - MIN), b.opened_at); // a join happens inside the window
    place(b, me, END_DAY_RANK, () => freezeTable(bracket, st.members[bracket.id] ?? [], cfg.rivals.hide), b.ends_at - MIN);
    me.wins = Math.max(me.wins, Math.ceil(me.points / 3));
    p.cur_ends_at = b.ends_at;
    await finalizeIfDue(services, b.id, now);
  }

  // ── auth ──

  function authed(auth: string | null, now: number): MPlayer {
    const m = /^Bearer (\S+)$/.exec(auth ?? '');
    const t = m ? tokens.get(m[1] as string) : undefined;
    if (!t) return fail('token_invalid', 'unknown token');
    if (t.exp <= now) return fail('token_expired', 'token expired');
    const p = st.players[t.key];
    if (!p) return fail('token_invalid', 'no such player');
    if (p.status === 'suspended') return fail('suspended', 'ranking paused for this player');
    return p;
  }

  // ── the routes (server/src/handlers/*, restated over the state) ──

  async function postSession(body: unknown, now: number): Promise<SampleAnswer> {
    const v = validateSessionRequest(body, { devPools: false });
    if (!v.ok) return fail('bad_request', v.path);
    if (v.value.platform !== 'web') return fail('bad_signature', 'the preview signs in web devices only');
    const key = `${POOL}:${v.value.device.id}`;
    let p = st.players[key];
    if (p) {
      if (p.secret !== v.value.device.secret) return fail('bad_signature', 'device credential does not match');
      p.seen_at = now;
    } else {
      p = createPlayer(key, v.value.device.secret, v.value.clientVersion, now);
      if (st.pending.returning) seedReturning(p, now);
    }
    st.pending.returning = false;
    if (st.pending.endDay) {
      st.pending.endDay = false;
      await endDay(p, now);
    }
    if (p.cur_bracket !== null && (p.cur_ends_at ?? 0) <= now) await finalizeIfDue(services, p.cur_bracket, now);
    const results = await resultsFor(services, p.key, now);
    const view = await bracketView(services, p, now);
    const token = `pv1.${randomBase36(rng, 32)}`;
    const expiresAt = now + cfg.session.ttlMs;
    tokens.set(token, { key: p.key, exp: expiresAt });
    const res: SessionResponse = {
      token,
      expiresAt,
      player: playerView(p, cfg, now),
      rules: rulesView(cfg),
      results,
      bracket: summaryOf(view),
      limits: { maxWinsPerRequest: cfg.api.maxWinsPerRequest, queueMax: cfg.api.queueMax },
      serverTime: now,
    };
    return ok(res);
  }

  async function postWins(p: MPlayer, body: unknown, now: number): Promise<SampleAnswer> {
    if (body && typeof body === 'object' && Array.isArray((body as { wins?: unknown }).wins)) {
      const n = (body as { wins: unknown[] }).wins.length;
      if (n > Math.min(MAX_WINS_PER_REQUEST, cfg.api.maxWinsPerRequest)) return fail('too_large', `${n} wins: at most ${MAX_WINS_PER_REQUEST} per request`);
    }
    const v = validateWinsRequest(body);
    if (!v.ok) return fail('bad_request', v.path);
    const wins = v.value.wins;
    let current = running(p, now);
    if (p.cur_bracket !== null && !current) await finalizeIfDue(services, p.cur_bracket, now);
    const member = current ? memberOf(current.id, p.key) : null;
    const ids = new Set(wins.map((w) => w.winId));
    const puzzles = new Set(wins.map((w) => w.puzzleId));
    const stored = st.wins.filter((w) => w.player_key === p.key && (ids.has(w.win_id) || puzzles.has(w.puzzle_id)));
    const ev = evaluateWins({
      player: { listed: p.listed === 1, maxLevel: p.max_level, budgetMs: p.budget_ms, budgetAt: p.budget_at },
      wins,
      stored: stored.map((r) => ({ puzzleId: r.puzzle_id, winId: r.win_id, points: r.points })),
      memberWins: member?.wins ?? 0,
      now,
      cfg,
      content: lookup(),
    });
    p.max_level = ev.player.maxLevel;
    p.budget_ms = ev.player.budgetMs;
    p.budget_at = ev.player.budgetAt;
    const toWrite = ev.decisions.filter((d) => d.write);
    if (toWrite.length > 0) {
      // My running bracket, else a new one (in the preview the pool's open brackets are this page's own), opened a
      // little before, so its computer players have started (D-2e-24: the opening group and the first arrivals).
      current ??= createBracket(now - int(10, 80) * MIN);
      const m = memberOf(current.id, p.key) ?? join(p, current, 0, 0, now);
      for (const d of toWrite) {
        m.points += d.points;
        m.wins += 1;
        m.scored_at = now;
        st.wins.push({ player_key: p.key, puzzle_id: d.win.puzzleId, win_id: d.win.winId, points: d.points, at: now });
      }
      if (st.wins.length > WINS_KEPT) st.wins.splice(0, st.wins.length - WINS_KEPT);
      p.cur_bracket = current.id;
      p.cur_ends_at = current.ends_at;
    }
    const results: WinResult[] = ev.decisions.map((d) => {
      const r = { winId: d.win.winId, verdict: d.verdict, points: d.verdict === 'rejected' || d.verdict === 'already_counted' ? 0 : d.points };
      return d.reason === undefined ? r : { ...r, reason: d.reason };
    });
    const view = await bracketView(services, p, now);
    const res: WinsResponse = {
      results,
      windowPoints: view.state === 'open' ? (view.me?.points ?? 0) : 0,
      bracket: view.state === 'none' ? null : view,
      serverTime: now,
    };
    return ok(res);
  }

  function postClaim(p: MPlayer, body: unknown, now: number): SampleAnswer {
    const v = validateClaimRequest(body);
    if (!v.ok) return fail('bad_request', v.path);
    const double = v.value.double && cfg.rewards.doubleByVideo;
    const r = st.rewards[v.value.rewardId];
    let fresh = false;
    if (r && r.player_key === p.key && r.claimed_at === null && r.voided === 0 && r.expires_at > now) {
      r.claimed_at = now;
      r.doubled = double ? 1 : 0;
      fresh = true;
    }
    const row = r && r.player_key === p.key ? r : null;
    if (row === null || row.claimed_at === null || row.voided === 1) return fail('not_found', 'no such reward');
    const doubled = row.doubled === 1;
    const res: ClaimResponse = {
      rewardId: row.id,
      grant: grantOf(row.hints, row.kitties, doubled),
      doubled,
      claimedAt: row.claimed_at,
      place: row.place,
      alreadyClaimed: !fresh,
      serverTime: now,
    };
    return ok(res);
  }

  function postHeart(p: MPlayer, body: unknown, now: number): SampleAnswer {
    const v = validateHeartRequest(body);
    if (!v.ok) return fail('bad_request', v.path);
    const { bracketId, slot } = v.value;
    if (!cfg.hearts.enabled) return fail('not_found', 'hearts are off');
    const b = st.brackets[bracketId];
    if (!b || b.ends_at + cfg.bracket.endedViewMs <= now) return fail('not_found', 'no such bracket');
    const me = memberOf(bracketId, p.key);
    if (!me) return fail('not_member', 'not a member of this bracket');
    if (slot === me.slot && !cfg.hearts.allowSelf) return fail('not_found', 'own row');
    const cap = cfg.hearts.maxGivenPerBracket;
    const mine = st.hearts.filter((h) => h.bracket_id === bracketId && h.from_slot === me.slot);
    if (isRivalSlot(slot)) {
      // D-2e-24 (server/src/handlers/hearts.ts): a heart on a computer player is stored like any heart; the row shows
      // its built-in hearts plus the real ones given to it (the same count for every viewer).
      // 2026-10-12, r2: an r2 bracket's live rivals replay the real joins, so the target reads the member rows.
      const target = rivalHeartTarget(b, slot, now, cfg.rivals.hide, st.members[bracketId] ?? []);
      if (!target) return fail('not_found', 'no such row');
      if (mine.some((h) => h.to_slot === slot)) return fail('heart_exists', 'heart already given');
      if (mine.length >= cap) return fail('heart_limit', `at most ${cap} hearts per bracket`);
      st.hearts.push({ bracket_id: bracketId, from_slot: me.slot, to_slot: slot });
      const real = st.hearts.filter((h) => h.bracket_id === bracketId && h.to_slot === slot).length;
      const res: HeartResponse = { bracketId, slot, hearts: target.builtIn + real, likedByMe: true, givenInBracket: mine.length + 1, serverTime: now };
      return ok(res);
    }
    if (mine.some((h) => h.to_slot === slot)) return fail('heart_exists', 'heart already given');
    const target = (st.members[bracketId] ?? []).find((m) => m.slot === slot && m.hidden === 0);
    if (!target) return fail('not_found', 'no such row');
    if (mine.length >= cap) return fail('heart_limit', `at most ${cap} hearts per bracket`);
    st.hearts.push({ bracket_id: bracketId, from_slot: me.slot, to_slot: slot });
    target.hearts += 1;
    if (slot === me.slot) target.hearts_self += 1;
    const res: HeartResponse = { bracketId, slot, hearts: target.hearts, likedByMe: true, givenInBracket: mine.length + 1, serverTime: now };
    return ok(res);
  }

  function putProfile(p: MPlayer, body: unknown, now: number): SampleAnswer {
    const v = validateProfileRequest(body);
    if (!v.ok) return fail('bad_request', v.path);
    const req = v.value;
    const open = (m: MMember): boolean => st.brackets[m.bracket_id]?.finalized_at === null;
    const myRows = (): MMember[] => Object.values(st.members).flatMap((ms) => ms.filter((m) => m.player_key === p.key && open(m)));
    if (req.nickname !== undefined) {
      if ('text' in req.nickname) return fail('nickname_invalid', 'names are picked from the word lists');
      const c = checkPick(req.nickname, p.nick_num ?? 1, words, retired);
      if (!c.ok) return fail(c.code, c.code === 'nickname_blocked' ? 'nickname blocked' : 'nickname');
      const text = renderNick(words, c.nick);
      const same = text === p.nickname && c.nick.adj === p.nick_adj && c.nick.noun === p.nick_noun && c.nick.num === p.nick_num;
      if (!same) {
        const cooldown = cfg.nickname.changeCooldownMs;
        if (p.nick_changed_at !== null && p.nick_changed_at + cooldown > now) return fail('nickname_cooldown', 'nickname changed recently', p.nick_changed_at + cooldown - now);
        p.nickname = text;
        p.nick_adj = c.nick.adj;
        p.nick_noun = c.nick.noun;
        p.nick_num = c.nick.num;
        p.nick_changed_at = now;
        for (const m of myRows()) m.nickname = text;
      }
    }
    if (req.avatarId !== undefined) {
      if (req.avatarId < 0 || req.avatarId >= AVATAR_COUNT) return fail('avatar_invalid', 'avatarId');
      p.avatar = req.avatarId;
      for (const m of myRows()) m.avatar = req.avatarId;
    }
    if (req.listed !== undefined) {
      p.listed = req.listed ? 1 : 0;
      for (const m of myRows()) m.hidden = req.listed ? (m.hidden >= 2 ? m.hidden - 2 : m.hidden) : m.hidden >= 2 ? m.hidden : m.hidden + 2;
    }
    const res: ProfileResponse = { player: playerView(p, cfg, now), serverTime: now };
    return ok(res);
  }

  function getMe(p: MPlayer, now: number): SampleAnswer {
    const since = now - cfg.retention.winsDays * DAY;
    const res: MeResponse = {
      player: playerView(p, cfg, now),
      data: {
        brackets: Object.values(st.members).filter((ms) => ms.some((m) => m.player_key === p.key)).length,
        wins30d: st.wins.filter((w) => w.player_key === p.key && w.at >= since).length,
        rewards: Object.values(st.rewards).filter((r) => r.player_key === p.key).length,
        createdAt: p.created_at,
      },
      serverTime: now,
    };
    return ok(res);
  }

  /** DELETE /v1/me (spec §1.11): every row of mine goes; finalised brackets keep their ranks and counts (an honest gap). */
  function deleteMe(p: MPlayer): SampleAnswer {
    for (const [id, ms] of Object.entries(st.members)) {
      const me = ms.find((m) => m.player_key === p.key);
      if (!me) continue;
      for (const h of st.hearts.filter((x) => x.bracket_id === id && x.from_slot === me.slot)) {
        const t = ms.find((m) => m.slot === h.to_slot);
        if (t && t !== me) t.hearts = Math.max(0, t.hearts - 1);
      }
      st.hearts = st.hearts.filter((h) => !(h.bracket_id === id && (h.from_slot === me.slot || h.to_slot === me.slot)));
      st.members[id] = ms.filter((m) => m !== me);
      const b = st.brackets[id];
      if (b) b.members = Math.max(0, b.members - 1);
      // 2026-10-12, r2 (server/src/store/sql-store.ts deletePlayer): an r2 bracket keeps the deleted join's time.
      if (b?.rivals?.startsWith('r2:')) b.deleted_joins = `${b.deleted_joins ? `${b.deleted_joins},` : ''}${me.slot}:${me.joined_at}`;
    }
    st.wins = st.wins.filter((w) => w.player_key !== p.key);
    for (const [id, r] of Object.entries(st.rewards)) if (r.player_key === p.key) delete st.rewards[id];
    delete st.players[p.key];
    for (const [t, v] of tokens) if (v.key === p.key) tokens.delete(t);
    return ok(null, 204);
  }

  async function route(method: string, path: string, body: unknown, auth: string | null): Promise<SampleAnswer> {
    const now = clock();
    const bare = path.split('?')[0]?.replace(/\/+$/, '') ?? '';
    const key = `${method.toUpperCase()} ${bare}`;
    switch (key) {
      case 'GET /v1/health': {
        const res: HealthResponse = { ok: true, version: 'preview', contentVersions: [...SOLUTIONS.contentVersions], db: 'ok', serverTime: now };
        return ok(res);
      }
      case 'GET /v1/config': {
        const res: ConfigResponse = { switches: { ...cfg.rcSwitches }, ttlSec: cfg.configTtlSec, serverTime: now };
        return ok(res);
      }
      case 'POST /v1/session/nonce': {
        const exp = now + cfg.nonce.ttlMs;
        return ok({ nonce: `n1.${exp.toString(36)}.${randomBase36(rng, 16)}.${randomBase36(rng, 16)}`, expiresAt: exp, serverTime: now });
      }
      case 'POST /v1/session':
        return postSession(body, now);
      case 'POST /v1/wins':
        return postWins(authed(auth, now), body, now);
      case 'GET /v1/bracket':
        return ok(await bracketView(services, authed(auth, now), now));
      case 'POST /v1/rewards/claim':
        return postClaim(authed(auth, now), body, now);
      case 'POST /v1/hearts':
        return postHeart(authed(auth, now), body, now);
      case 'PUT /v1/me/profile':
        return putProfile(authed(auth, now), body, now);
      case 'GET /v1/me':
        return getMe(authed(auth, now), now);
      case 'DELETE /v1/me':
        return deleteMe(authed(auth, now));
      default:
        return fail('not_found', 'no route');
    }
  }

  const server: SampleServer = {
    async handle(method, path, body, auth) {
      refresh();
      let answer: SampleAnswer;
      try {
        answer = await route(method, path, body, auth);
      } catch (err) {
        const e = err instanceof Fail ? err : new Fail('unavailable', 'sample server error', 30_000);
        const error = e.retryAfterMs === undefined ? { code: e.code, message: e.message } : { code: e.code, message: e.message, retryAfterMs: e.retryAfterMs };
        answer = { status: ERROR_STATUS[e.code], body: { error, serverTime: clock() } };
      }
      persist();
      if ((deps.latencyMs ?? 0) > 0) await new Promise<void>((r) => setTimeout(r, deps.latencyMs));
      return answer;
    },
    async fetch(input, init) {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
      const headers = new Headers(init?.headers ?? undefined);
      let body: unknown;
      if (typeof init?.body === 'string' && init.body !== '') {
        try {
          body = JSON.parse(init.body) as unknown;
        } catch {
          body = null;
        }
      }
      if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      const a = await server.handle(method, url.pathname + url.search, body, headers.get('Authorization'));
      if (a.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'Content-Type': 'application/json' } });
    },
    state: () => st,
  };
  return server;
}

/** `noneView` re-exported for tests (the shape a player with no bracket gets). */
export { noneView };
