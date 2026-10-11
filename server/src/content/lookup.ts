// Owner: G4 (Phase 2e). The solution table (spec §1.9.2, D-2e-14) and its lookup rule (critic C-7, C-8).
// For each puzzle id the table holds the SET of every board a client can show for it (pack, substitute,
// device fallback; over every kept content version). The client's `source` and `contentVersion` never
// select a board: a known id must match one of its boards; only ids beyond the table's ranges take the
// unverified path; any other unknown id is `bad_puzzle_id`.
import { dateKeyStart, DAY } from '../core/clock';
import type { PuzzleRef } from '../contract';

/**
 * The generated table (src/content/generated/solutions.ts, built by scripts/build-solutions.ts). `boards`
 * strings hold one entry per id, separated by ","; an entry holds its alternatives separated by "|"; each
 * board is the solution as the client encodes it (`encodeSolution`: the cat's column per row, base 36).
 */
export interface SolutionTableData {
  readonly format: 1;
  /** Content versions the boards cover, the current first (solutions.keepVersions older ones at most). */
  readonly contentVersions: readonly string[];
  /** The generator's version the generated boards came from (cfg.gen.version). */
  readonly gen: string;
  /** Levels first…last: pack boards up to `shipped` (and their substitutes), endless boards after. */
  readonly levels: { readonly first: number; readonly shipped: number; readonly last: number; readonly boards: string };
  /** Dailies first…last (YYYY-MM-DD): pack boards up to `packLast` (and their device fallbacks), generated after. */
  readonly daily: { readonly first: string; readonly packLast: string; readonly last: string; readonly boards: string };
  readonly events: readonly {
    readonly id: string;
    readonly startUtc: string;
    readonly endUtc: string;
    readonly count: number;
    /** The event's lives (rules.hearts, else the default 3): the fish maximum of its wins. */
    readonly lives: number;
    readonly boards: string;
  }[];
}

export type SolutionCheck =
  | { readonly kind: 'match' }
  | { readonly kind: 'mismatch' }
  | { readonly kind: 'beyond' } // past the table's ranges: a king permutation is accepted and flagged
  | { readonly kind: 'unknown' }; // no such puzzle: bad_puzzle_id

export interface EventInfo {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly count: number;
  readonly lives: number;
}

export interface ContentLookup {
  check(ref: PuzzleRef, cats: string): SolutionCheck;
  event(id: string): EventInfo | null;
  knowsVersion(v: string): boolean;
  readonly contentVersions: readonly string[];
  readonly ranges: { readonly levelLast: number; readonly dailyLast: string };
}

/** Splits the table lazily, once per isolate (≈ 1 ms for ≈ 60 KB). */
export function createLookup(t: SolutionTableData): ContentLookup {
  let levels: string[] | null = null;
  let dailies: string[] | null = null;
  const events = new Map<string, { info: EventInfo; boards: string; split: string[] | null }>();
  for (const e of t.events) {
    events.set(e.id, { info: { id: e.id, startMs: Date.parse(e.startUtc), endMs: Date.parse(e.endUtc), count: e.count, lives: e.lives }, boards: e.boards, split: null });
  }
  const dailyFirst = dateKeyStart(t.daily.first);
  const dailyLast = dateKeyStart(t.daily.last);
  const versions = new Set(t.contentVersions);
  const inEntry = (entry: string | undefined, cats: string): SolutionCheck => {
    if (entry === undefined || entry === '') return { kind: 'unknown' };
    for (const b of entry.split('|')) if (b === cats) return { kind: 'match' };
    return { kind: 'mismatch' };
  };
  return {
    contentVersions: t.contentVersions,
    ranges: { levelLast: t.levels.last, dailyLast: t.daily.last },
    check(ref: PuzzleRef, cats: string): SolutionCheck {
      if (ref.mode === 'level') {
        if (ref.level < t.levels.first) return { kind: 'unknown' };
        if (ref.level > t.levels.last) return { kind: 'beyond' };
        levels ??= t.levels.boards.split(',');
        return inEntry(levels[ref.level - t.levels.first], cats);
      }
      if (ref.mode === 'daily') {
        const d = dateKeyStart(ref.date);
        if (Number.isNaN(d) || d < dailyFirst) return { kind: 'unknown' };
        if (d > dailyLast) return { kind: 'beyond' };
        dailies ??= t.daily.boards.split(',');
        return inEntry(dailies[Math.round((d - dailyFirst) / DAY)], cats);
      }
      const e = events.get(ref.eventId);
      if (!e || ref.index >= e.info.count) return { kind: 'unknown' };
      e.split ??= e.boards.split(',');
      return inEntry(e.split[ref.index], cats);
    },
    event(id: string): EventInfo | null {
      return events.get(id)?.info ?? null;
    },
    knowsVersion(v: string): boolean {
      return versions.has(v);
    },
  };
}

/** One cat per row and column, no two touching (the shape every board has; `cats` is base 36). */
export function isKingPermutationString(cats: string): boolean {
  const n = cats.length;
  if (n < 4 || n > 12) return false;
  const seen = new Set<number>();
  let prev = -10;
  for (let r = 0; r < n; r++) {
    const c = parseInt(cats.charAt(r), 36);
    if (!Number.isInteger(c) || c < 0 || c >= n || seen.has(c)) return false;
    if (Math.abs(c - prev) < 2) return false;
    seen.add(c);
    prev = c;
  }
  return true;
}
