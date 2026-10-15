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
// D-2e-25 review (2026-10-14, review #3; ads.banner.collapseWhenEmpty): the screen's band was read at open only, so an
// empty banner answer landing under it (Home's load, the victory's one timer) left it an empty 58 px band. While it is
// open it now follows the reserve of the screen under it (followStreakBand, called by the store selects that follow
// that reserve: shell.ts for Home, session.ts for the victory; the screen's buttons ignore taps for a moment after the
// change, ui/overlays/overlay-base.ts createBandGuard). By banner-flow's rule (a bare mount stays bare) that reserve can
// only go off on the same mount (review round 3, 2026-10-15, R3-0: also when the gate turns to no under it, No Ads
// bought or a remote switch off); off: the band stays as opened (the 2e rule). Review round 3 (R3-3): such a band-only
// update keeps the screen's week cells (ui/overlays/streak-screen.ts), so today's check does not pop again.
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

/**
 * D-2e-25 review (N5): the props each router's streak screen was last opened or updated with (keyed by the router, so
 * the band can follow the store without rebuilding the rest: the day, the reward and `onDone` stay as opened).
 */
const lastProps = new WeakMap<object, StreakScreenProps>();

/** Opens the screen; `onDone` runs on Continue, the back arrow or Esc. */
export function openStreakScreen(host: StreakScreenHost, mode: StreakScreenProps['mode'], onDone: () => void, reward: Reward | null = null): void {
  const props: StreakScreenProps = { ...selectStreakScreen(host.state(), host.now(), mode, reward, host.config ?? cfg), onDone };
  lastProps.set(host.router, props);
  host.router.open('streak', props);
}

/**
 * D-2e-25 review (2026-10-14, N5, review #3): the open streak screen takes the store's banner reserve when it changed
 * (re-rendered with router.update; its buttons ignore taps for a moment, createBandGuard). Only with
 * ads.banner.collapseWhenEmpty (off: the band stays as opened); nothing when the screen is not open. The callers are the
 * selects that follow the reserve of the screen under it (shell.ts Home's, session.ts the victory's).
 */
export function followStreakBand(host: { readonly router: Pick<Router, 'isOpen' | 'update'>; state(): AppState; readonly config?: GameConfig }): void {
  const p = lastProps.get(host.router);
  if (!p || !(host.config ?? cfg).ads.banner.collapseWhenEmpty || !host.router.isOpen('streak')) return;
  const on = host.state().ui.bannerReserved;
  if (p.bannerReserved === on) return;
  const next: StreakScreenProps = { ...p, bannerReserved: on };
  lastProps.set(host.router, next);
  host.router.update('streak', next);
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
