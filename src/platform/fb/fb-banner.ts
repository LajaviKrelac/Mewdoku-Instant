// Owner: D
// FB banner (phase2b §3.1, §3.2, §3.5). loadBannerAdAsync(placementID, position) both loads AND shows
// (no separate show call) [search: Meta docs]; hideBannerAdAsync() removes it [meta-plugin]. Meta
// rate-limits loads to one per 45 s [search: Meta docs] (RATE_LIMITED → { ok: false, reason:
// 'rate_limited' }); `unsupported` from any call latches the banner off for the session (05 §6.2).
// Main bundle (the capability glue is part of fb/index.ts). The app's banner-flow (C) decides where
// and when (never on the game screen, 60 s window); this module never shows a banner by itself.
//
// The one race that matters: a hide() that arrives while a load is still in flight. The SDK shows the
// banner when that load completes, which could be after the game screen came up. So a load that
// settles after a hide() is hidden again at once (and its show() answers 'skipped'), and hide()
// itself never waits on a pending load.
// Review FB2B-1 (never a banner in play):
//   - a hideBannerAdAsync that fails (other than unsupported) leaves the banner counted as up and is
//     retried on a short timer (HIDE_RETRY_MS, at most HIDE_RETRIES times) while it is still unwanted,
//     and again on the next hide();
//   - a load that never settles is given up after stuckLoadMs (just under ads.banner.minReloadSec), so
//     a later show() starts a new load instead of waiting on the hung one forever (a late landing
//     still obeys `wanted`).
//
// Unverified (§14 G4): the position argument's values ('bottom' is our reading), the 50 dp height,
// overlay vs. resize of the webview, the 45 s limit, whether hideBannerAdAsync rejects when nothing
// is shown (we only call it after a load that resolved).
import { cfg, type GameConfig } from '../../app/config';
import { within } from '../shared/timers';
import type { AdFailReason, AdResult, PlatformAds, PlatformTimers } from '../types';
import { fbErrorCode } from './fb-errors';
import { probeBanner } from './fb-probe';
import type { FBInstantSDK } from './fbinstant';

export interface FbBannerOptions {
  /** VITE_FB_PLACEMENT_BANNER; empty → never created (capabilities().banner false). */
  readonly placement: string;
  readonly timers: PlatformTimers;
  /** Called once when a call answered CLIENT_UNSUPPORTED_OPERATION (the adapter turns banner off). */
  readonly onUnsupported?: () => void;
  readonly config?: GameConfig;
}

/** True only when BOTH loadBannerAdAsync and hideBannerAdAsync are in getSupportedAPIs() (and exist at runtime), §3.2. */
export function bannerSupported(sdk: FBInstantSDK): boolean {
  return probeBanner(sdk);
}

/** Banner load errors → AdFailReason (05 §6.2 codes; RATE_LIMITED is the 45 s limit). */
export function mapBannerError(err: unknown): AdFailReason {
  switch (fbErrorCode(err)) {
    case 'RATE_LIMITED':
    case 'ADS_FREQUENT_LOAD':
      return 'rate_limited';
    case 'ADS_NO_FILL':
      return 'no_fill';
    case 'CLIENT_UNSUPPORTED_OPERATION':
      return 'unsupported';
    default:
      return 'error';
  }
}

const UNSUPPORTED: AdResult = Object.freeze({ ok: false, reason: 'unsupported' });

/** A failed hideBannerAdAsync is tried again this long after the failure (FB2B-1). */
export const HIDE_RETRY_MS = 1000;
/** Timer retries per hide() (each later hide() call starts a new round). */
export const HIDE_RETRIES = 3;

/**
 * How long a load may stay unsettled before a later show() gives up on it and loads again (FB2B-1):
 * a little under the app's ads.banner.minReloadSec window (banner-flow measures it on another clock),
 * so the next eligible screen after the window starts a new load, and still above Meta's reported
 * 45 s RATE_LIMITED window.
 */
export function stuckLoadMs(c: GameConfig = cfg): number {
  return Math.max(46_000, c.ads.banner.minReloadSec * 1000 - c.ads.readyTimeoutMs);
}

/** PlatformAds.banner for the FB adapter. Never rejects. */
export function createFbBanner(sdk: FBInstantSDK, opts: FbBannerOptions): NonNullable<PlatformAds['banner']> {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const placement = opts.placement.trim();
  /** Readiness-style bound for one SDK call, so a call that never settles cannot hold the app (05 §6.2). */
  const callTimeoutMs = c.ads.readyTimeoutMs;

  let off = placement === '';
  /** The app wants a banner up (show() called, no hide() since). */
  let wanted = false;
  /** A load resolved and no hide has succeeded since: the SDK may be showing a banner. */
  let visible = false;
  /** The in-flight load, shared by overlapping show() calls. */
  let loading: Promise<AdResult> | null = null;
  /** timers.now() when `loading` started: a load older than ads.banner.minReloadSec is given up. */
  let loadingSince = 0;
  /** The pending hide retry timer, and how many retries are left in this round. */
  let retryTimer: number | null = null;
  let retriesLeft = 0;

  const latchOff = (): void => {
    if (off) return;
    off = true;
    wanted = false;
    try {
      opts.onUnsupported?.();
    } catch {
      /* the latch above already holds */
    }
  };

  const clearRetry = (): void => {
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    retryTimer = null;
  };

  const sdkHide = async (): Promise<void> => {
    try {
      await (sdk.hideBannerAdAsync as () => Promise<void>)();
      visible = false;
      clearRetry();
    } catch (err) {
      if (fbErrorCode(err) === 'CLIENT_UNSUPPORTED_OPERATION') {
        latchOff();
        return;
      }
      // Any other failure: the banner may still be up (visible stays true). Try again shortly, while
      // nobody wants it; the next hide() also tries again.
      scheduleRetry();
    }
  };

  const scheduleRetry = (): void => {
    if (retryTimer !== null || retriesLeft <= 0) return;
    retriesLeft--;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      if (wanted || !visible) return;
      void sdkHide();
    }, HIDE_RETRY_MS);
  };

  const load = (position: 'bottom'): Promise<AdResult> => {
    const run = async (): Promise<AdResult> => {
      try {
        await (sdk.loadBannerAdAsync as (id: string, pos?: string) => Promise<void>)(placement, position);
      } catch (err) {
        const reason = mapBannerError(err);
        if (reason === 'unsupported') latchOff();
        return { ok: false, reason };
      }
      visible = true;
      if (!wanted) {
        // hide() came while this load was in flight: take the banner down again at once.
        clearRetry();
        retriesLeft = HIDE_RETRIES;
        await sdkHide();
        return { ok: false, reason: 'skipped' };
      }
      return { ok: true };
    };
    const p = run();
    loading = p;
    loadingSince = timers.now();
    void p.then(() => {
      if (loading === p) loading = null;
    });
    return p;
  };

  return {
    async show(position) {
      try {
        if (off) return UNSUPPORTED;
        wanted = true;
        clearRetry();
        // A load that never settled is given up (stuckLoadMs): start a new one.
        if (loading && timers.now() - loadingSince >= stuckLoadMs(c)) loading = null;
        const p = loading ?? load(position);
        // The load keeps going after a timeout; when it lands it is shown or hidden per `wanted`.
        return await within(timers, p, callTimeoutMs, (): AdResult => ({ ok: false, reason: 'timeout' }));
      } catch {
        return { ok: false, reason: 'error' }; // never reject (PlatformAds contract)
      }
    },

    async hide() {
      try {
        wanted = false;
        // Nothing up, or the pending load hides itself when it lands: no SDK call, nothing to wait for.
        if (!visible) return;
        clearRetry();
        retriesLeft = HIDE_RETRIES;
        await within(timers, sdkHide(), callTimeoutMs, () => undefined);
      } catch {
        /* never reject */
      }
    },
  };
}
