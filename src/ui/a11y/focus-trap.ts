// Owner: B (Phase 2b; was ui-board)
// Modal focus management (04 §5.3): trap Tab inside a modal, `inert` on the background, focus restore.

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

/**
 * Cheap visibility test: no getComputedStyle. The router calls this right after it toggles `inert`
 * on the whole screen, so a computed-style read here forced a full-document style recalc on every
 * overlay open (RP-3: 100-250 ms at 4× CPU on a 12×12 board). Our UI hides controls with the
 * `hidden` attribute (or inline display/visibility), never with a stylesheet rule alone, so the
 * attribute and inline-style checks are enough.
 */
function isVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (n.style.display === 'none' || n.style.visibility === 'hidden') return false;
  }
  return true;
}

/** Tabbable descendants in DOM order. */
export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => {
    const ti = el.getAttribute('tabindex');
    if (ti !== null && Number(ti) < 0) return false;
    return isVisible(el);
  });
}

/**
 * Keeps Tab/Shift+Tab inside `container` and focuses `initialFocus` (or the first focusable).
 * The returned release() restores focus to `returnFocus` (default: the element focused before).
 * `restoreOnNextFrame` (RP-3): restore on the next animation frame instead of at once. focus()
 * forces a style update, and when a modal closes the router has just removed `inert` from the whole
 * screen while the board drops its hint highlight, so a synchronous restore costs a second
 * full-document recalc (≈ 100 ms at 4× CPU on a 12×12 board). A deferred restore happens only if
 * focus is still lost (on <body>, detached, or in the closed container) or moved within previous's
 * own dialog, so a modal opened meanwhile keeps its focus.
 */
export function trapFocus(
  container: HTMLElement,
  opts?: { initialFocus?: HTMLElement | null; returnFocus?: HTMLElement | null; restoreOnNextFrame?: boolean },
): () => void {
  const doc = container.ownerDocument;
  const previous = (opts?.returnFocus ?? doc.activeElement) as HTMLElement | null;

  const focusFirst = (): void => {
    const list = focusableElements(container);
    const target = list[0] ?? container;
    if (target === container && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };

  const initial = opts?.initialFocus;
  if (initial && container.contains(initial)) initial.focus({ preventScroll: true });
  else focusFirst();

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const list = focusableElements(container);
    if (list.length === 0) {
      e.preventDefault();
      return;
    }
    const first = list[0] as HTMLElement;
    const last = list[list.length - 1] as HTMLElement;
    const active = doc.activeElement as HTMLElement | null;
    const inside = active !== null && container.contains(active);
    if (e.shiftKey && (!inside || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault();
      first.focus();
    }
  };

  const onFocusIn = (e: FocusEvent): void => {
    const target = e.target as Node | null;
    if (target && !container.contains(target)) focusFirst();
  };

  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('focusin', onFocusIn, true);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('focusin', onFocusIn, true);
    if (!previous || typeof previous.focus !== 'function') return;
    const win = doc.defaultView;
    if (!opts?.restoreOnNextFrame || !win?.requestAnimationFrame) {
      if (previous.isConnected) previous.focus({ preventScroll: true });
      return;
    }
    win.requestAnimationFrame(() => {
      if (!previous.isConnected) return;
      const a = doc.activeElement;
      const lost = !a || a === doc.body || !a.isConnected || container.contains(a);
      if (lost || previous.closest('[role="dialog"]')?.contains(a)) previous.focus({ preventScroll: true });
    });
  };
}

const PREV_ARIA = 'inertPrevAriaHidden';

/** Sets or clears `inert` (and aria-hidden as a fallback) on each element. */
export function setInert(elements: readonly HTMLElement[], inert: boolean): void {
  for (const el of elements) {
    if (inert) {
      if (el.dataset[PREV_ARIA] === undefined) el.dataset[PREV_ARIA] = el.getAttribute('aria-hidden') ?? '';
      el.setAttribute('inert', '');
      (el as HTMLElement & { inert?: boolean }).inert = true;
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('inert');
      (el as HTMLElement & { inert?: boolean }).inert = false;
      const prev = el.dataset[PREV_ARIA];
      if (prev) el.setAttribute('aria-hidden', prev);
      else el.removeAttribute('aria-hidden');
      delete el.dataset[PREV_ARIA];
    }
  }
}
