// Owner: A
// Event art (phase2b §4.4, §4.7), all drawn by us from the spec's words: the page patterns as
// CSS-ready SVG data (paper lanterns, snowflakes, yarn balls), and eventArt(def, kind), the art part of
// the Home event card ('card': the pattern plus a 48 px Tux bust wearing the event accessory) and of
// the event-screen header ('header': the pattern plus Tux sitting, wearing it). The accessories are
// the sprite's acc-lantern / acc-scarf / acc-yarn symbols on the head grid. B places the element; A
// owns its look (art.css). Lives in the lazy `events` chunk (reached through src/app/events-chunk.ts):
// never import it statically from a main-bundle module.
// The same pattern URLs are written into the [data-event-theme] blocks of styles/tokens.css
// (tests/unit/ui/css-rules.spec.ts keeps them equal). Loading this module (the events chunk) adds the
// accessory symbols to the sprite (art/accessories.ts), so the event board's cats can wear them too.
import type { EventDef, EventPageArt } from '../../game/events';
import { mountAccessories } from './accessories';
import { basePose, head, poseSvg } from './mascot';
import { EVENT_PATTERN_COLORS } from './palette';

export type EventArtKind = 'card' | 'header';

export { mountAccessories };

// The events chunk is loaded when an event is active or teased: make the accessories available now.
if (typeof document !== 'undefined') mountAccessories();

/** Pattern motif colours: a shade off each event page, so text over the pattern keeps its contrast. */
const MOTIF = EVENT_PATTERN_COLORS;

/** One 72 × 72 tile per pattern, two motifs on a diagonal so the repeat reads as scattered. */
function patternSvg(art: EventPageArt): string {
  const { a, b } = MOTIF[art];
  let body = '';
  if (art === 'lanterns') {
    const lantern = (x: number, y: number, s: number): string =>
      `<path d='M${x} ${y - 13 * s}V${y - 8 * s}' stroke='${b}' stroke-width='${1.4 * s}'/>` +
      `<ellipse cx='${x}' cy='${y}' rx='${6.4 * s}' ry='${7.6 * s}' fill='${a}'/>` +
      `<rect x='${x - 3.6 * s}' y='${y - 9.4 * s}' width='${7.2 * s}' height='${2.6 * s}' rx='${s}' fill='${b}'/>` +
      `<rect x='${x - 3.6 * s}' y='${y + 6.8 * s}' width='${7.2 * s}' height='${2.6 * s}' rx='${s}' fill='${b}'/>` +
      `<path d='M${x} ${y - 7 * s}V${y + 7 * s}' stroke='${b}' stroke-width='${s}'/>`;
    body = lantern(18, 22, 1) + lantern(54, 56, 0.8) + `<circle cx='52' cy='16' r='1.6' fill='${b}'/><circle cx='16' cy='58' r='1.3' fill='${b}'/>`;
  } else if (art === 'snowflakes') {
    const flake = (x: number, y: number, r: number): string => {
      let d = '';
      for (let k = 0; k < 6; k++) {
        const ang = (k * Math.PI) / 3;
        const ex = x + r * Math.cos(ang);
        const ey = y + r * Math.sin(ang);
        const mx = x + r * 0.55 * Math.cos(ang);
        const my = y + r * 0.55 * Math.sin(ang);
        const tw = (o: number): string => `${(mx + r * 0.3 * Math.cos(ang + o)).toFixed(1)} ${(my + r * 0.3 * Math.sin(ang + o)).toFixed(1)}`;
        d += `M${x} ${y}L${ex.toFixed(1)} ${ey.toFixed(1)}M${mx.toFixed(1)} ${my.toFixed(1)}L${tw(0.7)}M${mx.toFixed(1)} ${my.toFixed(1)}L${tw(-0.7)}`;
      }
      return `<path d='${d}' stroke='${a}' stroke-width='1.8' stroke-linecap='round' fill='none'/>`;
    };
    body = flake(18, 20, 10) + flake(54, 54, 7.5) + `<circle cx='50' cy='18' r='2' fill='${b}'/><circle cx='20' cy='54' r='2.4' fill='${b}'/><circle cx='36' cy='38' r='1.4' fill='${a}'/>`;
  } else {
    const ball = (x: number, y: number, r: number): string =>
      `<circle cx='${x}' cy='${y}' r='${r}' fill='${a}'/>` +
      `<path d='M${x - r * 0.7} ${y - r * 0.5}Q${x} ${y + r * 0.2} ${x + r * 0.6} ${y + r * 0.75}M${x - r * 0.85} ${y + r * 0.15}Q${x - r * 0.1} ${y + r * 0.6} ${x + r * 0.1} ${y + r * 0.95}M${x - r * 0.2} ${y - r * 0.95}Q${x + r * 0.5} ${y - r * 0.2} ${x + r * 0.95} ${y + r * 0.1}' stroke='${b}' stroke-width='1.3' fill='none' stroke-linecap='round'/>` +
      `<path d='M${x + r * 0.7} ${y + r * 0.7}q${r * 0.6} ${r * 0.9} ${r * 1.4} ${r * 0.5}' stroke='${b}' stroke-width='1.2' fill='none' stroke-linecap='round'/>`;
    const heart = (x: number, y: number, s: number): string =>
      `<path d='M${x} ${y + 4 * s}C${x - 6 * s} ${y} ${x - 6 * s} ${y - 4.6 * s} ${x - 3 * s} ${y - 4.6 * s}C${x - 1.4 * s} ${y - 4.6 * s} ${x - 0.4 * s} ${y - 3.6 * s} ${x} ${y - 2.6 * s}C${x + 0.4 * s} ${y - 3.6 * s} ${x + 1.4 * s} ${y - 4.6 * s} ${x + 3 * s} ${y - 4.6 * s}C${x + 6 * s} ${y - 4.6 * s} ${x + 6 * s} ${y} ${x} ${y + 4 * s}Z' fill='${b}'/>`;
    body = ball(19, 21, 8.5) + ball(55, 55, 6.5) + heart(54, 18, 1) + heart(18, 54, 0.8);
  }
  // two decimals at most: short, stable URLs (tokens.css carries the same strings)
  return `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'>${body.replace(/(\d+\.\d\d)\d+/g, '$1')}</svg>`;
}

/** `url("data:image/svg+xml,…")` of a tileable page pattern, for --page-art in the [data-event-theme] blocks. */
export function eventPatternUrl(art: EventPageArt): string {
  const svg = patternSvg(art).replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${svg}")`;
}

/** Tux wearing the event accessory: a bust for the card, the full sitting pose for the header. */
function poseMarkup(def: EventDef, kind: EventArtKind): string {
  const acc = `<use href="#acc-${def.theme.accessory}" x="0" y="0" width="100" height="100"/>`;
  const happy = head({ eyes: 'happy', mouth: 'open', ears: 'happy', blush: true, extra: acc });
  if (kind === 'card') return happy;
  return basePose(head({ eyes: 'open', mouth: 'smile', blink: true, rot: 4, extra: acc }));
}

/**
 * The art element for an event's Home card or screen header. Decorative (aria-hidden); the card's
 * accessible name comes from its status line. It paints its own page colour and pattern (the Home
 * card sits on the normal page): .event-art.event-art--card|header[data-art] > svg.event-art__pose.
 */
export function eventArt(def: EventDef, kind: EventArtKind): HTMLElement {
  mountAccessories();
  const el = document.createElement('div');
  el.className = `event-art event-art--${kind}`;
  el.dataset.art = def.theme.pageArt;
  el.dataset.accessory = def.theme.accessory;
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--event-page', def.theme.page);
  el.style.setProperty('--event-art', eventPatternUrl(def.theme.pageArt));
  const viewBox = kind === 'card' ? '10 8 180 152' : '0 0 200 192';
  const pose = poseSvg(`event-${kind}`, poseMarkup(def, kind), viewBox, { class: 'event-art__pose' });
  pose.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  el.appendChild(pose);
  return el;
}
