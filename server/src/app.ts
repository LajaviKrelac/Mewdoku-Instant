// Owner: G4 (Phase 2e). The server as a function: createApp(deps) → { fetch, scheduled }. The Worker
// (worker.ts) builds it from its bindings once per isolate; the Node dev server (dev/serve.ts) and the tests
// build it over node:sqlite with a fake or real clock. Routing, CORS, the kill switch, error mapping and the
// one JSON log line per request (spec §1.4, §1.14) live here.
import { createLookup, type ContentLookup } from './content/lookup';
import { SOLUTIONS } from './content/generated/solutions';
import { systemClock, type Clock } from './core/clock';
import { DEFAULT_CONFIG, loadConfig, type ServerConfig } from './core/config';
import { cryptoRng, randomBase36, type Rng } from './core/crypto';
import { cronOptionsFor, runCron, type CronReport } from './cron';
import { adminRoute } from './handlers/admin';
import { getBracket } from './handlers/bracket';
import { getConfig } from './handlers/config';
import { devRoute } from './handlers/dev';
import { getHealth } from './handlers/health';
import { putProfile } from './handlers/profile';
import { deleteMe, getMe } from './handlers/me';
import { postClaim } from './handlers/rewards';
import { postHeart } from './handlers/hearts';
import { postPresence } from './handlers/presence';
import { postNonce, postSession } from './handlers/session';
import { postWins } from './handlers/wins';
import { devAllowed, type Ctx } from './http/context';
import { corsHeaders, originAllowed, preflightHeaders } from './http/cors';
import { ApiFail, errorResponse, noContent } from './http/errors';
import { makeServices, noMetrics, type AppEnv, type LogLine, type Metrics, type Services } from './services';
import type { SqlDb } from './store/sql-db';
import { SqlStore } from './store/sql-store';

export interface AppDeps {
  readonly db: SqlDb;
  readonly env: AppEnv;
  readonly clock?: Clock;
  readonly rng?: Rng;
  readonly content?: ContentLookup;
  readonly metrics?: Metrics;
  /** One JSON line per request (default: console.log). */
  readonly log?: (line: LogLine) => void;
  /** The defaults the env variables are applied over (tests). */
  readonly baseConfig?: ServerConfig;
}

export interface App {
  fetch(req: Request): Promise<Response>;
  /** `cron`: the trigger's pattern (wrangler.toml); absent (tests, dev server): the hour decides the sweep. */
  scheduled(at?: number, cron?: string): Promise<CronReport>;
  readonly services: Services;
}

type Handler = (ctx: Ctx) => Promise<Response> | Response;

/** The /v1 routes; `killable`: answers 503 `disabled` while RANKING_ENABLED is false. */
const V1: Record<string, { readonly handler: Handler; readonly killable: boolean }> = {
  'GET /v1/health': { handler: getHealth, killable: false },
  'GET /v1/config': { handler: getConfig, killable: false },
  'POST /v1/session/nonce': { handler: postNonce, killable: true },
  'POST /v1/session': { handler: postSession, killable: true },
  'POST /v1/wins': { handler: postWins, killable: true },
  'GET /v1/bracket': { handler: getBracket, killable: true },
  'POST /v1/presence': { handler: postPresence, killable: true },
  'POST /v1/rewards/claim': { handler: postClaim, killable: true },
  'POST /v1/hearts': { handler: postHeart, killable: true },
  'PUT /v1/me/profile': { handler: putProfile, killable: true },
  'GET /v1/me': { handler: getMe, killable: true },
  'DELETE /v1/me': { handler: deleteMe, killable: true },
};

export function createApp(deps: AppDeps): App {
  const log = deps.log ?? ((line: LogLine) => console.log(JSON.stringify(line)));
  const { cfg, problems } = loadConfig(deps.env, deps.baseConfig ?? DEFAULT_CONFIG);
  if (problems.length > 0) log({ level: 'warn', msg: 'config', problems });
  const s = makeServices({
    cfg,
    configProblems: problems,
    env: deps.env,
    store: new SqlStore(deps.db),
    content: deps.content ?? createLookup(SOLUTIONS),
    clock: deps.clock ?? systemClock,
    rng: deps.rng ?? cryptoRng,
    metrics: deps.metrics ?? noMetrics,
    log,
  });

  async function route(ctx: Ctx): Promise<Response> {
    const { req, url } = ctx;
    const method = req.method.toUpperCase();
    const path = url.pathname;
    if (path.startsWith('/admin/v1/')) {
      // Never CORS (spec §1.4); a browser cannot read these answers cross-origin, and the key is not a cookie.
      ctx.fields.route = '/admin/v1';
      return (await adminRoute(ctx, method, path.slice('/admin/v1/'.length))) ?? errorResponse('not_found', 'no route', ctx.serverTime);
    }
    if (path.startsWith('/dev/')) {
      ctx.fields.route = path;
      const origin = req.headers.get('Origin');
      if (!devAllowed(ctx) || (origin !== null && !originAllowed(origin, s.cfg.allowedOrigins))) return errorResponse('not_found', 'no route', ctx.serverTime);
      return (await devRoute(ctx, method, path.slice('/dev/'.length))) ?? errorResponse('not_found', 'no route', ctx.serverTime);
    }
    const origin = req.headers.get('Origin');
    if (origin !== null && !originAllowed(origin, s.cfg.allowedOrigins)) {
      s.metrics.count('cors_denied', origin.slice(0, 96));
      ctx.fields.deniedOrigin = origin.slice(0, 200); // G-SRV-1: the real origins the FB surfaces send
      return errorResponse('origin_not_allowed', 'origin not allowed', ctx.serverTime, undefined, { Vary: 'Origin' });
    }
    const cors = origin === null ? { Vary: 'Origin' } : corsHeaders(origin);
    const withCors = (res: Response): Response => {
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    };
    if (method === 'OPTIONS') {
      ctx.fields.route = `OPTIONS ${path}`;
      return noContent(origin === null ? { Vary: 'Origin' } : preflightHeaders(origin));
    }
    const key = `${method === 'HEAD' ? 'GET' : method} ${path.replace(/\/+$/, '')}`;
    ctx.fields.route = key;
    const r = V1[key];
    if (!r) return withCors(errorResponse('not_found', 'no route', ctx.serverTime));
    if (r.killable && !s.cfg.rankingEnabled) {
      s.metrics.count('kill_switch');
      return withCors(errorResponse('disabled', 'ranking disabled', ctx.serverTime, s.cfg.killRetryAfterMs));
    }
    try {
      return withCors(await r.handler(ctx));
    } catch (err) {
      if (err instanceof ApiFail) return withCors(errorResponse(err.code, err.message, ctx.serverTime, err.retryAfterMs));
      throw err;
    }
  }

  return {
    services: s,
    async fetch(req: Request): Promise<Response> {
      const t0 = Date.now();
      const url = new URL(req.url);
      const fields: LogLine = {};
      const ctx: Ctx = { s, req, url, ip: req.headers.get('CF-Connecting-IP') ?? 'unknown', fields, serverTime: s.clock.now() };
      let res: Response;
      try {
        res = await route(ctx);
      } catch (err) {
        if (err instanceof ApiFail) {
          res = errorResponse(err.code, err.message, ctx.serverTime, err.retryAfterMs);
        } else {
          // D1 down, over quota, a bug: the client keeps its queue and shows records (spec §1.13).
          s.metrics.count('d1_error');
          fields.err = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
          res = errorResponse('unavailable', 'temporarily unavailable', ctx.serverTime, 30_000);
          const origin = req.headers.get('Origin');
          if (origin !== null && url.pathname.startsWith('/v1/') && originAllowed(origin, s.cfg.allowedOrigins)) {
            for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
          }
        }
      }
      s.metrics.count('req', String(res.status));
      // One line, no IP, raw id, nickname, token or signature (spec §1.14).
      log({ t: ctx.serverTime, rid: randomBase36(s.rng, 8), route: fields.route ?? url.pathname, status: res.status, ms: Date.now() - t0, code: fields.code ?? '-', ...fields });
      return res;
    },
    scheduled(at?: number, cron?: string): Promise<CronReport> {
      return runCron(s, at ?? s.clock.now(), cronOptionsFor(cron));
    },
  };
}
