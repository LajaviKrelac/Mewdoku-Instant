// Owner: G1 (Phase 2d.1)
// The kitty's target (docs/phase2d/helpers-spec.md §2.3, §7.6, D-2d1-2): workers/hint-chunk.ts
// pickKittyCell places the cat of the cat-less region with the FEWEST candidate tiles after every
// known cat's shadow (marks count as candidates, wrong tiles do not); ties go to the region whose
// solution cell comes first in reading order. Our own fixtures only (no layout of the original).
// The engine's 2b picker (most candidates) is unchanged and still feeds reveal_fallback.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isLevelPack, recordToPuzzle } from '../../../src/engine/codec';
import { pickKittyCell as enginePick } from '../../../src/engine/hint';
import { makeRng } from '../../../src/engine/rng';
import { CellState, type Puzzle } from '../../../src/engine/types';
import * as chunk from '../../../src/workers/hint-chunk';
import { pickKittyCell } from '../../../src/workers/hint-chunk';
import { P5, P9C, SOL5, SOL9C } from '../game/fixtures';
import { kittyReference } from '../../fixtures/kitty-reference';

const isSolution = (p: Puzzle, i: number): boolean => p.solution[Math.floor(i / p.n)] === i % p.n;
/**
 * An independent reference of the rule (tests/fixtures/kitty-reference.ts, shared with the e2e since audit A-4):
 * a cell is a candidate when it is not a cat, not Wrong, and not attacked by any cat on the board (same row,
 * column or region, or touching, diagonals included).
 */
const reference = (p: Puzzle, cells: Readonly<Uint8Array>): number => kittyReference(p, cells);
const isCat = (v: number | undefined): boolean => v === CellState.Cat || v === CellState.Given;

describe('pickKittyCell (2d.1 §2.3): fewest candidates', () => {
  it('our 9 × 9 with a one-tile region in the top-right corner: that tile (forced at once)', () => {
    const cells = new Uint8Array(81);
    expect(pickKittyCell(P9C, cells)).toBe(8);
    expect(SOL9C[0]).toBe(8);
    // The same with three X's elsewhere (as after the mouse) and the corner tile crossed by mistake:
    // the cat replaces the X (the reducer allows Mark → Cat for the kitty).
    const marked = cells.slice();
    for (const c of [5, 22, 78]) marked[c] = CellState.Mark;
    expect(pickKittyCell(P9C, marked)).toBe(8);
    // The engine's 2b rule would pick the largest open region instead.
    expect(enginePick(P9C, cells)).not.toBe(8);
  });

  it('with no forced region: the solution cell of the cat-less region with the fewest candidates after shadows', () => {
    // P9C with its corner cat placed: the next pick is the region with the fewest candidates left.
    const cells = new Uint8Array(81);
    cells[8] = CellState.Cat;
    const got = pickKittyCell(P9C, cells);
    expect(got).toBe(reference(P9C, cells));
    expect(isSolution(P9C, got)).toBe(true);
    expect(P9C.regions[got]).not.toBe(P9C.regions[8]);
  });

  it('ties go to the region whose solution cell comes first in reading order', () => {
    // P5 regions A (0,1,5,10) and D (11,15,16,20) have 4 candidates each on an empty board; A's
    // solution cell (0,0) is in row 0, D's (3,1) in row 3.
    const cells = new Uint8Array(25);
    expect(pickKittyCell(P5, cells)).toBe(SOL5[0]);
    // The 2b rule: the most candidates (C and E, 6 each; the lower label C → its cell (2,4)).
    expect(enginePick(P5, cells)).toBe(SOL5[2]);
    // A Wrong tile in D makes D the strictly fewest (3 < 4).
    cells[11] = CellState.Wrong;
    expect(pickKittyCell(P5, cells)).toBe(SOL5[3]);
    // Marks still count as candidates (knowledgeFromBoard): crossing A's tiles changes nothing.
    const marked = new Uint8Array(25);
    for (const c of [1, 5, 10]) marked[c] = CellState.Mark;
    expect(pickKittyCell(P5, marked)).toBe(SOL5[0]);
  });

  it('never a cell whose region has a cat (Cat or Given); throws when every region has one', () => {
    const cells = new Uint8Array(25);
    cells[SOL5[0] as number] = CellState.Cat;
    expect(P5.regions[pickKittyCell(P5, cells)]).not.toBe(P5.regions[SOL5[0] as number]);
    cells[SOL5[3] as number] = CellState.Given;
    const pick = pickKittyCell(P5, cells);
    expect([P5.regions[SOL5[0] as number], P5.regions[SOL5[3] as number]]).not.toContain(P5.regions[pick]);
    const full = new Uint8Array(25);
    for (const c of SOL5) full[c] = CellState.Cat;
    expect(() => pickKittyCell(P5, full)).toThrow(/every region/);
  });

  it('pure: the board is not changed; the chunk re-exports the engine getHintStep', () => {
    const cells = new Uint8Array(81);
    cells[5] = CellState.Mark;
    const before = cells.slice();
    pickKittyCell(P9C, cells);
    expect(cells).toEqual(before);
    expect(typeof chunk.getHintStep).toBe('function');
    expect(chunk.getHintStep(P9C, cells).kind).toBeTruthy();
  });
});

describe('pickKittyCell property: 200 shipped levels, random partial boards', () => {
  const dir = 'src/data/levels';
  const puzzles: Puzzle[] = [];
  for (const f of readdirSync(dir).filter((x) => /^pack-\d+\.json$/.test(x)).sort()) {
    const pack: unknown = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    if (!isLevelPack(pack)) continue;
    for (const rec of pack.levels) {
      if (puzzles.length >= 200) break;
      puzzles.push(recordToPuzzle(rec, `L${rec.i ?? puzzles.length}`));
    }
  }

  it('always a solution cell of a cat-less region, and the reference rule', () => {
    expect(puzzles.length).toBe(200);
    const rng = makeRng('kitty-pick-2d1');
    for (const p of puzzles) {
      const n = p.n;
      const cells = new Uint8Array(n * n);
      for (const g of p.givens) cells[g * n + (p.solution[g] as number)] = CellState.Given;
      // Some correct cats (never all), some marks anywhere, some wrong tiles off the solution.
      const cats = rng.int(n - 1);
      for (let k = 0; k < cats; k++) {
        const r = rng.int(n);
        const i = r * n + (p.solution[r] as number);
        if (cells[i] === CellState.Empty) cells[i] = CellState.Cat;
      }
      for (let k = 0; k < n * 2; k++) {
        const i = rng.int(n * n);
        if (cells[i] !== CellState.Empty) continue;
        cells[i] = isSolution(p, i) || rng.int(3) > 0 ? CellState.Mark : CellState.Wrong;
      }
      let catRegions = 0;
      for (let i = 0; i < n * n; i++) if (isCat(cells[i])) catRegions |= 1 << (p.regions[i] as number);
      if (catRegions === (1 << n) - 1) continue;
      const got = pickKittyCell(p, cells);
      expect(isSolution(p, got)).toBe(true);
      expect((catRegions >> (p.regions[got] as number)) & 1).toBe(0);
      expect(got).toBe(reference(p, cells));
    }
  });
});
