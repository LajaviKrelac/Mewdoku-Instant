// Owner: ui-shell
// O9 toast layer (02 §4.1): short non-blocking messages ("No videos right now — try again soon.").
// The layer is a polite live region, so screen readers read each toast once.
//
// Classes: .toast-layer > .toast (data-state="in" while shown)
import { cfg } from '../../app/config';
import { h } from '../dom';
import { createDelay } from './overlay-base';

export interface ToastLayer {
  readonly el: HTMLElement;
  /** Shows for durationMs (default fx.toastMs); a new toast replaces the current one. */
  show(message: string, opts?: { durationMs?: number }): void;
  clear(): void;
  destroy(): void;
}

export function createToastLayer(): ToastLayer {
  const el = h('div', { class: 'toast-layer', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const timer = createDelay();
  let current: HTMLElement | null = null;

  const clear = (): void => {
    timer.cancel();
    current?.remove();
    current = null;
  };

  return {
    el,
    show(message, opts) {
      clear();
      const toast = h('div', { class: 'toast', dataset: { state: 'in' } }, message);
      current = toast;
      el.appendChild(toast);
      timer.start(opts?.durationMs ?? cfg.fx.toastMs, () => {
        if (current === toast) clear();
      });
    },
    clear,
    destroy() {
      clear();
      el.remove();
    },
  };
}
