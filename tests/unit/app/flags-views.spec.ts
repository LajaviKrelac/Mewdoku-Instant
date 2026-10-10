// Owner: C (Phase 2b; was app). Feature flags (02 §22) and the AppState → view-model selectors.
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_FLAGS, isFlagOn, parseFlagParam, setFlagOverrides } from '../../../src/app/flags';
import { initialAppState, type AppState, type SessionMeta } from '../../../src/app/store';
import { personalRecords, selectGameView, selectHomeView, selectVictoryView, type ViewContext } from '../../../src/app/views';
import type { WinSummary } from '../../../src/app/session-effects';
import { newGame } from '../../../src/game/factory';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import { tutorialPuzzle } from '../../../src/game/tutorial';
import type { Capabilities } from '../../../src/platform/types';
import { createHarness, levelPuzzle, NOW, startLevel, TODAY } from './harness';

const caps: Capabilities = {
  interstitial: false,
  rewarded: false,
  banner: false,
  cloudSave: false,
  leaderboards: false,
  share: false,
  payments: false,
  haptics: true,
  overlayViews: false,
  groups: false,
};
const ctx: ViewContext = { now: NOW, capabilities: caps, platformId: 'web' };

describe('flags', () => {
  afterEach(() => setFlagOverrides({}));

  it('defaults: the Phase 2 flags off; phase2b §10 events, banners, shop, rankings on and groupChallenges off', () => {
    expect(DEFAULT_FLAGS).toEqual({
      autoX: false,
      undo: false,
      forgivingMistakes: false,
      darkTheme: false,
      events: true,
      banners: true,
      shop: true,
      rankings: true,
      groupChallenges: false,
    });
    for (const id of Object.keys(DEFAULT_FLAGS) as (keyof typeof DEFAULT_FLAGS)[]) expect(isFlagOn(id)).toBe(DEFAULT_FLAGS[id]);
    setFlagOverrides(parseFlagParam('?flags=-events,groupChallenges'));
    expect(isFlagOn('events')).toBe(false);
    expect(isFlagOn('groupChallenges')).toBe(true);
  });

  it('parse ?flags= (unknown names ignored, "-" turns off)', () => {
    expect(parseFlagParam('?ads=ok&flags=undo,autoX,bogus')).toEqual({ undo: true, autoX: true });
    expect(parseFlagParam('flags=-undo%2CdarkTheme')).toEqual({ undo: false, darkTheme: true });
    expect(parseFlagParam('')).toEqual({});
    setFlagOverrides(parseFlagParam('?flags=undo'));
    expect(isFlagOn('undo')).toBe(true);
    expect(isFlagOn('autoX')).toBe(false);
  });
});

describe('selectHomeView', () => {
  it('maps level, hard badge, continue, stock and the daily card', () => {
    const save = { ...defaults(NOW), tutorialDone: true, progress: { level: 30, completed: 29, best: {} } };
    let v = selectHomeView({ ...initialAppState(save) }, ctx);
    expect(v).toMatchObject({ level: 30, hard: true, continueLevel: false, hints: 5, kitties: 3, showTrophy: false, fbSafeZone: false });
    expect(v.daily).toMatchObject({ state: 'not_played', dateKey: TODAY, n: 9, solvedMs: null, unlockLevel: 20 });
    const withSlot = {
      ...save,
      inProgress: { level: { id: 'L30' as const, mode: 'level' as const, cells: '', hearts: 3, revivesUsed: 0, mistakes: 0, hintsUsed: 0, kittiesUsed: 0, elapsedMs: 0, savedAt: 0 }, daily: null, event: null },
      daily: { [TODAY]: [252_000, 1, 0, 0] as [number, number, number, number] },
    };
    v = selectHomeView(initialAppState(withSlot), { ...ctx, platformId: 'fbig' });
    expect(v.continueLevel).toBe(true);
    expect(v.fbSafeZone).toBe(true);
    expect(v.daily).toMatchObject({ state: 'solved', solvedMs: 252_000 });
  });

  it('locks the daily until level 20 is done', () => {
    const save = { ...defaults(NOW), tutorialDone: true, progress: { level: 20, completed: 19, best: {} } };
    expect(selectHomeView(initialAppState(save), ctx).daily.state).toBe('locked');
  });
});

describe('selectGameView', () => {
  const state = (patch: Partial<AppState>): AppState => {
    const init = initialAppState(defaults(NOW));
    return { ...init, ui: { ...init.ui, inputLocked: false }, ...patch }; // the session unlocks on mount
  };

  it('is null without a game', () => {
    expect(selectGameView(state({}), ctx)).toBeNull();
  });

  it('locks the board outside PLAYING, under modal overlays and during ads', async () => {
    const h = createHarness();
    await h.session.start({ mode: 'level', level: 5 });
    const view = () => selectGameView(h.store.get(), ctx);
    expect(view()).toMatchObject({ status: 'ready', inputLocked: true, bulbEnabled: false });
    await startLevel(h);
    expect(view()).toMatchObject({ status: 'playing', inputLocked: false, bulbEnabled: true, pawEnabled: true, showHome: true });
    h.router.open('settings', {} as never);
    expect(view()?.inputLocked).toBe(true);
    h.router.close('settings');
    h.store.update((s) => ({ ...s, ui: { ...s.ui, adShowing: true } }));
    expect(view()?.inputLocked).toBe(true);
  });

  it('tutorial: no Home in the first run, free hints, coach highlight and chip', () => {
    const g = { ...newGame(tutorialPuzzle(), 'tutorial'), status: 'playing' as const };
    const meta = {
      request: { mode: 'tutorial' as const, replay: false },
      mode: 'tutorial' as const,
      puzzleId: g.puzzle.id,
      level: 1,
      dateKey: null,
      hard: false,
      colors: Uint8Array.from([4, 7, 2, 0]),
      tutorialStep: 1,
      substitute: false,
    };
    const v = selectGameView(state({ game: g, session: meta, overlays: ['coach'] }), ctx);
    expect(v).toMatchObject({ showHome: false, hintsFree: true, bulbEnabled: false, pawEnabled: false, inputLocked: false });
    expect(v?.highlight).toEqual({ kind: 'coach', cells: [1] });
    expect(v?.chipHighlight).toBe('colours');
    const step5 = selectGameView(state({ game: g, session: { ...meta, tutorialStep: 5 }, overlays: ['coach'] }), ctx);
    expect(step5?.bulbEnabled).toBe(true);
    const replay = selectGameView(state({ game: g, session: { ...meta, request: { mode: 'tutorial', replay: true } } }), ctx);
    expect(replay?.showHome).toBe(true);
    expect(levelPuzzle(2).n).toBe(5);
  });

  it('phase2c.1 §3.2.5: points = the attempt\'s running total where cats score, null (no counter) in the tutorial', () => {
    const meta = (mode: 'tutorial' | 'level' | 'daily'): SessionMeta => ({
      request: mode === 'tutorial' ? { mode, replay: false } : mode === 'daily' ? { mode, dateKey: TODAY } : { mode, level: 5 },
      mode,
      puzzleId: 'L5',
      level: mode === 'level' ? 5 : null,
      dateKey: mode === 'daily' ? TODAY : null,
      hard: false,
      colors: Uint8Array.from([0, 1, 2, 3, 4]),
      tutorialStep: null,
      substitute: false,
    });
    const tut = { ...newGame(tutorialPuzzle(), 'tutorial'), status: 'playing' as const };
    expect(selectGameView(state({ game: tut, session: { ...meta('tutorial'), tutorialStep: 1 } }), ctx)?.points).toBeNull();
    const lvl = { ...newGame(levelPuzzle(5), 'level'), status: 'playing' as const };
    expect(selectGameView(state({ game: lvl, session: meta('level') }), ctx)?.points).toBe(0);
    expect(selectGameView(state({ game: { ...lvl, levelPoints: 2_016, catStreak: 3 }, session: meta('level') }), ctx)?.points).toBe(2_016);
    const daily = { ...newGame(levelPuzzle(5), 'daily'), status: 'playing' as const, levelPoints: 576 };
    expect(selectGameView(state({ game: daily, session: meta('daily') }), ctx)?.points).toBe(576);
    // A board whose rules score nothing ({0, 0}: a mode dropped from levelPoints.modes) hides the counter.
    const off = { ...lvl, rules: { ...lvl.rules, points: { first: 0, step: 0 } } };
    expect(selectGameView(state({ game: off, session: meta('level') }), ctx)?.points).toBeNull();
  });
});

describe('phase2c.1 §3.2.5: the victory and the records (no streak anywhere)', () => {
  const app = (patch: Partial<SaveData> = {}): AppState => initialAppState({ ...defaults(NOW), ...patch });
  const win = (patch: Partial<WinSummary> = {}): WinSummary => ({
    mode: 'level',
    replay: false,
    restored: false,
    counted: true,
    level: 7,
    dateKey: null,
    hard: false,
    n: 8,
    ms: 60_000,
    mistakes: 0,
    hints: 0,
    kitties: 0,
    kept: 3,
    maxKept: 3,
    period: { kind: 'week', key: '2026-10-05', gained: 3, before: 0, total: 3 },
    pointsEarned: 7_296,
    pointsTotal: 7_296,
    event: null,
    ...patch,
  });

  it('selectVictoryView: pointsEarned is the level\'s total, counted or not; null for 0 and the tutorial; never a streak', () => {
    const v = selectVictoryView(app(), ctx, win(), { praise: 0 });
    expect(v.pointsEarned).toBe(7_296);
    expect(v).not.toHaveProperty('streak');
    expect(selectVictoryView(app(), ctx, win({ counted: false, period: { kind: 'week', key: '2026-10-05', gained: 0, before: 4, total: 4 } }), { praise: 0 }).pointsEarned).toBe(7_296);
    expect(selectVictoryView(app(), ctx, win({ pointsEarned: 0 }), { praise: 0 }).pointsEarned).toBeNull();
    expect(selectVictoryView(app(), ctx, win({ mode: 'tutorial', pointsEarned: 576, period: null }), { praise: 0 }).pointsEarned).toBeNull();
  });

  it('personalRecords (period board): This week, best week and Total points (points.total); no streak', () => {
    const r = personalRecords(app({ points: { total: 13_248 }, streak: { current: 4, best: 9 }, period: { key: '2026-10-05', total: 12, bestKey: '2026-09-28', bestTotal: 30 } }), ctx, { board: 'period', n: 8, thisMs: 1000 });
    expect(r).toMatchObject({ board: 'period', totalPoints: 13_248, period: { kind: 'week', total: 12, best: 30 } });
    expect(r).not.toHaveProperty('streak');
  });
});
