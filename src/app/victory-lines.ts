// UI batch (2026-10-13): victory — the praise and statistic lines under the victory's subtitle. The user: "Add praising
// and encouraging messages/statistics" after a level, and for the daily "how you did against the day's players".
// This module picks line IDS and their numbers, never keys (views.ts and session.ts are first-load and must not name
// a lazy key; ui/overlays/victory-line-text.ts renders them in the overlay chunk), like app/tickers.ts.
// HONEST praise: every line states a fact of THIS board from the game's own state and the player's own save (no wrong
// cat, no helper, a new best time on this board size, a Hard level, a comeback after a revive or a Retry, the closing
// run, the player's own solved count). It never says "first try" (a Home leaves no trace of earlier attempts), it
// claims "no helper" only when the mouse count is known (a resumed attempt does not save it), "no wrong cat on this
// board" never after a Retry, and "a new best" only over every earlier record that may be of this size.
// The statistic is approximate by the user's decision (spec §0.4 H-2a, victory.stat.* only): a daily's comes from
// the ranking server's standing (other solvers of the day, strictly slower ones) once it has victory.minSolvers of
// them, else from our estimate (game/solve-time-model.ts); a level's is the estimate, shown only when encouraging.
// Order: a daily leads with its statistic; a level leads with its best praise line, then the statistic or the next
// praise line; at most victory.maxLines. PURE.
import { dailySlotFor } from '../game/ramp';
import { modelFasterThan, shownPct } from '../game/solve-time-model';
import type { GameState, ModeId, SaveData } from '../game/types';
import type { DailyStanding } from '../shared/rank-api';
import type { VictoryLine } from '../ui/overlays/victory-line-text';
import { cfg, type GameConfig } from './config';

/** What the lines may say about this win: facts of this board and of the player's own save. */
export interface VictoryFacts {
  readonly mode: ModeId;
  /** Board size, grade (1 … 5) and the level's Hard badge. */
  readonly n: number;
  readonly grade: number;
  readonly hard: boolean;
  /** The solve time (game time, pauses excluded). */
  readonly ms: number;
  readonly mistakes: number;
  readonly hints: number;
  readonly kitties: number;
  /** Mouse uses in this attempt; null when not known (a resumed attempt or a restored board). */
  readonly mice: number | null;
  readonly revives: number;
  /** Retries of this board since it was opened (0 = the attempt it was opened with). */
  readonly retries: number;
  /** Correct cats in a row at the end (GameState.catStreak: a lower bound after a resume). */
  readonly run: number;
  /**
   * The best time on boards of this size BEFORE this win (levels and dailies; a level of unknown size counts as one);
   * null = none to beat.
   */
  readonly bestBeforeMs: number | null;
  /** The player's own counts after this win (levels: the won levels' records, never a skipped tutorial). */
  readonly levelsSolved: number;
  readonly dailiesSolved: number;
}

export interface FactsInput {
  /** The save before the win (the records to beat) and after it (the counts). */
  readonly before: SaveData;
  readonly after: SaveData;
  readonly state: GameState;
  readonly mode: ModeId;
  /** SessionMeta.hard: the level's Hard badge. */
  readonly hard: boolean;
  /** A board restored already full (no attempt facts beyond the slot's). */
  readonly restored: boolean;
  /** The attempt's mouse uses, or null when not known. */
  readonly mice: number | null;
  readonly retries: number;
  /** A level's board size, when its pack is loaded (the same-size best times); null or absent = not known. */
  readonly levelSize?: (level: number) => number | null;
}

const count = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);

/** A record's board size, or null when not known (a level whose pack is not in memory, a bad key). */
function sizeOf(get: () => number | null): number | null {
  try {
    return get();
  } catch {
    return null; // a bad key never breaks the victory
  }
}

/**
 * The fastest earlier time that may have been on a board of size n (the line says "a {size} board", so levels AND
 * dailies of that size, in either mode). A record whose size is not known (its pack is not in memory) counts as a
 * possible same-size record: the line may then say less than it could, never more. Events and the tutorial: none.
 */
function bestBefore(i: FactsInput, n: number): number | null {
  if (i.mode !== 'level' && i.mode !== 'daily') return null;
  let best: number | null = null;
  const keep = (size: number | null, ms: number | undefined): void => {
    if ((size === null || size === n) && ms !== undefined && ms > 0 && (best === null || ms < best)) best = ms;
  };
  for (const [level, rec] of Object.entries(i.before.progress.best)) keep(sizeOf(() => i.levelSize?.(Number(level)) ?? null), rec[0]);
  for (const [date, rec] of Object.entries(i.before.daily)) keep(sizeOf(() => dailySlotFor(date).n), rec[0]);
  return best;
}

export function victoryFacts(i: FactsInput): VictoryFacts {
  const s = i.state;
  const n = s.puzzle.n;
  return {
    mode: i.mode,
    n,
    grade: s.puzzle.grade,
    hard: i.hard,
    ms: Math.max(0, Math.round(s.elapsedMs)),
    mistakes: count(s.mistakes),
    hints: count(s.hintsUsed),
    kitties: count(s.kittiesUsed),
    mice: i.restored || i.mice === null ? null : count(i.mice),
    revives: count(s.revivesUsed),
    retries: count(i.retries),
    run: count(s.catStreak),
    bestBeforeMs: i.restored ? null : bestBefore(i, n),
    // Real wins only: every won level (2+) has a record; progress.completed also counts a skipped tutorial.
    levelsSolved: Object.keys(i.after.progress.best).length,
    dailiesSolved: Object.keys(i.after.daily).length,
  };
}

/** The praise lines that are true for this win, best first. */
export function praiseLines(f: VictoryFacts, c: GameConfig = cfg): VictoryLine[] {
  const out: VictoryLine[] = [];
  const helped = f.hints > 0 || f.kitties > 0;
  const flawless = f.mistakes === 0 && !helped && f.mice === 0 && f.revives === 0;
  if (flawless) out.push({ id: 'flawless' });
  if (f.bestBeforeMs !== null && f.ms > 0 && f.ms < f.bestBeforeMs) out.push({ id: 'best', ms: f.ms, n: f.n });
  if (f.hard) out.push({ id: 'hard' });
  if (f.revives > 0) out.push({ id: 'revive' });
  if (f.retries > 0) out.push({ id: 'retry' });
  // "On this board": not after a Retry (the lost attempt had wrong cats on this same board).
  if (f.mistakes === 0 && !flawless && f.retries === 0) out.push({ id: 'noSlips' });
  if (f.mistakes > 0 && !helped) out.push({ id: 'noHelp' });
  if (f.mistakes > 0 && f.run >= c.victory.runMin) out.push({ id: 'run', count: f.run });
  if (f.mode === 'level' && f.levelsSolved >= c.victory.milestoneMin) out.push({ id: 'levels', count: f.levelsSolved });
  if (f.mode === 'daily' && f.dailiesSolved >= 1) out.push({ id: 'dailies', count: f.dailiesSolved });
  return out;
}

/**
 * The daily's standing as the session knows it: the server's (once answered with enough solvers), null (no server
 * numbers: the estimate is used) or 'pending' (the win's answer is still on its way: no statistic yet).
 */
export type StandingState = DailyStanding | null | 'pending';

/** The statistic line, or null (a tutorial or an event, a pending answer, or a number that would not encourage). */
export function statLine(f: VictoryFacts, standing: StandingState, c: GameConfig = cfg): VictoryLine | null {
  const v = c.victory;
  if (f.mode === 'daily') {
    if (standing === 'pending') return null;
    const server = standing !== null && standing.solvers >= v.minSolvers && standing.slower >= 0 && standing.slower <= standing.solvers;
    const raw = server ? (100 * standing.slower) / standing.solvers : modelFasterThan(f.ms, f, c);
    if (raw < v.statMinPct) return null;
    const pct = shownPct(raw, c);
    return pct >= v.topFromPct ? { id: 'statTop', pct: 100 - pct } : { id: 'statFaster', pct };
  }
  if (f.mode === 'level') {
    const raw = modelFasterThan(f.ms, f, c);
    return raw >= v.levelStatMinPct ? { id: 'statLevel', pct: shownPct(raw, c) } : null;
  }
  return null;
}

/** The victory's lines for this win (empty for the tutorial). */
export function pickVictoryLines(f: VictoryFacts, standing: StandingState, c: GameConfig = cfg): VictoryLine[] {
  if (f.mode === 'tutorial') return [];
  const praise = praiseLines(f, c);
  const stat = statLine(f, standing, c);
  const out: VictoryLine[] = f.mode === 'daily' ? [...(stat ? [stat] : []), ...praise] : [...praise.slice(0, 1), ...(stat ? [stat] : []), ...praise.slice(1)];
  return out.slice(0, Math.max(0, Math.floor(c.victory.maxLines)));
}
