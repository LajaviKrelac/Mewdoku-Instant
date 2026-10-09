// Owner: C (Phase 2b). Phase 2c (G1, docs/phase2c/fish-lives-spec.md §5.2, §5.3): no fish swaps and no
// fish packs: the sheet sells iap.catalog only (No Ads, hint pack, kitty pack); a boot restore still
// delivers an unconsumed purchase of a RETIRED pack (iap.retired) as its compensation in hints and
// kitties, recorded in the ledger and consumed, exactly like a catalogue product.
// The shop (phase2b §8.4, §8.5): FB purchases with the grant order record → grant → saves.critical() → consume (or
// consume first when iap.grantBeforeConsume is false); the boot restore of unconsumed purchases
// (grant only tokens not yet in the ledger, consume all); onReady gating and the iap.readyTimeoutMs
// "Getting the shop ready…" state; toasts shop.thanks / shop.error (a cancel is silent); the iap
// analytics row (never a price or payment id). C-internal module; ShopProps (B) and
// PaymentsProvider (D) are fixed. platform.payments is read at call time (FB social chunk).
import { applyPurchase, isRecorded, productDef } from '../game/purchases';
import type { ProductId, SaveData } from '../game/types';
import type { Capabilities, PaymentsProvider, PlatformId, Product, Purchase } from '../platform/types';
import type { ShopBuyState, ShopProductView, ShopProps } from '../ui/overlays/shop-sheet';
import { t } from '../i18n';
import type { Clock, TimerId } from './clock';
import { cfg, type GameConfig } from './config';
import type { AnalyticsEvent } from './events';
import { isFlagOn } from './flags';

export interface ShopFlowDeps {
  /** platform.payments at call time (undefined on the web; added on FB when the social chunk lands). */
  readonly payments: () => PaymentsProvider | undefined;
  readonly capabilities: () => Pick<Capabilities, 'payments'>;
  readonly platformId: PlatformId;
  save(): SaveData;
  updateSave(fn: (s: SaveData) => SaveData): void;
  readonly saves: { now(): void; critical(): void };
  readonly clock: Clock;
  /** Clock time when platform.start() resolved: the ready wait counts from there (§8.4). */
  readonly startedAt: number;
  /** platform.getPlayerId() for the developerPayload (playerId + ':' + nonce). */
  readonly playerId: () => string | null;
  readonly overlay: {
    open(props: ShopProps): void;
    update(props: ShopProps): void;
    close(): void;
    isOpen(): boolean;
  };
  toast(message: string): void;
  log(e: AnalyticsEvent): void;
  /** Stock or the No Ads entitlement changed (bus 'stock', the banner gate). */
  changed(): void;
  /** The shop opened over a screen (banner hide, §3.2). */
  onOpen?(): void;
  readonly config?: GameConfig;
}

export interface ShopFlow {
  /** Opens the shop sheet (Settings → Shop / Remove ads; phase2c §5.2: no Home or victory entry). */
  open(): void;
  /** Buys a product of iap.catalog (the sheet's Buy; a retired id is never sold). Never rejects. */
  buy(id: ProductId): Promise<void>;
  /**
   * Boot: restore unconsumed purchases after start() and onReady: catalogue products and retired
   * packs (their compensation), each granted once by token and consumed. Never rejects.
   */
  restore(): Promise<void>;
  /** The Buy section's state now (Settings decides whether to show "Remove ads"). */
  buyState(): ShopBuyState;
  dispose(): void;
}

export function createShopFlow(deps: ShopFlowDeps): ShopFlow {
  const c = deps.config ?? cfg;
  const { clock } = deps;
  let busy = false;
  let catalog: readonly Product[] | null = null;
  let catalogAt = -Infinity;
  let catalogState: 'idle' | 'loading' | 'error' | 'ready' = 'idle';
  let readyTimer: TimerId | null = null;
  let readyHooked = false;
  let disposed = false;
  let nonce = 0;

  const provider = (): PaymentsProvider | null => {
    try {
      return deps.payments() ?? null;
    } catch {
      return null;
    }
  };
  const isReady = (p: PaymentsProvider): boolean => {
    try {
      return p.ready();
    } catch {
      return false;
    }
  };
  const capsPayments = (): boolean => {
    try {
      return deps.capabilities().payments;
    } catch {
      return false;
    }
  };

  /** What is on sale (phase2c §5.3): iap.catalog, in its order. */
  const onSale = (id: ProductId): boolean => c.iap.catalog.some((d) => d.id === id);

  function products(): ShopProductView[] {
    const noAds = deps.save().purchases.noAds;
    const out: ShopProductView[] = [];
    for (const def of c.iap.catalog) {
      const p = catalog?.find((x) => x.id === def.id);
      if (p) out.push({ id: def.id, price: p.price, owned: def.noAds === true && noAds });
    }
    return out;
  }

  function loadCatalog(p: PaymentsProvider): void {
    if (catalogState === 'loading') return;
    catalogState = 'loading';
    Promise.resolve()
      .then(() => p.catalog())
      .then(
        (list) => {
          // The provider never rejects (PaymentsProvider): an SDK failure or a timeout arrives as an
          // empty list. Our catalogue always has products, so empty means "failed": the sheet shows
          // shop.error with Retry, and nothing is cached (review FB2B-3).
          if (!Array.isArray(list) || list.length === 0) {
            catalogState = 'error';
            return;
          }
          catalog = list;
          catalogAt = clock.now();
          catalogState = 'ready';
        },
        () => {
          catalogState = 'error';
        },
      )
      .then(refresh);
  }

  function computeBuy(): ShopBuyState {
    if (deps.platformId !== 'fbig' || !isFlagOn('shop')) return { kind: 'hidden' };
    // capabilities() is final after init (FB iOS: no payments at all): no "Getting the shop ready…"
    // wait where payments can never come (review FB2B-5; §8.5 iOS and Messenger show shop.unavailable).
    if (!capsPayments()) return { kind: 'unavailable' };
    const p = provider();
    const waiting = clock.now() - deps.startedAt < c.iap.readyTimeoutMs;
    if (!p || !isReady(p)) return waiting ? { kind: 'loading' } : { kind: 'unavailable' };
    if (catalogState === 'ready' && clock.now() - catalogAt > c.iap.catalogCacheMs) catalogState = 'idle';
    if (catalogState === 'idle') loadCatalog(p);
    if (catalogState === 'error') return { kind: 'error' };
    if (catalogState !== 'ready') return { kind: 'loading' };
    return { kind: 'ready', products: products() };
  }

  function props(): ShopProps {
    return {
      buy: computeBuy(),
      busy,
      onBuy: (id) => void flow.buy(id),
      onRetry: () => {
        catalogState = 'idle';
        refresh();
      },
      onClose: () => deps.overlay.close(),
    };
  }

  function refresh(): void {
    if (!disposed && deps.overlay.isOpen()) deps.overlay.update(props());
  }

  /** Re-render when onReady fires or the ready wait ends while the sheet is open. */
  function hookReady(): void {
    const p = provider();
    if (p && !readyHooked) {
      readyHooked = true;
      try {
        p.onReady(() => refresh());
      } catch {
        // a broken provider only costs the Buy section
      }
    }
    const left = deps.startedAt + c.iap.readyTimeoutMs - clock.now();
    if (left > 0 && readyTimer === null) {
      readyTimer = clock.setTimeout(() => {
        readyTimer = null;
        refresh();
      }, left + 1);
    }
  }

  function log(product: ProductId, result: 'ok' | 'cancelled' | 'not_ready' | 'unsupported' | 'error'): void {
    deps.log({ name: 'iap', params: { product, result, platform: deps.platformId } });
  }

  /** Never consume No Ads in 'keep' mode (G5 alternative): noAds then follows purchases(). */
  const consumes = (p: Purchase): boolean => !(c.iap.removeAdsMode === 'keep' && productDef(p.productId, c)?.noAds === true);

  async function consume(p: PaymentsProvider, purchase: Purchase): Promise<void> {
    if (!consumes(purchase)) return;
    try {
      await p.consume(purchase.purchaseToken);
    } catch {
      // still unconsumed: the next boot restore consumes it (its token is recorded, so no second grant)
    }
  }

  function grantAndSave(purchase: Purchase): void {
    deps.updateSave((s) => applyPurchase(s, { productId: purchase.productId, purchaseToken: purchase.purchaseToken }, c));
    deps.saves.critical();
    deps.changed();
  }

  /** §8.4 grant order: record + grant + critical save, then consume (or consume first, G5 fallback). */
  async function deliver(p: PaymentsProvider, purchase: Purchase): Promise<void> {
    if (c.iap.grantBeforeConsume) {
      grantAndSave(purchase);
      await consume(p, purchase);
    } else {
      await consume(p, purchase);
      grantAndSave(purchase);
    }
  }

  const flow: ShopFlow = {
    open() {
      deps.onOpen?.();
      // A catalogue that failed earlier is asked for again on every open (FB2B-3), not only on Retry.
      if (catalogState === 'error') catalogState = 'idle';
      hookReady();
      deps.overlay.open(props());
    },
    async buy(id) {
      const p = provider();
      if (busy || !p || !onSale(id)) return;
      if (productDef(id, c)?.noAds && deps.save().purchases.noAds) return; // "Owned"
      busy = true;
      refresh();
      try {
        const payload = `${deps.playerId() ?? 'anon'}:${clock.now().toString(36)}${(++nonce).toString(36)}`;
        const r = await p.purchase(id, payload);
        if (r.ok) {
          await deliver(p, r.p);
          deps.toast(t('shop.thanks'));
          log(id, 'ok');
        } else {
          if (r.reason !== 'cancelled') deps.toast(t('shop.error')); // a cancel (USER_INPUT) is silent
          log(id, r.reason);
        }
      } catch {
        deps.toast(t('shop.error'));
        log(id, 'error');
      } finally {
        busy = false;
        refresh();
      }
    },
    async restore() {
      const p = provider();
      if (!p) return;
      try {
        await new Promise<void>((resolve) => p.onReady(resolve));
        if (disposed) return;
        const list = await p.purchases();
        if (!list) return; // failure: nothing changes; the next boot tries again
        for (const purchase of list) {
          // A catalogue product or a retired pack (productDef knows both): a retired one is delivered
          // as its compensation, so it never stays unconsumed forever (phase2c §5.3).
          if (!productDef(purchase.productId, c)) continue;
          if (!isRecorded(deps.save(), purchase.purchaseToken, c)) {
            // Not delivered yet (the game died before saving): the §8.4 grant order.
            await deliver(p, purchase);
            log(purchase.productId, 'ok');
          } else await consume(p, purchase); // delivered before the game died: consume only
        }
        refresh();
      } catch {
        // never rejects; the next boot tries again
      }
    },
    buyState: computeBuy,
    dispose() {
      disposed = true;
      clock.clearTimeout(readyTimer);
      readyTimer = null;
    },
  };
  return flow;
}
