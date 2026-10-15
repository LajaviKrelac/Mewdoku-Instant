// Owner: D
// FB banner (phase2b §3.2, §3.5, §3.6): capability needs BOTH APIs, SDK calls and error mapping
// against the stub (RATE_LIMITED → rate_limited inside its 45 s window), the unsupported latch, and
// the hide-during-load race (a load that lands after hide() is hidden at once). D-2e-25 review (2026-10-14): only
// the newest load may show (a given-up load that lands late is hidden unless a banner is up). D-2e-25 review round 3
// (2026-10-15): "up" is what the app believes, an ok since its last hide() from any load, older ones too (R3-4, R3-2);
// a failed take-down of a stale landing is retried even while the app wants a banner (R3-5). Round 4 (2026-10-15,
// R4-2): so is the app's own hide() whose SDK call failed or hung (a hung call counts as failed), even after a show()
// in the same task, until a hide succeeds or the newest load lands; mayBeUp() reports a banner nobody counts.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig } from '../../../src/app/config';
import { bannerSupported, createFbBanner, HIDE_RETRIES, HIDE_RETRY_MS, mapBannerError, stuckLoadMs } from '../../../src/platform/fb/fb-banner';
import type { FBInstantSDK } from '../../../src/platform/fb/fbinstant';
import { createStub, drain, track, type StubConfig } from './helpers';

function setup(config: StubConfig = {}, placement = 'ban-1') {
  const clock = createFakeClock();
  const { sdk, control } = createStub(config, clock);
  let unsupported = 0;
  const banner = createFbBanner(sdk, { placement, timers: clock, onUnsupported: () => unsupported++ });
  return { clock, sdk, control, banner, unsupportedCalls: () => unsupported };
}

/**
 * D-2e-25 review (2026-10-14): an SDK whose loads settle only when the test says so (the stub's 'never' never
 * does). A load that resolves shows a banner (Meta: load = show); a hide call takes it down when the SDK gets it.
 * With holdHides, hide calls stay in flight until the test runs their entry in `hides`. Review round 3 (2026-10-15):
 * the next `failHides` hide calls reject (NETWORK_FAILURE) and leave the banner on screen. Review round 4
 * (2026-10-15): the next `hangHides` hide calls never settle on their own and leave the banner on screen; the test
 * settles them late through `hung` (ok: true resolves, without touching the screen: the test says what the SDK did).
 */
function manualSetup() {
  const clock = createFakeClock();
  const fake = {
    onScreen: false,
    hideCalls: 0,
    holdHides: false,
    failHides: 0,
    hangHides: 0,
    loads: [] as { resolve(): void; reject(code: string): void }[],
    hides: [] as (() => void)[],
    hung: [] as ((ok: boolean) => void)[],
  };
  const sdk = {
    loadBannerAdAsync: () =>
      new Promise<void>((resolve, reject) => {
        fake.loads.push({
          resolve: () => {
            fake.onScreen = true;
            resolve();
          },
          reject: (code) => reject({ code, message: '' }),
        });
      }),
    hideBannerAdAsync: () => {
      fake.hideCalls++;
      if (fake.failHides > 0) {
        fake.failHides--;
        return Promise.reject({ code: 'NETWORK_FAILURE', message: '' });
      }
      if (fake.hangHides > 0) {
        fake.hangHides--;
        return new Promise<void>((resolve, reject) => {
          fake.hung.push((ok) => (ok ? resolve() : reject({ code: 'NETWORK_FAILURE', message: '' })));
        });
      }
      fake.onScreen = false;
      if (!fake.holdHides) return Promise.resolve();
      return new Promise<void>((resolve) => void fake.hides.push(resolve));
    },
  } as unknown as FBInstantSDK;
  const banner = createFbBanner(sdk, { placement: 'ban-1', timers: clock });
  return { clock, fake, banner };
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

  // ── review FB2B-1: never a banner in play ──

  it('a load slower than ads.readyTimeoutMs answers timeout, and a hide() after that still hides the late banner', async () => {
    const slow = cfg.ads.readyTimeoutMs + 2_000;
    const { banner, control, clock } = setup({ banner: { loadDelayMs: slow } });
    const shown = track(banner.show('bottom'));
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await drain();
    expect(shown.value).toEqual({ ok: false, reason: 'timeout' });
    await clock.advanceAsync(1_000);
    await banner.hide(); // the player tapped Play after the timeout, before the load landed
    await clock.advanceAsync(1_000);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(1);
    expect(control.state.bannerVisible).toBe(false);
  });

  it('a failed hideBannerAdAsync is retried on a timer until it succeeds', async () => {
    const { banner, control, clock } = setup({ errors: { hideBannerAdAsync: ['NETWORK_FAILURE', 'NETWORK_FAILURE'] } });
    await banner.show('bottom');
    await banner.hide();
    expect(control.count('hideBannerAdAsync')).toBe(1);
    expect(control.state.bannerVisible).toBe(true);
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(2);
    expect(control.state.bannerVisible).toBe(true);
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(3);
    expect(control.state.bannerVisible).toBe(false);
    await clock.advanceAsync(10 * HIDE_RETRY_MS);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(3); // done: no more calls
  });

  // D-2e-25 review round 4 (2026-10-15, R4-2): was "a new show() cancels them". A show() alone no longer does (its load
  // may come back empty, leaving the banner the app hid on screen: the next test); its load landing does (the app is
  // told ok about the banner in the one slot now), which is what the old last step meant ("no retry may take it down").
  it('the timer retries are bounded; the next hide() tries again; a show() whose load lands ok ends them', async () => {
    const { banner, control, clock } = setup({ banner: { hide: 'NETWORK_FAILURE', rateLimitMs: 0 } });
    await banner.show('bottom');
    await banner.hide();
    await clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(1 + HIDE_RETRIES);
    await banner.hide();
    expect(control.count('hideBannerAdAsync')).toBe(2 + HIDE_RETRIES);
    await expect(banner.show('bottom')).resolves.toEqual({ ok: true }); // wanted again, and the app counts its banner
    await clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(2 + HIDE_RETRIES);
    expect(control.state.bannerVisible).toBe(true);
  });

  it('R4-2: a show() whose load comes back empty (here rate_limited) keeps the retries of the hide() before it', async () => {
    const { banner, control, clock } = setup({ errors: { hideBannerAdAsync: ['NETWORK_FAILURE'] } });
    await banner.show('bottom');
    await banner.hide(); // fails: the banner is still up
    expect(control.state.bannerVisible).toBe(true);
    await expect(banner.show('bottom')).resolves.toEqual({ ok: false, reason: 'rate_limited' }); // inside Meta's 45 s
    expect(banner.mayBeUp?.()).toBe(true);
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(2);
    expect(control.state.bannerVisible).toBe(false);
    expect(banner.mayBeUp?.()).toBe(false);
    await clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(2);
  });

  it('a late-landing load whose own hide fails is retried too', async () => {
    const { banner, control, clock } = setup({ banner: { loadDelayMs: 1_000 }, errors: { hideBannerAdAsync: ['NETWORK_FAILURE'] } });
    void banner.show('bottom');
    await drain();
    await banner.hide();
    await clock.advanceAsync(1_000);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(1);
    expect(control.state.bannerVisible).toBe(true);
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect(control.count('hideBannerAdAsync')).toBe(2);
    expect(control.state.bannerVisible).toBe(false);
  });

  it('a load that never settles is given up after stuckLoadMs (under the 46 s window, over Meta\'s 45 s): a later show() loads again', async () => {
    expect(stuckLoadMs()).toBe(45_500); // Phase 2e L1: minReloadSec 46
    expect(stuckLoadMs(mergeConfig({ ads: { banner: { minReloadSec: 60 } } }))).toBe(56_000); // the 2b window
    expect(stuckLoadMs()).toBeGreaterThan(45_000);
    expect(stuckLoadMs()).toBeLessThan(cfg.ads.banner.minReloadSec * 1000);
    const { banner, control, clock } = setup({ banner: { load: 'never' } });
    void banner.show('bottom');
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await drain();
    await banner.hide();
    await clock.advanceAsync(stuckLoadMs() - cfg.ads.readyTimeoutMs - 1);
    const reused = track(banner.show('bottom')); // not yet given up: the same (hung) load
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await drain();
    expect(reused.value).toEqual({ ok: false, reason: 'timeout' });
    expect(control.count('loadBannerAdAsync')).toBe(1);
    control.configure({ banner: { load: 'ok' } });
    await clock.advanceAsync(1_000);
    await expect(banner.show('bottom')).resolves.toEqual({ ok: true });
    expect(control.count('loadBannerAdAsync')).toBe(2);
    expect(control.state.bannerVisible).toBe(true);
  });

  // ── D-2e-25 review (2026-10-14): only the newest load may show ──

  it('a given-up load that lands after its successor came back empty is hidden at once (the app gave the band back)', async () => {
    const { banner, fake, clock } = manualSetup();
    const first = track(banner.show('bottom')); // L1 hangs
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await drain();
    expect(first.value).toEqual({ ok: false, reason: 'timeout' });
    await banner.hide(); // Settings: nothing up yet, no SDK call
    expect(fake.hideCalls).toBe(0);
    await clock.advanceAsync(stuckLoadMs());
    const second = track(banner.show('bottom')); // wanted again: L1 is given up, L2 starts
    expect(fake.loads).toHaveLength(2);
    fake.loads[1]?.reject('ADS_NO_FILL');
    await drain();
    expect(second.value).toEqual({ ok: false, reason: 'no_fill' }); // banner-flow collapses the band here
    fake.loads[0]?.resolve(); // L1 lands late: the SDK shows its banner
    await drain();
    expect(fake.hideCalls).toBe(1);
    expect(fake.onScreen).toBe(false);
    await banner.hide(); // visible was cleared: nothing left to take down
    expect(fake.hideCalls).toBe(1);
  });

  it('a given-up load that lands after a newer load answered ok leaves that banner up (no SDK call)', async () => {
    const { banner, fake, clock } = manualSetup();
    void banner.show('bottom'); // L1 hangs
    await clock.advanceAsync(stuckLoadMs());
    const second = track(banner.show('bottom')); // L2
    fake.loads[1]?.resolve();
    await drain();
    expect(second.value).toEqual({ ok: true });
    fake.loads[0]?.resolve(); // L1 lands after L2 showed: the banner the app knows about stays
    await drain();
    expect(fake.hideCalls).toBe(0);
    expect(fake.onScreen).toBe(true);
    await banner.hide(); // still counted as up: the app's hide reaches the SDK
    expect(fake.hideCalls).toBe(1);
    expect(fake.onScreen).toBe(false);
  });

  it('a given-up load that lands while the newer load is still in flight is hidden; the newer one shows when it lands', async () => {
    const { banner, fake, clock } = manualSetup();
    void banner.show('bottom'); // L1 hangs
    await clock.advanceAsync(stuckLoadMs());
    const second = track(banner.show('bottom')); // L2, still loading
    fake.loads[0]?.resolve(); // L1 lands first
    await drain();
    expect(fake.hideCalls).toBe(1);
    expect(fake.onScreen).toBe(false);
    expect(second.done).toBe(false);
    fake.loads[1]?.resolve();
    await drain();
    expect(second.value).toEqual({ ok: true });
    expect(fake.onScreen).toBe(true);
    expect(fake.hideCalls).toBe(1);
    await banner.hide();
    expect(fake.hideCalls).toBe(2);
    expect(fake.onScreen).toBe(false);
  });

  it('a load that lands while a hide call is in flight still counts as up: the next hide() reaches the SDK', async () => {
    const { banner, fake, clock } = manualSetup();
    void banner.show('bottom'); // L1 hangs
    await clock.advanceAsync(stuckLoadMs());
    const second = track(banner.show('bottom')); // L2, still loading
    fake.holdHides = true;
    fake.loads[0]?.resolve(); // L1 lands: its hide call goes out and stays in flight
    await drain();
    expect(fake.hideCalls).toBe(1);
    fake.loads[1]?.resolve(); // L2 lands (and shows) before that hide call returns
    await drain();
    expect(second.value).toEqual({ ok: true });
    fake.holdHides = false;
    fake.hides.splice(0).forEach((h) => h());
    await drain();
    expect(fake.onScreen).toBe(true);
    await banner.hide(); // the app's hide before the board: the banner must go
    expect(fake.hideCalls).toBe(2);
    expect(fake.onScreen).toBe(false);
  });

  // ── D-2e-25 review round 3 (2026-10-15): the SDK follows what the app believes (an ok since its last hide()) ──

  it('R3-4: a given-up load that lands while an OLDER load\'s banner counts as up leaves it (no SDK call), even when the newest load comes back empty', async () => {
    const { banner, fake, clock } = manualSetup();
    const home = track(banner.show('bottom')); // L1: Home's banner
    fake.loads[0]?.resolve();
    await drain();
    expect(home.value).toEqual({ ok: true });
    await clock.advanceAsync(cfg.ads.banner.minReloadSec * 1000);
    const board = track(banner.show('bottom')); // L2: Play keeps the banner (no hide); the board loads after the window
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await drain();
    expect(board.value).toEqual({ ok: false, reason: 'timeout' }); // the app: still shown (L1), L2 maybe
    await clock.advanceAsync(cfg.ads.banner.minReloadSec * 1000);
    const retry = track(banner.show('bottom')); // O4 → the first Retry (no hide): L2 is given up, L3 starts
    expect(fake.loads).toHaveLength(3);
    fake.loads[1]?.resolve(); // L2 lands late: it only refreshes the slot the app counts as up
    await drain();
    expect(fake.hideCalls).toBe(0);
    expect(fake.onScreen).toBe(true);
    fake.loads[2]?.reject('ADS_NO_FILL'); // the Retry's load is empty: the app keeps its banner (shown)
    await drain();
    expect(retry.value).toEqual({ ok: false, reason: 'no_fill' });
    await clock.advanceAsync(10 * HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(0);
    expect(fake.onScreen).toBe(true); // what the app believes
    await banner.hide(); // still counted as up: the app's hide reaches the SDK
    expect(fake.hideCalls).toBe(1);
    expect(fake.onScreen).toBe(false);
  });

  it('R3-2: an ok, then hide() and show() in one task: a given-up load landing during that hide call is hidden too (nothing left on screen)', async () => {
    const { banner, fake, clock } = manualSetup();
    void banner.show('bottom'); // L1 hangs
    await clock.advanceAsync(stuckLoadMs());
    const second = track(banner.show('bottom')); // L2
    fake.loads[1]?.resolve();
    await drain();
    expect(second.value).toEqual({ ok: true });
    fake.holdHides = true;
    void banner.hide(); // the app's hide: its SDK call stays in flight (visible still set)…
    const home = track(banner.show('bottom')); // …and Home's show() in the same task (shell.showHome): L3
    expect(fake.loads).toHaveLength(3);
    expect(fake.hideCalls).toBe(1);
    fake.loads[0]?.resolve(); // L1 lands during the hide call: the app counts nothing as up (no ok since its hide)
    await drain();
    expect(fake.hideCalls).toBe(2);
    expect(fake.onScreen).toBe(false);
    fake.loads[2]?.reject('ADS_NO_FILL'); // L3 empty: Home gives its band back
    await drain();
    expect(home.value).toEqual({ ok: false, reason: 'no_fill' });
    fake.holdHides = false;
    fake.hides.splice(0).forEach((h) => h());
    await drain();
    expect(fake.onScreen).toBe(false);
    await clock.advanceAsync(10 * HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(2);
    await banner.hide(); // the second hide call (after L1's landing) cleared `visible`: nothing left to take down
    expect(fake.hideCalls).toBe(2);
  });

  it("R3-5: a stale landing whose take-down fails is retried while the app wants a banner, until it succeeds", async () => {
    const { banner, fake, clock } = manualSetup();
    void banner.show('bottom'); // L1 hangs
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await banner.hide(); // nothing up yet, no SDK call
    await clock.advanceAsync(stuckLoadMs());
    const second = track(banner.show('bottom')); // wanted again: L2
    fake.loads[1]?.reject('ADS_NO_FILL');
    await drain();
    expect(second.value).toEqual({ ok: false, reason: 'no_fill' }); // the app gives the band back
    fake.failHides = 1;
    fake.loads[0]?.resolve(); // L1 lands late; its take-down fails
    await drain();
    expect(fake.hideCalls).toBe(1);
    expect(fake.onScreen).toBe(true);
    await clock.advanceAsync(HIDE_RETRY_MS); // `wanted` is still set (L2's show()): retried all the same
    await drain();
    expect(fake.hideCalls).toBe(2);
    expect(fake.onScreen).toBe(false);
    await clock.advanceAsync(10 * HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(2); // done: no more calls
    await banner.hide(); // `visible` was cleared
    expect(fake.hideCalls).toBe(2);
  });

  it('R3-5: a show() keeps the stale retry (its load still in flight), and the retries stay bounded', async () => {
    const { banner, fake, clock } = manualSetup();
    void banner.show('bottom'); // L1 hangs
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await banner.hide();
    await clock.advanceAsync(stuckLoadMs());
    void banner.show('bottom'); // L2
    fake.loads[1]?.reject('ADS_NO_FILL');
    await drain();
    fake.failHides = 1;
    fake.loads[0]?.resolve(); // L1 lands; its take-down fails
    await drain();
    const third = track(banner.show('bottom')); // a new screen's show() before the retry: L3 starts
    expect(fake.loads).toHaveLength(3);
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(2);
    expect(fake.onScreen).toBe(false);
    fake.loads[2]?.reject('ADS_NO_FILL');
    await drain();
    expect(third.value).toEqual({ ok: false, reason: 'no_fill' });
    expect(fake.onScreen).toBe(false);
    // Bounded: a take-down that keeps failing stops after HIDE_RETRIES timer retries.
    const q = manualSetup();
    void q.banner.show('bottom');
    await q.clock.advanceAsync(stuckLoadMs());
    void q.banner.show('bottom'); // L2
    q.fake.loads[1]?.reject('ADS_NO_FILL');
    await drain();
    q.fake.failHides = 100;
    q.fake.loads[0]?.resolve();
    await drain();
    await q.clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect(q.fake.hideCalls).toBe(1 + HIDE_RETRIES);
  });

  it("R3-5: a stale take-down that fails while the app's hide call is in flight is still retried after that call returns", async () => {
    const { banner, fake, clock } = manualSetup();
    void banner.show('bottom'); // L1 hangs
    await clock.advanceAsync(stuckLoadMs());
    void banner.show('bottom'); // L2
    fake.loads[1]?.resolve();
    await drain();
    fake.holdHides = true;
    void banner.hide(); // the app's hide: in flight
    void banner.show('bottom'); // L3
    fake.failHides = 1;
    fake.loads[0]?.resolve(); // L1 lands: its take-down fails at once (a retry is pending)
    await drain();
    expect(fake.hideCalls).toBe(2);
    expect(fake.onScreen).toBe(true);
    fake.holdHides = false;
    fake.hides.splice(0).forEach((h) => h()); // the app's hide call returns ok, but L1 landed during it
    await drain();
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(3);
    expect(fake.onScreen).toBe(false);
  });

  it('R3-5: the newest load landing ok ends a stale retry: it never takes down the banner the app was told about', async () => {
    const { banner, fake, clock } = manualSetup();
    void banner.show('bottom'); // L1 hangs
    await clock.advanceAsync(stuckLoadMs());
    const second = track(banner.show('bottom')); // L2, still loading
    fake.failHides = 1;
    fake.loads[0]?.resolve(); // L1 lands first; its take-down fails (a retry is pending)
    await drain();
    expect(fake.hideCalls).toBe(1);
    fake.loads[1]?.resolve(); // L2 lands before the retry: the app is told ok
    await drain();
    expect(second.value).toEqual({ ok: true });
    await clock.advanceAsync(10 * HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(1);
    expect(fake.onScreen).toBe(true);
    await banner.hide();
    expect(fake.hideCalls).toBe(2);
    expect(fake.onScreen).toBe(false);
  });

  // ── D-2e-25 review round 4 (2026-10-15, R4-2): a banner the app no longer counts is owed a take-down ──

  /** Home's banner up (L1 answered ok), as before O4's Home. */
  async function homeBannerUp(): Promise<ReturnType<typeof manualSetup>> {
    const m = manualSetup();
    const home = track(m.banner.show('bottom'));
    m.fake.loads[0]?.resolve();
    await drain();
    expect(home.value).toEqual({ ok: true });
    await m.clock.advanceAsync(cfg.ads.banner.minReloadSec * 1000);
    return m;
  }

  it("R4-2: the app's hide fails, a show() in the same task (shell.showHome), its load empty: the retries go on and take the banner down", async () => {
    const { banner, fake, clock } = await homeBannerUp();
    fake.failHides = 1;
    const hidden = track(banner.hide()); // O4's Home: shell.showHome's hide()…
    const home = track(banner.show('bottom')); // …and screenShown('home') in the same task: L2
    expect([fake.hideCalls, fake.loads.length]).toEqual([1, 2]);
    await drain();
    expect(hidden.done).toBe(true);
    expect(fake.onScreen).toBe(true); // the hide failed: the board's banner is still up, the app counts none
    expect(banner.mayBeUp?.()).toBe(true);
    fake.loads[1]?.reject('ADS_NO_FILL');
    await drain();
    expect(home.value).toEqual({ ok: false, reason: 'no_fill' });
    expect(banner.mayBeUp?.()).toBe(true); // banner-flow keeps Home's band under it
    await clock.advanceAsync(HIDE_RETRY_MS); // `wanted` is set (L2's show()): retried all the same
    await drain();
    expect(fake.hideCalls).toBe(2);
    expect(fake.onScreen).toBe(false);
    expect(banner.mayBeUp?.()).toBe(false);
    await clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(2); // done: no more calls
    await banner.hide(); // `visible` was cleared
    expect(fake.hideCalls).toBe(2);
  });

  it('R4-2: the same with a hide call that never settles: it counts as failed at ads.readyTimeoutMs and is retried', async () => {
    const { banner, fake, clock } = await homeBannerUp();
    fake.hangHides = 1;
    const hidden = track(banner.hide());
    const home = track(banner.show('bottom')); // L2
    fake.loads[1]?.reject('ADS_NO_FILL');
    await drain();
    expect(home.value).toEqual({ ok: false, reason: 'no_fill' });
    expect(hidden.done).toBe(false); // the call is still out
    expect([fake.onScreen, banner.mayBeUp?.()]).toEqual([true, true]);
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await drain();
    expect(hidden.done).toBe(true); // the app is never held
    expect(fake.hideCalls).toBe(1);
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(2);
    expect([fake.onScreen, banner.mayBeUp?.()]).toEqual([false, false]);
    fake.hung.splice(0).forEach((settle) => settle(true)); // the hung call settles late: nothing more to do
    await drain();
    await clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect([fake.hideCalls, banner.mayBeUp?.()]).toEqual([2, false]);
  });

  it('R4-2: a hung hide with nobody wanting a banner is retried too (before, only a rejected one was)', async () => {
    const { banner, fake, clock } = await homeBannerUp();
    fake.hangHides = 1;
    const hidden = track(banner.hide()); // e.g. before a board with no band
    await clock.advanceAsync(cfg.ads.readyTimeoutMs);
    await drain();
    expect(hidden.done).toBe(true);
    expect([fake.hideCalls, fake.onScreen]).toEqual([1, true]);
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect([fake.hideCalls, fake.onScreen, banner.mayBeUp?.()]).toEqual([2, false, false]);
    // Bounded: a hide that keeps hanging stops after HIDE_RETRIES timer retries.
    const q = await homeBannerUp();
    q.fake.hangHides = 100;
    void q.banner.hide();
    await q.clock.advanceAsync(20 * (cfg.ads.readyTimeoutMs + HIDE_RETRY_MS));
    await drain();
    expect(q.fake.hideCalls).toBe(1 + HIDE_RETRIES);
    expect(q.banner.mayBeUp?.()).toBe(true);
  });

  it('R4-2: a hung hide that settles successfully before its retry clears the state (no retry call)', async () => {
    const { banner, fake, clock } = await homeBannerUp();
    fake.hangHides = 1;
    void banner.hide();
    await clock.advanceAsync(cfg.ads.readyTimeoutMs); // counted as failed: a retry is due in HIDE_RETRY_MS
    await drain();
    fake.onScreen = false; // the SDK did take it down…
    fake.hung.splice(0).forEach((settle) => settle(true)); // …and says so late
    await drain();
    expect(banner.mayBeUp?.()).toBe(false);
    await clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect(fake.hideCalls).toBe(1);
    await banner.hide();
    expect(fake.hideCalls).toBe(1);
  });

  it('R4-2: a retry never takes down the newest banner the app was told ok about (failed or hung hide, then a show() that lands)', async () => {
    // A failed hide, then the new load lands ok before the retry.
    const a = await homeBannerUp();
    a.fake.failHides = 1;
    void a.banner.hide();
    const shown = track(a.banner.show('bottom'));
    await drain();
    a.fake.loads[1]?.resolve();
    await drain();
    expect(shown.value).toEqual({ ok: true });
    await a.clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect([a.fake.hideCalls, a.fake.onScreen, a.banner.mayBeUp?.()]).toEqual([1, true, true]);
    await a.banner.hide(); // the app's next hide reaches the SDK
    expect([a.fake.hideCalls, a.fake.onScreen]).toEqual([2, false]);
    // A hung hide, the new load lands ok while it is out, then the call's bound passes and it settles late (ok).
    const b = await homeBannerUp();
    b.fake.hangHides = 1;
    void b.banner.hide();
    const again = track(b.banner.show('bottom'));
    b.fake.loads[1]?.resolve();
    await drain();
    expect(again.value).toEqual({ ok: true });
    await b.clock.advanceAsync(cfg.ads.readyTimeoutMs + 20 * HIDE_RETRY_MS); // the bound: nothing owed (the app's banner)
    await drain();
    expect([b.fake.hideCalls, b.fake.onScreen]).toEqual([1, true]);
    b.fake.hung.splice(0).forEach((settle) => settle(true)); // a load landed while it was out: still counted as up
    await drain();
    await b.clock.advanceAsync(20 * HIDE_RETRY_MS);
    await drain();
    expect([b.fake.hideCalls, b.banner.mayBeUp?.()]).toEqual([1, true]);
    await b.banner.hide();
    expect([b.fake.hideCalls, b.fake.onScreen]).toEqual([2, false]);
  });

  it('mayBeUp(): a load landed and no SDK hide has succeeded since, whether or not the app counts it', async () => {
    const { banner, fake, clock } = manualSetup();
    expect(banner.mayBeUp?.()).toBe(false);
    const first = track(banner.show('bottom'));
    expect(banner.mayBeUp?.()).toBe(false); // still loading: the app's own 'pending'
    fake.loads[0]?.resolve();
    await drain();
    expect([first.value, banner.mayBeUp?.()]).toEqual([{ ok: true }, true]);
    await banner.hide();
    expect([fake.onScreen, banner.mayBeUp?.()]).toEqual([false, false]);
    // A late landing after hide() whose take-down fails: up, and the app never counted it.
    await clock.advanceAsync(cfg.ads.banner.minReloadSec * 1000);
    const second = track(banner.show('bottom'));
    await banner.hide();
    fake.failHides = 1;
    fake.loads[1]?.resolve();
    await drain();
    expect(second.value).toEqual({ ok: false, reason: 'skipped' });
    expect([fake.onScreen, banner.mayBeUp?.()]).toEqual([true, true]);
    await clock.advanceAsync(HIDE_RETRY_MS);
    await drain();
    expect([fake.onScreen, banner.mayBeUp?.()]).toEqual([false, false]);
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
