// Owner: app
// SaveScheduler (04 §7.1, 02 §15): stamps updatedAt and writes through platform.storage.
//   touch()    → local write debounced save.localDebounceMs, cloud 'debounced'
//   now()      → cancel debounces, local + cloud 'now' (page hide, onPause, Home, stock changes)
//   critical() → now() + cloud 'flush' (level win, daily win, first-run tutorial win/skip only)
import type { PlatformStorage } from '../platform/types';
import type { Clock } from './clock';
import type { AppBus } from './events';
import type { AppState, Store } from './store';

export interface SaveScheduler {
  touch(): void;
  now(): void;
  critical(): void;
  /** Writes a pending debounced save at once (no-op when nothing is pending). */
  flush(): void;
  dispose(): void;
}

export interface SaveSchedulerDeps {
  readonly store: Store<AppState>;
  readonly storage: PlatformStorage;
  readonly clock: Clock;
  readonly bus?: AppBus;
}

export function createSaveScheduler(deps: SaveSchedulerDeps): SaveScheduler {
  throw new Error('not implemented: createSaveScheduler');
}
