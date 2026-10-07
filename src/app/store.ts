// Owner: foundation (app may extend). Tiny observable store (04 §5.2) and the AppState shape.
// Views subscribe with selectors and re-render only when their slice changes (reference equality
// by default, since all state is immutable).
import type { PuzzleId } from '../engine/types';
import type { GameState, ModeId, SaveDataV1 } from '../game/types';

export type Listener<S> = (state: S, prev: S) => void;
export type Equality<T> = (a: T, b: T) => boolean;

export interface Store<S> {
  get(): S;
  /** Replaces the state; a no-op when `next` is the current reference. Notifies synchronously. */
  set(next: S): void;
  /** set(fn(get())). This is the store's "dispatch" for app-level changes. */
  update(fn: (s: S) => S): void;
  subscribe(listener: Listener<S>): () => void;
  /** Calls `listener` when `selector(state)` changes by `equals` (default Object.is). */
  select<T>(
    selector: (s: S) => T,
    listener: (value: T, prev: T) => void,
    opts?: { equals?: Equality<T>; immediate?: boolean },
  ): () => void;
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  let notified = initial; // last state every listener has seen
  let notifying = false;
  const listeners = new Set<Listener<S>>();

  const flush = (): void => {
    if (notifying) return; // the running loop picks up the newest state
    notifying = true;
    try {
      while (notified !== state) {
        const prev = notified;
        const cur = state;
        notified = cur;
        for (const l of [...listeners]) l(cur, prev);
      }
    } finally {
      notifying = false;
    }
  };

  const store: Store<S> = {
    get: () => state,
    set(next) {
      if (Object.is(next, state)) return;
      state = next;
      flush();
    },
    update(fn) {
      store.set(fn(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select(selector, listener, opts) {
      const equals = opts?.equals ?? Object.is;
      let last = selector(state);
      if (opts?.immediate) listener(last, last);
      return store.subscribe((s) => {
        const v = selector(s);
        if (equals(v, last)) return;
        const prev = last;
        last = v;
        listener(v, prev);
      });
    },
  };
  return store;
}

/** Shallow equality for selector results that build small objects or arrays. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(rb, k) && Object.is(ra[k], rb[k]));
}

// ─────────────────────────────── AppState (04 §5.2) ───────────────────────────────

export type ScreenId = 'boot' | 'home' | 'game';
/** Stack overlays managed by the router. Toast (O9) and rotate notice (O10) are separate layers. */
export type OverlayId = 'hint' | 'rewarded' | 'win' | 'fail' | 'settings' | 'how_to_play' | 'daily_result' | 'coach';

/** What the player asked to play. */
export type SessionRequest =
  | { mode: 'tutorial'; replay: boolean }
  | { mode: 'level'; level: number }
  | { mode: 'daily'; dateKey: string };

/** Facts about the running game that are not part of the reducer state. */
export interface SessionMeta {
  readonly request: SessionRequest;
  readonly mode: ModeId;
  readonly puzzleId: PuzzleId;
  /** Level number (tutorial: 1); null for a daily. */
  readonly level: number | null;
  /** YYYY-MM-DD for a daily; null otherwise. */
  readonly dateKey: string | null;
  readonly hard: boolean;
  /** Palette index (0..11) per region label (03 §8.5; tutorial: fixed colours). */
  readonly colors: Uint8Array;
  /** 1..6 while the tutorial runs, else null (02 §11.5). */
  readonly tutorialStep: number | null;
  /** Substitute board (pack failed to load): never saved as in-progress (02 §11.4). */
  readonly substitute: boolean;
}

export interface UiState {
  /** Board input lock: READY, overlays, ads, kitty reveal (02 §6.4). */
  readonly inputLocked: boolean;
  readonly adShowing: boolean;
  /** Page hidden or FB onPause. */
  readonly paused: boolean;
  /** Resolved from settings.reduceMotion + prefers-reduced-motion. */
  readonly reducedMotion: boolean;
  readonly storage: 'ok' | 'memory';
}

export interface AppState {
  readonly screen: ScreenId;
  /** Overlay stack, top last. */
  readonly overlays: readonly OverlayId[];
  readonly save: SaveDataV1;
  readonly game: GameState | null;
  readonly session: SessionMeta | null;
  readonly ui: UiState;
}

export function initialAppState(save: SaveDataV1): AppState {
  return {
    screen: 'boot',
    overlays: [],
    save,
    game: null,
    session: null,
    ui: { inputLocked: true, adShowing: false, paused: false, reducedMotion: false, storage: 'ok' },
  };
}
