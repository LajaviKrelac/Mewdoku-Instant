// UI batch (2026-10-13): streak — the Daily Streak screen (overlay `streak`; user: "copy the layout of the Daily Streak Screen").
// Owner: G3. Our art and words; only the order of the parts follows the user's reference screenshots (D-2d-0 a). Top to
// bottom: the title, our flame (faded and grey while today is not counted yet), the run as a big number with its label,
// a white "Best" pill, the week row, the status sentence, then Continue (after the day's first counted win, mode 'win')
// or nothing (from Home's pill, mode 'home': a back arrow at the top start instead).
// The week row is the run's current cycle, not a calendar week: our reward pays on the cycle's last day of the RUN
// (day-streak.ts streakWeek), so the gift sits on the day that really pays and each date carries its real weekday; it
// reads SUN … SAT exactly when the cycle started on a Sunday. Played days are orange discs with a white check (a shape,
// not colour alone), the rest grey, today ringed, the reward day a chest (open once paid).
// Honest and calm (spec §5.1): no countdown, no warning, no "you will lose it"; every number is the player's own.
// A11y: a dialog named by its title and described by the run, the best, the row's name and the status; the row is one
// image named by streak.week.a11y (its cells are decorative); 44 px targets; Esc = the back arrow or Continue (not
// while Continue is still gated); reduced motion: no pop and no light-up (the overlay's own fade only). Lazy overlay
// chunk (streak-art.ts draws the flame and the chest; overlay-chunk.css styles it).
// Classes: .overlay[data-overlay=streak] > .streak-screen[data-mode][data-today][data-banner][data-anim][data-reduced]
//          > .streak-screen__head(button.streak-screen__back h2.streak-screen__title)
//            .streak-screen__body(.streak-screen__hero > svg.streak-screen__flame
//              p.streak-screen__run(.streak-screen__n .streak-screen__label) p.streak-screen__best
//              .streak-week[role=img][data-long] > .streak-week__day[data-played][data-today][data-gift][data-paid]
//                (.streak-week__name .streak-week__mark > svg.streak-week__gift?)  p.streak-screen__status)
//            .streak-screen__actions > button.streak-screen__continue
import { cfg } from '../../app/config';
import type { Reward } from '../../game/events';
import { formatNumber, formatWeekday, t, tn } from '../../i18n';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { streakPillCount, streakStripModel, type StreakStripView } from '../hud/streak-strip';
import { createLocaleText } from '../locale-text';
import { createDelay, createOverlayShell, isGated, makeButton, nextId, setGated } from './overlay-base';
import { rewardText } from './victory-screen';

/** One day of the week row (the app maps day-streak.ts StreakWeekDay). */
export interface StreakWeekCell {
  readonly dateKey: string;
  /** A counted day of the live run: the orange disc with a check. */
  readonly played: boolean;
  readonly today: boolean;
  /** This cycle day pays a reward: the chest instead of a disc. */
  readonly gift: boolean;
  /** …and it was paid on this date: the chest stands open. */
  readonly paid: boolean;
}

export interface StreakScreenProps {
  /** 'win': after the day's first counted win (Continue); 'home': from Home's streak pill (a back arrow). */
  readonly mode: 'win' | 'home';
  /** The pill's view: the run (the big number; 0 with no live run), the cycle day and the status sentence. */
  readonly streak: StreakStripView;
  /** The longest run so far (save.dayStreak.best). */
  readonly best: number;
  /** The run's current cycle, day 1 first; empty hides the row. */
  readonly week: readonly StreakWeekCell[];
  /** The cycle reward this win paid (mode 'win', already granted and saved), else null. */
  readonly reward: Reward | null;
  /** Continue turns active this long after open (mode 'win'; fx.winButtonDelayMs: no double tap skips the screen). */
  readonly buttonDelayMs: number;
  /** phase2b §3.2: keep the banner band free under the content. */
  readonly bannerReserved: boolean;
  readonly reducedMotion: boolean;
  /** Continue, the back arrow, or Esc. */
  onDone(): void;
}

/** The status line: this win's reward ("Streak reward: +2 hints and +2 kitties"), else the pill's sentence. */
export function streakScreenStatus(p: Pick<StreakScreenProps, 'mode' | 'streak' | 'reward'>): string {
  const r = p.mode === 'win' ? p.reward : null;
  if (r && ((r.hints ?? 0) > 0 || (r.kitties ?? 0) > 0)) return t('victory.streakReward', { reward: rewardText(r) });
  return streakStripModel(p.streak).status;
}

/** The week row's name: "Streak days: 3 of 7 solved. Day 7 earns a reward." (one sentence per reward day). */
export function streakWeekLabel(cells: readonly StreakWeekCell[]): string {
  const done = cells.filter((c) => c.played).length;
  const parts = [t('streak.week.a11y', { done: formatNumber(done), total: formatNumber(cells.length) })];
  cells.forEach((c, i) => {
    if (c.gift) parts.push(t('streak.week.gift.a11y', { day: formatNumber(i + 1) }));
  });
  return parts.join(' ');
}

/** Weekday names longer than this many characters set the row's data-long (a smaller label size). */
const LONG_WEEKDAY = 4;

function weekCell(c: StreakWeekCell): HTMLElement {
  const el = h(
    'span',
    { class: 'streak-week__day' },
    h('span', { class: 'streak-week__name' }, formatWeekday(c.dateKey)),
    h('span', { class: 'streak-week__mark' }, c.gift ? icon('streak-step-chest', { class: 'streak-week__gift' }) : null),
  );
  el.toggleAttribute('data-played', c.played);
  el.toggleAttribute('data-today', c.today);
  el.toggleAttribute('data-gift', c.gift);
  el.toggleAttribute('data-paid', c.gift && c.paid);
  return el;
}

export function createStreakScreen(): OverlayView<StreakScreenProps> {
  let props: StreakScreenProps | null = null;
  const shell = createOverlayShell({ id: 'streak', scrim: 'clear', panel: 'dialog' });
  const root = shell.panel;
  root.className = 'streak-screen';
  root.style.setProperty('--banner-reserve', `${cfg.ads.banner.reservePx}px`);
  root.style.setProperty('--banner-clear', `${cfg.ads.banner.buttonClearancePx}px`);
  const delay = createDelay();
  const L = createLocaleText();

  const back = L.attr(
    makeButton({ variant: 'icon', icon: 'icon-back', ariaLabel: t('common.back'), autofocus: true, className: 'streak-screen__back', onPress: () => props?.onDone() }),
    'aria-label',
    () => t('common.back'),
  );
  const title = L.text(h('h2', { class: 'streak-screen__title', id: shell.titleId }), () => t('streak.screen.title'));
  const head = h('div', { class: 'streak-screen__head' }, back, title);

  const hero = h('div', { class: 'streak-screen__hero', 'aria-hidden': 'true' }, icon('icon-streak-flame', { class: 'streak-screen__flame' }));
  const num = h('span', { class: 'streak-screen__n num' });
  const label = h('span', { class: 'streak-screen__label' });
  // The run is the dialog's first description ("10 days in a row"); the space keeps the two parts apart when read.
  const run = h('p', { class: 'streak-screen__run', id: shell.descId }, num, ' ', label);
  const bestId = nextId('streak-best');
  const best = h('p', { class: 'streak-screen__best', id: bestId });
  const weekId = nextId('streak-week');
  const week = h('div', { class: 'streak-week', id: weekId, role: 'img' });
  const statusId = nextId('streak-status');
  const status = h('p', { class: 'streak-screen__status', id: statusId });
  const body = h('div', { class: 'streak-screen__body' }, hero, run, best, week, status);

  const cont = L.label(
    makeButton({ variant: 'primary', label: '', block: true, autofocus: true, className: 'btn--lg streak-screen__continue', onPress: () => props?.onDone() }),
    () => t('streak.screen.continue'),
  );
  const actions = h('div', { class: 'streak-screen__actions' }, cont);
  root.append(head, body, actions);

  const render = (p: StreakScreenProps, opening: boolean): void => {
    props = p;
    L.apply();
    const win = p.mode === 'win';
    root.dataset.mode = p.mode;
    root.dataset.today = p.streak.state === 'done' ? '1' : '0';
    root.toggleAttribute('data-banner', p.bannerReserved);
    root.toggleAttribute('data-reduced', p.reducedMotion);
    // The day's first win lights the flame and pops today's check once (CSS); never with reduced motion.
    if (opening) root.toggleAttribute('data-anim', win && !p.reducedMotion);
    back.hidden = win;
    actions.hidden = !win;

    const n = streakPillCount(p.streak);
    setText(num, formatNumber(n));
    setText(label, tn('streak.screen.run', n));
    const bestN = Math.max(0, Math.floor(p.best));
    setText(best, t('streak.screen.best', { best: tn('streak.days', bestN, { count: formatNumber(bestN) }) }));

    week.textContent = '';
    for (const c of p.week) week.appendChild(weekCell(c));
    week.hidden = p.week.length === 0;
    // Long weekday names (ar "الأربعاء", pl "niedz.") take a smaller size so neighbours never touch at 320 px.
    week.toggleAttribute('data-long', p.week.some((c) => Array.from(formatWeekday(c.dateKey)).length > LONG_WEEKDAY));
    week.setAttribute('aria-label', streakWeekLabel(p.week));
    setText(status, streakScreenStatus(p));

    root.setAttribute('aria-describedby', [shell.descId, bestId, ...(week.hidden ? [] : [weekId]), statusId].join(' '));
  };

  // A language switch while the screen is up relabels it, the weekdays too (A11Y-I18N-1).
  L.watch(() => {
    if (props && shell.isOpen()) render(props, false);
  });

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p, true);
      delay.cancel();
      setGated(cont, p.mode === 'win' && p.buttonDelayMs > 0);
      if (p.mode === 'win') delay.start(p.buttonDelayMs, () => setGated(cont, false));
      shell.show();
    },
    update(p) {
      render(p, false);
    },
    close() {
      delay.cancel();
      // The router may show the closed screen again as the layer that fades out (PAR-6): no light-up replay then.
      root.removeAttribute('data-anim');
      shell.hide();
    },
    dismiss() {
      if (!props || !shell.isOpen()) return false;
      if (props.mode === 'win' && isGated(cont)) return true; // a choice is needed, but not before Continue is live
      props.onDone();
      return true;
    },
    destroy() {
      delay.cancel();
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
