// @vitest-environment jsdom
// Owner: D (Phase 2b; was platform)
// web/mock-ads (04 §6.2): ?ads=ok|nofill|unsupported|close and the 1.5 s placeholder overlay; the
// phase2b §3.3 mock banner bar driven by the same mode.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import {
  createMockAds,
  createMockBanner,
  MOCK_AD_TEST_ID,
  MOCK_BANNER_GAME_WIDTH_PX,
  MOCK_BANNER_HEIGHT_PX,
  MOCK_BANNER_TEST_ID,
  mockBannerStyle,
  readMockAdMode,
} from '../../../src/platform/web/mock-ads';
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

describe('createMockBanner (phase2b §3.3)', () => {
  const bar = (): HTMLElement | null => document.querySelector(`[data-testid="${MOCK_BANNER_TEST_ID}"]`);

  it('ok: a 50 px grey "Banner placeholder" bar fixed at the bottom; hide removes it; show is idempotent', async () => {
    const banner = createMockBanner('ok', { doc: document })!;
    await expect(banner.show('bottom')).resolves.toEqual({ ok: true });
    await banner.show('bottom');
    expect(document.querySelectorAll(`[data-testid="${MOCK_BANNER_TEST_ID}"]`)).toHaveLength(1);
    const el = bar()!;
    expect(el.textContent).toBe('Banner placeholder');
    // Phase 2d §1.16: its bottom edge follows the game screen's band (0 without it: the 2b bar).
    expect([el.style.position, el.style.bottom, el.style.height]).toEqual(['fixed', 'var(--play-band-bottom, 0px)', `${MOCK_BANNER_HEIGHT_PX}px`]);
    await banner.hide();
    expect(bar()).toBeNull();
    await banner.hide(); // nothing up: fine
  });

  it('phase 2d §1.16: 320 × 50 and centred at the game band (--play-band / --play-band-bottom); full width elsewhere', () => {
    const css = mockBannerStyle();
    expect(MOCK_BANNER_GAME_WIDTH_PX).toBe(320);
    // Centred: both edges pinned with an auto margin; never wider than the viewport.
    expect(css).toContain('left:0');
    expect(css).toContain('right:0');
    expect(css).toContain('margin:0 auto');
    expect(css).toContain('max-width:100%');
    // The width: 100 % while --play-band is absent or 0, 320 px once the game screen publishes a band.
    expect(css).toContain('width:max(320px, calc(100% - var(--play-band, 0px) * 100000))');
    expect(css).toContain('bottom:var(--play-band-bottom, 0px)');
    expect(css).toContain(`height:${MOCK_BANNER_HEIGHT_PX}px`);
    // The resolved width for a few cases, by the same formula (max(320, vw − band × 1e5)).
    const width = (vw: number, band: number): number => Math.min(vw, Math.max(320, vw - band * 100000));
    expect(width(402, 0)).toBe(402);
    expect(width(1280, 0)).toBe(1280);
    expect(width(402, 73.4)).toBe(320);
    expect(width(1280, 66.5)).toBe(320);
    expect(width(300, 60)).toBe(300); // max-width: 100 %
  });

  it('nofill answers no_fill without a bar; unsupported has no banner at all', async () => {
    await expect(createMockBanner('nofill', { doc: document })!.show('bottom')).resolves.toEqual({ ok: false, reason: 'no_fill' });
    expect(bar()).toBeNull();
    expect(createMockBanner('unsupported', { doc: document })).toBeUndefined();
    expect(createMockBanner('close', { doc: document })).toBeDefined();
  });
});
