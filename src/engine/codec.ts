// Owner: read-only (Phase 2b; was engine)
// LevelRecord ⇄ Puzzle, canonical labels, base-36 solutions, structural validation (03 §9). PURE.
import type { DailyPack, Grade, LevelPack, LevelRecord, Puzzle, PuzzleId, RecordCheck } from './types';

/** Region letters A..L for labels 0..11 (03 §9.1). */
export const REGION_ALPHABET = 'ABCDEFGHIJKL';

/** Board sizes the engine accepts (03 §1.1). */
export const MIN_N = 4;
export const MAX_N = 12;

/** Relabels regions by first appearance in row-major order (03 §2). Returns a new array. */
export function canonicalLabels(regions: Uint8Array): Uint8Array {
  const map = new Int16Array(256).fill(-1);
  const out = new Uint8Array(regions.length);
  let next = 0;
  for (let i = 0; i < regions.length; i++) {
    const g = regions[i] as number;
    if ((map[g] as number) < 0) map[g] = next++;
    out[i] = map[g] as number;
  }
  return out;
}

/** n·n region letters, canonical labels (03 §9.1 `r`). */
export function encodeRegions(regions: Uint8Array): string {
  const canon = canonicalLabels(regions);
  let s = '';
  for (let i = 0; i < canon.length; i++) {
    const ch = REGION_ALPHABET[canon[i] as number];
    if (ch === undefined) throw new RangeError('encodeRegions: more than 12 regions');
    s += ch;
  }
  return s;
}

export function decodeRegions(r: string, n: number): Uint8Array {
  if (r.length !== n * n) throw new RangeError(`decodeRegions: expected ${n * n} letters, got ${r.length}`);
  const out = new Uint8Array(n * n);
  for (let i = 0; i < r.length; i++) {
    const g = REGION_ALPHABET.indexOf(r.charAt(i));
    if (g < 0 || g >= n) throw new RangeError(`decodeRegions: bad letter '${r.charAt(i)}' at ${i}`);
    out[i] = g;
  }
  return out;
}

/** n base-36 digits: the column of the cat in each row (03 §9.1 `s`). */
export function encodeSolution(solution: Uint8Array): string {
  let s = '';
  for (let r = 0; r < solution.length; r++) s += (solution[r] as number).toString(36);
  return s;
}

function base36Digit(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 122) return code - 87; // a-z
  return -1;
}

export function decodeSolution(s: string, n: number): Uint8Array {
  if (s.length !== n) throw new RangeError(`decodeSolution: expected ${n} digits, got ${s.length}`);
  const out = new Uint8Array(n);
  for (let r = 0; r < n; r++) {
    const c = base36Digit(s.charAt(r));
    if (c < 0 || c >= n) throw new RangeError(`decodeSolution: bad digit '${s.charAt(r)}' in row ${r}`);
    out[r] = c;
  }
  return out;
}

/** Rows whose cat is a Given, from the optional base-36 `gv` field. */
export function decodeGivens(gv: string | undefined): number[] {
  const out: number[] = [];
  if (!gv) return out;
  for (let i = 0; i < gv.length; i++) {
    const r = base36Digit(gv.charAt(i));
    if (r < 0) throw new RangeError(`decodeGivens: bad digit '${gv.charAt(i)}'`);
    out.push(r);
  }
  return out;
}

/** Permutation with |p[r] − p[r+1]| ≥ 2 (03 §1.1). */
export function isKingPermutation(solution: Uint8Array, n: number): boolean {
  if (solution.length !== n) return false;
  let used = 0;
  for (let r = 0; r < n; r++) {
    const c = solution[r] as number;
    if (c >= n || (used >> c) & 1) return false;
    used |= 1 << c;
    if (r > 0 && Math.abs(c - (solution[r - 1] as number)) < 2) return false;
  }
  return true;
}

/** Every region non-empty and 4-connected (03 §1.1). */
export function isConnectedPartition(n: number, regions: Uint8Array): boolean {
  const total = n * n;
  if (regions.length !== total) return false;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  let regionsFound = 0;
  for (let start = 0; start < total; start++) {
    const g = regions[start] as number;
    if (g >= n) return false;
    if (seen[start]) continue;
    // First cell of label g in row-major order: flood its component, then it must be the only one.
    if ((regionsFound >> g) & 1) return false; // a second component of the same label
    regionsFound |= 1 << g;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp > 0) {
      const i = stack[--sp] as number;
      const r = Math.floor(i / n);
      const c = i % n;
      if (r > 0) sp = visit(i - n, g, regions, seen, stack, sp);
      if (r < n - 1) sp = visit(i + n, g, regions, seen, stack, sp);
      if (c > 0) sp = visit(i - 1, g, regions, seen, stack, sp);
      if (c < n - 1) sp = visit(i + 1, g, regions, seen, stack, sp);
    }
  }
  return regionsFound === (1 << n) - 1;
}

function visit(j: number, g: number, regions: Uint8Array, seen: Uint8Array, stack: Int32Array, sp: number): number {
  if (seen[j] || regions[j] !== g) return sp;
  seen[j] = 1;
  stack[sp] = j;
  return sp + 1;
}

const fail = (reason: string): RecordCheck => ({ ok: false, reason });

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Client-side structural check (03 §9.4): lengths, labels A..A+n−1, king permutation, distinct cat
 * regions. Also rejects non-canonical labels, disconnected regions and malformed optional fields.
 */
export function checkRecord(rec: unknown): RecordCheck {
  if (!isObject(rec)) return fail('not an object');
  const { n, r, s, g, e, h, gv, tut, i } = rec;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < MIN_N || n > MAX_N) return fail('bad n');
  if (typeof r !== 'string' || r.length !== n * n) return fail('bad r length');
  if (typeof s !== 'string' || s.length !== n) return fail('bad s length');
  if (typeof g !== 'number' || !Number.isInteger(g) || g < 1 || g > 5) return fail('bad g');
  if (typeof e !== 'number' || !Number.isInteger(e) || e < 0) return fail('bad e');
  if (h !== 0 && h !== 1) return fail('bad h');
  if (tut !== undefined && tut !== 0 && tut !== 1) return fail('bad tut');
  if (i !== undefined && (typeof i !== 'number' || !Number.isInteger(i) || i < 1)) return fail('bad i');
  let regions: Uint8Array;
  let sol: Uint8Array;
  try {
    regions = decodeRegions(r, n);
    sol = decodeSolution(s, n);
  } catch {
    return fail('bad letters or digits');
  }
  let present = 0;
  for (let k = 0; k < regions.length; k++) present |= 1 << (regions[k] as number);
  if (present !== (1 << n) - 1) return fail('labels do not cover A..A+n-1');
  if (encodeRegions(regions) !== r) return fail('labels not canonical');
  if (!isConnectedPartition(n, regions)) return fail('region not connected');
  if (!isKingPermutation(sol, n)) return fail('s is not a king permutation');
  let catRegions = 0;
  for (let row = 0; row < n; row++) catRegions |= 1 << (regions[row * n + (sol[row] as number)] as number);
  if (catRegions !== (1 << n) - 1) return fail('cat regions not distinct');
  if (gv !== undefined) {
    if (typeof gv !== 'string') return fail('bad gv');
    let rows: number[];
    try {
      rows = decodeGivens(gv);
    } catch {
      return fail('bad gv');
    }
    let seen = 0;
    for (const row of rows) {
      if (row >= n || (seen >> row) & 1) return fail('bad gv');
      seen |= 1 << row;
    }
  }
  return { ok: true };
}

/** Decodes a validated record. Throws on a malformed record (callers run checkRecord first). */
export function recordToPuzzle(rec: LevelRecord, id: PuzzleId): Puzzle {
  const check = checkRecord(rec);
  if (!check.ok) throw new Error(`recordToPuzzle(${id}): ${check.reason}`);
  return {
    id,
    n: rec.n,
    k: 1,
    regions: decodeRegions(rec.r, rec.n),
    solution: decodeSolution(rec.s, rec.n),
    givens: decodeGivens(rec.gv),
    grade: rec.g,
    effort: rec.e,
    hard: rec.h === 1,
  };
}

/** Encodes a puzzle; `level` fills `i` (omit for daily records). */
export function puzzleToRecord(p: Puzzle, level?: number): LevelRecord {
  const rec: LevelRecord = {
    n: p.n,
    r: encodeRegions(p.regions),
    s: encodeSolution(p.solution),
    g: p.grade as Grade,
    e: p.effort,
    h: p.hard ? 1 : 0,
  };
  const out: LevelRecord = level === undefined ? rec : { i: level, ...rec };
  if (p.givens.length > 0) out.gv = p.givens.map((row) => row.toString(36)).join('');
  return out;
}

/** Shallow container check (03 §9.2): v === 1, kind, arrays present. Records are checked separately. */
export function isLevelPack(x: unknown): x is LevelPack {
  return (
    isObject(x) &&
    x.v === 1 &&
    x.kind === 'levels' &&
    typeof x.first === 'number' &&
    typeof x.count === 'number' &&
    typeof x.gen === 'string' &&
    Array.isArray(x.levels)
  );
}

export function isDailyPack(x: unknown): x is DailyPack {
  return (
    isObject(x) &&
    x.v === 1 &&
    x.kind === 'daily' &&
    typeof x.month === 'string' &&
    typeof x.gen === 'string' &&
    isObject(x.days)
  );
}
