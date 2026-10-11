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
// Phase 2e (G1, docs/phase2e/spec.md §3.4; CONTRACTS §5; R-A3, R-A4):
// - Per-helper rewarded placement IDs (rewardedIds: VITE_FB_PLACEMENT_REWARDED_{HINT,KITTY,MOUSE,REVIVE,
//   RANK_DOUBLE}); a missing one falls back to the shared rewarded ID, so a build with the shared ID only
//   behaves as before (one slot). Slots are per placement ID.
// - A 30 s floor per placement ID (ads.minLoadGapMs, Meta: ≥ 30 s between load requests of the same
//   placement): a load asked inside it is scheduled for when the floor ends, never sent early (a show
//   request then waits its readiness window as usual and answers 'timeout' if the floor is longer).
// - The no-fill backoff ads.reloadDelaysMs (30 / 60 / 120 s after the L1 flip); after the last step the
//   next show request loads.
// - At most ads.maxPreloadedRewarded rewarded instances preloaded (loaded or loading, unshown) at once
//   (ADS_TOO_MANY_INSTANCES from about 3); a preload past the cap is skipped. preload('rewarded', p)
//   names the placement (the app picks the priority, spec §3.4); a show request loads on demand.
import { cfg, type GameConfig } from '../../app/config';
import { within } from '../shared/timers';
import type { AdFailReason, AdKind, AdResult, PlatformAds, PlatformTimers, RewardedPlacement } from '../types';
import { fbErrorCode } from './fb-errors';
import type { FBAdInstance, FBInstantSDK } from './fbinstant';

export interface FbAdsOptions {
  readonly placements: { readonly interstitial: string; readonly rewarded: string };
  /** Phase 2e (spec §3.4): per-helper rewarded placement IDs; a missing or empty one falls back to placements.rewarded. */
  readonly rewardedIds?: Partial<Record<RewardedPlacement, string>>;
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
  /** Phase 2e: the placement ID this slot loads (one slot per ID). */
  readonly id: string;
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
  const newSlot = (kind: AdKind, id: string): Slot => ({
    kind,
    id,
    instance: null,
    loading: null,
    loadStale: false,
    busy: false,
    failures: 0,
    lastFailAt: null,
    retryTimer: null,
  });
  const placementOf = (kind: AdKind): string => (kind === 'interstitial' ? opts.placements.interstitial : opts.placements.rewarded).trim();
  /** Phase 2e: the rewarded placement ID of a helper (its own, else the shared one). */
  const rewardedIdOf = (p?: RewardedPlacement): string => {
    const own = p ? (opts.rewardedIds?.[p] ?? '').trim() : '';
    return own !== '' ? own : placementOf('rewarded');
  };
  const interstitialSlot = newSlot('interstitial', placementOf('interstitial'));
  /** Rewarded slots by placement ID (the shared one first). */
  const rewardedSlots = new Map<string, Slot>();
  const rewardedSlot = (p?: RewardedPlacement): Slot => {
    const id = rewardedIdOf(p);
    let slot = rewardedSlots.get(id);
    if (!slot) {
      slot = newSlot('rewarded', id);
      rewardedSlots.set(id, slot);
    }
    return slot;
  };
  const slotFor = (kind: AdKind, p?: RewardedPlacement): Slot => (kind === 'interstitial' ? interstitialSlot : rewardedSlot(p));
  const allSlots = (): Slot[] => [interstitialSlot, ...rewardedSlots.values()];
  /** Phase 2e: timers.now() of the last load request per placement ID (the 30 s floor). */
  const lastLoadAt = new Map<string, number>();
  /** Kinds latched off by an 'unsupported' result (PLAT-4). */
  const off = new Set<AdKind>();

  const isSupported = (kind: AdKind): boolean =>
    !off.has(kind) && placementOf(kind) !== '' && (opts.supported ? opts.supported(kind) : true);
  /** Rewarded instances loaded or loading and not shown (the preload cap, spec §3.4). */
  const rewardedHeld = (): number => {
    let n = 0;
    for (const slot of rewardedSlots.values()) if (slot.instance || slot.loading) n++;
    return n;
  };

  const latchUnsupported = (kind: AdKind): void => {
    if (off.has(kind)) return;
    off.add(kind);
    for (const slot of allSlots()) if (slot.kind === kind) cancelRetry(slot);
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

  /**
   * getXAdAsync + loadAsync, capped at loadTimeoutMs (rejects with LOAD_TIMEOUT); a late instance is never
   * used. Phase 2e: inside the placement's 30 s floor the request waits for the floor to end first.
   */
  const loadInstance = async (slot: Slot): Promise<FBAdInstance> => {
    const id = slot.id;
    const gap = Math.max(0, c.ads.minLoadGapMs);
    const last = lastLoadAt.get(id);
    const wait = last === undefined ? 0 : last + gap - timers.now();
    if (wait > 0) await new Promise<void>((resolve) => void timers.setTimeout(resolve, wait));
    lastLoadAt.set(id, timers.now());
    const attempt = (async () => {
      const inst = await (slot.kind === 'interstitial' ? sdk.getInterstitialAdAsync(id) : sdk.getRewardedVideoAsync(id));
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
        slot.instance = await loadInstance(slot);
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

  const show = async (kind: AdKind, p?: RewardedPlacement): Promise<AdResult> => {
    if (!isSupported(kind)) return { ok: false, reason: 'unsupported' };
    const slot = slotFor(kind, p);
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
      } else if (kind === 'interstitial' || slot.id === rewardedIdOf() || rewardedHeld() < Math.max(1, c.ads.maxPreloadedRewarded)) {
        // One fresh instance after every show (inside the preload cap for a helper's own placement).
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
    preload(kind, placement) {
      // While a show owns the slot it reloads by itself afterwards; never stack instances. While a
      // reload backoff is armed, the scheduled retry is the next load (PLAT-5).
      const slot = slotFor(kind, placement);
      if (!isSupported(kind) || slot.busy || slot.retryTimer !== null) return;
      const cooldown = c.ads.reloadDelaysMs[0] ?? 0;
      if (slot.lastFailAt !== null && timers.now() - slot.lastFailAt < cooldown) return;
      // Phase 2e §3.4: at most ads.maxPreloadedRewarded rewarded instances held at once.
      if (kind === 'rewarded' && !slot.instance && !slot.loading && rewardedHeld() >= Math.max(1, c.ads.maxPreloadedRewarded)) return;
      void load(slot);
    },
    isReady: (kind, placement) => {
      const slot = slotFor(kind, placement);
      return isSupported(kind) && slot.instance !== null && !slot.busy;
    },
    showInterstitial: () => show('interstitial'),
    showRewarded: (p) => show('rewarded', p),
  };
}
