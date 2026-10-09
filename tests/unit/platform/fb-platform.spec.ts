// Owner: D (Phase 2b; was platform)
// FB adapter lifecycle and capabilities (05 §4, 04 §6.3): initializeAsync is the first SDK call,
// progress reaches 100 before startGameAsync, locale read after start, capabilities from
// getSupportedAPIs + placement IDs, onPause, haptics, player ID.
// Phase 2b: the banner capability and `ads.banner`, and the ranking / groups / payments facades over
// the lazy fb-social chunk (preloaded after start(), loaded on demand, retried after a failure).
import { describe, expect, it, vi } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createFbPlatform } from '../../../src/platform/fb';
import type { SocialModule } from '../../../src/platform/fb/fb-social-glue';
import type { SaveData } from '../../../src/game/types';
import { createStub, drain, MemoryStorage, track, type StubConfig } from './helpers';

const PLACEMENTS = { interstitial: 'int-1', rewarded: 'rew-1' };
const BOARDS_JSON = JSON.stringify({ paw_points: 'pp', daily_fastest: 'df' });

function setup(
  config: StubConfig = {},
  opts: {
    placements?: { interstitial: string; rewarded: string; banner?: string };
    nav?: Navigator;
    leaderboards?: string;
    loadSocial?: () => Promise<SocialModule>;
  } = {},
) {
  const clock = createFakeClock();
  const { sdk, control } = createStub(config, clock);
  const storage = new MemoryStorage();
  const platform = createFbPlatform({
    sdk,
    placements: opts.placements ?? PLACEMENTS,
    storage,
    timers: clock,
    leaderboards: opts.leaderboards ?? '',
    ...(opts.nav ? { nav: opts.nav } : {}),
    ...(opts.loadSocial ? { loadSocial: opts.loadSocial } : {}),
  });
  return { clock, control, platform, storage };
}

const noVibrate = {} as Navigator;

describe('createFbPlatform: lifecycle', () => {
  it('makes no SDK call before init, and initializeAsync is the first one', async () => {
    const { platform, control } = setup();
    platform.setLoadingProgress(10);
    platform.onPause(() => undefined);
    platform.analytics.log('level_start', { level: 1 });
    expect(platform.getLocale()).toBe('en_US');
    expect(platform.getPlayerId()).toBeNull();
    expect(control.calls).toHaveLength(0);

    await platform.init();
    expect(control.names().slice(0, 4)).toEqual(['initializeAsync', 'getSupportedAPIs', 'setLoadingProgress', 'onPause']);
    expect(control.calls.filter((c) => c.beforeInit).map((c) => c.name)).toEqual(['initializeAsync']);
    expect(control.find('setLoadingProgress')[0]?.args).toEqual([10]);
  });

  it('clamps and rounds progress, and reaches 100 before startGameAsync', async () => {
    const { platform, control } = setup();
    await platform.init();
    platform.setLoadingProgress(-5);
    platform.setLoadingProgress(42.6);
    platform.setLoadingProgress(250);
    platform.setLoadingProgress(Number.NaN);
    expect(control.state.progress).toEqual([0, 43, 100, 0]);
    await platform.start();
    const names = control.names();
    const lastProgress = names.lastIndexOf('setLoadingProgress');
    expect(lastProgress).toBeLessThan(names.indexOf('startGameAsync'));
    expect(control.state.progress[control.state.progress.length - 1]).toBe(100);
  });

  it('does not repeat progress 100 when the app already reported it', async () => {
    const { platform, control } = setup();
    await platform.init();
    platform.setLoadingProgress(100);
    await platform.start();
    expect(control.count('setLoadingProgress')).toBe(1);
  });

  it('start() initialises first if needed and runs once', async () => {
    const { platform, control } = setup();
    await Promise.all([platform.start(), platform.start()]);
    expect(control.count('initializeAsync')).toBe(1);
    expect(control.count('startGameAsync')).toBe(1);
    expect(control.names()[0]).toBe('initializeAsync');
  });

  it('reads the locale only after startGameAsync', async () => {
    const { platform, control } = setup({ locale: 'fr_FR' });
    await platform.init();
    expect(platform.getLocale()).toBe('en_US');
    expect(control.count('getLocale')).toBe(0);
    await platform.start();
    expect(platform.getLocale()).toBe('fr_FR');
  });

  it('returns the game-scoped player ID after init', async () => {
    const { platform } = setup({ playerId: 'p-42' });
    await platform.init();
    expect(platform.getPlayerId()).toBe('p-42');
  });

  it('registers onPause callbacks (queued before init) with the SDK', async () => {
    const { platform, control } = setup();
    const seen: string[] = [];
    platform.onPause(() => seen.push('early'));
    await platform.init();
    platform.onPause(() => seen.push('late'));
    control.pause();
    expect(seen).toEqual(['early', 'late']);
  });

  it('rejects init when the SDK global is missing', async () => {
    const platform = createFbPlatform({ placements: PLACEMENTS, storage: null, timers: createFakeClock() });
    await expect(platform.init()).rejects.toThrow(/FBInstant/);
  });

  it('a rejected startGameAsync can be retried: start() calls the SDK again (PLAT-8)', async () => {
    const { platform, control } = setup({ errors: { startGameAsync: ['INVALID_OPERATION'] } });
    await expect(platform.start()).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    expect(control.state.started).toBe(false);
    await platform.start();
    expect(control.count('startGameAsync')).toBe(2);
    expect(control.count('initializeAsync')).toBe(1); // a resolved init stays memoised
    expect(control.state.started).toBe(true);
    await platform.start(); // and so does a resolved start
    expect(control.count('startGameAsync')).toBe(2);
  });

  it('a rejected initializeAsync can be retried: init() calls the SDK again (PLAT-8)', async () => {
    const clock = createFakeClock();
    const { sdk, control } = createStub({}, clock);
    let fails = 1;
    const flaky = Object.assign(Object.create(sdk) as typeof sdk, {
      initializeAsync: () => (fails-- > 0 ? Promise.reject({ code: 'NETWORK_FAILURE', message: 'x' }) : sdk.initializeAsync()),
    });
    const platform = createFbPlatform({ sdk: flaky, placements: PLACEMENTS, storage: new MemoryStorage(), timers: clock });
    await expect(platform.init()).rejects.toMatchObject({ code: 'NETWORK_FAILURE' });
    await platform.init();
    expect(control.state.initialized).toBe(true);
    expect(platform.capabilities().cloudSave).toBe(true);
  });
});

describe('createFbPlatform: capabilities', () => {
  it('derives everything from getSupportedAPIs and the placement IDs', async () => {
    const { platform } = setup({}, { nav: noVibrate, placements: { ...PLACEMENTS, banner: 'ban-1' }, leaderboards: BOARDS_JSON });
    expect(platform.capabilities().rewarded).toBe(false); // nothing known before init
    expect(platform.capabilities().banner).toBe(false);
    expect(platform.capabilities().payments).toBe(false);
    await platform.init();
    expect(platform.capabilities()).toEqual({
      interstitial: true,
      rewarded: true,
      banner: true, // phase2b §3.2: both banner APIs + a placement id
      cloudSave: true,
      leaderboards: true, // phase2b §5.4: a leaderboard API + at least one board id
      share: false,
      payments: true, // phase2b §8.4: not iOS + payments.purchaseAsync
      haptics: true,
      overlayViews: true,
      groups: true,
    });
  });

  it('phase2b capabilities without their placement, boards or APIs', async () => {
    const plain = setup({}, { nav: noVibrate });
    await plain.platform.init();
    expect(plain.platform.capabilities()).toMatchObject({ banner: false, leaderboards: false }); // no placement, no boards
    const off = setup(
      { presets: ['no-banner-hide', 'lb-none', 'ios', 'no-overlay', 'no-tournament'] },
      { placements: { ...PLACEMENTS, banner: 'ban-1' }, leaderboards: BOARDS_JSON },
    );
    await off.platform.init();
    expect(off.platform.capabilities()).toMatchObject({ banner: false, leaderboards: false, payments: false, overlayViews: false, groups: false });
    expect(off.platform.ads.banner).toBeUndefined();
    expect(off.platform.payments).toBeUndefined();
    expect(off.platform.groups).toBeUndefined();
    expect(off.platform.ranking?.caps().api).toBe('none'); // ranking stays defined (§5.4)
  });

  it('an empty placement ID turns that ad capability off', async () => {
    const { platform, control } = setup({}, { placements: { interstitial: 'int-1', rewarded: '' } });
    await platform.init();
    expect(platform.capabilities().interstitial).toBe(true);
    expect(platform.capabilities().rewarded).toBe(false);
    await expect(platform.ads.showRewarded('hint')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(control.count('getRewardedVideoAsync')).toBe(0);
  });

  it('missing APIs turn ads, cloud save and haptics off', async () => {
    const { platform } = setup({ presets: ['no-ad-apis', 'no-cloud', 'no-haptics'] }, { nav: noVibrate });
    await platform.init();
    const caps = platform.capabilities();
    expect([caps.interstitial, caps.rewarded, caps.cloudSave, caps.haptics]).toEqual([false, false, false, false]);
  });

  it('falls back to navigator.vibrate for haptics when the SDK has none', async () => {
    const patterns: unknown[] = [];
    const nav = { vibrate: (p: unknown) => (patterns.push(p), true) } as unknown as Navigator;
    const { platform, control } = setup({ presets: ['no-haptics'] }, { nav });
    await platform.init();
    expect(platform.capabilities().haptics).toBe(true);
    platform.haptics.pulse([30, 40, 30]);
    expect(patterns).toEqual([[30, 40, 30]]);
    expect(control.count('performHapticFeedbackAsync')).toBe(0);
  });

  it('uses platform haptics when supported', async () => {
    const { platform, control } = setup({}, { nav: noVibrate });
    await platform.init();
    platform.haptics.pulse(14);
    expect(control.count('performHapticFeedbackAsync')).toBe(1);
  });
});

describe('createFbPlatform: storage and analytics wiring', () => {
  it("loads cloud + mirror and writes the mirror under the save key scoped to the player's ID", async () => {
    const { platform, storage, control } = setup({ data: { save: { v: 1, sessions: 3 } }, playerId: 'p-7' });
    await platform.init();
    const raw = await platform.storage.load();
    expect(raw.cloud).toEqual({ v: 1, sessions: 3 });
    await platform.storage.save({ v: 1, sessions: 4 } as unknown as SaveData, { cloud: 'flush' });
    expect(storage.getItem('mewdoku.save.v1:p-7')).toBe(JSON.stringify({ v: 1, sessions: 4 }));
    expect(storage.getItem('mewdoku.save.v1')).toBeNull(); // the unscoped key is not this player's mirror
    expect(control.count('player.flushDataAsync')).toBe(1);
    expect(platform.storage.status()).toBe('ok');
  });

  it('two FB accounts on one device never see or merge each other\'s mirror (PLAT-2)', async () => {
    const storage = new MemoryStorage();
    const session = async (playerId: string, cloud: Record<string, unknown> | null) => {
      const clock = createFakeClock();
      const { sdk, control } = createStub({ playerId, data: cloud }, clock);
      const platform = createFbPlatform({ sdk, placements: PLACEMENTS, storage, timers: clock });
      await platform.init();
      return { platform, control, raw: await platform.storage.load() };
    };
    const a = await session('player-A', { save: { v: 1, sessions: 40 } });
    await a.platform.storage.save({ v: 1, sessions: 41 } as unknown as SaveData, { cloud: 'now' });
    const b = await session('player-B', null);
    expect(b.raw).toEqual({ local: null, cloud: null, corrupt: false }); // a new player: nothing of A's
    await b.platform.storage.save({ v: 1, sessions: 1 } as unknown as SaveData, { cloud: 'now' });
    expect(b.control.playerData()).toEqual({ save: { v: 1, sessions: 1 } });
    const again = await session('player-A', { save: { v: 1, sessions: 41 } });
    expect(again.raw.local).toEqual({ v: 1, sessions: 41 }); // A's own mirror survived B's session
  });

  it('an unscoped mirror (earlier build, or a session without a player ID) is never adopted by a player', async () => {
    const storage = new MemoryStorage();
    storage.setItem('mewdoku.save.v1', JSON.stringify({ v: 1, sessions: 99 }));
    const { sdk } = createStub({ playerId: 'p-1', data: { save: { v: 1, sessions: 2 } } }, createFakeClock());
    const platform = createFbPlatform({ sdk, placements: PLACEMENTS, storage, timers: createFakeClock() });
    await platform.init();
    const raw = await platform.storage.load();
    expect(raw.local).toBeNull();
    expect(raw.cloud).toEqual({ v: 1, sessions: 2 });
  });

  it("a rewarded load that reports CLIENT_UNSUPPORTED_OPERATION turns the capability off for the session (PLAT-4)", async () => {
    const { platform, control } = setup({ ads: { rewarded: { load: 'CLIENT_UNSUPPORTED_OPERATION' } } });
    await platform.init();
    expect(platform.capabilities().rewarded).toBe(true);
    await expect(platform.ads.showRewarded('hint')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(platform.capabilities().rewarded).toBe(false); // → the app's 02 §13.3 free fallback
    expect(platform.capabilities().interstitial).toBe(true);
    const created = control.count('getRewardedVideoAsync');
    platform.ads.preload('rewarded');
    await expect(platform.ads.showRewarded('kitty')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(control.count('getRewardedVideoAsync')).toBe(created);
  });

  it('drops analytics before init and logs sanitised events after', async () => {
    const { platform, control } = setup();
    platform.analytics.log('level_start', { level: 1 });
    await platform.init();
    platform.analytics.log('level_start', { level: 2, size: 5 });
    expect(control.find('logEvent').map((c) => c.args)).toEqual([['level_start', null, { level: '2', size: '5' }]]);
  });
});

describe('createFbPlatform: phase2b banner', () => {
  it('ads.banner exists only after init, with both APIs and a placement; it loads at the bottom', async () => {
    const { platform, control } = setup({}, { placements: { ...PLACEMENTS, banner: 'ban-1' } });
    expect(platform.ads.banner).toBeUndefined();
    await platform.init();
    const banner = platform.ads.banner;
    expect(banner).toBeDefined();
    await expect(banner!.show('bottom')).resolves.toEqual({ ok: true });
    expect(control.find('loadBannerAdAsync')[0]?.args).toEqual(['ban-1', 'bottom']);
    await banner!.hide();
    expect(control.state.bannerVisible).toBe(false);
    expect(platform.ads.banner).toBe(banner); // one instance per session
  });

  it("an 'unsupported' banner call turns the capability off for the session", async () => {
    const { platform } = setup({ banner: { load: 'CLIENT_UNSUPPORTED_OPERATION' } }, { placements: { ...PLACEMENTS, banner: 'ban-1' } });
    await platform.init();
    expect(platform.capabilities().banner).toBe(true);
    await expect(platform.ads.banner!.show('bottom')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(platform.capabilities().banner).toBe(false);
    expect(platform.ads.banner).toBeUndefined();
    expect(platform.capabilities().interstitial).toBe(true); // other ads unaffected
  });
});

describe('createFbPlatform: phase2b social facades (lazy fb-social chunk)', () => {
  const realChunk = (): Promise<SocialModule> => import('../../../src/platform/fb/fb-social');

  it('the chunk is preloaded right after start(), never before; not at all when nothing needs it', async () => {
    let loads = 0;
    const { platform, control } = setup({}, { leaderboards: BOARDS_JSON, loadSocial: () => (loads++, realChunk()) });
    await platform.init();
    platform.capabilities();
    expect(loads).toBe(0);
    await platform.start();
    expect(loads).toBe(1);
    // The real payments provider registers onReady once the chunk is in.
    await vi.waitFor(() => expect(control.count('payments.onReady')).toBe(1));

    let idle = 0;
    const bare = setup({ presets: ['lb-none', 'no-overlay', 'no-tournament', 'no-payments'] }, { loadSocial: () => (idle++, realChunk()) });
    await bare.platform.start();
    expect(idle).toBe(0);
  });

  it('ranking works through the facade: submit, mine, top against the stub', async () => {
    const { platform, control } = setup({ playerId: 'me' }, { leaderboards: BOARDS_JSON, loadSocial: realChunk });
    await platform.start();
    const ranking = platform.ranking!;
    expect(ranking.caps()).toEqual({ api: 'classic', global: true, myRank: true, overlay: true, overlayInRect: false });
    await expect(ranking.submit('paw_points', 55)).resolves.toBe('ok');
    await expect(ranking.mine('paw_points')).resolves.toEqual({ rank: 1, score: 55, isMe: true });
    await expect(ranking.top('paw_points', 10)).resolves.toEqual([{ rank: 1, score: 55, isMe: true }]);
    expect(control.leaderboard('pp')).toEqual([expect.objectContaining({ playerId: 'me', score: 55 })]);
    // A board without an id never loads anything or reaches the SDK.
    await expect(ranking.submit('event_snow_paws_2026', 5)).resolves.toBe('unsupported');
  });

  it('the facade forwards the daily band filter (FB2B-4) and the missing-board latch (FB2B-6)', async () => {
    const day = (d: number, secs: number): number => d * 100_000 + (99_999 - secs);
    const { platform } = setup(
      { playerId: 'me', leaderboards: { names: ['pp'], entries: { df: [{ playerId: 'x', score: day(282, 1) }, { playerId: 'y', score: day(281, 9) }] } } },
      { leaderboards: BOARDS_JSON, loadSocial: realChunk },
    );
    await platform.start();
    const ranking = platform.ranking!;
    expect(ranking.supports?.('paw_points')).toBe(true);
    expect(ranking.supports?.('event_snow_paws_2026')).toBe(false); // no id in this build
    // daily_fastest is not in the dashboard (names: ['pp']): the read finds out, then supports() is false.
    expect(ranking.supports?.('daily_fastest')).toBe(true);
    await expect(ranking.top('daily_fastest', 10)).resolves.toEqual([]);
    expect(ranking.supports?.('daily_fastest')).toBe(false);
    const banded = setup(
      { playerId: 'me', leaderboards: { entries: { df: [{ playerId: 'x', score: day(282, 1) }, { playerId: 'y', score: day(281, 9) }] } } },
      { leaderboards: BOARDS_JSON, loadSocial: realChunk },
    );
    await banded.platform.start();
    const keep = (score: number): boolean => Math.floor(score / 100_000) === 281;
    await expect(banded.platform.ranking!.top('daily_fastest', 10, keep)).resolves.toEqual([{ rank: 1, score: day(281, 9), isMe: false }]);
  });

  it('NEZP: no rank of my own; the facade answers null for mine without loading', async () => {
    let loads = 0;
    const { platform } = setup({ presets: ['lb-nezp', 'no-overlay', 'no-tournament', 'no-payments'] }, { leaderboards: BOARDS_JSON, loadSocial: () => (loads++, realChunk()) });
    await platform.init();
    expect(platform.ranking!.caps()).toMatchObject({ api: 'nezp', myRank: false });
    await expect(platform.ranking!.mine('paw_points')).resolves.toBeNull();
    expect(loads).toBe(0);
  });

  it('a chunk that fails to load gives the fallbacks, and the next call loads again', async () => {
    let attempt = 0;
    const loadSocial = (): Promise<SocialModule> => (++attempt === 1 ? Promise.reject(new Error('chunk 404')) : realChunk());
    const { platform } = setup({ playerId: 'me' }, { leaderboards: BOARDS_JSON, loadSocial });
    await platform.init();
    await expect(platform.ranking!.top('paw_points', 10)).resolves.toEqual([]);
    await expect(platform.ranking!.submit('paw_points', 10)).resolves.toBe('ok');
    expect(attempt).toBe(2);
  });

  it('a chunk that never loads cannot hold the ranking panel: answers within rank.fetchTimeoutMs', async () => {
    const { platform, clock } = setup({}, { leaderboards: BOARDS_JSON, loadSocial: () => new Promise(() => undefined) });
    await platform.init();
    const top = track(platform.ranking!.top('paw_points', 10));
    const sub = track(platform.ranking!.submit('paw_points', 10));
    await clock.advanceAsync(cfg.rank.fetchTimeoutMs);
    await drain();
    expect(top.value).toEqual([]);
    expect(sub.value).toBe('error');
  });

  it('payments: onReady subscribers wait for the chunk, then for FB; ready() follows', async () => {
    const { platform, control } = setup({}, { loadSocial: realChunk });
    await platform.init();
    const payments = platform.payments!;
    const seen: string[] = [];
    payments.onReady(() => seen.push('ready'));
    expect(payments.ready()).toBe(false);
    await platform.start();
    await vi.waitFor(() => expect(seen).toEqual(['ready']));
    expect(payments.ready()).toBe(true);
    const r = await payments.purchase('fish_250', 'stub-player-1:n1');
    expect(r.ok).toBe(true);
    expect(control.purchases()).toHaveLength(1);
  });

  it('groups: create / current / post through the facade', async () => {
    const { platform, control, clock } = setup({}, { loadSocial: realChunk });
    await platform.start();
    const groups = platform.groups!;
    await expect(groups.current()).resolves.toBeNull();
    const made = await groups.create(clock.now() + 3_600_000, 'Group challenge');
    expect(made).toEqual({ id: 'tournament-1' });
    await expect(groups.current()).resolves.toMatchObject({ id: 'tournament-1' });
    await expect(groups.post(40)).resolves.toBe(true);
    expect(control.state.tournament?.score).toBe(40);
  });
});
