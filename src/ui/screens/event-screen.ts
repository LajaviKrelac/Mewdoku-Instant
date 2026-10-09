// Owner: B
// Event screen (new screen `event`, phase2b §4.4), in the lazy `events` chunk: header art (A's
// eventArt(def, 'header'): pattern + Tux with the accessory), name and tagline, "Ends in …", the
// milestone track (5 nodes on a bar; reached nodes filled with the reward icon), the primary
// "Play puzzle {i}", "Top list" (FB: the ranking panel for the event board; web: personal results)
// and "Home". The root carries data-event-theme={def.id} (tokens.css blocks, A) and, with
// bannerReserved, data-banner (phase2b §3.2). Tab order: header → play → top list → home (§7).
// F0 stub: view and callbacks final; body is B's.
import type { EventDef, Milestone } from '../../game/events';
import type { View } from '../dom';

export interface EventTrackNodeView extends Milestone {
  readonly reached: boolean;
}

export interface EventScreenView {
  readonly def: EventDef;
  /** Device clock now and the event's end (epoch ms), for "Ends in 3 d 4 h" / "Ends soon!" (events.cardEndsSoonHours). */
  readonly now: number;
  readonly endsAt: number;
  readonly solved: number;
  /** def.puzzles.count. */
  readonly total: number;
  readonly track: readonly EventTrackNodeView[];
  /** Next puzzle to play, 0-based (the button shows index + 1); null when all are solved. */
  readonly nextIndex: number | null;
  readonly fbSafeZone: boolean;
  readonly reducedMotion: boolean;
  /** phase2b §3.2: the banner band is reserved on this screen. */
  readonly bannerReserved: boolean;
}

export interface EventScreenCallbacks {
  onPlay(): void;
  onTopList(): void;
  onHome(): void;
  onSettings(): void;
}

export function createEventScreen(view: EventScreenView, cb: EventScreenCallbacks): View<EventScreenView> {
  void view;
  void cb;
  throw new Error('not implemented: createEventScreen (B, phase2b §4.4)');
}
