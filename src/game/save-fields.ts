// Owner: game
// Save-schema building blocks (04 §4.3, §7.2): value guards, record/slot shape checks, the cells codec
// and the in-progress validation against a puzzle. PURE. Re-exported through save.ts.
import { cfg, type GameConfig } from '../app/config';
import type { Puzzle, PuzzleId } from '../engine/types';
import { CellState, type DailyRecord, type InProgressV1, type LevelBest } from './types';

// ─────────────────────────────── guards ───────────────────────────────

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function isNonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}

export function isPosInt(x: unknown): x is number {
  return isNonNegInt(x) && x >= 1;
}

/** Epoch ms or a duration: finite and ≥ 0. */
export function isTime(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

export const DATE_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const LEVEL_ID_RE = /^L[1-9]\d*$/;
const DAILY_ID_RE = /^D\d{4}-\d{2}-\d{2}$/;
const LEVEL_KEY_RE = /^[1-9]\d*$/;

export function isLevelBest(x: unknown): x is LevelBest {
  return Array.isArray(x) && x.length === 2 && isTime(x[0]) && isNonNegInt(x[1]);
}

export function isDailyRecord(x: unknown): x is DailyRecord {
  return Array.isArray(x) && x.length === 4 && isTime(x[0]) && isNonNegInt(x[1]) && isNonNegInt(x[2]) && isNonNegInt(x[3]);
}

/** Keeps the valid `level → [ms, mistakes]` entries; `dropped` is true when anything was discarded. */
export function readBest(x: unknown): { value: Record<number, LevelBest>; dropped: boolean } {
  return readMap(x, (k) => LEVEL_KEY_RE.test(k), isLevelBest);
}

/** Keeps the valid `YYYY-MM-DD → [ms, mistakes, hints, kitties]` entries. */
export function readDaily(x: unknown): { value: Record<string, DailyRecord>; dropped: boolean } {
  return readMap(x, (k) => DATE_KEY_RE.test(k), isDailyRecord);
}

function readMap<T>(
  x: unknown,
  keyOk: (k: string) => boolean,
  valueOk: (v: unknown) => v is T,
): { value: Record<string, T>; dropped: boolean } {
  if (!isRecord(x)) return { value: {}, dropped: true };
  const value: Record<string, T> = {};
  let dropped = false;
  for (const [k, v] of Object.entries(x)) {
    if (keyOk(k) && valueOk(v)) value[k] = [...(v as unknown as number[])] as unknown as T;
    else dropped = true;
  }
  return { value, dropped };
}

/** Structural check of a stored slot (types and id format only; the puzzle check is validateInProgress). */
export function isInProgressShape(x: unknown, mode: 'level' | 'daily'): x is InProgressV1 {
  if (!isRecord(x) || x.mode !== mode || typeof x.id !== 'string') return false;
  if (!(mode === 'level' ? LEVEL_ID_RE : DAILY_ID_RE).test(x.id)) return false;
  if (typeof x.cells !== 'string' || !/^[0-4]+$/.test(x.cells)) return false;
  const n = Math.round(Math.sqrt(x.cells.length));
  if (n * n !== x.cells.length || n < 4 || n > 12) return false;
  return (
    isNonNegInt(x.hearts) &&
    isNonNegInt(x.revivesUsed) &&
    isNonNegInt(x.mistakes) &&
    isNonNegInt(x.hintsUsed) &&
    isNonNegInt(x.kittiesUsed) &&
    isTime(x.elapsedMs) &&
    isTime(x.savedAt)
  );
}

/** A copy of a valid slot without unknown fields. */
export function copySlot(s: InProgressV1): InProgressV1 {
  return {
    id: s.id,
    mode: s.mode,
    cells: s.cells,
    hearts: s.hearts,
    revivesUsed: s.revivesUsed,
    mistakes: s.mistakes,
    hintsUsed: s.hintsUsed,
    kittiesUsed: s.kittiesUsed,
    elapsedMs: s.elapsedMs,
    savedAt: s.savedAt,
  };
}

// ─────────────────────────────── cells codec ───────────────────────────────

const ZERO = 48; // '0'

/** One char '0'..'4' per cell; also the hint free-reopen cache key (02 §9.1 boardHash). */
export function encodeCells(cells: Readonly<Uint8Array>): string {
  let s = '';
  for (const v of cells) {
    if (v > CellState.Given) throw new RangeError(`encodeCells: bad cell state ${v}`);
    s += String.fromCharCode(ZERO + v);
  }
  return s;
}

/** Inverse of encodeCells. Throws on a wrong length or a char outside '0'..'4'. */
export function decodeCells(s: string, n: number): Uint8Array {
  if (s.length !== n * n) throw new RangeError(`decodeCells: length ${s.length} ≠ ${n * n}`);
  const out = new Uint8Array(n * n);
  for (let i = 0; i < s.length; i++) {
    const v = s.charCodeAt(i) - ZERO;
    if (v < 0 || v > CellState.Given) throw new RangeError(`decodeCells: bad char at ${i}`);
    out[i] = v;
  }
  return out;
}

// ─────────────────────────────── slot vs puzzle (04 §7.2) ───────────────────────────────

export type SlotCheck = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): SlotCheck => ({ ok: false, reason });

/** 04 §7.2 checks: mode/id, length/chars, Cat/Wrong/Given placement, Wrong count, hearts invariant. */
export function validateInProgress(
  slot: InProgressV1,
  puzzle: Puzzle,
  expect: { mode: 'level' | 'daily'; id: PuzzleId },
  c: GameConfig = cfg,
): SlotCheck {
  if (!isRecord(slot)) return fail('shape');
  if (slot.mode !== expect.mode) return fail('mode');
  if (slot.id !== expect.id || puzzle.id !== expect.id) return fail('id');
  const n = puzzle.n;
  if (typeof slot.cells !== 'string' || slot.cells.length !== n * n) return fail('length');
  if (!/^[0-4]*$/.test(slot.cells)) return fail('chars');
  const counters = [slot.hearts, slot.revivesUsed, slot.mistakes, slot.hintsUsed, slot.kittiesUsed];
  if (!counters.every(isNonNegInt) || !isTime(slot.elapsedMs) || !isTime(slot.savedAt)) return fail('counters');

  const givenCells = new Set<number>();
  for (const r of puzzle.givens) givenCells.add(r * n + (puzzle.solution[r] ?? -1));
  let wrong = 0;
  for (let i = 0; i < n * n; i++) {
    const v = slot.cells.charCodeAt(i) - ZERO;
    const onSolution = puzzle.solution[Math.floor(i / n)] === i % n;
    if (givenCells.has(i) !== (v === CellState.Given)) return fail('given');
    if (v === CellState.Cat && !onSolution) return fail('cat');
    if (v === CellState.Wrong) {
      if (onSolution) return fail('wrong');
      wrong++;
    }
  }
  if (wrong !== slot.mistakes) return fail('mistakes');
  if (slot.revivesUsed > c.revive.maxPerAttempt) return fail('revives');
  const expected = c.hearts.perAttempt + slot.revivesUsed * c.revive.heartsRestored - slot.mistakes;
  if (slot.hearts !== expected || slot.hearts > c.hearts.perAttempt) return fail('hearts');
  // A revive happens at 0 hearts and sets heartsRestored, and hearts only go down afterwards.
  if (slot.revivesUsed > 0 && slot.hearts > c.revive.heartsRestored) return fail('hearts');
  return { ok: true };
}
