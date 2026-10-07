// Owner: platform
// fb-ads (05 §6, 04 §6.3): readiness timeout vs long show, error mapping, reload after every show or
// failure with a bounded backoff, empty placement → unsupported.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createFbAds, mapAdError } from '../../../src/platform/fb/fb-ads';
import { createStub, drain, track, type StubConfig } from './helpers';

const PLACEMENTS = { interstitial: 'int-1', rewarded: 'rew-1' };

function setup(config: StubConfig = {}, placements = PLACEMENTS) {
  const clock = createFakeClock();
  const { sdk, control } = createStub(config, clock);
  const ads = createFbAds(sdk, { placements, timers: clock });
  return { clock, sdk, control, ads };
}

describe('mapAdError', () => {
  const err = (code: string) => ({ code, message: code });
  it.each([
    ['ADS_NO_FILL', 'load', 'interstitial', 'no_fill'],
    ['ADS_FREQUENT_LOAD', 'load', 'rewarded', 'rate_limited'],
    ['RATE_LIMITED', 'show', 'interstitial', 'rate_limited'],
    ['ADS_NOT_LOADED', 'show', 'rewarded', 'not_ready'],
    ['CLIENT_UNSUPPORTED_OPERATION', 'load', 'rewarded', 'unsupported'],
    ['USER_INPUT', 'show', 'rewarded', 'skipped'],
    ['SOMETHING_NEW', 'show', 'rewarded', 'skipped'],
    ['NETWORK_FAILURE', 'show', 'rewarded', 'error'],
    ['USER_INPUT', 'show', 'interstitial', 'error'],
    ['NETWORK_FAILURE', 'load', 'rewarded', 'error'],
  ] as const)('%s during %s (%s) → %s', (code, phase, kind, expected) => {
    expect(mapAdError(err(code), phase, kind)).toBe(expected);
  });

  it('handles values without a code', () => {
    expect(mapAdError(new Error('x'), 'load', 'interstitial')).toBe('error');
    expect(mapAdError(undefined, 'show', 'rewarded')).toBe('skipped');
    expect(mapAdError('boom', 'show', 'interstitial')).toBe('error');
  });
});

describe('createFbAds', () => {
  it('an empty placement ID makes that kind unsupported without touching the SDK', async () => {
    const { ads, control } = setup({}, { interstitial: '', rewarded: 'rew-1' });
    ads.preload('interstitial');
    expect(ads.isReady('interstitial')).toBe(false);
    await expect(ads.showInterstitial('next_level')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(control.count('getInterstitialAdAsync')).toBe(0);
  });

  it('respects the supported() predicate (getSupportedAPIs)', async () => {
    const clock = createFakeClock();
    const { sdk, control } = createStub({}, clock);
    const ads = createFbAds(sdk, { placements: PLACEMENTS, timers: clock, supported: (k) => k === 'interstitial' });
    await expect(ads.showRewarded('hint')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(control.count('getRewardedVideoAsync')).toBe(0);
  });

  it('preloads one instance, shows it, then loads a fresh one', async () => {
    const { ads, clock, control } = setup({ ads: { interstitial: { showDelayMs: 500 } } });
    ads.preload('interstitial');
    ads.preload('interstitial'); // no second instance while one is loading
    await drain();
    expect(control.count('getInterstitialAdAsync')).toBe(1);
    expect(ads.isReady('interstitial')).toBe(true);

    const res = track(ads.showInterstitial('next_level'));
    await drain();
    expect(ads.isReady('interstitial')).toBe(false);
    await clock.advanceAsync(500);
    await drain();
    expect(res.done).toBe(true);
    expect(res.value).toEqual({ ok: true });
    expect(control.count('getInterstitialAdAsync')).toBe(2);
    expect(ads.isReady('interstitial')).toBe(true);
  });

  it('gives up with "timeout" when the ad is not ready within ads.readyTimeoutMs', async () => {
    const { ads, clock, control } = setup({ presets: ['never-ready'] });
    const res = track(ads.showRewarded('hint'));
    await drain();
    await clock.advanceAsync(cfg.ads.readyTimeoutMs - 1);
    await drain();
    expect(res.done).toBe(false);
    await clock.advanceAsync(1);
    await drain();
    expect(res.value).toEqual({ ok: false, reason: 'timeout' });
    expect(control.count('ad.showAsync')).toBe(0);
    // The slot is free again afterwards (no stuck "busy" state).
    const again = track(ads.showRewarded('hint'));
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await drain();
    expect(again.value).toEqual({ ok: false, reason: 'timeout' });
  });

  it('never cuts off a long rewarded video: a 10 s ad completes and grants', async () => {
    const { ads, clock } = setup({ presets: ['slow-rewarded'] });
    ads.preload('rewarded');
    await drain();
    const res = track(ads.showRewarded('kitty'));
    await clock.advanceAsync(cfg.ads.readyTimeoutMs + 1);
    await drain();
    expect(res.done).toBe(false);
    await clock.advanceAsync(10_000 - cfg.ads.readyTimeoutMs - 2); // 9 999 ms into the show
    await drain();
    expect(res.done).toBe(false);
    await clock.advanceAsync(1);
    await drain();
    expect(res.value).toEqual({ ok: true });
  });

  it('waits for a slow load that finishes inside the readiness window, then shows', async () => {
    const { ads, clock, control } = setup({ ads: { rewarded: { loadDelayMs: 3_000, showDelayMs: 0 } } });
    const res = track(ads.showRewarded('revive'));
    await clock.advanceAsync(3_000);
    await drain();
    expect(res.value).toEqual({ ok: true });
    expect(control.count('ad.showAsync')).toBe(1);
  });

  it('maps a closed rewarded video to "skipped" and reloads afterwards', async () => {
    const { ads, clock, control } = setup({ presets: ['rewarded-close'] });
    ads.preload('rewarded');
    await drain();
    const res = track(ads.showRewarded('hint'));
    await clock.advanceAsync(300);
    await drain();
    expect(res.value).toEqual({ ok: false, reason: 'skipped' });
    expect(control.count('getRewardedVideoAsync')).toBe(2);
  });

  it('returns no_fill and retries the load on a bounded backoff, then waits for a request', async () => {
    const { ads, clock, control } = setup({ presets: ['no-fill'] });
    await expect(ads.showInterstitial('retry')).resolves.toEqual({ ok: false, reason: 'no_fill' });
    expect(control.count('getInterstitialAdAsync')).toBe(1);
    let expected = 1;
    for (const delay of cfg.ads.reloadDelaysMs) {
      await clock.advanceAsync(delay - 1);
      await drain();
      expect(control.count('getInterstitialAdAsync')).toBe(expected);
      await clock.advanceAsync(1);
      await drain();
      expect(control.count('getInterstitialAdAsync')).toBe(++expected);
    }
    await clock.advanceAsync(10 * 60_000);
    await drain();
    expect(control.count('getInterstitialAdAsync')).toBe(expected);
    // A new request creates a fresh instance at once.
    ads.preload('interstitial');
    await drain();
    expect(control.count('getInterstitialAdAsync')).toBe(expected + 1);
  });

  it('rejects a second show while the first is still playing', async () => {
    const { ads, clock } = setup({ ads: { interstitial: { showDelayMs: 1_000 } } });
    ads.preload('interstitial');
    await drain();
    const first = track(ads.showInterstitial('next_level'));
    await drain();
    await expect(ads.showInterstitial('next_level')).resolves.toEqual({ ok: false, reason: 'not_ready' });
    await clock.advanceAsync(1_000);
    await drain();
    expect(first.value).toEqual({ ok: true });
  });

  it('maps show-time errors (rate limit) and never rejects', async () => {
    const { ads, clock, control } = setup({ ads: { rewarded: { show: 'RATE_LIMITED', showDelayMs: 0 } } });
    ads.preload('rewarded');
    await drain();
    await expect(ads.showRewarded('hint')).resolves.toEqual({ ok: false, reason: 'rate_limited' });
    // Rate limited: the reload waits for the backoff instead of hammering the SDK.
    expect(control.count('getRewardedVideoAsync')).toBe(1);
    await clock.advanceAsync(cfg.ads.reloadDelaysMs[0] ?? 0);
    await drain();
    expect(control.count('getRewardedVideoAsync')).toBe(2);
  });

  it('survives an SDK that throws synchronously', async () => {
    const clock = createFakeClock();
    const { sdk } = createStub({}, clock);
    const broken = Object.assign(Object.create(sdk) as typeof sdk, {
      getInterstitialAdAsync: () => {
        throw { code: 'CLIENT_UNSUPPORTED_OPERATION', message: 'no' };
      },
    });
    const ads = createFbAds(broken, { placements: PLACEMENTS, timers: clock });
    await expect(ads.showInterstitial('next_level')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(clock.pending()).toBe(0); // unsupported → no reload timer
  });
});
