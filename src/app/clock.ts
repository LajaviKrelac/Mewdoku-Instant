// Owner: foundation (app may extend). Injectable clock (04 §3): wall time, monotonic time and
// timers behind one interface, with a deterministic fake for tests.

export type TimerId = number;

export interface Clock {
  /** Wall-clock epoch ms (Date.now). Used for save stamps, ad pacing, daily date keys. */
  now(): number;
  /** Monotonic ms (performance.now). Used for elapsed-time deltas (TICK dtMs). */
  perf(): number;
  setTimeout(fn: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId | null | undefined): void;
  setInterval(fn: () => void, ms: number): TimerId;
  clearInterval(id: TimerId | null | undefined): void;
}

/** Resolves after `ms` on the given clock (fake clocks resolve when advanced). */
export function delay(clock: Clock, ms: number): Promise<void> {
  return new Promise((resolve) => {
    clock.setTimeout(resolve, ms);
  });
}

/** The real clock. Timer ids are our own numbers, so they are plain numbers in browsers and Node. */
export function createSystemClock(): Clock {
  const handles = new Map<TimerId, ReturnType<typeof globalThis.setTimeout>>();
  let next = 1;
  const perf =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? () => performance.now()
      : () => Date.now();
  return {
    now: () => Date.now(),
    perf,
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
    setInterval(fn, ms) {
      const id = next++;
      handles.set(id, globalThis.setInterval(fn, ms));
      return id;
    },
    clearInterval(id) {
      if (id == null) return;
      const h = handles.get(id);
      if (h !== undefined) globalThis.clearInterval(h);
      handles.delete(id);
    },
  };
}

export const systemClock: Clock = createSystemClock();

export interface FakeClock extends Clock {
  /** Moves both now() and perf() forward by ms, firing due timers in time order. */
  advance(ms: number): void;
  /** Like advance(), awaiting microtasks between timers so promise chains settle (async flows). */
  advanceAsync(ms: number): Promise<void>;
  /** Sets the wall clock without firing timers (e.g. to simulate a date change). */
  setNow(epochMs: number): void;
  /** Number of scheduled timers. */
  pending(): number;
  /** Fires timers until none are left (intervals excluded), up to `limit` firings. */
  runAll(limit?: number): void;
}

interface FakeTimer {
  id: TimerId;
  at: number;
  fn: () => void;
  every: number | null;
}

/** Deterministic clock for tests. Wall time starts at `startEpochMs`; perf() starts at 0. */
export function createFakeClock(startEpochMs = Date.UTC(2026, 9, 6, 9, 0, 0)): FakeClock {
  let wall = startEpochMs;
  let mono = 0;
  let next = 1;
  const timers: FakeTimer[] = [];

  const add = (fn: () => void, ms: number, every: number | null): TimerId => {
    const id = next++;
    timers.push({ id, at: mono + Math.max(0, ms), fn, every });
    return id;
  };
  const remove = (id: TimerId | null | undefined): void => {
    const i = timers.findIndex((tm) => tm.id === id);
    if (i >= 0) timers.splice(i, 1);
  };
  const due = (until: number): FakeTimer | undefined => {
    let best: FakeTimer | undefined;
    for (const tm of timers) if (tm.at <= until && (!best || tm.at < best.at || (tm.at === best.at && tm.id < best.id))) best = tm;
    return best;
  };
  const fire = (tm: FakeTimer): void => {
    wall += tm.at - mono;
    mono = tm.at;
    if (tm.every === null) remove(tm.id);
    else tm.at += Math.max(1, tm.every);
    tm.fn();
  };

  const clock: FakeClock = {
    now: () => wall,
    perf: () => mono,
    setTimeout: (fn, ms) => add(fn, ms, null),
    clearTimeout: remove,
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearInterval: remove,
    advance(ms) {
      const end = mono + ms;
      for (let tm = due(end); tm; tm = due(end)) fire(tm);
      wall += end - mono;
      mono = end;
    },
    async advanceAsync(ms) {
      const end = mono + ms;
      await flushMicrotasks();
      for (let tm = due(end); tm; tm = due(end)) {
        fire(tm);
        await flushMicrotasks();
      }
      wall += end - mono;
      mono = end;
    },
    setNow(epochMs) {
      wall = epochMs;
    },
    pending: () => timers.length,
    runAll(limit = 10_000) {
      for (let i = 0; i < limit; i++) {
        const once = timers.filter((tm) => tm.every === null).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!once) return;
        fire(once);
      }
      throw new Error('FakeClock.runAll: limit reached');
    },
  };
  return clock;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
