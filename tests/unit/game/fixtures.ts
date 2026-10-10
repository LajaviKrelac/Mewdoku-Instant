// Owner: C (Phase 2b; was game). Hand-made puzzles and helpers for the game rule tests (no generator, no codec).
import type { HintStep, LevelRecord, Puzzle, PuzzleId } from '../../../src/engine/types';
import { newGame } from '../../../src/game/factory';
import { reduce } from '../../../src/game/reducer';
import type { Action, GameEvent, GameState, ModeId } from '../../../src/game/types';

/** Decodes letters/base-36 like the codec, so these tests never depend on the engine. */
export function makePuzzle(id: PuzzleId, r: string, s: string, givens: number[] = []): Puzzle {
  const n = s.length;
  if (r.length !== n * n) throw new Error('bad fixture');
  return {
    id,
    n,
    k: 1,
    regions: Uint8Array.from(r, (ch) => ch.charCodeAt(0) - 65),
    solution: Uint8Array.from(s, (ch) => parseInt(ch, 36)),
    givens,
    grade: 1,
    effort: 1,
    hard: false,
  };
}

/**
 * 5×5, verified by hand (one solution cell per region, every region 4-connected, canonical labels):
 *
 *   row 0: A A B B C      solution columns per row: 0 2 4 1 3
 *   row 1: A B B C C      cats at (0,0)A (1,2)B (2,4)C (3,1)D (4,3)E
 *   row 2: A D B C C
 *   row 3: D D E E C
 *   row 4: D E E E E
 */
export const R5 = 'AABBCABBCCADBCCDDEECDEEEE';
export const S5 = '02413';
export const P5 = makePuzzle('L2', R5, S5);
/** Same board with row 2's cat (cell 14) as a Given. */
export const P5G = makePuzzle('L3', R5, S5, [2]);

/** Cell index of 0-based (row, col) on an n-board. */
export const cell = (r: number, c: number, n = 5): number => r * n + c;
/** Solution cells of P5 in row order. */
export const SOL5 = [cell(0, 0), cell(1, 2), cell(2, 4), cell(3, 1), cell(4, 3)];
/** A few non-solution cells of P5. */
export const WRONG5 = [cell(0, 1), cell(0, 2), cell(1, 0), cell(4, 4)];

/** A new game already past READY (START applied). */
export function playing(puzzle: Puzzle = P5, mode: ModeId = 'level'): GameState {
  return reduce(newGame(puzzle, mode), { type: 'START' }).state;
}

/** Applies actions in order; returns the final state and every event. */
export function run(s: GameState, actions: Action[]): { state: GameState; events: GameEvent[] } {
  let state = s;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = reduce(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

export const tap = (c: number, t = 0): Action => ({ type: 'TAP', cell: c, t });
export const dbl = (c: number, t = 0): Action => ({ type: 'DOUBLE_TAP', cell: c, t });
export const paintA = (cells: number[], mode: 'mark' | 'erase', t = 0): Action => ({ type: 'PAINT', cells, mode, t });

export function step(partial: Partial<HintStep> & Pick<HintStep, 'kind'>): HintStep {
  return { level: 1, focusUnits: [], focusCells: [], effectCells: [], ...partial };
}

/** P5 won (every solution cell double-tapped). */
export function wonState(puzzle: Puzzle = P5, mode: ModeId = 'level'): GameState {
  return run(playing(puzzle, mode), SOL5.map((c, i) => dbl(c, i))).state;
}

/** P5 lost: three wrong attempts at WRONG5[0..2] (hearts 0, mistakes 3). */
export function lostState(puzzle: Puzzle = P5, mode: ModeId = 'level'): GameState {
  return run(playing(puzzle, mode), WRONG5.slice(0, 3).map((c, i) => dbl(c, i))).state;
}

/** A valid on-disk record for the P5 board (passes engine/codec checkRecord). */
export function rec5(i?: number): LevelRecord {
  const base = { n: 5, r: R5, s: S5, g: 1 as const, e: 7, h: 0 as const };
  return i === undefined ? base : { i, ...base };
}

/** Event types only, for compact assertions. */
export const types = (events: readonly GameEvent[]): string[] => events.map((e) => e.type);

/**
 * Phase 2d.1 (helpers-spec §7.6): OUR OWN 9×9 (random region growth, unique solution checked with
 * engine/solver countSolutions), built to share the properties the helper recordings showed (a
 * one-tile region in the top-right corner whose cat is forced at once); never the original's layout.
 *
 *   row 0: A A A A A A B B C      solution columns per row: 8 6 4 7 5 1 3 0 2
 *   row 1: A A A A A A B B B      C = the one-tile region at (0,8)
 *   row 2: D D A E A A F F F
 *   row 3: D D E E A G G F F
 *   row 4: D D E E A G G G G
 *   row 5: D D E E E E G G G
 *   row 6: H H E E E E G G G
 *   row 7: I H H E E E E G G
 *   row 8: I H H E E E E G G
 */
export const R9C = 'AAAAAABBCAAAAAABBBDDAEAAFFFDDEEAGGFFDDEEAGGGGDDEEEEGGGHHEEEEGGGIHHEEEEGGIHHEEEEGG';
export const S9C = '864751302';
export const P9C = makePuzzle('L90', R9C, S9C);
/** Solution cells of P9C in row order ((0,8) first). */
export const SOL9C = [...S9C].map((ch, r) => r * 9 + parseInt(ch, 36));
