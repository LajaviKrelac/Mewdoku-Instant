// Owner: game
// Puzzle source (04 §3, §8): bundled pack-000, fetched packs 1–9, daily months, worker generation for
// endless levels, missing daily months and substitute boards. All I/O is injected, so this module stays
// free of fetch/Worker/timers and is unit-testable. Vite asset wiring lives in level-assets.ts.
import { cfg, type GameConfig } from '../app/config';
import { checkRecord, isDailyPack, isLevelPack, recordToPuzzle } from '../engine/codec';
import type { DailyPack, GenResult, GenSpec, LevelPack, LevelRecord, Puzzle, PuzzleId } from '../engine/types';
import {
  dailyMonthOf,
  dailyPuzzleId,
  dailyRecordIn,
  dailySpec,
  endlessRetrySpec,
  endlessSpec,
  isEndless,
  isHard,
  levelPuzzleId,
  levelRecordIn,
  packFirstLevel,
  packIndexFor,
  packsToPrefetch,
  substituteSpec,
} from './progression';
import { DATE_KEY_RE } from './save-fields';
import { tutorialPuzzle } from './tutorial';

export type PuzzleSource = 'tutorial' | 'pack' | 'daily_pack' | 'generated' | 'substitute';

export interface LoadedPuzzle {
  readonly puzzle: Puzzle;
  readonly source: PuzzleSource;
}

export interface LevelsRepoDeps {
  /** pack-000, imported as JSON so the first levels need no fetch. */
  readonly bundled: LevelPack;
  /**
   * Fetches and parses pack k (1..9). Rejects on network/parse failure (retried with backoff).
   * May resolve null when no file exists for k (content not generated): no retry, substitute at once.
   */
  loadPack(packIndex: number): Promise<unknown>;
  /** Fetches and parses daily/YYYY-MM.json; resolves null when no file exists for that month. */
  loadDailyMonth(month: string): Promise<unknown | null>;
  /** Engine worker generate(spec). */
  generate(spec: GenSpec): Promise<GenResult>;
  /** Backoff between pack retries (cfg.levels.fetchRetryDelaysMs). */
  delay(ms: number): Promise<void>;
  /** Analytics hook: `pack_fallback` with `where` (corrupt record, failed fetch, failed generation). */
  onFallback?(where: string): void;
  /** Config variant (tests); defaults to cfg. */
  readonly config?: GameConfig;
}

export interface LevelsRepo {
  /** The tutorial board (Level 1). */
  getTutorial(): Puzzle;
  /** Level L ≥ 2: pack record, endless generation (L > shipped) or a substitute board after 2 retries. */
  getLevel(level: number): Promise<LoadedPuzzle>;
  /** Daily for YYYY-MM-DD: the month pack, else generated from the daily seed. */
  getDaily(dateKey: string): Promise<LoadedPuzzle>;
  /** Resolves when the pack holding `level` is loaded (boot: pack-000 is instant). Never rejects. */
  ensurePackFor(level: number): Promise<void>;
  /** Background prefetch: packs per 03 §9.3, and endless L+1 generation (kept in memory). */
  prefetch(level: number): void;
  /** Synchronous cache lookup (null when not loaded yet). */
  peekLevel(level: number): Puzzle | null;
}

/** `where` values passed to onFallback (02 §20 pack_fallback). */
export type FallbackWhere =
  | 'pack_fetch'
  | 'pack_missing'
  | 'pack_invalid'
  | 'record'
  | 'daily_fetch'
  | 'daily_invalid'
  | 'daily_record'
  | 'generate';

type PackResult = { pack: LevelPack } | { pack: null; reason: FallbackWhere };

export function createLevelsRepo(deps: LevelsRepoDeps): LevelsRepo {
  const c = deps.config ?? cfg;
  const packs = new Map<number, LevelPack>(); // loaded and structurally valid
  const pendingPacks = new Map<number, Promise<PackResult>>();
  const puzzles = new Map<number, Puzzle>(); // decoded pack levels and generated endless levels
  const endless = new Map<number, Promise<Puzzle>>();
  const substitutes = new Map<number, Promise<Puzzle>>(); // memory only, never in `puzzles`
  const months = new Map<string, Promise<DailyPack | null>>();
  const dailies = new Map<string, LoadedPuzzle>();

  const bundledOk = isPackFor(deps.bundled, 0);
  if (bundledOk) packs.set(0, deps.bundled);

  function fallback(where: FallbackWhere): void {
    try {
      deps.onFallback?.(where);
    } catch {
      // analytics must never break level loading
    }
  }

  function isPackFor(x: unknown, k: number): x is LevelPack {
    return isLevelPack(x) && x.first === packFirstLevel(k, c);
  }

  async function fetchPack(k: number): Promise<PackResult> {
    const delays = c.levels.fetchRetryDelaysMs;
    for (let attempt = 0; ; attempt++) {
      try {
        const raw = await deps.loadPack(k);
        if (raw === null || raw === undefined) return { pack: null, reason: 'pack_missing' };
        // A file that parsed but is wrong will not fix itself on retry.
        return isPackFor(raw, k) ? { pack: raw } : { pack: null, reason: 'pack_invalid' };
      } catch {
        if (attempt >= delays.length) return { pack: null, reason: 'pack_fetch' };
        await deps.delay(delays[attempt] ?? 0);
      }
    }
  }

  /** Shared in-flight load per pack; a failed load is forgotten so the next call tries again. */
  function packFor(k: number): Promise<PackResult> {
    const have = packs.get(k);
    if (have) return Promise.resolve({ pack: have });
    if (k === 0) return Promise.resolve({ pack: null, reason: 'pack_invalid' }); // bundled pack-000 is broken
    let p = pendingPacks.get(k);
    if (!p) {
      p = fetchPack(k)
        .catch((): PackResult => ({ pack: null, reason: 'pack_fetch' }))
        .then((res) => {
          pendingPacks.delete(k);
          if (res.pack) packs.set(k, res.pack);
          return res;
        });
      pendingPacks.set(k, p);
    }
    return p;
  }

  /** Decodes and caches level L from a loaded pack; null when the record is missing or corrupt. */
  function decodeLevel(pack: LevelPack, level: number): Puzzle | null {
    const cached = puzzles.get(level);
    if (cached) return cached;
    const rec = levelRecordIn(pack, level);
    if (!rec || !checkRecord(rec).ok) return null;
    const puzzle = recordToPuzzle(rec, levelPuzzleId(level));
    puzzles.set(level, puzzle);
    return puzzle;
  }

  /** generate(spec); on max_attempts once more with the widened retry spec (02 §11.4). Rejects on failure. */
  async function generatePuzzle(spec: GenSpec, id: PuzzleId, extra: Partial<LevelRecord>): Promise<Puzzle> {
    let res = await deps.generate(spec);
    if (!res.ok) res = await deps.generate(endlessRetrySpec(spec));
    if (!res.ok) throw new Error(`generation failed for ${id} (${spec.seed})`);
    return recordToPuzzle({ ...res.record, ...extra }, id);
  }

  function memo(map: Map<number, Promise<Puzzle>>, level: number, make: () => Promise<Puzzle>): Promise<Puzzle> {
    let p = map.get(level);
    if (!p) {
      p = make().catch((err: unknown) => {
        map.delete(level);
        fallback('generate');
        throw err;
      });
      map.set(level, p);
    }
    return p;
  }

  function endlessPuzzle(level: number): Promise<Puzzle> {
    const done = puzzles.get(level);
    if (done) return Promise.resolve(done);
    return memo(endless, level, async () => {
      const extra = { i: level, h: isHard(level, c) ? (1 as const) : (0 as const) };
      const puzzle = await generatePuzzle(endlessSpec(level, c), levelPuzzleId(level), extra);
      puzzles.set(level, puzzle);
      return puzzle;
    });
  }

  function substitutePuzzle(level: number): Promise<Puzzle> {
    return memo(substitutes, level, () => {
      const extra = { i: level, h: isHard(level, c) ? (1 as const) : (0 as const) };
      return generatePuzzle(substituteSpec(level, c), levelPuzzleId(level), extra);
    });
  }

  async function getLevel(level: number): Promise<LoadedPuzzle> {
    if (!Number.isInteger(level) || level < 1) throw new RangeError(`getLevel: bad level ${level}`);
    if (level === 1) return { puzzle: tutorialPuzzle(), source: 'tutorial' };
    if (isEndless(level, c)) return { puzzle: await endlessPuzzle(level), source: 'generated' };
    const res = await packFor(packIndexFor(level, c) ?? 0);
    if (res.pack) {
      const puzzle = decodeLevel(res.pack, level);
      if (puzzle) return { puzzle, source: 'pack' };
      fallback('record');
    } else {
      fallback(res.reason);
    }
    return { puzzle: await substitutePuzzle(level), source: 'substitute' };
  }

  /** The month's pack; null when there is none (or it is invalid); undefined when the network failed. */
  async function fetchMonth(month: string): Promise<DailyPack | null | undefined> {
    const delays = c.levels.fetchRetryDelaysMs;
    for (let attempt = 0; ; attempt++) {
      try {
        const raw = await deps.loadDailyMonth(month);
        if (raw === null || raw === undefined) return null;
        if (isDailyPack(raw) && raw.month === month) return raw;
        fallback('daily_invalid');
        return null;
      } catch {
        if (attempt >= delays.length) {
          fallback('daily_fetch');
          return undefined;
        }
        await deps.delay(delays[attempt] ?? 0);
      }
    }
  }

  async function getDaily(dateKey: string): Promise<LoadedPuzzle> {
    if (!DATE_KEY_RE.test(dateKey)) throw new RangeError(`getDaily: bad date key ${dateKey}`);
    const cached = dailies.get(dateKey);
    if (cached) return cached;
    const month = dailyMonthOf(dateKey);
    let pending = months.get(month);
    if (!pending) {
      const p: Promise<DailyPack | null> = fetchMonth(month)
        .catch(() => undefined)
        .then((pack) => {
          if (pack === undefined && months.get(month) === p) months.delete(month); // try the network again next time
          return pack ?? null;
        });
      months.set(month, (pending = p));
    }
    const pack = await pending;
    const id = dailyPuzzleId(dateKey);
    const rec = pack ? dailyRecordIn(pack, dateKey) : null;
    let loaded: LoadedPuzzle | null = null;
    if (rec !== null) {
      if (checkRecord(rec).ok) loaded = { puzzle: recordToPuzzle(rec, id), source: 'daily_pack' };
      else fallback('daily_record');
    }
    if (!loaded) {
      const puzzle = await generatePuzzle(dailySpec(dateKey, c), id, { h: 0 }).catch((err: unknown) => {
        fallback('generate');
        throw err;
      });
      loaded = { puzzle, source: 'generated' };
    }
    dailies.set(dateKey, loaded);
    return loaded;
  }

  return {
    getTutorial: tutorialPuzzle,
    getLevel,
    getDaily,
    async ensurePackFor(level: number): Promise<void> {
      const k = packIndexFor(level, c);
      if (k === null || k === 0) return;
      try {
        await packFor(k);
      } catch {
        // never rejects; getLevel falls back to a substitute board
      }
    },
    prefetch(level: number): void {
      for (const k of packsToPrefetch(level, c)) void packFor(k).catch(() => undefined);
      const next = level + 1;
      if (Number.isInteger(next) && isEndless(next, c)) void endlessPuzzle(next).catch(() => undefined);
    },
    peekLevel(level: number): Puzzle | null {
      if (level === 1) return tutorialPuzzle();
      const cached = puzzles.get(level);
      if (cached) return cached;
      const k = packIndexFor(level, c);
      const pack = k === null ? undefined : packs.get(k);
      return pack ? decodeLevel(pack, level) : null;
    },
  };
}
