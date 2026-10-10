// Owner: G2 (Phase 2d.1)
// The Phase 2d.1 mouse face of the first-load sprite (helpers-spec §1.4, Appendix C), drawn by us as SVG
// from the spec's words, never from a frame of the original (D-2d1-0; provenance-G2.md): the head (ears,
// muzzle, whiskers, nose, closed mouth, two teeth) and bead eyes with catchlights; tool-mouse is the two
// together, and the board mouse (lazy-art.ts) moves them as parts. Everything that only the mouse's
// visits and the lazy fx chunk draw lives in art/lazy-art.ts (mounted with those chunks); since
// integration I-4 that includes the tickers' paw cap, bolt and star (the tickers play in the fx chunk).
// Every symbol is decorative (the sprite is aria-hidden; icon() adds aria-hidden). Colours: the HUD
// tokens' values (one theme, look-spec §2.2) or custom properties that the using element sets.
import { CAT } from './cat-parts';
import { TOKENS } from './palette';

export const sym = (id: string, viewBox: string, body: string): string => `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`;

/** The mouse's greys (look-spec §1.11, shared with tool-mouse): head, muzzle, line work, eyes. */
export const MOUSE = Object.freeze({ head: '#B8B4BC', muzzle: '#D9D6DC', line: '#8E8994', eye: '#1E1A22', mouth: '#5C2A3C' });

/** The mouse art's box on its 100 grid (ears to chin): tool-mouse and the board mouse share it. */
export const MOUSE_BOX = '1 4.5 98 88';

/** The mouse's eye centres on the 100 grid. */
export const EYES: readonly (readonly [number, number])[] = [
  [36, 55],
  [64, 55],
];

/** The mouse's head without its eyes: ears with pink insides, head, muzzle, whiskers, nose, closed mouth and two teeth. */
export function mouseHead(): string {
  const ear = (cx: number): string => `<circle cx="${cx}" cy="27" r="20" fill="${MOUSE.head}"/><circle cx="${cx}" cy="28" r="12.5" fill="${CAT.earIn}"/>`;
  return (
    ear(23) +
    ear(77) +
    `<ellipse cx="50" cy="60" rx="36" ry="33" fill="${MOUSE.head}"/><ellipse cx="50" cy="75" rx="21" ry="15.5" fill="${MOUSE.muzzle}"/>` +
    `<g fill="none" stroke="${MOUSE.line}" stroke-width="1.3" stroke-linecap="round"><path d="M32 70 8 64M31.5 74.5H6M32 79 9 85.5M68 70l24-6m-23.5 10.5H94M68 79l23 6.5"/>` +
    `<path d="M50 69v4.5m-7 .8q7 4.6 14 0"/></g>` +
    `<path d="M46 77.2h3.6v6.4a1 1 0 0 1-1 1H47a1 1 0 0 1-1-1Zm4.4 0H54v6.4a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1Z" fill="#fff" stroke="${MOUSE.line}" stroke-width=".9"/>` +
    `<ellipse cx="50" cy="67.4" rx="4.8" ry="3.4" fill="${CAT.nose}"/>`
  );
}

/** The bead eyes with their catchlights. */
export function mouseEyes(): string {
  return EYES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.4" fill="${MOUSE.eye}"/><circle cx="${x + 1.8}" cy="${y - 1.8}" r="1.8" fill="#fff"/>`).join('');
}
