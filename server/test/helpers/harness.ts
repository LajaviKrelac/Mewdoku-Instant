// Owner: G4 (Phase 2e). Test harness: the real app over node:sqlite (:memory:, the real migrations), a
// FakeClock, seeded randomness and test secrets; signed FB sessions made with node:crypto (our own vectors,
// spec §10.2); test players that act only through the public API (H-1: no seeding path exists).
import { createHmac, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, type App } from '../../src/app';
import { SOLUTIONS } from '../../src/content/generated/solutions';
import { FakeClock } from '../../src/core/clock';
import { seededRng } from '../../src/core/crypto';
import type {
  BracketView,
  ClaimResponse,
  HeartResponse,
  MeResponse,
  ProfileRequest,
  PresenceResponse,
  ProfileResponse,
  SessionResponse,
  WinSubmission,
  WinsResponse,
} from '../../src/contract';
import type { AppEnv, LogLine } from '../../src/services';
import type { SqlBatchResult, SqlDb, SqlStatement } from '../../src/store/sql-db';
import { NodeSqliteDb } from '../../src/store/drivers/node-sqlite';

export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATIONS = join(SERVER_DIR, 'migrations');

/** 2026-11-15 12:00 UTC: inside the daily table, two days into the lantern-walk event (Nov 13–27). */
export const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const CONTENT = 'content-bb8a756dfaf9';

export const TEST_ENV: AppEnv = {
  FB_APP_SECRET: 'test-fb-app-secret',
  SESSION_SECRET: 'test-session-secret',
  ID_PEPPER: 'test-id-pepper',
  ADMIN_KEY: 'test-admin-key-0123456789abcdef0123456789',
  DEPLOY_ENV: 'dev',
  DEV_ROUTES: 'true',
  WEB_MODE: 'anon',
  ALLOWED_ORIGINS: 'http://127.0.0.1:4173,https://*.apps.fbsbx.com',
  MIN_CLIENT_VERSION: '0.0.0',
  RC_SWITCHES: '{"iapIos":false}',
};

/**
 * Records every SQL text the app prepares (the EXPLAIN QUERY PLAN test) and counts the statements (the
 * per-invocation budget test: the app prepares each statement it sends once, alone or in a batch).
 */
export class RecordingDb implements SqlDb {
  readonly seen = new Set<string>();
  prepared = 0;
  constructor(readonly inner: NodeSqliteDb) {}
  prepare(sql: string): SqlStatement {
    this.seen.add(sql);
    this.prepared++;
    return this.inner.prepare(sql);
  }
  batch(stmts: SqlStatement[]): Promise<SqlBatchResult[]> {
    return this.inner.batch(stmts);
  }
}

export interface TestApp {
  readonly app: App;
  readonly db: NodeSqliteDb;
  readonly rec: RecordingDb;
  readonly clock: FakeClock;
  readonly logs: LogLine[];
  readonly env: AppEnv;
  fetch(path: string, init?: RequestInit & { host?: string }): Promise<Response>;
  /** A row count, for assertions on the database itself. */
  count(sql: string, ...values: (string | number)[]): number;
  rows<T = Record<string, unknown>>(sql: string, ...values: (string | number)[]): T[];
}

/** Tests create many players from one address: the isolate buckets are opened wide unless a test asks for the real ones. */
export const WIDE_LIMITS = {
  rateLimits: Object.fromEntries(['wins', 'bracket', 'hearts', 'profile', 'claims', 'session', 'me', 'admin'].map((b) => [b, { n: 1_000_000, perMs: 60_000 }])),
};

export function makeTestApp(opts: { env?: Partial<AppEnv>; overrides?: unknown; now?: number; realLimits?: boolean } = {}): TestApp {
  const db = new NodeSqliteDb(':memory:');
  db.migrate(MIGRATIONS);
  const rec = new RecordingDb(db);
  const clock = new FakeClock(opts.now ?? T0);
  const logs: LogLine[] = [];
  const overrides = opts.realLimits ? (opts.overrides ?? {}) : { ...WIDE_LIMITS, ...((opts.overrides as Record<string, unknown> | undefined) ?? {}) };
  const env: AppEnv = { ...TEST_ENV, CONFIG_OVERRIDES: JSON.stringify(overrides), ...opts.env };
  const app = createApp({ db: rec, env, clock, rng: seededRng(12345), log: (l) => void logs.push(l) });
  return {
    app,
    db,
    rec,
    clock,
    logs,
    env,
    fetch(path: string, init: RequestInit & { host?: string } = {}): Promise<Response> {
      const { host, ...rest } = init;
      return app.fetch(new Request(`http://${host ?? '127.0.0.1:8787'}${path}`, rest));
    },
    count(sql: string, ...values: (string | number)[]): number {
      const r = db.raw.prepare(sql).get(...values) as Record<string, number> | undefined;
      return Number(r ? Object.values(r)[0] : 0);
    },
    rows<T>(sql: string, ...values: (string | number)[]): T[] {
      return db.raw.prepare(sql).all(...values) as T[];
    },
  };
}

const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

/** `<b64url HMAC-SHA256(secret, encPayload)>.<encPayload>` exactly as Meta signs (and the e2e stub). */
export function signPlayerInfo(secret: string, payload: Record<string, unknown>, encPayload = b64url(JSON.stringify(payload))): string {
  const sig = createHmac('sha256', secret).update(encPayload).digest('base64url');
  return `${sig}.${encPayload}`;
}

export const json = async <T = Record<string, unknown>>(r: Response): Promise<T> => (await r.json()) as T;

/** The first board the table holds for an id (what a client with the pack shows). */
export function boardOf(puzzleId: string): string {
  if (puzzleId.startsWith('L')) return (SOLUTIONS.levels.boards.split(',')[Number(puzzleId.slice(1)) - SOLUTIONS.levels.first] ?? '').split('|')[0] as string;
  if (puzzleId.startsWith('D')) {
    const i = Math.round((Date.parse(`${puzzleId.slice(1)}T00:00:00Z`) - Date.parse(`${SOLUTIONS.daily.first}T00:00:00Z`)) / DAY);
    return (SOLUTIONS.daily.boards.split(',')[i] ?? '').split('|')[0] as string;
  }
  const m = /^E([a-z0-9-]+)\/(\d+)$/.exec(puzzleId);
  const e = SOLUTIONS.events.find((x) => x.id === m?.[1]);
  return (e?.boards.split(',')[Number(m?.[2])] ?? '').split('|')[0] as string;
}

/** A wrong king permutation of the same size (shifted rows of a real board). */
export function wrongBoard(cats: string): string {
  const n = cats.length;
  for (let shift = 1; shift < n; shift++) {
    const s = cats.slice(shift) + cats.slice(0, shift);
    if (s !== cats && isKing(s)) return s;
  }
  // reversed is a king permutation too
  return cats.split('').reverse().join('');
}

export function isKing(s: string): boolean {
  const used = new Set<number>();
  let prev = -10;
  for (const ch of s) {
    const c = parseInt(ch, 36);
    if (c >= s.length || used.has(c) || Math.abs(c - prev) < 2) return false;
    used.add(c);
    prev = c;
  }
  return true;
}

/** A king permutation of size n that is no table board (for ids beyond the table). */
export function anyKing(n: number): string {
  // rows 0..n−1: columns 1, 3, 5, … then 0, 2, 4, … (no two adjacent) for n ≥ 4
  const odd: number[] = [];
  const even: number[] = [];
  for (let c = 0; c < n; c++) (c % 2 === 1 ? odd : even).push(c);
  return [...odd, ...even].map((c) => c.toString(36)).join('');
}

export function makeWin(puzzleId: string, over: Partial<WinSubmission> = {}): WinSubmission {
  return {
    winId: randomUUID(),
    puzzleId,
    source: 'pack',
    contentVersion: CONTENT,
    cats: boardOf(puzzleId),
    fish: 3,
    mistakes: 0,
    revives: 0,
    hints: 0,
    kitties: 0,
    mice: 0,
    solveMs: 60_000,
    playedAt: T0,
    clientVersion: '0.2.0',
    ...over,
  };
}

export interface PlayerOpts {
  readonly platform?: 'fb' | 'web';
  readonly devPool?: string;
  readonly secret?: string;
  readonly origin?: string;
  readonly clientVersion?: string;
  /** Leaderboard update: the session asks to join a bracket at once (auto-join). */
  readonly join?: boolean;
}

/** A test client acting through the public API only. */
export class TestPlayer {
  token = '';
  session: SessionResponse | null = null;
  readonly device = { id: b64url(randomUUID().replace(/-/g, '').slice(0, 16)).slice(0, 22).padEnd(22, 'A'), secret: b64url(Buffer.from(randomUUID() + randomUUID())).slice(0, 43) };

  constructor(
    readonly t: TestApp,
    readonly id: string,
    readonly opts: PlayerOpts = {},
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json', ...extra };
    if (this.token) h.authorization = `Bearer ${this.token}`;
    if (this.opts.origin) h.origin = this.opts.origin;
    return h;
  }

  async rawSession(): Promise<Response> {
    const platform = this.opts.platform ?? 'fb';
    let body: Record<string, unknown>;
    if (platform === 'fb') {
      const n = await json<{ nonce: string }>(await this.t.fetch('/v1/session/nonce', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
      const signature = signPlayerInfo(this.opts.secret ?? (this.t.env.FB_APP_SECRET as string), {
        algorithm: 'HMAC-SHA256',
        issued_at: Math.floor(this.t.clock.now() / 1000),
        player_id: this.id,
        request_payload: n.nonce,
      });
      body = { platform: 'fb', playerId: this.id, signature, nonce: n.nonce, clientVersion: this.opts.clientVersion ?? '0.2.0', contentVersion: CONTENT };
    } else {
      body = { platform: 'web', device: this.device, clientVersion: this.opts.clientVersion ?? '0.2.0', contentVersion: CONTENT };
    }
    if (this.opts.devPool) body.devPool = this.opts.devPool;
    if (this.opts.join !== undefined) body.join = this.opts.join;
    return this.t.fetch('/v1/session', { method: 'POST', headers: { 'content-type': 'text/plain', ...(this.opts.origin ? { origin: this.opts.origin } : {}) }, body: JSON.stringify(body) });
  }

  async signIn(): Promise<SessionResponse> {
    const r = await this.rawSession();
    if (r.status !== 200) throw new Error(`session ${r.status}: ${await r.text()}`);
    this.session = await json<SessionResponse>(r);
    this.token = this.session.token;
    return this.session;
  }

  rawWins(wins: readonly WinSubmission[]): Promise<Response> {
    return this.t.fetch('/v1/wins', { method: 'POST', headers: this.headers(), body: JSON.stringify({ wins }) });
  }

  async wins(wins: readonly WinSubmission[]): Promise<WinsResponse> {
    const r = await this.rawWins(wins);
    if (r.status !== 200) throw new Error(`wins ${r.status}: ${await r.text()}`);
    return json<WinsResponse>(r);
  }

  win(puzzleId: string, over: Partial<WinSubmission> = {}): Promise<WinsResponse> {
    return this.wins([makeWin(puzzleId, { playedAt: this.t.clock.now(), ...over })]);
  }

  rawBracket(): Promise<Response> {
    return this.t.fetch('/v1/bracket', { headers: this.headers() });
  }

  async bracket(): Promise<BracketView> {
    const r = await this.rawBracket();
    if (r.status !== 200) throw new Error(`bracket ${r.status}: ${await r.text()}`);
    return json<BracketView>(r);
  }

  rawPresence(state: string): Promise<Response> {
    return this.t.fetch('/v1/presence', { method: 'POST', headers: this.headers(), body: JSON.stringify({ state }) });
  }

  async presence(state: 'online' | 'playing'): Promise<PresenceResponse> {
    const r = await this.rawPresence(state);
    if (r.status !== 200) throw new Error(`presence ${r.status}: ${await r.text()}`);
    return json<PresenceResponse>(r);
  }

  rawClaim(rewardId: string, double = false): Promise<Response> {
    return this.t.fetch('/v1/rewards/claim', { method: 'POST', headers: this.headers(), body: JSON.stringify({ rewardId, double }) });
  }

  async claim(rewardId: string, double = false): Promise<ClaimResponse> {
    const r = await this.rawClaim(rewardId, double);
    if (r.status !== 200) throw new Error(`claim ${r.status}: ${await r.text()}`);
    return json<ClaimResponse>(r);
  }

  rawHeart(bracketId: string, slot: number): Promise<Response> {
    return this.t.fetch('/v1/hearts', { method: 'POST', headers: this.headers(), body: JSON.stringify({ bracketId, slot }) });
  }

  async heart(bracketId: string, slot: number): Promise<HeartResponse> {
    const r = await this.rawHeart(bracketId, slot);
    if (r.status !== 200) throw new Error(`heart ${r.status}: ${await r.text()}`);
    return json<HeartResponse>(r);
  }

  rawProfile(p: ProfileRequest | Record<string, unknown>): Promise<Response> {
    return this.t.fetch('/v1/me/profile', { method: 'PUT', headers: this.headers(), body: JSON.stringify(p) });
  }

  async profile(p: ProfileRequest): Promise<ProfileResponse> {
    const r = await this.rawProfile(p);
    if (r.status !== 200) throw new Error(`profile ${r.status}: ${await r.text()}`);
    return json<ProfileResponse>(r);
  }

  rawMe(method: 'GET' | 'DELETE' = 'GET'): Promise<Response> {
    return this.t.fetch('/v1/me', { method, headers: this.headers() });
  }

  async me(): Promise<MeResponse> {
    return json<MeResponse>(await this.rawMe());
  }

  code(): string {
    return this.session?.player.code ?? '';
  }

  key(): string {
    return this.t.rows<{ key: string }>('SELECT key FROM players WHERE code = ?', this.code())[0]?.key ?? '';
  }
}

export function admin(t: TestApp, method: string, path: string, key = t.env.ADMIN_KEY as string): Promise<Response> {
  return t.fetch(`/admin/v1/${path}`, { method, headers: { authorization: `Bearer ${key}` } });
}

/** n signed-in players (fb), each with one accepted win at `level` (distinct levels keep the baseline honest). */
export async function playersWithWins(t: TestApp, n: number, prefix = 'p', firstLevel = 2): Promise<TestPlayer[]> {
  const out: TestPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const p = new TestPlayer(t, `${prefix}${i}`);
    await p.signIn();
    await p.win(`L${firstLevel + i}`);
    out.push(p);
  }
  return out;
}
