// Owner: C (Phase 2b)
// Screen switching, overlay stack, focus restore, Esc handling (04 §3, §5.3). Overlays are created
// lazily from the ui/overlays factories, appended to an overlay host once, and toggled.
// Focus: only the top-most MODAL overlay holds a focus trap; everything below it is inert. When it
// closes, focus returns (on the next animation frame, RP-3) to what was focused when it opened, and
// the next modal down is re-trapped.
// Initial focus: the element that already has focus inside the overlay, else its first focusable
// [data-autofocus] element, else its first focusable element.
// Lazy chunk (04 §9 budget): every overlay (the coach too) lives in ./overlay-chunk, imported on
// demand (preloadOverlays() starts it; boot does so early on a first run, for the tutorial's coach).
// An open() that arrives before the chunk has landed is queued: the overlay is already on the stack (isOpen/top/stack, inert background,
// 'overlay:open'), and its view is created, opened with the latest props and focused on arrival.
// A failed chunk download is retried with a cache-busting URL (workers/lazy-chunk); when it still
// fails, the queued overlays are closed and 'overlay:failed' tells the app (04 §8: never a dead end).
// Phase 2b (§2.9): replacing a screen plays B's playScreenTransition ('to_game' into a game,
// 'from_game' out of one; a crossfade with reduced motion). The outgoing screen stays in the DOM,
// inert and aria-hidden, until the transition ends (or a safety deadline), then it is destroyed. The
// event screen (§4.4) comes from the lazy `events` chunk (showEvent).
import { focusableElements, setInert, trapFocus } from '../ui/a11y/focus-trap';
import type { CoachProps } from '../ui/overlays/coach';
import type { DailyResultProps } from '../ui/overlays/daily-result';
import type { FailOverlayProps } from '../ui/overlays/fail-overlay';
import type { GroupResultProps } from '../ui/overlays/group-result';
import type { RankHubProps } from '../ui/overlays/rank-hub';
import type { RankingPanelProps } from '../ui/overlays/ranking-panel';
import type { ShopProps } from '../ui/overlays/shop-sheet';
import type { VictoryProps } from '../ui/overlays/victory-screen';
import type { HintCardProps } from '../ui/overlays/hint-card';
import type { HowToPlayProps } from '../ui/overlays/how-to-play';
import type { RewardedPromptProps } from '../ui/overlays/rewarded-prompt';
import type { SettingsProps } from '../ui/overlays/settings-modal';
import { createLoadingIndicator, type LoadingIndicator } from '../ui/overlays/loading-indicator';
import { createToastLayer, type ToastLayer } from '../ui/overlays/toast';
import type { BootScreen } from '../ui/screens/boot-screen';
import type { EventScreenCallbacks, EventScreenView } from '../ui/screens/event-screen';
import { createGameScreen, type GameScreen, type GameScreenCallbacks, type GameView } from '../ui/screens/game-screen';
import { createHomeScreen, type HomeCallbacks, type HomeView } from '../ui/screens/home-screen';
import type { OverlayView, View } from '../ui/dom';
import { playScreenTransition, type ScreenTransitionKind } from '../ui/fx/transitions';
import { loadChunk } from '../workers/lazy-chunk';
import { cfg, type GameConfig } from './config';
import type { AppBus } from './events';
import type { OverlayId, ScreenId } from './store';

export interface OverlayPropsMap {
  hint: HintCardProps;
  rewarded: RewardedPromptProps;
  fail: FailOverlayProps;
  settings: SettingsProps;
  how_to_play: HowToPlayProps;
  daily_result: DailyResultProps;
  coach: CoachProps;
  // phase2b (B's props, all in the lazy overlay chunk)
  ranking: RankingPanelProps;
  victory: VictoryProps;
  shop: ShopProps;
  rank_hub: RankHubProps;
  group_result: GroupResultProps;
}

export interface Router {
  readonly root: HTMLElement;
  screen(): ScreenId;
  /** Replace the current screen (closes all overlays). */
  showBoot(): BootScreen;
  showHome(view: HomeView, cb: HomeCallbacks): View<HomeView>;
  showGame(view: GameView, cb: GameScreenCallbacks): GameScreen;
  /**
   * The event screen (phase2b §4.4) from the lazy `events` chunk. Resolves null when the chunk cannot
   * be loaded (the caller stays where it is and toasts) or when another screen was shown meanwhile.
   */
  showEvent(view: EventScreenView, cb: EventScreenCallbacks): Promise<View<EventScreenView> | null>;
  /** Push (or re-open on top) an overlay. Modal overlays trap focus and make the rest inert. */
  open<K extends OverlayId>(id: K, props: OverlayPropsMap[K]): void;
  /** Update an open overlay's props (no-op when closed). */
  update<K extends OverlayId>(id: K, props: OverlayPropsMap[K]): void;
  close(id: OverlayId): void;
  closeAll(): void;
  isOpen(id: OverlayId): boolean;
  top(): OverlayId | null;
  stack(): readonly OverlayId[];
  toast(message: string): void;
  /** The loading indicator over the current screen; aria-busy on the app root while it shows. */
  setLoading(on: boolean): void;
  /** Esc: dismiss() the top overlay; returns whether something handled it. */
  escape(): boolean;
  /** Starts loading the lazy overlay chunk (boot calls it after the first route). Never rejects. */
  preloadOverlays(): Promise<void>;
  /**
   * Resolves true once the lazy overlay chunk is loaded (starting the load if needed), false when it
   * cannot be loaded. Flows that charge for an overlay (a hint) check it first. Never rejects.
   */
  overlaysReady(): Promise<boolean>;
  destroy(): void;
}

export type OverlayFactories = { readonly [K in OverlayId]: () => OverlayView<OverlayPropsMap[K]> };

/** UI constructors used by the router (test seam; defaults are the real ui/ modules). */
export interface RouterFactories {
  readonly overlays: Partial<OverlayFactories>;
  /** Loads the factories missing from `overlays` (default: the lazy ./overlay-chunk). */
  loadOverlays(): Promise<Partial<OverlayFactories>>;
  bootScreen(): BootScreen;
  homeScreen(view: HomeView, cb: HomeCallbacks): View<HomeView>;
  gameScreen(view: GameView, cb: GameScreenCallbacks): GameScreen;
  toastLayer(): ToastLayer;
  loadingIndicator(): LoadingIndicator;
  trapFocus(
    container: HTMLElement,
    opts?: { initialFocus?: HTMLElement | null; returnFocus?: HTMLElement | null; restoreOnNextFrame?: boolean },
  ): () => void;
  setInert(elements: readonly HTMLElement[], inert: boolean): void;
  /** The event screen factory (default: from the lazy `events` chunk). */
  eventScreen?(view: EventScreenView, cb: EventScreenCallbacks): View<EventScreenView>;
  /** Loads the event screen factory (default: the lazy ./events-chunk). */
  loadEventScreen(): Promise<(view: EventScreenView, cb: EventScreenCallbacks) => View<EventScreenView>>;
  /**
   * Screen transition (phase2b §2.9; default: ui/fx/transitions playScreenTransition). null = none:
   * the old screen is destroyed at once (tests).
   */
  screenTransition: ((oldEl: HTMLElement | null, newEl: HTMLElement, kind: ScreenTransitionKind, reduced: boolean) => Promise<void>) | null;
}

export interface RouterDeps {
  /** Receives 'screen', 'overlay:open', 'overlay:close', and 'error' + 'overlay:failed' (lazy chunk failed to load). */
  readonly bus?: AppBus;
  readonly doc?: Document;
  readonly factories?: Partial<RouterFactories>;
  /** UiState.reducedMotion now (screen transitions crossfade with reduced motion). */
  readonly reducedMotion?: () => boolean;
  readonly config?: GameConfig;
}

/** Which transition a screen change plays (§2.9), or null for none (boot, same screen). */
export function transitionKind(from: ScreenId, to: ScreenId): ScreenTransitionKind | null {
  if (to === 'game' && (from === 'home' || from === 'game' || from === 'event')) return 'to_game';
  if (from === 'game' && (to === 'home' || to === 'event')) return 'from_game';
  return null;
}

/** Whether an overlay is modal before its view exists (only the coach is not, CONTRACTS §4). */
const isModalId = (id: OverlayId): boolean => id !== 'coach';

/** The lazy overlay chunk (one request; 04 §9), re-fetched with a cache-busting URL after a failure. */
export async function loadOverlayChunk(): Promise<Partial<OverlayFactories>> {
  const m = await loadChunk(() => import('./overlay-chunk'));
  return {
    coach: m.createCoach,
    hint: m.createHintCard,
    rewarded: m.createRewardedPrompt,
    fail: m.createFailOverlay,
    settings: m.createSettingsModal,
    how_to_play: m.createHowToPlay,
    daily_result: m.createDailyResult,
    ranking: m.createRankingPanel,
    victory: m.createVictoryScreen,
    shop: m.createShopSheet,
    rank_hub: m.createRankHub,
    group_result: m.createGroupResult,
  };
}

/** Stand-in when no splash factory was given (FBIG builds): an empty screen. */
function blankBootScreen(doc: Document): () => BootScreen {
  return () => ({ el: doc.createElement('div'), setProgress: () => undefined, destroy: () => undefined });
}

/** The overlay's first focusable [data-autofocus] element (hidden or disabled ones are skipped). */
export function autofocusTarget(container: HTMLElement): HTMLElement | null {
  const marked = container.querySelectorAll<HTMLElement>('[data-autofocus]');
  if (marked.length === 0) return null;
  const focusable = focusableElements(container);
  for (const el of Array.from(marked)) if (focusable.indexOf(el) >= 0) return el;
  return null;
}

type AnyOverlay = OverlayView<OverlayPropsMap[OverlayId]>;

export function createRouter(root: HTMLElement, deps: RouterDeps = {}): Router {
  const doc = deps.doc ?? root.ownerDocument;
  const f = deps.factories ?? {};
  /** Factories available now; the lazy chunk adds the rest when it lands. */
  const factories: Partial<OverlayFactories> = { ...(f.overlays ?? {}) };
  const loadOverlays = f.loadOverlays ?? loadOverlayChunk;
  const makeToast = f.toastLayer ?? createToastLayer;
  const makeLoading = f.loadingIndicator ?? createLoadingIndicator;
  const trap = f.trapFocus ?? trapFocus;
  const inert = f.setInert ?? setInert;
  const { bus } = deps;
  const c = deps.config ?? cfg;
  const transition = f.screenTransition === undefined ? (o: HTMLElement | null, n: HTMLElement, k: ScreenTransitionKind, r: boolean) => playScreenTransition(o, n, k, r, c) : f.screenTransition;
  const loadEventScreen =
    f.loadEventScreen ?? (async () => (f.eventScreen ? f.eventScreen : (await loadChunk(() => import('./events-chunk'))).createEventScreen));
  /** Screens still fading out: removed and destroyed when their transition ends. */
  const leaving = new Set<{ el: HTMLElement; done: () => void }>();
  let screenGen = 0;

  while (root.firstChild) root.removeChild(root.firstChild);
  const screenHost = doc.createElement('div');
  screenHost.className = 'app-screen';
  const overlayHost = doc.createElement('div');
  overlayHost.className = 'app-overlays';
  root.appendChild(screenHost);
  root.appendChild(overlayHost);
  let toastLayer: ToastLayer | null = null;
  let loadingLayer: LoadingIndicator | null = null;

  let screenId: ScreenId = 'boot';
  let current: { readonly el: HTMLElement; destroy(): void } | null = null;
  let destroyed = false;
  const views = new Map<OverlayId, AnyOverlay>();
  const order: OverlayId[] = [];
  /** Open requests waiting for the lazy chunk: the latest props per overlay. */
  const pending = new Map<OverlayId, OverlayPropsMap[OverlayId]>();
  let loading: Promise<void> | null = null;
  let loaded = false;
  const returnTo = new Map<OverlayId, HTMLElement | null>();
  const inertState = new Map<HTMLElement, boolean>();
  let active: { id: OverlayId; release: () => void } | null = null;

  const focused = (): HTMLElement | null => {
    const el = doc.activeElement;
    return el && el !== doc.body && (el as HTMLElement).focus ? (el as HTMLElement) : null;
  };

  function setInertOnce(el: HTMLElement, on: boolean): void {
    if ((inertState.get(el) ?? false) === on) return;
    inertState.set(el, on);
    inert([el], on);
  }

  const isModal = (id: OverlayId): boolean => views.get(id)?.modal ?? isModalId(id);

  function topModalIndex(): number {
    for (let i = order.length - 1; i >= 0; i--) if (isModal(order[i] as OverlayId)) return i;
    return -1;
  }

  function applyInert(): void {
    const m = topModalIndex();
    setInertOnce(screenHost, m >= 0);
    for (const [id, v] of views) {
      const i = order.indexOf(id);
      setInertOnce(v.el, i >= 0 && i < m);
    }
  }

  /** Keeps exactly one focus trap, on the top-most modal overlay (none while its view is loading). */
  function syncFocus(): void {
    const m = topModalIndex();
    const topId = m >= 0 ? (order[m] as OverlayId) : null;
    const v = topId === null ? undefined : views.get(topId);
    if (active && active.id === topId && v) return;
    if (active) {
      const release = active.release;
      active = null;
      release();
    }
    if (topId === null || !v) return;
    const now = focused();
    active = {
      id: topId,
      release: trap(v.el, {
        initialFocus: now && v.el.contains(now) ? now : autofocusTarget(v.el),
        returnFocus: returnTo.get(topId) ?? null,
        // Focus goes back on the next frame, after the un-inerted screen and the board's highlight
        // change have been styled once: a synchronous focus() forced a second full-document recalc
        // (hint close ≈ 300 → 150 ms at 4× CPU on a 12×12 board, RP-3).
        restoreOnNextFrame: true,
      }),
    };
  }

  /** The overlay's view, created on first use; null while its factory is still loading. */
  function overlay<K extends OverlayId>(id: K): OverlayView<OverlayPropsMap[K]> | null {
    let v = views.get(id) as OverlayView<OverlayPropsMap[K]> | undefined;
    if (!v) {
      const make = factories[id] as (() => OverlayView<OverlayPropsMap[K]>) | undefined;
      if (!make) return null;
      v = make();
      overlayHost.appendChild(v.el);
      views.set(id, v as unknown as AnyOverlay);
    }
    return v;
  }

  /** DOM order follows the stack (later = on top). */
  function restack(): void {
    for (const id of order) {
      const v = views.get(id);
      if (v) overlayHost.appendChild(v.el);
    }
  }

  /** Opens the queued overlays whose factories have arrived. */
  function flushPending(): void {
    if (destroyed || pending.size === 0) return;
    let opened = false;
    for (const id of order.slice()) {
      if (!pending.has(id)) continue;
      const v = overlay(id);
      if (!v) continue;
      const props = pending.get(id) as OverlayPropsMap[typeof id];
      pending.delete(id);
      v.open(props);
      opened = true;
    }
    if (!opened) return;
    restack();
    applyInert();
    syncFocus();
  }

  function ensureLoaded(): Promise<void> {
    loading ??= loadOverlays().then(
      (chunk) => {
        for (const key of Object.keys(chunk) as OverlayId[]) {
          if (!factories[key]) (factories as Record<OverlayId, unknown>)[key] = chunk[key];
        }
        loaded = true;
        flushPending();
      },
      (error: unknown) => {
        loading = null; // a later open() retries
        if (destroyed) return;
        bus?.emit('error', { where: 'overlay_chunk', error });
        const failed = order.filter((id) => pending.has(id));
        for (const id of failed) closeInternal(id);
        for (const id of failed) bus?.emit('overlay:failed', { id }); // the app reconciles (no dead end)
      },
    );
    return loading;
  }

  function closeInternal(id: OverlayId): void {
    const i = order.indexOf(id);
    if (i < 0) return;
    order.splice(i, 1);
    if (pending.has(id)) pending.delete(id);
    else views.get(id)?.close();
    applyInert();
    syncFocus();
    returnTo.delete(id);
    bus?.emit('overlay:close', { id });
  }

  function closeAll(): void {
    while (order.length) closeInternal(order[order.length - 1] as OverlayId);
  }

  /** Ends every running transition at once (a newer screen change, destroy). */
  function finishLeaving(): void {
    for (const l of [...leaving]) l.done();
  }

  function replaceScreen<T extends { readonly el: HTMLElement; destroy(): void }>(id: ScreenId, make: () => T): T {
    closeAll();
    finishLeaving();
    screenGen++;
    const prev = current;
    const prevId = screenId;
    current = null;
    const kind = prev ? transitionKind(prevId, id) : null;
    const animate = kind !== null && transition !== null && !!prev && prev.el.parentNode === screenHost;
    if (animate && prev) {
      // The outgoing screen stays for its fade-out, inert and hidden from assistive tech (§2.9).
      prev.el.setAttribute('aria-hidden', 'true');
      prev.el.setAttribute('inert', '');
      for (const child of Array.from(screenHost.childNodes)) if (child !== prev.el) screenHost.removeChild(child);
    } else {
      prev?.destroy();
      while (screenHost.firstChild) screenHost.removeChild(screenHost.firstChild);
    }
    const next = make();
    screenHost.appendChild(next.el);
    if (animate && prev && kind && transition) {
      const reduced = deps.reducedMotion?.() ?? false;
      const win = doc.defaultView;
      let timer: number | null = null;
      const entry = {
        el: prev.el,
        done: () => {
          if (!leaving.delete(entry)) return;
          if (timer !== null) win?.clearTimeout(timer);
          if (prev.el.parentNode) prev.el.parentNode.removeChild(prev.el);
          try {
            prev.destroy();
          } catch (error) {
            bus?.emit('error', { where: 'screen_destroy', error });
          }
        },
      };
      leaving.add(entry);
      // Safety: a transition that never settles must not keep the old screen around.
      const limit = c.fx.screenOutMs + c.fx.screenInDelayMs + Math.max(c.fx.screenInMs, c.fx.screenBackInMs) + 500;
      if (win) timer = win.setTimeout(() => entry.done(), limit);
      try {
        void Promise.resolve(transition(prev.el, next.el, kind, reduced)).then(
          () => entry.done(),
          () => entry.done(),
        );
      } catch {
        entry.done();
      }
    }
    // Short desktop windows scroll the 568 px column; a new screen starts at the top, not at the
    // offset used to reach its button on the previous screen.
    const scroller = doc.scrollingElement ?? doc.documentElement;
    if (scroller && scroller.scrollTop !== 0) scroller.scrollTop = 0;
    current = next;
    screenId = id;
    bus?.emit('screen', { screen: id });
    return next;
  }

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
    if (router.escape()) ev.preventDefault();
  };
  doc.addEventListener('keydown', onKey);

  const router: Router = {
    root,
    screen: () => screenId,
    // The S0 splash is web-only (FBIG shows its own loader): boot passes its factory in web builds.
    showBoot: () => replaceScreen('boot', () => (f.bootScreen ?? blankBootScreen(doc))()),
    showHome: (view, cb) => replaceScreen('home', () => (f.homeScreen ?? createHomeScreen)(view, cb)),
    showGame: (view, cb) => replaceScreen('game', () => (f.gameScreen ?? createGameScreen)(view, cb)),
    async showEvent(view, cb) {
      const mine = ++screenGen;
      let make: (v: EventScreenView, c2: EventScreenCallbacks) => View<EventScreenView>;
      try {
        make = await loadEventScreen();
      } catch (error) {
        bus?.emit('error', { where: 'events_chunk', error });
        return null;
      }
      if (destroyed || mine !== screenGen) return null; // another screen was shown meanwhile
      return replaceScreen('event', () => make(view, cb));
    },
    open(id, props) {
      if (destroyed) return;
      const v = overlay(id);
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
      else returnTo.set(id, focused()); // may be inside a lower overlay (Settings → How to play)
      order.push(id);
      if (v) {
        pending.delete(id);
        overlayHost.appendChild(v.el); // DOM order follows the stack (later = on top)
        v.open(props);
      } else {
        pending.set(id, props);
        void ensureLoaded();
      }
      applyInert();
      syncFocus();
      bus?.emit('overlay:open', { id });
    },
    update(id, props) {
      if (order.indexOf(id) < 0) return;
      if (pending.has(id)) pending.set(id, props);
      else overlay(id)?.update(props);
    },
    close: closeInternal,
    closeAll,
    isOpen: (id) => order.indexOf(id) >= 0,
    top: () => (order.length ? (order[order.length - 1] as OverlayId) : null),
    stack: () => order.slice(),
    toast(message) {
      if (!toastLayer) {
        toastLayer = makeToast();
        root.appendChild(toastLayer.el);
      }
      toastLayer.show(message);
    },
    setLoading(on) {
      if (destroyed || (!on && !loadingLayer)) return;
      if (!loadingLayer) {
        loadingLayer = makeLoading();
        root.appendChild(loadingLayer.el);
      }
      if (on) {
        loadingLayer.show();
        root.setAttribute('aria-busy', 'true');
      } else {
        loadingLayer.hide();
        root.removeAttribute('aria-busy');
      }
    },
    escape() {
      const id = router.top();
      if (id === null) return false;
      return views.get(id)?.dismiss() ?? false;
    },
    preloadOverlays: () => ensureLoaded().catch(() => undefined),
    overlaysReady: () => (loaded ? Promise.resolve(true) : ensureLoaded().then(() => loaded, () => false)),
    destroy() {
      destroyed = true;
      doc.removeEventListener('keydown', onKey);
      finishLeaving();
      closeAll();
      pending.clear();
      for (const v of views.values()) v.destroy();
      views.clear();
      current?.destroy();
      current = null;
      toastLayer?.destroy();
      toastLayer = null;
      loadingLayer?.destroy();
      loadingLayer = null;
      root.removeAttribute('aria-busy');
      while (root.firstChild) root.removeChild(root.firstChild);
    },
  };
  return router;
}
