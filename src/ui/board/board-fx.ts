// Owner: B (Phase 2b; was ui-board)
// Transient board effects (02 §17.5): class-triggered CSS keyframes with timed cleanup, the kitty
// sparkle burst and the staggered entry. Keyframes live in styles/fx.css.
import { cfg } from '../../app/config';

/** Timers owned by one board; cleared on destroy/rebuild. */
export interface FxTimers {
  later(ms: number, fn: () => void): void;
  clear(): void;
}

export function createFxTimers(): FxTimers {
  const ids = new Set<ReturnType<typeof setTimeout>>();
  return {
    later(ms, fn) {
      const id = setTimeout(() => {
        ids.delete(id);
        fn();
      }, ms);
      ids.add(id);
    },
    clear() {
      for (const id of ids) clearTimeout(id);
      ids.clear();
    },
  };
}

/** Latest flash per element and class, so an older flash's timer never strips a newer one. */
const flashes = new WeakMap<Element, Map<string, number>>();
let flashSeq = 0;

/**
 * Adds `cls` and removes it after `ms`. Never reads layout (RP-3): a class that is not on the element
 * yet is simply added, and its keyframes start with the next style update. When the class is still
 * on (a flash restarted within `ms`), it is removed now and added back on the next animation frame
 * two animation frames later (one style update without it, then one with it, restarts the keyframes)
 * instead of forcing a reflow with offsetWidth.
 */
export function flashClass(el: Element, cls: string, ms: number, timers: FxTimers): void {
  const seq = ++flashSeq;
  let mine = flashes.get(el);
  if (!mine) flashes.set(el, (mine = new Map()));
  mine.set(cls, seq);
  const current = (): boolean => flashes.get(el)?.get(cls) === seq;
  const finish = (): void => {
    if (current()) el.classList.remove(cls);
  };
  if (!el.classList.contains(cls)) {
    el.classList.add(cls);
    timers.later(ms, finish);
    return;
  }
  el.classList.remove(cls);
  const win = el.ownerDocument.defaultView;
  const readd = (): void => {
    if (current()) el.classList.add(cls);
  };
  if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(() => win.requestAnimationFrame(readd));
  else timers.later(0, readd);
  timers.later(ms, finish);
}

/** A small burst of star sparkles around a cell (kitty reveal, 02 §9.2). */
export function sparkle(cellEl: HTMLElement, timers: FxTimers, count = 6): void {
  const doc = cellEl.ownerDocument;
  const host = doc.createElement('span');
  host.className = 'cell__spark';
  host.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < count; k++) {
    const i = doc.createElement('i');
    const a = (k / count) * Math.PI * 2 + 0.4;
    i.style.setProperty('--sx', `${Math.cos(a).toFixed(3)}`);
    i.style.setProperty('--sy', `${Math.sin(a).toFixed(3)}`);
    i.style.setProperty('--sd', `${(k % 3) * 40}ms`);
    host.appendChild(i);
  }
  cellEl.appendChild(host);
  timers.later(cfg.kitty.revealMs + 200, () => host.parentNode?.removeChild(host));
}

/** Entry timing (02 §17.5): tiles scale 0.9 → 1, staggered per row, everything done within boardEntryMs. */
export function entryTiming(n: number, reduced: boolean): { durationMs: number; staggerMs: number } {
  if (reduced) return { durationMs: Math.min(cfg.fx.reducedMotionFadeMs, cfg.fx.boardEntryMs), staggerMs: 0 };
  const staggerMs = cfg.fx.boardEntryStaggerMs;
  const durationMs = Math.max(80, cfg.fx.boardEntryMs - staggerMs * Math.max(0, n - 1));
  return { durationMs, staggerMs };
}
