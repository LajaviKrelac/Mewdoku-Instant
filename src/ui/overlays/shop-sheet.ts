// Owner: B (Phase 2b); G2 (Phase 2c: the Buy section only)
// Shop (new overlay `shop`, phase2b §8.5): a bottom sheet (max-width 480 px). Phase 2c
// (fish-lives-spec §5.2): fish are lives, not a currency, so there is no balance and no swap; the
// sheet is the "Buy" section (FB, payments ready): the catalogue's products (iap.catalog: No Ads, Bulb
// Bundle, Kitty Basket) with our names and descriptions (shop.product.<id>.*), the catalogue's
// localised price and "Buy" (or "Owned" for No Ads), with its states (loading, error + retry,
// unavailable). Arrow keys move inside the list (§7). Entry point: Settings → Shop (the app shows that
// row only where the Buy section can show something) and Remove ads.
// Disabled actions stay focusable (aria-disabled) so the arrow keys and screen readers still find them.
// Lazy overlay chunk.
//
// Classes: .overlay[data-overlay=shop] > .overlay__panel--sheet.shop[data-buy]
//          .overlay__head(.overlay__title .overlay__close) .shop__section.shop__section--buy(.shop__heading
//          .shop__list > .shop__row[data-item](.shop__icon .shop__text(.shop__name .shop__desc) .shop__action)) .shop__state
//
// Review fixes: every label follows the language, also in a sheet opened before the switch (A11Y-I18N-1).
import { cfg } from '../../app/config';
import type { ProductId } from '../../game/types';
import { t, translate, type I18nKey } from '../../i18n';
import { icon, type IconSymbol } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { closeButton, createOverlayShell, makeButton, setGated } from './overlay-base';

export interface ShopProductView {
  readonly id: ProductId;
  /** The catalogue's localised price string, shown as is. */
  readonly price: string;
  /** No Ads already owned (purchases.noAds): "Owned", no Buy button. */
  readonly owned: boolean;
}

/**
 * The "Buy" section (§8.5, §8.6): hidden (web: no payments at all), unavailable (FB iOS, Messenger,
 * or onReady never fired: shop.unavailable), loading (before onReady, ≤ iap.readyTimeoutMs:
 * shop.loading), error (catalogue failure: shop.error + retry) or ready.
 */
export type ShopBuyState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly products: readonly ShopProductView[] };

export interface ShopProps {
  readonly buy: ShopBuyState;
  /** A purchase is in flight: every action button is disabled. */
  readonly busy: boolean;
  onBuy(id: ProductId): void;
  /** Retry after a catalogue error. */
  onRetry(): void;
  /** ×, Esc, scrim tap. */
  onClose(): void;
}

/** The product's icon (ours, from the sprite). The retired fish packs are never listed (iap.catalog only). */
const PRODUCT_ICON: Readonly<Record<string, IconSymbol>> = {
  remove_ads: 'icon-play-video',
  hints_15: 'icon-bulb',
  kitties_8: 'icon-paw',
};

/** Phase 2c §5.3: the products on sale. */
const ON_SALE: ReadonlySet<ProductId> = new Set(cfg.iap.catalog.map((d) => d.id));

const productKey = (id: ProductId, part: 'name' | 'desc'): I18nKey => `shop.product.${id}.${part}` as I18nKey;

export function createShopSheet(): OverlayView<ShopProps> {
  let props: ShopProps | null = null;
  const close = (): boolean => {
    if (!props || !shell.isOpen()) return false;
    props.onClose();
    return true;
  };
  const shell = createOverlayShell({ id: 'shop', scrim: 'soft', panel: 'sheet', onScrimTap: () => void close() });
  shell.panel.classList.add('shop');

  const L = createLocaleText();
  const head = h(
    'div',
    { class: 'overlay__head' },
    L.text(h('h2', { class: 'overlay__title', id: shell.titleId }), () => t('shop.title')),
    L.attr(closeButton(() => void close()), 'aria-label', () => t('common.close')),
  );

  const row = (item: string, sym: IconSymbol, name: HTMLElement, desc: HTMLElement | null, action: HTMLElement): HTMLElement =>
    h(
      'div',
      { class: 'shop__row', dataset: { item } },
      h('span', { class: 'shop__icon', 'aria-hidden': 'true' }, icon(sym)),
      h('span', { class: 'shop__text' }, name, desc),
      action,
    );

  // ── Buy ──
  const buyList = h('div', { class: 'shop__list' });
  const buyState = h('p', { class: 'shop__state' });
  const retry = L.label(
    makeButton({ variant: 'secondary', label: '', className: 'shop__action shop__retry', onPress: () => props?.onRetry() }),
    () => t('shop.retry'),
  );
  const buySection = L.attr(
    h('section', { class: 'shop__section shop__section--buy' }, L.text(h('h3', { class: 'shop__heading' }), () => t('shop.buy')), buyList, buyState, retry),
    'aria-label',
    () => t('shop.buy'),
  );
  shell.panel.append(head, buySection);

  /** Arrow keys move between the sheet's action buttons (§7 "shop: arrows inside the list"). */
  shell.panel.addEventListener('keydown', (ev) => {
    const step = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const actions = Array.from(shell.panel.querySelectorAll<HTMLElement>('.shop__action')).filter((b) => !b.hidden && !b.closest('[hidden]'));
    if (actions.length === 0) return;
    const i = actions.indexOf(ev.target as HTMLElement);
    const next = actions[i < 0 ? 0 : (i + step + actions.length) % actions.length];
    if (!next) return;
    ev.preventDefault();
    next.focus();
  });

  let lastProducts: readonly ShopProductView[] | null = null;
  const productButtons = new Map<ProductId, HTMLButtonElement>();

  const renderProducts = (products: readonly ShopProductView[]): void => {
    if (products === lastProducts) return;
    lastProducts = products;
    buyList.textContent = '';
    productButtons.clear();
    for (const p of products) {
      // Only what is on sale (iap.catalog): a retired pack is never listed, even if handed in.
      if (!ON_SALE.has(p.id)) continue;
      const name = translate(productKey(p.id, 'name'));
      const action = p.owned
        ? h('span', { class: 'shop__owned' }, t('shop.owned'))
        : makeButton({
            variant: 'secondary',
            label: t('shop.buy'),
            ariaLabel: t('shop.buy.a11y', { name, price: p.price }),
            className: 'shop__action shop__buy',
            trailing: h('span', { class: 'shop__cost num' }, p.price),
            onPress: () => props?.onBuy(p.id),
          });
      if (action instanceof HTMLButtonElement) productButtons.set(p.id, action);
      buyList.appendChild(
        row(
          p.id,
          PRODUCT_ICON[p.id] ?? 'icon-shop',
          h('span', { class: 'shop__name' }, name),
          h('span', { class: 'shop__desc' }, translate(productKey(p.id, 'desc'))),
          action,
        ),
      );
    }
  };

  const render = (p: ShopProps): void => {
    props = p;
    L.apply();
    const b = p.buy;
    shell.panel.dataset.buy = b.kind;
    buySection.hidden = b.kind === 'hidden';
    buyList.hidden = b.kind !== 'ready';
    retry.hidden = b.kind !== 'error';
    buyState.hidden = b.kind === 'ready' || b.kind === 'hidden';
    if (b.kind === 'ready') renderProducts(b.products);
    else lastProducts = null;
    if (b.kind === 'loading') setText(buyState, t('shop.loading'));
    else if (b.kind === 'unavailable') setText(buyState, t('shop.unavailable'));
    else if (b.kind === 'error') setText(buyState, t('shop.error'));
    buyState.setAttribute('role', b.kind === 'error' ? 'alert' : 'status');
    for (const btn of productButtons.values()) setGated(btn, p.busy);
    setGated(retry, p.busy);
    shell.panel.setAttribute('aria-busy', String(p.busy));
  };

  // Settings → Language while the sheet is up (A11Y-I18N-1): products are rebuilt with the new names.
  L.watch(() => {
    if (!props || !shell.isOpen()) return;
    lastProducts = null;
    render(props);
  });

  return {
    el: shell.el,
    modal: true,
    open(p) {
      lastProducts = null;
      render(p);
      shell.show();
    },
    update(p) {
      render(p);
    },
    close() {
      shell.hide();
    },
    dismiss: close,
    destroy() {
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
