// Owner: C (Phase 2b). Phase 2c (G1, docs/phase2c/fish-lives-spec.md §4): the period board read in its
// band (bandFilter), "Your rank" from the band's boardRank offset (exact at any depth) or the position
// inside the band, a win's boards submitted as ONE batch under one limiter check (submitAll), a
// pending score of an older period still flushed, paw_points retired and daily_fastest off by default.
// Post-win ranking (phase2b §5.3–§5.5, §5.10): submit order and the client-side limits, the
// pending queue and its retry, the fetch deadline giving personal records, and "no fabricated rows":
// every list state carries only what the provider returned (rank, score), never a default name, rank
// or row; api 'none' and a board without an id both give personal records.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig } from '../../../src/app/config';
import { createEventBus, type AppEventMap, type RankResult } from '../../../src/app/events';
import { setFlagOverrides } from '../../../src/app/flags';
import { bandFilter, createRankingFlow, dayFilter, formatBoardScore, formatScoreView, scoreView, type ListContext } from '../../../src/app/ranking-flow';
import { bundledEventDefs } from '../../../src/app/event-flow';
import { eventStart, type EventDef } from '../../../src/game/events';
import { dayIndex, encodeEventScore, encodePeriodScore, periodKeyAt } from '../../../src/game/scoring';
import { defaults } from '../../../src/game/save';
import type { BoardKey, SaveData } from '../../../src/game/types';
import type { RankEntry, RankingCaps, RankingProvider, RankListView } from '../../../src/platform/types';
import type { PersonalRecordsView } from '../../../src/ui/overlays/ranking-panel';
import { createHarness, SOL5, startLevel, winGame, NOW } from './harness';

/** This week (2026-10-05, period index 39 — NOW is Wednesday 2026-10-07) with `total` points. */
const WEEK = '2026-10-05';
const PERIOD = (total: number, week = 0): number => (39 + week) * 100_000 + total;

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
    mineValue: { rank: 1234, score: PERIOD(42), isMe: true },
    topValue: [
      { rank: 1, score: PERIOD(90), isMe: false },
      { rank: 2, score: PERIOD(80), isMe: false },
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

function setup(p: FakeProvider | undefined, save: Partial<SaveData> = {}, config = cfg) {
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
    config,
  });
  return { clock, flow, save: () => state, touches: () => touches, results };
}

const records: PersonalRecordsView = {
  board: 'period',
  thisMs: 60_000,
  n: 8,
  bestSizeMs: null,
  totalPoints: 1240,
  levelsSolved: 40,
  event: null,
  period: { kind: 'week', total: 42, best: 57 },
};
const ctx: ListContext = { records, myScore: { kind: 'fish', fish: 42 }, periodKey: WEEK };
/** A band read as G3's provider returns it: each entry carries its board rank (phase2c §4.5). */
const band = (entries: readonly [score: number, boardRank: number, isMe?: boolean][]): RankEntry[] =>
  entries.map(([score, boardRank, isMe = false], i) => ({ rank: i + 1, score, isMe, boardRank }) as RankEntry);

describe('submit (§5.3, §5.5; phase2c §4.4)', () => {
  it('submits when the limits allow and stamps lastSubmitAt', async () => {
    const p = provider();
    const s = setup(p);
    await s.flow.submit('period_points', PERIOD(3), 60_000);
    expect(p.calls).toEqual([`submit:period_points:${PERIOD(3)}`]);
    expect(s.save().rank).toEqual({ pending: {}, lastSubmitAt: NOW });
  });

  it('a solve under 3 s or over 24 h is never submitted nor queued (the total is saved locally either way, §4.4)', async () => {
    const p = provider();
    const s = setup(p);
    await s.flow.submit('period_points', 10, 2999);
    await s.flow.submitAll([{ board: 'period_points', score: 10 }, { board: 'event_lantern_walk_2026', score: 1 }], 86_400_001);
    expect(p.calls).toEqual([]);
    expect(s.save().rank.pending).toEqual({});
  });

  it('within 10 s of the last submit the score waits in rank.pending; the next win or boot retries it', async () => {
    const p = provider();
    const s = setup(p, { rank: { pending: {}, lastSubmitAt: NOW - 5000 } });
    await s.flow.submit('period_points', PERIOD(6), 60_000);
    expect(p.calls).toEqual([]);
    expect(s.save().rank.pending).toEqual({ period_points: PERIOD(6) });
    expect(s.touches()).toBe(1);
    await s.flow.flushPending();
    expect(p.calls).toEqual([`submit:period_points:${PERIOD(6)}`]);
    expect(s.save().rank.pending).toEqual({});
  });

  it('an event win\'s two boards are ONE batch: one limiter check, both sent (the second is never queued by the first)', async () => {
    const p = provider();
    const s = setup(p);
    await s.flow.submitAll([{ board: 'period_points', score: PERIOD(3) }, { board: 'event_lantern_walk_2026', score: 3_999_000 }], 60_000);
    expect(p.calls).toEqual([`submit:period_points:${PERIOD(3)}`, 'submit:event_lantern_walk_2026:3999000']);
    expect(s.save().rank.pending).toEqual({});
    // Within the limiter window the whole batch waits, together.
    await s.flow.submitAll([{ board: 'period_points', score: PERIOD(6) }, { board: 'event_lantern_walk_2026', score: 4_999_000 }], 60_000);
    expect(s.save().rank.pending).toEqual({ period_points: PERIOD(6), event_lantern_walk_2026: 4_999_000 });
  });

  it('a failed submit is queued; not_improved is fine; unsupported (no board id) is dropped for good', async () => {
    const p = provider();
    const s = setup(p);
    p.submitResult = 'error';
    await s.flow.submit('period_points', 50, 60_000);
    expect(s.save().rank.pending).toEqual({ period_points: 50 });
    p.submitResult = 'not_improved';
    s.clock.advance(cfg.rank.submitMinIntervalMs);
    await s.flow.submit('period_points', 60, 60_000);
    expect(s.save().rank.pending).toEqual({});
    p.submitResult = 'unsupported';
    s.clock.advance(cfg.rank.submitMinIntervalMs);
    await s.flow.submit('event_lantern_walk_2026', 1_000_000, 60_000);
    s.clock.advance(cfg.rank.submitMinIntervalMs);
    await s.flow.submit('event_lantern_walk_2026', 2_000_000, 60_000);
    expect(p.calls.filter((c) => c.startsWith('submit:event'))).toHaveLength(1);
    expect(s.save().rank.pending).toEqual({});
  });

  it('paw_points is retired and daily_fastest off (rank.dailyBoard false): never submitted; their pending scores are dropped, never sent', async () => {
    const p = provider();
    const s = setup(p, { rank: { pending: { paw_points: 2, daily_fastest: 27_899_812, period_points: PERIOD(5) }, lastSubmitAt: 0 } });
    await s.flow.submitAll([{ board: 'paw_points', score: 1 }, { board: 'daily_fastest', score: 2 }], 60_000);
    expect(p.calls).toEqual([]);
    await s.flow.flushPending();
    expect(p.calls).toEqual([`submit:period_points:${PERIOD(5)}`]);
    expect(s.save().rank.pending).toEqual({});
    // With rank.dailyBoard the daily board is submitted again.
    const on = setup(provider(), {}, mergeConfig({ rank: { dailyBoard: true } }));
    await on.flow.submit('daily_fastest', 7, 60_000);
    expect(on.save().rank.lastSubmitAt).toBe(NOW);
  });

  it('a pending score of an OLDER period is still flushed (it lands in its own band and never beats a newer entry)', async () => {
    const p = provider();
    const lastWeek = PERIOD(17, -1);
    const s = setup(p, { rank: { pending: { period_points: lastWeek }, lastSubmitAt: 0 } });
    await s.flow.flushPending();
    expect(p.calls).toEqual([`submit:period_points:${lastWeek}`]);
    expect(lastWeek).toBeLessThan(PERIOD(0));
  });

  it('without a provider (web) nothing is submitted or queued', async () => {
    const s = setup(undefined);
    await s.flow.submit('period_points', 50, 60_000);
    expect(s.save().rank).toEqual({ pending: {}, lastSubmitAt: 0 });
  });
});

describe('the period band (phase2c §4.5)', () => {
  it('bandFilter keeps the scores whose high digits are the shown period\'s index; daily keeps its day; other boards none', () => {
    const keep = bandFilter('period_points', { periodKey: WEEK });
    expect(keep?.(PERIOD(0))).toBe(true);
    expect(keep?.(PERIOD(99_999))).toBe(true);
    expect(keep?.(PERIOD(99_999, -1))).toBe(false); // last week
    expect(keep?.(PERIOD(1, 1))).toBe(false); // a device whose clock runs ahead posted next week
    expect(bandFilter('period_points', {})).toBeUndefined();
    expect(bandFilter('period_points', { periodKey: '2026-10-06' })).toBeUndefined(); // not a Monday: no band
    expect(bandFilter('event_lantern_walk_2026', { periodKey: WEEK, day: '2026-10-07' })).toBeUndefined();
    expect(bandFilter('daily_fastest', { day: '2026-10-07' })?.(dayIndex('2026-10-07') * 100_000 + 5)).toBe(true);
    expect(bandFilter('daily_fastest', { periodKey: WEEK })).toBeUndefined();
  });

  it('fetch(period_points) reads the current UTC period\'s band by default (or the one asked for)', async () => {
    const p = provider();
    const keeps: (((score: number) => boolean) | undefined)[] = [];
    p.top = (_board, _n, keep) => (keeps.push(keep), Promise.resolve(p.topValue));
    const s = setup(p);
    await s.flow.fetch('period_points');
    await s.flow.fetch('period_points', { periodKey: '2026-09-28' });
    await s.flow.fetch('event_lantern_walk_2026');
    expect(keeps[0]?.(PERIOD(5))).toBe(true);
    expect(keeps[0]?.(PERIOD(5, -1))).toBe(false);
    expect(keeps[1]?.(PERIOD(5, -1))).toBe(true);
    expect(keeps[2]).toBeUndefined();
  });

  it('"Your rank" is exact at any depth from the band\'s board rank: my board rank − (first.boardRank − 1)', () => {
    const s = setup(provider());
    // Two future-dated entries sit above this week's band; I am 1 234th on the board → 1 232nd this week.
    const r: RankResult = { board: 'period_points', api: 'classic', mine: { rank: 1234, score: PERIOD(42), isMe: true }, top: band([[PERIOD(90), 3], [PERIOD(80), 4]]), ok: true };
    expect(s.flow.listState(r, ctx)).toEqual({ kind: 'mine', mine: { rank: 1232, score: { kind: 'fish', fish: 42 }, count: null } });
    // A band that starts at the top of the board: my board rank is my rank.
    const top: RankResult = { ...r, top: band([[PERIOD(90), 1]]) };
    expect(s.flow.listState(top, ctx)).toMatchObject({ mine: { rank: 1234 } });
  });

  it('without boardRank: my position inside the read band; not among them → "Your score" without a rank (never the raw rank)', () => {
    const s = setup(provider());
    const read: RankEntry[] = [
      { rank: 1, score: PERIOD(5, 1), isMe: false }, // next week (clock ahead): not in the band
      { rank: 2, score: PERIOD(90), isMe: false },
      { rank: 3, score: PERIOD(42), isMe: true },
    ];
    const r: RankResult = { board: 'period_points', api: 'classic', mine: { rank: 3, score: PERIOD(42), isMe: true }, top: read, ok: true };
    expect(s.flow.listState(r, ctx)).toMatchObject({ mine: { rank: 2 } });
    const deep: RankResult = { ...r, mine: { rank: 4000, score: PERIOD(1), isMe: true }, top: read.slice(0, 2) };
    expect(s.flow.listState(deep, ctx)).toEqual({ kind: 'mine', mine: { rank: null, score: { kind: 'fish', fish: 1 }, count: null } });
  });

  it('my entry from an older period says nothing about this one: no rank, my own known total', () => {
    const s = setup(provider());
    const r: RankResult = { board: 'period_points', api: 'classic', mine: { rank: 7, score: PERIOD(300, -1), isMe: true }, top: band([[PERIOD(90), 1]]), ok: true };
    expect(s.flow.listState(r, ctx)).toEqual({ kind: 'mine', mine: { rank: null, score: { kind: 'fish', fish: 42 }, count: null } });
  });

  it('the overlay list keeps the period band and formats rows as "42 fish"; the platform sees a numeric format', async () => {
    const p = provider({ overlay: true });
    const s = setup(p);
    expect(await s.flow.showList('period_points', 'Weekly ranking', undefined, undefined, { periodKey: WEEK })).toBe(true);
    const view = p.lists[0]?.view;
    expect(view?.scoreFormat).toBe('points');
    expect(view?.keep?.(PERIOD(3))).toBe(true);
    expect(view?.keep?.(PERIOD(3, -1))).toBe(false);
    expect(view?.formatScore(PERIOD(42))).toBe('42 fish');
    // The default band is the current UTC period.
    await s.flow.showList('period_points', 'Weekly ranking');
    expect(p.lists[1]?.view.keep?.(PERIOD(1))).toBe(true);
  });

  it('period score views and texts', () => {
    expect(scoreView('period_points', encodePeriodScore(WEEK, 42), undefined)).toEqual({ kind: 'fish', fish: 42 });
    expect(formatScoreView({ kind: 'fish', fish: 1 })).toBe('1 fish');
    expect(formatBoardScore('period_points', PERIOD(1234), undefined)).toBe('1,234 fish');
  });
});

describe('fetch and the list states (§2.4, §5.4)', () => {
  it('classic API, no overlay: my rank and the provider\'s score ("Your rank: #1 234")', async () => {
    const p = provider();
    p.topValue = band([[PERIOD(90), 1], [PERIOD(80), 2]]);
    const s = setup(p);
    const r = await s.flow.fetch('period_points');
    expect(r).toEqual({ board: 'period_points', api: 'classic', mine: p.mineValue, top: p.topValue, ok: true });
    expect(s.results).toEqual([r]);
    expect(s.flow.listState(r, ctx)).toEqual({ kind: 'mine', mine: { rank: 1234, score: { kind: 'fish', fish: 42 }, count: null } });
  });

  it('NEZP (no myRank): no rank, my own known score ("Your score")', async () => {
    const p = provider({ api: 'nezp', myRank: false });
    const s = setup(p);
    const r = await s.flow.fetch('period_points');
    expect(p.calls).toEqual(['top:period_points:50']); // mine() is never asked
    expect(s.flow.listState(r, ctx)).toEqual({ kind: 'mine', mine: { rank: null, score: { kind: 'fish', fish: 42 }, count: null } });
  });

  it('overlay views: "See top players" (fullscreen), or the overlay in the list rect', async () => {
    const full = setup(provider({ overlay: true }));
    expect(full.flow.listState(await full.flow.fetch('period_points'), ctx).kind).toBe('see_top');
    const rect = setup(provider({ overlay: true, overlayInRect: true }));
    expect(rect.flow.listState(await rect.flow.fetch('period_points'), ctx)).toEqual({ kind: 'overlay' });
  });

  it('a fetch past rank.fetchTimeoutMs gives the personal records with rank.unavailable', async () => {
    const p = provider();
    p.hang = true;
    const s = setup(p);
    const pending = s.flow.fetch('period_points');
    await s.clock.advanceAsync(cfg.rank.fetchTimeoutMs);
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(s.flow.listState(r, ctx)).toEqual({ kind: 'records', records, reason: 'unavailable' });
  });

  it("api 'none', no provider, and a board without an id all give personal records (rank.localOnly)", async () => {
    const none = setup(provider({ api: 'none', global: false, myRank: false }));
    expect(none.flow.listState(await none.flow.fetch('period_points'), ctx)).toEqual({ kind: 'records', records, reason: 'local' });
    const web = setup(undefined);
    const r = await web.flow.fetch('period_points');
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
      const state = s.flow.listState(await s.flow.fetch('period_points'), { records, myScore: null, periodKey: WEEK });
      shapes.add(state.kind);
      expect(JSON.stringify(state)).not.toMatch(/rows|name|player|entries/i);
      if (state.kind === 'mine' || state.kind === 'see_top') expect(state.mine).toEqual({ rank: null, score: null, count: null });
    }
    expect([...shapes].sort()).toEqual(['mine', 'overlay', 'see_top']);
  });

  it('showList passes our formatter and the rect only when the provider can place it; closeList closes it', async () => {
    const p = provider({ overlay: true });
    const s = setup(p);
    expect(await s.flow.showList('event_lantern_walk_2026', 'Lantern Walk', { x: 0 } as DOMRect, 21)).toBe(true);
    expect(p.calls).toEqual(['list:event_lantern_walk_2026:full']);
    const list = p.lists[0];
    expect(list?.view).toMatchObject({ title: 'Lantern Walk', scoreFormat: 'event', highlightMe: true, count: cfg.rank.topCount });
    expect(list?.view.formatScore(13_000_000)).toBe('13 / 21 solved');
    expect(list?.view.keep).toBeUndefined(); // an event board has no band
    s.flow.closeList();
    expect(list?.closed).toBe(true);
    p.listResult = false;
    expect(await s.flow.showList('period_points', 'x')).toBe(false);
    setFlagOverrides({ rankings: false });
    try {
      expect(await s.flow.showList('period_points', 'x')).toBe(false);
      expect((await s.flow.fetch('period_points')).api).toBe('local');
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
    expect(await s.flow.showList('daily_fastest', 'Today', undefined, undefined, { day })).toBe(true);
    const keep = p.lists[0]?.view.keep;
    expect(keep).toBeTypeOf('function');
    expect(keep?.(today(188))).toBe(true);
    expect(keep?.(yesterday(60))).toBe(false);
    // Boards without a band are not filtered.
    await s.flow.showList('event_lantern_walk_2026', 'Lantern Walk');
    expect(p.lists[1]?.view.keep).toBeUndefined();
    // dayFilter is the same rule; the default day is today's local date.
    expect(dayFilter('daily_fastest', day)?.(today(5))).toBe(true);
    expect(dayFilter('period_points', day)).toBeUndefined();
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
    await s.flow.fetch('daily_fastest', { day: '2026-10-09' });
    await s.flow.fetch('event_lantern_walk_2026');
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
    const first = await s.flow.fetch('period_points');
    expect(first.api).toBe('none');
    expect(s.flow.listState(first, { records, myScore: null }).kind).toBe('records');
    p.calls.length = 0;
    const again = await s.flow.fetch('period_points');
    expect(again.api).toBe('none');
    expect(await s.flow.showList('period_points', 'Weekly ranking')).toBe(false);
    await s.flow.submit('period_points', 10, 60_000);
    expect(p.calls).toEqual([]); // latched: no more provider calls for that board
  });

  it('flushPending skips the boards just submitted (their newer scores supersede the queued ones)', async () => {
    const p = provider();
    const s = setup(p, { rank: { pending: { event_snow_paws_2026: 1, period_points: 2, event_lantern_walk_2026: 3 }, lastSubmitAt: 0 } });
    await s.flow.flushPending({ except: ['period_points', 'event_lantern_walk_2026'] });
    expect(p.calls).toEqual(['submit:event_snow_paws_2026:1']);
    expect(s.save().rank.pending).toEqual({ period_points: 2, event_lantern_walk_2026: 3 });
    await s.flow.flushPending({ except: 'period_points' }); // a single board is accepted too
    expect(p.calls).toEqual(['submit:event_snow_paws_2026:1', 'submit:event_lantern_walk_2026:3']);
  });

  it('score views and texts decode our encodings', () => {
    expect(scoreView('daily_fastest', 278 * 100_000 + (99_999 - 188), undefined)).toEqual({ kind: 'time', ms: 188_000 });
    expect(formatBoardScore('daily_fastest', 278 * 100_000 + (99_999 - 188), undefined)).toBe('3:08');
    expect(scoreView('event_lantern_walk_2026', 13_000_000 + 999_999 - 3601, 21)).toEqual({ kind: 'event', solved: 13, total: 21, ms: 3_601_000 });
    expect(formatBoardScore('event_lantern_walk_2026', 13_000_000, 21)).toBe('13 / 21 solved');
  });
});

describe('session: submit at WON, panel at 4.5 s (§5.5; phase2c §4.4, §2.6)', () => {
  it('the period board receives this week\'s total; old daily and paw scores are dropped; the panel shows my rank inside the band', async () => {
    const p = provider();
    p.mineValue = { rank: 1234, score: PERIOD(3), isMe: true };
    p.topValue = band([[PERIOD(90), 1], [PERIOD(80), 2]]);
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
    // queued scores follow once it settled. paw_points is retired and daily_fastest off: dropped.
    expect(p.calls.slice(0, 3)).toEqual([`submit:period_points:${encodePeriodScore(WEEK, 3)}`, 'mine:period_points', 'top:period_points:' + cfg.rank.fetchCount]);
    expect(p.calls.filter((c) => c.startsWith('submit:'))).toEqual([`submit:period_points:${PERIOD(3)}`]);
    expect(h.save().rank.pending).toEqual({});
    await h.settle(cfg.fx.winOverlayDelayMs);
    expect(h.router.props.ranking?.list).toEqual({ kind: 'mine', mine: { rank: 1234, score: { kind: 'fish', fish: 3 }, count: null } });
    expect(h.analytics).toContainEqual({ name: 'rank_panel', params: { board: 'period_points', api: 'classic', ms: expect.any(Number), ok: 1 } });
  });

  it('an event win submits this week\'s period points AND its event board in ONE batch (neither is queued by the other)', async () => {
    const p = provider();
    const LANTERN = bundledEventDefs()[0] as EventDef;
    const h = createHarness({
      save: (s) => ({ ...s, progress: { level: 15, completed: 14, best: {} } }),
      extra: (parts) => ({
        events: { byId: (id) => (id === LANTERN.id ? LANTERN : null) },
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
    h.clock.setNow(eventStart(LANTERN) + 3_600_000);
    await h.session.start({ mode: 'event', eventId: LANTERN.id, index: 0 });
    await h.settle(h.config.fx.boardEntryMs + 5000);
    for (const c of SOL5) h.session.onCellDoubleTap(c);
    await h.settle(0);
    const week = periodKeyAt(h.clock.now());
    const ms = h.save().events[LANTERN.id]?.ms ?? 0;
    expect(p.calls.filter((c) => c.startsWith('submit:'))).toEqual([
      `submit:period_points:${encodePeriodScore(week, 3)}`,
      `submit:event_lantern_walk_2026:${encodeEventScore(1, ms)}`,
    ]);
    expect(h.save().rank.pending).toEqual({});
    // The panel reads the period board (the event board stays on the event screen).
    expect(p.calls).toContain('mine:period_points');
    expect(p.calls).not.toContain('mine:event_lantern_walk_2026');
  });

  it('a win that adds nothing (a level already counted) submits nothing; the panel still reads this week\'s board', async () => {
    const p = provider();
    const h = createHarness({
      save: (s) => ({ ...s, progress: { level: 9, completed: 8, best: {} } }),
      extra: (parts) => ({
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
    await h.settle(5000);
    winGame(h);
    await h.settle(0);
    expect(p.calls.filter((c) => c.startsWith('submit:'))).toEqual([]);
    expect(p.calls).toContain('mine:period_points');
  });
});
