// Owner: C. Banners (phase2b §3.2, §3.6): shown on Home, victory and event screens only, never on the
// game screen or the ranking panel; hidden before a new board, before ads and under modal overlays;
// skipped inside the 60 s reload window; `unsupported` latches them off; the reserve stays after a
// failed load (ads.banner.collapseWhenEmpty off; D-2e-25 below); no banner at all when the adapter has no
// banner API (no hideBannerAdAsync).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.16, §5.1): with ads.banner.duringPlay the game screen is
// a banner screen: its band is decided at mount (eligible), the banner shows at the board entry's
// end, a banner up on the victory stays into the next board (no hide in between), the listed modals
// hide it without a re-show there, O4 / O1 / O2 / the coach keep it, ads hide it first, and
// duringPlay off restores every 2b case.
// Phase 2d.1 (G1, helpers-spec §3.2, §7.6, D-2d1-13): the hint card hides it; after it closes it loads
// again at once when ads.banner.minReloadSec has passed, else exactly one timer loads it when the
// window ends (not when the screen has gone, a modal is open or the board is won); off: the 2d rule.
// D-2e-25 (2026-10-14, ads.banner.collapseWhenEmpty): an empty answer (any reason but 'timeout', same screen, no
// hide since, nothing up) gives Home, the victory and the event screen their band back at once; a 'timeout' or a
// thrown show() keeps it; 'no_fill' / 'error' leave the flow starved until any load succeeds, and bandAtMount()
// (always eligible-gated) then says no band for a new board unless a banner is up or loading; off: the 2e rule.
// The game screen's side (its band kept, the one retry, the next board) is in banner-2e.spec.ts.
// D-2e-25 review (2026-10-14): the band is decided at the mount (N1: the victory inside the window reserves at once for its
// one timer, bare when starved; Home and the event screen bare there); a bare mount stays bare (N2: no reserve, no load,
// no timer); a reserved Home or event band hidden by a modal and closed inside the window takes one timer (N3); after a
// miss the next hide() reaches the adapter (G2); a 'timeout' ends the starve (G3); one miss retry per board entry (G1);
// off: the 2e rule in each case. The session and shell side (Home, the victory, the streak screen) is in banner-2e.spec.ts.
// D-2e-25 review round 3 (2026-10-15): a Home, event or victory mount whose gate says no is bare (R3-0: no band later on
// it whatever the gate says then; the victory gives back the board's band); No Ads or a remote switch off on such a
// screen on show gives its band back once the banner is down (the game screen keeps its band); keepsMount (R3-1).
// D-2e-25 review round 4 (2026-10-15): a band goes only when the adapter says no banner may be up (mayBeUp: a miss on Home
// after the board's banner's SDK hide failed, R4-2; the gate's no after a hide that failed, R4-3, the victory's mount too),
// the mount bare all the same; bandAtMount() counts such a banner as up; no banner API (the adapter latched off) is the
// gate's no on a page (R4-1); the victory inside the window loads nothing before the window ends, then once (R4-6).
import { describe, expect, it } from 'vitest';
import { createAdFlow } from '../../../src/app/ad-flow';
import { createBannerFlow, type BannerFlow } from '../../../src/app/banner-flow';
import { createFakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig, type DeepPartial, type GameConfig } from '../../../src/app/config';
import { createShell, type Shell } from '../../../src/app/shell';
import { createEventBus, type AppEventMap } from '../../../src/app/events';
import { createStore, initialAppState, type AppState } from '../../../src/app/store';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import { createFbBanner } from '../../../src/platform/fb/fb-banner';
import type { AdResult } from '../../../src/platform/types';
import { createStub, drain } from '../platform/helpers';
import { createFakePlatform, createHarness, loseGame, NOW, startLevel, winGame, type FakePlatform, type Harness, tapRanking } from './harness';

const veteran = (s: SaveData): SaveData => ({ ...s, progress: { level: 15, completed: 14, best: {} } });

function setup(opts: { completed?: number; noAds?: boolean; banner?: boolean; results?: AdResult[]; config?: DeepPartial<GameConfig> } = {}) {
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  const save: SaveData = {
    ...defaults(NOW),
    tutorialDone: true,
    progress: { level: (opts.completed ?? 14) + 1, completed: opts.completed ?? 14, best: {} },
    purchases: { noAds: opts.noAds ?? false, tokens: [], pending: [] },
  };
  const store = createStore<AppState>(initialAppState(save));
  const platform: FakePlatform = createFakePlatform(log, { banner: opts.banner ?? true });
  const results = opts.results ?? [];
  if (opts.banner !== false) {
    platform.ads.banner = {
      show: async (pos) => {
        log.push(`banner:show:${pos}`);
        return results.shift() ?? { ok: true };
      },
      hide: async () => void log.push('banner:hide'),
    };
  }
  const flow = createBannerFlow({ platform, store, clock, ...(opts.config ? { config: mergeConfig(opts.config) } : {}) });
  const reserved = (): boolean => store.get().ui.bannerReserved;
  return { log, clock, store, platform, flow, reserved };
}

describe('banner-flow (§3.2)', () => {
  it('shows on Home, victory and event screens once 10 levels are completed, with the reserve', async () => {
    for (const screen of ['home', 'victory', 'event'] as const) {
      const s = setup();
      await s.flow.screenShown(screen);
      expect(s.log).toEqual(['banner:show:bottom']);
      expect(s.reserved()).toBe(true);
      expect(s.flow.showing()).toBe(true);
    }
  });

  it('never before the start level (Phase 2e L1: fromCompletedLevels 9, level 10\'s board), with No Ads, or on the first-run tutorial victory', async () => {
    expect(cfg.ads.banner.fromCompletedLevels).toBe(9);
    const first = setup({ completed: 9 });
    await first.flow.screenShown('home');
    expect(first.log).toEqual(['banner:show:bottom']);
    const early = setup({ completed: 8 });
    await early.flow.screenShown('home');
    const owned = setup({ noAds: true });
    await owned.flow.screenShown('home');
    const tut = setup();
    await tut.flow.screenShown('victory', { firstRunTutorial: true });
    for (const s of [early, owned, tut]) {
      expect(s.log).toEqual([]);
      expect(s.reserved()).toBe(false);
    }
  });

  it('no banner at all when the adapter has no banner API (hideBannerAdAsync missing)', async () => {
    const s = setup({ banner: false });
    await s.flow.screenShown('home');
    expect(s.log).toEqual([]);
    expect(s.reserved()).toBe(false);
  });

  it('skips a screen inside the 46 s reload window (Phase 2e L1, P-B2; no retry loop), shows again after it', async () => {
    expect(cfg.ads.banner.minReloadSec).toBe(46);
    const s = setup();
    await s.flow.screenShown('home');
    await s.flow.hide();
    s.flow.screenGone();
    s.clock.advance(45_000);
    // D-2e-25 review: the event screen (the victory inside the window reserves its band for its one timer, N1 c).
    await s.flow.screenShown('event');
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
    expect(s.reserved()).toBe(false);
    s.flow.screenGone();
    s.clock.advance(1000);
    await s.flow.screenShown('home');
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide', 'banner:show:bottom']);
  });

  it('collapseWhenEmpty off (the 2e rule): a failed load keeps the reserve until the screen unmounts; unsupported latches banners off', async () => {
    const s = setup({ results: [{ ok: false, reason: 'no_fill' }, { ok: false, reason: 'unsupported' }], config: { ads: { banner: { collapseWhenEmpty: false } } } });
    await s.flow.screenShown('home');
    expect(s.reserved()).toBe(true);
    expect(s.flow.showing()).toBe(false);
    s.flow.screenGone();
    expect(s.reserved()).toBe(false);
    s.clock.advance(61_000);
    await s.flow.screenShown('home');
    s.flow.screenGone();
    s.clock.advance(61_000);
    await s.flow.screenShown('home');
    expect(s.log.filter((l) => l.startsWith('banner:show'))).toHaveLength(2); // the third is latched off
  });

  it('a modal hides the banner; closing it shows one only after the window', async () => {
    const s = setup();
    await s.flow.screenShown('home');
    await s.flow.hide(); // settings opened
    await s.flow.modalClosed();
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
    await s.flow.hide();
    s.clock.advance(60_000);
    await s.flow.modalClosed();
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide', 'banner:show:bottom']);
  });

  it('the screen left while the banner was loading: it is hidden as soon as the load ends', async () => {
    const s = setup();
    let release: (r: AdResult) => void = () => undefined;
    if (s.platform.ads.banner) s.platform.ads.banner.show = () => new Promise((r) => (release = r));
    const shown = s.flow.screenShown('home');
    s.flow.screenGone();
    release({ ok: true });
    await shown;
    expect(s.flow.showing()).toBe(false);
    expect(s.log).toContain('banner:hide');
  });

  // ── review FB2B-1: a slow, stuck or timed-out load must never leave a banner in play ──

  it('a show() that answered timeout may still land: the next hide() reaches the adapter', async () => {
    const s = setup({ results: [{ ok: false, reason: 'timeout' }] });
    await s.flow.screenShown('home');
    expect(s.flow.showing()).toBe(false);
    await s.flow.hide(); // into the game
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
    await s.flow.hide(); // nothing asked for since: no second adapter call
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
  });

  it('a hide() while the load is still in flight reaches the adapter at once (it hides the banner when it lands)', async () => {
    const s = setup();
    let release: (r: AdResult) => void = () => undefined;
    if (s.platform.ads.banner) s.platform.ads.banner.show = () => (s.log.push('banner:show:bottom'), new Promise((r) => (release = r)));
    const shown = s.flow.screenShown('home');
    await s.flow.hide();
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
    release({ ok: false, reason: 'timeout' });
    await shown;
    await s.flow.hide(); // already told: nothing more to do
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
  });

  it('a show() that threw counts as maybe up; a definite failure (no fill) does not (collapseWhenEmpty off; on: see G2 below)', async () => {
    const threw = setup();
    if (threw.platform.ads.banner) threw.platform.ads.banner.show = async () => Promise.reject(new Error('boom'));
    await threw.flow.screenShown('home');
    await threw.flow.hide();
    expect(threw.log).toEqual(['banner:hide']);
    const nofill = setup({ results: [{ ok: false, reason: 'no_fill' }], config: { ads: { banner: { collapseWhenEmpty: false } } } });
    await nofill.flow.screenShown('home');
    await nofill.flow.hide();
    expect(nofill.log).toEqual(['banner:show:bottom']);
  });

  it('with the real FB banner: a 6 s load (over ads.readyTimeoutMs) is never left on the game screen', async () => {
    const clock = createFakeClock(NOW);
    const { sdk, control } = createStub({ banner: { loadDelayMs: cfg.ads.readyTimeoutMs + 2_000 } }, clock);
    const save: SaveData = { ...defaults(NOW), tutorialDone: true, progress: { level: 12, completed: 11, best: {} } };
    const store = createStore<AppState>(initialAppState(save));
    const platform = createFakePlatform([], { banner: true });
    platform.ads.banner = createFbBanner(sdk, { placement: 'ban-1', timers: clock });
    const flow = createBannerFlow({ platform, store, clock });
    const home = flow.screenShown('home');
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await home;
    expect(flow.showing()).toBe(false); // the show() timed out, the load goes on
    await clock.advanceAsync(800);
    flow.screenGone();
    await flow.hide(); // session.start: into the game before the load lands
    await clock.advanceAsync(2_000);
    await drain();
    expect(control.count('loadBannerAdAsync')).toBe(1);
    expect(control.count('hideBannerAdAsync')).toBe(1);
    expect(control.state.bannerVisible).toBe(false);
  });

  // ── review L2B-2: No Ads takes a banner on show down at once ──

  it('entitlementChanged: No Ads now owned hides the banner on show (collapseWhenEmpty off: the reserve stays until unmount; on: given back, D-2e-25 review round 3)', async () => {
    for (const off of [true, false]) {
      const s = setup(off ? { config: { ads: { banner: { collapseWhenEmpty: false } } } } : {});
      await s.flow.screenShown('home');
      await s.flow.entitlementChanged(); // something else changed (a hint pack): nothing to do
      expect(s.log).toEqual(['banner:show:bottom']);
      s.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: true, tokens: [], pending: [] } } }));
      await s.flow.entitlementChanged();
      expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
      expect(s.flow.showing()).toBe(false);
      expect(s.reserved(), `off ${off}`).toBe(off);
      await s.flow.modalClosed(); // no reload: the gate now says no_ads
      s.clock.advance(61_000);
      await s.flow.modalClosed();
      expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
      expect(s.reserved(), `off ${off}`).toBe(off);
    }
  });

  it('entitlementChanged while the load is in flight: the adapter is told, so the late banner never shows', async () => {
    const s = setup();
    let release: (r: AdResult) => void = () => undefined;
    if (s.platform.ads.banner) s.platform.ads.banner.show = () => (s.log.push('banner:show:bottom'), new Promise((r) => (release = r)));
    const shown = s.flow.screenShown('home');
    s.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: true, tokens: [], pending: [] } } }));
    await s.flow.entitlementChanged();
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
    release({ ok: true });
    await shown;
    expect(s.flow.showing()).toBe(false);
    expect(s.log.filter((l) => l === 'banner:hide').length).toBeGreaterThanOrEqual(1);
  });

  it('the ranking, boot and overlay screens never qualify; the game screen only with duringPlay (phase 2d)', async () => {
    const s = setup();
    for (const screen of ['ranking', 'boot', 'overlay'] as const) {
      await s.flow.screenShown(screen as never);
      expect(s.flow.eligible(screen as never)).toBe(false);
    }
    expect(s.log).toEqual([]);
    expect(s.flow.eligible('game')).toBe(true);
    await s.flow.screenShown('game');
    expect(s.log).toEqual(['banner:show:bottom']);
    const off = createBannerFlow({ platform: s.platform, store: s.store, clock: s.clock, config: mergeConfig({ ads: { banner: { duringPlay: false } } }) });
    expect(off.eligible('game')).toBe(false);
    expect(off.eligible('home')).toBe(true);
  });

  it('eligible(): the gate without the reload window and without side effects', async () => {
    const s = setup();
    await s.flow.screenShown('home');
    s.log.length = 0;
    expect(s.flow.eligible('game')).toBe(true); // inside the 46 s window: still eligible
    expect(s.flow.eligible('game', { firstRunTutorial: true })).toBe(false);
    expect(s.log).toEqual([]);
    expect(setup({ completed: 8 }).flow.eligible('game')).toBe(false);
    expect(setup({ completed: 9 }).flow.eligible('game')).toBe(true);
    expect(setup({ noAds: true }).flow.eligible('game')).toBe(false);
    expect(setup({ banner: false }).flow.eligible('game')).toBe(false);
  });

  it('phase 2d: a banner screen that follows without a hide keeps the banner up and reserves its band in the window', async () => {
    const s = setup();
    await s.flow.screenShown('victory');
    s.flow.screenGone(); // the victory goes (not a hide)
    expect(s.reserved()).toBe(false);
    await s.flow.screenShown('game'); // inside the window: no reload, but the banner is still up
    expect(s.log).toEqual(['banner:show:bottom']);
    expect(s.flow.showing()).toBe(true);
    expect(s.reserved()).toBe(true);
  });

  it('phase 2d: modalClosed never re-shows a banner on the game screen (only the next eligible mount after the window)', async () => {
    const s = setup();
    await s.flow.screenShown('game');
    await s.flow.hide(); // a modal opened over the game
    s.clock.advance(61_000);
    await s.flow.modalClosed();
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
    s.flow.screenGone();
    await s.flow.screenShown('game'); // the next board, after the window
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide', 'banner:show:bottom']);
  });

  it('hidden before any interstitial or rewarded ad (ad-flow beforeShow)', async () => {
    const s = setup();
    await s.flow.screenShown('home');
    const bus = createEventBus<AppEventMap>();
    const ads = createAdFlow({
      platform: s.platform,
      clock: s.clock,
      bus,
      setInputLocked: () => undefined,
      setMuted: () => undefined,
      beforeShow: () => s.flow.hide(),
    });
    await ads.interstitial('next_level');
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide', 'ad:interstitial:next_level', 'preload:interstitial']);
  });
});

// ─────────────────────────── D-2e-25: an empty answer gives the band back ───────────────────────────

describe('D-2e-25 (2026-10-14): an empty banner answer gives the band back (ads.banner.collapseWhenEmpty)', () => {
  const OFF: DeepPartial<GameConfig> = { ads: { banner: { collapseWhenEmpty: false } } };
  const WINDOW = cfg.ads.banner.minReloadSec * 1000;
  /** show() answers when the test says so (the load is in flight until then). */
  function held(s: ReturnType<typeof setup>): { answer(r: AdResult): void; fail(e: unknown): void } {
    const ctl = { answer: (_r: AdResult): void => undefined, fail: (_e: unknown): void => undefined };
    if (s.platform.ads.banner) {
      s.platform.ads.banner.show = (pos) => {
        s.log.push(`banner:show:${pos}`);
        return new Promise<AdResult>((resolve, reject) => {
          ctl.answer = resolve;
          ctl.fail = reject;
        });
      };
    }
    return ctl;
  }

  it('Home, the victory and the event screen give the reserve back at once after any empty answer but timeout', async () => {
    expect(cfg.ads.banner.collapseWhenEmpty).toBe(true);
    for (const screen of ['home', 'victory', 'event'] as const) {
      for (const reason of ['no_fill', 'error', 'not_ready', 'skipped', 'rate_limited', 'unsupported'] as const) {
        const s = setup();
        const ctl = held(s);
        const shown = s.flow.screenShown(screen);
        expect(s.reserved(), `${screen} ${reason}: reserved while loading`).toBe(true);
        ctl.answer({ ok: false, reason });
        await shown;
        expect(s.reserved(), `${screen} ${reason}`).toBe(false);
        // D-2e-25 review (G2): nothing is up, but a show() was asked since the adapter's last hide: it is told (once).
        await s.flow.hide();
        await s.flow.hide();
        expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
      }
    }
  });

  it("'timeout' keeps the reserve (the load may still land); so does a thrown show() (an unknown outcome)", async () => {
    const timeout = setup({ results: [{ ok: false, reason: 'timeout' }] });
    await timeout.flow.screenShown('home');
    expect(timeout.reserved()).toBe(true);
    expect(timeout.flow.bandAtMount()).toBe(true); // maybe up
    const threw = setup();
    if (threw.platform.ads.banner) threw.platform.ads.banner.show = async () => Promise.reject(new Error('boom'));
    await threw.flow.screenShown('victory');
    expect(threw.reserved()).toBe(true);
    expect(threw.flow.bandAtMount()).toBe(true);
    await threw.flow.hide();
    expect(threw.log).toEqual(['banner:hide']); // still told (FB2B-1)
  });

  it('collapseWhenEmpty off: the 2e rule on every screen (the reserve stays until unmount; bandAtMount() = eligible)', async () => {
    for (const screen of ['home', 'victory', 'event'] as const) {
      for (const reason of ['no_fill', 'error', 'not_ready'] as const) {
        const s = setup({ results: [{ ok: false, reason }], config: OFF });
        await s.flow.screenShown(screen);
        expect(s.reserved(), `${screen} ${reason}`).toBe(true);
        expect(s.flow.bandAtMount()).toBe(true);
        s.flow.screenGone();
        expect(s.reserved()).toBe(false);
      }
    }
    expect(setup({ completed: 8, config: OFF }).flow.bandAtMount()).toBe(false);
  });

  it("bandAtMount(): false after a 'no_fill' miss with nothing up; true while a load is in flight, while a banner is up, and again after a load succeeds on another screen", async () => {
    const s = setup({ results: [{ ok: false, reason: 'no_fill' }] });
    expect(s.flow.bandAtMount()).toBe(true); // nothing asked yet
    await s.flow.screenShown('home');
    expect(s.flow.bandAtMount()).toBe(false); // starved, nothing up
    expect(s.flow.eligible('game')).toBe(true); // eligible() is unchanged
    expect(s.log).toEqual(['banner:show:bottom']); // side-effect free
    s.flow.screenGone();
    s.clock.advance(WINDOW);
    const ctl = held(s);
    const victory = s.flow.screenShown('victory');
    expect(s.flow.bandAtMount()).toBe(true); // a load in flight may still fill the band
    ctl.answer({ ok: true });
    await victory;
    expect(s.flow.showing()).toBe(true);
    expect(s.flow.bandAtMount()).toBe(true); // up
    await s.flow.hide();
    s.flow.screenGone();
    expect(s.flow.bandAtMount()).toBe(true); // the success ended the starve
  });

  it("'error' starves too; rate_limited, unsupported, skipped and not_ready leave the flag as it was", async () => {
    const err = setup({ results: [{ ok: false, reason: 'error' }] });
    await err.flow.screenShown('event');
    expect(err.flow.bandAtMount()).toBe(false);
    for (const reason of ['rate_limited', 'skipped', 'not_ready'] as const) {
      // Not starved before: still not.
      const fresh = setup({ results: [{ ok: false, reason }] });
      await fresh.flow.screenShown('home');
      expect(fresh.reserved(), reason).toBe(false); // a miss all the same: the band goes
      expect(fresh.flow.bandAtMount(), reason).toBe(true);
      // Starved before: still starved.
      const starved = setup({ results: [{ ok: false, reason: 'no_fill' }, { ok: false, reason }] });
      await starved.flow.screenShown('home');
      starved.flow.screenGone();
      starved.clock.advance(WINDOW);
      await starved.flow.screenShown('victory');
      expect(starved.log.filter((l) => l.startsWith('banner:show')), reason).toHaveLength(2);
      expect(starved.flow.bandAtMount(), reason).toBe(false);
    }
    // 'unsupported' latches banners off: no band either way (the gate).
    const unsupported = setup({ results: [{ ok: false, reason: 'unsupported' }] });
    await unsupported.flow.screenShown('home');
    expect(unsupported.reserved()).toBe(false);
    expect(unsupported.flow.eligible('game')).toBe(false);
    expect(unsupported.flow.bandAtMount()).toBe(false);
  });

  it("bandAtMount() is always gated by eligible('game') (start level, No Ads, the first-run tutorial, no banner API, duringPlay off)", async () => {
    expect(setup({ completed: 8 }).flow.bandAtMount()).toBe(false);
    expect(setup({ noAds: true }).flow.bandAtMount()).toBe(false);
    expect(setup({ banner: false }).flow.bandAtMount()).toBe(false);
    expect(setup({ config: { ads: { banner: { duringPlay: false } } } }).flow.bandAtMount()).toBe(false);
    const s = setup();
    expect(s.flow.bandAtMount({ firstRunTutorial: true })).toBe(false);
    expect(s.flow.bandAtMount({ firstRunTutorial: false })).toBe(true);
    // A banner up does not lift the gate: No Ads bought while it shows.
    await s.flow.screenShown('home');
    expect(s.flow.showing()).toBe(true);
    s.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: true, tokens: [], pending: [] } } }));
    expect(s.flow.bandAtMount()).toBe(false);
  });

  it('not a miss: a hide since the load started, or the screen gone when it answers (no band given back, not starved)', async () => {
    const hidden = setup();
    const a = held(hidden);
    const home = hidden.flow.screenShown('home');
    await hidden.flow.hide(); // a modal opened while loading
    a.answer({ ok: false, reason: 'no_fill' });
    await home;
    expect(hidden.reserved()).toBe(true); // until the screen unmounts, as before
    expect(hidden.flow.bandAtMount()).toBe(true);

    const gone = setup();
    const b = held(gone);
    const victory = gone.flow.screenShown('victory');
    gone.flow.screenGone(); // into the next board, the load still in flight
    b.answer({ ok: false, reason: 'no_fill' });
    await victory;
    expect(gone.flow.bandAtMount()).toBe(true);
  });
});

// ─────────── D-2e-25 review (2026-10-14): a band is decided when a screen shows (the flow's side) ───────────

describe('D-2e-25 review (2026-10-14): the band is decided at the mount; bare stays bare; the adapter is told; timeout ends the starve', () => {
  const OFF: DeepPartial<GameConfig> = { ads: { banner: { collapseWhenEmpty: false } } };
  const WINDOW = cfg.ads.banner.minReloadSec * 1000;
  const shows = (s: ReturnType<typeof setup>): number => s.log.filter((l) => l.startsWith('banner:show')).length;
  /** The store as the app has it on `screen` (the victory: an overlay on the game screen). */
  const on = (s: ReturnType<typeof setup>, screen: 'home' | 'event' | 'victory', overlays: readonly string[] = screen === 'victory' ? ['victory'] : []): void =>
    s.store.update((st) => ({ ...st, screen: screen === 'victory' ? 'game' : screen, overlays: overlays as AppState['overlays'] }));
  /** Every change of the store's banner reserve from now on. */
  function flips(s: ReturnType<typeof setup>): boolean[] {
    const out: boolean[] = [];
    s.store.select(
      (st) => st.ui.bannerReserved,
      (v) => void out.push(v),
    );
    return out;
  }

  it('N2: a mount whose band a miss gave back stays bare: a modal\'s close after the window loads nothing (off: a load, the band back)', async () => {
    for (const screen of ['home', 'event', 'victory'] as const) {
      for (const off of [false, true]) {
        const s = setup({ results: [{ ok: false, reason: 'no_fill' }, { ok: true }], ...(off ? { config: OFF } : {}) });
        on(s, screen);
        await s.flow.screenShown(screen);
        expect(s.reserved(), `${screen} off ${off}`).toBe(off);
        const seen = flips(s);
        await s.flow.hide(); // a modal over it
        s.clock.advance(WINDOW + 1_000);
        await s.flow.modalClosed('settings');
        s.clock.advance(3 * WINDOW);
        await drain();
        expect(shows(s), `${screen} off ${off}`).toBe(off ? 2 : 1);
        expect(seen, `${screen} off ${off}`).toEqual([]); // off: the reserve was kept all along
        // The next mount decides again.
        s.flow.screenGone();
        await s.flow.screenShown(screen);
        expect(shows(s), `${screen} off ${off}`).toBe(off ? 3 : 2);
      }
    }
  });

  it('N1 c: Home and the event screen inside the window with nothing up show bare and stay so (no load at a close after the window)', async () => {
    for (const screen of ['home', 'event'] as const) {
      const s = setup();
      await s.flow.screenShown('home'); // the window starts
      await s.flow.hide();
      s.flow.screenGone();
      s.clock.advance(10_000);
      on(s, screen);
      await s.flow.screenShown(screen);
      expect(s.reserved()).toBe(false);
      s.clock.advance(WINDOW);
      await s.flow.modalClosed('settings');
      s.clock.advance(WINDOW);
      await drain();
      expect(shows(s), screen).toBe(1);
      expect(s.reserved()).toBe(false);
      // Off: the 2e rule (the close after the window loads, the band appears).
      const o = setup({ config: OFF });
      await o.flow.screenShown('home');
      await o.flow.hide();
      o.flow.screenGone();
      o.clock.advance(10_000);
      on(o, screen);
      await o.flow.screenShown(screen);
      o.clock.advance(WINDOW);
      await o.flow.modalClosed('settings');
      expect([shows(o), o.reserved()], screen).toEqual([2, true]);
    }
  });

  it('N1 c: the victory inside the window with nothing up reserves at once (synchronously) and loads into that band when the window ends; starved: bare, the board\'s reserve given back, nothing scheduled', async () => {
    const s = setup();
    await s.flow.screenShown('home');
    await s.flow.hide();
    s.flow.screenGone();
    s.clock.advance(10_000);
    void s.flow.screenShown('victory'); // before the victory's props are built (session.openVictory)
    expect(s.reserved()).toBe(true);
    on(s, 'victory');
    const seen = flips(s);
    await s.clock.advanceAsync(WINDOW - 10_000);
    await drain();
    expect(shows(s)).toBe(2);
    expect(s.flow.showing()).toBe(true);
    expect(seen).toEqual([]); // the band was there before the banner came

    const st = setup({ results: [{ ok: false, reason: 'no_fill' }] });
    await st.flow.screenShown('home'); // a miss: starved
    st.flow.screenGone();
    st.clock.advance(10_000);
    st.store.update((x) => ({ ...x, ui: { ...x.ui, bannerReserved: true } })); // the band the board left in the store
    void st.flow.screenShown('victory');
    expect(st.reserved()).toBe(false);
    on(st, 'victory', ['victory']);
    await st.flow.modalClosed('ranking'); // the ranking panel's close
    await st.clock.advanceAsync(3 * WINDOW);
    await drain();
    expect(shows(st)).toBe(1);
    expect(st.reserved()).toBe(false);
  });

  it('N3: the event screen\'s band hidden by a modal and closed inside the window: one timer when the window ends, only if the screen is still free', async () => {
    const s = setup();
    on(s, 'event');
    await s.flow.screenShown('event');
    s.clock.advance(10_000);
    await s.flow.hide();
    await s.flow.modalClosed('settings');
    await s.clock.advanceAsync(WINDOW - 10_000);
    await drain();
    expect(shows(s)).toBe(2);
    expect([s.flow.showing(), s.reserved()]).toEqual([true, true]);
    // Not free when the window ends (another overlay up, the store on another screen, an ad): nothing.
    for (const busy of [
      (x: ReturnType<typeof setup>) => on(x, 'event', ['ladder_session']),
      (x: ReturnType<typeof setup>) => x.store.update((st) => ({ ...st, screen: 'game' })),
      (x: ReturnType<typeof setup>) => x.store.update((st) => ({ ...st, ui: { ...st.ui, adShowing: true } })),
    ]) {
      const b = setup();
      on(b, 'event');
      await b.flow.screenShown('event');
      b.clock.advance(10_000);
      await b.flow.hide();
      await b.flow.modalClosed('settings');
      busy(b);
      await b.clock.advanceAsync(3 * WINDOW);
      await drain();
      expect(shows(b)).toBe(1);
      expect(b.reserved()).toBe(true); // the band kept (as before), empty
    }
  });

  it('G2 (#0): after a miss the next hide() reaches the adapter once (a late landing must hide itself); off: no call', async () => {
    for (const screen of ['home', 'victory', 'event', 'game'] as const) {
      const s = setup({ results: [{ ok: false, reason: 'no_fill' }] });
      await s.flow.screenShown(screen);
      expect(s.flow.showing()).toBe(false);
      await s.flow.hide();
      await s.flow.hide(); // told already
      expect(s.log, screen).toEqual(['banner:show:bottom', 'banner:hide']);
      const o = setup({ results: [{ ok: false, reason: 'no_fill' }], config: OFF });
      await o.flow.screenShown(screen);
      await o.flow.hide();
      expect(o.log, screen).toEqual(['banner:show:bottom']);
    }
    // Never asked: no call (a starved board, the first hide of the session).
    const none = setup();
    await none.flow.hide();
    expect(none.log).toEqual([]);
  });

  it("G1 (#2): at most one miss retry per board entry: screenShown('game') again (a Retry's entry) has its own one; never a loop", async () => {
    const s = setup({ results: Array.from({ length: 6 }, (): AdResult => ({ ok: false, reason: 'no_fill' })) });
    // The board free (playing, input open, nothing over it): gameScreenFree.
    s.store.update((st) => ({ ...st, screen: 'game', game: { status: 'playing' } as unknown as AppState['game'], ui: { ...st.ui, inputLocked: false } }));
    await s.flow.screenShown('game');
    await s.clock.advanceAsync(WINDOW);
    await drain();
    expect(shows(s)).toBe(2); // the entry's load and its one retry
    await s.clock.advanceAsync(5 * WINDOW);
    await drain();
    expect(shows(s)).toBe(2);
    await s.flow.screenShown('game'); // a Retry: the board's entry ends again (same mount, same band)
    expect(shows(s)).toBe(3);
    await s.clock.advanceAsync(WINDOW);
    await drain();
    expect(shows(s)).toBe(4);
    await s.clock.advanceAsync(5 * WINDOW);
    await drain();
    expect(shows(s)).toBe(4);
  });

  it('G3 (#1): a timeout answer ends the starve; after a hide the next board has its band again (a later real miss starves again)', async () => {
    const s = setup({ results: [{ ok: false, reason: 'no_fill' }, { ok: false, reason: 'timeout' }, { ok: false, reason: 'no_fill' }] });
    await s.flow.screenShown('home');
    expect(s.flow.bandAtMount()).toBe(false); // starved
    s.flow.screenGone();
    s.clock.advance(WINDOW);
    await s.flow.screenShown('home'); // 'timeout': it may still land
    expect(s.flow.bandAtMount()).toBe(true);
    await s.flow.hide(); // into the board: pending is over
    s.flow.screenGone();
    expect(s.flow.bandAtMount()).toBe(true); // the first pass said false here (still starved)
    s.clock.advance(WINDOW);
    await s.flow.screenShown('victory');
    expect(s.flow.bandAtMount()).toBe(false); // a real miss again
  });

  it('collapseWhenEmpty off: bandAtMount() is eligible() whatever the answers (G3 changes nothing there)', async () => {
    const s = setup({ results: [{ ok: false, reason: 'no_fill' }, { ok: false, reason: 'timeout' }], config: OFF });
    await s.flow.screenShown('home');
    expect(s.flow.bandAtMount()).toBe(true);
    s.flow.screenGone();
    s.clock.advance(WINDOW);
    await s.flow.screenShown('home');
    await s.flow.hide();
    expect(s.flow.bandAtMount()).toBe(true);
  });
});

// ─────────── D-2e-25 review round 3 (2026-10-15): the gate's no is a bare mount; a mount kept in place ───────────

describe('D-2e-25 review round 3 (2026-10-15): a mount the gate refuses is bare; the gate turning to no gives the band back; keepsMount', () => {
  const OFF: DeepPartial<GameConfig> = { ads: { banner: { collapseWhenEmpty: false } } };
  const WINDOW = cfg.ads.banner.minReloadSec * 1000;
  const shows = (s: ReturnType<typeof setup>): number => s.log.filter((l) => l.startsWith('banner:show')).length;
  const on = (s: ReturnType<typeof setup>, screen: 'home' | 'event' | 'victory' | 'game'): void =>
    s.store.update((st) => ({ ...st, screen: screen === 'victory' ? 'game' : screen, overlays: screen === 'victory' ? ['victory'] : [] }));
  function flips(s: ReturnType<typeof setup>): boolean[] {
    const out: boolean[] = [];
    s.store.select(
      (st) => st.ui.bannerReserved,
      (v) => void out.push(v),
    );
    return out;
  }
  /** A flow on `s`'s platform and store with the remote switches (setup() has none). */
  function withRemote(s: ReturnType<typeof setup>, config?: DeepPartial<GameConfig>) {
    const remote = { banner: true, bannerInPlay: true };
    const flow = createBannerFlow({ platform: s.platform, store: s.store, clock: s.clock, remote: () => remote, ...(config ? { config: mergeConfig(config) } : {}) });
    return { flow, remote };
  }
  const noAds = (s: ReturnType<typeof setup>): void =>
    s.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: true, tokens: [], pending: [] } } }));

  it('R3-0 (a): a Home, event or victory mount under fromCompletedLevels is bare; a late cloud copy past it, then a modal\'s close after the window: no band, no load (off: the band appears with a load)', async () => {
    for (const screen of ['home', 'event', 'victory'] as const) {
      for (const off of [false, true]) {
        const s = setup({ completed: 7, ...(off ? { config: OFF } : {}) });
        on(s, screen);
        await s.flow.screenShown(screen);
        expect([shows(s), s.reserved()], `${screen} off ${off}`).toEqual([0, false]);
        const seen = flips(s);
        s.store.update((st) => ({ ...st, save: veteran(st.save) })); // the late cloud copy: 14 levels completed
        await s.flow.hide(); // a modal over it
        s.clock.advance(WINDOW + 1_000);
        await s.flow.modalClosed('settings');
        await s.clock.advanceAsync(3 * WINDOW);
        await drain();
        expect(shows(s), `${screen} off ${off}`).toBe(off ? 1 : 0);
        expect(seen, `${screen} off ${off}`).toEqual(off ? [true] : []); // on: the band never appears in view
        if (off) continue;
        // The next mount decides again (with the gate's yes now).
        s.flow.screenGone();
        await s.flow.screenShown(screen);
        expect([shows(s), s.reserved()], screen).toEqual([1, true]);
      }
    }
  });

  it('R3-0 (b): the victory whose gate says no (No Ads bought, the remote switch turned off mid-level) gives back the band the board left, synchronously at its screenShown; nothing loads (off: the board\'s empty band stays)', async () => {
    for (const cause of ['noAds', 'switch'] as const) {
      for (const off of [false, true]) {
        const s = setup();
        const { flow, remote } = withRemote(s, off ? OFF : undefined);
        on(s, 'game');
        await flow.screenShown('game'); // the board's banner, in its band
        expect([shows(s), s.reserved()]).toEqual([1, true]);
        if (cause === 'noAds') {
          noAds(s);
          await flow.entitlementChanged();
        } else {
          remote.banner = false;
          await flow.switchesChanged();
        }
        expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
        expect(s.reserved(), `${cause} off ${off}`).toBe(true); // the board keeps its band (never mid-level)
        s.clock.advance(WINDOW + 1_000);
        on(s, 'victory');
        const mount = flow.screenShown('victory'); // before the victory's props are built (session.openVictory)
        expect(s.reserved(), `${cause} off ${off}`).toBe(off);
        await mount;
        await flow.modalClosed('ranking');
        await s.clock.advanceAsync(3 * WINDOW);
        await drain();
        expect(shows(s), `${cause} off ${off}`).toBe(1);
        expect(s.reserved(), `${cause} off ${off}`).toBe(off);
      }
    }
  });

  it('R3-0: No Ads on Home, the event screen or the victory on show: the banner goes first, the band only once the adapter\'s hide answered; the mount stays bare (off: the band stays); the game screen keeps its band', async () => {
    for (const screen of ['home', 'event', 'victory', 'game'] as const) {
      for (const off of [false, true]) {
        const s = setup(off ? { config: OFF } : {});
        let answer: () => void = () => undefined;
        const b = s.platform.ads.banner;
        if (b) b.hide = () => (s.log.push('banner:hide'), new Promise<void>((r) => (answer = r)));
        on(s, screen);
        await s.flow.screenShown(screen);
        expect([s.flow.showing(), s.reserved()]).toEqual([true, true]);
        noAds(s);
        const changed = s.flow.entitlementChanged();
        expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
        expect(s.reserved(), `${screen} off ${off}`).toBe(true); // the banner may still be on screen
        answer();
        await changed;
        const gives = !off && screen !== 'game';
        expect(s.reserved(), `${screen} off ${off}`).toBe(!gives);
        if (!gives) continue;
        // Bare: nothing comes back on this mount, whatever the gate says later (a refund, say).
        s.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: false, tokens: [], pending: [] } } }));
        s.clock.advance(WINDOW + 1_000);
        await s.flow.modalClosed('settings');
        await s.clock.advanceAsync(3 * WINDOW);
        await drain();
        expect([shows(s), s.reserved()], screen).toEqual([1, false]);
      }
    }
  });

  it('R3-0: the remote switch off on a page whose band waits (hidden by a modal, its one timer pending): the band given back at once, the timer cancelled, the mount bare even when the switch comes back (off: nothing changes, the timer loads)', async () => {
    for (const off of [false, true]) {
      const s = setup();
      const { flow, remote } = withRemote(s, off ? OFF : undefined);
      on(s, 'home');
      await flow.screenShown('home');
      s.clock.advance(10_000);
      await flow.hide(); // Settings
      await flow.modalClosed('settings'); // inside the window: on, the one timer (N3); off: the band kept, nothing
      expect(s.reserved()).toBe(true);
      remote.banner = false;
      await flow.switchesChanged();
      expect(s.reserved(), `off ${off}`).toBe(off);
      remote.banner = true;
      await s.clock.advanceAsync(3 * WINDOW);
      await flow.modalClosed('settings');
      await drain();
      expect(shows(s), `off ${off}`).toBe(off ? 2 : 1);
      expect(s.reserved(), `off ${off}`).toBe(off);
    }
  });

  it('R3-1: keepsMount(screen) is true only with collapseWhenEmpty for the screen on show (no side effect)', async () => {
    const s = setup();
    expect(s.flow.keepsMount('home')).toBe(false); // nothing on show
    on(s, 'home');
    await s.flow.screenShown('home');
    expect([s.flow.keepsMount('home'), s.flow.keepsMount('event'), s.flow.keepsMount('victory')]).toEqual([true, false, false]);
    expect([s.flow.showing(), s.reserved(), shows(s)]).toEqual([true, true, 1]);
    s.flow.screenGone();
    expect(s.flow.keepsMount('home')).toBe(false);
    const o = setup({ config: OFF });
    await o.flow.screenShown('home');
    expect(o.flow.keepsMount('home')).toBe(false);
  });
});

// ─────────── D-2e-25 review round 4 (2026-10-15): the band goes only when nothing can be on screen ───────────

describe('D-2e-25 review round 4 (2026-10-15): a band is given back only when no banner may be up (mayBeUp); no banner API is the gate\'s no; the victory\'s one timer', () => {
  const OFF: DeepPartial<GameConfig> = { ads: { banner: { collapseWhenEmpty: false } } };
  const WINDOW = cfg.ads.banner.minReloadSec * 1000;
  const shows = (s: ReturnType<typeof setup>): number => s.log.filter((l) => l.startsWith('banner:show')).length;
  const on = (s: ReturnType<typeof setup>, screen: 'home' | 'event' | 'victory' | 'game'): void =>
    s.store.update((st) => ({ ...st, screen: screen === 'victory' ? 'game' : screen, overlays: screen === 'victory' ? ['victory'] : [] }));
  function flips(s: ReturnType<typeof setup>): boolean[] {
    const out: boolean[] = [];
    s.store.select(
      (st) => st.ui.bannerReserved,
      (v) => void out.push(v),
    );
    return out;
  }
  /**
   * The adapter's view of the SDK (PlatformAds.banner.mayBeUp, as the FB adapter's `visible`): a load answered ok puts a
   * banner up; a hide() takes it down unless its SDK call fails (`hideFails`; the adapter still answers, never rejects).
   */
  function sdk(s: ReturnType<typeof setup>): { up: boolean; hideFails: boolean } {
    const st = { up: false, hideFails: false };
    const b = s.platform.ads.banner;
    if (b) {
      const show = b.show.bind(b);
      b.show = async (pos) => {
        const r = await show(pos);
        if (r.ok) st.up = true;
        return r;
      };
      b.hide = async () => {
        s.log.push('banner:hide');
        if (!st.hideFails) st.up = false;
      };
      b.mayBeUp = () => st.up;
    }
    return st;
  }
  function withRemote(s: ReturnType<typeof setup>, config?: DeepPartial<GameConfig>) {
    const remote = { banner: true, bannerInPlay: true };
    const flow = createBannerFlow({ platform: s.platform, store: s.store, clock: s.clock, remote: () => remote, ...(config ? { config: mergeConfig(config) } : {}) });
    return { flow, remote };
  }
  const noAds = (s: ReturnType<typeof setup>, owned = true): void =>
    s.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: owned, tokens: [], pending: [] } } }));

  it("R4-2: Home after the window while the board's banner may still be up (its SDK hide failed): Home's own load comes back empty, the band stays under it, bare (nothing more loads), and the next board mounts with its band; a hide that went through: the band goes as before", async () => {
    for (const fails of [true, false]) {
      const s = setup({ results: [{ ok: true }, { ok: false, reason: 'no_fill' }, { ok: true }] });
      const st = sdk(s);
      on(s, 'home');
      await s.flow.screenShown('home'); // L1: ok
      s.flow.screenGone(); // into the board, banner to banner (no hide)
      on(s, 'game');
      await s.flow.screenShown('game'); // inside the window: the banner kept, its band reserved
      expect([shows(s), s.flow.showing(), s.reserved()]).toEqual([1, true, true]);
      s.clock.advance(WINDOW + 1_000); // O4, then Home after the window
      st.hideFails = fails;
      await s.flow.hide(); // shell.showHome's hide(): the SDK call fails (the adapter answers all the same)
      s.flow.screenGone();
      on(s, 'home');
      const seen = flips(s);
      await s.flow.screenShown('home'); // L2: no_fill
      expect(shows(s)).toBe(2);
      expect(seen, `fails ${fails}`).toEqual(fails ? [true] : [true, false]);
      expect(s.reserved(), `fails ${fails}`).toBe(fails); // the band stays under the banner that may still be up
      // Bare all the same: a modal's close after the window loads nothing.
      await s.flow.hide();
      s.clock.advance(WINDOW + 1_000);
      await s.flow.modalClosed('settings');
      await s.clock.advanceAsync(3 * WINDOW);
      await drain();
      expect(shows(s), `fails ${fails}`).toBe(2);
      expect(s.reserved(), `fails ${fails}`).toBe(fails);
      // Starved (L2 was empty), but a banner may still be up: the next board mounts with its band, not band-less under it.
      expect(s.flow.bandAtMount(), `fails ${fails}`).toBe(fails);
      st.up = false; // the adapter's retry went through
      expect(s.flow.bandAtMount()).toBe(false);
    }
    // Off: the 2e rule (a failed load keeps the reserve until the screen unmounts; bandAtMount() = eligible).
    const o = setup({ results: [{ ok: true }, { ok: false, reason: 'no_fill' }], config: OFF });
    const ost = sdk(o);
    await o.flow.screenShown('home');
    ost.hideFails = true;
    await o.flow.hide();
    o.flow.screenGone();
    o.clock.advance(WINDOW + 1_000);
    await o.flow.screenShown('home');
    ost.up = false;
    expect([shows(o), o.reserved(), o.flow.bandAtMount()]).toEqual([2, true, true]);
  });

  it('R4-3: No Ads or the remote switch off on Home, the event screen or the victory on show, the SDK hide failing: the band stays (bare) while a banner may still be up; a hide that went through gives it back as before; off: the band stays', async () => {
    for (const cause of ['noAds', 'switch'] as const) {
      for (const screen of ['home', 'event', 'victory'] as const) {
        for (const fails of [true, false]) {
          for (const off of [false, true]) {
            const s = setup();
            const st = sdk(s);
            const { flow, remote } = withRemote(s, off ? OFF : undefined);
            const what = `${cause} ${screen} fails ${fails} off ${off}`;
            on(s, screen);
            await flow.screenShown(screen);
            expect([flow.showing(), s.reserved()], what).toEqual([true, true]);
            st.hideFails = fails;
            if (cause === 'noAds') {
              noAds(s);
              await flow.entitlementChanged();
            } else {
              remote.banner = false;
              await flow.switchesChanged();
            }
            expect(s.log, what).toEqual(['banner:show:bottom', 'banner:hide']);
            expect(s.reserved(), what).toBe(off || fails);
            if (off) continue;
            // Bare whatever the gate says later (a refund, the switch back): nothing loads, the band never comes back.
            noAds(s, false);
            remote.banner = true;
            s.clock.advance(WINDOW + 1_000);
            await flow.modalClosed('settings');
            await s.clock.advanceAsync(3 * WINDOW);
            await drain();
            expect([shows(s), s.reserved()], what).toEqual([1, fails]);
          }
        }
      }
    }
  });

  it("R4-3: the victory whose gate says no while the board's banner may still be up (the switch's hide failed) keeps the board's band, bare; once a hide went through, a victory gives it back at its screenShown", async () => {
    for (const fails of [true, false]) {
      const s = setup();
      const st = sdk(s);
      const { flow, remote } = withRemote(s);
      on(s, 'game');
      await flow.screenShown('game'); // the board's banner, in its band
      st.hideFails = fails;
      remote.banner = false;
      await flow.switchesChanged(); // the game screen keeps its band (never mid-level); the SDK hide fails
      expect([s.log, s.reserved()]).toEqual([['banner:show:bottom', 'banner:hide'], true]);
      s.clock.advance(WINDOW + 1_000);
      on(s, 'victory');
      const mount = flow.screenShown('victory'); // before the victory's props are built
      expect(s.reserved(), `fails ${fails}`).toBe(fails);
      await mount;
      expect(s.reserved(), `fails ${fails}`).toBe(fails);
      await flow.modalClosed('ranking');
      await s.clock.advanceAsync(3 * WINDOW);
      await drain();
      expect([shows(s), s.reserved()], `fails ${fails}`).toEqual([1, fails]);
    }
  });

  it("R4-1: the adapter latched banners off (its banner getter gone): the victory gives back the band the board left at its screenShown and loads nothing; Home on show gives its band back at the next attempt (a modal's close); off: the band stays", async () => {
    for (const off of [false, true]) {
      const s = setup(off ? { config: OFF } : {});
      on(s, 'game');
      await s.flow.screenShown('game'); // the board's banner, in its band
      await s.flow.hide(); // the ranking panel; the adapter latches off ('unsupported'): no banner API from now on
      delete s.platform.ads.banner;
      s.clock.advance(WINDOW + 1_000);
      on(s, 'victory');
      const mount = s.flow.screenShown('victory');
      expect(s.reserved(), `off ${off}`).toBe(off); // on: given back before the victory's props are built
      await mount;
      await s.flow.modalClosed('ranking');
      await s.clock.advanceAsync(3 * WINDOW);
      await drain();
      expect([shows(s), s.reserved()], `off ${off}`).toEqual([1, off]);

      const h = setup(off ? { config: OFF } : {});
      on(h, 'home');
      await h.flow.screenShown('home');
      await h.flow.hide(); // Settings
      delete h.platform.ads.banner;
      const seen = flips(h);
      h.clock.advance(WINDOW + 1_000);
      await h.flow.modalClosed('settings');
      expect(seen, `off ${off}`).toEqual(off ? [] : [false]); // on: the band (which can never fill) given back in view
      // Bare from then on: the API back (it never comes back in a session; still) loads nothing on this mount.
      h.platform.ads.banner = { show: async () => (h.log.push('banner:show:bottom'), { ok: true }), hide: async () => void h.log.push('banner:hide') };
      await h.flow.hide();
      h.clock.advance(WINDOW + 1_000);
      await h.flow.modalClosed('settings');
      expect(shows(h), `off ${off}`).toBe(off ? 2 : 1);
    }
  });

  it('R4-6: a victory opened inside the window with nothing up (not starved) reserves its band at open and loads nothing until the window ends, then exactly once, into that band', async () => {
    const s = setup();
    on(s, 'game');
    await s.flow.screenShown('game'); // the board's load (ok) starts the window
    s.clock.advance(10_000);
    await s.flow.hide(); // the ranking panel over the won board
    on(s, 'victory');
    const seen = flips(s);
    void s.flow.screenShown('victory'); // before the victory's props are built (session.openVictory)
    expect(s.reserved()).toBe(true);
    const fade = cfg.fx.overlayFadeMs;
    await s.clock.advanceAsync(fade); // the crossfade (session victoryCrossfadeMs)
    expect(shows(s)).toBe(1);
    await s.flow.modalClosed('ranking'); // the panel's close, inside the window: the same one timer
    await s.clock.advanceAsync(WINDOW - 10_000 - fade - 1);
    await drain();
    expect([shows(s), s.flow.showing(), s.reserved()]).toEqual([1, false, true]); // nothing inside Meta's window
    await s.clock.advanceAsync(1);
    await drain();
    expect([shows(s), s.flow.showing(), s.reserved()]).toEqual([2, true, true]); // the one timer, at the window's end
    await s.clock.advanceAsync(5 * WINDOW);
    await drain();
    expect(shows(s)).toBe(2); // exactly once
    expect(seen).toEqual([]); // the band was there all along (reserved at open, never flipped)
  });

  // D-2e-25 review round 5 (2026-10-15).
  it("round 5: banners latched off while a banner the SDK would not hide is on screen (hideBannerAdAsync answered unsupported): the band stays under it (mayBeUp asked of the last adapter seen); a hide that went through first: given back as in R4-1", async () => {
    for (const fails of [true, false]) {
      const s = setup();
      const st = sdk(s);
      on(s, 'home');
      await s.flow.screenShown('home');
      st.hideFails = fails;
      await s.flow.hide(); // Settings: the SDK hide answers unsupported (the banner stays), the adapter latches off
      const b = s.platform.ads.banner;
      delete s.platform.ads.banner; // its getter is gone (fb/index.ts bannerOff)
      expect(b).toBeDefined();
      s.clock.advance(WINDOW + 1_000);
      await s.flow.modalClosed('settings');
      expect(s.reserved(), `fails ${fails}`).toBe(fails);
      expect(shows(s)).toBe(1);
    }
  });

  it("round 5: the board's banner the flow still counts (its hide could not reach an adapter latched off meanwhile): the victory keeps the board's band at its screenShown and after", async () => {
    const s = setup();
    on(s, 'game');
    await s.flow.screenShown('game'); // the board's banner, in its band (shown)
    delete s.platform.ads.banner; // the adapter latched off with no hide in between: the flow still counts it
    s.clock.advance(WINDOW + 1_000);
    on(s, 'victory');
    const mount = s.flow.screenShown('victory');
    expect(s.reserved()).toBe(true);
    await mount;
    await drain();
    expect([s.reserved(), shows(s)]).toEqual([true, 1]);
  });

  it('round 5: once a banner hide failed and nothing counts it, every later app hide reaches the adapter again while it says a banner may be up (one more bounded round each); none when nothing may be up; off: as before', async () => {
    for (const off of [false, true]) {
      const s = setup(off ? { config: OFF } : {});
      const st = sdk(s);
      on(s, 'home');
      await s.flow.screenShown('home');
      st.hideFails = true;
      await s.flow.hide(); // fails: the banner may still be up, nobody counts it
      await s.flow.hide(); // Settings over the next screen, the hint, an ad's beforeShow …
      const hides = (): number => s.log.filter((l) => l === 'banner:hide').length;
      expect(hides(), `off ${off}`).toBe(off ? 1 : 2);
      st.hideFails = false;
      await s.flow.hide(); // goes through: down
      await s.flow.hide(); // nothing may be up any more: no adapter call
      expect(hides(), `off ${off}`).toBe(off ? 1 : 3);
    }
  });

  it("round 5: Home shown inside the window while the board's banner hide is still in flight shows bare (no flash of a band); a hide that then fails puts the band under the banner the SDK still shows, one that goes through leaves Home bare; nothing loads", async () => {
    for (const fails of [true, false]) {
      const s = setup();
      const st = sdk(s);
      let answer: ((ok: boolean) => void) | null = null;
      const b = s.platform.ads.banner;
      if (!b) throw new Error('no banner API');
      on(s, 'home');
      await s.flow.screenShown('home'); // L1: ok
      s.flow.screenGone();
      on(s, 'game');
      await s.flow.screenShown('game'); // the board, banner to banner (kept, inside the window)
      b.hide = () =>
        new Promise<void>((resolve) => {
          s.log.push('banner:hide');
          answer = (ok) => {
            if (ok) st.up = false;
            resolve();
          };
        });
      s.clock.advance(10_000); // O4's Home, inside the window
      const seen = flips(s);
      const hiding = s.flow.hide(); // shell.showHome: hide() …
      s.flow.screenGone(); // … the router's swap …
      on(s, 'home');
      await s.flow.screenShown('home'); // … and Home's screenShown, in the same task
      expect([s.reserved(), shows(s)], `fails ${fails}`).toEqual([false, 1]); // bare at its first frame
      (answer as ((ok: boolean) => void) | null)?.(!fails);
      await hiding;
      await drain();
      expect(s.reserved(), `fails ${fails}`).toBe(fails);
      expect(seen, `fails ${fails}`).toEqual(fails ? [false, true] : [false]);
      s.clock.advance(WINDOW + 1_000);
      await s.flow.modalClosed('settings');
      await drain();
      expect(shows(s), `fails ${fails}`).toBe(1); // bare: nothing loads on this mount
    }
  });
  it("round 5: a Home mount the gate refuses (the remote switch turned off on the board) while the board's banner the SDK would not hide is still up: bare at its first frame, then the band under that banner once Home's own hide failed too; a hide that went through: bare", async () => {
    for (const fails of [true, false]) {
      const s = setup();
      const st = sdk(s);
      const { flow, remote } = withRemote(s);
      on(s, 'game');
      await flow.screenShown('game'); // the board's banner, in its band
      st.hideFails = true;
      remote.banner = false;
      await flow.switchesChanged(); // its hide fails: the banner may still be up, the board keeps its band
      st.hideFails = fails;
      flow.screenGone();
      on(s, 'home');
      const mount = flow.screenShown('home'); // the gate says no: refused at the mount
      expect(s.reserved(), `fails ${fails}`).toBe(false); // bare at its first frame (the reserve went with the board)
      await mount;
      await drain();
      expect(s.reserved(), `fails ${fails}`).toBe(fails); // the band under a banner the SDK still shows
      expect(shows(s)).toBe(1);
    }
  });
  it("final review: a load that answered 'timeout' and then latched banners off (nothing ever landed) does not count as a banner up: the next victory and Home give their band back", async () => {
    const s = setup({ results: [{ ok: false, reason: 'timeout' }] });
    on(s, 'home');
    await s.flow.screenShown('home'); // 'timeout': pending (maybe up), the band reserved
    expect(s.reserved()).toBe(true);
    s.flow.screenGone();
    delete s.platform.ads.banner; // the load then answered 'unsupported': the adapter latched, its getter gone
    on(s, 'victory');
    const mount = s.flow.screenShown('victory');
    expect(s.reserved()).toBe(false);
    await mount;
    await drain();
    expect(s.reserved()).toBe(false);
    s.flow.screenGone();
    on(s, 'home');
    await s.flow.screenShown('home');
    await drain();
    expect([s.reserved(), shows(s)]).toEqual([false, 1]);
  });

  it("final review: banners latched off while a banner the SDK would not hide is on screen: the board mounts with a band under it (bandAtMount), and without one once it is down; off: eligible() as before", async () => {
    for (const off of [false, true]) {
      const s = setup(off ? { config: OFF } : {});
      const st = sdk(s);
      on(s, 'home');
      await s.flow.screenShown('home');
      st.hideFails = true;
      await s.flow.hide(); // its SDK hide answers unsupported: the banner stays, the adapter latches
      delete s.platform.ads.banner;
      expect(s.flow.bandAtMount(), `off ${off}`).toBe(!off);
      st.up = false;
      expect(s.flow.bandAtMount(), `off ${off}`).toBe(false);
    }
  });
});

describe('banners in the session (§3.2)', () => {
  function bannerHarness(config?: DeepPartial<GameConfig>) {
    let flow: ReturnType<typeof createBannerFlow> | null = null;
    const h = createHarness({
      save: veteran,
      caps: { banner: true },
      ...(config ? { config } : {}),
      extra: (p) => {
        p.platform.ads.banner = {
          show: async () => (p.log.push('banner:show'), { ok: true }),
          hide: async () => void p.log.push('banner:hide'),
        };
        flow = createBannerFlow({ platform: p.platform, store: p.store, clock: p.clock, config: p.config });
        return { banners: flow };
      },
    });
    return { h, flow: flow as unknown as ReturnType<typeof createBannerFlow> };
  }

  it('duringPlay off (the 2b rule): never on the game screen; the victory shows one in its reserved band; the next board hides it first', async () => {
    const { h } = bannerHarness({ ads: { banner: { duringPlay: false } } });
    await startLevel(h, 15);
    expect(h.log.filter((l) => l === 'banner:show')).toEqual([]);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    expect(h.store.get().ui.bannerReserved).toBe(false); // not on the ranking panel
    await tapRanking(h);
    expect(h.router.props.victory?.bannerReserved).toBe(true);
    expect(h.log.filter((l) => l.startsWith('banner'))).toEqual(['banner:show']);
    h.log.length = 0;
    await h.session.onNext();
    const order = h.log.filter((l) => l.startsWith('banner') || l.startsWith('screen:'));
    expect(order[0]).toBe('banner:hide');
    expect(order).toContain('screen:game:L16');
    expect(h.store.get().ui.bannerReserved).toBe(false);
  });

  it('the first-run tutorial victory never shows a banner', async () => {
    const { h } = bannerHarness();
    h.store.update((s) => ({ ...s, save: { ...s.save, tutorialDone: false, progress: { level: 1, completed: 0, best: {} } } }));
    await h.session.start({ mode: 'tutorial', replay: false });
    expect(h.log).not.toContain('banner:show');
  });
});

// ─────────────────────────── phase 2d §1.16: the banner during play ───────────────────────────

describe('phase 2d §1.16: the banner on the game screen (ads.banner.duringPlay, D-2d-15)', () => {
  interface Play {
    readonly h: Harness;
    readonly flow: BannerFlow;
    readonly shell: Shell;
  }

  function play(opts: { config?: DeepPartial<GameConfig>; save?: (s: SaveData) => SaveData; caps?: Partial<FakePlatform['caps']> } = {}): Play {
    let flow: BannerFlow | null = null;
    let shell: Shell | null = null;
    const h = createHarness({
      save: opts.save ?? veteran,
      // No interstitials unless a test asks: the victory → next board path then has no ad (and no hide).
      caps: { banner: true, interstitial: false, ...opts.caps },
      ...(opts.config ? { config: opts.config } : {}),
      extra: (p) => {
        p.platform.ads.banner = {
          show: async () => (p.log.push('banner:show'), { ok: true }),
          hide: async () => void p.log.push('banner:hide'),
        };
        const f = createBannerFlow({ platform: p.platform, store: p.store, clock: p.clock, config: p.config });
        flow = f;
        // The boot wiring: no banner under an interstitial or a rewarded video (§3.2, also the mouse's).
        const adFlow = createAdFlow({
          platform: p.platform,
          clock: p.clock,
          bus: p.bus,
          config: p.config,
          setInputLocked: (on) => p.store.update((s) => ({ ...s, ui: { ...s.ui, adShowing: on } })),
          setMuted: () => undefined,
          beforeShow: () => f.hide(),
        });
        return { banners: f, adFlow, goHome: () => shell?.showHome(), openSettings: () => shell?.openSettings() };
      },
    });
    shell = createShell({
      store: h.store,
      bus: h.bus,
      clock: h.clock,
      router: h.router,
      platform: h.platform,
      saves: h.saves,
      session: () => h.session,
      audio: { setMuted: () => undefined },
      applyReducedMotion: () => false,
      version: 'test',
      banners: flow as unknown as BannerFlow,
      config: h.config,
    });
    return { h, flow: flow as unknown as BannerFlow, shell };
  }
  const banner = (h: Harness): string[] => h.log.filter((l) => l === 'banner:show' || l === 'banner:hide');
  const band = (h: Harness): boolean | undefined => h.router.game?.last.bannerBand;

  it('the band is reserved from the first frame; the banner shows when the board entry ends', async () => {
    const { h, flow } = play();
    await h.session.start({ mode: 'level', level: 15 });
    expect(h.store.get().session?.bannerBand).toBe(true);
    expect(band(h)).toBe(true); // the view the screen was built with
    expect(banner(h)).toEqual([]); // nothing loads during the entry
    await h.settle(h.config.fx.boardEntryMs);
    expect(banner(h)).toEqual(['banner:show']);
    expect(flow.showing()).toBe(true);
    expect(h.store.get().ui.bannerReserved).toBe(true);
  });

  it('no band and no banner: under 10 levels, the tutorial (first run and replay), No Ads, no capability, duringPlay off', async () => {
    const early = play({ save: (s) => ({ ...s, progress: { level: 9, completed: 8, best: {} } }) });
    await startLevel(early.h, 9);
    expect([band(early.h), banner(early.h)]).toEqual([false, []]);

    const replay = play();
    await replay.h.session.start({ mode: 'tutorial', replay: true });
    await replay.h.settle(replay.h.config.fx.boardEntryMs);
    expect([band(replay.h), banner(replay.h)]).toEqual([false, []]);

    const noAds = play({ save: (s) => ({ ...veteran(s), purchases: { noAds: true, tokens: [], pending: [] } }) });
    await startLevel(noAds.h, 15);
    expect([band(noAds.h), banner(noAds.h)]).toEqual([false, []]);

    const noCap = play({ caps: { banner: false } });
    await startLevel(noCap.h, 15);
    expect([band(noCap.h), banner(noCap.h)]).toEqual([false, []]);

    const off = play({ config: { ads: { banner: { duringPlay: false } } } });
    await startLevel(off.h, 15);
    expect([band(off.h), banner(off.h)]).toEqual([false, []]);
  });

  it('persistence: a banner up on the victory stays into the next board (no hide in between), its band reserved', async () => {
    const { h, flow } = play();
    await startLevel(h, 15);
    expect(banner(h)).toEqual(['banner:show']);
    h.clock.advance(61_000); // a minute of play: the victory may load again
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    // The ranking panel is a modal over the game: it hides the banner (§1.16 Hide).
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
    await tapRanking(h);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide', 'banner:show']); // the victory's banner
    h.log.length = 0;
    await h.session.onNext(); // no interstitial here (capability off): nothing hides the banner
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.log).toContain('screen:game:L16');
    expect(banner(h)).toEqual([]); // no hide, and no reload inside the 60 s window
    expect(flow.showing()).toBe(true);
    expect(band(h)).toBe(true);
    expect(h.store.get().ui.bannerReserved).toBe(true);
  });

  it('an interstitial between the victory and the next board hides the banner first (no banner under an ad)', async () => {
    const { h } = play({ caps: { interstitial: true } });
    await startLevel(h, 15);
    h.clock.advance(61_000);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    h.log.length = 0;
    await h.session.onNext();
    const order = h.log.filter((l) => l.startsWith('banner') || l.startsWith('ad:interstitial'));
    expect(order.slice(0, 2)).toEqual(['banner:hide', 'ad:interstitial:next_level']);
  });

  it('reshowAfterAnyHide off (the 2d.1 rule): the modals hide it (Settings, How to play, the shop, the hub, the ranking panel); closing does not re-show it; the next board after the window does', async () => {
    const { h, shell } = play({ config: { ads: { banner: { reshowAfterAnyHide: false } } } });
    await startLevel(h, 15);
    h.router.game?.cb.onSettings(); // the game's gear → Settings
    await h.settle(0);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
    h.router.close('settings');
    h.clock.advance(61_000);
    shell.openHowToPlay();
    await h.settle(0);
    h.router.close('how_to_play');
    await h.settle(0);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']); // never re-shown on this screen
    for (const id of ['shop', 'ladder'] as const) {
      h.router.open(id, {} as never);
      h.router.close(id);
    }
    await h.settle(0);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
    h.session.onHome();
    await h.settle(0);
    h.log.length = 0;
    h.clock.advance(61_000);
    await startLevel(h, 15);
    expect(banner(h)).toContain('banner:show');
  });

  it('O4, O2 and the coach keep it; the mouse\'s video hides it first (2d.1: the hint card hides it, see below)', async () => {
    const { h } = play();
    await startLevel(h, 15);
    h.router.rewardedAnswer = 'decline';
    await h.session.onMouse(); // O2 opens and closes ("Not now"): nothing to wait for
    expect(banner(h)).toEqual(['banner:show']);
    h.router.open('coach', {} as never);
    h.router.close('coach');
    expect(banner(h)).toEqual(['banner:show']);
    h.router.rewardedAnswer = 'accept';
    h.log.length = 0;
    let ran = false;
    const run = h.session.onMouse().then(() => void (ran = true));
    for (let i = 0; i < 80 && !ran; i++) await h.settle(i < 40 ? 0 : 100); // O2, the video, then the mouse's run (2d.1 §1.2)
    await run;
    expect(h.log.filter((l) => l.startsWith('banner') || l.startsWith('ad:rewarded') || l === 'open:rewarded')).toEqual([
      'open:rewarded',
      'banner:hide',
      'ad:rewarded:mouse',
    ]);
    // O4 keeps it (a results screen): a fresh banner after the window, then the loss.
    const { h: h2 } = play();
    await startLevel(h2, 15);
    await loseGame(h2);
    expect(h2.router.isOpen('fail')).toBe(true);
    expect(banner(h2)).toEqual(['banner:show']);
  });

  describe('phase 2d.1 §3.2 (D-2d1-13): hidden while the hint card is open, shown again after it', () => {
    /** The level entered at t0 (its banner loaded then); the bulb opens the hint at t0 + `afterMs`. */
    async function hintAt(afterMs: number, opts: Parameters<typeof play>[0] = {}) {
      const p = play(opts);
      await startLevel(p.h, 15);
      expect(banner(p.h)).toEqual(['banner:show']);
      await p.h.settle(afterMs);
      await p.h.session.onBulb();
      expect(p.h.router.isOpen('hint')).toBe(true);
      return p;
    }
    const WINDOW = cfg.ads.banner.minReloadSec * 1000;

    it('the hint hides it; closed inside the reload window: exactly one timer loads a new one when the window ends', async () => {
      const { h } = await hintAt(10_000);
      expect(cfg.ads.banner.hideDuringHint).toBe(true);
      expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
      await h.settle(5_000);
      h.session.onHintClose();
      await h.settle(0);
      expect(banner(h)).toEqual(['banner:show', 'banner:hide']); // not at once: inside Meta's window
      await h.settle(WINDOW - 15_000 - 1);
      expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
      await h.settle(1);
      expect(banner(h)).toEqual(['banner:show', 'banner:hide', 'banner:show']);
      await h.settle(5 * WINDOW);
      expect(banner(h)).toEqual(['banner:show', 'banner:hide', 'banner:show']); // one timer, no retry loop
      expect(h.store.get().ui.bannerReserved).toBe(true);
    });

    it('closed after the window (Apply too): a new banner at once', async () => {
      const { h } = await hintAt(WINDOW + 1_000);
      expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
      h.session.onHintApply();
      await h.settle(0);
      expect(h.router.isOpen('hint')).toBe(false);
      expect(banner(h)).toEqual(['banner:show', 'banner:hide', 'banner:show']);
    });

    it('the timer does nothing when the screen has gone, a modal is open or the board is won; a reopened hint replaces it', async () => {
      // Home before the window ends: Home's own mount is inside the window too; the timer adds nothing.
      const a = await hintAt(1_000);
      a.h.session.onHintClose();
      a.h.session.onHome();
      await a.h.settle(2 * WINDOW);
      expect(banner(a.h).filter((l) => l === 'banner:show')).toHaveLength(1);
      // Settings open when the window ends: nothing (and nothing later).
      const b = await hintAt(1_000);
      b.h.session.onHintClose();
      b.h.router.game?.cb.onSettings();
      await b.h.settle(2 * WINDOW);
      expect(banner(b.h).filter((l) => l === 'banner:show')).toHaveLength(1);
      // The board won before the window ends: nothing over the win flow.
      const c = await hintAt(1_000);
      c.h.session.onHintClose();
      winGame(c.h);
      await c.h.settle(WINDOW);
      expect(c.h.log.filter((l) => l === 'banner:show')).toHaveLength(1);
      // The hint reopened before the window ends: the first close's timer is gone; the second close sets one.
      const d = await hintAt(1_000);
      d.h.session.onHintClose();
      await d.h.settle(20_000);
      await d.h.session.onBulb(); // a free reopen on the same board
      expect(d.h.router.isOpen('hint')).toBe(true);
      await d.h.settle(WINDOW);
      expect(banner(d.h).filter((l) => l === 'banner:show')).toHaveLength(1); // nothing under the open hint
      d.h.session.onHintClose();
      await d.h.settle(0);
      expect(banner(d.h).filter((l) => l === 'banner:show')).toHaveLength(2); // the window had passed: at once
    });

    it('ads.banner.hideDuringHint off: the 2d rule (O1 keeps the banner, nothing re-shown)', async () => {
      const { h } = await hintAt(10_000, { config: { ads: { banner: { hideDuringHint: false } } } });
      expect(banner(h)).toEqual(['banner:show']);
      h.session.onHintClose();
      await h.settle(2 * WINDOW);
      expect(banner(h)).toEqual(['banner:show']);
    });

    it('no band on this board (under 10 levels): the hint changes nothing', async () => {
      const p = play({ save: (s) => ({ ...s, progress: { level: 6, completed: 5, best: {} } }) });
      await startLevel(p.h, 6);
      await p.h.session.onBulb();
      p.h.session.onHintClose();
      await p.h.settle(2 * WINDOW);
      expect(banner(p.h)).toEqual([]);
    });
  });

  it('leaving to Home or the event screen hides it', async () => {
    const { h } = play();
    await startLevel(h, 15);
    h.session.onHome();
    await h.settle(0);
    expect(h.router.screen()).toBe('home');
    expect(banner(h).slice(0, 2)).toEqual(['banner:show', 'banner:hide']);
  });

  it('No Ads bought mid-level: the band goes and the banner is hidden', async () => {
    const { h, flow } = play();
    await startLevel(h, 15);
    h.store.update((s) => ({ ...s, save: { ...s.save, purchases: { noAds: true, tokens: [], pending: [] } } }));
    await flow.entitlementChanged();
    expect(band(h)).toBe(false);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
  });

  it('FB2B-1 kept: a load still in flight when a modal opens is hidden as soon as it lands', async () => {
    const { h, flow, shell } = play();
    let release: (r: AdResult) => void = () => undefined;
    if (h.platform.ads.banner) h.platform.ads.banner.show = () => (h.log.push('banner:show'), new Promise((r) => (release = r)));
    await startLevel(h, 15);
    expect(banner(h)).toEqual(['banner:show']);
    shell.openSettings();
    await h.settle(0);
    release({ ok: true });
    await h.settle(0);
    expect(flow.showing()).toBe(false);
    expect(banner(h).filter((l) => l === 'banner:hide').length).toBeGreaterThanOrEqual(1);
  });

  it('a board that may not carry a banner hides one that is up before it mounts (the tutorial replay)', async () => {
    const { h } = play();
    await startLevel(h, 15);
    h.log.length = 0;
    await h.session.start({ mode: 'tutorial', replay: true });
    const order = h.log.filter((l) => l.startsWith('banner') || l.startsWith('screen:'));
    expect(order[0]).toBe('banner:hide');
    expect(band(h)).toBe(false);
  });
});

describe('phase 2d §5.3: the e2e-only ?bannerPlay=0 override (boot.ts)', () => {
  it('turns ads.banner.duringPlay off; anything else keeps the config', async () => {
    const { e2eBannerConfig } = await import('../../../src/app/boot');
    expect(e2eBannerConfig('?bannerPlay=0').ads.banner.duringPlay).toBe(false);
    expect(e2eBannerConfig('?ads=ok&bannerPlay=0').ads.banner.duringPlay).toBe(false);
    expect(e2eBannerConfig('?bannerPlay=1')).toBe(cfg);
    expect(e2eBannerConfig('')).toBe(cfg);
    // Only duringPlay changes.
    const off = e2eBannerConfig('?bannerPlay=0');
    expect(off.ads.banner.screens).toEqual(cfg.ads.banner.screens);
    expect(off.ads.banner.minReloadSec).toBe(cfg.ads.banner.minReloadSec);
  });
});
