// Owner: engine
// L4 pigeonhole (03 §5.2): k open A-units whose candidates lie in exactly k B-units T clear the rest
// of T. Scan order: k = 2…⌊m/2⌋, then the six kind pairs, then k-subsets of open A-units in
// lexicographic unit-id order. Internal to engine/ (techniques.ts re-exports the public finder). PURE.
import { popcount } from './bits';
import { unitFromId } from './geometry';
import { kindIndexOf, touchedKindMask, type View } from './masks';
import type { CellIndex, HintStep, Unit } from './types';

const ROW = 0;
const COL = 1;
const REGION = 2;

/** (A, B) kind pairs in the 03 §5.2 order: region→row, region→column, row→region, column→region, row→column, column→row. */
const PAIRS: readonly (readonly [number, number])[] = [
  [REGION, ROW],
  [REGION, COL],
  [ROW, REGION],
  [COL, REGION],
  [ROW, COL],
  [COL, ROW],
];

const CAND = 1;

/** Number of open (cat-less) units of each kind; m is their minimum (equal in a consistent state). */
function openCount(v: View, kind: number): number {
  let m = 0;
  for (let i = 0; i < v.n; i++) if (v.ccount[kind * v.n + i] === 0) m++;
  return m;
}

interface Found {
  readonly a: number;
  readonly b: number;
  readonly sMask: number;
  readonly tMask: number;
  readonly k: number;
}

/** Per-pair inputs, computed once per view: open A-units, B-units touched by each, A-units touched by each B-unit. */
interface PairData {
  readonly open: readonly number[];
  readonly bOfA: readonly number[];
  readonly aOfB: Int32Array;
}

function pairData(v: View, a: number, b: number): PairData {
  const n = v.n;
  const open: number[] = [];
  for (let i = 0; i < n; i++) if (v.ccount[a * n + i] === 0) open.push(i);
  const bOfA = open.map((i) => touchedKindMask(v, a * n + i, b));
  const aOfB = new Int32Array(n);
  for (let j = 0; j < n; j++) aOfB[j] = touchedKindMask(v, b * n + j, a);
  return { open, bOfA, aOfB };
}

/** First productive k-subset for one (k, A, B), or null. */
function searchPair(d: PairData, k: number, a: number, b: number): Found | null {
  const { open, bOfA, aOfB } = d;
  if (open.length < k) return null;
  let found: Found | null = null;
  const rec = (start: number, depth: number, sMask: number, tMask: number): boolean => {
    if (depth === k) {
      if (popcount(tMask) !== k) return false;
      let over = 0;
      let t = tMask;
      while (t !== 0) {
        const low = t & -t;
        over |= aOfB[31 - Math.clz32(low)] as number;
        t ^= low;
      }
      if ((over & ~sMask) === 0) return false; // nothing to eliminate
      found = { a, b, sMask, tMask, k };
      return true;
    }
    for (let s = start; s <= open.length - (k - depth); s++) {
      const t2 = tMask | (bOfA[s] as number);
      if (popcount(t2) > k) continue; // the union only grows: prune
      if (rec(s + 1, depth + 1, sMask | (1 << (open[s] as number)), t2)) return true;
    }
    return false;
  };
  rec(0, 0, 0, 0);
  return found;
}

function unitsOfMask(kind: number, mask: number, n: number): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < n; i++) if ((mask >> i) & 1) out.push(unitFromId(kind * n + i, n));
  return out;
}

function toStep(v: View, f: Found): HintStep {
  const n = v.n;
  const focusCells: CellIndex[] = [];
  const effectCells: CellIndex[] = [];
  for (let x = 0; x < n * n; x++) {
    if (v.status[x] !== CAND) continue;
    const inS = (f.sMask >> kindIndexOf(v.bt, f.a, x)) & 1;
    if (inS) focusCells.push(x);
    else if ((f.tMask >> kindIndexOf(v.bt, f.b, x)) & 1) effectCells.push(x);
  }
  return {
    kind: 'pigeonhole',
    level: 4,
    focusUnits: [...unitsOfMask(f.a, f.sMask, n), ...unitsOfMask(f.b, f.tMask, n)],
    focusCells,
    effectCells,
    k: f.k,
  };
}

/** L4 on a view: 2 ≤ k ≤ ⌊m/2⌋ over the six kind pairs. */
export function findPigeonholeIn(v: View): HintStep | null {
  const m = Math.min(openCount(v, ROW), openCount(v, COL), openCount(v, REGION));
  if (m < 4) return null;
  const data = PAIRS.map(([a, b]) => pairData(v, a, b));
  for (let k = 2; k <= m >> 1; k++) {
    for (let p = 0; p < PAIRS.length; p++) {
      const [a, b] = PAIRS[p] as readonly [number, number];
      const f = searchPair(data[p] as PairData, k, a, b);
      if (f) return toStep(v, f);
    }
  }
  return null;
}
