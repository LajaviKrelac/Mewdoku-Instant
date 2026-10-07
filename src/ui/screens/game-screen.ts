// Owner: ui-shell
// S2 Game (02 §5): composes ui-board pieces (top bar, pills, rule chips, board, tool bar), runs the
// 02 §19 layout on resize, and forwards input to the session through callbacks.
import type { CellIndex } from '../../engine/types';
import type { GameEvent, ModeId, PaintMode, Status } from '../../game/types';
import type { BoardHighlight, BoardModel } from '../board/board-view';
import type { RuleChip } from '../hud/rule-chips';
import type { View } from '../dom';

export interface GameView {
  readonly mode: ModeId;
  /** Level number (tutorial: 1); null for a daily. */
  readonly level: number | null;
  /** Daily date YYYY-MM-DD; null otherwise. */
  readonly dateKey: string | null;
  readonly hard: boolean;
  /** false during the first-run tutorial (02 §4.2). */
  readonly showHome: boolean;
  readonly hearts: number;
  readonly maxHearts: number;
  readonly catsPlaced: number;
  readonly status: Status;
  readonly hints: number;
  readonly kitties: number;
  readonly hintsFree: boolean;
  readonly bulbEnabled: boolean;
  readonly pawEnabled: boolean;
  readonly inputLocked: boolean;
  readonly board: BoardModel;
  /** Open hint (O1) or tutorial coach focus (O8). */
  readonly highlight: BoardHighlight | null;
  readonly chipHighlight: RuleChip | null;
  readonly fbSafeZone: boolean;
  readonly reducedMotion: boolean;
}

/** Session commands (app/session.ts GameCommands) bound by the app. */
export interface GameScreenCallbacks {
  onTap(cell: CellIndex): void;
  onDoubleTap(cell: CellIndex): void;
  onPaint(cells: CellIndex[], mode: PaintMode): void;
  onBulb(): void;
  onPaw(): void;
  onHome(): void;
  onSettings(): void;
}

export interface GameScreen extends View<GameView> {
  /** Forwarded reducer events: board FX and heart crack. */
  playEvent(ev: GameEvent): void;
  /** Board entry animation after a (re)mount. */
  playEntry(): void;
  cellRect(cell: CellIndex): DOMRect | null;
  toolRect(tool: 'bulb' | 'paw'): DOMRect | null;
  focusBoard(): void;
}

export function createGameScreen(view: GameView, cb: GameScreenCallbacks): GameScreen {
  throw new Error('not implemented: createGameScreen');
}
