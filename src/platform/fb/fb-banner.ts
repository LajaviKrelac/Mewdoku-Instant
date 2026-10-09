// Owner: D
// FB banner (phase2b §3.1, §3.2, §3.5). loadBannerAdAsync(placementID, position) both loads AND shows
// (no separate show call); hideBannerAdAsync() removes it. Meta rate-limits loads to one per 45 s
// (RATE_LIMITED → { ok: false, reason: 'rate_limited' }); `unsupported` from any call latches the
// banner off for the session (05 §6.2). Main bundle (the capability glue is part of fb/index.ts).
// The app's banner-flow (C) decides where and when; this module never shows a banner by itself.
// F0 stub: signature final; body is D's (plus the SDK typings in fbinstant.d.ts and the stub fixture).
import type { GameConfig } from '../../app/config';
import type { PlatformAds, PlatformTimers } from '../types';
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
  void sdk;
  throw new Error('not implemented: bannerSupported (D, phase2b §3.2)');
}

/** PlatformAds.banner for the FB adapter. Never rejects. */
export function createFbBanner(sdk: FBInstantSDK, opts: FbBannerOptions): NonNullable<PlatformAds['banner']> {
  void sdk;
  void opts;
  throw new Error('not implemented: createFbBanner (D, phase2b §3.5)');
}
