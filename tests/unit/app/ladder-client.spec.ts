// Owner: G1 (Phase 2e). The ranking server's client (docs/phase2e/spec.md §1.3, §1.4, §2.2; CONTRACTS §2, §7)
// against the in-memory fake (tests/fixtures/ladder-fake.ts, G4's contract shapes): the web's device
// credential (localStorage, never the save), FB's nonce → signed player info → session, the token in memory
// only, one sign-in again on 401 token_*, never a loop, the server-time offset, text/plain bodies without
// credentials, failures as codes (network, timeout, invalid_response, API errors with retryAfterMs), the
// remote switches without a sign-in, the e2e test pool.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { createLadderClient, deviceCredential, DEVICE_KEY, base64url, type LadderClientDeps } from '../../../src/app/ladder-client';
import type { IdentityProvider } from '../../../src/platform/types';
import { createLadderFake, type LadderFake } from '../../fixtures/ladder-fake';
import { NOW } from './harness';

class MemStorage {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

let seed = 1;
const fakeCrypto = {
  getRandomValues<T extends ArrayBufferView | null>(a: T): T {
    const u = a as unknown as Uint8Array;
    for (let i = 0; i < u.length; i++) u[i] = (seed++ * 37) & 255;
    return a;
  },
} as Pick<Crypto, 'getRandomValues'>;

function setup(o: { platform?: 'web' | 'fbig'; identity?: IdentityProvider | null; skewMs?: number; devPool?: string } = {}) {
  const clock = createFakeClock(NOW);
  const fake: LadderFake = createLadderFake({ now: () => clock.now(), ...(o.skewMs !== undefined ? { skewMs: o.skewMs } : {}) });
  const storage = new MemStorage();
  const signed: string[] = [];
  const identity: IdentityProvider | null =
    o.identity !== undefined
      ? o.identity
      : {
          signedPlayerInfo: async (nonce) => {
            signed.push(nonce);
            return { playerId: '7392816450', signature: `sig.${nonce}` };
          },
        };
  const deps: LadderClientDeps = {
    baseUrl: 'https://rank.test',
    platformId: o.platform ?? 'web',
    identity,
    device: () => deviceCredential(storage, fakeCrypto),
    clock,
    clientVersion: '0.2.0',
    contentVersion: 'content-test',
    fetch: fake.fetch,
    ...(o.devPool ? { devPool: o.devPool } : {}),
  };
  const client = createLadderClient(deps);
  return { clock, fake, storage, client, signed };
}

describe('sign-in (spec §1.3)', () => {
  it('web (anon): a device credential made once and kept in localStorage; POST /v1/session; the token in memory only', async () => {
    const s = setup();
    const r = await s.client.signIn();
    expect(r.ok).toBe(true);
    expect(s.fake.paths()).toEqual(['POST /v1/session']);
    const body = s.fake.calls[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({ platform: 'web', clientVersion: '0.2.0', contentVersion: 'content-test' });
    const stored = JSON.parse(s.storage.getItem(DEVICE_KEY) ?? 'null') as { id: string; secret: string };
    expect(body.device).toEqual(stored);
    expect(stored.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(stored.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The token is never written anywhere.
    expect([...s.storage.map.values()].join()).not.toContain('faketoken');
    expect(s.client.signedIn()).toBe(true);
    // The credential is stable.
    s.client.signOut();
    await s.client.signIn();
    expect((s.fake.calls[1]?.body as Record<string, unknown>).device).toEqual(stored);
  });

  it('FB: nonce → signed player info over the nonce → session (playerId, signature, nonce)', async () => {
    const s = setup({ platform: 'fbig' });
    const r = await s.client.signIn();
    expect(r.ok).toBe(true);
    expect(s.fake.paths()).toEqual(['POST /v1/session/nonce', 'POST /v1/session']);
    const nonce = (s.fake.calls[0] && s.signed[0]) as string;
    expect(s.fake.calls[1]?.body).toMatchObject({ platform: 'fb', playerId: '7392816450', signature: `sig.${nonce}`, nonce });
  });

  it('FB without the identity API, or a signing failure: no_api, no session call', async () => {
    const none = setup({ platform: 'fbig', identity: null });
    expect(await none.client.signIn()).toEqual({ ok: false, code: 'no_api' });
    expect(none.fake.calls).toEqual([]);
    const failing = setup({ platform: 'fbig', identity: { signedPlayerInfo: async () => null } });
    expect(await failing.client.signIn()).toEqual({ ok: false, code: 'no_api' });
    expect(failing.fake.paths()).toEqual(['POST /v1/session/nonce']);
  });

  it('two callers share one sign-in', async () => {
    const s = setup();
    await Promise.all([s.client.signIn(), s.client.signIn(), s.client.bracket()]);
    expect(s.fake.paths().filter((p) => p === 'POST /v1/session')).toHaveLength(1);
  });

  it('a refused sign-in returns its code (bad_signature, upgrade_required …)', async () => {
    const s = setup();
    s.fake.failNext('/v1/session', 'upgrade_required');
    expect(await s.client.signIn()).toEqual({ ok: false, code: 'upgrade_required' });
    expect(s.client.signedIn()).toBe(false);
  });
});

describe('requests', () => {
  it('bodies are text/plain JSON, no cookies; the bearer token only on authed calls', async () => {
    const s = setup();
    await s.client.bracket();
    const [session, bracket] = s.fake.calls;
    expect(session?.contentType).toBe('text/plain;charset=UTF-8');
    expect(session?.auth).toBeNull();
    expect(bracket?.auth).toMatch(/^Bearer v1\.faketoken\d+$/);
  });

  it('an authed call signs in first; 401 token_expired → one sign-in again and one retry, never a loop', async () => {
    const s = setup();
    expect((await s.client.bracket()).ok).toBe(true);
    s.fake.expireTokens();
    expect((await s.client.bracket()).ok).toBe(true);
    expect(s.fake.paths()).toEqual(['POST /v1/session', 'GET /v1/bracket', 'GET /v1/bracket', 'POST /v1/session', 'GET /v1/bracket']);
    // Expired again on the retry: the failure comes back (no third sign-in).
    s.fake.calls.length = 0;
    s.fake.failNext('/v1/bracket', 'token_expired');
    s.fake.failNext('/v1/bracket', 'token_invalid');
    expect(await s.client.bracket()).toEqual({ ok: false, code: 'token_invalid' });
    expect(s.fake.paths()).toEqual(['GET /v1/bracket', 'POST /v1/session', 'GET /v1/bracket']);
  });

  it('the server-time offset is measured on every answer (serverNow, offsetMs, lastServerAt)', async () => {
    const s = setup({ skewMs: 90_000 });
    expect(s.client.offsetMs()).toBe(0);
    expect(s.client.lastServerAt()).toBeNull();
    await s.client.config();
    expect(s.client.offsetMs()).toBe(90_000);
    expect(s.client.serverNow()).toBe(s.clock.now() + 90_000);
    expect(s.client.lastServerAt()).toBe(s.clock.now());
  });

  it('failures become codes: network, timeout, invalid_response, API errors with retryAfterMs', async () => {
    const s = setup();
    s.fake.offline = true;
    expect(await s.client.config()).toEqual({ ok: false, code: 'network' });
    s.fake.offline = false;
    s.fake.hold = true;
    const pending = s.client.config();
    await s.clock.advanceAsync(10_000);
    expect(await pending).toEqual({ ok: false, code: 'timeout' });
    s.fake.hold = false;
    s.fake.release();
    s.fake.failNext('/v1/config', 'rate_limited', 30_000);
    expect(await s.client.config()).toEqual({ ok: false, code: 'rate_limited', retryAfterMs: 30_000 });
    const bad = createLadderClient({
      baseUrl: 'https://rank.test',
      platformId: 'web',
      clock: s.clock,
      clientVersion: '0.2.0',
      contentVersion: 'c',
      fetch: (async () => new Response(JSON.stringify({ switches: 'nope' }), { status: 200 })) as typeof fetch,
    });
    expect(await bad.config()).toEqual({ ok: false, code: 'invalid_response' });
    const html = createLadderClient({
      baseUrl: 'https://rank.test',
      platformId: 'web',
      clock: s.clock,
      clientVersion: '0.2.0',
      contentVersion: 'c',
      fetch: (async () => new Response('<html>', { status: 502 })) as typeof fetch,
    });
    expect(await html.config()).toEqual({ ok: false, code: 'invalid_response' });
  });

  it('the remote switches need no sign-in; the e2e pool travels in the session body and the config query', async () => {
    const s = setup({ devPool: 'e2e-a' });
    s.fake.state.switches = { iapIos: true };
    const r = await s.client.config();
    expect(r.ok && r.value.switches).toEqual({ iapIos: true });
    expect(s.fake.calls[0]?.path).toBe('/v1/config?devPool=e2e-a');
    await s.client.signIn();
    expect(s.fake.calls[1]?.body).toMatchObject({ devPool: 'e2e-a' });
  });

  it('wins, claim, hearts, profile, me and DELETE /me (204) round-trip through the validators', async () => {
    const s = setup();
    const win = {
      winId: '3f6c2a0e-8d1b-4c7a-9e55-0b9a1d2c4e6f',
      puzzleId: 'L57',
      source: 'pack' as const,
      contentVersion: 'content-test',
      cats: '681524073',
      fish: 2,
      mistakes: 1,
      revives: 0,
      hints: 0,
      kitties: 1,
      mice: 0,
      solveMs: 94_210,
      playedAt: NOW,
      clientVersion: '0.2.0',
    };
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    const w = await s.client.submitWins([win]);
    expect(w.ok && w.value.results).toEqual([{ winId: win.winId, verdict: 'accepted', points: 2 }]);
    expect(w.ok && w.value.bracket?.rows.map((r) => [r.rank, r.nickname, r.points, r.me])).toEqual([
      [1, 'Sleepy Whisker 27', 31, false],
      [2, 'Velvet Pounce 27', 2, true],
    ]);
    const bracketId = w.ok ? (w.value.bracket?.bracketId as string) : '';
    const h = await s.client.heart(bracketId, 0);
    expect(h.ok && h.value.hearts).toBe(1);
    const p = await s.client.setProfile({ listed: false });
    expect(p.ok && p.value.player.listed).toBe(false);
    const me = await s.client.me();
    expect(me.ok && me.value.player.code).toBe('7KQ2M9XD');
    expect(await s.client.deleteMe()).toEqual({ ok: true, value: true });
  });
});

describe('deviceCredential (spec §1.3, D-2e-5)', () => {
  it('kept across calls; a broken entry replaced; storage that throws still yields one for the page', () => {
    const st = new MemStorage();
    const a = deviceCredential(st, fakeCrypto);
    expect(deviceCredential(st, fakeCrypto)).toEqual(a);
    st.setItem(DEVICE_KEY, '{"id":"short","secret":"x"}');
    const b = deviceCredential(st, fakeCrypto);
    expect(b?.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(b).not.toEqual(a);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(deviceCredential(throwing, fakeCrypto)?.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(deviceCredential(null, null)).toBeNull();
  });

  it('base64url without padding', () => {
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(base64url(new Uint8Array(16))).toHaveLength(22);
    expect(base64url(new Uint8Array(32))).toHaveLength(43);
  });
});
