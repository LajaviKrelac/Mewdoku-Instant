// Owner: G1 (Phase 2d.1)
// The two level-start tickers' lines (docs/phase2d/helpers-spec.md §5.4, D-2d1-12). HONEST lines
// only: we have no live player counts or worldwide totals, so every number a line carries comes from
// this player's own save or from the board itself (its size n); the rest is plain encouragement, a
// true fact (every shipped puzzle has exactly one answer, `levels:verify`) or a tip. G1 picks, G3
// renders (ui/fx/tickers.ts: plural keys with tn(key, count, …), the best time with formatClock).
//   Line 1 (this board): Retry > Hard > the best time here (level mode only, a level won before) >
//     "{n} cats are hiding here" or "You can solve this one!" (half of the boards each, by the seed).
//   Line 2 (the player): one of the eligible lines 6–12 at index seed mod count.
// The seed is puzzleId + ':' + attempt, so a Retry may show another line 2. PURE.
// UI batch (2026-10-13), messages (the user: "so the user feels special or understands the difficulty of the level"):
//   - the ONE exception to "the player's own numbers" is ticker.odds.* (spec §0.4 H-2a, the user's decision): an
//     approximate expectation from game/level-odds.ts, the board's own grade, effort, size and Hard flag, rounded and
//     worded "about". Line 1 shows one on a Hard level and on a tough board (estimated first try ≤
//     fx.tickers.oddsMaxFirstTryPct), and on a Retry;
//   - a Retry also says how the lost attempt went (its own cats placed, session memory), how close it came, or (from
//     the second Retry in a row) that each go teaches the board: no try number (review F19), since `attempt` counts
//     only the Retries since this board was mounted (Home or a reload starts it again at 0), not every try of it;
//   - a Hard level: the player's first one, or how many they have beaten (progress: levels are played in order);
//   - line 2 gains the player's own records: levels solved without a mistake, the streak, dailies solved, Hard levels
//     beaten, and every fx.tickers.milestoneEvery levels the milestone (which takes line 2).
import { cyrb128 } from '../engine/rng';
import { streakView } from '../game/day-streak';
import { levelOdds } from '../game/level-odds';
import type { ModeId, SaveData } from '../game/types';
import type { TickerLine } from '../ui/fx/tickers';
import { cfg, type GameConfig } from './config';
import { periodTotal } from '../game/scoring';

/** UI batch, messages: the lost attempt before a Retry (session memory, never saved). */
export interface LastTry {
  /** Cats on the board when it was lost (GameState.catsPlaced, givens included, as the HUD's "3 of 8"). */
  readonly placed: number;
  readonly n: number;
}

export interface TickerInput {
  readonly save: SaveData;
  readonly mode: ModeId;
  /** The level number in level mode, else null (a daily or an event index is not a level). */
  readonly level: number | null;
  /** The board's size: "{n} cats are hiding here". */
  readonly n: number;
  /** UI batch: the grader's grade and effort (Puzzle.grade / .effort), the odds model's inputs with n and hard. */
  readonly grade: number;
  readonly effort: number;
  readonly hard: boolean;
  /** This board entry follows a Retry. */
  readonly retry: boolean;
  /** UI batch: Retries of this board in this session (0 on a fresh board, 1 on the first Retry …). */
  readonly attempt: number;
  /** UI batch: the attempt the Retry ended (null on a fresh board, or when it is not known). */
  readonly lastTry: LastTry | null;
  /** The daily is unlocked and not solved today (Home's card would offer it). */
  readonly dailyOpen: boolean;
  readonly todayKey: string;
  /** puzzleId + ':' + attempt: picks among the eligible lines. */
  readonly seed: string;
  /** Clock now(), for this period's leaderboard total (period.pill.*: 0 after a rollover, never shown then). */
  readonly now: number;
}

/** A 32-bit unsigned hash of the seed with a salt (line 1 and line 2 draw independently). */
function draw(seed: string, salt: string): number {
  return cyrb128(`${seed}|${salt}`)[0] >>> 0;
}

/** The pool's line at the seed's draw (pool non-empty). */
function pick(pool: readonly TickerLine[], seed: string, salt: string): TickerLine {
  return pool[draw(seed, salt) % pool.length] as TickerLine;
}

/**
 * UI batch: Hard levels the player has beaten. Levels are played in order (progress.level is the next one), so these
 * are the levels L < progress.level with isHardLevel(L): hardFrom ≤ L and L a multiple of hardEvery.
 */
export function hardLevelsBeaten(save: SaveData, c: GameConfig = cfg): number {
  const last = Math.floor(save.progress.level) - 1;
  const { hardFrom, hardEvery } = c.levels;
  if (!Number.isFinite(last) || hardEvery <= 0 || last < hardFrom) return 0;
  return Math.floor(last / hardEvery) - Math.floor((hardFrom - 1) / hardEvery);
}

/** UI batch, H-2a: the expectation lines for this board (ticker.odds.firstTry, and .tries when the estimate is high). */
function oddsLines(input: TickerInput, c: GameConfig): TickerLine[] {
  const o = levelOdds(input);
  const out: TickerLine[] = [{ key: 'ticker.odds.firstTry', pct: o.firstTryPct }];
  if (o.tries >= c.fx.tickers.oddsMinTries) out.push({ key: 'ticker.odds.tries', count: o.tries });
  return out;
}

/** UI batch: line 1 after a Retry: how close the lost attempt came, else the odds, its cats, "again" or the cheer. */
function retryLine(input: TickerInput, c: GameConfig): TickerLine {
  const last = input.lastTry;
  const placed = last && last.n === input.n && last.placed > 0 && last.placed < last.n ? last.placed : 0;
  const short = input.n - placed;
  if (placed > 0 && short <= c.fx.tickers.retryCloseCats) return { key: 'ticker.retry.close', count: short };
  const pool: TickerLine[] = [{ key: 'ticker.odds.retry', pct: levelOdds(input).retryPct }];
  if (placed > 0) pool.push({ key: 'ticker.retry.found', placed, n: input.n });
  if (input.attempt >= 2) pool.push({ key: 'ticker.retry.again' }); // no number: see the header (review F19)
  pool.push({ key: 'toast.start.retry' });
  return pick(pool, input.seed, 'line1');
}

/** helpers-spec §5.4 line 1: this board. */
function line1(input: TickerInput, c: GameConfig): TickerLine {
  if (input.retry) return retryLine(input, c);
  if (input.hard) {
    const beaten = hardLevelsBeaten(input.save, c);
    if (beaten === 0) return { key: 'ticker.hard.first' };
    return pick([{ key: 'ticker.hard.beaten', count: beaten }, { key: 'toast.start.hard' }, ...oddsLines(input, c)], input.seed, 'line1');
  }
  if (input.mode === 'level' && input.level !== null) {
    const best = input.save.progress.best[input.level];
    const ms = best ? best[0] : NaN;
    if (Number.isFinite(ms) && ms > 0) return { key: 'ticker.best', ms };
  }
  if (levelOdds(input).firstTryPct <= c.fx.tickers.oddsMaxFirstTryPct) return pick(oddsLines(input, c), input.seed, 'line1');
  return draw(input.seed, 'line1') % 2 === 0 ? { key: 'ticker.cats', count: input.n } : { key: 'toast.start.level' };
}

/** UI batch: levels the player solved without a wrong tile (their own records, progress.best[level][1] === 0). */
export function flawlessLevels(save: SaveData): number {
  let count = 0;
  for (const rec of Object.values(save.progress.best)) if (Array.isArray(rec) && rec[1] === 0 && rec[0] > 0) count++;
  return count;
}

/** helpers-spec §5.4 lines 6–12 that apply to this player now, in table order (UI batch: + the player's records). */
export function eligibleLine2(input: TickerInput, c: GameConfig = cfg): TickerLine[] {
  const { save } = input;
  const out: TickerLine[] = [];
  const solved = save.progress.completed;
  if (solved >= 2) out.push({ key: 'ticker.solved', count: solved });
  const flawless = flawlessLevels(save);
  if (flawless >= 2) out.push({ key: 'ticker.flawless', count: flawless });
  const streak = streakView(save.dayStreak, input.todayKey, c);
  if (streak.alive && streak.run >= 2) out.push({ key: 'ticker.streak', count: streak.run });
  const dailies = Object.keys(save.daily).length;
  if (dailies >= 1) out.push({ key: 'ticker.dailies', count: dailies });
  // On a Hard board line 1 speaks of them already.
  const beaten = input.hard ? 0 : hardLevelsBeaten(save, c);
  if (beaten >= 1) out.push({ key: 'ticker.hard.beaten', count: beaten });
  const period = periodTotal(save, input.now, c);
  if (period > 0) out.push({ key: `period.pill.${c.period.kind}`, count: period });
  if (save.points.total > 0) out.push({ key: 'ticker.points', count: save.points.total });
  if (input.dailyOpen && input.mode !== 'daily') out.push({ key: 'ticker.daily' });
  out.push({ key: 'ticker.unique' });
  if (solved < 20) out.push({ key: 'ticker.tip.cat' }, { key: 'ticker.tip.drag' });
  return out;
}

/** helpers-spec §5.4: line 1 (this board), line 2 (the player); every number but an odds estimate comes from the input. */
export function pickTickerLines(input: TickerInput, c: GameConfig = cfg): readonly [TickerLine, TickerLine] {
  const every = c.fx.tickers.milestoneEvery;
  const level = input.mode === 'level' ? input.level : null;
  const second: TickerLine =
    level !== null && every > 0 && level >= every && level % every === 0 && !input.retry
      ? { key: 'ticker.milestone', level }
      : pick(eligibleLine2(input, c), input.seed, 'line2');
  return [line1(input, c), second];
}
