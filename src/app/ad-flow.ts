// Owner: app
// Interstitial and rewarded flows (02 §13, 04 §5.7): input lock + mute (+ timer pause) from the
// request until the ad settles; readiness timeout lives in the adapter; ads.showWatchdogMs safety
// net here; ad_* analytics with the result; preload a new instance afterwards. Never throws.
// The pacing gate (game/ad-pacing.ts) is checked by the CALLER before interstitial().
import type { InterstitialTrigger } from '../game/ad-pacing';
import type { AdKind, AdPlacement, AdResult, PlatformAdapter, RewardedPlacement } from '../platform/types';
import { cfg, type GameConfig } from './config';
import type { Clock, TimerId } from './clock';
import type { AdResultCode, AppBus } from './events';

export type AdFlowResult = AdResult | { ok: false; reason: 'watchdog' };

export interface AdFlowDeps {
  readonly platform: Pick<PlatformAdapter, 'ads' | 'capabilities'>;
  readonly clock: Clock;
  /** Receives 'ad', 'analytics' (ad_interstitial / ad_rewarded) and pause/resume { reason: 'ad' }. */
  readonly bus: AppBus;
  setInputLocked(locked: boolean): void;
  setMuted(muted: boolean): void;
  readonly config?: GameConfig;
}

export interface AdFlow {
  interstitial(trigger: InterstitialTrigger): Promise<AdFlowResult>;
  /** ok only when the rewarded ad completed. Showing the 'no video' toast is the caller's job. */
  rewarded(placement: RewardedPlacement): Promise<AdFlowResult>;
  showing(): boolean;
}

/** `result` code for analytics and the 'ad' bus event. */
export function adResultCode(r: AdFlowResult): AdResultCode {
  return r.ok ? 'ok' : r.reason;
}

export function createAdFlow(deps: AdFlowDeps): AdFlow {
  const c = deps.config ?? cfg;
  const { bus, clock } = deps;
  let active = 0;

  function begin(): void {
    active++;
    if (active !== 1) return;
    deps.setInputLocked(true);
    deps.setMuted(true);
    bus.emit('pause', { reason: 'ad' });
  }

  function end(): void {
    active = Math.max(0, active - 1);
    if (active !== 0) return;
    deps.setInputLocked(false);
    deps.setMuted(false);
    bus.emit('resume', { reason: 'ad' });
  }

  function report(kind: AdKind, placement: AdPlacement, r: AdFlowResult): void {
    const result = adResultCode(r);
    if (kind === 'interstitial') {
      bus.emit('analytics', { name: 'ad_interstitial', params: { trigger: placement as InterstitialTrigger, result } });
    } else {
      bus.emit('analytics', { name: 'ad_rewarded', params: { placement: placement as RewardedPlacement, result } });
    }
    bus.emit('ad', { kind, placement, result });
  }

  function supported(kind: AdKind): boolean {
    try {
      return deps.platform.capabilities()[kind];
    } catch {
      return false;
    }
  }

  async function run(kind: AdKind, placement: AdPlacement, show: () => Promise<AdResult>): Promise<AdFlowResult> {
    if (!c.ads.enabled || !supported(kind)) {
      const r: AdFlowResult = { ok: false, reason: 'unsupported' };
      report(kind, placement, r);
      return r;
    }
    begin();
    let watchdog: TimerId | null = null;
    let result: AdFlowResult;
    try {
      const shown = Promise.resolve()
        .then(show)
        .catch((): AdFlowResult => ({ ok: false, reason: 'error' }));
      const timedOut = new Promise<AdFlowResult>((resolve) => {
        // Safety net only (02 §13.2): a shown ad is never cut short; this unlocks input if the
        // adapter's promise never settles.
        watchdog = clock.setTimeout(() => resolve({ ok: false, reason: 'watchdog' }), c.ads.showWatchdogMs);
      });
      result = await Promise.race([shown, timedOut]);
    } finally {
      clock.clearTimeout(watchdog);
      end();
    }
    report(kind, placement, result);
    try {
      deps.platform.ads.preload(kind); // one fresh instance after every show or failure (05 §6.2)
    } catch {
      // preload problems surface on the next show
    }
    return result;
  }

  return {
    interstitial: (trigger) => run('interstitial', trigger, () => deps.platform.ads.showInterstitial(trigger)),
    rewarded: (placement) => run('rewarded', placement, () => deps.platform.ads.showRewarded(placement)),
    showing: () => active > 0,
  };
}
