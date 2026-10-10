// Owner: C (Phase 2b). Phase 2c (G1): Home shows this period's leaderboard points (no fish pill), the
// post-win panel shows the period board in every scored mode, the victory shows level points and the
// fish kept, and the personal records gain the period rows (docs/phase2c/fish-lives-spec.md §2.5–§2.8,
// §4.6).
// Phase 2c.1 (G1, §3.2.5, §4.6, §10.2–§10.3): the game view carries the attempt's running level
// points (null hides the HUD counter: the tutorial, a mode outside levelPoints.modes), the victory
// shows the level's total and no streak, and the period records show Total points (no streak row).
// Selectors from AppState to the UI view models (UI modules define the view types; the app maps).
// Phase 2b: the Home fish pill, event card and banner reserve; the game's event title; and the three
// new selectors (C → B contract, CONTRACTS-2b §4.3): victory, ranking panel and event screen, plus the
// personal records shown whenever other players' rankings cannot be (never fabricated, §5.1).
import { activeEvent, eventEnd, eventRecord, eventStart, sumRewards, teaserEvent, type EventDef } from '../game/events';
import { getMode } from '../game/modes';
import { dailyCardState, isHard, localDateKey, localMidnightAfter, msUntilLocalMidnight } from '../game/progression';
import { dailySlotFor } from '../game/ramp';
import { periodTotal } from '../game/scoring';
import { tutorialAllowsTool, tutorialStep, TUTORIAL_STEP_COUNT, type TutorialStepIndex } from '../game/tutorial';
import type { Capabilities, PlatformId } from '../platform/types';
import type { BoardHighlight } from '../ui/board/board-view';
import type { RuleChip } from '../ui/hud/rule-chips';
import type { PersonalRecordsView, RankingBoardKind, RankingListState, RankingPanelProps } from '../ui/overlays/ranking-panel';
import type { VictoryProps } from '../ui/overlays/victory-screen';
import type { EventScreenView } from '../ui/screens/event-screen';
import type { GameView } from '../ui/screens/game-screen';
import type { HomeEventCardView, HomeView } from '../ui/screens/home-screen';
import { cfg, type GameConfig } from './config';
import { isFlagOn } from './flags';
import type { WinSummary } from './session-effects';
import type { AppState } from './store';

export interface ViewContext {
  /** Clock now(), for today's date key. */
  readonly now: number;
  readonly capabilities: Capabilities;
  readonly platformId: PlatformId;
  /** The bundled event defs (phase2b §4.2); absent = no events. */
  readonly events?: readonly EventDef[];
  /** Board size of a shipped level when it is known without loading (personal records "Your best n×n"). */
  readonly levelSize?: (level: number) => number | null;
  /** phase2b §2.2: the win flow is blocking (from WON until the ranking panel opens): Home and Gear are aria-disabled. */
  readonly chromeLocked?: boolean;
  /** phase2b §4.4: the events chunk's eventArt once that chunk has loaded (the Home event card's art). */
  readonly eventArt?: HomeEventCardView['art'];
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
    // phase2c §2.8: the non-interactive period pill in the lead slot (0 after a rollover).
    period: { kind: c.period.kind, total: periodTotal(save, ctx.now, c) },
    event: selectEventCard(state, ctx, c),
    bannerReserved: state.ui.bannerReserved,
  };
}

const HOUR_MS = 3_600_000;

/**
 * The Home event card (phase2b §4.4): the active event (locked until progress.level passes its
 * unlock level, done once every puzzle is solved), else the event starting within events.teaseHours,
 * else null. Flag `events`.
 */
export function selectEventCard(state: AppState, ctx: ViewContext, c: GameConfig = cfg): HomeEventCardView | null {
  if (!isFlagOn('events') || !ctx.events || ctx.events.length === 0) return null;
  const { save } = state;
  const now = ctx.now;
  const live = activeEvent(ctx.events, now);
  const def = live ?? teaserEvent(ctx.events, now, c);
  if (!def) return null;
  const rec = eventRecord(save, def.id);
  const total = def.puzzles.count;
  const endsAt = eventEnd(def);
  let cardState: HomeEventCardView['state'] = 'teaser';
  if (live) cardState = save.progress.level <= def.unlockAfterLevel ? 'locked' : rec.solved >= total ? 'done' : 'active';
  return {
    def,
    state: cardState,
    now,
    startsAt: eventStart(def),
    endsAt,
    solved: Math.min(rec.solved, total),
    total,
    unlockLevel: def.unlockAfterLevel,
    endsSoon: !!live && endsAt - now <= c.events.cardEndsSoonHours * HOUR_MS,
    art: ctx.eventArt ?? null,
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
    // phase2c.1 §3.2.5: the attempt's running total; null hides the counter (a mode that scores nothing).
    points: game.rules.points.first > 0 ? game.levelPoints : null,
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
    event: session.mode === 'event' && session.event ? { def: session.event.def, index: session.event.index } : null,
    chromeLocked: ctx.chromeLocked === true,
  };
}

// ─────────────────────────── phase2b selectors (C → B, CONTRACTS-2b §4.3) ───────────────────────────

/**
 * Which board the post-win panel shows for a win of this mode (phase2c §2.6, D7): the period board in
 * every scored mode (the event board stays on the event screen and the hub).
 */
export function boardKindOf(_mode: WinSummary['mode']): RankingBoardKind {
  return 'period';
}

/**
 * The victory screen's props for the win that just happened (phase2b §2.5, phase2c §2.7). The
 * callbacks are bound by the caller (session); this maps the data. No fish pill, no "+", no bonus.
 * Phase 2c.1 §10.3: pointsEarned = the level's total when > 0 (counted or not), else null; no streak.
 */
export type VictoryData = Omit<VictoryProps, 'now' | 'onPrimary' | 'onHome'>;
export function selectVictoryView(state: AppState, ctx: ViewContext, win: WinSummary, opts: { readonly praise: number }, c: GameConfig = cfg): VictoryData {
  const { ui } = state;
  const variant: VictoryData['variant'] =
    win.mode === 'tutorial' ? (win.replay ? 'tutorial_replay' : 'tutorial') : win.mode === 'daily' ? 'daily' : win.mode === 'event' ? 'event' : 'level';
  const p = win.period;
  let daily: VictoryData['daily'] = null;
  if (win.mode === 'daily') {
    const key = win.dateKey ?? localDateKey(ctx.now);
    daily = {
      dateKey: key,
      ms: win.ms,
      mistakes: win.mistakes,
      hints: win.hints,
      kitties: win.kitties,
      // The midnight after the daily's OWN date (already past when it was solved after midnight).
      nextPuzzleAt: localMidnightAfter(key) ?? ctx.now + msUntilLocalMidnight(ctx.now),
    };
  }
  let event: VictoryData['event'] = null;
  if (win.mode === 'event' && win.event) {
    const e = win.event;
    const total = e.def.puzzles.count;
    event = {
      nameKey: e.def.nameKey,
      index: e.index,
      total,
      solvedBefore: e.solvedBefore,
      solvedAfter: e.solvedAfter,
      reward: sumRewards(e.milestones.map((m) => m.reward)),
      // L2B-4: after the event's end there is no next puzzle: the primary reads "Back to event".
      last: e.solvedAfter >= total || ctx.now >= eventEnd(e.def),
    };
  }
  const level = win.mode === 'level' ? (win.level ?? null) : win.mode === 'tutorial' ? 1 : null;
  return {
    variant,
    praise: opts.praise,
    level,
    nextLevel: variant === 'level' && level !== null ? level + 1 : variant === 'tutorial' ? 2 : null,
    pointsEarned: win.mode !== 'tutorial' && win.pointsEarned > 0 ? win.pointsEarned : null,
    // The kept-fish row: only when the win added leaderboard points (§2.7: hidden when G = 0).
    kept: p && p.gained > 0 ? { fish: win.kept, max: Math.max(win.maxKept, win.kept), gained: p.gained, total: p.total, kind: p.kind } : null,
    daily,
    event,
    buttonDelayMs: c.fx.winButtonDelayMs,
    reducedMotion: ui.reducedMotion,
    bannerReserved: ui.bannerReserved,
  };
}

/** The ranking panel's data (phase2b §2.4, phase2c §2.6); `list` follows the ranking-flow's result. */
export type RankingData = Omit<RankingPanelProps, 'onContinue' | 'onSeeTop' | 'onListArea'>;
export function selectRankingView(
  state: AppState,
  ctx: ViewContext,
  win: WinSummary,
  list: RankingListState,
  opts: { readonly tapMinMs: number },
  c: GameConfig = cfg,
): RankingData {
  // phase2c §2.6: always the period board after a non-tutorial win ("+2 fish · This week: 42"; the
  // "+" part is left out when the win added nothing).
  const p = win.period;
  const total = p ? p.total : periodTotal(state.save, ctx.now, c);
  return {
    board: 'period',
    eventNameKey: null,
    result: { kind: 'period', gained: p ? p.gained : 0, total, periodKind: p ? p.kind : c.period.kind },
    periodKind: p ? p.kind : c.period.kind,
    list,
    tapMinMs: opts.tapMinMs,
    reducedMotion: state.ui.reducedMotion,
  };
}

/** What the personal-records card shows a result against (this win, or the hub's latest record). */
export interface RecordsInput {
  readonly board: RankingBoardKind;
  readonly n: number;
  readonly thisMs: number;
  /** Event board: the event (its record is read from the save). */
  readonly event?: EventDef | null;
}

/**
 * The player's own records (§2.4 "Your records", §4.8): this result, the best time on this board size,
 * total points, levels solved, and for an event "7 of 21, total 1:12:04". Phase 2c §4.6, the period
 * board: this period's total, the best period (and levels solved); phase2c.1 (D24): Total points
 * (totalPoints, the lifetime points.total) instead of the retired perfect streak. Only facts from the
 * save.
 */
export function personalRecords(state: AppState, ctx: ViewContext, input: RecordsInput, c: GameConfig = cfg): PersonalRecordsView {
  const { save } = state;
  let best: number | null = null;
  const keep = (ms: number): void => {
    if (ms > 0 && (best === null || ms < best)) best = ms;
  };
  if (input.board === 'daily') {
    for (const [date, rec] of Object.entries(save.daily)) {
      try {
        if (dailySlotFor(date).n === input.n) keep(rec[0]);
      } catch {
        // a bad key never breaks the card
      }
    }
  } else if (input.board === 'period' && ctx.levelSize) {
    for (const [level, rec] of Object.entries(save.progress.best)) {
      const n = ctx.levelSize(Number(level));
      if (n === input.n) keep(rec[0]);
    }
  }
  const ev = input.event ?? null;
  const rec = ev ? eventRecord(save, ev.id) : null;
  const period =
    input.board === 'period' ? { period: { kind: c.period.kind, total: periodTotal(save, ctx.now, c), best: save.period.bestTotal } } : {};
  return {
    board: input.board,
    thisMs: Math.max(0, Math.round(input.thisMs)),
    n: input.n,
    bestSizeMs: best,
    totalPoints: save.points.total,
    levelsSolved: save.progress.completed,
    event: ev && rec ? { solved: rec.solved, total: ev.puzzles.count, totalMs: rec.ms } : null,
    ...period,
  };
}

/** The event screen's view (phase2b §4.4), or null when there is no such event running. */
export function selectEventView(state: AppState, ctx: ViewContext, def?: EventDef | null): EventScreenView | null {
  const ev = def ?? (ctx.events ? activeEvent(ctx.events, ctx.now) : null);
  if (!ev) return null;
  const rec = eventRecord(state.save, ev.id);
  const total = ev.puzzles.count;
  const solved = Math.min(rec.solved, total);
  return {
    def: ev,
    now: ctx.now,
    endsAt: eventEnd(ev),
    solved,
    total,
    track: ev.track.map((m) => ({ ...m, reached: solved >= m.at })),
    nextIndex: solved < total ? solved : null,
    fbSafeZone: ctx.platformId === 'fbig',
    reducedMotion: state.ui.reducedMotion,
    bannerReserved: state.ui.bannerReserved,
  };
}
