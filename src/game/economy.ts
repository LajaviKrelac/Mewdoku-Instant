// Owner: C (Phase 2b adds the fish wallet and the fish swaps, phase2b §2.8)
// Hint/kitty ledger and the free-fallback cooldown (02 §9, §13.3; Phase 3 hook: currency map). PURE:
// every function returns a NEW SaveData (never mutates), with `now` passed in. updatedAt is left to
// the save scheduler, which stamps every write (04 §7.1).
import { cfg, type GameConfig } from '../app/config';
import type { ModeId, SaveData } from './types';

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

// ─────────────────────────────── fish (phase2b §2.8) ───────────────────────────────

/** Fish for one counted win: `base` (fish.perWin, or fish.tutorial) plus `bonus` (Hard or daily). */
export interface FishAward {
  readonly base: number;
  readonly bonus: number;
  /** Why there is a bonus (victory chip "Hard level bonus +2" / "Daily bonus +2"), or null. */
  readonly bonusKind: 'hard' | 'daily' | null;
}

const NO_FISH: FishAward = Object.freeze({ base: 0, bonus: 0, bonusKind: null });

/**
 * The §2.8 earn table: level 3, Hard level 3 + 2, daily 3 + 2, event puzzle 3, first-run tutorial 3,
 * tutorial replay 0. Applied only when the win is counted (applyLevelWin's guard, a daily once per
 * date, an event puzzle once per index): the caller passes the award to addFish only then.
 */
export function fishForWin(mode: ModeId, opts: { readonly hard: boolean; readonly replay: boolean }, c: GameConfig = cfg): FishAward {
  const f = c.fish;
  switch (mode) {
    case 'tutorial':
      return opts.replay ? NO_FISH : { base: f.tutorial, bonus: 0, bonusKind: null };
    case 'level':
      return opts.hard ? { base: f.perWin, bonus: f.hardBonus, bonusKind: 'hard' } : { base: f.perWin, bonus: 0, bonusKind: null };
    case 'daily':
      return { base: f.perWin, bonus: f.dailyBonus, bonusKind: 'daily' };
    case 'event':
      return { base: f.perWin, bonus: 0, bonusKind: null };
    default:
      return NO_FISH;
  }
}

/** base + bonus of an award. */
export function fishTotal(award: FishAward): number {
  return award.base + award.bonus;
}

/**
 * wallet.fish += n (capped at fish.max) and wallet.earned += n (lifetime, capped). Never negative:
 * a negative or fractional n throws a RangeError. n = 0 returns the same save. Paid fish packs do
 * not count as earned (purchases.ts adds them with `{ earned: false }`).
 */
export function addFish(save: SaveData, n: number, c: GameConfig = cfg, opts: { readonly earned?: boolean } = {}): SaveData {
  checkAmount(n, 'addFish');
  if (n === 0) return save;
  const max = c.fish.max;
  const w = save.wallet;
  const earned = opts.earned === false ? w.earned : Math.min(max, w.earned + n);
  return { ...save, wallet: { fish: Math.min(max, w.fish + n), earned } };
}

/** wallet.fish −= price. Throws a RangeError when the wallet holds less (callers check canAfford first). */
export function spendFish(save: SaveData, price: number): SaveData {
  checkAmount(price, 'spendFish');
  const have = save.wallet.fish;
  if (have < price) throw new RangeError(`spendFish: wallet ${have} < ${price}`);
  if (price === 0) return save;
  return { ...save, wallet: { ...save.wallet, fish: have - price } };
}

/** wallet.fish ≥ price (a bad price is never affordable). */
export function canAfford(save: SaveData, price: number): boolean {
  return Number.isInteger(price) && price >= 0 && save.wallet.fish >= price;
}

/** The swap price of one hint or kitty in fish (shop.hintFish / shop.kittyFish, §2.8). */
export function swapPrice(item: 'hint' | 'kitty', c: GameConfig = cfg): number {
  return item === 'hint' ? c.shop.hintFish : c.shop.kittyFish;
}

/**
 * One swap (§2.8, §8.5): spends the price and grants one hint or kitty. Throws a RangeError when the
 * wallet holds less than the price (callers check canAfford first).
 */
export function swapFish(save: SaveData, item: 'hint' | 'kitty', c: GameConfig = cfg): SaveData {
  const paid = spendFish(save, swapPrice(item, c));
  return grant(paid, item === 'hint' ? 'hints' : 'kitties', 1, c);
}
