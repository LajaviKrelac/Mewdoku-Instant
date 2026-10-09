// Owner: C (Phase 2b)
// Selectors from AppState to the UI view models (UI modules define the view types; the app maps).
// Phase 2b: F0 added the Home fish / event / banner fields (event: null until C's event-flow) and
// the stubs of the three new selectors (C → B contract, CONTRACTS-2b §4.3).
import { getMode } from '../game/modes';
import { dailyCardState, isHard, localDateKey } from '../game/progression';
import { dailySlotFor } from '../game/ramp';
import { tutorialAllowsTool, tutorialStep, TUTORIAL_STEP_COUNT, type TutorialStepIndex } from '../game/tutorial';
import type { Capabilities, PlatformId } from '../platform/types';
import type { BoardHighlight } from '../ui/board/board-view';
import type { RuleChip } from '../ui/hud/rule-chips';
import type { RankingPanelProps } from '../ui/overlays/ranking-panel';
import type { VictoryProps } from '../ui/overlays/victory-screen';
import type { EventScreenView } from '../ui/screens/event-screen';
import type { GameView } from '../ui/screens/game-screen';
import type { HomeView } from '../ui/screens/home-screen';
import { cfg, type GameConfig } from './config';
import type { AppState } from './store';

export interface ViewContext {
  /** Clock now(), for today's date key. */
  readonly now: number;
  readonly capabilities: Capabilities;
  readonly platformId: PlatformId;
}

/** A SessionMeta.tutorialStep as the tutorial module's step type (null outside 1..6). */
export function asTutorialStep(step: number | null): TutorialStepIndex | null {
  return step !== null && Number.isInteger(step) && step >= 1 && step <= TUTORIAL_STEP_COUNT
    ? (step as TutorialStepIndex)
    : null;
}

/** Rule chip emphasised by each tutorial step (02 §11.5: colours, lines, space). */
const STEP_CHIPS: Readonly<Record<number, RuleChip>> = { 1: 'colours', 2: 'lines', 3: 'space' };

export function selectHomeView(state: AppState, ctx: ViewContext, c: GameConfig = cfg): HomeView {
  const { save } = state;
  const today = localDateKey(ctx.now);
  const level = save.progress.level;
  const solved = save.daily[today];
  return {
    level,
    hard: isHard(level, c),
    continueLevel: save.inProgress.level !== null && save.inProgress.level.id === `L${level}`,
    daily: {
      state: dailyCardState(save, today, c),
      dateKey: today,
      n: dailySlotFor(today).n,
      solvedMs: solved ? solved[0] : null,
      unlockLevel: c.daily.unlockAfterLevel,
    },
    hints: save.stock.hints,
    kitties: save.stock.kitties,
    showTrophy: ctx.capabilities.leaderboards,
    fbSafeZone: ctx.platformId === 'fbig',
    extraCards: [],
    fish: save.wallet.fish,
    event: null, // TODO(C, phase2b §4.4): activeEvent / teaserEvent → HomeEventCardView
    bannerReserved: state.ui.bannerReserved,
  };
}

/** Whether a modal overlay (anything but the non-modal coach) is open. */
export function modalOverlayOpen(state: AppState): boolean {
  return state.overlays.some((id) => id !== 'coach');
}

/** Board input lock (02 §6.4): READY/hint/kitty/won/lost, a modal overlay, an ad, or a helper flow. */
export function boardLocked(state: AppState): boolean {
  const game = state.game;
  if (!game || game.status !== 'playing') return true;
  return modalOverlayOpen(state) || state.ui.inputLocked || state.ui.adShowing;
}

/** null when no game is mounted. */
export function selectGameView(state: AppState, ctx: ViewContext): GameView | null {
  const { game, session, save, ui } = state;
  if (!game || !session) return null;
  const mode = getMode(session.mode);
  const step = asTutorialStep(session.tutorialStep);
  const firstRunTutorial = session.request.mode === 'tutorial' && !session.request.replay;
  const locked = boardLocked(state);
  const toolsReady = game.status === 'playing' && !modalOverlayOpen(state) && !ui.inputLocked && !ui.adShowing;
  const bulbAllowed = step === null ? mode.id !== 'tutorial' : tutorialAllowsTool(step, 'bulb');
  const pawAllowed = mode.kittyAllowed && (step === null || tutorialAllowsTool(step, 'paw'));

  let highlight: BoardHighlight | null = null;
  if (game.status === 'hint' && game.openHint) {
    highlight = { kind: 'hint', step: game.openHint };
  } else if (step !== null && game.status !== 'won') {
    const def = tutorialStep(step);
    if (def.target === 'cells' && def.focusCells.length > 0) highlight = { kind: 'coach', cells: def.focusCells };
  }

  return {
    mode: session.mode,
    level: session.level,
    dateKey: session.dateKey,
    hard: session.hard,
    showHome: !firstRunTutorial,
    hearts: game.hearts,
    maxHearts: game.rules.heartsPerAttempt,
    catsPlaced: game.catsPlaced,
    status: game.status,
    hints: save.stock.hints,
    kitties: save.stock.kitties,
    hintsFree: !mode.chargesHelpers,
    bulbEnabled: toolsReady && bulbAllowed,
    pawEnabled: toolsReady && pawAllowed,
    inputLocked: locked,
    board: {
      puzzleId: game.puzzle.id,
      n: game.puzzle.n,
      regions: game.puzzle.regions,
      colors: session.colors,
      cells: game.cells,
      regionsDone: game.regionsDone,
      patterns: save.settings.patterns,
    },
    highlight,
    chipHighlight: step !== null && game.status !== 'won' ? (STEP_CHIPS[step] ?? null) : null,
    fbSafeZone: ctx.platformId === 'fbig',
    reducedMotion: ui.reducedMotion,
    event: null, // TODO(C, phase2b §4.4): { def, index } in event mode
  };
}

// ─────────────────────────── phase2b selectors (F0 stubs, C) ───────────────────────────

/**
 * The victory screen's props for the win that just happened (phase2b §2.5, §2.6). The callbacks are
 * bound by the caller (win-flow); this maps the data.
 */
export type VictoryData = Omit<VictoryProps, 'now' | 'onPrimary' | 'onHome' | 'onShop'>;
export function selectVictoryView(state: AppState, ctx: ViewContext, c: GameConfig = cfg): VictoryData {
  void state;
  void ctx;
  void c;
  throw new Error('not implemented: selectVictoryView (C, phase2b §2.5)');
}

/** The ranking panel's data (phase2b §2.4, §5.5); `list` follows the ranking-flow's result. */
export type RankingData = Omit<RankingPanelProps, 'onContinue' | 'onSeeTop' | 'onListArea'>;
export function selectRankingView(state: AppState, ctx: ViewContext, c: GameConfig = cfg): RankingData {
  void state;
  void ctx;
  void c;
  throw new Error('not implemented: selectRankingView (C, phase2b §2.4)');
}

/** The event screen's view (phase2b §4.4), or null when no event is active. */
export function selectEventView(state: AppState, ctx: ViewContext, c: GameConfig = cfg): EventScreenView | null {
  void state;
  void ctx;
  void c;
  throw new Error('not implemented: selectEventView (C, phase2b §4.4)');
}
