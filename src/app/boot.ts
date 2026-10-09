// Owner: C (Phase 2b; was app)
// Boot sequence (04 §5.1): platform.init → sprite/tokens → load + migrate + merge save → sessions+1
// → ensure pack → fonts (+ the overlay chunk with the coach, first run only) → progress 100 → platform.start → locale → restore rules → route → preload ads.
// Nothing on the way to platform.start() may wait without a bound (05 §5.4, RP-1): the pack and the
// font wait in parallel, each capped (boot.packTimeoutMs, boot.fontTimeoutMs); a pack still loading
// is awaited later by getLevel() behind the loading indicator. platform.init() and start() are
// retried once (PLAT-8); a second failure rejects, and main.ts shows an honest error with a retry.
// Save copies that arrive after launch (FB late cloud read, another web tab) are merged into the
// live save (restore.ts mergeArrived).
import { createAudioEngine, type AudioEngine } from '../audio/audio-engine';
import { createLazySfx } from '../audio/lazy-sfx';
import type { Sfx } from '../audio/sfx';
import { createAssetLoaders } from '../game/level-assets';
import { createLevelsRepo, type LevelsRepo } from '../game/levels-repo';
import { localDateKey } from '../game/progression';
import { migrate } from '../game/save';
import type { GenResult, GenSpec } from '../engine/types';
import type { GameState, SaveData } from '../game/types';
import type { PlatformAdapter, RawSave } from '../platform/types';
import { setLocale, t } from '../i18n';
import { createAnnouncer, type Announcer } from '../ui/a11y/announcer';
import { mountSprite } from '../ui/art/sprite';
import { applyMotion, resolveReducedMotion, systemPrefersReducedMotion, watchSystemReducedMotion } from '../ui/fx/motion';
import { mountRotateNotice } from '../ui/overlays/rotate-notice';
import { createBootScreen, type BootScreen } from '../ui/screens/boot-screen';
import { createEngineClient, type EngineClient } from '../workers/engine-client';
import { loadChunk } from '../workers/lazy-chunk';
import { createAdFlow } from './ad-flow';
import { delay, systemClock, type Clock } from './clock';
import { cfg } from './config';
import { createEventBus, type AppBus, type AppEventMap } from './events';
import { parseFlagParam, setFlagOverrides } from './flags';
import { fetchJsonWithTimeout } from './fetch-json';
import { applyRestoreRules, loadSave, mergeArrived } from './restore';
import { createRouter, type Router, type RouterFactories } from './router';
import { createSaveScheduler } from './saves';
import { createSession, type Session } from './session';
import { createShell } from './shell';
import { createStore, initialAppState, type AppState, type Store } from './store';
import { attachUiClickFeedback } from './ui-sounds';
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
  /** Replaces the save (JSON of SaveData) and writes it; reload to apply. */
  seedSave(json: string): void;
  /**
   * The generator as the game runs it (03 §11.3 cross-engine check): 'worker' goes through the
   * engine client (module worker), 'main' through the lazily loaded main-thread generator chunk.
   */
  generate(spec: GenSpec, where: 'worker' | 'main'): Promise<GenResult>;
}

declare global {
  interface Window {
    __mewdoku?: E2EHooks;
  }
}

const EMPTY_RAW: RawSave = { local: null, cloud: null, corrupt: false };

/** Pack and daily-month JSON: aborted after levels.fetchTimeoutMs, so a request can never hang (RP-1). */
function fetchJsonDefault(url: string): Promise<unknown> {
  return fetchJsonWithTimeout(url);
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

/** `fn()`, tried a second time after `ms` when the first try rejects (PLAT-8). */
async function retryOnce<T>(clock: Clock, ms: number, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await delay(clock, ms);
    return fn();
  }
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
  await retryOnce(clock, cfg.boot.platformRetryDelayMs, () => platform.init());
  attempt(() => mountSprite(doc), undefined);
  // S0 splash: web builds only (__PLATFORM__ is a build-time constant, so FBIG drops the module).
  const splash: Partial<RouterFactories> = __PLATFORM__ === 'web' ? { bootScreen: createBootScreen } : {};
  const router = createRouter(root, { bus, doc, factories: { ...splash, ...opts.routerFactories } });
  const bootScreen: BootScreen | null = platform.id === 'web' ? attempt(() => router.showBoot(), null) : null;
  const progress = (pct: number): void => {
    attempt(() => platform.setLoadingProgress(pct), undefined);
    attempt(() => bootScreen?.setProgress(pct), undefined);
  };
  progress(10);

  // 2. Save: load both copies, migrate, merge; sessions + 1 (firstSeenAt is set by defaults()).
  const raw = await platform.storage.load().catch(() => EMPTY_RAW);
  const loaded = loadSave(raw, clock.now());
  const first: SaveData = { ...loaded.save, sessions: loaded.save.sessions + 1 };
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
  // The waits are bounded and run side by side: a slow or hung pack never holds Home or startGameAsync.
  const pack = within(clock, cfg.boot.packTimeoutMs, Promise.resolve().then(() => levels.ensurePackFor(first.progress.level)), undefined);
  const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
  const font = fonts ? within(clock, cfg.boot.fontTimeoutMs, fonts.then(() => undefined), undefined) : undefined;
  // First run: the tutorial coach (O8) is in the lazy overlay chunk; fetch it now, while the loading
  // screen still shows, so the first board appears with its coach. Returning players get it at step 8.
  const overlays = first.tutorialDone ? undefined : within(clock, cfg.boot.overlayTimeoutMs, router.overlaysReady(), false);
  await Promise.all([pack, font, overlays]);
  progress(100);

  // 4. Start: the game becomes visible; locale is valid only now (05 §4).
  await retryOnce(clock, cfg.boot.platformRetryDelayMs, () => platform.start());
  const sessionStartedAt = clock.now();
  // TODO(C + E, phase2b §6.3): resolve with i18n/locale.ts (override, FB/web sources), prefetch during
  // boot, and wait ≤ i18n.localeTimeoutMs for the chunk before the first route. F0: setLocale is async
  // but settles at once (no chunk to load yet), so not awaiting it keeps the Phase 2 boot timing.
  void setLocale(attempt(() => platform.getLocale(), 'en')).catch(() => undefined);

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
  // The recipes chunk goes through loadChunk: a failed download is retried with a cache-busting URL,
  // since Chromium never re-requests a dynamic import that failed once (RP-2).
  const lazySfx = opts.sfx ? null : createLazySfx(audio, () => loadChunk(() => import('../audio/sfx')));
  const sfx: Sfx = opts.sfx ?? (lazySfx as Sfx);
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
  // 02 §16 UI button click + 4 ms vibration, delegated on the app root (lead decision).
  const offUiClick = attachUiClickFeedback(root, {
    play: () => sfx.play('ui'),
    haptic: () => {
      if (store.get().save.settings.haptics && platform.capabilities().haptics) platform.haptics.pulse(cfg.haptics.ui);
    },
  });
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

  // One-time "can't save" warning (04 §6.2): memory-only at launch, or later when storage fails
  // mid-session (quota, revoked). The FB adapter reports it only when the cloud does not keep the save.
  let warnedMemory = false;
  const warnMemory = (): void => {
    if (warnedMemory) return;
    warnedMemory = true;
    store.update((s) => (s.ui.storage === 'memory' ? s : { ...s, ui: { ...s.ui, storage: 'memory' } }));
    router.toast(t('toast.storageMemory'));
  };
  if (store.get().ui.storage === 'memory') warnMemory();
  attempt(() => platform.storage.onMemoryFallback?.(warnMemory), undefined);

  // Save copies that arrive after launch: the FB cloud read that finished late (PLAT-1) or a write by
  // another web tab (RP-5). The running board is left alone; Home and the settings follow the store.
  // Only the late cloud copy is written back (that is what starts the cloud writes); another tab's
  // copy is not, or two tabs would echo each other's writes forever.
  const offExternal =
    attempt(
      () =>
        platform.storage.onExternalSave?.((copy) => {
          const live = store.get().save;
          const next = mergeArrived(live, copy, clock.now());
          if (next !== live) {
            store.update((s) => ({ ...s, save: next }));
            attempt(() => shell.applySettings(), undefined);
          }
          if (copy.source === 'cloud') saves.touch();
        }),
      undefined,
    ) ?? (() => undefined);

  const handle: AppHandle = {
    store,
    bus,
    clock,
    router,
    session: live,
    dispose() {
      saves.flush();
      offExternal();
      live.dispose();
      shell.dispose();
      unwatch();
      stopMotion();
      rotate?.destroy();
      offUiClick();
      doc.removeEventListener('pointerdown', unlock, true);
      doc.removeEventListener('keydown', unlock, true);
      engine.dispose();
      router.destroy();
      bus.clear();
    },
  };
  if (__E2E__ && win) win.__mewdoku = createE2EHooks(handle, platform, saves, engine);

  // 7. Route: returning players land on Home; first run goes straight into the tutorial (02 §4.2).
  if (store.get().save.tutorialDone) shell.showHome();
  else await live.start({ mode: 'tutorial', replay: false });

  // 8. The lazy chunks (04 §9: overlays, sound recipes, hint engine; none is needed for the first
  //    screen but the coach, fetched at step 3 on a first run), then preload ads (never during play
  //    start-up).
  void router.preloadOverlays();
  void lazySfx?.load();
  attempt(() => engine.preload(), undefined);
  const caps = attempt(() => platform.capabilities(), null);
  if (cfg.ads.enabled && caps) {
    if (caps.interstitial) attempt(() => platform.ads.preload('interstitial'), undefined);
    if (caps.rewarded) attempt(() => platform.ads.preload('rewarded'), undefined);
  }
  return handle;
}

/**
 * The honest fatal state when boot() rejected (PLAT-8): nothing is playable, so say so and offer one
 * button that starts the game again (a page reload). Used by main.ts.
 */
export function showBootFailure(root: HTMLElement, reload: () => void = () => window.location.reload()): void {
  const doc = root.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'boot-failed';
  box.setAttribute('role', 'alert');
  box.style.cssText = 'padding:40vh 16px 0;text-align:center';
  const msg = doc.createElement('p');
  msg.textContent = t('boot.failed');
  const retry = doc.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn--primary';
  retry.textContent = t('boot.retry');
  retry.addEventListener('click', () => reload());
  box.append(msg, retry);
  root.replaceChildren(box);
}

/** window.__mewdoku (04 §11): read the state, the solution, and seed a save for the next reload. */
export function createE2EHooks(
  handle: Pick<AppHandle, 'store' | 'clock'>,
  platform: Pick<PlatformAdapter, 'storage'>,
  saves: { dispose(): void },
  engine: Pick<EngineClient, 'generate'>,
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
      const data: SaveData = { ...migrate(JSON.parse(json) as unknown, now), updatedAt: now };
      saves.dispose(); // nothing from this page load may overwrite the seeded save before the reload
      store.update((s) => ({ ...s, save: data }));
      void platform.storage.save(data, { cloud: 'now' });
    },
    async generate(spec, where) {
      if (where === 'worker') return engine.generate(spec);
      const mod = await import('../engine/generator');
      return mod.generate(spec);
    },
  };
}
