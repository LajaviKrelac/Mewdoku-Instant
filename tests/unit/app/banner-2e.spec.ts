// Owner: G1 (Phase 2e). The banner during levels (docs/phase2e/spec.md §3.1, §3.5, §7.4; D-2e-8):
// ads.banner.reshowAfterAnyHide brings it back after EVERY hide on the game screen that carries the band:
// a modal's close (Settings), every interstitial or rewarded video (afterAd), every purchase dialog
// (afterPurchase), the hint card (as 2d.1), and the board's mount inside the window (one timer instead of a
// skip). At once when ads.banner.minReloadSec has passed since the last load, else ONE timer when it ends;
// one more load ads.banner.rateLimitedRetrySec after 'rate_limited' (once per hide); a new hide, Home or the
// win cancels the timer; never a loop. ads.banner.untilDate ends banners ('ended': no band, no load); the
// remote switches turn them off (switchesChanged hides one that is up); ad_banner once per load attempt.
// D-2e-25 (2026-10-14, ads.banner.collapseWhenEmpty): an empty answer on the board keeps its band for the rest of
// the level (never mid-level) and, after 'no_fill' / 'error', takes ONE more load when the window ends (once per
// mount; the first 'rate_limited' keeps its own retry); the next board mounts with no band and never loads until
// a banner loads again (the victory, Home); an empty answer on the open victory gives its band back at once.
import { describe, expect, it } from 'vitest';
import { createAdFlow } from '../../../src/app/ad-flow';
import { createBannerFlow, type BannerFlow } from '../../../src/app/banner-flow';
import { cfg, type DeepPartial, type GameConfig } from '../../../src/app/config';
import { createShell, type Shell } from '../../../src/app/shell';
import type { SaveData } from '../../../src/game/types';
import type { AdResult } from '../../../src/platform/types';
import { createHarness, startLevel, tapRanking, winGame, type FakePlatform, type Harness } from './harness';

const veteran = (s: SaveData): SaveData => ({ ...s, progress: { level: 15, completed: 14, best: {} }, stock: { hints: 0, kitties: 3 } });
const WINDOW = cfg.ads.banner.minReloadSec * 1000;

interface Play {
  readonly h: Harness;
  readonly flow: BannerFlow;
  readonly shell: Shell;
  /** The next banner.show() answers (default ok). */
  readonly answers: AdResult[];
  today: string;
  remote: { banner: boolean; bannerInPlay: boolean } | null;
}

function play(opts: { config?: DeepPartial<GameConfig>; caps?: Partial<FakePlatform['caps']> } = {}): Play {
  let flow: BannerFlow | null = null;
  let shell: Shell | null = null;
  const answers: AdResult[] = [];
  const state = { today: '2026-11-01', remote: null as Play['remote'] };
  const h = createHarness({
    save: veteran,
    caps: { banner: true, interstitial: false, ...opts.caps },
    ...(opts.config ? { config: opts.config } : {}),
    extra: (p) => {
      p.platform.ads.banner = {
        show: async () => (p.log.push('banner:show'), answers.shift() ?? { ok: true }),
        hide: async () => void p.log.push('banner:hide'),
      };
      const f = createBannerFlow({
        platform: p.platform,
        store: p.store,
        clock: p.clock,
        config: p.config,
        today: () => state.today,
        remote: () => state.remote ?? { banner: true, bannerInPlay: true },
        log: (e) => p.bus.emit('analytics', e),
      });
      flow = f;
      // The boot wiring: hidden before every ad, back after it (Phase 2e afterShow).
      const adFlow = createAdFlow({
        platform: p.platform,
        clock: p.clock,
        bus: p.bus,
        config: p.config,
        setInputLocked: (on) => p.store.update((s) => ({ ...s, ui: { ...s.ui, adShowing: on } })),
        setMuted: () => undefined,
        beforeShow: () => f.hide(),
        afterShow: (kind) => f.afterAd(kind),
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
  const out: Play = {
    h,
    flow: flow as unknown as BannerFlow,
    shell,
    answers,
    get today() {
      return state.today;
    },
    set today(v: string) {
      state.today = v;
    },
    get remote() {
      return state.remote;
    },
    set remote(v) {
      state.remote = v;
    },
  };
  return out;
}

const banner = (h: Harness): string[] => h.log.filter((l) => l === 'banner:show' || l === 'banner:hide');
const shows = (h: Harness): number => h.log.filter((l) => l === 'banner:show').length;
/** The band the game screen was last rendered with (GameView.bannerBand). */
const band = (h: Harness): boolean | undefined => h.router.game?.last.bannerBand;

describe('back after every hide (spec §3.1, GAP-B1)', () => {
  it('Settings over the board: hidden; closed inside the window → exactly one load when the window ends', async () => {
    const { h } = play();
    await startLevel(h, 15);
    expect(banner(h)).toEqual(['banner:show']);
    await h.settle(10_000);
    h.router.game?.cb.onSettings();
    await h.settle(0);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
    h.router.close('settings');
    await h.settle(0);
    expect(shows(h)).toBe(1);
    await h.settle(WINDOW - 10_000 - 1);
    expect(shows(h)).toBe(1);
    await h.settle(1);
    expect(shows(h)).toBe(2);
    await h.settle(5 * WINDOW);
    expect(shows(h)).toBe(2); // one timer, no loop
  });

  it("the close reported while the store still lists the modal (the app's bus order): still re-shown", async () => {
    const { h, flow } = play();
    await startLevel(h, 15);
    h.store.update((s) => ({ ...s, overlays: ['settings'] }));
    await flow.hide();
    await h.settle(WINDOW + 1);
    await flow.modalClosed('settings'); // 'settings' is still in st.overlays at this moment
    expect(banner(h)).toEqual(['banner:show', 'banner:hide', 'banner:show']);
    // Another modal still open: nothing.
    h.store.update((s) => ({ ...s, overlays: ['settings', 'how_to_play'] }));
    await flow.hide();
    await h.settle(WINDOW + 1);
    await flow.modalClosed('settings');
    expect(shows(h)).toBe(2);
  });

  it('the victory inside the window (the ranking panel hid the board\'s banner): one load when the window ends, never before', async () => {
    const { h } = play();
    await startLevel(h, 15);
    expect(shows(h)).toBe(1);
    await h.settle(10_000);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    expect(h.store.get().overlays).toContain('victory');
    expect(shows(h)).toBe(1); // inside the window: no load yet
    await h.settle(WINDOW - 10_000 - h.config.fx.winOverlayDelayMs - 5_000);
    expect(shows(h)).toBe(1);
    await h.settle(10_000);
    expect(shows(h)).toBe(2);
    await h.settle(5 * WINDOW);
    expect(shows(h)).toBe(2); // one timer
  });

  it('closed after the window: a new load at once', async () => {
    const { h } = play();
    await startLevel(h, 15);
    h.router.game?.cb.onSettings();
    await h.settle(WINDOW + 1);
    h.router.close('settings');
    await h.settle(0);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide', 'banner:show']);
  });

  it('after a rewarded video (the bulb at 0): hidden first, back when the window allows', async () => {
    const { h } = play();
    await startLevel(h, 15);
    await h.settle(WINDOW); // the window has passed by the time the video ends
    h.router.rewardedAnswer = 'accept';
    await h.session.onBulb();
    // The hint card is open now (it hides the banner too); its close brings it back.
    expect(h.log.filter((l) => l.startsWith('banner') || l.startsWith('ad:rewarded'))).toEqual(['banner:show', 'banner:hide', 'ad:rewarded:hint']);
    h.session.onHintClose();
    await h.settle(0);
    expect(shows(h)).toBe(2);
  });

  it('after a video that leaves the board free (the mouse): afterAd re-shows it', async () => {
    const { h } = play();
    await startLevel(h, 15);
    await h.settle(WINDOW);
    h.router.rewardedAnswer = 'accept';
    let ran = false;
    const run = h.session.onMouse().then(() => void (ran = true));
    for (let i = 0; i < 80 && !ran; i++) await h.settle(i < 40 ? 0 : 100);
    await run;
    const order = h.log.filter((l) => l.startsWith('banner') || l.startsWith('ad:rewarded'));
    expect(order.slice(0, 3)).toEqual(['banner:show', 'banner:hide', 'ad:rewarded:mouse']);
    expect(order[3]).toBe('banner:show');
  });

  it('afterAd / afterPurchase on the free board: once, through the same timer', async () => {
    const { h, flow } = play();
    await startLevel(h, 15);
    await flow.hide();
    flow.afterAd('interstitial');
    flow.afterPurchase();
    flow.afterAd('rewarded');
    await h.settle(0);
    expect(shows(h)).toBe(1);
    await h.settle(WINDOW);
    expect(shows(h)).toBe(2);
    await h.settle(3 * WINDOW);
    expect(shows(h)).toBe(2);
  });

  it('the timer is cancelled by a new hide, by Home, by the win', async () => {
    const a = play();
    await startLevel(a.h, 15);
    await a.flow.hide();
    await a.flow.reshowGame('modal');
    await a.flow.hide(); // a new hide (e.g. a modal) before the window ends
    await a.h.settle(2 * WINDOW);
    expect(shows(a.h)).toBe(1);

    const b = play();
    await startLevel(b.h, 15);
    await b.flow.hide();
    await b.flow.reshowGame('modal');
    b.h.session.onHome();
    await b.h.settle(0);
    const atHome = shows(b.h);
    await b.h.settle(2 * WINDOW);
    expect(shows(b.h)).toBe(atHome); // nothing on the game screen's timer

    const c = play();
    await startLevel(c.h, 15);
    await c.flow.hide();
    await c.flow.reshowGame('modal');
    winGame(c.h);
    await c.h.settle(WINDOW);
    expect(shows(c.h)).toBe(1);
  });

  it("the board's mount inside the window sets one timer (2d skipped the screen)", async () => {
    const { h } = play();
    await startLevel(h, 15);
    h.session.onHome();
    await h.settle(0);
    h.log.length = 0;
    await h.settle(5_000);
    await startLevel(h, 15);
    const atMount = shows(h);
    await h.settle(WINDOW);
    expect(shows(h)).toBe(atMount + 1);
  });

  it("'rate_limited': one more load rateLimitedRetrySec later, once per hide", async () => {
    const p = play();
    p.answers.push({ ok: false, reason: 'rate_limited' }, { ok: false, reason: 'rate_limited' });
    await startLevel(p.h, 15);
    expect(shows(p.h)).toBe(1);
    await p.h.settle(cfg.ads.banner.rateLimitedRetrySec * 1000 - 1);
    expect(shows(p.h)).toBe(1);
    await p.h.settle(1);
    expect(shows(p.h)).toBe(2);
    await p.h.settle(5 * WINDOW);
    expect(shows(p.h)).toBe(2); // the second rate_limited is not retried
  });

  it('reshowAfterAnyHide off keeps the 2d.1 rule (only the hint card re-shows)', async () => {
    const { h, flow } = play({ config: { ads: { banner: { reshowAfterAnyHide: false } } } });
    await startLevel(h, 15);
    await flow.hide();
    flow.afterAd('interstitial');
    flow.afterPurchase();
    await h.settle(2 * WINDOW);
    expect(shows(h)).toBe(1);
  });

  it('ad_banner {screen, result} once per load attempt', async () => {
    const p = play();
    p.answers.push({ ok: false, reason: 'no_fill' });
    await startLevel(p.h, 15);
    expect(p.h.analytics.filter((e) => e.name === 'ad_banner').map((e) => e.params)).toEqual([{ screen: 'game', result: 'no_fill' }]);
  });
});

describe('D-2e-25 (2026-10-14): the band after an empty answer (ads.banner.collapseWhenEmpty)', () => {
  const OFF: DeepPartial<GameConfig> = { ads: { banner: { collapseWhenEmpty: false } } };
  const reserved = (h: Harness): boolean => h.store.get().ui.bannerReserved;

  it("a miss on the board keeps its band (never mid-level); 'no_fill' takes exactly one more load when the window ends, a second miss none", async () => {
    const p = play();
    p.answers.push({ ok: false, reason: 'no_fill' }, { ok: false, reason: 'no_fill' });
    await startLevel(p.h, 15);
    expect(shows(p.h)).toBe(1);
    expect([band(p.h), reserved(p.h), p.h.store.get().session?.bannerBand]).toEqual([true, true, true]);
    await p.h.settle(WINDOW - 1);
    expect(shows(p.h)).toBe(1); // never inside Meta's window
    await p.h.settle(1);
    expect(shows(p.h)).toBe(2);
    await p.h.settle(5 * WINDOW);
    expect(shows(p.h)).toBe(2); // the second miss on this mount schedules nothing (never a loop)
    expect([band(p.h), reserved(p.h)]).toEqual([true, true]); // the band stays for the level
    expect(p.flow.bandAtMount()).toBe(false); // the next board will not reserve one
  });

  it("'error' takes the one retry too; the retry's success fills the band and ends the starve", async () => {
    const p = play();
    p.answers.push({ ok: false, reason: 'error' }, { ok: true });
    await startLevel(p.h, 15);
    expect(p.flow.bandAtMount()).toBe(false);
    await p.h.settle(WINDOW);
    expect(shows(p.h)).toBe(2);
    expect(p.flow.showing()).toBe(true);
    expect(p.flow.bandAtMount()).toBe(true);
  });

  it('other empty answers (not_ready, skipped) keep the band and take no retry; nor does a miss with reshowAfterAnyHide off', async () => {
    for (const reason of ['not_ready', 'skipped'] as const) {
      const p = play();
      p.answers.push({ ok: false, reason });
      await startLevel(p.h, 15);
      await p.h.settle(3 * WINDOW);
      expect(shows(p.h), reason).toBe(1);
      expect(reserved(p.h)).toBe(true);
      expect(p.flow.bandAtMount()).toBe(true); // not starved
    }
    const off = play({ config: { ads: { banner: { reshowAfterAnyHide: false } } } });
    off.answers.push({ ok: false, reason: 'no_fill' });
    await startLevel(off.h, 15);
    await off.h.settle(3 * WINDOW);
    expect(shows(off.h)).toBe(1);
    expect(reserved(off.h)).toBe(true);
  });

  it('the miss retry is cancelled by a hide (a modal over the board) or by Home', async () => {
    const a = play();
    a.answers.push({ ok: false, reason: 'no_fill' });
    await startLevel(a.h, 15);
    a.h.router.game?.cb.onSettings(); // a modal before the window ends: the retry is gone
    await a.h.settle(2 * WINDOW);
    expect(shows(a.h)).toBe(1);

    const b = play();
    b.answers.push({ ok: false, reason: 'no_fill' });
    await startLevel(b.h, 15);
    b.h.session.onHome();
    await b.h.settle(0);
    const atHome = shows(b.h);
    await b.h.settle(2 * WINDOW);
    expect(shows(b.h)).toBe(atHome); // nothing on the game screen's timer
  });

  it("the first 'rate_limited' on the board is still the one retry rateLimitedRetrySec later (not a miss); the second is a miss: band kept, no retry, not starved", async () => {
    const p = play();
    p.answers.push({ ok: false, reason: 'rate_limited' }, { ok: false, reason: 'rate_limited' });
    await startLevel(p.h, 15);
    await p.h.settle(cfg.ads.banner.rateLimitedRetrySec * 1000 - 1);
    expect(shows(p.h)).toBe(1);
    await p.h.settle(1);
    expect(shows(p.h)).toBe(2); // the 2e retry, not the window's end
    await p.h.settle(5 * WINDOW);
    expect(shows(p.h)).toBe(2);
    expect([band(p.h), reserved(p.h)]).toEqual([true, true]);
    expect(p.flow.bandAtMount()).toBe(true);
  });

  it('after a miss the next board mounts with no band and never calls the banner adapter (modals, ads, the hint, the window: nothing)', async () => {
    const p = play();
    p.answers.push({ ok: false, reason: 'no_fill' }, { ok: false, reason: 'no_fill' });
    await startLevel(p.h, 15);
    await p.h.settle(WINDOW); // the one retry: empty again
    expect(shows(p.h)).toBe(2);
    p.h.session.onHome(); // Home, inside the retry's window: no load there
    await p.h.settle(0);
    expect(shows(p.h)).toBe(2);
    p.h.log.length = 0;
    await startLevel(p.h, 16);
    expect(p.h.store.get().session?.bannerBand).toBe(false);
    expect(band(p.h)).toBe(false);
    expect(reserved(p.h)).toBe(false);
    p.h.router.game?.cb.onSettings();
    await p.h.settle(0);
    p.h.router.close('settings');
    p.flow.afterAd('interstitial');
    p.flow.afterPurchase();
    await p.h.settle(3 * WINDOW);
    expect(banner(p.h)).toEqual([]); // not even a hide: nothing was ever asked for on this board
    expect(band(p.h)).toBe(false);
  });

  it('a load that succeeds on the victory (or Home) gives the next board its band again', async () => {
    const p = play();
    p.answers.push({ ok: false, reason: 'no_fill' }, { ok: false, reason: 'no_fill' });
    await startLevel(p.h, 15);
    await p.h.settle(WINDOW); // the retry: empty again; starved
    expect(p.flow.bandAtMount()).toBe(false);
    p.h.clock.advance(WINDOW); // the victory may load again
    winGame(p.h);
    await p.h.settle(p.h.config.fx.winOverlayDelayMs);
    await tapRanking(p.h); // the window passed: the victory loads (ok)
    expect(shows(p.h)).toBe(3);
    expect(p.flow.showing()).toBe(true);
    expect(p.h.router.props.victory?.bannerReserved).toBe(true);
    p.h.log.length = 0;
    await p.h.session.onNext();
    await p.h.settle(p.h.config.fx.boardEntryMs);
    expect(p.h.log).toContain('screen:game:L16');
    expect(banner(p.h)).toEqual([]); // the victory's banner stays into the board (no hide, inside the window)
    expect([band(p.h), p.h.store.get().session?.bannerBand, reserved(p.h)]).toEqual([true, true, true]);

    // Home: a miss there, then a success after the window.
    const q = play();
    q.answers.push({ ok: false, reason: 'no_fill' }, { ok: true });
    q.shell.showHome();
    await q.h.settle(0);
    expect(reserved(q.h)).toBe(false); // Home gave its band back at once
    expect(q.flow.bandAtMount()).toBe(false);
    await q.h.settle(WINDOW);
    q.shell.showHome();
    await q.h.settle(0);
    expect(q.flow.showing()).toBe(true);
    expect(reserved(q.h)).toBe(true);
    await startLevel(q.h, 15);
    expect([band(q.h), q.h.store.get().session?.bannerBand]).toEqual([true, true]);
  });

  it('a miss on the open victory gives its band back at once (the victory re-renders); off: it keeps it', async () => {
    for (const off of [false, true]) {
      const p = play(off ? { config: OFF } : {});
      await startLevel(p.h, 15); // the board's banner (ok)
      p.h.clock.advance(WINDOW + 1_000); // the victory may load again
      p.answers.push({ ok: false, reason: 'no_fill' });
      winGame(p.h);
      await p.h.settle(p.h.config.fx.winOverlayDelayMs);
      await tapRanking(p.h);
      expect(shows(p.h)).toBe(2);
      expect(p.h.router.isOpen('victory')).toBe(true);
      expect(reserved(p.h), `off ${off}`).toBe(off);
      expect(p.h.router.props.victory?.bannerReserved, `off ${off}`).toBe(off);
      p.h.log.length = 0;
      await p.h.session.onNext();
      await p.h.settle(p.h.config.fx.boardEntryMs);
      // On: the next board has no band and loads nothing. Off: the 2e rule (band; a load, at once after the window).
      expect([band(p.h), p.h.store.get().session?.bannerBand], `off ${off}`).toEqual([off, off]);
      if (!off) expect(banner(p.h)).toEqual([]);
    }
  });
});

describe('end date and remote switches (spec §3.1, §7.4)', () => {
  it("from ads.banner.untilDate the gate answers 'ended': no band, no load (the day before still shows)", async () => {
    const before = play();
    before.today = '2027-03-30';
    await startLevel(before.h, 15);
    expect(shows(before.h)).toBe(1);
    const ended = play();
    ended.today = '2027-03-31';
    expect(ended.flow.eligible('game')).toBe(false);
    expect(ended.flow.eligible('home')).toBe(false);
    await startLevel(ended.h, 15);
    expect(ended.h.store.get().session?.bannerBand).toBe(false);
    expect(shows(ended.h)).toBe(0);
  });

  it('remote bannerInPlay off: none during levels (Home keeps its banner); banner off: none at all', async () => {
    const p = play();
    p.remote = { banner: true, bannerInPlay: false };
    expect(p.flow.eligible('game')).toBe(false);
    expect(p.flow.eligible('home')).toBe(true);
    p.remote = { banner: false, bannerInPlay: true };
    expect(p.flow.eligible('home')).toBe(false);
  });

  it('switchesChanged hides a banner the gate now refuses, at once', async () => {
    const p = play();
    await startLevel(p.h, 15);
    expect(p.flow.showing()).toBe(true);
    p.remote = { banner: true, bannerInPlay: false };
    await p.flow.switchesChanged();
    expect(banner(p.h)).toEqual(['banner:show', 'banner:hide']);
    expect(p.flow.showing()).toBe(false);
  });
});
