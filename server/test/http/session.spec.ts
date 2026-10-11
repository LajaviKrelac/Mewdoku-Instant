// Owner: G4 (Phase 2e). Sessions over HTTP (spec §1.3, §1.4, D-2e-5, C-12, C-15): nonce single use, forged
// and stale signatures, the web anon mode and its quota, test pools, the ALT secret, MIN_CLIENT_VERSION,
// the kill switch, CORS, and the per-request player read (a deleted or suspended player's live token).
import { describe, expect, it } from 'vitest';
import { parseApiError, parseConfigResponse, parseHealthResponse, parseNonceResponse, type SessionResponse } from '../../src/contract';
import { admin, CONTENT, json, makeTestApp, signPlayerInfo, TestPlayer } from '../helpers/harness';

async function nonceOf(t: ReturnType<typeof makeTestApp>): Promise<string> {
  return (await json<{ nonce: string }>(await t.fetch('/v1/session/nonce', { method: 'POST' }))).nonce;
}

function fbBody(t: ReturnType<typeof makeTestApp>, nonce: string, id = '42', secret = t.env.FB_APP_SECRET as string, payload: Record<string, unknown> = {}): string {
  const signature = signPlayerInfo(secret, { algorithm: 'HMAC-SHA256', issued_at: Math.floor(t.clock.now() / 1000), player_id: id, request_payload: nonce, ...payload });
  return JSON.stringify({ platform: 'fb', playerId: id, signature, nonce, clientVersion: '0.2.0', contentVersion: CONTENT });
}

const post = (t: ReturnType<typeof makeTestApp>, body: string, headers: Record<string, string> = {}): Promise<Response> =>
  t.fetch('/v1/session', { method: 'POST', headers: { 'content-type': 'text/plain', ...headers }, body });

describe('session: FB', () => {
  it('nonce → signature → session; the same nonce twice is nonce_replay', async () => {
    const t = makeTestApp();
    const nr = await json(await t.fetch('/v1/session/nonce', { method: 'POST' }));
    expect(parseNonceResponse(nr)).toEqual(nr);
    const nonce = (nr as { nonce: string }).nonce;
    const ok = await post(t, fbBody(t, nonce));
    expect(ok.status).toBe(200);
    const again = await post(t, fbBody(t, nonce));
    expect(again.status).toBe(401);
    expect((await json(again)).error).toMatchObject({ code: 'nonce_replay' });
  });

  it('a forged signature, another id, a stale issued_at, an expired or foreign nonce are refused', async () => {
    const t = makeTestApp();
    const code = async (r: Promise<Response>): Promise<string> => (parseApiError(await json(await r))?.error.code ?? 'parse')!;
    expect(await code(post(t, fbBody(t, await nonceOf(t), '42', 'wrong-secret')))).toBe('bad_signature');
    const n = await nonceOf(t);
    const body = JSON.parse(fbBody(t, n, '42')) as Record<string, unknown>;
    expect(await code(post(t, JSON.stringify({ ...body, playerId: '43' })))).toBe('bad_signature');
    expect(await code(post(t, fbBody(t, await nonceOf(t), '42', undefined, { issued_at: Math.floor(t.clock.now() / 1000) - 3600 })))).toBe('signature_stale');
    const old = await nonceOf(t);
    t.clock.advance(6 * 60_000);
    expect(await code(post(t, fbBody(t, old)))).toBe('nonce_invalid');
    const other = makeTestApp({ env: { SESSION_SECRET: 'another-session-secret' } });
    expect(await code(post(t, fbBody(t, await nonceOf(other))))).toBe('nonce_invalid');
    // nothing was created by any of these
    expect(t.count('SELECT COUNT(*) FROM players')).toBe(0);
  });

  it('the raw FB id is never stored; the same id signs in to the same player', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, '7392816450');
    const s1 = await a.signIn();
    const s2 = await a.signIn();
    expect(s2.player.code).toBe(s1.player.code);
    const dump = JSON.stringify(t.rows('SELECT * FROM players'));
    expect(dump).not.toContain('7392816450');
    expect(t.count('SELECT COUNT(*) FROM players')).toBe(1);
  });

  it('test pools (dev routes only) and the ALT secret land in their own pools', async () => {
    const t = makeTestApp();
    const p = new TestPlayer(t, '42', { devPool: 'e2e-1' });
    expect((await p.signIn()).player.pool).toBe('fb');
    const q = new TestPlayer(t, '42', { secret: t.env.FB_APP_SECRET_ALT ?? 'unset' });
    expect((await q.rawSession()).status).toBe(401); // no ALT secret configured
    const t2 = makeTestApp({ env: { FB_APP_SECRET_ALT: 'alt-secret-for-load-tests' } });
    const syn = new TestPlayer(t2, '42', { secret: 'alt-secret-for-load-tests' });
    await syn.signIn();
    expect(t2.rows<{ pool: string }>('SELECT pool FROM players')).toEqual([{ pool: 'fb:synthetic' }]);
    const real = new TestPlayer(t2, '42');
    await real.signIn();
    expect(t2.rows<{ pool: string }>('SELECT pool FROM players ORDER BY pool')).toEqual([{ pool: 'fb' }, { pool: 'fb:synthetic' }]);
    expect(t.rows<{ pool: string }>("SELECT pool FROM players WHERE pool LIKE 'fb:%'")).toEqual([{ pool: 'fb:e2e-1' }]);
  });

  it('a production config: devPool is a 400, the ALT secret stops every FB session', async () => {
    const prod = makeTestApp({ env: { DEPLOY_ENV: 'production', DEV_ROUTES: 'true', SESSION_SECRET: 's'.repeat(40), ID_PEPPER: 'p'.repeat(40), FB_APP_SECRET: 'f'.repeat(40) } });
    const r = await new TestPlayer(prod, '42', { devPool: 'e2e-1', secret: 'f'.repeat(40) }).rawSession();
    expect(r.status).toBe(400);
    expect((await json(await prod.fetch('/dev/reset', { method: 'POST', body: '{"devPool":"e2e-1"}' }))).error).toMatchObject({ code: 'not_found' });
    const withAlt = makeTestApp({ env: { DEPLOY_ENV: 'production', SESSION_SECRET: 's'.repeat(40), ID_PEPPER: 'p'.repeat(40), FB_APP_SECRET: 'f'.repeat(40), FB_APP_SECRET_ALT: 'a'.repeat(40) } });
    const r2 = await new TestPlayer(withAlt, '42', { secret: 'a'.repeat(40) }).rawSession();
    expect(r2.status).toBe(503);
    const r3 = await new TestPlayer(withAlt, '43', { secret: 'f'.repeat(40) }).rawSession();
    expect(r3.status).toBe(503);
    // and weak production secrets disable the server rather than run with them
    const weak = makeTestApp({ env: { DEPLOY_ENV: 'production' } });
    expect((await weak.fetch('/v1/session/nonce', { method: 'POST' })).status).toBe(503);
  });

  it('dev routes need a loopback host even with DEV_ROUTES=true', async () => {
    const t = makeTestApp();
    const r = await t.fetch('/dev/clock', { method: 'POST', body: '{"devPool":"x","advanceMs":1}', host: 'rank.example.com' });
    expect(r.status).toBe(404);
    const ok = await t.fetch('/dev/clock', { method: 'POST', body: '{"devPool":"x","advanceMs":1}' });
    expect(ok.status).toBe(200);
  });
});

describe('session: web (D-2e-5)', () => {
  it('records mode: 403 web_disabled', async () => {
    const t = makeTestApp({ env: { WEB_MODE: 'records' } });
    const r = await new TestPlayer(t, 'dev', { platform: 'web' }).rawSession();
    expect(r.status).toBe(403);
    expect((await json(r)).error).toMatchObject({ code: 'web_disabled' });
  });

  it('anon mode: its own pool, the secret checked, 5 new devices per IP per day', async () => {
    const t = makeTestApp({ realLimits: true });
    const a = new TestPlayer(t, 'dev', { platform: 'web' });
    const s = (await a.signIn()) as SessionResponse;
    expect(s.player).toMatchObject({ pool: 'web', trust: 'anon' });
    const thief = new TestPlayer(t, 'dev', { platform: 'web' });
    (thief.device as { id: string }).id = a.device.id; // same id, another secret
    expect((await thief.rawSession()).status).toBe(401);
    for (let i = 0; i < 4; i++) await new TestPlayer(t, `d${i}`, { platform: 'web' }).signIn();
    const sixth = await new TestPlayer(t, 'd6', { platform: 'web' }).rawSession();
    expect(sixth.status).toBe(429);
    expect((await json(sixth)).error).toMatchObject({ code: 'rate_limited' });
    // a returning device is not a new registration
    expect((await a.rawSession()).status).toBe(200);
    expect(JSON.stringify(t.rows('SELECT * FROM ip_quota'))).not.toContain('unknown');
  });
});

describe('versions, kill switch, health, config', () => {
  it('below MIN_CLIENT_VERSION: 426 for the session and for a token or a win of an old client', async () => {
    const t = makeTestApp({ env: { MIN_CLIENT_VERSION: '0.2.0' } });
    expect((await new TestPlayer(t, '1', { clientVersion: '0.1.9' }).rawSession()).status).toBe(426);
    const p = new TestPlayer(t, '2');
    await p.signIn();
    const r = await p.rawWins([{ ...(await import('../helpers/harness')).makeWin('L2'), clientVersion: '0.1.0' }]);
    expect(r.status).toBe(426);
  });

  it('RANKING_ENABLED=false: 503 disabled with retryAfterMs on ranking routes; health and config still answer', async () => {
    const t = makeTestApp({ env: { RANKING_ENABLED: 'false' } });
    for (const [method, path] of [
      ['POST', '/v1/session/nonce'],
      ['POST', '/v1/session'],
      ['POST', '/v1/wins'],
      ['GET', '/v1/bracket'],
      ['POST', '/v1/hearts'],
      ['GET', '/v1/me'],
    ] as const) {
      const r = await t.fetch(path, { method, body: method === 'GET' ? null : '{}' });
      expect(r.status, path).toBe(503);
      const e = parseApiError(await json(r));
      expect(e?.error.code).toBe('disabled');
      expect(e?.error.retryAfterMs).toBeGreaterThan(0);
    }
    expect(parseHealthResponse(await json(await t.fetch('/v1/health')))?.ok).toBe(true);
    expect(parseConfigResponse(await json(await t.fetch('/v1/config')))?.switches).toEqual({ iapIos: false });
  });

  it('a deleted player\'s live token is 401 and creates nothing; a suspended player gets 403 on reads too', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, '1');
    await a.signIn();
    await a.win('L2');
    expect((await a.rawMe('DELETE')).status).toBe(204);
    const r = await a.rawBracket();
    expect(r.status).toBe(401);
    expect((await json(r)).error).toMatchObject({ code: 'token_invalid' });
    expect(t.count('SELECT COUNT(*) FROM players')).toBe(0);
    const b = new TestPlayer(t, '2');
    await b.signIn();
    await b.win('L2');
    expect((await admin(t, 'POST', `players/${b.code()}/suspend`)).status).toBe(200);
    const read = await b.rawBracket();
    expect(read.status).toBe(403);
    expect((await json(read)).error).toMatchObject({ code: 'suspended' });
    expect((await b.rawSession()).status).toBe(403);
  });
});

describe('CORS (an abuse guard, §1.2, §1.4, C-16)', () => {
  it('echoes an allowed origin with Vary, preflights, never Allow-Credentials', async () => {
    const t = makeTestApp();
    const r = await t.fetch('/v1/health', { headers: { origin: 'https://apps-1234.apps.fbsbx.com' } });
    expect(r.headers.get('access-control-allow-origin')).toBe('https://apps-1234.apps.fbsbx.com');
    expect(r.headers.get('vary')).toBe('Origin');
    expect(r.headers.get('access-control-allow-credentials')).toBeNull();
    const pre = await t.fetch('/v1/wins', { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:4173', 'access-control-request-headers': 'authorization,content-type' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
    expect(pre.headers.get('access-control-allow-methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    expect(pre.headers.get('access-control-max-age')).toBe('7200');
    expect(pre.headers.get('access-control-allow-credentials')).toBeNull();
    // error answers carry the CORS headers too (the client must read the code)
    const err = await t.fetch('/v1/bracket', { headers: { origin: 'http://127.0.0.1:4173' } });
    expect(err.status).toBe(401);
    expect(err.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:4173');
  });

  it('a denied origin gets 403 origin_not_allowed with no CORS headers, logged with its value', async () => {
    const t = makeTestApp();
    const r = await t.fetch('/v1/session/nonce', { method: 'POST', headers: { origin: 'https://evil.example' } });
    expect(r.status).toBe(403);
    expect((await json(r)).error).toMatchObject({ code: 'origin_not_allowed' });
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    expect(t.logs.some((l) => l.deniedOrigin === 'https://evil.example')).toBe(true);
    const nul = await t.fetch('/v1/health', { headers: { origin: 'null' } });
    expect(nul.status).toBe(403);
    const t2 = makeTestApp({ env: { ALLOWED_ORIGINS: 'null' } });
    expect((await t2.fetch('/v1/health', { headers: { origin: 'null' } })).headers.get('access-control-allow-origin')).toBe('null');
  });

  it('admin and dev routes never send CORS headers', async () => {
    const t = makeTestApp();
    const a = await t.fetch('/admin/v1/flags', { headers: { origin: 'http://127.0.0.1:4173', authorization: `Bearer ${t.env.ADMIN_KEY as string}` } });
    expect(a.status).toBe(200);
    expect(a.headers.get('access-control-allow-origin')).toBeNull();
    const d = await t.fetch('/dev/clock', { method: 'POST', headers: { origin: 'http://127.0.0.1:4173' }, body: '{"devPool":"x","advanceMs":0}' });
    expect(d.status).toBe(200);
    expect(d.headers.get('access-control-allow-origin')).toBeNull();
    const evil = await t.fetch('/dev/reset', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{"devPool":"x"}' });
    expect(evil.status).toBe(404);
  });

  it('every answer is JSON, no-store, with serverTime', async () => {
    const t = makeTestApp();
    for (const path of ['/v1/health', '/v1/config', '/v1/bracket', '/v1/nope']) {
      const r = await t.fetch(path);
      expect(r.headers.get('content-type')).toMatch(/^application\/json/);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(typeof (await json(r)).serverTime).toBe('number');
    }
  });
});
