// Owner: platform
// FB adapter lifecycle and capabilities (05 §4, 04 §6.3): initializeAsync is the first SDK call,
// progress reaches 100 before startGameAsync, locale read after start, capabilities from
// getSupportedAPIs + placement IDs, onPause, haptics, player ID.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { createFbPlatform } from '../../../src/platform/fb';
import type { SaveDataV1 } from '../../../src/game/types';
import { createStub, MemoryStorage, type StubConfig } from './helpers';

const PLACEMENTS = { interstitial: 'int-1', rewarded: 'rew-1' };

function setup(config: StubConfig = {}, opts: { placements?: { interstitial: string; rewarded: string }; nav?: Navigator } = {}) {
  const clock = createFakeClock();
  const { sdk, control } = createStub(config, clock);
  const storage = new MemoryStorage();
  const platform = createFbPlatform({
    sdk,
    placements: opts.placements ?? PLACEMENTS,
    storage,
    timers: clock,
    ...(opts.nav ? { nav: opts.nav } : {}),
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
});

describe('createFbPlatform: capabilities', () => {
  it('derives everything from getSupportedAPIs and the placement IDs', async () => {
    const { platform } = setup({}, { nav: noVibrate });
    expect(platform.capabilities().rewarded).toBe(false); // nothing known before init
    await platform.init();
    expect(platform.capabilities()).toEqual({
      interstitial: true,
      rewarded: true,
      banner: false,
      cloudSave: true,
      leaderboards: false,
      share: false,
      payments: false,
      haptics: true,
    });
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
  it('loads cloud + mirror and writes the mirror under the save key', async () => {
    const { platform, storage, control } = setup({ data: { save: { v: 1, sessions: 3 } } });
    await platform.init();
    const raw = await platform.storage.load();
    expect(raw.cloud).toEqual({ v: 1, sessions: 3 });
    await platform.storage.save({ v: 1, sessions: 4 } as unknown as SaveDataV1, { cloud: 'flush' });
    expect(storage.getItem('mewdoku.save.v1')).toBe(JSON.stringify({ v: 1, sessions: 4 }));
    expect(control.count('player.flushDataAsync')).toBe(1);
    expect(platform.storage.status()).toBe('ok');
  });

  it('drops analytics before init and logs sanitised events after', async () => {
    const { platform, control } = setup();
    platform.analytics.log('level_start', { level: 1 });
    await platform.init();
    platform.analytics.log('level_start', { level: 2, size: 5 });
    expect(control.find('logEvent').map((c) => c.args)).toEqual([['level_start', null, { level: 2, size: 5 }]]);
  });
});
