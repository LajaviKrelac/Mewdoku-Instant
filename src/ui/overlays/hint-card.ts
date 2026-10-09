// Owner: B (Phase 2b; was ui-shell)
// O1 hint card (02 §5, §9.1): bottom sheet with the explanation, [Apply] and [×]. The board's dimming
// and focus outline come from GameView.highlight. Renders the 02 §9.1 templates via i18n.
// The root holds a CLEAR full-screen scrim, so the dimmed board stays visible while a tap on it
// closes the card (HINT_CLOSE), as does × or Esc (dismiss()). In the tutorial (step 5 accepts Apply
// only, 02 §11.5) the card is not closable: no ×, and Esc / scrim taps are not swallowed.
// a11y: the dialog's description is the sentence plus a screen-reader-only line naming the tile it
// points at ("Highlighted tile: row 4, column 4, Apricot."), since the board is inert behind it.
// Placement is measured on the next animation frame (RP-3): reading the board's rect inside open()
// forced a full style recalc right after the board's hint highlight changed.
//
// Classes: .overlay[data-overlay=hint][data-placement] > .overlay__scrim--clear + .overlay__panel--sheet.hint-card
//          .hint-card__icon .hint-card__text .hint-card__where .hint-card__actions
// Review fixes: the sentence names each colour with a swatch in its tile colour (PAR-7, rich text;
// same words as hintText()); static labels follow the language (A11Y-I18N-1); on FBIG a top-placed
// card keeps its content below the FB top-left safe zone (UX-9; :root[data-fb-safe], set by the top bar).
import { cfg } from '../../app/config';
import type { HintStep } from '../../engine/types';
import { capitalizeFirst, t } from '../../i18n';
import { icon } from '../art/sprite';
import { readViewport } from '../board/layout';
import { h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { setRichText } from '../rich-text';
import { closeButton, createOverlayShell, makeButton } from './overlay-base';
import { hintRichText, regionName, type HintTextContext } from './hint-text';

export { hintRichText, hintText, unitKindPlural, unitListName, unitName, type HintTextContext } from './hint-text';

/** Top padding of a compact top-placed card (overlay-chunk.css): the FB inset adds what exceeds it. */
const TOP_PAD_COMPACT = 12;

/** Extra height a top-placed card gets on FBIG, where its content starts below the safe zone (UX-9). */
export function fbTopInset(doc: Document, safeTop: number): number {
  if (!doc.documentElement.hasAttribute('data-fb-safe')) return safeTop;
  return Math.max(safeTop, cfg.layout.fbSafeZonePx - TOP_PAD_COMPACT);
}

export interface HintCardProps extends HintTextContext {
  readonly step: HintStep;
  onApply(): void;
  /** ×, Esc or a tap on the dimmed area (HINT_CLOSE). */
  onClose(): void;
  /**
   * Optional (default: true, except while the tutorial coach is up, whose step 5 accepts Apply only,
   * 02 §11.5): false hides the × and makes Esc / scrim taps do nothing.
   */
  readonly closable?: boolean;
  /**
   * Optional: the board's client rect (GameScreen.boardRect). When the bottom sheet would cover it,
   * the sheet moves to the top of the screen, over the top bar and HUD (small or wide screens).
   */
  avoidRect?(): DOMRect | null;
}

/**
 * The tile a hint points at, for screen readers (02 §18; A11Y-7): "Highlighted tile: row 4,
 * column 4, Apricot." The card's sentence says "here" / "this tile" and the board is inert behind
 * the modal card, so this names it. Steps about whole rows, columns or colours (confinement,
 * pigeonhole) return null. The colour is named when ctx.regions is given, or when the step names a
 * single colour that the tile belongs to.
 */
export function hintLocation(step: HintStep, ctx: HintTextContext): string | null {
  const k = step.kind;
  if (k === 'pigeonhole' || k === 'confine_region_line' || k === 'confine_line_region') return null;
  const cell = k === 'mistaken_mark' ? step.effectCells[0] : (step.placeCell ?? step.focusCells[0]);
  if (cell === undefined || cell < 0 || cell >= ctx.n * ctx.n) return null;
  const row = Math.floor(cell / ctx.n) + 1;
  const col = (cell % ctx.n) + 1;
  // The step's single colour unit names the tile's colour when the board's regions are not given.
  const unit = step.focusUnits.length === 1 && step.focusUnits[0]?.kind === 'region' ? step.focusUnits[0].index : undefined;
  const label = ctx.regions ? ctx.regions[cell] : k === 'single' ? unit : undefined;
  return label === undefined ? t('a11y.hintAt', { row, col }) : t('a11y.hintAtColor', { row, col, color: regionName(label, ctx) });
}

/** Gap between a top-placed sheet and the screen edge (CSS px): none, the top sheet is flush. */
const TOP_MARGIN = 0;

/**
 * 'top' when the bottom sheet (`sheet`, measured at the bottom) overlaps `avoid` and the top slot
 * overlaps it less. The top sheet is flush with the screen edge and grows by the safe-area inset.
 */
export function sheetPlacement(sheet: { top: number; height: number }, avoid: { top: number; bottom: number } | null, safeTop = 0): 'bottom' | 'top' {
  if (!avoid) return 'bottom';
  const bottomOverlap = Math.max(0, avoid.bottom - sheet.top);
  if (bottomOverlap <= 0) return 'bottom';
  const topOverlap = Math.max(0, TOP_MARGIN + safeTop + sheet.height - avoid.top);
  return topOverlap < bottomOverlap ? 'top' : 'bottom';
}

/** Whether the tutorial coach (O8) is up in this document: its step 5 accepts Apply only. */
function coachShown(doc: Document): boolean {
  return doc.querySelector('.coach:not([hidden])') !== null;
}

export function createHintCard(): OverlayView<HintCardProps> {
  let props: HintCardProps | null = null;
  let closable = true;
  const close = (): boolean => {
    if (!props || !shell.isOpen() || !closable) return false;
    props.onClose();
    return true;
  };
  const shell = createOverlayShell({ id: 'hint', scrim: 'clear', panel: 'sheet', onScrimTap: () => void close() });
  shell.panel.classList.add('hint-card');

  const L = createLocaleText();
  const title = L.text(h('h2', { class: 'overlay__title visually-hidden', id: shell.titleId }), () => t('hint.title'));
  const text = h('p', { class: 'hint-card__text' });
  const where = h('span', { class: 'hint-card__where visually-hidden' });
  const desc = h('div', { class: 'hint-card__desc', id: shell.descId }, text, where);
  const apply = L.label(
    makeButton({
      variant: 'primary',
      label: '',
      autofocus: true,
      className: 'hint-card__apply',
      onPress: () => props?.onApply(),
    }),
    () => t('hint.apply'),
  );
  const closeBtn = L.attr(closeButton(() => void close()), 'aria-label', () => t('hint.close'));
  shell.panel.append(
    h('div', { class: 'hint-card__row' }, icon('icon-bulb', { class: 'hint-card__icon' }), title, desc),
    h('div', { class: 'overlay__actions hint-card__actions' }, apply, closeBtn),
  );

  const win = (): Window | null => shell.el.ownerDocument.defaultView;
  /** Measures at the bottom, then flips to the top if that covers the board less. Reads only. */
  const measure = (): void => {
    if (!props || !shell.isOpen()) return;
    const avoid = props.avoidRect?.() ?? null;
    if (!avoid) {
      shell.el.dataset.placement = 'bottom';
      return;
    }
    if (shell.el.dataset.placement !== 'bottom') {
      // Measure the bottom slot; the flip below is applied before this frame paints.
      shell.el.dataset.placement = 'bottom';
    }
    // offsetTop / offsetHeight ignore the sheet's entry animation (translateY), unlike a client rect;
    // the overlay root is position:fixed at 0,0, so offsetTop is the client top.
    const r = { top: shell.panel.offsetTop, height: shell.panel.offsetHeight };
    const w = win();
    const safeTop = fbTopInset(shell.el.ownerDocument, w ? readViewport(w).safeTop : 0);
    const next = sheetPlacement(r, avoid, safeTop);
    if (shell.el.dataset.placement !== next) shell.el.dataset.placement = next;
  };
  let raf = 0;
  /** Placement runs on the next frame, after every DOM write of this open (one style recalc, RP-3). */
  const place = (): void => {
    const w = win();
    if (!w || typeof w.requestAnimationFrame !== 'function') {
      measure();
      return;
    }
    w.cancelAnimationFrame(raf);
    raf = w.requestAnimationFrame(() => {
      raf = 0;
      measure();
    });
  };
  const stopPlace = (): void => {
    if (raf) win()?.cancelAnimationFrame(raf);
    raf = 0;
  };

  const render = (p: HintCardProps): void => {
    props = p;
    L.apply();
    closable = p.closable ?? !coachShown(shell.el.ownerDocument);
    closeBtn.hidden = !closable;
    setRichText(text, hintRichText(p.step, p), {
      color: (label) => ({ palette: p.colors[label] ?? label, name: regionName(label, p) }),
      capitalize: capitalizeFirst,
      keepTogether: false,
    });
    const loc = hintLocation(p.step, p);
    setText(where, loc ? ` ${loc}` : ''); // a space, so the description reads "…here. Highlighted tile…"
    shell.panel.dataset.kind = p.step.kind;
    if (!shell.el.dataset.placement) shell.el.dataset.placement = 'bottom';
    place();
  };

  // A language switch while the card is open re-renders it in the new language (A11Y-I18N-1).
  L.watch(() => {
    if (props && shell.isOpen()) render(props);
  });

  return {
    el: shell.el,
    modal: true,
    open(p) {
      shell.el.dataset.placement = 'bottom';
      shell.show();
      render(p);
      win()?.addEventListener('resize', place);
    },
    update(p) {
      render(p);
    },
    close() {
      win()?.removeEventListener('resize', place);
      stopPlace();
      shell.hide();
    },
    dismiss: close,
    destroy() {
      win()?.removeEventListener('resize', place);
      stopPlace();
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
