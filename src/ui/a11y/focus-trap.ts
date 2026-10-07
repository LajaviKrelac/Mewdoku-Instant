// Owner: ui-board
// Modal focus management (04 §5.3): trap Tab inside a modal, `inert` on the background, focus restore.

/** Tabbable descendants in DOM order. */
export function focusableElements(container: HTMLElement): HTMLElement[] {
  throw new Error('not implemented: focusableElements');
}

/**
 * Keeps Tab/Shift+Tab inside `container` and focuses `initialFocus` (or the first focusable).
 * The returned release() restores focus to `returnFocus` (default: the element focused before).
 */
export function trapFocus(
  container: HTMLElement,
  opts?: { initialFocus?: HTMLElement | null; returnFocus?: HTMLElement | null },
): () => void {
  throw new Error('not implemented: trapFocus');
}

/** Sets or clears `inert` (and aria-hidden as a fallback) on each element. */
export function setInert(elements: readonly HTMLElement[], inert: boolean): void {
  throw new Error('not implemented: setInert');
}
