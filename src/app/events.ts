// Owner: foundation (app may extend: add map entries, never change existing payloads).
// Typed event bus (04 §3) and the analytics event table (02 §20). Phase 3 hook: achievements,
// quests and stats subscribe here without touching the session.
import type { HintKind } from '../engine/types';
import type { GameEvent, GameState, ModeId, SaveMode } from '../game/types';
import type { AdFailReason, AdKind, AdPlacement, InterstitialPlacement, RewardedPlacement } from '../platform/types';
import type { OverlayId, ScreenId } from './store';

export type Handler<P> = (payload: P) => void;

export interface EventBus<M> {
  on<K extends keyof M>(type: K, handler: Handler<M[K]>): () => void;
  once<K extends keyof M>(type: K, handler: Handler<M[K]>): () => void;
  emit<K extends keyof M>(type: K, payload: M[K]): void;
  /** Removes every handler (tests, teardown). */
  clear(): void;
}

/** Handlers run synchronously in subscription order; a throwing handler does not stop the others. */
export function createEventBus<M>(onError?: (err: unknown, type: keyof M) => void): EventBus<M> {
  const map = new Map<keyof M, Set<Handler<never>>>();
  const bus: EventBus<M> = {
    on(type, handler) {
      let set = map.get(type);
      if (!set) map.set(type, (set = new Set()));
      set.add(handler as Handler<never>);
      return () => set.delete(handler as Handler<never>);
    },
    once(type, handler) {
      const off = bus.on(type, (p) => {
        off();
        handler(p);
      });
      return off;
    },
    emit(type, payload) {
      const set = map.get(type);
      if (!set) return;
      for (const h of [...set]) {
        try {
          (h as Handler<M[typeof type]>)(payload);
        } catch (err) {
          if (onError) onError(err, type);
          else throw err;
        }
      }
    },
    clear() {
      map.clear();
    },
  };
  return bus;
}

// ─────────────────────────────── Analytics (02 §20) ───────────────────────────────

/** `result` codes for ad_* events: an AdResult reason, plus ok / gated / watchdog / fallback. */
export type AdResultCode = AdFailReason | 'ok' | 'gated' | 'watchdog';

/** Param names are ≥ 2 chars (05 §10): board size is `size`, booleans are 0/1. */
export interface AnalyticsParamsMap {
  tutorial_step: { step: number };
  tutorial_done: { ms: number; skipped: 0 | 1 };
  level_start: { level: number; size: number; grade: number; hard: 0 | 1; mode: ModeId };
  level_win: { level: number; size: number; ms: number; mistakes: number; hints: number; kitties: number; revives: number };
  level_fail: { level: number; size: number; ms: number; cats: number };
  mistake: { level: number; size: number; cats: number };
  hint_used: { level: number; kind: HintKind; charged: 0 | 1 };
  kitty_used: { level: number };
  ad_interstitial: { trigger: InterstitialPlacement; result: AdResultCode };
  ad_rewarded: { placement: RewardedPlacement; result: AdResultCode | 'fallback' };
  daily_start: { date: string; size: number; ms: number; mistakes: number };
  daily_win: { date: string; size: number; ms: number; mistakes: number };
  save_corrupt: { where: string };
  pack_fallback: { where: string };
  js_error: { where: string };
}
export type AnalyticsName = keyof AnalyticsParamsMap;
export type AnalyticsEvent = { [K in AnalyticsName]: { name: K; params: AnalyticsParamsMap[K] } }[AnalyticsName];

/** Param keys per event, for the 05 §10 limits test (02 §23). */
export const ANALYTICS_PARAM_KEYS: { readonly [K in AnalyticsName]: readonly (keyof AnalyticsParamsMap[K])[] } = {
  tutorial_step: ['step'],
  tutorial_done: ['ms', 'skipped'],
  level_start: ['level', 'size', 'grade', 'hard', 'mode'],
  level_win: ['level', 'size', 'ms', 'mistakes', 'hints', 'kitties', 'revives'],
  level_fail: ['level', 'size', 'ms', 'cats'],
  mistake: ['level', 'size', 'cats'],
  hint_used: ['level', 'kind', 'charged'],
  kitty_used: ['level'],
  ad_interstitial: ['trigger', 'result'],
  ad_rewarded: ['placement', 'result'],
  daily_start: ['date', 'size', 'ms', 'mistakes'],
  daily_win: ['date', 'size', 'ms', 'mistakes'],
  save_corrupt: ['where'],
  pack_fallback: ['where'],
  js_error: ['where'],
};

// ─────────────────────────────── App events ───────────────────────────────

export type PauseReason = 'hidden' | 'fb_pause' | 'modal' | 'ad';

export interface AppEventMap {
  /** After every reduce() that produced events (04 §5.2). `prev` is the state before the action. */
  'game:events': { readonly events: readonly GameEvent[]; readonly state: GameState; readonly prev: GameState };
  /** A board was mounted (new level, retry, restore). */
  'game:start': { readonly state: GameState };
  /** The session left the board (Home, next level, replay end). */
  'game:end': { readonly state: GameState; readonly reason: 'home' | 'next' | 'discard' };
  screen: { readonly screen: ScreenId };
  'overlay:open': { readonly id: OverlayId };
  'overlay:close': { readonly id: OverlayId };
  /** The router could not open a queued overlay (its lazy chunk failed to load); it is already closed. */
  'overlay:failed': { readonly id: OverlayId };
  /** A save was scheduled or written. */
  save: { readonly mode: SaveMode };
  /** Hint/kitty stock changed. */
  stock: { readonly hints: number; readonly kitties: number };
  ad: { readonly kind: AdKind; readonly placement: AdPlacement; readonly result: AdResultCode | 'fallback' };
  /** Forwarded to platform.analytics.log by the app. */
  analytics: AnalyticsEvent;
  toast: { readonly message: string };
  pause: { readonly reason: PauseReason };
  resume: { readonly reason: PauseReason };
  error: { readonly where: string; readonly error: unknown };
}

export type AppBus = EventBus<AppEventMap>;
