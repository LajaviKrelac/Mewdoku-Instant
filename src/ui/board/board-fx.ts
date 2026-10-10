// Owner: B (Phase 2b; was ui-board); G2 (Phase 2d.1: ghostOrder, waveOrder, xOutlinePath, helpers-spec §3.3, §4.2)
// Transient board effects (02 §17.5): class-triggered CSS keyframes with timed cleanup, the kitty
// sparkle burst, the board-entry wave timing (phase2b §2.9: entryEndMs) and the idle-loop helpers
// (per-cat noise, ear-flick delays). Keyframes live in styles/fx.css (2b) and styles/board.css (2d, 2d.1).
// Phase 2d.1 (pure helpers): the hint's ghost order (ghostOrder), the completion wave's steps
// (waveOrder) and the ghost X's outline path (xOutlinePath).
import { cfg, type GameConfig } from '../../app/config';
import { CellState, type CellIndex, type HintStep } from '../../engine/types';
import type { DoneUnit } from '../../game/types';

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

/**
 * Phase 2d.1 (helpers-spec §3.3, D-2d1-7): the hint's ghost X slots in pop order. Only the Empty
 * effect cells are listed (marked tiles and the cat take no slot). A `shadow` step: its focus cat's row
 * left → right, then its column top → bottom, then the remaining cells in reading order (measured);
 * every other kind: reading order. Ghost i appears at fx.hint.ghostFirstMs + i × ghostStaggerMs.
 * The board stays LTR in every language (look-spec §1.18), so "left" is the screen's left.
 */
export function ghostOrder(step: HintStep, cells: Readonly<Uint8Array>, n: number): CellIndex[] {
  if (step.kind === 'mistaken_mark') return [];
  const open = step.effectCells.filter((i) => cells[i] === CellState.Empty);
  const reading = [...new Set(open)].sort((a, b) => a - b);
  const cat = step.focusCells[0];
  if (step.kind !== 'shadow' || cat === undefined) return reading;
  const row = Math.floor(cat / n);
  const col = cat % n;
  const inRow = reading.filter((i) => Math.floor(i / n) === row);
  const inCol = reading.filter((i) => i % n === col && Math.floor(i / n) !== row);
  const first = new Set([...inRow, ...inCol]);
  return [...inRow, ...inCol, ...reading.filter((i) => !first.has(i))];
}

/** A completed unit (helpers-spec §4.1: kind, index = the row, column or region label, anchor = its last changed tile). */
export type WaveUnit = Pick<DoneUnit, 'kind' | 'index' | 'anchor'>;

/**
 * Phase 2d.1 (helpers-spec §4.2, D-2d1-6): the steps of a completed unit's wave; waveOrder(u)[k] are the
 * tiles that start at k × fx.unitDone.waveStepMs. A row or column runs from its end nearer the anchor
 * to the other end, one tile per step (measured: row 0 right → left from (0,8), column 8 bottom → top
 * from (8,8)); an anchor exactly in the middle starts at the far (right / bottom) end. A colour region
 * steps by king-move distance from the anchor inside the region (ours: not observed on a region of more
 * than one tile). Every tile of the unit is listed (its cat and old marks included).
 */
export function waveOrder(unit: WaveUnit, n: number, regions: ArrayLike<number>): readonly (readonly CellIndex[])[] {
  const ar = Math.floor(unit.anchor / n);
  const ac = unit.anchor % n;
  if (unit.kind === 'row' || unit.kind === 'col') {
    const along = unit.kind === 'row' ? ac : ar;
    const fromEnd = along >= (n - 1) / 2;
    const at = (k: number): CellIndex => {
      const p = fromEnd ? n - 1 - k : k;
      return unit.kind === 'row' ? unit.index * n + p : p * n + unit.index;
    };
    return Array.from({ length: n }, (_, k) => [at(k)]);
  }
  const label = unit.index;
  const dist = new Map<CellIndex, number>();
  const queue: CellIndex[] = [];
  const start = regions[unit.anchor] === label ? unit.anchor : -1;
  if (start >= 0) {
    dist.set(start, 0);
    queue.push(start);
  }
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q] as CellIndex;
    const r = Math.floor(cur / n);
    const c = cur % n;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < n && cc >= 0 && cc < n) {
          const j = rr * n + cc;
          if (regions[j] === label && !dist.has(j)) {
            dist.set(j, (dist.get(cur) as number) + 1);
            queue.push(j);
          }
        }
      }
    }
  }
  // a region tile the king walk cannot reach (never on a valid board) joins the last step
  const far = dist.size ? Math.max(...dist.values()) : 0;
  const steps: CellIndex[][] = [];
  for (let i = 0; i < n * n; i++) {
    if (regions[i] !== label) continue;
    const k = dist.get(i) ?? far;
    (steps[k] ??= []).push(i);
  }
  return steps.map((s) => s ?? []);
}

/**
 * Phase 2d.1 (helpers-spec §3.3): the ghost X's path, the union outline of the two X bars (no inner
 * crossing lines) on the slot's 100-unit box, as path data. The bars are layout.mark's (markRects); the
 * outline's centre line is placed so that the 1.5 px white stroke (board.css, non-scaling) ends 0.8 px
 * outside the real X on a 39 px tile (slot 42: measured "outer = real X + 0.8 per side", tip to tip
 * ≈ 77–79 % of the tile against the real X's 75 %). One path, computed once per config.
 */
export function xOutlinePath(c: GameConfig = cfg): string {
  const M = c.layout.mark;
  const slot = 42; // the measured board: tile 39 + gap 3
  const grow = ((GHOST_OUTER_PX - GHOST_STROKE_PX / 2) / slot) * 100;
  const h = (M.armFraction * 100) / 2 + grow;
  const w = (M.barFraction * 100) / 2 + grow;
  const r = Math.min(w, M.cornerFraction * 100 + grow);
  const q = Math.SQRT1_2;
  const pt = (x: number, y: number): string => {
    // rotate 45° about the centre (SVG y-down: the arm along +x becomes "")
    const X = 50 + (x - y) * q;
    const Y = 50 + (x + y) * q;
    return `${Math.round(X * 100) / 100} ${Math.round(Y * 100) / 100}`;
  };
  const R = Math.round(r * 100) / 100;
  const arcR = (x: number, y: number): string => `A${R} ${R} 0 0 1 ${pt(x, y)}`;
  // the plus shape in the bars' own frame, clockwise from the right arm's top edge
  return (
    `M${pt(h - r, -w)}${arcR(h, -w + r)}L${pt(h, w - r)}${arcR(h - r, w)}L${pt(w, w)}` +
    `L${pt(w, h - r)}${arcR(w - r, h)}L${pt(-w + r, h)}${arcR(-w, h - r)}L${pt(-w, w)}` +
    `L${pt(-h + r, w)}${arcR(-h, w - r)}L${pt(-h, -w + r)}${arcR(-h + r, -w)}L${pt(-w, -w)}` +
    `L${pt(-w, -h + r)}${arcR(-w + r, -h)}L${pt(w - r, -h)}${arcR(w, -h + r)}L${pt(w, -w)}Z`
  );
}

/** The ghost outline's stroke (helpers-spec §3.3: 1.5 px white, measured) and its outer edge beyond the real X. */
export const GHOST_STROKE_PX = 1.5;
export const GHOST_OUTER_PX = 0.8;
