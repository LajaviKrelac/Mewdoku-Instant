// UI batch (2026-10-13): victory — the praise and statistic lines under the victory's subtitle: their ids (picked by
// app/victory-lines.ts from the player's own game; a first-load module never names a lazy key) and their text (keys
// victory.line.* and victory.stat.*, en/lazy.ts). Every number comes with the line: the run, the counts, the time
// and the percentage (already rounded; victory.stat.* only, spec §0.4 H-2a). Lazy overlay chunk.
import { formatClock, formatNumber, t, tn } from '../../i18n';

export type VictoryLineId =
  | 'flawless'
  | 'noSlips'
  | 'noHelp'
  | 'best'
  | 'hard'
  | 'revive'
  | 'retry'
  | 'run'
  | 'levels'
  | 'dailies'
  | 'statTop'
  | 'statFaster'
  | 'statLevel';

export interface VictoryLine {
  readonly id: VictoryLineId;
  /** run: cats in a row; levels / dailies: how many the player has solved. */
  readonly count?: number;
  /** best: the new best time (ms) and the board's size. */
  readonly ms?: number;
  readonly n?: number;
  /** stat*: the percentage as shown (rounded down to a step, clamped). */
  readonly pct?: number;
}

/** The line's text in the current language. */
export function victoryLineText(l: VictoryLine): string {
  const count = Math.max(0, Math.floor(l.count ?? 0));
  const pct = formatNumber(Math.max(0, Math.round(l.pct ?? 0)));
  switch (l.id) {
    case 'flawless':
      return t('victory.line.flawless');
    case 'noSlips':
      return t('victory.line.noSlips');
    case 'noHelp':
      return t('victory.line.noHelp');
    case 'best':
      return t('victory.line.best', { size: t('home.daily.size', { n: Math.round(l.n ?? 0) }), time: formatClock(l.ms ?? 0) });
    case 'hard':
      return t('victory.line.hard');
    case 'revive':
      return t('victory.line.revive');
    case 'retry':
      return t('victory.line.retry');
    case 'run':
      return tn('victory.line.run', count, { count: formatNumber(count) });
    case 'levels':
      return tn('victory.line.levels', count, { count: formatNumber(count) });
    case 'dailies':
      return tn('victory.line.dailies', count, { count: formatNumber(count) });
    case 'statTop':
      return t('victory.stat.dailyTop', { pct });
    case 'statFaster':
      return t('victory.stat.dailyFaster', { pct });
    case 'statLevel':
      return t('victory.stat.level', { pct });
  }
}
