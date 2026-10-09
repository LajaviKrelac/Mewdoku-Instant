// Owner: D (Phase 2b; was platform)
// One preloaded interstitial and one rewarded instance (05 §6, 04 §6.3): readiness timeout
// cfg.ads.readyTimeoutMs on the show request, NO timeout on showAsync, FB error codes → AdResult,
// a new instance after every show or failure. Empty placement ID → that kind is unsupported.
//
// Policies (ours):
// - 'unsupported' (CLIENT_UNSUPPORTED_OPERATION) from a load or a show latches that kind off for the
//   session: later requests answer 'unsupported' without touching the SDK, and onUnsupported lets
//   the adapter turn the capability off, so the app uses the free fallback (02 §13.3, PLAT-4).
// - After a failed load the next load waits for the reload backoff (cfg.ads.reloadDelaysMs):
//   preload() never cuts it short, and once the backoff is used up a preload within the first
//   backoff step of the last failure is skipped too (it is the reflex reload after a failed show,
//   not a new request), so a failure never costs two instances (PLAT-5). A show request still
//   loads at once.
// - A loadAsync() that has not settled after cfg.ads.loadTimeoutMs is abandoned and counts as a
//   failed load, so the backoff tries a fresh instance (PLAT-6). Once a show request has already
//   waited readyTimeoutMs on the pending load, further requests fail at once with 'timeout' instead
//   of locking input for another readiness window on the same stalled load.
import { cfg, type GameConfig } from '../../app/config';
import { within } from '../shared/timers';
import type { AdFailReason, AdKind, AdResult, PlatformAds, PlatformTimers } from '../types';
import { fbErrorCode } from './fb-errors';
import type { FBAdInstance, FBInstantSDK } from './fbinstant';

export interface FbAdsOptions {
  readonly placements: { readonly interstitial: string; readonly rewarded: string };
  readonly timers: PlatformTimers;
  readonly readyTimeoutMs?: number;
  /** SDK support for the kind (getSupportedAPIs, known after init). Default: always supported. */
  readonly supported?: (kind: AdKind) => boolean;
  /** Called once when a kind is latched off after an 'unsupported' result (PLAT-4). */
  readonly onUnsupported?: (kind: AdKind) => void;
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

/** Rejection used when loadAsync() outlives cfg.ads.loadTimeoutMs. */
const LOAD_TIMEOUT: unique symbol = Symbol('ad load timeout');

interface Slot {
  readonly kind: AdKind;
  /** Loaded and not yet shown. */
  instance: FBAdInstance | null;
  loading: Promise<LoadOutcome> | null;
  /** A show request already timed out waiting for the current `loading` (it is likely stalled). */
  loadStale: boolean;
  /** A show request owns the slot (readiness wait + showAsync). */
  busy: boolean;
  /** Consecutive load failures, for the reload backoff. */
  failures: number;
  /** timers.now() of the last failed load, or null. */
  lastFailAt: number | null;
  retryTimer: number | null;
}

export function createFbAds(sdk: FBInstantSDK, opts: FbAdsOptions): PlatformAds {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const readyTimeoutMs = opts.readyTimeoutMs ?? c.ads.readyTimeoutMs;
  const loadTimeoutMs = Math.max(c.ads.loadTimeoutMs, readyTimeoutMs);
  const newSlot = (kind: AdKind): Slot => ({
    kind,
    instance: null,
    loading: null,
    loadStale: false,
    busy: false,
    failures: 0,
    lastFailAt: null,
    retryTimer: null,
  });
  const slots: Record<AdKind, Slot> = { interstitial: newSlot('interstitial'), rewarded: newSlot('rewarded') };
  /** Kinds latched off by an 'unsupported' result (PLAT-4). */
  const off = new Set<AdKind>();

  const placementOf = (kind: AdKind): string => (kind === 'interstitial' ? opts.placements.interstitial : opts.placements.rewarded).trim();
  const isSupported = (kind: AdKind): boolean =>
    !off.has(kind) && placementOf(kind) !== '' && (opts.supported ? opts.supported(kind) : true);

  const latchUnsupported = (kind: AdKind): void => {
    if (off.has(kind)) return;
    off.add(kind);
    cancelRetry(slots[kind]);
    try {
      opts.onUnsupported?.(kind);
    } catch {
      /* the latch above already holds */
    }
  };

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

  /** getXAdAsync + loadAsync, capped at loadTimeoutMs (rejects with LOAD_TIMEOUT); a late instance is never used. */
  const loadInstance = async (kind: AdKind): Promise<FBAdInstance> => {
    const id = placementOf(kind);
    const attempt = (async () => {
      const inst = await (kind === 'interstitial' ? sdk.getInterstitialAdAsync(id) : sdk.getRewardedVideoAsync(id));
      await inst.loadAsync();
      return inst;
    })();
    return within(timers, attempt, loadTimeoutMs, (): never => {
      throw LOAD_TIMEOUT;
    });
  };

  /** A new instance + loadAsync(); returns the in-flight load when there is one. */
  const load = (slot: Slot): Promise<LoadOutcome> => {
    if (slot.instance) return Promise.resolve({ ok: true });
    if (slot.loading) return slot.loading;
    cancelRetry(slot);
    const run = async (): Promise<LoadOutcome> => {
      try {
        slot.instance = await loadInstance(slot.kind);
        slot.failures = 0;
        slot.lastFailAt = null;
        return { ok: true };
      } catch (err) {
        // The failed instance is dropped; the next attempt creates a fresh one (05 §6.2).
        const reason: AdFailReason = err === LOAD_TIMEOUT ? 'timeout' : mapAdError(err, 'load', slot.kind);
        slot.failures++;
        slot.lastFailAt = timers.now();
        if (reason === 'unsupported') latchUnsupported(slot.kind);
        else scheduleRetry(slot, reason);
        return { ok: false, reason };
      }
    };
    const p = run();
    slot.loading = p;
    slot.loadStale = false;
    void p.then(() => {
      if (slot.loading === p) {
        slot.loading = null;
        slot.loadStale = false;
      }
    });
    return p;
  };

  /** Waits for readiness at most readyTimeoutMs from now; the load itself keeps going after a timeout. */
  const waitReady = (slot: Slot): Promise<LoadOutcome> => {
    // An earlier request already waited a full readiness window on this load: do not lock input again.
    if (!slot.instance && slot.loading && slot.loadStale) return Promise.resolve({ ok: false, reason: 'timeout' });
    const pending = load(slot);
    return within(timers, pending, readyTimeoutMs, (): LoadOutcome => {
      if (slot.loading === pending) slot.loadStale = true;
      return { ok: false, reason: 'timeout' };
    });
  };

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
      if (!result.ok && result.reason === 'unsupported') {
        latchUnsupported(kind);
      } else if (!result.ok && result.reason === 'rate_limited') {
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
      // While a show owns the slot it reloads by itself afterwards; never stack instances. While a
      // reload backoff is armed, the scheduled retry is the next load (PLAT-5).
      const slot = slots[kind];
      if (!isSupported(kind) || slot.busy || slot.retryTimer !== null) return;
      const cooldown = c.ads.reloadDelaysMs[0] ?? 0;
      if (slot.lastFailAt !== null && timers.now() - slot.lastFailAt < cooldown) return;
      void load(slot);
    },
    isReady: (kind) => isSupported(kind) && slots[kind].instance !== null && !slots[kind].busy,
    showInterstitial: () => show('interstitial'),
    showRewarded: () => show('rewarded'),
  };
}
