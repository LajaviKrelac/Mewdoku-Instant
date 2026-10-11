// Owner: lead (Phase 2e, docs/phase2e/spec.md §8.2 step 4, §11.6; gates G-SRV-1 and G-SRV-2). The ranking probe's
// steps, free of the DOM so tests/unit/platform/rank-probe.spec.ts can drive them with a fake SDK and a fake fetch.
// Inside the real Instant Game (a private FB build) it asks the STAGING ranking server, exactly as the game's ladder
// client does (text/plain JSON, credentials omitted, mode cors, no-store):
//   1 health      GET  /v1/health                      reachable from this surface (G-SRV-1)
//   2 config      GET  /v1/config                      the remote switches
//   3 nonce       POST /v1/session/nonce               a server nonce
//   4 signed info player.getSignedPlayerInfoAsync(nonce) listed by getSupportedAPIs? the payload's FIELD NAMES,
//                 `algorithm`, whether `issued_at` is there and its skew, request_payload === nonce (G-SRV-2)
//   5 session     POST /v1/session                     the server verifies that signature with the app secret
//   6 origin      the page's origin: the Origin header the browser sends with these requests ('null' in an opaque
//                 sandbox); the Worker logs every origin it refuses
// Privacy: never shown or copied — the player id, the signature, the token, the player code (only field names,
// statuses, error codes and timings). Every network step has its own timeout; a failed step never throws.

export type LineState = 'ok' | 'fail' | 'skip' | 'info';

export interface ProbeLine {
  readonly step: 'health' | 'config' | 'nonce' | 'signed' | 'session' | 'origin';
  readonly state: LineState;
  readonly text: string;
}

export interface ProbeReport {
  /** One header line: probe and SDK versions, platform, locale, the target, the time. */
  readonly header: string;
  readonly lines: readonly ProbeLine[];
}

/** The subset of FBInstant the probe calls (SDK 8.0). */
export interface ProbeSdk {
  getSDKVersion(): string;
  getPlatform(): string | null;
  getLocale(): string | null;
  getSupportedAPIs(): string[];
  readonly player: {
    getSignedPlayerInfoAsync(requestMetadata?: string): Promise<{ getPlayerID(): string; getSignature(): string }>;
  };
}

export interface ProbeDeps {
  /** The ranking server's API base (staging), no trailing slash. */
  readonly baseUrl: string;
  readonly sdk: ProbeSdk | null;
  readonly fetch: typeof fetch;
  readonly now: () => number;
  /** self.origin / location.origin of the page ('null' for an opaque origin). */
  readonly origin: string;
  readonly referrer: string;
  readonly probeVersion: string;
  readonly clientVersion: string;
  readonly contentVersion: string;
  readonly timeoutMs?: number;
}

interface Answer {
  readonly status: number; // 0 = no readable response (network, CORS, timeout)
  readonly body: unknown;
  readonly ms: number;
  readonly why?: string;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The error code of an ApiError body ({ error: { code } }), else ''. */
function errorCode(body: unknown): string {
  return isObj(body) && isObj(body.error) && typeof body.error.code === 'string' ? body.error.code : '';
}

function describe(a: Answer): string {
  if (a.status === 0) return `no response (${a.why ?? 'network or CORS'}) after ${a.ms} ms`;
  const code = errorCode(a.body);
  return `HTTP ${a.status}${code ? ` ${code}` : ''} in ${a.ms} ms`;
}

/** base64url → UTF-8 text (padding optional), or null. */
export function b64urlText(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** What the probe may say about a signature: its shape and the payload's field names, never a value that identifies. */
export interface SignatureFacts {
  readonly parts: number;
  readonly fields: readonly string[];
  readonly algorithm: string | null;
  readonly issuedAt: number | null;
  readonly requestPayloadMatches: boolean;
  readonly payloadReadable: boolean;
}

export function signatureFacts(signature: string, nonce: string): SignatureFacts {
  const parts = signature.split('.');
  const payloadText = parts.length === 2 ? b64urlText(parts[1] as string) : null;
  let payload: unknown = null;
  try {
    payload = payloadText === null ? null : JSON.parse(payloadText);
  } catch {
    payload = null;
  }
  if (!isObj(payload)) return { parts: parts.length, fields: [], algorithm: null, issuedAt: null, requestPayloadMatches: false, payloadReadable: false };
  return {
    parts: parts.length,
    fields: Object.keys(payload).sort(),
    algorithm: typeof payload.algorithm === 'string' ? payload.algorithm : null,
    issuedAt: typeof payload.issued_at === 'number' ? payload.issued_at : null,
    requestPayloadMatches: payload.request_payload === nonce,
    payloadReadable: true,
  };
}

export async function runProbe(d: ProbeDeps): Promise<ProbeReport> {
  const timeoutMs = d.timeoutMs ?? 10_000;
  const lines: ProbeLine[] = [];
  const add = (step: ProbeLine['step'], state: LineState, text: string): void => {
    lines.push({ step, state, text });
  };

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
    const t0 = d.now();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const headers: Record<string, string> = {};
      if (body !== undefined) headers['Content-Type'] = 'text/plain;charset=UTF-8';
      const res = await d.fetch(`${d.baseUrl}${path}`, {
        method,
        headers,
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(ctrl ? { signal: ctrl.signal } : {}),
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text.slice(0, 80);
      }
      return { status: res.status, body: parsed, ms: Math.round(d.now() - t0) };
    } catch (err) {
      const aborted = (err as { name?: string } | null)?.name === 'AbortError';
      return { status: 0, body: null, ms: Math.round(d.now() - t0), why: aborted ? `timeout ${timeoutMs} ms` : 'network or CORS refused' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const sdk = d.sdk;
  let apis: string[] = [];
  try {
    apis = sdk ? sdk.getSupportedAPIs() : [];
  } catch {
    apis = [];
  }
  const safe = (f: () => string | null): string => {
    try {
      return f() ?? '?';
    } catch {
      return '?';
    }
  };
  const header =
    `Mewdoku rank probe ${d.probeVersion} · SDK ${sdk ? safe(() => sdk.getSDKVersion()) : 'missing'} · platform ${sdk ? safe(() => sdk.getPlatform()) : '?'}` +
    ` · locale ${sdk ? safe(() => sdk.getLocale()) : '?'} · server ${d.baseUrl} · ${new Date(d.now()).toISOString()}`;

  // 1 health
  const h = await call('GET', '/v1/health');
  if (h.status === 200 && isObj(h.body)) {
    const b = h.body;
    add('health', b.ok === true ? 'ok' : 'fail', `GET /v1/health → HTTP 200 in ${h.ms} ms (ok ${String(b.ok)}, server ${String(b.version)}, db ${String(b.db)})`);
  } else add('health', 'fail', `GET /v1/health → ${describe(h)}`);

  // 2 config
  const c = await call('GET', '/v1/config');
  if (c.status === 200 && isObj(c.body) && isObj(c.body.switches)) {
    const sw = Object.entries(c.body.switches).map(([k, v]) => `${k}=${String(v)}`);
    add('config', 'ok', `GET /v1/config → HTTP 200 in ${c.ms} ms (switches: ${sw.length ? sw.join(', ') : 'none set'})`);
  } else add('config', 'fail', `GET /v1/config → ${describe(c)}`);

  // 3 nonce
  const n = await call('POST', '/v1/session/nonce', {});
  const nonce = n.status === 200 && isObj(n.body) && typeof n.body.nonce === 'string' ? n.body.nonce : null;
  const serverTime = n.status === 200 && isObj(n.body) && typeof n.body.serverTime === 'number' ? n.body.serverTime : null;
  if (nonce) {
    const exp = isObj(n.body) && typeof n.body.expiresAt === 'number' && serverTime !== null ? Math.round((n.body.expiresAt - serverTime) / 1000) : null;
    add('nonce', 'ok', `POST /v1/session/nonce → HTTP 200 in ${n.ms} ms (a nonce${exp !== null ? `, valid ${exp} s` : ''})`);
  } else add('nonce', 'fail', `POST /v1/session/nonce → ${describe(n)}`);

  // 4 signed info
  const listed = apis.includes('player.getSignedPlayerInfoAsync');
  let signature: string | null = null;
  let playerId: string | null = null;
  if (!sdk) add('signed', 'fail', 'FBInstant is missing: open the probe as an Instant Game build');
  else if (!nonce) add('signed', 'skip', `getSignedPlayerInfoAsync not called (no nonce); listed by getSupportedAPIs: ${listed ? 'yes' : 'NO'}`);
  else {
    const t0 = d.now();
    try {
      const info = await sdk.player.getSignedPlayerInfoAsync(nonce);
      signature = info.getSignature();
      playerId = info.getPlayerID();
      const f = signatureFacts(signature, nonce);
      const skew = f.issuedAt !== null && serverTime !== null ? Math.round(f.issuedAt - serverTime / 1000) : null;
      const good = f.parts === 2 && f.payloadReadable && f.requestPayloadMatches && /^hmac-sha256$/i.test(f.algorithm ?? '');
      add(
        'signed',
        good ? 'ok' : 'fail',
        `getSignedPlayerInfoAsync → in ${Math.round(d.now() - t0)} ms; listed by getSupportedAPIs: ${listed ? 'yes' : 'NO'}; ` +
          `signature ${f.parts} part${f.parts === 1 ? '' : 's'} (<sig>.<payload> expected 2); payload fields: ${f.fields.length ? f.fields.join(', ') : 'unreadable'}; ` +
          `algorithm ${f.algorithm ?? 'missing'}; issued_at ${f.issuedAt === null ? 'MISSING' : `present${skew !== null ? ` (${skew >= 0 ? '+' : ''}${skew} s vs the server)` : ''}`}; ` +
          `request_payload = the nonce: ${f.requestPayloadMatches ? 'yes' : 'NO'}`,
      );
    } catch (err) {
      const code = isObj(err) && typeof err.code === 'string' ? err.code : String((err as Error | null)?.message ?? err).slice(0, 60);
      add('signed', 'fail', `getSignedPlayerInfoAsync rejected (${code}) after ${Math.round(d.now() - t0)} ms; listed by getSupportedAPIs: ${listed ? 'yes' : 'NO'}`);
    }
  }

  // 5 session
  if (signature && nonce && playerId !== null) {
    const s = await call('POST', '/v1/session', { platform: 'fb', playerId, signature, nonce, clientVersion: d.clientVersion, contentVersion: d.contentVersion });
    if (s.status === 200 && isObj(s.body) && typeof s.body.token === 'string') {
      const hours = typeof s.body.expiresAt === 'number' && typeof s.body.serverTime === 'number' ? Math.round((s.body.expiresAt - s.body.serverTime) / 3_600_000) : null;
      add('session', 'ok', `POST /v1/session → HTTP 200 in ${s.ms} ms (the server verified the signature; a token${hours !== null ? ` for ${hours} h` : ''})`);
    } else add('session', 'fail', `POST /v1/session → ${describe(s)}`);
  } else add('session', 'skip', 'POST /v1/session not sent (no signature)');

  // 6 origin
  let ref = '';
  try {
    ref = d.referrer ? new URL(d.referrer).origin : '';
  } catch {
    ref = '';
  }
  add('origin', 'info', `page origin (sent as the Origin header): ${d.origin || '(empty)'}${ref ? `; referrer origin ${ref}` : ''}`);

  return { header, lines };
}

/** The copyable text: the header, then one line per step. */
export function reportText(r: ProbeReport): string {
  const mark: Record<LineState, string> = { ok: 'OK  ', fail: 'FAIL', skip: 'SKIP', info: 'INFO' };
  return [r.header, ...r.lines.map((l, i) => `${i + 1}. ${mark[l.state]} ${l.step}: ${l.text}`)].join('\n');
}
