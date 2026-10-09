// Owner: read-only (Phase 2b; was engine)
// 03 §2 geometry: indices, neighbours, unit ids and the per-puzzle tables against naive definitions.
import { describe, expect, it } from 'vitest';
import {
  buildTables,
  cellIndex,
  colOf,
  isSolutionCell,
  kingNeighbors,
  orthoNeighbors,
  rowOf,
  solutionCell,
  unitFromId,
  unitId,
} from '../../../src/engine/geometry';
import { makeRng } from '../../../src/engine/rng';
import { plantedMap, puzzleFromStrings, TUTORIAL } from './helpers';

describe('indices and neighbours', () => {
  it('cellIndex / rowOf / colOf round-trip', () => {
    for (let n = 4; n <= 12; n++) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const i = cellIndex(r, c, n);
          expect(i).toBe(r * n + c);
          expect([rowOf(i, n), colOf(i, n)]).toEqual([r, c]);
        }
      }
    }
  });

  it('king and orthogonal neighbours match the definitions, ascending', () => {
    for (const n of [4, 5, 12]) {
      for (let i = 0; i < n * n; i++) {
        const r = rowOf(i, n);
        const c = colOf(i, n);
        const king: number[] = [];
        const ortho: number[] = [];
        for (let j = 0; j < n * n; j++) {
          const dr = Math.abs(rowOf(j, n) - r);
          const dc = Math.abs(colOf(j, n) - c);
          if (j !== i && dr <= 1 && dc <= 1) king.push(j);
          if (dr + dc === 1) ortho.push(j);
        }
        expect(kingNeighbors(i, n)).toEqual(king);
        expect(orthoNeighbors(i, n)).toEqual(ortho);
      }
    }
    expect(kingNeighbors(0, 5)).toHaveLength(3);
    expect(kingNeighbors(12, 5)).toHaveLength(8);
    expect(orthoNeighbors(2, 5)).toHaveLength(3);
  });

  it('unit ids: rows 0..n-1, columns n..2n-1, regions 2n..3n-1', () => {
    const n = 7;
    for (let id = 0; id < 3 * n; id++) {
      const u = unitFromId(id, n);
      expect(unitId(u, n)).toBe(id);
      expect(u.kind).toBe(id < n ? 'row' : id < 2 * n ? 'col' : 'region');
      expect(u.index).toBe(id % n);
    }
    expect(() => unitFromId(3 * n, n)).toThrow(RangeError);
    expect(() => unitFromId(-1, n)).toThrow(RangeError);
  });
});

describe('buildTables', () => {
  it('matches naive units, unitsOf, attack sets and regRows on random maps', () => {
    const rng = makeRng('test:tables');
    for (let t = 0; t < 40; t++) {
      const n = 4 + (t % 9);
      const { regions } = plantedMap(n, rng);
      const tb = buildTables(n, regions);
      expect(tb.n).toBe(n);
      expect(tb.regions).toBe(regions);
      for (let i = 0; i < n * n; i++) {
        const r = Math.floor(i / n);
        const c = i % n;
        const g = regions[i] as number;
        expect(tb.unitsOf[i]).toEqual([r, n + c, 2 * n + g]);
        const attack: number[] = [];
        for (let j = 0; j < n * n; j++) {
          const rj = Math.floor(j / n);
          const cj = j % n;
          const king = Math.abs(rj - r) <= 1 && Math.abs(cj - c) <= 1;
          if (j !== i && (rj === r || cj === c || regions[j] === g || king)) attack.push(j);
        }
        expect(tb.attack[i]).toEqual(attack);
      }
      for (let u = 0; u < 3 * n; u++) {
        const want: number[] = [];
        for (let i = 0; i < n * n; i++) if ((tb.unitsOf[i] as readonly number[]).includes(u)) want.push(i);
        expect(tb.units[u]).toEqual(want);
      }
      for (let g = 0; g < n; g++) {
        for (let r = 0; r < n; r++) {
          let m = 0;
          for (let c = 0; c < n; c++) if (regions[r * n + c] === g) m |= 1 << c;
          expect(tb.regRows[g]?.[r]).toBe(m);
        }
      }
    }
  });

  it('rejects a wrong cell count or an out-of-range label', () => {
    expect(() => buildTables(4, new Uint8Array(15))).toThrow(RangeError);
    const bad = new Uint8Array(16);
    bad[3] = 4;
    expect(() => buildTables(4, bad)).toThrow(RangeError);
  });
});

describe('solution helpers', () => {
  it('solutionCell and isSolutionCell agree with the solution', () => {
    const p = puzzleFromStrings(TUTORIAL.n, TUTORIAL.r, TUTORIAL.s);
    expect([0, 1, 2, 3].map((r) => solutionCell(p, r))).toEqual([1, 7, 8, 14]);
    const sol = new Set([1, 7, 8, 14]);
    for (let i = 0; i < 16; i++) expect(isSolutionCell(p, i)).toBe(sol.has(i));
    expect(() => solutionCell(p, 4)).toThrow(RangeError);
  });
});
