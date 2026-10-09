// Owner: C. Post-win ranking (phase2b §5.3–§5.5, §5.10): submit order and the client-side limits, the
// pending queue and its retry, the fetch deadline giving personal records, and "no fabricated rows":
// every list state carries only what the provider returned (rank, score), never a default name, rank
// or row; api 'none' and a board without an id both give personal records.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createEventBus, type AppEventMap, type RankResult } from '../../../src/app/events';
import { setFlagOverrides } from '../../../src/app/flags';
import { createRankingFlow, dayFilter, formatBoardScore, scoreView, type ListContext } from '../../../src/app/ranking-flow';
import { dayIndex } from '../../../src/game/scoring';
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

  it('daily_fastest keeps only the shown day: the overlay list filters its rows, and my entry of another day is not "my rank"', async () => {
    const p = provider({ overlay: true });
    const s = setup(p);
    const day = '2026-10-07';
    const today = (secs: number): number => dayIndex(day) * 100_000 + (99_999 - secs);
    const yesterday = (secs: number): number => (dayIndex(day) - 1) * 100_000 + (99_999 - secs);
    expect(await s.flow.showList('daily_fastest', 'Today', undefined, undefined, day)).toBe(true);
    const keep = p.lists[0]?.view.keep;
    expect(keep).toBeTypeOf('function');
    expect(keep?.(today(188))).toBe(true);
    expect(keep?.(yesterday(60))).toBe(false);
    // Other boards are not filtered.
    await s.flow.showList('paw_points', 'Paw points');
    expect(p.lists[1]?.view.keep).toBeUndefined();
    // dayFilter is the same rule; the default day is today's local date.
    expect(dayFilter('daily_fastest', day)?.(today(5))).toBe(true);
    expect(dayFilter('paw_points', day)).toBeUndefined();
    // The panel's "Your rank" only from an entry of the day shown.
    const r: RankResult = { board: 'daily_fastest', api: 'classic', mine: { rank: 3, score: yesterday(60), isMe: true }, top: [], ok: true };
    const daily: ListContext = { records: { ...records, board: 'daily' }, myScore: { kind: 'time', ms: 188_000 }, day };
    expect(s.flow.listState(r, daily)).toEqual({ kind: 'see_top', mine: { rank: null, score: { kind: 'time', ms: 188_000 }, count: null } });
    // Review FB2B-4: the board's own rank (2) counts other days' entries; it is never shown for the
    // daily. Without my entry among the day's rows: score only.
    const r2: RankResult = { ...r, mine: { rank: 2, score: today(150), isMe: true } };
    expect(s.flow.listState(r2, daily)).toEqual({ kind: 'see_top', mine: { rank: null, score: { kind: 'time', ms: 150_000 }, count: null } });
  });

  it('daily_fastest "Your rank" is my position among the shown day\'s entries, never the global rank (review FB2B-4)', () => {
    const s = setup(provider({ overlay: true }));
    const day = '2026-10-09';
    const at = (d: number, secs: number): number => (dayIndex(day) + d) * 100_000 + (99_999 - secs);
    // Twelve players in later time zones already posted tomorrow's daily; three of today are slower than me.
    const tomorrow = Array.from({ length: 12 }, (_, i): RankEntry => ({ rank: i + 1, score: at(1, 30 + i), isMe: false }));
    const top: RankEntry[] = [...tomorrow, { rank: 13, score: at(0, 4), isMe: true }, { rank: 14, score: at(0, 20), isMe: false }, { rank: 15, score: at(0, 40), isMe: false }];
    const r: RankResult = { board: 'daily_fastest', api: 'classic', mine: { rank: 13, score: at(0, 4), isMe: true }, top, ok: true };
    const ctx: ListContext = { records: { ...records, board: 'daily' }, myScore: { kind: 'time', ms: 3348 }, day };
    const state = s.flow.listState(r, ctx);
    expect(state.kind === 'see_top' && state.mine.rank).toBe(1);
    // A provider that already gives the day's band (numbered inside it): the same answer.
    const band: RankResult = { ...r, top: [{ rank: 1, score: at(0, 2), isMe: false }, { rank: 2, score: at(0, 4), isMe: true }] };
    const state2 = s.flow.listState(band, ctx);
    expect(state2.kind === 'see_top' && state2.mine.rank).toBe(2);
  });

  it('the solve just made shows one time: "Your score" is my own time, not the board\'s rounded-up second (review FB2B-7)', () => {
    const s = setup(provider({ overlay: true }));
    const day = '2026-10-09';
    const mineScore = dayIndex(day) * 100_000 + (99_999 - 4); // 3 348 ms posts as 4 s (ceil, §5.3)
    const r: RankResult = { board: 'daily_fastest', api: 'classic', mine: { rank: 1, score: mineScore, isMe: true }, top: [], ok: true };
    const ctx: ListContext = { records: { ...records, board: 'daily' }, myScore: { kind: 'time', ms: 3348 }, day };
    const state = s.flow.listState(r, ctx);
    expect(state.kind === 'see_top' && state.mine.score).toEqual({ kind: 'time', ms: 3348 }); // 0:03, as the headline
    // An older, better entry of the same day (not this solve) keeps the board's value.
    const older: RankResult = { ...r, mine: { rank: 1, score: mineScore + 1, isMe: true } };
    const state2 = s.flow.listState(older, ctx);
    expect(state2.kind === 'see_top' && state2.mine.score).toEqual({ kind: 'time', ms: 3000 });
    // Event boards: the same rule with the event encoding.
    const ev: RankResult = { board: 'event_lantern_walk_2026', api: 'classic', mine: { rank: 4, score: 3 * 1_000_000 + 999_999 - 401, isMe: true }, top: [], ok: true };
    const evCtx: ListContext = { records, myScore: { kind: 'event', solved: 3, total: 21, ms: 400_200 }, eventTotal: 21 };
    const state3 = s.flow.listState(ev, evCtx);
    expect(state3.kind === 'see_top' && state3.mine.score).toEqual({ kind: 'event', solved: 3, total: 21, ms: 400_200 });
  });

  it('fetch(daily_fastest) asks the provider for the shown day\'s band (keep), other boards unfiltered (review FB2B-4)', async () => {
    const p = provider();
    const keeps: (((score: number) => boolean) | undefined)[] = [];
    p.top = (board, n, keep) => (keeps.push(keep), Promise.resolve(p.topValue));
    const s = setup(p);
    await s.flow.fetch('daily_fastest', '2026-10-09');
    await s.flow.fetch('paw_points');
    expect(keeps[0]).toBeTypeOf('function');
    expect(keeps[0]?.(dayIndex('2026-10-09') * 100_000 + 5)).toBe(true);
    expect(keeps[0]?.((dayIndex('2026-10-09') + 1) * 100_000 + 5)).toBe(false);
    expect(keeps[1]).toBeUndefined();
  });

  it('a board the provider reports missing (supports() false, LEADERBOARD_NOT_FOUND) gives personal records, no list (review FB2B-6)', async () => {
    const p = provider({ overlay: true });
    let known = true;
    p.supports = () => known;
    p.top = async (board, n) => {
      p.calls.push(`top:${board}:${n}`);
      known = false; // the read found out
      return [];
    };
    const s = setup(p);
    const first = await s.flow.fetch('paw_points');
    expect(first.api).toBe('none');
    expect(s.flow.listState(first, { records, myScore: null }).kind).toBe('records');
    p.calls.length = 0;
    const again = await s.flow.fetch('paw_points');
    expect(again.api).toBe('none');
    expect(await s.flow.showList('paw_points', 'Paw points')).toBe(false);
    await s.flow.submit('paw_points', 10, 60_000);
    expect(p.calls).toEqual([]); // latched: no more provider calls for that board
  });

  it('flushPending skips the board just submitted (its newer score supersedes the queued one)', async () => {
    const p = provider();
    const s = setup(p, { rank: { pending: { daily_fastest: 1, paw_points: 2 }, lastSubmitAt: 0 } });
    await s.flow.flushPending({ except: 'paw_points' });
    expect(p.calls).toEqual(['submit:daily_fastest:1']);
    expect(s.save().rank.pending).toEqual({ paw_points: 2 });
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
    h.store.update((st) => ({ ...st, save: { ...st.save, rank: { pending: { daily_fastest: 27_899_812, paw_points: 20 }, lastSubmitAt: 0 } } }));
    await startLevel(h, 5);
    await h.settle(5000); // a plausible solve time (≥ rank.minSolveMs)
    winGame(h);
    await h.settle(0);
    // §5.5 steps 2 then 3: the new score's submit starts before mine/top read the board; the older
    // queued scores follow once it settled, except the same board's (the new score supersedes it).
    expect(p.calls.slice(0, 3)).toEqual(['submit:paw_points:45', 'mine:paw_points', 'top:paw_points:' + cfg.rank.fetchCount]);
    expect(p.calls).toContain('submit:daily_fastest:27899812');
    expect(p.calls).not.toContain('submit:paw_points:20');
    expect(h.save().rank.pending).toEqual({});
    await h.settle(cfg.fx.winOverlayDelayMs);
    expect(h.router.props.ranking?.list).toEqual({ kind: 'mine', mine: { rank: 1234, score: { kind: 'points', points: 1240 }, count: null } });
    expect(h.analytics).toContainEqual({ name: 'rank_panel', params: { board: 'paw_points', api: 'classic', ms: expect.any(Number), ok: 1 } });
  });
});
