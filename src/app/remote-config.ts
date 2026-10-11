// Owner: G1 (Phase 2e)
// Remote switches (docs/phase2e/spec.md §7.4, §1.15, D-2e-19; CONTRACTS §7): GET /v1/config at idle after
// the first screen, no sign-in, only where the ranking origin is in use (never on web-prod: the boot
// creates this module only then). Cached in localStorage['mewdoku.rc.v1'] for remote.ttlSec (the read and
// the write are guarded: storage can be missing in the FB iframe). A fresh cache is used without a
// request; else the fetch; on failure the cache (even stale), else the build values. Booleans of
// REMOTE_SWITCHES only (the shared parser drops anything else) — switches, not remote tuning.
// Directions: `iapIos` on or off (its purpose: iOS purchases on without a release, U-c); every other
// switch is OFF ONLY: a remote `true` never turns on what the build ships off, so a compromised or
// misconfigured server can never add ads or purchases. A switch applies from the moment it arrives
// (onChange: the banner is re-gated, the Buy rows re-evaluate), never retroactively to a purchase in flight.
// Analytics remote_config {result: 'ok' | 'cached' | 'default'}.
import { REMOTE_SWITCHES, type ConfigResponse, type RemoteSwitch } from '../shared/rank-api';
import { cfg, type GameConfig } from './config';
import type { AnalyticsEvent } from './events';
import type { LadderResult } from './ladder-client';

export const RC_KEY = 'mewdoku.rc.v1';

export type Switches = Readonly<Partial<Record<RemoteSwitch, boolean>>>;

export interface RemoteConfig {
  /** Fetches (or reads the fresh cache); never rejects. */
  start(): Promise<void>;
  /** The switches in force (remote values; empty = the build values). */
  switches(): Switches;
  iapIosOn(): boolean;
  iapInPlayOn(): boolean;
  bannerOn(): boolean;
  bannerInPlayOn(): boolean;
  ladderOn(): boolean;
}

export interface RemoteConfigDeps {
  /** GET /v1/config (ladder-client config()). */
  fetchConfig(): Promise<LadderResult<ConfigResponse>>;
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly clock: { now(): number };
  readonly config?: GameConfig;
  log?(e: AnalyticsEvent): void;
  /** The switches in force changed (re-gate the banner, re-evaluate the Buy rows). */
  onChange?(): void;
}

interface Cached {
  readonly switches: Switches;
  readonly at: number;
  readonly ttlSec: number;
}

/** Booleans of REMOTE_SWITCHES only. */
export function cleanSwitches(x: unknown): Switches {
  const out: Partial<Record<RemoteSwitch, boolean>> = {};
  if (!x || typeof x !== 'object') return out;
  for (const k of REMOTE_SWITCHES) {
    const v = (x as Record<string, unknown>)[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

function readCache(storage: RemoteConfigDeps['storage']): Cached | null {
  try {
    const raw = storage?.getItem(RC_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || typeof v.at !== 'number' || typeof v.ttlSec !== 'number') return null;
    return { switches: cleanSwitches(v.switches), at: v.at, ttlSec: v.ttlSec };
  } catch {
    return null;
  }
}

function writeCache(storage: RemoteConfigDeps['storage'], c: Cached): void {
  try {
    storage?.setItem(RC_KEY, JSON.stringify(c));
  } catch {
    // memory only
  }
}

/** The rules of §7.4 over the build values: iapIos both ways, the rest off only. */
export function applySwitches(sw: Switches, c: GameConfig = cfg): {
  iapIos: boolean;
  iapInPlay: boolean;
  banner: boolean;
  bannerInPlay: boolean;
  ladder: boolean;
} {
  const on = c.remote.enabled;
  const offOnly = (build: boolean, remote: boolean | undefined): boolean => build && !(on && remote === false);
  return {
    iapIos: on && sw.iapIos !== undefined ? sw.iapIos : c.iap.iosEnabled,
    iapInPlay: offOnly(c.iap.inPlay, sw.iapInPlay),
    banner: offOnly(c.ads.banner.enabled, sw.banner),
    bannerInPlay: offOnly(c.ads.banner.duringPlay, sw.bannerInPlay),
    ladder: offOnly(c.ladder.enabled, sw.ladder),
  };
}

export function createRemoteConfig(deps: RemoteConfigDeps): RemoteConfig {
  const c = deps.config ?? cfg;
  let current: Switches = {};
  let started: Promise<void> | null = null;

  const set = (next: Switches): void => {
    const changed = REMOTE_SWITCHES.some((k) => current[k] !== next[k]);
    current = next;
    if (changed) deps.onChange?.();
  };
  const ttlMs = (sec: number): number => Math.max(0, sec) * 1000;
  const log = (result: 'ok' | 'cached' | 'default'): void => deps.log?.({ name: 'remote_config', params: { result } });

  async function run(): Promise<void> {
    if (!c.remote.enabled) {
      log('default');
      return;
    }
    const cached = readCache(deps.storage);
    const now = deps.clock.now();
    if (cached && now - cached.at >= 0 && now - cached.at < ttlMs(Math.min(cached.ttlSec, c.remote.ttlSec))) {
      set(cached.switches);
      log('cached');
      return;
    }
    let r: LadderResult<ConfigResponse>;
    try {
      r = await deps.fetchConfig();
    } catch {
      r = { ok: false, code: 'network' };
    }
    if (r.ok) {
      const sw = cleanSwitches(r.value.switches);
      writeCache(deps.storage, { switches: sw, at: deps.clock.now(), ttlSec: r.value.ttlSec > 0 ? r.value.ttlSec : c.remote.ttlSec });
      set(sw);
      log('ok');
      return;
    }
    if (cached) {
      set(cached.switches);
      log('cached');
      return;
    }
    log('default');
  }

  const view = (): ReturnType<typeof applySwitches> => applySwitches(current, c);
  return {
    start() {
      started ??= run().catch(() => undefined);
      return started;
    },
    switches: () => current,
    iapIosOn: () => view().iapIos,
    iapInPlayOn: () => view().iapInPlay,
    bannerOn: () => view().banner,
    bannerInPlayOn: () => view().bannerInPlay,
    ladderOn: () => view().ladder,
  };
}
