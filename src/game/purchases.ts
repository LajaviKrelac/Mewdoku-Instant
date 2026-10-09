// Owner: C (Phase 2b). Phase 2c (G1): the catalogue is iap.catalog (on sale) + iap.retired (the fish
// packs: still recognised in a ledger or a restore, granted as hints and kitties), and no grant adds
// fish (docs/phase2c/fish-lives-spec.md §5.3, §3.8).
// IAP grants and the purchase ledger (phase2b §8.4, §9.3). PURE, idempotent by purchase token.
// Ledger entries are "<productId>|<purchaseToken>" so a save merge can re-apply paid grants that only
// the other document has (§9.3 paid-grant repair).
import { cfg, type GameConfig, type IapProductDef } from '../app/config';
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
  const productId = entry.slice(0, bar) as ProductId;
  if (!productDef(productId, c)) return null;
  return { productId, purchaseToken: entry.slice(bar + 1) };
}

/**
 * The definition of a product (phase2c §5.3): iap.catalog (on sale), then iap.retired (no longer
 * sold; its grant is the compensation in hints and kitties). null for an id this build does not know.
 */
export function productDef(id: ProductId, c: GameConfig = cfg): IapProductDef | null {
  return c.iap.catalog.find((d) => d.id === id) ?? c.iap.retired.find((d) => d.id === id) ?? null;
}

/** Whether a product is retired (iap.retired): never sold, still compensated (phase2c §5.3). */
export function isRetired(id: ProductId, c: GameConfig = cfg): boolean {
  return c.iap.retired.some((d) => d.id === id) && !c.iap.catalog.some((d) => d.id === id);
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
 * hints / kitties → stock. A retired fish pack grants its compensation (iap.retired: hints and
 * kitties); no product grants fish (phase2c §5.3). An unknown product returns the save unchanged.
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
  return out;
}

/**
 * Grants a purchase once (§8.3, §8.4): No Ads → purchases.noAds = true; hints / kitties → stock; a
 * retired pack → its compensation (phase2c §5.3). Records the ledger entry (newest iap.tokensKept). A
 * token that is already recorded, or a product this build does not know, returns the save unchanged.
 */
export function applyPurchase(save: SaveData, p: PurchaseRecord, c: GameConfig = cfg): SaveData {
  if (!productDef(p.productId, c) || isRecorded(save, p.purchaseToken, c)) return save;
  const granted = applyGrant(save, p.productId, c);
  const tokens = capLedger([...granted.purchases.tokens, ledgerEntry(p)], c.iap.tokensKept);
  return { ...granted, purchases: { ...granted.purchases, tokens } };
}

/**
 * Phase 2c §3.8: the one-time compensation of a migrated v2 document. Every ledger entry of a retired
 * product (iap.retired: the fish packs, whose fish were a wallet the v3 save no longer has) grants its
 * compensation once. The caller (save.ts migrateReport) runs it only when the input document's v was
 * below 3, so a v3 document is never compensated again; the merge never re-applies an entry both
 * documents hold (repairPaidGrants), so a migrated local and cloud copy compensate once in total.
 */
export function compensateRetired(save: SaveData, c: GameConfig = cfg): SaveData {
  let out = save;
  for (const entry of save.purchases.tokens) {
    const rec = parseLedgerEntry(entry, c);
    if (rec && isRetired(rec.productId, c)) out = applyGrant(out, rec.productId, c);
  }
  return out;
}

/**
 * The §9.3 paid-grant repair: the merged document took its stock from `newer`, so every
 * ledger entry that only `older` holds (a purchase made on the device whose copy lost the newest-wins
 * fields) has its grant applied once more to `merged`. Only entries that survive the merged ledger's
 * cap are repaired (an entry the newer document already dropped as too old is never granted twice).
 * No Ads is merged by OR already. Phase 2c: a retired pack's entry re-applies its compensation.
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
