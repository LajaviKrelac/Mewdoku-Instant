// Owner: ui-board
// Hint (O1) and coach (O8) highlight attributes on the board (02 §5, §9.1): focus cells get data-f,
// effect cells a ghost X (or a ghost clear for a mistaken mark), the forced cat a ghost cat.
import { ensureCat, setCatMood, type CellRefs } from './board-cells';
import type { BoardHighlight } from './board-types';

export function applyHighlight(el: HTMLElement, cells: readonly CellRefs[], h: BoardHighlight | null): void {
  for (const refs of cells) {
    refs.el.removeAttribute('data-f');
    refs.el.removeAttribute('data-ghost');
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
  for (const i of step.focusCells) cells[i]?.el.setAttribute('data-f', '');
  const ghost = step.kind === 'mistaken_mark' ? 'clear' : 'x';
  for (const i of step.effectCells) cells[i]?.el.setAttribute('data-ghost', ghost);
  if (step.placeCell !== undefined) {
    const refs = cells[step.placeCell];
    if (refs) {
      ensureCat(refs, 'happy');
      setCatMood(refs, 'happy');
      refs.el.setAttribute('data-ghost', 'cat');
    }
  }
}
