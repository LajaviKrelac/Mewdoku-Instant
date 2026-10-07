// Owner: app
// Interstitial and rewarded flows (02 §13, 04 §5.7): input lock + mute (+ timer pause) from the
// request until the ad settles; readiness timeout lives in the adapter; ads.showWatchdogMs safety
// net here; ad_* analytics with the result; preload a new instance afterwards. Never throws.
// The pacing gate (game/ad-pacing.ts) is checked by the CALLER before interstitial().
import type { InterstitialTrigger } from '../game/ad-pacing';
import type { AdResult, PlatformAdapter, RewardedPlacement } from '../platform/types';
import type { Clock } from './clock';
import type { AppBus } from './events';

export type AdFlowResult = AdResult | { ok: false; reason: 'watchdog' };

export interface AdFlowDeps {
  readonly platform: Pick<PlatformAdapter, 'ads' | 'capabilities'>;
  readonly clock: Clock;
  /** Receives 'ad', 'analytics' (ad_interstitial / ad_rewarded) and pause/resume { reason: 'ad' }. */
  readonly bus: AppBus;
  setInputLocked(locked: boolean): void;
  setMuted(muted: boolean): void;
}

export interface AdFlow {
  interstitial(trigger: InterstitialTrigger): Promise<AdFlowResult>;
  /** ok only when the rewarded ad completed. Showing the 'no video' toast is the caller's job. */
  rewarded(placement: RewardedPlacement): Promise<AdFlowResult>;
  showing(): boolean;
}

export function createAdFlow(deps: AdFlowDeps): AdFlow {
  throw new Error('not implemented: createAdFlow');
}
