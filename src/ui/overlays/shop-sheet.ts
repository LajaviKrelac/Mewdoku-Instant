// Owner: B
// Shop (new overlay `shop`, phase2b §8.5): a bottom sheet (max-width 480 px). Header: the fish
// balance. "Swap fish": 1 hint for shop.hintFish and 1 kitty for shop.kittyFish, each "Swap" disabled
// below the price. "Buy" (FB, payments ready): the five products with our names and descriptions
// (shop.product.<id>.*), the catalogue's localised price and "Buy" (or "Owned" for No Ads). Arrow
// keys move inside the list (§7). Entry points: the fish pill "+", Settings → Shop / Remove ads.
// Disabled actions stay focusable (aria-disabled) so the arrow keys and screen readers still find them.
// Lazy overlay chunk.
//
// Classes: .overlay[data-overlay=shop] > .overlay__panel--sheet.shop[data-buy]
//          .overlay__head(.overlay__title .fish-pill .overlay__close) .shop__section(.shop__heading
//          .shop__row[data-item](.shop__icon .shop__text(.shop__name .shop__desc) .shop__action)) .shop__note .shop__state
//
// Review fixes: a swap is confirmed to screen readers ("1 hint added. Fish left: 5.", plus "Not enough
// fish yet." when the fish run out) through the sheet's own polite live region, and the gated swap
// buttons are described by the "Not enough fish yet." note (A11Y-LIVE-1). Every label follows the
// language, also in a sheet opened before the switch (A11Y-I18N-1).
import type { ProductId } from '../../game/types';
import { formatNumber, t, translate, type I18nKey } from '../../i18n';
import { icon, type IconSymbol } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createFishPill } from '../hud/pills';
import { createLocaleText } from '../locale-text';
import { closeButton, createOverlayShell, makeButton, nextId, setButtonLabel, setGated } from './overlay-base';

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
  readonly fish: number;
  /** shop.hintFish / shop.kittyFish. */
  readonly hintPrice: number;
  readonly kittyPrice: number;
  readonly buy: ShopBuyState;
  /** A purchase or swap is in flight: every action button is disabled. */
  readonly busy: boolean;
  onSwap(item: 'hint' | 'kitty'): void;
  onBuy(id: ProductId): void;
  /** Retry after a catalogue error. */
  onRetry(): void;
  /** ×, Esc, scrim tap. */
  onClose(): void;
}

/** The product's icon (ours, from the sprite). */
const PRODUCT_ICON: Readonly<Record<string, IconSymbol>> = {
  remove_ads: 'icon-play-video',
  hints_15: 'icon-bulb',
  kitties_8: 'icon-paw',
  fish_250: 'icon-fish',
  fish_900: 'icon-fish',
};

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
  const balance = createFishPill({ count: 0, onPlus: null });
  balance.el.classList.add('shop__balance');
  const head = h(
    'div',
    { class: 'overlay__head' },
    L.text(h('h2', { class: 'overlay__title', id: shell.titleId }), () => t('shop.title')),
    balance.el,
    L.attr(closeButton(() => void close()), 'aria-label', () => t('common.close')),
  );
  /** Polite announcements of this sheet (A11Y-LIVE-1): a swap that went through. */
  const live = h('p', { class: 'shop__live visually-hidden', role: 'status', 'aria-live': 'polite' });
  /** The swap waiting for its result: the item, the price and the fish before it. */
  let pendingSwap: { readonly item: 'hint' | 'kitty'; readonly price: number; readonly fishBefore: number } | null = null;

  // ── Swap fish ──
  const swapButton = (item: 'hint' | 'kitty'): HTMLButtonElement =>
    makeButton({
      variant: 'secondary',
      label: t('shop.swap.action'),
      className: 'shop__action shop__swap',
      trailing: h('span', { class: 'shop__price num' }, icon('icon-fish', { class: 'shop__price-icon' }), h('span', { class: 'shop__price-n' })),
      onPress: () => {
        if (!props) return;
        pendingSwap = { item, price: item === 'hint' ? props.hintPrice : props.kittyPrice, fishBefore: props.fish };
        props.onSwap(item);
      },
    });
  const swapHint = swapButton('hint');
  const swapKitty = swapButton('kitty');
  const row = (item: string, sym: IconSymbol, name: HTMLElement, desc: HTMLElement | null, action: HTMLElement): HTMLElement =>
    h(
      'div',
      { class: 'shop__row', dataset: { item } },
      h('span', { class: 'shop__icon', 'aria-hidden': 'true' }, icon(sym)),
      h('span', { class: 'shop__text' }, name, desc),
      action,
    );
  const noteId = nextId('shop-note');
  const notEnough = L.text(h('p', { class: 'shop__note', role: 'note', id: noteId }), () => t('shop.notEnough'));
  const swapSection = L.attr(
    h(
      'section',
      { class: 'shop__section shop__section--swap' },
      L.text(h('h3', { class: 'shop__heading' }), () => t('shop.swap')),
      row('hint', 'icon-bulb', L.text(h('span', { class: 'shop__name' }), () => t('shop.swap.hint')), null, swapHint),
      row('kitty', 'icon-paw', L.text(h('span', { class: 'shop__name' }), () => t('shop.swap.kitty')), null, swapKitty),
      notEnough,
    ),
    'aria-label',
    () => t('shop.swap'),
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
  shell.panel.append(head, swapSection, buySection, live);

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

  /** After a swap: the confirmation once the fish went down, nothing when it did not go through. */
  const announceSwap = (p: ShopProps): void => {
    const s = pendingSwap;
    if (!s || p.busy) return;
    pendingSwap = null;
    if (p.fish > s.fishBefore - s.price) return; // refused or failed: the app's toast says why
    const item = s.item === 'hint' ? t('shop.swap.hint') : t('shop.swap.kitty');
    const done = t('shop.swap.done', { item, count: formatNumber(p.fish) });
    const out = p.fish < Math.min(p.hintPrice, p.kittyPrice) ? ` ${t('shop.notEnough')}` : '';
    // A fresh text node each time, so the same sentence twice in a row is read twice.
    live.textContent = '';
    live.appendChild(document.createTextNode(`${done}${out}`));
  };

  const render = (p: ShopProps): void => {
    props = p;
    L.apply();
    balance.update({ count: p.fish, onPlus: null });
    for (const [btn, price, item] of [
      [swapHint, p.hintPrice, t('shop.swap.hint')],
      [swapKitty, p.kittyPrice, t('shop.swap.kitty')],
    ] as const) {
      const n = btn.querySelector('.shop__price-n');
      if (n) setText(n, formatNumber(price));
      btn.setAttribute('aria-label', t('shop.swap.a11y', { price: formatNumber(price), item }));
      const gated = p.busy || p.fish < price;
      setGated(btn, gated);
      // A gated swap says why (the note), also when focus lands on it (A11Y-LIVE-1).
      if (!p.busy && p.fish < price) btn.setAttribute('aria-describedby', noteId);
      else btn.removeAttribute('aria-describedby');
      setButtonLabel(btn, t('shop.swap.action'));
    }
    notEnough.hidden = p.fish >= Math.min(p.hintPrice, p.kittyPrice);
    announceSwap(p);

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
      pendingSwap = null;
      live.textContent = '';
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
      balance.destroy();
      props = null;
      shell.el.remove();
    },
  };
}
