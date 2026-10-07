// Owner: app. Feature flags (02 §22) and the AppState → view-model selectors.
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_FLAGS, isFlagOn, parseFlagParam, setFlagOverrides } from '../../../src/app/flags';
import { initialAppState, type AppState } from '../../../src/app/store';
import { selectGameView, selectHomeView, type ViewContext } from '../../../src/app/views';
import { newGame } from '../../../src/game/factory';
import { defaults } from '../../../src/game/save';
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
};
const ctx: ViewContext = { now: NOW, capabilities: caps, platformId: 'web' };

describe('flags', () => {
  afterEach(() => setFlagOverrides({}));

  it('are all off by default', () => {
    for (const id of Object.keys(DEFAULT_FLAGS) as (keyof typeof DEFAULT_FLAGS)[]) expect(isFlagOn(id)).toBe(false);
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
      inProgress: { level: { id: 'L30' as const, mode: 'level' as const, cells: '', hearts: 3, revivesUsed: 0, mistakes: 0, hintsUsed: 0, kittiesUsed: 0, elapsedMs: 0, savedAt: 0 }, daily: null },
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
});
