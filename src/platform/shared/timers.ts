// Owner: platform
// Default PlatformTimers for the adapters (04 §6). platform/ may not import app/clock.ts (04 §2), so
// this is a tiny local equivalent; the app or tests pass their own Clock (it satisfies the type).
import type { PlatformTimers } from '../types';

/** Real timers with our own numeric ids, so ids are plain numbers in browsers and Node alike. */
export function createSystemTimers(): PlatformTimers {
  const handles = new Map<number, ReturnType<typeof globalThis.setTimeout>>();
  let next = 1;
  return {
    now: () => Date.now(),
    setTimeout(fn, ms) {
      const id = next++;
      handles.set(
        id,
        globalThis.setTimeout(() => {
          handles.delete(id);
          fn();
        }, ms),
      );
      return id;
    },
    clearTimeout(id) {
      if (id == null) return;
      const h = handles.get(id);
      if (h !== undefined) globalThis.clearTimeout(h);
      handles.delete(id);
    },
  };
}

/** Resolves after `ms` on `timers` (at once, without a timer, when ms ≤ 0). */
export function sleep(timers: PlatformTimers, ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    timers.setTimeout(resolve, ms);
  });
}
