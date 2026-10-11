// Owner: G4 (Phase 2e). Verifies FBInstant.player.getSignedPlayerInfoAsync(nonce).getSignature()
// (spec §1.3, D-2e-2): "<b64url HMAC-SHA256>.<b64url JSON payload>", MAC over the payload's base64url text
// AS RECEIVED with the app secret. PURE apart from WebCrypto; the caller passes the time and the keys.
import { MAX_SIGNATURE_LENGTH } from '../contract';
import { b64urlDecode, hmacVerify, utf8, utf8Decode, type HmacKey } from './crypto';

export interface SignatureRules {
  readonly maxAgeMs: number; // issued_at may be at most this old
  readonly maxFutureMs: number; // … and at most this far ahead of the server clock
  readonly requireIssuedAt: boolean; // a missing issued_at is `signature_stale` when true
}

export type SignatureCheck =
  | { readonly ok: true; readonly playerId: string; readonly issuedAt: number | null; readonly keyIndex: number; readonly fields: readonly string[] }
  | { readonly ok: false; readonly code: 'bad_signature' | 'signature_stale'; readonly why: string };

const SHAPE_RE = /^[A-Za-z0-9_-]+={0,2}\.[A-Za-z0-9_-]+={0,2}$/;

const bad = (why: string): SignatureCheck => ({ ok: false, code: 'bad_signature', why });

/**
 * Steps 1–3 of spec §1.3 (step 4, body.playerId === player_id, and step 5, the nonce's own MAC, expiry
 * and single use, are the session handler's). `keys` are tried in order (the app secret, then on staging
 * and dev the ALT test secret); `keyIndex` says which one verified.
 */
export async function verifySignedPlayerInfo(
  signature: string,
  nonce: string,
  now: number,
  keys: readonly HmacKey[],
  rules: SignatureRules,
): Promise<SignatureCheck> {
  if (typeof signature !== 'string' || signature.length > MAX_SIGNATURE_LENGTH || !SHAPE_RE.test(signature)) return bad('shape');
  const dot = signature.indexOf('.');
  const encSig = signature.slice(0, dot).replace(/=+$/, '');
  const encPayloadReceived = signature.slice(dot + 1);
  const encPayload = encPayloadReceived.replace(/=+$/, '');
  const mac = b64urlDecode(encSig);
  if (mac === null || mac.length !== 32) return bad('mac length');
  // The MAC first: nothing of an unauthenticated payload is looked at.
  const data = utf8(encPayloadReceived);
  let keyIndex = -1;
  for (let i = 0; i < keys.length; i++) {
    if (await hmacVerify(keys[i] as HmacKey, mac, data)) {
      keyIndex = i;
      break;
    }
  }
  if (keyIndex < 0) return bad('mac');
  const raw = b64urlDecode(encPayload);
  const text = raw === null ? null : utf8Decode(raw);
  if (text === null) return bad('payload encoding');
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return bad('payload json');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return bad('payload shape');
  const p = payload as Record<string, unknown>;
  if (typeof p.algorithm !== 'string' || p.algorithm.toUpperCase() !== 'HMAC-SHA256') return bad('algorithm');
  if (typeof p.player_id !== 'string' || p.player_id.length < 1 || p.player_id.length > 64) return bad('player_id');
  if (p.request_payload !== nonce) return bad('request_payload');
  let issuedAt: number | null = null;
  if (p.issued_at !== undefined) {
    if (typeof p.issued_at !== 'number' || !Number.isFinite(p.issued_at)) return bad('issued_at');
    issuedAt = p.issued_at * 1000;
    if (issuedAt < now - rules.maxAgeMs || issuedAt > now + rules.maxFutureMs) return { ok: false, code: 'signature_stale', why: 'issued_at window' };
  } else if (rules.requireIssuedAt) {
    return { ok: false, code: 'signature_stale', why: 'issued_at missing' };
  }
  return { ok: true, playerId: p.player_id, issuedAt, keyIndex, fields: Object.keys(p).sort() };
}
