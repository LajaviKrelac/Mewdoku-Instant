// Owner: C. Banners (phase2b §3.2, §3.6): shown on Home, victory and event screens only, never on the
// game screen or the ranking panel; hidden before a new board, before ads and under modal overlays;
// skipped inside the 60 s reload window; `unsupported` latches them off; the reserve stays after a
// failed load; no banner at all when the adapter has no banner API (no hideBannerAdAsync).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.16, §5.1): with ads.banner.duringPlay the game screen is
// a banner screen: its band is decided at mount (eligible), the banner shows at the board entry's
// end, a banner up on the victory stays into the next board (no hide in between), the listed modals
// hide it without a re-show there, O4 / O1 / O2 / the coach keep it, ads hide it first, and
// duringPlay off restores every 2b case.
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

function setup(opts: { completed?: number; noAds?: boolean; banner?: boolean; results?: AdResult[] } = {}) {
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  const save: SaveData = {
    ...defaults(NOW),
    tutorialDone: true,
    progress: { level: (opts.completed ?? 14) + 1, completed: opts.completed ?? 14, best: {} },
    purchases: { noAds: opts.noAds ?? false, tokens: [] },
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
  const flow = createBannerFlow({ platform, store, clock });
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

  it('never before 10 completed levels, with No Ads, or on the first-run tutorial victory', async () => {
    const early = setup({ completed: 9 });
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

  it('skips a screen inside the 60 s reload window (no retry loop), shows again after it', async () => {
    const s = setup();
    await s.flow.screenShown('home');
    await s.flow.hide();
    s.flow.screenGone();
    s.clock.advance(59_000);
    await s.flow.screenShown('victory');
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
    expect(s.reserved()).toBe(false);
    s.flow.screenGone();
    s.clock.advance(1000);
    await s.flow.screenShown('home');
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide', 'banner:show:bottom']);
  });

  it('a failed load keeps the reserve until the screen unmounts; unsupported latches banners off', async () => {
    const s = setup({ results: [{ ok: false, reason: 'no_fill' }, { ok: false, reason: 'unsupported' }] });
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

  it('a show() that threw counts as maybe up; a definite failure (no fill) does not', async () => {
    const threw = setup();
    if (threw.platform.ads.banner) threw.platform.ads.banner.show = async () => Promise.reject(new Error('boom'));
    await threw.flow.screenShown('home');
    await threw.flow.hide();
    expect(threw.log).toEqual(['banner:hide']);
    const nofill = setup({ results: [{ ok: false, reason: 'no_fill' }] });
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

  it('entitlementChanged: No Ads now owned hides the banner on show (the reserve stays until unmount)', async () => {
    const s = setup();
    await s.flow.screenShown('home');
    await s.flow.entitlementChanged(); // something else changed (a hint pack): nothing to do
    expect(s.log).toEqual(['banner:show:bottom']);
    s.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: true, tokens: [] } } }));
    await s.flow.entitlementChanged();
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
    expect(s.flow.showing()).toBe(false);
    expect(s.reserved()).toBe(true);
    await s.flow.modalClosed(); // no reload: the gate now says no_ads
    s.clock.advance(61_000);
    await s.flow.modalClosed();
    expect(s.log).toEqual(['banner:show:bottom', 'banner:hide']);
  });

  it('entitlementChanged while the load is in flight: the adapter is told, so the late banner never shows', async () => {
    const s = setup();
    let release: (r: AdResult) => void = () => undefined;
    if (s.platform.ads.banner) s.platform.ads.banner.show = () => (s.log.push('banner:show:bottom'), new Promise((r) => (release = r)));
    const shown = s.flow.screenShown('home');
    s.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: true, tokens: [] } } }));
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
    expect(s.flow.eligible('game')).toBe(true); // inside the 60 s window: still eligible
    expect(s.flow.eligible('game', { firstRunTutorial: true })).toBe(false);
    expect(s.log).toEqual([]);
    expect(setup({ completed: 9 }).flow.eligible('game')).toBe(false);
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

    const noAds = play({ save: (s) => ({ ...veteran(s), purchases: { noAds: true, tokens: [] } }) });
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

  it('the modals hide it (Settings, How to play, the shop, the hub, the ranking panel); closing does not re-show it; the next board after the window does', async () => {
    const { h, shell } = play();
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
    for (const id of ['shop', 'rank_hub'] as const) {
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

  it('O4, the hint card, O2 and the coach keep it; the mouse\'s video hides it first', async () => {
    const { h } = play();
    await startLevel(h, 15);
    await h.session.onBulb(); // O1
    h.session.onHintClose();
    expect(banner(h)).toEqual(['banner:show']);
    h.router.rewardedAnswer = 'decline';
    await h.session.onMouse(); // O2 opens and closes ("Not now")
    expect(banner(h)).toEqual(['banner:show']);
    h.router.open('coach', {} as never);
    h.router.close('coach');
    expect(banner(h)).toEqual(['banner:show']);
    h.router.rewardedAnswer = 'accept';
    h.log.length = 0;
    await h.session.onMouse();
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
    h.store.update((s) => ({ ...s, save: { ...s.save, purchases: { noAds: true, tokens: [] } } }));
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
