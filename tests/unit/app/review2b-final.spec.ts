// Owner: lead (Phase 2b final integration). The review items the fixer groups handed over for files
// they did not own, each pinned here: L2B-3 (2b; moot in 2c: no victory fish pill), PAR-8 (the
// board-entry cue), PERF-3 (the screen turns inert at the scrim step, released when the board goes),
// FB2B-7 (my own overlay-list row shows my exact time) and ROB-1 (the event flow's loader names its
// stylesheet).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRankingFlow } from '../../../src/app/ranking-flow';
import { panelAt } from '../../../src/app/win-flow';
import { encodeDailyScore } from '../../../src/game/scoring';
import { encodeCells, defaults } from '../../../src/game/save';
import type { InProgressV2, SaveData } from '../../../src/game/types';
import type { RankListView, RankingProvider } from '../../../src/platform/types';
import { createHarness, NOW, SOL5, startLevel, tapRanking, TODAY, winGame, WRONG5 } from './harness';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('L2B-3 (2b) is moot in 2c: the victory has no fish pill, no "+" and no wallet to follow (phase2c §2.7)', () => {
  it('the open victory never follows a save change for fish, and has no shop callback', async () => {
    const h = createHarness();
    await startLevel(h);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    expect(h.router.isOpen('victory')).toBe(true);
    const props = h.router.props.victory;
    expect(props).not.toHaveProperty('onShop');
    expect(props).not.toHaveProperty('fish');
    // A save change (stock from a purchase elsewhere) does not re-render the victory.
    h.store.update((s) => ({ ...s, save: { ...s.save, stock: { hints: 99, kitties: 99 } } }));
    expect(h.router.props.victory).toBe(props);
  });
});

describe('PAR-8: the board-entry cue', () => {
  const sfx = (log: readonly string[]): string[] => log.filter((l) => l === 'sfx:board_in');

  it("plays 'board_in' with a fresh board's entry wave and again on Retry", async () => {
    const h = createHarness();
    await h.session.start({ mode: 'level', level: 5 });
    expect(h.router.game?.entries).toBe(1);
    expect(sfx(h.log)).toEqual(['sfx:board_in']);
    await h.settle(h.config.fx.boardEntryMs);
    for (const cell of WRONG5.slice(0, 3)) {
      h.session.onCellDoubleTap(cell);
      await h.settle(h.config.input.cellLockAfterCatMs);
    }
    await h.settle(h.config.fx.failOverlayDelayMs);
    expect(h.game().status).toBe('lost');
    await h.session.onRetry();
    await h.settle(0);
    expect(h.router.game?.entries).toBe(2);
    expect(sfx(h.log)).toEqual(['sfx:board_in', 'sfx:board_in']);
  });

  it('a restored won or lost board does not enter, so it plays no cue', async () => {
    const slot = (cells: Record<number, number>, mistakes: number): InProgressV2 => {
      const arr = new Uint8Array(25);
      for (const [i, v] of Object.entries(cells)) arr[Number(i)] = v;
      return { id: 'L25', mode: 'level', cells: encodeCells(arr), hearts: 3 - mistakes, revivesUsed: 0, mistakes, hintsUsed: 0, kittiesUsed: 0, elapsedMs: 9000, savedAt: NOW - 1000 };
    };
    const base = (s: InProgressV2): SaveData => ({ ...defaults(NOW - 86_400_000), tutorialDone: true, progress: { level: 25, completed: 24, best: {} }, inProgress: { level: s, daily: null, event: null } });
    const full: Record<number, number> = {};
    for (const c of SOL5) full[c] = 2;
    const won = createHarness({ save: () => base(slot(full, 0)) });
    await won.session.start({ mode: 'level', level: 25 });
    await won.settle(0);
    expect(won.game().status).toBe('won');
    expect(sfx(won.log)).toEqual([]);
    const lostCells: Record<number, number> = {};
    for (const c of WRONG5.slice(0, 3)) lostCells[c] = 3;
    const lost = createHarness({ save: () => base(slot(lostCells, 3)) });
    await lost.session.start({ mode: 'level', level: 25 });
    expect(lost.game().status).toBe('lost');
    expect(sfx(lost.log)).toEqual([]);
  });
});

describe('PERF-3: the screen turns inert at the scrim step, ahead of the ranking panel', () => {
  // Phase 2c §2.2: the scrim comes fx.win.scrimLeadMs before panelAt(N) (a perfect win keeps 3 fish).
  it('reserveModal() at the scrim, panelAt(3) − scrimLeadMs (after showScrim); releaseModal() when the board goes', async () => {
    const h = createHarness();
    const calls: string[] = [];
    Object.assign(h.router, {
      reserveModal: () => void calls.push(`reserve@${h.router.game?.scrims ?? 0}`),
      releaseModal: () => void calls.push('release'),
    });
    await startLevel(h);
    calls.length = 0;
    winGame(h);
    const scrimAt = panelAt(3, h.config) - h.config.fx.win.scrimLeadMs;
    await h.settle(scrimAt - 1);
    expect(calls).toEqual([]);
    await h.settle(1);
    expect(calls).toEqual(['reserve@1']); // the scrim is already up
    await h.settle(h.config.fx.win.scrimLeadMs);
    expect(h.router.isOpen('ranking')).toBe(true);
    h.session.onHome();
    expect(calls).toContain('release');
  });
});

describe('FB2B-7: my own row in the FB overlay list shows my exact time', () => {
  it('formatMine shows the solve just made as the panel does; other days and players keep the board value', async () => {
    let shown: RankListView | null = null;
    const provider: RankingProvider = {
      caps: () => ({ api: 'classic', myRank: true, overlay: true, overlayInRect: false }) as ReturnType<RankingProvider['caps']>,
      submit: async () => 'ok',
      mine: async () => null,
      top: async () => [],
      showList: async (_board, view) => {
        shown = view;
        return { close: () => undefined };
      },
      supports: () => true,
    };
    const h = createHarness({ caps: { leaderboards: true, overlayViews: true } });
    const flow = createRankingFlow({
      platform: { ranking: provider },
      clock: h.clock,
      bus: h.bus,
      save: () => h.save(),
      updateSave: (fn) => h.store.update((s) => ({ ...s, save: fn(s.save) })),
      touch: () => undefined,
    });
    const board = h.config.rank.boards.daily;
    expect(await flow.showList(board, 'Daily', undefined, undefined, { day: TODAY }, { kind: 'time', ms: 3300 })).toBe(true);
    const view = shown as RankListView | null;
    expect(view?.formatMine).toBeTypeOf('function');
    const mine = encodeDailyScore(TODAY, 3300, h.config); // the board keeps whole seconds (0:04)
    expect(view?.formatScore(mine)).toBe('0:04');
    expect(view?.formatMine?.(mine)).toBe('0:03');
    const other = encodeDailyScore(TODAY, 9000, h.config);
    expect(view?.formatMine?.(other)).toBe(view?.formatScore(other));
    // Without my score (the hub) there is no override.
    shown = null;
    await flow.showList(board, 'Daily', undefined, undefined, { day: TODAY });
    expect((shown as RankListView | null)?.formatMine).toBeUndefined();
  });
});

describe('ROB-1: the event flow loads its chunk with the stylesheet pattern', () => {
  it('the default loader passes { css: /events-chunk-…\\.css/ } to loadChunk', async () => {
    vi.resetModules();
    const seen: unknown[] = [];
    vi.doMock('../../../src/workers/lazy-chunk', async (orig) => ({
      ...(await orig<typeof import('../../../src/workers/lazy-chunk')>()),
      loadChunk: (_load: unknown, opts?: unknown) => {
        seen.push(opts);
        return Promise.resolve({});
      },
    }));
    const { createEventFlow, bundledEventDefs } = await import('../../../src/app/event-flow');
    const { createStore, initialAppState } = await import('../../../src/app/store');
    const store = createStore(initialAppState(defaults(NOW)));
    const flow = createEventFlow({ store, defs: bundledEventDefs(), now: () => NOW });
    await flow.preload();
    vi.doUnmock('../../../src/workers/lazy-chunk');
    const opts = seen[0] as { css?: RegExp } | undefined;
    expect(opts?.css).toBeInstanceOf(RegExp);
    expect(opts?.css?.test('assets/events-chunk-AbC_12-x.css')).toBe(true);
    expect(opts?.css?.test('assets/overlay-chunk-AbC.css')).toBe(false);
  });
});
