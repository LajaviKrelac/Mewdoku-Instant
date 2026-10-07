// Owner: platform
// One preloaded interstitial and one rewarded instance (05 §6, 04 §6.3): readiness timeout
// cfg.ads.readyTimeoutMs on the show request, NO timeout on showAsync, FB error codes → AdResult,
// a new instance after every show or failure. Empty placement ID → that kind is unsupported.
import { cfg, type GameConfig } from '../../app/config';
import type { AdFailReason, AdKind, AdResult, PlatformAds, PlatformTimers } from '../types';
import { fbErrorCode } from './fb-errors';
import type { FBAdInstance, FBInstantSDK } from './fbinstant';

export interface FbAdsOptions {
  readonly placements: { readonly interstitial: string; readonly rewarded: string };
  readonly timers: PlatformTimers;
  readonly readyTimeoutMs?: number;
  /** SDK support for the kind (getSupportedAPIs, known after init). Default: always supported. */
  readonly supported?: (kind: AdKind) => boolean;
  readonly config?: GameConfig;
}

/** Show-phase codes that mean "could not present" rather than "the player closed it". */
const SHOW_FAILURE_CODES = new Set(['NETWORK_FAILURE', 'INVALID_PARAM', 'INVALID_OPERATION', 'ADS_TOO_MANY_INSTANCES']);

/** ADS_NO_FILL → no_fill; ADS_FREQUENT_LOAD / RATE_LIMITED → rate_limited; ADS_NOT_LOADED → not_ready;
 *  CLIENT_UNSUPPORTED_OPERATION → unsupported; rewarded rejection after the show began → skipped; else error. */
export function mapAdError(err: unknown, phase: 'load' | 'show', kind: AdKind): AdFailReason {
  const code = fbErrorCode(err);
  switch (code) {
    case 'ADS_NO_FILL':
      return 'no_fill';
    case 'ADS_FREQUENT_LOAD':
    case 'RATE_LIMITED':
      return 'rate_limited';
    case 'ADS_NOT_LOADED':
      return 'not_ready';
    case 'CLIENT_UNSUPPORTED_OPERATION':
      return 'unsupported';
    default:
      break;
  }
  // A rewarded showAsync() rejects when the player closes the video early (05 §6.1): no reward.
  if (phase === 'show' && kind === 'rewarded' && (code === null || !SHOW_FAILURE_CODES.has(code))) return 'skipped';
  return 'error';
}

type LoadOutcome = { ok: true } | { ok: false; reason: AdFailReason };

interface Slot {
  readonly kind: AdKind;
  /** Loaded and not yet shown. */
  instance: FBAdInstance | null;
  loading: Promise<LoadOutcome> | null;
  /** A show request owns the slot (readiness wait + showAsync). */
  busy: boolean;
  /** Consecutive load failures, for the reload backoff. */
  failures: number;
  retryTimer: number | null;
}

export function createFbAds(sdk: FBInstantSDK, opts: FbAdsOptions): PlatformAds {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const readyTimeoutMs = opts.readyTimeoutMs ?? c.ads.readyTimeoutMs;
  const slots: Record<AdKind, Slot> = {
    interstitial: { kind: 'interstitial', instance: null, loading: null, busy: false, failures: 0, retryTimer: null },
    rewarded: { kind: 'rewarded', instance: null, loading: null, busy: false, failures: 0, retryTimer: null },
  };

  const placementOf = (kind: AdKind): string => (kind === 'interstitial' ? opts.placements.interstitial : opts.placements.rewarded).trim();
  const isSupported = (kind: AdKind): boolean => placementOf(kind) !== '' && (opts.supported ? opts.supported(kind) : true);

  const cancelRetry = (slot: Slot): void => {
    if (slot.retryTimer !== null) timers.clearTimeout(slot.retryTimer);
    slot.retryTimer = null;
  };

  /** Bounded backoff (cfg.ads.reloadDelaysMs); after the last step, wait for the next request. */
  const scheduleRetry = (slot: Slot, reason: AdFailReason): void => {
    cancelRetry(slot);
    if (reason === 'unsupported') return;
    const delay = c.ads.reloadDelaysMs[slot.failures - 1];
    if (delay === undefined) return;
    slot.retryTimer = timers.setTimeout(() => {
      slot.retryTimer = null;
      void load(slot);
    }, delay);
  };

  /** A new instance + loadAsync(); returns the in-flight load when there is one. */
  const load = (slot: Slot): Promise<LoadOutcome> => {
    if (slot.instance) return Promise.resolve({ ok: true });
    if (slot.loading) return slot.loading;
    cancelRetry(slot);
    const run = async (): Promise<LoadOutcome> => {
      const id = placementOf(slot.kind);
      try {
        const inst = await (slot.kind === 'interstitial' ? sdk.getInterstitialAdAsync(id) : sdk.getRewardedVideoAsync(id));
        await inst.loadAsync();
        slot.instance = inst;
        slot.failures = 0;
        return { ok: true };
      } catch (err) {
        // The failed instance is dropped; the next attempt creates a fresh one (05 §6.2).
        const reason = mapAdError(err, 'load', slot.kind);
        slot.failures++;
        scheduleRetry(slot, reason);
        return { ok: false, reason };
      }
    };
    const p = run();
    slot.loading = p;
    void p.then(() => {
      if (slot.loading === p) slot.loading = null;
    });
    return p;
  };

  /** Waits for readiness at most readyTimeoutMs from now; the load itself keeps going after a timeout. */
  const waitReady = (slot: Slot): Promise<LoadOutcome> =>
    new Promise((resolve) => {
      let settled = false;
      const timer = timers.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, reason: 'timeout' });
      }, readyTimeoutMs);
      void load(slot).then((outcome) => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        resolve(outcome);
      });
    });

  const show = async (kind: AdKind): Promise<AdResult> => {
    if (!isSupported(kind)) return { ok: false, reason: 'unsupported' };
    const slot = slots[kind];
    if (slot.busy) return { ok: false, reason: 'not_ready' };
    slot.busy = true;
    try {
      if (!slot.instance) {
        const outcome = await waitReady(slot);
        if (!outcome.ok) return outcome;
      }
      const inst = slot.instance;
      if (!inst) return { ok: false, reason: 'not_ready' };
      slot.instance = null; // an instance is shown once; a fresh one is loaded below
      let result: AdResult;
      try {
        await inst.showAsync(); // no timeout: resolves only when the ad is over (05 §6.2)
        result = { ok: true };
      } catch (err) {
        result = { ok: false, reason: mapAdError(err, 'show', kind) };
      }
      if (!result.ok && result.reason === 'rate_limited') {
        slot.failures++;
        scheduleRetry(slot, result.reason);
      } else {
        void load(slot);
      }
      return result;
    } catch {
      return { ok: false, reason: 'error' }; // never reject (PlatformAds contract)
    } finally {
      slot.busy = false;
    }
  };

  return {
    preload(kind) {
      // While a show owns the slot it reloads by itself afterwards; never stack instances.
      if (!isSupported(kind) || slots[kind].busy) return;
      void load(slots[kind]);
    },
    isReady: (kind) => isSupported(kind) && slots[kind].instance !== null && !slots[kind].busy,
    showInterstitial: () => show('interstitial'),
    showRewarded: () => show('rewarded'),
  };
}
