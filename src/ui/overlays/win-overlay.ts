// Owner: B (Phase 2b; was ui-shell)
// O3 win overlay (02 §5 O3, §10.1): praise word, celebrating cat, confetti, Next enabled after
// buttonDelayMs, Home always enabled. Phase 3 hook: an empty reward slot element (02 §22).
// Esc and scrim taps are ignored: the player picks Next or Home.
// The confetti layer is the stage card's first child, painted behind the card's content (UX-05): the
// burst flies out over the card and the scrim but never over the praise word, the cat or a button.
//
// Classes: .overlay[data-overlay=win] > .overlay__scrim--dark + .overlay__panel--stage.win[data-variant]
//          (.win__confetti .win__praise .win__art .win__sub .win__reward .win__next .win__home)
import { illustration } from '../art/illustrations';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { burstConfetti } from '../fx/confetti';
import { praise, t } from '../../i18n';
import { createDelay, createOverlayShell, makeButton, setButtonLabel, setGated } from './overlay-base';

export interface WinOverlayProps {
  /** 'tutorial': "You're ready!" + Play Level 2; 'tutorial_replay': "You're ready!" + Home only. */
  readonly variant: 'level' | 'tutorial' | 'tutorial_replay';
  /** The level just won (1 for the tutorial). */
  readonly level: number;
  readonly nextLevel: number;
  /** Index into PRAISE_KEYS (the app picks it). */
  readonly praise: number;
  /** fx.winButtonDelayMs (Next stays disabled until then). */
  readonly buttonDelayMs: number;
  readonly reducedMotion: boolean;
  onNext(): void;
  onHome(): void;
}

export function createWinOverlay(): OverlayView<WinOverlayProps> {
  let props: WinOverlayProps | null = null;
  const shell = createOverlayShell({ id: 'win', scrim: 'dark', panel: 'stage' });
  shell.panel.classList.add('win');
  const delay = createDelay();
  let stopConfetti: (() => void) | null = null;

  const confettiHost = h('div', { class: 'win__confetti', 'aria-hidden': 'true' });
  const title = h('h2', { class: 'overlay__title win__praise', id: shell.titleId });
  const art = h('div', { class: 'overlay__art win__art' }, illustration('win', { label: t('a11y.illustration.win') }));
  const sub = h('p', { class: 'win__sub', id: shell.descId });
  /** Phase 3 hook (02 §22): rewards render here. Empty and hidden in Phase 2. */
  const reward = h('div', { class: 'win__reward', dataset: { slot: 'reward' }, hidden: true });
  const next = makeButton({
    variant: 'primary',
    label: '',
    block: true,
    autofocus: true,
    className: 'win__next',
    trailing: icon('icon-chevron', { class: 'btn__chev' }),
    onPress: () => props?.onNext(),
  });
  const home = makeButton({
    variant: 'ghost',
    label: t('common.home'),
    icon: 'icon-house',
    className: 'win__home',
    onPress: () => props?.onHome(),
  });
  shell.panel.append(confettiHost, title, art, sub, reward, h('div', { class: 'overlay__actions overlay__actions--stack' }, next, home));

  const render = (p: WinOverlayProps): void => {
    props = p;
    shell.panel.dataset.variant = p.variant;
    const tutorial = p.variant !== 'level';
    setText(title, tutorial ? t('win.tutorial.title') : praise(p.praise));
    setText(sub, tutorial ? t('win.tutorial.body') : t('win.levelComplete', { level: p.level }));
    setButtonLabel(next, tutorial ? t('win.tutorial.play', { level: p.nextLevel }) : t('win.next', { level: p.nextLevel }));
    // tutorial: one button (Play Level 2); tutorial_replay: one button (Home); level: Next + Home.
    next.hidden = p.variant === 'tutorial_replay';
    home.hidden = p.variant === 'tutorial';
    home.classList.toggle('btn--ghost', p.variant !== 'tutorial_replay');
    home.classList.toggle('btn--primary', p.variant === 'tutorial_replay');
    home.classList.toggle('btn--block', p.variant === 'tutorial_replay');
    home.toggleAttribute('data-autofocus', p.variant === 'tutorial_replay');
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p);
      setGated(next, true);
      delay.start(p.buttonDelayMs, () => setGated(next, false));
      shell.show();
      stopConfetti?.();
      stopConfetti = p.reducedMotion ? null : burstConfetti(confettiHost);
    },
    update(p) {
      render(p);
    },
    close() {
      delay.cancel();
      stopConfetti?.();
      stopConfetti = null;
      shell.hide();
    },
    dismiss: () => false,
    destroy() {
      delay.cancel();
      stopConfetti?.();
      stopConfetti = null;
      props = null;
      shell.el.remove();
    },
  };
}
