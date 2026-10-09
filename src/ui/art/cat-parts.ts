// Owner: A (Phase 2b; was ui-board)
// Tux, our own tuxedo-style cat (phase2b §1.6), drawn by hand as SVG path data on a 100-unit grid from
// the written brief only (no reference images): a wide, soft "bun" head, rounded ears tilted 12°
// outward, light-green irises, a pink nose and a small "w" mouth. Signature marks: the LEFT ear has a
// small rounded notch near its tip, and the white blaze is asymmetric — on the RIGHT it sweeps up
// around the eye to the eyebrow. Expression lines on the dark fur are light (ink vanishes on black);
// on the white mask they are ink. No tears in any mood (06 §3).
// Shared by the sprite symbols (art/sprite.ts) and the larger poses (art/mascot.ts, illustrations.ts).
import { CAT_COLORS } from './palette';

export const CAT = Object.freeze({
  fur: CAT_COLORS.fur,
  sheen: CAT_COLORS.sheen,
  mask: CAT_COLORS.mask,
  earIn: CAT_COLORS.earIn,
  nose: CAT_COLORS.nose,
  blush: CAT_COLORS.blush,
  mouth: CAT_COLORS.mouth,
  line: CAT_COLORS.line,
  iris: CAT_COLORS.iris,
  pupil: CAT_COLORS.pupil,
  /** The outline (2 px non-scaling on the board, 3.4 units on the 200 grid). */
  ink: CAT_COLORS.outline,
});

export type CatEyes = 'open' | 'happy' | 'sad' | 'round' | 'closed' | 'sleep' | 'wink';
export type CatMouth = 'smile' | 'open' | 'frown' | 'o' | 'sheepish';
/** up (idle), happy (4° further out), prick (3 units taller), droop (25° down), back (flattened). */
export type CatEars = 'up' | 'happy' | 'prick' | 'droop' | 'back';

/** How outlines are drawn: `fixed` = 2 CSS px at any size (board symbols); a number = user units. */
export type Stroke = 'fixed' | number;

const r1 = (v: number): string => String(Math.round(v * 100) / 100);

function outline(stroke: Stroke, scale = 1): string {
  return stroke === 'fixed'
    ? `stroke="${CAT.ink}" stroke-width="${2 * scale}" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"`
    : `stroke="${CAT.ink}" stroke-width="${r1(stroke * scale)}" stroke-linejoin="round" stroke-linecap="round"`;
}

/** Width attributes for an expression line: `px` CSS px on the board, `units` × outline otherwise. */
function lineW(stroke: Stroke, px: number, units: number): string {
  return stroke === 'fixed' ? `stroke-width="${px}" vector-effect="non-scaling-stroke"` : `stroke-width="${r1(stroke * units)}"`;
}

/** The head: a wide, soft bun, x 10–90, y 28–88, flat on top, cheeks widest just below the eye line. */
export const HEAD_PATH =
  'M50 28C64.5 28 78.6 28.8 84.6 36C88.6 41 89.6 49 90 57.5C90.8 74.5 77.5 88 50 88C22.5 88 9.2 74.5 10 57.5C10.4 49 11.4 41 15.4 36C21.4 28.8 35.5 28 50 28Z';

/**
 * The white blaze: an inverted V from between the eyes (y 39.5) to the whisker pads (x 31–69 around
 * y 70) and the chin (y 86.8). Asymmetric: on the right it sweeps around the eye up to the eyebrow.
 */
export const MASK_PATH =
  'M50 39.5C47.6 44 45.4 50 44.6 55C43.9 59.4 42.6 61.6 40.4 63.6C34.6 64 31 67.6 31 72C31 76.6 34.4 79 37.6 79.4' +
  'C39.4 83.8 44.2 86.8 50 86.8C55.8 86.8 60.6 83.8 62.4 79.4C65.6 79 69 76.6 69 72C69 69.6 68.2 67.4 66.6 66' +
  'C71.6 64.6 75.6 60.4 75.6 54.4C75.6 47.6 72 42.4 66 41.4C61 40.6 55.4 38.6 50 39.5Z';

/** Eye centres (phase2b §1.6). The right eye sits on the white patch. */
const EYE_L = { x: 36, y: 54 };
const EYE_R = { x: 64, y: 54 };

/** Line colour on each side's skin: light on the fur (left eye), ink on the white patch (right eye). */
const ON_FUR = CAT.line;
const ON_MASK = CAT.ink;

/**
 * One ear in local coordinates: base centred on the origin (26 wide, extended 4 below it so it tucks
 * into the head), straight sides toward a point 3 above the apex, and a round tip whose control point
 * is that point (so the tip meets the sides smoothly and peaks at about (0, −h)). With `notch`, the
 * outer (left) edge has a small nick with a rounded bottom, about 3 units deep, near the tip — Tux's
 * notched-ear signature.
 */
export function earOuterPath(h: number, notch: boolean): string {
  const half = 13;
  const vy = -(h + 3); // the sides' meeting point (control point of the round tip)
  const at = (t: number): [number, number] => [-half + half * t, vy * t];
  const [ax, ay] = at(-4 / -vy); // extend the sides 4 under the base
  const [tx, ty] = at(0.72);
  let left = '';
  if (notch) {
    // a small V nick with a rounded bottom, cut 3.2 units into the edge (toward the inside of the ear)
    const len = Math.hypot(half, vy);
    const chord = 7.6;
    const t1 = 0.4;
    const tm = t1 + chord / 2 / len;
    const [n1x, n1y] = at(t1);
    const [n2x, n2y] = at(t1 + chord / len);
    const [mx, my] = at(tm);
    const nx = -vy / len; // inward normal of the left edge
    const ny = half / len;
    const bx = mx + nx * 3.2;
    const by = my + ny * 3.2;
    left = `L${r1(n1x)} ${r1(n1y)}L${r1(bx - (bx - n1x) * 0.22)} ${r1(by - (by - n1y) * 0.22)}Q${r1(bx)} ${r1(by)} ${r1(bx - (bx - n2x) * 0.22)} ${r1(by - (by - n2y) * 0.22)}L${r1(n2x)} ${r1(n2y)}`;
  }
  return `M${r1(ax)} ${r1(ay)}${left}L${r1(tx)} ${r1(ty)}Q0 ${r1(vy)} ${r1(-tx)} ${r1(ty)}L${r1(-ax)} ${r1(ay)}Z`;
}

/** The pink inner ear, scaled with the ear height. */
function earInnerPath(h: number): string {
  const vy = -18.6 * (h / 24);
  const t = 0.7;
  const x = 8.4 * (1 - t);
  const y = 2.4 + (vy - 2.4) * t;
  return `M-8.4 2.4L${r1(-x)} ${r1(y)}Q0 ${r1(vy)} ${r1(x)} ${r1(y)}L8.4 2.4Q0 4.6 -8.4 2.4Z`;
}

interface EarPose {
  readonly h: number;
  readonly rot: number; // outward tilt in degrees
  readonly x: number; // base centre, left ear (the right ear mirrors it)
  readonly y: number;
}

const EAR_POSES: Readonly<Record<CatEars, EarPose>> = {
  up: { h: 24, rot: 12, x: 27, y: 33.4 },
  happy: { h: 24, rot: 16, x: 27, y: 33.4 },
  prick: { h: 27, rot: 12, x: 27, y: 33.4 },
  droop: { h: 23, rot: 37, x: 25, y: 37.5 },
  back: { h: 21, rot: 62, x: 22, y: 41.5 },
};

/** One ear (`side` l = notched, r = plain), positioned on the head grid. */
export function catEar(kind: CatEars, side: 'l' | 'r', stroke: Stroke, attrs = ''): string {
  const p = EAR_POSES[kind];
  const x = side === 'l' ? p.x : 100 - p.x;
  const rot = side === 'l' ? -p.rot : p.rot;
  return (
    `<g transform="translate(${x} ${p.y}) rotate(${rot})"${attrs}>` +
    `<path d="${earOuterPath(p.h, side === 'l')}" fill="${CAT.fur}" ${outline(stroke)}/>` +
    `<path d="${earInnerPath(p.h)}" fill="${CAT.earIn}"/></g>`
  );
}

/** Both ears. On the idle head the left ear hides while the board's ear-flick overlay shows (--flick-hide). */
export function catEars(kind: CatEars, stroke: Stroke, flickable = false): string {
  return catEar(kind, 'l', stroke, flickable ? ' style="opacity:var(--flick-hide,1)"' : '') + catEar(kind, 'r', stroke);
}

/** Head, sheen, white blaze, nose and whiskers: everything except the ears, eyes and mouth. */
export function catFace(stroke: Stroke): string {
  return (
    `<path d="${HEAD_PATH}" fill="${CAT.fur}" ${outline(stroke)}/>` +
    // a soft sheen along the flat top of the bun
    `<path d="M22.5 40.4C31 31.2 69 31.2 77.5 40.4C67.4 35.4 32.6 35.4 22.5 40.4Z" fill="${CAT.sheen}"/>` +
    `<path d="${MASK_PATH}" fill="${CAT.mask}"/>` +
    // whiskers: two per side, ink at 40 % on the mask, light at 70 % over the fur
    `<g fill="none" stroke-linecap="round" ${lineW(stroke, 1, 0.34)}>` +
    `<path d="M35.6 69.6 31.4 70.1M35.8 73.2 31.6 74.3M64.4 69.6 68.6 70.1M64.2 73.2 68.4 74.3" stroke="${ON_MASK}" stroke-opacity=".4"/>` +
    `<path d="M31.4 70.1 13.6 67.4M31.6 74.3 14.4 76.6M68.6 70.1 86.4 67.4M68.4 74.3 85.6 76.6" stroke="${ON_FUR}" stroke-opacity=".7"/></g>` +
    // rounded-triangle nose
    `<path d="M46.3 60.4Q50 58.8 53.7 60.4Q53.3 62.9 50 64.3Q46.7 62.9 46.3 60.4Z" fill="${CAT.nose}"/>`
  );
}

function arc(d: string, color: string, stroke: Stroke, px = 2.2, units = 1): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" ${lineW(stroke, px, units)}/>`;
}

/** An open eye: light iris with a thin rim (it defines the eye on the white patch), pupil, catchlight. */
function openEye(cx: number, cy: number, round: boolean): string {
  const iris = round ? `rx="7" ry="7"` : `rx="6.2" ry="7"`;
  const pupil = round ? `rx="2.7" ry="3"` : `rx="3.6" ry="5.4"`;
  return (
    `<ellipse cx="${cx}" cy="${cy}" ${iris} fill="${CAT.iris}" stroke="${CAT.ink}" stroke-width="1.3"/>` +
    `<ellipse cx="${cx + 0.3}" cy="${cy + 0.5}" ${pupil} fill="${CAT.pupil}"/>` +
    `<circle cx="${cx + 2.1}" cy="${cy - 2.5}" r="1.6" fill="${CAT.mask}"/>` +
    (round ? `<circle cx="${cx - 2.2}" cy="${cy + 2.6}" r=".8" fill="${CAT.mask}"/>` : '')
  );
}

/** Sad: the iris half covered by a lid of the surrounding skin (fur left, white right), worried brows. */
function sadEye(cx: number, cy: number, side: 'l' | 'r', stroke: Stroke): string {
  const skin = side === 'l' ? CAT.fur : CAT.mask;
  const ink = side === 'l' ? ON_FUR : ON_MASK;
  const o = side === 'l' ? -1 : 1; // outer direction
  // lid: covers the top half of the eye, its lower edge drooping toward the outer corner
  const edge = (k: number): string => `M${r1(cx + o * 6.6 * k)} ${r1(cy + 1.2 * k)}Q${cx} ${r1(cy - 0.6)} ${r1(cx - o * 6.6 * k)} ${r1(cy - 2.2 * k)}`;
  const lid = `${edge(1.15)}L${r1(cx - o * 7.8)} ${cy - 9}L${r1(cx + o * 7.8)} ${cy - 9}Z`;
  const brow = `M${cx + o * 4.8} ${cy - 10.2}Q${cx + o * 0.6} ${cy - 11.2} ${cx - o * 3.8} ${cy - 13.6}`;
  return (
    openEye(cx, cy, false) +
    `<path d="${lid}" fill="${skin}"/>` +
    arc(edge(1), ink, stroke, 1.8, 0.8) +
    arc(brow, ink, stroke, 1.8, 0.8)
  );
}

export function catEyes(kind: CatEyes, stroke: Stroke): string {
  const L = EYE_L;
  const R = EYE_R;
  switch (kind) {
    case 'open':
      return openEye(L.x, L.y, false) + openEye(R.x, R.y, false);
    case 'round':
      return openEye(L.x, L.y, true) + openEye(R.x, R.y, true);
    case 'happy':
      return arc('M30.6 56.6Q36 49.4 41.4 56.6', ON_FUR, stroke) + arc('M58.6 56.6Q64 49.4 69.4 56.6', ON_MASK, stroke);
    case 'sad':
      return sadEye(L.x, L.y, 'l', stroke) + sadEye(R.x, R.y, 'r', stroke);
    case 'closed':
      return arc('M31 55.2Q36 59 41 55.2', ON_FUR, stroke) + arc('M59 55.2Q64 59 69 55.2', ON_MASK, stroke);
    case 'sleep':
      return arc('M30.6 56Q36 60.8 41.4 56', ON_FUR, stroke) + arc('M58.6 56Q64 60.8 69.4 56', ON_MASK, stroke);
    case 'wink':
      return openEye(L.x, L.y, false) + arc('M58.6 56.6Q64 49.4 69.4 56.6', ON_MASK, stroke);
  }
}

export function catMouth(kind: CatMouth, stroke: Stroke): string {
  const line = (d: string): string =>
    `<path d="${d}" fill="none" stroke="${CAT.ink}" stroke-linecap="round" stroke-linejoin="round" ${lineW(stroke, 1.4, 0.62)}/>`;
  switch (kind) {
    case 'smile':
      return line('M50 64.2V65.9M46 66.1Q48 68.9 50 65.9Q52 68.9 54 66.1');
    case 'open':
      return (
        `<path d="M45 66.2Q50 76.4 55 66.2Q50 68.4 45 66.2Z" fill="${CAT.mouth}"/>` +
        `<ellipse cx="50" cy="71.6" rx="2.7" ry="1.9" fill="${CAT.blush}"/>` +
        line('M50 64.2V66.6')
      );
    case 'frown':
      return line('M50 64.2V66.2M46 70.2Q50 66.6 54 70.2');
    case 'o':
      return `<ellipse cx="50" cy="69.6" rx="2.4" ry="2.9" fill="${CAT.mouth}"/>` + line('M50 64.2V66.4');
    case 'sheepish':
      return line('M50 64.2V66M45.4 68.4Q47.8 69.6 50 67.6 52.4 70.2 55 67.4');
  }
}

/** Blush on the white whisker pads (happy mood). */
export function catBlush(): string {
  return (
    `<ellipse cx="37.6" cy="73.4" rx="4.4" ry="2.6" fill="${CAT.blush}" opacity=".45"/>` +
    `<ellipse cx="62.4" cy="73.4" rx="4.4" ry="2.6" fill="${CAT.blush}" opacity=".45"/>`
  );
}

/** A complete head (ears, face, eyes, mouth) as SVG markup on the 100-unit grid. */
export function catHead(opts: { eyes: CatEyes; mouth: CatMouth; ears?: CatEars; stroke?: Stroke; blush?: boolean; flickable?: boolean }): string {
  const stroke = opts.stroke ?? 'fixed';
  return (
    catEars(opts.ears ?? 'up', stroke, opts.flickable) +
    catFace(stroke) +
    (opts.blush ? catBlush() : '') +
    catEyes(opts.eyes, stroke) +
    catMouth(opts.mouth, stroke)
  );
}

/** Eyelids for the idle blink: a fur lid on the left eye, a white one on the right, plus the closed lines. */
export function catBlink(stroke: Stroke): string {
  return (
    `<ellipse cx="${EYE_L.x}" cy="${EYE_L.y}" rx="7.3" ry="8.1" fill="${CAT.fur}"/>` +
    `<ellipse cx="${EYE_R.x}" cy="${EYE_R.y}" rx="7.3" ry="8.1" fill="${CAT.mask}"/>` +
    catEyes('closed', stroke)
  );
}

/**
 * The board's ear-flick overlay (phase2b §2.9): the left (notched) ear alone, clipped to outside the
 * head so it never covers the face. B rotates the overlay's <use> 10° outward about the ear base
 * (board.css sets the pivot); while `.cell.is-flick` is on, board.css sets --flick-hide: 0 so the idle
 * head's own left ear hides under it.
 */
export function catEarFlick(stroke: Stroke): string {
  return (
    `<clipPath id="tux-ear-flick-clip"><path clip-rule="evenodd" d="M-20 -20H120V120H-20Z${HEAD_PATH}"/></clipPath>` +
    `<g clip-path="url(#tux-ear-flick-clip)">${catEar('up', 'l', stroke)}</g>`
  );
}

/** The flicking (left) ear's base centre on the head grid: the flick's rotation pivot. */
export const EAR_FLICK_PIVOT = Object.freeze({ x: EAR_POSES.up.x, y: EAR_POSES.up.y });
