// Owner: D
// FB banner (phase2b §3.2, §3.5, §3.6): capability needs BOTH APIs, SDK calls and error mapping
// against the stub (RATE_LIMITED → rate_limited inside its 45 s window), the unsupported latch, and
// the hide-during-load race (a load that lands after hide() is hidden at once).
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { bannerSupported, createFbBanner, mapBannerError } from '../../../src/platform/fb/fb-banner';
import type { FBInstantSDK } from '../../../src/platform/fb/fbinstant';
import { createStub, drain, track, type StubConfig } from './helpers';

function setup(config: StubConfig = {}, placement = 'ban-1') {
  const clock = createFakeClock();
  const { sdk, control } = createStub(config, clock);
  let unsupported = 0;
  const banner = createFbBanner(sdk, { placement, timers: clock, onUnsupported: () => unsupported++ });
  return { clock, sdk, control, banner, unsupportedCalls: () => unsupported };
}

describe('bannerSupported', () => {
  it('needs both loadBannerAdAsync and hideBannerAdAsync, listed and callable', () => {
    const clock = createFakeClock();
    expect(bannerSupported(createStub({}, clock).sdk)).toBe(true);
    expect(bannerSupported(createStub({ presets: ['no-banner'] }, clock).sdk)).toBe(false);
    // Without a working hide no banner may ever show (§3.2).
    expect(bannerSupported(createStub({ presets: ['no-banner-hide'] }, clock).sdk)).toBe(false);
    // Listed but missing at runtime → off.
    const { sdk } = createStub({}, clock);
    const noFn = Object.assign(Object.create(sdk) as FBInstantSDK, { hideBannerAdAsync: undefined });
    expect(bannerSupported(noFn)).toBe(false);
    // Callable but not listed → off.
    const unlisted = createStub({ supportedAPIs: ['initializeAsync', 'loadBannerAdAsync'] }, clock).sdk;
    expect(bannerSupported(unlisted)).toBe(false);
  });

  it('maps banner error codes', () => {
    expect(mapBannerError({ code: 'RATE_LIMITED', message: '' })).toBe('rate_limited');
    expect(mapBannerError({ code: 'ADS_FREQUENT_LOAD', message: '' })).toBe('rate_limited');
    expect(mapBannerError({ code: 'ADS_NO_FILL', message: '' })).toBe('no_fill');
    expect(mapBannerError({ code: 'CLIENT_UNSUPPORTED_OPERATION', message: '' })).toBe('unsupported');
    expect(mapBannerError({ code: 'NETWORK_FAILURE', message: '' })).toBe('error');
    expect(mapBannerError(new Error('boom'))).toBe('error');
  });
});

describe('createFbBanner', () => {
  it('show() loads with the placement and position bottom (load = show); hide() removes it', async () => {
    const { banner, control } = setup();
    await expect(banner.show('bottom')).resolves.toEqual({ ok: true });
    expect(control.find('loadBannerAdAsync').map((c) => c.args)).toEqual([['ban-1', 'bottom']]);
    expect(control.state.bannerVisible).toBe(true);
    await banner.hide();
    expect(control.count('hideBannerAdAsync')).toBe(1);
    expect(control.state.bannerVisible).toBe(false);
  });

  it('hide() with nothing up makes no SDK call', async () => {
    const { banner, control } = setup();
    await banner.hide();
    expect(control.count('hideBannerAdAsync')).toBe(0);
  });

  it("a second load inside Meta's 45 s window answers rate_limited (RATE_LIMITED); after it, ok", async () => {
    const { banner, control, clock } = setup();
    await expect(banner.show('bottom')).resolves.toEqual({ ok: true });
    await banner.hide();
    await clock.advanceAsync(44_000);
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'rate_limited' });
    expect(control.state.bannerVisible).toBe(false);
    await clock.advanceAsync(1_000);
    await expect(banner.show('bottom')).resolves.toEqual({ ok: true });
    expect(control.count('loadBannerAdAsync')).toBe(3);
  });

  it('no fill and other errors map to no_fill / error without latching', async () => {
    const { banner, control, unsupportedCalls } = setup({ banner: { load: 'ADS_NO_FILL', rateLimitMs: 0 } });
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'no_fill' });
    control.configure({ banner: { load: 'NETWORK_FAILURE' } });
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'error' });
    expect(unsupportedCalls()).toBe(0);
    control.configure({ banner: { load: 'ok' } });
    await expect(banner.show('bottom')).resolves.toEqual({ ok: true });
  });

  it('CLIENT_UNSUPPORTED_OPERATION latches the banner off for the session (no further SDK calls)', async () => {
    const { banner, control, unsupportedCalls } = setup({ banner: { load: 'CLIENT_UNSUPPORTED_OPERATION', rateLimitMs: 0 } });
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(unsupportedCalls()).toBe(1);
    control.configure({ banner: { load: 'ok' } });
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(control.count('loadBannerAdAsync')).toBe(1);
    expect(unsupportedCalls()).toBe(1);
  });

  it('an unsupported hide latches too', async () => {
    const { banner, control, unsupportedCalls } = setup({ banner: { hide: 'CLIENT_UNSUPPORTED_OPERATION' } });
    await banner.show('bottom');
    await banner.hide();
    expect(unsupportedCalls()).toBe(1);
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(control.count('loadBannerAdAsync')).toBe(1);
  });

  it('a load that lands after hide() is hidden at once and answers skipped (never a banner in play)', async () => {
    const { banner, control, clock } = setup({ banner: { loadDelayMs: 1_000 } });
    const shown = track(banner.show('bottom'));
    await drain();
    await banner.hide(); // the player tapped "Level N" while the banner was still loading
    expect(control.count('hideBannerAdAsync')).toBe(0); // nothing up yet
    await clock.advanceAsync(1_000);
    await drain();
    expect(shown.value).toEqual({ ok: false, reason: 'skipped' });
    expect(control.count('hideBannerAdAsync')).toBe(1);
    expect(control.state.bannerVisible).toBe(false);
  });

  it('overlapping show() calls share one load', async () => {
    const { banner, control, clock } = setup({ banner: { loadDelayMs: 500 } });
    const a = track(banner.show('bottom'));
    const b = track(banner.show('bottom'));
    await clock.advanceAsync(500);
    await drain();
    expect(a.value).toEqual({ ok: true });
    expect(b.value).toEqual({ ok: true });
    expect(control.count('loadBannerAdAsync')).toBe(1);
  });

  it('a load that never settles answers timeout after ads.readyTimeoutMs; the app is never held', async () => {
    const { banner, control, clock } = setup({ banner: { load: 'never' } });
    const shown = track(banner.show('bottom'));
    await clock.advanceAsync(cfg.ads.readyTimeoutMs - 1);
    expect(shown.done).toBe(false);
    await clock.advanceAsync(1);
    await drain();
    expect(shown.value).toEqual({ ok: false, reason: 'timeout' });
    await banner.hide();
    expect(control.count('hideBannerAdAsync')).toBe(0);
  });

  it('an empty placement never touches the SDK', async () => {
    const { banner, control } = setup({}, '  ');
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    await banner.hide();
    expect(control.count('loadBannerAdAsync')).toBe(0);
  });

  it('never rejects, even when the SDK throws synchronously', async () => {
    const clock = createFakeClock();
    const { sdk } = createStub({}, clock);
    const broken = Object.assign(Object.create(sdk) as FBInstantSDK, {
      loadBannerAdAsync: () => {
        throw new Error('sync throw');
      },
    });
    const banner = createFbBanner(broken, { placement: 'b', timers: clock });
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'error' });
    await expect(banner.hide()).resolves.toBeUndefined();
  });
});
