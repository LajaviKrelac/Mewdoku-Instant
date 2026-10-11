// Owner: G4 (Phase 2e). The Node dev server (spec §1.1 `dev:node`): node:http → the same app the Worker runs,
// over node:sqlite with the real migrations, test secrets and DEV_ROUTES=true (test pools, the dev clock,
// per-pool remote switches). What Playwright starts (L0b):
//   npm --prefix server run dev:node -- --port 8787 [--host 127.0.0.1] [--db :memory: | <file>] [--quiet]
// Always strict about the port (exits 1 when it is taken). Values come from, in order: the process
// environment, server/.dev.vars (KEY=VALUE lines, git-ignored), the test defaults below. Never for
// production: the secrets are public test values.
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app';
import type { AppEnv } from '../src/services';
import { NodeSqliteDb } from '../src/store/drivers/node-sqlite';

const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The dev and e2e test values. FB_APP_SECRET is the e2e FB test secret of CONTRACTS §5: the FBInstant stub
 * (tests/fixtures/fbinstant-stub.js, e2e builds only) signs getSignedPlayerInfoAsync with the same value
 * (its default `signing.secret`), so the e2e runs the server's real signature check.
 */
export const DEV_DEFAULTS: Required<Pick<AppEnv, 'FB_APP_SECRET' | 'SESSION_SECRET' | 'ID_PEPPER' | 'ADMIN_KEY'>> & AppEnv = {
  FB_APP_SECRET: 'e2e-fb-app-secret',
  FB_APP_SECRET_ALT: 'mewdoku-dev-synthetic-players-secret-0001',
  SESSION_SECRET: 'mewdoku-dev-session-secret-not-for-production-01',
  ID_PEPPER: 'mewdoku-dev-id-pepper-not-for-production-000001',
  ADMIN_KEY: 'mewdoku-dev-admin-key-0123456789abcdef0123456789',
  DEPLOY_ENV: 'dev',
  RANKING_ENABLED: 'true',
  PERIOD_MODE: 'rolling',
  WEB_MODE: 'anon',
  DEV_ROUTES: 'true',
  ALLOWED_ORIGINS: 'http://127.0.0.1:4173,http://127.0.0.1:4174,http://localhost:4173,http://localhost:4174,http://127.0.0.1:5173,http://localhost:5173,https://localhost:8080,https://127.0.0.1:8080',
  MIN_CLIENT_VERSION: '0.0.0',
  RC_SWITCHES: '{}',
  // e2e makes many players and anonymous devices from 127.0.0.1: the per-isolate buckets and the anonymous
  // per-IP quota are opened wide here (the code paths are the same; the tests of the real limits run in vitest).
  CONFIG_OVERRIDES: JSON.stringify({
    rateLimits: Object.fromEntries(['wins', 'bracket', 'hearts', 'profile', 'claims', 'session', 'me', 'admin'].map((b) => [b, { n: 1_000_000, perMs: 60_000 }])),
    web: { newDevicesPerIpPerDay: 1_000_000 },
  }),
};

const ENV_KEYS = [
  'FB_APP_SECRET',
  'FB_APP_SECRET_ALT',
  'SESSION_SECRET',
  'ID_PEPPER',
  'ADMIN_KEY',
  'DEPLOY_ENV',
  'RANKING_ENABLED',
  'PERIOD_MODE',
  'WEB_MODE',
  'DEV_ROUTES',
  'ALLOWED_ORIGINS',
  'MIN_CLIENT_VERSION',
  'RC_SWITCHES',
  'CONFIG_OVERRIDES',
  'BUILD_SHA',
] as const;

/** KEY=VALUE lines (# comments, optional quotes), as wrangler reads .dev.vars. */
export function parseDevVars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2] as string;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1] as string] = v;
  }
  return out;
}

export function devEnv(processEnv: NodeJS.ProcessEnv = process.env, devVarsPath = join(SERVER_DIR, '.dev.vars')): AppEnv {
  const file = existsSync(devVarsPath) ? parseDevVars(readFileSync(devVarsPath, 'utf8')) : {};
  const env: Record<string, string> = {};
  for (const k of ENV_KEYS) {
    const v = processEnv[k] ?? file[k] ?? (DEV_DEFAULTS as unknown as Record<string, string | undefined>)[k];
    if (v !== undefined) env[k] = v;
  }
  return env as AppEnv;
}

function arg(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function toRequest(req: IncomingMessage, base: string): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || k.toLowerCase() === 'cf-connecting-ip') continue; // never trust a client-sent IP
    headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  headers.set('CF-Connecting-IP', req.socket.remoteAddress ?? 'unknown');
  const method = (req.method ?? 'GET').toUpperCase();
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      const b = c as Buffer;
      size += b.length;
      if (size > 1_048_576) break; // the app answers 413 above 16 KB; never buffer more than 1 MB
      chunks.push(b);
    }
    const all = Buffer.concat(chunks);
    body = new Uint8Array(all.length);
    body.set(all);
  }
  return new Request(new URL(req.url ?? '/', base), body === undefined ? { method, headers } : { method, headers, body });
}

async function send(res: ServerResponse, r: Response): Promise<void> {
  const headers: Record<string, string> = {};
  r.headers.forEach((v, k) => (headers[k] = v));
  res.writeHead(r.status, headers);
  res.end(r.body ? Buffer.from(await r.arrayBuffer()) : undefined);
}

export interface DevServer {
  readonly url: string;
  close(): Promise<void>;
}

export async function startDevServer(opts: { port: number; host: string; db: string; quiet: boolean; env?: AppEnv; cronMs?: number }): Promise<DevServer> {
  const db = new NodeSqliteDb(opts.db);
  db.migrate(join(SERVER_DIR, 'migrations'));
  const env = opts.env ?? devEnv();
  const app = createApp({ db, env, log: opts.quiet ? () => undefined : (line) => console.log(JSON.stringify(line)) });
  const base = `http://${opts.host.includes(':') ? `[${opts.host}]` : opts.host}:${opts.port}`;
  const server = createServer((req, res) => {
    toRequest(req, base)
      .then((r) => app.fetch(r))
      .then((r) => send(res, r))
      .catch((err: unknown) => {
        console.error(err);
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end('{"error":{"code":"unavailable","message":"dev server error"}}');
      });
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => resolveListen());
  });
  const timer = setInterval(() => void app.scheduled().catch((e: unknown) => console.error(e)), opts.cronMs ?? 3_600_000);
  timer.unref();
  return {
    url: base,
    close: () =>
      new Promise<void>((resolveClose) => {
        clearInterval(timer);
        server.close(() => {
          db.close();
          resolveClose();
        });
        server.closeAllConnections();
      }),
  };
}

async function main(argv: readonly string[]): Promise<void> {
  const port = Number(arg(argv, '--port') ?? process.env.PORT ?? 8787);
  const host = arg(argv, '--host') ?? '127.0.0.1';
  const dbPath = arg(argv, '--db') ?? ':memory:';
  const quiet = argv.includes('--quiet');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`--port: ${String(port)}`);
  let srv: DevServer;
  try {
    srv = await startDevServer({ port, host, db: dbPath, quiet });
  } catch (err) {
    const code = (err as { code?: string }).code;
    console.error(code === 'EADDRINUSE' ? `dev:node: port ${port} is in use (strict port)` : String(err));
    process.exit(1);
  }
  const env = devEnv();
  console.log(
    `mewdoku-rank dev server on ${srv.url} (db ${dbPath}, DEV_ROUTES=${env.DEV_ROUTES ?? 'false'}, WEB_MODE=${env.WEB_MODE ?? 'records'}; test secrets, never production)`,
  );
  const stop = (): void => void srv.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
