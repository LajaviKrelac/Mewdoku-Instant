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
import { cyrb128 } from '../engine/rng';
import type { ModeId, SaveData } from '../game/types';
import type { TickerLine } from '../ui/fx/tickers';
import { cfg, type GameConfig } from './config';
import { periodTotal } from '../game/scoring';

export interface TickerInput {
  readonly save: SaveData;
  readonly mode: ModeId;
  /** The level number in level mode, else null (a daily or an event index is not a level). */
  readonly level: number | null;
  /** The board's size: "{n} cats are hiding here". */
  readonly n: number;
  readonly hard: boolean;
  /** This board entry follows a Retry. */
  readonly retry: boolean;
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

/** helpers-spec §5.4 line 1: this board. */
function line1(input: TickerInput): TickerLine {
  if (input.retry) return { key: 'toast.start.retry' };
  if (input.hard) return { key: 'toast.start.hard' };
  if (input.mode === 'level' && input.level !== null) {
    const best = input.save.progress.best[input.level];
    const ms = best ? best[0] : NaN;
    if (Number.isFinite(ms) && ms > 0) return { key: 'ticker.best', ms };
  }
  return draw(input.seed, 'line1') % 2 === 0 ? { key: 'ticker.cats', count: input.n } : { key: 'toast.start.level' };
}

/** helpers-spec §5.4 lines 6–12 that apply to this player now, in table order. */
export function eligibleLine2(input: TickerInput, c: GameConfig = cfg): TickerLine[] {
  const { save } = input;
  const out: TickerLine[] = [];
  const solved = save.progress.completed;
  if (solved >= 2) out.push({ key: 'ticker.solved', count: solved });
  const period = periodTotal(save, input.now, c);
  if (period > 0) out.push({ key: `period.pill.${c.period.kind}`, count: period });
  if (save.points.total > 0) out.push({ key: 'ticker.points', count: save.points.total });
  if (input.dailyOpen && input.mode !== 'daily') out.push({ key: 'ticker.daily' });
  out.push({ key: 'ticker.unique' });
  if (solved < 20) out.push({ key: 'ticker.tip.cat' }, { key: 'ticker.tip.drag' });
  return out;
}

/** helpers-spec §5.4: line 1 (this board), line 2 (the player); every number comes from the input. */
export function pickTickerLines(input: TickerInput, c: GameConfig = cfg): readonly [TickerLine, TickerLine] {
  const pool = eligibleLine2(input, c);
  const second = pool[draw(input.seed, 'line2') % pool.length] as TickerLine;
  return [line1(input), second];
}
