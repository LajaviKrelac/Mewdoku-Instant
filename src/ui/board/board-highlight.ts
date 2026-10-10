// Owner: B (Phase 2b; was ui-board); G2 (Phase 2d.1: the ghost X's outline, order and stagger, helpers-spec §3.3)
// Hint (O1) and coach (O8) highlight attributes on the board (02 §5, §9.1): focus cells get data-f,
// effect cells a ghost X (or a ghost clear for a mistaken mark), the forced cat a ghost cat.
// Phase 2d.1 (helpers-spec §3.3, D-2d1-7): the hint overlay dims the screen itself (the board no longer
// dims or rings anything for a hint); each Empty effect cell shows the X's outline (ensureGhost),
// popping in at fx.hint.ghostFirstMs + i × ghostStaggerMs in ghostOrder (inline --gd); the ghost cat
// appears at ghostFirstMs with the same pop. The coach highlight is unchanged.
import { cfg } from '../../app/config';
import { CellState } from '../../engine/types';
import { ensureCat, ensureGhost, setCatMood, type CellRefs } from './board-cells';
import { ghostOrder } from './board-fx';
import type { BoardHighlight } from './board-types';

export function applyHighlight(el: HTMLElement, cells: readonly CellRefs[], h: BoardHighlight | null, state?: Readonly<Uint8Array>, n?: number): void {
  for (const refs of cells) {
    refs.el.removeAttribute('data-f');
    refs.el.removeAttribute('data-ghost');
    if (refs.el.style.getPropertyValue('--gd')) refs.el.style.removeProperty('--gd');
  }
  if (!h) {
    el.removeAttribute('data-hl');
    return;
  }
  el.dataset.hl = h.kind;
  if (h.kind === 'coach') {
    for (const i of h.cells) cells[i]?.el.setAttribute('data-f', '');
    return;
  }
  const step = h.step;
  const H = cfg.fx.hint;
  for (const i of step.focusCells) cells[i]?.el.setAttribute('data-f', '');
  if (step.kind === 'mistaken_mark') {
    for (const i of step.effectCells) cells[i]?.el.setAttribute('data-ghost', 'clear');
  } else {
    const board = state ?? Uint8Array.from(cells, (c) => (c.el.dataset.s === 'e' ? CellState.Empty : CellState.Mark));
    const order = ghostOrder(step, board, n ?? Math.round(Math.sqrt(cells.length)));
    order.forEach((i, k) => {
      const refs = cells[i];
      if (!refs) return;
      ensureGhost(refs);
      refs.el.setAttribute('data-ghost', 'x');
      refs.el.style.setProperty('--gd', `${H.ghostFirstMs + k * H.ghostStaggerMs}ms`);
    });
  }
  if (step.placeCell !== undefined) {
    const refs = cells[step.placeCell];
    if (refs) {
      ensureCat(refs, 'happy');
      setCatMood(refs, 'happy');
      refs.el.setAttribute('data-ghost', 'cat');
      refs.el.style.setProperty('--gd', `${H.ghostFirstMs}ms`);
    }
  }
}
