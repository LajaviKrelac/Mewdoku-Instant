// Owner: C (Phase 2b; was app). Feature flags (02 §22) and the AppState → view-model selectors.
// Phase 2d (G1, docs/phase2d/look-spec.md §4.3, §5.1): the game view's pulse (rule 'auto' and the
// pinned targets), the mouse (shown / enabled), videoRefill, bannerBand and the gear's dot (game,
// Home, event screen).
import { afterEach, describe, expect, it } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import { DEFAULT_FLAGS, isFlagOn, parseFlagParam, setFlagOverrides } from '../../../src/app/flags';
import { initialAppState, type AppState, type SessionMeta } from '../../../src/app/store';
import { personalRecords, selectEventView, selectGameView, selectHomeView, selectPulse, selectVictoryView, untouchedBoard, type ViewContext } from '../../../src/app/views';
import { bundledEventDefs } from '../../../src/app/event-flow';
import { CellState, type GameState } from '../../../src/game/types';
import type { WinSummary } from '../../../src/app/session-effects';
import { eventStart } from '../../../src/game/events';
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
      colors: Uint8Array.from([3, 7, 2, 0]),
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

// ─────────────────────────── phase 2d §4.3: the new game-view fields ───────────────────────────

describe('phase 2d §4.3: pulse, mouse, videoRefill, bannerBand, settingsDot', () => {
  const base = (patch: Partial<AppState> = {}): AppState => {
    const init = initialAppState({ ...defaults(NOW), tutorialDone: true, progress: { level: 15, completed: 14, best: {} } });
    return { ...init, ui: { ...init.ui, inputLocked: false }, ...patch };
  };
  const meta = (patch: Partial<SessionMeta> = {}): SessionMeta => ({
    request: { mode: 'level', level: 15 },
    mode: 'level',
    puzzleId: 'L15',
    level: 15,
    dateKey: null,
    hard: false,
    colors: Uint8Array.from([0, 1, 2, 3, 5]),
    tutorialStep: null,
    substitute: false,
    ...patch,
  });
  const playingGame = (): GameState => ({ ...newGame(levelPuzzle(15), 'level'), status: 'playing' });
  const marked = (g: GameState, cell: number, v: number = CellState.Mark): GameState => {
    const cells = g.cells.slice();
    cells[cell] = v;
    return { ...g, cells };
  };
  const view = (st: AppState, c = ctx, config = mergeConfig({})) => selectGameView(st, c, config);
  const rewardCtx: ViewContext = { ...ctx, capabilities: { ...caps, rewarded: true } };

  describe("pulse (§1.11, D-2d-11): rule 'auto'", () => {
    it('the kitty while the board is untouched; the bulb after a mark, a cat or a wrong cell', () => {
      const g = playingGame();
      expect(untouchedBoard(g)).toBe(true);
      expect(view(base({ game: g, session: meta() }))?.pulse).toBe('paw');
      expect(view(base({ game: marked(g, 1), session: meta() }))?.pulse).toBe('bulb');
      expect(view(base({ game: marked(g, 0, CellState.Cat), session: meta() }))?.pulse).toBe('bulb');
      expect(view(base({ game: marked(g, 1, CellState.Wrong), session: meta() }))?.pulse).toBe('bulb');
      // A given cat is part of the puzzle, not a move: the board is still untouched.
      expect(untouchedBoard(marked(g, 0, CellState.Given))).toBe(true);
      // Clearing every mark makes it untouched again (the rule reads the board, not the move log).
      expect(view(base({ game: { ...marked(g, 1), cells: g.cells }, session: meta() }))?.pulse).toBe('paw');
    });

    it('null outside PLAYING, under any overlay (modal, hint card, O2, coach), in the tutorial and in the win flow', () => {
      const g = playingGame();
      for (const status of ['ready', 'hint', 'kitty', 'won', 'lost'] as const) {
        expect(view(base({ game: { ...g, status }, session: meta() }))?.pulse).toBeNull();
      }
      for (const id of ['settings', 'hint', 'rewarded', 'coach', 'fail', 'ranking', 'victory'] as const) {
        expect(view(base({ game: g, session: meta(), overlays: [id] }))?.pulse).toBeNull();
      }
      const tut = { ...newGame(tutorialPuzzle(), 'tutorial'), status: 'playing' as const };
      const tutMeta = meta({ request: { mode: 'tutorial', replay: false }, mode: 'tutorial', puzzleId: 'T1', level: 1, tutorialStep: 5 });
      expect(view(base({ game: tut, session: tutMeta }))?.pulse).toBeNull();
      expect(view(base({ game: tut, session: { ...tutMeta, tutorialStep: null, request: { mode: 'tutorial', replay: true } } }))?.pulse).toBeNull();
      // From WON until the ranking panel the chrome is locked: no pulse either.
      expect(view(base({ game: g, session: meta() }), { ...ctx, chromeLocked: true })?.pulse).toBeNull();
    });

    it('only while the target is enabled: an ad, a helper flow (input lock) or the kitty not allowed → none', () => {
      const g = playingGame();
      expect(view(base({ game: g, session: meta(), ui: { ...base().ui, adShowing: true } }))?.pulse).toBeNull();
      expect(view(base({ game: g, session: meta(), ui: { ...base().ui, inputLocked: true } }))?.pulse).toBeNull();
      // The chosen helper disabled: no fallback to the other one.
      expect(selectPulse(base({ game: g, session: meta() }), {}, { paw: false, bulb: true })).toBeNull();
      expect(selectPulse(base({ game: marked(g, 1), session: meta() }), {}, { paw: true, bulb: false })).toBeNull();
      expect(selectPulse(base({ game: marked(g, 1), session: meta() }), {}, { paw: true, bulb: true })).toBe('bulb');
    });

    it('reduced motion: no pulse', () => {
      const g = playingGame();
      expect(view(base({ game: g, session: meta(), ui: { ...base().ui, reducedMotion: true } }))?.pulse).toBeNull();
    });

    it("'kitty', 'bulb' pin one helper and 'off' stops it (fx.helperPulse.target via mergeConfig)", () => {
      const g = playingGame();
      const m = marked(g, 1);
      const at = (target: 'kitty' | 'bulb' | 'off' | 'auto', game: GameState) =>
        view(base({ game, session: meta() }), ctx, mergeConfig({ fx: { helperPulse: { target } } }))?.pulse;
      expect([at('kitty', g), at('kitty', m)]).toEqual(['paw', 'paw']);
      expect([at('bulb', g), at('bulb', m)]).toEqual(['bulb', 'bulb']);
      expect([at('off', g), at('off', m)]).toEqual([null, null]);
      expect([at('auto', g), at('auto', m)]).toEqual(['paw', 'bulb']);
    });
  });

  describe('mouse (§1.12)', () => {
    it('shown in levels, dailies and events (the modes that allow the kitty); enabled while the tools are ready and a tile is left', () => {
      const g = playingGame();
      expect(view(base({ game: g, session: meta() }))?.mouse).toEqual({ shown: true, enabled: true });
      const daily = meta({ request: { mode: 'daily', dateKey: TODAY }, mode: 'daily', level: null, dateKey: TODAY });
      expect(view(base({ game: { ...g, mode: 'daily' }, session: daily }))?.mouse).toEqual({ shown: true, enabled: true });
      const def = bundledEventDefs()[0];
      const ev = meta({ mode: 'event', level: null, ...(def ? { request: { mode: 'event', eventId: def.id, index: 0 }, event: { def, index: 0 } } : {}) });
      expect(view(base({ game: { ...g, mode: 'event' }, session: ev }))?.mouse).toEqual({ shown: true, enabled: true });
    });

    it('shown but disabled: not playing, a modal or the hint card open, an ad, a flow running, no tile left to cross out', () => {
      const g = playingGame();
      expect(view(base({ game: { ...g, status: 'ready' }, session: meta() }))?.mouse).toEqual({ shown: true, enabled: false });
      expect(view(base({ game: g, session: meta(), overlays: ['settings'] }))?.mouse).toEqual({ shown: true, enabled: false });
      expect(view(base({ game: g, session: meta(), overlays: ['rewarded'] }))?.mouse?.enabled).toBe(false);
      expect(view(base({ game: g, session: meta(), ui: { ...base().ui, adShowing: true } }))?.mouse?.enabled).toBe(false);
      expect(view(base({ game: g, session: meta(), ui: { ...base().ui, inputLocked: true } }))?.mouse?.enabled).toBe(false);
      // Every non-solution tile crossed out: nothing left for the mouse.
      const cells = g.cells.slice();
      const { n, solution } = g.puzzle;
      for (let i = 0; i < cells.length; i++) if (solution[Math.floor(i / n)] !== i % n) cells[i] = CellState.Mark;
      expect(view(base({ game: { ...g, cells }, session: meta() }))?.mouse).toEqual({ shown: true, enabled: false });
    });

    it('never in the tutorial (any step, first run or replay); hidden everywhere with cfg.mouse.enabled off', () => {
      const tut = { ...newGame(tutorialPuzzle(), 'tutorial'), status: 'playing' as const };
      const tutMeta = meta({ request: { mode: 'tutorial', replay: false }, mode: 'tutorial', puzzleId: 'T1', level: 1 });
      for (const step of [1, 2, 3, 4, 5, 6, null]) {
        expect(view(base({ game: tut, session: { ...tutMeta, tutorialStep: step } }))?.mouse).toEqual({ shown: false, enabled: false });
      }
      expect(view(base({ game: tut, session: { ...tutMeta, request: { mode: 'tutorial', replay: true } } }))?.mouse?.shown).toBe(false);
      const off = mergeConfig({ mouse: { enabled: false } });
      expect(view(base({ game: playingGame(), session: meta() }), ctx, off)?.mouse).toEqual({ shown: false, enabled: false });
    });
  });

  it('videoRefill: a rewarded video can refill (ads.enabled and capabilities().rewarded)', () => {
    const st = base({ game: playingGame(), session: meta() });
    expect(view(st)?.videoRefill).toBe(false); // web: no rewarded ads
    expect(view(st, rewardCtx)?.videoRefill).toBe(true);
    expect(view(st, rewardCtx, mergeConfig({ ads: { enabled: false } }))?.videoRefill).toBe(false);
  });

  it('bannerBand: decided at mount (SessionMeta.bannerBand); No Ads takes it away', () => {
    const g = playingGame();
    expect(view(base({ game: g, session: meta() }))?.bannerBand).toBe(false);
    expect(view(base({ game: g, session: meta({ bannerBand: false }) }))?.bannerBand).toBe(false);
    const st = base({ game: g, session: meta({ bannerBand: true }) });
    expect(view(st)?.bannerBand).toBe(true);
    expect(view({ ...st, save: { ...st.save, purchases: { noAds: true, tokens: [] } } })?.bannerBand).toBe(false);
  });

  it('settingsDot: save.ext.settingsSeen below settingsDot.version, on the game, Home and the event screen', () => {
    const g = playingGame();
    const def = bundledEventDefs()[0];
    const evCtx: ViewContext = { ...ctx, now: def ? eventStart(def) + 1 : NOW };
    const at = (ext: Record<string, unknown>, config = mergeConfig({})) => {
      const st = base({ game: g, session: meta() });
      const s2 = { ...st, save: { ...st.save, ext } };
      return [
        view(s2, ctx, config)?.settingsDot,
        selectHomeView(s2, ctx, config).settingsDot,
        def ? selectEventView(s2, evCtx, def, config)?.settingsDot : undefined,
      ];
    };
    const both = (v: boolean) => (def ? [v, v, v] : [v, v, undefined]);
    expect(at({})).toEqual(both(true)); // never opened (absent = 0) < version 1
    expect(at({ settingsSeen: 0 })).toEqual(both(true));
    expect(at({ settingsSeen: 1 })).toEqual(both(false));
    expect(at({ settingsSeen: 2 })).toEqual(both(false));
    expect(at({ settingsSeen: 'x' })).toEqual(both(true)); // invalid counts as 0
    expect(at({ settingsSeen: 1 }, mergeConfig({ settingsDot: { version: 2 } }))).toEqual(both(true)); // a newer Settings change
    expect(at({}, mergeConfig({ settingsDot: { version: 0 } }))).toEqual(both(false)); // 0 turns the dot off
  });
});
