// Owner: B (Phase 2b; was ui-board)
// Transient board effects (02 §17.5): class-triggered CSS keyframes with timed cleanup, the kitty
// sparkle burst, the board-entry wave timing (phase2b §2.9: entryEndMs) and the idle-loop helpers
// (per-cat noise, ear-flick delays). Keyframes live in styles/fx.css.
import { cfg, type GameConfig } from '../../app/config';

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

/**
 * Per-diagonal stagger of the board-entry wave (phase2b §2.9):
 * min(fx.boardEntryStaggerMs, fx.boardEntryWaveBudgetMs / (2n − 2)).
 */
export function entryStaggerMs(n: number, c: GameConfig = cfg): number {
  const diagonals = 2 * Math.max(1, Math.floor(n)) - 2;
  const f = c.fx;
  return diagonals > 0 ? Math.min(f.boardEntryStaggerMs, f.boardEntryWaveBudgetMs / diagonals) : f.boardEntryStaggerMs;
}

/**
 * When the board entry ends and START is due (phase2b §2.9): boardEntryWaveStartMs + (2n − 2) ×
 * stagger + boardEntryTileMs, at most fx.boardEntryMs. 12×12 → 696 ms, 4×4 → 408 ms. Reduced motion:
 * the 150 ms fade (fx.reducedMotionFadeMs, also capped).
 */
export function entryEndMs(n: number, reduced = false, c: GameConfig = cfg): number {
  const f = c.fx;
  if (reduced) return Math.min(f.reducedMotionFadeMs, f.boardEntryMs);
  const diagonals = 2 * Math.max(1, Math.floor(n)) - 2;
  const end = f.boardEntryWaveStartMs + diagonals * entryStaggerMs(n, c) + f.boardEntryTileMs;
  return Math.min(Math.round(end), f.boardEntryMs);
}

/** Start time (ms from the entry) of tile (r, c)'s scale-in: the diagonal wave of §2.9. */
export function entryTileDelayMs(r: number, col: number, n: number, c: GameConfig = cfg): number {
  return c.fx.boardEntryWaveStartMs + (r + col) * entryStaggerMs(n, c);
}

/**
 * Entry timing as CSS values (board-view mirrors them into --entry-* variables, fx.css animates):
 * the tile duration and the per-diagonal stagger (0 with reduced motion: a plain fade).
 */
export function entryTiming(n: number, reduced: boolean, c: GameConfig = cfg): { durationMs: number; staggerMs: number } {
  if (reduced) return { durationMs: entryEndMs(n, true, c), staggerMs: 0 };
  return { durationMs: c.fx.boardEntryTileMs, staggerMs: entryStaggerMs(n, c) };
}

/**
 * A seeded per-cell pseudo-random in [0, 1) (phase2b §2.9 "a per-cat phase from cellNoise"): the
 * breathing phase and the first ear-flick delay differ per cat but stay stable for a cell. The same
 * hash as board-cells' blink noise, with its own salts.
 */
export function cellNoise(cell: number, salt: number): number {
  let x = (cell + 1) * 2654435761 + salt * 40503;
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Delay until a cat's next ear flick: fx.earFlickMinMs … earFlickMaxMs (phase2b §2.9). */
export function earFlickDelayMs(u: number, c: GameConfig = cfg): number {
  const f = c.fx;
  const k = Math.min(1, Math.max(0, u));
  return Math.round(f.earFlickMinMs + k * (f.earFlickMaxMs - f.earFlickMinMs));
}
