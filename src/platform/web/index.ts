// Owner: D (Phase 2b; was platform)
// Web adapter (04 §6.2): local storage, mock ads in dev/e2e (unsupported in production → free
// fallback), no-op analytics, navigator.vibrate haptics.
// Two tabs share one save (RP-5): a write by another tab arrives as a 'storage' event and is handed
// to the app (onExternalSave, source 'tab'), which merges it into its live save (04 §7.3), so a stale
// tab's next write can no longer take progress or best times backwards.
import { cfg } from '../../app/config';
import { canVibrate, createVibrateHaptics } from '../shared/haptics';
import { createSystemTimers } from '../shared/timers';
import type { AdResult, Capabilities, ExternalSave, PlatformAdapter, PlatformAds, PlatformTimers } from '../types';
import { createLocalStore } from './local-storage';
import { createMockAds, createMockBanner, readMockAdMode, type MockAdMode } from './mock-ads';

export interface WebPlatformOptions {
  /** location.search, for ?ads= (dev/e2e only). */
  readonly search?: string;
  /** Mock ads on: import.meta.env.DEV || __E2E__ by default. */
  readonly mockAds?: boolean;
  readonly storage?: Storage | null;
  readonly nav?: Navigator;
  readonly doc?: Document;
  readonly timers?: PlatformTimers;
  /** Where 'storage' events from other tabs arrive. Default: doc's window. */
  readonly win?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
}

/** Compile-time constant: false in production web builds, so the mock is tree-shaken away. */
const MOCK_BUILD: boolean = import.meta.env.DEV || __E2E__;

type MockFactory = (search: string, deps: { doc: Document; timers: PlatformTimers }) => { mode: MockAdMode; ads: PlatformAds };

const mockFactory: MockFactory = (search, deps) => {
  const mode = readMockAdMode(search);
  const ads = createMockAds(mode, deps);
  // phase2b §3.3: the mock banner follows the same ?ads= mode (absent when 'unsupported').
  const banner = createMockBanner(mode, deps);
  return { mode, ads: banner ? { ...ads, banner } : ads };
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
  const win = opts.win !== undefined ? opts.win : (doc?.defaultView ?? null);

  const local = createLocalStore(cfg.save.storageKey, {
    ...(opts.storage !== undefined ? { storage: opts.storage } : {}),
    now: () => timers.now(),
  });

  const mock = makeMock && doc ? makeMock(search, { doc, timers }) : null;
  const adsOn = mock !== null && mock.mode !== 'unsupported';
  const caps: Capabilities = Object.freeze({
    interstitial: adsOn,
    rewarded: adsOn,
    banner: adsOn && mock?.ads.banner !== undefined, // dev/e2e mock banner only (phase2b §3.3)
    cloudSave: false,
    leaderboards: false,
    share: false,
    payments: false,
    haptics: canVibrate(nav),
    overlayViews: false, // phase2b: the web has no FB overlay views, tournaments or payments
    groups: false,
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
      onExternalSave(cb) {
        if (!win) return () => undefined;
        const onStorage = (e: Event): void => {
          const { key, newValue } = e as StorageEvent;
          // Only our save key; a removal (newValue null) or a clear() (key null) carries nothing to merge.
          if (key !== cfg.save.storageKey || newValue === null || newValue === undefined) return;
          let value: unknown;
          try {
            value = JSON.parse(newValue) as unknown;
          } catch {
            return; // the other tab wrote something unreadable: keep ours
          }
          const copy: ExternalSave = { source: 'tab', value };
          try {
            cb(copy);
          } catch {
            /* a listener must never break storage */
          }
        };
        win.addEventListener('storage', onStorage);
        return () => win.removeEventListener('storage', onStorage);
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
