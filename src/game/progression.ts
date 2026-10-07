// Owner: game
// Level numbers → packs and puzzle ids, hard levels, endless/substitute/daily GenSpecs, daily unlock,
// local date keys (02 §11, §12; 03 §8–9). PURE: the current time is always passed in.
import { cfg, type GameConfig } from '../app/config';
import type { DailyPack, GenSpec, GradeBand, LevelPack, LevelRecord, PuzzleId, SizeWeight } from '../engine/types';
import {
  bandFor,
  breatherBand,
  breatherPool,
  dailySlotFor,
  ENDLESS_ROW,
  isHardLevel,
  makeGenSpec,
  rampRowFor,
  RETRY_BAND,
  allowG5Steps,
  SEEDS,
  shapeLimits,
  weekdayOfDateKey,
  type RampRow,
} from './ramp';
import { DATE_KEY_RE } from './save-fields';
import type { SaveDataV1 } from './types';

/** Level L is Hard iff L ≥ 30 && L % 10 === 0 (delegates to ramp.isHardLevel). */
export function isHard(level: number, c: GameConfig = cfg): boolean {
  return isHardLevel(level, c);
}

/** 'T1' for level 1 (the tutorial), else `L${level}`. */
export function levelPuzzleId(level: number): PuzzleId {
  return level === 1 ? 'T1' : `L${level}`;
}

/** `D${dateKey}`. */
export function dailyPuzzleId(dateKey: string): PuzzleId {
  return `D${dateKey}`;
}

/** YYYY-MM-DD for a daily id, else null. */
export function dateKeyOf(id: PuzzleId): string | null {
  if (typeof id !== 'string' || id[0] !== 'D') return null;
  const key = id.slice(1);
  return DATE_KEY_RE.test(key) ? key : null;
}

/** Number of shipped pack files: ceil(levels.shipped / packSize). */
export function packCount(c: GameConfig = cfg): number {
  return Math.ceil(c.levels.shipped / c.levels.packSize);
}

/** 0-based pack index holding level L (pack k = levels k·packSize+1 …); null past levels.shipped. */
export function packIndexFor(level: number, c: GameConfig = cfg): number | null {
  if (!Number.isInteger(level) || level < 1 || level > c.levels.shipped) return null;
  return Math.floor((level - 1) / c.levels.packSize);
}

/** First level of pack k. */
export function packFirstLevel(packIndex: number, c: GameConfig = cfg): number {
  return packIndex * c.levels.packSize + 1;
}

/**
 * Packs to have loaded at level L (03 §9.3): the pack holding L, plus every later pack k whose
 * first(k) − prefetchAhead ≤ L. Pack 0 is bundled and never listed. Endless levels need none.
 */
export function packsToPrefetch(level: number, c: GameConfig = cfg): number[] {
  const current = packIndexFor(level, c);
  if (current === null) return [];
  const out: number[] = current > 0 ? [current] : [];
  for (let k = current + 1; k < packCount(c); k++) {
    if (packFirstLevel(k, c) - c.levels.prefetchAhead <= level) out.push(k);
    else break;
  }
  return out;
}

/**
 * Level L's record in a loaded pack (level → record): by position `L − first` when that record's `i`
 * agrees (or is absent), else by searching `i`. Null when the pack does not hold L.
 */
export function levelRecordIn(pack: LevelPack, level: number): LevelRecord | null {
  if (level < pack.first || level >= pack.first + pack.levels.length) {
    return pack.levels.find((r) => r.i === level) ?? null;
  }
  const byPos = pack.levels[level - pack.first];
  if (byPos && (byPos.i === undefined || byPos.i === level)) return byPos;
  return pack.levels.find((r) => r.i === level) ?? null;
}

/** "YYYY-MM" of a date key: the daily month file that holds it (03 §8.6). */
export function dailyMonthOf(dateKey: string): string {
  if (!DATE_KEY_RE.test(dateKey)) throw new RangeError(`dailyMonthOf: bad date key ${dateKey}`);
  return dateKey.slice(0, 7);
}

/** The record for a date in a loaded month pack (daily date → record), or null. */
export function dailyRecordIn(pack: DailyPack, dateKey: string): LevelRecord | null {
  if (pack.month !== dateKey.slice(0, 7)) return null;
  const rec: unknown = Object.prototype.hasOwnProperty.call(pack.days, dateKey) ? pack.days[dateKey] : undefined;
  return rec === undefined ? null : (rec as LevelRecord);
}

/** L > levels.shipped: generated on the device (02 §11.4). */
export function isEndless(level: number, c: GameConfig = cfg): boolean {
  return level > c.levels.shipped;
}

/**
 * Pool and band of a level slot from the ramp table (02 §11.2 steps 1–2): the hard column for Hard
 * levels; after a Hard level, a breather (smallest ⌈k/2⌉ sizes, band narrowed to its lowest grade).
 * The no-three-in-a-row rule needs the previous boards, so it is not applied at runtime (02 §11.4).
 */
export function slotPoolAndBand(
  level: number,
  c: GameConfig = cfg,
  row: RampRow = rampRowFor(level),
): { pool: SizeWeight[]; band: GradeBand } {
  const hard = isHardLevel(level, c);
  const breather = !hard && level > 1 && isHardLevel(level - 1, c);
  const pool = breather ? breatherPool(row.sizes) : [...row.sizes];
  const band = bandFor(row, hard);
  return { pool, band: breather ? breatherBand(band) : band };
}

/**
 * Adds the runtime generator tuning from cfg.gen and, for a sizePool spec, the per-size shape limits
 * (03 §4.5) for every size the first draw can pick, so a drawn n gets its own minRegion/maxRegion.
 */
function tuned(spec: GenSpec, level: number | null, c: GameConfig): GenSpec {
  const out: GenSpec = { ...spec, edenOneIn: c.gen.edenOneIn, repairMaxIter: c.gen.repairMaxIter };
  if (!spec.sizePool) return out;
  const sizeLimits = spec.sizePool.map(([n]): readonly [number, number, number] => {
    const lim = shapeLimits(n, level, false, c);
    return [n, lim.minRegion, lim.maxRegion];
  });
  return { ...out, sizeLimits };
}

/** Endless level spec: seed level:v1:L, sizePool of the last ramp row, hard/breather bands (02 §11.4). */
export function endlessSpec(level: number, c: GameConfig = cfg): GenSpec {
  const { pool, band } = slotPoolAndBand(level, c, ENDLESS_ROW);
  return tuned(makeGenSpec({ n: 0, seed: SEEDS.level(level), band, level, sizePool: pool }, c), level, c);
}

/** Retry spec after maxAttempts failures: seed `${seed}:r1`, band G1–G5, still ≤ 1 G5 step (02 §11.4). */
export function endlessRetrySpec(spec: GenSpec): GenSpec {
  return { ...spec, seed: SEEDS.retry(spec.seed), gradeBand: RETRY_BAND, allowG5Steps: allowG5Steps(RETRY_BAND) };
}

/** Substitute board when a pack cannot load: seed fallback:v1:L, the slot's size pool and band (02 §11.4). */
export function substituteSpec(level: number, c: GameConfig = cfg): GenSpec {
  const { pool, band } = slotPoolAndBand(level, c);
  return tuned(makeGenSpec({ n: 0, seed: SEEDS.fallback(level), band, level, sizePool: pool }, c), level, c);
}

/** Daily spec: seed daily:v1:date, n and band from the weekday table (02 §12). */
export function dailySpec(dateKey: string, c: GameConfig = cfg): GenSpec {
  const slot = dailySlotFor(dateKey);
  return tuned(makeGenSpec({ n: slot.n, seed: SEEDS.daily(dateKey), band: slot.band, level: null }, c), null, c);
}

/** Unlocked iff save.progress.level > daily.unlockAfterLevel (02 §12). */
export function isDailyUnlocked(save: Pick<SaveDataV1, 'progress'>, c: GameConfig = cfg): boolean {
  return save.progress.level > c.daily.unlockAfterLevel;
}

const pad2 = (x: number): string => (x < 10 ? `0${x}` : String(x));

/** "Today" as YYYY-MM-DD from the LOCAL Date getters at `nowMs` (02 §12). */
export function localDateKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 0..6 (Sun..Sat) from the date string, never from the device clock (02 §12). */
export function weekdayOf(dateKey: string): number {
  return weekdayOfDateKey(dateKey);
}

/** ms until the next local midnight, for "Next puzzle in 7 h 48 min" (O7). DST-safe (local Date maths). */
export function msUntilLocalMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - nowMs;
}

/**
 * Epoch ms of the local midnight that ends `dateKey`, i.e. when the next daily becomes "today" (O7
 * after a daily solved past midnight counts down from its own date, 02 §12). DST-safe; null for a bad key.
 */
export function localMidnightAfter(dateKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime() : null;
}

export type DailyCardState = 'locked' | 'not_played' | 'in_progress' | 'solved';

/** Home daily card state for today (02 §12 "Home card states"). */
export function dailyCardState(save: SaveDataV1, today: string, c: GameConfig = cfg): DailyCardState {
  if (!isDailyUnlocked(save, c)) return 'locked';
  if (save.daily[today] !== undefined) return 'solved';
  if (save.inProgress.daily?.id === dailyPuzzleId(today)) return 'in_progress';
  return 'not_played';
}
