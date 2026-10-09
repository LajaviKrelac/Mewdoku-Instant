// Owner: C. Banners (phase2b §3.2, §3.6): shown on Home, victory and event screens only, never on the
// game screen or the ranking panel; hidden before a new board, before ads and under modal overlays;
// skipped inside the 60 s reload window; `unsupported` latches them off; the reserve stays after a
// failed load; no banner at all when the adapter has no banner API (no hideBannerAdAsync).
import { describe, expect, it } from 'vitest';
import { createAdFlow } from '../../../src/app/ad-flow';
import { createBannerFlow } from '../../../src/app/banner-flow';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createEventBus, type AppEventMap } from '../../../src/app/events';
import { createStore, initialAppState, type AppState } from '../../../src/app/store';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import { createFbBanner } from '../../../src/platform/fb/fb-banner';
import type { AdResult } from '../../../src/platform/types';
import { createStub, drain } from '../platform/helpers';
import { createFakePlatform, createHarness, NOW, startLevel, winGame, type FakePlatform, tapRanking } from './harness';

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
    await s.flow.entitlementChanged(); // something else changed (a fish swap): nothing to do
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

  it('the game, ranking, boot and overlay screens never qualify', async () => {
    const s = setup();
    for (const screen of ['game', 'ranking', 'boot', 'overlay'] as const) {
      await s.flow.screenShown(screen as never);
    }
    expect(s.log).toEqual([]);
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
  function bannerHarness() {
    let flow: ReturnType<typeof createBannerFlow> | null = null;
    const h = createHarness({
      save: veteran,
      caps: { banner: true },
      extra: (p) => {
        p.platform.ads.banner = {
          show: async () => (p.log.push('banner:show'), { ok: true }),
          hide: async () => void p.log.push('banner:hide'),
        };
        flow = createBannerFlow({ platform: p.platform, store: p.store, clock: p.clock });
        return { banners: flow };
      },
    });
    return { h, flow: flow as unknown as ReturnType<typeof createBannerFlow> };
  }

  it('never on the game screen; the victory shows one in its reserved band; the next board hides it first', async () => {
    const { h } = bannerHarness();
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
