// Owner: C (Phase 2b; was game). newGame / restoreGame / toInProgress (04 §4.2, §7.2; 02 §15 restore steps 3–6) and the mode registry.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { countCats, newGame, regionsDoneMask, restoreGame, toInProgress } from '../../../src/game/factory';
import { fixedColorsFor, getMode, MODES, rulesFor } from '../../../src/game/modes';
import { reduce } from '../../../src/game/reducer';
import { encodeCells } from '../../../src/game/save';
import { CellState, type InProgressV2, type ModeId } from '../../../src/game/types';
import { cell, dbl, lostState, makePuzzle, P5, P5G, playing, R5, run, S5, SOL5, tap, wonState, WRONG5 } from './fixtures';

/** A valid level slot for P5 built from a real game state. */
function slotOf(actions: Parameters<typeof run>[1], savedAt = 123): InProgressV2 {
  return toInProgress(run(playing(), actions).state, savedAt);
}

describe('newGame', () => {
  it('a fresh attempt: status ready, full hearts, counters 0, empty log, rules from the mode', () => {
    const g = newGame(P5, 'level');
    expect(g).toMatchObject({
      puzzle: P5,
      mode: 'level',
      status: 'ready',
      hearts: cfg.hearts.perAttempt,
      catsPlaced: 0,
      regionsDone: 0,
      mistakes: 0,
      revivesUsed: 0,
      hintsUsed: 0,
      kittiesUsed: 0,
      elapsedMs: 0,
      openHint: null,
      moves: [],
    });
    expect(g.cells).toEqual(new Uint8Array(25));
    expect(g.rules).toEqual(rulesFor('level'));
  });

  it('givens are pre-placed and count as cats (regions done)', () => {
    const g = newGame(P5G, 'daily');
    expect(g.cells[cell(2, 4)]).toBe(CellState.Given);
    expect(g.catsPlaced).toBe(1);
    expect(g.regionsDone).toBe(1 << (P5.regions[cell(2, 4)] as number));
  });

  it('uses the rules passed in (Phase 3 hook)', () => {
    const rules = { ...rulesFor('level'), heartsPerAttempt: 5 };
    expect(newGame(P5, 'level', rules).hearts).toBe(5);
  });
});

describe('toInProgress / restoreGame', () => {
  it('round-trips the board, hearts, revives, counters and timer; restores into READY', () => {
    const s = run(playing(), [tap(cell(1, 1)), dbl(SOL5[0] as number), dbl(WRONG5[0] as number), { type: 'TICK', dtMs: 1234.4 }]).state;
    const slot = toInProgress(s, 999);
    expect(slot).toEqual({
      id: 'L2',
      mode: 'level',
      cells: encodeCells(s.cells),
      hearts: 2,
      revivesUsed: 0,
      mistakes: 1,
      hintsUsed: 0,
      kittiesUsed: 0,
      elapsedMs: 1234,
      savedAt: 999,
    });
    const g = restoreGame(P5, slot);
    expect(g.status).toBe('ready');
    expect(g.cells).toEqual(s.cells);
    expect(g).toMatchObject({ hearts: 2, mistakes: 1, catsPlaced: 1, regionsDone: 1, elapsedMs: 1234, moves: [], openHint: null });
    expect(reduce(g, { type: 'START' }).state.status).toBe('playing');
  });

  it('hint and kitty overlays are never restored; anything charged stays charged', () => {
    let s = reduce(playing(), { type: 'HINT_OPEN', step: { kind: 'shadow', level: 0, focusUnits: [], focusCells: [], effectCells: [] }, charged: true }).state;
    expect(s.status).toBe('hint');
    const g = restoreGame(P5, toInProgress(s, 1));
    expect(g).toMatchObject({ status: 'ready', openHint: null, hintsUsed: 1 });
    s = reduce(playing(), { type: 'KITTY', cell: SOL5[0] as number, t: 0 }).state;
    expect(restoreGame(P5, toInProgress(s, 1))).toMatchObject({ status: 'ready', kittiesUsed: 1, catsPlaced: 1 });
  });

  it('02 §15 step 5: hearts 0 → LOST (an unused revive stays available)', () => {
    const g = restoreGame(P5, toInProgress(lostState(), 1));
    expect(g.status).toBe('lost');
    expect(reduce(g, { type: 'REVIVE', t: 0 }).state).toMatchObject({ status: 'playing', hearts: 1 });
  });

  it('02 §15 step 4: a full board restores as WON (checked before hearts)', () => {
    const g = restoreGame(P5, toInProgress(wonState(), 1));
    expect(g.status).toBe('won');
    expect(g.catsPlaced).toBe(5);
  });

  it('a daily slot restores in daily mode with daily rules', () => {
    const d = makePuzzle('D2026-10-06', R5, S5);
    const s = reduce(newGame(d, 'daily'), { type: 'START' }).state;
    const g = restoreGame(d, toInProgress(reduce(s, tap(cell(1, 1))).state, 5));
    expect(g.mode).toBe('daily');
    expect(g.rules).toEqual(rulesFor('daily'));
  });

  const INVALID: { name: string; slot: () => InProgressV2 }[] = [
    { name: 'id of another puzzle', slot: () => ({ ...slotOf([]), id: 'L3' }) },
    { name: 'wrong mode', slot: () => ({ ...slotOf([]), mode: 'daily' }) },
    { name: 'short cells', slot: () => ({ ...slotOf([]), cells: '0'.repeat(24) }) },
    { name: 'bad char', slot: () => ({ ...slotOf([]), cells: `5${'0'.repeat(24)}` }) },
    { name: 'cat off the solution', slot: () => ({ ...slotOf([]), cells: `02${'0'.repeat(23)}` }) },
    { name: 'mistakes ≠ Wrong cells', slot: () => ({ ...slotOf([dbl(WRONG5[0] as number)]), mistakes: 0, hearts: 3 }) },
    { name: 'hearts invariant', slot: () => ({ ...slotOf([]), hearts: 2 }) },
  ];

  it.each(INVALID)('an invalid slot throws ($name)', ({ slot }) => {
    expect(() => restoreGame(P5, slot())).toThrow(RangeError);
  });

  it('validates against the rules it restores with (a hearts variant), and rejects a non-object', () => {
    const rules = { ...rulesFor('level'), heartsPerAttempt: 4 };
    const four = reduce(newGame(P5, 'level', rules), { type: 'START' }).state;
    const slot = toInProgress(reduce(four, dbl(WRONG5[0] as number)).state, 1);
    expect(slot.hearts).toBe(3);
    expect(restoreGame(P5, slot, rules)).toMatchObject({ hearts: 3, mistakes: 1, rules });
    expect(() => restoreGame(P5, slot)).toThrow(/hearts/);
    expect(() => restoreGame(P5, null as unknown as InProgressV2)).toThrow(RangeError);
    expect(() => restoreGame(makePuzzle('T1', R5, S5), slotOf([]))).toThrow(RangeError);
  });

  it('toInProgress refuses the tutorial (never saved)', () => {
    expect(() => toInProgress(playing(P5, 'tutorial'), 1)).toThrow();
  });
});

describe('regionsDoneMask / countCats', () => {
  it('count Cats and Givens only', () => {
    const cells = new Uint8Array(25);
    cells[SOL5[0] as number] = CellState.Cat;
    cells[SOL5[2] as number] = CellState.Given;
    cells[1] = CellState.Mark;
    cells[2] = CellState.Wrong;
    expect(countCats(cells)).toBe(2);
    expect(regionsDoneMask(P5, cells)).toBe((1 << 0) | (1 << 2));
  });
});

describe('modes (02 §22 GameMode registry)', () => {
  it('rules per mode from cfg: hearts 3, revive 1 / 1, solution model, no auto-X; tutorial without penalty', () => {
    for (const id of ['tutorial', 'level', 'daily'] as ModeId[]) {
      expect(MODES[id].rules).toEqual({
        mistakeModel: 'solution',
        mistakePenalty: id !== 'tutorial',
        autoX: false,
        heartsPerAttempt: 3,
        maxRevives: 1,
        heartsOnRevive: 1,
      });
      expect(getMode(id).id).toBe(id);
      expect(Object.isFrozen(getMode(id))).toBe(true);
    }
  });

  it('save slots, helper charging, win flows, gates, titles', () => {
    expect(MODES.level).toMatchObject({ saveSlot: 'level', chargesHelpers: true, kittyAllowed: true, winFlow: 'level', winGate: 'next_level', fixedColors: null, analyticsMode: 'level', hudTitle: 'level', homeButton: true });
    expect(MODES.daily).toMatchObject({ saveSlot: 'daily', chargesHelpers: true, kittyAllowed: true, winFlow: 'daily', winGate: 'daily_done', fixedColors: null, analyticsMode: 'daily', hudTitle: 'daily', homeButton: true });
    expect(MODES.tutorial).toMatchObject({ saveSlot: null, chargesHelpers: false, winFlow: 'tutorial', winGate: null, analyticsMode: 'tutorial', hudTitle: 'level' });
  });

  it('rulesFor reads a config variant', () => {
    const c = mergeConfig({ hearts: { perAttempt: 4 }, revive: { maxPerAttempt: 2, heartsRestored: 2 } });
    expect(rulesFor('daily', c)).toMatchObject({ heartsPerAttempt: 4, maxRevives: 2, heartsOnRevive: 2, mistakePenalty: true });
  });

  it('getMode throws on an unknown id; fixedColorsFor needs a matching board size', () => {
    expect(() => getMode('zen' as ModeId)).toThrow();
    expect(fixedColorsFor('tutorial', P5)).toBeNull(); // 5 regions ≠ 4 fixed colours
  });
});
