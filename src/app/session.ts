// Owner: C (Phase 2b; was app)
// Level-session orchestrator (04 §3, §5.2, §5.7): reducer + effects (audio, haptics, announcer,
// saves, analytics, FX routing), START / KITTY_DONE timers, 1 s TICK while visible, hint free-reopen
// cache, helper and ad flows, tutorial filter/advance, win/lose bookkeeping and overlays.
// Phase 2b: event puzzles (mode `event`, §4.4) and the post-win flow (§2.2): the rewards (fish,
// points, event progress) are saved with the win at t = 0, the ranking submission and fetch start at
// once, then win-flow.ts plays glow → fish → ranking panel → victory screen on the session clock.
// Helper flows live in helper-flows.ts, pure effect tables in session-effects.ts, timers and overlay
// props in session-parts.ts.
import type { CellIndex, HintStep, Puzzle } from '../engine/types';
import { eventEnd, eventRules, type EventDef } from '../game/events';
import { newGame, restoreGame, toInProgress } from '../game/factory';
import { getMode, rulesFor } from '../game/modes';
import { isHard } from '../game/progression';
import { reduce } from '../game/reducer';
import { validateSlot } from '../game/save';
import { encodeDailyScore, encodeEventScore, encodePointsScore } from '../game/scoring';
import { advance, filterTutorialAction, tutorialStep } from '../game/tutorial';
import type { Action, BoardKey, GameEvent, GameState, ModeId, RuleFlags } from '../game/types';
import { fishSourceRows } from '../ui/fx/fish-flight';
import type { RankingListState, RankScoreView } from '../ui/overlays/ranking-panel';
import type { GameScreen, GameScreenCallbacks, GameView } from '../ui/screens/game-screen';
import { t, translate } from '../i18n';
import type { TimerId } from './clock';
import { cfg } from './config';
import type { AnalyticsEvent, RankResult } from './events';
import { createHelperFlows } from './helper-flows';
import { feedbackFor, failEvent, levelParam, mistakeEvent, startEvents, winBookkeeping, type WinSummary } from './session-effects';
import { createFeedbackPlayer, createSessionTimers, defaultColors, defaultPraise, overlayProps, withoutSlot, withSlot, type SaveSlot } from './session-parts';
import { createTransitions } from './session-transitions';
import { shallowEqual, type AppState, type OverlayId, type SessionMeta, type SessionRequest } from './store';
import { asTutorialStep, boardKindOf, boardLocked, personalRecords, selectGameView, selectRankingView, selectVictoryView, type ViewContext } from './views';
import { createWinFlow, type WinFlowVariant } from './win-flow';

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
    walletChanged: () => emitWallet(),
  });

  function emitWallet(): void {
    const { fish, earned } = save().wallet;
    bus.emit('wallet', { fish, earned });
  }

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
  });

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
    const changed = state.cells !== prev.cells || state.hearts !== prev.hearts || state.revivesUsed !== prev.revivesUsed;
    const slot = slotFor(m);
    const writeSlot = slot !== null && changed && state.status !== 'won';
    const now = clock.now();
    if (state !== prev || writeSlot) {
      store.update((app) => ({
        ...app,
        game: state,
        save: writeSlot ? withSlot(app.save, slot, toInProgress(state, now)) : app.save,
      }));
    }
    if (state.cells !== prev.cells || a.type === 'RETRY' || a.type === 'REVIVE') helpers.clearHintCache();
    if (events.length) bus.emit('game:events', { events, state, prev });
    for (const fn of [...listeners]) fn(state, events);
    const lines: string[] = [];
    for (const ev of events) {
      screen?.playEvent(ev);
      const fb = feedbackFor(ev, state, m.colors, c);
      fx.play(fb);
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

  /** The three fish source cats (§2.3): rows floor((n−1)/4), floor((n−1)/2), floor(3(n−1)/4). */
  function fishSources(puzzle: Puzzle): CellIndex[] {
    const n = puzzle.n;
    let rows: readonly number[];
    try {
      rows = fishSourceRows(n);
    } catch {
      rows = [Math.floor((n - 1) / 4), Math.floor((n - 1) / 2), Math.floor((3 * (n - 1)) / 4)];
    }
    return rows.map((r) => r * n + (puzzle.solution[r] ?? 0));
  }

  /** Every cat cell in row order (the solution cells of a won board). */
  function catCells(puzzle: Puzzle): CellIndex[] {
    const out: CellIndex[] = [];
    for (let r = 0; r < puzzle.n; r++) out.push(r * puzzle.n + (puzzle.solution[r] ?? 0));
    return out;
  }

  /** The board a win ranks on and its score now (§5.3), or null (tutorial). */
  function boardScore(summary: WinSummary, m: SessionMeta): { board: BoardKey; score: number } | null {
    if (summary.mode === 'level') return { board: c.rank.boards.points, score: encodePointsScore(summary.pointsTotal, c) };
    if (summary.mode === 'daily' && m.dateKey) return { board: c.rank.boards.daily, score: encodeDailyScore(m.dateKey, summary.ms, c) };
    if (summary.mode === 'event' && summary.event) {
      const e = summary.event;
      return { board: e.def.leaderboard, score: encodeEventScore(e.solvedAfter, e.totalMs) };
    }
    return null;
  }

  /** My own score as I know it, for "Your score" when the provider cannot tell (never a guess). */
  function myScoreView(summary: WinSummary): RankScoreView | null {
    if (summary.mode === 'level') return { kind: 'points', points: summary.pointsTotal };
    if (summary.mode === 'daily') return { kind: 'time', ms: summary.ms };
    if (summary.mode === 'event' && summary.event) {
      const e = summary.event;
      return { kind: 'event', solved: e.solvedAfter, total: e.def.puzzles.count, ms: e.totalMs };
    }
    return null;
  }

  function listFor(w: NonNullable<typeof win>): RankingListState {
    if (!w.result) return { kind: 'loading' };
    const s = w.summary;
    const records = personalRecords(store.get(), viewCtx(), {
      board: boardKindOf(s.mode),
      n: s.n,
      thisMs: s.ms,
      event: s.event?.def ?? null,
    });
    const ctx = { records, myScore: myScoreView(s), ...(s.event ? { eventTotal: s.event.def.puzzles.count } : {}) };
    if (!deps.rankings) return { kind: 'records', records, reason: 'local' };
    return deps.rankings.listState(w.result, ctx);
  }

  function rankingTitle(w: NonNullable<typeof win>): string {
    const e = w.summary.event;
    if (e) return t('rank.title.event', { event: translate(e.def.nameKey) });
    return w.summary.mode === 'daily' ? t('rank.title.daily') : t('rank.title.points');
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
    return {
      ...selectRankingView(store.get(), viewCtx(), w.summary, listFor(w), { tapMinMs }),
      onContinue: () => winFlow.continueFromRanking(),
      onSeeTop: () => {
        if (w.board) void deps.rankings?.showList(w.board, rankingTitle(w), undefined, w.summary.event?.def.puzzles.count);
      },
      onListArea: (rect: DOMRect) => {
        if (!w.board || !deps.rankings) return;
        void deps.rankings.showList(w.board, rankingTitle(w), rect, w.summary.event?.def.puzzles.count).then((ok) => {
          if (ok || win !== w || !router.isOpen('ranking')) return;
          // The overlay could not be placed: the honest fallback is my own records.
          const records = personalRecords(store.get(), viewCtx(), { board: boardKindOf(w.summary.mode), n: w.summary.n, thisMs: w.summary.ms, event: w.summary.event?.def ?? null });
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
      onShop: () => deps.openShop?.(),
    });
    if (router.isOpen('ranking')) router.close('ranking');
    deps.rankings?.closeList();
  }

  function onWon(state: GameState, m: SessionMeta, restored: boolean): void {
    const before = save();
    const book = winBookkeeping(before, m, state, { now: clock.now(), event: m.event ?? null, restored, config: c });
    updateSave(() => book.save);
    if (book.critical) deps.saves.critical(); // t = 0: every reward is saved before any animation (§2.2)
    for (const e of book.events) log(e);
    const s = book.summary;
    if (book.fishEarned !== 0) emitWallet();
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
    const target = s.mode !== 'tutorial' ? boardScore(s, m) : null;
    win = {
      summary: s,
      meta: m,
      praise: (deps.pickPraise ?? defaultPraise)(),
      board: target?.board ?? null,
      result: null,
      panelOpen: false,
      logged: false,
    };
    const w = win;
    // §5.5: submit and fetch from t = 0, so the panel is ready at 4.5 s (deadline rank.fetchTimeoutMs).
    if (target && s.counted) {
      const r = deps.rankings;
      if (r) {
        void r
          .flushPending()
          .then(() => r.submit(target.board, target.score, s.ms))
          .catch(() => undefined);
      }
      if (s.pointsEarned > 0) void deps.groups?.onWin(s.pointsEarned).catch(() => undefined);
    }
    if (target && variant !== 'restored') {
      const fetched = deps.rankings ? deps.rankings.fetch(target.board) : Promise.resolve<RankResult>({ board: target.board, api: 'local', mine: null, top: [], ok: true });
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
      fishSources: fishSources(state.puzzle),
      fishBefore: s.fish?.before ?? before.wallet.fish,
      fishBase: s.fish?.base ?? 0,
      fishBonus: s.fish?.bonus ?? 0,
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
    const rules: RuleFlags = eventDef ? eventRules(eventDef, c) : rulesFor(mode, c);
    let current = save();
    let state = newGame(puzzle, mode, rules);
    let cleared = false;
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
      if (restored) state = restored;
      else {
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
    };
    store.update((app) => ({ ...app, screen: 'game', game: state, session: m, save: current, ui: { ...app.ui, inputLocked: false } }));
    if (cleared) deps.saves.touch();
    screen = router.showGame(selectGameView(store.get(), viewCtx()) as GameView, callbacks);
    unbindView = store.select(
      (s) => [s.game, s.session, s.save.stock, s.save.settings, s.ui, s.overlays] as const,
      () => {
        const v = selectGameView(store.get(), viewCtx());
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
      screen.playEntry();
      timers.later(c.fx.boardEntryMs, () => dispatch({ type: 'START' }));
    } else if (state.status === 'won') onWon(state, m, true);
    else if (state.status === 'lost') openFail(0);
    timers.sync();
  }

  const callbacks: GameScreenCallbacks = {
    onTap: (cell) => session.onCellTap(cell),
    onDoubleTap: (cell) => session.onCellDoubleTap(cell),
    onPaint: (cells, mode) => session.onPaint(cells, mode),
    onBulb: () => void session.onBulb(),
    onPaw: () => void session.onPaw(),
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
      const solved = save().events[ev.def.id]?.solved ?? 0;
      return solved < ev.def.puzzles.count ? solved : null;
    },
    goEvent: (def) => deps.goEvent?.(def),
    restartEntry: () => {
      const st = game();
      const m = meta();
      if (!st || !m) return;
      for (const e of startEvents(m, st)) log(e);
      screen?.playEntry();
      timers.later(c.fx.boardEntryMs, () => dispatch({ type: 'START' }));
    },
  });

  const session: Session = {
    async start(request) {
      if (disposed) return;
      const req: SessionRequest =
        request.mode === 'level' && request.level <= 1 ? { mode: 'tutorial', replay: save().tutorialDone } : request;
      teardown();
      hideLoading();
      deps.banners?.screenGone();
      void deps.banners?.hide().catch(() => undefined); // §3.2: never a banner on the game screen
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
    const winOverlay = id === 'win' || id === 'daily_result' || id === 'ranking' || id === 'victory';
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
