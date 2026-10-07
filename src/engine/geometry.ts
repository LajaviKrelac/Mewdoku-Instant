// Owner: engine
// Index helpers, neighbours, unit ids and per-puzzle attack tables (03 §2). PURE.
import type { CellIndex, Puzzle, PuzzleTables, Unit, UnitKind } from './types';

/** r * n + c. */
export function cellIndex(r: number, c: number, n: number): CellIndex {
  return r * n + c;
}

export function rowOf(cell: CellIndex, n: number): number {
  return Math.floor(cell / n);
}

export function colOf(cell: CellIndex, n: number): number {
  return cell % n;
}

/** The up-to-8 king-adjacent cells, ascending. */
export function kingNeighbors(cell: CellIndex, n: number): CellIndex[] {
  const r = rowOf(cell, n);
  const c = colOf(cell, n);
  const out: CellIndex[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    const rr = r + dr;
    if (rr < 0 || rr >= n) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc;
      if ((dr === 0 && dc === 0) || cc < 0 || cc >= n) continue;
      out.push(rr * n + cc);
    }
  }
  return out;
}

/** The up-to-4 orthogonal neighbours, ascending. */
export function orthoNeighbors(cell: CellIndex, n: number): CellIndex[] {
  const r = rowOf(cell, n);
  const c = colOf(cell, n);
  const out: CellIndex[] = [];
  if (r > 0) out.push(cell - n);
  if (c > 0) out.push(cell - 1);
  if (c < n - 1) out.push(cell + 1);
  if (r < n - 1) out.push(cell + n);
  return out;
}

const KINDS: readonly UnitKind[] = ['row', 'col', 'region'];

/** Unit id: rows 0..n-1, columns n..2n-1, regions 2n..3n-1 (03 §5.2 unit order). */
export function unitId(unit: Unit, n: number): number {
  return KINDS.indexOf(unit.kind) * n + unit.index;
}

export function unitFromId(id: number, n: number): Unit {
  const kind = KINDS[Math.floor(id / n)];
  if (kind === undefined || id < 0) throw new RangeError(`unitFromId: bad unit id ${id} for n=${n}`);
  return { kind, index: id % n };
}

/** Builds units, unitsOf, attack sets and regRows for a region map (03 §2). */
export function buildTables(n: number, regions: Uint8Array): PuzzleTables {
  if (regions.length !== n * n) throw new RangeError(`buildTables: expected ${n * n} cells, got ${regions.length}`);
  const units: CellIndex[][] = [];
  for (let u = 0; u < 3 * n; u++) units.push([]);
  const regRows: number[][] = [];
  for (let g = 0; g < n; g++) regRows.push(new Array<number>(n).fill(0));
  const unitsOf: (readonly [number, number, number])[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = rowOf(i, n);
    const c = colOf(i, n);
    const g = regions[i] as number;
    if (g >= n) throw new RangeError(`buildTables: region label ${g} out of range for n=${n}`);
    (units[r] as CellIndex[]).push(i);
    (units[n + c] as CellIndex[]).push(i);
    (units[2 * n + g] as CellIndex[]).push(i);
    (regRows[g] as number[])[r] = ((regRows[g] as number[])[r] as number) | (1 << c);
    unitsOf.push([r, n + c, 2 * n + g]);
  }
  const total = n * n;
  const rowArr = new Uint8Array(total);
  const colArr = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    rowArr[i] = Math.floor(i / n);
    colArr[i] = i % n;
  }
  const attack: CellIndex[][] = [];
  for (let i = 0; i < total; i++) {
    const r = rowArr[i] as number;
    const c = colArr[i] as number;
    const g = regions[i];
    const list: CellIndex[] = [];
    for (let j = 0; j < total; j++) {
      if (j === i) continue;
      const dr = (rowArr[j] as number) - r;
      const dc = (colArr[j] as number) - c;
      if (dr === 0 || dc === 0 || regions[j] === g || (dr >= -1 && dr <= 1 && dc >= -1 && dc <= 1)) list.push(j);
    }
    attack.push(list);
  }
  return { n, regions, units, unitsOf, attack, regRows };
}

/** The solution cell of row r: r * n + solution[r]. */
export function solutionCell(p: Pick<Puzzle, 'n' | 'solution'>, row: number): CellIndex {
  const c = p.solution[row];
  if (c === undefined) throw new RangeError(`solutionCell: no row ${row}`);
  return row * p.n + c;
}

/** true when the cell holds the solution's cat (02 §8 cat-attempt check). */
export function isSolutionCell(p: Pick<Puzzle, 'n' | 'solution'>, cell: CellIndex): boolean {
  return p.solution[rowOf(cell, p.n)] === colOf(cell, p.n);
}
