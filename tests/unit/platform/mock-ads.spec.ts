// @vitest-environment jsdom
// Owner: platform
// web/mock-ads (04 §6.2): ?ads=ok|nofill|unsupported|close and the 1.5 s placeholder overlay.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createMockAds, MOCK_AD_TEST_ID, readMockAdMode } from '../../../src/platform/web/mock-ads';
import { drain, track } from './helpers';

const overlay = (): Element | null => document.querySelector(`[data-testid="${MOCK_AD_TEST_ID}"]`);

describe('readMockAdMode', () => {
  it.each([
    ['', 'ok'],
    ['?ads=ok', 'ok'],
    ['?ads=nofill', 'nofill'],
    ['?x=1&ads=unsupported', 'unsupported'],
    ['?ads=CLOSE', 'close'],
    ['?ads=bogus', 'ok'],
    ['ads=nofill', 'nofill'],
  ] as const)('%j → %s', (search, mode) => {
    expect(readMockAdMode(search)).toBe(mode);
  });
});

describe('createMockAds', () => {
  it('ok: shows the placeholder for cfg.ads.mock.durationMs, then resolves ok', async () => {
    const clock = createFakeClock();
    const ads = createMockAds('ok', { doc: document, timers: clock });
    expect(ads.isReady('rewarded')).toBe(true);
    const res = track(ads.showRewarded('hint'));
    await drain();
    const el = overlay();
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-kind')).toBe('rewarded');
    expect(el?.getAttribute('data-placement')).toBe('hint');
    expect(el?.textContent).toContain('Ad placeholder');
    expect(ads.isReady('interstitial')).toBe(false); // one at a time
    await expect(ads.showInterstitial('next_level')).resolves.toEqual({ ok: false, reason: 'not_ready' });
    await clock.advanceAsync(cfg.ads.mock.durationMs - 1);
    expect(res.done).toBe(false);
    await clock.advanceAsync(1);
    await drain();
    expect(res.value).toEqual({ ok: true });
    expect(overlay()).toBeNull();
  });

  it('nofill and unsupported resolve at once without an overlay', async () => {
    const clock = createFakeClock();
    const nofill = createMockAds('nofill', { doc: document, timers: clock });
    expect(nofill.isReady('interstitial')).toBe(false);
    await expect(nofill.showInterstitial('retry')).resolves.toEqual({ ok: false, reason: 'no_fill' });
    await expect(nofill.showRewarded('kitty')).resolves.toEqual({ ok: false, reason: 'no_fill' });
    const unsupported = createMockAds('unsupported', { doc: document, timers: clock });
    await expect(unsupported.showRewarded('revive')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(overlay()).toBeNull();
    expect(clock.pending()).toBe(0);
  });

  it('close: a rewarded ad is "closed early" (no reward); interstitials still complete', async () => {
    const clock = createFakeClock();
    const ads = createMockAds('close', { doc: document, timers: clock, durationMs: 100 });
    const rewarded = track(ads.showRewarded('hint'));
    await clock.advanceAsync(100);
    await drain();
    expect(rewarded.value).toEqual({ ok: false, reason: 'skipped' });
    const inter = track(ads.showInterstitial('daily_done'));
    await clock.advanceAsync(100);
    await drain();
    expect(inter.value).toEqual({ ok: true });
  });

  it('the overlay swallows taps aimed at the game underneath', async () => {
    const clock = createFakeClock();
    let reached = 0;
    document.body.addEventListener('click', () => reached++);
    const ads = createMockAds('ok', { doc: document, timers: clock });
    void ads.showInterstitial('next_level');
    await drain();
    (overlay() as HTMLElement).click();
    expect(reached).toBe(0);
    await clock.advanceAsync(cfg.ads.mock.durationMs);
  });
});
