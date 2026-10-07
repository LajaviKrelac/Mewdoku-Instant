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

/**
 * Settles like `p`, unless `ms` pass first: then it settles with `onTimeout()` (a throw rejects) and
 * a late result of `p` is ignored. The timer is cleared as soon as `p` settles.
 */
export function within<T, F>(timers: PlatformTimers, p: Promise<T>, ms: number, onTimeout: () => F): Promise<T | F> {
  return new Promise<T | F>((resolve, reject) => {
    let done = false;
    const timer = timers.setTimeout(() => {
      if (done) return;
      done = true;
      try {
        resolve(onTimeout());
      } catch (err) {
        reject(err);
      }
    }, ms);
    const settle = (fn: () => void): void => {
      if (done) return;
      done = true;
      timers.clearTimeout(timer);
      fn();
    };
    p.then(
      (v) => settle(() => resolve(v)),
      (err: unknown) => settle(() => reject(err)),
    );
  });
}
