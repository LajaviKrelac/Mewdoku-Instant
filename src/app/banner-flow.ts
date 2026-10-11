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
// Phase 2d (G1, docs/phase2d/look-spec.md §1.16, D-2d-15): with ads.banner.duringPlay the game screen
// is a banner screen too. Its band is reserved from mount when the gate says a banner MAY show
// (eligible(), no load needed); the banner shows when the board entry ends (screenShown('game'))
// under the same 60 s window. A banner that is up when the next game screen mounts stays up (no
// screenGone + hide pair on a banner-to-banner transition: the session skips its hide). Over the game
// screen the listed modals hide it and it is not re-shown on close: after a hide it shows again only
// on the next eligible screen mount after the window. O4, O1, O2's prompt and the coach keep it.
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §3.2, D-2d1-13): with ads.banner.hideDuringHint the
// hint overlay (O1) hides it (hintOpened) and is the only modal whose close shows it again on the game
// screen (hintClosed): at once when ads.banner.minReloadSec has passed since the last load (a new
// load), else ONE timer loads it when that window ends, if the same game screen is still up with no
// modal open, no ad showing and the board not won. One timer per close, never a retry loop (Meta's
// window is never hit early); a new hint, a screen change or another close replaces or cancels it.
// Phase 2e (G1, docs/phase2e/spec.md §3.1, D-2e-8; CONTRACTS §7): with ads.banner.reshowAfterAnyHide the
// banner comes back after EVERY hide on the game screen that carries the band, through one path,
// reshowGame(reason): a modal's close (Settings, How to play, Shop, the name sheet), every interstitial
// or rewarded video (afterAd), every purchase dialog (afterPurchase), the hint card's close (as 2d.1),
// and screenShown('game') inside the window (one timer instead of 2d's "skip this screen"). At once
// when ads.banner.minReloadSec has passed since the last load, else ONE timer when it ends; one more
// load ads.banner.rateLimitedRetrySec after a 'rate_limited' answer (once per hide). One timer at a
// time; a new hide, a screen change or the win cancels it; never a loop. From ads.banner.untilDate
// (a local date) the gate answers 'ended': no band, no load. The remote switches banner / bannerInPlay
// (remote-config.ts) can only turn banners off; switchesChanged() hides one that is up. ad_banner
// {screen, result} is logged once per load attempt. reshowAfterAnyHide false = the 2d.1 rule.
import { bannerGate } from '../game/ad-pacing';
import type { TimerId } from './clock';
import type { BannerScreen, GameConfig } from './config';
import { cfg } from './config';
import type { Clock } from './clock';
import { isFlagOn } from './flags';
import type { PlatformAdapter } from '../platform/types';
import type { AnalyticsEvent } from './events';
import type { AppState, Store } from './store';

/** Phase 2e (spec §3.1): why the banner went down (or what just ended) on the game screen. */
export type BannerHideReason = 'interstitial' | 'rewarded' | 'modal' | 'hint' | 'purchase' | 'rate_limited' | 'helper';

export interface BannerFlowDeps {
  readonly platform: Pick<PlatformAdapter, 'ads' | 'capabilities'>;
  readonly store: Store<AppState>;
  readonly clock: Clock;
  readonly config?: GameConfig;
  /** A banner call failed unexpectedly (reported, never thrown). */
  onError?(error: unknown): void;
  /** Phase 2e (spec §3.1): today's local date key (dailyDateKey(now)) for ads.banner.untilDate; absent = no end date. */
  today?(): string;
  /** Phase 2e (spec §7.4): the remote switches banner / bannerInPlay (off only); absent = both on. */
  remote?(): { readonly banner: boolean; readonly bannerInPlay: boolean };
  /** Phase 2e (spec §3.5): ad_banner {screen, result}, once per load attempt. */
  log?(e: AnalyticsEvent): void;
}

export interface BannerFlow {
  /** An eligible screen finished its entry. Sets the reserve synchronously when a load is attempted. */
  screenShown(screen: BannerScreen, opts?: { readonly firstRunTutorial?: boolean }): Promise<void>;
  /**
   * Phase 2d §1.16: whether the gate lets `screen` carry a banner now (enabled, capability, the screen
   * — 'game' only with ads.banner.duringPlay —, levels completed, No Ads, the tutorial), without the
   * 60 s window and without any side effect. The game screen reserves its band from this at mount.
   */
  eligible(screen: BannerScreen, opts?: { readonly firstRunTutorial?: boolean }): boolean;
  /** Before unmount, a transition to the game screen, an interstitial or rewarded ad, or a modal overlay. */
  hide(): Promise<void>;
  /**
   * The current screen unmounted: drop the reserve (and remember it no longer shows a banner). Not a
   * hide: the caller hides first unless the next screen keeps the banner (phase 2d §1.16).
   */
  screenGone(): void;
  /**
   * A modal closed over `screen`: show again only when the reload window has passed. Phase 2d: never
   * on the game screen (it shows again only on the next eligible screen mount).
   */
  modalClosed(): Promise<void>;
  /**
   * The No Ads entitlement may have changed (a purchase, the boot restore, a merged cloud save): when
   * the gate now says no, a banner that is up (or still loading) is hidden at once. The reserve stays
   * until the screen unmounts (§3.2: nothing jumps).
   */
  entitlementChanged(): Promise<void>;
  /** Whether a banner is currently shown (tests, analytics). */
  showing(): boolean;
  /**
   * Phase 2d.1 §3.2: the hint overlay (O1) opened over the game screen: hide the banner (with
   * ads.banner.hideDuringHint; off: the 2d rule, O1 keeps it). Cancels a pending re-show timer.
   */
  hintOpened(): Promise<void>;
  /**
   * Phase 2d.1 §3.2: O1 closed. On the game screen that carries the band (no modal open, the board
   * not won): a new load at once when the reload window has passed, else one timer when it ends.
   */
  hintClosed(): Promise<void>;
  /**
   * Phase 2e (spec §3.1): on the game screen that carries the band, when no banner is up and the screen
   * is free (no modal but the coach, no ad, the board not won): a load at once when the reload window
   * has passed, else one timer when it ends. reshowAfterAnyHide off: only 'hint' re-shows (2d.1).
   */
  reshowGame(reason: BannerHideReason): Promise<void>;
  /** Phase 2e: an interstitial or a rewarded video ended (reshowGame on the game screen). */
  afterAd(kind: 'interstitial' | 'rewarded'): void;
  /** Phase 2e: FB's purchase dialog settled (reshowGame on the game screen). */
  afterPurchase(): void;
  /** Phase 2e (spec §7.4): the remote switches changed: a banner the gate now refuses is hidden at once. */
  switchesChanged(): Promise<void>;
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
  /** Phase 2d.1: moves on every screenShown / screenGone (the re-show timer's "same game screen"). */
  let screenGen = 0;
  /** Phase 2d.1: the one pending re-show after the hint closed inside the reload window (2e: after any hide). */
  let reshow: TimerId | null = null;
  /** Phase 2e: the one 'rate_limited' retry of this hide was used. */
  let rateRetried = false;
  const cancelReshow = (): void => {
    clock.clearTimeout(reshow);
    reshow = null;
  };

  /**
   * Phase 2d.1 §3.2: the game screen that carries the band is still up, no modal or ad is up, the board is
   * not won. Phase 2e: and no helper flow holds the board (ui.inputLocked: O2, a video, a purchase, the
   * mouse's run; the session calls reshowGame when it ends), so a banner is never loaded just before the
   * hint card hides it again. `closingHint`: the hint card's own close is being reported (the store mirrors
   * the router after the bus, so the hint may still be listed).
   */
  const gameScreenFree = (closingHint = false): boolean => {
    const st = store.get();
    if (current?.screen !== 'game' || st.screen !== 'game' || !st.game) return false;
    if (st.game.status === 'won' || st.ui.adShowing || st.ui.inputLocked) return false;
    return !st.overlays.some((id) => id !== 'coach' && !(closingHint && id === 'hint'));
  };

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

  /** Phase 2e (spec §7.4): the remote switches allow `screen` (off only; absent = on). */
  const remoteOk = (screen: BannerScreen): boolean => {
    let sw: { readonly banner: boolean; readonly bannerInPlay: boolean } | undefined;
    try {
      sw = deps.remote?.();
    } catch {
      sw = undefined;
    }
    if (!sw) return true;
    return sw.banner && (screen !== 'game' || sw.bannerInPlay);
  };
  const todayKey = (): string | undefined => {
    try {
      return deps.today?.();
    } catch {
      return undefined;
    }
  };

  const gateOk = (screen: BannerScreen, firstRunTutorial: boolean): boolean => {
    const today = todayKey();
    return (
      remoteOk(screen) &&
      bannerGate(
        { screen, save: store.get().save, bannerSupported: supported(), firstRunTutorial, ...(today !== undefined ? { today } : {}) },
        c,
      ) === 'ok'
    );
  };

  const windowMs = (): number => c.ads.banner.minReloadSec * 1000;
  const anyHide = (): boolean => c.ads.banner.reshowAfterAnyHide;

  /** Phase 2e: one timer on the same game screen; at fire time the screen must still be free and bare. */
  const scheduleReshow = (wait: number, force: boolean): void => {
    cancelReshow();
    const mine = screenGen;
    reshow = clock.setTimeout(
      () => {
        reshow = null;
        if (screenGen !== mine || shown || pending || !gameScreenFree()) return;
        void attempt(force).catch((error: unknown) => deps.onError?.(error));
      },
      Math.max(0, wait),
    );
  };

  /**
   * Takes the banner down (the adapter is told whenever a load may still land). Phase 2e: a load that
   * lands after a hide is taken down here without cancelling a re-show scheduled meanwhile.
   */
  async function takeDown(): Promise<void> {
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
  }

  /** `force` (Phase 2e: the one rate_limited retry) skips our own reload window, never the gate. */
  async function attempt(force = false): Promise<void> {
    const cur = current;
    const banner = api();
    if (!cur || !banner) return;
    if (!gateOk(cur.screen, cur.firstRunTutorial)) return;
    const now = clock.perf();
    if (!force && lastLoadAt !== null && now - lastLoadAt < windowMs()) {
      // Skip this screen's load. Phase 2d: a banner still up (or loading) from the previous banner
      // screen stayed (no hide in between), so this screen reserves its band for it.
      if (shown || pending) setReserved(true);
      // Phase 2e: on the game screen, one timer loads it when the window ends (no skip).
      else if (cur.screen === 'game' && anyHide() && gameScreenFree()) scheduleReshow(lastLoadAt + windowMs() - now, false);
      return;
    }
    lastLoadAt = now;
    setReserved(true);
    const mine = ++gen;
    pending = true;
    let r;
    try {
      r = await banner.show(c.ads.banner.position);
    } catch (error) {
      deps.onError?.(error);
      deps.log?.({ name: 'ad_banner', params: { screen: cur.screen, result: 'error' } });
      // Unknown outcome: the next hide() still reaches the adapter (pending stays as it is).
      return;
    }
    deps.log?.({ name: 'ad_banner', params: { screen: cur.screen, result: r.ok ? 'ok' : r.reason } });
    if (!r.ok && r.reason === 'rate_limited' && cur.screen === 'game' && anyHide() && !rateRetried && mine === gen && current === cur) {
      // Phase 2e (spec §3.1): one more load rateLimitedRetrySec later, once per hide.
      rateRetried = true;
      pending = false;
      scheduleReshow(c.ads.banner.rateLimitedRetrySec * 1000, true);
      return;
    }
    if (r.ok) {
      shown = true;
      pending = false;
      // A hide (a modal, an ad, leaving to a non-banner screen) came while the banner was loading, or
      // the screen went away and no banner screen took over: hide it again at once (FB2B-1). Phase
      // 2d: a load that lands on the next banner screen (no hide in between) stays up there.
      if (mine !== gen || current === null) await takeDown();
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
      screenGen++;
      cancelReshow();
      current = { screen, firstRunTutorial: opts?.firstRunTutorial === true };
      await attempt();
    },
    eligible(screen, opts) {
      return !!api() && gateOk(screen, opts?.firstRunTutorial === true);
    },
    async hide() {
      // Phase 2e: a new hide cancels a pending re-show and allows one more rate_limited retry.
      cancelReshow();
      rateRetried = false;
      await takeDown();
    },
    screenGone() {
      // Not a hide (phase 2d): a banner screen that follows without a hide keeps a banner that is up.
      screenGen++;
      cancelReshow();
      current = null;
      setReserved(false);
    },
    async modalClosed() {
      if (current && current.screen === 'game') {
        // Phase 2e (spec §3.1): Settings, How to play, Shop, the name sheet … closed over the board.
        if (anyHide()) await flow.reshowGame('modal');
        return;
      }
      if (current && !shown) await attempt();
    },
    async entitlementChanged() {
      if (!store.get().save.purchases.noAds) return;
      await flow.hide();
    },
    showing: () => shown,
    async hintOpened() {
      cancelReshow();
      if (!c.ads.banner.hideDuringHint) return;
      await flow.hide();
    },
    async hintClosed() {
      await flow.reshowGame('hint');
    },
    async reshowGame(reason) {
      cancelReshow();
      if (reason === 'hint' ? !c.ads.banner.hideDuringHint : !anyHide()) return;
      if (shown || pending || !gameScreenFree(reason === 'hint')) return;
      const wait = lastLoadAt === null ? 0 : lastLoadAt + windowMs() - clock.perf();
      if (wait <= 0) {
        await attempt();
        return;
      }
      scheduleReshow(wait, false);
    },
    afterAd(kind) {
      void flow.reshowGame(kind).catch((error: unknown) => deps.onError?.(error));
    },
    afterPurchase() {
      void flow.reshowGame('purchase').catch((error: unknown) => deps.onError?.(error));
    },
    async switchesChanged() {
      const cur = current;
      if (cur && (shown || pending) && !gateOk(cur.screen, cur.firstRunTutorial)) await flow.hide();
    },
  };
  return flow;
}
