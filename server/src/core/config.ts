// Owner: G4 (Phase 2e). Server configuration (spec §1.16): the defaults below, overridden by the Worker
// variables named in the spec (RANKING_ENABLED, PERIOD_MODE, WEB_MODE, DEV_ROUTES, ALLOWED_ORIGINS,
// MIN_CLIENT_VERSION, RC_SWITCHES) and, for any other key, by CONFIG_OVERRIDES (a JSON object deep-merged
// over the defaults; a value of the wrong type is ignored and reported). PURE: no Env, no clock.
import { REMOTE_SWITCHES, type PeriodMode, type RemoteSwitch, type ScoredModeWire } from '../contract';

export type DeployEnv = 'dev' | 'staging' | 'production';
export type WebMode = 'records' | 'anon';
export type RateBucket = 'wins' | 'bracket' | 'hearts' | 'profile' | 'claims' | 'session' | 'me' | 'admin';

export interface RewardPlace {
  readonly place: 1 | 2 | 3;
  readonly hints: number;
  readonly kitties: number;
}

export interface ServerConfig {
  readonly deployEnv: DeployEnv;
  /** Kill switch (RANKING_ENABLED): every ranking route answers 503 `disabled`; health and config still answer. */
  readonly rankingEnabled: boolean;
  readonly killRetryAfterMs: number;
  readonly bracket: {
    readonly periodMode: PeriodMode; // P-L1
    readonly durationMs: number;
    readonly joinWindowMs: number;
    readonly utcDay: { readonly minTimeLeftMs: number };
    readonly maxMembers: number; // P-L2
    readonly matchBy: 'arrival'; // P-L3
    readonly tieBreak: 'first_reached'; // P-L11
    /** Finalisation waits this long after ends_at, so a win request that started before the end commits first. */
    readonly finalizeGraceMs: number;
    /** GET /v1/bracket keeps showing an ended bracket for this long (spec §1.4). */
    readonly endedViewMs: number;
  };
  readonly scoring: {
    readonly modes: readonly ScoredModeWire[]; // P-L4, mirrors the client's period.modes (contract test)
    readonly pointsPerFish: number;
    readonly fishMax: number; // mirrors hearts.perAttempt
    readonly fishOnRevive: number; // mirrors revive.heartsRestored
    readonly maxRevives: number; // mirrors revive.maxPerAttempt
  };
  readonly rewards: {
    readonly places: readonly RewardPlace[]; // 1st confirmed; P-L5
    readonly minMembers: number; // P-L7
    readonly needOneBelow: boolean;
    readonly doubleByVideo: boolean; // P-L6
    readonly claimTtlMs: number; // P-L8
  };
  readonly hearts: { readonly enabled: boolean; readonly allowSelf: boolean; readonly maxGivenPerBracket: number }; // P-L10
  readonly nickname: { readonly freeText: boolean; readonly changeCooldownMs: number }; // P-L12
  readonly antiCheat: {
    /** Per board size n: [hard (reject), soft (flag)] ms (spec §1.9.4, P-L17). Sizes below 4 use 4's. */
    readonly minSolveMs: Readonly<Record<string, readonly [number, number]>>;
    readonly budget: { readonly initialMs: number; readonly capacityMs: number; readonly perWinCapMs: number };
    readonly maxWinsPerWindow: number;
    readonly flagWinsPerWindow: number;
    readonly maxLevelJump: number;
    readonly unknownPuzzle: 'accept_flagged' | 'reject';
    readonly eventGraceMs: { readonly before: number; readonly after: number };
    /** ≥ the client's ladder.pendingMaxAgeMs + the largest daily.dayStartHour we would ship (contract test). */
    readonly dailyGraceMs: number;
    readonly autoSuspendFlags: number; // 0 = off (D-2e-15)
  };
  readonly solutions: { readonly endlessTo: number; readonly dailyTo: string; readonly keepVersions: number };
  readonly session: { readonly ttlMs: number };
  readonly nonce: { readonly ttlMs: number };
  readonly signature: { readonly maxAgeMs: number; readonly maxFutureMs: number; readonly requireIssuedAt: boolean };
  readonly api: { readonly maxWinsPerRequest: number; readonly maxBodyBytes: number; readonly queueMax: number };
  readonly web: { readonly mode: WebMode; readonly newDevicesPerIpPerDay: number };
  readonly retention: {
    readonly winsDays: number;
    readonly bracketsDays: number;
    readonly rewardsDays: number;
    readonly flagsDays: number;
    readonly inactivePlayerDays: number;
    readonly tombstoneDays: number;
    readonly adminLogDays: number;
    readonly ipQuotaDays: number;
    readonly statsDays: number;
  };
  readonly identity: { readonly storeAsidKey: boolean };
  readonly cron: {
    /** Brackets finalised per hourly run: ≤ 6 statements each + ≈ 10 for the run, so 6 stays inside Workers Free's 50 queries per invocation (Paid: set 200 through CONFIG_OVERRIDES). Lazy finalisation on reads does the rest. */
    readonly finalizePerRun: number;
    /** Tests and the Node dev server: the sweep runs in the run of this UTC hour. The Worker has its own trigger (cron.ts RETENTION_CRON). */
    readonly retentionHourUtc: number;
    /** Rows (or, for brackets, bracket ids × ≈ 50 members) per delete statement. */
    readonly sweepChunk: number;
    readonly sweepChunksPerRun: number;
  };
  /** Per-isolate token buckets (best effort, spec §1.9.5): n requests per perMs. */
  readonly rateLimits: Readonly<Record<RateBucket, { readonly n: number; readonly perMs: number }>>;
  readonly configTtlSec: number;
  readonly healthCacheMs: number;
  readonly minClientVersion: string;
  readonly allowedOrigins: readonly string[];
  readonly rcSwitches: Readonly<Partial<Record<RemoteSwitch, boolean>>>;
  /** DEV_ROUTES exactly "true" and not a production deploy; each request must also be on a loopback host. */
  readonly devRoutes: boolean;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const DEFAULT_CONFIG: ServerConfig = {
  deployEnv: 'dev',
  rankingEnabled: true,
  killRetryAfterMs: HOUR,
  bracket: {
    periodMode: 'rolling',
    durationMs: DAY,
    joinWindowMs: 2 * HOUR,
    utcDay: { minTimeLeftMs: 2 * HOUR },
    maxMembers: 50,
    matchBy: 'arrival',
    tieBreak: 'first_reached',
    finalizeGraceMs: 30_000,
    endedViewMs: DAY,
  },
  scoring: { modes: ['level', 'daily', 'event'], pointsPerFish: 1, fishMax: 3, fishOnRevive: 1, maxRevives: 1 },
  rewards: {
    places: [
      { place: 1, hints: 2, kitties: 2 },
      { place: 2, hints: 1, kitties: 1 },
      { place: 3, hints: 1, kitties: 0 },
    ],
    minMembers: 5,
    needOneBelow: true,
    doubleByVideo: true,
    claimTtlMs: 7 * DAY,
  },
  hearts: { enabled: true, allowSelf: true, maxGivenPerBracket: 20 },
  nickname: { freeText: false, changeCooldownMs: DAY },
  antiCheat: {
    minSolveMs: {
      '4': [1500, 4000],
      '5': [1500, 4000],
      '6': [2000, 5000],
      '7': [2500, 7000],
      '8': [3000, 9000],
      '9': [3500, 11_000],
      '10': [4000, 13_000],
      '11': [4500, 16_000],
      '12': [5000, 20_000],
    },
    budget: { initialMs: HOUR, capacityMs: 8 * HOUR, perWinCapMs: 30 * MIN },
    maxWinsPerWindow: 150,
    flagWinsPerWindow: 60,
    maxLevelJump: 30,
    unknownPuzzle: 'accept_flagged',
    eventGraceMs: { before: HOUR, after: 6 * HOUR },
    dailyGraceMs: 25 * HOUR,
    autoSuspendFlags: 0,
  },
  solutions: { endlessTo: 3000, dailyTo: '2030-12-31', keepVersions: 2 },
  session: { ttlMs: DAY },
  nonce: { ttlMs: 5 * MIN },
  signature: { maxAgeMs: 10 * MIN, maxFutureMs: 2 * MIN, requireIssuedAt: false },
  api: { maxWinsPerRequest: 10, maxBodyBytes: 16_384, queueMax: 20 },
  web: { mode: 'anon', newDevicesPerIpPerDay: 5 },
  retention: {
    winsDays: 30,
    bracketsDays: 30,
    rewardsDays: 30,
    flagsDays: 90,
    inactivePlayerDays: 180,
    tombstoneDays: 90,
    adminLogDays: 365,
    ipQuotaDays: 2,
    statsDays: 400,
  },
  identity: { storeAsidKey: false },
  cron: { finalizePerRun: 6, retentionHourUtc: 3, sweepChunk: 1000, sweepChunksPerRun: 4 },
  rateLimits: {
    wins: { n: 30, perMs: MIN },
    bracket: { n: 30, perMs: MIN },
    hearts: { n: 60, perMs: HOUR },
    profile: { n: 10, perMs: HOUR },
    claims: { n: 10, perMs: MIN },
    session: { n: 30, perMs: MIN },
    me: { n: 30, perMs: MIN },
    admin: { n: 120, perMs: MIN },
  },
  configTtlSec: 3600,
  healthCacheMs: 30_000,
  minClientVersion: '0.0.0',
  allowedOrigins: [],
  rcSwitches: {},
  devRoutes: false,
};

/** The Worker variables that shape the config (all strings, all optional; spec §1.2 `[vars]`). */
export interface ConfigVars {
  readonly DEPLOY_ENV?: string | undefined;
  readonly RANKING_ENABLED?: string | undefined;
  readonly PERIOD_MODE?: string | undefined;
  readonly WEB_MODE?: string | undefined;
  readonly DEV_ROUTES?: string | undefined;
  readonly ALLOWED_ORIGINS?: string | undefined;
  readonly MIN_CLIENT_VERSION?: string | undefined;
  readonly RC_SWITCHES?: string | undefined;
  readonly CONFIG_OVERRIDES?: string | undefined;
}

type Plain = Record<string, unknown>;
const isPlain = (x: unknown): x is Plain => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Deep-merges `over` into `base`: objects merge, everything else replaces, but only with a value of the
 * same JSON type as the default (arrays with arrays, numbers with finite numbers). Unknown keys and
 * mistyped values are skipped and listed in `problems`.
 */
export function mergeOverrides<T>(base: T, over: unknown, problems: string[], path = ''): T {
  if (!isPlain(over) || !isPlain(base)) {
    problems.push(`${path || '(root)'}: not an object`);
    return base;
  }
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const at = path ? `${path}.${k}` : k;
    if (!Object.prototype.hasOwnProperty.call(base, k)) {
      // minSolveMs takes new sizes; everything else must be a known key.
      if (path === 'antiCheat.minSolveMs' && /^\d{1,2}$/.test(k) && Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && x >= 0)) {
        out[k] = v;
      } else {
        problems.push(`${at}: unknown key`);
      }
      continue;
    }
    const cur = (base as Plain)[k];
    if (isPlain(cur)) out[k] = mergeOverrides(cur, v, problems, at);
    else if (Array.isArray(cur) ? Array.isArray(v) : typeof cur === typeof v && (typeof v !== 'number' || Number.isFinite(v))) out[k] = v;
    else problems.push(`${at}: expected ${Array.isArray(cur) ? 'array' : typeof cur}`);
  }
  return out as T;
}

/** Comma-separated origins, trimmed, without empties or a trailing slash. */
export function parseOrigins(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim().replace(/\/+$/, ''))
    .filter((x) => x.length > 0);
}

/** RC_SWITCHES: a JSON object of booleans; unknown keys and non-booleans are dropped (spec §1.15). */
export function parseSwitches(s: string | undefined, problems: string[]): Partial<Record<RemoteSwitch, boolean>> {
  if (!s || s.trim() === '') return {};
  let raw: unknown;
  try {
    raw = JSON.parse(s);
  } catch {
    problems.push('RC_SWITCHES: not JSON');
    return {};
  }
  if (!isPlain(raw)) {
    problems.push('RC_SWITCHES: not an object');
    return {};
  }
  const out: Partial<Record<RemoteSwitch, boolean>> = {};
  for (const name of REMOTE_SWITCHES) {
    const v = raw[name];
    if (typeof v === 'boolean') out[name] = v;
  }
  for (const k of Object.keys(raw)) if (!(REMOTE_SWITCHES as readonly string[]).includes(k) || typeof raw[k] !== 'boolean') problems.push(`RC_SWITCHES.${k}: dropped`);
  return out;
}

export interface LoadedConfig {
  readonly cfg: ServerConfig;
  /** Variables that could not be applied (logged once per isolate; never fatal). */
  readonly problems: readonly string[];
}

/** The config of one deploy from its variables (spec §1.16). */
export function loadConfig(vars: ConfigVars, base: ServerConfig = DEFAULT_CONFIG): LoadedConfig {
  const problems: string[] = [];
  let cfg = base;
  if (vars.CONFIG_OVERRIDES && vars.CONFIG_OVERRIDES.trim() !== '') {
    try {
      cfg = mergeOverrides(cfg, JSON.parse(vars.CONFIG_OVERRIDES), problems);
    } catch {
      problems.push('CONFIG_OVERRIDES: not JSON');
    }
  }
  const deployEnv: DeployEnv = vars.DEPLOY_ENV === 'production' || vars.DEPLOY_ENV === 'staging' ? vars.DEPLOY_ENV : 'dev';
  let periodMode: PeriodMode = cfg.bracket.periodMode;
  if (vars.PERIOD_MODE === 'rolling' || vars.PERIOD_MODE === 'utc_day') periodMode = vars.PERIOD_MODE;
  else if (vars.PERIOD_MODE !== undefined) problems.push('PERIOD_MODE: expected rolling | utc_day');
  let webMode: WebMode = cfg.web.mode;
  if (vars.WEB_MODE === 'records' || vars.WEB_MODE === 'anon') webMode = vars.WEB_MODE;
  else if (vars.WEB_MODE !== undefined) problems.push('WEB_MODE: expected records | anon');
  // A production deploy never runs the anonymous web pool or the dev routes, whatever the variables say.
  if (deployEnv === 'production' && vars.DEV_ROUTES === 'true') problems.push('DEV_ROUTES: ignored in production');
  const min = vars.MIN_CLIENT_VERSION?.trim();
  return {
    cfg: {
      ...cfg,
      deployEnv,
      rankingEnabled: vars.RANKING_ENABLED === undefined ? cfg.rankingEnabled : vars.RANKING_ENABLED.trim().toLowerCase() !== 'false',
      bracket: { ...cfg.bracket, periodMode },
      web: { ...cfg.web, mode: webMode },
      devRoutes: vars.DEV_ROUTES === 'true' && deployEnv !== 'production',
      allowedOrigins: vars.ALLOWED_ORIGINS === undefined ? cfg.allowedOrigins : parseOrigins(vars.ALLOWED_ORIGINS),
      minClientVersion: min ? min : cfg.minClientVersion,
      rcSwitches: vars.RC_SWITCHES === undefined ? cfg.rcSwitches : parseSwitches(vars.RC_SWITCHES, problems),
    },
    problems,
  };
}

/** [hard, soft] floors for a board of size n (sizes below the table's smallest use its smallest). */
export function solveFloors(cfg: ServerConfig, n: number): readonly [number, number] {
  const t = cfg.antiCheat.minSolveMs;
  const exact = t[String(n)];
  if (exact) return exact;
  const sizes = Object.keys(t)
    .map(Number)
    .filter((x) => Number.isInteger(x))
    .sort((a, b) => a - b);
  const pick = n < (sizes[0] ?? 0) ? sizes[0] : sizes.filter((s) => s <= n).pop();
  return (pick === undefined ? undefined : t[String(pick)]) ?? [0, 0];
}
