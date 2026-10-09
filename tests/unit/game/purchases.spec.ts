// Owner: C. IAP grants and the ledger (phase2b §8.3, §8.4, §9.3): applyPurchase per product,
// idempotent by token, the ledger capped at 50 and parsed as productId|token, and the merge of noAds
// (OR) and the ledger (union) with the paid grants of the losing document re-applied once.
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import {
  applyGrant,
  applyPurchase,
  isRecorded,
  ledgerEntry,
  parseLedgerEntry,
  productDef,
  repairPaidGrants,
} from '../../../src/game/purchases';
import { defaults, merge } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0);
const s0 = (): SaveData => ({ ...defaults(T0), stock: { hints: 2, kitties: 1 }, wallet: { fish: 10, earned: 10 } });

describe('applyPurchase per product (§8.3)', () => {
  it('remove_ads → noAds; nothing else', () => {
    const s = applyPurchase(s0(), { productId: 'remove_ads', purchaseToken: 't1' });
    expect(s.purchases).toEqual({ noAds: true, tokens: ['remove_ads|t1'] });
    expect(s.stock).toEqual(s0().stock);
    expect(s.wallet).toEqual(s0().wallet);
  });

  it('hints_15 → +15 hints; kitties_8 → +8 kitties', () => {
    expect(applyPurchase(s0(), { productId: 'hints_15', purchaseToken: 'a' }).stock).toEqual({ hints: 17, kitties: 1 });
    expect(applyPurchase(s0(), { productId: 'kitties_8', purchaseToken: 'b' }).stock).toEqual({ hints: 2, kitties: 9 });
  });

  it('fish_250 / fish_900 → wallet (capped at fish.max), not counted as earned', () => {
    expect(applyPurchase(s0(), { productId: 'fish_250', purchaseToken: 'c' }).wallet).toEqual({ fish: 260, earned: 10 });
    expect(applyPurchase(s0(), { productId: 'fish_900', purchaseToken: 'd' }).wallet).toEqual({ fish: 910, earned: 10 });
    const rich = { ...s0(), wallet: { fish: cfg.fish.max - 100, earned: 0 } };
    expect(applyPurchase(rich, { productId: 'fish_900', purchaseToken: 'e' }).wallet.fish).toBe(cfg.fish.max);
  });

  it('idempotent by token: the same purchase twice grants once', () => {
    const p = { productId: 'hints_15' as const, purchaseToken: 'same' };
    const once = applyPurchase(s0(), p);
    expect(applyPurchase(once, p)).toBe(once);
    expect(isRecorded(once, 'same')).toBe(true);
    expect(isRecorded(once, 'other')).toBe(false);
  });

  it('an unknown product is ignored and not recorded', () => {
    const s = s0();
    expect(applyPurchase(s, { productId: 'gems_99' as never, purchaseToken: 'z' })).toBe(s);
  });

  it('a token with a bar in it is parsed back whole (the product id has none)', () => {
    const p = { productId: 'fish_250' as const, purchaseToken: 'ab|cd' };
    expect(parseLedgerEntry(ledgerEntry(p))).toEqual(p);
    expect(isRecorded(applyPurchase(s0(), p), 'ab|cd')).toBe(true);
  });

  it('every catalogue row has a definition with exactly one grant kind', () => {
    for (const d of cfg.iap.products) {
      expect(productDef(d.id)).toBe(d);
      const kinds = [d.noAds, d.hints, d.kitties, d.fish].filter((x) => x !== undefined);
      expect(kinds).toHaveLength(1);
    }
  });
});

describe('ledger (§8.4, §9.2)', () => {
  it('capped at 50, newest kept', () => {
    let s = s0();
    for (let i = 0; i < 60; i++) s = applyPurchase(s, { productId: 'hints_15', purchaseToken: `tok${i}` });
    expect(s.purchases.tokens).toHaveLength(50);
    expect(s.purchases.tokens[0]).toBe('hints_15|tok10');
    expect(s.purchases.tokens[49]).toBe('hints_15|tok59');
    expect(s.stock.hints).toBe(2 + 60 * 15);
  });

  it('entries parse as productId|token; junk parses to null', () => {
    expect(parseLedgerEntry('fish_900|x')).toEqual({ productId: 'fish_900', purchaseToken: 'x' });
    expect(parseLedgerEntry('fish_900|')).toBeNull();
    expect(parseLedgerEntry('|x')).toBeNull();
    expect(parseLedgerEntry('nope|x')).toBeNull();
  });
});

describe('merge of purchases (§9.3)', () => {
  it('noAds is OR; the ledger is the union', () => {
    const a: SaveData = { ...s0(), updatedAt: T0 + 1, purchases: { noAds: true, tokens: ['remove_ads|r'] } };
    const b: SaveData = { ...s0(), updatedAt: T0 + 2, purchases: { noAds: false, tokens: ['hints_15|h'] } };
    const m = merge(a, b);
    expect(m.purchases.noAds).toBe(true);
    expect([...m.purchases.tokens].sort()).toEqual(['hints_15|h', 'remove_ads|r']);
  });

  it('paid grants of the losing document are re-applied once (repairPaidGrants)', () => {
    const older: SaveData = { ...s0(), updatedAt: T0 + 1, purchases: { noAds: false, tokens: ['kitties_8|k', 'fish_250|f'] } };
    const newer: SaveData = { ...s0(), updatedAt: T0 + 2, stock: { hints: 0, kitties: 0 }, wallet: { fish: 1, earned: 50 } };
    const m = merge(older, newer);
    expect(m.stock).toEqual({ hints: 0, kitties: 8 });
    expect(m.wallet).toEqual({ fish: 251, earned: 50 });
    // A merged document that already lists the entries never re-applies them.
    const merged = { ...m, updatedAt: T0 + 3 };
    expect(repairPaidGrants(merged, older, merged)).toBe(merged);
  });

  it('applyGrant of an unknown product is a no-op', () => {
    const s = s0();
    expect(applyGrant(s, 'nope' as never)).toBe(s);
  });
});
