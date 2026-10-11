// Owner: lead (Phase 2e, spec §8.2 step 4, §11.6). The ranking probe (dev/rank-probe/) with a fake SDK and a fake
// fetch: six lines, each failure mode reported (no throw), and NEVER the player id, the signature, the token or the
// player code in what it shows or copies; scripts/rank-probe.ts's URL rules and its zip.
import { createHmac } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { reportText, runProbe, signatureFacts, type ProbeDeps, type ProbeSdk } from '../../../dev/rank-probe/run-probe';
import { probeUrl, zipProbe } from '../../../scripts/rank-probe';

const PLAYER = 'fb-player-7731';
const TOKEN = 'tok.SECRET-TOKEN-VALUE';
const CODE = 'K7Q2M9XA';
const b64url = (s: string): string => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(payload: Record<string, unknown>): string {
  const enc = b64url(JSON.stringify(payload));
  return `${createHmac('sha256', 'k').update(enc).digest('base64url')}.${enc}`;
}

function fakeSdk(o: { listed?: boolean; reject?: boolean; payload?: (nonce: string) => Record<string, unknown> } = {}): ProbeSdk & { sig: string } {
  const sdk = {
    sig: '',
    getSDKVersion: () => '8.0',
    getPlatform: () => 'ANDROID',
    getLocale: () => 'de_DE',
    getSupportedAPIs: () => (o.listed === false ? [] : ['player.getSignedPlayerInfoAsync']),
    player: {
      getSignedPlayerInfoAsync: async (nonce?: string) => {
        if (o.reject) throw { code: 'CLIENT_UNSUPPORTED_OPERATION', message: 'no' };
        sdk.sig = sign(o.payload ? o.payload(nonce ?? '') : { algorithm: 'HMAC-SHA256', issued_at: 1_800_000_000, player_id: PLAYER, request_payload: nonce });
        return { getPlayerID: () => PLAYER, getSignature: () => sdk.sig };
      },
    },
  };
  return sdk;
}

type Route = (method: string, body: unknown) => { status: number; body: unknown } | 'network';
function fakeFetch(routes: Record<string, Route>, seen: { path: string; init: RequestInit }[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({ path: url.pathname, init: init ?? {} });
    const r = routes[url.pathname]?.(init?.method ?? 'GET', init?.body ? JSON.parse(String(init.body)) : undefined) ?? { status: 404, body: { error: { code: 'not_found', message: '' } } };
    if (r === 'network') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
}

const OK_ROUTES: Record<string, Route> = {
  '/v1/health': () => ({ status: 200, body: { ok: true, version: '0.1.0', contentVersions: ['c1'], db: 'ok', serverTime: 1_800_000_000_000 } }),
  '/v1/config': () => ({ status: 200, body: { switches: { iapIos: false }, ttlSec: 300, serverTime: 1_800_000_000_000 } }),
  '/v1/session/nonce': () => ({ status: 200, body: { nonce: 'n1.abc.12345678.abcdefgh', expiresAt: 1_800_000_300_000, serverTime: 1_800_000_000_000 } }),
  '/v1/session': (_m, body) => {
    const b = body as { signature: string; playerId: string; platform: string };
    return b.platform === 'fb' && b.signature.includes('.')
      ? { status: 200, body: { token: TOKEN, expiresAt: 1_800_086_400_000, serverTime: 1_800_000_000_000, player: { code: CODE } } }
      : { status: 401, body: { error: { code: 'bad_signature', message: '' } } };
  },
};

function deps(o: Partial<ProbeDeps> = {}): ProbeDeps {
  return {
    baseUrl: 'https://rank-staging.example.workers.dev',
    sdk: fakeSdk(),
    fetch: fakeFetch(OK_ROUTES),
    now: () => 1_800_000_000_000,
    origin: 'https://apps-123.apps.fbsbx.com',
    referrer: 'https://www.facebook.com/gaming/play/123/',
    probeVersion: 'p1',
    clientVersion: '0.1.0',
    contentVersion: 'content-x',
    ...o,
  };
}

describe('the ranking probe (G-SRV-1, G-SRV-2)', () => {
  it('all six lines on a good surface, called like the game\'s ladder client (text/plain JSON, no credentials, cors, no-store)', async () => {
    const seen: { path: string; init: RequestInit }[] = [];
    const sdk = fakeSdk();
    const r = await runProbe(deps({ sdk, fetch: fakeFetch(OK_ROUTES, seen) }));
    expect(r.lines.map((l) => [l.step, l.state])).toEqual([
      ['health', 'ok'], ['config', 'ok'], ['nonce', 'ok'], ['signed', 'ok'], ['session', 'ok'], ['origin', 'info'],
    ]);
    expect(seen.map((s) => s.path)).toEqual(['/v1/health', '/v1/config', '/v1/session/nonce', '/v1/session']);
    for (const s of seen) expect(s.init).toMatchObject({ credentials: 'omit', mode: 'cors', cache: 'no-store' });
    expect((seen[2]?.init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=UTF-8');
    const text = reportText(r);
    expect(text).toContain('payload fields: algorithm, issued_at, player_id, request_payload');
    expect(text).toContain('algorithm HMAC-SHA256');
    expect(text).toContain('request_payload = the nonce: yes');
    expect(text).toContain('page origin (sent as the Origin header): https://apps-123.apps.fbsbx.com; referrer origin https://www.facebook.com');
    expect(r.header).toContain('platform ANDROID');
    // never identifying values
    for (const secret of [PLAYER, TOKEN, CODE, sdk.sig, sdk.sig.split('.')[0] as string]) expect(text).not.toContain(secret);
  });

  it('reports a CORS / network refusal, an HTTP error code, a missing issued_at and a nonce mismatch without throwing', async () => {
    const blocked = await runProbe(deps({ fetch: fakeFetch({ ...OK_ROUTES, '/v1/health': () => 'network', '/v1/config': () => 'network', '/v1/session/nonce': () => 'network' }) }));
    expect(blocked.lines.map((l) => l.state)).toEqual(['fail', 'fail', 'fail', 'skip', 'skip', 'info']);
    expect(reportText(blocked)).toContain('no response (network or CORS refused)');

    const down = await runProbe(deps({ fetch: fakeFetch({ ...OK_ROUTES, '/v1/session': () => ({ status: 401, body: { error: { code: 'signature_stale', message: '' } } }) }) }));
    expect(down.lines[4]).toMatchObject({ state: 'fail' });
    expect(down.lines[4]?.text).toContain('HTTP 401 signature_stale');

    const noIssued = await runProbe(deps({ sdk: fakeSdk({ payload: (n) => ({ algorithm: 'HMAC-SHA256', player_id: PLAYER, request_payload: n }) }) }));
    expect(noIssued.lines[3]?.text).toContain('issued_at MISSING');
    expect(noIssued.lines[3]?.state).toBe('ok'); // issued_at is optional (srv signature.requireIssuedAt false until G-SRV-2)

    const wrong = await runProbe(deps({ sdk: fakeSdk({ payload: () => ({ algorithm: 'HMAC-SHA256', player_id: PLAYER, request_payload: 'other' }) }) }));
    expect(wrong.lines[3]).toMatchObject({ state: 'fail' });
    expect(wrong.lines[3]?.text).toContain('request_payload = the nonce: NO');

    const rejected = await runProbe(deps({ sdk: fakeSdk({ reject: true, listed: false }) }));
    expect(rejected.lines[3]?.text).toContain('rejected (CLIENT_UNSUPPORTED_OPERATION)');
    expect(rejected.lines[3]?.text).toContain('listed by getSupportedAPIs: NO');
    expect(rejected.lines[4]?.state).toBe('skip');

    const noSdk = await runProbe(deps({ sdk: null }));
    expect(noSdk.lines[3]).toMatchObject({ state: 'fail' });
    expect(noSdk.header).toContain('SDK missing');
  });

  it('signatureFacts reads the payload\'s field names only', () => {
    const f = signatureFacts(sign({ algorithm: 'HMAC-SHA256', player_id: PLAYER, request_payload: 'n' }), 'n');
    expect(f).toEqual({ parts: 2, fields: ['algorithm', 'player_id', 'request_payload'], algorithm: 'HMAC-SHA256', issuedAt: null, requestPayloadMatches: true, payloadReadable: true });
    expect(signatureFacts('garbage', 'n')).toMatchObject({ parts: 1, payloadReadable: false });
  });
});

describe('scripts/rank-probe.ts', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('the URL: an http(s) API base; a zip for FB needs https', () => {
    expect(probeUrl('https://rank-staging.example.workers.dev/', true)).toEqual({ url: 'https://rank-staging.example.workers.dev' });
    expect(probeUrl('http://127.0.0.1:8787', false)).toEqual({ url: 'http://127.0.0.1:8787' });
    expect('error' in probeUrl('http://127.0.0.1:8787', true)).toBe(true);
    expect('error' in probeUrl('', true)).toBe(true);
    expect('error' in probeUrl('ftp://x', true)).toBe(true);
    expect('error' in probeUrl('https://u:p@x.example', true)).toBe(true);
  });

  it('zips index.html and fbapp-config.json at the root as mewdoku-rank-probe-<sha>.zip; refuses maps and test data', () => {
    const root = mkdtempSync(join(tmpdir(), 'mewdoku-probe-'));
    dirs.push(root);
    const d = join(root, 'rank-probe');
    mkdirSync(join(d, 'assets'), { recursive: true });
    writeFileSync(join(d, 'index.html'), '<!doctype html><script type="module" src="./assets/index-a.js"></script>');
    writeFileSync(join(d, 'fbapp-config.json'), '{"instant_games":{}}');
    writeFileSync(join(d, 'assets/index-a.js'), 'console.log(1)');
    const file = zipProbe(d, join(root, 'zip'), 'abc1234');
    expect(file.endsWith('mewdoku-rank-probe-abc1234.zip')).toBe(true);
    expect(Object.keys(unzipSync(new Uint8Array(readFileSync(file)))).sort()).toEqual(['assets/index-a.js', 'fbapp-config.json', 'index.html']);
    writeFileSync(join(d, 'assets/index-a.js.map'), '{}');
    expect(() => zipProbe(d, join(root, 'zip'), 'abc1234')).toThrow(/source maps/);
    rmSync(join(d, 'assets/index-a.js.map'));
    writeFileSync(join(d, 'assets/index-a.js'), 'const s="e2e-fb-app-secret"');
    expect(() => zipProbe(d, join(root, 'zip'), 'abc1234')).toThrow(/test data/);
  });
});
