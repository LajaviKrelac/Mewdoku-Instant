// Owner: engine
// Human techniques L0–L5 over a knowledge state (03 §5.2). Each finder returns the FIRST productive
// step in the 03 §5.2 scan order as a HintStep (without applying it), or null. PURE.
import { unitFromId } from './geometry';
import {
  bitTables,
  buildView,
  cellsOfMasks,
  contradictionUnitId,
  firstCandOf,
  unitRowMask,
  viewContradiction,
  type View,
} from './masks';
import { findPigeonholeIn } from './pigeonhole';
import type { CellIndex, HintStep, PuzzleTables, Unit } from './types';

/** Per-cell knowledge status (03 §5.1). */
export const KnowledgeStatus = { Elim: 0, Cand: 1, Cat: 2 } as const;
export type KnowledgeStatus = (typeof KnowledgeStatus)[keyof typeof KnowledgeStatus];

/** Knowledge state K: mutable status array over fixed tables. */
export interface Knowledge {
  readonly tables: PuzzleTables;
  readonly status: Uint8Array; // KnowledgeStatus per cell
}

/** K with the given cats placed (no shadow applied) and the given cells eliminated. */
export function createKnowledge(tables: PuzzleTables, cats: readonly CellIndex[], elims: readonly CellIndex[]): Knowledge {
  const status = new Uint8Array(tables.n * tables.n).fill(KnowledgeStatus.Cand);
  for (const x of elims) status[x] = KnowledgeStatus.Elim;
  for (const x of cats) status[x] = KnowledgeStatus.Cat;
  return { tables, status };
}

export function cloneKnowledge(k: Knowledge): Knowledge {
  return { tables: k.tables, status: k.status.slice() };
}

/**
 * Applies a step's effects to K: placeCell → cat, effectCells → elim (candidates only).
 * A 'mistaken_mark' step is about the player's board, not K, and is ignored.
 */
export function applyStep(k: Knowledge, step: HintStep): void {
  if (step.kind === 'mistaken_mark') return;
  for (const x of step.effectCells) if (k.status[x] === KnowledgeStatus.Cand) k.status[x] = KnowledgeStatus.Elim;
  if (step.placeCell !== undefined) k.status[step.placeCell] = KnowledgeStatus.Cat;
}

export function viewOf(k: Knowledge): View {
  return buildView(bitTables(k.tables), k.status);
}

/** Some open unit has no candidate, or a unit holds two cats (03 §5.1). */
export function hasContradiction(k: Knowledge): boolean {
  return viewContradiction(viewOf(k));
}

/** First unit in unit order with no cat and no candidate (the L5 "contradiction unit"). */
export function firstEmptyUnit(k: Knowledge): Unit | null {
  const v = viewOf(k);
  for (let u = 0; u < 3 * v.n; u++) if (v.ccount[u] === 0 && v.ucount[u] === 0) return unitFromId(u, v.n);
  return null;
}

const unitsOfCell = (k: Knowledge, x: CellIndex): Unit[] => {
  const ids = k.tables.unitsOf[x];
  return ids ? ids.map((u) => unitFromId(u, k.tables.n)) : [];
};

/** L0 shadow of the cat at `cat`: its attacked candidates (null when none are left). */
export function shadowStep(k: Knowledge, cat: CellIndex): HintStep | null {
  const effectCells: CellIndex[] = [];
  for (const j of k.tables.attack[cat] ?? []) if (k.status[j] === KnowledgeStatus.Cand) effectCells.push(j);
  if (effectCells.length === 0) return null;
  return { kind: 'shadow', level: 0, focusUnits: unitsOfCell(k, cat), focusCells: [cat], effectCells };
}

/** L1 on a view: the first open unit in unit order with exactly one candidate. */
export function singleIn(v: View): HintStep | null {
  for (let u = 0; u < 3 * v.n; u++) {
    if (v.ccount[u] !== 0 || v.ucount[u] !== 1) continue;
    const cell = firstCandOf(v, u);
    return { kind: 'single', level: 1, focusUnits: [unitFromId(u, v.n)], focusCells: [cell], effectCells: [], placeCell: cell };
  }
  return null;
}

/** L2 on a view (03 §5.2 scan order: units, then target kinds row, column, region). */
export function confinementIn(v: View): HintStep | null {
  const n = v.n;
  const elim = new Int32Array(n);
  for (let u = 0; u < 3 * n; u++) {
    if (v.ccount[u] !== 0 || (v.ucount[u] as number) < 2) continue;
    const x0 = firstCandOf(v, u);
    const targets = [Math.floor(x0 / n), n + (x0 % n), 2 * n + (v.bt.regions[x0] as number)];
    for (const t of targets) {
      if (t === u) continue;
      let inside = true;
      let any = 0;
      for (let r = 0; r < n; r++) {
        const cu = v.uc[u * n + r] as number;
        if (cu & ~unitRowMask(v.bt, t, r)) {
          inside = false;
          break;
        }
        const e = (v.uc[t * n + r] as number) & ~cu;
        elim[r] = e;
        any |= e;
      }
      if (!inside || any === 0) continue;
      return {
        kind: u >= 2 * n ? 'confine_region_line' : 'confine_line_region',
        level: 2,
        focusUnits: [unitFromId(u, n), unitFromId(t, n)],
        focusCells: cellsOfMasks(v.uc, u * n, n),
        effectCells: cellsOfMasks(elim, 0, n),
      };
    }
  }
  return null;
}

/** L3 on a view: candidate x (cell order) whose shadow covers every candidate of an open unit u ∌ x. */
export function shadowConflictIn(v: View): HintStep | null {
  const n = v.n;
  const { attackRows } = v.bt;
  for (let x = 0; x < n * n; x++) {
    if (v.status[x] !== KnowledgeStatus.Cand) continue;
    const xr = Math.floor(x / n);
    const xc = n + (x % n);
    const xg = 2 * n + (v.bt.regions[x] as number);
    for (let u = 0; u < 3 * n; u++) {
      if (v.ccount[u] !== 0 || u === xr || u === xc || u === xg) continue;
      let covered = true;
      for (let r = 0; r < n; r++) {
        if ((v.uc[u * n + r] as number) & ~(attackRows[x * n + r] as number)) {
          covered = false;
          break;
        }
      }
      if (!covered) continue;
      return { kind: 'shadow_conflict', level: 3, focusUnits: [unitFromId(u, n)], focusCells: [x], effectCells: [x] };
    }
  }
  return null;
}

/** L0 for every cat of K (free bookkeeping inside trial propagation). */
function shadowAll(k: Knowledge): void {
  const { status } = k;
  for (let x = 0; x < status.length; x++) {
    if (status[x] !== KnowledgeStatus.Cat) continue;
    for (const j of k.tables.attack[x] ?? []) if (status[j] === KnowledgeStatus.Cand) status[j] = KnowledgeStatus.Elim;
  }
}

/**
 * Propagates K in place with L0–L4 until nothing changes (03 §5.2 L5). Returns the contradiction
 * unit id, or -1 when K reaches a fixpoint without a contradiction.
 */
export function propagate(k: Knowledge): number {
  shadowAll(k);
  for (;;) {
    const v = viewOf(k);
    if (viewContradiction(v)) return contradictionUnitId(v);
    const step = singleIn(v) ?? confinementIn(v) ?? shadowConflictIn(v) ?? findPigeonholeIn(v);
    if (step === null) return -1;
    applyStep(k, step);
    if (step.placeCell !== undefined) {
      const sh = shadowStep(k, step.placeCell);
      if (sh) applyStep(k, sh);
    }
  }
}

/** L5 on K: the first candidate (cell order) whose hypothetical cat propagates to a contradiction. */
export function trialIn(k: Knowledge): HintStep | null {
  const { status } = k;
  for (let x = 0; x < status.length; x++) {
    if (status[x] !== KnowledgeStatus.Cand) continue;
    const copy = cloneKnowledge(k);
    copy.status[x] = KnowledgeStatus.Cat;
    const u = propagate(copy);
    if (u < 0) continue;
    return { kind: 'trial', level: 5, focusUnits: [unitFromId(u, k.tables.n)], focusCells: [x], effectCells: [x] };
  }
  return null;
}

/** L1 single (kind 'single'). */
export function findSingle(k: Knowledge): HintStep | null {
  return singleIn(viewOf(k));
}

/** L2 confinement ('confine_region_line' | 'confine_line_region'). */
export function findConfinement(k: Knowledge): HintStep | null {
  return confinementIn(viewOf(k));
}

/** L3 shadow conflict ('shadow_conflict'). */
export function findShadowConflict(k: Knowledge): HintStep | null {
  return shadowConflictIn(viewOf(k));
}

/** L4 pigeonhole, 2 ≤ k ≤ ⌊m/2⌋ over the six kind pairs ('pigeonhole', with `k`). */
export function findPigeonhole(k: Knowledge): HintStep | null {
  return findPigeonholeIn(viewOf(k));
}

/** L5 one-step trial: propagate with L0–L4 until a contradiction ('trial'). */
export function findTrial(k: Knowledge): HintStep | null {
  return trialIn(k);
}

