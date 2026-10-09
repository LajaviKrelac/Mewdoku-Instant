// Owner: C. The fish economy (phase2b §2.8): the earn table, spend prices, the wallet cap, swaps,
// never negative, and awards that are idempotent per counted win (applyLevelWin's guard, a daily once
// per date, an event puzzle once per index; the app passes the award only when the win counted).
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { addFish, canAfford, fishForWin, fishTotal, spendFish, swapFish, swapPrice } from '../../../src/game/economy';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0);
const withFish = (fish: number, earned = fish): SaveData => ({ ...defaults(T0), wallet: { fish, earned } });

describe('fishForWin: the §2.8 earn table', () => {
  const ROWS = [
    { mode: 'level', hard: false, replay: false, want: { base: 3, bonus: 0, bonusKind: null } },
    { mode: 'level', hard: true, replay: false, want: { base: 3, bonus: 2, bonusKind: 'hard' } },
    { mode: 'daily', hard: false, replay: false, want: { base: 3, bonus: 2, bonusKind: 'daily' } },
    { mode: 'event', hard: false, replay: false, want: { base: 3, bonus: 0, bonusKind: null } },
    { mode: 'tutorial', hard: false, replay: false, want: { base: 3, bonus: 0, bonusKind: null } },
    { mode: 'tutorial', hard: false, replay: true, want: { base: 0, bonus: 0, bonusKind: null } },
  ] as const;
  it.each(ROWS)('$mode hard=$hard replay=$replay', ({ mode, hard, replay, want }) => {
    expect(fishForWin(mode, { hard, replay })).toEqual(want);
  });

  it('three fish per win every time; bonuses add a number, not more fish (§2.14)', () => {
    expect(fishForWin('level', { hard: true, replay: false }).base).toBe(cfg.fish.perWin);
    expect(fishTotal(fishForWin('daily', { hard: false, replay: false }))).toBe(5);
  });

  it('follows a config variant', () => {
    const c = mergeConfig({ fish: { perWin: 4, hardBonus: 6 } });
    expect(fishForWin('level', { hard: true, replay: false }, c)).toEqual({ base: 4, bonus: 6, bonusKind: 'hard' });
  });
});

describe('wallet', () => {
  it('addFish adds to fish and lifetime earned, returns a new save, and never mutates', () => {
    const s = withFish(10, 40);
    const t = addFish(s, 5);
    expect(t.wallet).toEqual({ fish: 15, earned: 45 });
    expect(s.wallet).toEqual({ fish: 10, earned: 40 });
    expect(addFish(s, 0)).toBe(s);
  });

  it('paid fish ({ earned: false }) do not count as earned', () => {
    expect(addFish(withFish(10, 40), 250, cfg, { earned: false }).wallet).toEqual({ fish: 260, earned: 40 });
  });

  it('the wallet and lifetime counter are capped at 999 999', () => {
    const s = addFish(withFish(999_990, 999_998), 50);
    expect(s.wallet).toEqual({ fish: 999_999, earned: 999_999 });
    expect(cfg.fish.max).toBe(999_999);
  });

  it('never negative: negative or fractional amounts throw', () => {
    expect(() => addFish(withFish(3), -1)).toThrow(RangeError);
    expect(() => addFish(withFish(3), 1.5)).toThrow(RangeError);
    expect(() => spendFish(withFish(3), -2)).toThrow(RangeError);
  });

  it('spendFish takes exactly the price; below the price it throws and nothing changes', () => {
    expect(spendFish(withFish(20, 99), 15).wallet).toEqual({ fish: 5, earned: 99 });
    expect(spendFish(withFish(15), 15).wallet.fish).toBe(0);
    const poor = withFish(14);
    expect(() => spendFish(poor, 15)).toThrow(RangeError);
    expect(poor.wallet.fish).toBe(14);
  });

  it('canAfford: ≥ price, and a bad price is never affordable', () => {
    expect(canAfford(withFish(15), 15)).toBe(true);
    expect(canAfford(withFish(14), 15)).toBe(false);
    expect(canAfford(withFish(99), -1)).toBe(false);
    expect(canAfford(withFish(99), 2.5)).toBe(false);
  });
});

describe('swaps (§2.8 [DECISION: default] 15 fish per hint, 30 per kitty)', () => {
  it('prices come from shop.*', () => {
    expect(swapPrice('hint')).toBe(15);
    expect(swapPrice('kitty')).toBe(30);
    expect(swapPrice('hint', mergeConfig({ shop: { hintFish: 20 } }))).toBe(20);
  });

  it('a swap spends the price and grants exactly one item', () => {
    const s = { ...withFish(45), stock: { hints: 0, kitties: 2 } };
    const a = swapFish(s, 'hint');
    expect(a.wallet.fish).toBe(30);
    expect(a.stock).toEqual({ hints: 1, kitties: 2 });
    const b = swapFish(a, 'kitty');
    expect(b.wallet.fish).toBe(0);
    expect(b.stock).toEqual({ hints: 1, kitties: 3 });
    expect(() => swapFish(b, 'hint')).toThrow(RangeError);
  });
});
