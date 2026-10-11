// Owner: G4 (Phase 2e). Our bearer token (spec §1.3): `v1.<b64url(JSON claims)>.<32 chars of
// b64url(HMAC(SESSION_SECRET, "token:v1." + part 2))>`, compared in constant time. The client keeps it in
// memory only. Every authenticated handler still reads the player row (deleted → 401, suspended → 403).
import { MAX_TOKEN_LENGTH, type Trust } from '../contract';
import { b64urlDecode, b64urlEncode, hmac, timingSafeEqual, utf8, utf8Decode, type HmacKey } from './crypto';

export interface TokenClaims {
  readonly k: string; // player key
  readonly c: string; // player code (for logs)
  readonly p: string; // pool ('fb', 'web', 'fb:synthetic', 'fb:<devPool>', 'web:<devPool>')
  readonly t: Trust;
  readonly v: string; // client version at sign-in
  readonly iat: number; // ms
  readonly exp: number; // ms
}

async function tokenMac(key: HmacKey, body: string): Promise<string> {
  return b64urlEncode(await hmac(key, `token:v1.${body}`)).slice(0, 32);
}

export async function makeToken(key: HmacKey, claims: TokenClaims): Promise<string> {
  const body = b64urlEncode(utf8(JSON.stringify(claims)));
  return `v1.${body}.${await tokenMac(key, body)}`;
}

export type TokenCheck = { readonly ok: true; readonly claims: TokenClaims } | { readonly ok: false; readonly code: 'token_invalid' | 'token_expired' };

const TOKEN_RE = /^v1\.([A-Za-z0-9_-]{8,900})\.([A-Za-z0-9_-]{32})$/;

/** `nowFor(pool)`: the clock of the token's pool (dev test pools have their own; spec §1.3). */
export async function readToken(key: HmacKey, token: string, nowFor: (pool: string) => number): Promise<TokenCheck> {
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, code: 'token_invalid' };
  const m = TOKEN_RE.exec(token);
  if (!m) return { ok: false, code: 'token_invalid' };
  const body = m[1] as string;
  if (!timingSafeEqual(await tokenMac(key, body), m[2] as string)) return { ok: false, code: 'token_invalid' };
  const raw = b64urlDecode(body);
  const text = raw === null ? null : utf8Decode(raw);
  let c: unknown = null;
  try {
    c = text === null ? null : JSON.parse(text);
  } catch {
    c = null;
  }
  if (typeof c !== 'object' || c === null) return { ok: false, code: 'token_invalid' };
  const x = c as Record<string, unknown>;
  if (
    typeof x.k !== 'string' ||
    typeof x.c !== 'string' ||
    typeof x.p !== 'string' ||
    (x.t !== 'signed' && x.t !== 'anon') ||
    typeof x.v !== 'string' ||
    typeof x.iat !== 'number' ||
    typeof x.exp !== 'number'
  ) {
    return { ok: false, code: 'token_invalid' };
  }
  if (x.exp <= nowFor(x.p)) return { ok: false, code: 'token_expired' };
  return { ok: true, claims: { k: x.k, c: x.c, p: x.p, t: x.t, v: x.v, iat: x.iat, exp: x.exp } };
}
