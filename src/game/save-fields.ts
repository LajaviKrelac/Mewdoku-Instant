// Owner: C (Phase 2b)
// Save-schema building blocks (04 §4.3, §7.2): value guards, record/slot shape checks, the cells codec
// and the in-progress validation against a puzzle. PURE. Re-exported through save.ts.
// Phase 2c.1 (G1, fish-lives-spec §3.2.3): the in-progress slot's optional level-points fields
// (points, catStreak, scoredRows); a slot without them is still valid (the save stays v3).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.15): SaveData.ext.settingsSeen, the settings-dot marker
// (a finite number ≥ 0, absent = 0; an invalid value is dropped on read; the merge keeps the larger).
import { cfg, type GameConfig } from '../app/config';
import type { Puzzle, PuzzleId } from '../engine/types';
import { CellState, type DailyRecord, type InProgressV2, type LevelBest, type SaveData } from './types';

// ─────────────────────────────── guards ───────────────────────────────

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function isNonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}

/** A whole number 0 … Number.MAX_SAFE_INTEGER (phase2c.1 §3.2.3: the slot's level-points fields). */
export function isNonNegSafeInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
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
/** Event slot id E<eventId>/<i> (phase2b §4.4, §9.1); the event id follows EVENT_ID_RE. */
const EVENT_SLOT_ID_RE = /^E[a-z0-9-]{3,40}\/(0|[1-9]\d{0,3})$/;
/** Event ids (phase2b §4.2). */
export const EVENT_ID_RE = /^[a-z0-9-]{3,40}$/;
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

/**
 * Structural check of a stored slot (types and id format only; the puzzle check is validateInProgress).
 * Phase 2c.1 §3.2.3: the optional points / catStreak / scoredRows are not checked here (a slot without
 * them, or with a bad one, keeps its shape; copySlot drops a bad field).
 */
export function isInProgressShape(x: unknown, mode: InProgressV2['mode']): x is InProgressV2 {
  if (!isRecord(x) || x.mode !== mode || typeof x.id !== 'string') return false;
  if (!(mode === 'level' ? LEVEL_ID_RE : mode === 'daily' ? DAILY_ID_RE : EVENT_SLOT_ID_RE).test(x.id)) return false;
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

/** The optional level-points fields of a slot (phase2c.1 §3.2.3), in their stored order. */
const POINT_FIELDS = ['points', 'catStreak', 'scoredRows'] as const;

/**
 * A copy of a valid slot without unknown fields. Phase 2c.1 §3.2.3: each of points / catStreak /
 * scoredRows is copied only when it is a non-negative safe integer; an invalid one is dropped (and,
 * with `rep`, reported as `<path>.<field>`) while the slot is kept (restoreGame derives it then).
 */
export function copySlot(s: InProgressV2, rep?: string[], path = 'inProgress'): InProgressV2 {
  const out: InProgressV2 = {
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
  for (const k of POINT_FIELDS) {
    const v: unknown = s[k];
    if (v === undefined) continue;
    if (isNonNegSafeInt(v)) out[k] = v;
    else rep?.push(`${path}.${k}`);
  }
  return out;
}

// ─────────────────────────── ext.settingsSeen (phase 2d §1.15) ───────────────────────────

/** The SaveData.ext key of the settings-dot marker (no schema bump: ext is the 04 §4.3 hook). */
export const SETTINGS_SEEN_KEY = 'settingsSeen';

/** A valid marker: a finite number ≥ 0. */
export function isSettingsSeen(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

/**
 * A copy of a stored `ext` with an invalid settingsSeen dropped (reported as `ext.settingsSeen`);
 * every other ext key is kept as it is.
 */
export function readExt(ext: Record<string, unknown>, rep?: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...ext };
  if (SETTINGS_SEEN_KEY in out && !isSettingsSeen(out[SETTINGS_SEEN_KEY])) {
    delete out[SETTINGS_SEEN_KEY];
    rep?.push(`ext.${SETTINGS_SEEN_KEY}`);
  }
  return out;
}

/** The settings version the player has seen (absent or invalid = 0). */
export function settingsSeenOf(save: Pick<SaveData, 'ext'>): number {
  const v = save.ext[SETTINGS_SEEN_KEY];
  return isSettingsSeen(v) ? v : 0;
}

/** The gear's red dot: something in Settings is newer than what the player has seen (settingsDot.version 0: never). */
export function settingsDotOn(save: Pick<SaveData, 'ext'>, c: GameConfig = cfg): boolean {
  return settingsSeenOf(save) < c.settingsDot.version;
}

/** Settings were opened: the marker becomes settingsDot.version (never lowered); the same save when nothing changes. */
export function markSettingsSeen(save: SaveData, c: GameConfig = cfg): SaveData {
  const version = c.settingsDot.version;
  if (!isSettingsSeen(version) || settingsSeenOf(save) >= version) return save;
  return { ...save, ext: { ...save.ext, [SETTINGS_SEEN_KEY]: version } };
}

/**
 * The cloud merge of `ext` (04 §7.3 + phase 2d §1.15): the newer copy's keys, with settingsSeen the
 * larger of the two copies' valid markers (absent when neither has one).
 */
export function mergeExt(local: Pick<SaveData, 'ext'>, cloud: Pick<SaveData, 'ext'>, newer: Pick<SaveData, 'ext'>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...newer.ext };
  const has = (e: Record<string, unknown>): boolean => isSettingsSeen(e[SETTINGS_SEEN_KEY]);
  if (has(local.ext) || has(cloud.ext)) out[SETTINGS_SEEN_KEY] = Math.max(settingsSeenOf(local), settingsSeenOf(cloud));
  else delete out[SETTINGS_SEEN_KEY];
  return out;
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

/** Hearts/revive limits a slot is checked against (cfg values, or a game's RuleFlags). */
export interface SlotLimits {
  readonly heartsPerAttempt: number;
  readonly maxRevives: number;
  readonly heartsOnRevive: number;
}

/** SlotLimits from a config (cfg.hearts.perAttempt, cfg.revive.*). */
export function slotLimitsOf(c: GameConfig = cfg): SlotLimits {
  return { heartsPerAttempt: c.hearts.perAttempt, maxRevives: c.revive.maxPerAttempt, heartsOnRevive: c.revive.heartsRestored };
}

/** 04 §7.2 checks: mode/id, length/chars, Cat/Wrong/Given placement, Wrong count, hearts invariant. */
export function validateInProgress(
  slot: InProgressV2,
  puzzle: Puzzle,
  expect: { mode: InProgressV2['mode']; id: PuzzleId },
  c: GameConfig = cfg,
): SlotCheck {
  return validateSlot(slot, puzzle, expect, slotLimitsOf(c));
}

/** validateInProgress with explicit limits (restoreGame passes the RuleFlags it will play with). */
export function validateSlot(
  slot: InProgressV2,
  puzzle: Puzzle,
  expect: { mode: InProgressV2['mode']; id: PuzzleId },
  lim: SlotLimits,
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
  if (slot.revivesUsed > lim.maxRevives) return fail('revives');
  const expected = lim.heartsPerAttempt + slot.revivesUsed * lim.heartsOnRevive - slot.mistakes;
  if (slot.hearts !== expected || slot.hearts > lim.heartsPerAttempt) return fail('hearts');
  // A revive happens at 0 hearts and sets heartsOnRevive, and hearts only go down afterwards.
  if (slot.revivesUsed > 0 && slot.hearts > lim.heartsOnRevive) return fail('hearts');
  return { ok: true };
}
