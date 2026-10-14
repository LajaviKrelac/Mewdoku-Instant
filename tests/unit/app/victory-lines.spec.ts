// UI batch (2026-10-13): victory — the praise and statistic lines (app/victory-lines.ts). Praise states facts of THIS
// board and the player's own save; the statistic is approximate by decision (spec §0.4 H-2a): a daily's from the
// server's standing once it has victory.minSolvers others, else our estimate; a level's is the estimate and only
// when encouraging. Ids and numbers only (the overlay renders them); every number comes from the input.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { pickVictoryLines, praiseLines, statLine, victoryFacts, type FactsInput, type VictoryFacts } from '../../../src/app/victory-lines';
import { newGame } from '../../../src/game/factory';
import { dailySlotFor } from '../../../src/game/ramp';
import { defaults } from '../../../src/game/save';
import { medianSolveMs } from '../../../src/game/solve-time-model';
import type { GameState, LevelBest, SaveData } from '../../../src/game/types';
import { dailyPuzzle, levelPuzzle, NOW } from './harness';

const save = (patch: Partial<SaveData> = {}): SaveData => ({ ...defaults(NOW - 86_400_000), tutorialDone: true, ...patch });

/** Best records for levels from … to (a won level's record). */
const wins = (from: number, to: number, ms = 300_000): Record<number, LevelBest> => {
  const out: Record<number, LevelBest> = {};
  for (let l = from; l <= to; l++) out[l] = [ms, 1];
  return out;
};

/** A won 5×5 level board with these attempt facts. */
const won = (patch: Partial<GameState> = {}, puzzle = levelPuzzle(12)): GameState => ({
  ...newGame(puzzle, puzzle.id.startsWith('D') ? 'daily' : 'level'),
  status: 'won',
  elapsedMs: 95_000,
  catStreak: 5,
  ...patch,
});

/** A won board of size n (level or daily by the puzzle's id) in `ms`. */
const wonSize = (n: number, ms: number, puzzle = levelPuzzle(12)): GameState => won({ puzzle: { ...puzzle, n }, elapsedMs: ms });

// The default win: Level 12 after the tutorial and Levels 2 … 11 (the records before it are left out: no best to beat).
const input = (patch: Partial<FactsInput> = {}): FactsInput => ({
  before: save({ progress: { level: 12, completed: 11, best: {} } }),
  after: save({ progress: { level: 13, completed: 12, best: { ...wins(2, 11), 12: [95_000, 0] } } }),
  state: won(),
  mode: 'level',
  hard: false,
  restored: false,
  mice: 0,
  retries: 0,
  ...patch,
});

/** Facts with these fields (the rest a clean level win). */
const facts = (patch: Partial<VictoryFacts> = {}): VictoryFacts => ({ ...victoryFacts(input()), ...patch });

describe('victory facts (the player\'s own game and save)', () => {
  it('reads the attempt from the game state and the counts from the save after the win', () => {
    const f = victoryFacts(input({ state: won({ mistakes: 1, hintsUsed: 2, kittiesUsed: 1, revivesUsed: 0, catStreak: 3, elapsedMs: 123_456.7 }), mice: 1, retries: 2 }));
    expect(f).toEqual({
      mode: 'level',
      n: 5,
      grade: 2,
      hard: false,
      ms: 123_457,
      mistakes: 1,
      hints: 2,
      kitties: 1,
      mice: 1,
      revives: 0,
      retries: 2,
      run: 3,
      bestBeforeMs: null,
      levelsSolved: 11, // Levels 2 … 12: the tutorial is not a solved level
      dailiesSolved: 0,
    });
  });

  it('the best to beat: same-size levels (the pack knows the sizes) or same-size dailies, from the save BEFORE the win', () => {
    const before = save({ progress: { level: 12, completed: 11, best: { 3: [40_000, 0], 4: [30_000, 0], 9: [200_000, 1] } } });
    const size = (l: number): number | null => (l === 4 ? 6 : l === 9 ? 5 : l === 3 ? 5 : null);
    expect(victoryFacts(input({ before, levelSize: size })).bestBeforeMs).toBe(40_000);
    // Sizes unknown: every record may be of this size (the 6×6 one too), so the line can say less, never too much.
    expect(victoryFacts(input({ before })).bestBeforeMs).toBe(30_000);
    expect(victoryFacts(input({ before, levelSize: () => null })).bestBeforeMs).toBe(30_000);
    // Dailies: only earlier dailies of the same size count.
    const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    const n = dailySlotFor('2026-10-12').n;
    const same = dates.filter((d) => dailySlotFor(d).n === n);
    const other = dates.filter((d) => dailySlotFor(d).n !== n);
    expect(same.length).toBeGreaterThan(0);
    expect(other.length).toBeGreaterThan(0);
    const daily: SaveData['daily'] = {};
    for (const d of same) daily[d] = [80_000, 0, 0, 0];
    for (const d of other) daily[d] = [10_000, 0, 0, 0]; // faster, but another size
    const state = won({ puzzle: { ...dailyPuzzle('2026-10-12'), n } });
    const f = victoryFacts(input({ mode: 'daily', state, before: save({ daily }), after: save({ daily: { ...daily, '2026-10-12': [95_000, 0, 0, 0] } }) }));
    expect(f.n).toBe(n);
    expect(f.bestBeforeMs).toBe(80_000);
    expect(f.dailiesSolved).toBe(dates.length + 1);
  });

  it('a level whose pack is not in memory may be of this size: no "new best" over a faster record of unknown size', () => {
    // Fresh start at L350: packs 0 and 3 are in memory, pack 1 (L101-200) is not. The fastest 9×9 is L150 (2:40).
    const best = { 50: [200_000, 0], 150: [160_000, 0], 320: [210_000, 1], 330: [90_000, 0] } satisfies Record<number, LevelBest>;
    const size = (l: number): number | null => (l >= 101 && l <= 200 ? null : l === 330 ? 8 : 9);
    const at350 = (b: Record<number, LevelBest>): VictoryFacts =>
      victoryFacts(input({ before: save({ progress: { level: 350, completed: 349, best: b } }), state: wonSize(9, 185_000, levelPuzzle(350)), levelSize: size }));
    expect(at350(best).bestBeforeMs).toBe(160_000);
    expect(praiseLines(at350(best)).map((l) => l.id)).not.toContain('best');
    // Without that record, 3:05 beats every 9×9 (the faster 8×8 is another size): the line is true.
    const { 150: _l150, ...known } = best;
    expect(at350(known).bestBeforeMs).toBe(200_000);
    expect(praiseLines(at350(known)).find((l) => l.id === 'best')).toEqual({ id: 'best', ms: 185_000, n: 9 });
    // The shipped packs' case: L121 (pack 1, not loaded) 1:20, L202 2:30, both 9×9; L205 (9×9) won in 2:00.
    const f = victoryFacts(
      input({
        before: save({ progress: { level: 205, completed: 204, best: { 121: [80_000, 0], 202: [150_000, 1] } } }),
        state: wonSize(9, 120_000, levelPuzzle(205)),
        levelSize: (l) => (l === 121 ? null : 9),
      }),
    );
    expect(f.bestBeforeMs).toBe(80_000);
    expect(praiseLines(f).map((l) => l.id)).not.toContain('best');
  });

  it('"a {size} board" means every board of that size: a level counts the same-size dailies, a daily the same-size levels', () => {
    const wed = '2026-10-07';
    const n = dailySlotFor(wed).n;
    const sameSize = ['2026-09-30', '2026-10-01'].filter((d) => dailySlotFor(d).n === n);
    const otherSize = '2026-09-28';
    expect(sameSize).toHaveLength(2);
    expect(dailySlotFor(otherSize).n).not.toBe(n);
    const daily: SaveData['daily'] = { [otherSize]: [60_000, 0, 0, 0] }; // faster, but another size
    for (const d of sameSize) daily[d] = [210_000, 0, 0, 0];
    // The daily: L150 (this size) in 2:10, the same-size dailies in 3:30; today's daily in 3:00 is no new best.
    const before = save({ progress: { level: 160, completed: 159, best: { 150: [130_000, 0] } }, daily });
    const sizes = (l: number): number | null => (l === 150 ? n : null);
    const today = victoryFacts(input({ mode: 'daily', before, after: before, state: wonSize(n, 180_000, dailyPuzzle(wed)), levelSize: sizes }));
    expect(today.bestBeforeMs).toBe(130_000);
    expect(praiseLines(today).map((l) => l.id)).not.toContain('best');
    // The level: a same-size daily in 2:00 is the best to beat for L160 (this size) won in 2:30.
    const lvl = victoryFacts(
      input({
        before: { ...before, daily: { ...daily, [sameSize[0] as string]: [120_000, 0, 0, 0] } },
        state: wonSize(n, 150_000, levelPuzzle(160)),
        levelSize: (l) => (l === 150 ? n + 1 : n),
      }),
    );
    expect(lvl.bestBeforeMs).toBe(120_000);
    expect(praiseLines(lvl).map((l) => l.id)).not.toContain('best');
    // An event never claims a best.
    expect(victoryFacts(input({ mode: 'event', before, state: wonSize(n, 1_000), levelSize: () => n })).bestBeforeMs).toBeNull();
  });

  it('the levels solved are real wins: a skipped tutorial ("I know how to play") is not a solved level', () => {
    // Skipped tutorial (completed 1, no record), then Level 2 won: completed 2, one record.
    const before = save({ progress: { level: 2, completed: 1, best: {} } });
    const after = save({ progress: { level: 3, completed: 2, best: { 2: [95_000, 0] } } });
    const f = victoryFacts(input({ before, after, state: won({}, levelPuzzle(2)) }));
    expect(f.levelsSolved).toBe(1);
    expect(praiseLines(f).map((l) => l.id)).not.toContain('levels');
  });

  it('a restored board claims neither the mouse nor a best time; an unknown mouse count stays unknown', () => {
    const before = save({ progress: { level: 12, completed: 11, best: { 3: [400_000, 0] } } });
    const f = victoryFacts(input({ before, restored: true, levelSize: () => 5 }));
    expect(f.mice).toBeNull();
    expect(f.bestBeforeMs).toBeNull();
    expect(victoryFacts(input({ mice: null })).mice).toBeNull();
  });
});

describe('praise lines (true facts of this board, best first)', () => {
  it('flawless: no wrong cat, no hint, kitty, mouse or revive; otherwise "not a single wrong cat"', () => {
    expect(praiseLines(facts()).map((l) => l.id)).toEqual(['flawless', 'levels']);
    for (const p of [{ hints: 1 }, { kitties: 1 }, { mice: 1 }, { mice: null }]) {
      const ids = praiseLines(facts(p)).map((l) => l.id);
      expect(ids, JSON.stringify(p)).not.toContain('flawless');
      expect(ids, JSON.stringify(p)).toContain('noSlips');
    }
  });

  it('a new best time on this size (never the first time, never a tie), a Hard level, a revive, a retry', () => {
    expect(praiseLines(facts({ bestBeforeMs: 120_000 }))[1]).toEqual({ id: 'best', ms: 95_000, n: 5 });
    expect(praiseLines(facts({ bestBeforeMs: 95_000 })).map((l) => l.id)).not.toContain('best');
    expect(praiseLines(facts({ bestBeforeMs: null })).map((l) => l.id)).not.toContain('best');
    const ids = praiseLines(facts({ hard: true, mistakes: 3, revives: 1, retries: 1, run: 2 })).map((l) => l.id);
    expect(ids).toEqual(['hard', 'revive', 'retry', 'noHelp', 'levels']);
  });

  it('after a Retry, never "not a single wrong cat on this board" (the lost attempt had wrong cats on it)', () => {
    // Retry, no wrong cat in this attempt, one hint, no best, not Hard, slow (no statistic).
    const f = facts({ retries: 1, hints: 1, ms: medianSolveMs({ n: 5, grade: 2, hard: false }) * 3 });
    expect(praiseLines(f).map((l) => l.id)).toEqual(['retry', 'levels']);
    expect(pickVictoryLines(f, null).map((l) => l.id)).toEqual(['retry', 'levels']);
    expect(praiseLines(facts({ retries: 0, hints: 1 })).map((l) => l.id)).toContain('noSlips');
  });

  it('after a slip: no hint or kitty (the mouse is never claimed), the closing run from victory.runMin', () => {
    const ids = (p: Partial<VictoryFacts>): string[] => praiseLines(facts({ mistakes: 1, ...p })).map((l) => l.id);
    expect(ids({ run: cfg.victory.runMin, mice: 2 })).toEqual(['noHelp', 'run', 'levels']);
    expect(ids({ run: cfg.victory.runMin - 1, hints: 1 })).toEqual(['levels']);
    expect(praiseLines(facts({ mistakes: 1, run: 7 })).find((l) => l.id === 'run')).toEqual({ id: 'run', count: 7 });
  });

  it('the player\'s own counts: levels from victory.milestoneMin; dailies in daily mode; none in an event', () => {
    expect(praiseLines(facts({ levelsSolved: cfg.victory.milestoneMin - 1 })).map((l) => l.id)).not.toContain('levels');
    expect(praiseLines(facts({ mode: 'daily', dailiesSolved: 1 })).find((l) => l.id === 'dailies')).toEqual({ id: 'dailies', count: 1 });
    expect(praiseLines(facts({ mode: 'event' })).map((l) => l.id)).toEqual(['flawless']);
  });
});

describe('the statistic (spec §0.4 H-2a: approximate, "about", encouraging only)', () => {
  const daily = (p: Partial<VictoryFacts> = {}): VictoryFacts => facts({ mode: 'daily', ...p });

  it('a daily uses the server\'s standing once it has victory.minSolvers others: floored, top-N% from victory.topFromPct', () => {
    const min = cfg.victory.minSolvers;
    expect(statLine(daily(), { solvers: min, slower: Math.round(min * 0.62) })).toEqual({ id: 'statFaster', pct: 60 });
    expect(statLine(daily(), { solvers: 200, slower: 180 })).toEqual({ id: 'statTop', pct: 10 }); // 90 % faster → top 10 %
    expect(statLine(daily(), { solvers: 200, slower: 199 })).toEqual({ id: 'statTop', pct: 5 }); // clamped at 95 → top 5 %
    expect(statLine(daily(), { solvers: 200, slower: 150 })).toEqual({ id: 'statTop', pct: 25 });
    // Too few to encourage: no line (never "faster than about 5%").
    expect(statLine(daily(), { solvers: 200, slower: 20 })).toBeNull();
  });

  it('below the minimum, without an answer, offline: our estimate; while the answer is on its way: nothing yet', () => {
    const quick = daily({ ms: Math.round(medianSolveMs({ n: 5, grade: 2, hard: false }) / 3) });
    const est = statLine(quick, null);
    expect(est?.id).toBe('statTop');
    expect(statLine(quick, { solvers: cfg.victory.minSolvers - 1, slower: 0 })).toEqual(est); // too few: the estimate, not the server's 0
    expect(statLine(quick, 'pending')).toBeNull();
    // A slow solve gets no number at all.
    expect(statLine(daily({ ms: medianSolveMs({ n: 5, grade: 2, hard: false }) * 4 }), null)).toBeNull();
    // A malformed standing never counts as the server's.
    expect(statLine(quick, { solvers: 30, slower: 31 })).toEqual(est);
  });

  it('a level: the estimate only from victory.levelStatMinPct; an event or the tutorial: none', () => {
    const med = medianSolveMs({ n: 5, grade: 2, hard: false });
    expect(statLine(facts({ ms: med * 2 }), null)).toBeNull();
    const fast = statLine(facts({ ms: Math.round(med / 2) }), null);
    expect(fast?.id).toBe('statLevel');
    expect(fast?.pct ?? 0).toBeGreaterThanOrEqual(cfg.victory.levelStatMinPct);
    expect(statLine(facts({ mode: 'event', ms: 1000 }), null)).toBeNull();
    expect(statLine(facts({ mode: 'tutorial', ms: 1000 }), null)).toBeNull();
  });
});

describe('pickVictoryLines', () => {
  const med = medianSolveMs({ n: 5, grade: 2, hard: false });

  it('a level leads with its best praise, then the statistic or the next praise line; at most victory.maxLines', () => {
    expect(pickVictoryLines(facts({ ms: Math.round(med / 2) }), null).map((l) => l.id)).toEqual(['flawless', 'statLevel']);
    expect(pickVictoryLines(facts({ ms: med * 3 }), null).map((l) => l.id)).toEqual(['flawless', 'levels']);
    expect(pickVictoryLines(facts({ ms: med * 3, hard: true, bestBeforeMs: med * 4 }), null)).toHaveLength(cfg.victory.maxLines);
    expect(pickVictoryLines(facts({ ms: Math.round(med / 2) }), null, mergeConfig({ victory: { maxLines: 1 } })).map((l) => l.id)).toEqual(['flawless']);
  });

  it('a daily leads with its statistic; the tutorial has none; an event has praise only', () => {
    expect(pickVictoryLines(facts({ mode: 'daily', dailiesSolved: 4 }), { solvers: 40, slower: 30 }).map((l) => l.id)).toEqual(['statTop', 'flawless']);
    expect(pickVictoryLines(facts({ mode: 'daily', dailiesSolved: 4 }), 'pending').map((l) => l.id)).toEqual(['flawless', 'dailies']);
    expect(pickVictoryLines(facts({ mode: 'tutorial' }), null)).toEqual([]);
    expect(pickVictoryLines(facts({ mode: 'event', ms: 1000 }), null).map((l) => l.id)).toEqual(['flawless']);
  });

  it('every number comes from the input: counts, times and sizes from the facts; percentages only on statistics', () => {
    const pool: VictoryFacts[] = [];
    for (const mistakes of [0, 1, 3])
      for (const hints of [0, 2])
        for (const run of [2, 6, 9])
          for (const mode of ['level', 'daily', 'event'] as const)
            for (const k of [0.3, 1, 3]) pool.push(facts({ mode, mistakes, hints, run, revives: mistakes >= 3 ? 1 : 0, ms: Math.round(med * k), bestBeforeMs: med, levelsSolved: 37, dailiesSolved: 4 }));
    const step = cfg.victory.model.stepPct;
    for (const f of pool) {
      for (const standing of [null, 'pending' as const, { solvers: 64, slower: 41 }]) {
        for (const l of pickVictoryLines(f, standing)) {
          if (l.count !== undefined) expect([f.run, f.levelsSolved, f.dailiesSolved], l.id).toContain(l.count);
          if (l.ms !== undefined) expect(l.ms).toBe(f.ms);
          if (l.n !== undefined) expect(l.n).toBe(f.n);
          expect(l.pct === undefined, l.id).toBe(!l.id.startsWith('stat'));
          if (l.pct !== undefined) {
            expect(l.pct % step).toBe(0);
            expect(l.pct).toBeGreaterThanOrEqual(cfg.victory.model.minPct);
            expect(l.pct).toBeLessThanOrEqual(cfg.victory.model.maxPct);
          }
        }
        // Deterministic: the same win gives the same lines.
        expect(pickVictoryLines(f, standing)).toEqual(pickVictoryLines(f, standing));
      }
    }
  });
});
