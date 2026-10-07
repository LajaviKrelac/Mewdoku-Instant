// Owner: ui-shell
// O8 tutorial coach (02 §5 O8, §11.5): dims everything except the focus, pulsing outline, animated
// hand, text card (+ "Got it" in step 2). NON-modal: the board stays interactive under it.
// The root ignores pointer events (only the card takes them); the dimmer is an SVG mask with one
// rounded hole per target rect. Cell outlines come from the board's coach highlight; the coach draws
// its own pulsing ring only around a non-cell target (the bulb, step 5).
//
// Classes: .coach[data-step][data-hand] > .coach__dim .coach__ring .coach__hand .coach__card
//          .coach__text .coach__gotit
import { tutorialStep, type CoachHand, type TutorialStepIndex } from '../../game/tutorial';
import { colorName, t, translate, TUTORIAL_STEP_KEYS } from '../../i18n';
import { clear, h, s, type OverlayView } from '../dom';
import { makeButton, nextId } from './overlay-base';

export interface CoachProps {
  readonly step: TutorialStepIndex;
  readonly hand: CoachHand;
  readonly showGotIt: boolean;
  /** Palette index for {color} in the step text (step 1: Lavender), or null. */
  readonly colorParam: number | null;
  /** Client rects of the focus targets (cells or the bulb); re-read on resize. */
  targetRects(): readonly DOMRect[];
  onGotIt(): void;
}

/** Hole padding around a target and its corner radius (CSS px). */
const HOLE_PAD = 4;
const HOLE_RADIUS = 10;
/** Extra spotlight radius around a round target (the bulb) so its count / "Free" badge is lit too. */
const SPOT_EXTRA = 18;
/** Distance kept between the card and the targets / screen edges. */
const CARD_GAP = 16;
const EDGE = 12;
/** Fingertip position inside the 48×48 hand drawing. */
const TIP_X = 13;
const TIP_Y = 4;
const HAND_SIZE = 48;
/** How far the tap keyframes move the hand down (mw-hand-tap / mw-hand-double: 12 px), plus a margin. */
const HAND_TRAVEL = 16;

export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The step's coach sentence, with {color} filled in. */
export function coachText(step: TutorialStepIndex, colorParam: number | null): string {
  const key = TUTORIAL_STEP_KEYS[step - 1] ?? 'tutorial.step1';
  return translate(key, colorParam === null ? {} : { color: colorName(colorParam) });
}

/**
 * Card top (CSS px): bottom of the screen by default (over the tool row, like the wireframe); above
 * the targets when that would cover one; below them when there is no room above.
 */
export function placeCard(targets: readonly RectLike[], cardH: number, vh: number): number {
  const bottomTop = vh - EDGE - cardH;
  if (targets.length === 0) return bottomTop;
  const top = Math.min(...targets.map((r) => r.top));
  const bottom = Math.max(...targets.map((r) => r.bottom));
  if (bottom + CARD_GAP <= bottomTop) return bottomTop;
  const above = top - CARD_GAP - cardH;
  if (above >= EDGE) return above;
  return Math.min(bottom + CARD_GAP, bottomTop);
}

/** Our own pointing hand (48×48, fingertip at TIP_X, TIP_Y). */
function handArt(): SVGSVGElement {
  const line = { fill: 'var(--card)', stroke: 'var(--ink)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' };
  return s(
    'svg',
    { viewBox: '0 0 48 48', width: 48, height: 48, 'aria-hidden': 'true', focusable: 'false' },
    s('rect', { x: 23, y: 18, width: 7, height: 13, rx: 3.5, ...line }),
    s('rect', { x: 29, y: 20, width: 7, height: 12, rx: 3.5, ...line }),
    s('rect', { x: 35, y: 23, width: 6, height: 11, rx: 3, ...line }),
    s('path', { d: 'M9.5 7a3.5 3.5 0 0 1 7 0v20l3-2a4 4 0 0 1 4 6l-1 1h17v6a10 10 0 0 1-10 10h-6a12 12 0 0 1-11-8l-3-8z', ...line }),
  );
}

export function createCoach(): OverlayView<CoachProps> {
  let props: CoachProps | null = null;
  let raf = 0;
  const maskId = nextId('coach-mask');

  const holes = s('g');
  const dim = s(
    'svg',
    { class: 'coach__dim', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', null, s('mask', { id: maskId }, s('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: 'white' }), holes)),
    s('rect', { x: 0, y: 0, width: '100%', height: '100%', class: 'coach__dim-fill', mask: `url(#${maskId})` }),
  );
  const rings = h('div', { class: 'coach__rings', 'aria-hidden': 'true' });
  const hand = h('div', { class: 'coach__hand', 'aria-hidden': 'true' }, handArt());
  const text = h('p', { class: 'coach__text' });
  const gotIt = makeButton({ variant: 'primary', label: t('tutorial.gotIt'), className: 'coach__gotit', onPress: () => props?.onGotIt() });
  const card = h('div', { class: 'coach__card', role: 'note', 'aria-live': 'polite' }, text, gotIt);
  const el = h('div', { class: 'coach', hidden: true }, dim, rings, hand, card);

  const layout = (): void => {
    if (!props || el.hidden) return;
    const rects = props.targetRects();
    const vh = el.ownerDocument.defaultView?.innerHeight ?? 0;
    // The bulb is a round button: a round spotlight; cells get rounded squares.
    const round = tutorialStep(props.step).target === 'bulb';
    clear(holes);
    for (const r of rects) {
      if (round) {
        // A circle around the button, wide enough for the badge on its top-right corner.
        const rad = Math.min(r.width, r.height) / 2 + HOLE_PAD + SPOT_EXTRA;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        holes.appendChild(s('rect', { x: cx - rad, y: cy - rad, width: 2 * rad, height: 2 * rad, rx: rad, fill: 'black' }));
        continue;
      }
      const w = r.width + 2 * HOLE_PAD;
      const hh = r.height + 2 * HOLE_PAD;
      holes.appendChild(s('rect', { x: r.left - HOLE_PAD, y: r.top - HOLE_PAD, width: w, height: hh, rx: HOLE_RADIUS, fill: 'black' }));
    }
    clear(rings);
    if (round) {
      // The pulsing ring follows the spotlight's edge, so it never crosses the button's badge.
      for (const r of rects) {
        const rad = Math.min(r.width, r.height) / 2 + HOLE_PAD + SPOT_EXTRA;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        rings.appendChild(
          h('div', { class: 'coach__ring', style: { left: `${cx - rad}px`, top: `${cy - rad}px`, width: `${2 * rad}px`, height: `${2 * rad}px` } }),
        );
      }
    }
    const first = rects[0];
    const last = rects[rects.length - 1];
    hand.hidden = props.hand === 'none' || !first;
    if (first && last) {
      const cx = first.left + first.width / 2;
      const cy = first.top + first.height / 2;
      hand.style.left = `${cx - TIP_X}px`;
      // Near the bottom edge (the bulb, step 5) the fingertip moves up inside the target so the
      // whole hand, and its tap motion, stays on screen.
      const lowest = vh > 0 ? vh - HAND_SIZE - HAND_TRAVEL : Infinity;
      hand.style.top = `${Math.max(first.top - TIP_Y, Math.min(cy - TIP_Y, lowest))}px`;
      hand.style.setProperty('--dx', `${last.left + last.width / 2 - cx}px`);
      hand.style.setProperty('--dy', `${last.top + last.height / 2 - cy}px`);
    }
    // A round target keeps the card clear of its whole spotlight, not just of the button.
    const avoid = round
      ? rects.map((r) => {
          const rad = Math.min(r.width, r.height) / 2 + HOLE_PAD + SPOT_EXTRA;
          const cy = r.top + r.height / 2;
          return { left: r.left, right: r.right, top: cy - rad, bottom: cy + rad };
        })
      : rects;
    card.style.top = `${placeCard(avoid, card.offsetHeight, vh)}px`;
  };

  const schedule = (): void => {
    const win = el.ownerDocument.defaultView;
    if (!win || typeof win.requestAnimationFrame !== 'function') return;
    win.cancelAnimationFrame(raf);
    raf = win.requestAnimationFrame(layout);
  };

  const onResize = (): void => layout();
  let listening = false;
  const listen = (on: boolean): void => {
    const win = el.ownerDocument.defaultView;
    if (!win || listening === on) return;
    listening = on;
    if (on) {
      win.addEventListener('resize', onResize);
      win.visualViewport?.addEventListener('resize', onResize);
    } else {
      win.removeEventListener('resize', onResize);
      win.visualViewport?.removeEventListener('resize', onResize);
    }
  };

  const render = (p: CoachProps): void => {
    const stepChanged = props?.step !== p.step;
    props = p;
    el.dataset.step = String(p.step);
    el.dataset.hand = p.hand;
    text.textContent = coachText(p.step, p.colorParam);
    gotIt.hidden = !p.showGotIt;
    layout();
    schedule();
    // Step 2 locks the board: move keyboard focus to "Got it" (02 §11.5, §18).
    if (p.showGotIt && stepChanged && !card.contains(el.ownerDocument.activeElement)) gotIt.focus();
  };

  return {
    el,
    modal: false,
    open(p) {
      el.hidden = false;
      props = null;
      listen(true);
      render(p);
    },
    update(p) {
      render(p);
    },
    close() {
      el.hidden = true;
      listen(false);
    },
    dismiss: () => false,
    destroy() {
      listen(false);
      el.ownerDocument.defaultView?.cancelAnimationFrame(raf);
      props = null;
      el.remove();
    },
  };
}
