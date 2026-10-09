// Owner: D (Phase 2b; was platform)
// FBInstant adapter (04 §6.3, 05 §4): initializeAsync first, capabilities from getSupportedAPIs()
// (ads only with non-empty VITE_FB_PLACEMENT_* IDs), locale read after startGameAsync.
//
// No SDK call happens before init(): the factory only wires objects, setLoadingProgress() and
// onPause() calls made earlier are queued and replayed once initializeAsync() has resolved.
// init() and start() are memoised while pending or resolved; a rejection clears the memo, so the app
// can try again (PLAT-8).
// The local save mirror is per player (PLAT-2, see fb-storage.ts): `${save.storageKey}:<player ID>`.
// An ad kind whose load or show reports 'unsupported' (CLIENT_UNSUPPORTED_OPERATION) is switched off
// for the rest of the session, so capabilities() turns false and the 02 §13.3 free fallback applies.
//
// Phase 2b (D): the banner (`ads.banner`, main bundle; only when both banner APIs are supported and
// VITE_FB_PLACEMENT_BANNER is set, latched off by 'unsupported'), and `ranking` / `groups` / `payments`
// as main-bundle facades over the lazy `fb-social` chunk (fb-social-glue.ts). Their capabilities come
// from cheap probes after init(), so capabilities() stays final after init(); the chunk is preloaded
// right after start() (never awaited, never before the first route) when any of them is usable.
import { cfg } from '../../app/config';
import { canVibrate, createHaptics, type Haptics } from '../shared/haptics';
import { createSystemTimers } from '../shared/timers';
import type { AdKind, Capabilities, PlatformAdapter, PlatformAds, PlatformTimers } from '../types';
import { createLocalFlag, createLocalStore } from '../web/local-storage';
import { createFbAds } from './fb-ads';
import { createFbAnalytics } from './fb-analytics';
import { createFbBanner } from './fb-banner';
import { parseLeaderboardMap, probeBanner } from './fb-probe';
import { createSocialGlue, type SocialModule } from './fb-social-glue';
import { createFbStorage } from './fb-storage';
import type { FBInstantSDK } from './fbinstant';

export interface FbPlatformOptions {
  /** Defaults to window.FBInstant. */
  readonly sdk?: FBInstantSDK;
  /** Defaults to import.meta.env.VITE_FB_PLACEMENT_INTERSTITIAL / _REWARDED / _BANNER (banner: '' when omitted here). */
  readonly placements?: { readonly interstitial: string; readonly rewarded: string; readonly banner?: string };
  /** VITE_FB_LEADERBOARDS (JSON map BoardKey → dashboard name or id). Defaults to the env value. */
  readonly leaderboards?: string;
  /** Loads the lazy `fb-social` chunk. Default: () => import('./fb-social'). Tests inject failures. */
  readonly loadSocial?: () => Promise<SocialModule>;
  /** Where overlay views are mounted. Default: the global document. */
  readonly doc?: Document;
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
    banner: import.meta.env.VITE_FB_PLACEMENT_BANNER ?? '',
  };
  const bannerPlacement = (placements.banner ?? '').trim();
  const boards = parseLeaderboardMap(opts.leaderboards !== undefined ? opts.leaderboards : import.meta.env.VITE_FB_LEADERBOARDS);
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

  /** Ad kinds latched off after an 'unsupported' result this session (PLAT-4). */
  const adsOff = new Set<AdKind>();
  /** The banner latched off after an 'unsupported' result this session (phase2b §3.2). */
  let bannerOff = false;

  const has = (api: string): boolean => apis.has(api);
  const adSupported = (kind: AdKind): boolean =>
    !adsOff.has(kind) && has(kind === 'interstitial' ? FB_API.interstitial : FB_API.rewarded);

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

  const storageOpt = opts.storage !== undefined ? { storage: opts.storage } : {};
  const mirrorAt = (key: string) => ({
    local: createLocalStore(key, { ...storageOpt, now: () => timers.now() }),
    unmerged: createLocalFlag(`${key}#unmerged`, storageOpt),
  });
  const unscoped = mirrorAt(cfg.save.storageKey);
  const storage = createFbStorage(forward, {
    local: unscoped.local,
    unmerged: unscoped.unmerged,
    scoped: {
      playerId: () => playerId(),
      // encodeURIComponent keeps ':' and '#' out of the ID, so no key can collide with another.
      mirrorFor: (id) => mirrorAt(`${cfg.save.storageKey}:${encodeURIComponent(id)}`),
    },
    timers,
    cloudEnabled: () => initialized && has(FB_API.getData) && has(FB_API.setData),
  });
  const ads = createFbAds(forward, {
    placements,
    timers,
    readyTimeoutMs: cfg.ads.readyTimeoutMs,
    supported: (kind) => initialized && adSupported(kind),
    onUnsupported: (kind) => adsOff.add(kind),
  });
  const analytics = createFbAnalytics(forward, { ready: () => initialized });

  // ── phase2b: banner (main bundle) ──
  let bannerProbe: boolean | null = null;
  const bannerUsable = (): boolean => {
    if (!initialized || bannerOff || bannerPlacement === '') return false;
    bannerProbe ??= probeBanner(sdkRef(), apis);
    return bannerProbe;
  };
  let banner: NonNullable<PlatformAds['banner']> | null = null;
  const bannerApi = (): PlatformAds['banner'] => {
    if (!bannerUsable()) return undefined;
    banner ??= createFbBanner(sdkRef(), {
      placement: bannerPlacement,
      timers,
      onUnsupported: () => {
        bannerOff = true;
      },
    });
    return banner;
  };
  // `banner` is a getter: present only while usable (after init, both APIs, a placement, not latched off).
  const adsAll: PlatformAds = {
    preload: (kind) => ads.preload(kind),
    isReady: (kind) => ads.isReady(kind),
    showInterstitial: (p) => ads.showInterstitial(p),
    showRewarded: (p) => ads.showRewarded(p),
    get banner() {
      return bannerApi();
    },
  };

  // ── phase2b: rankings, overlay views, groups, payments (lazy fb-social chunk) ──
  const social = createSocialGlue({
    sdk: sdkRef,
    apis: () => apis,
    initialized: () => initialized,
    boards,
    timers,
    load: opts.loadSocial ?? (() => import('./fb-social')),
    ...(opts.doc ? { doc: opts.doc } : {}),
  });

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
    // phase2b §3.2: both banner APIs, a placement id, not latched off.
    banner: bannerUsable(),
    cloudSave: has(FB_API.getData) && has(FB_API.setData),
    // phase2b §5.4: = ranking.caps().global (a leaderboard API and at least one board id).
    leaderboards: social.ranking.caps().global,
    share: false,
    // phase2b §8.4: not iOS, payments.purchaseAsync supported; the Buy section also needs payments.ready().
    payments: social.payments() !== undefined,
    haptics: has(FB_API.haptics) || canVibrate(nav),
    overlayViews: social.overlayViews(),
    groups: social.groups() !== undefined,
  });

  const playerId = (): string | null => {
    if (!initialized) return null;
    try {
      return sdkRef().player.getID() ?? null;
    } catch {
      return null;
    }
  };

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
    })().catch((err: unknown) => {
      initP = null; // a later init() tries again (PLAT-8)
      throw err;
    });
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
      // phase2b §11: the fb-social chunk loads after start(), never blocking the first route.
      social.preload();
    })().catch((err: unknown) => {
      startP = null; // a later start() tries again (PLAT-8)
      throw err;
    });
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

    getPlayerId: playerId,

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
    ads: adsAll,
    analytics,
    haptics: { pulse: (pattern) => haptics.pulse(pattern) },
    ranking: social.ranking,
    get groups() {
      return social.groups();
    },
    get payments() {
      return social.payments();
    },
  };
}

/** Entry used by main.ts through the '@platform' alias in the fbig build. */
export function createPlatform(): PlatformAdapter {
  return createFbPlatform();
}
