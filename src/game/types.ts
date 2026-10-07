// Owner: foundation (game workstream: additive only).
// Game state, actions, events (04 §4.2) and save data (04 §4.3). PURE types.
import type { CellIndex, HintStep, Puzzle, PuzzleId } from '../engine/types';

export { CellState } from '../engine/types';
export type { CellIndex, PuzzleId } from '../engine/types';

export type ModeId = 'tutorial' | 'level' | 'daily';
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

/** How urgently to persist (04 §7.1, 02 §15). */
export type SaveMode = 'touch' | 'now' | 'critical';
