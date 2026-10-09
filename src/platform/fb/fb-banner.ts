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

  const sdkHide = async (): Promise<void> => {
    try {
      await (sdk.hideBannerAdAsync as () => Promise<void>)();
      visible = false;
    } catch (err) {
      if (fbErrorCode(err) === 'CLIENT_UNSUPPORTED_OPERATION') latchOff();
      // Any other failure: the banner may still be up; a later hide() tries again.
    }
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
        await sdkHide();
        return { ok: false, reason: 'skipped' };
      }
      return { ok: true };
    };
    const p = run();
    loading = p;
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
        await within(timers, sdkHide(), callTimeoutMs, () => undefined);
      } catch {
        /* never reject */
      }
    },
  };
}
