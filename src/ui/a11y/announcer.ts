// Owner: B (Phase 2b; was ui-board)
// Polite aria-live region (02 §18): "Cat placed. 4 of 8.", "Wrong tile. 2 hearts left.", "Lavender done."

export interface Announcer {
  /** Announces politely; repeated identical messages are still read (the region is reset first). */
  say(message: string): void;
  clear(): void;
  destroy(): void;
}

/** Inline style that hides content visually but keeps it in the accessibility tree. */
export const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';

/** Creates a visually hidden role="status" aria-live="polite" region inside `host` (default body). */
export function createAnnouncer(host?: HTMLElement): Announcer {
  const parent = host ?? document.body;
  const el = parent.ownerDocument.createElement('div');
  el.className = 'sr-only announcer';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.style.cssText = VISUALLY_HIDDEN;
  parent.appendChild(el);
  let flip = false;
  return {
    say(message: string) {
      if (!message) return;
      // A changed text node is what screen readers announce: an identical repeat gets a trailing
      // no-break space toggled on and off, so "Wrong tile." twice in a row is read twice.
      flip = el.textContent === message || el.textContent === `${message} ` ? !flip : false;
      el.textContent = flip ? `${message} ` : message;
    },
    clear() {
      el.textContent = '';
      flip = false;
    },
    destroy() {
      el.parentNode?.removeChild(el);
    },
  };
}
