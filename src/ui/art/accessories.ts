// Owner: A (phase2b §1.6, §4.4)
// The event accessories, drawn by us on the head's 100-unit grid so they layer over any cat symbol or
// pose head: acc-lantern, acc-scarf, acc-yarn. They belong to the lazy `events` chunk (phase2b §1.6:
// "lazy (events chunk)"): art/event-art.ts imports this module, and mountAccessories() adds the three
// <symbol>s to the page's sprite once, when the chunk loads. A <use href="#acc-…"> that exists before
// then (an event board restored at boot) starts rendering as soon as the symbol arrives.
import { CAT } from './cat-parts';
import { TOKENS } from './palette';
import { SPRITE_ID } from './sprite';

/** Accessory colours (art only, never UI text): lantern paper and cap, scarf knit, yarn. */
const ACC = Object.freeze({
  paper: '#E8573A',
  paperDeep: '#B53A26',
  cap: TOKENS.gold,
  glow: TOKENS.gold,
  knit: '#D9434F',
  knitDeep: '#A8303B',
  stripe: '#FFF3E2',
  yarn: '#F27A9A',
  yarnDeep: '#C24F70',
});
const ACC_OL = `stroke="${CAT.ink}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;

/**
 * Event accessories (phase2b §4.4) on the head's 100-unit grid, layered over a cat symbol or a pose's
 * head: a paper lantern hanging from the right ear (Lantern Walk), a knitted scarf under the chin
 * (Snow Paws) and a little yarn heart by the right ear (Yarn Hearts). The notched left ear stays clear.
 */
export function accessoryMarkup(): string {
  const lantern =
    `<circle cx="89" cy="41" r="14" fill="${ACC.glow}" opacity=".28"/>` +
    `<path d="M78.8 13.6Q88.4 15.6 89 30.4" fill="none" ${ACC_OL} stroke-width="1.2"/>` +
    `<ellipse cx="89" cy="41" rx="8.6" ry="9.8" fill="${ACC.paper}" ${ACC_OL}/>` +
    `<path d="M89 31.4V50.6M84.2 32.8Q81 41 84.2 49.2M93.8 32.8Q97 41 93.8 49.2" fill="none" stroke="${ACC.paperDeep}" stroke-width="1.2" stroke-linecap="round"/>` +
    `<ellipse cx="86" cy="37.4" rx="2" ry="3.4" fill="#fff" opacity=".35"/>` +
    `<rect x="84" y="29.2" width="10" height="3.6" rx="1.4" fill="${ACC.cap}" ${ACC_OL} stroke-width="1.2"/>` +
    `<rect x="84" y="49.2" width="10" height="3.6" rx="1.4" fill="${ACC.cap}" ${ACC_OL} stroke-width="1.2"/>` +
    `<path d="M89 52.8V58.6M87.4 58.6H90.6" fill="none" stroke="${ACC.cap}" stroke-width="2" stroke-linecap="round"/>`;
  const scarf =
    `<path d="M14.4 79.6C27 90.6 73 90.6 85.6 79.6L87.6 87.8C74 99.2 26 99.2 12.4 87.8Z" fill="${ACC.knit}" ${ACC_OL}/>` +
    `<path d="M27 86.4 26 94.6M40 89 39.6 97.4M60 89 60.4 97.4M73 86.4 74 94.6" fill="none" stroke="${ACC.stripe}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M20.6 88.6 15.4 99.4H29L31.2 91.6Z" fill="${ACC.knit}" ${ACC_OL}/>` +
    `<path d="M19 95.6H29.6" fill="none" stroke="${ACC.stripe}" stroke-width="2.6"/>` +
    `<path d="M17 99.4V97.2M20.6 99.4V97.2M24.2 99.4V97.2M27.8 99.4V97.2" fill="none" stroke="${ACC.knitDeep}" stroke-width="1.2" stroke-linecap="round"/>`;
  const yarn =
    `<path d="M73 47.4C66.2 42.6 62.6 38.6 62.6 34.6 62.6 31.4 65 29.2 67.8 29.2 70 29.2 71.8 30.4 73 32.4 74.2 30.4 76 29.2 78.2 29.2 81 29.2 83.4 31.4 83.4 34.6 83.4 38.6 79.8 42.6 73 47.4Z" fill="${ACC.yarn}" ${ACC_OL}/>` +
    `<path d="M65.2 33.4 72.6 41.4M67.6 30.6 77.4 41.2M71.8 31.6 80.8 37.6M77.4 30.2 81.6 33.6" fill="none" stroke="${ACC.yarnDeep}" stroke-width="1.1" stroke-linecap="round"/>` +
    `<path d="M82.8 37.4C87.6 38.6 90.4 42.4 88.6 45.8 87.2 48.4 84.2 47.2 85.6 45" fill="none" stroke="${ACC.yarn}" stroke-width="1.5" stroke-linecap="round"/>`;
  const sym = (id: string, body: string): string => `<symbol id="${id}" viewBox="0 0 100 100">${body}</symbol>`;
  return sym('acc-lantern', lantern) + sym('acc-scarf', scarf) + sym('acc-yarn', yarn);
}

/** Adds the accessory symbols to the mounted sprite (idempotent; a no-op before mountSprite()). */
export function mountAccessories(doc: Document = document): boolean {
  const sprite = doc.getElementById(SPRITE_ID);
  if (!sprite) return false;
  if (sprite.querySelector('#acc-lantern')) return true;
  const tmp = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tmp.innerHTML = accessoryMarkup();
  while (tmp.firstChild) sprite.appendChild(tmp.firstChild);
  return true;
}
