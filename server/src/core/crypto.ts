// Owner: G4 (Phase 2e). Byte helpers over WebCrypto (the same API in workerd and Node 22): base64url,
// UTF-8, HMAC-SHA256, SHA-256, constant-time compares and the injectable randomness source.
// No Node or Worker specific global: `crypto.subtle`, `crypto.getRandomValues`, TextEncoder/TextDecoder only.

/** Randomness is injected so tests (and the contract fixtures) can be deterministic. */
export interface Rng {
  bytes(n: number): Uint8Array<ArrayBuffer>;
}

export const cryptoRng: Rng = {
  bytes(n: number): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(n);
    crypto.getRandomValues(out);
    return out;
  },
};

/** xorshift32: deterministic bytes for tests and the dev server's fixtures only (never for secrets in production). */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9;
  return {
    bytes(n: number): Uint8Array<ArrayBuffer> {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5;
        s >>>= 0;
        out[i] = s & 0xff;
      }
      return out;
    },
  };
}

/** WebCrypto's key type, named without a DOM or Worker global (both runtimes type `crypto.subtle`). */
export type HmacKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const ENC = new TextEncoder();

export function utf8(s: string): Uint8Array<ArrayBuffer> {
  const e = ENC.encode(s);
  const out = new Uint8Array(e.length);
  out.set(e);
  return out;
}

/** Strict UTF-8 decode; null on an invalid sequence. */
export function utf8Decode(b: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(b);
  } catch {
    return null;
  }
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_INDEX: Record<string, number> = {};
for (let i = 0; i < B64URL.length; i++) B64URL_INDEX[B64URL.charAt(i)] = i;

/** base64url without padding. */
export function b64urlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63) + B64URL.charAt((n >>> 6) & 63) + B64URL.charAt(n & 63);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] as number) << 16;
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63);
  } else if (rest === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63) + B64URL.charAt((n >>> 6) & 63);
  }
  return out;
}

/**
 * Strict base64url decode (alphabet `A–Z a–z 0–9 - _`, no padding: callers strip a tolerated `=` tail
 * first). Null on any other character, an impossible length (4k + 1) or non-zero trailing bits.
 */
export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64URL_INDEX[s.charAt(i)];
    if (v === undefined) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  if (acc !== 0) return null; // canonical encodings only
  return out;
}

export async function hmacKey(secret: string): Promise<HmacKey> {
  return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmac(key: HmacKey, data: string | Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const sig = await crypto.subtle.sign('HMAC', key, typeof data === 'string' ? utf8(data) : data);
  return new Uint8Array(sig);
}

/** Constant-time HMAC check (WebCrypto's verify). */
export async function hmacVerify(key: HmacKey, mac: Uint8Array<ArrayBuffer>, data: string | Uint8Array<ArrayBuffer>): Promise<boolean> {
  return crypto.subtle.verify('HMAC', key, mac, typeof data === 'string' ? utf8(data) : data);
}

export async function sha256(data: string | Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const d = await crypto.subtle.digest('SHA-256', typeof data === 'string' ? utf8(data) : data);
  return new Uint8Array(d);
}

/**
 * Constant-time string compare (time depends only on the longer length, never on where the strings
 * differ). Used for the admin key, truncated token MACs and device secret hashes.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0);
  return diff === 0;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** `len` random Crockford base-32 characters (player codes). */
export function randomCrockford(rng: Rng, len: number): string {
  const b = rng.bytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CROCKFORD.charAt((b[i] as number) & 31);
  return out;
}

/** `len` random base-36 characters (bracket and flag ids; a slight bias is harmless for ids). */
export function randomBase36(rng: Rng, len: number): string {
  const b = rng.bytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += BASE36.charAt((b[i] as number) % 36);
  return out;
}

/** A random RFC 4122 v4 UUID from `rng` (load and test clients; the game makes its own). */
export function randomUuid(rng: Rng): string {
  const b = rng.bytes(16);
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
