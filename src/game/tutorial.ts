// Owner: C (Phase 2b; was game)
// The tutorial board, fixed colours and the six-step script (02 §11.5, 04 §4.2 "Tutorial input filter").
// Phase 2d (G1, docs/phase2d/look-spec.md §1.9, §1.12): the fixed colours are four of the core
// (measured) colours; the mouse helper is never offered and its MOUSE action is ignored.
import type { CellIndex, LevelRecord, Puzzle } from '../engine/types';
import { CellState, type Action, type GameState } from './types';

export const TUTORIAL_ID = 'T1' as const;
/** Record for Level 1 (02 §11.5); pack-000 holds the same record with i = 1. */
export const TUTORIAL_RECORD: LevelRecord = Object.freeze({ i: 1, n: 4, r: 'ABCCAACCADDCDDDD', s: '1302', g: 1, e: 8, h: 0, gv: '', tut: 1 });
/**
 * Palette indices for regions A, B, C, D: Lime, Violet, Mustard, Coral (02 §11.5; phase 2d §1.9: all
 * four in PALETTE_CORE, the colours measured on the user's recording; step 1 names index 7, Violet).
 */
export const TUTORIAL_COLORS: readonly number[] = Object.freeze([3, 7, 2, 0]);
export const TUTORIAL_STEP_COUNT = 6;

export type TutorialStepIndex = 1 | 2 | 3 | 4 | 5 | 6;
/** Animated hand shown by the coach (O8). */
export type CoachHand = 'none' | 'tap' | 'double_tap' | 'swipe';
export type CoachTarget = 'cells' | 'bulb' | 'none';

export interface TutorialStepDef {
  readonly index: TutorialStepIndex;
  /** Cells the coach outlines (0-based cell indices). */
  readonly focusCells: readonly CellIndex[];
  readonly target: CoachTarget;
  readonly hand: CoachHand;
  /** Step 2 advances on the coach card's "Got it" button. */
  readonly gotIt: boolean;
  /** Palette index named in the coach text ({color}), e.g. Violet in step 1. */
  readonly colorParam: number | null;
}

/** Output of the input filter: the action to reduce, a pulse-only rejection, or null (ignored). */
export type TutorialFilterResult = Action | { type: 'PULSE_ONLY'; cell: CellIndex } | null;

// ─────────────────────────────── board ───────────────────────────────

const N = 4;
/** 0-based cell index of 1-based (row, col), as written in 02 §11.5. */
const at = (row: number, col: number): CellIndex => (row - 1) * N + (col - 1);

/** Targets of the script (02 §11.5 table). */
export const TUTORIAL_CELLS = Object.freeze({
  violet: at(1, 2), // step 1 (the Violet region, TUTORIAL_COLORS[1])
  swipe: Object.freeze([at(2, 1), at(2, 2), at(2, 3)]), // step 3
  row2Cat: at(2, 4), // step 4
  hintCat: at(3, 1), // step 5 (placed by the hint's Apply)
  lastCat: at(4, 3), // step 6
});

let cachedPuzzle: Puzzle | null = null;

/**
 * The decoded tutorial puzzle (id 'T1'). Decoded locally from TUTORIAL_RECORD (letters → labels,
 * base-36 columns) so the first-run board never depends on pack loading or the codec.
 */
export function tutorialPuzzle(): Puzzle {
  if (cachedPuzzle) return cachedPuzzle;
  const rec = TUTORIAL_RECORD;
  const regions = Uint8Array.from(rec.r, (ch) => ch.charCodeAt(0) - 65);
  const solution = Uint8Array.from(rec.s, (ch) => parseInt(ch, 36));
  cachedPuzzle = Object.freeze({
    id: TUTORIAL_ID,
    n: rec.n,
    k: 1,
    regions,
    solution,
    givens: Object.freeze([] as number[]),
    grade: rec.g,
    effort: rec.e,
    hard: false,
  });
  return cachedPuzzle;
}

// ─────────────────────────────── steps ───────────────────────────────

function rowCells(row: number): CellIndex[] {
  return [0, 1, 2, 3].map((c) => row * N + c);
}
function colCells(col: number): CellIndex[] {
  return [0, 1, 2, 3].map((r) => r * N + col);
}

const STEPS: readonly TutorialStepDef[] = Object.freeze([
  { index: 1, focusCells: [TUTORIAL_CELLS.violet], target: 'cells', hand: 'double_tap', gotIt: false, colorParam: 7 },
  {
    index: 2,
    focusCells: [...new Set([...rowCells(0), ...colCells(1)])].sort((a, b) => a - b),
    target: 'cells',
    hand: 'none',
    gotIt: true,
    colorParam: null,
  },
  { index: 3, focusCells: TUTORIAL_CELLS.swipe, target: 'cells', hand: 'swipe', gotIt: false, colorParam: null },
  { index: 4, focusCells: [TUTORIAL_CELLS.row2Cat], target: 'cells', hand: 'double_tap', gotIt: false, colorParam: null },
  { index: 5, focusCells: [], target: 'bulb', hand: 'tap', gotIt: false, colorParam: null },
  { index: 6, focusCells: [TUTORIAL_CELLS.lastCat], target: 'cells', hand: 'double_tap', gotIt: false, colorParam: null },
] satisfies TutorialStepDef[]);

export function tutorialStep(index: TutorialStepIndex): TutorialStepDef {
  const def = STEPS[index - 1];
  if (!def) throw new Error(`tutorialStep: no step ${String(index)}`);
  return def;
}

// ─────────────────────────────── input filter ───────────────────────────────

const PULSE = (cell: CellIndex): TutorialFilterResult => ({ type: 'PULSE_ONLY', cell });

function validCell(cell: unknown): cell is CellIndex {
  return typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < N * N;
}

/** A board action aimed at one target cell: TAP / DOUBLE_TAP there pass, anything else pulses. */
function singleTarget(target: CellIndex, action: Action): TutorialFilterResult {
  switch (action.type) {
    case 'TAP':
    case 'DOUBLE_TAP':
      if (!validCell(action.cell)) return null;
      return action.cell === target ? action : PULSE(action.cell);
    case 'PAINT':
      return pulseFirst(action.cells);
    default:
      return null;
  }
}

function pulseFirst(cells: readonly CellIndex[]): TutorialFilterResult {
  const first = cells.find(validCell);
  return first === undefined ? null : PULSE(first);
}

/**
 * Runs BEFORE reduce() while the mode is tutorial (02 §11.5 "Accepted input"). Board actions outside
 * the step's accepted input only pulse (no state change, no heart lost). Non-board actions: START,
 * TICK and KITTY_DONE always pass; the hint actions pass only in step 5 (HINT_OPEN forced uncharged,
 * 02 §9.3; HINT_CLOSE ignored: "then Apply only"); KITTY, REVIVE, RETRY and MOUSE (phase 2d §1.12:
 * the tutorial never offers the mouse) are ignored.
 */
export function filterTutorialAction(step: TutorialStepIndex, state: GameState, action: Action): TutorialFilterResult {
  switch (action.type) {
    case 'START':
    case 'TICK':
    case 'KITTY_DONE':
      return action;
    case 'HINT_OPEN':
      return step === 5 ? { ...action, charged: false } : null;
    case 'HINT_APPLY':
      return step === 5 ? action : null;
    case 'HINT_CLOSE':
    case 'KITTY':
    case 'REVIVE':
    case 'RETRY':
    case 'MOUSE':
      return null;
    default:
      break;
  }
  switch (step) {
    case 1:
      return singleTarget(TUTORIAL_CELLS.violet, action);
    case 3:
      return filterSwipeStep(state, action);
    case 4:
      return singleTarget(TUTORIAL_CELLS.row2Cat, action);
    case 6:
      return singleTarget(TUTORIAL_CELLS.lastCat, action);
    default: // steps 2 and 5: the board is locked
      return action.type === 'PAINT' ? pulseFirst(action.cells) : validCell(action.cell) ? PULSE(action.cell) : null;
  }
}

/**
 * Step 3: a PAINT is narrowed to the three target cells and always runs in mark mode (a swipe that
 * starts on the step-2 X at (2,2) is recognised as an erase drag, but the step only ever adds X's).
 * A TAP passes only on a target that is still Empty; everything else pulses.
 */
function filterSwipeStep(state: GameState, action: Action): TutorialFilterResult {
  const targets = TUTORIAL_CELLS.swipe;
  if (action.type === 'PAINT') {
    const cells = action.cells.filter((c, i, all) => targets.includes(c) && all.indexOf(c) === i);
    if (cells.length === 0) return pulseFirst(action.cells);
    return { type: 'PAINT', cells, mode: 'mark', t: action.t };
  }
  if (action.type !== 'TAP' && action.type !== 'DOUBLE_TAP') return null;
  if (!validCell(action.cell)) return null;
  if (action.type === 'TAP' && targets.includes(action.cell) && state.cells[action.cell] === CellState.Empty) return action;
  return PULSE(action.cell);
}

// ─────────────────────────────── advance ───────────────────────────────

/** Still-Empty cells attacked by a cat at `cell`: same row, column or region, or king-adjacent. */
export function tutorialShadowMarks(state: GameState, cell: CellIndex): CellIndex[] {
  const { n, regions } = state.puzzle;
  const r0 = Math.floor(cell / n);
  const c0 = cell % n;
  const out: CellIndex[] = [];
  for (let i = 0; i < n * n; i++) {
    if (i === cell || state.cells[i] !== CellState.Empty) continue;
    const r = Math.floor(i / n);
    const c = i % n;
    const king = Math.abs(r - r0) <= 1 && Math.abs(c - c0) <= 1;
    if (r === r0 || c === c0 || regions[i] === regions[cell] || king) out.push(i);
  }
  return out;
}

const isCat = (state: GameState, cell: CellIndex): boolean => state.cells[cell] === CellState.Cat;

/**
 * Called after every reduce, and with 'got_it' for the coach button. Returns the next step and the
 * scripted marks to dispatch as a mark-mode PAINT (bypassing the filter), or null to stay.
 */
export function advance(
  step: TutorialStepIndex,
  state: GameState,
  signal?: 'got_it',
): { next: TutorialStepIndex | 'done'; scriptedMarks: CellIndex[] } | null {
  if (signal === 'got_it') {
    if (step !== 2) return null;
    const lines = [...rowCells(0), ...colCells(1)];
    const marks = lines.filter((c, i) => lines.indexOf(c) === i && state.cells[c] === CellState.Empty);
    return { next: 3, scriptedMarks: marks.sort((a, b) => a - b) };
  }
  switch (step) {
    case 1:
      return isCat(state, TUTORIAL_CELLS.violet) ? { next: 2, scriptedMarks: [] } : null;
    case 2:
      return null; // waits for 'got_it'
    case 3:
      return TUTORIAL_CELLS.swipe.every((c) => state.cells[c] === CellState.Mark) ? { next: 4, scriptedMarks: [] } : null;
    case 4:
      return isCat(state, TUTORIAL_CELLS.row2Cat)
        ? { next: 5, scriptedMarks: tutorialShadowMarks(state, TUTORIAL_CELLS.row2Cat) }
        : null;
    case 5:
      return state.status === 'playing' && isCat(state, TUTORIAL_CELLS.hintCat)
        ? { next: 6, scriptedMarks: tutorialShadowMarks(state, TUTORIAL_CELLS.hintCat) }
        : null;
    case 6:
      return state.status === 'won' ? { next: 'done', scriptedMarks: [] } : null;
    default:
      return null;
  }
}

/** Whether the bulb / paw / mouse may be used at this step (bulb only in step 5; paw and mouse never). */
export function tutorialAllowsTool(step: TutorialStepIndex, tool: 'bulb' | 'paw' | 'mouse'): boolean {
  return tool === 'bulb' && step === 5;
}
