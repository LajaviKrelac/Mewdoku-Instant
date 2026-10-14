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
// Phase 2d (G1, docs/phase2d/look-spec.md §4.3): the game view's helper pulse (§1.11, rule 'auto'),
// the mouse (§1.12), the video badge (videoRefill), the banner band (§1.16) and the gear's dot
// (§1.15, also on Home and the event screen).
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §4.6, D-2d1-9): the 'auto' pulse waits for
// fx.helperPulse.idleMs without a board change (ViewContext.lastBoardChangeAt, kept by the session:
// the last mark, unmark, cat or mistake, the end of the board entry, a revive, the page becoming
// visible again), needs stock (needsStock) and stops for the attempt once a helper was used
// (untilHelperUsed: hintsUsed, kittiesUsed, ViewContext.mouseUses).
// Phase 2e (G1, docs/phase2e/spec.md §2.5, §5.3, §6.1): "today" is dailyDateKey(now) (daily.dayStartHour)
// and "Next puzzle in …" counts down to nextDayStartAfter; Home gains the ranking chip (HomeView.ladder:
// the ladder flow's chip when it is active, else the records chip with the period pill's content) and
// the streak strip (HomeView.streak, after the tutorial, dayStreak.showOnHome); the victory gains the
// streak row (the day's first counted win, dayStreak.victoryRow) and the daily reward line.
import { streakView, rewardForDay, type StreakView } from '../game/day-streak';
import { activeEvent, eventEnd, eventRecord, eventStart, sumRewards, teaserEvent, type EventDef } from '../game/events';
import { getMode } from '../game/modes';
import { hasMouseCandidate } from '../game/mouse';
import { settingsDotOn } from '../game/save';
import { dailyCardState, dailyDateKey, isHard, nextDayStartAfter } from '../game/progression';
import { dailySlotFor, isExtraHardBoard, levelTier, type BoardDifficulty } from '../game/ramp';
import { periodTotal } from '../game/scoring';
import { tutorialAllowsTool, tutorialStep, TUTORIAL_STEP_COUNT, type TutorialStepIndex } from '../game/tutorial';
import { CellState, type GameState } from '../game/types';
import type { Capabilities, PlatformId } from '../platform/types';
import type { BoardHighlight } from '../ui/board/board-view';
import type { RuleChip } from '../ui/hud/rule-chips';
import type { PersonalRecordsView, RankingBoardKind, RankingListState, RankingPanelProps } from '../ui/overlays/ranking-panel';
import type { VictoryProps } from '../ui/overlays/victory-screen';
import type { EventScreenView } from '../ui/screens/event-screen';
import type { GameView } from '../ui/screens/game-screen';
import type { HomeEventCardView, HomeView } from '../ui/screens/home-screen';
import type { LadderChipView } from '../ui/hud/ladder-chip';
import type { StreakStripView } from '../ui/hud/streak-strip';
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
  /**
   * UI batch (2026-10-13, levelbutton): a level's board when it is in memory without loading (a loaded pack, a cached
   * substitute or generated endless board), for the Home button's tier. Absent or null: the shipped list (levelTier).
   */
  readonly levelBoard?: (level: number) => BoardDifficulty | null;
  /** phase2b §2.2: the win flow is blocking (from WON until the ranking panel opens): Home and Gear are aria-disabled. */
  readonly chromeLocked?: boolean;
  /** phase2b §4.4: the events chunk's eventArt once that chunk has loaded (the Home event card's art). */
  readonly eventArt?: HomeEventCardView['art'];
  /**
   * Phase 2d.1 §4.6: clock time of the last board change (mark, unmark, cat, mistake), of the end of
   * the board entry (START), of a revive, or of the page becoming visible again, whichever is latest.
   * Absent: the board has not been idle yet (no 'auto' pulse).
   */
  readonly lastBoardChangeAt?: number;
  /** Phase 2d.1 §4.6: uses of the mouse in this attempt (HelperFlows' per-attempt counter). */
  readonly mouseUses?: number;
  /**
   * Phase 2e (spec §2.5): the ranking chip from the ladder flow while the ladder is active; absent = the
   * records chip (the period pill's content; the web, no server, the ladder off).
   */
  readonly ladderChip?: LadderChipView;
}

/** A SessionMeta.tutorialStep as the tutorial module's step type (null outside 1..6). */
export function asTutorialStep(step: number | null): TutorialStepIndex | null {
  return step !== null && Number.isInteger(step) && step >= 1 && step <= TUTORIAL_STEP_COUNT
    ? (step as TutorialStepIndex)
    : null;
}

/** Rule chip emphasised by each tutorial step (02 §11.5: colours, lines, space). */
const STEP_CHIPS: Readonly<Record<number, RuleChip>> = { 1: 'colours', 2: 'lines', 3: 'space' };

/**
 * Phase 2e (spec §5.3): the Home streak strip for `today` (dailyDateKey), or null: before the tutorial is
 * done, with flag `dayStreak` or dayStreak.enabled / showOnHome off.
 */
export function selectStreakStrip(state: AppState, today: string, c: GameConfig = cfg): StreakStripView | null {
  const { save } = state;
  if (!save.tutorialDone || !isFlagOn('dayStreak') || !c.dayStreak.enabled || !c.dayStreak.showOnHome) return null;
  return streakStripOf(streakView(save.dayStreak, today, c), c);
}

/** The pill's (and the UI batch streak screen's) view of a streakView. */
export function streakStripOf(v: StreakView, c: GameConfig = cfg): StreakStripView {
  return {
    state: v.alive ? (v.todayDone ? 'done' : 'alive') : v.broken ? 'new' : 'none',
    day: v.day,
    total: v.total,
    rewardDay: v.todayDone && v.day === v.total && rewardForDay(v.day, c) !== null,
    run: v.alive ? v.run : 0,
  };
}

export function selectHomeView(state: AppState, ctx: ViewContext, c: GameConfig = cfg): HomeView {
  const { save } = state;
  const today = dailyDateKey(ctx.now, c);
  const level = save.progress.level;
  const solved = save.daily[today];
  return {
    level,
    hard: isHard(level, c),
    // UI batch (2026-10-13): the Play button's Hard / Extra hard frame, from the board when it is in memory.
    tier: levelTier(level, c, isHard(level, c) ? (ctx.levelBoard?.(level) ?? null) : null),
    continueLevel: save.inProgress.level !== null && save.inProgress.level.id === `L${level}`,
    daily: {
      state: dailyCardState(save, today, c),
      dateKey: today,
      n: dailySlotFor(today).n,
      solvedMs: solved ? solved[0] : null,
      unlockLevel: c.daily.unlockAfterLevel,
      endsAt: nextDayStartAfter(today, c),
    },
    hints: save.stock.hints,
    kitties: save.stock.kitties,
    fbSafeZone: ctx.platformId === 'fbig' && isFlagOn('fbSafeZone'),
    extraCards: [],
    // phase2c §2.8: the non-interactive period pill in the lead slot (0 after a rollover).
    period: { kind: c.period.kind, total: periodTotal(save, ctx.now, c) },
    event: selectEventCard(state, ctx, c),
    bannerReserved: state.ui.bannerReserved,
    settingsDot: settingsDotOn(save, c),
    // Phase 2e §2.5: the ranking chip (the ladder flow's while active, else the records chip).
    // A 'records' chip from the flow (no server) carries this week's real total from the save.
    ladder: ctx.ladderChip && ctx.ladderChip.state !== 'records' ? ctx.ladderChip : { state: 'records', period: { kind: c.period.kind, total: periodTotal(save, ctx.now, c) } },
    streak: selectStreakStrip(state, today, c),
    avatarId: save.ladder.me?.avatarId ?? null,
    frameId: save.ladder.me?.frameId ?? 0,
    backgroundId: save.ladder.me?.backgroundId ?? 0,
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

/** Nothing marked or placed yet: every cell Empty (a given cat is part of the puzzle, not a move). */
export function untouchedBoard(game: Pick<GameState, 'cells'>): boolean {
  for (const v of game.cells) if (v !== CellState.Empty && v !== CellState.Given) return false;
  return true;
}

/**
 * Phase 2d §1.11: which helper pulses, from fx.helperPulse.target. Never while the attempt is not
 * playing, an overlay (a modal, the hint card, O2, the coach) is open, in the tutorial, from the win
 * flow on (status won, chromeLocked), or with reduced motion. 'kitty' / 'bulb' pin one (2d: whenever
 * it is enabled); 'off' none. The chosen helper pulses only while it is enabled (no fallback).
 * Phase 2d.1 §4.6 (D-2d1-9), 'auto': the kitty while every tile is empty, else the bulb, and only
 * when (a) the board has not changed for fx.helperPulse.idleMs (ctx.lastBoardChangeAt: the last
 * mark, unmark, cat or mistake, the end of the board entry, a revive, the page's return), (b) with
 * needsStock, that helper has stock (a helper showing the video badge never pulses and the other one
 * does not take its place), and (c) with untilHelperUsed, no hint, kitty or mouse was used in this
 * attempt (hintsUsed, kittiesUsed, ctx.mouseUses).
 */
export function selectPulse(
  state: AppState,
  ctx: Pick<ViewContext, 'chromeLocked' | 'now' | 'lastBoardChangeAt' | 'mouseUses'>,
  enabled: { readonly paw: boolean; readonly bulb: boolean },
  c: GameConfig = cfg,
): 'paw' | 'bulb' | null {
  const { game, session, ui } = state;
  const rule = c.fx.helperPulse;
  const target = rule.target;
  if (!game || !session || target === 'off') return null;
  if (game.status !== 'playing' || state.overlays.length > 0 || session.mode === 'tutorial') return null;
  if (ctx.chromeLocked === true || ui.reducedMotion) return null;
  if (target === 'kitty') return enabled.paw ? 'paw' : null;
  if (target === 'bulb') return enabled.bulb ? 'bulb' : null;
  const pick: 'paw' | 'bulb' = untouchedBoard(game) ? 'paw' : 'bulb';
  if (!enabled[pick]) return null;
  const since = ctx.lastBoardChangeAt;
  if (since === undefined || !(ctx.now - since >= rule.idleMs)) return null;
  if (rule.needsStock && getMode(session.mode).chargesHelpers) {
    const stock = pick === 'paw' ? state.save.stock.kitties : state.save.stock.hints;
    if (!(stock > 0)) return null;
  }
  if (rule.untilHelperUsed && (game.hintsUsed > 0 || game.kittiesUsed > 0 || (ctx.mouseUses ?? 0) > 0)) return null;
  return pick;
}

/** null when no game is mounted. */
export function selectGameView(state: AppState, ctx: ViewContext, c: GameConfig = cfg): GameView | null {
  const { game, session, save, ui } = state;
  if (!game || !session) return null;
  const mode = getMode(session.mode);
  const step = asTutorialStep(session.tutorialStep);
  const firstRunTutorial = session.request.mode === 'tutorial' && !session.request.replay;
  const locked = boardLocked(state);
  const toolsReady = game.status === 'playing' && !modalOverlayOpen(state) && !ui.inputLocked && !ui.adShowing;
  const bulbAllowed = step === null ? mode.id !== 'tutorial' : tutorialAllowsTool(step, 'bulb');
  const pawAllowed = mode.kittyAllowed && (step === null || tutorialAllowsTool(step, 'paw'));
  const bulbEnabled = toolsReady && bulbAllowed;
  const pawEnabled = toolsReady && pawAllowed;
  // §1.12: shown with cfg.mouse.enabled where the mode allows the kitty, never in the tutorial (any step).
  const mouseShown = c.mouse.enabled && mode.mouseAllowed && step === null && session.mode !== 'tutorial';

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
    // UI batch (2026-10-13): the badge says Extra hard when the board being played is one (levelTier's rule).
    tier: session.hard ? (isExtraHardBoard(game.puzzle, c) ? 'extra' : 'hard') : 'normal',
    showHome: !firstRunTutorial,
    hearts: game.hearts,
    maxHearts: game.rules.heartsPerAttempt,
    catsPlaced: game.catsPlaced,
    // phase2c.1 §3.2.5: the attempt's running total; null hides the counter (a mode that scores nothing).
    points: game.rules.points.first > 0 ? game.levelPoints : null,
    // The combo bar (user, 2026-10-12): what is left of the countdown on the game's own clock.
    combo:
      game.combo > 0
        ? {
            count: game.combo,
            windowMs: game.comboWindowMs,
            leftMs: Math.max(0, game.comboEndsMs - game.elapsedMs),
            running: (game.status === 'playing' || game.status === 'hint' || game.status === 'kitty') && !ui.paused && !ui.adShowing,
          }
        : null,
    status: game.status,
    hints: save.stock.hints,
    kitties: save.stock.kitties,
    hintsFree: !mode.chargesHelpers,
    bulbEnabled,
    pawEnabled,
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
    fbSafeZone: ctx.platformId === 'fbig' && isFlagOn('fbSafeZone'),
    reducedMotion: ui.reducedMotion,
    event: session.mode === 'event' && session.event ? { def: session.event.def, index: session.event.index } : null,
    chromeLocked: ctx.chromeLocked === true,
    // ── phase 2d (§4.3) ──
    pulse: selectPulse(state, ctx, { paw: pawEnabled, bulb: bulbEnabled }, c),
    mouse: { shown: mouseShown, enabled: mouseShown && toolsReady && hasMouseCandidate(game) },
    videoRefill: c.ads.enabled && ctx.capabilities.rewarded,
    bannerBand: session.bannerBand === true && !save.purchases.noAds,
    settingsDot: settingsDotOn(save, c),
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
export function selectVictoryView(
  state: AppState,
  ctx: ViewContext,
  win: WinSummary,
  opts: {
    readonly praise: number;
    /**
     * Phase 2e (spec §2.3; requests-G3 R4): my bracket's total while the worldwide ranking is active for
     * this win: the kept-fish row then reads "+2 · Your total: 14" (kind 'ladder'). Absent / null: this period's.
     */
    readonly ladderTotal?: number | null;
    /** Audit B9 / A-H1: fish still waiting to be sent ("· +3 waiting" after the server's total); absent = 0. */
    readonly ladderWaiting?: number;
  },
  c: GameConfig = cfg,
): VictoryData {
  const { ui } = state;
  const variant: VictoryData['variant'] =
    win.mode === 'tutorial' ? (win.replay ? 'tutorial_replay' : 'tutorial') : win.mode === 'daily' ? 'daily' : win.mode === 'event' ? 'event' : 'level';
  const p = win.period;
  let daily: VictoryData['daily'] = null;
  if (win.mode === 'daily') {
    const key = win.dateKey ?? dailyDateKey(ctx.now, c);
    // The start of the day after the daily's OWN date (already past when it was solved after it);
    // Phase 2e: daily.dayStartHour (nextDayStartAfter, DST-safe).
    const next = nextDayStartAfter(key, c);
    daily = {
      dateKey: key,
      ms: win.ms,
      mistakes: win.mistakes,
      hints: win.hints,
      kitties: win.kitties,
      nextPuzzleAt: Number.isFinite(next) ? next : nextDayStartAfter(dailyDateKey(ctx.now, c), c),
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
    kept:
      p && p.gained > 0
        ? opts.ladderTotal !== undefined && opts.ladderTotal !== null
          ? { fish: win.kept, max: Math.max(win.maxKept, win.kept), gained: p.gained, total: opts.ladderTotal, kind: 'ladder', waiting: opts.ladderWaiting ?? 0 }
          : { fish: win.kept, max: Math.max(win.maxKept, win.kept), gained: p.gained, total: p.total, kind: p.kind }
        : null,
    daily,
    event,
    buttonDelayMs: c.fx.winButtonDelayMs,
    reducedMotion: ui.reducedMotion,
    bannerReserved: ui.bannerReserved,
    // Phase 2e §5.3: the streak row on the day's first counted win only (null = no row); §6.1: the daily reward.
    streak: win.streak && c.dayStreak.victoryRow && isFlagOn('dayStreak') ? win.streak : null,
    dailyReward: win.dailyReward ?? null,
  };
}

/** The ranking panel's data (phase2b §2.4, phase2c §2.6); `list` follows the ranking-flow's result. */
export type RankingData = Omit<RankingPanelProps, 'onContinue' | 'onSeeTop' | 'onListArea' | 'onHeart' | 'onInfo'>;
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
export function selectEventView(state: AppState, ctx: ViewContext, def?: EventDef | null, c: GameConfig = cfg): EventScreenView | null {
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
    fbSafeZone: ctx.platformId === 'fbig' && isFlagOn('fbSafeZone'),
    reducedMotion: state.ui.reducedMotion,
    bannerReserved: state.ui.bannerReserved,
    settingsDot: settingsDotOn(state.save, c),
  };
}
