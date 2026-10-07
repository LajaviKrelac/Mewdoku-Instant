// Owner: engine
// Bitboard views of a knowledge state (03 §2, §5.1), shared by techniques.ts. Internal to engine/.
// A cell set is stored as one column mask per row, so unit and attack tests are a few AND/ORs. PURE.
import { fullMask, popcount } from './bits';
import type { CellIndex, PuzzleTables } from './types';

/** Per-puzzle bit tables derived once from PuzzleTables (cached by identity). */
export interface BitTables {
  readonly n: number;
  readonly full: number;
  readonly regions: Uint8Array;
  /** regRows[g * n + r]: columns of region g in row r. */
  readonly regRows: Int32Array;
  /** attackRows[x * n + r]: columns attacked by a cat at x in row r (x itself excluded). */
  readonly attackRows: Int32Array;
}

const cache = new WeakMap<PuzzleTables, BitTables>();

export function bitTables(tables: PuzzleTables): BitTables {
  const hit = cache.get(tables);
  if (hit) return hit;
  const { n, regions } = tables;
  const regRows = new Int32Array(n * n);
  for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) regRows[g * n + r] = tables.regRows[g]?.[r] ?? 0;
  const attackRows = new Int32Array(n * n * n);
  for (let x = 0; x < n * n; x++) {
    for (const j of tables.attack[x] ?? []) {
      const r = Math.floor(j / n);
      attackRows[x * n + r] = (attackRows[x * n + r] as number) | (1 << (j - r * n));
    }
  }
  const bt: BitTables = { n, full: fullMask(n), regions, regRows, attackRows };
  cache.set(tables, bt);
  return bt;
}

/** Columns of unit u (any status) in row r. Unit ids: rows 0..n-1, columns n..2n-1, regions 2n..3n-1. */
export function unitRowMask(bt: BitTables, u: number, r: number): number {
  const n = bt.n;
  if (u < n) return u === r ? bt.full : 0;
  if (u < 2 * n) return 1 << (u - n);
  return bt.regRows[(u - 2 * n) * n + r] as number;
}

/** Index of the unit of kind 0 (row), 1 (column) or 2 (region) that holds cell i. */
export function kindIndexOf(bt: BitTables, kind: number, i: CellIndex): number {
  if (kind === 0) return Math.floor(i / bt.n);
  if (kind === 1) return i % bt.n;
  return bt.regions[i] as number;
}

/** Snapshot of a knowledge state as masks. Rebuilt per technique call: O(n²). */
export interface View {
  readonly n: number;
  readonly bt: BitTables;
  readonly status: Uint8Array;
  /** uc[u * n + r]: candidate columns of unit u in row r. */
  readonly uc: Int32Array;
  /** Candidates per unit. */
  readonly ucount: Int32Array;
  /** Cats per unit. */
  readonly ccount: Int32Array;
  /** Total candidate cells. */
  readonly totalCand: number;
}

/** status codes, mirrored from techniques.ts KnowledgeStatus to avoid an import cycle. */
const CAND = 1;
const CAT = 2;

export function buildView(bt: BitTables, status: Uint8Array): View {
  const n = bt.n;
  const uc = new Int32Array(3 * n * n);
  const ucount = new Int32Array(3 * n);
  const ccount = new Int32Array(3 * n);
  let totalCand = 0;
  for (let i = 0; i < n * n; i++) {
    const s = status[i];
    if (s !== CAND && s !== CAT) continue;
    const r = Math.floor(i / n);
    const c = i - r * n;
    const uCol = n + c;
    const uReg = 2 * n + (bt.regions[i] as number);
    if (s === CAT) {
      ccount[r] = (ccount[r] as number) + 1;
      ccount[uCol] = (ccount[uCol] as number) + 1;
      ccount[uReg] = (ccount[uReg] as number) + 1;
      continue;
    }
    totalCand++;
    const bit = 1 << c;
    uc[r * n + r] = (uc[r * n + r] as number) | bit;
    uc[uCol * n + r] = (uc[uCol * n + r] as number) | bit;
    uc[uReg * n + r] = (uc[uReg * n + r] as number) | bit;
    ucount[r] = (ucount[r] as number) + 1;
    ucount[uCol] = (ucount[uCol] as number) + 1;
    ucount[uReg] = (ucount[uReg] as number) + 1;
  }
  return { n, bt, status, uc, ucount, ccount, totalCand };
}

/** Some open unit has no candidate, or some unit holds two cats (03 §5.1). */
export function viewContradiction(v: View): boolean {
  for (let u = 0; u < 3 * v.n; u++) {
    const cats = v.ccount[u] as number;
    if (cats > 1 || (cats === 0 && v.ucount[u] === 0)) return true;
  }
  return false;
}

/** First unit id with no cat and no candidate, else the first with two cats, else -1. */
export function contradictionUnitId(v: View): number {
  for (let u = 0; u < 3 * v.n; u++) if (v.ccount[u] === 0 && v.ucount[u] === 0) return u;
  for (let u = 0; u < 3 * v.n; u++) if ((v.ccount[u] as number) > 1) return u;
  return -1;
}

/** Cells of a per-row mask block (n masks at `offset`), ascending cell index. */
export function cellsOfMasks(masks: Int32Array, offset: number, n: number): CellIndex[] {
  const out: CellIndex[] = [];
  for (let r = 0; r < n; r++) {
    let m = masks[offset + r] as number;
    while (m !== 0) {
      const low = m & -m;
      out.push(r * n + 31 - Math.clz32(low));
      m ^= low;
    }
  }
  return out;
}

/** Lowest candidate cell of unit u, or -1. */
export function firstCandOf(v: View, u: number): CellIndex {
  const n = v.n;
  for (let r = 0; r < n; r++) {
    const m = v.uc[u * n + r] as number;
    if (m !== 0) return r * n + 31 - Math.clz32(m & -m);
  }
  return -1;
}

/** Bitmask of the indices of the units of `kind` (0 row, 1 col, 2 region) that hold a candidate of u. */
export function touchedKindMask(v: View, u: number, kind: number): number {
  const n = v.n;
  let out = 0;
  for (let r = 0; r < n; r++) {
    const m = v.uc[u * n + r] as number;
    if (m === 0) continue;
    if (kind === 0) out |= 1 << r;
    else if (kind === 1) out |= m;
    else {
      let mm = m;
      while (mm !== 0) {
        const low = mm & -mm;
        out |= 1 << (v.bt.regions[r * n + 31 - Math.clz32(low)] as number);
        mm ^= low;
      }
    }
  }
  return out;
}

/** Number of set bits in a per-row mask block. */
export function countMasks(masks: Int32Array, offset: number, n: number): number {
  let k = 0;
  for (let r = 0; r < n; r++) k += popcount(masks[offset + r] as number);
  return k;
}
