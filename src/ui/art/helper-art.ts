// Owner: G2 (Phase 2d.1)
// The Phase 2d.1 drawings of the first-load sprite (helpers-spec §1.4, §5.2, Appendix C), each drawn by us
// as SVG from the spec's words, never from a frame of the original (D-2d1-0; provenance-G2.md). The ones
// only the mouse's visits and the lazy fx chunk use live in art/lazy-art.ts (mounted with those chunks):
// - the mouse face's head (ears, muzzle, whiskers, nose, closed mouth, two teeth) and bead eyes with
//   catchlights: tool-mouse is the two together; the board mouse (lazy-art.ts) moves them as parts;
// - art-paw-cap: a ticker pill's inline-start end as a paw: four toe beans in an arc along the outer
//   edge, each in its own scallop of the outline, a large main pad, the pill's fill and border following
//   the scallops (it reads the ticker's --toast-fill and --toast-line);
// - art-bolt: a chunky zig-zag lightning bolt, yellow with an orange shade; art-star: a plump
//   five-point star with rounded tips, gold with a soft highlight (the tickers' end icons).
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

/**
 * The paw cap (30 × 31, the pill's height): four toe beans in an arc along the outer edge, each inside a
 * scallop of the outline (circles of r 4.3 at (12.4, 4.9), (7, 11.4), (7, 19.6), (12.4, 26.1), the first and
 * last touching the pill's edges), the pill's fill and border following the scallops, a large main pad.
 */
function pawCap(): string {
  const edge = 'M30 .6H12.4A4.3 4.3 0 0 0 9.09 7.64A4.3 4.3 0 1 0 5.7 15.5A4.3 4.3 0 1 0 9.09 23.36A4.3 4.3 0 0 0 12.4 30.4H30';
  const bean = (cx: number, cy: number): string => `<circle cx="${cx}" cy="${cy}" r="2.8" fill="#FFCD9B"/>`;
  return (
    `<defs><radialGradient id="paw-pad" cx=".5" cy=".5" r=".5"><stop offset=".5" stop-color="#FFD4A5"/><stop offset="1" stop-color="#FFE1B5" stop-opacity="0"/></radialGradient></defs>` +
    `<path d="${edge}" style="fill:var(--toast-fill)"/>` +
    bean(12.8, 5.4) +
    bean(7.6, 11.6) +
    bean(7.6, 19.4) +
    bean(12.8, 25.6) +
    `<ellipse cx="20.4" cy="15.5" rx="7" ry="8.6" fill="url(#paw-pad)"/>` +
    `<path d="${edge}" fill="none" style="stroke:var(--toast-line)" stroke-width="1.2" stroke-linejoin="round"/>`
  );
}

/** A plump five-point star (24 grid): rounded tips from a round-joined stroke of its own colour. */
function star5(): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 4.6 : 9.4;
    const a = ((-90 + k * 36) * Math.PI) / 180;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(1)} ${(13 + r * Math.sin(a)).toFixed(1)}`);
  }
  return (
    `<path d="M${pts.join('L')}Z" fill="${TOKENS.gold}" stroke="${TOKENS.gold}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M12 5.6 13.3 9.4 9.6 10Z" fill="#FFE9A6"/><ellipse cx="9.4" cy="11.6" rx="1.6" ry="1" transform="rotate(-30 9.4 11.6)" fill="#fff" opacity=".7"/>` +
    `<path d="M16.3 18.8 12 16.5 7.7 18.8l.9-4.6" fill="none" stroke="${TOKENS.fish}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`
  );
}

/** The first-load Phase 2d.1 symbols, as sprite markup (art/sprite.ts adds it to the one sprite): the tickers' art. */
export function helperArtSymbols(): string {
  return [
    sym('art-paw-cap', '0 0 30 31', pawCap()),
    sym(
      'art-bolt',
      '0 0 24 24',
      `<path d="M14.8 1.2 4.6 13.4h6.3L8.4 22.8 19.6 9.4h-6.4Z" fill="${TOKENS.gold}" stroke="${TOKENS.gold}" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<path d="M13.2 9.4h6.4L8.4 22.8l2.5-9.4Z" fill="${TOKENS.fish}"/><path d="M13.4 4 7.6 11.5h1.1Z" fill="#FFE9A6"/>`,
    ),
    sym('art-star', '0 0 24 24', star5()),
  ].join('');
}
