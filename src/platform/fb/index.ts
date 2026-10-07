// Owner: platform
// FBInstant adapter (04 §6.3, 05 §4): initializeAsync first, capabilities from getSupportedAPIs()
// (ads only with non-empty VITE_FB_PLACEMENT_* IDs), locale read after startGameAsync.
//
// No SDK call happens before init(): the factory only wires objects, setLoadingProgress() and
// onPause() calls made earlier are queued and replayed once initializeAsync() has resolved.
import { cfg } from '../../app/config';
import { canVibrate, createHaptics, type Haptics } from '../shared/haptics';
import { createSystemTimers } from '../shared/timers';
import type { AdKind, Capabilities, PlatformAdapter, PlatformTimers } from '../types';
import { createLocalStore } from '../web/local-storage';
import { createFbAds } from './fb-ads';
import { createFbAnalytics } from './fb-analytics';
import { createFbStorage } from './fb-storage';
import type { FBInstantSDK } from './fbinstant';

export interface FbPlatformOptions {
  /** Defaults to window.FBInstant. */
  readonly sdk?: FBInstantSDK;
  /** Defaults to import.meta.env.VITE_FB_PLACEMENT_INTERSTITIAL / _REWARDED. */
  readonly placements?: { readonly interstitial: string; readonly rewarded: string };
  readonly storage?: Storage | null;
  readonly timers?: PlatformTimers;
  /** navigator, for the vibrate fallback. */
  readonly nav?: Navigator;
}

/** SDK API names (getSupportedAPIs) behind each capability (04 §6.3). */
export const FB_API = {
  interstitial: 'getInterstitialAdAsync',
  rewarded: 'getRewardedVideoAsync',
  getData: 'player.getDataAsync',
  setData: 'player.setDataAsync',
  haptics: 'performHapticFeedbackAsync',
  logEvent: 'logEvent',
} as const;

const FALLBACK_LOCALE = 'en_US';

function defaultSdk(): FBInstantSDK | undefined {
  return typeof window === 'undefined' ? undefined : window.FBInstant;
}

/** Testable factory. */
export function createFbPlatform(opts: FbPlatformOptions = {}): PlatformAdapter {
  const timers = opts.timers ?? createSystemTimers();
  const nav = opts.nav ?? (typeof navigator === 'undefined' ? undefined : navigator);
  const placements = opts.placements ?? {
    interstitial: import.meta.env.VITE_FB_PLACEMENT_INTERSTITIAL ?? '',
    rewarded: import.meta.env.VITE_FB_PLACEMENT_REWARDED ?? '',
  };
  const lazySdk = (): FBInstantSDK => {
    const s = opts.sdk ?? defaultSdk();
    if (!s) throw new Error('FBInstant SDK is not loaded');
    return s;
  };
  // Read lazily: the factory itself never touches the SDK (or requires the global to exist).
  let sdk: FBInstantSDK | null = opts.sdk ?? null;

  let apis = new Set<string>();
  let initialized = false;
  let started = false;
  let initP: Promise<void> | null = null;
  let startP: Promise<void> | null = null;
  let lastProgress = -1;
  let queuedProgress: number | null = null;
  const queuedPause: (() => void)[] = [];

  const has = (api: string): boolean => apis.has(api);
  const adSupported = (kind: AdKind): boolean => has(kind === 'interstitial' ? FB_API.interstitial : FB_API.rewarded);

  let haptics: Haptics = createHaptics({ nav });

  const sdkRef = (): FBInstantSDK => sdk ?? (sdk = lazySdk());
  // A thin forwarder so storage / ads / analytics can be built before the SDK global is read.
  const forward: FBInstantSDK = {
    initializeAsync: () => sdkRef().initializeAsync(),
    setLoadingProgress: (p) => sdkRef().setLoadingProgress(p),
    startGameAsync: () => sdkRef().startGameAsync(),
    getLocale: () => sdkRef().getLocale(),
    getPlatform: () => sdkRef().getPlatform(),
    getSDKVersion: () => sdkRef().getSDKVersion(),
    getSupportedAPIs: () => sdkRef().getSupportedAPIs(),
    onPause: (cb) => sdkRef().onPause(cb),
    logEvent: (n, v, p) => sdkRef().logEvent(n, v, p),
    getInterstitialAdAsync: (id) => sdkRef().getInterstitialAdAsync(id),
    getRewardedVideoAsync: (id) => sdkRef().getRewardedVideoAsync(id),
    performHapticFeedbackAsync: () => sdkRef().performHapticFeedbackAsync(),
    get player() {
      return sdkRef().player;
    },
  };

  const local = createLocalStore(cfg.save.storageKey, {
    ...(opts.storage !== undefined ? { storage: opts.storage } : {}),
    now: () => timers.now(),
  });
  const storage = createFbStorage(forward, {
    local,
    timers,
    cloudEnabled: () => initialized && has(FB_API.getData) && has(FB_API.setData),
  });
  const ads = createFbAds(forward, {
    placements,
    timers,
    readyTimeoutMs: cfg.ads.readyTimeoutMs,
    supported: (kind) => initialized && adSupported(kind),
  });
  const analytics = createFbAnalytics(forward, { ready: () => initialized });

  const applyProgress = (pct: number): void => {
    try {
      forward.setLoadingProgress(pct);
    } catch {
      /* cosmetic */
    }
  };

  const capabilities = (): Capabilities => ({
    // 05 §6.2: an empty placement ID makes that ad capability false (free fallback, 02 §13.3).
    interstitial: adSupported('interstitial') && placements.interstitial.trim() !== '',
    rewarded: adSupported('rewarded') && placements.rewarded.trim() !== '',
    banner: false, // not used in Phase 2 (02 §13)
    cloudSave: has(FB_API.getData) && has(FB_API.setData),
    leaderboards: false, // Phase 4, after doc verification (05 §8)
    share: false,
    payments: false,
    haptics: has(FB_API.haptics) || canVibrate(nav),
  });

  const init = (): Promise<void> => {
    initP ??= (async () => {
      const s = sdkRef();
      await s.initializeAsync(); // FIRST SDK call (05 §4)
      try {
        apis = new Set(s.getSupportedAPIs());
      } catch {
        apis = new Set();
      }
      initialized = true;
      if (has(FB_API.haptics)) {
        haptics = createHaptics({
          platformPulse: () => {
            void s.performHapticFeedbackAsync().catch(() => undefined);
          },
          nav,
        });
      }
      if (queuedProgress !== null) applyProgress(queuedProgress);
      queuedProgress = null;
      for (const cb of queuedPause.splice(0)) s.onPause(cb);
    })();
    return initP;
  };

  const setLoadingProgress = (pct: number): void => {
    const p = Math.max(0, Math.min(100, Math.round(Number.isFinite(pct) ? pct : 0)));
    lastProgress = p;
    if (initialized) applyProgress(p);
    else queuedProgress = p;
  };

  const start = (): Promise<void> => {
    startP ??= (async () => {
      await init();
      // The platform loader must reach 100 before the game is shown (05 §5.4).
      if (lastProgress < 100) setLoadingProgress(100);
      await sdkRef().startGameAsync();
      started = true;
    })();
    return startP;
  };

  return {
    id: 'fbig',
    capabilities,
    init,
    setLoadingProgress,
    start,

    getLocale() {
      if (!started) return FALLBACK_LOCALE; // only accurate after startGameAsync (05 §4)
      try {
        return sdkRef().getLocale() || FALLBACK_LOCALE;
      } catch {
        return FALLBACK_LOCALE;
      }
    },

    getPlayerId() {
      if (!initialized) return null;
      try {
        return sdkRef().player.getID() ?? null;
      } catch {
        return null;
      }
    },

    onPause(cb) {
      if (!initialized) {
        queuedPause.push(cb);
        return;
      }
      try {
        sdkRef().onPause(cb);
      } catch {
        /* no pause events then; visibilitychange still covers hide */
      }
    },

    storage,
    ads,
    analytics,
    haptics: { pulse: (pattern) => haptics.pulse(pattern) },
  };
}

/** Entry used by main.ts through the '@platform' alias in the fbig build. */
export function createPlatform(): PlatformAdapter {
  return createFbPlatform();
}
