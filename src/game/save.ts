// Owner: game
// Save schema v1: defaults, migration/validation, merge, cell encoding, slot validation (04 §4.3, §7).
import { cfg, type GameConfig } from '../app/config';
import {
  copySlot,
  isInProgressShape,
  isNonNegInt,
  isPosInt,
  isRecord,
  isTime,
  readBest,
  readDaily,
} from './save-fields';
import type { DailyRecord, InProgressV1, LevelBest, ReduceMotionSetting, SaveDataV1, Settings } from './types';

export type { InProgressV1, SaveDataV1 } from './types';
export { decodeCells, encodeCells, validateInProgress, validateSlot, slotLimitsOf, isInProgressShape } from './save-fields';
export type { SlotCheck, SlotLimits } from './save-fields';

/** Current schema version. */
export const SAVE_VERSION = 1;

/** 04 §4.3 defaults (stock from cfg; firstSeenAt = updatedAt = now). */
export function defaults(now: number, c: GameConfig = cfg): SaveDataV1 {
  return {
    v: 1,
    updatedAt: now,
    firstSeenAt: now,
    sessions: 0,
    tutorialDone: false,
    progress: { level: 1, completed: 0, best: {} },
    stock: { hints: c.hints.startStock, kitties: c.kitty.startStock },
    daily: {},
    settings: defaultSettings(),
    ads: { lastAdAt: 0, lastFallbackGrantAt: 0 },
    inProgress: { level: null, daily: null },
    ext: {},
  };
}

function defaultSettings(): Settings {
  return { sound: true, haptics: true, patterns: false, reduceMotion: 'system' };
}

export interface MigrateReport {
  readonly save: SaveDataV1;
  /** 'empty' = null/undefined input; 'reset' = not an object at all; 'repaired' = some fields replaced. */
  readonly outcome: 'ok' | 'empty' | 'reset' | 'repaired';
  readonly repairedFields: readonly string[];
}

/**
 * vN → vN+1 steps, run in order up to SAVE_VERSION before validation. v1 is the first schema, so
 * the chain is empty in Phase 2; a v2 adds `1: migrate_1_to_2`.
 */
const MIGRATIONS: Readonly<Record<number, (d: Record<string, unknown>) => Record<string, unknown>>> = {};

/** vN → v1 chain, then field-by-field validation; invalid fields get defaults; garbage → defaults(now). */
export function migrate(raw: unknown, now: number, c: GameConfig = cfg): SaveDataV1 {
  return migrateReport(raw, now, c).save;
}

/** migrate() plus what happened, for the `save_corrupt` analytics event. */
export function migrateReport(raw: unknown, now: number, c: GameConfig = cfg): MigrateReport {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return { save: defaults(now, c), outcome: 'reset', repairedFields: [] };
    }
  }
  if (data === null || data === undefined) return { save: defaults(now, c), outcome: 'empty', repairedFields: [] };
  if (!isRecord(data)) return { save: defaults(now, c), outcome: 'reset', repairedFields: [] };

  const repaired: string[] = [];
  let doc = data;
  while (typeof doc.v === 'number' && doc.v < SAVE_VERSION && MIGRATIONS[doc.v]) {
    doc = (MIGRATIONS[doc.v] as (d: Record<string, unknown>) => Record<string, unknown>)(doc);
  }
  if (doc.v !== SAVE_VERSION) repaired.push('v');
  const save = validateV1(doc, now, c, repaired);
  return { save, outcome: repaired.length > 0 ? 'repaired' : 'ok', repairedFields: repaired };
}

/** Field-by-field validation of a v1 candidate. Never throws; every invalid field gets its default. */
function validateV1(d: Record<string, unknown>, now: number, c: GameConfig, rep: string[]): SaveDataV1 {
  const def = defaults(now, c);
  const field = <T>(value: unknown, ok: (v: unknown) => v is T, fallback: T, path: string): T => {
    if (ok(value)) return value;
    rep.push(path);
    return fallback;
  };
  const group = (key: string): Record<string, unknown> | null => {
    if (isRecord(d[key])) return d[key] as Record<string, unknown>;
    rep.push(key);
    return null;
  };

  const p = group('progress');
  let level = p ? field(p.level, isPosInt, 1, 'progress.level') : 1;
  // Phase 2 progress is linear (no replays), so completed = level − 1 is the best repair.
  let completed = p ? field(p.completed, isNonNegInt, Math.max(0, level - 1), 'progress.completed') : Math.max(0, level - 1);
  if (d.tutorialDone === true && level < 2) {
    // The tutorial win/skip always moves on to Level 2 (02 §10.1); never route a finished player back into it.
    level = 2;
    completed = Math.max(completed, 1);
    rep.push('progress.level');
  }
  const best = p ? readBest(p.best) : { value: {}, dropped: false };
  if (best.dropped) rep.push('progress.best');

  const daily = readDaily(d.daily);
  if (daily.dropped) rep.push('daily');

  const st = group('stock');
  const stock = {
    hints: st ? field(st.hints, isNonNegInt, def.stock.hints, 'stock.hints') : def.stock.hints,
    kitties: st ? field(st.kitties, isNonNegInt, def.stock.kitties, 'stock.kitties') : def.stock.kitties,
  };

  const se = group('settings');
  const ds = defaultSettings();
  const settings: Settings = se
    ? {
        sound: field(se.sound, isBool, ds.sound, 'settings.sound'),
        haptics: field(se.haptics, isBool, ds.haptics, 'settings.haptics'),
        patterns: field(se.patterns, isBool, ds.patterns, 'settings.patterns'),
        reduceMotion: field(se.reduceMotion, isReduceMotion, ds.reduceMotion, 'settings.reduceMotion'),
      }
    : ds;

  const ad = group('ads');
  const ads = {
    lastAdAt: ad ? field(ad.lastAdAt, isTime, 0, 'ads.lastAdAt') : 0,
    lastFallbackGrantAt: ad ? field(ad.lastFallbackGrantAt, isTime, 0, 'ads.lastFallbackGrantAt') : 0,
  };

  const ip = group('inProgress');
  const slot = (mode: 'level' | 'daily'): InProgressV1 | null => {
    const v = ip ? ip[mode] : null;
    if (v === null || v === undefined) return null;
    if (isInProgressShape(v, mode)) return copySlot(v);
    rep.push(`inProgress.${mode}`);
    return null;
  };

  let tutorialDone = field(d.tutorialDone, isBool, level >= 2, 'tutorialDone');
  if (!tutorialDone && level >= 2) {
    // Level 2+ is only reachable through the tutorial win or skip (02 §4.2).
    tutorialDone = true;
    rep.push('tutorialDone');
  }

  return {
    v: 1,
    updatedAt: field(d.updatedAt, isTime, now, 'updatedAt'),
    firstSeenAt: field(d.firstSeenAt, isTime, now, 'firstSeenAt'),
    sessions: field(d.sessions, isNonNegInt, 0, 'sessions'),
    tutorialDone,
    progress: { level, completed, best: best.value },
    stock,
    daily: daily.value,
    settings,
    ads,
    inProgress: { level: slot('level'), daily: slot('daily') },
    ext: isRecord(d.ext) ? { ...d.ext } : (rep.push('ext'), {}),
  };
}

function isBool(x: unknown): x is boolean {
  return typeof x === 'boolean';
}

function isReduceMotion(x: unknown): x is ReduceMotionSetting {
  return x === 'system' || x === 'on' || x === 'off';
}

// ─────────────────────────────── merge (04 §7.3) ───────────────────────────────

/** Local mirror vs cloud (04 §7.3 merge table), then clears stale in-progress slots. */
export function merge(local: SaveDataV1, cloud: SaveDataV1): SaveDataV1 {
  const newer = cloud.updatedAt > local.updatedAt ? cloud : local;
  const merged: SaveDataV1 = {
    v: 1,
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
    firstSeenAt: Math.min(local.firstSeenAt, cloud.firstSeenAt),
    sessions: Math.max(local.sessions, cloud.sessions),
    tutorialDone: local.tutorialDone || cloud.tutorialDone,
    progress: {
      level: Math.max(local.progress.level, cloud.progress.level),
      completed: Math.max(local.progress.completed, cloud.progress.completed),
      best: unionByMs<LevelBest>(local.progress.best, cloud.progress.best),
    },
    stock: { ...newer.stock },
    daily: unionByMs<DailyRecord>(local.daily, cloud.daily),
    settings: { ...newer.settings },
    ads: { ...newer.ads },
    inProgress: { level: newer.inProgress.level, daily: newer.inProgress.daily },
    ext: { ...newer.ext },
  };
  return clearStaleSlots(merged);
}

/** Union of two record maps; per key the entry with the smaller ms ([0]) wins (ties keep `a`). */
function unionByMs<T extends readonly number[]>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, theirs] of Object.entries(b)) {
    const mine = out[k];
    if (!mine || (theirs[0] ?? Infinity) < (mine[0] ?? Infinity)) out[k] = theirs;
  }
  return out;
}

/**
 * 04 §7.3 "After merging": a level slot whose id is not L{progress.level} was already won elsewhere;
 * a daily slot whose date already has a record was solved elsewhere. Both are cleared.
 */
export function clearStaleSlots(save: SaveDataV1): SaveDataV1 {
  const { level, daily } = save.inProgress;
  const staleLevel = level !== null && level.id !== `L${save.progress.level}`;
  const staleDaily = daily !== null && save.daily[daily.id.slice(1)] !== undefined;
  if (!staleLevel && !staleDaily) return save;
  return {
    ...save,
    inProgress: { level: staleLevel ? null : level, daily: staleDaily ? null : daily },
  };
}
