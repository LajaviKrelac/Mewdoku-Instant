// Owner: platform
// The FBInstant test double itself (tests/fixtures/fbinstant-stub.js): global install, ?fbstub=
// presets, player data persisted across reloads, flush semantics, call recording.
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
});
