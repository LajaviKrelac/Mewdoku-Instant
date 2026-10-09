// Owner: C
// Where and when FB banners show (phase2b §3.2): on Home, victory and event screens only, from
// ads.banner.fromCompletedLevels, never during play, never with No Ads, not on the first-run tutorial's
// victory screen. On an eligible screen mount (after its entry transition): show if the last load was
// ≥ ads.banner.minReloadSec ago, else skip this screen (no retry loop). Hide BEFORE the screen unmounts,
// before a transition to the game screen, before any interstitial or rewarded ad, and when a modal
// opens over the screen (not re-shown on close unless the window passed). UiState.bannerReserved is set
// when a load is attempted and kept until the screen unmounts, so nothing jumps.
// C-internal module (F0 stub): C may reshape it; platform.ads.banner (D) and bannerReserved (B) are fixed.
import type { BannerScreen, GameConfig } from './config';
import type { Clock } from './clock';
import type { PlatformAdapter } from '../platform/types';
import type { AppState, Store } from './store';

export interface BannerFlowDeps {
  readonly platform: PlatformAdapter;
  readonly store: Store<AppState>;
  readonly clock: Clock;
  readonly config?: GameConfig;
}

export interface BannerFlow {
  /** An eligible screen finished its entry. */
  screenShown(screen: BannerScreen, opts: { readonly firstRunTutorial: boolean }): Promise<void>;
  /** Before unmount, a transition to the game screen, an interstitial or rewarded ad, or a modal overlay. */
  hide(): Promise<void>;
  /** The current screen unmounted: drop the reserve. */
  screenGone(): void;
}

export function createBannerFlow(deps: BannerFlowDeps): BannerFlow {
  void deps;
  throw new Error('not implemented: createBannerFlow (C, phase2b §3.2)');
}
