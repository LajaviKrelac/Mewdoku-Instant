// Owner: G1 (Phase 2d.1)
// The level-start tickers' lines (docs/phase2d/helpers-spec.md §5.4, §7.6, D-2d1-12): line 1 is this
// board's (Retry > Hard > the best time here in level mode > "{n} cats are hiding here" or "You can
// solve this one!" by the seed); line 2 is the player's (the eligible lines 6–12 at seed mod count).
// HONEST: every number a line carries comes from the input (the save or the board), never a constant.
// UI batch (2026-10-13), messages: the richer lines. Line 1: a Retry says how close the lost attempt came, else picks
// among the odds estimate, its cats placed, "again" (no number: review F19) and the cheer; a Hard level is the
// player's first (always said) or picks among the Hard levels beaten, the cheer and the odds; a tough board (estimated
// first try ≤ oddsMaxFirstTryPct) shows the odds. Line 2 gains the player's records and the milestone. The odds numbers (H-2a)
// are game/level-odds.ts's for this board; every other number is the input's.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { eligibleLine2, flawlessLevels, hardLevelsBeaten, pickTickerLines, type TickerInput } from '../../../src/app/tickers';
import { levelOdds } from '../../../src/game/level-odds';
import { isHardLevel } from '../../../src/game/ramp';
import { periodKeyAt } from '../../../src/game/scoring';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import type { TickerLine } from '../../../src/ui/fx/tickers';
import { NOW, TODAY } from './harness';

const save = (patch: Partial<SaveData> = {}): SaveData => ({ ...defaults(NOW - 86_400_000), tutorialDone: true, ...patch });
/** An easy board by default (G3, effort 40, 7 × 7: about 90 % on the first try), so line 1 keeps its 2d.1 choice. */
const input = (patch: Partial<TickerInput> = {}): TickerInput => ({
  save: save(),
  mode: 'level',
  level: 12,
  n: 7,
  grade: 3,
  effort: 40,
  hard: false,
  retry: false,
  attempt: 0,
  lastTry: null,
  dailyOpen: false,
  todayKey: TODAY,
  seed: 'L12:0',
  now: NOW,
  ...patch,
});
/** A tough board (G4, effort 120, 11 × 11): the model's first try is well under oddsMaxFirstTryPct. */
const TOUGH = { grade: 4, effort: 120, n: 11 } as const;
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
  it('priorities: Retry > Hard > the best time here > a tough board\'s odds > the seeded cats / fresh line', () => {
    const v = veteran();
    expect(['ticker.odds.retry', 'toast.start.retry']).toContain(pickTickerLines(input({ save: v, retry: true, attempt: 1, hard: true }))[0].key);
    expect(['ticker.hard.beaten', 'toast.start.hard', 'ticker.odds.firstTry', 'ticker.odds.tries']).toContain(pickTickerLines(input({ save: v, hard: true }))[0].key);
    expect(pickTickerLines(input({ save: v }))[0]).toEqual({ key: 'ticker.best', ms: 252_000 });
    expect(pickTickerLines(input({ save: v, ...TOUGH }))[0]).toEqual({ key: 'ticker.best', ms: 252_000 });
    expect(pickTickerLines(input({ save: v, level: 20, ...TOUGH }))[0].key).toMatch(/^ticker\.odds\.(firstTry|tries)$/);
    // No best on this level, an easy board: half of the boards each, chosen by the seed.
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

  it('a tough board (level, daily or event) sets expectations with the model\'s rounded odds; the tries line only from oddsMinTries', () => {
    for (const mode of ['level', 'daily', 'event'] as const) {
      const base = input({ mode, level: mode === 'level' ? 99 : null, ...TOUGH });
      const o = levelOdds(base);
      expect(o.firstTryPct).toBeLessThanOrEqual(cfg.fx.tickers.oddsMaxFirstTryPct);
      const seen = new Set<string>();
      for (const [l] of over(base, 60)) {
        seen.add(l.key);
        if (l.key === 'ticker.odds.firstTry') expect(l).toEqual({ key: 'ticker.odds.firstTry', pct: o.firstTryPct });
        else expect(l).toEqual({ key: 'ticker.odds.tries', count: o.tries });
      }
      expect([...seen].sort()).toEqual(o.tries >= cfg.fx.tickers.oddsMinTries ? ['ticker.odds.firstTry', 'ticker.odds.tries'] : ['ticker.odds.firstTry']);
    }
    // The threshold is config: at 0 no board is tough.
    const off = mergeConfig({ fx: { tickers: { oddsMaxFirstTryPct: 0 } } });
    for (let i = 0; i < 40; i++) {
      expect(['ticker.cats', 'toast.start.level']).toContain(pickTickerLines(input({ level: 99, seed: `L${i}:0`, ...TOUGH }), off)[0].key);
    }
  });

  it('a Hard level: the first one says so; later ones pick the Hard levels beaten, the cheer or the odds', () => {
    // Level 30 is the first Hard level (hardFrom 30): nothing Hard behind the player yet.
    const first = save({ progress: { level: 30, completed: 29, best: {} } });
    for (const [l] of over(input({ save: first, level: 30, hard: true, ...TOUGH }), 40)) expect(l).toEqual({ key: 'ticker.hard.first' });
    const at70 = save({ progress: { level: 70, completed: 69, best: {} } });
    const base = input({ save: at70, level: 70, hard: true, ...TOUGH });
    const o = levelOdds(base);
    const seen = new Set<string>();
    for (const [l] of over(base)) {
      seen.add(l.key);
      if (l.key === 'ticker.hard.beaten') expect(l.count).toBe(4); // 30, 40, 50, 60
      if (l.key === 'ticker.odds.firstTry') expect(l.pct).toBe(o.firstTryPct);
      if (l.key === 'ticker.odds.tries') expect(l.count).toBe(o.tries);
    }
    expect([...seen].sort()).toEqual(['ticker.hard.beaten', 'ticker.odds.firstTry', 'ticker.odds.tries', 'toast.start.hard']);
  });

  it('a Retry: "so close" when the lost attempt was retryCloseCats or fewer cats short; else the odds, its cats, the again line or the cheer', () => {
    const close = input({ retry: true, attempt: 1, n: 9, lastTry: { placed: 7, n: 9 } });
    for (const [l] of over(close, 40)) expect(l).toEqual({ key: 'ticker.retry.close', count: 2 });
    expect(pickTickerLines({ ...close, lastTry: { placed: 8, n: 9 } })[0]).toEqual({ key: 'ticker.retry.close', count: 1 });
    // 3 short: not close; its cats are one of the choices, the again line only from the second Retry in a row on.
    const far = input({ retry: true, attempt: 1, n: 9, lastTry: { placed: 6, n: 9 } });
    const retryPct = levelOdds(far).retryPct;
    const seen = new Set<string>();
    for (const [l] of over(far)) {
      seen.add(l.key);
      if (l.key === 'ticker.retry.found') expect(l).toEqual({ key: 'ticker.retry.found', placed: 6, n: 9 });
      if (l.key === 'ticker.odds.retry') expect(l).toEqual({ key: 'ticker.odds.retry', pct: retryPct });
    }
    expect([...seen].sort()).toEqual(['ticker.odds.retry', 'ticker.retry.found', 'toast.start.retry']);
    const third = new Set(over({ ...far, attempt: 2 }).map((l) => l[0].key));
    expect([...third].sort()).toEqual(['ticker.odds.retry', 'ticker.retry.again', 'ticker.retry.found', 'toast.start.retry']);
    // Review F19: `attempt` counts only the Retries in a row since this board was mounted (Home or a reload resets it),
    // so the line carries no try number.
    for (const [l] of over({ ...far, attempt: 4 })) if (l.key === 'ticker.retry.again') expect(l).toEqual({ key: 'ticker.retry.again' });
    // No cats placed, no last attempt, or another board's: never a cats line (and never "so close").
    for (const lastTry of [{ placed: 0, n: 9 }, null, { placed: 8, n: 10 }]) {
      for (const [l] of over({ ...far, lastTry }, 60)) expect(['ticker.odds.retry', 'toast.start.retry']).toContain(l.key);
    }
    // retryCloseCats is config.
    const wide = mergeConfig({ fx: { tickers: { retryCloseCats: 3 } } });
    expect(pickTickerLines(far, wide)[0]).toEqual({ key: 'ticker.retry.close', count: 3 });
  });
});

describe('pickTickerLines: line 2 (the player)', () => {
  it('eligibility per row of §5.4, every number from the save', () => {
    const v = veteran();
    expect(eligibleLine2(input({ save: v, dailyOpen: true }))).toEqual([
      { key: 'ticker.solved', count: 42 },
      { key: 'ticker.hard.beaten', count: 2 }, // levels 30 and 40 (the next level is 43)
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

  it('the player\'s records: levels without a mistake (2+), a live streak (2+ days), dailies solved, Hard levels beaten (not on a Hard board)', () => {
    const rich = save({
      progress: { level: 61, completed: 60, best: { 5: [40_000, 0], 6: [50_000, 0], 7: [55_000, 2], 8: [61_000, 0] } },
      daily: { '2026-10-01': [100_000, 0, 0, 0], '2026-10-05': [90_000, 1, 0, 0] },
      dayStreak: { dates: ['2026-10-05', '2026-10-06'], run: 2, best: 4, paid: [] },
    });
    expect(eligibleLine2(input({ save: rich, level: 61 }))).toEqual([
      { key: 'ticker.solved', count: 60 },
      { key: 'ticker.flawless', count: 3 },
      { key: 'ticker.streak', count: 2 },
      { key: 'ticker.dailies', count: 2 },
      { key: 'ticker.hard.beaten', count: 4 }, // 30, 40, 50, 60
      { key: 'ticker.unique' },
    ]);
    // On a Hard board line 1 speaks of the Hard levels; a broken streak (last counted 2 days ago) is not shown.
    const broken = { ...rich, dayStreak: { dates: ['2026-10-04', '2026-10-05'], run: 2, best: 4, paid: [] } };
    expect(keys(eligibleLine2(input({ save: broken, level: 60, hard: true })))).toEqual(['ticker.solved', 'ticker.flawless', 'ticker.dailies', 'ticker.unique']);
    // One flawless level or a 1-day run is not yet a record worth a line.
    const small = save({ progress: { level: 9, completed: 8, best: { 5: [40_000, 0] } }, dayStreak: { dates: [TODAY], run: 1, best: 1, paid: [] } });
    expect(keys(eligibleLine2(input({ save: small })))).toEqual(['ticker.solved', 'ticker.unique', 'ticker.tip.cat', 'ticker.tip.drag']);
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
      const b = pickTickerLines({ ...base, seed: `L${i}:1`, retry: true, attempt: 1 })[1];
      if (a.key !== b.key) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('every milestoneEvery levels the milestone takes line 2 on the fresh board (not on a Retry, a daily or an event)', () => {
    const at = save({ progress: { level: 100, completed: 99, best: {} } });
    for (const lines of over(input({ save: at, level: 100, hard: true }), 20)) expect(lines[1]).toEqual({ key: 'ticker.milestone', level: 100 });
    for (const lines of over(input({ save: at, level: 100, hard: true, retry: true, attempt: 1 }), 20)) expect(lines[1].key).not.toBe('ticker.milestone');
    for (const lines of over(input({ save: at, level: 101 }), 20)) expect(lines[1].key).not.toBe('ticker.milestone');
    for (const mode of ['daily', 'event'] as const) for (const lines of over(input({ save: at, mode, level: null }), 20)) expect(lines[1].key).not.toBe('ticker.milestone');
    const every25 = mergeConfig({ fx: { tickers: { milestoneEvery: 25 } } });
    expect(pickTickerLines(input({ save: at, level: 75 }), every25)[1]).toEqual({ key: 'ticker.milestone', level: 75 });
    expect(pickTickerLines(input({ save: at, level: 0 }), every25)[1].key).not.toBe('ticker.milestone');
  });
});

describe('the records behind line 2', () => {
  it('hardLevelsBeaten: the Hard levels below progress.level (isHardLevel, levels are played in order)', () => {
    for (const next of [1, 2, 29, 30, 31, 40, 41, 99, 100, 101, 1000, 1001, 5555]) {
      let brute = 0;
      for (let l = 1; l < next; l++) if (isHardLevel(l)) brute++;
      expect(hardLevelsBeaten(save({ progress: { level: next, completed: next - 1, best: {} } })), String(next)).toBe(brute);
    }
    const other = mergeConfig({ levels: { hardFrom: 35, hardEvery: 7 } });
    for (const next of [34, 35, 36, 43, 100]) {
      let brute = 0;
      for (let l = 1; l < next; l++) if (isHardLevel(l, other)) brute++;
      expect(hardLevelsBeaten(save({ progress: { level: next, completed: 0, best: {} } }), other), String(next)).toBe(brute);
    }
  });

  it('flawlessLevels: records with 0 mistakes and a time', () => {
    expect(flawlessLevels(save({ progress: { level: 9, completed: 8, best: { 2: [1, 0], 3: [5, 1], 4: [0, 0], 5: [9, 0] } } }))).toBe(2);
    expect(flawlessLevels(save())).toBe(0);
  });
});

describe('honest numbers (§5.4: never a statistic we cannot back; H-2a: the odds are the model\'s for this board)', () => {
  it('every {count} / {time} / {placed} / {n} / {level} equals a value from the input; {pct} and the tries are levelOdds\'', () => {
    const v = save({
      ...veteran(),
      progress: { level: 50, completed: 49, best: { 12: [252_000, 0], 13: [61_000, 1], 14: [70_000, 0] } },
      daily: { '2026-10-02': [100_000, 0, 0, 0] },
      dayStreak: { dates: ['2026-10-06', TODAY], run: 6, best: 6, paid: [] },
    });
    // 49 solved, 2 Hard beaten (30 and 40: the next level is 50), 2 flawless, a 6-day run, 1 daily, 17 fish, the points, n 7.
    expect(hardLevelsBeaten(v)).toBe(2);
    const fromSave = new Set([49, 2, 6, 1, 17, 13_248, 7]);
    const plural = ['ticker.cats', 'ticker.solved', 'ticker.points', `period.pill.${cfg.period.kind}`, 'ticker.flawless', 'ticker.streak', 'ticker.dailies', 'ticker.hard.beaten', 'ticker.retry.close', 'ticker.odds.tries'];
    const extras: Partial<TickerInput>[] = [
      {},
      { dailyOpen: true },
      { retry: true, attempt: 1 },
      { retry: true, attempt: 3, lastTry: { placed: 4, n: 7 } },
      { retry: true, attempt: 1, lastTry: { placed: 6, n: 7 } },
      { hard: true, level: 50 },
      { level: 20 },
      { level: 20, ...TOUGH, n: 7 },
      { mode: 'daily' as const, level: null },
    ];
    for (const extra of extras) {
      const base = input({ save: v, ...extra });
      const o = levelOdds(base);
      for (const lines of over(base)) {
        for (const l of lines) {
          const k = l.key;
          if (k === 'ticker.odds.firstTry') expect(l.pct).toBe(o.firstTryPct);
          else if (k === 'ticker.odds.retry') expect(l.pct).toBe(o.retryPct);
          else expect(l.pct, k).toBeUndefined();
          if (k === 'ticker.odds.tries') expect(l.count).toBe(o.tries);
          else if (k === 'ticker.retry.close') expect(l.count).toBe((base.lastTry?.n ?? 0) - (base.lastTry?.placed ?? 0));
          else if (l.count !== undefined) expect(fromSave.has(l.count), `${k} ${l.count}`).toBe(true);
          if (k === 'ticker.retry.found') expect([l.placed, l.n]).toEqual([base.lastTry?.placed, base.lastTry?.n]);
          else expect(l.placed === undefined && l.n === undefined, k).toBe(true);
          if (k === 'ticker.milestone') expect(l.level).toBe(base.level);
          else expect(l.level, k).toBeUndefined();
          if (l.ms !== undefined) expect(l.ms).toBe(252_000);
          // Only the plural keys carry a count, only ticker.best a time.
          expect(l.count === undefined, k).toBe(!plural.includes(k));
          expect(l.ms === undefined).toBe(k !== 'ticker.best');
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
    expect(eligibleLine2(input({ save: b }))).toContainEqual({ key: 'ticker.hard.beaten', count: 7 });
  });
});
