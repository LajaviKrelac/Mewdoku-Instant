// Owner: A
// Event art (phase2b §4.4, §4.7): the page patterns as CSS-ready SVG data (lanterns, snowflakes,
// yarn), the accessories (acc-lantern, acc-scarf, acc-yarn symbols in the sprite) and eventArt(def,
// kind): the art part of the Home event card ('card': pattern + 48 px Tux pose with the accessory)
// and of the event-screen header ('header'). B places the element; A owns its look (art.css).
// Lives in the lazy `events` chunk (reached through src/app/events-chunk.ts): never import it
// statically from a main-bundle module.
// F0: eventArt returns a placeholder (the accessory placeholder symbol) so B can lay it out from day
// 1; eventPatternUrl is a stub. A replaces both.
import type { EventDef, EventPageArt } from '../../game/events';
import { icon } from './sprite';

export type EventArtKind = 'card' | 'header';

/**
 * The art element for an event's Home card or screen header. Decorative (aria-hidden); the card's
 * accessible name comes from its status line. Classes (proposed): .event-art.event-art--card|header[data-art].
 */
export function eventArt(def: EventDef, kind: EventArtKind): HTMLElement {
  const el = document.createElement('div');
  el.className = `event-art event-art--${kind}`;
  el.dataset.art = def.theme.pageArt;
  el.setAttribute('aria-hidden', 'true');
  el.appendChild(icon(`acc-${def.theme.accessory}`, { class: 'event-art__acc' }));
  return el;
}

/** `url("data:image/svg+xml,…")` of a tileable page pattern, for --page-art in the [data-event-theme] blocks. */
export function eventPatternUrl(art: EventPageArt): string {
  void art;
  throw new Error('not implemented: eventPatternUrl (A, phase2b §4.4)');
}
