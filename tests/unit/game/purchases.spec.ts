// Owner: C (Phase 2b). Phase 2c (G1, §5.3, §3.8): iap.catalog (on sale) + iap.retired (the fish
// packs, granted as hints and kitties), no fish anywhere, and the one-time compensation of a migrated
// v2 document's retired packs.
// IAP grants and the ledger (phase2b §8.3, §8.4, §9.3): applyPurchase per product,
// idempotent by token, the ledger capped at 50 and parsed as productId|token, and the merge of noAds
// (OR) and the ledger (union) with the paid grants of the losing document re-applied once.
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import {
  applyGrant,
  applyPurchase,
  compensateRetired,
  isRecorded,
  isRetired,
  ledgerEntry,
  parseLedgerEntry,
  productDef,
  repairPaidGrants,
} from '../../../src/game/purchases';
import { defaults, merge, migrate } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0);
const s0 = (): SaveData => ({ ...defaults(T0), stock: { hints: 2, kitties: 1 } });

describe('applyPurchase per product (§8.3)', () => {
  it('remove_ads → noAds; nothing else', () => {
    const s = applyPurchase(s0(), { productId: 'remove_ads', purchaseToken: 't1' });
    expect(s.purchases).toEqual({ noAds: true, tokens: ['remove_ads|t1'] });
    expect(s.stock).toEqual(s0().stock);
  });

  it('hints_15 → +15 hints; kitties_8 → +8 kitties', () => {
    expect(applyPurchase(s0(), { productId: 'hints_15', purchaseToken: 'a' }).stock).toEqual({ hints: 17, kitties: 1 });
    expect(applyPurchase(s0(), { productId: 'kitties_8', purchaseToken: 'b' }).stock).toEqual({ hints: 2, kitties: 9 });
  });

  it('the retired fish_250 / fish_900 grant their compensation (10 hints + 3 kitties / 30 hints + 15 kitties), never fish', () => {
    const a = applyPurchase(s0(), { productId: 'fish_250', purchaseToken: 'c' });
    expect(a.stock).toEqual({ hints: 12, kitties: 4 });
    expect(a.purchases.tokens).toEqual(['fish_250|c']);
    expect(a).not.toHaveProperty('wallet');
    expect(applyPurchase(s0(), { productId: 'fish_900', purchaseToken: 'd' }).stock).toEqual({ hints: 32, kitties: 16 });
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

  it('every catalogue row has a definition with exactly one grant kind; none grants fish', () => {
    expect(cfg.iap.catalog.map((d) => d.id)).toEqual(['remove_ads', 'hints_15', 'kitties_8']);
    for (const d of cfg.iap.catalog) {
      expect(productDef(d.id)).toBe(d);
      expect(isRetired(d.id)).toBe(false);
      const kinds = [d.noAds, d.hints, d.kitties].filter((x) => x !== undefined);
      expect(kinds).toHaveLength(1);
      expect(d.fish).toBeUndefined();
    }
  });

  it('productDef finds a retired pack after the catalogue (phase2c §5.3); its def grants no fish', () => {
    for (const d of cfg.iap.retired) {
      expect(productDef(d.id)).toBe(d);
      expect(isRetired(d.id)).toBe(true);
      expect(d.fish).toBeUndefined();
    }
    expect(productDef('nope' as never)).toBeNull();
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
    // A retired product's entry stays valid (isRecorded, the merge repair and the boot restore need it).
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

  it('paid grants of the losing document are re-applied once (repairPaidGrants), a retired pack as its compensation', () => {
    const older: SaveData = { ...s0(), updatedAt: T0 + 1, purchases: { noAds: false, tokens: ['kitties_8|k', 'fish_250|f'] } };
    const newer: SaveData = { ...s0(), updatedAt: T0 + 2, stock: { hints: 0, kitties: 0 } };
    const m = merge(older, newer);
    expect(m.stock).toEqual({ hints: 10, kitties: 8 + 3 });
    expect(m).not.toHaveProperty('wallet');
    // A merged document that already lists the entries never re-applies them.
    const merged = { ...m, updatedAt: T0 + 3 };
    expect(repairPaidGrants(merged, older, merged)).toBe(merged);
  });

  it('applyGrant of an unknown product is a no-op', () => {
    const s = s0();
    expect(applyGrant(s, 'nope' as never)).toBe(s);
  });
});

describe('retired packs compensated once (phase2c §3.8)', () => {
  const v2 = (tokens: string[], extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const { streak: _s, period: _p, ...rest } = s0();
    return { ...rest, v: 2, wallet: { fish: 400, earned: 150 }, purchases: { noAds: false, tokens }, ...extra };
  };

  it('compensateRetired grants each retired entry once and ignores catalogue entries', () => {
    const s: SaveData = { ...s0(), purchases: { noAds: false, tokens: ['hints_15|h', 'fish_250|a', 'fish_900|b'] } };
    expect(compensateRetired(s).stock).toEqual({ hints: 2 + 10 + 30, kitties: 1 + 3 + 15 });
    const plain = s0();
    expect(compensateRetired(plain)).toBe(plain);
  });

  it('migrating a v2 document compensates; migrating the result again does not', () => {
    const once = migrate(v2(['fish_250|a']), T0);
    expect(once.stock).toEqual({ hints: 12, kitties: 4 });
    expect(once).not.toHaveProperty('wallet');
    const again = migrate(JSON.parse(JSON.stringify(once)) as unknown, T0);
    expect(again.stock).toEqual(once.stock);
  });

  it('a migrated local and cloud copy that share the entry merge to ONE compensation (either order, either newer)', () => {
    const local = migrate(v2(['fish_250|a'], { updatedAt: T0 + 5 }), T0 + 10);
    const cloud = migrate(v2(['fish_250|a'], { updatedAt: T0 + 1 }), T0 + 10);
    for (const m of [merge(local, cloud), merge(cloud, local)]) expect(m.stock).toEqual({ hints: 12, kitties: 4 });
  });

  it('an entry only the older (v2) copy holds is compensated through the merge repair, once', () => {
    const older = migrate(v2(['fish_900|z'], { updatedAt: T0 + 1 }), T0 + 10); // compensated at migration
    const newer: SaveData = { ...s0(), updatedAt: T0 + 9, stock: { hints: 0, kitties: 0 } };
    const m = merge(older, newer);
    expect(m.stock).toEqual({ hints: 30, kitties: 15 }); // the newer stock + the repair, once
    expect(merge({ ...m, updatedAt: T0 + 20 }, older).stock).toEqual(m.stock);
  });
});
