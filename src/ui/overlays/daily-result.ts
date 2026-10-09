// Owner: B (Phase 2b; was ui-shell)
// O7 daily result (02 §5 O7, §12): date, happy cat, solve time, mistakes and hints, next puzzle countdown.
// The countdown refreshes while open; once the next puzzle is due it reads 'daily.ready' instead. Esc acts as Done; scrim taps are ignored (Done may show an ad).
//
// Classes: .overlay[data-overlay=daily_result] > .overlay__panel--dialog.daily-result
//          .daily-result__art .daily-result__time .daily-result__stats .daily-result__next
import { formatClock, formatDuration, formatShortDate, t } from '../../i18n';
import { illustration } from '../art/illustrations';
import { h, setText, type OverlayView } from '../dom';
import { createOverlayShell, createTicker, makeButton, setButtonLabel, setTextKeepTogether } from './overlay-base';

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
    if (!props) return;
    // Solved after midnight, or left open past it: the next daily is already playable (logic-5, SPEC-03).
    const left = props.nextPuzzleAt - props.now();
    setText(next, left <= 0 ? t('daily.ready') : t('daily.next', { time: formatDuration(left) }));
  };
  const render = (p: DailyResultProps): void => {
    props = p;
    setButtonLabel(done, t('daily.done')); // follows the language (review A11Y-I18N-1)
    // The date stays on one line ("Daily puzzle · Wed 7" / "Oct" was the old break, UX-15).
    const date = formatShortDate(p.dateKey);
    setTextKeepTogether(title, t('daily.title', { date }), [date]);
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
