// Owner: C
// The shop (phase2b §2.8, §8.4, §8.5): fish swaps (swapFish + saves.now(), no ad, no fallback
// cooldown) and FB purchases with the grant order record → grant → saves.critical() → consume (or
// consume first when iap.grantBeforeConsume is false); the boot restore of unconsumed purchases
// (grant only tokens not yet in the ledger, consume all); onReady gating and the iap.readyTimeoutMs
// "Getting the shop ready…" state; toasts shop.thanks / shop.error (a cancel is silent); the iap
// analytics row (never a price or payment id). C-internal module; ShopProps (B) and
// PaymentsProvider (D) are fixed. platform.payments is read at call time (FB social chunk).
import { canAfford, swapFish, swapPrice } from '../game/economy';
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
  /** Stock or wallet changed (bus 'stock' / 'wallet'). */
  changed(): void;
  /** The shop opened over a screen (banner hide, §3.2). */
  onOpen?(): void;
  readonly config?: GameConfig;
}

export interface ShopFlow {
  /** Opens the shop sheet (Home / victory fish pill "+", Settings → Shop / Remove ads). */
  open(): void;
  /** Swap fish for one hint or kitty; false when the wallet is below the price. */
  swap(item: 'hint' | 'kitty'): boolean;
  /** Buys a product (the sheet's Buy). Never rejects. */
  buy(id: ProductId): Promise<void>;
  /** Boot: restore unconsumed purchases after start() and onReady. Never rejects. */
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

  function products(): ShopProductView[] {
    const noAds = deps.save().purchases.noAds;
    const out: ShopProductView[] = [];
    for (const def of c.iap.products) {
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
          catalog = Array.isArray(list) ? list : [];
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
    const p = provider();
    const waiting = clock.now() - deps.startedAt < c.iap.readyTimeoutMs;
    if (p && !capsPayments() && !waiting) return { kind: 'unavailable' }; // iOS, Messenger.com
    if (!p || !isReady(p)) return waiting ? { kind: 'loading' } : { kind: 'unavailable' };
    if (catalogState === 'ready' && clock.now() - catalogAt > c.iap.catalogCacheMs) catalogState = 'idle';
    if (catalogState === 'idle') loadCatalog(p);
    if (catalogState === 'error') return { kind: 'error' };
    if (catalogState !== 'ready') return { kind: 'loading' };
    return { kind: 'ready', products: products() };
  }

  function props(): ShopProps {
    return {
      fish: deps.save().wallet.fish,
      hintPrice: swapPrice('hint', c),
      kittyPrice: swapPrice('kitty', c),
      buy: computeBuy(),
      busy,
      onSwap: (item) => void flow.swap(item),
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
      hookReady();
      deps.overlay.open(props());
    },
    swap(item) {
      if (busy) return false;
      const s = deps.save();
      if (!canAfford(s, swapPrice(item, c))) {
        deps.toast(t('shop.notEnough'));
        return false;
      }
      deps.updateSave((sv) => swapFish(sv, item, c));
      deps.saves.now();
      deps.changed();
      refresh();
      return true;
    },
    async buy(id) {
      const p = provider();
      if (busy || !p || !productDef(id, c)) return;
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
