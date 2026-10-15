// UI batch (2026-10-13): streak — when and with what the Daily Streak screen opens (app/streak-screen-flow.ts): its data
// from the save only (the run, the best, the run's current cycle), the victory's primary going through it once on the
// day's first counted win (Continue then runs the gate and the next board; Home's pill opens it with a back arrow),
// never on a later win, with the switch off or the flag off.
// D-2e-25 review (2026-10-14, N5, review #3): an open screen follows the reserve of the screen under it going off
// (followStreakBand; with ads.banner.collapseWhenEmpty only); the session and shell wiring is in banner-2e.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { setFlagOverrides } from '../../../src/app/flags';
import { createShell } from '../../../src/app/shell';
import { afterStreakScreen, followStreakBand, openStreakScreen, selectStreakScreen, streakScreenDue } from '../../../src/app/streak-screen-flow';
import { initialAppState, type AppState, type OverlayId } from '../../../src/app/store';
import { dateKeyOfDay, dayNumber, emptyDayStreak } from '../../../src/game/day-streak';
import { dailyDateKey } from '../../../src/game/progression';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import { createHarness, NOW, slice, startLevel, tapRanking, winGame, type Harness } from './harness';

afterEach(() => setFlagOverrides({}));

const TODAY = dailyDateKey(NOW);
/** The date key `n` days from today (negative: before). */
const dayAt = (n: number): string => dateKeyOfDay(dayNumber(TODAY) + n);
/** A run of `days` counted days ending `endsAgo` days before today. */
const runOf = (days: number, endsAgo = 1): SaveData['dayStreak'] => ({
  dates: Array.from({ length: days }, (_, i) => dayAt(-endsAgo - (days - 1 - i))),
  run: days,
  best: Math.max(days, 4),
  paid: [],
});

function app(save: Partial<SaveData> = {}, ui: Partial<AppState['ui']> = {}): AppState {
  const s = initialAppState({ ...defaults(NOW - 30 * 86_400_000), tutorialDone: true, ...save });
  return { ...s, ui: { ...s.ui, ...ui } };
}

describe('selectStreakScreen (the save only: run, best, the run\'s current cycle)', () => {
  it('from Home before today counts: the run, the best, today the next cell, no reward; banner and motion from the state', () => {
    const d = selectStreakScreen(app({ dayStreak: runOf(3) }, { bannerReserved: true, reducedMotion: true }), NOW, 'home', { hints: 2 });
    expect(d).toMatchObject({ mode: 'home', best: 4, reward: null, bannerReserved: true, reducedMotion: true, buttonDelayMs: cfg.fx.winButtonDelayMs });
    expect(d.streak).toMatchObject({ state: 'alive', day: 3, total: 7, run: 3 });
    expect(d.week.map((c) => c.dateKey)).toEqual([-3, -2, -1, 0, 1, 2, 3].map(dayAt));
    expect(d.week.map((c) => `${c.played ? 'x' : '.'}${c.today ? 'T' : ''}${c.gift ? 'g' : ''}`)).toEqual(['x', 'x', 'x', '.T', '.', '.', '.g']);
  });

  it('no streak yet: run 0, day 1 = today; the best is never below the run', () => {
    const d = selectStreakScreen(app({ dayStreak: emptyDayStreak() }), NOW, 'home');
    expect(d.streak.state).toBe('none');
    expect(d.best).toBe(0);
    expect(d.week[0]).toMatchObject({ dateKey: TODAY, today: true, played: false });
    expect(selectStreakScreen(app({ dayStreak: { ...runOf(5, 0), best: 2 } }), NOW, 'home').best).toBe(5);
  });

  it('after the win: today counted, the reward passed through in mode \'win\' only', () => {
    const ds = { ...runOf(7, 0), paid: [`${TODAY}|2|2`] };
    const d = selectStreakScreen(app({ dayStreak: ds }), NOW, 'win', { hints: 2, kitties: 2 });
    expect(d.streak).toMatchObject({ state: 'done', day: 7, rewardDay: true, run: 7 });
    expect(d.reward).toEqual({ hints: 2, kitties: 2 });
    expect(d.week[6]).toMatchObject({ dateKey: TODAY, today: true, played: true, gift: true, paid: true });
  });

  it('review F15: in mode \'win\' the screen keeps the date the win counted when the press comes after the day boundary', () => {
    const nextDay = NOW + 86_400_000; // won before the day boundary, the victory's primary pressed after it
    expect(dailyDateKey(nextDay)).toBe(dayAt(1));
    const mid = selectStreakScreen(app({ dayStreak: runOf(3, 0) }), nextDay, 'win');
    expect(mid.streak).toMatchObject({ state: 'done', day: 3, run: 3 });
    expect(mid.week.find((c) => c.today)).toMatchObject({ dateKey: TODAY, played: true });
    // Day 7: the closed cycle with its paid gift, never a new cycle that contradicts the reward line.
    const ds = { ...runOf(7, 0), paid: [`${TODAY}|2|2`] };
    const d7 = selectStreakScreen(app({ dayStreak: ds }), nextDay, 'win', { hints: 2, kitties: 2 });
    expect(d7.streak).toMatchObject({ state: 'done', day: 7, rewardDay: true, run: 7 });
    expect(d7.week.map((c) => c.played)).toEqual([true, true, true, true, true, true, true]);
    expect(d7.week[6]).toMatchObject({ dateKey: TODAY, today: true, gift: true, paid: true });
    // Home keeps the clock's day: the next day is not counted yet.
    expect(selectStreakScreen(app({ dayStreak: runOf(3, 0) }), nextDay, 'home').streak).toMatchObject({ state: 'alive', day: 3 });
  });
});

describe('streakScreenDue / afterStreakScreen', () => {
  const host = (opened: { id: OverlayId; props: unknown }[], c = cfg) => ({
    router: { open: (id: OverlayId, props: unknown) => void opened.push({ id, props }) },
    state: () => app({ dayStreak: runOf(2, 0) }),
    now: () => NOW,
    config: c,
  });
  const STREAK = { day: 2, total: 7, reward: null };

  it('due on the day\'s first counted win only, with dayStreak.screenAfterWin and the flag on', () => {
    expect(streakScreenDue({ streak: STREAK })).toBe(true);
    expect(streakScreenDue({ streak: null })).toBe(false); // tutorial, a second win, a restored board
    expect(streakScreenDue({ streak: STREAK }, mergeConfig({ dayStreak: { screenAfterWin: false } }))).toBe(false);
    expect(streakScreenDue({ streak: STREAK }, mergeConfig({ dayStreak: { enabled: false } }))).toBe(false);
    setFlagOverrides({ dayStreak: false });
    expect(streakScreenDue({ streak: STREAK })).toBe(false);
  });

  it('the first primary press opens the screen (mode \'win\'); its Continue runs the primary; a later press runs it at once', () => {
    const opened: { id: OverlayId; props: unknown }[] = [];
    let pressed = 0;
    const base = { variant: 'level', onPrimary: () => void pressed++ };
    const p = afterStreakScreen(host(opened), { streak: { ...STREAK, reward: { hints: 1 } } }, base);
    expect(p).not.toBe(base);
    expect(p.variant).toBe('level');
    p.onPrimary();
    expect(pressed).toBe(0);
    expect(opened.map((o) => o.id)).toEqual(['streak']);
    const props = opened[0]?.props as { mode: string; reward: unknown; onDone(): void };
    expect(props).toMatchObject({ mode: 'win', reward: { hints: 1 } });
    props.onDone();
    expect(pressed).toBe(1);
    props.onDone(); // Continue again (the gate was busy): the primary again, never a second screen
    p.onPrimary();
    expect(pressed).toBe(3);
    expect(opened).toHaveLength(1);
  });

  it('review F15: a press after the day boundary still shows the day the win counted (lit, today\'s check)', () => {
    const opened: { id: OverlayId; props: unknown }[] = [];
    const late = { ...host(opened), now: () => NOW + 86_400_000 };
    afterStreakScreen(late, { streak: STREAK }, { onPrimary: () => undefined }).onPrimary();
    const props = opened[0]?.props as { streak: { state: string; day: number }; week: { dateKey: string; today: boolean; played: boolean }[] };
    expect(props.streak).toMatchObject({ state: 'done', day: 2 });
    expect(props.week.find((c) => c.today)).toMatchObject({ dateKey: TODAY, played: true });
  });

  it('props wrapped again for the same win (an update) never show the screen a second time', () => {
    const opened: { id: OverlayId; props: unknown }[] = [];
    let pressed = 0;
    const win = { streak: STREAK };
    afterStreakScreen(host(opened), win, { onPrimary: () => void pressed++ }).onPrimary();
    afterStreakScreen(host(opened), win, { onPrimary: () => void pressed++ }).onPrimary();
    expect(opened).toHaveLength(1);
    expect(pressed).toBe(1);
    afterStreakScreen(host(opened), { streak: STREAK }, { onPrimary: () => void pressed++ }).onPrimary(); // another win
    expect(opened).toHaveLength(2);
  });

  it('not due: the props come back unchanged', () => {
    const base = { onPrimary: () => undefined };
    expect(afterStreakScreen(host([]), { streak: null }, base)).toBe(base);
    expect(afterStreakScreen(host([], mergeConfig({ dayStreak: { screenAfterWin: false } })), { streak: STREAK }, base)).toBe(base);
  });

  it('openStreakScreen (Home): mode \'home\', the given close callback', () => {
    const opened: { id: OverlayId; props: unknown }[] = [];
    let closed = 0;
    openStreakScreen(host(opened), 'home', () => void closed++, { hints: 3 });
    const props = opened[0]?.props as { mode: string; reward: unknown; onDone(): void };
    expect(props).toMatchObject({ mode: 'home', reward: null });
    props.onDone();
    expect(closed).toBe(1);
  });
});

describe('the session: the day\'s first counted win shows the screen between the victory and the next board', () => {
  const veteran = (s: SaveData): SaveData => ({ ...s, progress: { level: 15, completed: 14, best: {} }, ads: { lastAdAt: 0, lastFallbackGrantAt: 0 } });

  async function toVictory(h: Harness, level = 15): Promise<void> {
    await startLevel(h, level);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    await h.settle(h.config.fx.winButtonDelayMs);
  }

  it('primary → the streak screen (today lit, day 1); Continue → the interstitial gate → the next level', async () => {
    const h = createHarness({ save: veteran });
    await toVictory(h);
    expect(h.router.props.victory?.streak).toBeNull(); // dayStreak.victoryRow is off: the screen shows the day
    h.log.length = 0;
    h.router.props.victory?.onPrimary();
    expect(h.router.stack()).toEqual(['victory', 'streak']);
    const s = h.router.props.streak;
    expect(s).toMatchObject({ mode: 'win', best: 1, reward: null, streak: { state: 'done', day: 1, run: 1 } });
    expect(s?.week[0]).toMatchObject({ dateKey: TODAY, today: true, played: true });
    await h.settle(0);
    expect(slice(h.log, /^(ad:interstitial|screen:)/)).toEqual([]);
    s?.onDone();
    await h.settle(0);
    expect(slice(h.log, /^(ad:interstitial|screen:)/)).toEqual(['ad:interstitial:next_level', 'screen:game:L16']);
    expect(h.router.isOpen('streak')).toBe(false);
  });

  it('day 7: the screen carries the reward the win paid (already in stock)', async () => {
    const h = createHarness({ save: (s) => ({ ...veteran(s), dayStreak: runOf(6) }) });
    const before = h.save().stock;
    await toVictory(h);
    expect(h.save().stock).toEqual({ hints: before.hints + 2, kitties: before.kitties + 2 });
    h.router.props.victory?.onPrimary();
    expect(h.router.props.streak).toMatchObject({ mode: 'win', reward: { hints: 2, kitties: 2 }, streak: { state: 'done', day: 7, run: 7, rewardDay: true } });
    expect(h.router.props.streak?.week[6]).toMatchObject({ today: true, gift: true, paid: true });
  });

  it('the daily: the screen, then Continue runs the daily_done gate and starts the next level (UI batch: no Home)', async () => {
    const h = createHarness({ save: veteran });
    await h.session.start({ mode: 'daily', dateKey: TODAY });
    await h.settle(h.config.fx.boardEntryMs);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    h.log.length = 0;
    h.router.props.victory?.onPrimary();
    expect(h.router.isOpen('streak')).toBe(true);
    h.router.props.streak?.onDone();
    await h.settle(0);
    expect(slice(h.log, /^(ad:interstitial|goHome)/)).toEqual(['ad:interstitial:daily_done']);
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.log).toContain('screen:game:L15'); // the victory workstream: the daily's primary starts progress.level (15)
  });

  it('switch off or flag off: the primary goes straight on', async () => {
    for (const setup of [() => createHarness({ save: veteran, config: { dayStreak: { screenAfterWin: false } } }), () => (setFlagOverrides({ dayStreak: false }), createHarness({ save: veteran }))]) {
      const h = setup();
      await toVictory(h);
      h.router.props.victory?.onPrimary();
      await h.settle(0);
      expect(h.log).not.toContain('open:streak');
      expect(h.log).toContain('screen:game:L16');
      setFlagOverrides({});
    }
  });
});

describe('the shell: Home\'s streak pill opens the screen with a back arrow', () => {
  it('mode \'home\'; the back arrow closes it', () => {
    const h = createHarness({ save: (s) => ({ ...s, dayStreak: runOf(3) }) });
    const shell = createShell({
      store: h.store,
      bus: h.bus,
      clock: h.clock,
      router: h.router,
      platform: h.platform,
      saves: h.saves,
      session: () => h.session,
      audio: { setMuted: () => undefined },
      applyReducedMotion: () => false,
      version: 'test',
    });
    shell.showHome();
    expect(h.router.homeView?.streak).toMatchObject({ state: 'alive', run: 3 });
    h.router.homeCb?.onStreak?.();
    expect(h.router.isOpen('streak')).toBe(true);
    expect(h.router.props.streak).toMatchObject({ mode: 'home', reward: null, streak: { state: 'alive', run: 3 } });
    expect(h.router.toasts).toEqual([]);
    h.router.props.streak?.onDone();
    expect(h.router.isOpen('streak')).toBe(false);
    expect(h.router.screen()).toBe('home');
  });
});

describe('D-2e-25 review (N5): followStreakBand', () => {
  function host(config = cfg) {
    let state = app({ dayStreak: runOf(2, 0) }, { bannerReserved: true });
    const stack: OverlayId[] = [];
    const updates: { id: OverlayId; props: Record<string, unknown> }[] = [];
    const router = {
      open: (id: OverlayId) => void stack.push(id),
      update: (id: OverlayId, props: unknown) => void updates.push({ id, props: props as Record<string, unknown> }),
      isOpen: (id: OverlayId) => stack.includes(id),
    };
    return {
      h: { router, state: () => state, now: () => NOW, config },
      stack,
      updates,
      reserve(on: boolean) {
        state = { ...state, ui: { ...state.ui, bannerReserved: on } };
      },
    };
  }

  it("the open screen takes the store's reserve when it changed (once), everything else as opened", () => {
    const t = host();
    const done = vi.fn();
    openStreakScreen(t.h, 'home', done);
    followStreakBand(t.h); // no change: nothing
    expect(t.updates).toEqual([]);
    t.reserve(false); // a miss under it
    followStreakBand(t.h);
    expect(t.updates).toHaveLength(1);
    expect(t.updates[0]?.id).toBe('streak');
    expect(t.updates[0]?.props).toMatchObject({ mode: 'home', bannerReserved: false, onDone: done });
    followStreakBand(t.h); // nothing new
    expect(t.updates).toHaveLength(1);
  });

  it('nothing when the screen is not open, or with collapseWhenEmpty off (its band stays as opened)', () => {
    const closed = host();
    openStreakScreen(closed.h, 'home', () => undefined);
    closed.stack.length = 0;
    closed.reserve(false);
    followStreakBand(closed.h);
    expect(closed.updates).toEqual([]);
    const off = host(mergeConfig({ ads: { banner: { collapseWhenEmpty: false } } }));
    openStreakScreen(off.h, 'home', () => undefined);
    off.reserve(false);
    followStreakBand(off.h);
    expect(off.updates).toEqual([]);
  });
});
