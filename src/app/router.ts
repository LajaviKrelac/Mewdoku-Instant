// Owner: app
// Screen switching, overlay stack, focus restore, Esc handling (04 §3, §5.3). Overlays are created
// lazily from the ui/overlays factories, appended to an overlay host once, and toggled.
// Focus: only the top-most MODAL overlay holds a focus trap; everything below it is inert. When it
// closes, focus returns to what was focused when it opened, and the next modal down is re-trapped.
import { setInert, trapFocus } from '../ui/a11y/focus-trap';
import { createCoach, type CoachProps } from '../ui/overlays/coach';
import { createDailyResult, type DailyResultProps } from '../ui/overlays/daily-result';
import { createFailOverlay, type FailOverlayProps } from '../ui/overlays/fail-overlay';
import { createHintCard, type HintCardProps } from '../ui/overlays/hint-card';
import { createHowToPlay, type HowToPlayProps } from '../ui/overlays/how-to-play';
import { createRewardedPrompt, type RewardedPromptProps } from '../ui/overlays/rewarded-prompt';
import { createSettingsModal, type SettingsProps } from '../ui/overlays/settings-modal';
import { createToastLayer, type ToastLayer } from '../ui/overlays/toast';
import { createWinOverlay, type WinOverlayProps } from '../ui/overlays/win-overlay';
import { createBootScreen, type BootScreen } from '../ui/screens/boot-screen';
import { createGameScreen, type GameScreen, type GameScreenCallbacks, type GameView } from '../ui/screens/game-screen';
import { createHomeScreen, type HomeCallbacks, type HomeView } from '../ui/screens/home-screen';
import type { OverlayView, View } from '../ui/dom';
import type { AppBus } from './events';
import type { OverlayId, ScreenId } from './store';

export interface OverlayPropsMap {
  hint: HintCardProps;
  rewarded: RewardedPromptProps;
  win: WinOverlayProps;
  fail: FailOverlayProps;
  settings: SettingsProps;
  how_to_play: HowToPlayProps;
  daily_result: DailyResultProps;
  coach: CoachProps;
}

export interface Router {
  readonly root: HTMLElement;
  screen(): ScreenId;
  /** Replace the current screen (closes all overlays). */
  showBoot(): BootScreen;
  showHome(view: HomeView, cb: HomeCallbacks): View<HomeView>;
  showGame(view: GameView, cb: GameScreenCallbacks): GameScreen;
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
  /** Esc: dismiss() the top overlay; returns whether something handled it. */
  escape(): boolean;
  destroy(): void;
}

export type OverlayFactories = { readonly [K in OverlayId]: () => OverlayView<OverlayPropsMap[K]> };

/** UI constructors used by the router (test seam; defaults are the real ui/ modules). */
export interface RouterFactories {
  readonly overlays: Partial<OverlayFactories>;
  bootScreen(): BootScreen;
  homeScreen(view: HomeView, cb: HomeCallbacks): View<HomeView>;
  gameScreen(view: GameView, cb: GameScreenCallbacks): GameScreen;
  toastLayer(): ToastLayer;
  trapFocus(container: HTMLElement, opts?: { initialFocus?: HTMLElement | null; returnFocus?: HTMLElement | null }): () => void;
  setInert(elements: readonly HTMLElement[], inert: boolean): void;
}

export interface RouterDeps {
  /** Receives 'screen', 'overlay:open', 'overlay:close'. */
  readonly bus?: AppBus;
  readonly doc?: Document;
  readonly factories?: Partial<RouterFactories>;
}

const DEFAULT_OVERLAYS: OverlayFactories = {
  hint: createHintCard,
  rewarded: createRewardedPrompt,
  win: createWinOverlay,
  fail: createFailOverlay,
  settings: createSettingsModal,
  how_to_play: createHowToPlay,
  daily_result: createDailyResult,
  coach: createCoach,
};

type AnyOverlay = OverlayView<OverlayPropsMap[OverlayId]>;

export function createRouter(root: HTMLElement, deps: RouterDeps = {}): Router {
  const doc = deps.doc ?? root.ownerDocument;
  const f = deps.factories ?? {};
  const overlayFactories: OverlayFactories = { ...DEFAULT_OVERLAYS, ...(f.overlays ?? {}) };
  const makeToast = f.toastLayer ?? createToastLayer;
  const trap = f.trapFocus ?? trapFocus;
  const inert = f.setInert ?? setInert;
  const { bus } = deps;

  while (root.firstChild) root.removeChild(root.firstChild);
  const screenHost = doc.createElement('div');
  screenHost.className = 'app-screen';
  const overlayHost = doc.createElement('div');
  overlayHost.className = 'app-overlays';
  root.appendChild(screenHost);
  root.appendChild(overlayHost);
  let toastLayer: ToastLayer | null = null;

  let screenId: ScreenId = 'boot';
  let current: { destroy(): void } | null = null;
  const views = new Map<OverlayId, AnyOverlay>();
  const order: OverlayId[] = [];
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

  function topModalIndex(): number {
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i] as OverlayId;
      if (views.get(id)?.modal) return i;
    }
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

  /** Keeps exactly one focus trap, on the top-most modal overlay. */
  function syncFocus(): void {
    const m = topModalIndex();
    const topId = m >= 0 ? (order[m] as OverlayId) : null;
    if (active?.id === topId) return;
    if (active) {
      const release = active.release;
      active = null;
      release();
    }
    if (topId === null) return;
    const v = views.get(topId) as AnyOverlay;
    const now = focused();
    active = {
      id: topId,
      release: trap(v.el, {
        initialFocus: now && v.el.contains(now) ? now : null,
        returnFocus: returnTo.get(topId) ?? null,
      }),
    };
  }

  function overlay<K extends OverlayId>(id: K): OverlayView<OverlayPropsMap[K]> {
    let v = views.get(id) as OverlayView<OverlayPropsMap[K]> | undefined;
    if (!v) {
      v = overlayFactories[id]();
      overlayHost.appendChild(v.el);
      views.set(id, v as unknown as AnyOverlay);
    }
    return v;
  }

  function closeInternal(id: OverlayId): void {
    const i = order.indexOf(id);
    if (i < 0) return;
    order.splice(i, 1);
    views.get(id)?.close();
    applyInert();
    syncFocus();
    returnTo.delete(id);
    bus?.emit('overlay:close', { id });
  }

  function closeAll(): void {
    while (order.length) closeInternal(order[order.length - 1] as OverlayId);
  }

  function replaceScreen<T extends { readonly el: HTMLElement; destroy(): void }>(id: ScreenId, make: () => T): T {
    closeAll();
    const prev = current;
    current = null;
    prev?.destroy();
    while (screenHost.firstChild) screenHost.removeChild(screenHost.firstChild);
    const next = make();
    screenHost.appendChild(next.el);
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
    showBoot: () => replaceScreen('boot', () => (f.bootScreen ?? createBootScreen)()),
    showHome: (view, cb) => replaceScreen('home', () => (f.homeScreen ?? createHomeScreen)(view, cb)),
    showGame: (view, cb) => replaceScreen('game', () => (f.gameScreen ?? createGameScreen)(view, cb)),
    open(id, props) {
      const v = overlay(id);
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
      else returnTo.set(id, focused()); // may be inside a lower overlay (Settings → How to play)
      order.push(id);
      overlayHost.appendChild(v.el); // DOM order follows the stack (later = on top)
      v.open(props);
      applyInert();
      syncFocus();
      bus?.emit('overlay:open', { id });
    },
    update(id, props) {
      if (order.indexOf(id) >= 0) overlay(id).update(props);
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
    escape() {
      const id = router.top();
      if (id === null) return false;
      return views.get(id)?.dismiss() ?? false;
    },
    destroy() {
      doc.removeEventListener('keydown', onKey);
      closeAll();
      for (const v of views.values()) v.destroy();
      views.clear();
      current?.destroy();
      current = null;
      toastLayer?.destroy();
      toastLayer = null;
      while (root.firstChild) root.removeChild(root.firstChild);
    },
  };
  return router;
}
