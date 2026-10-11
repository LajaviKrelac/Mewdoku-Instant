// Owner: G4 (Phase 2e). Identity primitives (spec §1.3, §10.2): base64url, constant-time compares, the FB
// signed player info (our own vectors made with node:crypto), nonces and tokens.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, hmacKey, seededRng, timingSafeEqual, utf8 } from '../../src/core/crypto';
import { verifySignedPlayerInfo } from '../../src/core/fb-signature';
import { playerKey, poolFor, wirePool, devPoolOf, newBracketId, newPlayerCode } from '../../src/core/ids';
import { checkNonce, makeNonce, nonceHash } from '../../src/core/nonce';
import { makeToken, readToken } from '../../src/core/token';
import { compareVersions, isBelowMin } from '../../src/core/version';
import { BRACKET_ID_RE, PLAYER_CODE_RE, NONCE_RE } from '../../src/contract';
import { signPlayerInfo } from '../helpers/harness';

const SECRET = 'app-secret-under-test';
const ALT = 'alt-secret-under-test';
const NOW = 1_800_000_000_000;
const rules = { maxAgeMs: 600_000, maxFutureMs: 120_000, requireIssuedAt: false };
const payload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  algorithm: 'HMAC-SHA256',
  issued_at: Math.floor(NOW / 1000) - 5,
  player_id: '7392816450',
  request_payload: 'n1.nonce.example',
  ...over,
});

describe('base64url and compares', () => {
  it('round-trips and is strict', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 33]) {
      const b = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
      expect(b64urlDecode(b64urlEncode(b))).toEqual(b);
      expect(b64urlEncode(b)).toBe(Buffer.from(b).toString('base64url'));
    }
    expect(b64urlDecode('ab+c')).toBeNull();
    expect(b64urlDecode('abc=')).toBeNull(); // callers strip the tolerated padding
    expect(b64urlDecode('a')).toBeNull();
    expect(b64urlDecode('aQ')).toEqual(new Uint8Array([0x69]));
    expect(b64urlDecode('ab')).toBeNull(); // non-zero trailing bits: not canonical
  });

  it('timingSafeEqual compares whole strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('FB signed player info (spec §1.3 steps 1–3)', async () => {
  const key = await hmacKey(SECRET);
  const alt = await hmacKey(ALT);
  const verify = (sig: string, nonce = 'n1.nonce.example', keys = [key], r = rules) => verifySignedPlayerInfo(sig, nonce, NOW, keys, r);

  it('accepts a valid vector and reports the payload fields', async () => {
    const r = await verify(signPlayerInfo(SECRET, payload()));
    expect(r).toMatchObject({ ok: true, playerId: '7392816450', keyIndex: 0 });
    if (r.ok) expect(r.fields).toEqual(['algorithm', 'issued_at', 'player_id', 'request_payload']);
  });

  it('refuses a tampered payload, a tampered signature and another secret', async () => {
    const good = signPlayerInfo(SECRET, payload());
    const [sig, enc] = good.split('.') as [string, string];
    const tamperedPayload = `${sig}.${Buffer.from(JSON.stringify(payload({ player_id: '1' }))).toString('base64url')}`;
    expect(await verify(tamperedPayload)).toMatchObject({ ok: false, code: 'bad_signature' });
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(await verify(`${flipped}.${enc}`)).toMatchObject({ ok: false, code: 'bad_signature' });
    expect(await verify(signPlayerInfo('other', payload()))).toMatchObject({ ok: false, code: 'bad_signature' });
  });

  it('the MAC is over the payload text AS RECEIVED: a re-encoding of the same JSON fails', async () => {
    const p = payload();
    const original = Buffer.from(JSON.stringify(p)).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(original).digest('base64url');
    const reencoded = Buffer.from(JSON.stringify(p, null, 1)).toString('base64url'); // same JSON value, other text
    expect(await verify(`${sig}.${original}`)).toMatchObject({ ok: true });
    expect(await verify(`${sig}.${reencoded}`)).toMatchObject({ ok: false, code: 'bad_signature' });
  });

  it('tolerates trailing "=" padding on the signature part', async () => {
    const [sig, enc] = signPlayerInfo(SECRET, payload()).split('.') as [string, string];
    expect(await verify(`${sig}=.${enc}`)).toMatchObject({ ok: true });
  });

  it('checks the algorithm (case-insensitive), the player id and the nonce', async () => {
    expect(await verify(signPlayerInfo(SECRET, payload({ algorithm: 'hmac-sha256' })))).toMatchObject({ ok: true });
    expect(await verify(signPlayerInfo(SECRET, payload({ algorithm: 'HMAC-SHA1' })))).toMatchObject({ ok: false, code: 'bad_signature' });
    expect(await verify(signPlayerInfo(SECRET, payload({ algorithm: undefined })))).toMatchObject({ ok: false });
    expect(await verify(signPlayerInfo(SECRET, payload({ player_id: '' })))).toMatchObject({ ok: false });
    expect(await verify(signPlayerInfo(SECRET, payload({ player_id: 'x'.repeat(65) })))).toMatchObject({ ok: false });
    expect(await verify(signPlayerInfo(SECRET, payload({ request_payload: 'another' })))).toMatchObject({ ok: false, code: 'bad_signature' });
  });

  it('issued_at: stale or future is signature_stale; missing passes unless required', async () => {
    const s = Math.floor(NOW / 1000);
    expect(await verify(signPlayerInfo(SECRET, payload({ issued_at: s - 601 })))).toMatchObject({ ok: false, code: 'signature_stale' });
    expect(await verify(signPlayerInfo(SECRET, payload({ issued_at: s + 121 })))).toMatchObject({ ok: false, code: 'signature_stale' });
    expect(await verify(signPlayerInfo(SECRET, payload({ issued_at: s - 599 })))).toMatchObject({ ok: true });
    const noIat = payload({ issued_at: undefined });
    expect(await verify(signPlayerInfo(SECRET, noIat))).toMatchObject({ ok: true, issuedAt: null });
    expect(await verify(signPlayerInfo(SECRET, noIat), undefined, undefined, { ...rules, requireIssuedAt: true })).toMatchObject({ ok: false, code: 'signature_stale' });
  });

  it('the ALT test secret verifies as key 1 (the caller puts such players in fb:synthetic)', async () => {
    expect(await verify(signPlayerInfo(ALT, payload()), undefined, [key, alt])).toMatchObject({ ok: true, keyIndex: 1 });
    expect(await verify(signPlayerInfo(ALT, payload()), undefined, [key])).toMatchObject({ ok: false });
  });

  it('refuses malformed shapes before any crypto', async () => {
    for (const bad of ['', 'nodot', 'a.b.c', `${'a'.repeat(4000)}.${'b'.repeat(200)}`, 'abc$.def', `${Buffer.alloc(31).toString('base64url')}.eyJ9`]) {
      expect(await verify(bad), bad.slice(0, 20)).toMatchObject({ ok: false, code: 'bad_signature' });
    }
  });
});

describe('nonces', async () => {
  const key = await hmacKey('session');
  it('are stateless, MAC-checked, expire, and hash for single use', async () => {
    const { nonce, expiresAt } = await makeNonce(key, NOW, 300_000, seededRng(1));
    expect(nonce).toMatch(NONCE_RE);
    expect(expiresAt).toBe(NOW + 300_000);
    expect(await checkNonce(key, nonce, NOW + 299_999, 300_000)).toEqual({ ok: true, expiresAt });
    expect(await checkNonce(key, nonce, NOW + 300_000, 300_000)).toMatchObject({ ok: false, why: 'expired' });
    expect(await checkNonce(await hmacKey('other'), nonce, NOW, 300_000)).toMatchObject({ ok: false, why: 'mac' });
    const parts = nonce.split('.');
    const forged = `n1.${(NOW + 10 * 3_600_000).toString(36)}.${parts[2]}.${parts[3]}`;
    expect(await checkNonce(key, forged, NOW, 300_000)).toMatchObject({ ok: false });
    expect(await checkNonce(key, 'n1.x.y.z', NOW, 300_000)).toMatchObject({ ok: false, why: 'shape' });
    expect(await nonceHash(nonce)).toHaveLength(22);
    expect(await nonceHash(nonce)).not.toBe(await nonceHash(`${nonce}x`));
  });
});

describe('tokens', async () => {
  const key = await hmacKey('session');
  const claims = { k: 'key', c: '7KQ2M9XD', p: 'fb', t: 'signed' as const, v: '0.2.0', iat: NOW, exp: NOW + 86_400_000 };
  it('verify, expire on the pool clock, and refuse any tampering', async () => {
    const tok = await makeToken(key, claims);
    expect(await readToken(key, tok, () => NOW)).toEqual({ ok: true, claims });
    expect(await readToken(key, tok, () => NOW + 86_400_000)).toEqual({ ok: false, code: 'token_expired' });
    const [v, body, mac] = tok.split('.') as [string, string, string];
    const other = Buffer.from(JSON.stringify({ ...claims, k: 'someone-else' })).toString('base64url');
    expect(await readToken(key, `${v}.${other}.${mac}`, () => NOW)).toEqual({ ok: false, code: 'token_invalid' });
    expect(await readToken(key, `${v}.${body}.${'A'.repeat(32)}`, () => NOW)).toEqual({ ok: false, code: 'token_invalid' });
    expect(await readToken(await hmacKey('rotated'), tok, () => NOW)).toEqual({ ok: false, code: 'token_invalid' });
    expect(await readToken(key, 'Bearer x', () => NOW)).toEqual({ ok: false, code: 'token_invalid' });
    expect(await readToken(key, `${tok}x`.padEnd(2000, 'x'), () => NOW)).toEqual({ ok: false, code: 'token_invalid' });
  });
});

describe('ids and versions', async () => {
  it('player keys never contain the raw id and differ per pool', async () => {
    const pepper = await hmacKey('pepper');
    const a = await playerKey(pepper, 'fb', '7392816450');
    expect(a).toHaveLength(22);
    expect(a).not.toContain('7392816450');
    expect(await playerKey(pepper, 'fb', '7392816450')).toBe(a);
    expect(await playerKey(pepper, 'fb:synthetic', '7392816450')).not.toBe(a);
    expect(await playerKey(await hmacKey('pepper2'), 'fb', '7392816450')).not.toBe(a);
    expect(newPlayerCode(seededRng(3))).toMatch(PLAYER_CODE_RE);
    expect(newBracketId(NOW, seededRng(4))).toMatch(BRACKET_ID_RE);
    expect(poolFor('fb', null, false)).toBe('fb');
    expect(poolFor('fb', null, true)).toBe('fb:synthetic');
    expect(poolFor('web', 'e2e-1', false)).toBe('web:e2e-1');
    expect(wirePool('web:e2e-1')).toBe('web');
    expect(wirePool('fb:synthetic')).toBe('fb');
    expect(devPoolOf('fb')).toBeNull();
    expect(devPoolOf('fb:e2e-1')).toBe('e2e-1');
    expect(utf8('é')).toEqual(new Uint8Array([0xc3, 0xa9]));
  });

  it('compares client versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.2.0-test', '0.2.0')).toBe(0);
    expect(compareVersions('garbage', '0.0.0')).toBe(0);
    expect(isBelowMin('0.1.9', '0.2.0')).toBe(true);
    expect(isBelowMin('1.0', '0.2.0')).toBe(false);
  });
});
