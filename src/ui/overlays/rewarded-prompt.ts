// Owner: B (Phase 2b); G2 (Phase 2c: no swap)
// O2 rewarded-ad prompt (02 §5 O2, §13.3). Revive does not use it (the O4 button is the prompt).
// The variant is chosen by the app when the dialog opens; the countdown variant ticks live.
// Phase 2c (fish-lives-spec §5.4): back to the Phase 2 card, [Watch video] [Not now] / "Here's a free
// hint." [Take it] / the countdown with [OK]: no swap row, no balance (fish are lives, not a currency).
//
// Classes: .overlay[data-overlay=rewarded] > .overlay__panel--dialog.rewarded[data-variant]
//          .rewarded__icon .overlay__title .overlay__body .overlay__actions(.rewarded__accept
//          .rewarded__ok .rewarded__decline)
import { formatClock, t } from '../../i18n';
import { icon } from '../art/sprite';
import { clear, h, setText, type OverlayView } from '../dom';
import { createOverlayShell, createTicker, makeButton, setButtonLabel } from './overlay-base';

export type RewardedVariant =
  | 'video' // [Watch video] [Not now]
  | 'free' // "Here's a free hint." [Take it] [Not now]
  | 'countdown'; // "Next free hint in m:ss" (live), [OK] only

export interface RewardedPromptProps {
  readonly placement: 'hint' | 'kitty';
  readonly variant: RewardedVariant;
  /** Epoch ms when the free fallback opens again (countdown variant). */
  readonly nextFreeAt: number;
  /** Clock for the live countdown. */
  now(): number;
  /** Watch video / Take it. */
  onAccept(): void;
  /** Not now / OK / Esc. */
  onDecline(): void;
}

/** Countdown refresh period; finer than 1 s so the display never skips a second. */
const TICK_MS = 250;

/** "m:ss" left until `at`, rounded up so the display reaches 0:00 exactly when the wait ends. */
export function countdownText(at: number, now: number): string {
  const left = Math.max(0, at - now);
  return formatClock(Math.ceil(left / 1000) * 1000);
}

function bodyText(p: RewardedPromptProps): string {
  const hint = p.placement === 'hint';
  switch (p.variant) {
    case 'video':
      return hint ? t('rewarded.video.hint') : t('rewarded.video.kitty');
    case 'free':
      return hint ? t('rewarded.free.hint') : t('rewarded.free.kitty');
    case 'countdown': {
      const time = countdownText(p.nextFreeAt, p.now());
      return hint ? t('rewarded.countdown.hint', { time }) : t('rewarded.countdown.kitty', { time });
    }
  }
}

export function createRewardedPrompt(): OverlayView<RewardedPromptProps> {
  let props: RewardedPromptProps | null = null;
  const decline = (): boolean => {
    if (!props || !shell.isOpen()) return false;
    props.onDecline();
    return true;
  };
  const shell = createOverlayShell({ id: 'rewarded', scrim: 'soft', panel: 'dialog', onScrimTap: () => void decline() });
  shell.panel.classList.add('rewarded');
  const ticker = createTicker();

  const iconSlot = h('div', { class: 'rewarded__icon', 'aria-hidden': 'true' });
  const title = h('h2', { class: 'overlay__title', id: shell.titleId });
  const body = h('p', { class: 'overlay__body', id: shell.descId, 'aria-live': 'off' });
  const accept = makeButton({
    variant: 'primary',
    label: '',
    block: true,
    autofocus: true,
    className: 'rewarded__accept',
    onPress: () => props?.onAccept(),
  });
  const notNow = makeButton({
    variant: 'ghost',
    label: t('common.notNow'),
    className: 'rewarded__decline',
    onPress: () => props?.onDecline(),
  });
  const ok = makeButton({
    variant: 'primary',
    label: t('common.ok'),
    block: true,
    className: 'rewarded__ok',
    onPress: () => props?.onDecline(),
  });
  shell.panel.append(iconSlot, title, body, h('div', { class: 'overlay__actions overlay__actions--stack' }, accept, ok, notNow));

  const videoIcon = icon('icon-play-video', { class: 'btn__icon' });

  const render = (p: RewardedPromptProps): void => {
    props = p;
    // Static labels follow the language on every open (review A11Y-I18N-1).
    setButtonLabel(notNow, t('common.notNow'));
    setButtonLabel(ok, t('common.ok'));
    shell.panel.dataset.variant = p.variant;
    shell.panel.dataset.placement = p.placement;
    clear(iconSlot);
    iconSlot.appendChild(icon(p.placement === 'hint' ? 'icon-bulb' : 'icon-paw'));
    setText(title, p.placement === 'hint' ? t('rewarded.title.hint') : t('rewarded.title.kitty'));
    setText(body, bodyText(p));

    const countdown = p.variant === 'countdown';
    accept.hidden = countdown;
    notNow.hidden = countdown;
    ok.hidden = !countdown;
    // The preferred first focus follows the visible primary button.
    accept.toggleAttribute('data-autofocus', !countdown);
    ok.toggleAttribute('data-autofocus', countdown);
    setButtonLabel(accept, p.variant === 'video' ? t('rewarded.watch') : t('rewarded.take'));
    if (p.variant === 'video') {
      if (videoIcon.parentNode !== accept) accept.insertBefore(videoIcon, accept.firstChild);
    } else {
      videoIcon.remove();
    }

    if (countdown) {
      ticker.start(TICK_MS, () => {
        if (props) setText(body, bodyText(props));
      });
    } else {
      ticker.stop();
    }
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p);
      shell.show();
    },
    update(p) {
      render(p);
    },
    close() {
      ticker.stop();
      shell.hide();
    },
    dismiss: decline,
    destroy() {
      ticker.stop();
      props = null;
      shell.el.remove();
    },
  };
}
