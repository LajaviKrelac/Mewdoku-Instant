// Owner: A (Phase 2b; was ui-board)
// Tux's full-body poses that the FIRST screen needs (phase2b §1.6): the Home mascot (sitting upright,
// front paws together in white socks, tail curled right with its white tip, head tilted 4°) and the
// boot splash (curled asleep, nose under the tail). The shared body parts live here too; the other
// poses (win, fail, daily, tutorial) are in illustrations.ts, which only the lazy overlays use (04 §9
// first-load budget). Drawn by hand on a 200-unit grid around the board head (art/cat-parts.ts).
// Home idle loop (phase2b §2.9): breathing (.illus__body, fx.css) and blink (.illus__blink) as in
// Phase 2; the tail sways (.pose__tail) and the head tilts ±3° every fx.mascotHeadTilt{Min,Max}Ms
// (.pose__head; the timer below adds .is-tilt-l / .is-tilt-r, art.css plays the tilt). Reduced motion:
// static, eyes open.
import { cfg, type GameConfig } from '../../app/config';
import { CAT, catBlink, catHead, type CatEars, type CatEyes, type CatMouth } from './cat-parts';
import { TOKENS } from './palette';

export type MascotKind = 'home' | 'boot';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const W = 3.4; // outline width on the 200 grid
export const INK = CAT.ink;

export const ol = (w = W): string => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** A thick outlined stroke (outline under fill), for tails, legs and arms. */
export function tube(d: string, width: number, fill: string = CAT.fur): string {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width + 2 * W}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round"/>`;
}

/**
 * A two-part tail: `base` in fur and `tip` (continuing from the end of `base`) in white, under one
 * shared outline, so the white tip reads as part of the same tail.
 */
export function tail(base: string, tip: string, width: number): string {
  const outlineW = width + 2 * W;
  return (
    `<path d="${base}" fill="none" stroke="${INK}" stroke-width="${outlineW}" stroke-linecap="round"/>` +
    `<path d="${tip}" fill="none" stroke="${INK}" stroke-width="${outlineW}" stroke-linecap="round"/>` +
    `<path d="${base}" fill="none" stroke="${CAT.fur}" stroke-width="${width}" stroke-linecap="round"/>` +
    `<path d="${tip}" fill="none" stroke="${CAT.mask}" stroke-width="${width}" stroke-linecap="round"/>`
  );
}

/** A white-socked paw seen from the front, centred at (cx, cy), with toe lines. */
export function sockPaw(cx: number, cy: number, rx = 11, ry = 7.4, rot = 0): string {
  const toes = [-0.36, 0, 0.36].map((f) => `M${(cx + f * rx).toFixed(1)} ${(cy - ry * 0.25).toFixed(1)}v${(ry * 0.5).toFixed(1)}`).join('');
  return (
    `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${CAT.mask}" ${ol(3)}/>` +
    `<path d="${toes}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".45"/></g>`
  );
}

export const SHADOW = `<ellipse cx="100" cy="184" rx="66" ry="7" fill="${INK}" opacity=".1"/>`;

/** Sitting body: a soft bell from the neck to the haunches, with haunch sheen and the white bib. */
export const BODY =
  `<path d="M70 110C54 121 40 139 38 157C36 172 46 180 62 180H138C154 180 164 172 162 157C160 139 146 121 130 110Z" fill="${CAT.fur}" ${ol()}/>` +
  `<path d="M49 160C51 145 62 137 74 141M151 160C149 145 138 137 126 141" fill="none" stroke="${CAT.sheen}" stroke-width="5" stroke-linecap="round"/>` +
  `<path d="M100 114C113.6 114 123 122 123 134C123 147 112.6 156 100 162C87.4 156 77 147 77 134C77 122 86.4 114 100 114Z" fill="${CAT.mask}"/>`;

/** One dark front leg ending in a white sock with a rounded paw (x = leg centre). */
export function sockLeg(x: number, top = 140, bottom = 179): string {
  const sock = bottom - 20;
  return (
    `<rect x="${x - 9}" y="${top}" width="18" height="${bottom - top - 6}" rx="9" fill="${CAT.fur}" ${ol(3)}/>` +
    `<path d="M${x - 9} ${sock}H${x + 9}V${bottom - 9}C${x + 12.4} ${bottom - 8} ${x + 12.6} ${bottom} ${x + 6} ${bottom}H${x - 6}C${x - 12.6} ${bottom} ${x - 12.4} ${bottom - 8} ${x - 9} ${bottom - 9}Z" fill="${CAT.mask}" ${ol(3)}/>` +
    `<path d="M${x - 3.6} ${bottom - 5}v4M${x + 3.6} ${bottom - 5}v4" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>`
  );
}

/** Front paws together (white socks). */
export const PAWS = sockLeg(89.5) + sockLeg(110.5);

/** Tail curled to the right, ending in a white tip. */
export const TAIL = tail('M150 169C172 175 191 162 191.6 140C192.2 126 186 114 176 111', 'M176 111C168.4 108.8 162.6 113.4 163 120.4', 13);

export interface HeadOpts {
  eyes: CatEyes;
  mouth: CatMouth;
  ears?: CatEars;
  blush?: boolean;
  /** Extra markup on the head's 100 grid (accessories, a paw over the eyes). */
  extra?: string;
  tx?: number;
  ty?: number;
  rot?: number;
  /** Head scale onto the 200 grid (default 1.3: chibi proportions). */
  scale?: number;
  blink?: boolean;
  /** Wrap in .pose__head (the Home idle tilt). */
  tiltable?: boolean;
}

/** The board head, scaled ×1.3 onto the 200 grid (chibi proportions) and centred over the body. */
export function head(o: HeadOpts): string {
  const s = o.scale ?? 1.3;
  const tx = o.tx ?? 100 - 50 * s;
  const ty = o.ty ?? 6;
  const stroke = W / s;
  const blink = o.blink ? `<g class="illus__blink">${catBlink(stroke)}</g>` : '';
  const inner =
    `<g transform="translate(${tx} ${ty}) rotate(${o.rot ?? 0} 50 60) scale(${s})">` +
    catHead({ eyes: o.eyes, mouth: o.mouth, ears: o.ears ?? 'up', stroke, blush: o.blush }) +
    blink +
    (o.extra ?? '') +
    '</g>';
  return o.tiltable ? `<g class="pose__head">${inner}</g>` : inner;
}

const zz = (x: number, y: number, s: number, cls: string): string =>
  `<path class="illus__z ${cls}" d="M${x} ${y}h${s}l-${s} ${s * 1.2}h${s}" fill="none" stroke="${TOKENS['ink-2']}" stroke-width="${2.6 + s / 10}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The standard sitting pose: shadow, tail (its own group), body, paws and the given head, plus extras. */
export function basePose(headMarkup: string, extra = '', paws: string = PAWS): string {
  return `${SHADOW}<g class="illus__body"><g class="pose__tail">${TAIL}</g>${BODY}${paws}${headMarkup}</g>${extra}`;
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

/** Curled asleep: a round loaf, the head resting low on the left, the tail wrapped over the nose. */
function bootMarkup(): string {
  const body =
    `<path d="M34 178C18 178 14 160 24 144C38 122 66 110 104 110C142 110 168 124 178 146C186 164 180 178 164 178Z" fill="${CAT.fur}" ${ol()}/>` +
    `<path d="M128 124C146 128 162 140 166 156" fill="none" stroke="${CAT.sheen}" stroke-width="5" stroke-linecap="round"/>`;
  const paw = sockPaw(118, 172, 12, 7);
  const sleepyHead = head({ eyes: 'sleep', mouth: 'smile', tx: 14, ty: 54, rot: -10, scale: 1.16 });
  const wrap = tail('M174 158C172 178 146 186 112 184C94 183 82 178 76 170', 'M76 170C68 162 66 148 71 137', 15);
  return `${SHADOW}<g class="illus__body">${body}${paw}${sleepyHead}${wrap}</g>${zz(140, 40, 12, 'illus__z--1')}${zz(160, 18, 16, 'illus__z--2')}`;
}

/** Markup of the home (sitting, idle) and boot (curled asleep) poses. */
export function mascotMarkup(kind: MascotKind): string {
  if (kind === 'home') return basePose(head({ eyes: 'open', mouth: 'smile', blink: true, rot: 4, tiltable: true }));
  return bootMarkup();
}

/**
 * Home head tilt (phase2b §2.9): every fx.mascotHeadTiltMinMs–MaxMs the head tilts to one side and
 * back (alternating sides; the keyframes in art.css). Stops for good once the SVG has left the
 * document. The CSS keeps it static under reduced motion.
 */
export function startHeadTilt(svg: SVGSVGElement, c: GameConfig = cfg, random: () => number = Math.random): () => void {
  const target = svg.querySelector('.pose__head');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let side = 1;
  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  if (!target) return stop;
  const clear = (): void => target.classList.remove('is-tilt-l', 'is-tilt-r');
  target.addEventListener('animationend', clear);
  const schedule = (): void => {
    const { mascotHeadTiltMinMs: min, mascotHeadTiltMaxMs: max } = c.fx;
    timer = setTimeout(tick, min + random() * Math.max(0, max - min));
  };
  const tick = (): void => {
    timer = null;
    if (!svg.isConnected) return;
    side = -side;
    clear();
    void target.getBoundingClientRect(); // restart the animation even if the same class comes back
    target.classList.add(side < 0 ? 'is-tilt-l' : 'is-tilt-r');
    schedule();
  };
  schedule();
  return stop;
}

/** The home mascot or the boot splash cat (same output as illustration('home' | 'boot')). */
export function mascotIllustration(kind: MascotKind, opts?: { label?: string; class?: string }): SVGSVGElement {
  const svg = poseSvg(kind, mascotMarkup(kind), '0 0 200 192', opts);
  if (kind === 'home') startHeadTilt(svg);
  return svg;
}
