// Owner: app
// Public shape of the level session (04 §3, §5.2): the commands screens and overlays call, the
// Session handle, and its dependencies. Implemented by session.ts.
import type { CellIndex, Puzzle } from '../engine/types';
import type { LevelsRepo } from '../game/levels-repo';
import type { GameEvent, GameState, PaintMode } from '../game/types';
import type { PlatformAdapter } from '../platform/types';
import type { Announcer } from '../ui/a11y/announcer';
import type { AudioEngine } from '../audio/audio-engine';
import type { Sfx } from '../audio/sfx';
import type { EngineClient } from '../workers/engine-client';
import type { AdFlow } from './ad-flow';
import type { Clock } from './clock';
import type { GameConfig } from './config';
import type { AppBus, PauseReason } from './events';
import type { Router } from './router';
import type { SaveScheduler } from './saves';
import type { AppState, SessionRequest, Store } from './store';

/** What screens and overlays call (bound into their callbacks by the app). */
export interface GameCommands {
  onCellTap(cell: CellIndex): void;
  onCellDoubleTap(cell: CellIndex): void;
  onPaint(cells: readonly CellIndex[], mode: PaintMode): void;
  /** 02 §9.1 flow: free reopen → stock → O2 → getHint → debit → HINT_OPEN. */
  onBulb(): Promise<void>;
  /** 02 §9.2 flow: stock → O2 → pickKittyCell → debit → KITTY → KITTY_DONE after kitty.revealMs. */
  onPaw(): Promise<void>;
  onHintApply(): void;
  onHintClose(): void;
  /** Tutorial step 2 "Got it". */
  onCoachGotIt(): void;
  /** O4 Continue: rewarded (or fallback) → REVIVE; else stay on O4 with the toast. */
  onContinue(): Promise<void>;
  /** O4 Retry: interstitial gate 'retry' → RETRY. */
  onRetry(): Promise<void>;
  /** O3 Next: gate 'next_level' → next level (first-run tutorial: Level 2, no gate). */
  onNext(): Promise<void>;
  /** O7 Done: gate 'daily_done' → Home. */
  onDailyDone(): Promise<void>;
  /** Top-bar Home saves the board; O3 Home after a win; O4 Home (status lost) discards the attempt. */
  onHome(): void;
  /** How to play → "I know how to play" (first-run tutorial only). */
  onSkipTutorial(): void;
}

export interface Session extends GameCommands {
  /** Loads the puzzle, applies restore rules for its slot, mounts the board, START after fx.boardEntryMs. */
  start(req: SessionRequest): Promise<void>;
  state(): GameState | null;
  /** Called after every reduce with the produced events (also emitted on the bus as 'game:events'). */
  subscribe(fn: (state: GameState, events: readonly GameEvent[]) => void): () => void;
  /** Stops TICKs (sending the partial delta), mutes; resume restarts them. Reasons stack. */
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  /** saves.now() with the current board in its slot (page hide, onPause, Home). */
  saveNow(): void;
  dispose(): void;
}

export interface SessionDeps {
  readonly store: Store<AppState>;
  readonly bus: AppBus;
  readonly clock: Clock;
  readonly platform: PlatformAdapter;
  readonly router: Router;
  readonly levels: LevelsRepo;
  readonly engine: EngineClient;
  readonly saves: SaveScheduler;
  readonly adFlow: AdFlow;
  readonly audio: AudioEngine;
  readonly sfx: Sfx;
  readonly announcer: Announcer;
  /** Clock time when platform.start() resolved (02 §13.2 session grace). */
  readonly sessionStartedAt: number;
  /** Shows Home after the session leaves the board (Home, daily Done, tutorial replay, load failure). */
  goHome?(): void;
  /** Gear in the game's top bar. */
  openSettings?(): void;
  /** Palette index per region (default: ui/art/palette regionColorsFor). */
  regionColors?(puzzle: Puzzle, fixed: readonly number[] | null): Uint8Array;
  /** Index into PRAISE_KEYS for O3 (default: random). */
  pickPraise?(): number;
  readonly config?: GameConfig;
}
