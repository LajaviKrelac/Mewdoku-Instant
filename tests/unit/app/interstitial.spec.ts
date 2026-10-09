// Owner: C (Phase 2b; was app). Interstitial gating at the three transitions (02 §13.2, 04 §5.7 onNext): the gate is
// checked first, the ad only when it passes, and the transition always goes ahead.
import { describe, expect, it } from 'vitest';
import type { SaveData } from '../../../src/game/types';
import { createHarness, loseGame, NOW, slice, startLevel, winGame, type Harness } from './harness';

/** 10+ completed levels, first seen long ago, no recent ad: the gate passes once the grace is over. */
const veteran = (s: SaveData): SaveData => ({
  ...s,
  progress: { level: 15, completed: 14, best: {} },
  ads: { lastAdAt: 0, lastFallbackGrantAt: 0 },
});

const AD = /^(ad:interstitial|screen:|goHome|status:)/;

async function wonLevel(h: Harness, level = 15): Promise<void> {
  await startLevel(h, level);
  winGame(h);
  await h.settle(h.config.fx.winOverlayDelayMs);
  expect(h.router.isOpen('win')).toBe(true);
  h.log.length = 0;
}

describe('next_level (O3 Next)', () => {
  it('shows the interstitial when the gate passes, then loads L+1', async () => {
    const h = createHarness({ save: veteran });
    await wonLevel(h);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['ad:interstitial:next_level', 'screen:game:L16']);
    expect(h.save().ads.lastAdAt).toBe(h.clock.now());
    expect(h.analytics).toContainEqual({ name: 'ad_interstitial', params: { trigger: 'next_level', result: 'ok' } });
  });

  it('is gated below 10 completed levels', async () => {
    const h = createHarness({ save: (s) => ({ ...veteran(s), progress: { level: 9, completed: 8, best: {} } }) });
    await wonLevel(h, 9);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['screen:game:L10']);
    expect(h.analytics).toContainEqual({ name: 'ad_interstitial', params: { trigger: 'next_level', result: 'gated' } });
  });

  it('is gated during the first minute of the session', async () => {
    const h = createHarness({ save: veteran, sessionStartedAt: NOW });
    await wonLevel(h);
    expect(h.clock.now() - NOW).toBeLessThan(60_000);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['screen:game:L16']);
  });

  it('is gated by the tenure cooldown since the last ad', async () => {
    const h = createHarness({ save: (s) => ({ ...veteran(s), ads: { lastAdAt: NOW - 30_000, lastFallbackGrantAt: 0 } }) });
    await wonLevel(h);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['screen:game:L16']);
  });

  it('a failed interstitial never blocks the transition and does not reset the clock', async () => {
    const h = createHarness({ save: veteran });
    h.platform.interstitialResults.push({ ok: false, reason: 'timeout' });
    await wonLevel(h);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['ad:interstitial:next_level', 'screen:game:L16']);
    expect(h.save().ads.lastAdAt).toBe(0);
  });

  it('is gated when the platform has no interstitials', async () => {
    const h = createHarness({ save: veteran, caps: { interstitial: false } });
    await wonLevel(h);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['screen:game:L16']);
  });

  it('never applies to the first-run tutorial win', async () => {
    const h = createHarness({ save: (s) => ({ ...veteran(s), tutorialDone: false, progress: { level: 1, completed: 12, best: {} } }) });
    await h.session.start({ mode: 'tutorial', replay: false });
    h.store.update((s) => (s.game ? { ...s, game: { ...s.game, status: 'won' } } : s));
    h.log.length = 0;
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['screen:game:L2']);
  });
});

describe('retry (O4 Retry)', () => {
  it('gate → interstitial → RETRY → READY → START after the board entry', async () => {
    const h = createHarness({ save: veteran });
    await startLevel(h, 15);
    await loseGame(h);
    h.log.length = 0;
    await h.session.onRetry();
    expect(slice(h.log, /^(ad:interstitial|close:fail|status:)/)).toEqual(['ad:interstitial:retry', 'close:fail', 'status:ready']);
    const g = h.game();
    expect(g.hearts).toBe(3);
    expect(g.mistakes).toBe(0);
    expect(g.cells.every((x) => x === 0)).toBe(true);
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.game().status).toBe('playing');
  });

  it('gated retry still retries', async () => {
    const h = createHarness({ save: (s) => ({ ...veteran(s), progress: { level: 5, completed: 4, best: {} } }) });
    await startLevel(h, 5);
    await loseGame(h);
    h.log.length = 0;
    await h.session.onRetry();
    expect(slice(h.log, /^(ad:interstitial|status:)/)).toEqual(['status:ready']);
  });
});

describe('daily_done (O7 Done)', () => {
  it('gate → interstitial → Home', async () => {
    const h = createHarness({ save: veteran });
    await h.session.start({ mode: 'daily', dateKey: '2026-10-07' });
    await h.settle(h.config.fx.boardEntryMs);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    expect(h.router.isOpen('daily_result')).toBe(true);
    h.log.length = 0;
    await h.session.onDailyDone();
    expect(slice(h.log, AD)).toEqual(['ad:interstitial:daily_done', 'goHome']);
    expect(h.store.get().game).toBeNull();
    // Dailies never count toward the interstitial's completed-level minimum.
    expect(h.save().progress.completed).toBe(14);
  });
});
