// Owner: G3 (Phase 2e)
// The Home ranking chip (spec §2.5, CONTRACTS §8): the top bar's lead slot (after the FB safe zone) holds a
// BUTTON that opens the ranking sheet (overlay `ladder`). Main bundle, kept small (spec §7.9): no list, no
// avatars, only the trophy and the fish icon of the first-load sprite.
//   bracket: trophy "#5" · fish "14"  "Daily ranking: #5 of 37, 14 fish. Ends in 7 h 48 min."
//   join:    trophy "Join"            "Daily ranking: solve a puzzle to join."
//   off:     trophy only              "Daily ranking: off."
//   records: today's period pill content ("14 fish this week"; the web, no server), now a button.
// Honesty (H-2, H-3): every number is the server's last answer (rank, members) or my own total; nothing is
// estimated. The accessible name carries the countdown, refreshed once a minute while the chip is shown
// (never a live region).
// Classes: button.ladder-chip[data-state=bracket|join|off|records] > svg.ladder-chip__icon
//          .ladder-chip__rank .ladder-chip__points(svg.ladder-chip__fish .ladder-chip__n)
import type { PeriodKind } from '../../app/config';
import { formatDuration, formatNumber, onLocaleChanged, t, tn } from '../../i18n';
import { icon } from '../art/sprite';
import { h, setText, type View } from '../dom';
import { periodPillLabel } from '../period-text';

export type LadderChipView =
  | {
      readonly state: 'bracket';
      /** The server's rank of my row; null when it gave none (the chip then shows the fish only). */
      readonly rank: number | null;
      /** The server's count of visible players. */
      readonly members: number;
      /** My points in this bracket (the server's last answer). */
      readonly points: number;
      /** Device-clock ms (the app applied the server offset); null: no countdown in the name. */
      readonly endsAt: number | null;
      now(): number;
    }
  | { readonly state: 'join' }
  | { readonly state: 'off' }
  | { readonly state: 'records'; readonly period: { readonly kind: PeriodKind; readonly total: number } };

export interface LadderChipCallbacks {
  onPress(): void;
}

/** How often the accessible name's countdown is refreshed (minute resolution text). */
const LABEL_REFRESH_MS = 60_000;

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
      if (v.rank === null) return `${t('rank.title.period.day')}: ${fish}`;
      const time = formatDuration(v.endsAt === null ? 0 : v.endsAt - v.now());
      return t('ladder.chip.a11y', { rank: formatNumber(v.rank), count: formatNumber(v.members), fish, time });
    }
  }
}

export function createLadderChip(view: LadderChipView, cb: LadderChipCallbacks): View<LadderChipView> {
  const rank = h('span', { class: 'ladder-chip__rank num' });
  const n = h('span', { class: 'ladder-chip__n num' });
  const points = h('span', { class: 'ladder-chip__points' }, icon('icon-fish', { class: 'ladder-chip__fish' }), n);
  const el = h(
    'button',
    { type: 'button', class: 'ladder-chip', on: { click: () => cb.onPress() } },
    icon('icon-trophy', { class: 'ladder-chip__icon' }),
    rank,
    points,
  );

  let cur = view;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stopTimer = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const render = (v: LadderChipView): void => {
    cur = v;
    el.dataset.state = v.state;
    switch (v.state) {
      case 'bracket':
        rank.hidden = v.rank === null;
        if (v.rank !== null) setText(rank, t('ladder.chip.rank', { rank: formatNumber(v.rank) }));
        points.hidden = false;
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
    el.setAttribute('aria-label', ladderChipLabel(v));
    if (v.state === 'bracket' && v.endsAt !== null) {
      if (timer === null) timer = setInterval(() => el.setAttribute('aria-label', ladderChipLabel(cur)), LABEL_REFRESH_MS);
    } else stopTimer();
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
