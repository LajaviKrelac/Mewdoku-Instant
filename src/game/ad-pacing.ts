// Owner: C (Phase 2b)
// Interstitial gate (02 §13.2) and the banner gate (phase2b §3.2). PURE: clock values and
// capabilities are passed in.
import { cfg, type BannerScreen, type GameConfig } from '../app/config';
import type { SaveData } from './types';

/** phase2b §3.2 adds `event_next` (the event victory screen's "Puzzle {i+1}"). */
export type InterstitialTrigger = 'next_level' | 'retry' | 'daily_done' | 'event_next';

export interface PacingInput {
  readonly trigger: InterstitialTrigger;
  readonly now: number;
  /** Clock time when platform.start() resolved in this page load. */
  readonly sessionStartedAt: number;
  /** `purchases.noAds` (phase2b §8.3) turns interstitials off; absent = not owned. */
  readonly save: Pick<SaveData, 'progress' | 'ads' | 'firstSeenAt'> & { readonly purchases?: Pick<SaveData['purchases'], 'noAds'> };
  /** capabilities().interstitial */
  readonly interstitialSupported: boolean;
}

/** Why the gate said no ('ok' = show). Logged as result 'gated' when not 'ok'. */
export type GateDecision = 'ok' | 'disabled' | 'no_ads' | 'unsupported' | 'trigger' | 'min_levels' | 'grace' | 'cooldown';

const DAY_MS = 86_400_000;

/**
 * 02 §13.2, checked in the spec's order; the first failing condition is the reason:
 * ads.enabled → No Ads not owned (phase2b §8.3; rewarded ads stay) → capabilities.interstitial → trigger listed → completed ≥ minCompletedLevels (the
 * tutorial counts, dailies do not) → session grace → tenure cooldown since save.ads.lastAdAt.
 */
export function interstitialGate(input: PacingInput, c: GameConfig = cfg): GateDecision {
  const ic = c.ads.interstitial;
  if (!c.ads.enabled) return 'disabled';
  if (input.save.purchases?.noAds === true) return 'no_ads';
  if (!input.interstitialSupported) return 'unsupported';
  if (!ic.triggers.includes(input.trigger)) return 'trigger';
  if (input.save.progress.completed < ic.minCompletedLevels) return 'min_levels';
  if (input.now - input.sessionStartedAt < ic.sessionGraceSec * 1000) return 'grace';
  const cooldownMs = cooldownSecFor(tenureDays(input.now, input.save.firstSeenAt), c) * 1000;
  if (input.now - input.save.ads.lastAdAt < cooldownMs) return 'cooldown';
  return 'ok';
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
  /** The screen about to show; only ads.banner.screens qualify (never the game screen, a full-screen overlay or the boot screen). */
  readonly screen: BannerScreen | 'game' | 'ranking' | 'boot' | 'overlay';
  readonly save: Pick<SaveData, 'progress' | 'purchases'>;
  /** capabilities().banner: both banner APIs and a placement id. */
  readonly bannerSupported: boolean;
  /** The first-run tutorial's victory screen never shows a banner. */
  readonly firstRunTutorial: boolean;
}

export type BannerGateDecision = 'ok' | 'disabled' | 'unsupported' | 'screen' | 'min_levels' | 'no_ads' | 'tutorial';

/**
 * phase2b §3.2 truth table: ads.banner.enabled → capability → screen in ads.banner.screens →
 * progress.completed ≥ ads.banner.fromCompletedLevels → not purchases.noAds → not the first-run
 * tutorial. The 60 s reload window is banner-flow's (it needs the clock).
 */
export function bannerGate(input: BannerGateInput, c: GameConfig = cfg): BannerGateDecision {
  const b = c.ads.banner;
  if (!c.ads.enabled || !b.enabled) return 'disabled';
  if (!input.bannerSupported) return 'unsupported';
  if (!(b.screens as readonly string[]).includes(input.screen)) return 'screen';
  if (input.save.progress.completed < b.fromCompletedLevels) return 'min_levels';
  if (input.save.purchases.noAds) return 'no_ads';
  if (input.firstRunTutorial) return 'tutorial';
  return 'ok';
}

