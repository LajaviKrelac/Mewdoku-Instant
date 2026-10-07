// Owner: platform
// Web adapter (04 §6.2): local storage, mock ads in dev/e2e (unsupported in production → free
// fallback), no-op analytics, navigator.vibrate haptics.
import { cfg } from '../../app/config';
import { canVibrate, createVibrateHaptics } from '../shared/haptics';
import { createSystemTimers } from '../shared/timers';
import type { AdResult, Capabilities, PlatformAdapter, PlatformAds, PlatformTimers } from '../types';
import { createLocalStore } from './local-storage';
import { createMockAds, readMockAdMode, type MockAdMode } from './mock-ads';

export interface WebPlatformOptions {
  /** location.search, for ?ads= (dev/e2e only). */
  readonly search?: string;
  /** Mock ads on: import.meta.env.DEV || __E2E__ by default. */
  readonly mockAds?: boolean;
  readonly storage?: Storage | null;
  readonly nav?: Navigator;
  readonly doc?: Document;
  readonly timers?: PlatformTimers;
}

/** Compile-time constant: false in production web builds, so the mock is tree-shaken away. */
const MOCK_BUILD: boolean = import.meta.env.DEV || __E2E__;

type MockFactory = (search: string, deps: { doc: Document; timers: PlatformTimers }) => { mode: MockAdMode; ads: PlatformAds };

const mockFactory: MockFactory = (search, deps) => {
  const mode = readMockAdMode(search);
  return { mode, ads: createMockAds(mode, deps) };
};

const UNSUPPORTED: AdResult = Object.freeze({ ok: false, reason: 'unsupported' });

/** Production web: no ad network, so every request is 'unsupported' → free fallback (02 §13.3). */
const NO_ADS: PlatformAds = Object.freeze({
  preload(): void {},
  isReady: () => false,
  showInterstitial: () => Promise.resolve(UNSUPPORTED),
  showRewarded: () => Promise.resolve(UNSUPPORTED),
});

/** Testable factory. */
export function createWebPlatform(opts: WebPlatformOptions = {}): PlatformAdapter {
  return buildWebPlatform(opts, (opts.mockAds ?? MOCK_BUILD) ? mockFactory : null);
}

/** Entry used by main.ts through the '@platform' alias. */
export function createPlatform(): PlatformAdapter {
  return buildWebPlatform({}, MOCK_BUILD ? mockFactory : null);
}

function buildWebPlatform(opts: WebPlatformOptions, makeMock: MockFactory | null): PlatformAdapter {
  const timers = opts.timers ?? createSystemTimers();
  const nav = opts.nav ?? (typeof navigator === 'undefined' ? undefined : navigator);
  const doc = opts.doc ?? (typeof document === 'undefined' ? undefined : document);
  const search = opts.search ?? (typeof location === 'undefined' ? '' : location.search);

  const local = createLocalStore(cfg.save.storageKey, {
    ...(opts.storage !== undefined ? { storage: opts.storage } : {}),
    now: () => timers.now(),
  });

  const mock = makeMock && doc ? makeMock(search, { doc, timers }) : null;
  const adsOn = mock !== null && mock.mode !== 'unsupported';
  const caps: Capabilities = Object.freeze({
    interstitial: adsOn,
    rewarded: adsOn,
    banner: false,
    cloudSave: false,
    leaderboards: false,
    share: false,
    payments: false,
    haptics: canVibrate(nav),
  });

  return {
    id: 'web',
    capabilities: () => caps,
    init: () => Promise.resolve(),
    // The S0 splash is the router's (ui/ is out of reach for platform/); nothing to forward here.
    setLoadingProgress(): void {},
    start: () => Promise.resolve(),
    getLocale: () => (nav?.language || 'en').replace('-', '_'),
    getPlayerId: () => null,
    // No platform pause on the web: the app watches visibilitychange itself (04 §5, visibility.ts).
    onPause(): void {},
    storage: {
      load() {
        const r = local.read();
        return Promise.resolve({ local: r.value, cloud: null, corrupt: r.corrupt });
      },
      save(data) {
        local.write(data); // synchronous; the cloud mode is meaningless on the web (04 §7.1)
        return Promise.resolve();
      },
      status: () => local.status(),
      onMemoryFallback(cb) {
        local.onMemory?.(cb);
      },
    },
    ads: mock ? mock.ads : NO_ADS,
    analytics: {
      log(name, params) {
        // The web build does not log (02 §20); dev builds echo to the console for debugging.
        if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.debug('[analytics]', name, params ?? {});
      },
    },
    haptics: createVibrateHaptics(nav),
  };
}
