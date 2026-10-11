// Owner: G4 (Phase 2e). The e2e pairing (spec §10.3, CONTRACTS §3, §5): G1's FBInstant stub
// (tests/fixtures/fbinstant-stub.js, run here as the browser runs it, in a sandbox) signs
// getSignedPlayerInfoAsync with its default secret, and the dev server's default FB_APP_SECRET accepts it,
// so the e2e exercises the server's real signature check. A browser clock moved by the e2e is accepted in a
// dev test pool whose clock /dev/clock moved the same way, never in the real pool.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { DEV_DEFAULTS } from '../../dev/serve';
import { CONTENT, DAY, json, makeTestApp, SERVER_DIR, type TestApp } from '../helpers/harness';

const STUB = join(SERVER_DIR, '..', 'tests', 'fixtures', 'fbinstant-stub.js');

interface SignedInfo {
  getPlayerID(): string;
  getSignature(): string;
}

/** G1's stub in a fresh sandbox; `clock()` is the browser's (possibly moved) time. */
function stubSigner(clock: () => number, playerId: string): (nonce: string) => Promise<SignedInfo> {
  const sandbox: Record<string, unknown> = { __FB_STUB_NO_INSTALL__: true, __stubNow: clock, TextEncoder, crypto: globalThis.crypto, btoa, atob, setTimeout, clearTimeout, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(STUB, 'utf8'), sandbox);
  type Sdk = { initializeAsync(): Promise<void>; player: { getSignedPlayerInfoAsync(n: string): Promise<SignedInfo> } };
  const { sdk } = (sandbox.__createFbStub as (cfg: unknown) => { sdk: Sdk })({ playerId });
  const ready = sdk.initializeAsync();
  return async (nonce) => {
    await ready;
    return sdk.player.getSignedPlayerInfoAsync(nonce);
  };
}

async function signIn(t: TestApp, sign: (nonce: string) => Promise<SignedInfo>, devPool?: string): Promise<Response> {
  const { nonce } = await json<{ nonce: string }>(await t.fetch('/v1/session/nonce', { method: 'POST', body: '{}' }));
  const info = await sign(nonce);
  const body: Record<string, unknown> = { platform: 'fb', playerId: info.getPlayerID(), signature: info.getSignature(), nonce, clientVersion: '0.2.0', contentVersion: CONTENT };
  if (devPool) body.devPool = devPool;
  return t.fetch('/v1/session', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) });
}

describe.skipIf(!existsSync(STUB))('the e2e FBInstant stub and the dev server (CONTRACTS §5)', () => {
  it("the stub's default signing secret is the dev server's FB_APP_SECRET: a real, verified session", async () => {
    const t = makeTestApp({ env: { FB_APP_SECRET: DEV_DEFAULTS.FB_APP_SECRET } });
    const r = await signIn(t, stubSigner(() => t.clock.now(), 'alice'));
    expect(r.status).toBe(200);
    expect((await json<{ player: { pool: string; trust: string } }>(r)).player).toMatchObject({ pool: 'fb', trust: 'signed' });
    // any other secret (the server's test env) refuses the same stub
    expect((await signIn(makeTestApp(), stubSigner(() => t.clock.now(), 'alice'))).status).toBe(401);
  });

  it('a browser clock moved 3 days ahead: accepted in a dev pool moved the same way, stale everywhere else', async () => {
    const t = makeTestApp({ env: { FB_APP_SECRET: DEV_DEFAULTS.FB_APP_SECRET } });
    const ahead = stubSigner(() => t.clock.now() + 3 * DAY, 'bob');
    const stale = await signIn(t, ahead, 'e2e-7');
    expect(stale.status).toBe(401);
    expect((await json<{ error: { code: string } }>(stale)).error.code).toBe('signature_stale');
    expect((await t.fetch('/dev/clock', { method: 'POST', body: JSON.stringify({ devPool: 'e2e-7', offsetMs: 3 * DAY }) })).status).toBe(200);
    expect((await signIn(t, ahead, 'e2e-7')).status).toBe(200);
    // the real pool and another dev pool keep real time
    const real = await signIn(t, ahead);
    expect((await json<{ error: { code: string } }>(real)).error.code).toBe('signature_stale');
    expect((await signIn(t, ahead, 'e2e-8')).status).toBe(401);
    // and a browser on real time still signs in to the moved pool
    expect((await signIn(t, stubSigner(() => t.clock.now(), 'carol'), 'e2e-7')).status).toBe(200);
  });
});
