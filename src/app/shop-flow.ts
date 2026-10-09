// Owner: C
// The shop (phase2b §2.8, §8.4, §8.5): fish swaps (spendFish + grant + saves.now(), no ad, no fallback
// cooldown) and FB purchases with the grant order record → grant → saves.critical() → consume (or
// consume first when iap.grantBeforeConsume is false); the boot restore of unconsumed purchases
// (grant only tokens not yet in the ledger, consume all); onReady gating and the iap.readyTimeoutMs
// "Getting the shop ready…" state; toasts shop.thanks / shop.error (USER_INPUT is silent); the iap
// analytics row (never a price or payment id). C-internal module (F0 stub); ShopProps (B) and
// PaymentsProvider (D) are fixed.
import type { PaymentsProvider } from '../platform/types';
import type { Clock } from './clock';
import type { GameConfig } from './config';
import type { SaveScheduler } from './saves';
import type { AppState, Store } from './store';

export interface ShopFlowDeps {
  readonly payments: PaymentsProvider | undefined;
  readonly store: Store<AppState>;
  readonly saves: SaveScheduler;
  readonly clock: Clock;
  /** platform.getPlayerId() for the developerPayload (playerId + ':' + nonce). */
  readonly playerId: () => string | null;
  readonly config?: GameConfig;
}

export interface ShopFlow {
  /** Opens the shop sheet (Home / victory fish pill "+", Settings → Shop / Remove ads). */
  open(): void;
  /** Swap fish for one hint or kitty; false when the wallet is below the price. */
  swap(item: 'hint' | 'kitty'): boolean;
  /** Boot: restore unconsumed purchases after start() and onReady. Never rejects. */
  restore(): Promise<void>;
}

export function createShopFlow(deps: ShopFlowDeps): ShopFlow {
  void deps;
  throw new Error('not implemented: createShopFlow (C, phase2b §8.4)');
}
