// Owner: B (Phase 2b; was ui-shell); G2 (Phase 2c: "Out of fish", the "+1" badge ends with a fish)
// O4 fail overlay (02 §5 O4, §10.2): Continue (+1 fish, Phase 2c §1.4) when offered, Retry level, Home.
// Every button is gated until buttonDelayMs has passed and while `busy` (waiting for an ad).
// Esc and scrim taps are ignored: Home here discards the attempt, so it must be a deliberate tap.
//
// Classes: .overlay[data-overlay=fail] > .overlay__scrim--dark + .overlay__panel--stage.fail
//          .fail__art .fail__continue (.btn__badge > .btn__badge-icon) .fail__retry .fail__home ; [data-busy]
import { t } from '../../i18n';
import { illustration } from '../art/illustrations';
import { icon } from '../art/sprite';
import { h, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { createDelay, createOverlayShell, makeButton, setButtonLabel, setGated } from './overlay-base';

export interface FailOverlayProps {
  /** 'video' = rewarded ad; 'free' = fallback grant (no video icon); null = hide Continue. */
  readonly continueOffer: 'video' | 'free' | null;
  /** fx.failButtonDelayMs (buttons disabled until then; 0 when restored from a save). */
  readonly buttonDelayMs: number;
  /** true while waiting for the ad: buttons disabled. */
  readonly busy: boolean;
  onContinue(): void;
  onRetry(): void;
  /** Discards the attempt (02 §10.2). */
  onHome(): void;
}

export function createFailOverlay(): OverlayView<FailOverlayProps> {
  let props: FailOverlayProps | null = null;
  let ready = false;
  const shell = createOverlayShell({ id: 'fail', scrim: 'dark', panel: 'stage' });
  shell.panel.classList.add('fail');
  const delay = createDelay();

  const videoIcon = icon('icon-play-video', { class: 'btn__icon' });
  // Static texts follow the language on every open (review A11Y-I18N-1).
  const L = createLocaleText();
  const cont = makeButton({
    variant: 'primary',
    label: t('fail.continue'),
    block: true,
    className: 'fail__continue',
    // "+1" and a 16 px fish, decorative: the button's accessible name says "+1 fish" (§1.4).
    trailing: h(
      'span',
      { class: 'btn__badge', 'aria-hidden': 'true' },
      L.text(document.createTextNode(''), () => t('fail.continue.bonus')),
      icon('icon-fish', { class: 'btn__badge-icon' }),
    ),
    onPress: () => props?.onContinue(),
  });
  const retry = makeButton({
    variant: 'secondary',
    label: t('fail.retry'),
    block: true,
    className: 'fail__retry',
    onPress: () => props?.onRetry(),
  });
  const home = makeButton({
    variant: 'ghost',
    label: t('common.home'),
    icon: 'icon-house',
    className: 'fail__home',
    onPress: () => props?.onHome(),
  });
  L.run(() => {
    setButtonLabel(cont, t('fail.continue'));
    setButtonLabel(retry, t('fail.retry'));
    setButtonLabel(home, t('common.home'));
  });
  shell.panel.append(
    L.text(h('h2', { class: 'overlay__title', id: shell.titleId }), () => t('fail.title')),
    h('div', { class: 'overlay__art fail__art' }, L.attr(illustration('fail', { label: t('a11y.illustration.fail') }), 'aria-label', () => t('a11y.illustration.fail'))),
    L.text(h('p', { class: 'overlay__body fail__body', id: shell.descId }), () => t('fail.body')),
    h('div', { class: 'overlay__actions overlay__actions--stack' }, cont, retry, home),
  );

  const applyGates = (): void => {
    const gated = !ready || (props?.busy ?? false);
    for (const b of [cont, retry, home]) setGated(b, gated);
    shell.panel.toggleAttribute('data-busy', props?.busy ?? false);
    shell.panel.setAttribute('aria-busy', String(props?.busy ?? false));
  };

  const render = (p: FailOverlayProps): void => {
    props = p;
    L.apply();
    cont.hidden = p.continueOffer === null;
    if (p.continueOffer === 'video') {
      if (videoIcon.parentNode !== cont) cont.insertBefore(videoIcon, cont.firstChild);
    } else {
      videoIcon.remove();
    }
    // The accessible name contains the visible "Continue +1" (WCAG 2.5.3, A11Y-12).
    cont.setAttribute('aria-label', p.continueOffer === 'video' ? t('fail.continue.a11y.videoLabel') : t('fail.continue.a11y.freeLabel'));
    cont.toggleAttribute('data-autofocus', p.continueOffer !== null);
    retry.toggleAttribute('data-autofocus', p.continueOffer === null);
    applyGates();
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      ready = false;
      render(p);
      delay.start(p.buttonDelayMs, () => {
        ready = true;
        applyGates();
      });
      shell.show();
    },
    update(p) {
      render(p);
    },
    close() {
      delay.cancel();
      shell.hide();
    },
    dismiss: () => false,
    destroy() {
      delay.cancel();
      props = null;
      shell.el.remove();
    },
  };
}
