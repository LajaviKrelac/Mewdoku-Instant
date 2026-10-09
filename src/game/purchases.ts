// Owner: C
// IAP grants and the purchase ledger (phase2b §8.4, §9.3). PURE, idempotent by purchase token.
// Ledger entries are "<productId>|<purchaseToken>" so a save merge can re-apply paid grants that only
// the other document has (§9.3 paid-grant repair).
// F0 stub: the two ledger helpers are implemented (a shared format); the grant logic is C's.
import { cfg, type GameConfig, type IapProductDef } from '../app/config';
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
export function isRecorded(save: SaveData, token: string): boolean {
  void save;
  void token;
  throw new Error('not implemented: isRecorded (C, phase2b §8.4)');
}

/**
 * Grants a purchase once (§8.3, §8.4): No Ads → purchases.noAds = true; hints / kitties → stock;
 * fish → wallet (capped at fish.max). Records the ledger entry (newest iap.tokensKept). A token that is
 * already recorded returns the save unchanged.
 */
export function applyPurchase(save: SaveData, p: PurchaseRecord, c: GameConfig = cfg): SaveData {
  void save;
  void p;
  void c;
  throw new Error('not implemented: applyPurchase (C, phase2b §8.4)');
}
