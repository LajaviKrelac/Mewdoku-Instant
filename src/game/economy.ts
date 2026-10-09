// Owner: C (Phase 2b). Phase 2c (G1): the fish wallet and the fish swaps are gone (fish are the lives,
// docs/phase2c/fish-lives-spec.md §5.1); hints, kitties and the fallback cooldown are unchanged.
// Hint/kitty ledger and the free-fallback cooldown (02 §9, §13.3; Phase 3 hook: currency map). PURE:
// every function returns a NEW SaveData (never mutates), with `now` passed in. updatedAt is left to
// the save scheduler, which stamps every write (04 §7.1).
import { cfg, type GameConfig } from '../app/config';
import type { SaveData } from './types';

/** Currencies; 'coins' is reserved for Phase 3 (stored in save.ext). */
export type Currency = 'hints' | 'kitties' | 'coins';
export type HelperCurrency = 'hints' | 'kitties';

export function balance(save: SaveData, c: HelperCurrency): number {
  return save.stock[c];
}

/** Amount granted per completed rewarded ad or free fallback (hints.perRewardedAd / kitty.perRewardedAd). */
export function rewardAmount(c: HelperCurrency, conf: GameConfig = cfg): number {
  return c === 'hints' ? conf.hints.perRewardedAd : conf.kitty.perRewardedAd;
}

function checkAmount(n: number, fn: string): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`${fn}: bad amount ${n}`);
}

/** stock[c] −= n. Throws when the balance would go negative. */
export function spend(save: SaveData, c: HelperCurrency, n = 1): SaveData {
  checkAmount(n, 'spend');
  const have = balance(save, c);
  if (have < n) throw new RangeError(`spend: ${c} balance ${have} < ${n}`);
  return { ...save, stock: { ...save.stock, [c]: have - n } };
}

/** stock[c] += n (rewarded ad: hints.perRewardedAd / kitty.perRewardedAd). */
export function grant(save: SaveData, c: HelperCurrency, n?: number, conf: GameConfig = cfg): SaveData {
  const amount = n ?? rewardAmount(c, conf);
  checkAmount(amount, 'grant');
  return { ...save, stock: { ...save.stock, [c]: balance(save, c) + amount } };
}

/**
 * Free fallback allowed: now − ads.lastFallbackGrantAt ≥ unsupportedFallback.cooldownSec × 1000 (shared
 * by hint, kitty and revive). A grant time in the future (the device clock went back, or a merged copy
 * from a device whose clock runs ahead) never blocks the player: it counts as available (02 §13.3
 * "Players must never be hard-blocked").
 */
export function fallbackAvailable(save: SaveData, now: number, conf: GameConfig = cfg): boolean {
  const last = save.ads.lastFallbackGrantAt;
  if (last > now) return true;
  return now - last >= conf.ads.unsupportedFallback.cooldownSec * 1000;
}

/** Epoch ms when the next free fallback is allowed (for the O2 countdown). */
export function fallbackReadyAt(save: SaveData, conf: GameConfig = cfg): number {
  return save.ads.lastFallbackGrantAt + conf.ads.unsupportedFallback.cooldownSec * 1000;
}

/** Records a fallback grant: ads.lastFallbackGrantAt = now. */
export function recordFallbackGrant(save: SaveData, now: number): SaveData {
  return { ...save, ads: { ...save.ads, lastFallbackGrantAt: now } };
}

/** Records a completed ad (interstitial ok, or rewarded when resetsInterstitialClock): ads.lastAdAt = now. */
export function recordAdShown(save: SaveData, now: number): SaveData {
  return { ...save, ads: { ...save.ads, lastAdAt: now } };
}
