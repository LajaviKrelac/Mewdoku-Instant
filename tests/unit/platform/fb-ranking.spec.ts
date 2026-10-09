// @vitest-environment jsdom
// Owner: D
// RankingProvider for FBIG (phase2b §5.2, §5.4, §5.10): the probe order (classic, NEZP, none); stub
// calls; overlay creation with and without a rect, and close; NOT_IMPROVED handling;
// VITE_FB_LEADERBOARDS parsing; and the absolute rule: no fabricated rows.
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig } from '../../../src/app/config';
import { createFbOverlayViews, OVERLAY_HOST_TEST_ID } from '../../../src/platform/fb/fb-overlay-views';
import { rankingCaps } from '../../../src/platform/fb/fb-probe';
import { BAND_MAX_PAGES, createFbRanking, mapSubmitError, parseLeaderboardMap, probeRankingApi } from '../../../src/platform/fb/fb-ranking';
import type { FBInstantSDK } from '../../../src/platform/fb/fbinstant';
import { RANK_LIST_CLOSE_EVENT, rankListData, rankListTemplate } from '../../../src/platform/fb/views/rank-list';
import type { BoardKey, RankListView } from '../../../src/platform/types';
import { createStub, drain, track, type StubConfig } from './helpers';

const BOARDS: Partial<Record<BoardKey, string>> = { paw_points: 'pp', daily_fastest: 'df', event_lantern_walk_2026: 'ev' };

const VIEW: RankListView = {
  title: 'Paw points',
  scoreFormat: 'points',
  highlightMe: true,
  count: 10,
  formatScore: (s) => `${s} pts`,
};

async function setup(config: StubConfig = {}, opts: { boards?: Partial<Record<BoardKey, string>>; placement?: 'fullscreen' | 'rect' } = {}) {
  const clock = createFakeClock();
  const { sdk, control } = createStub({ playerId: 'me', ...config }, clock, document);
  await sdk.initializeAsync(); // player.getID() answers only after init
  const c = opts.placement ? mergeConfig({ rank: { overlayPlacement: opts.placement } }) : cfg;
  const overlays = createFbOverlayViews(sdk, { timers: clock, config: c, doc: document });
  const ranking = createFbRanking(sdk, { boards: opts.boards ?? BOARDS, timers: clock, overlays, config: c });
  return { clock, sdk, control, ranking };
}

/** Seeds `n` other players on a board, scores n*100 … 100. */
const others = (n: number) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i + 1}`, score: (n - i) * 100 }));

const host = (): HTMLElement | null => document.querySelector(`[data-testid="${OVERLAY_HOST_TEST_ID}"]`);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('parseLeaderboardMap (VITE_FB_LEADERBOARDS)', () => {
  it('reads a JSON map of BoardKey → dashboard name', () => {
    expect(parseLeaderboardMap('{"paw_points":"pp","daily_fastest":" df ","event_lantern_walk_2026":"ev_1"}')).toEqual({
      paw_points: 'pp',
      daily_fastest: 'df',
      event_lantern_walk_2026: 'ev_1',
    });
  });

  it.each([undefined, '', '   ', 'not json', '[]', '"x"', 'null', '42'])('%j → {} (every board unsupported)', (raw) => {
    expect(parseLeaderboardMap(raw)).toEqual({});
  });

  it('drops unknown keys and bad values, keeps the rest', () => {
    expect(parseLeaderboardMap('{"paw_points":"pp","weekly":"w","daily_fastest":42,"event_x":"y","event_snow_paws_2026":"has space"}')).toEqual({
      paw_points: 'pp',
    });
  });
});

describe('probeRankingApi (§5.4 order)', () => {
  it('classic first, then NEZP, else none', () => {
    const clock = createFakeClock();
    expect(probeRankingApi(createStub({}, clock).sdk)).toBe('classic');
    expect(probeRankingApi(createStub({ presets: ['lb-nezp'] }, clock).sdk)).toBe('nezp');
    expect(probeRankingApi(createStub({ leaderboards: { api: 'both' } }, clock).sdk)).toBe('classic');
    expect(probeRankingApi(createStub({ presets: ['lb-none'] }, clock).sdk)).toBe('none');
  });

  it('a listed API that is not callable does not count', () => {
    const { sdk } = createStub({}, createFakeClock());
    const broken = Object.assign(Object.create(sdk) as FBInstantSDK, { getLeaderboardAsync: undefined });
    expect(probeRankingApi(broken)).toBe('none');
  });

  it('caps: global needs a board id; myRank is classic only; overlayInRect waits for placement rect (G3)', () => {
    expect(rankingCaps('classic', BOARDS, true, 'fullscreen')).toEqual({ api: 'classic', global: true, myRank: true, overlay: true, overlayInRect: false });
    expect(rankingCaps('nezp', BOARDS, true, 'rect')).toEqual({ api: 'nezp', global: true, myRank: false, overlay: true, overlayInRect: true });
    expect(rankingCaps('classic', {}, false, 'rect')).toEqual({ api: 'classic', global: false, myRank: false, overlay: false, overlayInRect: false });
    expect(rankingCaps('none', BOARDS, true, 'fullscreen').global).toBe(false);
  });

  it('maps submit errors', () => {
    expect(mapSubmitError({ code: 'LEADERBOARD_SCORE_NOT_IMPROVED' })).toBe('not_improved');
    expect(mapSubmitError({ code: 'LEADERBOARD_NOT_FOUND' })).toBe('unsupported');
    expect(mapSubmitError({ code: 'CLIENT_UNSUPPORTED_OPERATION' })).toBe('unsupported');
    expect(mapSubmitError({ code: 'NETWORK_FAILURE' })).toBe('error');
  });
});

describe('createFbRanking: classic API', () => {
  it('submit keeps the better score: ok, then not_improved for a lower one', async () => {
    const { ranking, control } = await setup();
    expect(ranking.caps()).toEqual({ api: 'classic', global: true, myRank: true, overlay: true, overlayInRect: false });
    await expect(ranking.submit('paw_points', 120)).resolves.toBe('ok');
    await expect(ranking.submit('paw_points', 80)).resolves.toBe('not_improved');
    await expect(ranking.submit('paw_points', 200)).resolves.toBe('ok');
    expect(control.leaderboard('pp')).toEqual([expect.objectContaining({ playerId: 'me', score: 200 })]);
    expect(control.find('getLeaderboardAsync').map((c) => c.args[0])).toEqual(['pp']); // the Leaderboard object is reused
  });

  it('mine and top read my rank and the top entries, isMe only for my own entry', async () => {
    const { ranking } = await setup({ leaderboards: { entries: { pp: others(3) } } });
    await ranking.submit('paw_points', 250);
    await expect(ranking.mine('paw_points')).resolves.toEqual({ rank: 2, score: 250, isMe: true });
    await expect(ranking.top('paw_points', 10)).resolves.toEqual([
      { rank: 1, score: 300, isMe: false },
      { rank: 2, score: 250, isMe: true },
      { rank: 3, score: 200, isMe: false },
      { rank: 4, score: 100, isMe: false },
    ]);
  });

  it('reads after a write: mine/top started while a submit is in flight see the new score', async () => {
    const { ranking } = await setup({ leaderboards: { entries: { pp: others(2) } } });
    const sub = ranking.submit('paw_points', 250);
    const [mine, top] = await Promise.all([ranking.mine('paw_points'), ranking.top('paw_points', 10)]);
    await expect(sub).resolves.toBe('ok');
    expect(mine).toEqual({ rank: 1, score: 250, isMe: true });
    expect(top[0]).toEqual({ rank: 1, score: 250, isMe: true });
  });

  it('no fabricated rows: exactly the entries the API returned, never padded, invalid ones dropped', async () => {
    const { ranking, sdk } = await setup({ leaderboards: { entries: { pp: others(2) } } });
    await expect(ranking.top('paw_points', 10)).resolves.toHaveLength(2);
    await expect(ranking.mine('paw_points')).resolves.toBeNull(); // no score posted yet: no "me"
    // Entries with a broken score or rank are dropped, never patched.
    const lb = await sdk.getLeaderboardAsync!('pp');
    const real = lb.getEntriesAsync.bind(lb);
    lb.getEntriesAsync = async (n, o) => {
      const list = await real(n, o);
      return [...list, { getScore: () => Number.NaN, getRank: () => 3 }, { getScore: () => 5 }, { getScore: () => 5, getRank: () => 0 }];
    };
    const fresh = await setup({ leaderboards: { entries: { pp: others(2) } } });
    fresh.sdk.getLeaderboardAsync = () => Promise.resolve(lb);
    await expect(fresh.ranking.top('paw_points', 10)).resolves.toEqual([
      { rank: 1, score: 200, isMe: false },
      { rank: 2, score: 100, isMe: false },
    ]);
  });

  it('top asks for at most rank.fetchCount entries', async () => {
    const { ranking, control } = await setup({ leaderboards: { entries: { pp: others(3) } } });
    await ranking.top('paw_points', 500);
    expect(control.find('leaderboard.getEntriesAsync')[0]?.args).toEqual(['pp', cfg.rank.fetchCount, 0]);
    await expect(ranking.top('paw_points', 0)).resolves.toEqual([]);
  });

  it('a board without an id is unsupported and never reaches the SDK', async () => {
    const { ranking, control } = await setup({}, { boards: { paw_points: 'pp' } });
    await expect(ranking.submit('daily_fastest', 1)).resolves.toBe('unsupported');
    await expect(ranking.mine('daily_fastest')).resolves.toBeNull();
    await expect(ranking.top('event_snow_paws_2026', 10)).resolves.toEqual([]);
    await expect(ranking.showList('daily_fastest', VIEW)).resolves.toBeNull();
    expect(control.count('getLeaderboardAsync')).toBe(0);
  });

  it('a board missing in the dashboard (LEADERBOARD_NOT_FOUND) is unsupported; other errors are errors', async () => {
    const { ranking, control } = await setup({ leaderboards: { names: ['pp'], errors: { setScore: ['NETWORK_FAILURE'] } } });
    await expect(ranking.submit('daily_fastest', 5)).resolves.toBe('unsupported');
    await expect(ranking.submit('paw_points', 5)).resolves.toBe('error');
    await expect(ranking.submit('paw_points', 5)).resolves.toBe('ok');
    // Review FB2B-6: LEADERBOARD_NOT_FOUND latches the board for the session (no second lookup) …
    await expect(ranking.submit('daily_fastest', 5)).resolves.toBe('unsupported');
    expect(control.find('getLeaderboardAsync').filter((c) => c.args[0] === 'df')).toHaveLength(1);
    expect(ranking.supports?.('daily_fastest')).toBe(false);
    expect(ranking.supports?.('paw_points')).toBe(true);
  });

  it('a lookup that failed for another reason is not cached: the next call asks again', async () => {
    const { ranking, sdk, control } = await setup();
    const real = sdk.getLeaderboardAsync!.bind(sdk);
    let fail = true;
    sdk.getLeaderboardAsync = (name: string) => {
      if (fail) {
        fail = false;
        return Promise.reject({ code: 'NETWORK_FAILURE', message: 'down' });
      }
      return real(name);
    };
    await expect(ranking.submit('paw_points', 5)).resolves.toBe('error');
    await expect(ranking.submit('paw_points', 5)).resolves.toBe('ok');
    expect(ranking.supports?.('paw_points')).toBe(true);
    expect(control.count('leaderboard.setScoreAsync')).toBe(1);
  });

  it('reads of a board missing in the dashboard latch it too: [] / null / no list, then no SDK call (review FB2B-6)', async () => {
    const { ranking, control } = await setup({ leaderboards: { names: [] } });
    await expect(ranking.top('paw_points', 10)).resolves.toEqual([]);
    await expect(ranking.mine('paw_points')).resolves.toBeNull();
    expect(ranking.supports?.('paw_points')).toBe(false);
    control.clearCalls();
    await expect(ranking.top('paw_points', 10)).resolves.toEqual([]);
    await expect(ranking.showList('paw_points', VIEW)).resolves.toBeNull();
    await expect(ranking.submit('paw_points', 10)).resolves.toBe('unsupported');
    expect(control.calls.filter((c) => /eaderboard/.test(c.name))).toEqual([]);
  });

  it('rejects invalid scores without an SDK call', async () => {
    const { ranking, control } = await setup();
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
      await expect(ranking.submit('paw_points', bad)).resolves.toBe('error');
    }
    expect(control.count('leaderboard.setScoreAsync')).toBe(0);
  });

  it('every call has the rank.fetchTimeoutMs deadline', async () => {
    const { ranking, sdk, clock } = await setup();
    const lb = await sdk.getLeaderboardAsync!('pp');
    lb.getEntriesAsync = () => new Promise(() => undefined);
    lb.setScoreAsync = () => new Promise(() => undefined);
    lb.getPlayerEntryAsync = () => new Promise(() => undefined);
    sdk.getLeaderboardAsync = () => Promise.resolve(lb);
    const top = track(ranking.top('paw_points', 10));
    const sub = track(ranking.submit('paw_points', 10));
    const mine = track(ranking.mine('paw_points'));
    await clock.advanceAsync(cfg.rank.fetchTimeoutMs - 1);
    expect([top.done, sub.done, mine.done]).toEqual([false, false, false]);
    await clock.advanceAsync(1);
    await drain();
    expect([top.value, sub.value, mine.value]).toEqual([[], 'error', null]);
  });
});

describe('createFbRanking: NEZP API', () => {
  it('submit ok, then not_improved (LEADERBOARD_SCORE_NOT_IMPROVED); no "me", ranks by position', async () => {
    const { ranking, control } = await setup({ presets: ['lb-nezp'], leaderboards: { entries: { pp: others(2) } } });
    expect(ranking.caps()).toMatchObject({ api: 'nezp', global: true, myRank: false });
    await expect(ranking.submit('paw_points', 150)).resolves.toBe('ok');
    await expect(ranking.submit('paw_points', 150)).resolves.toBe('not_improved');
    expect(control.find('globalLeaderboards.setScoreAsync')[0]?.args).toEqual(['pp', 150]);
    await expect(ranking.mine('paw_points')).resolves.toBeNull();
    await expect(ranking.top('paw_points', 10)).resolves.toEqual([
      { rank: 1, score: 200, isMe: false },
      { rank: 2, score: 150, isMe: false },
      { rank: 3, score: 100, isMe: false },
    ]);
  });
});

describe('createFbRanking: no leaderboard API', () => {
  it("api 'none': unsupported / null / [] and no SDK call", async () => {
    const { ranking, control } = await setup({ presets: ['lb-none'] });
    expect(ranking.caps()).toMatchObject({ api: 'none', global: false, myRank: false });
    control.clearCalls();
    await expect(ranking.submit('paw_points', 10)).resolves.toBe('unsupported');
    await expect(ranking.mine('paw_points')).resolves.toBeNull();
    await expect(ranking.top('paw_points', 10)).resolves.toEqual([]);
    await expect(ranking.showList('paw_points', VIEW)).resolves.toBeNull();
    expect(control.calls.filter((c) => /eaderboard/.test(c.name))).toEqual([]);
  });
});

describe('createFbRanking: overlay list (showList)', () => {
  const overlayData = (control: { find(n: string): { args: unknown[] }[] }) =>
    JSON.parse(String(control.find('overlayViews.createOverlayViewWithXMLString')[0]?.args[2])) as {
      title: string;
      rows: { pos: number; id: string; rank: string; score: string; kind: string }[];
      count: string;
      closable: string;
    };

  it('full screen by default: our rows as data (decoded by the app), a close control, Esc and close() all close it', async () => {
    const { ranking, control } = await setup({ leaderboards: { entries: { pp: others(2) } } });
    await ranking.submit('paw_points', 150);
    const handle = await ranking.showList('paw_points', VIEW, new DOMRect(10, 20, 300, 400)); // rect ignored until G3
    expect(handle).not.toBeNull();
    expect(host()?.getAttribute('data-mode')).toBe('fullscreen');
    expect(host()?.querySelector('iframe')).not.toBeNull();
    expect(control.count('overlayView.showAsync')).toBe(1);
    const data = overlayData(control);
    expect(data.title).toBe('Paw points');
    expect(data.closable).toBe('yes');
    expect(data.rows).toEqual([
      { pos: 1, id: 'p1', rank: '#1', score: '200 pts', kind: 'other' },
      { pos: 2, id: 'me', rank: '#2', score: '150 pts', kind: 'mine' },
      { pos: 3, id: 'p2', rank: '#3', score: '100 pts', kind: 'other' },
    ]);
    // Esc closes the full-screen list and does not reach the game underneath.
    let reached = 0;
    document.addEventListener('keydown', () => reached++);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await handle!.closed;
    expect(reached).toBe(0);
    expect(host()).toBeNull();
    expect(control.count('overlayView.dismissAsync')).toBe(1);
    handle!.close(); // idempotent
    expect(control.count('overlayView.dismissAsync')).toBe(1);
  });

  it("the view's own close control (custom event) and our close button close it", async () => {
    const { ranking, control } = await setup();
    const a = await ranking.showList('paw_points', VIEW);
    control.overlayEvent('some_other_event');
    expect(host()).not.toBeNull();
    control.overlayEvent(RANK_LIST_CLOSE_EVENT);
    await a!.closed;
    expect(host()).toBeNull();
    const b = await ranking.showList('paw_points', VIEW);
    (document.querySelector('[data-testid="fb-overlay-close"]') as HTMLButtonElement).click();
    await b!.closed;
    expect(host()).toBeNull();
  });

  it('in a rect once overlayPlacement is rect (G3): placed over the rect, no close control; the caller closes it', async () => {
    const { ranking, control } = await setup({}, { placement: 'rect' });
    expect(ranking.caps().overlayInRect).toBe(true);
    const handle = await ranking.showList('paw_points', VIEW, new DOMRect(10, 20, 300, 400));
    const el = host();
    expect(el?.getAttribute('data-mode')).toBe('rect');
    expect([el?.style.left, el?.style.top, el?.style.width, el?.style.height]).toEqual(['10px', '20px', '300px', '400px']);
    expect(document.querySelector('[data-testid="fb-overlay-close"]')).toBeNull();
    expect(overlayData(control).closable).toBe('no');
    handle!.close();
    await handle!.closed;
    expect(host()).toBeNull();
  });

  it('pins my row at the bottom when I am outside the top list (classic, highlightMe)', async () => {
    const { ranking, control } = await setup({ leaderboards: { entries: { pp: others(12) } } });
    await ranking.submit('paw_points', 50);
    await ranking.showList('paw_points', VIEW);
    const rows = overlayData(control).rows;
    expect(rows).toHaveLength(11);
    expect(rows[10]).toEqual({ pos: 11, id: 'me', rank: '#13', score: '50 pts', kind: 'mine' });
    expect(rows.slice(0, 10).every((r) => r.kind === 'other')).toBe(true);
  });

  it('RankListView.keep (daily_fastest: the shown day only) drops the other rows, and my pinned row when it is of another day', async () => {
    // Scores 1 … 3 (×100 000 + secs) stand for three days; the list shows day 3.
    const day = (d: number, secs: number): number => d * 100_000 + (99_999 - secs);
    const entries = [
      { playerId: 'p1', score: day(3, 100) },
      { playerId: 'p2', score: day(3, 200) },
      { playerId: 'p3', score: day(2, 10) },
    ];
    const keep = (score: number): boolean => Math.floor(score / 100_000) === 3;
    const view: RankListView = { ...VIEW, title: 'Today', scoreFormat: 'time', keep };
    const { ranking, control } = await setup({ leaderboards: { entries: { df: entries } } });
    await ranking.submit('daily_fastest', day(1, 50)); // my entry is of day 1: never "mine" on day 3's list
    await ranking.showList('daily_fastest', view);
    expect(overlayData(control).rows.map((r) => r.id)).toEqual(['p1', 'p2']); // fewer rows, never padded
    const again = await setup({ leaderboards: { entries: { df: entries } } });
    await again.ranking.submit('daily_fastest', day(3, 150));
    await again.ranking.showList('daily_fastest', view);
    expect(overlayData(again.control).rows.map((r) => `${r.id}:${r.kind}`)).toEqual(['p1:other', 'me:mine', 'p2:other']);
  });

  it('daily: twelve next-day entries above today do not hide today: the band is read past them and numbered from #1 (review FB2B-4)', async () => {
    const day = (d: number, secs: number): number => d * 100_000 + (99_999 - secs);
    const later = Array.from({ length: 12 }, (_, i) => ({ playerId: `t${i + 1}`, score: day(282, 10 + i) }));
    const today = [
      { playerId: 'a', score: day(281, 20) },
      { playerId: 'b', score: day(281, 30) },
      { playerId: 'c', score: day(281, 40) },
    ];
    const keep = (score: number): boolean => Math.floor(score / 100_000) === 281;
    const view: RankListView = { ...VIEW, title: 'Today', scoreFormat: 'time', keep };
    const { ranking, control } = await setup({ leaderboards: { entries: { df: [...later, ...today, { playerId: 'old', score: day(280, 5) }] } } });
    await ranking.submit('daily_fastest', day(281, 4)); // my 4 s: the best of today, #13 on the board
    await ranking.showList('daily_fastest', view);
    const rows = overlayData(control).rows;
    expect(rows.map((r) => `${r.rank}:${r.id}:${r.kind}`)).toEqual(['#1:me:mine', '#2:a:other', '#3:b:other', '#4:c:other']);
    // The panel's reader (top with keep) gets the same band, numbered inside it.
    await expect(ranking.top('daily_fastest', 10, keep)).resolves.toEqual([
      { rank: 1, score: day(281, 4), isMe: true },
      { rank: 2, score: day(281, 20), isMe: false },
      { rank: 3, score: day(281, 30), isMe: false },
      { rank: 4, score: day(281, 40), isMe: false },
    ]);
  });

  it('daily band: pages through getEntriesAsync(fetchCount, offset) until the band ends, at most BAND_MAX_PAGES pages', async () => {
    const day = (d: number, secs: number): number => d * 100_000 + (99_999 - secs);
    const page = cfg.rank.fetchCount;
    const later = Array.from({ length: page + 5 }, (_, i) => ({ playerId: `t${i}`, score: day(282, 10 + i) }));
    const today = [{ playerId: 'a', score: day(281, 20) }];
    const keep = (score: number): boolean => Math.floor(score / 100_000) === 281;
    const { ranking, control } = await setup({ leaderboards: { entries: { df: [...later, ...today, { playerId: 'old', score: day(280, 5) }] } } });
    await expect(ranking.top('daily_fastest', 10, keep)).resolves.toEqual([{ rank: 1, score: day(281, 20), isMe: false }]);
    expect(control.find('leaderboard.getEntriesAsync').map((c) => c.args)).toEqual([
      ['df', page, 0],
      ['df', page, page],
    ]);
    // A band that starts beyond the cap: the honest empty list, never a guess.
    const far = Array.from({ length: page * BAND_MAX_PAGES + 1 }, (_, i) => ({ playerId: `f${i}`, score: day(282, i) }));
    const capped = await setup({ leaderboards: { entries: { df: [...far, ...today] } } });
    await expect(capped.ranking.top('daily_fastest', 10, keep)).resolves.toEqual([]);
    expect(capped.control.count('leaderboard.getEntriesAsync')).toBe(BAND_MAX_PAGES);
  });

  it('daily band: my row is pinned with its position in the band, and not at all when only the board knows it', async () => {
    const day = (d: number, secs: number): number => d * 100_000 + (99_999 - secs);
    const keep = (score: number): boolean => Math.floor(score / 100_000) === 281;
    const today = Array.from({ length: 11 }, (_, i) => ({ playerId: `p${i}`, score: day(281, 10 + i) }));
    const { ranking, control } = await setup({ leaderboards: { entries: { df: [{ playerId: 'x', score: day(282, 1) }, ...today] } } });
    await ranking.submit('daily_fastest', day(281, 500)); // the slowest of the day: 12th in the band, 13th on the board
    await ranking.showList('daily_fastest', { ...VIEW, title: 'Today', scoreFormat: 'time', keep });
    const rows = overlayData(control).rows;
    expect(rows).toHaveLength(11);
    expect(rows[10]).toMatchObject({ id: 'me', rank: '#12', kind: 'mine' });
  });

  it('an empty board shows the honest empty state, no rows', async () => {
    const { ranking, control } = await setup();
    await ranking.showList('paw_points', { ...VIEW, highlightMe: false });
    expect(overlayData(control).rows).toEqual([]);
    expect(overlayData(control).count).toBe('0');
  });

  it('a view that fails to load, or never loads within rank.fetchTimeoutMs, answers null and leaves nothing behind', async () => {
    const failing = await setup({ overlay: { load: 'error' } });
    await expect(failing.ranking.showList('paw_points', VIEW)).resolves.toBeNull();
    expect(host()).toBeNull();

    const slow = await setup({ overlay: { load: 'never' } });
    const shown = track(slow.ranking.showList('paw_points', VIEW));
    await drain();
    expect(host()).not.toBeNull();
    await slow.clock.advanceAsync(cfg.rank.fetchTimeoutMs);
    await drain();
    expect(shown.value).toBeNull();
    expect(host()).toBeNull();
  });

  it('without overlay views showList answers null', async () => {
    const { ranking } = await setup({ presets: ['no-overlay'] });
    expect(ranking.caps().overlay).toBe(false);
    await expect(ranking.showList('paw_points', VIEW)).resolves.toBeNull();
  });
});

describe('rank-list template', () => {
  it('a For over the rows, an If for me, bindings for name and photo, inline styles only', () => {
    const { xml, css } = rankListTemplate();
    expect(xml).toContain('<For source="{{rows}}" itemName="row" sortKey="pos">');
    expect(xml).toContain('{{FBInstant.player.name}}');
    expect(xml).toContain('{{FBInstant.player.photo}}');
    expect(xml).toContain('{{FBInstant.player.friends[{{row.id}}].name}}');
    expect(xml).toContain(`onTapEvent="${RANK_LIST_CLOSE_EVENT}"`);
    expect(xml).toContain('{{row.rank}}');
    expect(xml).toContain('{{row.score}}');
    expect(css).toBe('');
    expect(rankListTemplate()).toBe(rankListTemplate()); // built once
  });

  it('rankListData keeps the caller order and only flags my row', () => {
    const d = rankListData(
      {
        title: 'T',
        highlightMe: false,
        rows: [
          { id: 'a', rankText: '#1', scoreText: '9', isMe: false },
          { id: 'b', rankText: '#2', scoreText: '8', isMe: true },
        ],
      },
      { emptyText: 'none', closeText: 'Close', closable: false },
    );
    expect(d.rows.map((r) => [r.pos, r.kind])).toEqual([
      [1, 'other'],
      [2, 'self'],
    ]);
    expect(d).toMatchObject({ count: '2', closable: 'no', emptyText: 'none', closeText: 'Close' });
  });
});
