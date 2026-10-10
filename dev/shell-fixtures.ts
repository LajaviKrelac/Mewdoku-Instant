// Owner: B (Phase 2b; was ui-shell). Sample data for the dev harness: a mid-game level board, the tutorial board at
// each coach step, and the view models the app would build (02 §5 wireframes).
import packJson from '../src/data/levels/pack-000.json';
import { recordToPuzzle } from '../src/engine/codec';
import { getHintStep } from '../src/engine/hint';
import type { HintStep, LevelPack, Puzzle } from '../src/engine/types';
import { pointsRuleFor, runTotal } from '../src/game/scoring';
import { TUTORIAL_COLORS, tutorialPuzzle, tutorialStep, type TutorialStepIndex } from '../src/game/tutorial';
import { CellState } from '../src/game/types';
import { regionColorsFor } from '../src/ui/art/palette';
import type { BoardModel } from '../src/ui/board/board-view';
import type { RuleChip } from '../src/ui/hud/rule-chips';
import type { GameView } from '../src/ui/screens/game-screen';
import type { HomeView } from '../src/ui/screens/home-screen';

const pack = packJson as unknown as LevelPack;

export function levelPuzzle(level: number): Puzzle {
  const rec = pack.levels.find((r) => r.i === level) ?? pack.levels[level - 1];
  if (!rec) throw new Error(`no level ${level} in pack-000`);
  return recordToPuzzle(rec, `L${level}`);
}

const solCell = (p: Puzzle, row: number): number => row * p.n + (p.solution[row] ?? 0);

function kingAndLines(p: Puzzle, cell: number): number[] {
  const n = p.n;
  const r = Math.floor(cell / n);
  const c = cell % n;
  const out: number[] = [];
  for (let i = 0; i < n * n; i++) {
    const ri = Math.floor(i / n);
    const ci = i % n;
    const touching = Math.abs(ri - r) <= 1 && Math.abs(ci - c) <= 1;
    if (i !== cell && (ri === r || ci === c || touching || p.regions[i] === p.regions[cell])) out.push(i);
  }
  return out;
}

export interface Board {
  readonly puzzle: Puzzle;
  readonly colors: Uint8Array;
  readonly cells: Uint8Array;
}

/** Mid-game: cats on rows 0 and 3 with their shadows crossed out, `wrongs` red Xs elsewhere. */
export function midGame(level: number, wrongs = 1, catRows: readonly number[] = [0, 3]): Board {
  const puzzle = levelPuzzle(level);
  const cells = new Uint8Array(puzzle.n * puzzle.n);
  for (const row of catRows) {
    const cat = solCell(puzzle, row);
    cells[cat] = CellState.Cat;
    for (const x of kingAndLines(puzzle, cat)) if (cells[x] === CellState.Empty) cells[x] = CellState.Mark;
  }
  let placed = 0;
  for (let row = puzzle.n - 1; row >= 0 && placed < wrongs; row--) {
    const c = ((puzzle.solution[row] ?? 0) + 2) % puzzle.n;
    const i = row * puzzle.n + c;
    if (cells[i] === CellState.Empty) {
      cells[i] = CellState.Wrong;
      placed++;
    }
  }
  return { puzzle, colors: regionColorsFor(puzzle, null), cells };
}

/** Every cat placed (the board behind O3). */
export function solved(level: number): Board {
  const b = midGame(level, 0, []);
  for (let row = 0; row < b.puzzle.n; row++) b.cells[solCell(b.puzzle, row)] = CellState.Cat;
  return b;
}

export function hintFor(b: Board): HintStep {
  return getHintStep(b.puzzle, b.cells);
}

function boardModel(b: Board, patterns = false): BoardModel {
  let done = 0;
  b.cells.forEach((s, i) => {
    if (s === CellState.Cat || s === CellState.Given) done |= 1 << (b.puzzle.regions[i] ?? 0);
  });
  return { puzzleId: b.puzzle.id, n: b.puzzle.n, regions: b.puzzle.regions, colors: b.colors, cells: b.cells, regionsDone: done, patterns };
}

export function gameView(b: Board, over: Partial<GameView> = {}): GameView {
  const cats = Array.from(b.cells).filter((s) => s === CellState.Cat).length;
  const wrongs = Array.from(b.cells).filter((s) => s === CellState.Wrong).length;
  // Phase 2c.1 §3.2.3, as a restore derives it: an unbroken run without a mistake, else k × first;
  // null (no counter) for the tutorial and unscored modes.
  const rule = pointsRuleFor(over.mode ?? 'level');
  const points = rule.first > 0 ? (wrongs === 0 ? runTotal(cats, rule) : cats * rule.first) : null;
  return {
    mode: 'level',
    level: Number(b.puzzle.id.slice(1)) || 1,
    dateKey: null,
    hard: b.puzzle.hard,
    showHome: true,
    hearts: Math.max(0, 3 - wrongs),
    maxHearts: 3,
    catsPlaced: cats,
    status: 'playing',
    hints: 5,
    kitties: 3,
    hintsFree: false,
    bulbEnabled: true,
    pawEnabled: true,
    inputLocked: false,
    board: boardModel(b),
    highlight: null,
    chipHighlight: null,
    fbSafeZone: false,
    reducedMotion: false,
    event: null,
    points,
    ...over,
  };
}

/** The tutorial board as the script leaves it at the start of `step` (02 §11.5). */
export function tutorialBoard(step: TutorialStepIndex): Board {
  const puzzle = tutorialPuzzle();
  const cells = new Uint8Array(16);
  const cat = (i: number): void => void (cells[i] = CellState.Cat);
  const mark = (list: readonly number[]): void => list.forEach((i) => cells[i] === CellState.Empty && (cells[i] = CellState.Mark));
  if (step >= 2) cat(1);
  if (step >= 3) mark([0, 2, 3, 5, 9, 13]);
  if (step >= 4) mark([4, 6]);
  if (step >= 5) {
    cat(7);
    mark([4, 5, 6, 3, 11, 15, 2, 10]);
  }
  if (step >= 6) {
    cat(8);
    mark([9, 10, 11, 0, 4, 12, 13]);
  }
  return { puzzle, colors: regionColorsFor(puzzle, TUTORIAL_COLORS), cells };
}

const STEP_CHIPS: Readonly<Record<TutorialStepIndex, RuleChip | null>> = { 1: 'colours', 2: 'lines', 3: 'space', 4: 'lines', 5: null, 6: null };

export function tutorialView(step: TutorialStepIndex): GameView {
  const b = tutorialBoard(step);
  const def = tutorialStep(step);
  return gameView(b, {
    mode: 'tutorial',
    level: 1,
    showHome: false,
    hearts: 3,
    hintsFree: true,
    bulbEnabled: step === 5,
    pawEnabled: false,
    inputLocked: step === 2,
    highlight: def.focusCells.length ? { kind: 'coach', cells: def.focusCells } : null,
    chipHighlight: STEP_CHIPS[step],
  });
}

export function homeView(over: Partial<HomeView> = {}): HomeView {
  return {
    level: 37,
    hard: false,
    continueLevel: false,
    daily: { state: 'not_played', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 20 },
    hints: 5,
    kitties: 3,
    showTrophy: false,
    fbSafeZone: false,
    extraCards: [],
    period: { kind: 'week', total: 42 },
    event: null,
    bannerReserved: false,
    ...over,
  };
}
