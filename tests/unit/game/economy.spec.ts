// Owner: C (Phase 2b). Phase 2c (G1, docs/phase2c/fish-lives-spec.md §5.1): the fish wallet and the
// fish swaps are gone (fish are the lives); the hint/kitty ledger and the fallback cooldown stay.
import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import * as economy from '../../../src/game/economy';
import { balance, fallbackAvailable, grant, rewardAmount, spend } from '../../../src/game/economy';
import { defaults } from '../../../src/game/save';

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0);

describe('no fish currency (phase2c §5.1)', () => {
  it('the wallet, the earn table and the swaps are not exported any more', () => {
    for (const name of ['fishForWin', 'fishTotal', 'addFish', 'spendFish', 'canAfford', 'swapPrice', 'swapFish']) {
      expect(name in economy, name).toBe(false);
    }
  });

  it('a fresh save has no wallet', () => {
    expect(defaults(T0)).not.toHaveProperty('wallet');
  });
});

describe('hints and kitties (02 §9, §13.3): unchanged', () => {
  it('grant and spend move the stock; spending below 0 throws', () => {
    const s = { ...defaults(T0), stock: { hints: 1, kitties: 0 } };
    const g = grant(s, 'kitties');
    expect(g.stock).toEqual({ hints: 1, kitties: rewardAmount('kitties') });
    expect(spend(s, 'hints').stock.hints).toBe(0);
    expect(() => spend(s, 'kitties')).toThrow(RangeError);
    expect(balance(g, 'hints')).toBe(1);
  });

  it('the fallback cooldown follows the config and a future grant time never blocks', () => {
    const c = mergeConfig({ ads: { unsupportedFallback: { cooldownSec: 60 } } });
    const s = { ...defaults(T0), ads: { lastAdAt: 0, lastFallbackGrantAt: T0 } };
    expect(fallbackAvailable(s, T0 + 59_999, c)).toBe(false);
    expect(fallbackAvailable(s, T0 + 60_000, c)).toBe(true);
    expect(fallbackAvailable(s, T0 - 1, c)).toBe(true);
  });
});
