// Owner: G1 (Phase 2d.1)
// The level-start tickers' lines (docs/phase2d/helpers-spec.md §5.4, §7.6, D-2d1-12): line 1 is this
// board's (Retry > Hard > the best time here in level mode > "{n} cats are hiding here" or "You can
// solve this one!" by the seed); line 2 is the player's (the eligible lines 6–12 at seed mod count).
// HONEST: every number a line carries comes from the input (the save or the board), never a constant.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { eligibleLine2, pickTickerLines, type TickerInput } from '../../../src/app/tickers';
import { periodKeyAt } from '../../../src/game/scoring';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import type { TickerLine } from '../../../src/ui/fx/tickers';
import { NOW, TODAY } from './harness';

const save = (patch: Partial<SaveData> = {}): SaveData => ({ ...defaults(NOW - 86_400_000), tutorialDone: true, ...patch });
const input = (patch: Partial<TickerInput> = {}): TickerInput => ({
  save: save(),
  mode: 'level',
  level: 12,
  n: 7,
  hard: false,
  retry: false,
  dailyOpen: false,
  todayKey: TODAY,
  seed: 'L12:0',
  now: NOW,
  ...patch,
});
const keys = (ls: readonly TickerLine[]): string[] => ls.map((l) => l.key);
/** Many seeds (as many boards and attempts) for one input. */
const over = (base: TickerInput, count = 200) => Array.from({ length: count }, (_, i) => pickTickerLines({ ...base, seed: `L${i}:${i % 3}` }));

/** A veteran: 42 levels solved, a best time on level 12, this period's fish, lifetime points. */
const veteran = (): SaveData =>
  save({
    progress: { level: 43, completed: 42, best: { 12: [252_000, 0], 13: [61_000, 1] } },
    points: { total: 13_248 },
    period: { key: periodKeyAt(NOW, cfg), total: 17, bestKey: periodKeyAt(NOW, cfg), bestTotal: 17 },
  });

describe('pickTickerLines: line 1 (this board)', () => {
  it('priorities: Retry > Hard > the best time here > the seeded cats / fresh line', () => {
    const v = veteran();
    expect(pickTickerLines(input({ save: v, retry: true, hard: true }))[0]).toEqual({ key: 'toast.start.retry' });
    expect(pickTickerLines(input({ save: v, hard: true }))[0]).toEqual({ key: 'toast.start.hard' });
    expect(pickTickerLines(input({ save: v }))[0]).toEqual({ key: 'ticker.best', ms: 252_000 });
    // No best on this level: half of the boards each, chosen by the seed.
    const lines = over(input({ save: v, level: 20 })).map((l) => l[0]);
    const cats = lines.filter((l) => l.key === 'ticker.cats');
    const fresh = lines.filter((l) => l.key === 'toast.start.level');
    expect(cats.length + fresh.length).toBe(200);
    expect(cats.length).toBeGreaterThan(60);
    expect(fresh.length).toBeGreaterThan(60);
    for (const l of cats) expect(l).toEqual({ key: 'ticker.cats', count: 7 });
    for (const l of fresh) expect(l).toEqual({ key: 'toast.start.level' });
  });

  it('the best time is level mode only, carries the stored ms (rendered with formatClock), never for a daily or an event index', () => {
    const v = veteran();
    expect(pickTickerLines(input({ save: v, level: 13 }))[0]).toEqual({ key: 'ticker.best', ms: 61_000 });
    // An event index 12 or a daily never reads progress.best (an index is not a level number).
    for (const mode of ['daily', 'event'] as const) {
      for (const line of over(input({ save: v, mode, level: null }), 40)) expect(line[0].key).not.toBe('ticker.best');
      for (const line of over(input({ save: v, mode, level: 12 }), 40)) expect(line[0].key).not.toBe('ticker.best');
    }
    // A broken record (0 or not a number) is not a time.
    const bad = save({ progress: { level: 20, completed: 19, best: { 12: [0, 0] } } });
    expect(pickTickerLines(input({ save: bad }))[0].key).not.toBe('ticker.best');
  });

  it('{count} of the cats line is the board size n', () => {
    for (const n of [5, 8, 12]) {
      const cats = over(input({ level: 99, n })).map((l) => l[0]).filter((l) => l.key === 'ticker.cats');
      expect(cats.length).toBeGreaterThan(0);
      for (const l of cats) expect(l.count).toBe(n);
    }
  });
});

describe('pickTickerLines: line 2 (the player)', () => {
  it('eligibility per row of §5.4, every number from the save', () => {
    const v = veteran();
    expect(eligibleLine2(input({ save: v, dailyOpen: true }))).toEqual([
      { key: 'ticker.solved', count: 42 },
      { key: `period.pill.${cfg.period.kind}`, count: 17 },
      { key: 'ticker.points', count: 13_248 },
      { key: 'ticker.daily' },
      { key: 'ticker.unique' },
    ]);
    // A new player: under 2 solved, no fish this period, no points, the daily locked: the fact and the tips.
    const fresh = save({ progress: { level: 2, completed: 1, best: {} } });
    expect(keys(eligibleLine2(input({ save: fresh })))).toEqual(['ticker.unique', 'ticker.tip.cat', 'ticker.tip.drag']);
    // The tips stop at 20 solved; "solved" starts at 2.
    const mid = save({ progress: { level: 3, completed: 2, best: {} } });
    expect(keys(eligibleLine2(input({ save: mid })))).toEqual(['ticker.solved', 'ticker.unique', 'ticker.tip.cat', 'ticker.tip.drag']);
    const twenty = save({ progress: { level: 21, completed: 20, best: {} } });
    expect(keys(eligibleLine2(input({ save: twenty })))).toEqual(['ticker.solved', 'ticker.unique']);
  });

  it('the period line follows cfg.period.kind and shows nothing after a rollover (this period\'s total only)', () => {
    const v = veteran();
    const month = mergeConfig({ period: { kind: 'month' } });
    const keyMonth = periodKeyAt(NOW, month);
    const vm = { ...v, period: { key: keyMonth, total: 9, bestKey: keyMonth, bestTotal: 9 } };
    expect(eligibleLine2(input({ save: vm }), month)).toContainEqual({ key: 'period.pill.month', count: 9 });
    // The stored period is an older one: this period's total is 0, no line.
    const old = { ...v, period: { key: '2020-01-06', total: 30, bestKey: '2020-01-06', bestTotal: 30 } };
    expect(keys(eligibleLine2(input({ save: old })))).not.toContain(`period.pill.${cfg.period.kind}`);
  });

  it('the daily line only when the daily is open, never on the daily itself', () => {
    const v = veteran();
    expect(keys(eligibleLine2(input({ save: v, dailyOpen: false })))).not.toContain('ticker.daily');
    expect(keys(eligibleLine2(input({ save: v, dailyOpen: true })))).toContain('ticker.daily');
    expect(keys(eligibleLine2(input({ save: v, dailyOpen: true, mode: 'daily', level: null })))).not.toContain('ticker.daily');
    expect(keys(eligibleLine2(input({ save: v, dailyOpen: true, mode: 'event', level: null })))).toContain('ticker.daily');
  });

  it('the line at seed mod count: deterministic per seed; every eligible line is reached; a Retry may change it', () => {
    const base = input({ save: veteran(), dailyOpen: true });
    expect(pickTickerLines(base)).toEqual(pickTickerLines({ ...base }));
    const seen = new Set(over(base).map((l) => l[1].key));
    expect([...seen].sort()).toEqual(keys(eligibleLine2(base)).sort());
    // Retry: the same board with the next attempt (the seed's attempt part).
    let changed = 0;
    for (let i = 0; i < 50; i++) {
      const a = pickTickerLines({ ...base, seed: `L${i}:0` })[1];
      const b = pickTickerLines({ ...base, seed: `L${i}:1`, retry: true })[1];
      if (a.key !== b.key) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe('honest numbers (§5.4: never a statistic we cannot back)', () => {
  it('every {count} / {time} in any line equals a value from the input', () => {
    const v = veteran();
    const allowed = new Set([7, 42, 17, 13_248, 252_000]);
    for (const extra of [{}, { dailyOpen: true }, { retry: true }, { hard: true }, { level: 20 }, { mode: 'daily' as const, level: null }]) {
      for (const lines of over(input({ save: v, ...extra }))) {
        for (const l of lines) {
          if (l.count !== undefined) expect(allowed.has(l.count), `${l.key} ${l.count}`).toBe(true);
          if (l.ms !== undefined) expect(l.ms).toBe(252_000);
          // Only the plural keys carry a count, only ticker.best a time.
          expect(l.count === undefined).toBe(!['ticker.cats', 'ticker.solved', 'ticker.points', `period.pill.${cfg.period.kind}`].includes(l.key));
          expect(l.ms === undefined).toBe(l.key !== 'ticker.best');
        }
      }
    }
  });

  it('a different save changes the numbers with it (nothing is a constant)', () => {
    const a = save({ progress: { level: 8, completed: 7, best: {} }, points: { total: 1 } });
    const b = save({ progress: { level: 99, completed: 98, best: {} }, points: { total: 576 } });
    expect(eligibleLine2(input({ save: a }))).toContainEqual({ key: 'ticker.solved', count: 7 });
    expect(eligibleLine2(input({ save: a }))).toContainEqual({ key: 'ticker.points', count: 1 });
    expect(eligibleLine2(input({ save: b }))).toContainEqual({ key: 'ticker.solved', count: 98 });
    expect(eligibleLine2(input({ save: b }))).toContainEqual({ key: 'ticker.points', count: 576 });
  });
});
