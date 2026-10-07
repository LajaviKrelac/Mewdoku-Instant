// Owner: ui-shell
// Loading indicator (lead decision, Phase 2 integration): shown by the router when opening a level
// or a daily takes longer than cfg.loading.indicatorDelayMs (a pack fetch, or a board generated on
// the device). Three of our paw prints step in turn above "Getting the board ready…" (static under
// reduced motion). The layer blocks taps on the screen below, so a second Play cannot start twice.
// a11y: the text is written into a polite status region when shown (so it is announced once), and
// the router sets aria-busy on the app root while it shows.
// Over an open overlay (Next on the win overlay waits for a pack) the layer continues that overlay's
// dark scrim (data-over) instead of laying a cream veil on it (UX-10).
//
// Classes: .loading-layer[data-over] > .loading-card > .loading-paws > .loading-paw ×3 ; .loading-text
import { t } from '../../i18n';
import { icon } from '../art/sprite';
import { h } from '../dom';
import { modalOverlayOpen } from './toast';

export interface LoadingIndicator {
  readonly el: HTMLElement;
  show(): void;
  hide(): void;
  isShown(): boolean;
  destroy(): void;
}

export function createLoadingIndicator(): LoadingIndicator {
  const text = h('p', { class: 'loading-text' });
  const paws = h(
    'div',
    { class: 'loading-paws', 'aria-hidden': 'true' },
    icon('icon-paw', { class: 'loading-paw' }),
    icon('icon-paw', { class: 'loading-paw' }),
    icon('icon-paw', { class: 'loading-paw' }),
  );
  const card = h('div', { class: 'loading-card', role: 'status', 'aria-live': 'polite' }, paws, text);
  const el = h('div', { class: 'loading-layer', hidden: true }, card);
  return {
    el,
    show() {
      if (!el.hidden) return;
      el.dataset.over = String(modalOverlayOpen(el.ownerDocument));
      el.hidden = false;
      text.textContent = t('game.loading');
    },
    hide() {
      el.hidden = true;
      text.textContent = '';
    },
    isShown: () => !el.hidden,
    destroy() {
      el.remove();
    },
  };
}
