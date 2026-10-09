// Owner: B (Phase 2b; was ui-shell)
// O8 tutorial coach (02 §5 O8, §11.5): dims everything except the focus, pulsing outline, animated
// hand, text card (+ "Got it" in step 2). NON-modal: the board stays interactive under it.
// The root ignores pointer events (only the card takes them); the dimmer is an SVG mask with one
// rounded hole per target rect. Cell outlines come from the board's coach highlight; the coach draws
// its own pulsing ring only around a non-cell target (the bulb, step 5).
//
// While a modal opens above it (the hint card in step 5, Settings, How to play) the router makes the
// coach inert, and overlays.css hides its card, hand, rings and dim: a stale instruction never shows
// next to (or under) the dialog the player is actually using.
// The card avoids covering its targets (hard rule) and, where it can, the board, the top bar and the
// highlighted rule chip (soft obstacles); a short screen gets a compact card (overlays.css).
// a11y: the card is a polite live region; when the coach first appears its text is filled in a moment
// after the (empty) region is shown, so screen readers announce it (a region inserted together with
// its text is often not read).
//
// Classes: .coach[data-step][data-hand] > .coach__dim .coach__ring .coach__hand .coach__card[data-pending]
//          .coach__text .coach__gotit
import { tutorialStep, type CoachHand, type TutorialStepIndex } from '../../game/tutorial';
import { colorName, t, translate, TUTORIAL_STEP_KEYS } from '../../i18n';
import { clear, h, s, type OverlayView } from '../dom';
import { makeButton, nextId, setTextKeepTogether } from './overlay-base';

export interface CoachProps {
  readonly step: TutorialStepIndex;
  readonly hand: CoachHand;
  readonly showGotIt: boolean;
  /** Palette index for {color} in the step text (step 1: Lavender), or null. */
  readonly colorParam: number | null;
  /** Client rects of the focus targets (cells or the bulb); re-read on resize. */
  targetRects(): readonly DOMRect[];
  /**
   * Optional: rects the card should rather not cover (soft obstacles). Default: the game screen's
   * board, top bar and highlighted rule chip, read from the coach's document.
   */
  softRects?(): readonly SoftRect[];
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
/** The tightest screen-edge margin, used only when it keeps the card off a soft obstacle. */
const MIN_EDGE = 6;
/** Fingertip position inside the 48×48 hand drawing. */
const TIP_X = 13;
const TIP_Y = 4;
const HAND_SIZE = 48;
/** How far the tap keyframes move the hand down (mw-hand-tap / mw-hand-double: 12 px), plus a margin. */
const HAND_TRAVEL = 16;
/** Space kept between the bulb's ring (3 px gold stroke) and the bottom edge, so it is never clipped. */
const RING_EDGE = 8;
/** Gap between the card and a soft obstacle it is placed next to. */
const SOFT_GAP = 8;
/** Delay before the first step's text fills the freshly shown live region (ms). */
export const LIVE_SETTLE_MS = 150;

export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A soft obstacle; `weight` (default 1) scales how bad covering it is. */
export interface SoftRect extends RectLike {
  readonly weight?: number;
}

/** The step's coach sentence, with {color} filled in. */
export function coachText(step: TutorialStepIndex, colorParam: number | null): string {
  const key = TUTORIAL_STEP_KEYS[step - 1] ?? 'tutorial.step1';
  return translate(key, colorParam === null ? {} : { color: colorName(colorParam) });
}

/**
 * Card top (CSS px). Candidates, in order of preference: the bottom of the screen (over the tool row,
 * like the wireframe), above the targets, below them, next to each soft obstacle (just below the top
 * bar, just above the board…), the top edge, then (with soft obstacles) the screen edges with a
 * smaller margin. A candidate must stay on screen and keep CARD_GAP from
 * every target; among those, the one covering the least of the soft obstacles wins (ties keep the
 * preference order). With no soft obstacles this is the bottom slot, else above, else below the
 * targets; when nothing fits, below the targets clamped to the bottom slot.
 */
export function placeCard(targets: readonly RectLike[], cardH: number, vh: number, soft: readonly SoftRect[] = []): number {
  const bottomTop = vh - EDGE - cardH;
  if (targets.length === 0 && soft.length === 0) return bottomTop;
  const top = targets.length ? Math.min(...targets.map((r) => r.top)) : Infinity;
  const bottom = targets.length ? Math.max(...targets.map((r) => r.bottom)) : -Infinity;
  const candidates: number[] = [bottomTop];
  if (targets.length) candidates.push(top - CARD_GAP - cardH, bottom + CARD_GAP);
  for (const r of soft) candidates.push(r.bottom + SOFT_GAP, r.top - SOFT_GAP - cardH);
  candidates.push(EDGE);
  // Last resort before covering something: closer to the screen edges.
  if (soft.length) candidates.push(vh - MIN_EDGE - cardH, MIN_EDGE);
  const edge = soft.length ? MIN_EDGE : EDGE;
  const fits = (y: number): boolean =>
    y >= edge - 0.5 && y + cardH <= vh - edge + 0.5 && targets.every((r) => y >= r.bottom + CARD_GAP || y + cardH <= r.top - CARD_GAP);
  const cost = (y: number): number =>
    soft.reduce((sum, r) => sum + (r.weight ?? 1) * Math.max(0, Math.min(y + cardH, r.bottom) - Math.max(y, r.top)), 0);
  let best: number | null = null;
  let bestCost = Infinity;
  for (const y of candidates) {
    if (!fits(y)) continue;
    const c = cost(y);
    if (c < bestCost - 0.5) {
      best = y;
      bestCost = c;
    }
  }
  if (best !== null) return best;
  return targets.length ? Math.min(bottom + CARD_GAP, bottomTop) : bottomTop;
}

/**
 * The round spotlight (and ring) around the bulb (step 5): wide enough for the count badge on the
 * button's corner. Near the bottom edge the circle moves up (keeping the button inside it), then
 * shrinks, so the ring is never clipped by the screen edge.
 */
export function roundSpot(r: RectLike & { readonly width: number; readonly height: number }, vh: number): { cx: number; cy: number; rad: number } {
  const base = Math.min(r.width, r.height) / 2 + HOLE_PAD;
  let rad = base + SPOT_EXTRA;
  const cx = r.left + r.width / 2;
  let cy = r.top + r.height / 2;
  if (vh > 0) {
    const over = cy + rad - (vh - RING_EDGE);
    if (over > 0) {
      const shift = Math.min(over, rad - base);
      cy -= shift;
      rad = Math.max(base, rad - (over - shift));
    }
  }
  return { cx, cy, rad };
}

/**
 * What the card should rather not cover on the game screen: the board and the top bar (weight 3:
 * the lead's rule is "never cover them" where any other slot exists) and the highlighted rule chip.
 */
function screenSoftRects(doc: Document): SoftRect[] {
  const out: SoftRect[] = [];
  const add = (sel: string, weight: number): void => {
    const el = doc.querySelector(sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, weight });
  };
  add('.screen--game .board', 3);
  add('.screen--game .top-bar', 3);
  add('.screen--game .chip[data-hl]', 1);
  return out;
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
  /** The step text waiting for the freshly shown live region (first appearance), or null. */
  let pendingText: string | null = null;
  let liveTimer: ReturnType<typeof setTimeout> | null = null;

  const layout = (): void => {
    if (!props || el.hidden) return;
    const rects = props.targetRects();
    const doc = el.ownerDocument;
    const vh = doc.defaultView?.innerHeight ?? 0;
    // The bulb is a round button: a round spotlight; cells get rounded squares.
    const round = tutorialStep(props.step).target === 'bulb';
    const spots = round ? rects.map((r) => roundSpot(r, vh)) : [];
    clear(holes);
    if (round) {
      // A circle around the button, wide enough for the badge on its top-right corner.
      for (const { cx, cy, rad } of spots) holes.appendChild(s('rect', { x: cx - rad, y: cy - rad, width: 2 * rad, height: 2 * rad, rx: rad, fill: 'black' }));
    } else {
      for (const r of rects) {
        const w = r.width + 2 * HOLE_PAD;
        const hh = r.height + 2 * HOLE_PAD;
        holes.appendChild(s('rect', { x: r.left - HOLE_PAD, y: r.top - HOLE_PAD, width: w, height: hh, rx: HOLE_RADIUS, fill: 'black' }));
      }
    }
    clear(rings);
    // The pulsing ring follows the spotlight's edge, so it never crosses the button's badge.
    for (const { cx, cy, rad } of spots) {
      rings.appendChild(h('div', { class: 'coach__ring', style: { left: `${cx - rad}px`, top: `${cy - rad}px`, width: `${2 * rad}px`, height: `${2 * rad}px` } }));
    }
    const first = rects[0];
    const last = rects[rects.length - 1];
    hand.hidden = props.hand === 'none' || !first;
    if (first && last) {
      const cx = first.left + first.width / 2;
      const cy = first.top + first.height / 2;
      // On the bulb the fingertip touches the button's lower right, so the bulb glyph the text asks
      // the player to find stays visible; on a cell it points at the centre.
      const tipX = round ? cx + first.width * 0.28 : cx;
      const tipY = round ? cy + first.height * 0.2 : cy;
      hand.style.left = `${tipX - TIP_X}px`;
      // Near the bottom edge (the bulb, step 5) the fingertip moves up inside the target so the
      // whole hand, and its tap motion, stays on screen.
      const lowest = vh > 0 ? vh - HAND_SIZE - HAND_TRAVEL : Infinity;
      hand.style.top = `${Math.max(first.top - TIP_Y, Math.min(tipY - TIP_Y, lowest))}px`;
      hand.style.setProperty('--dx', `${last.left + last.width / 2 - cx}px`);
      hand.style.setProperty('--dy', `${last.top + last.height / 2 - cy}px`);
    }
    // A round target keeps the card clear of its whole spotlight, not just of the button.
    const avoid: readonly RectLike[] = round
      ? rects.map((r, i) => {
          const sp = spots[i] ?? roundSpot(r, vh);
          return { left: r.left, right: r.right, top: sp.cy - sp.rad, bottom: sp.cy + sp.rad };
        })
      : rects;
    const soft = props.softRects ? props.softRects() : screenSoftRects(doc);
    card.style.top = `${placeCard(avoid, card.offsetHeight, vh, soft)}px`;
  };

  const showText = (value: string): void => {
    setTextKeepTogether(text, value);
  };
  const cancelLive = (): void => {
    if (liveTimer !== null) clearTimeout(liveTimer);
    liveTimer = null;
    pendingText = null;
    card.removeAttribute('data-pending');
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

  /** `fresh`: the coach was hidden until now, so its live region is new (see the header). */
  const render = (p: CoachProps, fresh = false): void => {
    const stepChanged = props?.step !== p.step;
    props = p;
    el.dataset.step = String(p.step);
    el.dataset.hand = p.hand;
    const value = coachText(p.step, p.colorParam);
    if (fresh || pendingText !== null) {
      // Show the empty region first; the text follows once assistive tech has seen the region.
      if (pendingText === null) text.textContent = '';
      pendingText = value;
      card.setAttribute('data-pending', '');
      if (liveTimer === null) {
        liveTimer = setTimeout(() => {
          liveTimer = null;
          const v = pendingText;
          pendingText = null;
          card.removeAttribute('data-pending');
          if (v !== null) showText(v);
          layout();
        }, LIVE_SETTLE_MS);
      }
    } else {
      showText(value);
    }
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
      // The router calls open() again for every step while the coach is up: only a coach that was
      // hidden has a fresh live region.
      const fresh = el.hidden === true;
      el.hidden = false;
      props = null;
      listen(true);
      render(p, fresh);
    },
    update(p) {
      render(p);
    },
    close() {
      cancelLive();
      el.hidden = true;
      listen(false);
    },
    dismiss: () => false,
    destroy() {
      cancelLive();
      listen(false);
      el.ownerDocument.defaultView?.cancelAnimationFrame(raf);
      props = null;
      el.remove();
    },
  };
}
