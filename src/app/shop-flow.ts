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
// Phase 2e (G1, docs/phase2e/spec.md §4; CONTRACTS §7; D-2e-9 … D-2e-11):
// - Consume first (iap.grantBeforeConsume false, the L1 value), guarded by the intent ledger
//   save.purchases.pending: purchaseAsync → "<productId>|<token>" into pending + a critical save →
//   consumePurchaseAsync → the grant (tokens ledger) and out of pending + a critical save. Exactly once at
//   every crash point: the boot restore consumes and grants a pending token FB still lists, grants a pending
//   token FB no longer lists (it was paid and consumed), and only drops a pending token already granted.
//   iap.grantBeforeConsume true keeps 2b's order.
// - paymentsAllowed() = caps.payments && (!caps.paymentsIos || iOS switch on) — the remote switch iapIos when
//   present, else iap.iosEnabled — for Settings → Shop and the O2 Buy rows alike. The boot restore runs on
//   iOS even with the switch off (delivering a paid purchase is never wrong).
// - buyInPlay(id) for the out-of-helpers card (O2): the same purchase, resolving its result, with the
//   timer paused ('purchase') and the banner's re-show after it; o2Buy(placement) builds O2's Buy rows in
//   iap.o2Products order (No Ads left out once owned; a product missing from the catalogue left out; the
//   whole row set hidden off FB, without payments, with iap.inPlay or the remote iapInPlay off);
//   prefetchCatalog() asks for the catalogue at boot step 8 after onReady (iap.prefetchCatalog).
// - iap analytics carry `source` ('shop' | 'o2').
// Preview link (lead, 2026-10-11): the shop and the O2 Buy rows exist where the platform SELLS — the FB adapter, or
// a web adapter whose capabilities say payments (only the owner's preview build: preview/payments.ts, a mock store
// that charges nothing). The web adapter never sells (caps.payments is a frozen false and it has no payments code),
// so the web and web-prod builds keep no shop, exactly as before.
import { addPending, applyPurchase, grantPending, isPending, isRecorded, pendingRecords, productDef, removePending } from '../game/purchases';
import type { ProductId, SaveData } from '../game/types';
import type { Capabilities, PaymentsProvider, PlatformId, Product, Purchase } from '../platform/types';
import type { ShopBuyState, ShopProductView, ShopProps } from '../ui/overlays/shop-sheet';
import type { O2BuyView } from '../ui/overlays/rewarded-prompt';
import { t } from '../i18n';
import type { Clock, TimerId } from './clock';
import { cfg, type GameConfig } from './config';
import type { AnalyticsEvent } from './events';
import { isFlagOn } from './flags';

export interface ShopFlowDeps {
  /** platform.payments at call time (undefined on the web; added on FB when the social chunk lands). */
  readonly payments: () => PaymentsProvider | undefined;
  readonly capabilities: () => Pick<Capabilities, 'payments' | 'paymentsIos'>;
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
  // ── Phase 2e (optional) ──
  /** The iOS switch in force: the remote switch iapIos when present, else iap.iosEnabled (spec §4.4). */
  iosOn?(): boolean;
  /** The remote switch iapInPlay (off only; absent = on). */
  inPlayOn?(): boolean;
  /** FB's purchase dialog opens / settles: pause and resume {reason: 'purchase'} (spec §4.3). */
  purchaseDialog?(open: boolean): void;
}

/** Phase 2e (spec §4.2): what an in-play purchase came to. */
export type BuyInPlayResult = 'ok' | 'cancelled' | 'error' | 'not_ready' | 'unsupported';

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
  /** Phase 2e (spec §4.2): an O2 purchase; resolves its result, never rejects. */
  buyInPlay(id: ProductId): Promise<BuyInPlayResult>;
  /** Phase 2e (spec §4.1): boot step 8 after onReady (iap.prefetchCatalog). */
  prefetchCatalog(): void;
  /** Phase 2e (spec §4.4): caps.payments && (!caps.paymentsIos || the iOS switch). */
  paymentsAllowed(): boolean;
  /** Phase 2e (spec §4.1): O2's Buy rows in iap.o2Products order; [] = none. */
  o2Buy(placement: 'hint' | 'kitty' | 'mouse'): readonly O2BuyView[];
  /** Phase 2e: the rows may have changed (catalogue in, purchase busy, No Ads bought). Returns an unsubscribe. */
  onRowsChange(fn: () => void): () => void;
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
  /** Phase 2e: the product of the in-play purchase in flight (O2's busy row). */
  let busyProduct: ProductId | null = null;
  const rowListeners = new Set<() => void>();

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
  /** Phase 2e (spec §4.4): payments, and on iOS only with the iOS switch on. */
  const capsPayments = (): boolean => {
    try {
      const caps = deps.capabilities();
      if (!caps.payments) return false;
      if (!caps.paymentsIos) return true;
      return deps.iosOn ? deps.iosOn() : c.iap.iosEnabled;
    } catch {
      return false;
    }
  };

  /** The platform sells at all: FB, or a web adapter with payments (the preview link's mock store); never web-prod. */
  const sells = (): boolean => {
    if (deps.platformId === 'fbig') return true;
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
    if (!sells() || !isFlagOn('shop')) return { kind: 'hidden' };
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
    for (const fn of [...rowListeners]) {
      try {
        fn();
      } catch {
        // a listener's problem never breaks the shop
      }
    }
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

  function log(product: ProductId, result: 'ok' | 'cancelled' | 'not_ready' | 'unsupported' | 'error', source: 'shop' | 'o2' = 'shop'): void {
    deps.log({ name: 'iap', params: { product, result, platform: deps.platformId, source } });
  }

  /** Never consume No Ads in 'keep' mode (G5 alternative): noAds then follows purchases(). */
  const consumes = (p: Purchase): boolean => !(c.iap.removeAdsMode === 'keep' && productDef(p.productId, c)?.noAds === true);

  /** true when the purchase is consumed (or never consumed by design, removeAdsMode 'keep'). */
  async function consume(p: PaymentsProvider, purchase: Purchase): Promise<boolean> {
    if (!consumes(purchase)) return true;
    try {
      return (await p.consume(purchase.purchaseToken)) !== false;
    } catch {
      // still unconsumed: the next boot restore consumes it (its token is recorded, so no second grant)
      return false;
    }
  }

  function grantAndSave(purchase: Purchase): void {
    deps.updateSave((s) => applyPurchase(s, { productId: purchase.productId, purchaseToken: purchase.purchaseToken }, c));
    deps.saves.critical();
    deps.changed();
  }

  const record = (purchase: Purchase) => ({ productId: purchase.productId, purchaseToken: purchase.purchaseToken });

  /**
   * §8.4 grant order: record + grant + critical save, then consume (iap.grantBeforeConsume, 2b). Phase 2e
   * (spec §4.2, D-2e-10): consume FIRST, guarded by the intent ledger: the token into purchases.pending +
   * a critical save, the consume, then the grant (out of pending) + a critical save. Returns false when the
   * consume failed: the purchase stays pending and the next restore delivers it (never twice).
   */
  async function deliver(p: PaymentsProvider, purchase: Purchase): Promise<boolean> {
    if (c.iap.grantBeforeConsume) {
      grantAndSave(purchase);
      await consume(p, purchase);
      return true;
    }
    if (isRecorded(deps.save(), purchase.purchaseToken, c)) {
      // Granted before (a crash after the grant): consume only and drop the intent.
      await consume(p, purchase);
      if (isPending(deps.save(), purchase.purchaseToken, c)) {
        deps.updateSave((s) => removePending(s, purchase.purchaseToken, c));
        deps.saves.critical();
      }
      return true;
    }
    if (!isPending(deps.save(), purchase.purchaseToken, c)) {
      deps.updateSave((s) => addPending(s, record(purchase), c));
      deps.saves.critical();
    }
    if (!(await consume(p, purchase))) return false;
    deps.updateSave((s) => grantPending(s, record(purchase), c));
    deps.saves.critical();
    deps.changed();
    return true;
  }

  /** One purchase (Settings → Shop or O2): busy, the dialog pause, the ledger, the toasts, analytics. */
  async function purchase(id: ProductId, source: 'shop' | 'o2'): Promise<BuyInPlayResult> {
    const p = provider();
    // The sheet's Buy is silent here, as in 2b; O2 tells the player (spec §4.2: toast, back to O2).
    const early = (r: 'not_ready' | 'unsupported'): BuyInPlayResult => {
      if (source === 'o2') {
        deps.toast(t('shop.error'));
        log(id, r, source);
      }
      return r;
    };
    if (!capsPayments() || !onSale(id)) return early('unsupported');
    if (busy) return 'not_ready'; // the other purchase's dialog is open (every Buy is disabled then)
    if (!p || !isReady(p)) return early('not_ready');
    if (productDef(id, c)?.noAds && deps.save().purchases.noAds) return early('unsupported'); // "Owned"
    busy = true;
    busyProduct = id;
    refresh();
    deps.purchaseDialog?.(true);
    try {
      const payload = `${deps.playerId() ?? 'anon'}:${clock.now().toString(36)}${(++nonce).toString(36)}`;
      const r = await p.purchase(id, payload);
      if (r.ok) {
        if (await deliver(p, r.p)) {
          deps.toast(t('shop.thanks'));
          log(id, 'ok', source);
          return 'ok';
        }
        // Paid but the consume failed: the intent stays and the next restore delivers it.
        deps.toast(t('shop.error'));
        log(id, 'error', source);
        return 'error';
      }
      if (r.reason !== 'cancelled') deps.toast(t('shop.error')); // a cancel (USER_INPUT) is silent
      log(id, r.reason, source);
      return r.reason;
    } catch {
      deps.toast(t('shop.error'));
      log(id, 'error', source);
      return 'error';
    } finally {
      busy = false;
      busyProduct = null;
      deps.purchaseDialog?.(false);
      refresh();
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
      await purchase(id, 'shop');
    },
    buyInPlay: (id) => purchase(id, 'o2'),
    prefetchCatalog() {
      if (!c.iap.prefetchCatalog || !sells() || !capsPayments()) return;
      const p = provider();
      if (!p) return;
      hookReady();
      try {
        p.onReady(() => {
          if (disposed) return;
          if (catalogState === 'idle' || (catalogState === 'ready' && clock.now() - catalogAt > c.iap.catalogCacheMs)) {
            catalogState = 'idle';
            loadCatalog(p);
          }
        });
      } catch {
        // the Buy rows stay hidden
      }
    },
    paymentsAllowed: () => capsPayments(),
    o2Buy(placement) {
      if (!sells() || !isFlagOn('shop') || !c.iap.inPlay || (deps.inPlayOn && !deps.inPlayOn())) return [];
      const ids = c.iap.o2Products[placement] ?? [];
      if (ids.length === 0 || !capsPayments()) return [];
      const p = provider();
      const waiting = clock.now() - deps.startedAt < c.iap.readyTimeoutMs;
      let state: 'loading' | 'ready';
      if (!p || !isReady(p)) {
        if (!waiting) return []; // Messenger.com: onReady never fires → hidden after iap.readyTimeoutMs
        state = 'loading';
        hookReady();
      } else {
        if (catalogState === 'ready' && clock.now() - catalogAt > c.iap.catalogCacheMs) catalogState = 'idle';
        if (catalogState === 'idle') loadCatalog(p);
        if (catalogState === 'error') return []; // in play no error text and no Retry (Settings → Shop keeps those)
        state = catalogState === 'ready' ? 'ready' : 'loading';
      }
      const noAds = deps.save().purchases.noAds;
      const out: O2BuyView[] = [];
      for (const id of ids) {
        const def = productDef(id, c);
        if (!def || !onSale(id)) continue;
        if (def.noAds && noAds) continue; // hidden once owned
        const product = state === 'ready' ? catalog?.find((x) => x.id === id) : undefined;
        if (state === 'ready' && !product) continue; // missing from the catalogue: only this row hidden
        const rowState: O2BuyView['state'] = busyProduct !== null ? (busyProduct === id ? 'busy' : 'disabled') : state;
        out.push({
          productId: id,
          kind: def.noAds ? 'no_ads' : 'pack',
          items: def.noAds ? 0 : (def.hints ?? def.kitties ?? 0),
          price: product ? product.price : null,
          state: rowState,
        });
      }
      return out;
    },
    onRowsChange(fn) {
      rowListeners.add(fn);
      return () => rowListeners.delete(fn);
    },
    async restore() {
      const p = provider();
      if (!p) return;
      try {
        await new Promise<void>((resolve) => p.onReady(resolve));
        if (disposed) return;
        const list = await p.purchases();
        if (!list) return; // failure: nothing changes; the next boot tries again
        let dropped = false;
        for (const purchase of list) {
          // A catalogue product or a retired pack (productDef knows both): a retired one is delivered
          // as its compensation, so it never stays unconsumed forever (phase2c §5.3).
          if (!productDef(purchase.productId, c)) continue;
          if (!isRecorded(deps.save(), purchase.purchaseToken, c)) {
            // Not delivered yet (the game died before saving, or the consume failed): the grant order
            // (Phase 2e: consume first, then grant, through the intent ledger).
            if (await deliver(p, purchase)) log(purchase.productId, 'ok');
          } else {
            await consume(p, purchase); // delivered before the game died: consume only
            if (isPending(deps.save(), purchase.purchaseToken, c)) {
              deps.updateSave((s) => removePending(s, purchase.purchaseToken, c));
              dropped = true;
            }
          }
        }
        // Phase 2e (spec §4.2): a pending token FB no longer lists was paid and consumed before the
        // app died: granted once now, without a consume call; one already granted only leaves pending.
        const listed = new Set(list.map((x) => x.purchaseToken));
        let granted = false;
        for (const rec of pendingRecords(deps.save(), c)) {
          if (listed.has(rec.purchaseToken)) continue;
          const before = deps.save();
          deps.updateSave((s) => grantPending(s, rec, c));
          dropped = true;
          if (!isRecorded(before, rec.purchaseToken, c)) {
            granted = true;
            log(rec.productId, 'ok');
          }
        }
        if (dropped) deps.saves.critical();
        if (granted) deps.changed();
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
