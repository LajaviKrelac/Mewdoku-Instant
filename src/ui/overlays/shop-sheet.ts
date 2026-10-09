// Owner: B
// Shop (new overlay `shop`, phase2b §8.5): a bottom sheet (max-width 480 px). Header: the fish
// balance. "Swap fish": 1 hint for shop.hintFish and 1 kitty for shop.kittyFish, each "Swap" disabled
// below the price. "Buy" (FB, payments ready): the five products with our names and descriptions
// (shop.product.<id>.*), the catalogue's localised price and "Buy" (or "Owned" for No Ads). Arrow
// keys move inside the list (§7). Entry points: the fish pill "+", Settings → Shop / Remove ads.
// Lazy overlay chunk. F0 stub: props final; body is B's.
//
// Classes (proposed): .overlay[data-overlay=shop] > .overlay__panel--sheet.shop
import type { ProductId } from '../../game/types';
import type { OverlayView } from '../dom';

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

export function createShopSheet(): OverlayView<ShopProps> {
  throw new Error('not implemented: createShopSheet (B, phase2b §8.5)');
}
