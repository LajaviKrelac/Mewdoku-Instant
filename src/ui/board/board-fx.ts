// Owner: ui-board
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

/** Adds `cls` (restarting the animation when already present) and removes it after `ms`. */
export function flashClass(el: Element, cls: string, ms: number, timers: FxTimers): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // restart keyframes
  el.classList.add(cls);
  timers.later(ms, () => el.classList.remove(cls));
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
