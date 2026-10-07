// Owner: app
// Boot sequence (04 §5.1): platform.init → sprite/tokens → load + migrate + merge save → sessions+1
// → ensure pack → fonts → progress 100 → platform.start → locale → restore rules → route → preload ads.
import type { GameState, InProgressV1, SaveDataV1 } from '../game/types';
import type { LevelsRepo } from '../game/levels-repo';
import type { PlatformAdapter } from '../platform/types';
import type { Clock } from './clock';
import type { AppBus } from './events';
import type { Router } from './router';
import type { Session } from './session';
import type { AppState, Store } from './store';

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

export function boot(platform: PlatformAdapter, root: HTMLElement, opts?: BootOptions): Promise<AppHandle> {
  throw new Error('not implemented: boot');
}

export interface RestoreResult {
  readonly save: SaveDataV1;
  /** Slots cleared by 02 §15 steps 2–3, for analytics/logging. */
  readonly cleared: readonly ('level' | 'daily')[];
}

/** 02 §15 restore steps 1–3 (stale daily, failed validation). Does not navigate (04 §5.1). */
export function applyRestoreRules(
  save: SaveDataV1,
  ctx: { readonly today: string; readonly levels: LevelsRepo; validate?(slot: InProgressV1): boolean },
): Promise<RestoreResult> {
  throw new Error('not implemented: applyRestoreRules');
}
