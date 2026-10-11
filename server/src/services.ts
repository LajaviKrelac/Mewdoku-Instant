// Owner: G4 (Phase 2e). What every handler shares inside one isolate: the config, the store, the solution
// table, the clock (plus the dev test pools' offsets), randomness, the rate limiter, metrics, the log, and
// the HMAC keys imported once. Built by createApp (app.ts) from the Worker's env or the Node dev server's.
import type { RemoteSwitch } from './contract';
import { NICK_WORDS_V1, RETIRED_V1 } from './contract/words';
import type { ContentLookup } from './content/lookup';
import type { Clock } from './core/clock';
import type { ConfigVars, ServerConfig } from './core/config';
import { hmacKey, type HmacKey, type Rng } from './core/crypto';
import { devPoolOf } from './core/ids';
import type { Retired, Words } from './core/nickname';
import { RateLimiter } from './http/ratelimit';
import type { Store } from './store/sql-store';

export const SERVER_VERSION = '0.1.0';

/** The Worker's variables and secrets (spec §1.2; CONTRACTS §4 `Env` minus the bindings). */
export interface AppEnv extends ConfigVars {
  readonly FB_APP_SECRET?: string | undefined;
  /** Staging and dev only: a test secret for synthetic players (pool `fb:synthetic`); refused in production. */
  readonly FB_APP_SECRET_ALT?: string | undefined;
  readonly SESSION_SECRET?: string | undefined;
  readonly ID_PEPPER?: string | undefined;
  readonly ADMIN_KEY?: string | undefined;
  readonly BUILD_SHA?: string | undefined;
}

/** Counters (Analytics Engine when bound; spec §1.14). Never a personal value in a label. */
export interface Metrics {
  count(name: string, label?: string, value?: number): void;
}
export const noMetrics: Metrics = { count: () => undefined };

export type LogLine = Record<string, unknown>;

export interface DevState {
  readonly offsets: Map<string, number>;
  readonly switches: Map<string, Partial<Record<RemoteSwitch, boolean>>>;
}

export interface Keys {
  /** SESSION_SECRET: tokens and nonces. */
  session(): Promise<HmacKey | null>;
  /** ID_PEPPER: player keys and the daily IP hash. */
  pepper(): Promise<HmacKey | null>;
  /** FB_APP_SECRET, then FB_APP_SECRET_ALT where allowed (never in production). */
  fb(): Promise<HmacKey[]>;
}

export interface Services {
  readonly cfg: ServerConfig;
  readonly configProblems: readonly string[];
  readonly env: AppEnv;
  readonly store: Store;
  readonly content: ContentLookup;
  readonly clock: Clock;
  readonly rng: Rng;
  readonly limiter: RateLimiter;
  readonly metrics: Metrics;
  readonly words: Words;
  readonly retired: Retired;
  readonly keys: Keys;
  readonly dev: DevState;
  readonly version: string;
  /** The server clock for a stored pool: base time plus the dev test pool's offset (dev routes only). */
  nowFor(pool: string | null): number;
  log(line: LogLine): void;
  /** The cached DB probe of /v1/health (30 s per isolate). */
  health: { at: number; db: 'ok' | 'down' } | null;
}

/** A secret is usable when present; production also wants ≥ 32 characters (the deploy guide's `openssl rand -base64 48`). */
export function secretOk(value: string | undefined, production: boolean): value is string {
  return typeof value === 'string' && value.length > 0 && (!production || value.length >= 32);
}

export function makeKeys(env: AppEnv, cfg: ServerConfig, log: (l: LogLine) => void): Keys {
  const production = cfg.deployEnv === 'production';
  const memo = (secret: string | undefined, name: string): (() => Promise<HmacKey | null>) => {
    let p: Promise<HmacKey | null> | null = null;
    return () => {
      if (!p) {
        if (!secretOk(secret, production)) {
          log({ level: 'error', msg: `${name} missing or too short` });
          p = Promise.resolve(null);
        } else {
          p = hmacKey(secret);
        }
      }
      return p;
    };
  };
  const session = memo(env.SESSION_SECRET, 'SESSION_SECRET');
  const pepper = memo(env.ID_PEPPER, 'ID_PEPPER');
  const fb = memo(env.FB_APP_SECRET, 'FB_APP_SECRET');
  const alt = env.FB_APP_SECRET_ALT && !production ? memo(env.FB_APP_SECRET_ALT, 'FB_APP_SECRET_ALT') : null;
  return {
    session,
    pepper,
    async fb(): Promise<HmacKey[]> {
      const out: HmacKey[] = [];
      const k = await fb();
      if (k) out.push(k);
      const a = alt ? await alt() : null;
      if (a) out.push(a);
      return out;
    },
  };
}

export function makeServices(parts: {
  cfg: ServerConfig;
  configProblems: readonly string[];
  env: AppEnv;
  store: Store;
  content: ContentLookup;
  clock: Clock;
  rng: Rng;
  metrics: Metrics;
  log: (l: LogLine) => void;
}): Services {
  const dev: DevState = { offsets: new Map(), switches: new Map() };
  const cfg = parts.cfg;
  const sha = parts.env.BUILD_SHA?.trim();
  return {
    ...parts,
    limiter: new RateLimiter(cfg.rateLimits),
    words: NICK_WORDS_V1,
    retired: RETIRED_V1,
    keys: makeKeys(parts.env, cfg, parts.log),
    dev,
    version: sha ? `${SERVER_VERSION}+${sha.slice(0, 12)}` : SERVER_VERSION,
    nowFor(pool: string | null): number {
      const base = parts.clock.now();
      // Real pools ('fb', 'web') never move; a test pool ('fb:<p>', 'web:<p>') adds its offset.
      if (!cfg.devRoutes || pool === null || !pool.includes(':')) return base;
      const p = devPoolOf(pool);
      return base + (p === null ? 0 : (dev.offsets.get(p) ?? 0));
    },
    health: null,
  };
}
