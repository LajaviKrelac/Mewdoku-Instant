// Owner: read-only (Phase 2b; was content) (added by the integration lead for the 02 §23 acceptance item "the hint explains and
// applies a valid next step on every shipped level and never reveals a wrong deduction").
// For every shipped record (1 000 levels and every daily month) the hint engine is run from the
// starting board (givens only) and its step is applied (02 §9.1 Apply) until the board is solved.
// Every step must be sound and make progress: no effect cell is a solution cell, a placed cat is a
// solution cell, no reveal fallback is needed, and the walk ends within n² steps.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRecord, recordToPuzzle } from '../../src/engine/codec';
import { getHintStep } from '../../src/engine/hint';
import { CellState, type DailyPack, type HintStep, type LevelPack, type LevelRecord, type Puzzle, type PuzzleId } from '../../src/engine/types';

const { Empty, Mark, Cat, Given } = CellState;
const DATA = new URL('../../src/data/', import.meta.url);
const json = (rel: string): unknown => JSON.parse(readFileSync(new URL(rel, DATA), 'utf8')) as unknown;

const levelFiles = readdirSync(new URL('levels/', DATA)).filter((f) => /^pack-\d{3}\.json$/.test(f)).sort();
const dailyFiles = readdirSync(new URL('daily/', DATA)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
const records: [PuzzleId, LevelRecord][] = [
  ...levelFiles.flatMap((f) => (json(`levels/${f}`) as LevelPack).levels.map((rec): [PuzzleId, LevelRecord] => [`L${rec.i ?? 0}`, rec])),
  ...dailyFiles.flatMap((f) => Object.entries((json(`daily/${f}`) as DailyPack).days).map(([date, rec]): [PuzzleId, LevelRecord] => [`D${date}`, rec])),
];

/** 02 §9.1 Apply: Empty effect cells → Mark, placeCell → Cat, mistaken_mark clears its Mark. */
function applyHint(cells: Uint8Array, step: HintStep): void {
  if (step.kind === 'mistaken_mark') {
    for (const x of step.effectCells) if (cells[x] === Mark) cells[x] = Empty;
    return;
  }
  for (const x of step.effectCells) if (cells[x] === Empty) cells[x] = Mark;
  if (step.placeCell !== undefined) cells[step.placeCell] = Cat;
}

function solved(p: Puzzle, cells: Uint8Array): boolean {
  for (let r = 0; r < p.n; r++) {
    const s = cells[r * p.n + (p.solution[r] as number)];
    if (s !== Cat && s !== Given) return false;
  }
  return true;
}

/** The hint walk from the starting board; returns a failure message or null. */
function walk(p: Puzzle): string | null {
  const sol = new Set(Array.from(p.solution, (c, r) => r * p.n + c));
  const cells = new Uint8Array(p.n * p.n);
  for (const g of p.givens) cells[g] = Given;
  for (let guard = 0; !solved(p, cells); guard++) {
    if (guard > p.n * p.n) return 'no convergence within n² steps';
    const step = getHintStep(p, cells);
    if (step.kind === 'reveal_fallback') return `reveal fallback at step ${guard}`;
    if (step.kind === 'mistaken_mark') return `mistaken mark reported on a clean board at step ${guard}`;
    const bad = step.effectCells.find((x) => sol.has(x));
    if (bad !== undefined) return `${step.kind} crosses out solution cell ${bad}`;
    if (step.placeCell !== undefined && !sol.has(step.placeCell)) return `${step.kind} places a cat on ${step.placeCell}`;
    const progress = step.effectCells.some((x) => cells[x] === Empty) || (step.placeCell !== undefined && cells[step.placeCell] !== Cat);
    if (!progress) return `${step.kind} makes no progress at step ${guard}`;
    applyHint(cells, step);
  }
  return null;
}

describe('hints on every shipped board (02 §23, 03 §11.2)', () => {
  it('covers all 1 000 levels and every daily', () => {
    expect(records.filter(([id]) => id.startsWith('L'))).toHaveLength(1000);
    expect(records.length).toBeGreaterThan(1000 + 800);
  });

  it('from the starting board, repeated Apply reaches the solution with a sound step every time', () => {
    const failures: string[] = [];
    for (const [id, rec] of records) {
      if (!checkRecord(rec).ok) continue; // reported by levels.spec.ts
      const msg = walk(recordToPuzzle(rec, id));
      if (msg !== null) failures.push(`${id}: ${msg}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
