// Owner: G4 (Phase 2e). The contract (spec §9.2, §10.2 "Contract"): every golden fixture in
// test/contract/fixtures has the SAME SHAPE as the real server's answer for that endpoint and case (the
// same keys at every level, the same JSON types; null stands for a nullable member), and that real answer
// parses with the shared validators. Plus the client/server config parity the spec asks for (§1.16).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ERROR_STATUS,
  MAX_WINS_PER_REQUEST,
  parseApiError,
  parseBracketView,
  parseClaimResponse,
  parseConfigResponse,
  parseHealthResponse,
  parseHeartResponse,
  parseMeResponse,
  parseNonceResponse,
  parseProfileResponse,
  parseSessionResponse,
  parseWinsResponse,
  type ErrorCode,
} from '../../src/contract';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { admin, anyKing, CONTENT, DAY, HOUR, json, makeTestApp, makeWin, playersWithWins, SERVER_DIR, signPlayerInfo, TestPlayer, wrongBoard, boardOf } from '../helpers/harness';

interface Fixture {
  readonly name: string;
  readonly request: { readonly method: string; readonly path: string; readonly auth?: boolean; readonly body?: unknown };
  readonly response: { readonly status: number; readonly body: unknown };
}
const DIR = join(SERVER_DIR, 'test', 'contract', 'fixtures');
const FIXTURES: Fixture[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Fixture);

/** Differences in shape between a fixture value and a real one ("" when compatible). */
function shapeDiff(fx: unknown, real: unknown, at = '$'): string[] {
  if (fx === null || real === null) return [];
  if (Array.isArray(fx) || Array.isArray(real)) {
    if (!Array.isArray(fx) || !Array.isArray(real)) return [`${at}: array vs ${typeof real}`];
    if (fx.length === 0 || real.length === 0) return [];
    return shapeDiff(fx[0], real[0], `${at}[0]`);
  }
  if (typeof fx === 'object' && typeof real === 'object') {
    const a = Object.keys(fx as object).sort();
    const b = Object.keys(real as object).sort();
    const out: string[] = [];
    for (const k of a) if (!b.includes(k)) out.push(`${at}.${k}: missing in the server's answer`);
    for (const k of b) if (!a.includes(k)) out.push(`${at}.${k}: not in the fixture`);
    for (const k of a) if (b.includes(k)) out.push(...shapeDiff((fx as Record<string, unknown>)[k], (real as Record<string, unknown>)[k], `${at}.${k}`));
    return out;
  }
  return typeof fx === typeof real ? [] : [`${at}: ${typeof fx} vs ${typeof real}`];
}

const PARSE: Record<string, (x: unknown) => unknown> = {
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

/** Real answers for every fixture case, produced through the public API. */
async function realAnswers(): Promise<Map<string, { status: number; body: unknown }>> {
  const out = new Map<string, { status: number; body: unknown }>();
  const put = async (name: string, r: Response): Promise<void> => {
    out.set(name, { status: r.status, body: r.status === 204 ? null : await json(r) });
  };
  const t = makeTestApp({ overrides: { hearts: { maxGivenPerBracket: 3 } } });
  await put('health.ok', await t.fetch('/v1/health'));
  await put('config.ok', await t.fetch('/v1/config'));
  await put('nonce.ok', await t.fetch('/v1/session/nonce', { method: 'POST' }));
  // a finished, paid bracket, then a running one: session.fb has results and a bracket summary
  const ps = await playersWithWins(t, 5, 'c');
  await ps[0]!.win('L40');
  t.clock.advance(DAY + HOUR);
  for (const p of ps) await p.signIn();
  await put('bracket.ended', await ps[0]!.rawBracket());
  await ps[0]!.win('L41');
  await put('session.fb', await ps[0]!.rawSession());
  ps[0]!.token = ((out.get('session.fb')!.body as { token: string }).token);
  await put('session.web', await new TestPlayer(t, 'web', { platform: 'web' }).rawSession());
  const fresh = new TestPlayer(t, 'fresh');
  await fresh.signIn();
  await put('bracket.none', await fresh.rawBracket());
  await put('wins.ok', await fresh.rawWins([makeWin('L2')]));
  await put('bracket.alone', await fresh.rawBracket());
  const first = makeWin('L3');
  await fresh.wins([first]);
  // Audit A-S2: a level past the table counts only for a player who climbed within maxLevelJump (30) of it:
  // L33, L63, … L2973 (99 table levels, steps of 30, no jump flag), so the mixed request's L3001 is unverified.
  const climb = Array.from({ length: 99 }, (_, k) => makeWin(`L${3 + 30 * (k + 1)}`, { solveMs: 20_000 }));
  for (let i = 0; i < climb.length; i += 10) await fresh.wins(climb.slice(i, i + 10));
  await put(
    'wins.mixed',
    await fresh.rawWins([first, makeWin('L3001', { source: 'generated', cats: anyKing(9) }), makeWin('L4', { solveMs: 100 }), makeWin('L3')]),
  );
  // 50 rows
  const many = await playersWithWins(t, 49, 'm', 100);
  await put('bracket.full', await many[0]!.rawBracket());
  await put('bracket.open', await ps[1]!.rawBracket());
  const reward = (ps[1]!.session!.results[0]?.reward ?? ps[0]!.session!.results[0]?.reward)!;
  const owner = ps[1]!.session!.results[0]?.reward ? ps[1]! : ps[0]!;
  await put('claim.ok', await owner.rawClaim(reward.rewardId, true));
  await put('claim.already', await owner.rawClaim(reward.rewardId, false));
  const v = await many[0]!.bracket();
  await put('hearts.ok', await many[0]!.rawHeart(v.bracketId!, v.rows[0]!.slot));
  await put('profile.nickname', await many[1]!.rawProfile({ nickname: { adj: 7, noun: 12, num: 3 }, avatarId: 9 }));
  await put('profile.listed', await many[2]!.rawProfile({ listed: false }));
  // UI batch (profile): a frame and a background; a typed name (nickname.freeText is on by default)
  await put('profile.looks', await many[6]!.rawProfile({ frameId: 3, backgroundId: 5 }));
  await put('profile.text', await many[7]!.rawProfile({ nickname: { text: 'Gato Feliz' } }));
  await put('me.ok', await many[3]!.rawMe());
  await put('me.delete', await many[4]!.rawMe('DELETE'));
  // UI batch (victory): a daily win with its standing, once dailyStats.minSolvers (20) others solved that daily.
  const today = `D${new Date(t.clock.now()).toISOString().slice(0, 10)}`;
  for (const [i, p] of many.slice(10, 31).entries()) await p.win(today, { solveMs: 60_000 + i * 7_000 });
  await put('wins.daily', await many[31]!.rawWins([makeWin(today, { playedAt: t.clock.now(), solveMs: 131_480 })]));

  // errors, one real answer per code
  const e = async (code: ErrorCode, r: Promise<Response>): Promise<void> => put(`error.${code}`, await r);
  await e('bad_request', many[5]!.rawWins([makeWin('L2', { fish: 0 })]));
  await e('token_invalid', t.fetch('/v1/bracket', { headers: { authorization: 'Bearer v1.nope' } }));
  const expiring = new TestPlayer(t, 'exp');
  await expiring.signIn();
  t.clock.advance(DAY + 1);
  await e('token_expired', expiring.rawBracket());
  await e('bad_signature', new TestPlayer(t, 'forger', { secret: 'nope' }).rawSession());
  await e('nonce_invalid', t.fetch('/v1/session', { method: 'POST', body: JSON.stringify({ platform: 'fb', playerId: '1', signature: signPlayerInfo(t.env.FB_APP_SECRET as string, { algorithm: 'HMAC-SHA256', player_id: '1', request_payload: 'n1.zzzz.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA' }), nonce: 'n1.zzzz.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA', clientVersion: '0.2.0', contentVersion: CONTENT }) }));
  const n = (await json<{ nonce: string }>(await t.fetch('/v1/session/nonce', { method: 'POST' }))).nonce;
  const sig = signPlayerInfo(t.env.FB_APP_SECRET as string, { algorithm: 'HMAC-SHA256', issued_at: Math.floor(t.clock.now() / 1000), player_id: 'r', request_payload: n });
  const replayBody = JSON.stringify({ platform: 'fb', playerId: 'r', signature: sig, nonce: n, clientVersion: '0.2.0', contentVersion: CONTENT });
  await t.fetch('/v1/session', { method: 'POST', body: replayBody });
  await e('nonce_replay', t.fetch('/v1/session', { method: 'POST', body: replayBody }));
  const n2 = (await json<{ nonce: string }>(await t.fetch('/v1/session/nonce', { method: 'POST' }))).nonce;
  await e('signature_stale', t.fetch('/v1/session', { method: 'POST', body: JSON.stringify({ platform: 'fb', playerId: 's', signature: signPlayerInfo(t.env.FB_APP_SECRET as string, { algorithm: 'HMAC-SHA256', issued_at: 1, player_id: 's', request_payload: n2 }), nonce: n2, clientVersion: '0.2.0', contentVersion: CONTENT }) }));
  const sus = new TestPlayer(t, 'sus');
  await sus.signIn();
  await admin(t, 'POST', `players/${sus.code()}/suspend`);
  await e('suspended', sus.rawBracket());
  await e('origin_not_allowed', t.fetch('/v1/session/nonce', { method: 'POST', headers: { origin: 'https://evil.example' } }));
  const recordsMode = makeTestApp({ env: { WEB_MODE: 'records' } });
  await e('web_disabled', new TestPlayer(recordsMode, 'w', { platform: 'web' }).rawSession());
  const outsider = new TestPlayer(t, 'outsider');
  await outsider.signIn();
  const anyBracket = t.rows<{ id: string }>('SELECT id FROM brackets ORDER BY ends_at DESC LIMIT 1')[0]!.id; // still within its 24 h
  await e('not_member', outsider.rawHeart(anyBracket, 0));
  await e('not_found', outsider.rawClaim('zzzzzzzzzzzz:1'));
  const nick = new TestPlayer(t, 'nick');
  await nick.signIn();
  await nick.profile({ nickname: { adj: 1, noun: 1, num: 1 } });
  await e('nickname_cooldown', nick.rawProfile({ nickname: { adj: 2, noun: 2, num: 2 } }));
  const [h1, h2, h3, h4, h5] = await playersWithWins(t, 5, 'hh', 300);
  const hv = await h1!.bracket();
  await h1!.heart(hv.bracketId!, hv.rows[0]!.slot);
  await e('heart_exists', h1!.rawHeart(hv.bracketId!, hv.rows[0]!.slot));
  await h1!.heart(hv.bracketId!, hv.rows[1]!.slot);
  await h1!.heart(hv.bracketId!, hv.rows[2]!.slot);
  await e('heart_limit', h1!.rawHeart(hv.bracketId!, hv.rows[3]!.slot));
  await e('too_large', h2!.rawWins(Array.from({ length: MAX_WINS_PER_REQUEST + 1 }, (_, i) => makeWin(`L${400 + i}`))));
  await e('nickname_invalid', h3!.rawProfile({ nickname: { adj: 9999, noun: 1 } }));
  const ft = makeTestApp({ overrides: { nickname: { freeText: true } } });
  const ftp = new TestPlayer(ft, 'ft');
  await ftp.signIn();
  await e('nickname_blocked', ftp.rawProfile({ nickname: { text: 'Sh1t Cat' } }));
  await e('avatar_invalid', h4!.rawProfile({ avatarId: 99 }));
  const old = makeTestApp({ env: { MIN_CLIENT_VERSION: '9.0.0' } });
  await e('upgrade_required', new TestPlayer(old, 'old').rawSession());
  const limited = makeTestApp({ realLimits: true, overrides: { rateLimits: { session: { n: 1, perMs: 60_000 } } } });
  await limited.fetch('/v1/session/nonce', { method: 'POST' });
  await e('rate_limited', limited.fetch('/v1/session/nonce', { method: 'POST' }));
  const off = makeTestApp({ env: { RANKING_ENABLED: 'false' } });
  await e('disabled', off.fetch('/v1/bracket'));
  const unconfigured = makeTestApp({ env: { SESSION_SECRET: '' } });
  await e('unavailable', unconfigured.fetch('/v1/session/nonce', { method: 'POST' }));
  expect(h5).toBeDefined();
  return out;
}

describe('contract: the golden fixtures match the real server', async () => {
  const real = await realAnswers();

  it('there is a real answer for every fixture and every error code', () => {
    expect(FIXTURES.map((f) => f.name).filter((n) => !real.has(n))).toEqual([]);
    for (const code of ERROR_CODES) expect(real.has(`error.${code}`), code).toBe(true);
  });

  for (const f of FIXTURES) {
    it(`${f.name}: same status and shape; the real answer parses`, () => {
      const r = real.get(f.name);
      expect(r, f.name).toBeDefined();
      if (!r) return;
      expect(r.status).toBe(f.response.status);
      expect(shapeDiff(f.response.body, r.body)).toEqual([]);
      const kind = f.name.split('.')[0] as string;
      if (kind === 'error') {
        const e = parseApiError(r.body);
        expect(e?.error.code).toBe(f.name.slice('error.'.length));
        expect(r.status).toBe(ERROR_STATUS[e!.error.code]);
      } else if (r.status !== 204) {
        expect((PARSE[kind] as (x: unknown) => unknown)(r.body)).toEqual(r.body);
      }
    });
  }

  it('the real bracket answers keep rows.length === members and ranks 1…N (H-2, H-3)', () => {
    for (const [name, r] of real) {
      if (!name.startsWith('bracket.') || r.status !== 200) continue;
      const v = parseBracketView(r.body)!;
      expect(v.rows.length, name).toBe(v.members);
      expect(v.rows.map((x) => x.rank), name).toEqual(v.rows.map((_, i) => i + 1));
    }
    expect((real.get('bracket.full')!.body as { rows: unknown[] }).rows).toHaveLength(50);
  });

  it('[UI batch, victory] wins.daily carries the daily standing: other solvers and the strictly slower ones', () => {
    const w = parseWinsResponse(real.get('wins.daily')!.body)!;
    // 21 others at 60 s + i × 7 s; 131.48 s is bucket 13: the ones at 140 s and up (buckets 14 …) were slower.
    expect(w.results[0]).toEqual({ winId: expect.any(String), verdict: 'accepted', points: 3, daily: { solvers: 21, slower: 9 } });
  });

  it('wins.mixed carries the four verdicts the fixture shows', () => {
    const w = parseWinsResponse(real.get('wins.mixed')!.body)!;
    expect(w.results.map((x) => (x.reason ? `${x.verdict}:${x.reason}` : x.verdict))).toEqual(['duplicate', 'accepted_flagged:unverified', 'rejected:too_fast', 'already_counted']);
    expect(wrongBoard(boardOf('L2'))).not.toBe(boardOf('L2'));
  });
});

describe('contract: client and server config agree (spec §1.16)', async () => {
  // Loaded at run time only: the server's tsconfig never compiles the client's config.
  const path = join(SERVER_DIR, '..', 'src', 'app', 'config.ts');
  const { cfg } = (await import(/* @vite-ignore */ path)) as {
    cfg: {
      period: { modes: readonly string[] };
      hearts: { perAttempt: number };
      revive: { heartsRestored: number; maxPerAttempt: number };
      ladder: { pendingMaxAgeMs: number; pendingMax: number; batchMax: number };
      daily: { dayStartHour: number };
      victory: { minSolvers: number };
    };
  };

  it('[UI batch, victory] the daily standing\'s minimum of other solvers is the same on both sides', () => {
    expect(cfg.victory.minSolvers).toBe(DEFAULT_CONFIG.dailyStats.minSolvers);
  });

  it('scoring.modes = period.modes; fishMax, fishOnRevive, maxRevives mirror the lives', () => {
    expect([...DEFAULT_CONFIG.scoring.modes]).toEqual([...cfg.period.modes]);
    expect(DEFAULT_CONFIG.scoring.fishMax).toBe(cfg.hearts.perAttempt);
    expect(DEFAULT_CONFIG.scoring.fishOnRevive).toBe(cfg.revive.heartsRestored);
    expect(DEFAULT_CONFIG.scoring.maxRevives).toBe(cfg.revive.maxPerAttempt);
  });

  it('dailyGraceMs ≥ ladder.pendingMaxAgeMs + daily.dayStartHour (critic C-14)', () => {
    expect(DEFAULT_CONFIG.antiCheat.dailyGraceMs).toBeGreaterThanOrEqual(cfg.ladder.pendingMaxAgeMs + cfg.daily.dayStartHour * HOUR);
  });

  it('batch and queue sizes agree', () => {
    expect(DEFAULT_CONFIG.api.maxWinsPerRequest).toBe(MAX_WINS_PER_REQUEST);
    expect(cfg.ladder.batchMax).toBeLessThanOrEqual(DEFAULT_CONFIG.api.maxWinsPerRequest);
    expect(DEFAULT_CONFIG.api.queueMax).toBe(cfg.ladder.pendingMax);
  });
});
