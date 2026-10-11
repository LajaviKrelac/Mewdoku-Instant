// Owner: G1 (Phase 2e)
// The worldwide daily ranking's client record (docs/phase2e/spec.md §2.3, §2.6, §2.9, §7.1; CONTRACTS §6),
// the part the first load needs: the record's default, the WinSubmission built from a won board and its
// place in the queue (save.ladder.pending: enqueue, union by winId then puzzleId, cap ladder.pendingMax), the
// claim ledger's entries, and the v4 field validation and merge of save.ladder. What only the lazy ladder
// flow uses (aged wins, verdicts, the cached bracket and the counter's "before" value, claims, the repair,
// the result cards, Delete) is in game/ladder-sync.ts, so it ships in the flow's chunk (spec §7.9).
// Honesty (spec §0.4): nothing here creates a row, a rank or a count; the cache keeps the server's own
// numbers only, and a server failure never becomes data.
// PURE: the device clock is passed in; the win id (UUID) is made by the app (game/ has no randomness).
import { cfg, type GameConfig } from '../app/config';
import {
  AVATAR_COUNT,
  BRACKET_ID_RE,
  isWinSubmission,
  NICKNAME_MAX_LENGTH,
  PLAYER_CODE_RE,
  PUZZLE_ID_RE,
  REWARD_ID_RE,
  type BracketView,
  type ClaimView,
  type PuzzleSourceWire,
  type ResultView,
  type WinResult,
  type WinSubmission,
} from '../shared/rank-api';
import type { PuzzleSource } from './levels-repo';
import { isRecord, isTime } from './save-fields';
import type { LadderCurrent, LadderPendingWin, LadderRecord, PuzzleId } from './types';

export type { LadderCurrent, LadderPendingWin, LadderRecord } from './types';

/** The default record (spec §7.1). */
export function emptyLadder(c: GameConfig = cfg): LadderRecord {
  return {
    listed: c.ladder.defaultListed,
    pending: [],
    current: null,
    claimed: [],
    doubleWatched: [],
    resultsSeen: [],
    nickLineSeen: false,
    noticeSeen: false,
    me: null,
  };
}

// ─────────────────────────────── the win sent (spec §2.3) ───────────────────────────────

/** The solved board as the column of the cat in each row, base 36 ("681524073"; n = 4 … 12 uses 0–9, a, b). */
export function encodeSolution(solution: ArrayLike<number>): string {
  let out = '';
  for (let r = 0; r < solution.length; r++) out += (solution[r] ?? 0).toString(36);
  return out;
}

/** The wire source of a puzzle (level, daily and event packs → 'pack'); null for the tutorial. */
export function wireSource(source: PuzzleSource): PuzzleSourceWire | null {
  if (source === 'tutorial') return null;
  if (source === 'generated' || source === 'substitute') return source;
  return 'pack';
}

export interface WinInput {
  readonly winId: string;
  readonly puzzleId: PuzzleId;
  readonly source: PuzzleSource;
  readonly contentVersion: string;
  /** The won board's solution (the column of the cat in each row). */
  readonly solution: ArrayLike<number>;
  /** Fish (lives) kept, ≥ 1 on a win. */
  readonly kept: number;
  readonly mistakes: number;
  readonly revives: number;
  readonly hints: number;
  readonly kitties: number;
  readonly mice: number;
  readonly solveMs: number;
  /** Device clock (informational). */
  readonly playedAt: number;
  readonly clientVersion: string;
}

/**
 * The WinSubmission of a won board (CONTRACTS §2.1), or null when it may never be sent: the tutorial
 * (`T1`, and `L1`, the tutorial's level number), an id outside PUZZLE_ID_RE, or any field the shared
 * validator rejects (a queued win that passes it is never a 400).
 */
export function toWinSubmission(i: WinInput): WinSubmission | null {
  if (!PUZZLE_ID_RE.test(i.puzzleId) || i.puzzleId === 'L1') return null;
  const source = wireSource(i.source);
  if (source === null) return null;
  const w: WinSubmission = {
    winId: i.winId,
    puzzleId: i.puzzleId,
    source,
    contentVersion: i.contentVersion,
    cats: encodeSolution(i.solution),
    fish: Math.floor(i.kept),
    mistakes: Math.max(0, Math.floor(i.mistakes)),
    revives: Math.max(0, Math.floor(i.revives)),
    hints: Math.max(0, Math.floor(i.hints)),
    kitties: Math.max(0, Math.floor(i.kitties)),
    mice: Math.max(0, Math.floor(i.mice)),
    solveMs: Math.max(0, Math.round(i.solveMs)),
    playedAt: Math.max(0, Math.round(i.playedAt)),
    clientVersion: i.clientVersion,
  };
  return isWinSubmission(w) ? w : null;
}

// ─────────────────────────────── the queue (spec §2.9) ───────────────────────────────

/** ladder.pendingMax as a whole number ≥ 1. */
export const pendingMaxOf = (c: GameConfig): number => Math.max(1, Math.floor(c.ladder.pendingMax));

/** Oldest first by queuedAt (stable); unique by winId, then by puzzleId (the first kept); the newest `max`. */
function normQueue(wins: readonly LadderPendingWin[], max: number): LadderPendingWin[] {
  const sorted = wins
    .map((w, i) => ({ w, i }))
    .sort((a, b) => a.w.queuedAt - b.w.queuedAt || a.i - b.i)
    .map((x) => x.w);
  const ids = new Set<string>();
  const puzzles = new Set<string>();
  const out: LadderPendingWin[] = [];
  for (const w of sorted) {
    if (ids.has(w.winId) || puzzles.has(w.puzzleId)) continue;
    ids.add(w.winId);
    puzzles.add(w.puzzleId);
    out.push(w);
  }
  return out.slice(Math.max(0, out.length - max));
}

/**
 * Adds a win to the queue (spec §2.9): a win whose winId or puzzleId is already queued is not added (a
 * counted win is unique per puzzle); past ladder.pendingMax the OLDEST are dropped.
 */
export function enqueueWin(rec: LadderRecord, w: LadderPendingWin, c: GameConfig = cfg): LadderRecord {
  if (rec.pending.some((p) => p.winId === w.winId || p.puzzleId === w.puzzleId)) return rec;
  return { ...rec, pending: normQueue([...rec.pending, w], pendingMaxOf(c)) };
}

/** The WinSubmission part of a queued win (the wire never carries queuedAt). */
export function wireWin(w: LadderPendingWin): WinSubmission {
  const { queuedAt: _q, ...rest } = w;
  return rest;
}

// ─────────────────────────────── the claim ledger's entries (spec §2.6) ───────────────────────────────

const REWARD_ENTRY_RE = /^([0-9a-z]{8,24}:\d{1,3})\|(\d{1,4})\|(\d{1,4})$/;

/** A claimed entry's parts, or null. */
export function parseClaimEntry(entry: string): { rewardId: string; hints: number; kitties: number } | null {
  const m = REWARD_ENTRY_RE.exec(entry);
  if (!m || !REWARD_ID_RE.test(m[1] as string)) return null;
  return { rewardId: m[1] as string, hints: Number(m[2]), kitties: Number(m[3]) };
}

/** Unique valid entries, the newest (last) `keep`. */
export function capList(list: readonly string[], keep: number, ok: (s: string) => boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (typeof s !== 'string' || !ok(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.slice(Math.max(0, out.length - Math.max(1, keep)));
}

// ─────────────────────────────── validation and merge (spec §7.1) ───────────────────────────────

const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

function isPendingWin(x: unknown): x is LadderPendingWin {
  return isRecord(x) && isTime(x.queuedAt) && isWinSubmission(x);
}

function readPendingWin(x: LadderPendingWin): LadderPendingWin {
  return { ...wireWin(x), queuedAt: x.queuedAt };
}

function isCurrent(x: unknown): x is LadderCurrent {
  if (!isRecord(x)) return false;
  return (
    typeof x.bracketId === 'string' &&
    BRACKET_ID_RE.test(x.bracketId) &&
    isTime(x.endsAt) &&
    isInt(x.serverOffsetMs, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) &&
    isTime(x.fetchedAt) &&
    isInt(x.points, 0, Number.MAX_SAFE_INTEGER) &&
    (x.rank === null || isInt(x.rank, 1, 10_000)) &&
    isInt(x.maxMembers, 1, 10_000) &&
    isInt(x.members, 0, x.maxMembers)
  );
}

function isMe(x: unknown): x is NonNullable<LadderRecord['me']> {
  return (
    isRecord(x) &&
    typeof x.name === 'string' &&
    x.name.length >= 1 &&
    x.name.length <= NICKNAME_MAX_LENGTH &&
    isInt(x.avatarId, 0, AVATAR_COUNT - 1) &&
    typeof x.code === 'string' &&
    PLAYER_CODE_RE.test(x.code)
  );
}

/** Reads a string list; invalid entries are dropped and the path reported. */
function readList(x: unknown, keep: number, ok: (s: string) => boolean, path: string, rep: string[]): string[] {
  if (!Array.isArray(x)) {
    rep.push(path);
    return [];
  }
  const out = capList(x as string[], keep, ok);
  if (out.length !== x.length || out.some((s, i) => s !== x[i])) rep.push(path);
  return out;
}

/**
 * Validation of save.ladder (spec §7.1): every invalid field takes its default and is reported to `rep`
 * (save_corrupt); pending wins are each checked with the shared isWinSubmission.
 */
export function readLadder(x: unknown, c: GameConfig, rep: string[]): LadderRecord {
  const def = emptyLadder(c);
  if (!isRecord(x)) {
    rep.push('ladder');
    return def;
  }
  const listed = typeof x.listed === 'boolean' ? x.listed : (rep.push('ladder.listed'), def.listed);
  let pending: LadderPendingWin[] = [];
  if (Array.isArray(x.pending)) {
    const valid = (x.pending as unknown[]).filter(isPendingWin).map(readPendingWin);
    pending = normQueue(valid, pendingMaxOf(c));
    if (pending.length !== x.pending.length) rep.push('ladder.pending');
  } else rep.push('ladder.pending');
  let current: LadderCurrent | null = null;
  if (x.current !== null && x.current !== undefined) {
    if (isCurrent(x.current)) {
      const k = x.current;
      current = {
        bracketId: k.bracketId,
        endsAt: k.endsAt,
        serverOffsetMs: k.serverOffsetMs,
        fetchedAt: k.fetchedAt,
        points: k.points,
        rank: k.rank,
        members: k.members,
        maxMembers: k.maxMembers,
      };
    } else rep.push('ladder.current');
  } else if (x.current === undefined) rep.push('ladder.current');
  const claimed = readList(x.claimed, c.ladder.claimedKept, (s) => parseClaimEntry(s) !== null, 'ladder.claimed', rep);
  const doubleWatched = readList(x.doubleWatched, c.ladder.doubleWatchedKept, (s) => REWARD_ID_RE.test(s), 'ladder.doubleWatched', rep);
  const resultsSeen = readList(x.resultsSeen, c.ladder.resultsSeenKept, (s) => BRACKET_ID_RE.test(s), 'ladder.resultsSeen', rep);
  const nickLineSeen = typeof x.nickLineSeen === 'boolean' ? x.nickLineSeen : (rep.push('ladder.nickLineSeen'), false);
  // Added after the first v4 drafts: a copy without it is not corrupt (false), a wrong type is.
  const noticeSeen = typeof x.noticeSeen === 'boolean' ? x.noticeSeen : (x.noticeSeen !== undefined && rep.push('ladder.noticeSeen'), false);
  let me: LadderRecord['me'] = null;
  if (x.me !== null && x.me !== undefined) {
    if (isMe(x.me)) me = { name: x.me.name, avatarId: x.me.avatarId, code: x.me.code };
    else rep.push('ladder.me');
  } else if (x.me === undefined) rep.push('ladder.me');
  return { listed, pending, current, claimed, doubleWatched, resultsSeen, nickLineSeen, noticeSeen, me };
}

/** Union keeping the older copy's entries that the newer lacks first, then the newer's; the newest `keep`. */
function unionList(older: readonly string[], newer: readonly string[], keep: number, ok: (s: string) => boolean): string[] {
  const inNewer = new Set(newer);
  return capList([...older.filter((s) => !inNewer.has(s)), ...newer], keep, ok);
}

/**
 * The §7.1 merge rows of save.ladder: listed and me from the newer copy; pending = the union by winId,
 * then puzzleId (oldest dropped past ladder.pendingMax); current = the later fetchedAt; claimed,
 * doubleWatched, resultsSeen = unions (capped); nickLineSeen and noticeSeen = OR. `repairPaidGrants` (purchases.ts)
 * re-applies the grants of claimed entries only the older copy holds.
 */
export function mergeLadder(local: LadderRecord, cloud: LadderRecord, newer: LadderRecord, c: GameConfig = cfg): LadderRecord {
  const older = newer === local ? cloud : local;
  const a = local.current;
  const b = cloud.current;
  const current = a === null ? b : b === null ? a : b.fetchedAt > a.fetchedAt ? b : a;
  return {
    listed: newer.listed,
    pending: normQueue([...local.pending, ...cloud.pending], pendingMaxOf(c)),
    current,
    claimed: unionList(older.claimed, newer.claimed, c.ladder.claimedKept, (s) => parseClaimEntry(s) !== null),
    doubleWatched: unionList(older.doubleWatched, newer.doubleWatched, c.ladder.doubleWatchedKept, (s) => REWARD_ID_RE.test(s)),
    resultsSeen: unionList(older.resultsSeen, newer.resultsSeen, c.ladder.resultsSeenKept, (s) => BRACKET_ID_RE.test(s)),
    nickLineSeen: local.nickLineSeen || cloud.nickLineSeen,
    noticeSeen: local.noticeSeen || cloud.noticeSeen,
    me: newer.me,
  };
}
