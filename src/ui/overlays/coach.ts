// Owner: B (Phase 2b; was ui-shell); G3 (Phase 2d: the badge in the spotlight, the hidden mouse, the band)
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
//
// Review fixes: the step text prints its rule keywords in the accent colour and the colour it names
// with a swatch in that tile colour (PAR-7, rich text; textContent is unchanged); the tool row is a
// light soft obstacle, so the card takes the gap between the board and the tools when there is one,
// and a card left over the tools reaches up past their count badges instead of cutting them in half
// (UX-14); the texts follow the language (A11Y-I18N-1).
// Phase 2d (look-spec §1.11, critic C8, §1.16): the bulb's round spotlight takes in its whole badge (the
// new badge sits further out than the old one), the tool row skips the hidden mouse ([data-off]), and
// the card and the spotlight stay above the banner band when one is reserved.
import { tutorialStep, type CoachHand, type TutorialStepIndex } from '../../game/tutorial';
import { colorName, onLocaleChanged, t, translate, translateMarked, TUTORIAL_STEP_KEYS } from '../../i18n';
import { clear, h, s, type OverlayView } from '../dom';
import { colorToken, setRichText } from '../rich-text';
import { makeButton, nextId, setButtonLabel } from './overlay-base';

export interface CoachProps {
  readonly step: TutorialStepIndex;
  readonly hand: CoachHand;
  readonly showGotIt: boolean;
  /** Palette index for {color} in the step text (step 1: Violet), or null. */
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

/** The step's coach sentence, with {color} filled in (plain text: what a screen reader reads). */
export function coachText(step: TutorialStepIndex, colorParam: number | null): string {
  const key = TUTORIAL_STEP_KEYS[step - 1] ?? 'tutorial.step1';
  return translate(key, colorParam === null ? {} : { color: colorName(colorParam) });
}

/** The same sentence with its `*keyword*` markers and the colour as a rich-text token (PAR-7). */
export function coachRichText(step: TutorialStepIndex, colorParam: number | null): string {
  const key = TUTORIAL_STEP_KEYS[step - 1] ?? 'tutorial.step1';
  return translateMarked(key, colorParam === null ? {} : { color: colorToken(colorParam) });
}

/** How far above the tools' count badges a card over the tool row reaches (UX-14). */
const BADGE_COVER = 4;

/**
 * A card placed over the tool row reaches up past the count badges ("Free", "3") so none is cut in
 * half (UX-14). Returns the new top, or `top` unchanged when the card is clear of the tools or the
 * taller card would reach the board (`floor`, its bottom) or come within CARD_GAP of a target.
 */
export function coverBadges(
  top: number,
  cardH: number,
  tools: RectLike | null,
  badgeTop: number | null,
  floor: number,
  targets: readonly RectLike[] = [],
): number {
  if (!tools || badgeTop === null) return top;
  const overTools = top < tools.bottom && top + cardH > tools.top;
  if (!overTools || top <= badgeTop - BADGE_COVER) return top;
  const next = badgeTop - BADGE_COVER;
  if (next < floor) return top;
  const bottom = top + cardH;
  if (targets.some((r) => next < r.bottom + CARD_GAP && bottom > r.top - CARD_GAP)) return top;
  return next;
}

/**
 * Card top (CSS px). Candidates, in order of preference: the `preferred` slots (the gap between the
 * board and the tool row, UX-14), the bottom of the screen (over the tool row, like the wireframe),
 * above the targets, below them, next to each soft obstacle (just below the top
 * bar, just above the board…), the top edge, then (with soft obstacles) the screen edges with a
 * smaller margin. A candidate must stay on screen and keep CARD_GAP from
 * every target; among those, the one covering the least of the soft obstacles wins (ties keep the
 * preference order). With no soft obstacles this is the bottom slot, else above, else below the
 * targets; when nothing fits, below the targets clamped to the bottom slot.
 */
export function placeCard(
  targets: readonly RectLike[],
  cardH: number,
  vh: number,
  soft: readonly SoftRect[] = [],
  preferred: readonly number[] = [],
): number {
  const bottomTop = vh - EDGE - cardH;
  if (targets.length === 0 && soft.length === 0 && preferred.length === 0) return bottomTop;
  const top = targets.length ? Math.min(...targets.map((r) => r.top)) : Infinity;
  const bottom = targets.length ? Math.max(...targets.map((r) => r.bottom)) : -Infinity;
  // `preferred` slots come first, so they win every tie (UX-14: the gap above the tool row).
  const candidates: number[] = [...preferred, bottomTop];
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
export function roundSpot(
  r: RectLike & { readonly width: number; readonly height: number },
  vh: number,
  reach = 0,
): { cx: number; cy: number; rad: number } {
  const base = Math.min(r.width, r.height) / 2 + HOLE_PAD;
  // Phase 2d (critic C8): wide enough for the badge's far corner (`reach` from the button's centre).
  let rad = Math.max(base + SPOT_EXTRA, reach + HOLE_PAD);
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

/** The tool row with its count badges (which stick out above the buttons), and the badges' top. */
function toolRow(doc: Document): { readonly rect: RectLike; readonly badgeTop: number | null } | null {
  // Phase 2d (critic C8): a hidden mouse ([data-off]) keeps its slot and a rect, but is not in the row.
  const els = Array.from(doc.querySelectorAll('.screen--game .tool:not([data-off]), .screen--game .tool:not([data-off]) .tool__badge:not([hidden])'));
  let rect: RectLike | null = null;
  let badgeTop: number | null = null;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    rect = rect
      ? { left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top), right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    if (el.classList.contains('tool__badge')) badgeTop = badgeTop === null ? r.top : Math.min(badgeTop, r.top);
  }
  return rect ? { rect, badgeTop } : null;
}

/**
 * How far the badge of the tool button at `r` reaches from the button's centre (its farthest corner),
 * or 0 when there is none (critic C8).
 */
export function badgeReach(doc: Document, r: RectLike & { readonly width: number; readonly height: number }): number {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let reach = 0;
  for (const tool of Array.from(doc.querySelectorAll('.tool:not([data-off])'))) {
    const t = tool.getBoundingClientRect();
    if (Math.abs(t.left + t.width / 2 - cx) > 1 || Math.abs(t.top + t.height / 2 - cy) > 1) continue;
    const b = tool.querySelector('.tool__badge:not([hidden])')?.getBoundingClientRect();
    if (!b || b.width === 0) continue;
    for (const x of [b.left, b.right]) for (const y of [b.top, b.bottom]) reach = Math.max(reach, Math.hypot(x - cx, y - cy));
  }
  return reach;
}

/** The banner band at the bottom of the game screen (§1.16), px; 0 without one. */
function bandHeight(doc: Document): number {
  const root = doc.documentElement;
  if (root.getAttribute('data-play-band') !== '1') return 0;
  const px = (k: string): number => parseFloat(root.style.getPropertyValue(k)) || 0;
  return px('--play-band') + px('--play-band-bottom');
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
  /** The rich sentence of the step on show (null before the first one). */
  let shown: { readonly step: TutorialStepIndex; readonly colorParam: number | null } | null = null;
  const card = h('div', { class: 'coach__card', role: 'note', 'aria-live': 'polite' }, text, gotIt);
  const el = h('div', { class: 'coach', hidden: true }, dim, rings, hand, card);
  /** The step waiting for the freshly shown live region (first appearance), or null. */
  let pendingText: { readonly step: TutorialStepIndex; readonly colorParam: number | null } | null = null;
  let liveTimer: ReturnType<typeof setTimeout> | null = null;

  const layout = (): void => {
    if (!props || el.hidden) return;
    const rects = props.targetRects();
    const doc = el.ownerDocument;
    // Phase 2d §1.16: the screen ends at the banner band when one is reserved.
    const vh = Math.max(0, (doc.defaultView?.innerHeight ?? 0) - bandHeight(doc));
    // The bulb is a round button: a round spotlight; cells get rounded squares.
    const round = tutorialStep(props.step).target === 'bulb';
    const spots = round ? rects.map((r) => roundSpot(r, vh, badgeReach(doc, r))) : [];
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
          const sp = spots[i] ?? roundSpot(r, vh, badgeReach(doc, r));
          return { left: r.left, right: r.right, top: sp.cy - sp.rad, bottom: sp.cy + sp.rad };
        })
      : rects;
    const soft = props.softRects ? props.softRects() : screenSoftRects(doc);
    card.style.minHeight = '';
    const cardH = card.offsetHeight;
    // UX-14: the gap between the board and the tool row (badges included) is the first choice when
    // the card fits there without covering anything; otherwise the bottom slot over the tools, as
    // before, reaching up past the count badges (never onto the board or a target).
    const tools = props.softRects ? null : toolRow(doc);
    const gap = tools ? [tools.rect.top - SOFT_GAP - cardH] : [];
    const top = placeCard(avoid, cardH, vh, soft, gap);
    const board = doc.querySelector('.screen--game .board')?.getBoundingClientRect();
    const raised = coverBadges(top, cardH, tools?.rect ?? null, tools?.badgeTop ?? null, board ? board.bottom + 2 : -Infinity, avoid);
    card.style.top = `${raised}px`;
    if (raised < top) card.style.minHeight = `${top + cardH - raised}px`;
  };

  /** The step's sentence: rule keywords and the colour styled (PAR-7); textContent stays the plain sentence. */
  const showText = (step: TutorialStepIndex, colorParam: number | null): void => {
    shown = { step, colorParam };
    setRichText(text, coachRichText(step, colorParam), {
      color: (id) => ({ palette: id, name: colorName(id) }),
    });
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
  /**
   * The text's own size changes after placement when the display font arrives or the rich text
   * rewraps (a third line): place the card again then, or a stale slot can cover the board.
   */
  const RO = (el.ownerDocument.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  const textObserver = RO ? new RO(() => schedule()) : null;
  let listening = false;
  const listen = (on: boolean): void => {
    const win = el.ownerDocument.defaultView;
    if (!win || listening === on) return;
    listening = on;
    if (on) {
      win.addEventListener('resize', onResize);
      win.visualViewport?.addEventListener('resize', onResize);
      textObserver?.observe(text);
    } else {
      win.removeEventListener('resize', onResize);
      win.visualViewport?.removeEventListener('resize', onResize);
      textObserver?.disconnect();
    }
  };

  /** `fresh`: the coach was hidden until now, so its live region is new (see the header). */
  const render = (p: CoachProps, fresh = false): void => {
    const stepChanged = props?.step !== p.step;
    props = p;
    el.dataset.step = String(p.step);
    el.dataset.hand = p.hand;
    setButtonLabel(gotIt, t('tutorial.gotIt'));
    const value = { step: p.step, colorParam: p.colorParam };
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
          if (v !== null) showText(v.step, v.colorParam);
          layout();
        }, LIVE_SETTLE_MS);
      }
    } else {
      showText(value.step, value.colorParam);
    }
    gotIt.hidden = !p.showGotIt;
    layout();
    schedule();
    // Step 2 locks the board: move keyboard focus to "Got it" (02 §11.5, §18).
    if (p.showGotIt && stepChanged && !card.contains(el.ownerDocument.activeElement)) gotIt.focus();
  };

  // A language switch with the coach up (a first run that boots before its locale chunk lands, or
  // Settings → Language during the tutorial): the card follows (A11Y-I18N-1).
  const offLocale = onLocaleChanged(() => {
    setButtonLabel(gotIt, t('tutorial.gotIt'));
    if (shown && pendingText === null && !el.hidden) showText(shown.step, shown.colorParam);
    if (!el.hidden) layout();
  });

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
      offLocale();
      cancelLive();
      listen(false);
      el.ownerDocument.defaultView?.cancelAnimationFrame(raf);
      props = null;
      el.remove();
    },
  };
}
