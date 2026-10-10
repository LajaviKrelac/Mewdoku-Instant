// Owner: G3 (Phase 2d.1)
// The completion label (helpers-spec §4.3, D-2d1-6): our word "Done!" (fx.done; the original's word is
// never used) in the display face with a lemon-to-gold vertical gradient and a dark-brown outline that
// is a little heavier at the bottom, popping under the last changed tile of a finished row, column or
// colour, then fading. One label per anchor tile (units with the same anchor share it); centred 0.82
// pitch below the anchor's centre and clamped 2 px inside the viewport; a label that would overlap one
// the same action already placed is left out (audit A-1); above the tiles, X's and shards, never
// clipped by the board. aria-hidden (the action's announcement says it).
// Reduced motion: it fades in and out in place (150 ms each, the same hold), no scale.
// Lazy fx chunk (fx/celebrate.ts). Class: .game-fx > svg.fx-done-label[data-anchor].
import { cfg, type GameConfig } from '../../app/config';
import { t } from '../../i18n';
import { fxText, keyed, SVG_NS, type FxLoop } from './fx-loop';
import { clampCenterX } from './points-flight';

/** Below the anchor's centre, in pitches (34.7 px at pitch 42.1; 0.83 in v2). */
export const LABEL_DROP = 0.82;
/** Glyph height 17.7 s → our display face at 24.5 s px. */
export const LABEL_FONT = 24.5;
/** The outline: 4.4 s stroke under the fill (2.2 s outside it). */
export const LABEL_STROKE = 4.4;
/** The label keeps this far inside the viewport (both measured labels: 2.3 px from the edge). */
export const LABEL_MARGIN = 2;
/** The label's box height at s = 1 (≈ 67 × 21.4 s for six glyphs, §4.3); its width is measured. */
export const LABEL_BOX_H = 21.4;
/** The pop's peak scale (SCALE below): two labels must not touch even then. */
const LABEL_PEAK = 1.07;

const SCALE: readonly (readonly [number, number])[] = [
  [0, 0.78],
  [83, 1.07],
  [170, 1],
];

/** The label's scale and opacity at t ms (labelMs total: in 60 ms, back-out pop, hold, linear fade from 560). */
export function labelAt(t: number, reduced: boolean, c: GameConfig = cfg): { readonly scale: number; readonly opacity: number } {
  const end = c.fx.unitDone.labelMs;
  const fadeFrom = end - 160;
  if (reduced) {
    const f = c.fx.reducedMotionFadeMs;
    return { scale: 1, opacity: keyed([[0, 0], [f, 1], [end - f, 1], [end, 0]], t) };
  }
  return { scale: keyed(SCALE, t), opacity: keyed([[0, 0.3], [60, 1], [fadeFrom, 1], [end, 0]], t) };
}

/** The label's centre for an anchor tile. */
export function labelCenter(tile: { left: number; top: number; width: number; height: number }, pitch: number): { x: number; y: number } {
  return { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2 + LABEL_DROP * pitch };
}

export interface DoneLabelFx {
  readonly loop: FxLoop;
  readonly layer: HTMLElement;
  /** Distinct anchor cells with their tile rects. */
  readonly anchors: readonly { readonly cell: number; readonly tile: DOMRect }[];
  readonly pitch: number;
  readonly s: number;
  readonly reduced: boolean;
}

let gradId = 0;
const px = (v: number): string => `${Math.round(v * 100) / 100}px`;

/**
 * Two label boxes (centre, half width) of one action overlap at the pop's peak. Audit A-1: a colour lying
 * inside one row, completed with that row, has its anchor next to the row's, so two labels about 67 s wide
 * sat 1 pitch apart and garbled each other ("Donē!one!").
 */
export function labelsOverlap(a: { x: number; y: number; half: number }, b: { x: number; y: number; half: number }, s: number): boolean {
  return Math.abs(a.x - b.x) < (a.half + b.half) * LABEL_PEAK && Math.abs(a.y - b.y) < LABEL_BOX_H * s * LABEL_PEAK;
}

/**
 * One label per anchor tile, in the units' order (rows, columns, regions; §4.1). A label whose box would
 * overlap one already placed by the same action is left out: the one placed first says "Done!" for both
 * (audit A-1; the recordings only showed far-apart labels).
 */
export function playDoneLabels(o: DoneLabelFx): void {
  const doc = o.layer.ownerDocument;
  const vw = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
  const s = o.s;
  const word = t('fx.done');
  const seen = new Set<number>();
  const placed: { x: number; y: number; half: number }[] = [];
  for (const a of o.anchors) {
    if (seen.has(a.cell)) continue;
    seen.add(a.cell);
    gradId += 1;
    const id = `fx-done-g${gradId}`;
    const { svg, text } = fxText(doc, 'fx-done-label', word, {
      'text-anchor': 'middle',
      y: String(Math.round(LABEL_FONT * s * 0.36 * 100) / 100),
      'font-size': String(LABEL_FONT * s),
      'stroke-width': String(LABEL_STROKE * s),
      'stroke-linejoin': 'round',
      'paint-order': 'stroke',
      fill: `url(#${id})`,
      style: 'stroke:var(--done-line);font-family:var(--font-display);font-weight:var(--display-weight)',
    });
    const defs = doc.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--done-top)"/><stop offset="1" style="stop-color:var(--done-bottom)"/></linearGradient>`;
    svg.insertBefore(defs, text);
    svg.dataset.anchor = String(a.cell);
    // The heavier bottom of the outline: a 1 s drop of the same brown; then a soft warm-grey shadow ≈ 4 px
    // under it (audit B10, measured under the column-8 label: #E1CBC3 → #E9DDD8 → #EDE7E3 → #F2ECEA → the page).
    svg.style.filter = `drop-shadow(0 ${px(s)} 0 var(--done-line)) drop-shadow(0 ${px(2 * s)} ${px(2 * s)} rgba(150, 90, 70, 0.5))`;
    svg.style.zIndex = '5';
    svg.style.opacity = '0';
    o.layer.appendChild(svg);
    let half = 0;
    try {
      half = text.getBBox().width / 2 + (LABEL_STROKE * s) / 2;
    } catch {
      half = (word.length * LABEL_FONT * s * 0.6) / 2;
    }
    const c = labelCenter(a.tile, o.pitch);
    const x = clampCenterX(c.x, half, vw, LABEL_MARGIN);
    const box = { x, y: c.y, half };
    if (placed.some((p) => labelsOverlap(p, box, s))) {
      svg.remove();
      continue;
    }
    placed.push(box);
    o.loop.add({
      delay: 0,
      dur: cfg.fx.unitDone.labelMs,
      frame: (ms) => {
        const v = labelAt(ms, o.reduced);
        svg.style.transform = `translate(${px(x)},${px(c.y)}) scale(${Math.round(v.scale * 1000) / 1000})`;
        svg.style.opacity = String(Math.round(v.opacity * 1000) / 1000);
      },
      end: () => svg.remove(),
    });
  }
}
