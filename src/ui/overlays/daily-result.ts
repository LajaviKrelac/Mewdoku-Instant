// Owner: ui-shell
// O7 daily result (02 §5 O7, §12): date, happy cat, solve time, mistakes and hints, next puzzle countdown.
// The countdown refreshes while open. Esc acts as Done; scrim taps are ignored (Done may show an ad).
//
// Classes: .overlay[data-overlay=daily_result] > .overlay__panel--dialog.daily-result
//          .daily-result__art .daily-result__time .daily-result__stats .daily-result__next
import { formatClock, formatDuration, formatShortDate, t } from '../../i18n';
import { illustration } from '../art/illustrations';
import { h, setText, type OverlayView } from '../dom';
import { createOverlayShell, createTicker, makeButton } from './overlay-base';

export interface DailyResultProps {
  readonly dateKey: string;
  readonly ms: number;
  readonly mistakes: number;
  readonly hints: number;
  readonly kitties: number;
  /** Epoch ms of the next local midnight. */
  readonly nextPuzzleAt: number;
  now(): number;
  /** Done: interstitial gate 'daily_done', then Home (also used when reopened from Home). */
  onDone(): void;
}

/** Countdown refresh period (the text has minute resolution). */
const REFRESH_MS = 1000;

export function createDailyResult(): OverlayView<DailyResultProps> {
  let props: DailyResultProps | null = null;
  const shell = createOverlayShell({ id: 'daily_result', scrim: 'soft', panel: 'dialog' });
  shell.panel.classList.add('daily-result');
  const ticker = createTicker();

  const title = h('h2', { class: 'overlay__title', id: shell.titleId });
  const time = h('p', { class: 'daily-result__time' });
  const stats = h('p', { class: 'daily-result__stats' });
  const next = h('p', { class: 'daily-result__next' });
  const done = makeButton({ variant: 'primary', label: t('daily.done'), block: true, autofocus: true, className: 'daily-result__done', onPress: () => props?.onDone() });
  shell.panel.append(
    title,
    h('div', { class: 'overlay__art daily-result__art' }, illustration('daily')),
    h('div', { id: shell.descId }, time, stats, next),
    h('div', { class: 'overlay__actions' }, done),
  );

  const renderNext = (): void => {
    if (props) setText(next, t('daily.next', { time: formatDuration(props.nextPuzzleAt - props.now()) }));
  };
  const render = (p: DailyResultProps): void => {
    props = p;
    setText(title, t('daily.title', { date: formatShortDate(p.dateKey) }));
    setText(time, t('daily.solvedIn', { time: formatClock(p.ms) }));
    setText(stats, t('daily.stats', { mistakes: p.mistakes, hints: p.hints }));
    renderNext();
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p);
      ticker.start(REFRESH_MS, renderNext);
      shell.show();
    },
    update(p) {
      render(p);
    },
    close() {
      ticker.stop();
      shell.hide();
    },
    dismiss() {
      if (!props || !shell.isOpen()) return false;
      props.onDone();
      return true;
    },
    destroy() {
      ticker.stop();
      props = null;
      shell.el.remove();
    },
  };
}
