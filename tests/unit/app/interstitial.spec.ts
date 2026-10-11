// Owner: C (Phase 2b; was app). Interstitial gating at the three transitions (02 §13.2, 04 §5.7 onNext): the gate is
// checked first, the ad only when it passes, and the transition always goes ahead.
import { describe, expect, it } from 'vitest';
import type { SaveData } from '../../../src/game/types';
import { createHarness, loseGame, NOW, slice, startLevel, winGame, type Harness, tapRanking } from './harness';

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
  expect(h.router.isOpen('ranking')).toBe(true); // phase2b §2.2: the ranking panel at 4.5 s, then the victory
  await tapRanking(h);
  expect(h.router.isOpen('victory')).toBe(true);
  h.log.length = 0;
}

describe('next_level (victory "Level N")', () => {
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
    expect(h.analytics).toContainEqual({ name: 'ad_interstitial', params: { trigger: 'next_level', result: 'gated', gate: 'min_levels' } });
  });

  it('is gated during the first minute of the session', async () => {
    const h = createHarness({ save: veteran, sessionStartedAt: NOW });
    await wonLevel(h);
    expect(h.clock.now() - NOW).toBeLessThan(60_000);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['screen:game:L16']);
  });

  it('is gated by the cooldown since the last ad (Phase 2e L1, P-I2: the 30 s floor)', async () => {
    const h = createHarness({ save: (s) => ({ ...veteran(s), ads: { lastAdAt: NOW - 5_000, lastFallbackGrantAt: 0 } }) });
    await wonLevel(h);
    expect(h.clock.now() - (NOW - 5_000)).toBeLessThan(30_000);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['screen:game:L16']);
    expect(h.analytics).toContainEqual({ name: 'ad_interstitial', params: { trigger: 'next_level', result: 'gated', gate: 'cooldown' } });
  });

  it('shows once the 30 s floor has passed since the last ad (every level, no tenure table)', async () => {
    const h = createHarness({ save: (s) => ({ ...veteran(s), ads: { lastAdAt: NOW - 31_000, lastFallbackGrantAt: 0 } }) });
    await wonLevel(h);
    await h.session.onNext();
    expect(slice(h.log, AD)).toEqual(['ad:interstitial:next_level', 'screen:game:L16']);
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
  it('gate → interstitial → RETRY → READY → START after the board entry (retryEveryN 1: every Retry, the 2b rule)', async () => {
    const h = createHarness({ save: veteran, config: { ads: { interstitial: { retryEveryN: 1 } } } });
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

describe('daily_done (victory "Done")', () => {
  it('gate → interstitial → Home', async () => {
    const h = createHarness({ save: veteran });
    await h.session.start({ mode: 'daily', dateKey: '2026-10-07' });
    await h.settle(h.config.fx.boardEntryMs);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    expect(h.router.isOpen('ranking')).toBe(true);
    await tapRanking(h);
    expect(h.router.props.victory?.variant).toBe('daily');
    h.log.length = 0;
    await h.session.onDailyDone();
    expect(slice(h.log, AD)).toEqual(['ad:interstitial:daily_done', 'goHome']);
    expect(h.store.get().game).toBeNull();
    // Dailies never count toward the interstitial's completed-level minimum.
    expect(h.save().progress.completed).toBe(14);
  });
});

// ─────────────────────────────── Phase 2e (spec §3.2; G1) ───────────────────────────────

/** The L1 target values (spec §7.2.2): a 30 s floor instead of the tenure cooldown. */
const TARGET = { ads: { interstitial: { cooldownSec: [{ fromDay: 0, sec: 30 }] } } } as const;

describe('Phase 2e: every 2nd Retry (ads.interstitial.retryEveryN 2, P-I4)', () => {
  it('Retry 1 gated (retry_cadence), 2 shown, 3 gated; a level win resets the counter', async () => {
    const h = createHarness({ save: veteran, config: TARGET });
    await startLevel(h, 15);
    const retry = async (): Promise<string[]> => {
      await loseGame(h);
      h.log.length = 0;
      h.analytics.length = 0;
      h.clock.advance(31_000);
      await h.session.onRetry();
      await h.settle(h.config.fx.boardEntryMs);
      return slice(h.log, /^ad:interstitial/);
    };
    expect(await retry()).toEqual([]);
    expect(h.analytics).toContainEqual({ name: 'ad_interstitial', params: { trigger: 'retry', result: 'gated', gate: 'retry_cadence' } });
    expect(await retry()).toEqual(['ad:interstitial:retry']);
    expect(await retry()).toEqual([]);
    // A level win restarts the count: the next Retry is #1 again (gated), the one after it shows.
    h.log.length = 0;
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    h.clock.advance(31_000);
    await h.session.onNext();
    await h.settle(h.config.fx.boardEntryMs);
    expect(await retry()).toEqual([]);
    expect(await retry()).toEqual(['ad:interstitial:retry']);
  });
});

describe('Phase 2e: the fail card Home (fail_home, P-I5)', () => {
  it('gate passes: the interstitial first (board busy), then the attempt is discarded and Home', async () => {
    const h = createHarness({ save: veteran, config: TARGET });
    await startLevel(h, 15);
    await loseGame(h);
    expect(h.router.isOpen('fail')).toBe(true);
    h.log.length = 0;
    h.session.onHome();
    await h.settle(0);
    expect(slice(h.log, AD)).toEqual(['ad:interstitial:fail_home', 'goHome']);
    expect(h.save().inProgress.level).toBeNull();
    expect(h.store.get().game).toBeNull();
    expect(h.save().ads.lastAdAt).toBe(h.clock.now());
  });

  it('gated (below 10 levels, No Ads): Home at once, logged with its gate', async () => {
    const h = createHarness({ save: (s) => ({ ...veteran(s), progress: { level: 5, completed: 4, best: {} } }), config: TARGET });
    await startLevel(h, 5);
    await loseGame(h);
    h.log.length = 0;
    h.session.onHome();
    expect(slice(h.log, AD)).toEqual(['goHome']);
    expect(h.save().inProgress.level).toBeNull();
    expect(h.analytics).toContainEqual({ name: 'ad_interstitial', params: { trigger: 'fail_home', result: 'gated', gate: 'min_levels' } });
    const owned = createHarness({ save: (s) => ({ ...veteran(s), purchases: { noAds: true, tokens: [], pending: [] } }), config: TARGET });
    await startLevel(owned, 15);
    await loseGame(owned);
    owned.log.length = 0;
    owned.session.onHome();
    expect(slice(owned.log, AD)).toEqual(['goHome']);
  });

  it('the top bar Home before the fail card opens saves the board (no ad, not discarded)', async () => {
    const h = createHarness({ save: veteran, config: TARGET });
    await startLevel(h, 15);
    const s = h.game();
    for (let r = 0; r < 3; r++) {
      const wrong = r * s.puzzle.n + (((s.puzzle.solution[r] ?? 0) + 1) % s.puzzle.n);
      h.session.onCellDoubleTap(wrong);
      await h.settle(h.config.input.cellLockAfterCatMs);
      if (h.game().status === 'lost') break;
    }
    h.log.length = 0;
    h.session.onHome();
    expect(slice(h.log, AD)).toEqual(['goHome']);
  });
});

describe('Phase 2e: every level from level 10 with a 30 s floor (P-I2, the L1 cooldown table)', () => {
  it('three quick levels: an interstitial after each one that is ≥ 30 s after the last ad', async () => {
    const h = createHarness({ save: veteran, config: TARGET });
    const shown: string[] = [];
    for (let i = 0; i < 3; i++) {
      await wonLevel(h, 15 + i);
      h.clock.advance(i === 1 ? 10_000 : 31_000); // the second one comes 10 s after the first ad
      await h.session.onNext();
      shown.push(slice(h.log, /^ad:interstitial/).join(',') || 'none');
    }
    expect(shown).toEqual(['ad:interstitial:next_level', 'none', 'ad:interstitial:next_level']);
  });
});
