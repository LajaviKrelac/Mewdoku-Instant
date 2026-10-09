// Owner: read-only (Phase 2b; was engine)
// Naive reference implementation of the 03 §5.2 techniques, written straight from the text with
// arrays and sets (no bitboards, no shared code with src/engine/techniques.ts or pigeonhole.ts).
// The tests compare the optimised engine against it, step for step. Not a spec file.
import type { HintStep, Unit, UnitKind } from '../../../src/engine/types';

export const ELIM = 0;
export const CAND = 1;
export const CAT = 2;

export interface RefBoard {
  readonly n: number;
  readonly regions: Uint8Array;
  /** Cells of each unit id (rows, then columns, then regions), ascending. */
  readonly units: readonly (readonly number[])[];
  /** A(x): cells attacked by a cat at x. */
  readonly attack: readonly ReadonlySet<number>[];
}

const KINDS: readonly UnitKind[] = ['row', 'col', 'region'];

export function refBoard(n: number, regions: Uint8Array): RefBoard {
  const units: number[][] = [];
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < n; j++) {
      const cells: number[] = [];
      for (let i = 0; i < n * n; i++) if (kindIndex(n, regions, k, i) === j) cells.push(i);
      units.push(cells);
    }
  }
  const attack: Set<number>[] = [];
  for (let x = 0; x < n * n; x++) {
    const s = new Set<number>();
    const [r, c] = [Math.floor(x / n), x % n];
    for (let y = 0; y < n * n; y++) {
      const [ry, cy] = [Math.floor(y / n), y % n];
      const touch = Math.abs(ry - r) <= 1 && Math.abs(cy - c) <= 1;
      if (y !== x && (ry === r || cy === c || regions[y] === regions[x] || touch)) s.add(y);
    }
    attack.push(s);
  }
  return { n, regions, units, attack };
}

/** Index of the unit of kind k (0 row, 1 column, 2 region) holding cell i. */
export function kindIndex(n: number, regions: Uint8Array, k: number, i: number): number {
  return k === 0 ? Math.floor(i / n) : k === 1 ? i % n : (regions[i] as number);
}

const unitOf = (b: RefBoard, id: number): Unit => ({ kind: KINDS[Math.floor(id / b.n)] as UnitKind, index: id % b.n });
const cands = (b: RefBoard, st: Uint8Array, u: number): number[] => (b.units[u] ?? []).filter((i) => st[i] === CAND);
const cats = (b: RefBoard, st: Uint8Array, u: number): number => (b.units[u] ?? []).filter((i) => st[i] === CAT).length;
const isOpen = (b: RefBoard, st: Uint8Array, u: number): boolean => cats(b, st, u) === 0;
const unitIds = (b: RefBoard): number[] => Array.from({ length: 3 * b.n }, (_, u) => u);

export function refContradiction(b: RefBoard, st: Uint8Array): boolean {
  return unitIds(b).some((u) => cats(b, st, u) > 1 || (cats(b, st, u) === 0 && cands(b, st, u).length === 0));
}

/** The 03 §5.2 L5 contradiction unit: first unit with no cat and no candidate (else two cats). */
export function refContradictionUnit(b: RefBoard, st: Uint8Array): number {
  const empty = unitIds(b).find((u) => cats(b, st, u) === 0 && cands(b, st, u).length === 0);
  return empty ?? unitIds(b).find((u) => cats(b, st, u) > 1) ?? -1;
}

export function refShadow(b: RefBoard, st: Uint8Array, cat: number): HintStep | null {
  const effectCells = [...(b.attack[cat] ?? [])].filter((j) => st[j] === CAND).sort((x, y) => x - y);
  if (effectCells.length === 0) return null;
  const n = b.n;
  const focusUnits = [unitOf(b, Math.floor(cat / n)), unitOf(b, n + (cat % n)), unitOf(b, 2 * n + (b.regions[cat] as number))];
  return { kind: 'shadow', level: 0, focusUnits, focusCells: [cat], effectCells };
}

export function refSingle(b: RefBoard, st: Uint8Array): HintStep | null {
  for (const u of unitIds(b)) {
    const c = cands(b, st, u);
    if (isOpen(b, st, u) && c.length === 1) {
      const x = c[0] as number;
      return { kind: 'single', level: 1, focusUnits: [unitOf(b, u)], focusCells: [x], effectCells: [], placeCell: x };
    }
  }
  return null;
}

export function refConfinement(b: RefBoard, st: Uint8Array): HintStep | null {
  const n = b.n;
  for (const u of unitIds(b)) {
    const cu = cands(b, st, u);
    if (!isOpen(b, st, u) || cu.length < 2) continue;
    for (let k = 0; k < 3; k++) {
      const v = k * n + kindIndex(n, b.regions, k, cu[0] as number);
      if (v === u) continue;
      if (!cu.every((x) => (b.units[v] ?? []).includes(x))) continue;
      const effectCells = cands(b, st, v).filter((x) => !cu.includes(x));
      if (effectCells.length === 0) continue;
      return {
        kind: u >= 2 * n ? 'confine_region_line' : 'confine_line_region',
        level: 2,
        focusUnits: [unitOf(b, u), unitOf(b, v)],
        focusCells: cu,
        effectCells,
      };
    }
  }
  return null;
}

export function refShadowConflict(b: RefBoard, st: Uint8Array): HintStep | null {
  for (let x = 0; x < b.n * b.n; x++) {
    if (st[x] !== CAND) continue;
    for (const u of unitIds(b)) {
      if (!isOpen(b, st, u) || (b.units[u] ?? []).includes(x)) continue;
      if (cands(b, st, u).every((y) => b.attack[x]?.has(y))) {
        return { kind: 'shadow_conflict', level: 3, focusUnits: [unitOf(b, u)], focusCells: [x], effectCells: [x] };
      }
    }
  }
  return null;
}

/** k-subsets of `items` in lexicographic order. */
function* subsets(items: readonly number[], k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i < items.length; i++) {
    acc.push(items[i] as number);
    yield* subsets(items, k, i + 1, acc);
    acc.pop();
  }
}

/** (A, B) kind pairs in the 03 §5.2 order. */
export const REF_PAIRS: readonly (readonly [number, number])[] = [
  [2, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [0, 1],
  [1, 0],
];

/** L4 with a configurable k bound (default ⌊m/2⌋, 03 §5.2). */
export function refPigeonhole(b: RefBoard, st: Uint8Array, maxK?: (m: number) => number): HintStep | null {
  const n = b.n;
  const openOf = (k: number): number[] => Array.from({ length: n }, (_, j) => j).filter((j) => isOpen(b, st, k * n + j));
  const m = Math.min(openOf(0).length, openOf(1).length, openOf(2).length);
  const bound = maxK ? maxK(m) : Math.floor(m / 2);
  for (let k = 2; k <= bound; k++) {
    for (const [A, B] of REF_PAIRS) {
      for (const S of subsets(openOf(A), k)) {
        const candS = S.flatMap((j) => cands(b, st, A * n + j));
        const T = [...new Set(candS.map((x) => kindIndex(n, b.regions, B, x)))].sort((x, y) => x - y);
        if (T.length !== k) continue;
        const effectCells = T.flatMap((j) => cands(b, st, B * n + j))
          .filter((x) => !candS.includes(x))
          .sort((x, y) => x - y);
        if (effectCells.length === 0) continue;
        return {
          kind: 'pigeonhole',
          level: 4,
          focusUnits: [...S.map((j) => unitOf(b, A * n + j)), ...T.map((j) => unitOf(b, B * n + j))],
          focusCells: [...candS].sort((x, y) => x - y),
          effectCells,
          k,
        };
      }
    }
  }
  return null;
}

export function refApply(st: Uint8Array, step: HintStep): void {
  for (const x of step.effectCells) if (st[x] === CAND) st[x] = ELIM;
  if (step.placeCell !== undefined) st[step.placeCell] = CAT;
}

function shadowAllCats(b: RefBoard, st: Uint8Array): void {
  for (let x = 0; x < st.length; x++) {
    if (st[x] !== CAT) continue;
    for (const y of b.attack[x] ?? []) if (st[y] === CAND) st[y] = ELIM;
  }
}

/** L5 propagation: L0–L4 until nothing changes; returns the contradiction unit or -1. */
export function refPropagate(b: RefBoard, st: Uint8Array): number {
  for (;;) {
    shadowAllCats(b, st);
    if (refContradiction(b, st)) return refContradictionUnit(b, st);
    const step = refSingle(b, st) ?? refConfinement(b, st) ?? refShadowConflict(b, st) ?? refPigeonhole(b, st);
    if (step === null) return -1;
    refApply(st, step);
  }
}

export function refTrial(b: RefBoard, st: Uint8Array): HintStep | null {
  for (let x = 0; x < st.length; x++) {
    if (st[x] !== CAND) continue;
    const copy = st.slice();
    copy[x] = CAT;
    const u = refPropagate(b, copy);
    if (u >= 0) return { kind: 'trial', level: 5, focusUnits: [unitOf(b, u)], focusCells: [x], effectCells: [x] };
  }
  return null;
}

/** The 03 §6 step-3 trace from a state, as a list (applied to a copy). */
export function refTrace(b: RefBoard, start: Uint8Array, maxLevel = 5): { steps: HintStep[]; end: 'solved' | 'stuck' } {
  const st = start.slice();
  const steps: HintStep[] = [];
  const push = (s: HintStep): void => {
    steps.push(s);
    refApply(st, s);
  };
  for (let x = 0; x < st.length; x++) {
    if (st[x] !== CAT) continue;
    const sh = refShadow(b, st, x);
    if (sh) push(sh);
  }
  const finders = [refSingle, refConfinement, refShadowConflict, refPigeonhole, refTrial].slice(0, maxLevel);
  for (;;) {
    if (!st.includes(CAND)) {
      const solved = !refContradiction(b, st) && st.filter((s) => s === CAT).length === b.n;
      return { steps, end: solved ? 'solved' : 'stuck' };
    }
    if (refContradiction(b, st)) return { steps, end: 'stuck' };
    let step: HintStep | null = null;
    for (const f of finders) {
      step = f(b, st);
      if (step) break;
    }
    if (step === null) return { steps, end: 'stuck' };
    push(step);
    if (step.placeCell !== undefined) {
      const sh = refShadow(b, st, step.placeCell);
      if (sh) push(sh);
    }
  }
}

