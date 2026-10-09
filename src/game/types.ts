// Owner: C (Phase 2b; F0 added the v2 contract types: additive only, ask the lead to change a shape).
// Phase 2c (G1): BoardKey 'period_points', save schema v3 (StreakRecord, PeriodRecord, no wallet),
// docs/phase2c/fish-lives-spec.md §3.8, §4.1, §7.4.
// Game state, actions, events (04 §4.2) and save data (04 §4.3, phase2b §9). PURE types.
import type { LocaleId, ProductId } from '../app/config';
import type { CellIndex, HintStep, Puzzle, PuzzleId } from '../engine/types';

export { CellState } from '../engine/types';
export type { CellIndex, PuzzleId } from '../engine/types';
/** The 17 locale ids (phase2b §6.2); defined in app/config.ts, the leaf every layer may import. */
export type { LocaleId, ProductId } from '../app/config';

/** Phase 2b adds `event` (limited-time event puzzles, phase2b §4.4). */
export type ModeId = 'tutorial' | 'level' | 'daily' | 'event';

/** Event id (phase2b §4.2): /^[a-z0-9-]{3,40}$/, e.g. 'lantern-walk-2026'. */
export type EventId = string;

/**
 * Ranking boards (phase2c §4.1): the per-period leaderboard points board (`period_points`, THE
 * post-win board), the daily board (off unless rank.dailyBoard), and one board per event
 * (`event_<id with - → _>`). `paw_points` is @deprecated (phase2c: retired; kept in the union so an
 * old save's pending score still parses, then the v3 migration drops it). Re-exported by
 * platform/types.ts (platform may import game types).
 */
export type BoardKey = 'period_points' | 'paw_points' | 'daily_fastest' | `event_${string}`;
export type Status = 'ready' | 'playing' | 'hint' | 'kitty' | 'won' | 'lost';
/** Drag mode, chosen by the start cell: Mark → erase, anything else → mark (02 §6.1). */
export type PaintMode = 'mark' | 'erase';
export type CatSource = 'player' | 'hint' | 'kitty';

export interface RuleFlags {
  // set per mode by modes.ts (Phase 3 hook)
  readonly mistakeModel: 'solution'; // only model in Phase 2 (02 §2)
  readonly mistakePenalty: boolean; // false in the tutorial (02 §11.5)
  readonly autoX: boolean; // false everywhere in Phase 2 (tutorial marks are scripted)
  readonly heartsPerAttempt: number; // cfg.hearts.perAttempt (3)
  readonly maxRevives: number; // cfg.revive.maxPerAttempt (1)
  readonly heartsOnRevive: number; // cfg.revive.heartsRestored (1)
}

export interface GameState {
  readonly puzzle: Puzzle;
  readonly mode: ModeId;
  readonly rules: RuleFlags;
  readonly cells: Readonly<Uint8Array>; // CellState per cell; replaced, never mutated
  readonly hearts: number;
  readonly catsPlaced: number;
  readonly regionsDone: number; // bitmask of regions whose cat is placed
  readonly status: Status;
  readonly mistakes: number;
  readonly revivesUsed: number;
  readonly hintsUsed: number;
  readonly kittiesUsed: number;
  readonly elapsedMs: number;
  readonly openHint: HintStep | null;
  readonly moves: readonly Move[]; // move log (Phase 3 hook: undo, replay)
}

export type Move =
  | { t: number; kind: 'mark' | 'unmark'; cells: CellIndex[] }
  | { t: number; kind: 'cat'; cell: CellIndex; source: CatSource }
  | { t: number; kind: 'wrong' | 'uncat'; cell: CellIndex }
  | { t: number; kind: 'revive' };

export type Action =
  | { type: 'START' }
  | { type: 'TAP'; cell: CellIndex; t: number } // Empty⇄Mark; otherwise pulse
  | { type: 'DOUBLE_TAP'; cell: CellIndex; t: number } // Empty/Mark → cat attempt; Cat → remove
  | { type: 'PAINT'; cells: CellIndex[]; mode: PaintMode; t: number }
  | { type: 'HINT_OPEN'; step: HintStep; charged: boolean } // charged=false for a free reopen (02 §9.1)
  | { type: 'HINT_APPLY'; t: number }
  | { type: 'HINT_CLOSE' }
  | { type: 'KITTY'; cell: CellIndex; t: number } // cell from pickKittyCell (03 §6)
  | { type: 'KITTY_DONE' } // session, kitty.revealMs after KITTY
  | { type: 'REVIVE'; t: number }
  | { type: 'RETRY' }
  | { type: 'TICK'; dtMs: number };

export type ActionType = Action['type'];

export type GameEvent =
  | { type: 'MARKED' | 'UNMARKED'; cells: CellIndex[] }
  | { type: 'CAT_PLACED'; cell: CellIndex; source: CatSource }
  | { type: 'CAT_REMOVED'; cell: CellIndex }
  | { type: 'MISTAKE'; cell: CellIndex; heartsLeft: number }
  | { type: 'REGION_DONE'; region: number }
  | { type: 'PULSE'; cell: CellIndex }
  | { type: 'HINT_APPLIED'; step: HintStep }
  | { type: 'REVIVED' }
  | { type: 'WON' }
  | { type: 'LOST' };

export type GameEventType = GameEvent['type'];

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

// ───────────────────────────── Save data (04 §4.3) ─────────────────────────────

export type ReduceMotionSetting = 'system' | 'on' | 'off';

export interface Settings {
  sound: boolean;
  haptics: boolean; // UI label: "Vibration"
  patterns: boolean;
  reduceMotion: ReduceMotionSetting;
}

/** [elapsedMs, mistakes] for a won level. */
export type LevelBest = [ms: number, mistakes: number];
/** [elapsedMs, mistakes, hintsUsed, kittiesUsed] for a won daily. */
export type DailyRecord = [ms: number, mistakes: number, hints: number, kitties: number];

export interface InProgressV1 {
  id: PuzzleId;
  mode: 'level' | 'daily';
  cells: string; // one char per cell: '0'..'4' = CellState
  hearts: number;
  revivesUsed: number;
  mistakes: number;
  hintsUsed: number;
  kittiesUsed: number;
  elapsedMs: number;
  savedAt: number;
}

export interface SaveDataV1 {
  v: 1;
  updatedAt: number; // epoch ms; drives merge of "newest wins" fields
  firstSeenAt: number; // tenure for ad pacing (02 §13.2)
  sessions: number;
  tutorialDone: boolean;
  progress: {
    level: number; // next level to play (≥ 1)
    completed: number; // levels won (the tutorial counts)
    best: Record<number, LevelBest>;
  };
  stock: { hints: number; kitties: number };
  daily: Record<string, DailyRecord>; // key YYYY-MM-DD
  settings: Settings;
  ads: { lastAdAt: number; lastFallbackGrantAt: number };
  inProgress: {
    // one slot per mode, so a level never discards the daily (02 §12)
    level: InProgressV1 | null; // mode 'level' (L2+; the tutorial is never saved)
    daily: InProgressV1 | null; // mode 'daily'
  };
  ext: Record<string, unknown>; // Phase 3 hook: new data without a schema bump
}

// ─────────────────────────── Save data v2 (phase2b §9.1) ───────────────────────────

/** A v1 slot is a valid v2 slot; v2 adds mode 'event' (id `E<eventId>/<i>`, i 0-based; the UI shows i + 1). */
export interface InProgressV2 extends Omit<InProgressV1, 'mode'> {
  mode: 'level' | 'daily' | 'event';
}

/** v2 settings: v1 plus the language override ('auto' = follow the platform, phase2b §6.3). No look settings (one theme). */
export type SettingsV2 = Settings & { locale: 'auto' | LocaleId };

/** Per-event progress (phase2b §4.6): puzzles solved, total ms of the solves, last win time. */
export interface EventRecord {
  solved: number;
  ms: number;
  lastAt: number;
}

/** One group challenge (FB tournament, phase2b §5.6). */
export interface GroupRecord {
  endsAt: number;
  total: number;
  wins: number;
  claimed: 0 | 1;
}

export interface SaveDataV2 extends Omit<SaveDataV1, 'v' | 'settings' | 'inProgress'> {
  v: 2;
  settings: SettingsV2;
  inProgress: { level: InProgressV2 | null; daily: InProgressV2 | null; event: InProgressV2 | null };
  /**
   * Fish (phase2b §2.8); earned = lifetime total, for stats. Both 0…fish.max. v2 only: phase2c removes
   * the wallet (SaveDataV3 omits it; fish are lives, not a currency).
   */
  wallet: { fish: number; earned: number };
  /** Paw points (phase2b §5.3), 0…points.max. Phase 2c: the lifetime LEVEL POINTS total (same field). */
  points: { total: number };
  events: Record<EventId, EventRecord>;
  /** ≤ groups.keep entries (oldest endsAt dropped). */
  groups: Record<string, GroupRecord>;
  /** noAds entitlement; ledger "<productId>|<purchaseToken>", ≤ iap.tokensKept entries (newest kept), phase2b §8.4. */
  purchases: { noAds: boolean; tokens: string[] };
  /** Unsent scores (retried on the next win or boot) and the submit limiter (phase2b §5.3). */
  rank: { pending: Partial<Record<BoardKey, number>>; lastSubmitAt: number };
}

// ─────────────────────────── Save data v3 (phase2c §3.8) ───────────────────────────

/** The perfect streak (phase2c §3.2): 0 ≤ current ≤ best ≤ 1 000 000. */
export interface StreakRecord {
  current: number;
  best: number;
}

/**
 * Leaderboard points per UTC period (phase2c §3.4, §3.5). Keys are '' (none yet) or a period start
 * `YYYY-MM-DD` of the configured period.kind; totals 0…period.max.
 */
export interface PeriodRecord {
  /** The period the total belongs to. */
  key: string;
  total: number;
  /** The best period so far and its total (bestTotal ≥ total when bestKey === key). */
  bestKey: string;
  bestTotal: number;
}

/** v3 = v2 without the fish wallet, plus the perfect streak and the period points (phase2c §3.8). */
export interface SaveDataV3 extends Omit<SaveDataV2, 'v' | 'wallet'> {
  v: 3;
  streak: StreakRecord;
  period: PeriodRecord;
}

/** The current save schema. Every consumer types its save as SaveData; SaveDataV1/V2 are stored shapes only. */
export type SaveData = SaveDataV3;

/** How urgently to persist (04 §7.1, 02 §15). */
export type SaveMode = 'touch' | 'now' | 'critical';
