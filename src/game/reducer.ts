// Owner: game
// Pure reducer (02 §6.2, §7.3, §8; status × action matrix in 04 §4.2).
// An action not allowed in the current status returns { state: s, events: [] }.
import { newGame } from './factory';
import {
  CellState,
  type Action,
  type ActionType,
  type CatSource,
  type CellIndex,
  type GameEvent,
  type GameState,
  type PaintMode,
  type ReduceResult,
  type Status,
} from './types';

/** 04 §4.2 status × action matrix: the statuses in which each action is allowed. */
export const ALLOWED_STATUSES: Readonly<Record<ActionType, readonly Status[]>> = Object.freeze({
  START: ['ready'],
  TAP: ['playing'],
  DOUBLE_TAP: ['playing'],
  PAINT: ['playing'],
  HINT_OPEN: ['playing'],
  HINT_APPLY: ['hint'],
  HINT_CLOSE: ['hint'],
  KITTY: ['playing'],
  KITTY_DONE: ['kitty'],
  REVIVE: ['lost'],
  RETRY: ['lost'],
  TICK: ['playing', 'hint', 'kitty'],
});

/** Whether `type` is allowed in `status` (REVIVE additionally needs a revive left; see canRevive). */
export function isActionAllowed(status: Status, type: ActionType): boolean {
  return ALLOWED_STATUSES[type].includes(status);
}

/** REVIVE precondition: status lost and revivesUsed < rules.maxRevives. */
export function canRevive(s: GameState): boolean {
  return s.status === 'lost' && s.revivesUsed < s.rules.maxRevives;
}

/** (state, action) → { state, events }. Never mutates `s`; `cells` is copy-on-write. */
export function reduce(s: GameState, a: Action): ReduceResult {
  if (!isActionAllowed(s.status, a.type)) return none(s);
  switch (a.type) {
    case 'START':
      return { state: { ...s, status: 'playing' }, events: [] };
    case 'TAP':
      return tap(s, a.cell, a.t);
    case 'DOUBLE_TAP':
      return doubleTap(s, a.cell, a.t);
    case 'PAINT':
      return paint(s, a.cells, a.mode, a.t);
    case 'HINT_OPEN':
      return {
        state: { ...s, status: 'hint', openHint: a.step, hintsUsed: s.hintsUsed + (a.charged ? 1 : 0) },
        events: [],
      };
    case 'HINT_APPLY':
      return applyHint(s, a.t);
    case 'HINT_CLOSE':
      return { state: { ...s, status: 'playing', openHint: null }, events: [] };
    case 'KITTY':
      return kitty(s, a.cell, a.t);
    case 'KITTY_DONE':
      return { state: { ...s, status: 'playing' }, events: [] };
    case 'REVIVE':
      return revive(s, a.t);
    case 'RETRY':
      return { state: newGame(s.puzzle, s.mode, s.rules), events: [] };
    case 'TICK':
      return tick(s, a.dtMs);
  }
}

// ─────────────────────────────── helpers ───────────────────────────────

function none(s: GameState): ReduceResult {
  return { state: s, events: [] };
}

function pulse(s: GameState, cell: CellIndex): ReduceResult {
  return { state: s, events: [{ type: 'PULSE', cell }] };
}

function validCell(s: GameState, cell: unknown): cell is CellIndex {
  return typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < s.cells.length;
}

function isSolutionCell(s: GameState, cell: CellIndex): boolean {
  const n = s.puzzle.n;
  return s.puzzle.solution[Math.floor(cell / n)] === cell % n;
}

/** Sets every cell in `list` to Mark or Empty, logging one move and one MARKED/UNMARKED event. */
function withMarks(s: GameState, list: CellIndex[], to: 0 | 1, t: number, events: GameEvent[]): GameState {
  const cells = s.cells.slice();
  for (const c of list) cells[c] = to;
  const marking = to === CellState.Mark;
  events.push({ type: marking ? 'MARKED' : 'UNMARKED', cells: list });
  return { ...s, cells, moves: [...s.moves, { t, kind: marking ? 'mark' : 'unmark', cells: list }] };
}

/** Places a correct cat (02 §8 step 1): CAT_PLACED, REGION_DONE, and WON when the board is full. */
function withCat(s: GameState, cell: CellIndex, source: CatSource, t: number, events: GameEvent[]): GameState {
  const cells = s.cells.slice();
  cells[cell] = CellState.Cat;
  const catsPlaced = s.catsPlaced + 1;
  events.push({ type: 'CAT_PLACED', cell, source });
  const region = s.puzzle.regions[cell] ?? 0;
  const bit = 1 << region;
  let regionsDone = s.regionsDone;
  if ((regionsDone & bit) === 0) {
    regionsDone |= bit;
    events.push({ type: 'REGION_DONE', region });
  }
  const won = catsPlaced >= s.puzzle.n;
  if (won) events.push({ type: 'WON' });
  return {
    ...s,
    cells,
    catsPlaced,
    regionsDone,
    status: won ? 'won' : s.status,
    moves: [...s.moves, { t, kind: 'cat', cell, source }],
  };
}

// ─────────────────────────────── board actions (02 §6.2) ───────────────────────────────

function tap(s: GameState, cell: CellIndex, t: number): ReduceResult {
  if (!validCell(s, cell)) return none(s);
  const st = s.cells[cell];
  const events: GameEvent[] = [];
  if (st === CellState.Empty) return { state: withMarks(s, [cell], CellState.Mark, t, events), events };
  if (st === CellState.Mark) return { state: withMarks(s, [cell], CellState.Empty, t, events), events };
  return pulse(s, cell); // Cat, Wrong, Given
}

function doubleTap(s: GameState, cell: CellIndex, t: number): ReduceResult {
  if (!validCell(s, cell)) return none(s);
  const st = s.cells[cell];
  if (st === CellState.Cat) return removeCat(s, cell, t);
  if (st !== CellState.Empty && st !== CellState.Mark) return pulse(s, cell); // Wrong, Given
  const events: GameEvent[] = [];
  if (isSolutionCell(s, cell)) return { state: withCat(s, cell, 'player', t, events), events };
  return wrongAttempt(s, cell, t);
}

/** 02 §6.2: a double-tap on a placed cat removes it, with no penalty. */
function removeCat(s: GameState, cell: CellIndex, t: number): ReduceResult {
  const cells = s.cells.slice();
  cells[cell] = CellState.Empty;
  const region = s.puzzle.regions[cell] ?? 0;
  return {
    state: {
      ...s,
      cells,
      catsPlaced: s.catsPlaced - 1,
      regionsDone: s.regionsDone & ~(1 << region),
      moves: [...s.moves, { t, kind: 'uncat', cell }],
    },
    events: [{ type: 'CAT_REMOVED', cell }],
  };
}

/** 02 §8 step 2. With rules.mistakePenalty = false (tutorial) a wrong attempt only pulses. */
function wrongAttempt(s: GameState, cell: CellIndex, t: number): ReduceResult {
  if (!s.rules.mistakePenalty) return pulse(s, cell);
  const cells = s.cells.slice();
  cells[cell] = CellState.Wrong;
  const hearts = Math.max(0, s.hearts - 1);
  const lost = hearts === 0;
  const events: GameEvent[] = [{ type: 'MISTAKE', cell, heartsLeft: hearts }];
  if (lost) events.push({ type: 'LOST' });
  return {
    state: {
      ...s,
      cells,
      hearts,
      mistakes: s.mistakes + 1,
      status: lost ? 'lost' : s.status,
      moves: [...s.moves, { t, kind: 'wrong', cell }],
    },
    events,
  };
}

/** Drag paint: mark mode turns Empty → Mark, erase mode Mark → Empty; every other cell is skipped. */
function paint(s: GameState, list: readonly CellIndex[], mode: PaintMode, t: number): ReduceResult {
  if (mode !== 'mark' && mode !== 'erase') return none(s);
  const from = mode === 'mark' ? CellState.Empty : CellState.Mark;
  const changed: CellIndex[] = [];
  for (const c of list) {
    if (validCell(s, c) && s.cells[c] === from && !changed.includes(c)) changed.push(c);
  }
  if (changed.length === 0) return none(s);
  const events: GameEvent[] = [];
  const to = mode === 'mark' ? CellState.Mark : CellState.Empty;
  return { state: withMarks(s, changed, to, t, events), events };
}

// ─────────────────────────────── helpers (02 §9) ───────────────────────────────

/**
 * 02 §9.1 step 4. Eliminations: only Empty effect cells become Marks; mistaken_mark: the Mark is
 * cleared; placeCell becomes a Cat. Defensive: never marks a solution cell, never places a cat off
 * the solution (the engine guarantees both; this keeps a buggy step from misleading the player).
 */
function applyHint(s: GameState, t: number): ReduceResult {
  const step = s.openHint;
  const events: GameEvent[] = [];
  let next: GameState = { ...s, status: 'playing', openHint: null };
  if (!step) return { state: next, events };
  events.push({ type: 'HINT_APPLIED', step });
  if (step.kind === 'mistaken_mark') {
    const marks = uniqueCells(s, step.effectCells, (c) => s.cells[c] === CellState.Mark);
    if (marks.length > 0) next = withMarks(next, marks, CellState.Empty, t, events);
    return { state: next, events };
  }
  const empties = uniqueCells(s, step.effectCells, (c) => s.cells[c] === CellState.Empty && !isSolutionCell(s, c));
  if (empties.length > 0) next = withMarks(next, empties, CellState.Mark, t, events);
  const pc = step.placeCell;
  if (pc !== undefined && validCell(next, pc) && isSolutionCell(next, pc)) {
    const st = next.cells[pc];
    if (st === CellState.Empty || st === CellState.Mark) next = withCat(next, pc, 'hint', t, events);
  }
  return { state: next, events };
}

function uniqueCells(s: GameState, list: readonly CellIndex[], keep: (c: CellIndex) => boolean): CellIndex[] {
  const out: CellIndex[] = [];
  for (const c of list) if (validCell(s, c) && !out.includes(c) && keep(c)) out.push(c);
  return out;
}

/** 02 §9.2: the kitty places a correct cat (a Mark there is replaced); no heart is at risk. */
function kitty(s: GameState, cell: CellIndex, t: number): ReduceResult {
  if (!validCell(s, cell) || !isSolutionCell(s, cell)) return none(s);
  const st = s.cells[cell];
  if (st !== CellState.Empty && st !== CellState.Mark) return none(s);
  const events: GameEvent[] = [];
  const base: GameState = { ...s, status: 'kitty', kittiesUsed: s.kittiesUsed + 1 };
  return { state: withCat(base, cell, 'kitty', t, events), events };
}

/** 02 §8 / §10.2: hearts = heartsOnRevive, board kept (Wrong cells, marks, cats, timer). */
function revive(s: GameState, t: number): ReduceResult {
  if (!canRevive(s)) return none(s);
  return {
    state: {
      ...s,
      hearts: s.rules.heartsOnRevive,
      revivesUsed: s.revivesUsed + 1,
      status: 'playing',
      moves: [...s.moves, { t, kind: 'revive' }],
    },
    events: [{ type: 'REVIVED' }],
  };
}

function tick(s: GameState, dtMs: number): ReduceResult {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return none(s);
  return { state: { ...s, elapsedMs: s.elapsedMs + dtMs }, events: [] };
}
