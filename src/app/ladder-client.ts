// Owner: G1 (Phase 2e)
// The ranking server's HTTP client (docs/phase2e/spec.md §1.3, §1.4, §2.2, §2.12; CONTRACTS §2, §7): fetch
// with a timeout (ladder.timeoutMs), every response checked with the shared validators (a bad row is
// dropped by them, never repaired into an invented one; a malformed answer is 'invalid_response'), the
// bearer token in MEMORY only (never in a cookie, the save or storage), the server-time offset measured on
// every answer, and one sign-in again on 401 token_invalid / token_expired. Never rejects.
// Sign-in: FB = POST /v1/session/nonce → identity.signedPlayerInfo(nonce) → POST /v1/session; the web
// (anon mode, dev / e2e / staging) = a device credential kept in localStorage['mewdoku.device.v1'] (never in
// the save). No custom request header (critic C-16): the client version travels in the bodies; every body is
// sent as text/plain JSON, so the unauthenticated calls are "simple" requests (no preflight).
// The e2e build may pass a test pool (`?ladderPool=` → devPool, accepted only by a dev server).
import {
  parseApiError,
  parseBracketView,
  parseClaimResponse,
  parseConfigResponse,
  parseHeartResponse,
  parseMeResponse,
  parseNonceResponse,
  parseProfileResponse,
  parseSessionResponse,
  parseWinsResponse,
  type BracketView,
  type ClaimResponse,
  type ConfigResponse,
  type ErrorCode,
  type HeartResponse,
  type MeResponse,
  type ProfileRequest,
  type ProfileResponse,
  type SessionRequest,
  type SessionResponse,
  type WinSubmission,
  type WinsResponse,
} from '../shared/rank-api';
import type { IdentityProvider, PlatformId } from '../platform/types';
import type { Clock } from './clock';
import { cfg, type GameConfig } from './config';

export type LadderFailureCode = ErrorCode | 'network' | 'timeout' | 'invalid_response' | 'not_signed_in' | 'no_api';
export type LadderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: LadderFailureCode; readonly retryAfterMs?: number };

export interface LadderClient {
  /** nonce + identity + session (or the device credential); never rejects. */
  signIn(): Promise<LadderResult<SessionResponse>>;
  submitWins(wins: readonly WinSubmission[], timeoutMs?: number): Promise<LadderResult<WinsResponse>>;
  bracket(): Promise<LadderResult<BracketView>>;
  claim(rewardId: string, double: boolean): Promise<LadderResult<ClaimResponse>>;
  heart(bracketId: string, slot: number): Promise<LadderResult<HeartResponse>>;
  setProfile(p: ProfileRequest): Promise<LadderResult<ProfileResponse>>;
  me(): Promise<LadderResult<MeResponse>>;
  deleteMe(): Promise<LadderResult<true>>;
  /** GET /v1/config (no sign-in). */
  config(): Promise<LadderResult<ConfigResponse>>;
  /** Device clock + the last measured server offset. */
  serverNow(): number;
  /** serverTime − Date.now() of the last answer (0 before any). */
  offsetMs(): number;
  /** Device clock time of the last answer that carried a serverTime, or null. */
  lastServerAt(): number | null;
  signedIn(): boolean;
  /** Forgets the token (after DELETE /v1/me the next call signs in afresh). */
  signOut(): void;
}

/** The device credential of the anonymous web mode (spec §1.3): 22 / 43 base64url characters. */
export interface DeviceCredential {
  readonly id: string;
  readonly secret: string;
}

export const DEVICE_KEY = 'mewdoku.device.v1';

export interface LadderClientDeps {
  /** The API base (VITE_LADDER_URL), no trailing slash. */
  readonly baseUrl: string;
  readonly platformId: PlatformId;
  /** FB: the signed player info. Absent on the web. */
  readonly identity?: IdentityProvider | null;
  /** The web's device credential (anon mode); absent = none. */
  device?(): DeviceCredential | null;
  readonly clock: Pick<Clock, 'now' | 'setTimeout' | 'clearTimeout'>;
  readonly clientVersion: string;
  readonly contentVersion: string;
  /** e2e builds only: the test pool (dev server). */
  readonly devPool?: string | null;
  readonly fetch?: typeof fetch;
  readonly config?: GameConfig;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding. */
export function base64url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]! + B64URL[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] as number) << 16;
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]!;
  }
  return out;
}

/**
 * The web's device credential (spec §1.3, D-2e-5): made once with crypto.getRandomValues (16 bytes → 22
 * characters, 32 bytes → 43) and kept in localStorage['mewdoku.device.v1'], never in the save. Both the read
 * and the write are guarded (storage may be missing); without storage the credential lives for the page.
 */
export function deviceCredential(storage: Pick<Storage, 'getItem' | 'setItem'> | null, cryptoImpl: Pick<Crypto, 'getRandomValues'> | null): DeviceCredential | null {
  try {
    const raw = storage?.getItem(DEVICE_KEY) ?? null;
    if (raw) {
      const v = JSON.parse(raw) as unknown;
      if (v && typeof v === 'object') {
        const { id, secret } = v as Record<string, unknown>;
        if (typeof id === 'string' && /^[A-Za-z0-9_-]{22}$/.test(id) && typeof secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(secret)) return { id, secret };
      }
    }
  } catch {
    // a broken entry is replaced below
  }
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') return null;
  const id = new Uint8Array(16);
  const secret = new Uint8Array(32);
  cryptoImpl.getRandomValues(id);
  cryptoImpl.getRandomValues(secret);
  const cred = { id: base64url(id), secret: base64url(secret) };
  try {
    storage?.setItem(DEVICE_KEY, JSON.stringify(cred));
  } catch {
    // memory only for this page load
  }
  return cred;
}

type Parse<T> = (x: unknown) => T | null;

export function createLadderClient(deps: LadderClientDeps): LadderClient {
  const c = deps.config ?? cfg;
  const doFetch: typeof fetch = deps.fetch ?? ((input, init) => fetch(input, init));
  let token: string | null = null;
  let tokenExpiresAt = 0;
  let offset = 0;
  let lastAt: number | null = null;
  let signing: Promise<LadderResult<SessionResponse>> | null = null;

  const fail = (code: LadderFailureCode, retryAfterMs?: number): LadderResult<never> =>
    retryAfterMs === undefined ? { ok: false, code } : { ok: false, code, retryAfterMs };

  function measure(body: unknown): void {
    if (body && typeof body === 'object' && typeof (body as { serverTime?: unknown }).serverTime === 'number') {
      const st = (body as { serverTime: number }).serverTime;
      if (Number.isFinite(st) && st > 0) {
        const now = deps.clock.now();
        offset = Math.round(st - now);
        lastAt = now;
      }
    }
  }

  /** One HTTP call; never rejects. `auth`: the bearer token (none → not_signed_in). */
  async function raw<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, auth: boolean, parse: Parse<T> | null, timeoutMs = c.ladder.timeoutMs): Promise<LadderResult<T>> {
    if (auth && !token) return fail('not_signed_in');
    const headers: Record<string, string> = {};
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'text/plain;charset=UTF-8';
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    const timer = deps.clock.setTimeout(() => {
      timedOut = true;
      ctl?.abort();
    }, timeoutMs);
    let guard: ReturnType<typeof deps.clock.setTimeout> | null = null;
    try {
      const init: RequestInit = { method, headers, cache: 'no-store', credentials: 'omit', mode: 'cors' };
      if (body !== undefined) init.body = JSON.stringify(body);
      if (ctl) init.signal = ctl.signal;
      const res = await Promise.race([
        doFetch(`${deps.baseUrl}${path}`, init),
        new Promise<never>((_, reject) => {
          // A fetch that ignores the abort (old engines) still ends at the timeout.
          guard = deps.clock.setTimeout(() => {
            timedOut = true;
            reject(new Error('timeout'));
          }, timeoutMs + 50);
        }),
      ]);
      if (res.status === 204) return { ok: true, value: true as unknown as T };
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      measure(json);
      if (!res.ok) {
        const err = parseApiError(json);
        if (!err) return fail('invalid_response');
        return fail(err.error.code, err.error.retryAfterMs);
      }
      if (!parse) return { ok: true, value: true as unknown as T };
      const value = parse(json);
      return value === null ? fail('invalid_response') : { ok: true, value };
    } catch {
      return fail(timedOut ? 'timeout' : 'network');
    } finally {
      deps.clock.clearTimeout(timer);
      deps.clock.clearTimeout(guard);
    }
  }

  /** An authenticated call: signs in first when there is no token; one sign-in again on 401 token_*. */
  async function authed<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, parse: Parse<T> | null, timeoutMs?: number): Promise<LadderResult<T>> {
    if (!token || deps.clock.now() >= tokenExpiresAt) {
      const s = await client.signIn();
      if (!s.ok) return s;
    }
    const first = await raw(method, path, body, true, parse, timeoutMs);
    if (first.ok || (first.code !== 'token_invalid' && first.code !== 'token_expired')) return first;
    token = null;
    const s = await client.signIn();
    if (!s.ok) return s;
    return raw(method, path, body, true, parse, timeoutMs);
  }

  async function doSignIn(): Promise<LadderResult<SessionResponse>> {
    const base = {
      clientVersion: deps.clientVersion,
      contentVersion: deps.contentVersion,
      ...(deps.devPool ? { devPool: deps.devPool } : {}),
    };
    let req: SessionRequest;
    if (deps.platformId === 'fbig') {
      const id = deps.identity;
      if (!id) return fail('no_api');
      const n = await raw('POST', '/v1/session/nonce', {}, false, parseNonceResponse);
      if (!n.ok) return n;
      let signed: Awaited<ReturnType<IdentityProvider['signedPlayerInfo']>> = null;
      try {
        signed = await id.signedPlayerInfo(n.value.nonce);
      } catch {
        signed = null;
      }
      if (!signed) return fail('no_api');
      req = { platform: 'fb', playerId: signed.playerId, signature: signed.signature, nonce: n.value.nonce, ...base };
    } else {
      const device = deps.device?.() ?? null;
      if (!device) return fail('no_api');
      req = { platform: 'web', device: { id: device.id, secret: device.secret }, ...base };
    }
    const r = await raw('POST', '/v1/session', req, false, parseSessionResponse);
    if (r.ok) {
      token = r.value.token;
      // The server's expiry on the device clock, a minute early.
      tokenExpiresAt = r.value.expiresAt - offset - 60_000;
    }
    return r;
  }

  const client: LadderClient = {
    signIn() {
      signing ??= doSignIn().finally(() => {
        signing = null;
      });
      return signing;
    },
    submitWins: (wins, timeoutMs) => authed('POST', '/v1/wins', { wins }, parseWinsResponse, timeoutMs),
    bracket: () => authed('GET', '/v1/bracket', undefined, parseBracketView),
    claim: (rewardId, double) => authed('POST', '/v1/rewards/claim', { rewardId, double }, parseClaimResponse),
    heart: (bracketId, slot) => authed('POST', '/v1/hearts', { bracketId, slot }, parseHeartResponse),
    setProfile: (p) => authed('PUT', '/v1/me/profile', p, parseProfileResponse),
    me: () => authed('GET', '/v1/me', undefined, parseMeResponse),
    deleteMe: () => authed<true>('DELETE', '/v1/me', undefined, null),
    config: () => raw('GET', `/v1/config${deps.devPool ? `?devPool=${encodeURIComponent(deps.devPool)}` : ''}`, undefined, false, parseConfigResponse, c.remote.timeoutMs),
    serverNow: () => deps.clock.now() + offset,
    offsetMs: () => offset,
    lastServerAt: () => lastAt,
    signedIn: () => token !== null && deps.clock.now() < tokenExpiresAt,
    signOut() {
      token = null;
      tokenExpiresAt = 0;
    },
  };
  return client;
}
