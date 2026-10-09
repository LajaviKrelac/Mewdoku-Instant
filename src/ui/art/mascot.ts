// Owner: A (Phase 2b; was ui-board)
// The ginger loaf cat's full-body poses that the FIRST screen needs (02 §17.3): the home mascot
// (idle, blinking) and the boot splash (sleeping). The shared body parts live here too; the other
// poses (win, fail, daily, tutorial) are in illustrations.ts, which only the lazy overlays use
// (04 §9 first-load budget). Drawn on a 200-unit grid around the board head (art/cat-parts.ts).
import { CAT, catBlink, catHead, type CatEars, type CatEyes, type CatMouth } from './cat-parts';
import { TOKENS } from './palette';

export type MascotKind = 'home' | 'boot';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const W = 3.4; // outline width on the 200 grid
export const INK = CAT.ink;

export const ol = (w = W): string => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** A thick outlined stroke (ink under fur), for tails and arms. */
export function tube(d: string, width: number, fill: string = CAT.fur): string {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width + 2 * W}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round"/>`;
}

export const SHADOW = `<ellipse cx="100" cy="183" rx="70" ry="7" fill="${INK}" opacity=".09"/>`;
export const BODY =
  `<path d="M40 177C27 177 25 161 29 147 37 118 64 100 100 100 136 100 163 118 171 147 175 161 173 177 160 177Z" fill="${CAT.fur}" ${ol()}/>` +
  `<g fill="none" stroke="${CAT.furDark}" stroke-width="5" stroke-linecap="round">` +
  `<path d="M45 125Q53 129 55 137M37 145Q46 147 50 155M155 125Q147 129 145 137M163 145Q154 147 150 155"/></g>` +
  `<ellipse cx="100" cy="146" rx="26" ry="20" fill="${CAT.muzzle}"/>`;
export const PAWS =
  `<ellipse cx="82" cy="172" rx="14" ry="8.5" fill="${CAT.muzzle}" ${ol(3)}/><ellipse cx="118" cy="172" rx="14" ry="8.5" fill="${CAT.muzzle}" ${ol(3)}/>` +
  `<path d="M78 170.5V174M86 170.5V174M114 170.5V174M122 170.5V174" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>`;
export const TAIL = tube('M150 158C176 160 190 142 186 120 184 108 174 105 171 113', 11);

export interface HeadOpts {
  eyes: CatEyes;
  mouth: CatMouth;
  ears?: CatEars;
  /** Extra markup on the head's 100 grid (hats, bandages). */
  extra?: string;
  tx?: number;
  ty?: number;
  rot?: number;
  blink?: boolean;
}

/** The board head, scaled ×1.3 onto the 200 grid (chibi proportions) and centred over the body. */
export function head(o: HeadOpts): string {
  const s = 1.3;
  const tx = o.tx ?? 100 - 50 * s;
  const ty = o.ty ?? 8;
  const stroke = W / s;
  const blink = o.blink ? `<g class="illus__blink">${catBlink(stroke)}</g>` : '';
  return (
    `<g transform="translate(${tx} ${ty}) rotate(${o.rot ?? 0} 50 60) scale(${s})">` +
    catHead({ eyes: o.eyes, mouth: o.mouth, ears: o.ears ?? 'up', stroke }) +
    blink +
    (o.extra ?? '') +
    '</g>'
  );
}

const zz = (x: number, y: number, s: number, cls: string): string =>
  `<path class="illus__z ${cls}" d="M${x} ${y}h${s}l-${s} ${s * 1.2}h${s}" fill="none" stroke="${TOKENS['ink-2']}" stroke-width="${2.6 + s / 10}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The standard pose: shadow, body, paws, tail and the given head, plus extra markup on top. */
export function basePose(headMarkup: string, extra = ''): string {
  return `${SHADOW}<g class="illus__body">${TAIL}${BODY}${PAWS}${headMarkup}</g>${extra}`;
}

/** An inline SVG for a pose; decorative (aria-hidden) unless `label` is given. */
export function poseSvg(kind: string, markup: string, viewBox: string, opts?: { label?: string; class?: string }): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `illus illus--${kind}${opts?.class ? ` ${opts.class}` : ''}`);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('focusable', 'false');
  if (opts?.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.innerHTML = markup;
  return svg;
}

/** Markup of the home (idle, blinking) and boot (sleeping) poses. */
export function mascotMarkup(kind: MascotKind): string {
  if (kind === 'home') return basePose(head({ eyes: 'open', mouth: 'smile', blink: true }));
  return (
    `${SHADOW}<g class="illus__body">${TAIL}${BODY}${PAWS}` +
    head({ eyes: 'sleep', mouth: 'smile', ty: 20, rot: -8 }) +
    `</g>${zz(140, 40, 12, 'illus__z--1')}${zz(160, 18, 16, 'illus__z--2')}`
  );
}

/** The home mascot or the boot splash cat (same output as illustration('home' | 'boot')). */
export function mascotIllustration(kind: MascotKind, opts?: { label?: string; class?: string }): SVGSVGElement {
  return poseSvg(kind, mascotMarkup(kind), '0 0 200 192', opts);
}
