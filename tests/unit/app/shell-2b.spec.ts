// Owner: C. The shell's phase2b parts: the Home event card (tap → event screen, locked → toast,
// teaser → nothing), the event screen's Play / Top list / Home, the fish pill "+" (shop), the
// trophy (rankings hub with its tabs), the Settings rows (Language, Shop, Remove ads), and the banner
// rules on Home and the event screen (shown after mount, hidden under modals and before leaving).
import { afterEach, describe, expect, it } from 'vitest';
import { createBannerFlow } from '../../../src/app/banner-flow';
import { createEventFlow, bundledEventDefs, type EventsChunk } from '../../../src/app/event-flow';
import { setFlagOverrides } from '../../../src/app/flags';
import { createRankHubFlow } from '../../../src/app/rank-hub-flow';
import { createRankingFlow } from '../../../src/app/ranking-flow';
import { createShell, type Shell } from '../../../src/app/shell';
import { createShopFlow, type ShopFlow } from '../../../src/app/shop-flow';
import { eventEnd, eventStart, type EventDef } from '../../../src/game/events';
import type { SaveData } from '../../../src/game/types';
import type { ShopProps } from '../../../src/ui/overlays/shop-sheet';
import { createHarness, type Harness } from './harness';

const DEFS = bundledEventDefs();
const LANTERN = DEFS[0] as EventDef;
const H = 3_600_000;

afterEach(() => setFlagOverrides({}));

function setup(
  save: (s: SaveData) => SaveData = (s) => s,
  opts: { now?: number; locales?: boolean; chunk?: Partial<EventsChunk>; shop?: (real: ShopFlow) => ShopFlow } = {},
) {
  const h = createHarness({
    save: (s) => save({ ...s, progress: { level: 15, completed: 14, best: {} } }),
    extra: () => ({ events: { byId: (id) => DEFS.find((d) => d.id === id) ?? null } }),
  });
  h.clock.setNow(opts.now ?? eventStart(LANTERN) + H);
  h.platform.caps = { ...h.platform.caps, banner: true, leaderboards: true };
  h.platform.ads.banner = {
    show: async () => (h.log.push('banner:show'), { ok: true }),
    hide: async () => void h.log.push('banner:hide'),
  };
  const updateSave = (fn: (s: SaveData) => SaveData): void => h.store.update((st) => ({ ...st, save: fn(st.save) }));
  const events = createEventFlow({ store: h.store, defs: DEFS, now: () => h.clock.now(), loadChunk: async () => (opts.chunk ?? {}) as never });
  const banners = createBannerFlow({ platform: h.platform, store: h.store, clock: h.clock });
  const rankings = createRankingFlow({ platform: h.platform, clock: h.clock, bus: h.bus, save: () => h.save(), updateSave, touch: () => h.saves.touch() });
  const viewCtx = () => ({ now: h.clock.now(), capabilities: h.platform.caps, platformId: h.platform.id, events: DEFS });
  const rankHub = createRankHubFlow({ store: h.store, router: h.router, clock: h.clock, rankings, activeEvent: () => events.active(), viewCtx });
  const shop = createShopFlow({
    payments: () => undefined,
    capabilities: () => h.platform.caps,
    platformId: 'web',
    save: () => h.save(),
    updateSave,
    saves: h.saves,
    clock: h.clock,
    startedAt: h.clock.now(),
    playerId: () => null,
    overlay: {
      open: (p) => h.router.open('shop', p),
      update: (p) => h.router.update('shop', p),
      close: () => h.router.close('shop'),
      isOpen: () => h.router.isOpen('shop'),
    },
    toast: (m) => h.router.toast(m),
    log: () => undefined,
    changed: () => undefined,
  });
  const locales: string[] = [];
  const shell: Shell = createShell({
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
    events,
    shop: opts.shop ? opts.shop(shop) : shop,
    banners,
    rankHub,
    ...(opts.locales ? { applyLocale: (o: string) => void locales.push(o) } : {}),
  });
  return { h, shell, locales, banners };
}

async function flush(h: Harness): Promise<void> {
  await h.settle(0);
}

describe('shell: Home event card and the event screen (§4.4)', () => {
  it('an active card opens the event screen; Play starts the next puzzle; Home goes back', async () => {
    const { h, shell } = setup((s) => ({ ...s, events: { [LANTERN.id]: { solved: 4, ms: 9, lastAt: 1 } } }));
    shell.showHome();
    expect(h.router.homeView?.event).toMatchObject({ state: 'active', solved: 4 });
    h.router.homeCb?.onEvent();
    await flush(h);
    expect(h.router.screen()).toBe('event');
    expect(h.router.eventView).toMatchObject({ solved: 4, nextIndex: 4, total: 21 });
    expect(h.store.get().screen).toBe('event');
    h.router.eventCb?.onPlay();
    await flush(h);
    expect(h.store.get().session?.event).toEqual({ def: LANTERN, index: 4 });
    expect(h.router.screen()).toBe('game');
  });

  it('a locked card toasts "Opens after level 10"; a teaser does nothing', async () => {
    const locked = setup((s) => ({ ...s, progress: { level: 10, completed: 9, best: {} } }));
    locked.shell.showHome();
    expect(locked.h.router.homeView?.event?.state).toBe('locked');
    locked.h.router.homeCb?.onEvent();
    expect(locked.h.router.toasts).toEqual(['Opens after level 10']);
    expect(locked.h.router.screen()).toBe('home');
    const teaser = setup((s) => s, { now: eventStart(LANTERN) - 5 * H });
    teaser.shell.showHome();
    expect(teaser.h.router.homeView?.event?.state).toBe('teaser');
    teaser.h.router.homeCb?.onEvent();
    await flush(teaser.h);
    expect(teaser.h.router.screen()).toBe('home');
  });

  it("the card's art comes from the lazy events chunk once it has loaded (HomeEventCardView.art)", async () => {
    const art = (): HTMLElement => ({}) as HTMLElement;
    const { h, shell } = setup((s) => s, { chunk: { eventArt: art } });
    shell.showHome();
    expect(h.router.homeView?.event?.art ?? null).toBeNull(); // the chunk is still loading: no art yet
    await flush(h);
    expect(h.router.homeView?.event?.art).toBe(art);
  });

  it('after the end the card is gone and Home shows no event', () => {
    const { h, shell } = setup((s) => s, { now: eventEnd(LANTERN) + H });
    shell.showHome();
    expect(h.router.homeView?.event).toBeNull();
  });
});

describe('shell: banners on Home and the event screen (§3.2)', () => {
  it('Home shows a banner after mount; Settings hides it; closing within 60 s does not reload', async () => {
    const { h, shell } = setup();
    shell.showHome();
    await flush(h);
    expect(h.log.filter((l) => l.startsWith('banner'))).toEqual(['banner:show']);
    expect(h.router.homeView?.bannerReserved).toBe(true);
    shell.openSettings();
    await flush(h);
    h.router.close('settings');
    await flush(h);
    expect(h.log.filter((l) => l.startsWith('banner'))).toEqual(['banner:show', 'banner:hide']);
  });

  it('the event screen is a banner screen too (after the reload window)', async () => {
    const { h, shell } = setup();
    shell.showHome();
    await flush(h);
    h.clock.advance(61_000);
    await shell.showEvent(LANTERN);
    await flush(h);
    expect(h.log.filter((l) => l.startsWith('banner'))).toEqual(['banner:show', 'banner:hide', 'banner:show']);
    expect(h.store.get().ui.bannerReserved).toBe(true);
  });
});

describe('shell: the victory screen is a banner screen (reviews L2B-1, FB2B-2)', () => {
  const banner = (h: Harness): string[] => h.log.filter((l) => l.startsWith('banner'));

  it('the shop opened from the victory fish pill hides its banner; closing after the window shows one again', async () => {
    const { h, shell, banners } = setup();
    await banners.screenShown('victory');
    h.router.open('victory', {} as never);
    expect(banner(h)).toEqual(['banner:show']);
    shell.openShop(); // the victory pill's "+"
    await flush(h);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
    h.router.close('shop');
    await flush(h);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']); // inside the 60 s window: skipped
    shell.openSettings();
    await flush(h);
    h.clock.advance(61_000);
    h.router.close('settings');
    await flush(h);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide', 'banner:show']);
  });

  it('No Ads bought in that shop: closing it never brings a banner back', async () => {
    const { h, shell, banners } = setup();
    await banners.screenShown('victory');
    h.router.open('victory', {} as never);
    shell.openShop();
    await flush(h);
    h.store.update((st) => ({ ...st, save: { ...st.save, purchases: { noAds: true, tokens: [] } } }));
    h.clock.advance(61_000);
    h.router.close('shop');
    await flush(h);
    expect(banner(h)).toEqual(['banner:show', 'banner:hide']);
  });

  it('closing the ranking panel under a fresh victory never loads a second banner', async () => {
    const { h, banners } = setup();
    h.router.open('ranking', {} as never);
    const shown = banners.screenShown('victory'); // session.openVictory: screenShown, open victory, close ranking
    h.router.open('victory', {} as never);
    h.router.close('ranking');
    await shown;
    await flush(h);
    expect(banner(h)).toEqual(['banner:show']);
  });
});

describe('shell: an event that ended (review L2B-4, §4.4 "After the end")', () => {
  it('showEvent(def) after the end lands on Home without an error toast ("Back to event")', async () => {
    const { h, shell } = setup((s) => s, { now: eventEnd(LANTERN) + 60_000 });
    await shell.showEvent(LANTERN);
    await flush(h);
    expect(h.router.screen()).toBe('home');
    expect(h.router.eventView).toBeNull();
    expect(h.router.toasts).toEqual([]);
  });

  it("the event screen's Play after the end goes Home: no session start, no error toast", async () => {
    const { h, shell } = setup((s) => s, { now: eventEnd(LANTERN) - 60_000 });
    shell.showHome();
    h.router.homeCb?.onEvent();
    await flush(h);
    expect(h.router.screen()).toBe('event');
    h.clock.advance(120_000); // the screen stayed open across the end
    h.router.eventCb?.onPlay();
    await flush(h);
    expect(h.router.screen()).toBe('home');
    expect(h.store.get().session).toBeNull();
    expect(h.router.toasts).toEqual([]);
  });
});

describe('shell: shop, hub, settings rows (§5.5, §6.8, §8.5)', () => {
  it('the fish pill "+" opens the shop with the swaps (web: no Buy section)', () => {
    const { h, shell } = setup((s) => ({ ...s, wallet: { fish: 31, earned: 31 } }));
    shell.openShop();
    const p = h.router.props.shop as ShopProps;
    expect(p).toMatchObject({ fish: 31, hintPrice: 15, kittyPrice: 30, buy: { kind: 'hidden' } });
  });

  it('Settings: Shop always; Remove ads only with a ready Buy section; Language only with several locales', () => {
    const plain = setup();
    plain.shell.openSettings();
    const p = plain.h.router.props.settings;
    expect(typeof p?.onShop).toBe('function');
    expect(p?.onRemoveAds).toBeUndefined();
    const lang = setup((s) => s, { locales: true });
    lang.shell.openSettings();
    const lp = lang.h.router.props.settings;
    if (lp?.language) {
      expect(lp.language.current).toBe('auto');
      lp.language.onPick('de');
      expect(lang.h.save().settings.locale).toBe('de');
      expect(lang.locales).toEqual(['de']);
    }
  });

  it('Settings offers Remove ads only when the ready catalogue lists remove_ads (review FB2B-3)', () => {
    const ready = (ids: string[]) => (real: ShopFlow): ShopFlow => ({
      ...real,
      buyState: () => ({ kind: 'ready', products: ids.map((id) => ({ id: id as never, price: '$1', owned: false })) }),
    });
    const without = setup((s) => s, { shop: ready(['hints_15', 'fish_250']) });
    without.shell.openSettings();
    expect(without.h.router.props.settings?.onRemoveAds).toBeUndefined();
    const withIt = setup((s) => s, { shop: ready(['remove_ads', 'hints_15']) });
    withIt.shell.openSettings();
    expect(typeof withIt.h.router.props.settings?.onRemoveAds).toBe('function');
    const owned = setup((s) => ({ ...s, purchases: { noAds: true, tokens: [] } }), { shop: ready(['remove_ads']) });
    owned.shell.openSettings();
    expect(owned.h.router.props.settings?.onRemoveAds).toBeUndefined();
  });

  it('the trophy opens the rankings hub: Paw points, Today and Event tabs; the web shows my records', async () => {
    const { h, shell } = setup();
    shell.showHome();
    h.router.homeCb?.onTrophy();
    await flush(h);
    const p = h.router.props.rank_hub;
    expect(p?.tabs).toEqual(['points', 'daily', 'event']);
    expect(p?.list.kind).toBe('records');
    p?.onTab('event');
    await flush(h);
    const q = h.router.props.rank_hub;
    expect(q?.tab).toBe('event');
    if (q?.list.kind === 'records') expect(q.list.records.event).toEqual({ solved: 0, total: 21, totalMs: 0 });
    q?.onClose();
    expect(h.router.isOpen('rank_hub')).toBe(false);
  });

  it('the event Top list and the hub event tab never label the event total as "This puzzle" (review RANK-1)', async () => {
    const { h, shell } = setup((s) => ({ ...s, events: { [LANTERN.id]: { solved: 2, ms: 400_000, lastAt: 1 } } }));
    const hub = createRankHubFlow({
      store: h.store,
      router: h.router,
      clock: h.clock,
      rankings: createRankingFlow({ platform: h.platform, clock: h.clock, bus: h.bus, save: () => h.save(), updateSave: () => undefined, touch: () => undefined }),
      activeEvent: () => LANTERN,
      viewCtx: () => ({ now: h.clock.now(), capabilities: h.platform.caps, platformId: h.platform.id, events: DEFS }),
    });
    hub.openEventTopList(LANTERN);
    await flush(h);
    const list = h.router.props.ranking?.list;
    expect(list?.kind).toBe('records');
    if (list?.kind === 'records') {
      expect(list.records.thisMs).toBe(0);
      expect(list.records.event).toEqual({ solved: 2, total: 21, totalMs: 400_000 });
    }
    h.router.props.ranking?.onContinue();
    shell.showHome();
    h.router.homeCb?.onTrophy();
    await flush(h);
    h.router.props.rank_hub?.onTab('event');
    await flush(h);
    const tab = h.router.props.rank_hub?.list;
    expect(tab?.kind).toBe('records');
    if (tab?.kind === 'records') expect(tab.records.thisMs).toBe(0);
  });

  it('the fish pill "+" on Home opens the shop', () => {
    const { h, shell } = setup();
    shell.showHome();
    h.router.homeCb?.onShop();
    expect(h.router.isOpen('shop')).toBe(true);
  });

  it('the event screen top list opens the ranking panel for the event board, no tap gate', async () => {
    const { h } = setup();
    const hub = createRankHubFlow({
      store: h.store,
      router: h.router,
      clock: h.clock,
      rankings: createRankingFlow({ platform: h.platform, clock: h.clock, bus: h.bus, save: () => h.save(), updateSave: () => undefined, touch: () => undefined }),
      activeEvent: () => LANTERN,
      viewCtx: () => ({ now: h.clock.now(), capabilities: h.platform.caps, platformId: h.platform.id, events: DEFS }),
    });
    hub.openEventTopList(LANTERN);
    await flush(h);
    const p = h.router.props.ranking;
    expect(p).toMatchObject({ board: 'event', tapMinMs: 0, result: { kind: 'event', solved: 0, total: 21 } });
    expect(p?.list.kind).toBe('records');
    p?.onContinue();
    expect(h.router.isOpen('ranking')).toBe(false);
  });
});
