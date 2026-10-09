// Owner: C
// Limited-time events in the app (phase2b §4.4): resolves the active / teased event from the bundled
// defs and the device clock, clears an unfinished slot after the end (launch and every late merge),
// and loads the lazy `events` chunk (./events-chunk: the event screen and its art) when an event is
// active or teased. Event sessions themselves are started by the shell (session request mode
// `event`, slot inProgress.event, id E<eventId>/<i>); the interstitial trigger is `event_next`.
import rawEvents from '../data/events/events.json';
import { activeEvent, clearEndedEventSlot, teaserEvent, usableEventDefs, type EventDef } from '../game/events';
import { loadChunk } from '../workers/lazy-chunk';
import { cfg, type GameConfig } from './config';
import { isFlagOn } from './flags';
import type { AppState, Store } from './store';

/**
 * The bundled defs (src/data/events/events.json): an unusable def is dropped, never thrown. The full
 * schema check (validateEventDefs) runs in the tests and verify-levels, not in the bundle.
 */
export function bundledEventDefs(): readonly EventDef[] {
  return usableEventDefs(rawEvents as unknown);
}

/** What the lazy `events` chunk exports (./events-chunk). */
export type EventsChunk = typeof import('./events-chunk');

export interface EventFlowDeps {
  readonly store: Store<AppState>;
  readonly defs: readonly EventDef[];
  readonly now: () => number;
  readonly config?: GameConfig;
  /** Loads the lazy chunk (default: one dynamic import of ./events-chunk, retried by loadChunk). */
  readonly loadChunk?: () => Promise<EventsChunk>;
}

export interface EventFlow {
  /** The event with start ≤ now < end, else null (flag `events`). */
  active(): EventDef | null;
  /** The next event within events.teaseHours, else null. */
  teaser(): EventDef | null;
  /** A def by id (also an ended one, for a slot or a record), else null. */
  byId(id: string): EventDef | null;
  /** Clears inProgress.event when its event has ended (launch, §4.4 "After the end"); true when it did. */
  clearEnded(): boolean;
  /** Loads the lazy `events` chunk (event screen + art); never rejects (null when it cannot load). */
  preload(): Promise<EventsChunk | null>;
  /** All defs (views, the rankings hub). */
  defs(): readonly EventDef[];
}

export function createEventFlow(deps: EventFlowDeps): EventFlow {
  const c = deps.config ?? cfg;
  const load = deps.loadChunk ?? (() => loadChunk(() => import('./events-chunk')));
  let chunk: Promise<EventsChunk | null> | null = null;
  const on = (): boolean => isFlagOn('events');
  return {
    active: () => (on() ? activeEvent(deps.defs, deps.now()) : null),
    teaser: () => (on() ? teaserEvent(deps.defs, deps.now(), c) : null),
    byId: (id) => deps.defs.find((d) => d.id === id) ?? null,
    clearEnded() {
      const before = deps.store.get().save;
      const after = clearEndedEventSlot(before, deps.defs, deps.now());
      if (after === before) return false;
      deps.store.update((s) => (s.save === before ? { ...s, save: after } : { ...s, save: clearEndedEventSlot(s.save, deps.defs, deps.now()) }));
      return true;
    },
    preload() {
      chunk ??= load().then(
        (m) => m,
        () => {
          chunk = null; // a later call tries again
          return null;
        },
      );
      return chunk;
    },
    defs: () => (on() ? deps.defs : []),
  };
}
