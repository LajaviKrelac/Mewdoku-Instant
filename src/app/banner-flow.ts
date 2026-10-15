// Owner: C
// Where and when FB banners show (phase2b §3.2): on Home, victory and event screens only, from
// ads.banner.fromCompletedLevels, never during play, never with No Ads, not on the first-run tutorial's
// victory screen. On an eligible screen mount: show if the last load was ≥ ads.banner.minReloadSec
// ago, else skip this screen (no retry loop: a load inside Meta's window only hits RATE_LIMITED).
// Hide BEFORE the screen unmounts, before a transition to the game screen, before any interstitial or
// rewarded ad, and when a modal opens over the screen (not re-shown on close unless the window
// passed). UiState.bannerReserved is set when a load is attempted and kept until the screen unmounts,
// so nothing jumps; a failed load keeps the reserve only with ads.banner.collapseWhenEmpty off (D-2e-25
// below: an empty answer gives the band back). `unsupported` latches banners off for the session.
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
// time; a new hide, a screen change or the win cancels it; never a loop. The victory between levels takes
// the same one timer when it opens (or the ranking panel over it closes) inside the window (G1 resume: the
// board's own re-shown banner had used the window, so the victory stayed bare). From ads.banner.untilDate
// (a local date) the gate answers 'ended': no band, no load. The remote switches banner / bannerInPlay
// (remote-config.ts) can only turn banners off; switchesChanged() hides one that is up. ad_banner
// {screen, result} is logged once per load attempt. reshowAfterAnyHide false = the 2d.1 rule.
// D-2e-25 (2026-10-14, the user: "Removing strip when no banner loads makes sense"; ads.banner.collapseWhenEmpty,
// banner.duringPlay unchanged): a load that came back empty gives its band back. A miss: show() answered !ok with
// any reason but 'timeout' (the load may still land: the reserve stays), it was not the game screen's first
// 'rate_limited' answer (that one keeps its one retry above), the same screen is still up with no hide since, and
// nothing is up. A thrown show() is an unknown outcome, not a miss (pending stays, FB2B-1). On Home, the victory and
// the event screen a miss drops the reserve at once (setReserved(false)): the column gets its room back. On the
// game screen the band stays for the rest of the level (the board never moves under the player's finger: a
// misplaced cat costs a life); after 'no_fill' or 'error', with reshowAfterAnyHide and the board free, ONE more
// load runs when the reload window ends, at most once per board entry (a Retry is a new entry: screenShown('game')
// again; a second miss on the same entry schedules nothing; never a loop; a hide or a screen change cancels it as
// usual). A 'no_fill' / 'error' miss on any screen leaves the flow "starved"; any successful load, on any screen,
// ends it, and so does a 'timeout' answer (its banner may well land). bandAtMount() (eligible('game') and, with
// collapseWhenEmpty, a banner up or still loading or not starved) is what the session decides a new game screen's
// band from, and whether a banner screen's banner may stay into it: a starved board mounts with no band and no
// screenShown('game'), so it never loads (no re-show either: no current screen). collapseWhenEmpty false = the 2e
// rule (a failed load keeps the reserve until the screen unmounts; bandAtMount() = eligible('game')).
// D-2e-25 review (2026-10-14): a band is decided when a screen shows; on the same mount it may go away (a miss; round 3:
// the gate turning to no), but it never appears while the screen is in view, and no banner ever loads into a screen
// that has no band (the game screen already: bandAtMount, never mid-level). With collapseWhenEmpty, a Home, event or
// victory mount (screenShown) reserves its band when it loads (the window passed) or when a banner is up or still
// loading (N1 a, b); inside the window with nothing up, the victory reserves its band at once and takes the one timer,
// so the banner lands in a band already there (N1 c), unless the flow is starved or reshowAfterAnyHide is off: then it
// shows bare, as Home and the event screen do there (the victory gives back a reserve the board had set). A bare mount
// and one whose reserve a miss dropped stay bare (N2, `bareGen`): attempt() does nothing on them (no reserve, no load,
// no timer: a modal's close after the window, the victory's timer, any re-show), so the column never jumps up 58 px
// with a banner then landing where a button was (review #4); the next mount decides again. A reserved band whose
// banner was hidden (a modal, the ranking panel over the victory) keeps it: a close after the window loads at once (as
// before), a close inside it takes ONE timer for the window's end on Home and the event screen too (N3; as the
// victory, with reshowAfterAnyHide), if the screen is still free (the store's screen, no overlay but the coach, no
// ad), so the band is filled rather than left empty; a miss there gives it back (N2). One timer at a time; a new hide
// or a screen change cancels it; never a loop. The screens follow their reserve going off (shell.ts Home and the event
// screen, session.ts the victory, streak-screen-flow.ts the streak screen over Home or the victory) and their buttons
// ignore taps for ads.banner.bandChangeGuardMs after a change on show (ui/overlays/overlay-base.ts createBandGuard,
// review #5). A show() asked of the adapter since its last hide() (`asked`) makes the next hide() reach the adapter
// even after a miss (nothing up, nothing pending), so a late landing of an older load is told to hide (review #0).
// D-2e-25 review round 3 (2026-10-15, collapseWhenEmpty): a Home, event or victory mount whose gate says no (under
// fromCompletedLevels, No Ads, a remote switch off, ads.banner.untilDate, unsupported) is bare as well (R3-0, `refused`):
// no reserve (the victory gives back the one a board left: No Ads bought or the switch turned off mid-level used to
// open it on a band that could never fill) and, being bare, no band later on that mount whatever the gate says then (a
// late cloud copy raising the level count, then a modal's close, used to reserve and load into Home in view). When the
// gate turns to no on such a screen on show (entitlementChanged, switchesChanged, or any later attempt()), its band can
// never fill again: the banner is taken down, the band given back once the adapter's hide answered (the screen follows
// its reserve going off, tap guard included) and the mount is bare from then on; the game screen keeps its band (never
// mid-level). A screen rebuilt in place (shell.ts: Home shown again over Home, the late locale chunk's refresh of Home or
// of the event screen) is the same mount (R3-1, keepsMount()): the shell skips its hide(), the swap's screenGone() and
// the screenShown() after it, so the banner, the band, the bare mark and the one timer stay as they are, and the new
// view is built with the band in view. collapseWhenEmpty false: none of this (the 2e rule above, bit for bit).
// D-2e-25 review round 4 (2026-10-15, collapseWhenEmpty): a band is given back only when nothing can be on screen. The
// adapter's PlatformAds.banner.mayBeUp() (FB: a load landed and no SDK hide has succeeded since, whether or not this flow
// counts it; absent = false) is read at the moment of each decision: a miss (missed()), the gate's no (refused(), after
// its awaited hide) and the victory's bare mount inside the window keep the band while it says yes (R4-2, R4-3: the
// board's banner whose SDK hide failed or hung stayed over Home after Home's own load came back empty, and over a page
// whose No Ads or remote switch took its band); the mount is still marked bare (nothing more loads on it). bandAtMount()
// treats it like `shown`: a board mounts with its band while a banner may still be up. No banner API at all (the adapter
// latched banners off: its `banner` getter is gone) is the gate's no on Home, the event screen and the victory (R4-1):
// before, attempt() returned before the gate, so the victory kept the band the board left, which could never fill.
import { bannerGate } from '../game/ad-pacing';
import type { TimerId } from './clock';
import type { BannerScreen, GameConfig } from './config';
import { cfg } from './config';
import type { Clock } from './clock';
import { isFlagOn } from './flags';
import type { AdFailReason, PlatformAdapter } from '../platform/types';
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
  /**
   * An eligible screen finished its entry. Sets the reserve synchronously when a load is attempted. D-2e-25 review
   * (collapseWhenEmpty): the mount's band is decided here, synchronously (N1): reserved, or bare for the whole mount
   * (N2; round 3, R3-0: also when the gate says no); the victory gives back a reserve the board left in the store when
   * it shows bare.
   */
  screenShown(screen: BannerScreen, opts?: { readonly firstRunTutorial?: boolean }): Promise<void>;
  /**
   * D-2e-25 review round 3 (2026-10-15, R3-1): whether rebuilding `screen` in place (the same screen re-mounted while it
   * is the one on show: shell.ts Home shown again over Home, the late locale chunk's refresh of Home or of the event
   * screen) keeps its mount for the banner rules. With collapseWhenEmpty and `screen` the screen on show: true, and the
   * caller skips the hide() before the swap, the swap's screenGone() and the screenShown() after it, so the banner, the
   * band, the bare mark and the one timer stay as they are (nothing here is tied to the view). Else false: the caller
   * does what any mount does (off: the 2e rule, hide + screenGone + screenShown). No side effect.
   */
  keepsMount(screen: BannerScreen): boolean;
  /**
   * Phase 2d §1.16: whether the gate lets `screen` carry a banner now (enabled, capability, the screen
   * — 'game' only with ads.banner.duringPlay —, levels completed, No Ads, the tutorial), without the
   * 60 s window and without any side effect. D-2e-25: the game screen reserves its band from
   * bandAtMount(), which adds the empty-strip rule on top of this.
   */
  eligible(screen: BannerScreen, opts?: { readonly firstRunTutorial?: boolean }): boolean;
  /**
   * D-2e-25 (2026-10-14, ads.banner.collapseWhenEmpty): whether a new game screen reserves its band (and
   * whether a banner up on the screen being left may stay into it): eligible('game') and, with
   * collapseWhenEmpty, a banner up or still loading, or no empty answer ('no_fill' / 'error') since the
   * last successful load. No side effect; decided once per mount (never mid-level). collapseWhenEmpty
   * false: eligible('game'). D-2e-25 review round 4 (R4-2): a banner the adapter may still show (mayBeUp(), a hide
   * that failed or hung) counts as up.
   */
  bandAtMount(opts?: { readonly firstRunTutorial?: boolean }): boolean;
  /** Before unmount, a transition to the game screen, an interstitial or rewarded ad, or a modal overlay. */
  hide(): Promise<void>;
  /**
   * The current screen unmounted: drop the reserve (and remember it no longer shows a banner). Not a
   * hide: the caller hides first unless the next screen keeps the banner (phase 2d §1.16).
   */
  screenGone(): void;
  /**
   * A modal closed over `screen`: show again only when the reload window has passed. Phase 2d: never
   * on the game screen (it shows again only on the next eligible screen mount). Phase 2e: on the game
   * screen through reshowGame('modal'). `closing`: the overlay being closed (the store mirrors the router
   * after the bus, so it may still be listed while its close is reported). D-2e-25 review (collapseWhenEmpty):
   * nothing on a bare mount (N2); inside the window, Home and the event screen take one timer too (N3).
   */
  modalClosed(closing?: string): Promise<void>;
  /**
   * The No Ads entitlement may have changed (a purchase, the boot restore, a merged cloud save): when
   * the gate now says no, a banner that is up (or still loading) is hidden at once. The reserve stays
   * until the screen unmounts (§3.2: nothing jumps). D-2e-25 review round 3 (R3-0, collapseWhenEmpty): on Home, the
   * event screen and the victory the band, empty for good now, is given back once the banner is down, and the mount
   * stays bare; the game screen keeps its band (never mid-level). Round 4 (R4-3): "down" is the adapter's word after the
   * awaited hide (mayBeUp() no): while a banner may still be up (its SDK hide failed or hung) the band stays, bare.
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
  /**
   * Phase 2e (spec §7.4): the remote switches changed: a banner the gate now refuses is hidden at once. D-2e-25 review
   * round 3 (R3-0, collapseWhenEmpty): on Home, the event screen and the victory the gate's no also gives the band back
   * (once the banner is down; round 4, R4-3: once the adapter says none may be up) and leaves the mount bare, as
   * entitlementChanged().
   */
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
  /**
   * D-2e-25: a miss answered 'no_fill' or 'error' (on any screen) and no load has succeeded since (the other
   * reasons leave it as it is). Read by bandAtMount() with ads.banner.collapseWhenEmpty only.
   */
  let starved = false;
  /**
   * D-2e-25: the screenGen of the board entry whose one miss retry was used (null = none yet). D-2e-25 review (#2):
   * screenShown('game') moves screenGen at every board entry, a Retry's too, so it is one retry per board entry.
   */
  let missRetryGen: number | null = null;
  /**
   * D-2e-25 review (N2, collapseWhenEmpty only): the screenGen of the Home, event or victory mount that shows
   * bare (no reserve at its screenShown, or a miss gave it back; round 3, R3-0: or the gate said no, at the mount or
   * later on it); attempt() does nothing while it is current.
   */
  let bareGen: number | null = null;
  /**
   * D-2e-25 review (G2, review #0): a show() was asked of the adapter since its last hide(). With collapseWhenEmpty
   * the next hide() then reaches the adapter even when nothing is up or pending (after a miss): the adapter's hide
   * is cheap and makes a late landing of an older load hide itself.
   */
  let asked = false;
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
  const gameScreenFree = (closing: string | null = null): boolean => {
    const st = store.get();
    if (current?.screen !== 'game' || st.screen !== 'game' || !st.game) return false;
    if (st.game.status === 'won' || st.ui.adShowing || st.ui.inputLocked) return false;
    return !st.overlays.some((id) => id !== 'coach' && id !== closing);
  };
  /**
   * Phase 2e (G1 resume): the victory between two levels is free (open, nothing over it, no ad showing).
   * The ranking panel hides the banner before it (§3.2); when the board's own banner used the reload
   * window, the victory gets one timer for the window's end too, so the banner stays "always there"
   * through the level loop (U-b) without a load inside Meta's window.
   */
  const victoryFree = (closing: string | null = null): boolean => {
    const st = store.get();
    if (current?.screen !== 'victory' || st.ui.adShowing) return false;
    return st.overlays.includes('victory') && !st.overlays.some((id) => id !== 'victory' && id !== 'coach' && id !== closing);
  };
  /**
   * D-2e-25 review (N3): Home or the event screen whose band is reserved is free for the one timer: it is still the
   * store's screen, no overlay is open but the coach (or the one whose close is being reported), no ad is showing.
   */
  const pageFree = (closing: string | null = null): boolean => {
    const st = store.get();
    const screen = current?.screen;
    if ((screen !== 'home' && screen !== 'event') || st.screen !== screen || st.ui.adShowing) return false;
    return !st.overlays.some((id) => id !== 'coach' && id !== closing);
  };
  /**
   * The screen on show may take the one re-show timer (the game screen and the victory; D-2e-25 review N3: Home and
   * the event screen too, with collapseWhenEmpty only: no timer is scheduled for them otherwise).
   */
  const reshowFree = (closing: string | null = null): boolean => {
    switch (current?.screen) {
      case 'victory':
        return victoryFree(closing);
      case 'home':
      case 'event':
        return pageFree(closing);
      default:
        return gameScreenFree(closing);
    }
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
  /**
   * D-2e-25 review round 4 (2026-10-15, R4-2, R4-3; read with collapseWhenEmpty only): the SDK may still be showing a
   * banner (PlatformAds.banner.mayBeUp: a load landed and no SDK hide has succeeded since, whether or not this flow
   * counts it as up). Absent (an adapter without it, no banner API) or throwing: false. Read at each decision, never kept.
   */
  const mayBeUp = (): boolean => {
    try {
      return api()?.mayBeUp?.() === true;
    } catch {
      return false;
    }
  };
  /**
   * D-2e-25 review round 4 (R4-2, R4-3): a Home, event or victory mount in view gives its band back, unless a banner may
   * still be on screen (mayBeUp): then the band stays under it (the mount is bare all the same: nothing more loads).
   */
  const giveBack = (): void => {
    if (!mayBeUp()) setReserved(false);
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
        { screen, save: store.get().save, bannerSupported: supported(), firstRunTutorial, today: today ?? null },
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
        if (screenGen !== mine || shown || pending || !reshowFree()) return;
        void attempt(force).catch((error: unknown) => deps.onError?.(error));
      },
      Math.max(0, wait),
    );
  };

  /**
   * Takes the banner down (the adapter is told whenever a load may still land). Phase 2e: a load that
   * lands after a hide is taken down here without cancelling a re-show scheduled meanwhile. D-2e-25 review (G2):
   * with collapseWhenEmpty, also whenever a show() was asked since the adapter's last hide (`asked`), even after a
   * miss: a load the adapter gave up on (FB: stuckLoadMs) may still land, and must hide itself then.
   */
  async function takeDown(): Promise<void> {
    gen++;
    const banner = api();
    // Nothing was ever asked for since the last hide: no adapter call (it would be a no-op anyway).
    if (!banner || (!shown && !pending && !(asked && c.ads.banner.collapseWhenEmpty))) return;
    shown = false;
    pending = false;
    asked = false;
    try {
      await banner.hide();
    } catch (error) {
      deps.onError?.(error);
    }
  }

  /**
   * `force` (Phase 2e: the one rate_limited retry) skips our own reload window, never the gate. `mount`: called by
   * screenShown (D-2e-25 review: a Home, event or victory mount decides its band here, N1).
   */
  async function attempt(force = false, closing: string | null = null, mount = false): Promise<void> {
    const cur = current;
    if (!cur) return;
    const collapse = c.ads.banner.collapseWhenEmpty;
    const page = cur.screen !== 'game';
    // D-2e-25 review (N2): a bare Home, event or victory mount stays bare: no reserve, no load, no timer.
    if (collapse && page && bareGen === screenGen) return;
    const banner = api();
    if (!banner || !gateOk(cur.screen, cur.firstRunTutorial)) {
      // D-2e-25 review round 3 (R3-0): the gate's no makes a Home, event or victory mount bare (at the mount: before its
      // view is built; on show: its band given back), so no later gate change on it can add a band. Round 4 (R4-1): no
      // banner API (the adapter latched banners off: its getter is gone) is the same no; it returned before the gate,
      // and the victory kept the band the board left. Off: as before (nothing).
      if (collapse && page) await refused(mount);
      return;
    }
    const now = clock.perf();
    if (!force && lastLoadAt !== null && now - lastLoadAt < windowMs()) {
      const wait = lastLoadAt + windowMs() - now;
      // Skip this screen's load. Phase 2d: a banner still up (or loading) from the previous banner
      // screen stayed (no hide in between), so this screen reserves its band for it.
      if (shown || pending) setReserved(true);
      // Phase 2e: on the game screen, one timer loads it when the window ends (no skip).
      else if (!collapse || !page) {
        if ((cur.screen === 'game' || cur.screen === 'victory') && anyHide() && reshowFree(closing)) scheduleReshow(wait, false);
      } else if (mount) {
        // D-2e-25 review (N1 c): the victory reserves its band now, for the one timer's banner (the ranking panel
        // still covers it: the timer checks it is free when it fires); starved (or reshowAfterAnyHide off), and on
        // Home and the event screen, the mount shows bare, giving back a reserve the board left in the store (round 4,
        // R4-2: kept while the board's banner may still be up, its hide failed or hung).
        if (cur.screen === 'victory' && anyHide() && !starved) {
          setReserved(true);
          scheduleReshow(wait, false);
        } else {
          bareGen = screenGen;
          giveBack();
        }
      } else if (anyHide() && reshowFree(closing)) {
        // D-2e-25 review (N3): a reserved band whose banner was hidden (a modal's close, the ranking panel's over the
        // victory) takes one timer for the window's end, on Home and the event screen too.
        scheduleReshow(wait, false);
      }
      return;
    }
    lastLoadAt = now;
    setReserved(true);
    const mine = ++gen;
    pending = true;
    asked = true;
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
      // D-2e-25: a banner loaded (on any screen, even one left since): the next board may reserve its band again.
      starved = false;
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
    // D-2e-25 review (G3, #1): a 'timeout' ends the starve (fill may well be back: its banner can still land, even
    // after a hide took it down again); a later real miss sets it again. Read with collapseWhenEmpty only.
    if (r.reason === 'timeout') starved = false;
    // collapseWhenEmpty off (the 2e rule): any failure keeps the reserve until the screen unmounts (nothing
    // jumps). D-2e-25: an empty answer on the same screen, no hide since and nothing up, is a miss.
    if (c.ads.banner.collapseWhenEmpty && r.reason !== 'timeout' && mine === gen && current === cur && !shown && !pending) {
      missed(cur, r.reason, now);
    }
  }

  /**
   * D-2e-25 (2026-10-14): the load attempted at `loadAt` on `cur` came back empty (see the header). Home, the
   * victory and the event screen give their band back at once and stay bare for the rest of the mount (D-2e-25
   * review, N2); the game screen keeps its band (never mid-level) and, after 'no_fill' / 'error', takes ONE more
   * load when the reload window ends, at most once per board entry (a Retry is a new entry). D-2e-25 review round 4
   * (R4-2): a page keeps its band (bare all the same) while the adapter says a banner may still be up: the board's
   * banner whose SDK hide failed or hung when Home was shown stayed over Home once Home's own load came back empty.
   */
  function missed(cur: NonNullable<typeof current>, reason: AdFailReason, loadAt: number): void {
    const empty = reason === 'no_fill' || reason === 'error';
    if (empty) starved = true;
    if (cur.screen !== 'game') {
      bareGen = screenGen;
      giveBack();
      return;
    }
    if (!empty || !anyHide() || missRetryGen === screenGen || !gameScreenFree()) return;
    missRetryGen = screenGen;
    scheduleReshow(loadAt + windowMs() - clock.perf(), false);
  }

  /**
   * D-2e-25 review round 3 (2026-10-15, R3-0; collapseWhenEmpty, the Home, event or victory mount on show): the gate
   * says no, so no banner can come on this mount any more. It is marked bare (N2: whatever the gate says later, it never
   * gets a band again) and its band is given back, as after a miss; the banner is taken down (the victory may still
   * carry the board's; a load in flight hides itself when it lands). `mount` (screenShown): the reserve goes at once,
   * before the screen's view is built, so it shows bare from its first frame. On a screen already on show it goes only
   * once the adapter's hide answered (the column never moves under a banner still up), if the same mount is still up;
   * the screen follows it going off (and arms its tap guard). D-2e-25 review round 4 (2026-10-15, R4-3): an answered
   * hide is not a banner gone (its SDK call may have failed or hung: the adapter resolves either way), so the band goes
   * only when the adapter then says none may be up (mayBeUp, read after the hide); else it stays, bare. At the mount
   * likewise (a board's banner whose hide failed keeps the victory's band), then again once the hide answered.
   */
  async function refused(mount: boolean): Promise<void> {
    const mine = screenGen;
    bareGen = screenGen;
    if (mount) giveBack();
    await flow.hide();
    if (screenGen === mine) giveBack();
  }

  /** reshowGame with the overlay whose close is being reported (still listed in the store). */
  async function reshow_(reason: BannerHideReason, closing: string | null): Promise<void> {
    cancelReshow();
    if (reason === 'hint' ? !c.ads.banner.hideDuringHint : !anyHide()) return;
    if (shown || pending || !gameScreenFree(closing)) return;
    const wait = lastLoadAt === null ? 0 : lastLoadAt + windowMs() - clock.perf();
    if (wait <= 0) {
      await attempt();
      return;
    }
    scheduleReshow(wait, false);
  }

  const flow: BannerFlow = {
    async screenShown(screen, opts) {
      screenGen++;
      cancelReshow();
      current = { screen, firstRunTutorial: opts?.firstRunTutorial === true };
      await attempt(false, null, true);
    },
    keepsMount(screen) {
      return c.ads.banner.collapseWhenEmpty && current?.screen === screen;
    },
    eligible(screen, opts) {
      return !!api() && gateOk(screen, opts?.firstRunTutorial === true);
    },
    bandAtMount(opts) {
      // D-2e-25 review round 4 (R4-2): a banner the adapter may still show (a hide that failed or hung) counts as up.
      return flow.eligible('game', opts) && (!c.ads.banner.collapseWhenEmpty || shown || pending || !starved || mayBeUp());
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
    async modalClosed(closing) {
      if (current && current.screen === 'game') {
        // Phase 2e (spec §3.1): Settings, How to play, Shop, the name sheet … closed over the board.
        if (anyHide()) await reshow_('modal', closing ?? null);
        return;
      }
      if (current && !shown) await attempt(false, closing ?? null);
    },
    async entitlementChanged() {
      if (!store.get().save.purchases.noAds) return;
      // D-2e-25 review round 3 (R3-0): the band of Home, the event screen or the victory can never fill now: given back
      // once the banner is down, the mount bare. The game screen keeps its band (never mid-level). Off: the hide alone.
      if (c.ads.banner.collapseWhenEmpty && current && current.screen !== 'game') await refused(false);
      else await flow.hide();
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
    reshowGame: (reason) => reshow_(reason, reason === 'hint' ? 'hint' : null),
    afterAd(kind) {
      void flow.reshowGame(kind).catch((error: unknown) => deps.onError?.(error));
    },
    afterPurchase() {
      void flow.reshowGame('purchase').catch((error: unknown) => deps.onError?.(error));
    },
    async switchesChanged() {
      const cur = current;
      if (!cur || gateOk(cur.screen, cur.firstRunTutorial)) return;
      // D-2e-25 review round 3 (R3-0): as entitlementChanged, the page's band given back and the mount bare (even with
      // nothing up: a band hidden under a modal, or waiting for its one timer, could never fill either).
      if (c.ads.banner.collapseWhenEmpty && cur.screen !== 'game') await refused(false);
      else if (shown || pending) await flow.hide();
    },
  };
  return flow;
}
