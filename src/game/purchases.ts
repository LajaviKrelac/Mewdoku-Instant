// Owner: C
// IAP grants and the purchase ledger (phase2b §8.4, §9.3). PURE, idempotent by purchase token.
// Ledger entries are "<productId>|<purchaseToken>" so a save merge can re-apply paid grants that only
// the other document has (§9.3 paid-grant repair).
import { cfg, type GameConfig, type IapProductDef } from '../app/config';
import { addFish } from './economy';
import { capLedger } from './save-v2';
import type { ProductId, SaveData } from './types';

/** The parts of an FB purchase the grant needs (platform Purchase is structurally compatible). */
export interface PurchaseRecord {
  readonly productId: ProductId;
  readonly purchaseToken: string;
}

/** "<productId>|<purchaseToken>" (§8.4). */
export function ledgerEntry(p: PurchaseRecord): string {
  return `${p.productId}|${p.purchaseToken}`;
}

/** Inverse of ledgerEntry; null for anything that is not a known product id and a non-empty token. */
export function parseLedgerEntry(entry: string, c: GameConfig = cfg): PurchaseRecord | null {
  const bar = entry.indexOf('|');
  if (bar <= 0 || bar === entry.length - 1) return null;
  const productId = entry.slice(0, bar);
  if (!c.iap.products.some((d) => d.id === productId)) return null;
  return { productId: productId as ProductId, purchaseToken: entry.slice(bar + 1) };
}

/** The catalogue row of a product (iap.products). */
export function productDef(id: ProductId, c: GameConfig = cfg): IapProductDef | null {
  return c.iap.products.find((d) => d.id === id) ?? null;
}

/** Whether this token is already in purchases.tokens (then a boot restore only consumes it). */
export function isRecorded(save: SaveData, token: string, c: GameConfig = cfg): boolean {
  for (const entry of save.purchases.tokens) {
    if (parseLedgerEntry(entry, c)?.purchaseToken === token) return true;
  }
  return false;
}

/**
 * The grant of one product applied to `save` (no ledger change): No Ads → purchases.noAds = true;
 * hints / kitties → stock; fish → wallet (capped at fish.max; paid fish are not counted as earned).
 * An unknown product returns the save unchanged.
 */
export function applyGrant(save: SaveData, productId: ProductId, c: GameConfig = cfg): SaveData {
  const def = productDef(productId, c);
  if (!def) return save;
  let out = save;
  if (def.noAds && !out.purchases.noAds) out = { ...out, purchases: { ...out.purchases, noAds: true } };
  if (def.hints || def.kitties) {
    out = {
      ...out,
      stock: { hints: out.stock.hints + (def.hints ?? 0), kitties: out.stock.kitties + (def.kitties ?? 0) },
    };
  }
  if (def.fish) out = addFish(out, def.fish, c, { earned: false });
  return out;
}

/**
 * Grants a purchase once (§8.3, §8.4): No Ads → purchases.noAds = true; hints / kitties → stock;
 * fish → wallet (capped at fish.max). Records the ledger entry (newest iap.tokensKept). A token that is
 * already recorded, or a product this build does not know, returns the save unchanged.
 */
export function applyPurchase(save: SaveData, p: PurchaseRecord, c: GameConfig = cfg): SaveData {
  if (!productDef(p.productId, c) || isRecorded(save, p.purchaseToken, c)) return save;
  const granted = applyGrant(save, p.productId, c);
  const tokens = capLedger([...granted.purchases.tokens, ledgerEntry(p)], c.iap.tokensKept);
  return { ...granted, purchases: { ...granted.purchases, tokens } };
}

/**
 * The §9.3 paid-grant repair: the merged document took its wallet and stock from `newer`, so every
 * ledger entry that only `older` holds (a purchase made on the device whose copy lost the newest-wins
 * fields) has its grant applied once more to `merged`. Only entries that survive the merged ledger's
 * cap are repaired (an entry the newer document already dropped as too old is never granted twice).
 * No Ads is merged by OR already.
 */
export function repairPaidGrants(merged: SaveData, older: SaveData, newer: SaveData, c: GameConfig = cfg): SaveData {
  const newerSet = new Set(newer.purchases.tokens);
  const kept = new Set(merged.purchases.tokens);
  let out = merged;
  for (const entry of older.purchases.tokens) {
    if (newerSet.has(entry) || !kept.has(entry)) continue;
    const rec = parseLedgerEntry(entry, c);
    if (rec) out = applyGrant(out, rec.productId, c);
  }
  return out;
}
