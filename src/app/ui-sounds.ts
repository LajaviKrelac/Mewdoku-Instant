// Owner: C (Phase 2b; was app)
// 02 §16 "UI button → click, vibration 4 ms" (lead decision, Phase 2 integration): ONE delegated
// click listener on the app root. Every enabled <button> under it plays the 'ui' sound and the
// cfg.haptics.ui pulse, except the board's cells, whose taps have their own sounds (mark, cat, …).
// The Sound setting is honoured by the audio engine (the 'setting' mute makes sfx.play a no-op);
// the Vibration setting and the haptics capability are checked by the caller's haptic().
export interface UiClickFeedback {
  play(): void;
  haptic(): void;
}

/** True for a click that should give UI feedback: an enabled button outside the board. */
export function isUiButtonClick(root: HTMLElement, target: EventTarget | null): boolean {
  const el = target as Element | null;
  const btn = el && typeof el.closest === 'function' ? el.closest('button') : null;
  if (!btn || !root.contains(btn)) return false;
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  return btn.closest('.board') === null;
}

/** Attaches the listener; returns detach(). Feedback errors never reach the page. */
export function attachUiClickFeedback(root: HTMLElement, fb: UiClickFeedback): () => void {
  const onClick = (ev: Event): void => {
    if (!isUiButtonClick(root, ev.target)) return;
    try {
      fb.play();
      fb.haptic();
    } catch {
      // audio / haptics must never break a button
    }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
