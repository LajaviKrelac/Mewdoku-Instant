// Owner: C (Phase 2b)
// Interstitial gate (02 §13.2) and the banner gate (phase2b §3.2). PURE: clock values and
// capabilities are passed in.
// Phase 2d (G1, docs/phase2d/look-spec.md §1.16): the game screen qualifies for a banner during play
// only while ads.banner.duringPlay is on (then the same checks as every banner screen).
// Phase 2e (G1, docs/phase2e/spec.md §3.1, §3.2; CONTRACTS §6): the trigger 'fail_home' (the fail card's
// Home), the retry cadence (ads.interstitial.retryEveryN: only every Nth Retry since the last level win
// may show an ad; else 'retry_cadence'), and the banner end date (ads.banner.untilDate: from that local
// date the banner gate answers 'ended'). The cadence itself ("every level from level 10, 30 s floor") is
// the cooldown step table (ads.interstitial.cooldownSec), unchanged code.
import { cfg, type BannerScreen, type GameConfig } from '../app/config';
import type { SaveData } from './types';

/** phase2b §3.2 adds `event_next` (the event victory screen's "Puzzle {i+1}"). Phase 2e (§3.2): + 'fail_home'. */
export type InterstitialTrigger = 'next_level' | 'retry' | 'daily_done' | 'event_next' | 'fail_home';

export interface PacingInput {
  readonly trigger: InterstitialTrigger;
  readonly now: number;
  /** Clock time when platform.start() resolved in this page load. */
  readonly sessionStartedAt: number;
  /** `purchases.noAds` (phase2b §8.3) turns interstitials off; absent = not owned. */
  readonly save: Pick<SaveData, 'progress' | 'ads' | 'firstSeenAt'> & { readonly purchases?: Pick<SaveData['purchases'], 'noAds'> };
  /** capabilities().interstitial */
  readonly interstitialSupported: boolean;
  /**
   * Phase 2e (spec §3.2, P-I4): for trigger 'retry', the Retries since the last level win in this page
   * load, 1-based (this Retry included). Only every ads.interstitial.retryEveryN-th may show an ad.
   * null = not a Retry, or no cadence (the 2b rule). Required since I-3 (spec §8.4): every caller says which.
   */
  readonly retryIndex: number | null;
}

/** Why the gate said no ('ok' = show). Logged as result 'gated' when not 'ok' (Phase 2e: with `gate`). */
export type GateDecision =
  | 'ok'
  | 'disabled'
  | 'no_ads'
  | 'unsupported'
  | 'trigger'
  | 'min_levels'
  | 'grace'
  | 'cooldown'
  | 'retry_cadence';

const DAY_MS = 86_400_000;

/**
 * 02 §13.2, checked in the spec's order; the first failing condition is the reason:
 * ads.enabled → No Ads not owned (phase2b §8.3; rewarded ads stay) → capabilities.interstitial → trigger listed → completed ≥ minCompletedLevels (the
 * tutorial counts, dailies do not) → (Phase 2e) the retry cadence → session grace → tenure cooldown
 * since save.ads.lastAdAt (2e: a 30 s floor after the L1 flip, the same step table).
 */
export function interstitialGate(input: PacingInput, c: GameConfig = cfg): GateDecision {
  const ic = c.ads.interstitial;
  if (!c.ads.enabled) return 'disabled';
  if (input.save.purchases?.noAds === true) return 'no_ads';
  if (!input.interstitialSupported) return 'unsupported';
  if (!ic.triggers.includes(input.trigger)) return 'trigger';
  if (input.save.progress.completed < ic.minCompletedLevels) return 'min_levels';
  if (input.trigger === 'retry' && input.retryIndex !== null && !retryCadenceOk(input.retryIndex, c)) return 'retry_cadence';
  if (input.now - input.sessionStartedAt < ic.sessionGraceSec * 1000) return 'grace';
  const cooldownMs = cooldownSecFor(tenureDays(input.now, input.save.firstSeenAt), c) * 1000;
  if (input.now - input.save.ads.lastAdAt < cooldownMs) return 'cooldown';
  return 'ok';
}

/**
 * Phase 2e (spec §3.2, P-I4): whether the `retryIndex`-th Retry (1-based) may show an ad: every
 * ads.interstitial.retryEveryN-th (2: Retry 1 no, 2 yes, 3 no, 4 yes). retryEveryN ≤ 1: every Retry.
 */
export function retryCadenceOk(retryIndex: number, c: GameConfig = cfg): boolean {
  const n = Math.floor(c.ads.interstitial.retryEveryN);
  if (!(n > 1)) return true;
  return retryIndex > 0 && retryIndex % n === 0;
}

/** interstitialGate(input) === 'ok'. */
export function canShowInterstitial(input: PacingInput, c: GameConfig = cfg): boolean {
  return interstitialGate(input, c) === 'ok';
}

/** floor((now − firstSeenAt) / 86 400 000), never negative. */
export function tenureDays(now: number, firstSeenAt: number): number {
  return Math.max(0, Math.floor((now - firstSeenAt) / DAY_MS));
}

/** 120 / 100 / 90 s by tenure: the cfg.ads.interstitial.cooldownSec step with the largest fromDay ≤ tenure. */
export function cooldownSecFor(tenure: number, c: GameConfig = cfg): number {
  const steps = c.ads.interstitial.cooldownSec;
  let sec = steps[0]?.sec ?? 0;
  let from = -Infinity;
  for (const step of steps) {
    if (step.fromDay <= tenure && step.fromDay >= from) {
      sec = step.sec;
      from = step.fromDay;
    }
  }
  return sec;
}

// ─────────────────────────────── banners (phase2b §3.2) ───────────────────────────────

export interface BannerGateInput {
  /**
   * The screen about to show; ads.banner.screens qualify, and phase 2d the game screen ('game') while
   * ads.banner.duringPlay is on; never a full-screen overlay, the ranking panel or the boot screen.
   */
  readonly screen: BannerScreen | 'game' | 'ranking' | 'boot' | 'overlay';
  readonly save: Pick<SaveData, 'progress'> & { readonly purchases: Pick<SaveData['purchases'], 'noAds'> };
  /** capabilities().banner: both banner APIs and a placement id. */
  readonly bannerSupported: boolean;
  /** The first-run tutorial's victory screen never shows a banner. */
  readonly firstRunTutorial: boolean;
  /**
   * Phase 2e (spec §3.1): today's local date key (dailyDateKey(now)); from ads.banner.untilDate on the
   * gate answers 'ended'. null = no end-date check (no clock). Required since I-3 (spec §8.4).
   */
  readonly today: string | null;
}

export type BannerGateDecision = 'ok' | 'disabled' | 'unsupported' | 'screen' | 'min_levels' | 'no_ads' | 'tutorial' | 'ended';

/** Phase 2e (spec §3.1): banners have ended for good on `today` (ads.banner.untilDate, a local date; '' = never). */
export function bannerEnded(today: string | null | undefined, c: GameConfig = cfg): boolean {
  const until = c.ads.banner.untilDate;
  return until !== '' && typeof today === 'string' && today >= until;
}

/**
 * phase2b §3.2 truth table: ads.banner.enabled → (Phase 2e) not past ads.banner.untilDate ('ended') →
 * capability → screen in ads.banner.screens (phase 2d
 * §1.16: 'game' qualifies exactly when ads.banner.duringPlay is on, whatever the list says) →
 * progress.completed ≥ ads.banner.fromCompletedLevels → not purchases.noAds → not the first-run
 * tutorial. The 60 s reload window is banner-flow's (it needs the clock).
 */
export function bannerGate(input: BannerGateInput, c: GameConfig = cfg): BannerGateDecision {
  const b = c.ads.banner;
  if (!c.ads.enabled || !b.enabled) return 'disabled';
  if (bannerEnded(input.today, c)) return 'ended';
  if (!input.bannerSupported) return 'unsupported';
  const screenOk = input.screen === 'game' ? b.duringPlay : (b.screens as readonly string[]).includes(input.screen);
  if (!screenOk) return 'screen';
  if (input.save.progress.completed < b.fromCompletedLevels) return 'min_levels';
  if (input.save.purchases.noAds) return 'no_ads';
  if (input.firstRunTutorial) return 'tutorial';
  return 'ok';
}

