// Owner: C
// Where and when FB banners show (phase2b §3.2): on Home, victory and event screens only, from
// ads.banner.fromCompletedLevels, never during play, never with No Ads, not on the first-run tutorial's
// victory screen. On an eligible screen mount: show if the last load was ≥ ads.banner.minReloadSec
// ago, else skip this screen (no retry loop: a load inside Meta's window only hits RATE_LIMITED).
// Hide BEFORE the screen unmounts, before a transition to the game screen, before any interstitial or
// rewarded ad, and when a modal opens over the screen (not re-shown on close unless the window
// passed). UiState.bannerReserved is set when a load is attempted and kept until the screen unmounts,
// so nothing jumps; a failed load keeps the reserve. `unsupported` latches banners off for the session.
// A load that answered 'timeout' (ads.readyTimeoutMs) may still land and show itself, so it counts as
// "maybe up" until the next hide(): that hide always reaches the adapter, which takes the banner down
// (or makes the late load hide itself when it lands). Review FB2B-1: before, a slow load left the
// banner up through play with no hide at all. Owning No Ads (a purchase, the boot restore or a late
// cloud merge) takes a banner on show down at once (entitlementChanged, L2B-2).
// C-internal module: platform.ads.banner (D) and bannerReserved (B) are fixed.
import { bannerGate } from '../game/ad-pacing';
import type { BannerScreen, GameConfig } from './config';
import { cfg } from './config';
import type { Clock } from './clock';
import { isFlagOn } from './flags';
import type { PlatformAdapter } from '../platform/types';
import type { AppState, Store } from './store';

export interface BannerFlowDeps {
  readonly platform: Pick<PlatformAdapter, 'ads' | 'capabilities'>;
  readonly store: Store<AppState>;
  readonly clock: Clock;
  readonly config?: GameConfig;
  /** A banner call failed unexpectedly (reported, never thrown). */
  onError?(error: unknown): void;
}

export interface BannerFlow {
  /** An eligible screen finished its entry. Sets the reserve synchronously when a load is attempted. */
  screenShown(screen: BannerScreen, opts?: { readonly firstRunTutorial?: boolean }): Promise<void>;
  /** Before unmount, a transition to the game screen, an interstitial or rewarded ad, or a modal overlay. */
  hide(): Promise<void>;
  /** The current screen unmounted: drop the reserve (and remember it no longer shows a banner). */
  screenGone(): void;
  /** A modal closed over `screen`: show again only when the reload window has passed. */
  modalClosed(): Promise<void>;
  /**
   * The No Ads entitlement may have changed (a purchase, the boot restore, a merged cloud save): when
   * the gate now says no, a banner that is up (or still loading) is hidden at once. The reserve stays
   * until the screen unmounts (§3.2: nothing jumps).
   */
  entitlementChanged(): Promise<void>;
  /** Whether a banner is currently shown (tests, analytics). */
  showing(): boolean;
}

export function createBannerFlow(deps: BannerFlowDeps): BannerFlow {
  const c = deps.config ?? cfg;
  const { store, clock } = deps;
  /** clock.perf() of the last load attempt; null = never in this session. */
  let lastLoadAt: number | null = null;
  let latched = false;
  let shown = false;
  /**
   * A load was asked for and has not been answered with a result that rules a banner out: it is in
   * flight, or it answered 'timeout' / threw, so the SDK may still show it. hide() must reach the
   * adapter then (FB2B-1).
   */
  let pending = false;
  /** The eligible screen on show now (null after screenGone). */
  let current: { screen: BannerScreen; firstRunTutorial: boolean } | null = null;
  let gen = 0;

  const setReserved = (on: boolean): void =>
    store.update((s) => (s.ui.bannerReserved === on ? s : { ...s, ui: { ...s.ui, bannerReserved: on } }));

  const api = (): NonNullable<PlatformAdapter['ads']['banner']> | null => {
    try {
      return deps.platform.ads.banner ?? null;
    } catch {
      return null;
    }
  };
  const supported = (): boolean => {
    if (latched || !isFlagOn('banners') || !api()) return false;
    try {
      return deps.platform.capabilities().banner;
    } catch {
      return false;
    }
  };

  async function attempt(): Promise<void> {
    const cur = current;
    const banner = api();
    if (!cur || !banner) return;
    const gate = bannerGate(
      { screen: cur.screen, save: store.get().save, bannerSupported: supported(), firstRunTutorial: cur.firstRunTutorial },
      c,
    );
    if (gate !== 'ok') return;
    const now = clock.perf();
    if (lastLoadAt !== null && now - lastLoadAt < c.ads.banner.minReloadSec * 1000) return; // skip this screen
    lastLoadAt = now;
    setReserved(true);
    const mine = ++gen;
    pending = true;
    let r;
    try {
      r = await banner.show(c.ads.banner.position);
    } catch (error) {
      deps.onError?.(error);
      // Unknown outcome: the next hide() still reaches the adapter (pending stays as it is).
      return;
    }
    if (r.ok) {
      shown = true;
      pending = false;
      // The screen went away (or a modal opened) while the banner was loading: hide it again at once.
      if (mine !== gen || current === null) await flow.hide();
      return;
    }
    if (r.reason === 'unsupported') latched = true;
    // 'timeout': the load goes on in the adapter and may still land; a hide since then (gen moved on)
    // already told the adapter, which hides a late banner itself. Any other answer: nothing is up.
    if (r.reason !== 'timeout' || mine !== gen) pending = false;
    // Any failure keeps the reserve until the screen unmounts (nothing jumps).
  }

  const flow: BannerFlow = {
    async screenShown(screen, opts) {
      current = { screen, firstRunTutorial: opts?.firstRunTutorial === true };
      await attempt();
    },
    async hide() {
      gen++;
      const banner = api();
      // Nothing was ever asked for since the last hide: no adapter call (it would be a no-op anyway).
      if (!banner || (!shown && !pending)) return;
      shown = false;
      pending = false;
      try {
        await banner.hide();
      } catch (error) {
        deps.onError?.(error);
      }
    },
    screenGone() {
      gen++;
      current = null;
      setReserved(false);
    },
    async modalClosed() {
      if (current && !shown) await attempt();
    },
    async entitlementChanged() {
      if (!store.get().save.purchases.noAds) return;
      await flow.hide();
    },
    showing: () => shown,
  };
  return flow;
}
