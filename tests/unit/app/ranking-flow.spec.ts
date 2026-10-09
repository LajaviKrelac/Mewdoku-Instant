// Owner: C. Post-win ranking (phase2b §5.3–§5.5, §5.10): submit order and the client-side limits, the
// pending queue and its retry, the fetch deadline giving personal records, and "no fabricated rows":
// every list state carries only what the provider returned (rank, score), never a default name, rank
// or row; api 'none' and a board without an id both give personal records.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createEventBus, type AppEventMap, type RankResult } from '../../../src/app/events';
import { setFlagOverrides } from '../../../src/app/flags';
import { createRankingFlow, formatBoardScore, scoreView, type ListContext } from '../../../src/app/ranking-flow';
import { defaults } from '../../../src/game/save';
import type { BoardKey, SaveData } from '../../../src/game/types';
import type { RankEntry, RankingCaps, RankingProvider, RankListView } from '../../../src/platform/types';
import type { PersonalRecordsView } from '../../../src/ui/overlays/ranking-panel';
import { createHarness, startLevel, winGame, NOW } from './harness';

interface FakeProvider extends RankingProvider {
  capsValue: RankingCaps;
  calls: string[];
  submitResult: 'ok' | 'not_improved' | 'unsupported' | 'error';
  mineValue: RankEntry | null;
  topValue: RankEntry[];
  hang: boolean;
  lists: { board: BoardKey; view: RankListView; rect: DOMRect | undefined; closed: boolean }[];
  listResult: boolean;
}

function provider(caps: Partial<RankingCaps> = {}): FakeProvider {
  const p: FakeProvider = {
    capsValue: { api: 'classic', global: true, myRank: true, overlay: false, overlayInRect: false, ...caps },
    calls: [],
    submitResult: 'ok',
    mineValue: { rank: 1234, score: 1240, isMe: true },
    topValue: [
      { rank: 1, score: 9000, isMe: false },
      { rank: 2, score: 8000, isMe: false },
    ],
    hang: false,
    lists: [],
    listResult: true,
    caps: () => p.capsValue,
    submit: async (board, score) => {
      p.calls.push(`submit:${board}:${score}`);
      return p.submitResult;
    },
    mine: (board) => {
      p.calls.push(`mine:${board}`);
      return p.hang ? new Promise(() => undefined) : Promise.resolve(p.mineValue);
    },
    top: (board, n) => {
      p.calls.push(`top:${board}:${n}`);
      return p.hang ? new Promise(() => undefined) : Promise.resolve(p.topValue);
    },
    showList: async (board, view, rect) => {
      p.calls.push(`list:${board}:${rect ? 'rect' : 'full'}`);
      if (!p.listResult) return null;
      const entry = { board, view, rect, closed: false };
      p.lists.push(entry);
      return { close: () => void (entry.closed = true) };
    },
  };
  return p;
}

function setup(p: FakeProvider | undefined, save: Partial<SaveData> = {}) {
  const clock = createFakeClock(NOW);
  const bus = createEventBus<AppEventMap>();
  let state: SaveData = { ...defaults(NOW), ...save };
  let touches = 0;
  const results: RankResult[] = [];
  bus.on('rank:result', (r) => void results.push(r));
  const flow = createRankingFlow({
    platform: { ranking: p },
    clock,
    bus,
    save: () => state,
    updateSave: (fn) => {
      state = fn(state);
    },
    touch: () => void touches++,
  });
  return { clock, flow, save: () => state, touches: () => touches, results };
}

const records: PersonalRecordsView = { board: 'points', thisMs: 60_000, n: 8, bestSizeMs: null, totalPoints: 1240, levelsSolved: 40, event: null };
const ctx: ListContext = { records, myScore: { kind: 'points', points: 1240 } };

describe('submit (§5.3, §5.5)', () => {
  it('submits when the limits allow and stamps lastSubmitAt', async () => {
    const p = provider();
    const s = setup(p);
    await s.flow.submit('paw_points', 1240, 60_000);
    expect(p.calls).toEqual(['submit:paw_points:1240']);
    expect(s.save().rank).toEqual({ pending: {}, lastSubmitAt: NOW });
  });

  it('a solve under 3 s or over 24 h is never submitted nor queued', async () => {
    const p = provider();
    const s = setup(p);
    await s.flow.submit('paw_points', 10, 2999);
    await s.flow.submit('paw_points', 10, 86_400_001);
    expect(p.calls).toEqual([]);
    expect(s.save().rank.pending).toEqual({});
  });

  it('within 10 s of the last submit the score waits in rank.pending; the next win or boot retries it', async () => {
    const p = provider();
    const s = setup(p, { rank: { pending: {}, lastSubmitAt: NOW - 5000 } });
    await s.flow.submit('daily_fastest', 27_899_812, 60_000);
    expect(p.calls).toEqual([]);
    expect(s.save().rank.pending).toEqual({ daily_fastest: 27_899_812 });
    expect(s.touches()).toBe(1);
    await s.flow.flushPending();
    expect(p.calls).toEqual(['submit:daily_fastest:27899812']);
    expect(s.save().rank.pending).toEqual({});
  });

  it('a failed submit is queued; not_improved is fine; unsupported (no board id) is dropped for good', async () => {
    const p = provider();
    const s = setup(p);
    p.submitResult = 'error';
    await s.flow.submit('paw_points', 50, 60_000);
    expect(s.save().rank.pending).toEqual({ paw_points: 50 });
    p.submitResult = 'not_improved';
    s.clock.advance(cfg.rank.submitMinIntervalMs);
    await s.flow.submit('paw_points', 60, 60_000);
    expect(s.save().rank.pending).toEqual({});
    p.submitResult = 'unsupported';
    s.clock.advance(cfg.rank.submitMinIntervalMs);
    await s.flow.submit('event_lantern_walk_2026', 1_000_000, 60_000);
    s.clock.advance(cfg.rank.submitMinIntervalMs);
    await s.flow.submit('event_lantern_walk_2026', 2_000_000, 60_000);
    expect(p.calls.filter((c) => c.startsWith('submit:event'))).toHaveLength(1);
    expect(s.save().rank.pending).toEqual({});
  });

  it('without a provider (web) nothing is submitted or queued', async () => {
    const s = setup(undefined);
    await s.flow.submit('paw_points', 50, 60_000);
    expect(s.save().rank).toEqual({ pending: {}, lastSubmitAt: 0 });
  });
});

describe('fetch and the list states (§2.4, §5.4)', () => {
  it('classic API, no overlay: my rank and the provider\'s score ("Your rank: #1 234")', async () => {
    const p = provider();
    const s = setup(p);
    const r = await s.flow.fetch('paw_points');
    expect(r).toEqual({ board: 'paw_points', api: 'classic', mine: p.mineValue, top: p.topValue, ok: true });
    expect(s.results).toEqual([r]);
    expect(s.flow.listState(r, ctx)).toEqual({ kind: 'mine', mine: { rank: 1234, score: { kind: 'points', points: 1240 }, count: null } });
  });

  it('NEZP (no myRank): no rank, my own known score ("Your score")', async () => {
    const p = provider({ api: 'nezp', myRank: false });
    const s = setup(p);
    const r = await s.flow.fetch('paw_points');
    expect(p.calls).toEqual(['top:paw_points:50']); // mine() is never asked
    expect(s.flow.listState(r, ctx)).toEqual({ kind: 'mine', mine: { rank: null, score: { kind: 'points', points: 1240 }, count: null } });
  });

  it('overlay views: "See top players" (fullscreen), or the overlay in the list rect', async () => {
    const full = setup(provider({ overlay: true }));
    expect(full.flow.listState(await full.flow.fetch('paw_points'), ctx).kind).toBe('see_top');
    const rect = setup(provider({ overlay: true, overlayInRect: true }));
    expect(rect.flow.listState(await rect.flow.fetch('paw_points'), ctx)).toEqual({ kind: 'overlay' });
  });

  it('a fetch past rank.fetchTimeoutMs gives the personal records with rank.unavailable', async () => {
    const p = provider();
    p.hang = true;
    const s = setup(p);
    const pending = s.flow.fetch('paw_points');
    await s.clock.advanceAsync(cfg.rank.fetchTimeoutMs);
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(s.flow.listState(r, ctx)).toEqual({ kind: 'records', records, reason: 'unavailable' });
  });

  it("api 'none', no provider, and a board without an id all give personal records (rank.localOnly)", async () => {
    const none = setup(provider({ api: 'none', global: false, myRank: false }));
    expect(none.flow.listState(await none.flow.fetch('paw_points'), ctx)).toEqual({ kind: 'records', records, reason: 'local' });
    const web = setup(undefined);
    const r = await web.flow.fetch('paw_points');
    expect(r.api).toBe('local');
    expect(web.flow.listState(r, ctx)).toEqual({ kind: 'records', records, reason: 'local' });
    const p = provider();
    p.submitResult = 'unsupported';
    const noId = setup(p);
    await noId.flow.submit('event_snow_paws_2026', 1, 60_000);
    const r2 = await noId.flow.fetch('event_snow_paws_2026');
    expect(noId.flow.listState(r2, ctx).kind).toBe('records');
  });

  it('no fabricated rows: list states never carry rows, and my line only carries what the API or my save says', async () => {
    const shapes = new Set<string>();
    for (const caps of [{}, { api: 'nezp' as const, myRank: false }, { overlay: true }, { overlay: true, overlayInRect: true }]) {
      const p = provider(caps);
      p.mineValue = null;
      p.topValue = [];
      const s = setup(p);
      const state = s.flow.listState(await s.flow.fetch('paw_points'), { records, myScore: null });
      shapes.add(state.kind);
      expect(JSON.stringify(state)).not.toMatch(/rows|name|player|entries/i);
      if (state.kind === 'mine' || state.kind === 'see_top') expect(state.mine).toEqual({ rank: null, score: null, count: null });
    }
    expect([...shapes].sort()).toEqual(['mine', 'overlay', 'see_top']);
  });

  it('showList passes our formatter and the rect only when the provider can place it; closeList closes it', async () => {
    const p = provider({ overlay: true });
    const s = setup(p);
    expect(await s.flow.showList('paw_points', 'Paw points', { x: 0 } as DOMRect)).toBe(true);
    expect(p.calls).toEqual(['list:paw_points:full']);
    const list = p.lists[0];
    expect(list?.view).toMatchObject({ title: 'Paw points', scoreFormat: 'points', highlightMe: true, count: cfg.rank.topCount });
    expect(list?.view.formatScore(1240)).toBe('1,240 points');
    s.flow.closeList();
    expect(list?.closed).toBe(true);
    p.listResult = false;
    expect(await s.flow.showList('paw_points', 'x')).toBe(false);
    setFlagOverrides({ rankings: false });
    try {
      expect(await s.flow.showList('paw_points', 'x')).toBe(false);
      expect((await s.flow.fetch('paw_points')).api).toBe('local');
    } finally {
      setFlagOverrides({});
    }
  });

  it('score views and texts decode our encodings', () => {
    expect(scoreView('daily_fastest', 278 * 100_000 + (99_999 - 188), undefined)).toEqual({ kind: 'time', ms: 188_000 });
    expect(formatBoardScore('daily_fastest', 278 * 100_000 + (99_999 - 188), undefined)).toBe('3:08');
    expect(scoreView('event_lantern_walk_2026', 13_000_000 + 999_999 - 3601, 21)).toEqual({ kind: 'event', solved: 13, total: 21, ms: 3_601_000 });
    expect(formatBoardScore('event_lantern_walk_2026', 13_000_000, 21)).toBe('13 / 21 solved');
  });
});

describe('session: submit at WON, panel at 4.5 s (§5.5)', () => {
  it('the points board receives points.total; the panel shows my rank from the provider', async () => {
    const p = provider();
    const h = createHarness({
      extra: (parts) =>
        ({
          rankings: createRankingFlow({
            platform: { ranking: p },
            clock: parts.clock,
            bus: parts.bus,
            save: () => parts.store.get().save,
            updateSave: (fn) => parts.store.update((st) => ({ ...st, save: fn(st.save) })),
            touch: () => parts.saves.touch(),
          }),
        }),
    });
    await startLevel(h, 5);
    await h.settle(5000); // a plausible solve time (≥ rank.minSolveMs)
    winGame(h);
    await h.settle(0);
    expect(p.calls).toContain('submit:paw_points:45');
    expect(p.calls).toContain('mine:paw_points');
    await h.settle(cfg.fx.winOverlayDelayMs);
    expect(h.router.props.ranking?.list).toEqual({ kind: 'mine', mine: { rank: 1234, score: { kind: 'points', points: 1240 }, count: null } });
    expect(h.analytics).toContainEqual({ name: 'rank_panel', params: { board: 'paw_points', api: 'classic', ms: expect.any(Number), ok: 1 } });
  });
});
