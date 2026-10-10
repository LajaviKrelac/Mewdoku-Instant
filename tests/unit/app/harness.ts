// Owner: C (Phase 2b; was app). Fakes for the app-layer tests: platform, router, audio, levels; a session builder
// whose fakes all write into ONE ordered log, so flow-ordering tests read like the 04 §5.7 pseudocode.
import { createAdFlow } from '../../../src/app/ad-flow';
import { createFakeClock, type FakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig, type DeepPartial, type GameConfig } from '../../../src/app/config';
import { createEventBus, type AppBus, type AppEventMap, type AnalyticsEvent } from '../../../src/app/events';
import type { OverlayPropsMap, Router } from '../../../src/app/router';
import { createSaveScheduler, type SaveScheduler } from '../../../src/app/saves';
import { createSession, type Session, type SessionDeps } from '../../../src/app/session';
import { createStore, initialAppState, type AppState, type OverlayId, type ScreenId, type Store } from '../../../src/app/store';
import { victoryCrossfadeMs } from '../../../src/app/win-flow';
import type { HintStep, Puzzle, PuzzleId } from '../../../src/engine/types';
import type { LevelsRepo, LoadedPuzzle } from '../../../src/game/levels-repo';
import { defaults } from '../../../src/game/save';
import { tutorialPuzzle } from '../../../src/game/tutorial';
import type { SaveData } from '../../../src/game/types';
import type { AdResult, Capabilities, PlatformAdapter, RawSave } from '../../../src/platform/types';
import type { GameScreen, GameScreenCallbacks, GameView, StartToastKind } from '../../../src/ui/screens/game-screen';
import type { TickerLine } from '../../../src/ui/fx/tickers';
import type { EventScreenCallbacks, EventScreenView } from '../../../src/ui/screens/event-screen';
import type { HomeCallbacks, HomeView } from '../../../src/ui/screens/home-screen';
import { createEngineClient, type EngineClient } from '../../../src/workers/engine-client';

// ─────────────────────────────── puzzles ───────────────────────────────

export function makePuzzle(id: PuzzleId, r: string, s: string): Puzzle {
  const n = s.length;
  return {
    id,
    n,
    k: 1,
    regions: Uint8Array.from(r, (ch) => ch.charCodeAt(0) - 65),
    solution: Uint8Array.from(s, (ch) => parseInt(ch, 36)),
    givens: [],
    grade: 2,
    effort: 10,
    hard: false,
  };
}

/**
 * 5×5, unique (hand-checked): regions          solution columns 0 2 4 1 3
 *   A A B B C / A B B C C / A D B C C / D D E E C / D E E E E
 */
const R5 = 'AABBCABBCCADBCCDDEECDEEEE';
const S5 = '02413';
export const at = (r: number, c: number, n = 5): number => r * n + c;
export const SOL5 = [at(0, 0), at(1, 2), at(2, 4), at(3, 1), at(4, 3)];
export const WRONG5 = [at(0, 1), at(0, 2), at(1, 0), at(4, 4)];
export const levelPuzzle = (level: number): Puzzle => makePuzzle(`L${level}`, R5, S5);
export const dailyPuzzle = (date: string): Puzzle => makePuzzle(`D${date}`, R5, S5);
export const eventPuzzle = (id: string, index: number): Puzzle => makePuzzle(`E${id}/${index}`, R5, S5);

export const NOW = Date.UTC(2026, 9, 7, 12, 0, 0); // a Wednesday, noon UTC
export const TODAY = '2026-10-07';

// ─────────────────────────────── ordered log ───────────────────────────────

export type Log = string[];

// ─────────────────────────────── platform ───────────────────────────────

export interface FakePlatform extends PlatformAdapter {
  caps: Capabilities;
  /** Results returned by the next shows (FIFO); default { ok: true }. A function result can delay. */
  readonly interstitialResults: (AdResult | (() => Promise<AdResult>))[];
  readonly rewardedResults: (AdResult | (() => Promise<AdResult>))[];
  readonly writes: { data: SaveData; cloud: 'debounced' | 'now' | 'flush' }[];
  readonly events: AnalyticsEvent[];
  readonly pulses: (number | readonly number[])[];
  pauseCb: (() => void) | null;
  raw: RawSave;
}

export function createFakePlatform(log: Log, caps: Partial<Capabilities> = {}): FakePlatform {
  const next = (q: (AdResult | (() => Promise<AdResult>))[]): Promise<AdResult> => {
    const r = q.shift() ?? { ok: true };
    return typeof r === 'function' ? r() : Promise.resolve(r);
  };
  const p: FakePlatform = {
    id: 'web',
    caps: {
      interstitial: true,
      rewarded: true,
      banner: false,
      cloudSave: false,
      leaderboards: false,
      share: false,
      payments: false,
      haptics: true,
      overlayViews: false,
      groups: false,
      ...caps,
    },
    interstitialResults: [],
    rewardedResults: [],
    writes: [],
    events: [],
    pulses: [],
    pauseCb: null,
    raw: { local: null, cloud: null, corrupt: false },
    capabilities: () => p.caps,
    init: async () => void log.push('platform:init'),
    setLoadingProgress: (pct) => void log.push(`progress:${pct}`),
    start: async () => void log.push('platform:start'),
    getLocale: () => 'en_US',
    getPlayerId: () => null,
    onPause: (cb) => {
      p.pauseCb = cb;
    },
    storage: {
      load: async () => p.raw,
      save: async (data, opts) => {
        p.writes.push({ data, cloud: opts.cloud });
        log.push(`save:${opts.cloud}:h${data.stock.hints}k${data.stock.kitties}`);
      },
      status: () => 'ok',
    },
    ads: {
      preload: (kind) => void log.push(`preload:${kind}`),
      isReady: () => true,
      showInterstitial: (pl) => {
        log.push(`ad:interstitial:${pl}`);
        return next(p.interstitialResults);
      },
      showRewarded: (pl) => {
        log.push(`ad:rewarded:${pl}`);
        return next(p.rewardedResults);
      },
    },
    analytics: { log: () => undefined },
    haptics: { pulse: (pattern) => void p.pulses.push(pattern) },
  };
  return p;
}

// ─────────────────────────────── router ───────────────────────────────

export interface FakeGameScreen extends GameScreen {
  last: GameView;
  /** The callbacks the session bound (top-bar Home / Gear, board input). */
  cb: GameScreenCallbacks;
  readonly played: string[];
  entries: number;
  /** showScrim() calls (the win flow's scrim before the ranking panel). */
  scrims: number;
  /** phase2c §2.2: departLife(slot) calls, in order. */
  readonly departed: number[];
  /** phase2c §2.2: showPeriodCounter(total) calls, in order. */
  readonly counters: number[];
  /** Phase 2d §1.14: playStartToast(kind) calls, in order (a screen without playTickers). */
  readonly startToasts: StartToastKind[];
  /** Phase 2d.1 §5.5: playTickers(lines) calls, in order. */
  readonly tickers: (readonly [TickerLine, TickerLine])[];
}

export interface FakeRouter extends Router {
  readonly props: { [K in OverlayId]?: OverlayPropsMap[K] };
  readonly toasts: string[];
  game: FakeGameScreen | null;
  homeView: HomeView | null;
  homeCb: HomeCallbacks | null;
  eventView: EventScreenView | null;
  eventCb: EventScreenCallbacks | null;
  /** Auto-answer for O2: 'accept' | 'decline' | null (stay open). Phase 2c: no swap (§5.4). */
  rewardedAnswer: 'accept' | 'decline' | null;
  /** What overlaysReady() answers (false: the lazy overlay chunk cannot be loaded). */
  chunkOk: boolean;
  /** beginLeave() calls (PERF-1), in order. */
  readonly leaves: ScreenId[];
  /** What beginLeave() returns (null: nothing to wait for; a promise holds the board build until it settles). */
  leaveWait: (() => Promise<void> | null) | null;
}

const fakeEl = (): HTMLElement => ({}) as HTMLElement;

export function createFakeRouter(bus: AppBus, log: Log): FakeRouter {
  const order: OverlayId[] = [];
  let screenId: ScreenId = 'boot';
  const r: FakeRouter = {
    props: {},
    toasts: [],
    game: null,
    homeView: null,
    homeCb: null,
    eventView: null,
    eventCb: null,
    rewardedAnswer: 'accept',
    chunkOk: true,
    leaves: [],
    leaveWait: null,
    beginLeave(to) {
      r.leaves.push(to);
      return r.leaveWait ? r.leaveWait() : null;
    },
    root: fakeEl(),
    screen: () => screenId,
    showBoot() {
      screenId = 'boot';
      return { el: fakeEl(), setProgress: () => undefined, destroy: () => undefined };
    },
    showHome(view, cb) {
      r.closeAll();
      screenId = 'home';
      r.homeView = view;
      r.homeCb = cb;
      r.game = null;
      log.push('screen:home');
      bus.emit('screen', { screen: 'home' });
      return { el: fakeEl(), update: (v) => void (r.homeView = v), destroy: () => undefined };
    },
    async showEvent(view, cb) {
      r.closeAll();
      screenId = 'event';
      r.eventView = view;
      r.eventCb = cb;
      r.game = null;
      log.push(`screen:event:${view.def.id}`);
      bus.emit('screen', { screen: 'event' });
      return { el: fakeEl(), update: (v) => void (r.eventView = v), destroy: () => undefined };
    },
    showGame(view, cb) {
      r.closeAll();
      screenId = 'game';
      log.push(`screen:game:${view.board.puzzleId}`);
      const g: FakeGameScreen = {
        el: fakeEl(),
        last: view,
        cb,
        played: [],
        entries: 0,
        scrims: 0,
        departed: [],
        counters: [],
        startToasts: [],
        update: (v) => void (g.last = v),
        destroy: () => undefined,
        playEvent: (ev) => void g.played.push(ev.type),
        playEntry: () => (g.entries++, cfg.fx.boardEntryMs),
        cellRect: () => null,
        toolRect: () => null,
        boardRect: () => null,
        focusBoard: () => undefined,
        // phase2c win-flow hooks (G2's GameScreen): no rects in Node, so the flow runs without a flight.
        lifeSlots: () => [],
        departLife: (slot) => void g.departed.push(slot),
        showPeriodCounter: (total) => void g.counters.push(total),
        periodRect: () => null,
        periodLabel: () => undefined,
        glow: () => ({ done: Promise.resolve(), cancel: () => undefined, finish: () => undefined }),
        showScrim: () => void g.scrims++,
        playStartToast: (kind) => {
          g.startToasts.push(kind);
          log.push(`startToast:${kind}`);
        },
        tickers: [],
        playTickers: (lines) => {
          g.tickers.push(lines);
          log.push(`tickers:${lines[0].key}|${lines[1].key}`);
        },
      };
      r.game = g;
      bus.emit('screen', { screen: 'game' });
      return g;
    },
    open(id, props) {
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
      order.push(id);
      (r.props as Record<string, unknown>)[id] = props;
      log.push(`open:${id}`);
      bus.emit('overlay:open', { id });
      if (id === 'rewarded' && r.rewardedAnswer) {
        const rp = props as OverlayPropsMap['rewarded'];
        const answer = r.rewardedAnswer;
        queueMicrotask(() => {
          if (answer === 'accept') rp.onAccept();
          else rp.onDecline();
        });
      }
    },
    update(id, props) {
      if (order.indexOf(id) >= 0) (r.props as Record<string, unknown>)[id] = props;
    },
    close(id) {
      const i = order.indexOf(id);
      if (i < 0) return;
      order.splice(i, 1);
      log.push(`close:${id}`);
      bus.emit('overlay:close', { id });
    },
    closeAll() {
      while (order.length) r.close(order[order.length - 1] as OverlayId);
    },
    isOpen: (id) => order.indexOf(id) >= 0,
    top: () => (order.length ? (order[order.length - 1] as OverlayId) : null),
    stack: () => order.slice(),
    toast(message) {
      r.toasts.push(message);
      log.push(`toast:${message}`);
    },
    setLoading: (on) => void log.push(`loading:${on ? 'on' : 'off'}`),
    escape: () => false,
    preloadOverlays: () => Promise.resolve(),
    overlaysReady: () => Promise.resolve(r.chunkOk),
    destroy: () => undefined,
  };
  return r;
}

// ─────────────────────────────── levels, engine, audio ───────────────────────────────

export function createFakeLevels(overrides: Partial<LevelsRepo> = {}): LevelsRepo {
  return {
    getTutorial: tutorialPuzzle,
    getLevel: async (level): Promise<LoadedPuzzle> =>
      level === 1 ? { puzzle: tutorialPuzzle(), source: 'tutorial' } : { puzzle: levelPuzzle(level), source: 'pack' },
    getDaily: async (date): Promise<LoadedPuzzle> => ({ puzzle: dailyPuzzle(date), source: 'daily_pack' }),
    getEventPuzzle: async (def, index): Promise<LoadedPuzzle> => ({ puzzle: eventPuzzle(def.id, index), source: 'event_pack' }),
    ensurePackFor: async () => undefined,
    prefetch: () => undefined,
    peekLevel: (level) => (level === 1 ? tutorialPuzzle() : levelPuzzle(level)),
    ...overrides,
  };
}

/** Real engine on the main thread (no Worker in Node), with calls written to the log. */
export function createLoggedEngine(log: Log, opts: { failHint?: boolean } = {}): EngineClient & { failHint: boolean } {
  const real = createEngineClient({ createWorker: () => null });
  const e = {
    failHint: opts.failHint ?? false,
    generate: real.generate,
    getHint(puzzle: Puzzle, cells: Readonly<Uint8Array>): Promise<HintStep> {
      log.push('engine:getHint');
      return e.failHint ? Promise.reject(new Error('engine failure')) : real.getHint(puzzle, cells);
    },
    pickKittyCell(puzzle: Puzzle, cells: Readonly<Uint8Array>) {
      log.push('engine:pickKittyCell');
      return real.pickKittyCell(puzzle, cells);
    },
    preload: real.preload,
    dispose: real.dispose,
  };
  return e;
}

export function createFakeAudio(log: Log) {
  const muted = new Set<string>();
  return {
    muted,
    audio: {
      unlock: () => undefined,
      context: () => null,
      output: () => null,
      setMuted: (reason: 'setting' | 'hidden' | 'pause' | 'ad', on: boolean) => {
        if (on) muted.add(reason);
        else muted.delete(reason);
      },
      isMuted: () => muted.size > 0,
      destroy: () => undefined,
    },
    sfx: { play: (id: string) => void log.push(`sfx:${id}`) },
    said: [] as string[],
  };
}

// ─────────────────────────────── harness ───────────────────────────────

export interface HarnessOptions {
  readonly save?: (s: SaveData) => SaveData;
  readonly caps?: Partial<Capabilities>;
  readonly config?: DeepPartial<GameConfig>;
  readonly levels?: Partial<LevelsRepo>;
  /** Clock time when platform.start() resolved; default: NOW − 10 min (grace passed). */
  readonly sessionStartedAt?: number;
  readonly failHint?: boolean;
  /** phase2b: extra session deps (flows), built from the harness parts. */
  readonly extra?: (parts: HarnessParts) => Partial<SessionDeps>;
}

export interface HarnessParts {
  readonly log: Log;
  readonly clock: FakeClock;
  readonly bus: AppBus;
  readonly store: Store<AppState>;
  readonly platform: FakePlatform;
  readonly router: FakeRouter;
  readonly saves: SaveScheduler;
  readonly config: GameConfig;
}

export interface Harness {
  readonly log: Log;
  readonly clock: FakeClock;
  readonly bus: AppBus;
  readonly store: Store<AppState>;
  readonly platform: FakePlatform;
  readonly router: FakeRouter;
  readonly saves: SaveScheduler;
  readonly session: Session;
  readonly engine: ReturnType<typeof createLoggedEngine>;
  readonly analytics: AnalyticsEvent[];
  readonly said: string[];
  readonly muted: Set<string>;
  readonly config: GameConfig;
  homeCalls: number;
  save(): SaveData;
  game(): NonNullable<AppState['game']>;
  /** Lets promise chains settle and fires due timers. */
  settle(ms?: number): Promise<void>;
}

export function createHarness(opts: HarnessOptions = {}): Harness {
  const log: Log = [];
  const clock = createFakeClock(NOW);
  const bus = createEventBus<AppEventMap>();
  const config = opts.config ? mergeConfig(opts.config) : cfg;
  const base: SaveData = { ...defaults(NOW - 30 * 86_400_000), tutorialDone: true, progress: { level: 5, completed: 4, best: {} } };
  const store = createStore<AppState>(initialAppState(opts.save ? opts.save(base) : base));
  const platform = createFakePlatform(log, opts.caps);
  const router = createFakeRouter(bus, log);
  const saves = createSaveScheduler({ store, storage: platform.storage, clock, bus, config });
  const engine = createLoggedEngine(log, { failHint: opts.failHint });
  const fa = createFakeAudio(log);
  const analytics: AnalyticsEvent[] = [];
  bus.on('analytics', (e) => void analytics.push(e));
  const syncOverlays = (): void => store.update((s) => ({ ...s, overlays: router.stack() }));
  bus.on('overlay:open', syncOverlays);
  bus.on('overlay:close', syncOverlays);
  const extra = opts.extra ? opts.extra({ log, clock, bus, store, platform, router, saves, config }) : {};
  const adFlow = createAdFlow({
    platform,
    clock,
    bus,
    config,
    setInputLocked: (on) => store.update((s) => ({ ...s, ui: { ...s.ui, adShowing: on } })),
    setMuted: (on) => fa.audio.setMuted('ad', on),
  });
  const h: Harness = {
    log,
    clock,
    bus,
    store,
    platform,
    router,
    saves,
    engine,
    analytics,
    said: fa.said,
    muted: fa.muted,
    config,
    homeCalls: 0,
    session: createSession({
      store,
      bus,
      clock,
      platform,
      router,
      levels: createFakeLevels(opts.levels),
      engine,
      saves,
      adFlow,
      audio: fa.audio,
      sfx: fa.sfx,
      announcer: { say: (m) => void fa.said.push(m), clear: () => undefined, destroy: () => undefined },
      sessionStartedAt: opts.sessionStartedAt ?? NOW - 600_000,
      goHome: () => {
        h.homeCalls++;
        log.push('goHome');
      },
      openSettings: () => log.push('openSettings'),
      regionColors: (p) => Uint8Array.from({ length: p.n }, (_, i) => i),
      pickPraise: () => 0,
      config,
      ...extra,
    }),
    save: () => store.get().save,
    game: () => {
      const g = store.get().game;
      if (!g) throw new Error('no game');
      return g;
    },
    settle: (ms = 0) => clock.advanceAsync(ms),
  };
  // Status changes in the ordered log ("status:hint" marks the HINT_OPEN dispatch).
  let lastStatus: string | null = null;
  bus.on('game:start', ({ state }) => void (lastStatus = state.status));
  h.session.subscribe((state) => {
    if (state.status === lastStatus) return;
    lastStatus = state.status;
    log.push(`status:${state.status}`);
  });
  return h;
}

/** Starts level L and lets READY → PLAYING happen. */
export async function startLevel(h: Harness, level = 5): Promise<void> {
  await h.session.start({ mode: 'level', level });
  await h.settle(h.config.fx.boardEntryMs);
}

/** Three wrong cat attempts → LOST; the fail overlay opens after fx.failOverlayDelayMs. */
export async function loseGame(h: Harness): Promise<void> {
  for (const cell of WRONG5.slice(0, 3)) {
    h.session.onCellDoubleTap(cell);
    await h.settle(h.config.input.cellLockAfterCatMs);
  }
  await h.settle(h.config.fx.failOverlayDelayMs);
}

/** Places every solution cat → WON. */
export function winGame(h: Harness): void {
  for (const cell of SOL5) if (h.game().cells[cell] !== 2) h.session.onCellDoubleTap(cell);
}

/** The log from the first entry matching `from`, filtered to entries matching `keep`. */
/**
 * phase2b §2.2 "tap": the ranking panel continues; it fades out over rank.panelOutMs and then the
 * victory screen opens (integration: fade first, then the victory).
 */
export async function tapRanking(h: Harness): Promise<void> {
  h.router.props.ranking?.onContinue();
  // UX-4: the victory opens at the tap over the fading panel; the panel closes once the victory is opaque.
  await h.settle(victoryCrossfadeMs(h.store.get().ui.reducedMotion, h.config));
}

export function slice(log: Log, keep: RegExp): string[] {
  return log.filter((x) => keep.test(x));
}

/** Last element (Array.prototype.at is outside the ES2020 baseline). */
export function last<T>(xs: readonly T[]): T | undefined {
  return xs[xs.length - 1];
}
