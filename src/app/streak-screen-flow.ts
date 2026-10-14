// UI batch (2026-10-13): streak — when and with what the Daily Streak screen (overlay `streak`) opens.
// Owner: G1 (app). Two ways in:
// - Home's streak pill (shell.ts onStreak): mode 'home', a back arrow, it closes again.
// - The day's first counted win (session.ts openVictory): the victory's primary press opens it first (mode 'win'), and
//   its Continue runs what the primary would have run (the interstitial gate, then the next board or Home). Shown at
//   most once per win: never for the tutorial, a second win the same day or a restored board (WinSummary.streak is null
//   then), and only with dayStreak.screenAfterWin and the dayStreak flag on. The screen is not closed before that
//   action: the screen change that follows closes every overlay and lets the streak screen be the layer that fades out
//   (router.ts, PAR-6), so neither the victory nor the solved board shows again in between.
// The data is the player's own save only (day-streak.ts streakView / streakWeek): no other player, no estimate.
import { streakView, streakWeek } from '../game/day-streak';
import type { Reward } from '../game/events';
import { dailyDateKey } from '../game/progression';
import type { StreakScreenProps } from '../ui/overlays/streak-screen';
import { cfg, type GameConfig } from './config';
import { isFlagOn } from './flags';
import type { Router } from './router';
import type { WinSummary } from './session-effects';
import type { AppState } from './store';
import { streakStripOf } from './views';

export type StreakScreenData = Omit<StreakScreenProps, 'onDone'>;

/**
 * The screen's data; `reward` = what this win paid (mode 'win'). Pure. Today = dailyDateKey(now) from Home. Mode 'win'
 * (review F15) keeps the date the win counted: the press can come after the day boundary (a win at 23:59, the victory's
 * primary at 00:00), and the screen must still show the day just lit, never the next, uncounted one. countWin only
 * counts a date later than the last one, so on the day's first counted win that date is the record's last date.
 */
export function selectStreakScreen(state: AppState, now: number, mode: StreakScreenProps['mode'], reward: Reward | null = null, c: GameConfig = cfg): StreakScreenData {
  const ds = state.save.dayStreak;
  const today = (mode === 'win' ? ds.dates[ds.dates.length - 1] : undefined) ?? dailyDateKey(now, c);
  const v = streakView(ds, today, c);
  return {
    mode,
    streak: streakStripOf(v, c),
    best: Math.max(ds.best, v.run),
    week: streakWeek(ds, today, c).map((d) => ({ dateKey: d.dateKey, played: d.played, today: d.today, gift: d.reward !== null, paid: d.paid })),
    reward: mode === 'win' ? reward : null,
    buttonDelayMs: c.fx.winButtonDelayMs,
    bannerReserved: state.ui.bannerReserved,
    reducedMotion: state.ui.reducedMotion,
  };
}

export interface StreakScreenHost {
  readonly router: Pick<Router, 'open'>;
  state(): AppState;
  now(): number;
  readonly config?: GameConfig;
}

/** Opens the screen; `onDone` runs on Continue, the back arrow or Esc. */
export function openStreakScreen(host: StreakScreenHost, mode: StreakScreenProps['mode'], onDone: () => void, reward: Reward | null = null): void {
  host.router.open('streak', { ...selectStreakScreen(host.state(), host.now(), mode, reward, host.config ?? cfg), onDone });
}

/** The win shows the screen after its victory: the day's first counted win, with the switch and the flag on. */
export function streakScreenDue(win: Pick<WinSummary, 'streak'>, c: GameConfig = cfg): boolean {
  return win.streak !== null && c.dayStreak.enabled && c.dayStreak.screenAfterWin && isFlagOn('dayStreak');
}

/** The wins whose streak screen was shown (by the WinSummary object, so props wrapped again for an update agree). */
const shownFor = new WeakSet<object>();

/**
 * The victory's props with its primary going through the streak screen once per win (when due): the first press opens
 * the screen and its Continue runs the primary's own action; a later press (the screen was closed some other way) runs
 * it at once. Not due: `props` unchanged. A router.update('victory', …) passes its props through here too.
 */
export function afterStreakScreen<P extends { onPrimary(): void }>(host: StreakScreenHost, win: Pick<WinSummary, 'streak'>, props: P): P {
  if (!streakScreenDue(win, host.config ?? cfg)) return props;
  const go = (): void => props.onPrimary();
  return {
    ...props,
    onPrimary: () => {
      if (shownFor.has(win)) return go();
      shownFor.add(win);
      openStreakScreen(host, 'win', go, win.streak?.reward ?? null);
    },
  };
}
