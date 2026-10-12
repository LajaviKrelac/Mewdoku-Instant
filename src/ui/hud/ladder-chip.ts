// Owner: G3 (Phase 2e)
// The Home ranking chip (spec §2.5, CONTRACTS §8): the top bar's lead slot (after the FB safe zone) holds a
// BUTTON that opens the ranking sheet (overlay `ladder`). Main bundle, kept small (spec §7.9): no list, no
// avatars, only the trophy and the fish icon of the first-load sprite.
//   bracket: trophy "07:48:12"        "Daily ranking: #5 of 37, 14 fish. Ends in 7 h 48 min."
//   join:    trophy "Join"            "Daily ranking: solve a puzzle to join."
//   off:     trophy only              "Daily ranking: off."
//   records: today's period pill content ("14 fish this week"; the web, no server), now a button.
// Honesty (H-2, H-3): every number is the server's last answer (rank, members) or my own total; nothing is
// estimated.
// 2026-10-12 (01 row 7.1.7, the user's iPhone screenshot of the original's Home: a dark pill under the button
// showing "23:59:53", no rank or points on it): in a bracket with an end time the pill shows the time left as
// hh:mm:ss, ticking every second while the chip is shown (clamped at 00:00:00); rank, members and fish moved to the
// accessible name, which keeps minute text and changes only when that text does (never a live region). At 0 the
// chip calls onEnded once per end time (the app re-renders it: "Join" until the read after the end). Without an
// end time the pill keeps "#5" and the fish. The tick stops while the chip is hidden and on destroy().
// Classes: button.ladder-chip[data-state=bracket|join|off|records] > svg.ladder-chip__icon
//          .ladder-chip__rank .ladder-chip__points(svg.ladder-chip__fish .ladder-chip__n) .ladder-chip__time
import type { PeriodKind } from '../../app/config';
import { formatDuration, formatNumber, onLocaleChanged, t, tn } from '../../i18n';
import { icon } from '../art/sprite';
import { h, setText, type View } from '../dom';
import { periodPillLabel } from '../period-text';
import { formatCountdown } from '../time-text';

export type LadderChipView =
  | {
      readonly state: 'bracket';
      /** The server's rank of my row; null when it gave none (without an end time the pill then shows the fish only). */
      readonly rank: number | null;
      /** The server's count of visible players. */
      readonly members: number;
      /** My points in this bracket (the server's last answer). */
      readonly points: number;
      /** Device-clock ms (the app applied the server offset); null: no countdown (the pill shows rank and fish). */
      readonly endsAt: number | null;
      now(): number;
    }
  | { readonly state: 'join' }
  | { readonly state: 'off' }
  | { readonly state: 'records'; readonly period: { readonly kind: PeriodKind; readonly total: number } };

export interface LadderChipCallbacks {
  onPress(): void;
  /** 2026-10-12: the visible countdown reached 00:00:00 (called once per end time, from the tick, never mid-update). */
  onEnded?(): void;
}

/** 2026-10-12: each tick lands this long after a second edge, so the shown seconds never lag behind the clock. */
const TICK_SLACK_MS = 20;

/** A bracket with an end time: the pill shows the countdown. */
type CountingView = Extract<LadderChipView, { state: 'bracket' }> & { readonly endsAt: number };
const isCounting = (v: LadderChipView): v is CountingView => v.state === 'bracket' && v.endsAt !== null;

/** The chip's accessible name (spec §2.5 table). */
export function ladderChipLabel(v: LadderChipView): string {
  switch (v.state) {
    case 'join':
      return t('ladder.chip.join.a11y');
    case 'off':
      return t('ladder.chip.off.a11y');
    case 'records':
      return periodPillLabel(v.period.kind, v.period.total);
    case 'bracket': {
      const fish = tn('fish.count', v.points, { count: formatNumber(v.points) });
      if (v.rank === null) {
        const name = `${t('rank.title.period.day')}: ${fish}`;
        // 2026-10-12: the pill shows the time instead of the fish now, so the name says it too.
        return v.endsAt === null ? name : `${name}. ${t('ladder.endsIn', { time: formatDuration(v.endsAt - v.now()) })}`;
      }
      const time = formatDuration(v.endsAt === null ? 0 : v.endsAt - v.now());
      return t('ladder.chip.a11y', { rank: formatNumber(v.rank), count: formatNumber(v.members), fish, time });
    }
  }
}

export function createLadderChip(view: LadderChipView, cb: LadderChipCallbacks): View<LadderChipView> {
  const rank = h('span', { class: 'ladder-chip__rank num' });
  // 2026-10-12: the bracket's countdown in the dark pill ("07:48:12"; .num: Latin digits, left to right).
  const time = h('span', { class: 'ladder-chip__time num' });
  const n = h('span', { class: 'ladder-chip__n num' });
  const points = h('span', { class: 'ladder-chip__points' }, icon('icon-fish', { class: 'ladder-chip__fish' }), n);
  const el = h(
    'button',
    { type: 'button', class: 'ladder-chip', on: { click: () => cb.onPress() } },
    icon('icon-trophy', { class: 'ladder-chip__icon' }),
    rank,
    points,
    time, // after the points: `.ladder-chip__rank + .ladder-chip__points` (Home CSS) keeps matching
  );

  let cur = view;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** The end time onEnded was last called for (once per end time, so a re-render at 0 never loops). */
  let endedFor: number | null = null;
  const stopTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const setLabel = (label: string): void => {
    if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
  };
  /** The countdown and the name from the clock now; returns the ms left (≤ 0: ended). */
  const paintTime = (v: CountingView): number => {
    const left = v.endsAt - v.now();
    setText(time, formatCountdown(left));
    setLabel(ladderChipLabel(v));
    return left;
  };
  // The next tick just after the shown second changes; when already ended, at once but async (onEnded never runs
  // inside an update).
  const schedule = (left: number): void => {
    timer = setTimeout(tick, left > 0 ? (left % 1000) + TICK_SLACK_MS : 0);
  };
  function tick(): void {
    timer = null;
    const v = cur;
    if (!isCounting(v) || el.hidden) return; // hidden: no tick until the next update()
    const left = paintTime(v);
    if (left > 0) {
      schedule(left);
      return;
    }
    if (endedFor === v.endsAt) return;
    endedFor = v.endsAt;
    cb.onEnded?.();
  }

  const render = (v: LadderChipView): void => {
    cur = v;
    el.dataset.state = v.state;
    const counting = isCounting(v);
    time.hidden = !counting;
    switch (v.state) {
      case 'bracket':
        // 2026-10-12: with an end time the pill shows the countdown alone (the original's button); rank and fish
        // are in the name. Without one it keeps "#5" and the fish.
        rank.hidden = counting || v.rank === null;
        if (!rank.hidden && v.rank !== null) setText(rank, t('ladder.chip.rank', { rank: formatNumber(v.rank) }));
        points.hidden = counting;
        setText(n, formatNumber(v.points));
        break;
      case 'join':
        rank.hidden = false;
        setText(rank, t('ladder.join'));
        points.hidden = true;
        break;
      case 'off':
        rank.hidden = true;
        points.hidden = true;
        break;
      case 'records':
        // Today's period pill content (trophy + this period's total), as a button.
        rank.hidden = true;
        points.hidden = false;
        setText(n, formatNumber(v.period.total));
        break;
    }
    // The fish icon belongs to the bracket's points only; the records total keeps the pill's trophy look.
    points.toggleAttribute('data-plain', v.state === 'records');
    stopTimer();
    if (isCounting(v)) schedule(paintTime(v));
    else setLabel(ladderChipLabel(v));
  };
  render(view);
  // The texts follow the language (A11Y-I18N-1).
  const offLocale = onLocaleChanged(() => render(cur));

  return {
    el,
    update: render,
    destroy() {
      stopTimer();
      offLocale();
      el.remove();
    },
  };
}
