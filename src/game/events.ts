// Owner: C
// Limited-time events (phase2b §4): the EventDef schema, validation, resolution against the device
// clock, win bookkeeping and milestones. PURE: `now` is always passed in. The defs ship in the bundle
// (src/data/events/events.json, C) and each event's 21 puzzles in src/data/events/<id>.json.
import { cfg, type GameConfig } from '../app/config';
import type { GenSpec, Grade, GradeBand, LevelRecord, SizeWeight } from '../engine/types';
import type { I18nKey } from '../i18n';
import { addFish, grant } from './economy';
import { rulesFor } from './modes';
import { makeGenSpec, SEEDS } from './ramp';
import type { EventId, EventRecord, GameState, PuzzleId, RuleFlags, SaveData } from './types';

export type { EventId } from './types';

/** CSS pattern behind the event page and card, drawn by A (ui/art/event-art.ts, art.css). */
export type EventPageArt = 'lanterns' | 'snowflakes' | 'yarn';
/** Accessory symbol `acc-<name>` layered on Tux (A). */
export type EventAccessory = 'lantern' | 'scarf' | 'yarn';

/** What an event may theme (phase2b §1.3, §4.4): page, page art, board card, glow, accessory. Never regions, ink, wrong or the X. */
export interface EventTheme {
  /** Hex; checked against --ink-2 (≥ 4.5) by palette-check. */
  readonly page: string;
  readonly pageArt: EventPageArt;
  /** Hex. */
  readonly boardCard: string;
  /** rgba(). */
  readonly glow: string;
  readonly accessory: EventAccessory;
}

/** Size weights and grade band of an event's puzzles (phase2b §4.3). */
export interface EventGen {
  readonly sizes: readonly SizeWeight[];
  readonly band: GradeBand;
}

/** An event's puzzle pack (src/data/events/<id>.json): `count` records, `i` = puzzle number (index + 1). */
export interface EventPack {
  readonly v: 1;
  readonly kind: 'event';
  readonly id: EventId;
  readonly gen: string;
  readonly count: number;
  readonly puzzles: readonly LevelRecord[];
}

/** A milestone or group reward (phase2b §4.3, §5.6). */
export interface Reward {
  readonly fish?: number;
  readonly hints?: number;
  readonly kitties?: number;
}

export interface Milestone {
  /** Puzzles solved that reach it (ascending along the track). */
  readonly at: number;
  readonly reward: Reward;
}

/** One event (phase2b §4.2). `v: 1` is the def schema version, not the save version. */
export interface EventDef {
  readonly v: 1;
  /** /^[a-z0-9-]{3,40}$/ */
  readonly id: EventId;
  /** e.g. 'event.lantern.name' (C's en/events.ts). */
  readonly nameKey: I18nKey;
  readonly taglineKey: I18nKey;
  /** ISO 8601 UTC, inclusive. */
  readonly startUtc: string;
  /** ISO 8601 UTC, exclusive. */
  readonly endUtc: string;
  /** Playable when progress.level > this. */
  readonly unlockAfterLevel: number;
  readonly theme: EventTheme;
  /** 'events/<id>.json': a pack of LevelRecords, `count` of them, played in order. */
  readonly puzzles: { readonly file: string; readonly count: number };
  /** Modifiers; hearts default to cfg.hearts.perAttempt. */
  readonly rules?: { readonly hearts?: number };
  /**
   * How the pack was generated (§4.2: size weights and grade band per event), so a puzzle whose pack
   * cannot load is generated on the device from the same seed (eventSpec). C addition, optional.
   */
  readonly gen?: EventGen;
  /** Milestones by puzzles solved, ascending. */
  readonly track: readonly Milestone[];
  /** The FB board key, e.g. 'event_lantern_walk_2026' (= eventBoardKey(id)). */
  readonly leaderboard: `event_${string}`;
}

export type EventDefCheck = { readonly ok: true; readonly def: EventDef } | { readonly ok: false; readonly errors: readonly string[] };

const EVENT_ID_RE = /^[a-z0-9-]{3,40}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const RGBA_RE = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const PAGE_ARTS: readonly EventPageArt[] = ['lanterns', 'snowflakes', 'yarn'];
const ACCESSORIES: readonly EventAccessory[] = ['lantern', 'scarf', 'yarn'];
const PACK_FILE_RE = /^events\/[a-z0-9-]{3,40}\.json$/;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNonNegInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

function checkReward(x: unknown, path: string, errors: string[]): Reward | null {
  if (!isObj(x)) {
    errors.push(`${path}: not an object`);
    return null;
  }
  const out: { fish?: number; hints?: number; kitties?: number } = {};
  let any = false;
  for (const key of Object.keys(x)) {
    if (key !== 'fish' && key !== 'hints' && key !== 'kitties') errors.push(`${path}.${key}: unknown reward`);
  }
  for (const key of ['fish', 'hints', 'kitties'] as const) {
    const v = x[key];
    if (v === undefined) continue;
    if (!isNonNegInt(v) || v === 0) errors.push(`${path}.${key}: not a positive integer`);
    else {
      out[key] = v;
      any = true;
    }
  }
  if (!any) errors.push(`${path}: empty reward`);
  return out;
}

const isGrade = (x: unknown): x is Grade => x === 1 || x === 2 || x === 3 || x === 4 || x === 5;

function checkGen(x: unknown, errors: string[]): void {
  if (!isObj(x)) return void errors.push('gen: not an object');
  const band = x.band;
  if (!Array.isArray(band) || band.length !== 2 || !isGrade(band[0]) || !isGrade(band[1]) || band[0] > band[1]) errors.push('gen.band: not [lo, hi] grades');
  const sizes = x.sizes;
  if (!Array.isArray(sizes) || sizes.length === 0) return void errors.push('gen.sizes: not a non-empty array');
  for (const row of sizes) {
    if (!Array.isArray(row) || row.length !== 2 || !isNonNegInt(row[0]) || row[0] < 5 || row[0] > 12 || !isNonNegInt(row[1]) || row[1] < 1) {
      errors.push('gen.sizes: rows must be [n 5…12, weight ≥ 1]');
      return;
    }
  }
}

/**
 * Schema check of one parsed def (phase2b §4.9): id format, dates parse and start < end, unlock ≥ 0,
 * track ascending with at ≤ puzzles.count, theme colours parse, leaderboard = eventBoardKey(id).
 * i18n key existence and theme contrast are checked by the tests and palette-check (they need i18n / ui).
 */
export function validateEventDef(raw: unknown, c: GameConfig = cfg): EventDefCheck {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['def: not an object'] };
  const id = raw.id;
  if (raw.v !== 1) errors.push('v: must be 1');
  if (typeof id !== 'string' || !EVENT_ID_RE.test(id)) errors.push('id: must match /^[a-z0-9-]{3,40}$/');
  for (const key of ['nameKey', 'taglineKey'] as const) {
    if (typeof raw[key] !== 'string' || !/^event\.[a-zA-Z0-9.]+$/.test(raw[key] as string)) errors.push(`${key}: not an event.* key`);
  }
  const start = typeof raw.startUtc === 'string' && ISO_UTC_RE.test(raw.startUtc) ? Date.parse(raw.startUtc) : NaN;
  const end = typeof raw.endUtc === 'string' && ISO_UTC_RE.test(raw.endUtc) ? Date.parse(raw.endUtc) : NaN;
  if (!Number.isFinite(start)) errors.push('startUtc: not an ISO 8601 UTC time');
  if (!Number.isFinite(end)) errors.push('endUtc: not an ISO 8601 UTC time');
  if (Number.isFinite(start) && Number.isFinite(end) && !(start < end)) errors.push('dates: start must be before end');
  if (!isNonNegInt(raw.unlockAfterLevel)) errors.push('unlockAfterLevel: not a non-negative integer');

  const th = raw.theme;
  if (!isObj(th)) errors.push('theme: not an object');
  else {
    if (typeof th.page !== 'string' || !HEX_RE.test(th.page)) errors.push('theme.page: not #RRGGBB');
    if (typeof th.boardCard !== 'string' || !HEX_RE.test(th.boardCard)) errors.push('theme.boardCard: not #RRGGBB');
    if (typeof th.glow !== 'string' || !RGBA_RE.test(th.glow)) errors.push('theme.glow: not rgba()');
    if (!PAGE_ARTS.includes(th.pageArt as EventPageArt)) errors.push('theme.pageArt: unknown');
    if (!ACCESSORIES.includes(th.accessory as EventAccessory)) errors.push('theme.accessory: unknown');
  }

  const pz = raw.puzzles;
  let count = 0;
  if (!isObj(pz)) errors.push('puzzles: not an object');
  else {
    if (typeof pz.file !== 'string' || !PACK_FILE_RE.test(pz.file)) errors.push('puzzles.file: not events/<id>.json');
    else if (typeof id === 'string' && pz.file !== `events/${id}.json`) errors.push('puzzles.file: must be events/<id>.json');
    if (!isNonNegInt(pz.count) || pz.count < 1) errors.push('puzzles.count: not a positive integer');
    else count = pz.count;
  }

  if (raw.rules !== undefined) {
    if (!isObj(raw.rules)) errors.push('rules: not an object');
    else if (raw.rules.hearts !== undefined && (!isNonNegInt(raw.rules.hearts) || raw.rules.hearts < 1)) {
      errors.push('rules.hearts: not a positive integer');
    }
  }

  if (raw.gen !== undefined) checkGen(raw.gen, errors);

  if (!Array.isArray(raw.track)) errors.push('track: not an array');
  else {
    let prev = 0;
    raw.track.forEach((m: unknown, i: number) => {
      if (!isObj(m)) {
        errors.push(`track[${i}]: not an object`);
        return;
      }
      if (!isNonNegInt(m.at) || m.at < 1) errors.push(`track[${i}].at: not a positive integer`);
      else {
        if (m.at <= prev) errors.push(`track[${i}].at: not ascending`);
        if (count > 0 && m.at > count) errors.push(`track[${i}].at: beyond puzzles.count`);
        prev = m.at;
      }
      checkReward(m.reward, `track[${i}].reward`, errors);
    });
  }

  if (typeof id === 'string' && EVENT_ID_RE.test(id) && raw.leaderboard !== eventBoardKey(id, c)) {
    errors.push(`leaderboard: must be ${eventBoardKey(id, c)}`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, def: raw as unknown as EventDef };
}

/**
 * Validates a whole events.json list: each def, unique ids, and no two events overlapping in time
 * (§4.4). Invalid defs are dropped from `defs` (an event never breaks the game), and every problem is
 * listed in `errors` (the tests and verify-levels fail on any).
 */
export function validateEventDefs(raw: unknown, c: GameConfig = cfg): { readonly defs: readonly EventDef[]; readonly errors: readonly string[] } {
  if (!Array.isArray(raw)) return { defs: [], errors: ['events: not an array'] };
  const defs: EventDef[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((item: unknown, i: number) => {
    const check = validateEventDef(item, c);
    if (!check.ok) {
      for (const e of check.errors) errors.push(`events[${i}] ${e}`);
      return;
    }
    if (seen.has(check.def.id)) {
      errors.push(`events[${i}] id: duplicate ${check.def.id}`);
      return;
    }
    seen.add(check.def.id);
    defs.push(check.def);
  });
  const sorted = [...defs].sort((a, b) => eventStart(a) - eventStart(b));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as EventDef;
    const b = sorted[i] as EventDef;
    if (eventStart(b) < eventEnd(a)) errors.push(`events: ${a.id} and ${b.id} overlap`);
  }
  return { defs: sorted, errors };
}

/**
 * The runtime read of the bundled events.json (main bundle): keeps the defs whose core fields are
 * usable (id, dates in order, puzzle count, track, theme) and drops any that overlap an earlier one.
 * The full schema check with readable errors (validateEventDefs) runs in the tests and in
 * verify-levels, so it stays out of the bundle.
 */
export function usableEventDefs(raw: unknown): readonly EventDef[] {
  if (!Array.isArray(raw)) return [];
  const out: EventDef[] = [];
  for (const x of raw as unknown[]) {
    if (!isObj(x) || x.v !== 1 || typeof x.id !== 'string' || !EVENT_ID_RE.test(x.id)) continue;
    const start = typeof x.startUtc === 'string' ? Date.parse(x.startUtc) : NaN;
    const end = typeof x.endUtc === 'string' ? Date.parse(x.endUtc) : NaN;
    const pz = x.puzzles;
    if (!(start < end) || !isObj(pz) || !isNonNegInt(pz.count) || pz.count < 1 || typeof pz.file !== 'string') continue;
    if (!Array.isArray(x.track) || !isObj(x.theme) || typeof x.nameKey !== 'string' || typeof x.leaderboard !== 'string') continue;
    out.push(x as unknown as EventDef);
  }
  out.sort((a, b) => eventStart(a) - eventStart(b));
  const kept: EventDef[] = [];
  for (const d of out) {
    const prev = kept[kept.length - 1];
    if (!prev || (eventStart(d) >= eventEnd(prev) && d.id !== prev.id)) kept.push(d);
  }
  return kept;
}

/** Epoch ms of the event's start (inclusive). */
export function eventStart(def: EventDef): number {
  return Date.parse(def.startUtc);
}

/** Epoch ms of the event's end (exclusive). */
export function eventEnd(def: EventDef): number {
  return Date.parse(def.endUtc);
}

/** start ≤ now < end. */
export function isEventLive(def: EventDef, now: number): boolean {
  return eventStart(def) <= now && now < eventEnd(def);
}

/** The event with start ≤ now < end, or null. Events never overlap (a test enforces it), §4.4. */
export function activeEvent(defs: readonly EventDef[], now: number): EventDef | null {
  for (const def of defs) if (isEventLive(def, now)) return def;
  return null;
}

/** The next event that starts within events.teaseHours of now, or null (§4.4). */
export function teaserEvent(defs: readonly EventDef[], now: number, c: GameConfig = cfg): EventDef | null {
  const window = c.events.teaseHours * 3_600_000;
  let best: EventDef | null = null;
  for (const def of defs) {
    const start = eventStart(def);
    if (start <= now || start - now > window) continue;
    if (!best || start < eventStart(best)) best = def;
  }
  return best;
}

/** Milestones crossed going from `solvedBefore` to `solvedAfter` puzzles solved (each granted once). */
export function milestonesBetween(def: EventDef, solvedBefore: number, solvedAfter: number): readonly Milestone[] {
  return def.track.filter((m) => m.at > solvedBefore && m.at <= solvedAfter);
}

/** The level rules with the event's hearts modifier (§4.2 `rules.hearts`; default hearts.perAttempt). */
export function eventRules(def: EventDef, c: GameConfig = cfg): RuleFlags {
  const base = rulesFor('event', c);
  const hearts = def.rules?.hearts;
  return hearts === undefined || hearts === base.heartsPerAttempt ? base : Object.freeze({ ...base, heartsPerAttempt: hearts });
}

/** Applies a reward (milestone or group): fish (earned), hints and kitties. */
export function applyReward(save: SaveData, reward: Reward, c: GameConfig = cfg): SaveData {
  let out = save;
  if (reward.fish) out = addFish(out, reward.fish, c);
  if (reward.hints) out = grant(out, 'hints', reward.hints, c);
  if (reward.kitties) out = grant(out, 'kitties', reward.kitties, c);
  return out;
}

/** Sum of several rewards (a win that crosses two milestones shows one line). */
export function sumRewards(rewards: readonly Reward[]): Reward | null {
  if (rewards.length === 0) return null;
  let fish = 0;
  let hints = 0;
  let kitties = 0;
  for (const r of rewards) {
    fish += r.fish ?? 0;
    hints += r.hints ?? 0;
    kitties += r.kitties ?? 0;
  }
  const out: { fish?: number; hints?: number; kitties?: number } = {};
  if (fish) out.fish = fish;
  if (hints) out.hints = hints;
  if (kitties) out.kitties = kitties;
  return out;
}

/** The record of an event in the save (zeros when never played). */
export function eventRecord(save: SaveData, id: EventId): EventRecord {
  return save.events[id] ?? { solved: 0, ms: 0, lastAt: 0 };
}

export interface EventWinResult {
  readonly save: SaveData;
  /** false when this index was already counted (idempotent per index). */
  readonly counted: boolean;
  /** Puzzles solved before and after this win (the victory progress bar animates between them). */
  readonly solvedBefore: number;
  readonly solvedAfter: number;
  /** Milestones reached by this win; their rewards are already in `save`. */
  readonly milestones: readonly Milestone[];
}

/**
 * Event win bookkeeping (phase2b §4.3, §4.6): counts puzzle `index` (0-based) once, adds its ms,
 * sets lastAt, grants reached milestone rewards at once (no claim step). Fish and points for the win
 * itself are economy.ts / scoring.ts, applied by the caller. Puzzles are played in order, so only the
 * puzzle at index `solved` counts; any other index (already solved, or a merge moved progress on)
 * leaves the record unchanged. The event slot of this puzzle is cleared either way.
 */
export function applyEventWin(save: SaveData, def: EventDef, index: number, state: GameState, now: number, c: GameConfig = cfg): EventWinResult {
  const rec = eventRecord(save, def.id);
  const slot = save.inProgress.event;
  const slotId = eventPuzzleId(def.id, index);
  const cleared = slot !== null && slot.id === slotId ? { ...save, inProgress: { ...save.inProgress, event: null } } : save;
  const counted = Number.isInteger(index) && index === rec.solved && index < def.puzzles.count;
  if (!counted) return { save: cleared, counted: false, solvedBefore: rec.solved, solvedAfter: rec.solved, milestones: [] };
  const solvedAfter = rec.solved + 1;
  let out: SaveData = {
    ...cleared,
    events: {
      ...cleared.events,
      [def.id]: { solved: solvedAfter, ms: rec.ms + Math.max(0, Math.round(state.elapsedMs)), lastAt: Math.max(rec.lastAt, now) },
    },
  };
  const milestones = milestonesBetween(def, rec.solved, solvedAfter);
  for (const m of milestones) out = applyReward(out, m.reward, c);
  return { save: out, counted: true, solvedBefore: rec.solved, solvedAfter, milestones };
}

/**
 * §4.4 "After the end" and §9.3: an inProgress.event slot whose event has ended, or whose event this
 * build does not know, is cleared (records stay). Returns the same save when nothing changes.
 */
export function clearEndedEventSlot(save: SaveData, defs: readonly EventDef[], now: number): SaveData {
  const slot = save.inProgress.event;
  if (slot === null) return save;
  const m = /^E([a-z0-9-]{3,40})\/(\d{1,4})$/.exec(slot.id);
  const def = m ? defs.find((d) => d.id === m[1]) : undefined;
  if (def && now < eventEnd(def)) return save;
  return { ...save, inProgress: { ...save.inProgress, event: null } };
}

// ─────────────────────────────── puzzles (phase2b §4.2) ───────────────────────────────

/**
 * The board size of each puzzle (index 0…count−1): the def's size weights shared out over `count`
 * puzzles by largest remainder (ties to the smaller size), in ascending size order, so an event ramps
 * up from its smallest boards to its largest.
 */
export function eventSizeSchedule(sizes: readonly SizeWeight[], count: number): number[] {
  const total = sizes.reduce((s, [, w]) => s + w, 0);
  if (total <= 0 || count <= 0) return [];
  const rows = [...sizes].sort((a, b) => a[0] - b[0]);
  const exact = rows.map(([, w]) => (w * count) / total);
  const alloc = exact.map((x) => Math.floor(x));
  let left = count - alloc.reduce((a, b) => a + b, 0);
  const order = exact.map((x, k) => ({ k, rem: x - Math.floor(x) })).sort((a, b) => b.rem - a.rem || a.k - b.k);
  for (const { k } of order) {
    if (left <= 0) break;
    alloc[k] = (alloc[k] ?? 0) + 1;
    left--;
  }
  const out: number[] = [];
  rows.forEach(([n], k) => {
    for (let j = 0; j < (alloc[k] ?? 0); j++) out.push(n);
  });
  return out;
}

/** The generator spec of puzzle `index` (seed mewdoku:event:v1:<id>:<index>), or null without `gen`. */
export function eventSpec(def: EventDef, index: number, c: GameConfig = cfg): GenSpec | null {
  const gen = def.gen;
  if (!gen || !Number.isInteger(index) || index < 0 || index >= def.puzzles.count) return null;
  const n = eventSizeSchedule(gen.sizes, def.puzzles.count)[index];
  if (n === undefined) return null;
  const spec = makeGenSpec({ n, seed: SEEDS.event(def.id, index), band: gen.band, level: null }, c);
  return { ...spec, edenOneIn: c.gen.edenOneIn, repairMaxIter: c.gen.repairMaxIter };
}

/** Structural check of a parsed event pack (records are checked one by one when used). */
export function isEventPack(x: unknown, id?: EventId): x is EventPack {
  return (
    isObj(x) &&
    x.v === 1 &&
    x.kind === 'event' &&
    typeof x.id === 'string' &&
    (id === undefined || x.id === id) &&
    typeof x.gen === 'string' &&
    isNonNegInt(x.count) &&
    Array.isArray(x.puzzles) &&
    x.puzzles.length === x.count
  );
}

/** Puzzle `index`'s record in a loaded pack (by position when its `i` agrees, else by `i`), or null. */
export function eventRecordIn(pack: EventPack, index: number): LevelRecord | null {
  const byPos = pack.puzzles[index];
  if (byPos && (byPos.i === undefined || byPos.i === index + 1)) return byPos;
  return pack.puzzles.find((r) => r.i === index + 1) ?? null;
}

/** The save slot / puzzle id of event puzzle `index` (0-based): `E<eventId>/<index>` (phase2b §4.4, §9.1). */
export function eventPuzzleId(id: EventId, index: number): PuzzleId {
  return `E${id}/${index}`;
}

/** The ranking board of an event (phase2b §5.3): rank.boards.eventPrefix + the id with '-' → '_'. */
export function eventBoardKey(id: EventId, c: GameConfig = cfg): `event_${string}` {
  return `${c.rank.boards.eventPrefix}${id.replace(/-/g, '_')}`;
}
