// Owner: C
// The post-win orchestration (phase2b §2.2, §2.6, §2.7) on the session clock: rewards already saved
// at t = 0 (critical save, same as the win), then glow (t = 300), the in-game fish pill (1 000), three
// fish (1 200 …, B's flyFish), arrivals and labels, scrim (4 200), the ranking panel (4 500,
// fx.winOverlayDelayMs), and on its tap the victory screen. Home and Gear are aria-disabled until the
// panel opens; Esc does nothing. Teardown cancels every timer and WAAPI animation and empties the fish
// layer. A hidden page keeps the schedule: on return every missed step runs once, in order, jumped to
// its end state. Variants: tutorial (no panel; victory at fx.win.tutorialVictoryAtMs), replay (no fish;
// victory at replayVictoryAtMs), restored full board (victory at once, no second award).
// C-internal module: C may reshape WinFlowDeps and the handle; the B calls it makes are fixed
// (GameScreen.glow/showFishPill/fishLabel/fishRect, flyFish, ensureFxLayer). F0 stub.
import type { Sfx } from '../audio/sfx';
import type { CellIndex } from '../engine/types';
import type { GameScreen } from '../ui/screens/game-screen';
import type { Clock } from './clock';
import type { GameConfig } from './config';
import type { AppBus } from './events';
import type { Router } from './router';

export type WinFlowVariant = 'level' | 'daily' | 'event' | 'tutorial' | 'tutorial_replay' | 'restored';

export interface WinFlowInput {
  readonly variant: WinFlowVariant;
  readonly screen: GameScreen;
  /** Cat cells in row order (glow) and the three fish sources (fishSourceRows → solution cells). */
  readonly catCells: readonly CellIndex[];
  readonly fishSources: readonly CellIndex[];
  /** Wallet before this win, the base fish (3, or 0) and the bonus (+2 or 0). */
  readonly fishBefore: number;
  readonly fishBase: number;
  readonly fishBonus: number;
  readonly reducedMotion: boolean;
}

export interface WinFlowDeps {
  readonly clock: Clock;
  readonly router: Router;
  readonly bus: AppBus;
  readonly sfx: Sfx;
  readonly haptics: (pattern: number | readonly number[]) => void;
  readonly config?: GameConfig;
  /** t = 4 500 (reduced: 1 200): open the ranking panel (ranking-flow supplies the props). */
  openRanking(): void;
  /** Open the victory screen (after the panel's tap, or at once for the variants without a panel). */
  openVictory(): void;
}

export interface WinFlow {
  start(input: WinFlowInput): void;
  /** Whether a flow is running (Home and Gear stay aria-disabled until the panel opens). */
  running(): boolean;
  /** The panel accepted a tap (≥ rank.panelTapMinMs after it opened): fade it out, then the victory screen. */
  continueFromRanking(): void;
  /** Teardown: cancel every timer and animation, empty the fish layer. Rewards are already saved. */
  cancel(): void;
}

export function createWinFlow(deps: WinFlowDeps): WinFlow {
  void deps;
  throw new Error('not implemented: createWinFlow (C, phase2b §2.2)');
}
