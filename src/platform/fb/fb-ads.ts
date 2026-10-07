// Owner: platform
// One preloaded interstitial and one rewarded instance (05 §6, 04 §6.3): readiness timeout
// cfg.ads.readyTimeoutMs on the show request, NO timeout on showAsync, FB error codes → AdResult,
// a new instance after every show or failure. Empty placement ID → that kind is unsupported.
import type { AdFailReason, AdKind, PlatformAds, PlatformTimers } from '../types';
import type { FBInstantSDK } from './fbinstant';

export interface FbAdsOptions {
  readonly placements: { readonly interstitial: string; readonly rewarded: string };
  readonly timers: PlatformTimers;
  readonly readyTimeoutMs?: number;
}

/** ADS_NO_FILL → no_fill; ADS_FREQUENT_LOAD / RATE_LIMITED → rate_limited; ADS_NOT_LOADED → not_ready;
 *  CLIENT_UNSUPPORTED_OPERATION → unsupported; rewarded rejection after the show began → skipped; else error. */
export function mapAdError(err: unknown, phase: 'load' | 'show', kind: AdKind): AdFailReason {
  throw new Error('not implemented: mapAdError');
}

export function createFbAds(sdk: FBInstantSDK, opts: FbAdsOptions): PlatformAds {
  throw new Error('not implemented: createFbAds');
}
