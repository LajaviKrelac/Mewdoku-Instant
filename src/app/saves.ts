// Owner: app
// SaveScheduler (04 §7.1, 02 §15): stamps updatedAt and writes through platform.storage.
//   touch()    → local write debounced save.localDebounceMs, cloud 'debounced'
//   now()      → cancel debounces, local + cloud 'now' (page hide, onPause, Home, stock changes)
//   critical() → now() + cloud 'flush' (level win, daily win, first-run tutorial win/skip only)
import type { SaveMode } from '../game/types';
import type { PlatformStorage } from '../platform/types';
import { cfg, type GameConfig } from './config';
import type { Clock, TimerId } from './clock';
import type { AppBus } from './events';
import type { AppState, Store } from './store';

export interface SaveScheduler {
  touch(): void;
  now(): void;
  critical(): void;
  /** Writes a pending debounced save at once (no-op when nothing is pending). */
  flush(): void;
  /** Cancels the pending write and ignores every later call (teardown, e2e seedSave). */
  dispose(): void;
}

export interface SaveSchedulerDeps {
  readonly store: Store<AppState>;
  readonly storage: PlatformStorage;
  readonly clock: Clock;
  readonly bus?: AppBus;
  readonly config?: GameConfig;
}

type CloudMode = 'debounced' | 'now' | 'flush';

export function createSaveScheduler(deps: SaveSchedulerDeps): SaveScheduler {
  const c = deps.config ?? cfg;
  let timer: TimerId | null = null;
  let disposed = false;

  function cancel(): void {
    if (timer !== null) deps.clock.clearTimeout(timer);
    timer = null;
  }

  function write(cloud: CloudMode, mode: SaveMode): void {
    if (disposed) return;
    const stamp = deps.clock.now();
    deps.store.update((s) => (s.save.updatedAt === stamp ? s : { ...s, save: { ...s.save, updatedAt: stamp } }));
    const data = deps.store.get().save;
    try {
      void deps.storage.save(data, { cloud }).catch((err: unknown) => {
        deps.bus?.emit('error', { where: 'save', error: err });
      });
    } catch (err) {
      deps.bus?.emit('error', { where: 'save', error: err });
    }
    deps.bus?.emit('save', { mode });
  }

  return {
    touch() {
      if (disposed) return;
      cancel();
      timer = deps.clock.setTimeout(() => {
        timer = null;
        write('debounced', 'touch');
      }, c.save.localDebounceMs);
    },
    now() {
      if (disposed) return;
      cancel();
      write('now', 'now');
    },
    critical() {
      if (disposed) return;
      cancel();
      write('flush', 'critical');
    },
    flush() {
      if (disposed || timer === null) return;
      cancel();
      write('debounced', 'touch');
    },
    dispose() {
      cancel();
      disposed = true;
    },
  };
}
