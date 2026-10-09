// Owner: D (Phase 2b; was platform); G3 (Phase 2c)
// The FBInstant test double itself (tests/fixtures/fbinstant-stub.js): global install, ?fbstub=
// presets, player data persisted across reloads, flush semantics, call recording.
// Phase 2c: the three-product catalogue (retired fish packs cannot be bought), the unconsumed
// shorthand and the 'unconsumed-fish-250' preset, and leaderboard rows seeded by period band.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FBInstantSDK } from '../../../src/platform/fb/fbinstant';
import { drain, MemoryStorage, type StubControl } from './helpers';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/fbinstant-stub.js'), 'utf8');

interface FakeWindow {
  FBInstant?: FBInstantSDK;
  __fbStub?: StubControl;
  __FB_STUB_CONFIG__?: unknown;
  sessionStorage?: Storage;
  location?: { search: string };
  setTimeout: (fn: () => void, ms: number) => number;
}

/** Evaluates the stub like a classic <script> in `win` (a "page load"). */
function load(win: FakeWindow): { sdk: FBInstantSDK; control: StubControl } {
  new Function('window', SRC)(win);
  if (!win.FBInstant || !win.__fbStub) throw new Error('stub not installed');
  return { sdk: win.FBInstant, control: win.__fbStub };
}

const realTimers = (fn: () => void, ms: number): number => setTimeout(fn, ms) as unknown as number;

describe('fbinstant-stub', () => {
  it('installs FBInstant and records calls in order, flagging those before init', async () => {
    const { sdk, control } = load({ setTimeout: realTimers });
    sdk.setLoadingProgress(5);
    await sdk.initializeAsync();
    sdk.setLoadingProgress(100);
    await sdk.startGameAsync();
    expect(control.names()).toEqual(['setLoadingProgress', 'initializeAsync', 'setLoadingProgress', 'startGameAsync']);
    expect(control.calls.map((c) => c.beforeInit)).toEqual([true, true, false, false]);
    expect(control.state.progress).toEqual([5, 100]);
    expect(sdk.getSupportedAPIs()).toContain('player.setDataAsync');
  });

  it('rejects startGameAsync before initializeAsync', async () => {
    const { sdk } = load({ setTimeout: realTimers });
    await expect(sdk.startGameAsync()).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  });

  it('reads presets from window.__FB_STUB_CONFIG__ and ?fbstub=', async () => {
    const { sdk } = load({
      setTimeout: realTimers,
      __FB_STUB_CONFIG__: { presets: ['no-cloud'] },
      location: { search: '?fbstub=no-fill,no-haptics' },
    });
    const apis = sdk.getSupportedAPIs();
    expect(apis).not.toContain('player.setDataAsync');
    expect(apis).not.toContain('performHapticFeedbackAsync');
    const ad = await sdk.getInterstitialAdAsync('int-1');
    await expect(ad.loadAsync()).rejects.toMatchObject({ code: 'ADS_NO_FILL' });
  });

  it('keeps player data across reloads through sessionStorage', async () => {
    const sessionStorage = new MemoryStorage();
    const first = load({ setTimeout: realTimers, sessionStorage, __FB_STUB_CONFIG__: { data: { save: { v: 1, n: 1 } } } });
    expect(await first.sdk.player.getDataAsync(['save', 'other'])).toEqual({ save: { v: 1, n: 1 } });
    await first.sdk.player.setDataAsync({ save: { v: 1, n: 2 } });
    const second = load({ setTimeout: realTimers, sessionStorage, __FB_STUB_CONFIG__: { data: { save: { v: 1, n: 1 } } } });
    expect(await second.sdk.player.getDataAsync(['save'])).toEqual({ save: { v: 1, n: 2 } });
  });

  it('rejects setDataAsync with PENDING_REQUEST while a flush is pending', async () => {
    const { sdk, control } = load({ setTimeout: realTimers, __FB_STUB_CONFIG__: { flushDelayMs: 20 } });
    const flush = sdk.player.flushDataAsync();
    await expect(sdk.player.setDataAsync({ save: 1 })).rejects.toMatchObject({ code: 'PENDING_REQUEST' });
    await flush;
    await expect(sdk.player.setDataAsync({ save: 1 })).resolves.toBeUndefined();
    expect(control.count('player.setDataAsync')).toBe(2);
  });

  it('ad instances: not loaded → ADS_NOT_LOADED, shown once, close → USER_INPUT', async () => {
    const { sdk, control } = load({ setTimeout: realTimers, __FB_STUB_CONFIG__: { presets: ['rewarded-close'] } });
    const ad = await sdk.getRewardedVideoAsync('rew-1');
    await expect(ad.showAsync()).rejects.toMatchObject({ code: 'ADS_NOT_LOADED' });
    control.configure({ ads: { rewarded: { showDelayMs: 0 } } });
    await ad.loadAsync();
    await expect(ad.showAsync()).rejects.toMatchObject({ code: 'USER_INPUT' });
    await expect(ad.showAsync()).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    await expect(sdk.getRewardedVideoAsync('')).rejects.toMatchObject({ code: 'INVALID_PARAM' });
    await drain(1);
  });

  it('fires onPause callbacks on demand', () => {
    const { sdk, control } = load({ setTimeout: realTimers });
    let paused = 0;
    sdk.onPause(() => paused++);
    control.pause();
    expect(paused).toBe(1);
  });

  // ── phase2b ──
  it('banner: load shows a bar, a load within 45 s rejects RATE_LIMITED, hide removes it', async () => {
    let t = 1_000_000;
    const win = { setTimeout: realTimers, __stubNow: () => t } as FakeWindow & { __stubNow: () => number };
    const { sdk, control } = load(win);
    await sdk.loadBannerAdAsync!('b', 'bottom');
    expect(control.state.bannerVisible).toBe(true);
    await sdk.hideBannerAdAsync!();
    expect(control.state.bannerVisible).toBe(false);
    t += 44_999;
    await expect(sdk.loadBannerAdAsync!('b', 'bottom')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    t += 1;
    await expect(sdk.loadBannerAdAsync!('b', 'bottom')).resolves.toBeUndefined();
  });

  it('leaderboards: classic by default, NEZP or none by preset; the API members follow getSupportedAPIs', () => {
    const classic = load({ setTimeout: realTimers }).sdk;
    expect(typeof classic.getLeaderboardAsync).toBe('function');
    expect(classic.globalLeaderboards).toBeUndefined();
    const nezp = load({ setTimeout: realTimers, __FB_STUB_CONFIG__: { presets: ['lb-nezp'] } }).sdk;
    expect(nezp.getLeaderboardAsync).toBeUndefined();
    expect(nezp.getSupportedAPIs()).toContain('globalLeaderboards.getTopEntriesAsync');
    const none = load({ setTimeout: realTimers, location: { search: '?fbstub=lb-none' } }).sdk;
    expect(none.getLeaderboardAsync).toBeUndefined();
    expect(none.globalLeaderboards).toBeUndefined();
  });

  it('payments: ready after start, purchase → unconsumed until consumed, persisted across reloads', async () => {
    const sessionStorage = new MemoryStorage();
    const first = load({ setTimeout: realTimers, sessionStorage });
    await first.sdk.initializeAsync();
    await first.sdk.startGameAsync();
    await new Promise<void>((r) => first.sdk.payments!.onReady(r));
    const p = await first.sdk.payments!.purchaseAsync({ productID: 'kitties_8', developerPayload: 'x' });
    const second = load({ setTimeout: realTimers, sessionStorage });
    expect((await second.sdk.payments!.getPurchasesAsync()).map((x) => x.purchaseToken)).toEqual([p.purchaseToken]);
    await second.sdk.payments!.consumePurchaseAsync(p.purchaseToken);
    expect(await second.sdk.payments!.getPurchasesAsync()).toEqual([]);
    const ios = load({ setTimeout: realTimers, __FB_STUB_CONFIG__: { presets: ['ios'] } }).sdk;
    expect(ios.payments).toBeUndefined();
  });

  // ── phase2c ──
  it('payments: the catalogue is the three products on sale; a retired fish pack cannot be bought', async () => {
    const { sdk } = load({ setTimeout: realTimers });
    await sdk.initializeAsync();
    await sdk.startGameAsync();
    await new Promise<void>((r) => sdk.payments!.onReady(r));
    expect((await sdk.payments!.getCatalogAsync()).map((p) => p.productID)).toEqual(['remove_ads', 'hints_15', 'kitties_8']);
    await expect(sdk.payments!.purchaseAsync({ productID: 'fish_250', developerPayload: 'x' })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
    await expect(sdk.payments!.purchaseAsync({ productID: 'fish_900', developerPayload: 'x' })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
  });

  it('payments: an unconsumed purchase given by productID alone is a full unconsumed charge; the preset seeds a fish_250', async () => {
    const t = Date.UTC(2026, 9, 9, 12, 0, 0);
    const win = { setTimeout: realTimers, __stubNow: () => t, __FB_STUB_CONFIG__: { payments: { unconsumed: [{ productID: 'fish_250' }, { productID: 'hints_15', purchaseToken: 'mine' }] } } };
    const { sdk } = load(win as FakeWindow);
    expect(await sdk.payments!.getPurchasesAsync()).toEqual([
      {
        productID: 'fish_250',
        purchaseToken: 'stub-unconsumed-1-fish_250',
        paymentID: 'stub-unconsumed-payment-1',
        purchaseTime: String(t / 1000 - 86_400),
        paymentActionType: 'charge',
        isConsumed: false,
      },
      expect.objectContaining({ productID: 'hints_15', purchaseToken: 'mine', isConsumed: false }),
    ]);
    const preset = load({ setTimeout: realTimers, location: { search: '?fbstub=unconsumed-fish-250' } }).sdk;
    expect((await preset.payments!.getPurchasesAsync()).map((p) => [p.productID, p.purchaseToken])).toEqual([['fish_250', 'stub-unconsumed-1-fish_250']]);
  });

  it('leaderboards: rows seeded by period band (absolute or relative to the stub clock); periodIndex follows periods.kind', async () => {
    const t = Date.UTC(2026, 9, 9, 12, 0, 0); // a Friday in UTC week 39 from 2026-01-05 (spec §3.5)
    const entries = {
      lb: [
        { playerId: 'ahead', period: 1, total: 2 },
        { playerId: 'now', period: 0, total: 7 },
        { playerId: 'abs', band: 12, total: 99_999 },
        { playerId: 'plain', score: 5 },
      ],
    };
    const weekWin = { setTimeout: realTimers, __stubNow: () => t, __FB_STUB_CONFIG__: { leaderboards: { entries } } };
    const week = load(weekWin as FakeWindow);
    expect(week.control.periodIndex()).toBe(39);
    expect(week.control.periodIndex(-1)).toBe(38);
    const lb = await week.sdk.getLeaderboardAsync!('lb');
    expect((await lb.getEntriesAsync(10, 0)).map((e) => [e.getScore(), e.getRank!()])).toEqual([
      [4_000_002, 1],
      [3_900_007, 2],
      [1_299_999, 3],
      [5, 4],
    ]);
    const dayWin = { setTimeout: realTimers, __stubNow: () => t, __FB_STUB_CONFIG__: { leaderboards: { periods: { kind: 'day' } } } };
    expect(load(dayWin as FakeWindow).control.periodIndex()).toBe(277);
    const monthWin = { setTimeout: realTimers, __stubNow: () => t, __FB_STUB_CONFIG__: { leaderboards: { periods: { kind: 'month' } } } };
    expect(load(monthWin as FakeWindow).control.periodIndex()).toBe(9);
    // A board seeded before the week turned: relative rows are fixed when the board is first read.
    let clock = Date.UTC(2026, 9, 11, 23, 59, 0); // Sunday, still week 39
    const turn = load({ setTimeout: realTimers, __stubNow: () => clock, __FB_STUB_CONFIG__: { leaderboards: { entries: { lb: [{ playerId: 'x', period: 0, total: 1 }] } } } } as FakeWindow);
    clock = Date.UTC(2026, 9, 12, 0, 0, 0); // Monday 00:00 UTC: week 40
    expect(turn.control.periodIndex()).toBe(40);
    expect(turn.control.leaderboard('lb')[0]?.score).toBe(4_000_001);
  });
});
