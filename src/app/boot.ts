// Owner: app
// Boot sequence (04 §5.1): platform.init → sprite/tokens → load + migrate + merge save → sessions+1
// → ensure pack → fonts → progress 100 → platform.start → locale → restore rules → route → preload ads.
import { createAudioEngine, type AudioEngine } from '../audio/audio-engine';
import { createSfx, type Sfx } from '../audio/sfx';
import { createAssetLoaders } from '../game/level-assets';
import { createLevelsRepo, type LevelsRepo } from '../game/levels-repo';
import { localDateKey } from '../game/progression';
import { migrate } from '../game/save';
import type { GameState, SaveDataV1 } from '../game/types';
import type { PlatformAdapter, RawSave } from '../platform/types';
import { setLocale, t } from '../i18n';
import { createAnnouncer, type Announcer } from '../ui/a11y/announcer';
import { mountSprite } from '../ui/art/sprite';
import { applyMotion, resolveReducedMotion, systemPrefersReducedMotion, watchSystemReducedMotion } from '../ui/fx/motion';
import { mountRotateNotice } from '../ui/overlays/rotate-notice';
import type { BootScreen } from '../ui/screens/boot-screen';
import { createEngineClient, type EngineClient } from '../workers/engine-client';
import { createAdFlow } from './ad-flow';
import { delay, systemClock, type Clock } from './clock';
import { cfg } from './config';
import { createEventBus, type AppBus, type AppEventMap } from './events';
import { parseFlagParam, setFlagOverrides } from './flags';
import { applyRestoreRules, loadSave } from './restore';
import { createRouter, type Router, type RouterFactories } from './router';
import { createSaveScheduler } from './saves';
import { createSession, type Session } from './session';
import { createShell } from './shell';
import { createStore, initialAppState, type AppState, type Store } from './store';
import { watchVisibility } from './visibility';

export { applyRestoreRules, loadSave } from './restore';
export type { RestoreContext, RestoreResult } from './restore';

export interface AppHandle {
  readonly store: Store<AppState>;
  readonly bus: AppBus;
  readonly clock: Clock;
  readonly router: Router;
  readonly session: Session;
  dispose(): void;
}

export interface BootOptions {
  readonly clock?: Clock;
  readonly doc?: Document;
  /** location.search (flags, ?ads= is read by the web adapter). */
  readonly search?: string;
  /** Test seams (defaults: the real modules). */
  readonly routerFactories?: Partial<RouterFactories>;
  readonly levels?: LevelsRepo;
  readonly engine?: EngineClient;
  readonly audio?: AudioEngine;
  readonly sfx?: Sfx;
  readonly announcer?: Announcer;
  readonly fetchJson?: (url: string) => Promise<unknown>;
}

/** e2e-only test hooks (04 §11), installed as window.__mewdoku when __E2E__. */
export interface E2EHooks {
  state(): GameState | null;
  app(): AppState;
  /** Solution columns per row of the current puzzle, or null. */
  solution(): number[] | null;
  /** Replaces the save (JSON of SaveDataV1) and writes it; reload to apply. */
  seedSave(json: string): void;
}

declare global {
  interface Window {
    __mewdoku?: E2EHooks;
  }
}

const EMPTY_RAW: RawSave = { local: null, cloud: null, corrupt: false };

function fetchJsonDefault(url: string): Promise<unknown> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json() as Promise<unknown>;
  });
}

function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Resolves with `p`, or `fallback` after `ms` (never rejects). */
function within<T>(clock: Clock, ms: number, p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), delay(clock, ms).then(() => fallback)]);
}

export async function boot(platform: PlatformAdapter, root: HTMLElement, opts: BootOptions = {}): Promise<AppHandle> {
  const clock = opts.clock ?? systemClock;
  const doc = opts.doc ?? root.ownerDocument;
  const win = doc.defaultView;
  setFlagOverrides(parseFlagParam(opts.search ?? win?.location?.search ?? ''));

  const bus: AppBus = createEventBus<AppEventMap>((error, type) => {
    if (type !== 'error') bus.emit('error', { where: `bus:${String(type)}`, error });
  });
  bus.on('analytics', (e) => attempt(() => platform.analytics.log(e.name, e.params), undefined));
  bus.on('error', ({ where }) => bus.emit('analytics', { name: 'js_error', params: { where: where.slice(0, 40) } }));

  // 1. FIRST: lets FB show its progress bar early (05 §4).
  await platform.init();
  attempt(() => mountSprite(doc), undefined);
  const router = createRouter(root, { bus, doc, factories: opts.routerFactories });
  const bootScreen: BootScreen | null = platform.id === 'web' ? attempt(() => router.showBoot(), null) : null;
  const progress = (pct: number): void => {
    attempt(() => platform.setLoadingProgress(pct), undefined);
    attempt(() => bootScreen?.setProgress(pct), undefined);
  };
  progress(10);

  // 2. Save: load both copies, migrate, merge; sessions + 1 (firstSeenAt is set by defaults()).
  const raw = await platform.storage.load().catch(() => EMPTY_RAW);
  const loaded = loadSave(raw, clock.now());
  const first: SaveDataV1 = { ...loaded.save, sessions: loaded.save.sessions + 1 };
  const store = createStore<AppState>(initialAppState(first));
  store.update((s) => ({ ...s, ui: { ...s.ui, storage: attempt(() => platform.storage.status(), 'ok') } }));
  const saves = createSaveScheduler({ store, storage: platform.storage, clock, bus });
  saves.touch();
  for (const where of loaded.corrupt) bus.emit('analytics', { name: 'save_corrupt', params: { where } });
  progress(40);

  // 3. The pack for the current level (pack-000 is bundled → instant), then the font (never blocks).
  const engine = opts.engine ?? createEngineClient();
  const levels =
    opts.levels ??
    createLevelsRepo({
      ...createAssetLoaders(opts.fetchJson ?? fetchJsonDefault),
      generate: (spec) => engine.generate(spec),
      delay: (ms) => delay(clock, ms),
      onFallback: (where) => bus.emit('analytics', { name: 'pack_fallback', params: { where } }),
    });
  await levels.ensurePackFor(first.progress.level);
  const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
  if (fonts) await within(clock, cfg.boot.fontTimeoutMs, fonts.then(() => undefined), undefined);
  progress(100);

  // 4. Start: the game becomes visible; locale is valid only now (05 §4).
  await platform.start();
  const sessionStartedAt = clock.now();
  setLocale(attempt(() => platform.getLocale(), 'en'));

  // 5. Restore rules 1–3 (02 §15); slower checks happen when the board is opened.
  const today = localDateKey(clock.now());
  const restored = await within(clock, cfg.boot.restoreTimeoutMs, applyRestoreRules(store.get().save, { today, levels }), null);
  if (restored && restored.cleared.length > 0 && restored.save !== store.get().save) {
    const next = restored.save;
    store.update((s) => ({ ...s, save: { ...s.save, inProgress: next.inProgress } }));
    saves.touch();
  }

  // 6. Effects, flows, session and shell.
  const audio = opts.audio ?? createAudioEngine(win ?? undefined);
  const unlock = (): void => attempt(() => audio.unlock(), undefined);
  doc.addEventListener('pointerdown', unlock, true);
  doc.addEventListener('keydown', unlock, true);
  const sfx = opts.sfx ?? createSfx(audio);
  const announcer = opts.announcer ?? createAnnouncer(doc.body);
  const adFlow = createAdFlow({
    platform,
    clock,
    bus,
    setInputLocked: (on) => store.update((s) => (s.ui.adShowing === on ? s : { ...s, ui: { ...s.ui, adShowing: on } })),
    setMuted: (on) => attempt(() => audio.setMuted('ad', on), undefined),
  });
  let session: Session | null = null;
  const getSession = (): Session => {
    if (!session) throw new Error('session not ready');
    return session;
  };
  const shell = createShell({
    store,
    bus,
    clock,
    router,
    platform,
    saves,
    session: getSession,
    audio,
    applyReducedMotion: (setting) => {
      const reduced = resolveReducedMotion(setting, systemPrefersReducedMotion(win ?? undefined));
      applyMotion(root, reduced);
      return reduced;
    },
    version: __APP_VERSION__,
  });
  session = createSession({
    store,
    bus,
    clock,
    platform,
    router,
    levels,
    engine,
    saves,
    adFlow,
    audio,
    sfx,
    announcer,
    sessionStartedAt,
    goHome: () => shell.showHome(),
    openSettings: () => shell.openSettings(),
  });
  shell.applySettings();
  const stopMotion = attempt(() => watchSystemReducedMotion(() => shell.applySettings(), win ?? undefined), () => undefined);

  // Router → store mirror (overlay stack and screen), toasts from anywhere.
  const syncOverlays = (): void => store.update((s) => ({ ...s, overlays: router.stack() }));
  bus.on('overlay:open', syncOverlays);
  bus.on('overlay:close', syncOverlays);
  bus.on('screen', ({ screen }) => store.update((s) => (s.screen === screen ? s : { ...s, screen })));
  bus.on('toast', ({ message }) => router.toast(message));

  // Page hidden / FB onPause → pause the timer, mute, save now (no flush; 05 §7).
  const live = session;
  const unwatch = watchVisibility({
    doc,
    platform,
    onHide: (reason) => {
      bus.emit('pause', { reason });
      live.saveNow();
    },
    onShow: () => {
      bus.emit('resume', { reason: 'hidden' });
      bus.emit('resume', { reason: 'fb_pause' });
    },
  });
  const rotate = attempt(() => mountRotateNotice(root, win ?? undefined), null);
  if (store.get().ui.storage === 'memory') router.toast(t('toast.storageMemory'));

  const handle: AppHandle = {
    store,
    bus,
    clock,
    router,
    session: live,
    dispose() {
      saves.flush();
      live.dispose();
      shell.dispose();
      unwatch();
      stopMotion();
      rotate?.destroy();
      doc.removeEventListener('pointerdown', unlock, true);
      doc.removeEventListener('keydown', unlock, true);
      engine.dispose();
      router.destroy();
      bus.clear();
    },
  };
  if (__E2E__ && win) win.__mewdoku = createE2EHooks(handle, platform, saves);

  // 7. Route: returning players land on Home; first run goes straight into the tutorial (02 §4.2).
  if (store.get().save.tutorialDone) shell.showHome();
  else await live.start({ mode: 'tutorial', replay: false });

  // 8. Preload ads (never during play start-up).
  const caps = attempt(() => platform.capabilities(), null);
  if (cfg.ads.enabled && caps) {
    if (caps.interstitial) attempt(() => platform.ads.preload('interstitial'), undefined);
    if (caps.rewarded) attempt(() => platform.ads.preload('rewarded'), undefined);
  }
  return handle;
}

/** window.__mewdoku (04 §11): read the state, the solution, and seed a save for the next reload. */
export function createE2EHooks(
  handle: Pick<AppHandle, 'store' | 'clock'>,
  platform: Pick<PlatformAdapter, 'storage'>,
  saves: { dispose(): void },
): E2EHooks {
  const { store, clock } = handle;
  return {
    state: () => store.get().game,
    app: () => store.get(),
    solution: () => {
      const g = store.get().game;
      return g ? Array.from(g.puzzle.solution) : null;
    },
    seedSave(json) {
      const now = clock.now();
      const data: SaveDataV1 = { ...migrate(JSON.parse(json) as unknown, now), updatedAt: now };
      saves.dispose(); // nothing from this page load may overwrite the seeded save before the reload
      store.update((s) => ({ ...s, save: data }));
      void platform.storage.save(data, { cloud: 'now' });
    },
  };
}
