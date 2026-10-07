// Owner: app
// Level-session orchestrator (04 §3, §5.2, §5.7): reducer + effects (audio, haptics, announcer,
// saves, analytics, FX routing), START / KITTY_DONE timers, 1 s TICK while visible, hint free-reopen
// cache, helper and ad flows, tutorial filter/advance, win/lose bookkeeping and overlays.
// Helper flows live in helper-flows.ts, pure effect tables in session-effects.ts, timers and overlay
// props in session-parts.ts.
import type { HintStep, Puzzle } from '../engine/types';
import { newGame, restoreGame, toInProgress } from '../game/factory';
import { getMode } from '../game/modes';
import { isHard } from '../game/progression';
import { reduce } from '../game/reducer';
import { validateInProgress } from '../game/save';
import { advance, filterTutorialAction } from '../game/tutorial';
import type { Action, GameEvent, GameState, ModeId } from '../game/types';
import type { GameScreen, GameScreenCallbacks, GameView } from '../ui/screens/game-screen';
import { t } from '../i18n';
import { cfg } from './config';
import type { AnalyticsEvent } from './events';
import { createHelperFlows } from './helper-flows';
import { feedbackFor, failEvent, levelParam, mistakeEvent, startEvents, winBookkeeping } from './session-effects';
import { createFeedbackPlayer, createSessionTimers, defaultColors, defaultPraise, overlayProps, withSlot } from './session-parts';
import { createTransitions } from './session-transitions';
import { shallowEqual, type AppState, type SessionMeta, type SessionRequest } from './store';
import { asTutorialStep, boardLocked, selectGameView, type ViewContext } from './views';

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
  const slotFor = (m: SessionMeta): 'level' | 'daily' | null => (m.substitute ? null : getMode(m.mode).saveSlot);
  const viewCtx = (): ViewContext => ({ now: clock.now(), capabilities: caps(), platformId: platform.id });

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

  function onWon(state: GameState, m: SessionMeta, restored: boolean): void {
    const book = winBookkeeping(save(), m, state);
    updateSave(() => book.save);
    if (book.critical) deps.saves.critical();
    for (const e of book.events) log(e);
    if (m.mode === 'level' && m.level !== null) deps.levels.prefetch(m.level + 1);
    router.close('coach');
    if (!restored) timers.later(c.fx.winHappyDelayMs, () => fx.play({ sfx: 'win', haptic: c.haptics.win }));
    timers.later(restored ? 0 : c.fx.winOverlayDelayMs, () => {
      const props = overlayProps.win(state, m, {
        clock,
        config: c,
        praise: (deps.pickPraise ?? defaultPraise)(),
        reducedMotion: store.get().ui.reducedMotion,
        onNext: () => void session.onNext(),
        onHome: () => session.onHome(),
        onDone: () => void session.onDailyDone(),
      });
      if (props.kind === 'daily') router.open('daily_result', props.props);
      else router.open('win', props.props);
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
    const ctx = { n: s.puzzle.n, colors: m.colors, patterns: save().settings.patterns };
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

  function teardown(): void {
    gen++;
    busy = false;
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
    let current = save();
    let state = newGame(puzzle, mode);
    let cleared = false;
    const slot = slotKey ? current.inProgress[slotKey] : null;
    if (slotKey && slot) {
      // 02 §15 step 3 (validation); restoreGame applies steps 4 (full board → won) and 5 (0 hearts → lost).
      if (validateInProgress(slot, puzzle, { mode: slotKey, id: puzzle.id }, c).ok) state = restoreGame(puzzle, slot);
      else {
        current = withSlot(current, slotKey, null);
        cleared = true;
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
    onHome: () => session.onHome(),
    onSettings: () => deps.openSettings?.(),
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
    closeFail: () => {
      router.close('fail');
      failProps = null;
    },
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
      const mine = gen;
      let puzzle: Puzzle;
      let substitute = false;
      try {
        if (req.mode === 'tutorial') puzzle = deps.levels.getTutorial();
        else {
          const lp = req.mode === 'level' ? await deps.levels.getLevel(req.level) : await deps.levels.getDaily(req.dateKey);
          puzzle = lp.puzzle;
          substitute = lp.source === 'substitute';
        }
      } catch (error) {
        if (gen !== mine || disposed) return;
        bus.emit('error', { where: 'load', error });
        toast(t('toast.error'));
        store.update((app) => ({ ...app, game: null, session: null }));
        deps.goHome?.();
        return;
      }
      if (gen !== mine || disposed) return;
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
      for (const off of offs) off();
      listeners.clear();
    },
  };

  // Ad pauses arrive on the bus from ad-flow; visibility pauses from boot. O5/O6 pause the timer (02 §7.2).
  const syncModal = (): void => {
    if (router.isOpen('settings') || router.isOpen('how_to_play')) timers.pause('modal');
    else timers.resume('modal');
  };
  const offs = [
    bus.on('pause', ({ reason }) => timers.pause(reason)),
    bus.on('resume', ({ reason }) => timers.resume(reason)),
    bus.on('overlay:open', syncModal),
    bus.on('overlay:close', syncModal),
  ];

  return session;
}
