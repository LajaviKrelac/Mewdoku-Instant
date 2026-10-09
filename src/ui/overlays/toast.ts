// Owner: B (Phase 2b; was ui-shell)
// O9 toast layer (02 §4.1): short non-blocking messages ("No videos right now — try again soon.").
// The layer is a polite live region, so screen readers read each toast once.
// - A live region inserted together with its text is often not announced (A11Y-11). The router
//   creates this layer lazily, right before the first show(), so the first toast goes in as an empty
//   (invisible) element and its text follows LIVE_SETTLE_MS later; later toasts are immediate.
// - Placement (UX-03): above the tool row by default; at the very bottom, below the centred card,
//   while a modal overlay is open (never over the fail overlay's Retry / Home or its title); under
//   the top bar on short screens (never over the board's last rows or Home's buttons).
//
// Classes: .toast-layer[data-pos=bottom|modal] > .toast (data-state="in" while shown)
import { cfg } from '../../app/config';
import { h } from '../dom';
import { createDelay, setTextKeepTogether } from './overlay-base';

export interface ToastLayer {
  readonly el: HTMLElement;
  /** Shows for durationMs (default fx.toastMs); a new toast replaces the current one. */
  show(message: string, opts?: { durationMs?: number }): void;
  clear(): void;
  destroy(): void;
}

/** Delay before the very first toast's text fills the new live region (ms). */
export const TOAST_SETTLE_MS = 150;

/** Whether a modal overlay (overlay-base: .overlay root with an aria-modal panel) is open in `doc`. */
export function modalOverlayOpen(doc: Document): boolean {
  return doc.querySelector('.overlay:not([hidden]) > [aria-modal="true"]') !== null;
}

export function createToastLayer(): ToastLayer {
  const el = h('div', { class: 'toast-layer', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', dataset: { pos: 'bottom' } });
  const timer = createDelay();
  const settle = createDelay();
  let current: HTMLElement | null = null;
  /** The region has been in the document long enough for assistive tech (after the first show). */
  let primed = false;

  const clear = (): void => {
    timer.cancel();
    settle.cancel();
    current?.remove();
    current = null;
  };

  return {
    el,
    show(message, opts) {
      clear();
      el.dataset.pos = modalOverlayOpen(el.ownerDocument) ? 'modal' : 'bottom';
      const toast = h('div', { class: 'toast', dataset: { state: 'in' } });
      current = toast;
      el.appendChild(toast);
      const reveal = (): void => {
        if (current !== toast) return;
        // A dash stays with the word before it ("right now —" / "try again soon.", UX-15).
        setTextKeepTogether(toast, message);
        timer.start(opts?.durationMs ?? cfg.fx.toastMs, () => {
          if (current === toast) clear();
        });
      };
      if (primed) reveal();
      else {
        primed = true;
        settle.start(TOAST_SETTLE_MS, reveal);
      }
    },
    clear,
    destroy() {
      clear();
      el.remove();
    },
  };
}
