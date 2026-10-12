// Leaderboard update (user: "when user logs in it auto joins event by default"; the reference's "New Session" card).
// The "New ranking" card (overlay `ladder_session`): on Home, once per bracket the sign-in joined me to (no fish of
// mine in it yet), after any result card. A light dialog: the title and ×, a stage with our podium and my picture on
// first place under the bracket's own countdown (hh:mm:ss, the server's endsAt), one calm line, and "Got it".
// Honesty: the countdown is the server's; nothing here claims a player count or a rule's number. Lazy `ladder` chunk.
// Classes: .overlay[data-overlay=ladder_session] > .overlay__panel--dialog.ladder-session
//          > .overlay__head(h2.overlay__title button.overlay__close) .ladder-session__stage(.lb-timer .ladder-session__podium)
//            p.ladder-session__body .overlay__actions(button.ladder-session__ok)
import { t } from '../../i18n';
import { avatarSymbol, mountLadderArt } from '../art/ladder-art';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { clockText } from './bracket-list';
import { closeButton, createOverlayShell, makeButton } from './overlay-base';
import '../../styles/ladder-chunk.css';

export interface LadderSessionProps {
  /** The bracket's end on the DEVICE clock (the app applied the server offset). */
  readonly endsAt: number;
  now(): number;
  /** My picture (save.ladder.me); null: the default cat. */
  readonly avatarId: number | null;
  readonly reducedMotion: boolean;
  /** Got it, ×, Esc or a tap on the scrim. */
  onClose(): void;
}

export function createLadderSession(): OverlayView<LadderSessionProps> {
  mountLadderArt(typeof document === 'undefined' ? undefined : document);
  let props: LadderSessionProps | null = null;
  let tick: ReturnType<typeof setTimeout> | null = null;
  const shell = createOverlayShell({ id: 'ladder_session', scrim: 'soft', panel: 'dialog', onScrimTap: () => props?.onClose() });
  shell.panel.classList.add('ladder-session');
  const L = createLocaleText();

  const title = L.text(h('h2', { class: 'overlay__title', id: shell.titleId }), () => t('ladder.session.title'));
  const close = L.attr(closeButton(() => props?.onClose()), 'aria-label', () => t('common.close'));
  const head = h('div', { class: 'overlay__head' }, title, close);

  const timerText = h('span', { class: 'lb-timer__text num' });
  const timer = h('div', { class: 'lb-timer', 'aria-hidden': 'true' }, icon('icon-stopwatch', { class: 'lb-timer__icon' }), timerText);
  const me = h('span', { class: 'ladder-session__me' });
  let meFor = -2;
  const step = (place: 1 | 2 | 3, top: HTMLElement | null): HTMLElement =>
    h(
      'span',
      { class: 'ladder-session__step', dataset: { place: String(place) } },
      ...(top ? [top] : []),
      h('span', { class: 'ladder-session__block' }, h('span', { class: 'ladder-session__num num' }, String(place))),
    );
  const podium = h('div', { class: 'ladder-session__podium', 'aria-hidden': 'true' }, step(2, null), step(1, me), step(3, null));
  const stage = h('div', { class: 'ladder-session__stage' }, timer, podium);
  const body = L.text(h('p', { class: 'ladder-session__body', id: shell.descId }), () => t('ladder.session.body'));
  const ok = L.label(makeButton({ variant: 'primary', label: '', block: true, autofocus: true, className: 'ladder-session__ok', onPress: () => props?.onClose() }), () =>
    t('ladder.session.ok'),
  );
  shell.panel.append(head, stage, body, h('div', { class: 'overlay__actions' }, ok));

  const stop = (): void => {
    if (tick !== null) clearTimeout(tick);
    tick = null;
  };
  /** The countdown, once a second on the second's edge (decorative: the card's text says what it is). */
  const renderTimer = (): void => {
    stop();
    if (!props) return;
    const left = props.endsAt - props.now();
    setText(timerText, clockText(left));
    if (left > 0 && shell.isOpen()) tick = setTimeout(renderTimer, (left % 1000) + 20);
  };

  const render = (p: LadderSessionProps): void => {
    props = p;
    L.apply();
    shell.el.toggleAttribute('data-reduced', p.reducedMotion);
    const id = p.avatarId ?? -1;
    if (id !== meFor) {
      meFor = id;
      me.textContent = '';
      me.appendChild(icon(avatarSymbol(p.avatarId ?? 0), { class: 'ladder-session__avatar' }));
    }
    renderTimer();
  };

  L.watch(() => {
    if (props) render(props);
  });

  return {
    el: shell.el,
    modal: true,
    open(p) {
      shell.show();
      render(p);
    },
    update(p) {
      render(p);
    },
    close() {
      stop();
      shell.hide();
    },
    dismiss() {
      if (!props || !shell.isOpen()) return false;
      props.onClose();
      return true;
    },
    destroy() {
      stop();
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
