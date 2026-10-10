// Owner: C (Phase 2b; was app)
// Level-session orchestrator (04 §3, §5.2, §5.7): reducer + effects (audio, haptics, announcer,
// saves, analytics, FX routing), START / KITTY_DONE timers, 1 s TICK while visible, hint free-reopen
// cache, helper and ad flows, tutorial filter/advance, win/lose bookkeeping and overlays.
// Phase 2b: event puzzles (mode `event`, §4.4) and the post-win flow (§2.2): the rewards (fish,
// points, event progress) are saved with the win at t = 0, the ranking submission and fetch start at
// once, then win-flow.ts plays glow → fish → ranking panel → victory screen on the session clock.
// Helper flows live in helper-flows.ts, pure effect tables in session-effects.ts, timers and overlay
// props in session-parts.ts.
// Phase 2c (G1, docs/phase2c/fish-lives-spec.md): fish are the lives. A scored win submits this
// period's leaderboard points (and an event win its event board) as one batch, the panel shows the
// period board, and the fish kept fly from the lives pill to the period counter (§2, §4.4). No fish
// wallet, no shop entry from the victory.
// Phase 2c.1 (G1, §3.2.5): level points live in GameState (per attempt) and in the in-progress slot,
// which commit writes in the same store update as the board, so Home and a reload resume the points
// and the cat run exactly; the cross-level perfect streak (streakBreaks / breakStreak) is gone. A
// scoring cat's announcement ends with the running total (POINTS → a11y.points, one utterance).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.12, §1.14, §1.16, §4.3): the mouse helper (onMouse, its
// per-X mark sounds), the level-start toast from playBoardEntry on a fresh board or a Retry (never on
// a resumed board, a revive or the tutorial), and the banner during play: the band is decided at
// mount (BannerFlow.eligible('game') → SessionMeta.bannerBand), a banner already up stays into an
// eligible board (no hide), and the board entry's end is the game screen's screenShown('game').
import type { CellIndex, HintStep, Puzzle } from '../engine/types';
import { eventEnd, eventRules, type EventDef } from '../game/events';
import { newGame, restoreGame, toInProgress } from '../game/factory';
import { getMode, rulesFor } from '../game/modes';
import { isHard } from '../game/progression';
import { reduce } from '../game/reducer';
import { validateSlot } from '../game/save';
import { encodeDailyScore, encodeEventScore, encodePeriodScore } from '../game/scoring';
import { advance, filterTutorialAction, tutorialStep } from '../game/tutorial';
import type { Action, BoardKey, GameEvent, GameState, ModeId, RuleFlags } from '../game/types';
import type { RankingListState, RankScoreView } from '../ui/overlays/ranking-panel';
import { periodRankTitle } from '../ui/period-text';
import type { GameScreen, GameScreenCallbacks, GameView, StartToastKind } from '../ui/screens/game-screen';
import { t } from '../i18n';
import type { TimerId } from './clock';
import { cfg } from './config';
import type { AnalyticsEvent, RankResult } from './events';
import { createHelperFlows } from './helper-flows';
import type { BoardScore } from './ranking-flow';
import { feedbackFor, failEvent, levelParam, mistakeEvent, startEvents, winBookkeeping, type WinSummary } from './session-effects';
import { createFeedbackPlayer, createSessionTimers, defaultColors, defaultPraise, overlayProps, withoutSlot, withSlot, type SaveSlot } from './session-parts';
import { createTransitions } from './session-transitions';
import { shallowEqual, type AppState, type OverlayId, type SessionMeta, type SessionRequest } from './store';
import { asTutorialStep, boardKindOf, boardLocked, personalRecords, selectGameView, selectRankingView, selectVictoryView, type ViewContext } from './views';
import { createWinFlow, victoryCrossfadeMs, type WinFlowVariant } from './win-flow';

export type { GameCommands, Session, SessionDeps } from './session-types';
import type { Session, SessionDeps } from './session-types';

export function createSession(deps: SessionDeps): Session {
  const c = deps.config ?? cfg;
  const { store, bus, clock, router, platform } = deps;
  const caps = () => platform.capabilities();
  const game = (): GameState | null => store.get().game;
  const meta = (): SessionMeta | null => store.get().session;
  const save = () => store.get().save;
  const log = (e: AnalyticsEvent): void => bus.emit('analytics', e);
  const toast = (message: string): void => router.toast(message);
  const updateSave = (fn: (s: AppState['save']) => AppState['save']): void =>
    store.update((s) => {
      const next = fn(s.save);
      return next === s.save ? s : { ...s, save: next };
    });
  const setLock = (inputLocked: boolean): void =>
    store.update((s) => (s.ui.inputLocked === inputLocked ? s : { ...s, ui: { ...s.ui, inputLocked } }));
  const slotFor = (m: SessionMeta): SaveSlot | null => (m.substitute ? null : getMode(m.mode).saveSlot);
  const viewCtx = (): ViewContext => ({
    now: clock.now(),
    capabilities: caps(),
    platformId: platform.id,
    ...(deps.levelSize ? { levelSize: deps.levelSize } : {}),
    // §2.2: from WON until the ranking panel opens, Home and Gear render aria-disabled.
    ...(winFlow.blocking() ? { chromeLocked: true } : {}),
  });

  let gen = 0;
  let disposed = false;
  let busy = false;
  let screen: GameScreen | null = null;
  let unbindView: (() => void) | null = null;
  const listeners = new Set<(state: GameState, events: readonly GameEvent[]) => void>();
  const fx = createFeedbackPlayer(deps, c, () => save().settings.haptics && caps().haptics);
  const timers = createSessionTimers(clock, c, {
    tickable: () => {
      const s = game();
      return !disposed && !!s && (s.status === 'playing' || s.status === 'hint' || s.status === 'kitty');
    },
    tick: (dtMs) => {
      const s = game();
      if (!s || dtMs <= 0) return;
      const { state } = reduce(s, { type: 'TICK', dtMs });
      if (state !== s) store.update((app) => ({ ...app, game: state }));
    },
    onPausedChange: (paused) => store.update((s) => (s.ui.paused === paused ? s : { ...s, ui: { ...s.ui, paused } })),
    mute: (reason, on) => deps.audio.setMuted(reason, on),
  });

  async function runBusy(fn: (alive: () => boolean) => Promise<void>): Promise<void> {
    if (busy || disposed) return;
    const mine = gen;
    busy = true;
    setLock(true);
    try {
      await fn(() => gen === mine && !disposed);
    } catch (error) {
      bus.emit('error', { where: 'session', error });
    } finally {
      if (gen === mine) {
        busy = false;
        setLock(false);
      }
    }
  }

  const helpers = createHelperFlows({
    config: c,
    clock,
    bus,
    router,
    adFlow: deps.adFlow,
    engine: deps.engine,
    saves: deps.saves,
    sessionStartedAt: deps.sessionStartedAt,
    capabilities: caps,
    game,
    meta,
    save,
    updateSave,
    dispatch: (a) => dispatch(a),
    runBusy,
    busy: () => busy,
    toast,
    log,
    openHint,
    afterKitty: () => {
      if (game()?.status === 'kitty') timers.later(c.kitty.revealMs, () => dispatch({ type: 'KITTY_DONE' }));
    },
  });

  const winFlow = createWinFlow({
    clock,
    config: c,
    sfx: { play: (id, opts) => fx.guard(() => deps.sfx.play(id, opts)) },
    haptics: (pattern) => {
      if (save().settings.haptics && caps().haptics) fx.guard(() => platform.haptics.pulse(pattern));
    },
    announce: (message) => fx.announce(message),
    root: () => deps.root?.() ?? null,
    ...(deps.winFx ? { fx: deps.winFx } : {}),
    onError: (error) => bus.emit('error', { where: 'win_flow', error }),
    openRanking: (opts) => openRanking(opts.tapMinMs),
    openVictory: () => openVictory(),
    onBlockingChange: () => refreshGameView(),
    // PERF-3: the screen turns inert under the scrim's fade, not in the ranking panel's first frame.
    onScrim: () => router.reserveModal?.(),
  });

  /** Re-renders the game screen from the store (state outside the store changed: the win flow's lock). */
  function refreshGameView(): void {
    const v = selectGameView(store.get(), viewCtx(), c);
    if (v && screen) screen.update(v);
  }

  // ─────────────────────────────── reduce + effects ───────────────────────────────

  function dispatch(action: Action, bypassFilter = false): void {
    const m = meta();
    if (!game() || !m || disposed) return;
    let a = action;
    const step = asTutorialStep(m.tutorialStep);
    if (m.mode === 'tutorial' && step !== null && !bypassFilter) {
      const f = filterTutorialAction(step, game() as GameState, a);
      if (f === null) return;
      if (f.type === 'PULSE_ONLY') {
        screen?.playEvent({ type: 'PULSE', cell: f.cell });
        return;
      }
      a = f;
    }
    // Credit the partial second before an action that may end the attempt (solve time accuracy).
    if (a.type === 'DOUBLE_TAP' || a.type === 'HINT_APPLY' || a.type === 'KITTY') timers.flushTick();
    const prev = game() as GameState;
    const { state, events } = reduce(prev, a);
    if (state === prev && events.length === 0) return;
    commit(prev, state, a, events, m);
  }

  function commit(prev: GameState, state: GameState, a: Action, events: readonly GameEvent[], m: SessionMeta): void {
    // phase2c.1 §3.2.3: the slot (board, lives and the attempt's level points / cat run / scored
    // rows, toInProgress) is written in the same store update as the game, so a reload never pairs a
    // board with older points. A scoring cat changes `cells`; a mistake changes `cells` and `hearts`.
    const changed = state.cells !== prev.cells || state.hearts !== prev.hearts || state.revivesUsed !== prev.revivesUsed;
    const slot = slotFor(m);
    const writeSlot = slot !== null && changed && state.status !== 'won';
    const now = clock.now();
    if (state !== prev || writeSlot) {
      store.update((app) => ({ ...app, game: state, save: writeSlot ? withSlot(app.save, slot, toInProgress(state, now)) : app.save }));
    }
    if (state.cells !== prev.cells || a.type === 'RETRY' || a.type === 'REVIVE') helpers.clearHintCache();
    if (a.type === 'RETRY') helpers.newAttempt();
    if (events.length) bus.emit('game:events', { events, state, prev });
    for (const fn of [...listeners]) fn(state, events);
    // phase2c.1 §10.4: the lines of one action are joined into ONE announcement (the POINTS line
    // follows its CAT_PLACED line: "Cat placed. 3 of 8. 2,016 points.").
    const lines: string[] = [];
    for (const ev of events) {
      screen?.playEvent(ev);
      const fb = feedbackFor(ev, state, m.colors, c);
      fx.play(fb);
      if (ev.type === 'MARKED' && ev.source === 'mouse') mouseTicks(ev.cells.length);
      if (fb.announce) lines.push(fb.announce);
      if (ev.type === 'MISTAKE') log(mistakeEvent(m, state));
      else if (ev.type === 'WON') onWon(state, m, false);
      else if (ev.type === 'LOST') onLost(state, m);
    }
    if (lines.length) fx.announce(lines.join(' '));
    if (writeSlot) deps.saves.touch();
    timers.sync();
    if (m.mode === 'tutorial') tutorialAdvance();
  }

  /**
   * Phase 2d §1.12: the mark sound per X of the mouse, in step with the board's pops fx.mouseStaggerMs
   * apart (the first one is the MARKED's own sound). Reduced motion: the X's appear at once, one sound.
   */
  function mouseTicks(count: number): void {
    if (store.get().ui.reducedMotion) return;
    for (let i = 1; i < count; i++) timers.later(i * c.fx.mouseStaggerMs, () => fx.play({ sfx: 'mark' }));
  }

  // ─────────────────────────────── win (phase2b §2.2) ───────────────────────────────

  /** The current win, from WON until the session leaves the board. */
  let win: {
    readonly summary: WinSummary;
    readonly meta: SessionMeta;
    readonly praise: number;
    readonly board: BoardKey | null;
    result: RankResult | null;
    panelOpen: boolean;
    logged: boolean;
  } | null = null;

  /** Every cat cell in row order (the solution cells of a won board). */
  function catCells(puzzle: Puzzle): CellIndex[] {
    const out: CellIndex[] = [];
    for (let r = 0; r < puzzle.n; r++) out.push(r * puzzle.n + (puzzle.solution[r] ?? 0));
    return out;
  }

  /**
   * The boards a counted win submits, as one batch (phase2c §4.4): this period's leaderboard points
   * when the win added some (G > 0), the event board for an event win, daily_fastest only with
   * rank.dailyBoard. A win that adds nothing submits nothing.
   */
  function winBoards(summary: WinSummary, m: SessionMeta): BoardScore[] {
    const out: BoardScore[] = [];
    if (!summary.counted || summary.mode === 'tutorial') return out;
    const p = summary.period;
    if (p && p.gained > 0) out.push({ board: c.rank.boards.period, score: encodePeriodScore(p.key, p.total, c) });
    if (summary.mode === 'event' && summary.event) {
      const e = summary.event;
      out.push({ board: e.def.leaderboard, score: encodeEventScore(e.solvedAfter, e.totalMs) });
    }
    if (summary.mode === 'daily' && m.dateKey && c.rank.dailyBoard) out.push({ board: c.rank.boards.daily, score: encodeDailyScore(m.dateKey, summary.ms, c) });
    return out;
  }

  /** My own score on the period board as I know it ("Your score: 42 fish"), never a guess. */
  function myScoreView(summary: WinSummary): RankScoreView | null {
    return summary.period ? { kind: 'fish', fish: summary.period.total } : null;
  }

  function listFor(w: NonNullable<typeof win>): RankingListState {
    if (!w.result) return { kind: 'loading' };
    const s = w.summary;
    const records = personalRecords(store.get(), viewCtx(), {
      board: boardKindOf(s.mode),
      n: s.n,
      thisMs: s.ms,
      event: s.event?.def ?? null,
    }, c);
    const ctx = { records, myScore: myScoreView(s), ...(s.period ? { periodKey: s.period.key } : {}) };
    if (!deps.rankings) return { kind: 'records', records, reason: 'local' };
    return deps.rankings.listState(w.result, ctx);
  }

  /** The period board's title ("Weekly ranking"), for the FB overlay list (phase2c §2.6). */
  function rankingTitle(w: NonNullable<typeof win>): string {
    return periodRankTitle(w.summary.period?.kind ?? c.period.kind);
  }

  function logPanel(w: NonNullable<typeof win>): void {
    if (w.logged || !w.panelOpen || !w.result || !w.board) return;
    w.logged = true;
    log({
      name: 'rank_panel',
      params: { board: w.board, api: w.result.api, ms: deps.rankings?.fetchMs(w.board) ?? 0, ok: w.result.ok ? 1 : 0 },
    });
  }

  function rankingProps(w: NonNullable<typeof win>, tapMinMs: number) {
    const band = w.summary.period ? { periodKey: w.summary.period.key } : undefined;
    return {
      ...selectRankingView(store.get(), viewCtx(), w.summary, listFor(w), { tapMinMs }, c),
      onContinue: () => winFlow.continueFromRanking(),
      onSeeTop: () => {
        if (w.board) void deps.rankings?.showList(w.board, rankingTitle(w), undefined, undefined, band, myScoreView(w.summary) ?? undefined);
      },
      onListArea: (rect: DOMRect) => {
        if (!w.board || !deps.rankings) return;
        void deps.rankings.showList(w.board, rankingTitle(w), rect, undefined, band, myScoreView(w.summary) ?? undefined).then((ok) => {
          if (ok || win !== w || !router.isOpen('ranking')) return;
          // The overlay could not be placed: the honest fallback is my own records.
          const records = personalRecords(store.get(), viewCtx(), { board: boardKindOf(w.summary.mode), n: w.summary.n, thisMs: w.summary.ms, event: w.summary.event?.def ?? null }, c);
          router.update('ranking', { ...rankingProps(w, tapMinMs), list: { kind: 'records', records, reason: 'unavailable' } });
        });
      },
    };
  }

  let panelTapMinMs = c.rank.panelTapMinMs;
  function openRanking(tapMinMs: number): void {
    const w = win;
    if (!w) return;
    w.panelOpen = true;
    panelTapMinMs = tapMinMs;
    router.open('ranking', rankingProps(w, tapMinMs));
    logPanel(w);
  }

  function openVictory(): void {
    const w = win;
    if (!w) return;
    const firstRunTutorial = w.summary.mode === 'tutorial' && !w.summary.replay;
    // §3.2: the victory screen may carry a banner in its own reserved band (set before the props are built).
    if (deps.banners) void deps.banners.screenShown('victory', { firstRunTutorial }).catch(() => undefined);
    const data = selectVictoryView(store.get(), viewCtx(), w.summary, { praise: w.praise }, c);
    const m = w.meta;
    router.open('victory', {
      ...data,
      now: () => clock.now(),
      onPrimary: () => {
        if (m.mode === 'daily') void session.onDailyDone();
        else void session.onNext();
      },
      onHome: () => session.onHome(),
    });
    deps.rankings?.closeList();
    // UX-4: a crossfade. The victory opens over the ranking panel at the tap and fades in (the overlay
    // fade, fx.overlayFadeMs; reduced: fx.screenReducedMs); the panel, fading out under it, closes
    // only once the victory is opaque, so the dimmed screen never drops back to the bare board.
    if (router.isOpen('ranking')) {
      timers.later(victoryCrossfadeMs(store.get().ui.reducedMotion, c), () => {
        if (router.isOpen('ranking')) router.close('ranking');
      });
    }
  }

  function onWon(state: GameState, m: SessionMeta, restored: boolean): void {
    const before = save();
    const book = winBookkeeping(before, m, state, { now: clock.now(), event: m.event ?? null, restored, config: c });
    updateSave(() => book.save);
    if (book.critical) deps.saves.critical(); // t = 0: every reward is saved before any animation (§2.2)
    for (const e of book.events) log(e);
    const s = book.summary;
    if (book.save.stock !== before.stock) bus.emit('stock', { hints: book.save.stock.hints, kitties: book.save.stock.kitties });
    if (m.mode === 'level' && m.level !== null) deps.levels.prefetch(m.level + 1);
    router.close('coach');
    if (!restored) timers.later(c.fx.winHappyDelayMs, () => fx.play({ sfx: 'win', haptic: c.haptics.win }));

    const variant: WinFlowVariant = restored
      ? 'restored'
      : s.mode === 'tutorial'
        ? s.replay
          ? 'tutorial_replay'
          : 'tutorial'
        : s.mode;
    // phase2c §2.6: the panel shows the period board after every non-tutorial win.
    const panelBoard: BoardKey | null = s.mode !== 'tutorial' ? c.rank.boards.period : null;
    const submits = winBoards(s, m);
    win = {
      summary: s,
      meta: m,
      praise: (deps.pickPraise ?? defaultPraise)(),
      board: panelBoard,
      result: null,
      panelOpen: false,
      logged: false,
    };
    const w = win;
    // §5.5 steps 2 then 3, from t = 0 so the panel is ready in time (deadline rank.fetchTimeoutMs):
    // the win's scores are submitted first as one batch (phase2c §4.4), so mine() reads the board
    // after them; older queued scores (rank.pending) are retried once it has settled, never ahead.
    if (submits.length > 0) {
      const r = deps.rankings;
      if (r) {
        void r
          .submitAll(submits, s.ms)
          .then(() => r.flushPending({ except: submits.map((e) => e.board) }))
          .catch(() => undefined);
      }
    }
    // phase2c §4.8: a group challenge ranks the fish kept.
    const gained = s.counted ? (s.period?.gained ?? 0) : 0;
    if (gained > 0) void deps.groups?.onWin(gained).catch(() => undefined);
    if (panelBoard && variant !== 'restored') {
      const band = s.period ? { periodKey: s.period.key } : undefined;
      const fetched = deps.rankings ? deps.rankings.fetch(panelBoard, band) : Promise.resolve<RankResult>({ board: panelBoard, api: 'local', mine: null, top: [], ok: true });
      void fetched.then(
        (result) => {
          if (win !== w) return;
          w.result = result;
          if (w.panelOpen && router.isOpen('ranking')) router.update('ranking', rankingProps(w, panelTapMinMs));
          logPanel(w);
        },
        () => undefined,
      );
    }
    const scr = screen;
    if (!scr) {
      openVictory();
      return;
    }
    winFlow.start({
      variant,
      screen: scr,
      catCells: catCells(state.puzzle),
      // §2.2: only the fish kept fly, and only when the win adds leaderboard points.
      kept: gained > 0 ? s.kept : 0,
      perFish: c.period.pointsPerFish,
      periodBefore: s.period?.before ?? 0,
      periodKind: s.period?.kind ?? c.period.kind,
      reducedMotion: store.get().ui.reducedMotion,
    });
  }

  let failProps: ReturnType<typeof overlayProps.fail> | null = null;
  function openFail(buttonDelayMs: number): void {
    failProps = overlayProps.fail(helpers.continueOffer(), buttonDelayMs, {
      onContinue: () => void session.onContinue(),
      onRetry: () => void session.onRetry(),
      onHome: () => session.onHome(),
    });
    router.open('fail', failProps);
  }
  function updateFail(patch: Partial<NonNullable<typeof failProps>>): void {
    if (!failProps) return;
    failProps = { ...failProps, ...patch };
    router.update('fail', failProps);
  }

  function onLost(state: GameState, m: SessionMeta): void {
    log(failEvent(m, state));
    timers.later(c.fx.failOverlayDelayMs, () => openFail(c.fx.failButtonDelayMs));
  }

  function openHint(step: HintStep, charged: boolean): void {
    dispatch({ type: 'HINT_OPEN', step, charged });
    const s = game();
    const m = meta();
    if (!s || !m || s.status !== 'hint') return;
    // regions: the card's screen-reader line names the highlighted tile's colour (A11Y-7).
    const ctx = { n: s.puzzle.n, colors: m.colors, patterns: save().settings.patterns, regions: s.puzzle.regions };
    router.open('hint', {
      step,
      ...ctx,
      onApply: () => session.onHintApply(),
      onClose: () => session.onHintClose(),
      avoidRect: () => screen?.boardRect() ?? null,
    });
    fx.play({ sfx: 'hint_open' });
    fx.announceHint(step, ctx);
    const paid = charged && getMode(m.mode).chargesHelpers;
    log({ name: 'hint_used', params: { level: levelParam(m), kind: step.kind, charged: paid ? 1 : 0 } });
  }

  // ─────────────────────────────── tutorial ───────────────────────────────

  function showCoach(): void {
    const step = asTutorialStep(meta()?.tutorialStep ?? null);
    if (step === null || game()?.status === 'won') return;
    router.open('coach', overlayProps.coach(step, () => screen, () => session.onCoachGotIt()));
  }

  function tutorialAdvance(signal?: 'got_it'): void {
    const s = game();
    const m = meta();
    const step = asTutorialStep(m?.tutorialStep ?? null);
    if (!s || !m || m.mode !== 'tutorial' || step === null) return;
    const adv = advance(step, s, signal);
    if (!adv) return;
    if (adv.next === 'done') {
      router.close('coach');
      return;
    }
    const next = adv.next;
    store.update((app) => (app.session ? { ...app, session: { ...app.session, tutorialStep: next } } : app));
    log({ name: 'tutorial_step', params: { step: next } });
    if (adv.scriptedMarks.length) dispatch({ type: 'PAINT', cells: adv.scriptedMarks, mode: 'mark', t: clock.now() }, true);
    showCoach();
  }

  // ─────────────────────────────── mounting ───────────────────────────────

  let loadingTimer: TimerId | null = null;
  let failSafe: TimerId | null = null;
  let loadingShown = false;
  function hideLoading(): void {
    clock.clearTimeout(loadingTimer);
    clock.clearTimeout(failSafe);
    loadingTimer = failSafe = null;
    if (!loadingShown) return;
    loadingShown = false;
    router.setLoading(false);
  }

  function teardown(): void {
    gen++;
    busy = false;
    winFlow.cancel();
    router.releaseModal?.();
    deps.rankings?.closeList();
    win = null;
    timers.clear();
    unbindView?.();
    unbindView = null;
    screen = null;
    failProps = null;
    helpers.clearHintCache();
  }

  function leave(reason: 'home' | 'next' | 'discard'): void {
    const s = game();
    if (s) bus.emit('game:end', { state: s, reason });
    teardown();
    if (reason !== 'next') store.update((app) => ({ ...app, game: null, session: null }));
  }

  function saveBoard(): void {
    const s = game();
    const m = meta();
    const slot = m ? slotFor(m) : null;
    if (s && slot && s.status !== 'won') updateSave((sv) => withSlot(sv, slot, toInProgress(s, clock.now())));
    deps.saves.now();
  }

  function mount(req: SessionRequest, puzzle: Puzzle, substitute: boolean): void {
    const mode: ModeId = req.mode;
    const gm = getMode(mode);
    const slotKey = substitute ? null : gm.saveSlot;
    // The mode's RuleFlags under this session's config: the new board, the slot validation and the
    // restored board all use the same hearts / revive limits.
    const eventDef = req.mode === 'event' ? (deps.events?.byId(req.eventId) ?? null) : null;
    // The accessory symbols live in the lazy events chunk (A, §1.6): an existing <use> picks them up
    // when it lands, so start it now in case nothing loaded it yet (never blocks the board).
    if (eventDef) void deps.events?.preload?.()?.catch(() => undefined);
    const rules: RuleFlags = eventDef ? eventRules(eventDef, c) : rulesFor(mode, c);
    let current = save();
    let state = newGame(puzzle, mode, rules);
    let cleared = false;
    let resumed = false;
    const slot = slotKey ? current.inProgress[slotKey] : null;
    if (slotKey && slot) {
      // 02 §15 step 3 (validation); restoreGame applies steps 4 (full board → won) and 5 (0 hearts → lost).
      let restored: GameState | null = null;
      if (validateSlot(slot, puzzle, { mode: slotKey, id: puzzle.id }, rules).ok) {
        try {
          restored = restoreGame(puzzle, slot, rules);
        } catch {
          restored = null; // never reached after validateSlot; a bad slot must not break the level
        }
      }
      if (restored) {
        state = restored;
        resumed = true;
      } else {
        const next = withoutSlot(current, slotKey, puzzle.id);
        cleared = next !== current;
        current = next;
      }
    }
    const level = req.mode === 'level' ? req.level : req.mode === 'tutorial' ? 1 : null;
    const m: SessionMeta = {
      request: req,
      mode,
      puzzleId: puzzle.id,
      level,
      dateKey: req.mode === 'daily' ? req.dateKey : null,
      hard: req.mode === 'level' ? isHard(req.level, c) : false,
      colors: defaultColors(deps.regionColors, puzzle, gm.fixedColors),
      tutorialStep: mode === 'tutorial' ? 1 : null,
      substitute,
      event: eventDef && req.mode === 'event' ? { def: eventDef, index: req.index } : null,
      // §1.16: decided once, at mount (the band never appears or goes mid-level, except for No Ads).
      bannerBand: deps.banners?.eligible('game', { firstRunTutorial: mode === 'tutorial' }) === true,
    };
    store.update((app) => ({ ...app, screen: 'game', game: state, session: m, save: current, ui: { ...app.ui, inputLocked: false } }));
    if (cleared) deps.saves.touch();
    helpers.newAttempt();
    screen = router.showGame(selectGameView(store.get(), viewCtx(), c) as GameView, callbacks);
    unbindView = store.select(
      // ext: the settings dot (§1.15); purchases: No Ads takes the banner band away (§1.16).
      (s) => [s.game, s.session, s.save.stock, s.save.settings, s.save.ext, s.save.purchases, s.ui, s.overlays] as const,
      () => {
        const v = selectGameView(store.get(), viewCtx(), c);
        if (v && screen) screen.update(v);
      },
      { equals: shallowEqual },
    );
    bus.emit('game:start', { state });
    for (const e of startEvents(m, state)) log(e);
    // Rewarded ads are preloaded at level start (02 §13.3); never in the tutorial, which has no ads.
    if (c.ads.enabled && gm.chargesHelpers && caps().rewarded) fx.guard(() => platform.ads.preload('rewarded'));
    if (req.mode === 'level') deps.levels.prefetch(req.level);
    if (mode === 'tutorial') showCoach();
    if (state.status === 'ready') {
      playBoardEntry(resumed || mode === 'tutorial' ? null : m.hard ? 'hard' : 'level');
    } else if (state.status === 'won') onWon(state, m, true);
    else if (state.status === 'lost') {
      openFail(0);
      // §1.16: O4 is a results screen that keeps the banner; a restored lost board has no entry.
      bannerScreenShown(m);
    }
    timers.sync();
  }

  /** §1.16: the game screen is ready for its banner (the board entry ended), when its band is reserved. */
  function bannerScreenShown(m: SessionMeta): void {
    if (m.bannerBand && deps.banners) void deps.banners.screenShown('game', { firstRunTutorial: m.mode === 'tutorial' }).catch(() => undefined);
  }

  /**
   * The board-entry wave, its cue (review PAR-8: 'board_in', with the wave) and START when it ends.
   * Only a fresh or retried board enters; a restored won or lost board does not (no wave, no cue).
   * Phase 2d §1.14: `toast` is the level-start toast's line for a fresh board ('level' / 'hard') or a
   * Retry ('retry'); null for a resumed board and the tutorial (fx.startToast.enabled off: none).
   * §1.16: the entry's end is when the game screen may show its banner.
   */
  function playBoardEntry(toast: StartToastKind | null): void {
    if (screen) {
      screen.playEntry();
      fx.play({ sfx: 'board_in' });
      if (toast !== null && c.fx.startToast.enabled) {
        const scr = screen;
        fx.guard(() => scr.playStartToast(toast));
      }
    }
    timers.later(c.fx.boardEntryMs, () => {
      dispatch({ type: 'START' });
      const m = meta();
      if (m) bannerScreenShown(m);
    });
  }

  const callbacks: GameScreenCallbacks = {
    onTap: (cell) => session.onCellTap(cell),
    onDoubleTap: (cell) => session.onCellDoubleTap(cell),
    onPaint: (cells, mode) => session.onPaint(cells, mode),
    onBulb: () => void session.onBulb(),
    onPaw: () => void session.onPaw(),
    onMouse: () => void session.onMouse(),
    // §2.2: the top bar's Home and Gear do nothing from WON until the ranking panel (or the victory) opens.
    onHome: () => {
      if (!winFlow.blocking()) session.onHome();
    },
    onSettings: () => {
      if (!winFlow.blocking()) deps.openSettings?.();
    },
  };

  const boardInput = (a: Action): void => {
    if (!boardLocked(store.get())) dispatch(a);
  };

  const transitions = createTransitions({
    saves: deps.saves,
    helpers,
    game,
    meta,
    save,
    updateSave,
    busy: () => busy,
    runBusy,
    generation: () => gen,
    disposed: () => disposed,
    dispatch: (a) => dispatch(a),
    now: () => clock.now(),
    log,
    leave,
    start: (req) => session.start(req),
    saveNow: () => session.saveNow(),
    goHome: () => deps.goHome?.(),
    slotFor,
    updateFail,
    failOpen: () => router.isOpen('fail'),
    closeFail: () => {
      router.close('fail');
      failProps = null;
    },
    nextEventIndex: () => {
      const m = meta();
      const ev = m?.event;
      if (!ev) return null;
      // L2B-4: an event that has ended offers no next puzzle (the shell routes "Back to event" Home).
      if (clock.now() >= eventEnd(ev.def)) return null;
      const solved = save().events[ev.def.id]?.solved ?? 0;
      return solved < ev.def.puzzles.count ? solved : null;
    },
    goEvent: (def) => deps.goEvent?.(def),
    restartEntry: () => {
      const st = game();
      const m = meta();
      if (!st || !m) return;
      for (const e of startEvents(m, st)) log(e);
      // §1.14: a Retry gets the toast too (never the tutorial: it has no Retry).
      playBoardEntry(m.mode === 'tutorial' ? null : 'retry');
    },
  });

  const session: Session = {
    async start(request) {
      if (disposed) return;
      const req: SessionRequest =
        request.mode === 'level' && request.level <= 1 ? { mode: 'tutorial', replay: save().tutorialDone } : request;
      teardown();
      hideLoading();
      // §3.2 / phase 2d §1.16: a banner that is up stays only when the new game screen may carry one
      // (banner-to-banner: no screenGone + hide pair); otherwise (the tutorial, duringPlay off, No
      // Ads, under 10 levels) it is hidden before the board.
      if (deps.banners?.eligible('game', { firstRunTutorial: req.mode === 'tutorial' }) !== true) {
        deps.banners?.screenGone();
        void deps.banners?.hide().catch(() => undefined);
      }
      const mine = gen;
      let puzzle: Puzzle;
      let substitute = false;
      let eventDef: EventDef | null = null;
      if (req.mode === 'event') {
        eventDef = deps.events?.byId(req.eventId) ?? null;
        if (!eventDef || clock.now() >= eventEnd(eventDef) || req.index < 0 || req.index >= eventDef.puzzles.count) {
          toast(t('toast.error'));
          store.update((app) => ({ ...app, game: null, session: null }));
          deps.goHome?.();
          return;
        }
      }
      // PERF-1: the screen being left (or the victory over it) starts fading out now, at the tap; the
      // board is built after the next frame, so the tap answers at once even when the build is long.
      const leaving = router.beginLeave?.('game') ?? null;
      try {
        if (req.mode === 'tutorial') puzzle = deps.levels.getTutorial();
        else {
          // A pack fetch or an on-device generation that is not done within the delay shows the
          // loading indicator until the board is ready (lead decision, Phase 2 integration).
          loadingTimer = clock.setTimeout(() => {
            loadingTimer = null;
            if (gen !== mine || disposed) return;
            loadingShown = true;
            router.setLoading(true);
          }, c.loading.indicatorDelayMs);
          // Last resort (04 §8: never a dead end): a board still not ready after loading.failSafeMs
          // goes back Home with a toast, like a failed load; a late result is ignored.
          const load =
            req.mode === 'level'
              ? deps.levels.getLevel(req.level)
              : req.mode === 'daily'
                ? deps.levels.getDaily(req.dateKey)
                : deps.levels.getEventPuzzle(eventDef as EventDef, req.index);
          const lp = await Promise.race([
            load,
            new Promise<never>((_, reject) => {
              failSafe = clock.setTimeout(() => reject(new Error('board load timed out')), c.loading.failSafeMs);
            }),
          ]);
          puzzle = lp.puzzle;
          substitute = lp.source === 'substitute';
        }
      } catch (error) {
        if (gen !== mine || disposed) return;
        hideLoading();
        bus.emit('error', { where: 'load', error });
        toast(t('toast.error'));
        store.update((app) => ({ ...app, game: null, session: null }));
        deps.goHome?.();
        return;
      }
      if (gen !== mine || disposed) return;
      if (leaving) {
        await leaving;
        if (gen !== mine || disposed) return;
      }
      hideLoading();
      mount(req, puzzle, substitute);
    },
    state: game,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    pause: (reason) => timers.pause(reason),
    resume: (reason) => timers.resume(reason),
    saveNow() {
      timers.flushTick();
      saveBoard();
    },
    onCellTap: (cell) => boardInput({ type: 'TAP', cell, t: clock.now() }),
    onCellDoubleTap: (cell) => boardInput({ type: 'DOUBLE_TAP', cell, t: clock.now() }),
    onPaint: (cells, mode) => boardInput({ type: 'PAINT', cells: [...cells], mode, t: clock.now() }),
    onBulb: () => helpers.onBulb(),
    onPaw: () => helpers.onPaw(),
    onMouse: () => helpers.onMouse(),
    onHintApply() {
      if (game()?.status !== 'hint') return;
      dispatch({ type: 'HINT_APPLY', t: clock.now() });
      if (game()?.status !== 'hint') router.close('hint');
    },
    onHintClose() {
      if (game()?.status !== 'hint') return;
      dispatch({ type: 'HINT_CLOSE' });
      if (game()?.status !== 'hint') router.close('hint');
    },
    onCoachGotIt: () => tutorialAdvance('got_it'),
    ...transitions,
    dispose() {
      if (disposed) return;
      disposed = true;
      teardown();
      hideLoading();
      for (const off of offs) off();
      listeners.clear();
    },
  };

  // Ad pauses arrive on the bus from ad-flow; visibility pauses from boot. O5/O6 pause the timer (02 §7.2).
  const syncModal = (): void => {
    if (router.isOpen('settings') || router.isOpen('how_to_play')) timers.pause('modal');
    else timers.resume('modal');
  };
  // An overlay whose lazy chunk could not be loaded (the router already closed it, 04 §8): the game
  // must not stay behind an invisible card. Hint → back to playing; no O3 / O4 / O7 → Home, keeping
  // the won board's progress, or the lost board and its unused revive (O4 reopens on restore, 02 §15).
  function onOverlayFailed(id: OverlayId): void {
    const s = game();
    if (id === 'rewarded') return; // helper flows check the chunk first; a closed O2 is "Not now"
    if (id === 'coach') {
      // The tutorial never dead-ends on a missing coach (04 §8): the board still outlines the targets,
      // the "Got it" step moves on by itself, and the next step's coach tries the chunk again.
      toast(t('toast.error'));
      const step = asTutorialStep(meta()?.tutorialStep ?? null);
      if (step !== null && tutorialStep(step).gotIt) tutorialAdvance('got_it');
      return;
    }
    if (id === 'hint') {
      if (s?.status === 'hint') dispatch({ type: 'HINT_CLOSE' }, true);
      return toast(t('hint.unavailable'));
    }
    toast(t('toast.error'));
    const winOverlay = id === 'daily_result' || id === 'ranking' || id === 'victory';
    if (s?.status === 'won' ? winOverlay : s?.status === 'lost' && id === 'fail') session.onHome();
  }

  const offs = [
    bus.on('pause', ({ reason }) => timers.pause(reason)),
    bus.on('resume', ({ reason }) => {
      timers.resume(reason);
      // §2.2: back from a hidden page, every missed win-flow step runs once, at its end state.
      if (reason === 'hidden' || reason === 'fb_pause') winFlow.catchUp();
    }),
    bus.on('overlay:open', syncModal),
    bus.on('overlay:close', syncModal),
    bus.on('overlay:failed', ({ id }) => onOverlayFailed(id)),
  ];

  return session;
}
