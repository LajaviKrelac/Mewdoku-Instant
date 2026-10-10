// Owner: G2 (Phase 2d.1)
// The mouse's visits on the board (helpers-spec §1.4–§1.5, D-2d1-1; measured on the user's recording v1).
// MARKED { source: 'mouse' } already holds the marks; each X waits hidden (.cell.fx-pend) while our mouse
// (art/helper-art.ts, the board-mouse parts) visits the tiles one by one in event order:
//   t = k × visit (visit = dwellMs + exitMs, 935): the mouse appears on tile k (scale 0.5 → 1 over
//     appearMs, board.css) and the tile does a press bump (0.87 → 1 over 70 ms, linear); its face plays
//     blink, glance or grin (k mod 3) while it sits;
//   t = k × visit + dwellMs (850): its X pops in under it (1.15 → 1 over fx.markPopMs) and the mouse
//     shrinks to 0.77 and fades over exitMs; the next visit starts as it vanishes.
// The run is driven by the elapsed time, not by counting timers: a late timer (a hidden page throttles
// them) catches up on every event that is due, and at mouseRunMs (count × visit + markPopMs) a
// finaliser removes the sprite and every .fx-pend whatever the animation state (critic). Reduced
// motion: no sprite; the X's fade in together over fx.reducedMotionFadeMs.
// A lazy chunk (board-view.ts loadMouseRun: prefetched at idle after a board entry; the first screen
// never needs it): loading it also mounts the lazy art (art/lazy-art.ts: the mouse's parts, and the star
// and shards of the lazy fx chunk).
// Phase 2d.1 I-4 (lead, requests-G2 H3): the chunk is the board's lazy motion as a whole: it also carries
// the cat-placed sequence (board-cat.ts, re-exported here) and one stylesheet, styles/board-mouse.css
// (the mouse's visits and X pop, the cat sequence, the completion wave), which left the first-load
// board.css. Until it is in, a correct cat shows at rest and a completed unit does not wave.
import { cfg, type GameConfig } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import { mouseLandMs, mouseRunMs, mouseVisitMs } from '../../game/mouse';
import { MOUSE_BOX } from '../art/helper-art';
import { mountLazyArt } from '../art/lazy-art';
import type { FxTimers } from './board-fx';
import '../../styles/board-mouse.css';

export { playCatSequence } from './board-cat';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The face per visit (helpers-spec §1.4 [DECISION]): visit k plays FACES[k mod 3]. */
export const MOUSE_FACES = ['blink', 'glance', 'grin'] as const;
export type MouseFace = (typeof MOUSE_FACES)[number];

mountLazyArt();

export interface MouseRunDeps {
  readonly board: HTMLElement;
  cellElement(cell: CellIndex): HTMLElement | null;
  readonly n: number;
  readonly timers: FxTimers;
  /** Adds a transient class (board-fx flashClass with the board's timers). */
  flash(el: Element, cls: string, ms: number): void;
  now?(): number;
  /** When MARKED arrived (deps.now's clock): the run is timed from there, so a late chunk load catches up. Default: now. */
  readonly startedAt?: number;
}

export interface MouseRun {
  /** Ends the run at once: no sprite, no hidden X (a props render, a new board, destroy). */
  finish(): void;
  readonly cells: readonly CellIndex[];
}

/** The sprite: div.board__mouse > svg (the art's box) > the head, eyes, lids and grin parts. */
function buildSprite(doc: Document, cell: CellIndex, n: number, face: MouseFace): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'board__mouse';
  el.setAttribute('aria-hidden', 'true');
  el.dataset.cell = String(cell);
  el.dataset.face = face;
  el.style.setProperty('--mr', String(Math.floor(cell / n)));
  el.style.setProperty('--mc', String(cell % n));
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', MOUSE_BOX_TIGHT);
  svg.setAttribute('focusable', 'false');
  for (const part of ['', '-eyes', '-lids', '-grin']) {
    const use = doc.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#board-mouse${part}`);
    use.setAttribute('class', `board__mouse-part${part ? ` board__mouse${part}` : ''}`);
    // the part symbols share MOUSE_BOX; placed on it 1:1 so every part lines up
    const [x, y, w, h] = MOUSE_BOX.split(' ');
    use.setAttribute('x', x as string);
    use.setAttribute('y', y as string);
    use.setAttribute('width', w as string);
    use.setAttribute('height', h as string);
    svg.appendChild(use);
  }
  el.appendChild(svg);
  return el;
}

/** The art's own box (ears to chin, cheeks to cheeks) inside MOUSE_BOX: the sprite is sized to it (board.css). */
export const MOUSE_BOX_TIGHT = '3 7 94 86';

/**
 * Plays the visits of `cells` (event order). Marks each cell .fx-pend at once; returns a handle whose
 * finish() ends the run. `reduced`: no sprite, the X's fade in together (WAAPI; the universal reduced
 * CSS rule shortens CSS animations to 1 ms).
 */
export function playMouseRun(cells: readonly CellIndex[], deps: MouseRunDeps, reduced: boolean, c: GameConfig = cfg): MouseRun {
  const { board, timers } = deps;
  const now = deps.now ?? ((): number => performance.now());
  const list = cells.filter((i, k) => cells.indexOf(i) === k && deps.cellElement(i));
  const doc = board.ownerDocument;
  mountLazyArt(doc);
  let sprite: HTMLElement | null = null;
  let done = false;

  const dropSprite = (): void => {
    sprite?.remove();
    sprite = null;
  };
  const land = (i: CellIndex, pop: boolean): void => {
    const el = deps.cellElement(i);
    if (!el || !el.classList.contains('fx-pend')) return;
    el.classList.remove('fx-pend');
    if (pop) deps.flash(el, 'fx-pop', c.fx.markPopMs + 60);
  };
  const finish = (): void => {
    if (done) return;
    done = true;
    dropSprite();
    for (const i of list) land(i, false);
    board.removeAttribute('aria-busy');
  };

  if (!list.length) return { finish, cells: list };

  if (reduced) {
    for (const i of list) {
      const xg = deps.cellElement(i)?.querySelector('.cell__xg');
      if (xg && typeof (xg as Element).animate === 'function') {
        try {
          (xg as Element).animate([{ opacity: 0 }, { opacity: 1 }], { duration: c.fx.reducedMotionFadeMs, easing: 'linear' });
        } catch {
          // shows at once
        }
      }
    }
    return { finish() {}, cells: list };
  }

  for (const i of list) deps.cellElement(i)?.classList.add('fx-pend');
  board.setAttribute('aria-busy', 'true');
  // one source of truth with the session's lock and sounds (game/mouse.ts, CONTRACTS-2d1 §2)
  const visit = mouseVisitMs(c);
  const dwell = mouseLandMs(0, c);
  const total = mouseRunMs(list.length, false, c);
  const t0 = deps.startedAt ?? now();
  // The run's events in time order: arrive k, land k (the X pops, the mouse leaves), the visit's end.
  type Ev = { readonly t: number; readonly run: (late: boolean) => void };
  const events: Ev[] = [];
  list.forEach((cell, k) => {
    const start = k * visit;
    events.push({
      t: start,
      run: (late) => {
        dropSprite();
        if (late) return; // already past this visit's landing: the catch-up lands it next
        sprite = buildSprite(doc, cell, deps.n, MOUSE_FACES[k % MOUSE_FACES.length] as MouseFace);
        sprite.classList.add('board__mouse--in');
        board.appendChild(sprite);
        const el = deps.cellElement(cell);
        if (el) deps.flash(el, 'fx-press', 110);
      },
    });
    events.push({
      t: start + dwell,
      run: () => {
        land(cell, true);
        if (sprite && sprite.dataset.cell === String(cell)) {
          sprite.classList.remove('board__mouse--in');
          sprite.classList.add('board__mouse--out');
        }
      },
    });
    events.push({ t: start + visit, run: () => (sprite?.dataset.cell === String(cell) ? dropSprite() : undefined) });
  });
  events.push({ t: total, run: finish });
  events.sort((a, b) => a.t - b.t);

  let next = 0;
  const step = (): void => {
    if (done) return;
    const elapsed = now() - t0;
    while (next < events.length && (events[next] as Ev).t <= elapsed) {
      const ev = events[next] as Ev;
      next++;
      // an arrival whose landing is also due is skipped (no sprite flash on a late timer)
      ev.run(elapsed >= ev.t + dwell);
      if (done) return;
    }
    const due = events[next];
    if (due) timers.later(Math.max(0, due.t - elapsed), step);
  };
  step();
  return { finish, cells: list };
}
