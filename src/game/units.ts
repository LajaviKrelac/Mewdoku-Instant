// Owner: G1 (Phase 2d.1)
// Unit completion (docs/phase2d/helpers-spec.md §4.1, D-2d1-6). One rule for rows, columns and
// colour regions: a unit is COMPLETE when it holds its cat (Cat or Given) and every other tile is
// crossed (Mark or Wrong). A unit completes in an action when it was not complete before the action
// and is after it; the reducer reports those as UNITS_DONE. No state is stored: unmarking a tile and
// crossing it again completes the unit again (§8 Q5). PURE.
import { CellState, type CellIndex, type DoneUnit, type GameState } from './types';

type Board = Pick<GameState, 'puzzle' | 'cells'>;

const KIND_ORDER: Readonly<Record<DoneUnit['kind'], number>> = { row: 0, col: 1, region: 2 };

/** The unit's cells in reading order. */
export function unitCells(puzzle: Board['puzzle'], kind: DoneUnit['kind'], index: number): CellIndex[] {
  const n = puzzle.n;
  const out: CellIndex[] = [];
  if (kind === 'row') {
    if (index >= 0 && index < n) for (let c = 0; c < n; c++) out.push(index * n + c);
  } else if (kind === 'col') {
    if (index >= 0 && index < n) for (let r = 0; r < n; r++) out.push(r * n + index);
  } else {
    for (let i = 0; i < n * n; i++) if (puzzle.regions[i] === index) out.push(i);
  }
  return out;
}

/** Whether the unit holds exactly one cat (Cat or Given) and every other tile is Mark or Wrong. */
export function isUnitComplete(state: Board, kind: DoneUnit['kind'], index: number): boolean {
  const cells = unitCells(state.puzzle, kind, index);
  if (cells.length === 0) return false;
  let cats = 0;
  for (const i of cells) {
    const v = state.cells[i];
    if (v === CellState.Cat || v === CellState.Given) cats++;
    else if (v !== CellState.Mark && v !== CellState.Wrong) return false;
  }
  return cats === 1;
}

/**
 * The units complete in `next` and not in `prev`, each once (rows ascending, then columns, then
 * regions), with its anchor: the unit's cell that comes LAST in `changed` (the reducer passes the
 * changed cells in reading order, or for the mouse in its visit order, so the anchor is the X that
 * lands last). Only units that contain a changed cell are checked: an untouched unit cannot change.
 */
export function completedUnits(prev: Board, next: Board, changed: readonly CellIndex[]): DoneUnit[] {
  const n = next.puzzle.n;
  /** "kind:index" → anchor (the last changed cell of the unit in `changed` order). */
  const anchors = new Map<string, { kind: DoneUnit['kind']; index: number; anchor: CellIndex }>();
  for (const cell of changed) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= n * n) continue;
    const units: [DoneUnit['kind'], number][] = [
      ['row', Math.floor(cell / n)],
      ['col', cell % n],
      ['region', next.puzzle.regions[cell] ?? -1],
    ];
    for (const [kind, index] of units) anchors.set(`${kind}:${index}`, { kind, index, anchor: cell });
  }
  const out: DoneUnit[] = [];
  for (const u of anchors.values()) {
    if (u.index < 0) continue;
    if (isUnitComplete(next, u.kind, u.index) && !isUnitComplete(prev, u.kind, u.index)) out.push(u);
  }
  out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.index - b.index);
  return out;
}

/** The cells whose state differs between two boards of the same puzzle, in reading order. */
export function changedCells(prev: Readonly<Uint8Array>, next: Readonly<Uint8Array>): CellIndex[] {
  const out: CellIndex[] = [];
  if (prev === next) return out;
  const len = Math.min(prev.length, next.length);
  for (let i = 0; i < len; i++) if (prev[i] !== next[i]) out.push(i);
  return out;
}
