// Owner: game. Tutorial board, colours, step definitions, input filter and advance (02 §11.5).
import { describe, expect, it } from 'vitest';
import pack000 from '../../../src/data/levels/pack-000.json';
import { checkRecord, recordToPuzzle } from '../../../src/engine/codec';
import { grade } from '../../../src/engine/grader';
import { countSolutions } from '../../../src/engine/solver';
import type { HintStep } from '../../../src/engine/types';
import { fixedColorsFor, getMode } from '../../../src/game/modes';
import { reduce } from '../../../src/game/reducer';
import {
  advance,
  filterTutorialAction,
  TUTORIAL_CELLS,
  TUTORIAL_COLORS,
  TUTORIAL_ID,
  TUTORIAL_RECORD,
  tutorialAllowsTool,
  tutorialPuzzle,
  tutorialShadowMarks,
  tutorialStep,
  type TutorialFilterResult,
  type TutorialStepIndex,
} from '../../../src/game/tutorial';
import type { Action } from '../../../src/game/types';
import { at, bulb, D, P, PULSE, reach, start, T } from './tutorial-driver';

// ─────────────────────────────── board, colours, steps ───────────────────────────────

describe('tutorial board (02 §11.5)', () => {
  it('the record is ours and matches the spec, and pack-000 level 1 is the same board', () => {
    expect(TUTORIAL_RECORD).toMatchObject({ i: 1, n: 4, r: 'ABCCAACCADDCDDDD', s: '1302', g: 1, h: 0, gv: '', tut: 1 });
    expect(checkRecord(TUTORIAL_RECORD)).toEqual({ ok: true });
    const first = (pack000 as { levels: Record<string, unknown>[] }).levels[0];
    expect(first).toMatchObject({ i: 1, n: 4, r: TUTORIAL_RECORD.r, s: TUTORIAL_RECORD.s, tut: 1 });
  });

  it('tutorialPuzzle() decodes like the codec, has id T1 and no givens, and is cached', () => {
    const p = tutorialPuzzle();
    expect(p.id).toBe(TUTORIAL_ID);
    expect(p).toEqual(recordToPuzzle(TUTORIAL_RECORD, 'T1'));
    expect(p.givens).toEqual([]);
    expect(tutorialPuzzle()).toBe(p);
  });

  it('is unique and grade G1 (engine solver and grader)', () => {
    const p = tutorialPuzzle();
    expect(countSolutions(4, p.regions, 2).count).toBe(1);
    expect(grade(4, p.regions).grade).toBe(1);
  });

  it('fixed colours A Mint, B Lavender, C Lemon, D Strawberry; region B is the single tile (1,2)', () => {
    expect(TUTORIAL_COLORS).toEqual([4, 7, 2, 0]);
    expect(getMode('tutorial').fixedColors).toEqual([4, 7, 2, 0]);
    expect(fixedColorsFor('tutorial', tutorialPuzzle())).toEqual(Uint8Array.from([4, 7, 2, 0]));
    expect(fixedColorsFor('level', tutorialPuzzle())).toBeNull();
    const p = tutorialPuzzle();
    expect([...p.regions.keys()].filter((i) => p.regions[i] === 1)).toEqual([at(1, 2)]);
  });

  it('script targets: (1,2), (2,1)–(2,3), (2,4), (3,1), (4,3); every cat target is a solution cell', () => {
    expect(TUTORIAL_CELLS).toEqual({ lavender: 1, swipe: [4, 5, 6], row2Cat: 7, hintCat: 8, lastCat: 14 });
    const sol = tutorialPuzzle().solution;
    for (const c of [1, 7, 8, 14]) expect(sol[Math.floor(c / 4)]).toBe(c % 4);
  });

  it('step definitions (coach focus, target, hand, Got it, colour param)', () => {
    expect(tutorialStep(1)).toMatchObject({ focusCells: [1], target: 'cells', hand: 'double_tap', gotIt: false, colorParam: 7 });
    expect(tutorialStep(2)).toMatchObject({ focusCells: [0, 1, 2, 3, 5, 9, 13], gotIt: true, colorParam: null });
    expect(tutorialStep(3)).toMatchObject({ focusCells: [4, 5, 6], hand: 'swipe', gotIt: false });
    expect(tutorialStep(4)).toMatchObject({ focusCells: [7], hand: 'double_tap' });
    expect(tutorialStep(5)).toMatchObject({ focusCells: [], target: 'bulb', hand: 'tap' });
    expect(tutorialStep(6)).toMatchObject({ focusCells: [14], hand: 'double_tap' });
    expect(() => tutorialStep(7 as TutorialStepIndex)).toThrow();
  });

  it('tools: the bulb only in step 5, the paw never', () => {
    for (const s of [1, 2, 3, 4, 5, 6] as const) {
      expect(tutorialAllowsTool(s, 'bulb')).toBe(s === 5);
      expect(tutorialAllowsTool(s, 'paw')).toBe(false);
    }
  });

  it('tutorial rules: no mistake penalty, never saved, free helpers, no gate, no Home button', () => {
    const m = getMode('tutorial');
    expect(m.rules.mistakePenalty).toBe(false);
    expect(m).toMatchObject({ saveSlot: null, chargesHelpers: false, kittyAllowed: false, winGate: null, homeButton: false });
  });
});

// ─────────────────────────────── filter ───────────────────────────────

const HINT: HintStep = { kind: 'single', level: 1, focusUnits: [], focusCells: [8], effectCells: [], placeCell: 8 };

interface FilterRow {
  step: TutorialStepIndex;
  action: Action;
  out: TutorialFilterResult;
}

const FILTER: FilterRow[] = [
  // step 1: TAP or DOUBLE_TAP on (1,2); anything else on the board pulses
  { step: 1, action: T(1), out: T(1) },
  { step: 1, action: D(1), out: D(1) },
  { step: 1, action: T(0), out: PULSE(0) },
  { step: 1, action: D(at(3, 1)), out: PULSE(at(3, 1)) }, // a solution cell, but not this step's
  { step: 1, action: P([4, 5]), out: PULSE(4) },
  { step: 1, action: P([]), out: null },
  { step: 1, action: T(-1), out: null },
  { step: 1, action: T(16), out: null },
  // non-board actions
  { step: 1, action: { type: 'START' }, out: { type: 'START' } },
  { step: 1, action: { type: 'TICK', dtMs: 5 }, out: { type: 'TICK', dtMs: 5 } },
  { step: 1, action: { type: 'HINT_OPEN', step: HINT, charged: false }, out: null },
  { step: 1, action: { type: 'KITTY', cell: 1, t: 0 }, out: null },
  { step: 1, action: { type: 'REVIVE', t: 0 }, out: null },
  { step: 1, action: { type: 'RETRY' }, out: null },
  // step 2: the board is locked (Got it only)
  { step: 2, action: T(0), out: PULSE(0) },
  { step: 2, action: D(7), out: PULSE(7) },
  { step: 2, action: P([4, 5, 6]), out: PULSE(4) },
  // step 3: mark-mode PAINT narrowed to the three tiles; TAP only on a target that is still Empty
  { step: 3, action: P([4, 5, 6]), out: P([4, 5, 6]) },
  { step: 3, action: P([3, 4, 8, 6, 4]), out: P([4, 6]) },
  { step: 3, action: P([5, 4], 'erase'), out: P([5, 4]) }, // a swipe starting on the step-2 X still marks
  { step: 3, action: P([0, 1]), out: PULSE(0) },
  { step: 3, action: T(4), out: T(4) },
  { step: 3, action: T(5), out: PULSE(5) }, // (2,2) is already X: it cannot be cleared
  { step: 3, action: D(4), out: PULSE(4) },
  { step: 3, action: T(7), out: PULSE(7) },
  // step 4
  { step: 4, action: T(7), out: T(7) },
  { step: 4, action: D(7), out: D(7) },
  { step: 4, action: D(8), out: PULSE(8) },
  { step: 4, action: P([7]), out: PULSE(7) },
  // step 5: the bulb (forced free), then Apply only
  { step: 5, action: { type: 'HINT_OPEN', step: HINT, charged: true }, out: { type: 'HINT_OPEN', step: HINT, charged: false } },
  { step: 5, action: { type: 'HINT_APPLY', t: 3 }, out: { type: 'HINT_APPLY', t: 3 } },
  { step: 5, action: { type: 'HINT_CLOSE' }, out: null },
  { step: 5, action: D(8), out: PULSE(8) },
  { step: 5, action: { type: 'KITTY', cell: 8, t: 0 }, out: null },
  // step 6
  { step: 6, action: D(14), out: D(14) },
  { step: 6, action: T(14), out: T(14) },
  { step: 6, action: D(12), out: PULSE(12) },
  { step: 6, action: { type: 'HINT_OPEN', step: HINT, charged: false }, out: null },
];

describe('filterTutorialAction (02 §11.5 "Accepted input")', () => {
  it.each(FILTER)('step $step: $action.type → $out', ({ step, action, out }) => {
    expect(filterTutorialAction(step, reach(step).state, action)).toEqual(out);
  });
});

// ─────────────────────────────── advance ───────────────────────────────

describe('advance', () => {
  it('step 1 → 2 once a cat is on (1,2); a lone TAP (X) does not advance', () => {
    const r0 = start();
    const marked = reduce(r0.state, T(1)).state;
    expect(advance(1, marked)).toBeNull();
    expect(advance(1, reduce(marked, D(1)).state)).toEqual({ next: 2, scriptedMarks: [] });
  });

  it('step 2 waits for Got it, then X’s on row 1 and column 2 (Empty cells only)', () => {
    const r = reach(2);
    expect(advance(2, r.state)).toBeNull();
    expect(advance(1, r.state, 'got_it')).toBeNull();
    expect(advance(2, r.state, 'got_it')).toEqual({ next: 3, scriptedMarks: [0, 2, 3, 5, 9, 13] });
  });

  it('step 3 → 4 when (2,1), (2,2), (2,3) are all X', () => {
    const r = reach(3);
    expect(advance(3, reduce(r.state, P([4])).state)).toBeNull();
    expect(advance(3, reduce(r.state, P([4, 6])).state)).toEqual({ next: 4, scriptedMarks: [] });
  });

  it('step 4 → 5 with X’s on the still-Empty shadow of (2,4)', () => {
    const r = reach(4);
    const s = reduce(r.state, D(7)).state;
    expect(tutorialShadowMarks(s, 7)).toEqual([10, 11, 15]);
    expect(advance(4, s)).toEqual({ next: 5, scriptedMarks: [10, 11, 15] });
  });

  it('step 5 → 6 after Apply puts the cat on (3,1), with X’s on its shadow', () => {
    const { run, hint } = bulb(reach(5));
    expect(run.state.status).toBe('hint');
    expect(advance(5, run.state)).toBeNull(); // the card is open: not yet
    const applied = reduce(run.state, { type: 'HINT_APPLY', t: 0 }).state;
    expect(hint.placeCell).toBe(8);
    expect(advance(5, applied)).toEqual({ next: 6, scriptedMarks: [12] });
  });

  it('step 6 → done on the win', () => {
    const r = reach(6);
    expect(advance(6, r.state)).toBeNull();
    expect(advance(6, reduce(r.state, D(14)).state)).toEqual({ next: 'done', scriptedMarks: [] });
  });
});
