// UI batch (2026-10-13): victory — the daily percentile over HTTP (spec §0.4 H-2a; migration 0005_daily_times).
// An accepted daily win adds one to its 10-second solve-time bucket (per puzzle and pool) in the wins batch; a daily
// win placed by the request is answered with `daily` { solvers, slower }: OTHER players only, strictly slower buckets
// only, and only from dailyStats.minSolvers others on. Flagged, rejected, duplicate and already-counted wins never
// count; pools never mix (H-7); the rollup holds no player key; the retention sweep deletes old days.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { dailyBucket } from '../../src/core/wins';
import { parseWinsResponse } from '../../src/contract';
import { RETENTION_CRON } from '../../src/cron';
import { SqlStore } from '../../src/store/sql-store';
import { DAY, makeTestApp, makeWin, playersWithWins, TestPlayer, type TestApp } from '../helpers/harness';

/** Today's daily at the harness clock (T0 = 2026-11-15 12:00 UTC). */
const DAILY = 'D2026-11-15';

/** n players (fb unless said otherwise) who each solve DAILY in ms(i); their answers, in order. */
async function solve(t: TestApp, n: number, prefix: string, ms: (i: number) => number, platform: 'fb' | 'web' = 'fb') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = new TestPlayer(t, `${prefix}${i}`, { platform });
    await p.signIn();
    out.push(await p.win(DAILY, { solveMs: ms(i) }));
  }
  return out;
}

const rollup = (t: TestApp, pool = 'fb'): number => t.count('SELECT COALESCE(SUM(n), 0) FROM daily_times WHERE puzzle_id = ? AND pool = ?', DAILY, pool);

describe('daily percentile: the rollup and the answer (H-2a)', () => {
  it('a solve time falls in a 10 s bucket; the last bucket takes every longer time', () => {
    expect(dailyBucket(0, DEFAULT_CONFIG)).toBe(0);
    expect(dailyBucket(9_999, DEFAULT_CONFIG)).toBe(0);
    expect(dailyBucket(10_000, DEFAULT_CONFIG)).toBe(1);
    expect(dailyBucket(125_000, DEFAULT_CONFIG)).toBe(12);
    expect(dailyBucket(10 * 3_600_000, DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.dailyStats.maxBucket);
    expect(dailyBucket(-5, DEFAULT_CONFIG)).toBe(0);
    expect(DEFAULT_CONFIG.dailyStats).toEqual({ enabled: true, bucketMs: 10_000, maxBucket: 359, minSolvers: 20, keepDays: 7 });
  });

  it('nothing below 20 other solvers; then the others and the strictly slower ones, never my own bucket', async () => {
    const t = makeTestApp();
    // 20 solvers, each in a bucket of their own: 60 s, 70 s, … 250 s (buckets 6 … 25).
    const first = await solve(t, 20, 'd', (i) => 60_000 + i * 10_000);
    for (const w of first) {
      expect(parseWinsResponse(w)).toEqual(w);
      expect(w.results[0]?.verdict).toBe('accepted');
      expect(w.results[0]?.daily).toBeUndefined();
    }
    expect(rollup(t)).toBe(20);
    expect(t.count('SELECT COUNT(*) FROM daily_times')).toBe(20);
    // The 21st solves in 125 s (bucket 12): 20 others; buckets 13 … 25 (13 players) were slower.
    const [a] = await solve(t, 1, 'x', () => 125_000);
    expect(parseWinsResponse(a)).toEqual(a);
    expect(a?.results[0]).toEqual({ winId: expect.any(String), verdict: 'accepted', points: 3, daily: { solvers: 20, slower: 13 } });
    // The 22nd in 121 s shares bucket 12 with the 125 s solver (slower) and the 120 s one (faster): neither counts.
    const [b] = await solve(t, 1, 'y', () => 121_000);
    expect(b?.results[0]?.daily).toEqual({ solvers: 21, slower: 13 });
    // The fastest of all: everyone else was slower.
    const [c] = await solve(t, 1, 'z', () => 30_000);
    expect(c?.results[0]?.daily).toEqual({ solvers: 22, slower: 22 });
    expect(rollup(t)).toBe(23);
  });

  it('flagged, duplicate, already counted, level wins and other pools never count; a smaller minimum is honoured', async () => {
    const t = makeTestApp({ overrides: { dailyStats: { minSolvers: 3 } } });
    await solve(t, 3, 'd', (i) => 100_000 + i * 20_000);
    expect(rollup(t)).toBe(3);
    const p = new TestPlayer(t, 'me');
    await p.signIn();
    // soft_fast (a time under the size's soft floor) is accepted but flagged: no rollup row, the standing still comes.
    const n = makeWin(DAILY).cats.length;
    const soft = DEFAULT_CONFIG.antiCheat.minSolveMs[String(n)]![1] - 1;
    const fast = makeWin(DAILY, { solveMs: soft });
    const w1 = await p.wins([fast]);
    expect(w1.results[0]).toMatchObject({ verdict: 'accepted_flagged', reason: 'soft_fast', daily: { solvers: 3, slower: 3 } });
    expect(rollup(t)).toBe(3);
    // The same win again (a lost answer): duplicate, no second count, no standing.
    const w2 = await p.wins([fast]);
    expect(w2.results[0]).toEqual({ winId: fast.winId, verdict: 'duplicate', points: 3 });
    // Another win of the same daily: already counted.
    const w3 = await p.win(DAILY, { solveMs: 200_000 });
    expect(w3.results[0]).toEqual({ winId: expect.any(String), verdict: 'already_counted', points: 0 });
    expect(rollup(t)).toBe(3);
    // A level win adds nothing to the rollup.
    await p.win('L2');
    expect(t.count('SELECT COUNT(*) FROM daily_times WHERE puzzle_id <> ?', DAILY)).toBe(0);
    // The web pool has its own rollup (H-7): two web solvers see nothing (below 3 others), the fb counts stay.
    const web = await solve(t, 2, 'w', () => 90_000, 'web');
    for (const w of web) expect(w.results[0]?.daily).toBeUndefined();
    expect(rollup(t, 'web')).toBe(2);
    expect(rollup(t)).toBe(3);
  });

  it('a switched-off rollup writes and answers nothing', async () => {
    const t = makeTestApp({ overrides: { dailyStats: { enabled: false, minSolvers: 1 } } });
    const ws = await solve(t, 3, 'd', (i) => 100_000 + i * 20_000);
    for (const w of ws) expect(w.results[0]?.daily).toBeUndefined();
    expect(t.count('SELECT COUNT(*) FROM daily_times')).toBe(0);
  });

  it('the rollup holds no player key, a suspended player never counts, and the sweep deletes old days', async () => {
    const t = makeTestApp({ overrides: { dailyStats: { minSolvers: 1 } } });
    await solve(t, 2, 'd', (i) => 100_000 + i * 20_000);
    expect(t.rows<{ name: string }>('SELECT name FROM pragma_table_info(?)', 'daily_times').map((c) => c.name).sort()).toEqual(['bucket', 'n', 'pool', 'puzzle_id']);
    // The batch's own guard: a player whose status is no longer ok when the batch runs adds no row (store level).
    const [s] = await playersWithWins(t, 1, 's');
    const key = s!.key();
    const row = t.rows<{ wtok: string; cur_bracket: string; nickname: string; avatar: number }>('SELECT wtok, cur_bracket, nickname, avatar FROM players WHERE key = ?', key)[0]!;
    t.db.raw.prepare("UPDATE players SET status = 'suspended' WHERE key = ?").run(key);
    const store = new SqlStore(t.db);
    const now = t.clock.now();
    const r = await store.writeWins({
      playerKey: key,
      nickname: row.nickname,
      avatar: row.avatar,
      frame: 0,
      bg: 0,
      now,
      target: { kind: 'current', bracketId: row.cur_bracket },
      wins: [{ puzzleId: DAILY, winId: '00000000-0000-4000-8000-000000000001', points: 3, fish: 3, solveMs: 90_000, n: 8, verdict: 'accepted', playedAt: now, clientVersion: '0.2.0', dailyBucket: 9 }],
      player: { maxLevel: 2, budgetMs: 3_600_000, budgetAt: now },
      flags: [],
      cas: { expect: row.wtok, next: 'next-token' },
    });
    expect(r).toMatchObject({ applied: true, inserted: [true], rolled: [false] });
    expect(rollup(t)).toBe(2);
    // Older than dailyStats.keepDays (7): gone with the daily sweep; a newer day stays.
    t.clock.advance(8 * DAY);
    const report = await t.app.scheduled(t.clock.now(), RETENTION_CRON);
    expect(report.swept?.daily_times).toBe(2);
    expect(t.count('SELECT COUNT(*) FROM daily_times')).toBe(0);
  });
});
