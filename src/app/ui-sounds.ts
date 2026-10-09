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

/**
 * Runs `fn` after the next frame has been produced (review PERF-1: the click sound's synthesis took
 * 33 ms of the tap's own task at 4× CPU, ahead of the button's visible answer). About one frame of
 * audio latency, never a held frame. Without requestAnimationFrame: a plain task.
 */
export function afterNextFrame(fn: () => void, win: Window | null = typeof window === 'undefined' ? null : window): void {
  const later = (): void => void setTimeout(fn, 0);
  if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(later);
  else later();
}

/**
 * Attaches the listener; returns detach(). Feedback errors never reach the page. The sound is played
 * through `defer` (default afterNextFrame), the haptic pulse at once (it needs the gesture).
 */
export function attachUiClickFeedback(root: HTMLElement, fb: UiClickFeedback, opts: { readonly defer?: (fn: () => void) => void } = {}): () => void {
  const defer = opts.defer ?? ((fn: () => void) => afterNextFrame(fn, root.ownerDocument.defaultView));
  const play = (): void => {
    try {
      fb.play();
    } catch {
      // audio must never break a button
    }
  };
  const onClick = (ev: Event): void => {
    if (!isUiButtonClick(root, ev.target)) return;
    try {
      defer(play);
      fb.haptic();
    } catch {
      // audio / haptics must never break a button
    }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
