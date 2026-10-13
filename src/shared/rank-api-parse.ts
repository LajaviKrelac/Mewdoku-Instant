// Owner: G4 (Phase 2e; split out by the lead at I-2/I-4, requests-G1 R9 and G3 R18). The client's RESPONSE parsers of
// the ranking server's wire contract, API v1 (spec §1.4, CONTRACTS §2.2): the second half of ./rank-api.ts.
// Why a second module: the first load validates the saved queue (save.ladder.pending) with ./rank-api.ts'
// isWinSubmission and patterns, and a bundler keeps a module whole in one chunk, so the parsers (used only by the
// lazy ranking flow: ladder-client, ladder-flow) would otherwise ride in the main bundle (≈ 6.8 KB, spec §7.9).
// PURE, like ./rank-api.ts: imports nothing but ./rank-api.ts (the one edge inside the shared layer,
// tests/unit/layering.spec.ts), no DOM / Worker / Node global, no clock, no randomness, no I/O. The server
// re-exports it with the contract (server/src/contract/index.ts) and compiles it too.
//
// Fields are ADDITIVE inside v1: parsers ignore unknown fields (and drop them from the value they return);
// a breaking change is /v2. Honesty (spec §0.4 H-1…H-3): a parser never invents, repairs, trims or
// re-ranks a row. An invalid row is DROPPED; a view whose structure is wrong is rejected whole (null).
import {
  BRACKET_ID_RE,
  CONTENT_VERSION_RE,
  ERROR_CODES,
  isBool,
  isDisplayText,
  isInt,
  isMs,
  isMsOrNull,
  isObj,
  isStr,
  matches,
  MAX_TOKEN_LENGTH,
  NICKNAME_MAX_LENGTH,
  NONCE_RE,
  oneOf,
  PERIOD_MODES,
  PLAYER_CODE_RE,
  POOLS,
  REMOTE_SWITCHES,
  REWARD_ID_RE,
  SCORED_MODES,
  TRUSTS,
  WIN_ID_RE,
  WIN_REASONS,
  WIN_VERDICTS,
  type ApiError,
  type BracketRow,
  type BracketSummary,
  type BracketView,
  type ClaimResponse,
  type ClaimView,
  type ConfigResponse,
  type Grant,
  type HealthResponse,
  type HeartResponse,
  type MeResponse,
  type NonceResponse,
  type PlayerView,
  type PresenceResponse,
  type ProfileResponse,
  type RemoteSwitch,
  type ResultView,
  type RewardView,
  type RulesView,
  type ScoredModeWire,
  type SessionResponse,
  type WinResult,
  type WinsResponse,
} from './rank-api';

// ───────────────────────────────────────────────────────────────────────────── responses (client side)

export function parseNonceResponse(x: unknown): NonceResponse | null {
  if (!isObj(x) || !matches(x.nonce, NONCE_RE) || !isMs(x.expiresAt) || !isMs(x.serverTime)) return null;
  return { nonce: x.nonce, expiresAt: x.expiresAt, serverTime: x.serverTime };
}

function parseNick(x: unknown): PlayerView['nick'] | undefined {
  if (x === null) return null;
  if (!isObj(x) || !isInt(x.adj, 0, 9999) || !isInt(x.noun, 0, 9999) || !isInt(x.num, 0, 9999)) return undefined;
  return { adj: x.adj, noun: x.noun, num: x.num };
}

function parsePlayer(x: unknown): PlayerView | null {
  if (!isObj(x)) return null;
  const nick = parseNick(x.nick);
  if (
    !matches(x.code, PLAYER_CODE_RE) ||
    !isDisplayText(x.nickname, NICKNAME_MAX_LENGTH) ||
    nick === undefined ||
    !isInt(x.avatarId, 0, 9999) ||
    !oneOf(x.status, ['ok', 'suspended'] as const) ||
    !oneOf(x.pool, POOLS) ||
    !oneOf(x.trust, TRUSTS) ||
    !isBool(x.listed) ||
    !isMsOrNull(x.nicknameChangeAt)
  ) {
    return null;
  }
  return {
    code: x.code,
    nickname: x.nickname,
    nick,
    avatarId: x.avatarId,
    status: x.status,
    pool: x.pool,
    trust: x.trust,
    listed: x.listed,
    nicknameChangeAt: x.nicknameChangeAt,
  };
}

function parseGrant(x: unknown): Grant | null {
  if (!isObj(x) || !isInt(x.hints, 0, 999) || !isInt(x.kitties, 0, 999)) return null;
  return { hints: x.hints, kitties: x.kitties };
}

function parseRules(x: unknown): RulesView | null {
  if (!isObj(x)) return null;
  const h = x.hearts;
  const n = x.nickname;
  if (
    !oneOf(x.periodMode, PERIOD_MODES) ||
    !isInt(x.durationMs, 1, Number.MAX_SAFE_INTEGER) ||
    !isInt(x.maxMembers, 1, 10_000) ||
    !Array.isArray(x.scoringModes) ||
    !Array.isArray(x.places) ||
    !isInt(x.minMembers, 0, 10_000) ||
    !isBool(x.doubleByVideo) ||
    !isMs(x.claimTtlMs) ||
    !isObj(h) ||
    !isBool(h.enabled) ||
    !isBool(h.allowSelf) ||
    !isInt(h.maxGivenPerBracket, 0, 10_000) ||
    !isObj(n) ||
    !isBool(n.freeText) ||
    !isMs(n.changeCooldownMs)
  ) {
    return null;
  }
  // A mode this client does not know is ignored (additive); a malformed place makes the rules unusable.
  const scoringModes = (x.scoringModes as unknown[]).filter((m): m is ScoredModeWire => oneOf(m, SCORED_MODES));
  const places: { place: 1 | 2 | 3; hints: number; kitties: number }[] = [];
  for (const p of x.places as unknown[]) {
    const g = parseGrant(p);
    if (!isObj(p) || g === null || !(p.place === 1 || p.place === 2 || p.place === 3)) return null;
    if (places.length > 0 && (places[places.length - 1] as { place: number }).place >= p.place) return null;
    places.push({ place: p.place, hints: g.hints, kitties: g.kitties });
  }
  return {
    periodMode: x.periodMode,
    durationMs: x.durationMs,
    maxMembers: x.maxMembers,
    scoringModes,
    places,
    minMembers: x.minMembers,
    doubleByVideo: x.doubleByVideo,
    claimTtlMs: x.claimTtlMs,
    hearts: { enabled: h.enabled, allowSelf: h.allowSelf, maxGivenPerBracket: h.maxGivenPerBracket },
    nickname: { freeText: n.freeText, changeCooldownMs: n.changeCooldownMs },
    // D-2e-24: kept only as `true`; any other value is dropped silently (the rules are never rejected over it).
    ...(x.computerPlayers === true ? { computerPlayers: true } : {}),
  };
}

function parseClaimView(x: unknown): ClaimView | null {
  if (!isObj(x) || !matches(x.rewardId, REWARD_ID_RE) || !isBool(x.doubled) || !isMs(x.claimedAt)) return null;
  const grant = parseGrant(x.grant);
  if (grant === null) return null;
  return { rewardId: x.rewardId, grant, doubled: x.doubled, claimedAt: x.claimedAt };
}

function parseReward(x: unknown): RewardView | null {
  if (!isObj(x) || !matches(x.rewardId, REWARD_ID_RE) || !(x.place === 1 || x.place === 2 || x.place === 3)) return null;
  if (!isBool(x.canDouble) || !isMs(x.expiresAt)) return null;
  const grant = parseGrant(x.grant);
  const claim = x.claim === null ? null : parseClaimView(x.claim);
  if (grant === null || (x.claim !== null && claim === null)) return null;
  if (claim !== null && claim.rewardId !== x.rewardId) return null;
  return { rewardId: x.rewardId, place: x.place, grant, canDouble: x.canDouble, expiresAt: x.expiresAt, claim };
}

function parseResult(x: unknown): ResultView | null {
  if (!isObj(x) || !matches(x.bracketId, BRACKET_ID_RE) || !isMs(x.endedAt)) return null;
  if (!isInt(x.members, 1, 10_000) || !isInt(x.place, 1, x.members) || !isInt(x.points, 0, Number.MAX_SAFE_INTEGER)) return null;
  const reward = x.reward === null ? null : parseReward(x.reward);
  if (x.reward !== null && reward === null) return null;
  if (reward !== null && reward.rewardId.slice(0, reward.rewardId.indexOf(':')) !== x.bracketId) return null;
  return { bracketId: x.bracketId, endedAt: x.endedAt, place: x.place, members: x.members, points: x.points, reward };
}

function parseRow(x: unknown): BracketRow | null {
  if (!isObj(x)) return null;
  if (
    !isInt(x.rank, 1, 10_000) ||
    !isInt(x.slot, 0, 9999) ||
    !isDisplayText(x.nickname, NICKNAME_MAX_LENGTH) ||
    !isInt(x.avatarId, 0, 9999) ||
    !isInt(x.points, 0, Number.MAX_SAFE_INTEGER) ||
    !isInt(x.hearts, 0, Number.MAX_SAFE_INTEGER) ||
    !isBool(x.me) ||
    !isBool(x.likedByMe)
  ) {
    return null;
  }
  return {
    rank: x.rank,
    slot: x.slot,
    nickname: x.nickname,
    avatarId: x.avatarId,
    points: x.points,
    hearts: x.hearts,
    me: x.me,
    likedByMe: x.likedByMe,
    // Leaderboard update (additive): a server without the fields, or with a bad one, gives "no status" (never a
    // made-up one); the row itself stays.
    seenAt: isMs(x.seenAt) ? x.seenAt : null,
    playing: isMs(x.seenAt) && x.playing === true,
  };
}

/**
 * A bracket view (spec §2.4, CONTRACTS §2.2, critic C-34). Rows that fail their own check are DROPPED
 * (never repaired); `members` stays the server's number even when it then differs from `rows.length`
 * (the client logs `invalid_response`). Rejected whole (null): a malformed header, more raw rows than
 * `maxMembers`, duplicate slots or ranks, a rank outside 1…members, a `me` that is not a valid row.
 */
export function parseBracketView(x: unknown): BracketView | null {
  if (!isObj(x)) return null;
  if (!oneOf(x.state, ['open', 'ended', 'none'] as const)) return null;
  if (!(x.bracketId === null || matches(x.bracketId, BRACKET_ID_RE))) return null;
  if (!oneOf(x.pool, POOLS) || !oneOf(x.mode, PERIOD_MODES)) return null;
  if (!isMsOrNull(x.openedAt) || !isMsOrNull(x.endsAt)) return null;
  if (!isInt(x.maxMembers, 1, 10_000) || !isInt(x.members, 0, x.maxMembers)) return null;
  if (!isBool(x.final) || !isInt(x.heartsNew, 0, Number.MAX_SAFE_INTEGER) || !isMs(x.serverTime)) return null;
  if (!Array.isArray(x.rows) || x.rows.length > x.maxMembers) return null;
  if ((x.state === 'none') !== (x.bracketId === null)) return null;
  const members = x.members;
  const rows: BracketRow[] = [];
  const slots: Record<number, true> = {};
  const ranks: Record<number, true> = {};
  for (const raw of x.rows as unknown[]) {
    const row = parseRow(raw);
    if (row === null) continue;
    if (row.rank > members || slots[row.slot] || ranks[row.rank]) return null;
    slots[row.slot] = true;
    ranks[row.rank] = true;
    rows.push(row);
  }
  let me: BracketRow | null = null;
  if (x.me !== null) {
    me = parseRow(x.me);
    if (me === null || !me.me || me.rank > members) return null;
  }
  let result: ResultView | null = null;
  if (x.result !== null) {
    result = parseResult(x.result);
    if (result === null) return null;
  }
  return {
    state: x.state,
    bracketId: x.bracketId,
    pool: x.pool,
    mode: x.mode,
    openedAt: x.openedAt,
    endsAt: x.endsAt,
    members,
    maxMembers: x.maxMembers,
    rows,
    me,
    final: x.final,
    heartsNew: x.heartsNew,
    result,
    serverTime: x.serverTime,
  };
}

function parseSummary(x: unknown): BracketSummary | null {
  if (!isObj(x) || !oneOf(x.state, ['open', 'ended', 'none'] as const)) return null;
  if (!(x.bracketId === null || matches(x.bracketId, BRACKET_ID_RE))) return null;
  if (!(x.rank === null || isInt(x.rank, 1, 10_000)) || !isInt(x.members, 0, 10_000)) return null;
  if (!isInt(x.points, 0, Number.MAX_SAFE_INTEGER) || !isMsOrNull(x.endsAt)) return null;
  return { state: x.state, bracketId: x.bracketId, rank: x.rank, members: x.members, points: x.points, endsAt: x.endsAt };
}

/** Results that fail their check are dropped (a card is never invented); the rest keep the server's order. */
export function parseSessionResponse(x: unknown): SessionResponse | null {
  if (!isObj(x) || !isStr(x.token, 1, MAX_TOKEN_LENGTH) || !isMs(x.expiresAt) || !isMs(x.serverTime)) return null;
  const player = parsePlayer(x.player);
  const rules = parseRules(x.rules);
  if (player === null || rules === null || !Array.isArray(x.results)) return null;
  const bracket = x.bracket === null ? null : parseSummary(x.bracket);
  if (x.bracket !== null && bracket === null) return null;
  const l = x.limits;
  if (!isObj(l) || !isInt(l.maxWinsPerRequest, 1, 1000) || !isInt(l.queueMax, 0, 10_000)) return null;
  const results: ResultView[] = [];
  for (const r of x.results as unknown[]) {
    const v = parseResult(r);
    if (v !== null) results.push(v);
  }
  return {
    token: x.token,
    expiresAt: x.expiresAt,
    player,
    rules,
    results,
    bracket,
    limits: { maxWinsPerRequest: l.maxWinsPerRequest, queueMax: l.queueMax },
    serverTime: x.serverTime,
  };
}

/** A result with an unknown verdict is dropped (that win stays queued); an unknown reason is dropped from its result. */
export function parseWinsResponse(x: unknown): WinsResponse | null {
  if (!isObj(x) || !Array.isArray(x.results) || !isInt(x.windowPoints, 0, Number.MAX_SAFE_INTEGER) || !isMs(x.serverTime)) return null;
  const bracket = x.bracket === null ? null : parseBracketView(x.bracket);
  if (x.bracket !== null && bracket === null) return null;
  const results: WinResult[] = [];
  for (const r of x.results as unknown[]) {
    if (!isObj(r) || !matches(r.winId, WIN_ID_RE) || !oneOf(r.verdict, WIN_VERDICTS) || !isInt(r.points, 0, 1000)) continue;
    const base = { winId: r.winId, verdict: r.verdict, points: r.points };
    results.push(oneOf(r.reason, WIN_REASONS) ? { ...base, reason: r.reason } : base);
  }
  return { results, windowPoints: x.windowPoints, bracket, serverTime: x.serverTime };
}

export function parseClaimResponse(x: unknown): ClaimResponse | null {
  if (!isObj(x)) return null;
  const view = parseClaimView(x);
  if (view === null || !isInt(x.place, 1, 10_000) || !isBool(x.alreadyClaimed) || !isMs(x.serverTime)) return null;
  return { ...view, place: x.place, alreadyClaimed: x.alreadyClaimed, serverTime: x.serverTime };
}

export function parseHeartResponse(x: unknown): HeartResponse | null {
  if (!isObj(x) || !matches(x.bracketId, BRACKET_ID_RE) || !isInt(x.slot, 0, 9999)) return null;
  if (!isInt(x.hearts, 0, Number.MAX_SAFE_INTEGER) || x.likedByMe !== true || !isInt(x.givenInBracket, 0, 10_000)) return null;
  if (!isMs(x.serverTime)) return null;
  return { bracketId: x.bracketId, slot: x.slot, hearts: x.hearts, likedByMe: true, givenInBracket: x.givenInBracket, serverTime: x.serverTime };
}

/** POST /v1/presence (leaderboard update). */
export function parsePresenceResponse(x: unknown): PresenceResponse | null {
  if (!isObj(x) || !isBool(x.updated) || !isMs(x.serverTime)) return null;
  return { updated: x.updated, serverTime: x.serverTime };
}

export function parseProfileResponse(x: unknown): ProfileResponse | null {
  if (!isObj(x) || !isMs(x.serverTime)) return null;
  const player = parsePlayer(x.player);
  return player === null ? null : { player, serverTime: x.serverTime };
}

export function parseMeResponse(x: unknown): MeResponse | null {
  if (!isObj(x) || !isMs(x.serverTime)) return null;
  const player = parsePlayer(x.player);
  const d = x.data;
  if (player === null || !isObj(d)) return null;
  const n = (v: unknown): v is number => isInt(v, 0, Number.MAX_SAFE_INTEGER);
  if (!n(d.brackets) || !n(d.wins30d) || !n(d.rewards) || !isMs(d.createdAt)) return null;
  return { player, data: { brackets: d.brackets, wins30d: d.wins30d, rewards: d.rewards, createdAt: d.createdAt }, serverTime: x.serverTime };
}

/** Booleans of REMOTE_SWITCHES only; anything else in `switches` is ignored (spec §1.15, §7.4). */
export function parseConfigResponse(x: unknown): ConfigResponse | null {
  if (!isObj(x) || !isObj(x.switches) || !isInt(x.ttlSec, 0, 604_800) || !isMs(x.serverTime)) return null;
  const switches: Partial<Record<RemoteSwitch, boolean>> = {};
  for (const name of REMOTE_SWITCHES) {
    const v = x.switches[name];
    if (isBool(v)) switches[name] = v;
  }
  return { switches, ttlSec: x.ttlSec, serverTime: x.serverTime };
}

export function parseHealthResponse(x: unknown): HealthResponse | null {
  if (!isObj(x) || !isBool(x.ok) || !isStr(x.version, 1, 64) || !Array.isArray(x.contentVersions)) return null;
  if (!oneOf(x.db, ['ok', 'down'] as const) || !isMs(x.serverTime)) return null;
  const contentVersions = (x.contentVersions as unknown[]).filter((v): v is string => matches(v, CONTENT_VERSION_RE));
  return { ok: x.ok, version: x.version, contentVersions, db: x.db, serverTime: x.serverTime };
}

/** An error body with a known code (an unknown code is null: the client treats it as a generic failure). */
export function parseApiError(x: unknown): ApiError | null {
  if (!isObj(x) || !isMs(x.serverTime)) return null;
  const e = x.error;
  if (!isObj(e) || !oneOf(e.code, ERROR_CODES) || !isStr(e.message, 0, 500)) return null;
  if (e.retryAfterMs !== undefined && !isInt(e.retryAfterMs, 0, Number.MAX_SAFE_INTEGER)) return null;
  const error = e.retryAfterMs === undefined ? { code: e.code, message: e.message } : { code: e.code, message: e.message, retryAfterMs: e.retryAfterMs as number };
  return { error, serverTime: x.serverTime };
}
