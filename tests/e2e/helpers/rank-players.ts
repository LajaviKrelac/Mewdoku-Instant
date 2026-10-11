// Owner: G1 (Phase 2e)
// Other players for the ranking e2e tests (docs/phase2e/spec.md §10.3, H-1): real sessions through the
// PUBLIC API of the local dev server (there is no seeding route) and real solutions from the bundled packs,
// each test in its own test pool (`devPool`, DEV_ROUTES dev server only) so parallel tests never share a
// bracket or a clock. Web players sign in with a fresh device credential (anon mode); FB players sign the
// session nonce with the e2e FB test secret, exactly as the stub does in the page. The /dev/* helpers move
// a pool's clock, run its cron (finalise its brackets) and set its remote switches.
//   E2E_LADDER_URL      the server the e2e builds were built against (VITE_LADDER_URL); default :8787
//   E2E_FB_APP_SECRET   the dev server's FB_APP_SECRET (the stub's signing secret); default 'e2e-fb-app-secret'
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BracketView, PlayerView, SessionResponse, WinSubmission, WinsResponse } from '../../../src/shared/rank-api';

export const LADDER_URL = (process.env.E2E_LADDER_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
export const FB_SECRET = process.env.E2E_FB_APP_SECRET ?? 'e2e-fb-app-secret';
const CLIENT_VERSION = '0.2.0';

const LEVELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/data/levels');
const manifest = JSON.parse(readFileSync(resolve(LEVELS, 'manifest.json'), 'utf8')) as { version: string };
export const CONTENT_VERSION = manifest.version;
const pack0 = JSON.parse(readFileSync(resolve(LEVELS, 'pack-000.json'), 'utf8')) as { first: number; levels: { i?: number; n: number; s: string }[] };

/** A test pool name (DEV_POOL_RE: [a-z0-9-]{1,32}). */
export function newPool(prefix = 'e2e'): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`.slice(0, 32);
}

const b64url = (b: Buffer): string => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'text/plain;charset=UTF-8';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${LADDER_URL}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function ok<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const r = await call<T>(method, path, body, token);
  if (r.status < 200 || r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/** A level's real solution from the bundled pack (cats = the column of each row's cat, base 36). */
export function levelWin(level: number, o: { fish?: number; mistakes?: number; solveMs?: number } = {}): WinSubmission {
  const rec = pack0.levels.find((r, k) => (r.i ?? pack0.first + k) === level);
  if (!rec) throw new Error(`level ${level} is not in pack-000`);
  const fish = o.fish ?? 3;
  return {
    winId: randomUUID(),
    puzzleId: `L${level}`,
    source: 'pack',
    contentVersion: CONTENT_VERSION,
    cats: rec.s,
    fish,
    mistakes: o.mistakes ?? 3 - fish,
    revives: 0,
    hints: 0,
    kitties: 0,
    mice: 0,
    solveMs: o.solveMs ?? 60_000 + rec.n * 5_000,
    playedAt: Date.now(),
    clientVersion: CLIENT_VERSION,
  };
}

export interface RankPlayer {
  readonly pool: string;
  readonly token: string;
  readonly player: PlayerView;
  /** Wins of these levels (oldest first), each worth `fish` (default 3). */
  win(levels: readonly number[], fish?: number): Promise<WinsResponse>;
  bracket(): Promise<BracketView>;
  heart(bracketId: string, slot: number): Promise<{ status: number }>;
  profile(body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

function playerOf(pool: string, s: SessionResponse): RankPlayer {
  const token = s.token;
  return {
    pool,
    token,
    player: s.player,
    win: (levels, fish = 3) => ok<WinsResponse>('POST', '/v1/wins', { wins: levels.map((l) => levelWin(l, { fish })) }, token),
    bracket: () => ok<BracketView>('GET', '/v1/bracket', undefined, token),
    heart: async (bracketId, slot) => ({ status: (await call('POST', '/v1/hearts', { bracketId, slot }, token)).status }),
    profile: (body) => call('PUT', '/v1/me/profile', body, token),
  };
}

/** An anonymous web player in `pool` (a new device credential). */
export async function webPlayer(pool: string): Promise<RankPlayer> {
  const device = { id: b64url(randomBytes(16)), secret: b64url(randomBytes(32)) };
  const s = await ok<SessionResponse>('POST', '/v1/session', { platform: 'web', device, clientVersion: CLIENT_VERSION, contentVersion: CONTENT_VERSION, devPool: pool });
  return playerOf(pool, s);
}

/** The signed player info FB would give for `nonce` (HMAC-SHA256 with the app secret over the payload text). */
export function signFb(playerId: string, nonce: string, secret = FB_SECRET): string {
  const payload = b64url(Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', issued_at: Math.floor(Date.now() / 1000), player_id: playerId, request_payload: nonce })));
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${sig}.${payload}`;
}

/** An FB player in `pool`: nonce → signature → session. */
export async function fbPlayer(pool: string, playerId = `p${randomBytes(5).toString('hex')}`): Promise<RankPlayer> {
  const n = await ok<{ nonce: string }>('POST', '/v1/session/nonce', {});
  const s = await ok<SessionResponse>('POST', '/v1/session', {
    platform: 'fb',
    playerId,
    signature: signFb(playerId, n.nonce),
    nonce: n.nonce,
    clientVersion: CLIENT_VERSION,
    contentVersion: CONTENT_VERSION,
    devPool: pool,
  });
  return playerOf(pool, s);
}

/** /dev/clock: move the pool's server clock forward. */
export const devAdvance = (pool: string, advanceMs: number): Promise<unknown> => ok('POST', '/dev/clock', { devPool: pool, advanceMs });
/** /dev/cron: finalise the pool's brackets at its clock. */
export const devCron = (pool: string): Promise<unknown> => ok('POST', '/dev/cron', { devPool: pool });
/** /dev/config: the pool's remote switches (the e2e client asks /v1/config?devPool=<pool>). */
export const devSwitches = (pool: string, switches: Record<string, boolean>): Promise<unknown> => ok('POST', '/dev/config', { devPool: pool, switches });

/** The server is up (the ranking e2e tests skip themselves when it is not). */
export async function ladderUp(): Promise<boolean> {
  try {
    const r = await fetch(`${LADDER_URL}/v1/health`);
    return r.ok;
  } catch {
    return false;
  }
}
