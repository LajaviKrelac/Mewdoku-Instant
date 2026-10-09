// Owner: D (Phase 2b); G3 (Phase 2c: catalogue ids vs retired purchase ids, docs/phase2c/fish-lives-spec.md §5.3)
// PaymentsProvider over FB payments (phase2b §8.2, §8.4): onReady, getCatalogAsync, purchaseAsync
// ({productID, developerPayload}), getPurchasesAsync (unconsumed), consumePurchaseAsync(token).
// Supported iff getPlatform() !== 'IOS' and 'payments.purchaseAsync' is in getSupportedAPIs(); if
// onReady never fires, payments are unsupported for the session. Errors: USER_INPUT → 'cancelled'
// (silent); PAYMENTS_NOT_INITIALIZED → 'not_ready'; NETWORK_FAILURE, INVALID_PARAM,
// INVALID_OPERATION → 'error'. Never rejects. Lazy `fb-social` chunk. The grant order is C's
// (shop-flow: record, grant, save, then consume).
//
// Ours on top of the SDK:
//   - only our product ids are passed on (fb-dashboard.md lists the products to create): the
//     catalogue and purchase() take the products on sale only (cfg.iap.catalog: No Ads, Bulb Bundle,
//     Kitty Basket); purchases() also passes on the RETIRED ones (cfg.iap.retired: fish_250, fish_900,
//     phase2c §5.3), so an unconsumed old fish pack reaches the boot restore (which compensates it in
//     hints and kitties and consumes it) instead of staying unconsumed forever. Anything else could
//     not be granted, so it is never surfaced (and never consumed);
//   - purchases() drops entries marked consumed or with a paymentActionType other than 'charge'
//     (a refund must never grant), so a boot restore can only grant real, unconsumed charges;
//   - catalogue, purchases and consume calls are bounded by iap.readyTimeoutMs; purchase() is not
//     (it waits on FB's own payment dialog); one purchase at a time;
//   - the catalogue is cached for iap.catalogCacheMs (failures are not cached).
// [uncertain: §14 G5] the error codes per call, purchaseTime units (Meta's sample reads unix
// seconds), whether getPurchasesAsync lists consumed or refunded purchases at all, and onReady
// timing (we register it when this provider is created, after startGameAsync).
import { cfg, type GameConfig, type ProductId } from '../../app/config';
import { within } from '../shared/timers';
import type { PaymentsProvider, PlatformTimers, Product, Purchase, PurchaseFailReason } from '../types';
import { fbErrorCode } from './fb-errors';
import { paymentsSupported as probePayments } from './fb-probe';
import type { FBInstantSDK, FBProduct, FBPurchase } from './fbinstant';

export interface FbPaymentsOptions {
  readonly timers: PlatformTimers;
  readonly config?: GameConfig;
}

/** The capabilities().payments rule (§8.4). */
export function paymentsSupported(sdk: FBInstantSDK): boolean {
  return probePayments(sdk);
}

/** purchaseAsync errors → reason (§8.4). */
export function mapPurchaseError(err: unknown): PurchaseFailReason {
  switch (fbErrorCode(err)) {
    case 'USER_INPUT':
      return 'cancelled';
    case 'PAYMENTS_NOT_INITIALIZED':
      return 'not_ready';
    case 'CLIENT_UNSUPPORTED_OPERATION':
      return 'unsupported';
    default:
      return 'error'; // NETWORK_FAILURE, INVALID_PARAM, INVALID_OPERATION and anything unknown
  }
}

/** A product on sale (cfg.iap.catalog) for an SDK id, or null (phase2c §5.3: a retired id is not on sale). */
function saleId(id: unknown, c: GameConfig): ProductId | null {
  return typeof id === 'string' && c.iap.catalog.some((p) => p.id === id) ? (id as ProductId) : null;
}

/** Our product id for an SDK purchase: on sale or retired (phase2c §5.3); null when it is not one of ours. */
function ourId(id: unknown, c: GameConfig): ProductId | null {
  return saleId(id, c) ?? (typeof id === 'string' && c.iap.retired.some((p) => p.id === id) ? (id as ProductId) : null);
}

/**
 * SDK purchase → ours; null for anything we must not grant (unknown product, no token, consumed,
 * refund). A retired product (cfg.iap.retired) is ours: the restore compensates it (phase2c §5.3).
 */
export function toPurchase(p: FBPurchase | null | undefined, c: GameConfig = cfg): Purchase | null {
  if (!p || typeof p !== 'object') return null;
  const productId = ourId(p.productID, c);
  const token = typeof p.purchaseToken === 'string' ? p.purchaseToken : '';
  if (!productId || token === '') return null;
  if (p.isConsumed === true) return null;
  if (typeof p.paymentActionType === 'string' && p.paymentActionType.toLowerCase() !== 'charge') return null;
  const time = Number(p.purchaseTime);
  return {
    productId,
    purchaseToken: token,
    paymentId: typeof p.paymentID === 'string' ? p.paymentID : '',
    purchaseTime: Number.isFinite(time) ? time : 0,
    ...(typeof p.developerPayload === 'string' ? { developerPayload: p.developerPayload } : {}),
  };
}

/**
 * SDK catalogue row → ours; null for products that are not on sale (not ours, or retired: a test app
 * may still list fish_250 / fish_900, phase2c §5.3) or carry no price.
 */
export function toProduct(p: FBProduct | null | undefined, c: GameConfig = cfg): Product | null {
  if (!p || typeof p !== 'object') return null;
  const id = saleId(p.productID, c);
  if (!id || typeof p.price !== 'string' || p.price.trim() === '') return null;
  return { id, price: p.price, currency: typeof p.priceCurrencyCode === 'string' ? p.priceCurrencyCode : '' };
}

export function createFbPayments(sdk: FBInstantSDK, opts: FbPaymentsOptions): PaymentsProvider {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const bound = c.iap.readyTimeoutMs;
  const api = sdk.payments;

  let isReady = false;
  const waiting: (() => void)[] = [];
  let cache: { at: number; products: readonly Product[] } | null = null;
  let buying = false;

  const run = (cb: () => void): void => {
    try {
      cb();
    } catch {
      /* a listener must never break payments */
    }
  };

  if (api && paymentsSupported(sdk)) {
    try {
      api.onReady(() => {
        if (isReady) return;
        isReady = true;
        for (const cb of waiting.splice(0)) run(cb);
      });
    } catch {
      /* onReady unusable: payments stay not ready for the session (§8.2) */
    }
  }

  return {
    ready: () => isReady,

    onReady(cb) {
      if (isReady) run(cb);
      else waiting.push(cb);
    },

    async catalog() {
      try {
        if (!api || !isReady) return [];
        if (cache && timers.now() - cache.at < c.iap.catalogCacheMs) return cache.products;
        const list = await within(timers, api.getCatalogAsync(), bound, () => null);
        if (!Array.isArray(list)) return [];
        const products = list.map((p) => toProduct(p, c)).filter((p): p is Product => p !== null);
        if (products.length > 0) cache = { at: timers.now(), products };
        return products;
      } catch {
        return [];
      }
    },

    async purchase(id, payload) {
      if (!api) return { ok: false, reason: 'unsupported' };
      if (!isReady || buying) return { ok: false, reason: 'not_ready' };
      if (!saleId(id, c)) return { ok: false, reason: 'error' }; // not on sale (unknown or retired): never reaches FB
      buying = true;
      try {
        // No deadline: FB's payment dialog takes as long as the player needs.
        const raw = await api.purchaseAsync({ productID: id, developerPayload: payload });
        // A charge FB reports as done: our id (the requested one when the answer omits it) and a token are enough.
        const p = toPurchase({ ...raw, productID: typeof raw?.productID === 'string' ? raw.productID : id, isConsumed: false, paymentActionType: 'charge' }, c);
        return p && p.productId === id ? { ok: true, p } : { ok: false, reason: 'error' };
      } catch (err) {
        return { ok: false, reason: mapPurchaseError(err) };
      } finally {
        buying = false;
      }
    },

    async purchases() {
      try {
        if (!api) return null;
        const list = await within(timers, api.getPurchasesAsync(), bound, () => null);
        if (!Array.isArray(list)) return null;
        return list.map((p) => toPurchase(p, c)).filter((p): p is Purchase => p !== null);
      } catch {
        return null; // the boot restore changes nothing and tries again next boot (§8.4)
      }
    },

    async consume(token) {
      try {
        if (!api || typeof token !== 'string' || token === '') return false;
        const done = api.consumePurchaseAsync(token).then(() => true);
        return await within(timers, done, bound, () => false);
      } catch {
        return false;
      }
    },
  };
}
