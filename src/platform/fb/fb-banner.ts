// Owner: D
// FB banner (phase2b §3.1, §3.2, §3.5). loadBannerAdAsync(placementID, position) both loads AND shows
// (no separate show call) [search: Meta docs]; hideBannerAdAsync() removes it [meta-plugin]. Meta
// rate-limits loads to one per 45 s [search: Meta docs] (RATE_LIMITED → { ok: false, reason:
// 'rate_limited' }); `unsupported` from any call latches the banner off for the session (05 §6.2).
// Main bundle (the capability glue is part of fb/index.ts). The app's banner-flow (C) decides where
// and when (never on the game screen, 60 s window); this module never shows a banner by itself.
//
// The one race that matters: a hide() that arrives while a load is still in flight. The SDK shows the
// banner when that load completes, which could be after the game screen came up. So a load that
// settles after a hide() is hidden again at once (and its show() answers 'skipped'), and hide()
// itself never waits on a pending load.
// Review FB2B-1 (never a banner in play):
//   - a hideBannerAdAsync that fails (other than unsupported) leaves the banner counted as up and is
//     retried on a short timer (HIDE_RETRY_MS, at most HIDE_RETRIES times) while it is still unwanted,
//     and again on the next hide();
//   - a load that never settles is given up after stuckLoadMs (just under ads.banner.minReloadSec), so
//     a later show() starts a new load instead of waiting on the hung one forever (a late landing
//     still obeys `wanted`, and since the D-2e-25 review it is hidden when a newer load was started);
//   - D-2e-25 review (2026-10-14; the final rule is D-2e-25 review round 3, 2026-10-15): the SDK's state follows
//     what the app believes. The app (banner-flow) counts a banner as up iff a show() answered ok (or 'timeout':
//     maybe up) and no hide() came since. Each load() takes a sequence number; a load that lands after a newer
//     one was started (it was given up after stuckLoadMs) is stale: the app only ever hears about the newest
//     load. A stale landing is taken down at once, the same way as a landing after hide() (its show() answers
//     'skipped'), even while the app wants a banner, UNLESS the app counts a banner as up: a load answered ok
//     since the last hide() (`okSeq`, reset by hide()), from ANY load, newer or older than the landing one (a
//     'timeout' alone does not count: the newer load decides). Then the landing only refreshes the one banner
//     slot and is left (no SDK call, `visible` untouched; it answers ok). Before (round 1): a given-up load that resolved after its successor came back empty (ADS_NO_FILL:
//     the app gives the band back, ads.banner.collapseWhenEmpty) left a banner over a screen with no band.
//     Round 2's exception ("a NEWER load answered ok", okSeq > seq, kept across hides) got both sides wrong:
//     it hid the banner the app counted as up when that came from an OLDER load (R3-4: Home's banner kept into
//     the board, the board's load given up, a Retry's load empty: the band stayed with nothing in it and every
//     re-show path blocked), and it left a stale landing up after a hide() whose SDK call was still in flight
//     when a show() followed (R3-2: Home's band collapsed under the stale banner).
//   - a hide whose SDK call was in flight while a load landed does not count the banner as gone (the landed
//     one may show after it): `visible` stays set (and a pending retry stays), so the next hide() reaches the
//     SDK.
//   - round 3 (R3-5): a take-down of a landing the app was not told about (a stale one, or one after hide())
//     that fails marks `staleUp` until a hide succeeds or the newest load lands ok: its timer retries go on
//     even while the app wants a banner, and a show() does not cancel them. Before, the retry gave up on
//     `wanted` (set by the newer show() that came back empty) and the stale banner stayed over a band-less
//     screen until the app's next hide(). The newest load landing ok clears it and the retry, so a retry never
//     takes down the banner the app was told about.
//   Platform correctness: none of this is behind ads.banner.collapseWhenEmpty.
//
// Unverified (§14 G4): the position argument's values ('bottom' is our reading), the 50 dp height,
// overlay vs. resize of the webview, the 45 s limit, whether hideBannerAdAsync rejects when nothing
// is shown (we only call it after a load that resolved).
import { cfg, type GameConfig } from '../../app/config';
import { within } from '../shared/timers';
import type { AdFailReason, AdResult, PlatformAds, PlatformTimers } from '../types';
import { fbErrorCode } from './fb-errors';
import { probeBanner } from './fb-probe';
import type { FBInstantSDK } from './fbinstant';

export interface FbBannerOptions {
  /** VITE_FB_PLACEMENT_BANNER; empty → never created (capabilities().banner false). */
  readonly placement: string;
  readonly timers: PlatformTimers;
  /** Called once when a call answered CLIENT_UNSUPPORTED_OPERATION (the adapter turns banner off). */
  readonly onUnsupported?: () => void;
  readonly config?: GameConfig;
}

/** True only when BOTH loadBannerAdAsync and hideBannerAdAsync are in getSupportedAPIs() (and exist at runtime), §3.2. */
export function bannerSupported(sdk: FBInstantSDK): boolean {
  return probeBanner(sdk);
}

/** Banner load errors → AdFailReason (05 §6.2 codes; RATE_LIMITED is the 45 s limit). */
export function mapBannerError(err: unknown): AdFailReason {
  switch (fbErrorCode(err)) {
    case 'RATE_LIMITED':
    case 'ADS_FREQUENT_LOAD':
      return 'rate_limited';
    case 'ADS_NO_FILL':
      return 'no_fill';
    case 'CLIENT_UNSUPPORTED_OPERATION':
      return 'unsupported';
    default:
      return 'error';
  }
}

const UNSUPPORTED: AdResult = Object.freeze({ ok: false, reason: 'unsupported' });

/** A failed hideBannerAdAsync is tried again this long after the failure (FB2B-1). */
export const HIDE_RETRY_MS = 1000;
/** Timer retries per hide() (each later hide() call starts a new round). */
export const HIDE_RETRIES = 3;

/**
 * How long a load may stay unsettled before a later show() gives up on it and loads again (FB2B-1):
 * a little under the app's ads.banner.minReloadSec window (banner-flow measures it on another clock),
 * so the next eligible screen after the window starts a new load, and still above Meta's reported
 * 45 s RATE_LIMITED window.
 */
export function stuckLoadMs(c: GameConfig = cfg): number {
  // Phase 2e I-2 (L1: minReloadSec 60 → 46): the window now sits 1 s above Meta's 45 s, so the floor is 45.5 s
  // (was 46 s, which equalled the new window); the min keeps it inside the window for any minReloadSec ≥ 46.
  const window = c.ads.banner.minReloadSec * 1000;
  return Math.min(window, Math.max(45_500, window - c.ads.readyTimeoutMs));
}

/** PlatformAds.banner for the FB adapter. Never rejects. */
export function createFbBanner(sdk: FBInstantSDK, opts: FbBannerOptions): NonNullable<PlatformAds['banner']> {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const placement = opts.placement.trim();
  /** Readiness-style bound for one SDK call, so a call that never settles cannot hold the app (05 §6.2). */
  const callTimeoutMs = c.ads.readyTimeoutMs;

  let off = placement === '';
  /** The app wants a banner up (show() called, no hide() since). */
  let wanted = false;
  /** A load resolved and no hide has succeeded since: the SDK may be showing a banner. */
  let visible = false;
  /** The in-flight load, shared by overlapping show() calls. */
  let loading: Promise<AdResult> | null = null;
  /** timers.now() when `loading` started: a load older than ads.banner.minReloadSec is given up. */
  let loadingSince = 0;
  /** The pending hide retry timer, and how many retries are left in this round. */
  let retryTimer: number | null = null;
  let retriesLeft = 0;
  /** D-2e-25 review: the sequence number of the newest load started (each load() takes the next one). */
  let loadSeq = 0;
  /**
   * D-2e-25 review: the sequence number of the newest load that answered ok since the last hide() (0 = none): the
   * app counts a banner as up. Review round 3 (2026-10-15, R3-4, R3-2): hide() resets it, and a stale landing is
   * left whenever it is set, whichever load answered ok (round 2 kept it across hides and compared it with the
   * landing's own number).
   */
  let okSeq = 0;
  /** D-2e-25 review: loads that resolved (the SDK may show a banner); read by sdkHide around its call. */
  let landings = 0;
  /**
   * D-2e-25 review round 3 (R3-5): this module took down a landing the app was not told about (a stale one, or one
   * after hide()) and no hide has succeeded since: the retries go on even while the app wants a banner, and a show()
   * keeps them. Cleared when a hide succeeds or the newest load lands ok (that banner is the app's).
   */
  let staleUp = false;

  const latchOff = (): void => {
    if (off) return;
    off = true;
    wanted = false;
    try {
      opts.onUnsupported?.();
    } catch {
      /* the latch above already holds */
    }
  };

  const clearRetry = (): void => {
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    retryTimer = null;
  };

  const sdkHide = async (): Promise<void> => {
    const landed = landings;
    try {
      await (sdk.hideBannerAdAsync as () => Promise<void>)();
      // D-2e-25 review: a load that landed while this call was in flight may show after it: it still counts as up.
      // Review round 3: and a retry pending for it (a stale landing's failed take-down) stays.
      if (landings === landed) {
        visible = false;
        staleUp = false;
        clearRetry();
      }
    } catch (err) {
      if (fbErrorCode(err) === 'CLIENT_UNSUPPORTED_OPERATION') {
        latchOff();
        return;
      }
      // Any other failure: the banner may still be up (visible stays true). Try again shortly, while
      // nobody wants it; the next hide() also tries again.
      scheduleRetry();
    }
  };

  const scheduleRetry = (): void => {
    if (retryTimer !== null || retriesLeft <= 0) return;
    retriesLeft--;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      // D-2e-25 review round 3 (R3-5): a landing the app was not told about is taken down even while it wants a banner.
      if (!visible || (wanted && !staleUp)) return;
      void sdkHide();
    }, HIDE_RETRY_MS);
  };

  const load = (position: 'bottom'): Promise<AdResult> => {
    const seq = ++loadSeq;
    const run = async (): Promise<AdResult> => {
      try {
        await (sdk.loadBannerAdAsync as (id: string, pos?: string) => Promise<void>)(placement, position);
      } catch (err) {
        const reason = mapBannerError(err);
        if (reason === 'unsupported') latchOff();
        return { ok: false, reason };
      }
      landings++;
      // D-2e-25 review (2026-10-14): a newer load was started after this one (this one was given up after
      // stuckLoadMs). Only the newest load may show (see the header).
      const stale = seq !== loadSeq;
      if (stale && wanted && visible && okSeq !== 0) {
        // D-2e-25 review round 3 (2026-10-15, R3-4, R3-2): the app counts a banner as up (a load answered ok since
        // its last hide(), newer or older than this one): this landing only refreshes the one banner slot. Leave
        // it (no SDK call, `visible` as it is).
        return { ok: true };
      }
      visible = true;
      if (!wanted || stale) {
        // hide() came while this load was in flight (or, D-2e-25 review, a newer load was started since):
        // take the banner down again at once. Review round 3 (R3-5): its retries go on while the app wants one.
        clearRetry();
        retriesLeft = HIDE_RETRIES;
        staleUp = true;
        await sdkHide();
        return { ok: false, reason: 'skipped' };
      }
      okSeq = seq;
      // Review round 3 (R3-5): the banner on screen is the one the app is told about: no stale retry may take it down.
      staleUp = false;
      clearRetry();
      return { ok: true };
    };
    const p = run();
    loading = p;
    loadingSince = timers.now();
    void p.then(() => {
      if (loading === p) loading = null;
    });
    return p;
  };

  return {
    async show(position) {
      try {
        if (off) return UNSUPPORTED;
        wanted = true;
        // D-2e-25 review round 3 (R3-5): a stale landing's take-down is retried still (the app never counted it as up).
        if (!staleUp) clearRetry();
        // A load that never settled is given up (stuckLoadMs): start a new one.
        if (loading && timers.now() - loadingSince >= stuckLoadMs(c)) loading = null;
        const p = loading ?? load(position);
        // The load keeps going after a timeout; when it lands it is shown or hidden per `wanted`.
        return await within(timers, p, callTimeoutMs, (): AdResult => ({ ok: false, reason: 'timeout' }));
      } catch {
        return { ok: false, reason: 'error' }; // never reject (PlatformAds contract)
      }
    },

    async hide() {
      try {
        wanted = false;
        // D-2e-25 review round 3 (R3-2): the app no longer counts any banner as up; a stale landing from now on is hidden.
        okSeq = 0;
        // Nothing up, or the pending load hides itself when it lands: no SDK call, nothing to wait for.
        if (!visible) return;
        clearRetry();
        retriesLeft = HIDE_RETRIES;
        await within(timers, sdkHide(), callTimeoutMs, () => undefined);
      } catch {
        /* never reject */
      }
    },
  };
}
