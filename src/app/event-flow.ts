// Owner: C
// Limited-time events in the app (phase2b §4.4): resolves the active / teased event from the bundled
// defs and the device clock, builds the Home card and the event screen views, starts event puzzles
// (mode `event`, slot inProgress.event, id E<eventId>/<i>), clears an unfinished slot after the end,
// and loads the lazy `events` chunk (./events-chunk) for the screen and its art. Interstitial trigger
// `event_next`. C-internal module (F0 stub).
import type { EventDef } from '../game/events';
import type { GameConfig } from './config';
import type { AppState, Store } from './store';

export interface EventFlowDeps {
  readonly store: Store<AppState>;
  readonly defs: readonly EventDef[];
  readonly now: () => number;
  readonly config?: GameConfig;
}

export interface EventFlow {
  /** The event with start ≤ now < end, else null. */
  active(): EventDef | null;
  /** The next event within events.teaseHours, else null. */
  teaser(): EventDef | null;
  /** Clears inProgress.event when its event has ended (launch, §4.4 "After the end"). */
  clearEnded(): void;
  /** Loads the lazy `events` chunk (event screen + art); never rejects (false when it cannot load). */
  preload(): Promise<boolean>;
}

export function createEventFlow(deps: EventFlowDeps): EventFlow {
  void deps;
  throw new Error('not implemented: createEventFlow (C, phase2b §4.4)');
}
