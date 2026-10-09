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
// 2b review fixes (R):
// - PAR-6 / UX-4: leaving the victory screen, the victory itself is the outgoing layer (it keeps
//   showing, inert, while it fades) and the solved board under it goes at once: the previous board
//   never shows again.
// - PERF-1: beginLeave(to) starts the outgoing half at the tap and resolves after the next frame, so
//   the tap answers at once and the heavy game build runs after that frame; the next
//   replaceScreen(to) joins it. replaceScreen reads the page scroll before any DOM write (a read
//   after appending the new screen forced a full-document style pass), removes an outgoing screen
//   whose fade is over before adding the new one, and puts the new screen before one still fading
//   (removing an earlier sibling restyled the whole new screen mid-entry; a later one is free).
// - A11Y-FOCUS-1: when focus was in the app, it moves into the new screen two frames after it mounts
//   (after the focus trap's restore): its [data-autofocus] control, else its first shown heading
//   (tabindex −1), else its first control. The game screen recovers focus to its board itself.
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
import { playScreenTransition, releaseScreenOut, screenOutMs, startScreenOut, type ScreenTransitionKind } from '../ui/fx/transitions';
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
  /**
   * PERF-1: a screen change to `to` is coming (the session calls it at the tap, before it loads and
   * builds the board). The outgoing half of the transition starts now — the current screen, or the
   * victory screen over it (PAR-6), fades out — and every overlay closes. Resolves after the next
   * frame has been drawn (so the heavy build that follows cannot delay the tap's response), or
   * returns null when there is nothing to animate (boot, transitions off, no screen, no WAAPI): then
   * there is nothing to wait for. The next replaceScreen into `to` joins this half.
   */
  beginLeave(to: ScreenId): Promise<void> | null;
  /**
   * PERF-3: a modal is about to open over the current screen (the win flow's scrim step, 300 ms before
   * the ranking panel): the screen turns inert now, so the full-subtree restyle that `inert` costs
   * (80–100 ms at 4× CPU on 12×12) happens under the scrim's fade instead of in the panel's first
   * frame. The game's scrim stays up (it steps aside for a modal's own scrim only once one is open,
   * by the screen host's [data-modal], not by [inert]). The next modal takes the reservation over; a
   * screen change or releaseModal() drops it. Optional (test routers).
   */
  reserveModal?(): void;
  /** Drops a reserveModal() that no modal took over (the session left the board). */
  releaseModal?(): void;
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
  /**
   * Starts only the outgoing half (PERF-1; default: ui/fx/transitions startScreenOut when the
   * default transition is used, else none). null/none: beginLeave() does nothing and replaceScreen
   * hands both halves to screenTransition.
   */
  screenOut?: ((oldEl: HTMLElement, kind: ScreenTransitionKind, reduced: boolean) => boolean) | null;
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
  // ROB-1: the chunk's stylesheet is part of the load (re-fetched when it fails).
  const m = await loadChunk(() => import('./overlay-chunk'), { css: /overlay-chunk-[\w-]+\.css/ });
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
  const screenOut =
    f.screenOut !== undefined ? f.screenOut : f.screenTransition === undefined ? (o: HTMLElement, k: ScreenTransitionKind, r: boolean) => startScreenOut(o, k, r, c) : null;
  const loadEventScreen =
    f.loadEventScreen ??
    (async () =>
      f.eventScreen
        ? f.eventScreen
        : // ROB-1: event-flow may be prefetching the same chunk; its stylesheet failure is waited for here.
          (await loadChunk(() => import('./events-chunk'), { css: /events-chunk-[\w-]+\.css/ })).createEventScreen);
  /** Screens (or the victory stand-in) still fading out: removed or released when their transition ends. */
  const leaving = new Set<{ el: HTMLElement; done: () => void }>();
  let screenGen = 0;
  /** An outgoing half started by beginLeave(to), waiting for replaceScreen(to) to join it (PERF-1). */
  let early: { readonly to: ScreenId; readonly kind: ScreenTransitionKind; readonly el: HTMLElement; readonly at: number; readonly reduced: boolean; readonly hadFocus: boolean } | null = null;
  let focusRaf = 0;

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

  /** PERF-3: the screen is inert ahead of a modal (reserveModal) until one opens or it is released. */
  let reservedInert = false;
  function applyInert(): void {
    const m = topModalIndex();
    if (m >= 0) reservedInert = false; // the modal holds it now
    setInertOnce(screenHost, m >= 0 || reservedInert);
    // The win scrim's hand-off (screens.css): a modal brings its own scrim.
    if (screenHost.hasAttribute('data-modal') !== m >= 0) screenHost.toggleAttribute('data-modal', m >= 0);
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

  const win = (): (Window & typeof globalThis) | null => doc.defaultView as (Window & typeof globalThis) | null;
  const nowMs = (): number => win()?.performance?.now() ?? Date.now();

  /** Focus is on something in the app (a screen or an overlay), not on <body> or outside. */
  const focusInApp = (): boolean => {
    const a = doc.activeElement;
    return !!a && a !== doc.body && root.contains(a);
  };

  /** The victory screen when it is showing (PAR-6): it, not the solved board under it, is the screen being left. */
  function shownVictory(): HTMLElement | null {
    if (order.indexOf('victory') < 0 || pending.has('victory')) return null;
    const v = views.get('victory');
    return v && v.el.parentNode === overlayHost && !v.el.hidden ? v.el : null;
  }

  /**
   * Hands `prev` to its outgoing half (PAR-6): with the victory showing (`stand`, taken before the
   * overlays closed), the victory keeps showing as the leaving layer and the board under it, which it
   * fully covers, is destroyed at once; otherwise `prev` itself leaves. Returns the leaving element and
   * its cleanup (remove + destroy, or release the stand-in).
   */
  function outgoingOf(prev: { readonly el: HTMLElement; destroy(): void }, stand: HTMLElement | null): { el: HTMLElement; done: () => void } {
    if (stand) {
      stand.hidden = false; // closeAll() hid it; it stays up (inert) until its fade ends
      stand.setAttribute('aria-hidden', 'true');
      stand.setAttribute('inert', '');
      dropScreen(prev);
      return {
        el: stand,
        done: () => {
          releaseScreenOut(stand);
          if (order.indexOf('victory') < 0) stand.hidden = true; // unless it was opened again meanwhile
        },
      };
    }
    // The outgoing screen stays for its fade-out, inert and hidden from assistive tech (§2.9).
    prev.el.setAttribute('aria-hidden', 'true');
    prev.el.setAttribute('inert', '');
    return { el: prev.el, done: () => dropScreen(prev) };
  }

  function dropScreen(s: { readonly el: HTMLElement; destroy(): void }): void {
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    try {
      s.destroy();
    } catch (error) {
      bus?.emit('error', { where: 'screen_destroy', error });
    }
  }

  /** Registers an outgoing layer; `settle` (a promise or a delay) ends it, a safety deadline at the latest. */
  function track(out: { el: HTMLElement; done: () => void }, settle: Promise<unknown> | number): void {
    const w = win();
    let timer: number | null = null;
    const entry = {
      el: out.el,
      done: () => {
        if (!leaving.delete(entry)) return;
        if (timer !== null) w?.clearTimeout(timer);
        out.done();
      },
    };
    leaving.add(entry);
    // Safety: a transition that never settles must not keep the old screen around.
    const limit = c.fx.screenOutMs + c.fx.screenInDelayMs + Math.max(c.fx.screenInMs, c.fx.screenBackInMs) + 500;
    if (typeof settle === 'number') {
      if (w) timer = w.setTimeout(() => entry.done(), settle);
      else entry.done();
      return;
    }
    if (w) timer = w.setTimeout(() => entry.done(), limit);
    void settle.then(
      () => entry.done(),
      () => entry.done(),
    );
  }

  /** Resolves after the next frame has been drawn (rAF, then a task); a hidden page resolves on a timer. */
  function afterNextFrame(): Promise<void> {
    const w = win();
    return new Promise<void>((resolve) => {
      if (!w) return resolve();
      let done = false;
      const go = (): void => {
        if (done) return;
        done = true;
        resolve();
      };
      const fallback = w.setTimeout(go, 100); // rAF does not run on a hidden page
      if (typeof w.requestAnimationFrame !== 'function') return;
      w.requestAnimationFrame(() =>
        w.setTimeout(() => {
          w.clearTimeout(fallback);
          go();
        }, 0),
      );
    });
  }

  /**
   * A11Y-FOCUS-1 (spec §7: focus is never lost through a screen change): two frames after `next`
   * mounted (past the focus trap's restore, RP-3), when no modal is open and focus is lost (on <body>,
   * removed, or inside an inert or leaving element), focus goes to the screen's [data-autofocus]
   * control, else its first shown heading (made focusable with tabindex −1), else its first control,
   * else the screen itself. No scroll.
   */
  function focusSoon(next: { readonly el: HTMLElement }): void {
    const w = win();
    if (!w || typeof w.requestAnimationFrame !== 'function') return;
    if (focusRaf) w.cancelAnimationFrame(focusRaf);
    focusRaf = w.requestAnimationFrame(() => {
      focusRaf = w.requestAnimationFrame(() => {
        focusRaf = 0;
        if (destroyed || current !== next || topModalIndex() >= 0 || !next.el.isConnected) return;
        const a = doc.activeElement as HTMLElement | null;
        const lost = !a || a === doc.body || !a.isConnected || !!a.closest('[inert]') || !root.contains(a);
        if (!lost) return;
        // The first candidate that really takes focus (a heading hidden by a media rule does not).
        const auto = autofocusTarget(next.el);
        const candidates = [
          ...(auto ? [auto] : []),
          ...Array.from(next.el.querySelectorAll<HTMLElement>('h1, h2')),
          ...focusableElements(next.el),
          next.el,
        ];
        for (const target of candidates) {
          const added = !target.hasAttribute('tabindex') && !target.matches('a[href], button, input, select, textarea');
          if (added) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
          if (doc.activeElement === target) return;
          if (added) target.removeAttribute('tabindex');
        }
      });
    });
  }

  function replaceScreen<T extends { readonly el: HTMLElement; destroy(): void }>(id: ScreenId, make: () => T): T {
    // PERF-1: read the page's scroll offset now, while layout is still clean from the last frame. Read
    // after the new screen is appended, it forced a full-document style pass (127–170 ms at 4× CPU).
    const scroller = doc.scrollingElement ?? doc.documentElement;
    const wasScrolled = !!scroller && scroller.scrollTop !== 0;
    const pre = early;
    early = null;
    const joined = pre !== null && pre.to === id ? pre : null;
    // A screen change right after another (the shell re-rendering Home) keeps the move-focus intent.
    const hadFocus = (pre?.hadFocus ?? focusInApp()) || focusRaf !== 0;
    const stand = joined ? null : shownVictory(); // PAR-6: taken before closeAll() hides it
    if (reservedInert) {
      reservedInert = false; // PERF-3: a reservation never outlives its screen
      applyInert();
    }
    closeAll();
    if (!joined) finishLeaving();
    else if (nowMs() - joined.at >= screenOutMs(joined.reduced, c)) {
      // The outgoing fade is over (the build took longer): remove it before the new screen is in the
      // document, not in the middle of the board entry, where it restyled the whole new screen.
      finishLeaving();
    }
    screenGen++;
    const prev = current;
    const prevId = screenId;
    current = null;
    const reduced = deps.reducedMotion?.() ?? false;
    let kind: ScreenTransitionKind | null = null;
    let outEl: HTMLElement | null = null;
    /** The outgoing layer this change starts (tracked once its transition promise exists). */
    let started: { el: HTMLElement; done: () => void } | null = null;
    if (joined) {
      kind = joined.kind;
      if (prev) dropScreen(prev); // a screen shown in between (never in practice)
      outEl = [...leaving].some((l) => l.el === joined.el) ? joined.el : null;
    } else {
      kind = prev ? transitionKind(prevId, id) : null;
      const animate = kind !== null && transition !== null && !!prev && prev.el.parentNode === screenHost;
      if (animate && prev && kind) {
        const out = outgoingOf(prev, stand);
        for (const child of Array.from(screenHost.childNodes)) if (child !== out.el) screenHost.removeChild(child);
        // The outgoing half starts before the new screen is built (its inner loops pause while style is clean).
        screenOut?.(out.el, kind, reduced);
        outEl = out.el;
        started = out;
      } else {
        kind = null;
        if (prev) dropScreen(prev);
        while (screenHost.firstChild) screenHost.removeChild(screenHost.firstChild);
      }
    }
    const next = make();
    // PERF-1: the new screen goes BEFORE any screen still fading out. Removing a sibling that comes
    // before a screen restyles that whole screen (174 ms over a 12×12 game screen at 4× CPU, in the
    // middle of the board entry); removing one after it costs nothing. The outgoing layer stays on
    // top while it fades; it is inert, so it never takes a tap meant for the new screen.
    screenHost.insertBefore(next.el, screenHost.firstChild);
    if (kind && transition) {
      let settle: Promise<void> | null = null;
      try {
        settle = Promise.resolve(transition(outEl, next.el, kind, reduced));
      } catch {
        started?.done(); // no transition after all: the old layer goes now
        started = null;
      }
      if (started && settle) track(started, settle);
      else void settle?.catch(() => undefined); // a joined half ends on its own timer (beginLeave)
    }
    // Short desktop windows scroll the 568 px column; a new screen starts at the top, not at the
    // offset used to reach its button on the previous screen.
    if (wasScrolled && scroller) scroller.scrollTop = 0;
    current = next;
    screenId = id;
    bus?.emit('screen', { screen: id });
    if (hadFocus && id !== 'game') focusSoon(next);
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
    reserveModal() {
      if (destroyed || reservedInert) return;
      reservedInert = true;
      applyInert();
    },
    releaseModal() {
      if (!reservedInert) return;
      reservedInert = false;
      applyInert();
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
    beginLeave(to) {
      if (destroyed || early || !current || transition === null || !screenOut) return null;
      const kind = transitionKind(screenId, to);
      if (!kind || current.el.parentNode !== screenHost) return null;
      const hadFocus = focusInApp() || focusRaf !== 0; // before the outgoing layer turns inert and drops focus
      const stand = shownVictory();
      closeAll();
      finishLeaving();
      const reduced = deps.reducedMotion?.() ?? false;
      const prev = current;
      current = null;
      const out = outgoingOf(prev, stand);
      for (const child of Array.from(screenHost.childNodes)) if (child !== out.el) screenHost.removeChild(child);
      const animates = screenOut(out.el, kind, reduced);
      // The outgoing layer goes when its own fade ends (the new screen may still be building then).
      track(out, screenOutMs(reduced, c) + 34);
      early = { to, kind, el: out.el, at: nowMs(), reduced, hadFocus };
      return animates ? afterNextFrame() : null;
    },
    preloadOverlays: () => ensureLoaded().catch(() => undefined),
    overlaysReady: () => (loaded ? Promise.resolve(true) : ensureLoaded().then(() => loaded, () => false)),
    destroy() {
      destroyed = true;
      early = null;
      if (focusRaf) win()?.cancelAnimationFrame(focusRaf);
      focusRaf = 0;
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
