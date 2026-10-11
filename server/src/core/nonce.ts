// Owner: G4 (Phase 2e). Stateless single-use nonces for the FB signature (spec §1.3): issuing one costs no
// DB write; `n1.<expiry ms, base 36>.<16 random chars>.<22-char HMAC>` under SESSION_SECRET (domain
// "nonce:"). Single use is the session handler's `seen_nonces` insert, keyed by nonceHash().
import { b64urlEncode, hmac, sha256, timingSafeEqual, type HmacKey, type Rng } from './crypto';

const NONCE_PARTS_RE = /^n1\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})$/;

async function nonceMac(key: HmacKey, exp36: string, rand: string): Promise<string> {
  return b64urlEncode(await hmac(key, `nonce:n1.${exp36}.${rand}`)).slice(0, 22);
}

export async function makeNonce(key: HmacKey, now: number, ttlMs: number, rng: Rng): Promise<{ nonce: string; expiresAt: number }> {
  const expiresAt = now + ttlMs;
  const exp36 = expiresAt.toString(36);
  const rand = b64urlEncode(rng.bytes(12));
  return { nonce: `n1.${exp36}.${rand}.${await nonceMac(key, exp36, rand)}`, expiresAt };
}

export type NonceCheck = { readonly ok: true; readonly expiresAt: number } | { readonly ok: false; readonly why: 'shape' | 'mac' | 'expired' | 'future' };

/** Our MAC, then the expiry (never longer than `ttlMs` ahead: a far-future expiry is not ours). */
export async function checkNonce(key: HmacKey, nonce: string, now: number, ttlMs: number): Promise<NonceCheck> {
  const m = NONCE_PARTS_RE.exec(nonce);
  if (!m) return { ok: false, why: 'shape' };
  const exp36 = m[1] as string;
  const mac = await nonceMac(key, exp36, m[2] as string);
  if (!timingSafeEqual(mac, m[3] as string)) return { ok: false, why: 'mac' };
  const expiresAt = parseInt(exp36, 36);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return { ok: false, why: 'expired' };
  if (expiresAt > now + ttlMs + 60_000) return { ok: false, why: 'future' };
  return { ok: true, expiresAt };
}

/** The `seen_nonces` key: 132 bits of SHA-256 of the whole nonce. */
export async function nonceHash(nonce: string): Promise<string> {
  return b64urlEncode(await sha256(`seen:${nonce}`)).slice(0, 22);
}
