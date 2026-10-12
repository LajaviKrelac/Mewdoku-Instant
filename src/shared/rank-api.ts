// Owner: G4 (Phase 2e). The ranking server's wire contract, API v1 (spec §1.4, CONTRACTS §2).
// PURE leaf module: imports nothing, uses no DOM / Worker / Node global, no clock, no randomness, no I/O.
// Compiled into the client (its constants, patterns and isWinSubmission into the first load; the response parsers
// are ./rank-api-parse.ts, lazy) AND into the server Worker (no runtime coupling); it must
// type-check under the root tsconfig (ES2020 lib, exactOptionalPropertyTypes off) and the server's
// (ES2022, exactOptionalPropertyTypes on), so it uses only ES2020 built-ins and never assigns `undefined`
// to an optional member.
//
// Fields are ADDITIVE inside v1: parsers ignore unknown fields (and drop them from the value they return);
// a breaking change is /v2. Honesty (spec §0.4 H-1…H-3): a parser never invents, repairs, trims or
// re-ranks a row. An invalid row is DROPPED; a view whose structure is wrong is rejected whole (null).

// ───────────────────────────────────────────────────────────────────────────── constants

export const API_VERSION = 'v1';
export const MAX_WINS_PER_REQUEST = 10;
export const MAX_BODY_BYTES = 16_384;
/** Our avatars (G2 draws avatar-0 … avatar-{AVATAR_COUNT − 1}); append-only. [PROVISIONAL P-L13] */
export const AVATAR_COUNT = 12;
export const NICK_NUM_MIN = 1;
export const NICK_NUM_MAX = 99;
/** A rendered nickname's length bound (the save keeps `ladder.me.name` 1–40, spec §7.1). */
export const NICKNAME_MAX_LENGTH = 40;
/** getSignature() is rejected above this many characters before any decoding (spec §1.3 step 1). */
export const MAX_SIGNATURE_LENGTH = 4096;
export const MAX_TOKEN_LENGTH = 1024;
export const REMOTE_SWITCHES = ['iapIos', 'iapInPlay', 'banner', 'bannerInPlay', 'ladder'] as const;
export type RemoteSwitch = (typeof REMOTE_SWITCHES)[number];

export const WIN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const PUZZLE_ID_RE = /^(L[1-9]\d{0,5}|D\d{4}-\d{2}-\d{2}|E[a-z0-9-]{3,40}\/\d{1,3})$/;
export const CATS_RE = /^[0-9a-b]{4,12}$/;
export const PLAYER_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/; // Crockford base 32
/** Critic pass: every id that reaches SQL or a path has a pattern (spec §1.4). `<base-36 ms><8 random base-36>`. */
export const BRACKET_ID_RE = /^[0-9a-z]{8,24}$/;
export const REWARD_ID_RE = /^[0-9a-z]{8,24}:\d{1,3}$/; // "<bracketId>:<slot>"
export const DEV_POOL_RE = /^[a-z0-9-]{1,32}$/;
/** `clientVersion` (the client's package version, e.g. "0.2.0" or "0.0.0-test"). */
export const CLIENT_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/;
/** `contentVersion` (the content manifest's `version`, e.g. "content-bb8a756dfaf9"). */
export const CONTENT_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
/** The anonymous web credential (spec §1.3): 16 random bytes / 32 random bytes, base64url without padding. */
export const DEVICE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const DEVICE_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
/** The server's stateless nonce, `n1.<expiry base 36>.<random>.<mac>` (the server checks the MAC and expiry). */
export const NONCE_RE = /^n1\.[0-9a-z]{1,12}\.[A-Za-z0-9_-]{8,64}\.[A-Za-z0-9_-]{8,64}$/;
/** getPlayerID(): a printable id of 1–64 characters (the signed payload decides; spec §1.3 step 4). */
export const PLAYER_ID_RE = /^[\x21-\x7e]{1,64}$/;

export type Ms = number; // epoch ms, server clock unless named otherwise
export type Pool = 'fb' | 'web';
export type Trust = 'signed' | 'anon';
export type PeriodMode = 'rolling' | 'utc_day';
export type ScoredModeWire = 'level' | 'daily' | 'event';
export type PuzzleSourceWire = 'pack' | 'generated' | 'substitute';
export interface Grant {
  readonly hints: number;
  readonly kitties: number;
}

export const POOLS: readonly Pool[] = ['fb', 'web'];
export const TRUSTS: readonly Trust[] = ['signed', 'anon'];
export const PERIOD_MODES: readonly PeriodMode[] = ['rolling', 'utc_day'];
export const SCORED_MODES: readonly ScoredModeWire[] = ['level', 'daily', 'event'];
export const PUZZLE_SOURCES: readonly PuzzleSourceWire[] = ['pack', 'generated', 'substitute'];

export interface PlayerView {
  readonly code: string; // PLAYER_CODE_RE; shown as "7KQ2-M9XD" (formatPlayerCode)
  readonly nickname: string; // the rendered name, the same text for every viewer
  readonly nick: { readonly adj: number; readonly noun: number; readonly num: number } | null; // null: free text
  readonly avatarId: number; // 0 … AVATAR_COUNT − 1
  readonly status: 'ok' | 'suspended';
  readonly pool: Pool;
  readonly trust: Trust;
  readonly listed: boolean; // "Show me in rankings"
  readonly nicknameChangeAt: Ms | null; // the next allowed change; null = any time
}

/** The rules the server applies (spec §1.16); the client shows these, never its own copy. */
export interface RulesView {
  readonly periodMode: PeriodMode;
  readonly durationMs: number;
  readonly maxMembers: number;
  readonly scoringModes: readonly ScoredModeWire[];
  readonly places: readonly { readonly place: 1 | 2 | 3; readonly hints: number; readonly kitties: number }[];
  readonly minMembers: number;
  readonly doubleByVideo: boolean;
  readonly claimTtlMs: number;
  readonly hearts: { readonly enabled: boolean; readonly allowSelf: boolean; readonly maxGivenPerBracket: number };
  readonly nickname: { readonly freeText: boolean; readonly changeCooldownMs: number };
  /**
   * Present and true when this pool's rankings include computer players and the disclosure is on (2026-10-12,
   * D-2e-24, H-9: "Rankings include computer players."); never false on the wire (absent instead).
   */
  readonly computerPlayers?: boolean;
}

// ── session
export interface NonceResponse {
  readonly nonce: string;
  readonly expiresAt: Ms;
  readonly serverTime: Ms;
}
export interface SessionRequestFb {
  readonly platform: 'fb';
  readonly playerId: string; // getPlayerID() (a sanity check; the signed payload decides)
  readonly signature: string; // getSignature(): "<b64url sig>.<b64url payload>"
  readonly nonce: string;
  readonly clientVersion: string;
  readonly contentVersion: string;
  readonly devPool?: string; // DEV_POOL_RE; accepted only by a server with DEV_ROUTES=true
}
export interface SessionRequestWeb {
  readonly platform: 'web';
  readonly device: { readonly id: string; readonly secret: string }; // 22 / 43 base64url characters
  readonly clientVersion: string;
  readonly contentVersion: string;
  readonly devPool?: string;
}
export type SessionRequest = SessionRequestFb | SessionRequestWeb;
export interface SessionResponse {
  readonly token: string;
  readonly expiresAt: Ms;
  readonly player: PlayerView;
  readonly rules: RulesView;
  /** Finished brackets I was in, ended within rules.claimTtlMs, newest first, ≤ 10 (cards, claims, repair). */
  readonly results: readonly ResultView[];
  readonly bracket: BracketSummary | null;
  readonly limits: { readonly maxWinsPerRequest: number; readonly queueMax: number };
  readonly serverTime: Ms;
}

// ── wins
export interface WinSubmission {
  readonly winId: string; // WIN_ID_RE (UUID v4 made by the client; idempotency)
  readonly puzzleId: string; // PUZZLE_ID_RE; never the tutorial
  readonly source: PuzzleSourceWire; // level/daily/event packs → 'pack'
  readonly contentVersion: string; // the content manifest's `version`
  readonly cats: string; // CATS_RE, length n: the column of the cat in each row (base 36)
  readonly fish: number; // kept, 1 … fishMax (3, or the event's lives)
  readonly mistakes: number; // ≥ 0
  readonly revives: number; // 0 … 1
  readonly hints: number;
  readonly kitties: number;
  readonly mice: number;
  readonly solveMs: number; // GameState.elapsedMs at WON
  readonly playedAt: Ms; // DEVICE clock, informational only
  readonly clientVersion: string;
}
export interface WinsRequest {
  readonly wins: readonly WinSubmission[]; // 1 … MAX_WINS_PER_REQUEST, oldest first
}
export type WinVerdict = 'accepted' | 'accepted_flagged' | 'duplicate' | 'already_counted' | 'rejected';
export type WinReason =
  | 'not_scored'
  | 'unlisted'
  | 'bad_puzzle_id'
  | 'bad_solution'
  | 'bad_fish'
  | 'inconsistent'
  | 'too_fast'
  | 'stale_date'
  | 'event_closed'
  | 'level_jump'
  | 'budget'
  | 'window_cap'
  | 'suspended'
  | 'unverified'
  | 'soft_fast'; // 'unverified', 'soft_fast' and (critic pass) 'level_jump' come with accepted_flagged; the rest with rejected
export const WIN_VERDICTS: readonly WinVerdict[] = ['accepted', 'accepted_flagged', 'duplicate', 'already_counted', 'rejected'];
export const WIN_REASONS: readonly WinReason[] = [
  'not_scored',
  'unlisted',
  'bad_puzzle_id',
  'bad_solution',
  'bad_fish',
  'inconsistent',
  'too_fast',
  'stale_date',
  'event_closed',
  'level_jump',
  'budget',
  'window_cap',
  'suspended',
  'unverified',
  'soft_fast',
];
export interface WinResult {
  readonly winId: string;
  readonly verdict: WinVerdict;
  readonly reason?: WinReason;
  readonly points: number;
}
export interface WinsResponse {
  readonly results: readonly WinResult[]; // one per submitted win, same order
  readonly windowPoints: number; // my points in my current bracket after these wins
  readonly bracket: BracketView | null;
  readonly serverTime: Ms;
}

// ── brackets
export interface BracketRow {
  readonly rank: number; // 1 … members, positions (no shared ranks)
  readonly slot: number; // stable handle inside this bracket (hearts); never a player id; ≥ 9000: a computer player (never paid; D-2e-24)
  readonly nickname: string;
  readonly avatarId: number;
  readonly points: number; // fish kept, summed in this bracket
  readonly hearts: number;
  readonly me: boolean;
  readonly likedByMe: boolean;
}
export interface BracketView {
  readonly state: 'open' | 'ended' | 'none';
  readonly bracketId: string | null;
  readonly pool: Pool;
  readonly mode: PeriodMode;
  readonly openedAt: Ms | null;
  readonly endsAt: Ms | null;
  // Rows of this table: visible real members plus computer players (D-2e-24); === rows.length on an open answer;
  // final: every row ranked at finalisation (brackets.final_members), so a later deletion leaves a gap.
  readonly members: number;
  readonly maxMembers: number;
  readonly rows: readonly BracketRow[]; // every visible row (real members and computer players), best first (≤ maxMembers)
  readonly me: BracketRow | null; // also inside rows; null when not a member
  readonly final: boolean; // ended and finalised
  readonly heartsNew: number; // hearts received from OTHER players since my last bracket read
  readonly result: ResultView | null; // state 'ended' and I was a member
  readonly serverTime: Ms;
}
export interface BracketSummary {
  readonly state: BracketView['state'];
  readonly bracketId: string | null;
  readonly rank: number | null;
  readonly members: number;
  readonly points: number;
  readonly endsAt: Ms | null;
}

// ── results and rewards
export interface ClaimView {
  readonly rewardId: string;
  readonly grant: Grant;
  readonly doubled: boolean;
  readonly claimedAt: Ms;
}
export interface RewardView {
  readonly rewardId: string; // "<bracketId>:<slot>"
  readonly place: 1 | 2 | 3;
  readonly grant: Grant; // the base grant (× 2 when claimed doubled)
  readonly canDouble: boolean;
  readonly expiresAt: Ms;
  readonly claim: ClaimView | null;
}
export interface ResultView {
  readonly bracketId: string;
  readonly endedAt: Ms;
  readonly place: number; // my final rank
  readonly members: number; // every row ranked at finalisation, computer players included (brackets.final_members; a later deletion never changes it)
  readonly points: number;
  readonly reward: RewardView | null; // null: not a paid place (or too few members, see members vs rules.minMembers)
}
export interface ClaimRequest {
  readonly rewardId: string;
  readonly double: boolean;
}
export interface ClaimResponse extends ClaimView {
  readonly place: number;
  readonly alreadyClaimed: boolean;
  readonly serverTime: Ms;
}

// ── hearts, profile, me, config, health
export interface HeartRequest {
  readonly bracketId: string;
  readonly slot: number;
}
export interface HeartResponse {
  readonly bracketId: string;
  readonly slot: number;
  readonly hearts: number;
  readonly likedByMe: true;
  readonly givenInBracket: number;
  readonly serverTime: Ms;
}
export type NicknamePick = { readonly adj: number; readonly noun: number; readonly num?: number };
export type NicknameText = { readonly text: string };
export interface ProfileRequest {
  readonly nickname?: NicknamePick | NicknameText;
  readonly avatarId?: number;
  readonly listed?: boolean;
}
export interface ProfileResponse {
  readonly player: PlayerView;
  readonly serverTime: Ms;
}
export interface MeResponse {
  readonly player: PlayerView;
  readonly data: { readonly brackets: number; readonly wins30d: number; readonly rewards: number; readonly createdAt: Ms };
  readonly serverTime: Ms;
}
export interface ConfigResponse {
  readonly switches: Partial<Record<RemoteSwitch, boolean>>;
  readonly ttlSec: number;
  readonly serverTime: Ms;
}
export interface HealthResponse {
  readonly ok: boolean;
  readonly version: string;
  readonly contentVersions: readonly string[];
  readonly db: 'ok' | 'down';
  readonly serverTime: Ms;
}

// ── errors
export type ErrorCode =
  | 'bad_request'
  | 'token_invalid'
  | 'token_expired'
  | 'bad_signature'
  | 'nonce_invalid'
  | 'nonce_replay'
  | 'signature_stale'
  | 'suspended'
  | 'origin_not_allowed'
  | 'web_disabled'
  | 'not_member'
  | 'not_found'
  | 'nickname_cooldown'
  | 'heart_exists'
  | 'heart_limit'
  | 'too_large'
  | 'nickname_invalid'
  | 'nickname_blocked'
  | 'avatar_invalid'
  | 'upgrade_required'
  | 'rate_limited'
  | 'disabled'
  | 'unavailable';
/** The HTTP status of every error code (spec §1.4 table). */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  bad_request: 400,
  token_invalid: 401,
  token_expired: 401,
  bad_signature: 401,
  nonce_invalid: 401,
  nonce_replay: 401,
  signature_stale: 401,
  suspended: 403,
  origin_not_allowed: 403,
  web_disabled: 403,
  not_member: 403,
  not_found: 404,
  nickname_cooldown: 409,
  heart_exists: 409,
  heart_limit: 409,
  too_large: 413,
  nickname_invalid: 422,
  nickname_blocked: 422,
  avatar_invalid: 422,
  upgrade_required: 426,
  rate_limited: 429,
  disabled: 503,
  unavailable: 503,
};
export const ERROR_CODES: readonly ErrorCode[] = Object.keys(ERROR_STATUS) as ErrorCode[];
export interface ApiError {
  readonly error: { readonly code: ErrorCode; readonly message: string; readonly retryAfterMs?: number };
  readonly serverTime: Ms;
}

// ───────────────────────────────────────────────────────────────────────────── puzzle ids

/** What a puzzle id names (spec §1.4 `PUZZLE_ID_RE`); the tutorial `T1` never reaches the wire. */
export type PuzzleRef =
  | { readonly mode: 'level'; readonly level: number }
  | { readonly mode: 'daily'; readonly date: string }
  | { readonly mode: 'event'; readonly eventId: string; readonly index: number };

/** Splits a wire puzzle id; null when it fails PUZZLE_ID_RE. Pure syntax: `L1` and unknown events parse. */
export function parsePuzzleId(id: string): PuzzleRef | null {
  if (typeof id !== 'string' || !PUZZLE_ID_RE.test(id)) return null;
  const head = id.charAt(0);
  if (head === 'L') return { mode: 'level', level: Number(id.slice(1)) };
  if (head === 'D') return { mode: 'daily', date: id.slice(1) };
  const slash = id.lastIndexOf('/');
  return { mode: 'event', eventId: id.slice(1, slash), index: Number(id.slice(slash + 1)) };
}

// ───────────────────────────────────────────────────────────────────────────── small checks
// Exported for ./rank-api-parse.ts only (the one import inside the shared layer, tests/unit/layering.spec.ts);
// not part of the wire contract.

export type Obj = Record<string, unknown>;
export const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
export const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
/** Epoch ms (or a duration) as a non-negative safe integer. */
export const isMs = (x: unknown): x is number => isInt(x, 0, Number.MAX_SAFE_INTEGER);
export const isMsOrNull = (x: unknown): x is number | null => x === null || isMs(x);
export const isStr = (x: unknown, min: number, max: number): x is string => typeof x === 'string' && x.length >= min && x.length <= max;
export const matches = (x: unknown, re: RegExp): x is string => typeof x === 'string' && re.test(x);
export const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
export function oneOf<T extends string>(x: unknown, values: readonly T[]): x is T {
  return typeof x === 'string' && (values as readonly string[]).indexOf(x) >= 0;
}
/** No control characters (U+0000–U+001F, U+007F–U+009F) and no lone surrogates in display text. */
export function isDisplayText(x: unknown, max: number): x is string {
  if (!isStr(x, 1, max)) return false;
  for (let i = 0; i < x.length; i++) {
    const c = x.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = x.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

/** Field bounds of a WinSubmission (shape only; the server's pipeline decides fishMax, revives, floors). */
export const WIN_LIMITS = {
  fishMax: 20,
  mistakesMax: 99,
  revivesMax: 9,
  helperMax: 999,
  solveMsMax: 2_147_483_647,
} as const;

// ───────────────────────────────────────────────────────────────────────────── requests (server side)

export type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly path: string };
const fail = (path: string): { readonly ok: false; readonly path: string } => ({ ok: false, path });
const ok = <T>(value: T): { readonly ok: true; readonly value: T } => ({ ok: true, value });

function checkWin(x: unknown, at: string): Checked<WinSubmission> {
  if (!isObj(x)) return fail(at);
  if (!matches(x.winId, WIN_ID_RE)) return fail(`${at}.winId`);
  if (!matches(x.puzzleId, PUZZLE_ID_RE)) return fail(`${at}.puzzleId`);
  if (!oneOf(x.source, PUZZLE_SOURCES)) return fail(`${at}.source`);
  if (!matches(x.contentVersion, CONTENT_VERSION_RE)) return fail(`${at}.contentVersion`);
  if (!matches(x.cats, CATS_RE)) return fail(`${at}.cats`);
  if (!isInt(x.fish, 1, WIN_LIMITS.fishMax)) return fail(`${at}.fish`);
  if (!isInt(x.mistakes, 0, WIN_LIMITS.mistakesMax)) return fail(`${at}.mistakes`);
  if (!isInt(x.revives, 0, WIN_LIMITS.revivesMax)) return fail(`${at}.revives`);
  if (!isInt(x.hints, 0, WIN_LIMITS.helperMax)) return fail(`${at}.hints`);
  if (!isInt(x.kitties, 0, WIN_LIMITS.helperMax)) return fail(`${at}.kitties`);
  if (!isInt(x.mice, 0, WIN_LIMITS.helperMax)) return fail(`${at}.mice`);
  if (!isInt(x.solveMs, 0, WIN_LIMITS.solveMsMax)) return fail(`${at}.solveMs`);
  if (!isMs(x.playedAt)) return fail(`${at}.playedAt`);
  if (!matches(x.clientVersion, CLIENT_VERSION_RE)) return fail(`${at}.clientVersion`);
  return ok({
    winId: x.winId,
    puzzleId: x.puzzleId,
    source: x.source,
    contentVersion: x.contentVersion,
    cats: x.cats,
    fish: x.fish,
    mistakes: x.mistakes,
    revives: x.revives,
    hints: x.hints,
    kitties: x.kitties,
    mice: x.mice,
    solveMs: x.solveMs,
    playedAt: x.playedAt,
    clientVersion: x.clientVersion,
  });
}

/** The client's saved queue and the server's request use the same rule (a queued win that passes is never a 400). */
export function isWinSubmission(x: unknown): x is WinSubmission {
  return checkWin(x, 'win').ok;
}

export function validateSessionRequest(x: unknown, opts: { readonly devPools: boolean }): Checked<SessionRequest> {
  if (!isObj(x)) return fail('body');
  if (!matches(x.clientVersion, CLIENT_VERSION_RE)) return fail('clientVersion');
  if (!matches(x.contentVersion, CONTENT_VERSION_RE)) return fail('contentVersion');
  let devPool: string | null = null;
  if (x.devPool !== undefined) {
    if (!opts.devPools) return fail('devPool');
    if (!matches(x.devPool, DEV_POOL_RE)) return fail('devPool');
    devPool = x.devPool;
  }
  const base = { clientVersion: x.clientVersion, contentVersion: x.contentVersion };
  if (x.platform === 'fb') {
    if (!matches(x.playerId, PLAYER_ID_RE)) return fail('playerId');
    if (!isStr(x.signature, 3, MAX_SIGNATURE_LENGTH)) return fail('signature');
    if (!matches(x.nonce, NONCE_RE)) return fail('nonce');
    const fb = { platform: 'fb' as const, playerId: x.playerId, signature: x.signature, nonce: x.nonce, ...base };
    return ok(devPool === null ? fb : { ...fb, devPool });
  }
  if (x.platform === 'web') {
    const d = x.device;
    if (!isObj(d)) return fail('device');
    if (!matches(d.id, DEVICE_ID_RE)) return fail('device.id');
    if (!matches(d.secret, DEVICE_SECRET_RE)) return fail('device.secret');
    const web = { platform: 'web' as const, device: { id: d.id, secret: d.secret }, ...base };
    return ok(devPool === null ? web : { ...web, devPool });
  }
  return fail('platform');
}

/** 1 … MAX_WINS_PER_REQUEST wins (the handler answers 413 `too_large` above that before calling this). */
export function validateWinsRequest(x: unknown): Checked<WinsRequest> {
  if (!isObj(x)) return fail('body');
  const wins = x.wins;
  if (!Array.isArray(wins) || wins.length < 1 || wins.length > MAX_WINS_PER_REQUEST) return fail('wins');
  const out: WinSubmission[] = [];
  for (let i = 0; i < wins.length; i++) {
    const c = checkWin(wins[i], `wins[${i}]`);
    if (!c.ok) return c;
    out.push(c.value);
  }
  return ok({ wins: out });
}

export function validateClaimRequest(x: unknown): Checked<ClaimRequest> {
  if (!isObj(x)) return fail('body');
  if (!matches(x.rewardId, REWARD_ID_RE)) return fail('rewardId');
  if (!isBool(x.double)) return fail('double');
  return ok({ rewardId: x.rewardId, double: x.double });
}

export function validateHeartRequest(x: unknown): Checked<HeartRequest> {
  if (!isObj(x)) return fail('body');
  if (!matches(x.bracketId, BRACKET_ID_RE)) return fail('bracketId');
  if (!isInt(x.slot, 0, 9999)) return fail('slot');
  return ok({ bracketId: x.bracketId, slot: x.slot });
}

/**
 * Shape only: indices are small non-negative integers and the avatar an integer; whether an index exists
 * in the word lists, the number lies in NICK_NUM_MIN…MAX or the avatar below AVATAR_COUNT is the server's
 * 422 (`nickname_invalid`, `avatar_invalid`). At least one field.
 */
export function validateProfileRequest(x: unknown): Checked<ProfileRequest> {
  if (!isObj(x)) return fail('body');
  const out: { nickname?: NicknamePick | NicknameText; avatarId?: number; listed?: boolean } = {};
  if (x.nickname !== undefined) {
    const n = x.nickname;
    if (!isObj(n)) return fail('nickname');
    if (n.text !== undefined) {
      if (n.adj !== undefined || n.noun !== undefined || n.num !== undefined) return fail('nickname');
      if (!isStr(n.text, 1, 64)) return fail('nickname.text');
      out.nickname = { text: n.text };
    } else {
      if (!isInt(n.adj, 0, 9999)) return fail('nickname.adj');
      if (!isInt(n.noun, 0, 9999)) return fail('nickname.noun');
      if (n.num !== undefined && !isInt(n.num, 0, 9999)) return fail('nickname.num');
      out.nickname = n.num === undefined ? { adj: n.adj, noun: n.noun } : { adj: n.adj, noun: n.noun, num: n.num as number };
    }
  }
  if (x.avatarId !== undefined) {
    if (!isInt(x.avatarId, 0, 9999)) return fail('avatarId');
    out.avatarId = x.avatarId;
  }
  if (x.listed !== undefined) {
    if (!isBool(x.listed)) return fail('listed');
    out.listed = x.listed;
  }
  if (out.nickname === undefined && out.avatarId === undefined && out.listed === undefined) return fail('body');
  return ok(out);
}

// ───────────────────────────────────────────────────────────────────────────── responses (client side)
// The response parsers live in ./rank-api-parse.ts (Phase 2e I-2/I-4, requests-G1 R9, G3 R18): only the lazy ranking
// flow uses them, while the first load needs this module's constants, patterns and isWinSubmission (the saved
// queue's check), and a bundler keeps a module whole in one chunk. Same contract, same rules (CONTRACTS §2.2).

// ───────────────────────────────────────────────────────────────────────────── helpers

/** "7KQ2M9XD" → "7KQ2-M9XD" (Settings; the app formats it, ui/ imports shared/ for types only). */
export function formatPlayerCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function isRemoteSwitch(name: string): name is RemoteSwitch {
  return oneOf(name, REMOTE_SWITCHES);
}
