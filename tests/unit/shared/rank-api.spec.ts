// Owner: G4 (Phase 2e). The shared wire contract (src/shared/rank-api.ts, CONTRACTS §2): every validator
// against the golden fixtures (server/test/contract/fixtures/*.json, read as data: the root tsconfig and
// vitest never import server/**) and against crafted bad inputs (spec §10.1).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  API_VERSION,
  AVATAR_COUNT,
  BRACKET_ID_RE,
  ERROR_CODES,
  ERROR_STATUS,
  formatPlayerCode,
  isRemoteSwitch,
  isWinSubmission,
  MAX_BODY_BYTES,
  MAX_WINS_PER_REQUEST,
  NICK_NUM_MAX,
  NICK_NUM_MIN,
  parsePuzzleId,
  PLAYER_CODE_RE,
  PUZZLE_ID_RE,
  REMOTE_SWITCHES,
  REWARD_ID_RE,
  validateClaimRequest,
  validateHeartRequest,
  validatePresenceRequest,
  validateProfileRequest,
  validateSessionRequest,
  validateWinsRequest,
  type WinSubmission,
} from '../../../src/shared/rank-api';
import {
  parseApiError,
  parseBracketView,
  parseClaimResponse,
  parseConfigResponse,
  parseHealthResponse,
  parseHeartResponse,
  parseMeResponse,
  parseNonceResponse,
  parsePresenceResponse,
  parseProfileResponse,
  parseSessionResponse,
  parseWinsResponse,
} from '../../../src/shared/rank-api-parse';

interface Fixture {
  readonly name: string;
  readonly request: { readonly method: string; readonly path: string; readonly auth?: boolean; readonly body?: unknown };
  readonly response: { readonly status: number; readonly body: unknown };
}

const FIXTURE_DIR = fileURLToPath(new URL('../../../server/test/contract/fixtures', import.meta.url));
const fixtures: Fixture[] = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as Fixture);
const fixture = (name: string): Fixture => {
  const f = fixtures.find((x) => x.name === name);
  if (!f) throw new Error(`no fixture ${name}`);
  return f;
};
/** A deep copy we may mutate. */
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
type Json = Record<string, unknown>;

const PARSERS: Record<string, (x: unknown) => unknown> = {
  health: parseHealthResponse,
  config: parseConfigResponse,
  nonce: parseNonceResponse,
  session: parseSessionResponse,
  wins: parseWinsResponse,
  bracket: parseBracketView,
  claim: parseClaimResponse,
  hearts: parseHeartResponse,
  profile: parseProfileResponse,
  me: parseMeResponse,
};

const WIN: WinSubmission = {
  winId: '3f6c2a0e-8d1b-4c7a-9e55-0b9a1d2c4e6f',
  puzzleId: 'L57',
  source: 'pack',
  contentVersion: 'content-bb8a756dfaf9',
  cats: '681524073',
  fish: 2,
  mistakes: 1,
  revives: 0,
  hints: 0,
  kitties: 1,
  mice: 0,
  solveMs: 94210,
  playedAt: 1791799790000,
  clientVersion: '0.2.0',
};

describe('rank-api: constants', () => {
  it('matches the spec values', () => {
    expect(API_VERSION).toBe('v1');
    expect(MAX_WINS_PER_REQUEST).toBe(10);
    expect(MAX_BODY_BYTES).toBe(16_384);
    expect(AVATAR_COUNT).toBe(12);
    expect([NICK_NUM_MIN, NICK_NUM_MAX]).toEqual([1, 99]);
    expect([...REMOTE_SWITCHES]).toEqual(['iapIos', 'iapInPlay', 'banner', 'bannerInPlay', 'ladder']);
  });

  it('maps every error code to the spec §1.4 status', () => {
    const want: Record<number, string[]> = {
      400: ['bad_request'],
      401: ['token_invalid', 'token_expired', 'bad_signature', 'nonce_invalid', 'nonce_replay', 'signature_stale'],
      403: ['suspended', 'origin_not_allowed', 'web_disabled', 'not_member'],
      404: ['not_found'],
      409: ['nickname_cooldown', 'heart_exists', 'heart_limit'],
      413: ['too_large'],
      422: ['nickname_invalid', 'nickname_blocked', 'avatar_invalid'],
      426: ['upgrade_required'],
      429: ['rate_limited'],
      503: ['disabled', 'unavailable'],
    };
    const got: Record<number, string[]> = {};
    for (const code of ERROR_CODES) (got[ERROR_STATUS[code]] ??= []).push(code);
    expect(got).toEqual(want);
  });

  it('id patterns accept the contract examples and refuse SQL-shaped values', () => {
    expect(PLAYER_CODE_RE.test('7KQ2M9XD')).toBe(true);
    for (const bad of ['7KQ2M9XI', '7kq2m9xd', '7KQ2-M9XD', "'; DROP TABLE wins;--", '%27', 'U'.repeat(8)]) expect(PLAYER_CODE_RE.test(bad), bad).toBe(false);
    expect(BRACKET_ID_RE.test('mgk0b7q1z4a8')).toBe(true);
    expect(REWARD_ID_RE.test('mgj1a0k3x9f2:11')).toBe(true);
    for (const bad of ["x'--", 'mgk0b7q1z4a8;', 'MGK0B7Q1Z4A8', 'a'.repeat(25), 'mgk0b7q1z4a8:1234']) {
      expect(BRACKET_ID_RE.test(bad) && REWARD_ID_RE.test(bad), bad).toBe(false);
    }
    for (const ok of ['L2', 'L57', 'L3001', 'D2026-10-11', 'Elantern-walk-2026/0', 'Esnow-paws-2026/20']) expect(PUZZLE_ID_RE.test(ok), ok).toBe(true);
    for (const bad of ['T1', 'L0', 'L01', 'L1234567', 'D2026-1-1', 'Eab/1', 'E-x-/1234', 'L2 ', "L2'"]) expect(PUZZLE_ID_RE.test(bad), bad).toBe(false);
  });

  it('parsePuzzleId splits the three forms (syntax only)', () => {
    expect(parsePuzzleId('L57')).toEqual({ mode: 'level', level: 57 });
    expect(parsePuzzleId('L1')).toEqual({ mode: 'level', level: 1 });
    expect(parsePuzzleId('D2026-10-11')).toEqual({ mode: 'daily', date: '2026-10-11' });
    expect(parsePuzzleId('Elantern-walk-2026/20')).toEqual({ mode: 'event', eventId: 'lantern-walk-2026', index: 20 });
    expect(parsePuzzleId('T1')).toBeNull();
    expect(parsePuzzleId('nope')).toBeNull();
  });

  it('formats the player code and recognises switches', () => {
    expect(formatPlayerCode('7KQ2M9XD')).toBe('7KQ2-M9XD');
    expect(formatPlayerCode('short')).toBe('short');
    expect(isRemoteSwitch('iapIos')).toBe(true);
    expect(isRemoteSwitch('ads')).toBe(false);
    expect(isRemoteSwitch('toString')).toBe(false);
  });
});

describe('rank-api: the golden fixtures', () => {
  it('has a fixture per endpoint and per error code', () => {
    const names = new Set(fixtures.map((f) => f.name));
    for (const n of ['health.ok', 'config.ok', 'nonce.ok', 'session.fb', 'session.web', 'wins.ok', 'wins.mixed', 'wins.daily', 'bracket.open', 'bracket.none', 'bracket.alone', 'bracket.full', 'bracket.ended', 'claim.ok', 'claim.already', 'hearts.ok', 'profile.nickname', 'profile.listed', 'me.ok', 'me.delete']) {
      expect(names.has(n), n).toBe(true);
    }
    for (const code of ERROR_CODES) expect(names.has(`error.${code}`), code).toBe(true);
  });

  for (const f of fixtures) {
    it(`${f.name}: the response parses to itself and the request validates`, () => {
      const kind = f.name.split('.')[0] as string;
      if (kind === 'error') {
        const parsed = parseApiError(f.response.body);
        expect(parsed).toEqual(f.response.body);
        expect(f.response.status).toBe(ERROR_STATUS[(parsed as NonNullable<typeof parsed>).error.code]);
        return;
      }
      if (f.response.status === 204) {
        expect(f.response.body).toBeNull();
        return;
      }
      const parse = PARSERS[kind];
      expect(parse, kind).toBeDefined();
      expect((parse as (x: unknown) => unknown)(f.response.body)).toEqual(f.response.body);
      const body = f.request.body;
      if (kind === 'session') expect(validateSessionRequest(body, { devPools: false })).toEqual({ ok: true, value: body });
      if (kind === 'wins') expect(validateWinsRequest(body)).toEqual({ ok: true, value: body });
      if (kind === 'claim') expect(validateClaimRequest(body)).toEqual({ ok: true, value: body });
      if (kind === 'hearts') expect(validateHeartRequest(body)).toEqual({ ok: true, value: body });
      if (kind === 'profile') expect(validateProfileRequest(body)).toEqual({ ok: true, value: body });
    });
  }

  it('bracket fixtures follow the honesty rule: rows.length === members, ranks 1…N in order', () => {
    for (const f of fixtures.filter((x) => x.name.startsWith('bracket.'))) {
      const v = parseBracketView(f.response.body);
      expect(v, f.name).not.toBeNull();
      if (!v) continue;
      expect(v.rows.length, f.name).toBe(v.members);
      expect(v.rows.map((r) => r.rank), f.name).toEqual(v.rows.map((_, i) => i + 1));
    }
    expect(parseBracketView(fixture('bracket.full').response.body)?.rows).toHaveLength(50);
  });
});

describe('rank-api: requests (server side)', () => {
  it('isWinSubmission accepts the contract example and refuses each broken field', () => {
    expect(isWinSubmission(WIN)).toBe(true);
    const bad: [keyof WinSubmission, unknown][] = [
      ['winId', 'not-a-uuid'],
      ['winId', '3F6C2A0E-8D1B-4C7A-9E55-0B9A1D2C4E6F'],
      ['winId', '3f6c2a0e-8d1b-1c7a-9e55-0b9a1d2c4e6f'],
      ['puzzleId', 'T1'],
      ['puzzleId', 'L2'.padEnd(80, '0')],
      ['source', 'cloud'],
      ['contentVersion', ''],
      ['contentVersion', 'x'.repeat(65)],
      ['contentVersion', "c'; DROP TABLE wins;--"],
      ['cats', '68152407z'],
      ['cats', '123'],
      ['cats', '0123456789abc'],
      ['fish', 0],
      ['fish', 1.5],
      ['fish', '2'],
      ['fish', 21],
      ['mistakes', -1],
      ['revives', 10],
      ['hints', -1],
      ['kitties', null],
      ['mice', 1000],
      ['solveMs', -5],
      ['solveMs', Number.NaN],
      ['solveMs', 2 ** 31],
      ['playedAt', -1],
      ['playedAt', 1e300],
      ['clientVersion', ''],
      ['clientVersion', 'v'.repeat(40)],
      ['clientVersion', '0.2.0 beta'],
    ];
    for (const [k, v] of bad) expect(isWinSubmission({ ...WIN, [k]: v }), `${k}=${String(v)}`).toBe(false);
    const { fish: _fish, ...missing } = WIN;
    expect(isWinSubmission(missing)).toBe(false);
    expect(isWinSubmission(null)).toBe(false);
    expect(isWinSubmission([WIN])).toBe(false);
  });

  it('validateWinsRequest: 1…10 wins, the failing path, extra fields dropped', () => {
    expect(validateWinsRequest({ wins: [] })).toEqual({ ok: false, path: 'wins' });
    expect(validateWinsRequest({ wins: Array.from({ length: 11 }, () => WIN) })).toEqual({ ok: false, path: 'wins' });
    expect(validateWinsRequest({ wins: [WIN, { ...WIN, fish: 4.2 }] })).toEqual({ ok: false, path: 'wins[1].fish' });
    expect(validateWinsRequest({ wins: Array.from({ length: 10 }, () => WIN) }).ok).toBe(true);
    const extra = validateWinsRequest({ wins: [{ ...WIN, admin: true }], other: 1 });
    expect(extra).toEqual({ ok: true, value: { wins: [WIN] } });
    expect(validateWinsRequest('{"wins":[]}')).toEqual({ ok: false, path: 'body' });
  });

  it('validateSessionRequest: platforms, devPool only on a dev server, credential shapes', () => {
    const fb = (fixture('session.fb').request.body ?? {}) as Json;
    const web = (fixture('session.web').request.body ?? {}) as Json;
    expect(validateSessionRequest(fb, { devPools: false }).ok).toBe(true);
    expect(validateSessionRequest(web, { devPools: false }).ok).toBe(true);
    expect(validateSessionRequest({ ...fb, platform: 'ios' }, { devPools: false })).toEqual({ ok: false, path: 'platform' });
    expect(validateSessionRequest({ ...fb, devPool: 'e2e-1' }, { devPools: false })).toEqual({ ok: false, path: 'devPool' });
    expect(validateSessionRequest({ ...fb, devPool: 'e2e-1' }, { devPools: true })).toEqual({ ok: true, value: { ...fb, devPool: 'e2e-1' } });
    expect(validateSessionRequest({ ...fb, devPool: 'E2E_1' }, { devPools: true })).toEqual({ ok: false, path: 'devPool' });
    expect(validateSessionRequest({ ...fb, signature: 'a.'.padEnd(4097, 'b') }, { devPools: false })).toEqual({ ok: false, path: 'signature' });
    expect(validateSessionRequest({ ...fb, nonce: 'n2.x.y.z' }, { devPools: false })).toEqual({ ok: false, path: 'nonce' });
    expect(validateSessionRequest({ ...fb, playerId: '' }, { devPools: false })).toEqual({ ok: false, path: 'playerId' });
    expect(validateSessionRequest({ ...fb, playerId: 'x'.repeat(65) }, { devPools: false })).toEqual({ ok: false, path: 'playerId' });
    const device = web.device as Json;
    expect(validateSessionRequest({ ...web, device: { ...device, id: 'short' } }, { devPools: false })).toEqual({ ok: false, path: 'device.id' });
    expect(validateSessionRequest({ ...web, device: { ...device, secret: `${device.secret as string}=` } }, { devPools: false })).toEqual({ ok: false, path: 'device.secret' });
    expect(validateSessionRequest({ ...web, clientVersion: 1 }, { devPools: false })).toEqual({ ok: false, path: 'clientVersion' });
  });

  it('validateClaimRequest / validateHeartRequest', () => {
    expect(validateClaimRequest({ rewardId: 'mgj1a0k3x9f2:11', double: 'yes' })).toEqual({ ok: false, path: 'double' });
    expect(validateClaimRequest({ rewardId: "x'--:1", double: false })).toEqual({ ok: false, path: 'rewardId' });
    expect(validateHeartRequest({ bracketId: 'mgk0b7q1z4a8', slot: -1 })).toEqual({ ok: false, path: 'slot' });
    expect(validateHeartRequest({ bracketId: 'mgk0b7q1z4a8', slot: 1.5 })).toEqual({ ok: false, path: 'slot' });
    expect(validateHeartRequest({ bracketId: '../admin', slot: 0 })).toEqual({ ok: false, path: 'bracketId' });
  });

  it('validateProfileRequest: at least one field, picks or text, shape only', () => {
    expect(validateProfileRequest({})).toEqual({ ok: false, path: 'body' });
    expect(validateProfileRequest({ listed: 'no' })).toEqual({ ok: false, path: 'listed' });
    expect(validateProfileRequest({ avatarId: 99 })).toEqual({ ok: true, value: { avatarId: 99 } }); // 422 avatar_invalid is the server's
    expect(validateProfileRequest({ nickname: { adj: 1, noun: 2 } })).toEqual({ ok: true, value: { nickname: { adj: 1, noun: 2 } } });
    expect(validateProfileRequest({ nickname: { adj: 1, noun: 2, text: 'x' } })).toEqual({ ok: false, path: 'nickname' });
    expect(validateProfileRequest({ nickname: { adj: -1, noun: 2 } })).toEqual({ ok: false, path: 'nickname.adj' });
    expect(validateProfileRequest({ nickname: { text: 'Kitty Cat' } })).toEqual({ ok: true, value: { nickname: { text: 'Kitty Cat' } } });
    expect(validateProfileRequest({ nickname: { text: 'x'.repeat(65) } })).toEqual({ ok: false, path: 'nickname.text' });
  });
});

describe('rank-api: responses (client side; never invent, repair, trim or re-rank)', () => {
  const open = (): Json => clone(fixture('bracket.open').response.body) as Json;

  it('a bad row is dropped, members stays the server number', () => {
    const v = open();
    (v.rows as Json[])[1] = { ...(v.rows as Json[])[1], nickname: 'Bad\u0000Name' };
    const parsed = parseBracketView(v);
    expect(parsed?.rows.map((r) => r.rank)).toEqual([1, 3]);
    expect(parsed?.members).toBe(3);
  });

  it('a view is rejected whole when malformed', () => {
    const dupSlot = open();
    (dupSlot.rows as Json[])[2] = { ...(dupSlot.rows as Json[])[2], slot: 0 };
    expect(parseBracketView(dupSlot)).toBeNull();
    const dupRank = open();
    (dupRank.rows as Json[])[2] = { ...(dupRank.rows as Json[])[2], rank: 1 };
    expect(parseBracketView(dupRank)).toBeNull();
    const rankOut = open();
    (rankOut.rows as Json[])[2] = { ...(rankOut.rows as Json[])[2], rank: 4 };
    expect(parseBracketView(rankOut)).toBeNull();
    expect(parseBracketView({ ...open(), maxMembers: 2 })).toBeNull();
    expect(parseBracketView({ ...open(), me: { rank: 2 } })).toBeNull();
    expect(parseBracketView({ ...open(), bracketId: null })).toBeNull();
    expect(parseBracketView({ ...open(), state: 'paused' })).toBeNull();
    expect(parseBracketView({ ...open(), members: -1 })).toBeNull();
    expect(parseBracketView({ ...open(), rows: 'x' })).toBeNull();
    expect(parseBracketView({ ...open(), result: { bracketId: 'mgk0b7q1z4a8' } })).toBeNull();
    expect(parseBracketView(null)).toBeNull();
  });

  it('unknown fields are ignored and dropped', () => {
    const v = { ...open(), extra: 1, rows: (open().rows as Json[]).map((r) => ({ ...r, flag: 'x' })) };
    expect(parseBracketView(v)).toEqual(fixture('bracket.open').response.body);
  });

  it('wins: an unknown verdict drops that result; an unknown reason drops the reason', () => {
    const w = clone(fixture('wins.mixed').response.body) as Json;
    const results = w.results as Json[];
    results[0] = { ...results[0], verdict: 'maybe' };
    results[1] = { ...results[1], reason: 'new_reason' };
    const parsed = parseWinsResponse(w);
    expect(parsed?.results).toHaveLength(3);
    expect(parsed?.results[0]).toEqual({ winId: results[1]?.winId, verdict: 'accepted_flagged', points: 3 });
    expect(parseWinsResponse({ ...w, bracket: { state: 'open' } })).toBeNull();
  });

  it('[UI batch, victory] wins: a daily standing is kept as sent; a malformed one is dropped from its result only', () => {
    const w = clone(fixture('wins.daily').response.body) as Json;
    const r0 = (w.results as Json[])[0] as Json;
    expect(parseWinsResponse(w)?.results[0]).toEqual({ winId: r0.winId, verdict: 'accepted', points: 3, daily: { solvers: 37, slower: 22 } });
    const base = { winId: r0.winId, verdict: 'accepted', points: 3 };
    for (const daily of [{ solvers: 0, slower: 0 }, { solvers: 10, slower: 11 }, { solvers: 10, slower: -1 }, { solvers: 2.5, slower: 1 }, { solvers: '30', slower: 3 }, null, 'top 10%', []]) {
      expect(parseWinsResponse({ ...w, results: [{ ...r0, daily }] })?.results[0], JSON.stringify(daily)).toEqual(base);
    }
    expect(parseWinsResponse({ ...w, results: [{ ...r0, daily: { solvers: 20, slower: 20, extra: 1 } }] })?.results[0]).toEqual({ ...base, daily: { solvers: 20, slower: 20 } });
  });

  it('session: a bad result is dropped, a bad player or rules rejects the answer', () => {
    const s = clone(fixture('session.fb').response.body) as Json;
    expect(parseSessionResponse({ ...s, results: [{ bracketId: 'x' }, ...(s.results as Json[])] })?.results).toHaveLength(1);
    expect(parseSessionResponse({ ...s, player: { ...(s.player as Json), code: 'lower123' } })).toBeNull();
    expect(parseSessionResponse({ ...s, rules: { ...(s.rules as Json), places: [{ place: 2, hints: 1, kitties: 1 }, { place: 1, hints: 2, kitties: 2 }] } })).toBeNull();
    expect(parseSessionResponse({ ...s, rules: { ...(s.rules as Json), scoringModes: ['level', 'weekly'] } })?.rules.scoringModes).toEqual(['level']);
    expect(parseSessionResponse({ ...s, token: '' })).toBeNull();
  });

  it('config keeps booleans of known switches only', () => {
    expect(parseConfigResponse({ switches: { iapIos: true, ladder: 'off', ads: true, banner: false }, ttlSec: 3600, serverTime: 1 })).toEqual({
      switches: { iapIos: true, banner: false },
      ttlSec: 3600,
      serverTime: 1,
    });
    expect(parseConfigResponse({ switches: [], ttlSec: 3600, serverTime: 1 })).toBeNull();
  });

  it('errors: a known code only; retryAfterMs kept', () => {
    expect(parseApiError({ error: { code: 'teapot', message: 'x' }, serverTime: 1 })).toBeNull();
    expect(parseApiError({ error: { code: 'rate_limited', message: 'x', retryAfterMs: 5 }, serverTime: 1 })?.error.retryAfterMs).toBe(5);
    expect(parseApiError({ error: { code: 'rate_limited', message: 'x', retryAfterMs: -5 }, serverTime: 1 })).toBeNull();
  });

  it('claim and heart answers keep their invariants', () => {
    const c = clone(fixture('claim.ok').response.body) as Json;
    expect(parseClaimResponse({ ...c, rewardId: 'nope' })).toBeNull();
    const h = clone(fixture('hearts.ok').response.body) as Json;
    expect(parseHeartResponse({ ...h, likedByMe: false })).toBeNull();
  });
});

describe('rank-api: leaderboard update (join, presence, row activity)', () => {
  it('a session may ask to join (a boolean only); presence takes online or playing', () => {
    const web = { platform: 'web', device: { id: 'q2Vx8LmN4pRt6WyZ0aBc1D', secret: 'k9Jf3Hs7Ld2Qw5Er8Ty1Ui4Op6As0Df3Gh5Jk7Lz9Xa' }, clientVersion: '0.2.0', contentVersion: 'c1' };
    expect(validateSessionRequest({ ...web, join: true }, { devPools: false })).toEqual({ ok: true, value: { ...web, join: true } });
    expect(validateSessionRequest({ ...web, join: false }, { devPools: false })).toEqual({ ok: true, value: web });
    expect(validateSessionRequest({ ...web, join: 'yes' }, { devPools: false })).toEqual({ ok: false, path: 'join' });
    expect(validatePresenceRequest({ state: 'playing' })).toEqual({ ok: true, value: { state: 'playing' } });
    expect(validatePresenceRequest({ state: 'away' })).toEqual({ ok: false, path: 'state' });
    expect(parsePresenceResponse({ updated: true, serverTime: 1791799800000 })).toEqual({ updated: true, serverTime: 1791799800000 });
    expect(parsePresenceResponse({ updated: 'yes', serverTime: 1 })).toBeNull();
  });

  it('a row keeps the server seenAt / playing; an older server (or a bad value) gives "no status", never a dropped row', () => {
    const body = clone(fixture('bracket.open').response.body) as Json & { rows: Json[] };
    const parsed = parseBracketView(body);
    expect(parsed?.rows.map((r) => r.seenAt)).toEqual(body.rows.map((r) => r.seenAt));
    for (const r of body.rows) {
      delete r.seenAt;
      delete r.playing;
    }
    (body.rows[0] as Json).playing = true; // playing without seenAt is no status
    (body.me as Json).seenAt = -5;
    const old = parseBracketView(body);
    expect(old?.rows).toHaveLength(body.rows.length);
    expect(old?.rows.every((r) => r.seenAt === null && r.playing === false)).toBe(true);
    expect(old?.me).toMatchObject({ seenAt: null, playing: false });
  });
});
