// Owner: C
// Limited-time events (phase2b §4): the EventDef schema, validation, resolution against the device
// clock, win bookkeeping and milestones. PURE: `now` is always passed in. The defs ship in the bundle
// (src/data/events/events.json, C) and each event's 21 puzzles in src/data/events/<id>.json.
// F0 stub: the types and the two id conventions are final; the bodies marked "not implemented" are C's.
import { cfg, type GameConfig } from '../app/config';
import type { I18nKey } from '../i18n';
import type { EventId, GameState, PuzzleId, SaveData } from './types';

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
  /** Milestones by puzzles solved, ascending. */
  readonly track: readonly Milestone[];
  /** The FB board key, e.g. 'event_lantern_walk_2026' (= eventBoardKey(id)). */
  readonly leaderboard: `event_${string}`;
}

export type EventDefCheck = { readonly ok: true; readonly def: EventDef } | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Schema check of one parsed def (phase2b §4.9): id format, dates parse and start < end, unlock ≥ 0,
 * track ascending with at ≤ puzzles.count, theme colours parse, leaderboard = eventBoardKey(id).
 * i18n key existence and theme contrast are checked by the tests and palette-check (they need i18n / ui).
 */
export function validateEventDef(raw: unknown, c: GameConfig = cfg): EventDefCheck {
  void raw;
  void c;
  throw new Error('not implemented: validateEventDef (C, phase2b §4.2)');
}

/** The event with start ≤ now < end, or null. Events never overlap (a test enforces it), §4.4. */
export function activeEvent(defs: readonly EventDef[], now: number): EventDef | null {
  void defs;
  void now;
  throw new Error('not implemented: activeEvent (C, phase2b §4.4)');
}

/** The next event that starts within events.teaseHours of now, or null (§4.4). */
export function teaserEvent(defs: readonly EventDef[], now: number, c: GameConfig = cfg): EventDef | null {
  void defs;
  void now;
  void c;
  throw new Error('not implemented: teaserEvent (C, phase2b §4.4)');
}

/** Milestones crossed going from `solvedBefore` to `solvedAfter` puzzles solved (each granted once). */
export function milestonesBetween(def: EventDef, solvedBefore: number, solvedAfter: number): readonly Milestone[] {
  void def;
  void solvedBefore;
  void solvedAfter;
  throw new Error('not implemented: milestonesBetween (C, phase2b §4.3)');
}

export interface EventWinResult {
  readonly save: SaveData;
  /** false when this index was already counted (idempotent per index). */
  readonly counted: boolean;
  /** Milestones reached by this win; their rewards are already in `save`. */
  readonly milestones: readonly Milestone[];
}

/**
 * Event win bookkeeping (phase2b §4.3, §4.6): counts puzzle `index` (0-based) once, adds its ms,
 * sets lastAt, grants reached milestone rewards at once (no claim step). Fish and points for the win
 * itself are economy.ts / scoring.ts, applied by the caller.
 */
export function applyEventWin(save: SaveData, def: EventDef, index: number, state: GameState, now: number, c: GameConfig = cfg): EventWinResult {
  void save;
  void def;
  void index;
  void state;
  void now;
  void c;
  throw new Error('not implemented: applyEventWin (C, phase2b §4.3)');
}

/** The save slot / puzzle id of event puzzle `index` (0-based): `E<eventId>/<index>` (phase2b §4.4, §9.1). */
export function eventPuzzleId(id: EventId, index: number): PuzzleId {
  return `E${id}/${index}`;
}

/** The ranking board of an event (phase2b §5.3): rank.boards.eventPrefix + the id with '-' → '_'. */
export function eventBoardKey(id: EventId, c: GameConfig = cfg): `event_${string}` {
  return `${c.rank.boards.eventPrefix}${id.replace(/-/g, '_')}`;
}
