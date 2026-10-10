// Owner: B (Phase 2b; was ui-shell); G3 (Phase 2d.1: the hint as a modal walkthrough)
// O1 hint overlay (02 §5, §9.1; Phase 2d.1 helpers-spec §3.2–§3.5, §3.7, D-2d1-7, measured on the user's
// v3 recording and rebuilt in our own words): the overlay opens at once on the bulb's release:
// - a black dim at 75 % over the whole screen (top bar and helper row included) that fades in linearly
//   over fx.hint.dimMs, with a hole at every tile the hint is about (hintCutouts: the focus, the Empty
//   tiles it will cross, the tile of its cat; the board's own tiles and ghost X's show through, no ring);
// - a near-white card over the rule cards, its bottom cardGap above the board card, growing upward when
//   the sentence needs more lines (never above the top bar; past that the text scrolls inside it), with
//   our hint.* sentence (rich text with colour swatches, PAR-7) and no icon or visible title;
// - our orange Apply pill (hint.apply), applyGap below the board card, centred on the column, over the
//   helper discs; it presses to 0.90 and applies on release.
// The banner hides meanwhile (the session's banner flow, D-2d1-13). Apply closes the overlay in its own
// frame ([data-instant]: no entrance or exit animation; the board's ghosts go with it). A tap on the dim,
// Esc and the system back close it (HINT_CLOSE); a visually hidden "Close hint" button stays for keyboard
// and screen-reader users and shows, while focused, as a 44 × 44 round button on the card's top
// inline-end corner. In the tutorial (step 5 accepts Apply only, 02 §11.5) nothing closes it.
// a11y: the dialog keeps its name ("Hint") and its description (the sentence plus a screen-reader-only
// line naming the tile it points at, A11Y-7); Apply has the first focus; the dim is aria-hidden.
// Layout is measured on the next animation frame (RP-3: reading the board's rect inside open() forced a
// full style recalc right after the board's hint highlight changed); the panel stays hidden until then,
// and the dim's holes are measured again at fx.hint.dimMs (a tile still squishing from the last X).
//
// Classes: .overlay[data-overlay=hint][data-instant][data-placed] > svg.hint-dim + .overlay__scrim--clear
//          + .overlay__panel.hint-sheet > (h2.visually-hidden) .hint-card > .hint-card__text + .hint-card__where
//          + button.hint-close.visually-hidden-focusable ; button.hint-apply
// Review fixes: static labels follow the language (A11Y-I18N-1).
import { cfg } from '../../app/config';
import type { CellIndex, HintStep } from '../../engine/types';
import { capitalizeFirst, t } from '../../i18n';
import { h, setText, trackPress, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { setRichText } from '../rich-text';
import { closeButton, createOverlayShell, nextId } from './overlay-base';
import { hintCutouts, hintRichText, regionName, type HintTextContext } from './hint-text';

export { hintCutouts, hintRichText, hintText, unitKindPlural, unitListName, unitName, type HintTextContext } from './hint-text';

export interface HintCardProps extends HintTextContext {
  readonly step: HintStep;
  onApply(): void;
  /** A tap on the dim, Esc, the system back or the hidden close button (HINT_CLOSE). */
  onClose(): void;
  /**
   * Optional (default: true, except while the tutorial coach is up, whose step 5 accepts Apply only,
   * 02 §11.5): false makes the close button, Esc and dim taps do nothing.
   */
  readonly closable?: boolean;
  /** Phase 2d.1: the cell states when the hint opened (which effect cells are Empty). Required since I-3. */
  readonly cells: Readonly<Uint8Array>;
  /** Phase 2d.1: GameScreen.boardRect (the card and Apply are anchored to the board card). Required since I-3 (2b's avoidRect is gone). */
  boardRect(): DOMRect | null;
  /** Phase 2d.1: GameScreen.cellRect (the dim's tile holes). Required since I-3. */
  cellRect(cell: CellIndex): DOMRect | null;
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

/** Whether the tutorial coach (O8) is up in this document: its step 5 accepts Apply only. */
function coachShown(doc: Document): boolean {
  return doc.querySelector('.coach:not([hidden])') !== null;
}

/** A rect in client px. */
interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Where the card and Apply go (helpers-spec §3.2; px, × s): anchored to the board card, centred on it. */
export interface HintLayout {
  /** The card: inline position (left), its bottom edge (from the viewport top), width, min and max height. */
  readonly card: { readonly left: number; readonly bottom: number; readonly width: number; readonly minH: number; readonly maxH: number };
  readonly apply: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

/**
 * The card's bottom cardGap · s above the board, Apply's top applyGap · s below it, both centred on the
 * board; the card may grow up to the top bar's bottom (`ceiling`), never less than its min height.
 */
export function hintLayout(board: Box, s: number, ceiling: number): HintLayout {
  const L = cfg.layout.hint;
  const cx = board.left + board.width / 2;
  const cardW = L.cardW * s;
  const bottom = board.top - L.cardGap * s;
  const minH = L.cardMinH * s;
  const applyW = L.applyW * s;
  return {
    card: { left: cx - cardW / 2, bottom, width: cardW, minH, maxH: Math.max(minH, bottom - ceiling) },
    apply: { left: cx - applyW / 2, top: board.top + board.height + L.applyGap * s, width: applyW, height: L.applyH * s },
  };
}

/** A rounded rect as path data (clockwise), for the dim's even-odd holes. */
function roundRect(r: Box, rad: number): string {
  const k = Math.max(0, Math.min(rad, r.width / 2, r.height / 2));
  const x = r.left;
  const y = r.top;
  const w = r.width;
  const hh = r.height;
  const f = (v: number): string => String(Math.round(v * 100) / 100);
  return (
    `M${f(x + k)} ${f(y)}H${f(x + w - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w)} ${f(y + k)}V${f(y + hh - k)}` +
    `A${f(k)} ${f(k)} 0 0 1 ${f(x + w - k)} ${f(y + hh)}H${f(x + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x)} ${f(y + hh - k)}` +
    `V${f(y + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + k)} ${f(y)}Z`
  );
}

/** The dim's path: the viewport with one rounded hole per cut-out tile (tile radius: layout.game.tileRadiusFraction). */
export function dimPath(vw: number, vh: number, holes: readonly Box[]): string {
  const f = (v: number): string => String(Math.round(v * 100) / 100);
  let d = `M0 0H${f(vw)}V${f(vh)}H0Z`;
  for (const r of holes) d += roundRect(r, r.width * cfg.layout.game.tileRadiusFraction);
  return d;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createHintCard(): OverlayView<HintCardProps> {
  let props: HintCardProps | null = null;
  let closable = true;
  const close = (): boolean => {
    if (!props || !shell.isOpen() || !closable) return false;
    props.onClose();
    return true;
  };
  const shell = createOverlayShell({ id: 'hint', scrim: 'clear', panel: 'sheet', onScrimTap: () => void close() });
  shell.el.setAttribute('data-instant', '');
  shell.panel.classList.remove('overlay__panel--sheet');
  shell.panel.classList.add('hint-sheet');
  const dim = document.createElementNS(SVG_NS, 'svg');
  dim.setAttribute('class', 'hint-dim');
  dim.setAttribute('aria-hidden', 'true');
  dim.setAttribute('focusable', 'false');
  const dimPathEl = document.createElementNS(SVG_NS, 'path');
  dim.appendChild(dimPathEl);
  shell.el.insertBefore(dim, shell.el.firstChild);

  const L = createLocaleText();
  const title = L.text(h('h2', { class: 'overlay__title visually-hidden', id: shell.titleId }), () => t('hint.title'));
  // The description: the sentence (the shell's desc id) and the screen-reader tile line.
  const text = h('p', { class: 'hint-card__text', id: shell.descId });
  const whereId = nextId('hint-where');
  const where = h('span', { class: 'hint-card__where visually-hidden', id: whereId });
  shell.panel.setAttribute('aria-describedby', `${shell.descId} ${whereId}`);
  const closeBtn = L.attr(closeButton(() => void close()), 'aria-label', () => t('hint.close'));
  closeBtn.classList.add('hint-close', 'visually-hidden-focusable');
  const card = h('div', { class: 'hint-card' }, text, where, closeBtn);
  // Our own pill, not a .btn--primary: white on --apply is large text at every scale (≥ 24 px, D-2d1-16).
  const apply = L.label(h('button', { type: 'button', class: 'btn hint-apply', 'data-autofocus': true }, h('span', { class: 'btn__label' })), () => t('hint.apply'));
  trackPress(apply); // the 0.90 press shows on touch too (audit B12)
  apply.addEventListener('click', () => props?.onApply());
  shell.panel.append(title, card, apply);

  const win = (): Window | null => shell.el.ownerDocument.defaultView;
  const doc = (): Document => shell.el.ownerDocument;

  /** The game screen's scale s and the top bar's bottom (the card's ceiling), read from the DOM. */
  const screenMetrics = (): { s: number; ceiling: number } => {
    const screen = doc().querySelector<HTMLElement>('.screen--game');
    const s = parseFloat(screen?.style.getPropertyValue('--s') ?? '') || 1;
    const bar = screen?.querySelector('.top-bar');
    return { s, ceiling: bar ? bar.getBoundingClientRect().bottom : 0 };
  };

  /** The dim's holes, from the board's tile rects (re-read on resize and at dimMs). */
  const drawDim = (): void => {
    const p = props;
    const w = win();
    if (!p || !w || !shell.isOpen()) return;
    const vw = w.innerWidth;
    const vh = w.innerHeight;
    dim.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    const holes: Box[] = [];
    for (const c of hintCutouts(p.step, p.cells)) {
      const r = p.cellRect(c);
      if (r && r.width > 0) holes.push(r);
    }
    dimPathEl.setAttribute('d', dimPath(vw, vh, holes));
  };

  /** Places the card and Apply against the board card (reads layout once, then writes). */
  const measure = (): void => {
    const p = props;
    if (!p || !shell.isOpen()) return;
    const board = p.boardRect();
    const st = shell.panel.style;
    if (board && board.width > 0) {
      const m = screenMetrics();
      const lay = hintLayout(board, m.s, m.ceiling);
      const vh = win()?.innerHeight ?? 0;
      st.setProperty('--hs', String(m.s));
      st.setProperty('--hc-l', `${lay.card.left}px`);
      st.setProperty('--hc-b', `${vh - lay.card.bottom}px`);
      st.setProperty('--hc-w', `${lay.card.width}px`);
      st.setProperty('--hc-max', `${lay.card.maxH}px`);
      st.setProperty('--ha-l', `${lay.apply.left}px`);
      st.setProperty('--ha-t', `${lay.apply.top}px`);
    }
    drawDim();
    shell.el.setAttribute('data-placed', '');
  };
  let raf = 0;
  let redim: ReturnType<typeof setTimeout> | null = null;
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
    if (redim) clearTimeout(redim);
    redim = null;
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
      shell.el.removeAttribute('data-placed');
      shell.el.style.setProperty('--dim-ms', `${cfg.fx.hint.dimMs}ms`);
      dimPathEl.removeAttribute('d');
      // Un-hiding the root restarts the dim's CSS fade (overlay-chunk.css) on every open.
      shell.show();
      render(p);
      win()?.addEventListener('resize', place);
      // The holes once more when the dim is complete: a tile still squishing from the last X at the
      // bulb's release gave a transformed client rect (critic).
      redim = setTimeout(() => {
        redim = null;
        drawDim();
      }, cfg.fx.hint.dimMs);
    },
    update(p) {
      render(p);
    },
    close() {
      win()?.removeEventListener('resize', place);
      stopPlace();
      shell.el.removeAttribute('data-placed');
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
