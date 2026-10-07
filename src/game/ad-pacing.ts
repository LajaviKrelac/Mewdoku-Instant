// Owner: game
// Interstitial gate (02 §13.2). PURE: clock values and capabilities are passed in.
import { cfg, type GameConfig } from '../app/config';
import type { SaveDataV1 } from './types';

export type InterstitialTrigger = 'next_level' | 'retry' | 'daily_done';

export interface PacingInput {
  readonly trigger: InterstitialTrigger;
  readonly now: number;
  /** Clock time when platform.start() resolved in this page load. */
  readonly sessionStartedAt: number;
  readonly save: Pick<SaveDataV1, 'progress' | 'ads' | 'firstSeenAt'>;
  /** capabilities().interstitial */
  readonly interstitialSupported: boolean;
}

/** Why the gate said no ('ok' = show). Logged as result 'gated' when not 'ok'. */
export type GateDecision = 'ok' | 'disabled' | 'unsupported' | 'trigger' | 'min_levels' | 'grace' | 'cooldown';

const DAY_MS = 86_400_000;

/**
 * 02 §13.2, checked in the spec's order; the first failing condition is the reason:
 * ads.enabled → capabilities.interstitial → trigger listed → completed ≥ minCompletedLevels (the
 * tutorial counts, dailies do not) → session grace → tenure cooldown since save.ads.lastAdAt.
 */
export function interstitialGate(input: PacingInput, c: GameConfig = cfg): GateDecision {
  const ic = c.ads.interstitial;
  if (!c.ads.enabled) return 'disabled';
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
