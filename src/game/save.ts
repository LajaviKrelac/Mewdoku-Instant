// Owner: C (Phase 2b). Phase 2c (G1): schema v3 (docs/phase2c/fish-lives-spec.md §3.8): no wallet,
// the perfect streak and the period points (save-v3.ts), the v2 → v3 migration and the one-time
// compensation of retired fish packs in a migrated document (purchases.ts compensateRetired).
// Save schema v3 (phase2c §3.8; v2 = phase2b §9; v1 = 04 §4.3): defaults, migration/validation, merge,
// cell encoding, slot validation (04 §7). The v2 field rules live in save-v2.ts, the v3 ones in
// save-v3.ts; the paid-grant repair in purchases.ts.
// Phase 2c.1 (G1, fish-lives-spec §3.2.3–§3.2.4): still v3. The in-progress slots may carry the
// optional points / catStreak / scoredRows (copySlot keeps the valid ones, reports and drops a bad
// one); merge takes inProgress whole from the newer document, fields included. `streak` is frozen.
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
import { compensateRetired, repairPaidGrants } from './purchases';
import { isLocaleSetting, mergeV2Fields, migrate_1_to_2, parseEventSlotId, readV2Fields, v2Defaults } from './save-v2';
import { mergeV3Fields, migrate_2_to_3, readV3Fields, v3Defaults } from './save-v3';
import type { DailyRecord, InProgressV2, LevelBest, ReduceMotionSetting, SaveData, SettingsV2 } from './types';

export type { InProgressV1, InProgressV2, PeriodRecord, SaveData, SaveDataV1, SaveDataV2, SaveDataV3, StreakRecord } from './types';
export { decodeCells, encodeCells, validateInProgress, validateSlot, slotLimitsOf, isInProgressShape } from './save-fields';
export type { SlotCheck, SlotLimits } from './save-fields';

/** Current schema version (phase2c §3.8). Storage keys stay `mewdoku.save.v1` / cloud `save` [DECISION]. */
export const SAVE_VERSION = 3;

/** 04 §4.3 defaults (stock from cfg; firstSeenAt = updatedAt = now), the phase2b §9.2 v2 fields and the phase2c §3.8 v3 records. */
export function defaults(now: number, c: GameConfig = cfg): SaveData {
  return {
    v: 3,
    updatedAt: now,
    firstSeenAt: now,
    sessions: 0,
    tutorialDone: false,
    progress: { level: 1, completed: 0, best: {} },
    stock: { hints: c.hints.startStock, kitties: c.kitty.startStock },
    daily: {},
    settings: defaultSettings(),
    ads: { lastAdAt: 0, lastFallbackGrantAt: 0 },
    inProgress: { level: null, daily: null, event: null },
    ext: {},
    ...v2Defaults(),
    ...v3Defaults(),
  };
}

function defaultSettings(): SettingsV2 {
  return { sound: true, haptics: true, patterns: false, reduceMotion: 'system', locale: 'auto' };
}

export interface MigrateReport {
  readonly save: SaveData;
  /** 'empty' = null/undefined input; 'reset' = not an object at all; 'repaired' = some fields replaced. */
  readonly outcome: 'ok' | 'empty' | 'reset' | 'repaired';
  readonly repairedFields: readonly string[];
}

/** vN → vN+1 steps, run in order up to SAVE_VERSION before validation (phase2b §9.2, phase2c §3.8). */
const MIGRATIONS: Readonly<Record<number, (d: Record<string, unknown>) => Record<string, unknown>>> = {
  1: migrate_1_to_2,
  2: migrate_2_to_3,
};

/**
 * vN → v3 chain, then field-by-field validation; invalid fields get defaults; garbage → defaults(now).
 * A document whose input v was below 3 then gets the one-time compensation of its retired fish packs
 * (phase2c §3.8, purchases.ts compensateRetired).
 */
export function migrate(raw: unknown, now: number, c: GameConfig = cfg): SaveData {
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
  const inputV = doc.v;
  while (typeof doc.v === 'number' && doc.v < SAVE_VERSION && MIGRATIONS[doc.v]) {
    doc = (MIGRATIONS[doc.v] as (d: Record<string, unknown>) => Record<string, unknown>)(doc);
  }
  if (doc.v !== SAVE_VERSION) repaired.push('v');
  let save = validateV3(doc, now, c, repaired);
  // §3.8: a v2 (or v1) document's ledger entries of retired fish packs are compensated once, here.
  if (typeof inputV === 'number' && inputV < 3) save = compensateRetired(save, c);
  return { save, outcome: repaired.length > 0 ? 'repaired' : 'ok', repairedFields: repaired };
}

/**
 * Field-by-field validation of a v3 candidate (validateV1 + phase2b §9.2 + phase2c §3.8). Never
 * throws; every invalid field gets its default.
 */
function validateV3(d: Record<string, unknown>, now: number, c: GameConfig, rep: string[]): SaveData {
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
  const settings: SettingsV2 = se
    ? {
        sound: field(se.sound, isBool, ds.sound, 'settings.sound'),
        haptics: field(se.haptics, isBool, ds.haptics, 'settings.haptics'),
        patterns: field(se.patterns, isBool, ds.patterns, 'settings.patterns'),
        reduceMotion: field(se.reduceMotion, isReduceMotion, ds.reduceMotion, 'settings.reduceMotion'),
        // A locale this build does not bundle is kept and resolves like 'auto' (phase2b §6.7, §9.2).
        locale: field(se.locale, (x): x is SettingsV2['locale'] => isLocaleSetting(x, c), ds.locale, 'settings.locale'),
      }
    : ds;

  const ad = group('ads');
  const ads = {
    lastAdAt: ad ? field(ad.lastAdAt, isTime, 0, 'ads.lastAdAt') : 0,
    lastFallbackGrantAt: ad ? field(ad.lastFallbackGrantAt, isTime, 0, 'ads.lastFallbackGrantAt') : 0,
  };

  const ip = group('inProgress');
  const slot = (mode: InProgressV2['mode']): InProgressV2 | null => {
    const v = ip ? ip[mode] : null;
    if (v === null || v === undefined) return null;
    if (isInProgressShape(v, mode)) return copySlot(v, rep, `inProgress.${mode}`);
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
    v: 3,
    updatedAt: field(d.updatedAt, isTime, now, 'updatedAt'),
    firstSeenAt: field(d.firstSeenAt, isTime, now, 'firstSeenAt'),
    sessions: field(d.sessions, isNonNegInt, 0, 'sessions'),
    tutorialDone,
    progress: { level, completed, best: best.value },
    stock,
    daily: daily.value,
    settings,
    ads,
    inProgress: { level: slot('level'), daily: slot('daily'), event: slot('event') },
    ext: isRecord(d.ext) ? { ...d.ext } : (rep.push('ext'), {}),
    ...readV2Fields(d, c, rep),
    ...readV3Fields(d, c, rep),
  };
}

function isBool(x: unknown): x is boolean {
  return typeof x === 'boolean';
}

function isReduceMotion(x: unknown): x is ReduceMotionSetting {
  return x === 'system' || x === 'on' || x === 'off';
}

// ─────────────────────────────── merge (04 §7.3) ───────────────────────────────

/** Local mirror vs cloud (04 §7.3 + phase2b §9.3 + phase2c §3.8 merge tables), then clears stale in-progress slots. */
export function merge(local: SaveData, cloud: SaveData, c: GameConfig = cfg): SaveData {
  const newer = cloud.updatedAt > local.updatedAt ? cloud : local;
  const older = newer === local ? cloud : local;
  const merged: SaveData = {
    v: 3,
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
    inProgress: { level: newer.inProgress.level, daily: newer.inProgress.daily, event: newer.inProgress.event },
    ext: { ...newer.ext },
    ...mergeV2Fields(local, cloud, newer, c),
    ...mergeV3Fields(local, cloud, newer),
  };
  // §9.3: stock came from the newer copy; paid grants (and retired-pack compensation, phase2c §3.8)
  // only the older copy holds are re-applied once.
  return clearStaleSlots(repairPaidGrants(merged, older, newer, c));
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
 * a daily slot whose date already has a record was solved elsewhere. Both are cleared. phase2b §9.3:
 * an event slot whose index is below events[id].solved was solved elsewhere. An event slot whose event
 * has ended needs the event defs and the clock: events.ts clearEndedEventSlot, run by event-flow at
 * launch and after every late merge.
 */
export function clearStaleSlots(save: SaveData): SaveData {
  const { level, daily, event } = save.inProgress;
  const staleLevel = level !== null && level.id !== `L${save.progress.level}`;
  const staleDaily = daily !== null && save.daily[daily.id.slice(1)] !== undefined;
  const ev = event !== null ? parseEventSlotId(event.id) : null;
  const staleEvent = event !== null && (ev === null || ev.index < (save.events[ev.eventId]?.solved ?? 0));
  if (!staleLevel && !staleDaily && !staleEvent) return save;
  return {
    ...save,
    inProgress: { level: staleLevel ? null : level, daily: staleDaily ? null : daily, event: staleEvent ? null : event },
  };
}
